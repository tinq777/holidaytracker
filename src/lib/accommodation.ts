import { db, uid } from './db';
import { withEstimate } from './rates';
import { nights } from './calc';
import type { Accommodation, Expense, Holiday } from './types';

/** Each stay is mirrored as one Accommodation expense so budgets have a single source of truth. */
export async function saveAccommodation(h: Holiday, a: Accommodation) {
  await db.accommodations.put(a);
  const existing = await db.expenses.where('accommodationId').equals(a.id).first();
  let e: Expense = {
    ...(existing ?? { id: uid(), holidayId: h.id, status: 'confirmed', source: 'accommodation', createdAt: Date.now() }),
    merchant: a.hotel, description: `${a.city}${a.city ? ' · ' : ''}${nights(a.checkIn, a.checkOut)} night${nights(a.checkIn, a.checkOut) > 1 ? 's' : ''}${a.layover ? ' (layover)' : ''}`,
    amount: a.total, currency: a.currency, date: a.checkIn, category: 'Accommodation', accommodationId: a.id, paymentMethodId: a.paymentMethodId
  } as Expense;
  if (a.currency === h.homeCurrency) e = { ...e, estHome: a.total, rate: 1, rateSource: 'same' };
  else if (a.homeAmount) e = { ...e, estHome: a.homeAmount, rate: a.homeAmount / a.total, rateSource: 'manual' };
  else e = await withEstimate(e, h);
  await db.expenses.put(e);
}

export async function deleteAccommodation(id: string) {
  await db.expenses.where('accommodationId').equals(id).delete();
  await db.accommodations.delete(id);
}

export const accommodationHome = (a: Accommodation, linked?: Expense) =>
  linked ? (linked.actualHome ?? linked.estHome ?? 0) + (linked.fee ?? 0) : a.homeAmount ?? 0;
