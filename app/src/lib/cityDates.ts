import type { Accommodation, Holiday } from './types';

const norm = (s: string) => s.trim().toLowerCase();
const same = (a: string, b: string) => norm(a).includes(norm(b)) || norm(b).includes(norm(a));

/** Dates for one city: the legs set on the trip first, then the hotel bookings there, else the whole trip. */
export function cityRange(h: Holiday, stays: Accommodation[], city: string) {
  const leg = h.cityDates?.[city];
  const mine = stays.filter(a => !a.layover && a.city && same(a.city, city));
  if (leg?.from && leg.to && leg.to > leg.from) return { from: leg.from, to: leg.to, dated: true, mine };
  if (mine.length) return { from: mine.map(a => a.checkIn).sort()[0], to: mine.map(a => a.checkOut).sort().slice(-1)[0], dated: true, mine };
  return { from: h.start, to: h.end, dated: false, mine };
}

/** Splits the trip's nights across cities in order (checkout of one city = check-in of the next). */
export function splitEvenly(start: string, end: string, cities: string[]): Record<string, { from: string; to: string }> {
  const day = 86400000, t0 = Date.parse(start + 'T00:00:00Z'), total = Math.round((Date.parse(end + 'T00:00:00Z') - t0) / day);
  const out: Record<string, { from: string; to: string }> = {};
  if (!cities.length || total < 1) return out;
  const base = Math.floor(total / cities.length); let extra = total % cities.length; let cur = 0;
  const iso = (n: number) => new Date(t0 + n * day).toISOString().slice(0, 10);
  for (const c of cities) { const n = base + (extra-- > 0 ? 1 : 0); out[c] = { from: iso(cur), to: iso(cur + n) }; cur += n; }
  return out;
}
