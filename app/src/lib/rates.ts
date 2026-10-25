import { db } from './db';
import { round2 } from './money';
import type { Expense, Holiday } from './types';

const pair = (from: string, to: string) => `${from}>${to}`;
const STALE_MS = 12 * 3600 * 1000;

/** Fetch current rates for home<-travel currencies. Only called when online. Returns true if updated. */
export async function refreshRates(home: string, currencies: string[]): Promise<boolean> {
  if (!navigator.onLine || !currencies.length) return false;
  const sources = [
    async () => { const r = await fetch(`https://open.er-api.com/v6/latest/${home}`); const j = await r.json(); if (j.result !== 'success') throw 0; return j.rates as Record<string, number>; },
    async () => { const r = await fetch(`https://api.frankfurter.app/latest?from=${home}`); const j = await r.json(); return j.rates as Record<string, number>; }
  ];
  for (const src of sources) {
    try {
      const rates = await src();
      const now = Date.now();
      const rows = currencies.filter(c => c !== home && rates[c]).map(c => ({ pair: pair(c, home), rate: 1 / rates[c], updatedAt: now, source: 'online' as const }));
      if (rows.length) { await db.rates.bulkPut(rows); return true; }
    } catch { /* try next */ }
  }
  return false;
}

export async function getRate(from: string, to: string, allowFetch = true) {
  if (from === to) return { rate: 1, source: 'same' as const };
  let r = await db.rates.get(pair(from, to));
  if (allowFetch && (!r || (r.source === 'online' && Date.now() - r.updatedAt > STALE_MS)) && navigator.onLine) {
    await refreshRates(to, [from]);
    const fresh = await db.rates.get(pair(from, to));
    if (fresh && fresh.updatedAt !== r?.updatedAt) return { rate: fresh.rate, source: 'online' as const };
  }
  if (r) return { rate: r.rate, source: r.source === 'manual' ? 'manual' as const : 'saved' as const };
  return undefined;
}

export async function setManualRate(from: string, to: string, rate: number) {
  await db.rates.put({ pair: pair(from, to), rate, updatedAt: Date.now(), source: 'manual' });
}

/** Fill in the home-currency estimate. Never touches the original amount. */
export async function withEstimate(e: Expense, h: Holiday, allowFetch = true): Promise<Expense> {
  if (!e.amount && e.amount !== 0) return e;
  const r = await getRate(e.currency, h.homeCurrency, allowFetch);
  if (!r) return { ...e, estHome: undefined, rate: undefined, rateSource: undefined };
  return { ...e, rate: r.rate, rateSource: r.source, estHome: round2(e.amount * r.rate) };
}

/** Give estimates to confirmed/inbox expenses that have none (e.g. captured offline before any rate was saved). */
export async function fillMissingEstimates(h: Holiday) {
  const list = await db.expenses.where('holidayId').equals(h.id).filter(e => e.estHome === undefined && e.actualHome === undefined).toArray();
  for (const e of list) { const u = await withEstimate(e, h, false); if (u.estHome !== undefined) await db.expenses.put(u); }
  return list.length;
}
