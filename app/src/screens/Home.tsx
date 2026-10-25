import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { tripPhase, tripStats, type TripStats } from '../lib/calc';
import { fmtRange } from '../lib/dates';
import { fmtMoney } from '../lib/money';
import { loadSampleData } from '../lib/demo';
import { BudgetBar, Header, Icon, Money, go, useUI } from '../components/ui';
import { useApp } from '../App';
import type { Holiday } from '../lib/types';

function useAllStats() {
  return useLiveQuery(async () => {
    const hs = await db.holidays.orderBy('start').toArray();
    const ex = await db.expenses.where('status').equals('confirmed').toArray();
    return hs.map(h => ({ h, s: tripStats(h, ex.filter(e => e.holidayId === h.id)) }));
  }, [], undefined);
}

function Flap({ n }: { n: number }) {
  return <span className="flap" aria-hidden>{String(n).split('').map((d, i) => <span key={i}>{d}</span>)}</span>;
}

function Board({ h, s, first }: { h: Holiday; s: TripStats; first: boolean }) {
  const current = s.phase === 'current';
  const n = current ? s.elapsedDays : s.daysUntil;
  const label = current ? `of ${s.totalDays} days` : n === 1 ? 'day to go' : 'days to go';
  return (
    <button className="board" onClick={() => go(`/trip/${h.id}`)} aria-label={`${h.name}, ${current ? `day ${n} of ${s.totalDays}` : `${n} days to go`}`}>
      <span className={'tag' + (current || first ? '' : ' later')}>{current ? 'Now travelling' : first ? 'Next trip' : 'Upcoming'}</span>
      <div className="where">{h.destinations.join(', ') || 'Destination TBC'}</div>
      <div className="name">{h.name}</div>
      <div className="when">{fmtRange(h.start, h.end)} · {s.totalDays} day{s.totalDays === 1 ? '' : 's'}, {s.totalDays - 1} night{s.totalDays - 1 === 1 ? '' : 's'}</div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {current && <span className="flap-label" style={{ margin: '0 10px 0 0' }}>Day</span>}
        <Flap n={n} /><span className="flap-label">{label}</span>
      </div>
      <div className="stats">
        <div><b>{fmtMoney(s.spent, h.homeCurrency)}</b><small>spent</small></div>
        <div><b style={{ color: s.remaining < 0 ? '#FF9A8F' : undefined }}>{fmtMoney(s.remaining, h.homeCurrency)}</b><small>{s.remaining < 0 ? 'over budget' : 'left'}</small></div>
        <div><b>{fmtMoney(h.budget, h.homeCurrency)}</b><small>budget</small></div>
      </div>
      <div className="dark" style={{ marginTop: 12 }}><BudgetBar spent={s.spent} toPay={s.toPay} budget={h.budget} projected={s.projectedTotal} status={s.status} thin /></div>
      {s.toPay > 0 && <div className="board-topay">{fmtMoney(s.toPay, h.homeCurrency)} hotels still to pay · included in "left"</div>}
    </button>
  );
}

function TripRow({ h, s }: { h: Holiday; s: TripStats }) {
  const past = s.phase === 'past';
  return (
    <button className="row" onClick={() => go(`/trip/${h.id}`)} style={{ alignItems: 'stretch', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="grow">
          <div className="title">{h.name}</div>
          <div className="sub">{h.destinations.join(', ')}{h.destinations.length ? ' · ' : ''}{fmtRange(h.start, h.end)}</div>
        </div>
        <div className="end">
          <Money v={past ? s.committed : s.spent} c={h.homeCurrency} className="title" />
          <div className="sub">{past ? `of ${fmtMoney(h.budget, h.homeCurrency)}` : `${s.daysUntil} days to go`}</div>
        </div>
        <span className="chev"><Icon name="chev" size={18} /></span>
      </div>
      {!past && <>
        <BudgetBar spent={s.spent} toPay={s.toPay} budget={h.budget} status={s.status} thin />
        <div className="small muted" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Budget {fmtMoney(h.budget, h.homeCurrency)}</span><span>{fmtMoney(s.remaining, h.homeCurrency)} left</span>
        </div>
      </>}
    </button>
  );
}

export default function Home() {
  const all = useAllStats();
  const { openCapture } = useApp();
  const { toast } = useUI();
  if (!all) return null;
  const current = all.find(x => tripPhase(x.h) === 'current');
  const upcoming = all.filter(x => x.s.phase === 'upcoming');
  const past = all.filter(x => x.s.phase === 'past').reverse();
  // Large tiles for the current trip and the next upcoming ones (up to 3); any further trips are listed below.
  const BOARDS = 3;
  const heroes = [...(current ? [current] : []), ...upcoming].slice(0, BOARDS);
  const restUpcoming = upcoming.filter(x => !heroes.includes(x));
  const pastTotal = past.reduce((t, x) => t + x.s.committed, 0);

  return <>
    <Header large title="My holidays" />
    {all.length === 0 && <div className="card empty">
      <b>Plan your first holiday</b>
      Set a budget, then capture expenses with a screenshot, a photo or a quick sentence.
      <div className="spacer" />
      <button className="btn primary block" onClick={() => go('/new')}>New holiday</button>
      <div className="spacer" />
      <button className="btn block" onClick={async () => { await loadSampleData(); toast('Sample trips added'); }}>Explore with sample trips</button>
    </div>}

    {heroes.length > 0 && <div className="section boards" style={{ marginTop: 6 }}>
      {heroes.map((x, i) => <div key={x.h.id}>
        <Board h={x.h} s={x.s} first={i === 0} />
        {x === current && <div style={{ marginTop: 10 }}><button className="btn capture" onClick={() => openCapture(x.h)}><Icon name="plus" size={24} stroke={2.6} />Capture expense</button></div>}
      </div>)}
    </div>}

    {restUpcoming.length > 0 && <div className="section">
      <div className="section-head"><h3>Later trips</h3></div>
      <div className="group">{restUpcoming.map(x => <TripRow key={x.h.id} {...x} />)}</div>
    </div>}

    <div className="section"><button className="fab-new" onClick={() => go('/new')}>+ New holiday</button></div>

    {past.length > 0 && <div className="section">
      <div className="section-head"><h3>Past holidays</h3><span className="aside num">{fmtMoney(pastTotal, past[0].h.homeCurrency)} total</span></div>
      <div className="group">{past.map(x => <TripRow key={x.h.id} {...x} />)}</div>
      {past.length > 1 && <button className="btn ghost" style={{ marginTop: 6 }} onClick={() => go('/compare')}>Compare trips</button>}
    </div>}
  </>;
}
