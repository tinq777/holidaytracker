import type { Accommodation } from './types';
import { daysBetween, todayISO } from './dates';

/** The most recent price check, if any. */
export const latestCheck = (a: Accommodation) => (a.priceChecks ?? []).slice().sort((x, y) => y.at - x.at)[0];

/** How much less the latest check is than what was booked (same currency only). Positive = cheaper now. */
export function saving(a: Accommodation): number | undefined {
  const c = latestCheck(a);
  if (!c || !a.total || c.currency !== a.currency) return undefined;
  return Math.round((a.total - c.total) * 100) / 100;
}

/** Days until free cancellation ends (0 = today is the last day); undefined if not set or already passed. */
export function cancelDaysLeft(a: Accommodation, today = todayISO()): number | undefined {
  if (!a.freeCancelUntil || a.freeCancelUntil < today) return undefined;
  return daysBetween(today, a.freeCancelUntil);
}

/**
 * Stays worth rechecking now: free cancellation still open, ending within `window` days,
 * and not checked in the last 3 days. Soonest deadline first.
 */
export function dueRechecks(stays: Accommodation[], today = todayISO(), window = 21): Accommodation[] {
  const threeDays = 3 * 86400000;
  return stays.filter(a => {
    const d = cancelDaysLeft(a, today);
    if (d === undefined || d > window) return false;
    const c = latestCheck(a);
    return !c || Date.now() - c.at > threeDays;
  }).sort((x, y) => x.freeCancelUntil!.localeCompare(y.freeCancelUntil!));
}

/** Stays where a cheaper price has been found and it's still free to cancel. */
export const cheaperFound = (stays: Accommodation[], today = todayISO()) =>
  stays.filter(a => (saving(a) ?? 0) > 0 && cancelDaysLeft(a, today) !== undefined);
