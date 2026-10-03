/**
 * Provider-agnostic expense extraction.
 * The app never sends anything unless the user taps a capture action AND has chosen a provider.
 */
export interface ExtractedExpense {
  merchant?: string; amount?: number; currency?: string; date?: string; time?: string;
  category?: string; paymentMethod?: string; description?: string;
  confidence: number; // 0..1
}

export type ExtractionInput =
  | { kind: 'image'; source: 'screenshot' | 'receipt'; dataUrl: string }
  | { kind: 'text'; source: 'voice'; text: string };

export interface ExtractionContext {
  homeCurrency: string; travelCurrencies: string[]; categories: string[];
  paymentMethods: string[]; tripStart: string; tripEnd: string; today: string;
}

export interface ExtractionProvider {
  readonly id: string;
  readonly label: string;
  readonly needsNetwork: boolean;
  readonly canReadImages: boolean;
  extract(input: ExtractionInput, ctx: ExtractionContext): Promise<ExtractedExpense>;
}

export class ExpenseExtractionService {
  constructor(private provider: ExtractionProvider) {}
  get info() { return { id: this.provider.id, label: this.provider.label, needsNetwork: this.provider.needsNetwork, canReadImages: this.provider.canReadImages }; }
  canProcessNow(input: ExtractionInput['kind']) {
    if (input === 'image' && !this.provider.canReadImages) return false;
    return !this.provider.needsNetwork || navigator.onLine;
  }
  async extract(input: ExtractionInput, ctx: ExtractionContext): Promise<ExtractedExpense> {
    const r = await this.provider.extract(input, ctx);
    return { ...r, confidence: Math.max(0, Math.min(1, r.confidence ?? 0)) };
  }
}
