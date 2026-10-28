import type { Accommodation, Holiday, TripLeg } from './types';

const norm = (s: string) => s.trim().toLowerCase();
export const sameCity = (a: string, b: string) => !!a && !!b && (norm(a).includes(norm(b)) || norm(b).includes(norm(a)));
const valid = (l: { from: string; to: string }) => !!l.from && !!l.to && l.to > l.from;

/** The trip's legs in date order. Converts the older per-city dates if that's all there is. */
export function tripLegs(h: Holiday): TripLeg[] {
  if (h.legs?.length) return [...h.legs].filter(l => l.city.trim()).sort((a, b) => (a.from || '9').localeCompare(b.from || '9'));
  if (h.cityDates) return h.destinations.filter(c => h.cityDates![c]).map(c => ({ id: c, city: c, ...h.cityDates![c] })).sort((a, b) => a.from.localeCompare(b.from));
  return [];
}

export interface Stop { id: string; city: string; from: string; to: string; dated: boolean; label: string; mine: Accommodation[] }

/**
 * Where you stay, in order. With legs: one stop per leg (a city can repeat). Without: one per city,
 * dated from the hotel bookings there, else the whole trip.
 */
export function tripStops(h: Holiday, stays: Accommodation[]): Stop[] {
  const legs = tripLegs(h);
  const fmt = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (legs.length) {
    const repeats = new Set(legs.map(l => norm(l.city)).filter((c, i, a) => a.indexOf(c) !== i));
    return legs.map(l => {
      const from = valid(l) ? l.from : h.start, to = valid(l) ? l.to : h.end;
      const mine = stays.filter(a => !a.layover && sameCity(a.city, l.city) && a.checkIn < to && a.checkOut > from);
      return { id: l.id, city: l.city, from, to, dated: valid(l), mine, label: repeats.has(norm(l.city)) && valid(l) ? `${l.city} · ${fmt(l.from)}` : l.city };
    });
  }
  const names = [...h.destinations];
  for (const a of stays) if (!a.layover && a.city && !names.some(n => norm(n) === norm(a.city))) names.push(a.city);
  return names.map(city => {
    const mine = stays.filter(a => !a.layover && sameCity(a.city, city));
    const from = mine.length ? mine.map(a => a.checkIn).sort()[0] : h.start;
    const to = mine.length ? mine.map(a => a.checkOut).sort().slice(-1)[0] : h.end;
    return { id: city, city, from, to, dated: mine.length > 0, mine, label: city };
  }).sort((a, b) => a.from.localeCompare(b.from));
}

/** All the time spent in one city (for Ideas): earliest arrival to last departure, plus each range as text. */
export function cityRange(h: Holiday, stays: Accommodation[], city: string) {
  const mineStops = tripStops(h, stays).filter(s => norm(s.city) === norm(city));
  if (!mineStops.length) return { from: h.start, to: h.end, dated: false, mine: [] as Accommodation[], ranges: [] as { from: string; to: string }[] };
  return {
    from: mineStops.map(s => s.from).sort()[0], to: mineStops.map(s => s.to).sort().slice(-1)[0],
    dated: mineStops.some(s => s.dated), mine: mineStops.flatMap(s => s.mine), ranges: mineStops.map(s => ({ from: s.from, to: s.to }))
  };
}

/** Splits the trip's nights across the legs in order (leaving one leg = arriving at the next). */
export function splitEvenly<T extends { city: string }>(start: string, end: string, legs: T[]): (T & { from: string; to: string })[] {
  const day = 86400000, t0 = Date.parse(start + 'T00:00:00Z'), total = Math.round((Date.parse(end + 'T00:00:00Z') - t0) / day);
  if (!legs.length || total < 1) return legs.map(l => ({ ...l, from: '', to: '' }));
  const base = Math.floor(total / legs.length); let extra = total % legs.length; let cur = 0;
  const iso = (n: number) => new Date(t0 + n * day).toISOString().slice(0, 10);
  return legs.map(l => { const n = base + (extra-- > 0 ? 1 : 0); const out = { ...l, from: iso(cur), to: iso(cur + n) }; cur += n; return out; });
}
