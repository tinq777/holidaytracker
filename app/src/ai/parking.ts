import { loadAISettings, DEFAULT_MODEL } from './index';
import { cleanText } from './text';
import { askClaude, extractJSON } from './claude';
import { HotelCheckUnavailable } from './hotel';

export interface ParkingSpot { name: string; walk?: string; price?: string; note?: string; type?: string }
export interface ParkingResult {
  at: number; source: 'ai-search' | 'ai' | 'demo';
  hotel: { onSite: 'yes' | 'no' | 'unknown'; price?: string; note?: string };
  spots: ParkingSpot[]; tips: string[];
}
export interface ParkingInput { hotel: string; address?: string; city: string; checkIn: string; checkOut: string; car?: string }

/** Parking at and near a booked hotel: on-site parking, nearby car parks with walk time and price, and local tips. */
export async function findParking(i: ParkingInput): Promise<ParkingResult> {
  const s = await loadAISettings();
  if (s.provider === 'demo') return demo(i);
  if (s.provider !== 'anthropic' || !s.apiKey) throw new HotelCheckUnavailable('Parking search needs AI. Choose Claude in More → AI reading (or Demo to try it).');
  if (!navigator.onLine) throw new HotelCheckUnavailable('Parking search needs an internet connection. Saved results still show offline.');

  const prompt = `Find parking for a family with a hire car staying at a hotel.

Hotel: ${i.hotel}
Address: ${i.address || 'not given, look it up'}
City: ${i.city}
Stay: ${i.checkIn} to ${i.checkOut}${i.car ? `\nCar: ${i.car}` : ''}

Use web search to check:
1. Whether the hotel itself has parking (on-site, valet or partner car park), the price per day/night in local currency, and whether it must be booked ahead or has height limits.
2. Up to 5 public car parks within about a 10-minute walk of the hotel (closest first), with approximate walking time, typical 24-hour or overnight price in local currency, and anything useful (open 24/7, early-bird or overnight rate, height limit, booking app).
3. Up to 3 short local tips (e.g. street parking rules, apps people use to pre-book parking in this city, cheaper park-and-walk options, restrictions on foreign plates or hire cars).

Only include real car parks you found evidence for. Prices are approximate; say so with "about" or "from".

Respond with ONLY JSON in plain text (no citation tags, no HTML, no markdown):
{"hotel":{"onSite":"yes|no|unknown","price":"","note":""},"spots":[{"name":"","walk":"4 min walk","price":"about ¥80/day","type":"Car park","note":""}],"tips":[""]}
Keep each note under 16 words.`;

  const { text, searched } = await askClaude({ apiKey: s.apiKey!, model: s.model || DEFAULT_MODEL, content: prompt, search: true, maxTokens: 4000, maxSearches: 4 });
  return normalise(extractJSON(text, 'spots'), searched ? 'ai-search' : 'ai');
}

function normalise(p: Record<string, unknown>, source: ParkingResult['source']): ParkingResult {
  const str = (v: unknown) => (typeof v === 'string' && cleanText(v) ? cleanText(v) : undefined);
  const h = (p.hotel ?? {}) as Record<string, unknown>;
  const onSite = h.onSite === 'yes' || h.onSite === 'no' ? h.onSite : 'unknown';
  const spots = (Array.isArray(p.spots) ? p.spots : []).filter(x => x && str(x.name)).slice(0, 6)
    .map(x => ({ name: str(x.name)!, walk: str(x.walk), price: str(x.price), note: str(x.note), type: str(x.type) }));
  const tips = (Array.isArray(p.tips) ? p.tips : []).map(str).filter((x): x is string => !!x).slice(0, 3);
  return { at: Date.now(), source, hotel: { onSite, price: str(h.price), note: str(h.note) }, spots, tips };
}

async function demo(i: ParkingInput): Promise<ParkingResult> {
  await new Promise(r => setTimeout(r, 400));
  return normalise({
    hotel: { onSite: 'yes', price: 'about 100 a night', note: 'Demo: limited spaces, ask at check-in.' },
    spots: [
      { name: `Demo ${i.city} Plaza Car Park`, walk: '3 min walk', price: 'about 60/day', type: 'Car park', note: 'Open 24/7, overnight rate after 6 pm.' },
      { name: 'Demo Station Parking', walk: '8 min walk', price: 'about 40/day', type: 'Car park', note: 'Cheaper, 2.1 m height limit.' }
    ],
    tips: ['Demo tip: street parking is metered until 8 pm.']
  }, 'demo');
}
