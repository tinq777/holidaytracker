import { loadAISettings, DEFAULT_MODEL } from './index';

export type SpendStyle = 'budget' | 'moderate' | 'comfortable';

export interface BudgetEstimateInput {
  style: SpendStyle;
  destinations: string[]; start: string; end: string; days: number; nights: number;
  adults: number; children: number; homeCurrency: string; origin?: string;
}
export interface BudgetEstimate {
  flights: number;       // return economy for everyone, total
  accommodation: number; // all nights, total
  dailySpend: number;    // whole group, per day: food, local transport, activities (no shopping)
  daily?: { food: number; transport: number; activities: number };
  notes: string[];       // assumptions to show the user
  source: 'ai' | 'demo';
}

export class BudgetEstimateUnavailable extends Error {}

/** Asks the configured AI for a starting budget. Nothing is sent unless the user taps the button. */
export async function estimateBudget(input: BudgetEstimateInput): Promise<BudgetEstimate> {
  const s = await loadAISettings();
  if (s.provider === 'demo') return demoEstimate(input);
  if (s.provider !== 'anthropic' || !s.apiKey) throw new BudgetEstimateUnavailable('Turn on AI in More → AI reading (Claude, or Demo to try it).');
  if (!navigator.onLine) throw new BudgetEstimateUnavailable('Budget estimates need an internet connection.');

  const who = `${input.adults} adult${input.adults === 1 ? '' : 's'}${input.children ? ` and ${input.children} child${input.children === 1 ? '' : 'ren'}` : ''}`;
  const styleText = {
    budget: 'budget: hostels or simple 3-star family rooms, mostly cheap local eateries and street food, public transport, mostly free sights',
    moderate: 'moderate: comfortable 3-4 star hotels, a mix of casual local restaurants and some sit-down meals, mostly public transport with occasional taxis, about one paid attraction every second day',
    comfortable: 'comfortable: 4-5 star hotels, mostly sit-down restaurants, taxis/ride-hailing, a paid attraction most days'
  }[input.style];
  const prompt = `Estimate a realistic holiday budget the way an experienced local travel agent would, using typical current prices in the destination (not tourist-trap prices).

Trip: ${input.destinations.join(', ') || 'unspecified destination'}
Travelling from: ${input.origin || 'Sydney, Australia'}
Dates: ${input.start} to ${input.end} (${input.days} days, ${input.nights} nights)
Travellers: ${who}
Travel style: ${styleText}
Currency for all amounts: ${input.homeCurrency}

Give totals for the whole group:
- flights: return economy airfares for all travellers, booked a few months ahead, allowing for the season. Children over 2 pay close to adult fares.
- accommodation: all ${input.nights} nights, rooms sized for the group, matching the travel style.
- daily: typical per-day spend for the WHOLE GROUP, split into food, transport (local only, not intercity trains or flights) and activities (entry fees, tours). Exclude shopping and souvenirs; the traveller tracks those separately. Children under 12 eat and pay entry at roughly half adult cost. Base it on the local cost of living — cheaper countries should be noticeably lower.
Round to sensible whole numbers.

Respond with ONLY a JSON object, no other text:
{"flights": number, "accommodation": number, "daily": {"food": number, "transport": number, "activities": number}, "notes": ["short assumption", "..."]}
Keep notes to 2-3 short items (e.g. season, typical nightly rate, typical meal cost).`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': s.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: s.model || DEFAULT_MODEL, max_tokens: 700, messages: [{ role: 'user', content: prompt }] })
  });
  if (!res.ok) throw new Error(`AI request failed (${res.status})`);
  const data = await res.json();
  const text: string = (data.content ?? []).map((c: { text?: string }) => c.text ?? '').join('').replace(/```json|```/g, '');
  const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
  const daily = { food: n(parsed.daily?.food), transport: n(parsed.daily?.transport), activities: n(parsed.daily?.activities) };
  const dailySpend = daily.food + daily.transport + daily.activities || n(parsed.dailySpend);
  return { flights: n(parsed.flights), accommodation: n(parsed.accommodation), dailySpend, daily, notes: Array.isArray(parsed.notes) ? parsed.notes.slice(0, 3).map(String) : [], source: 'ai' };
}

/** Rough fixed formula so the flow can be tried without an API key. Not based on the destination. */
function demoEstimate(i: BudgetEstimateInput): BudgetEstimate {
  const k = { budget: 0.65, moderate: 1, comfortable: 1.6 }[i.style];
  const people = i.adults + i.children;
  const flights = Math.round((i.adults * 1400 + i.children * 1250) / 10) * 10;
  const perNight = Math.round(((150 + Math.max(0, people - 2) * 40) * k) / 5) * 5;
  const r5 = (x: number) => Math.round(x / 5) * 5;
  const daily = { food: r5((i.adults * 40 + i.children * 20) * k), transport: r5((i.adults * 8 + i.children * 4) * k), activities: r5((i.adults * 15 + i.children * 8) * k) };
  return {
    flights, accommodation: perNight * i.nights, dailySpend: daily.food + daily.transport + daily.activities, daily,
    notes: ['Demo numbers from a fixed formula, not the destination. Choose Claude in More → AI reading for a real estimate.', `About ${perNight} ${i.homeCurrency} a night for ${people} people`],
    source: 'demo'
  };
}
