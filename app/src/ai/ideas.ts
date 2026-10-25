import { loadAISettings, DEFAULT_MODEL } from './index';
import { uid } from '../lib/db';
import type { CityIdeas, IdeaItem } from '../lib/types';

export interface IdeasInput { holidayId: string; city: string; country?: string; from: string; to: string; adults: number; children: number; otherCities: string[]; hotels: { name: string; address?: string; from: string; to: string }[] }
export class IdeasUnavailable extends Error {}

type Section = 'see' | 'events' | 'shop' | 'breakfast' | 'lunch' | 'dinner';
const SECTIONS: Section[] = ['see', 'events', 'shop', 'breakfast', 'lunch', 'dinner'];

/**
 * High-level suggestions for one city: things to see and do, what's on, boutique shopping and places to eat
 * near the hotel. Uses Claude's web search for current events when the account allows it, else Claude's own
 * knowledge (flagged in the UI).
 */
export async function suggestIdeas(i: IdeasInput): Promise<CityIdeas> {
  const s = await loadAISettings();
  if (s.provider === 'demo') return demoIdeas(i);
  if (s.provider !== 'anthropic' || !s.apiKey) throw new IdeasUnavailable('Suggestions need AI. Choose Claude in More → AI reading (or Demo to try it).');
  if (!navigator.onLine) throw new IdeasUnavailable('Suggestions need an internet connection. Saved suggestions still show offline.');

  const who = `${i.adults} adult${i.adults === 1 ? '' : 's'}${i.children ? ` and ${i.children} child${i.children === 1 ? '' : 'ren'}` : ''}`;
  const prompt = (search: boolean) => `You're a well-travelled local friend. Give high-level suggestions for a family holiday.

City: ${i.city}${i.otherCities.length ? ` (the trip also visits ${i.otherCities.join(', ')})` : ''}
Dates in this city: ${i.from} to ${i.to}
Travellers: ${who}${i.children ? '. Favour things that work with children and say when something is NOT suitable for kids.' : ''}
${i.hotels.length ? `Staying at: ${i.hotels.map(h => `${h.name}${h.address ? ` (${h.address})` : ''}, ${h.from} to ${h.to}`).join('; ')}` : 'Hotel not booked yet.'}

${search ? `Use web search to find events, festivals, exhibitions, shows or seasonal happenings on during ${i.from} to ${i.to} in ${i.city}. Only include events you found evidence for on those dates.` : `You cannot search the web. For "events", only include recurring annual festivals or seasonal highlights that normally fall in those dates, and set "when" to the usual timing with "(usually)".`}

Return:
- see: 8 top things to see and do (mix of icons and less obvious picks), each with a one-line reason.
- events: up to 5 things on during those dates (empty list if none).
- shop: 7 picks for boutique and trendy shopping: 3-4 neighbourhoods or streets known for independent boutiques, concept stores, local designers or vintage, plus 3-4 specific standout shops or design markets. Avoid big malls and global chains. tag is one of "Neighbourhood", "Boutique", "Concept store", "Vintage", "Market", "Design". The note says what to look for there.
- breakfast, lunch, dinner: 3 places each, well-reviewed and popular with locals as well as visitors, across price levels. Prefer long-running places likely still open.${i.hotels.length ? `
  Base these on where they're staying${i.hotels.length > 1 ? ' (spread them across the hotels)' : ''}: breakfast within about a 10-minute walk of the hotel; dinner within a 15-minute walk or a short taxi ride; lunch can be near the hotel or near the top sights. Set "near" to the approximate distance, e.g. "5 min walk from ${i.hotels[0].name}" or "10 min taxi from ${i.hotels[0].name}".` : ''}

Respond with ONLY JSON (no markdown, no commentary):
{"see":[{"name":"","note":"","area":"","kids":true}],"events":[{"name":"","note":"","when":"","area":""}],"shop":[{"name":"","note":"","area":"","tag":"Neighbourhood"}],"breakfast":[{"name":"","note":"","area":"","price":"$|$$|$$$","kids":true,"near":""}],"lunch":[...],"dinner":[...]}
Keep each note under 18 words. "area" is the neighbourhood or district.`;

  const call = async (search: boolean) => {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': s.apiKey!, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: s.model || DEFAULT_MODEL, max_tokens: 4000,
        messages: [{ role: 'user', content: prompt(search) }],
        ...(search ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }] } : {})
      })
    });
    if (!res.ok) throw Object.assign(new Error(`AI request failed (${res.status})`), { status: res.status });
    const data = await res.json();
    return ((data.content ?? []) as { type: string; text?: string }[]).filter(c => c.type === 'text').map(c => c.text ?? '').join('');
  };

  let text: string; let searched = true;
  try { text = await call(true); }
  catch (e) {
    // Web search may not be enabled for this API key: try again without it.
    if ((e as { status?: number }).status && (e as { status: number }).status < 500) { searched = false; text = await call(false); } else throw e;
  }
  const clean = text.replace(/```json|```/g, '');
  const parsed = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
  return build(i, parsed, searched ? 'ai-search' : 'ai');
}

function build(i: IdeasInput, parsed: Record<string, unknown>, source: CityIdeas['source']): CityIdeas {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const items = (v: unknown): IdeaItem[] => (Array.isArray(v) ? v : []).filter(x => x && str(x.name)).slice(0, 10).map(x => ({
    id: uid(), name: str(x.name)!, note: str(x.note), area: str(x.area), when: str(x.when),
    price: typeof x.price === 'string' && /^\${1,3}$/.test(x.price) ? x.price : undefined,
    kids: typeof x.kids === 'boolean' ? x.kids : undefined, tag: str(x.tag), near: str(x.near)
  }));
  const out = { id: `${i.holidayId}|${i.city}`, holidayId: i.holidayId, city: i.city, from: i.from, to: i.to, generatedAt: Date.now(), source, hotels: i.hotels.map(h => h.name) } as CityIdeas;
  for (const k of SECTIONS) (out as unknown as Record<Section, IdeaItem[]>)[k] = items(parsed[k]);
  return out;
}

/** Keeps starred items when suggestions are refreshed. */
export function mergeStarred(prev: CityIdeas | undefined, next: CityIdeas): CityIdeas {
  if (!prev) return next;
  const out = { ...next };
  for (const k of SECTIONS) {
    const kept = (prev[k] ?? []).filter(x => x.starred);
    (out as unknown as Record<Section, IdeaItem[]>)[k] = [...kept, ...(next[k] ?? []).filter(n => !kept.some(s => s.name.toLowerCase() === n.name.toLowerCase()))];
  }
  return out;
}

async function demoIdeas(i: IdeasInput): Promise<CityIdeas> {
  await new Promise(r => setTimeout(r, 500));
  const c = i.city;
  const it = (name: string, note: string, extra: Partial<IdeaItem> = {}) => ({ name, note, ...extra });
  return build(i, {
    see: [it(`${c} old town walk`, 'Demo suggestion: wander the historic streets early before crowds.', { area: 'Old town', kids: true }),
      it(`${c} riverside promenade`, 'Demo suggestion: best at sunset, flat and pram-friendly.', { area: 'Waterfront', kids: true }),
      it(`${c} city museum`, 'Demo suggestion: free entry, hands-on gallery for kids.', { area: 'Centre', kids: true }),
      it('Night market', 'Demo suggestion: snacks and souvenirs, busy after 7 pm.', { area: 'Centre', kids: true })],
    shop: [it(`${c} design quarter`, 'Demo suggestion: lanes of independent boutiques and small galleries.', { area: 'Old town', tag: 'Neighbourhood' }),
      it('Demo Concept Store', 'Demo suggestion: local designers, homewares and gifts.', { area: 'Centre', tag: 'Concept store' })],
    events: [it('Spring flower festival', 'Demo suggestion: parks fill with blossom displays.', { when: 'Early April (usually)', area: 'City parks' })],
    breakfast: [it('Demo Dumpling House', 'Local breakfast favourite, quick and cheap.', { price: '$', kids: true, near: i.hotels[0] ? `4 min walk from ${i.hotels[0].name}` : undefined })],
    lunch: [it('Demo Noodle Bar', 'Hand-pulled noodles, queue moves fast.', { price: '$', kids: true })],
    dinner: [it('Demo Riverside Kitchen', 'Family tables, set menus, book ahead on weekends.', { price: '$$', kids: true, near: i.hotels[0] ? `12 min walk from ${i.hotels[0].name}` : undefined })]
  }, 'demo');
}
