export const todayISO = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
const toUTC = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const daysBetween = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / 86400000);
export const addDays = (iso: string, n: number) => new Date(toUTC(iso) + n * 86400000).toISOString().slice(0, 10);
export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  new Date(toUTC(iso)).toLocaleDateString('en-AU', { ...opts, timeZone: 'UTC' });
export const fmtLongDay = (iso: string) => fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtRange = (a: string, b: string) => {
  const sameYear = a.slice(0, 4) === b.slice(0, 4);
  return `${fmtDate(a, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmtDate(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
};
export const isISODate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(toUTC(s)) && new Date(toUTC(s)).toISOString().slice(0, 10) === s;
