import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { tripPhase } from './calc';
import type { Holiday } from './types';

export const useHolidays = () => useLiveQuery(() => db.holidays.orderBy('start').toArray(), [], undefined);
export const useHoliday = (id?: string) => useLiveQuery(() => (id ? db.holidays.get(id) : undefined), [id]);
export const useExpenses = (holidayId?: string) => useLiveQuery(() => (holidayId ? db.expenses.where('holidayId').equals(holidayId).toArray() : []), [holidayId], []);
export const usePaymentMethods = () => useLiveQuery(() => db.paymentMethods.orderBy('order').toArray(), [], []);

/** The trip the Expenses / Checklist tabs should open: current, else next upcoming, else most recent. */
export function focusTrip(hs: Holiday[]): Holiday | undefined {
  return hs.find(h => tripPhase(h) === 'current') ?? hs.filter(h => tripPhase(h) === 'upcoming').sort((a, b) => a.start.localeCompare(b.start))[0] ?? [...hs].sort((a, b) => b.end.localeCompare(a.end))[0];
}
