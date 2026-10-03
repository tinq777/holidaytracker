import { db } from './db';
import { keywordCategory, merchantKey } from './categorise';

/** Local, on-device learning: remembers the category/payment method you settle on for each merchant. */
export async function suggestCategory(merchant: string, description = ''): Promise<{ category?: string; paymentMethodId?: string; learned: boolean }> {
  const key = merchantKey(merchant);
  if (key) {
    const rule = await db.merchantRules.get(key);
    if (rule) return { category: rule.category, paymentMethodId: rule.paymentMethodId, learned: true };
  }
  return { category: keywordCategory(`${merchant} ${description}`), learned: false };
}

export async function learnFromConfirmation(merchant: string, category: string, paymentMethodId?: string) {
  const key = merchantKey(merchant);
  if (!key || /^(alipay|wechat|wechat pay|unknown|transaction)( transaction)?$/.test(key)) return;
  const existing = await db.merchantRules.get(key);
  await db.merchantRules.put({ key, category, paymentMethodId: paymentMethodId ?? existing?.paymentMethodId, uses: (existing?.uses ?? 0) + 1, updatedAt: Date.now() });
}
