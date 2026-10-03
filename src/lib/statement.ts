import { db, uid } from './db';
import { findMatches, type MatchResult } from './match';
import { txnFingerprint, type ParsedTxn } from './csv';
import { suggestCategory } from './learning';
import { titleCase } from './parseText';
import type { Expense, Holiday, StatementTxn } from './types';

async function matchables(h: Holiday) {
  const pms = await db.paymentMethods.toArray();
  const exps = await db.expenses.where('holidayId').equals(h.id)
    .filter(e => e.status === 'confirmed' && !e.statementTxnId && e.source !== 'import').toArray();
  return exps.map(e => ({ id: e.id, date: e.date, amount: e.amount, currency: e.currency, estHome: e.estHome, merchant: e.merchant, paymentMethodName: pms.find(p => p.id === e.paymentMethodId)?.name }));
}

export interface ImportPreview { fresh: (ParsedTxn & { fp: string })[]; alreadyImported: number; suggestions: (MatchResult & { tmpIndex: number })[] }

/** Preview without writing anything: which rows are new, and which look like expenses you already captured. */
export async function previewImport(h: Holiday, txns: ParsedTxn[]): Promise<ImportPreview> {
  const existing = new Set((await db.statementTxns.where('holidayId').equals(h.id).toArray()).map(t => t.fingerprint));
  const counts = new Map<string, number>(); const fresh: ImportPreview['fresh'] = []; let alreadyImported = 0;
  for (const t of txns) {
    const base = txnFingerprint(t); const n = counts.get(base) ?? 0; counts.set(base, n + 1);
    const fp = `${base}#${n}`; // identical lines on the same day are kept as separate charges
    if (existing.has(fp)) alreadyImported++; else fresh.push({ ...t, fp });
  }
  const ms = findMatches(await matchables(h), fresh.map((t, i) => ({ ...t, id: String(i) })), h.homeCurrency);
  return { fresh, alreadyImported, suggestions: ms.map(m => ({ ...m, tmpIndex: Number(m.txnId) })) };
}

/** Saves transactions as "statement lines" (never directly as expenses), linking confirmed matches. */
export async function commitImport(h: Holiday, preview: ImportPreview, acceptedMatchIdx: Set<number>) {
  const importId = uid(); const now = Date.now();
  const rows: StatementTxn[] = preview.fresh.map((t, i) => ({
    id: uid(), holidayId: h.id, importId, fingerprint: t.fp, date: t.date, description: t.description, amount: t.amount,
    foreignAmount: t.foreignAmount, foreignCurrency: t.foreignCurrency, isFee: t.isFee, status: 'pending', createdAt: now + i
  }));
  await db.transaction('rw', db.statementTxns, db.expenses, async () => {
    await db.statementTxns.bulkAdd(rows);
    for (const s of preview.suggestions) if (acceptedMatchIdx.has(s.tmpIndex)) await linkMatch(rows[s.tmpIndex].id, s.expenseId);
  });
  return rows.length;
}

/** Link a card charge to a captured expense: records the actual home-currency cost. Does not create a new expense. */
export async function linkMatch(txnId: string, expenseId: string) {
  const t = await db.statementTxns.get(txnId); if (!t) return;
  await db.expenses.update(expenseId, { actualHome: t.amount, statementTxnId: t.id });
  await db.statementTxns.update(txnId, { status: 'matched', expenseId });
}
export async function unlinkMatch(txnId: string) {
  const t = await db.statementTxns.get(txnId); if (!t) return;
  if (t.expenseId) await db.expenses.update(t.expenseId, { actualHome: undefined, statementTxnId: undefined });
  await db.statementTxns.update(txnId, { status: 'pending', expenseId: undefined });
}

export async function addTxnAsExpense(h: Holiday, txnId: string) {
  const t = await db.statementTxns.get(txnId); if (!t || t.expenseId) return;
  const merchant = titleCase(t.description.toLowerCase().replace(/\b(alipay|tenpay|wechat)\*?/g, '').replace(/[A-Z]{3}\s?\d[\d,.]*/gi, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 4).join(' ')) || 'Card transaction';
  const sug = await suggestCategory(merchant, t.description);
  const e: Expense = {
    id: uid(), holidayId: h.id, status: 'confirmed', source: 'import', merchant, description: t.description,
    amount: t.foreignAmount ?? t.amount, currency: t.foreignCurrency ?? h.homeCurrency, date: t.date,
    category: t.isFee ? 'Other' : (sug.category ?? 'Other'), actualHome: t.amount, estHome: t.amount,
    statementTxnId: t.id, createdAt: Date.now(), paymentMethodId: sug.paymentMethodId
  };
  await db.expenses.add(e);
  await db.statementTxns.update(txnId, { status: 'added', expenseId: e.id });
}

/** Attach an overseas-transaction-fee line to the expense it belongs to. */
export async function attachFee(txnId: string, expenseId: string) {
  const t = await db.statementTxns.get(txnId); const e = await db.expenses.get(expenseId); if (!t || !e) return;
  await db.expenses.update(expenseId, { fee: Math.round(((e.fee ?? 0) + t.amount) * 100) / 100 });
  await db.statementTxns.update(txnId, { status: 'fee-attached', expenseId });
}

export async function dismissTxn(txnId: string) { await db.statementTxns.update(txnId, { status: 'dismissed' }); }
export async function restoreTxn(txnId: string) { await db.statementTxns.update(txnId, { status: 'pending' }); }

/** Possible matches for still-pending lines, recomputed live. */
export async function pendingSuggestions(h: Holiday) {
  const pending = await db.statementTxns.where('holidayId').equals(h.id).filter(t => t.status === 'pending' && !t.isFee).toArray();
  const exps = await matchables(h);
  // respect "not a match" decisions by scoring each txn only against expenses it wasn't rejected for
  const out: MatchResult[] = []; const usedE = new Set<string>();
  const all = pending.flatMap(t => findMatches(exps.filter(e => !(t.rejectedExpenseIds ?? []).includes(e.id)), [t], h.homeCurrency, 0.45));
  all.sort((a, b) => b.score - a.score);
  for (const m of all) if (!usedE.has(m.expenseId)) { usedE.add(m.expenseId); out.push(m); }
  return out;
}

export async function rejectSuggestion(txnId: string, expenseId: string) {
  const t = await db.statementTxns.get(txnId); if (!t) return;
  await db.statementTxns.update(txnId, { rejectedExpenseIds: [...(t.rejectedExpenseIds ?? []), expenseId] });
}
