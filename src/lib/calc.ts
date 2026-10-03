import { BOOKED_CATEGORIES, type Expense, type Holiday } from './types';
import { daysBetween, todayISO } from './dates';
import { round2 } from './money';

/** True cost of an expense in home currency: actual charge if known, else estimate, plus any separate fee. */
export const homeCost = (e: Pick<Expense, 'actualHome' | 'estHome' | 'fee'>) => (e.actualHome ?? e.estHome ?? 0) + (e.fee ?? 0);
export const isBooked = (cat: string) => BOOKED_CATEGORIES.includes(cat);

export type Phase = 'upcoming' | 'current' | 'past';

export function tripPhase(h: Holiday, today = todayISO()): Phase {
  if (today < h.start) return 'upcoming';
  if (today > h.end) return 'past';
  return 'current';
}

export interface TripStats {
  phase: Phase;
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  daysUntil: number;
  spent: number;
  remaining: number;
  pct: number;
  bookedSpent: number;
  dayToDaySpent: number;
  avgPerDay: number | null;
  dailyBudget: number;
  projectedTotal: number | null;
  status: 'ok' | 'watch' | 'over';
  byCategory: Record<string, number>;
  unconverted: number;
  estimatedShare: number; // portion of spend that is estimated (no actual charge yet)
}

export function tripStats(h: Holiday, confirmed: Expense[], today = todayISO()): TripStats {
  const phase = tripPhase(h, today);
  const totalDays = Math.max(1, daysBetween(h.start, h.end) + 1);
  const elapsedDays = phase === 'upcoming' ? 0 : phase === 'past' ? totalDays : daysBetween(h.start, today) + 1;
  const remainingDays = totalDays - elapsedDays;
  const byCategory: Record<string, number> = {};
  let spent = 0, booked = 0, unconverted = 0, estimated = 0, dayToDayInTrip = 0;
  for (const e of confirmed) {
    const c = homeCost(e);
    if (e.estHome === undefined && e.actualHome === undefined) unconverted++;
    if (e.actualHome === undefined && e.currency !== h.homeCurrency) estimated += c;
    spent += c;
    byCategory[e.category] = (byCategory[e.category] ?? 0) + c;
    if (isBooked(e.category)) booked += c;
    else if (e.date >= h.start && e.date <= today) dayToDayInTrip += c;
  }
  const dayToDay = spent - booked;
  const bookedBudget = BOOKED_CATEGORIES.reduce((s, c) => s + (h.categoryBudgets[c] ?? 0), 0);
  const dailyBudget = h.dailyBudget ?? Math.max(0, (h.budget - Math.max(bookedBudget, booked)) / totalDays);
  const avgPerDay = elapsedDays > 0 ? dayToDayInTrip / elapsedDays : null;
  const projectedTotal = phase === 'past' ? spent : phase === 'current' && avgPerDay !== null ? spent + avgPerDay * remainingDays : null;
  const ref = projectedTotal ?? spent;
  const status = spent > h.budget || ref > h.budget ? 'over' : ref > h.budget * 0.95 ? 'watch' : 'ok';
  return {
    phase, totalDays, elapsedDays, remainingDays, daysUntil: Math.max(0, daysBetween(today, h.start)),
    spent: round2(spent), remaining: round2(h.budget - spent), pct: h.budget > 0 ? spent / h.budget : 0,
    bookedSpent: round2(booked), dayToDaySpent: round2(dayToDay), avgPerDay: avgPerDay === null ? null : round2(avgPerDay),
    dailyBudget: round2(dailyBudget), projectedTotal: projectedTotal === null ? null : round2(projectedTotal), status,
    byCategory, unconverted, estimatedShare: spent > 0 ? estimated / spent : 0
  };
}

export interface DaySummary { date: string; total: number; byCategory: Record<string, number>; count: number }

/** Day-to-day spending per date (booked categories such as flights and hotels are excluded). */
export function dailySummaries(confirmed: Expense[]): DaySummary[] {
  const map = new Map<string, DaySummary>();
  for (const e of confirmed) {
    if (isBooked(e.category)) continue;
    const d = map.get(e.date) ?? { date: e.date, total: 0, byCategory: {}, count: 0 };
    const c = homeCost(e);
    d.total += c; d.count++; d.byCategory[e.category] = (d.byCategory[e.category] ?? 0) + c;
    map.set(e.date, d);
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export const nights = (checkIn: string, checkOut: string) => Math.max(1, daysBetween(checkIn, checkOut));
