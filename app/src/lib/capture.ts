import { db, uid } from './db';
import { getExtractionService } from '../ai';
import type { ExtractedExpense, ExtractionContext } from '../ai';
import { compressImage } from './images';
import { parseExpenseText } from './parseText';
import { suggestCategory, learnFromConfirmation } from './learning';
import { withEstimate } from './rates';
import { todayISO } from './dates';
import type { Expense, Holiday, PaymentMethod } from './types';

async function context(h: Holiday): Promise<{ ctx: ExtractionContext; pms: PaymentMethod[] }> {
  const pms = await db.paymentMethods.orderBy('order').toArray();
  return { pms, ctx: { homeCurrency: h.homeCurrency, travelCurrencies: h.currencies, categories: h.categories, paymentMethods: pms.map(p => p.name), tripStart: h.start, tripEnd: h.end, today: todayISO() } };
}

const defaultDate = (h: Holiday) => { const t = todayISO(); return t < h.start || t > h.end ? (t < h.start ? t : h.end) : t; };

function blank(h: Holiday, source: Expense['source']): Expense {
  return { id: uid(), holidayId: h.id, status: 'inbox', source, merchant: '', amount: 0, currency: h.currencies[0] ?? h.homeCurrency, date: defaultDate(h), category: 'Other', createdAt: Date.now() };
}

async function applyExtraction(e: Expense, h: Holiday, x: ExtractedExpense, pms: PaymentMethod[]): Promise<Expense> {
  const next: Expense = { ...e };
  if (x.merchant) next.merchant = x.merchant;
  if (x.amount !== undefined && !isNaN(x.amount)) next.amount = x.amount;
  if (x.currency && /^[A-Z]{3}$/.test(x.currency)) next.currency = x.currency;
  if (x.date && /^\d{4}-\d{2}-\d{2}$/.test(x.date)) next.date = x.date;
  if (x.time) next.time = x.time;
  if (x.description) next.description = x.description;
  if (x.paymentMethod) next.paymentMethodId = pms.find(p => p.name.toLowerCase() === x.paymentMethod!.toLowerCase())?.id ?? next.paymentMethodId;
  const learned = await suggestCategory(next.merchant, next.description);
  // A learned rule beats the AI's guess; otherwise use the AI category, then keywords.
  const cat = learned.learned ? learned.category : (x.category && h.categories.includes(x.category) ? x.category : learned.category);
  next.category = cat ?? 'Other';
  next.suggestedCategory = next.category;
  if (learned.learned && learned.paymentMethodId && !next.paymentMethodId) next.paymentMethodId = learned.paymentMethodId;
  next.confidence = Math.min(x.confidence, cat ? 1 : 0.5);
  return withEstimate(next, h);
}

/** Screenshot / receipt: saved to the inbox immediately (works offline), then processed if AI is available. */
export async function captureImages(h: Holiday, files: File[], source: 'screenshot' | 'receipt'): Promise<string[]> {
  const svc = await getExtractionService();
  const ids: string[] = [];
  for (const f of files) {
    const [preview, thumb] = await Promise.all([compressImage(f, 1400, 0.72), compressImage(f, 220, 0.6)]);
    const e: Expense = { ...blank(h, source), pendingImage: preview, thumb, processing: svc.info.canReadImages ? 'waiting' : undefined, confidence: 0 };
    await db.expenses.add(e);
    ids.push(e.id);
  }
  // process sequentially in the background
  void (async () => { for (const id of ids) await processPending(id); })();
  return ids;
}

export async function processPending(id: string) {
  const e = await db.expenses.get(id);
  if (!e || !e.pendingImage || e.processing !== 'waiting') return;
  const h = await db.holidays.get(e.holidayId); if (!h) return;
  const svc = await getExtractionService();
  if (!svc.canProcessNow('image')) return; // stays 'waiting' until online
  try {
    const { ctx, pms } = await context(h);
    const x = await svc.extract({ kind: 'image', source: e.source as 'screenshot' | 'receipt', dataUrl: e.pendingImage }, ctx);
    const updated = await applyExtraction(e, h, x, pms);
    await db.expenses.put({ ...updated, processing: undefined });
  } catch (err) {
    console.warn(err);
    await db.expenses.update(id, { processing: 'failed' });
  }
}

export async function processAllPending() {
  const waiting = await db.expenses.where('processing').equals('waiting').toArray();
  for (const e of waiting) await processPending(e.id);
}

/** Voice / typed sentence: parsed on-device first, refined by AI only if available and unsure. */
export async function captureText(h: Holiday, text: string): Promise<string> {
  const { ctx, pms } = await context(h);
  const p = parseExpenseText(text, { home: h.homeCurrency, travel: h.currencies, paymentMethods: pms });
  let x: ExtractedExpense = {
    merchant: p.merchant, amount: p.amount, currency: p.currency, date: p.date, description: p.description,
    category: p.category, paymentMethod: pms.find(pm => pm.id === p.paymentMethodId)?.name, confidence: p.confidence
  };
  const svc = await getExtractionService();
  if (p.confidence < 0.75 && svc.info.id === 'anthropic' && svc.canProcessNow('text')) {
    try { const ai = await svc.extract({ kind: 'text', source: 'voice', text }, ctx); if (ai.confidence > p.confidence) x = { ...x, ...Object.fromEntries(Object.entries(ai).filter(([, v]) => v !== undefined)) } as ExtractedExpense; } catch { /* keep offline parse */ }
  }
  const e = await applyExtraction({ ...blank(h, 'voice'), description: text }, h, x, pms);
  if (!x.description) e.description = text;
  await db.expenses.add(e);
  return e.id;
}

export function newManualExpense(h: Holiday): Expense { return { ...blank(h, 'manual'), status: 'inbox' }; }

/** Possible duplicate already recorded (same amount + currency within a day). */
export async function findDuplicate(e: Expense): Promise<Expense | undefined> {
  if (!e.amount) return undefined;
  const list = await db.expenses.where('holidayId').equals(e.holidayId).toArray();
  return list.find(o => o.id !== e.id && o.currency === e.currency && Math.abs(o.amount - e.amount) < 0.005 && Math.abs(new Date(o.date).getTime() - new Date(e.date).getTime()) <= 86400000);
}

export async function confirmExpense(e: Expense) {
  const h = await db.holidays.get(e.holidayId);
  let next: Expense = { ...e, status: 'confirmed', processing: undefined, pendingImage: undefined };
  if (h && next.estHome === undefined && next.actualHome === undefined) next = await withEstimate(next, h);
  await db.expenses.put(next);
  if (next.merchant) await learnFromConfirmation(next.merchant, next.category, next.paymentMethodId);
}
