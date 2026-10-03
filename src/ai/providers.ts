import type { ExtractedExpense, ExtractionContext, ExtractionInput, ExtractionProvider } from './ExpenseExtractionService';

/** No AI: images go to the inbox for the user to fill in; text is parsed by the caller's offline parser. */
export class NoAIProvider implements ExtractionProvider {
  id = 'none'; label = 'Off (no AI)'; needsNetwork = false; canReadImages = false;
  async extract(): Promise<ExtractedExpense> { return { confidence: 0 }; }
}

/** Demo provider: pretends to read images so the full workflow can be tried without an API key. */
const DEMO_SAMPLES: ExtractedExpense[] = [
  { merchant: 'Restaurant', amount: 128, currency: 'CNY', category: 'Food', paymentMethod: 'Alipay', description: 'Dinner', confidence: 0.92 },
  { merchant: 'Didi', amount: 46, currency: 'CNY', category: 'Transport', paymentMethod: 'Alipay', description: 'Ride to hotel', confidence: 0.9 },
  { merchant: 'Pokémon Store', amount: 299, currency: 'CNY', category: 'Shopping', paymentMethod: 'Alipay', description: 'Souvenirs', confidence: 0.88 },
  { merchant: 'Alipay transaction', amount: 75, currency: 'CNY', paymentMethod: 'Alipay', confidence: 0.4 }
];
export class DemoProvider implements ExtractionProvider {
  id = 'demo'; label = 'Demo (simulated, reads nothing)'; needsNetwork = false; canReadImages = true;
  private static i = 0;
  async extract(input: ExtractionInput, ctx: ExtractionContext): Promise<ExtractedExpense> {
    await new Promise(r => setTimeout(r, 450));
    if (input.kind === 'text') return { confidence: 0 };
    const s = DEMO_SAMPLES[DemoProvider.i++ % DEMO_SAMPLES.length];
    const cur = ctx.travelCurrencies.includes(s.currency!) ? s.currency : ctx.travelCurrencies[0] ?? ctx.homeCurrency;
    return { ...s, currency: cur, date: ctx.today >= ctx.tripStart && ctx.today <= ctx.tripEnd ? ctx.today : ctx.tripStart };
  }
}

const PROMPT = (ctx: ExtractionContext, kind: string) => `You extract a single expense from a ${kind} for a personal travel budget app.
Trip dates: ${ctx.tripStart} to ${ctx.tripEnd}. Today: ${ctx.today}. Home currency: ${ctx.homeCurrency}. Travel currencies: ${ctx.travelCurrencies.join(', ') || 'none'}.
Allowed categories: ${ctx.categories.join(', ')}.
Known payment methods: ${ctx.paymentMethods.join(', ')}.
Rules: amount is the total actually paid (number, no symbols). currency is an ISO 4217 code; "¥" means CNY unless the context is Japan. date is YYYY-MM-DD; if the year is missing, use the trip year. time is HH:MM if shown. category must be one of the allowed categories, or omit it if unclear. paymentMethod should be one of the known payment methods when it clearly applies (e.g. an Alipay screenshot -> Alipay). merchant is the shop/restaurant/service name, short. confidence is 0-1 for how sure you are overall.
Respond with ONLY a JSON object with keys: merchant, amount, currency, date, time, category, paymentMethod, description, confidence. No markdown.`;

export class AnthropicProvider implements ExtractionProvider {
  id = 'anthropic'; label = 'Claude (Anthropic API)'; needsNetwork = true; canReadImages = true;
  constructor(private apiKey: string, private model: string) {}
  async extract(input: ExtractionInput, ctx: ExtractionContext): Promise<ExtractedExpense> {
    const content: unknown[] = [];
    if (input.kind === 'image') {
      const [meta, data] = input.dataUrl.split(',');
      const media_type = meta.match(/data:(.*?);/)?.[1] ?? 'image/jpeg';
      content.push({ type: 'image', source: { type: 'base64', media_type, data } });
      content.push({ type: 'text', text: PROMPT(ctx, input.source === 'receipt' ? 'receipt photo' : 'payment app screenshot') });
    } else {
      content.push({ type: 'text', text: PROMPT(ctx, 'spoken note') + `\n\nSpoken note: "${input.text}"` });
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({ model: this.model, max_tokens: 400, messages: [{ role: 'user', content }] })
    });
    if (!res.ok) throw new Error(`AI request failed (${res.status}): ${(await res.text()).slice(0, 160)}`);
    const data = await res.json();
    const text: string = (data.content ?? []).map((c: { type: string; text?: string }) => c.text ?? '').join('');
    const json = text.replace(/```json|```/g, '').trim();
    const start = json.indexOf('{'); const end = json.lastIndexOf('}');
    const parsed = JSON.parse(json.slice(start, end + 1));
    return {
      merchant: parsed.merchant || undefined, amount: typeof parsed.amount === 'number' ? parsed.amount : parseFloat(parsed.amount) || undefined,
      currency: parsed.currency?.toUpperCase?.(), date: parsed.date || undefined, time: parsed.time || undefined,
      category: parsed.category || undefined, paymentMethod: parsed.paymentMethod || undefined,
      description: parsed.description || undefined, confidence: Number(parsed.confidence) || 0.5
    };
  }
}
