import { loadAISettings, DEFAULT_MODEL } from './index';
import { cleanText } from './text';
import { HotelCheckUnavailable } from './hotel';

export interface SuggestInput {
  city: string; area?: string; checkIn: string; checkOut: string; nights: number;
  adults: number; children: number; rooms: 'best' | '1' | '2';
  maxPerNight?: number; currency: string; style: 'budget' | 'moderate' | 'comfortable';
  mustHaves: string[]; places: string[];
}
export interface HotelSuggestion {
  name: string; area?: string; why: string; roomSetup?: string;
  pricePerNight?: number; currency?: string; priceNote?: string;
  near: string[]; pros: string[]; watchOut?: string; foreignGuests?: 'yes' | 'no' | 'unknown'; link?: string;
}
export interface SuggestResult { areaTip?: string; hotels: HotelSuggestion[]; source: 'ai-search' | 'ai' | 'demo'; at: number; input: SuggestInput }

/** Suggests real hotels that fit the party, area, budget and must-haves. Uses web search to confirm they exist. */
export async function suggestHotels(i: SuggestInput): Promise<SuggestResult> {
  const s = await loadAISettings();
  if (s.provider === 'demo') return demo(i);
  if (s.provider !== 'anthropic' || !s.apiKey) throw new HotelCheckUnavailable('Hotel suggestions need AI. Choose Claude in More → AI reading (or Demo to try it).');
  if (!navigator.onLine) throw new HotelCheckUnavailable('Hotel suggestions need an internet connection.');

  const people = i.adults + i.children;
  const who = `${i.adults} adult${i.adults === 1 ? '' : 's'}${i.children ? ` and ${i.children} child${i.children === 1 ? '' : 'ren'}` : ''} (${people} people)`;
  const rooms = i.rooms === 'best' ? 'whatever fits best: one family room/suite/apartment if available, otherwise two rooms (ideally connecting)' : `${i.rooms} room${i.rooms === '1' ? '' : 's'}`;
  const prompt = (search: boolean) => `Suggest hotels for a family trip. Recommend real, currently operating hotels only.

City: ${i.city}
Preferred area: ${i.area || 'no preference, pick the best base for this trip'}
Stay: ${i.checkIn} to ${i.checkOut} (${i.nights} night${i.nights === 1 ? '' : 's'})
Guests: ${who}
Rooms: ${rooms}
Style: ${i.style}
${i.maxPerNight ? `Budget: up to ${i.maxPerNight} ${i.currency} per night for the whole group` : 'Budget: no limit given, so favour good value'}
Must-haves: ${i.mustHaves.length ? i.mustHaves.join(', ') : 'none'}
Places that matter: ${i.places.length ? i.places.join('; ') : 'main sights and good transport'}

${search ? 'Use web search to confirm each hotel exists, is open, is in the right area, and to find typical current prices and recent review themes.' : 'You cannot search the web: only suggest well-established hotels you are confident still operate, and say prices are approximate.'}

Return 5 hotels, best fit first. For ${people} people, roomSetup must say exactly how they'd sleep (e.g. "Family suite, 1 king + 2 singles, sleeps 5" or "2 connecting rooms"). Many hotels cap rooms at 3-4 guests, so be realistic.
pricePerNight is the TOTAL for the whole group per night (all rooms) in ${i.currency}, typical for those dates. In mainland China, foreignGuests says whether the hotel is licensed to accept foreign passport holders ("yes", "no" or "unknown"); elsewhere use "yes".
areaTip: one or two sentences on whether the preferred area is a good base for this trip, and a better alternative if there is one.

Respond with ONLY JSON in plain text (no citation tags, no HTML), no markdown:
{"areaTip":"","hotels":[{"name":"","area":"","why":"","roomSetup":"","pricePerNight":0,"currency":"${i.currency}","priceNote":"","near":["12 min walk to …"],"pros":[""],"watchOut":"","foreignGuests":"yes","link":""}]}
Keep "why" under 20 words, at most 3 pros and 2 "near" items.`;

  const call = async (search: boolean) => {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': s.apiKey!, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: s.model || DEFAULT_MODEL, max_tokens: 3500, messages: [{ role: 'user', content: prompt(search) }],
        ...(search ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }] } : {})
      })
    });
    if (!res.ok) throw Object.assign(new Error(`AI request failed (${res.status})`), { status: res.status });
    const data = await res.json();
    return ((data.content ?? []) as { type: string; text?: string }[]).filter(c => c.type === 'text').map(c => c.text ?? '').join('');
  };
  let text: string; let searched = true;
  try { text = await call(true); }
  catch (e) {
    if ((e as { status?: number }).status && (e as { status: number }).status < 500) { searched = false; text = await call(false); } else throw e;
  }
  const clean = text.replace(/```json|```/g, '');
  return normalise(JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1)), i, searched ? 'ai-search' : 'ai');
}

function normalise(p: Record<string, unknown>, i: SuggestInput, source: SuggestResult['source']): SuggestResult {
  const str = (v: unknown) => (typeof v === 'string' && cleanText(v) ? cleanText(v) : undefined);
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v.map(str).filter((x): x is string => !!x).slice(0, max) : []);
  const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : typeof v === 'string' && parseFloat(v) > 0 ? parseFloat(v) : undefined);
  const hotels = (Array.isArray(p.hotels) ? p.hotels : []).filter(x => x && str(x.name)).slice(0, 6).map((x): HotelSuggestion => ({
    name: str(x.name)!, area: str(x.area), why: str(x.why) ?? '', roomSetup: str(x.roomSetup),
    pricePerNight: num(x.pricePerNight), currency: str(x.currency)?.toUpperCase() ?? i.currency, priceNote: str(x.priceNote),
    near: list(x.near, 2), pros: list(x.pros, 3), watchOut: str(x.watchOut),
    foreignGuests: x.foreignGuests === 'yes' || x.foreignGuests === 'no' ? x.foreignGuests : 'unknown',
    link: typeof x.link === 'string' && /^https?:\/\//.test(x.link) ? x.link : undefined
  }));
  return { areaTip: str(p.areaTip), hotels, source, at: Date.now(), input: i };
}

async function demo(i: SuggestInput): Promise<SuggestResult> {
  await new Promise(r => setTimeout(r, 700));
  const people = i.adults + i.children; const area = i.area || `${i.city} centre`;
  const mk = (name: string, price: number, setup: string, why: string, watch?: string) => ({ name, area, why, roomSetup: setup, pricePerNight: price, currency: i.currency, near: [`10 min walk to ${i.places[0] ?? 'metro'}`], pros: ['Demo: family rooms', 'Demo: breakfast included'], watchOut: watch, foreignGuests: 'yes', link: '' });
  return normalise({
    areaTip: `Demo: ${area} is a reasonable base; somewhere near a metro interchange would cut travel time.`,
    hotels: [
      mk('Demo Family Suites', 1300, `Family suite, sleeps ${people}`, 'Demo: suites with a separate kids room, near the metro.'),
      mk('Demo Grand Hotel', 1800, '2 connecting rooms', 'Demo: bigger rooms and a pool, a bit pricier.', 'Demo: road noise on low floors'),
      mk('Demo Serviced Apartments', 1100, `2-bedroom apartment, sleeps ${people}`, 'Demo: kitchen and washing machine, good value for longer stays.')
    ]
  }, i, 'demo');
}
