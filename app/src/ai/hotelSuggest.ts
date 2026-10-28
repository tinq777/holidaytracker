import { loadAISettings, DEFAULT_MODEL } from './index';
import { cleanText } from './text';
import { askClaude, extractJSON } from './claude';
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
  near: string[]; pros: string[]; saveTips: string[]; watchOut?: string; foreignGuests?: 'yes' | 'no' | 'unknown'; link?: string; tripUrl?: string; agodaUrl?: string;
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
{"areaTip":"","hotels":[{"name":"","area":"","why":"","roomSetup":"","pricePerNight":0,"currency":"${i.currency}","priceNote":"","near":["12 min walk to …"],"pros":[""],"saveTips":[""],"watchOut":"","foreignGuests":"yes","link":"","tripUrl":"","agodaUrl":""}]}
saveTips: 1-2 specific ways to pay less for THIS hotel, e.g. the chain's loyalty member rate or perks when booking direct, long-stay or advance-purchase discounts, free cancellation to rebook if the price drops, a cheaper room type that still fits everyone, pay in local currency rather than ${i.currency === 'AUD' ? 'AUD' : 'your home currency'} at the desk. Only include tips that genuinely apply; no generic advice.
tripUrl / agodaUrl: the hotel's own page on trip.com / agoda.com if you found it, else empty.
Keep "why" under 20 words, at most 3 pros and 2 "near" items.`;

  const { text, searched } = await askClaude({ apiKey: s.apiKey!, model: s.model || DEFAULT_MODEL, content: prompt(true), search: true, maxTokens: 8000, maxSearches: 5 });
  return normalise(extractJSON(text, 'hotels'), i, searched ? 'ai-search' : 'ai');
}

function normalise(p: Record<string, unknown>, i: SuggestInput, source: SuggestResult['source']): SuggestResult {
  const str = (v: unknown) => (typeof v === 'string' && cleanText(v) ? cleanText(v) : undefined);
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v.map(str).filter((x): x is string => !!x).slice(0, max) : []);
  const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : typeof v === 'string' && parseFloat(v) > 0 ? parseFloat(v) : undefined);
  const hotels = (Array.isArray(p.hotels) ? p.hotels : []).filter(x => x && str(x.name)).slice(0, 6).map((x): HotelSuggestion => ({
    name: str(x.name)!, area: str(x.area), why: str(x.why) ?? '', roomSetup: str(x.roomSetup),
    pricePerNight: num(x.pricePerNight), currency: str(x.currency)?.toUpperCase() ?? i.currency, priceNote: str(x.priceNote),
    near: list(x.near, 2), pros: list(x.pros, 3), saveTips: list(x.saveTips, 2), watchOut: str(x.watchOut),
    foreignGuests: x.foreignGuests === 'yes' || x.foreignGuests === 'no' ? x.foreignGuests : 'unknown',
    link: typeof x.link === 'string' && /^https?:\/\//.test(x.link) ? x.link : undefined,
    agodaUrl: typeof x.agodaUrl === 'string' && /agoda\.com\/.*\/hotel\//.test(x.agodaUrl) ? x.agodaUrl : undefined,
    tripUrl: typeof x.tripUrl === 'string' && /trip\.com/.test(x.tripUrl) ? x.tripUrl : typeof x.link === 'string' && /trip\.com/.test(x.link) ? x.link : undefined
  }));
  return { areaTip: str(p.areaTip), hotels, source, at: Date.now(), input: i };
}

async function demo(i: SuggestInput): Promise<SuggestResult> {
  await new Promise(r => setTimeout(r, 700));
  const people = i.adults + i.children; const area = i.area || `${i.city} centre`;
  const mk = (name: string, price: number, setup: string, why: string, watch?: string) => ({ name, area, why, roomSetup: setup, pricePerNight: price, currency: i.currency, near: [`10 min walk to ${i.places[0] ?? 'metro'}`], pros: ['Demo: family rooms', 'Demo: breakfast included'], saveTips: ['Demo: join the chain loyalty programme for a member rate'], watchOut: watch, foreignGuests: 'yes', link: '' });
  return normalise({
    areaTip: `Demo: ${area} is a reasonable base; somewhere near a metro interchange would cut travel time.`,
    hotels: [
      mk('Demo Family Suites', 1300, `Family suite, sleeps ${people}`, 'Demo: suites with a separate kids room, near the metro.'),
      mk('Demo Grand Hotel', 1800, '2 connecting rooms', 'Demo: bigger rooms and a pool, a bit pricier.', 'Demo: road noise on low floors'),
      mk('Demo Serviced Apartments', 1100, `2-bedroom apartment, sleeps ${people}`, 'Demo: kitchen and washing machine, good value for longer stays.')
    ]
  }, i, 'demo');
}
