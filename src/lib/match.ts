import { daysBetween } from './dates';
import { merchantKey } from './categorise';

export interface MatchableExpense { id: string; date: string; amount: number; currency: string; estHome?: number; merchant: string; paymentMethodName?: string }
export interface MatchableTxn { id: string; date: string; amount: number; description: string; foreignAmount?: number; foreignCurrency?: string; isFee: boolean }

const WALLET_WORDS = ['alipay', 'wechat', 'tenpay', 'weixin'];

function merchantScore(e: MatchableExpense, t: MatchableTxn) {
  const desc = t.description.toLowerCase();
  const pm = (e.paymentMethodName ?? '').toLowerCase();
  const w = WALLET_WORDS.find(x => desc.includes(x));
  if (w && (pm.includes(w) || ((w === 'tenpay' || w === 'weixin') && pm.includes('wechat')))) return 0.8;
  const words = merchantKey(e.merchant).split(' ').filter(w => w.length > 2);
  if (!words.length) return 0;
  const hit = words.filter(w => desc.includes(w)).length;
  return hit / words.length;
}

/** 0..1 confidence that a statement transaction is the card charge for a captured expense. */
export function scoreMatch(e: MatchableExpense, t: MatchableTxn, home: string): number {
  if (t.isFee) return 0;
  const d = Math.abs(daysBetween(e.date, t.date));
  if (d > 3) return 0;
  let amt = 0;
  if (t.foreignAmount !== undefined && t.foreignCurrency === e.currency) {
    amt = Math.abs(t.foreignAmount - e.amount) <= Math.max(0.01, e.amount * 0.005) ? 1 : 0;
  } else if (e.currency === home) {
    amt = Math.abs(t.amount - e.amount) < 0.011 ? 1 : 0;
  } else if (e.estHome) {
    const r = Math.abs(t.amount - e.estHome) / e.estHome;
    amt = r <= 0.02 ? 0.95 : r <= 0.05 ? 0.75 : r <= 0.1 ? 0.45 : 0;
  }
  if (amt === 0) return 0;
  const dateScore = [1, 0.7, 0.45, 0.25][d];
  return Math.min(1, amt * 0.6 + dateScore * 0.25 + merchantScore(e, t) * 0.15);
}

export interface MatchResult { txnId: string; expenseId: string; score: number }

/** Greedy one-to-one assignment, best scores first. Each expense and transaction is used at most once. */
export function findMatches(expenses: MatchableExpense[], txns: MatchableTxn[], home: string, min = 0.5): MatchResult[] {
  const pairs: MatchResult[] = [];
  for (const t of txns) for (const e of expenses) {
    const score = scoreMatch(e, t, home);
    if (score >= min) pairs.push({ txnId: t.id, expenseId: e.id, score });
  }
  pairs.sort((a, b) => b.score - a.score);
  const usedT = new Set<string>(), usedE = new Set<string>(); const out: MatchResult[] = [];
  for (const p of pairs) {
    if (usedT.has(p.txnId) || usedE.has(p.expenseId)) continue;
    usedT.add(p.txnId); usedE.add(p.expenseId); out.push(p);
  }
  return out;
}

export const STRONG_MATCH = 0.85;
