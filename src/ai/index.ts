import { getSetting } from '../lib/db';
import { ExpenseExtractionService } from './ExpenseExtractionService';
import { AnthropicProvider, DemoProvider, NoAIProvider } from './providers';

export type AIProviderId = 'none' | 'demo' | 'anthropic';
export interface AISettings { provider: AIProviderId; apiKey?: string; model?: string }
export const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export async function loadAISettings(): Promise<AISettings> {
  return getSetting<AISettings>('ai', { provider: 'none' });
}

export async function getExtractionService(): Promise<ExpenseExtractionService> {
  const s = await loadAISettings();
  if (s.provider === 'anthropic' && s.apiKey) return new ExpenseExtractionService(new AnthropicProvider(s.apiKey, s.model || DEFAULT_MODEL));
  if (s.provider === 'demo') return new ExpenseExtractionService(new DemoProvider());
  return new ExpenseExtractionService(new NoAIProvider());
}
export * from './ExpenseExtractionService';
