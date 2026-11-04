import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { fmtDate } from '../lib/dates';
import { fmtMoney } from '../lib/money';
import { cancelDaysLeft, cheaperFound, dueRechecks, saving } from '../lib/priceWatch';
import type { Holiday } from '../lib/types';

/** Reminders to recheck hotel prices while free cancellation is still open, and any cheaper price found. */
export function PriceWatchBanner({ h }: { h: Holiday }) {
  const stays = useLiveQuery(() => db.accommodations.where('holidayId').equals(h.id).toArray(), [h.id], []);
  const cheaper = cheaperFound(stays);
  const due = dueRechecks(stays).filter(a => !cheaper.includes(a));
  if (!cheaper.length && !due.length) return null;
  const open = () => { try { sessionStorage.setItem('planSeg', 'bookings'); } catch { /* ignore */ } location.hash = `/trip/${h.id}/plan`; };
  const day = (d: string) => fmtDate(d, { day: 'numeric', month: 'short' });
  return <button className={"notice price-banner" + (cheaper.length ? " good" : "")} onClick={open}>
    {cheaper.map(a => <div key={a.id}><b>↓ {fmtMoney(saving(a)!, a.currency)} cheaper for {a.hotel}.</b> Rebook and cancel before {day(a.freeCancelUntil!)}.</div>)}
    {due.map(a => { const d = cancelDaysLeft(a)!; return <div key={a.id}><b>Recheck {a.hotel}:</b> free cancellation ends {d === 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`} ({day(a.freeCancelUntil!)}).</div>; })}
    <div className="tiny" style={{ marginTop: 4, opacity: .8 }}>Tap to open Bookings and log today's price.</div>
  </button>;
}
