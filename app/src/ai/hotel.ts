import { loadAISettings, DEFAULT_MODEL } from './index';
import { cleanText } from './text';
import type { HotelReport } from '../lib/types';

export interface HotelCheckInput {
  name: string; link?: string; screenshot?: string; // base64 JPEG of the listing
  city: string; country?: string; checkIn: string; checkOut: string; nights: number;
  adults: number; children: number; homeCurrency: string; places: string[];
  pricePerNight?: number; currency?: string;
}
export class HotelCheckUnavailable extends Error {}

/**
 * Researches one hotel for this trip: travel times to the places that matter, value, family fit,
 * recurring review themes and red flags. Uses Claude's web search when the account allows it.
 */
export async function checkHotel(i: HotelCheckInput): Promise<HotelReport> {
  const s = await loadAISettings();
  if (s.provider === 'demo') return demoReport(i);
  if (s.provider !== 'anthropic' || !s.apiKey) throw new HotelCheckUnavailable('Hotel check needs AI. Choose Claude in More → AI reading (or Demo to try it).');
  if (!navigator.onLine) throw new HotelCheckUnavailable('Hotel check needs an internet connection.');

  const who = `${i.adults} adult${i.adults === 1 ? '' : 's'}${i.children ? ` and ${i.children} child${i.children === 1 ? '' : 'ren'}` : ''}`;
  const prompt = (search: boolean) => `You are helping a family choose a hotel. Be candid: the goal is the best value at the best location with no nasty surprises.

Hotel: ${i.name || '(read it from the screenshot)'}${i.link ? `\nListing link: ${i.link}` : ''}
City: ${i.city}
Stay: ${i.checkIn} to ${i.checkOut} (${i.nights} night${i.nights === 1 ? '' : 's'})
Travellers: ${who}
${i.pricePerNight ? `Quoted price: ${i.pricePerNight} ${i.currency ?? i.homeCurrency} per night` : 'Price: read it from the screenshot if shown, otherwise estimate the typical rate.'}
Places that matter on this trip: ${i.places.length ? i.places.join('; ') : 'none given, so use the main sights and the nearest metro/train station'}
${i.screenshot ? 'A screenshot of the listing is attached: read the hotel name, price, room type, rating and dates from it.' : ''}

${search ? 'Use web search to find this exact hotel (right branch, right city), its address, and recent guest reviews from the last 2 years (Google, TripAdvisor, Booking.com, Trip.com, Ctrip and similar).' : 'You cannot search the web, so rely on what you know and say so in the summary; mark anything uncertain.'}

Assess:
- location: for each place that matters, the realistic door-to-door time and mode, e.g. "12 min walk", "25 min metro (Line 2)", "35 min taxi". Add the nearest metro/train station if not listed.
- value: compare the price with similar hotels in that area for those dates. typicalRange like "900-1300 CNY". extras = costs or inclusions to know (breakfast, extra bed or cot fees, city tax, deposit, parking).
- familyFit: will the room sleep ${who}? Family rooms, connecting rooms, cots, pool, kid-friendly or not.
- reviewsGood / reviewsBad: recurring themes across reviews (not one-offs), each under 12 words.
- redFlags: anything that should stop them booking or that they must check first, e.g. noise from bars or roads, construction or renovation, smoking smell, misleading photos, hidden fees, poor cleanliness, safety, location far from transport, and local traps such as a mainland China hotel not licensed to accept foreign passport holders. Empty list if none.
- verdict: "good" (recommend), "concerns" (ok with caveats) or "red" (avoid or verify first). summary: two sentences max, plain English.

Respond with ONLY JSON in plain text (no citation tags, no HTML), no markdown:
{"name":"","area":"","address":"","stars":0,"verdict":"good","summary":"","pricePerNight":0,"currency":"","typicalRange":"","valueNote":"","extras":[""],"location":[{"place":"","time":"","note":""}],"familyFit":"","reviewsGood":[""],"reviewsBad":[""],"redFlags":[""],"sources":[{"title":"","url":""}]}`;

  const call = async (search: boolean) => {
    const content: unknown[] = [];
    if (i.screenshot) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: i.screenshot } });
    content.push({ type: 'text', text: prompt(search) });
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': s.apiKey!, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: s.model || DEFAULT_MODEL, max_tokens: 3000, messages: [{ role: 'user', content }],
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

function normalise(p: Record<string, unknown>, i: HotelCheckInput, source: HotelReport['source']): HotelReport {
  const str = (v: unknown) => (typeof v === 'string' && cleanText(v) ? cleanText(v) : undefined);
  const list = (v: unknown, max = 6) => (Array.isArray(v) ? v.map(str).filter((x): x is string => !!x).slice(0, max) : []);
  const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : typeof v === 'string' && parseFloat(v) > 0 ? parseFloat(v) : undefined);
  const verdict = p.verdict === 'good' || p.verdict === 'red' ? p.verdict : 'concerns';
  return {
    name: str(p.name) ?? i.name, area: str(p.area), address: str(p.address), stars: num(p.stars),
    verdict, summary: str(p.summary) ?? '',
    pricePerNight: num(p.pricePerNight) ?? i.pricePerNight, currency: str(p.currency)?.toUpperCase() ?? i.currency, typicalRange: str(p.typicalRange), valueNote: str(p.valueNote),
    extras: list(p.extras),
    location: (Array.isArray(p.location) ? p.location : []).filter(x => x && str(x.place) && str(x.time)).slice(0, 8).map(x => ({ place: str(x.place)!, time: str(x.time)!, note: str(x.note) })),
    familyFit: str(p.familyFit), reviewsGood: list(p.reviewsGood), reviewsBad: list(p.reviewsBad), redFlags: list(p.redFlags),
    sources: (Array.isArray(p.sources) ? p.sources : []).filter(x => x && typeof x.url === 'string' && /^https?:\/\//.test(x.url)).slice(0, 6).map(x => ({ title: str(x.title) ?? new URL(x.url).hostname, url: x.url })),
    source, checkedAt: Date.now()
  };
}

async function demoReport(i: HotelCheckInput): Promise<HotelReport> {
  await new Promise(r => setTimeout(r, 700));
  const bad = /cheap|budget|hostel|inn/i.test(i.name);
  const places = i.places.length ? i.places : [`${i.city} centre`, 'Nearest metro station'];
  return normalise({
    name: i.name || 'Demo Hotel', area: 'Demo district', address: `1 Demo Road, ${i.city}`, stars: bad ? 3 : 4,
    verdict: bad ? 'red' : 'concerns',
    summary: bad ? 'Demo report: cheap for the area, but reviews mention noise and small rooms.' : 'Demo report: good location and fair price; some rooms face a busy road.',
    pricePerNight: i.pricePerNight ?? (bad ? 380 : 980), currency: i.currency ?? 'CNY', typicalRange: '850-1200 CNY', valueNote: bad ? 'Below typical, which matches the reviews.' : 'Fair for the area and dates.',
    extras: ['Breakfast extra for children over 1.2 m', 'Refundable deposit at check-in'],
    location: places.slice(0, 4).map((p, n) => ({ place: p, time: ['8 min walk', '20 min metro', '35 min taxi', '45 min metro'][n % 4] })),
    familyFit: bad ? 'Rooms are small; 4 people would need two rooms.' : 'Family room with two double beds fits 2 adults and 2 children.',
    reviewsGood: ['Helpful front desk', 'Close to metro'], reviewsBad: bad ? ['Thin walls, street noise', 'Dated bathrooms'] : ['Road noise on lower floors'],
    redFlags: bad ? ['Demo: check it accepts foreign passport holders before booking'] : [],
    sources: []
  }, i, 'demo');
}
