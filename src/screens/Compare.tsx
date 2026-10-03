import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { nights, tripStats } from '../lib/calc';
import { fmtDate } from '../lib/dates';
import { fmtMoney } from '../lib/money';
import { Header } from '../components/ui';

export default function Compare() {
  const [desc, setDesc] = useState(true);
  const data = useLiveQuery(async () => {
    const hs = await db.holidays.toArray(); const ex = await db.expenses.where('status').equals('confirmed').toArray(); const st = await db.accommodations.toArray();
    return hs.map(h => {
      const s = tripStats(h, ex.filter(e => e.holidayId === h.id));
      const n = st.filter(a => a.holidayId === h.id).reduce((t, a) => t + nights(a.checkIn, a.checkOut), 0);
      return { h, s, hotelNight: n ? (s.byCategory.Accommodation ?? 0) / n : undefined };
    });
  }, []);
  if (!data) return null;
  const rows = [...data].sort((a, b) => (desc ? b.h.start.localeCompare(a.h.start) : a.h.start.localeCompare(b.h.start)));
  const home = rows[0]?.h.homeCurrency ?? 'AUD';
  const m = (v?: number) => (v === undefined ? '—' : fmtMoney(v, home));
  const lines: [string, (r: typeof rows[0]) => string][] = [
    ['When', r => fmtDate(r.h.start, { month: 'short', year: 'numeric' })],
    ['Days', r => String(r.s.totalDays)],
    ['Travellers', r => `${r.h.adults + r.h.children}`],
    ['Total', r => m(r.s.spent)],
    ['Budget', r => m(r.h.budget)],
    ['Flights', r => m(r.s.byCategory.Flights ?? 0)],
    ['Hotels', r => m(r.s.byCategory.Accommodation ?? 0)],
    ['Hotel / night', r => m(r.hotelNight)],
    ['Food', r => m(r.s.byCategory.Food ?? 0)],
    ['Transport', r => m(r.s.byCategory.Transport ?? 0)],
    ['Activities', r => m(r.s.byCategory.Activities ?? 0)],
    ['Shopping', r => m(r.s.byCategory.Shopping ?? 0)],
    ['Daily average', r => m(r.s.dayToDaySpent / r.s.totalDays)],
    ['Per person / day', r => m(r.s.spent / r.s.totalDays / Math.max(1, r.h.adults + r.h.children))]
  ];
  return <>
    <Header title="Compare trips" back="/more" right={<button className="btn ghost sm" onClick={() => setDesc(!desc)}>{desc ? 'Newest first' : 'Oldest first'}</button>} />
    {rows.length < 2 ? <div className="empty"><b>Two trips needed</b>Comparison appears once you have at least two holidays.</div> :
      <div className="table-wrap"><table className="cmp">
        <thead><tr><th></th>{rows.map(r => <th key={r.h.id}>{r.h.name}</th>)}</tr></thead>
        <tbody>{lines.map(([label, f]) => <tr key={label}><td>{label}</td>{rows.map(r => <td key={r.h.id}>{f(r)}</td>)}</tr>)}</tbody>
      </table></div>}
    <p className="small muted" style={{ margin: '10px 4px' }}>Daily average excludes flights and hotels. Trips are listed by date, not ranked.</p>
  </>;
}
