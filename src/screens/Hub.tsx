import { useState } from 'react';
import { tripPhase, tripStats } from '../lib/calc';
import { fmtMoney } from '../lib/money';
import { fmtRange } from '../lib/dates';
import { focusTrip, useExpenses, useHolidays } from '../lib/hooks';
import { Header, go } from '../components/ui';
import { Expenses } from './Trip';
import { Checklist } from './Plan';
import { useEffect } from 'react';
import { DEFAULT_LIST_ID, ensureDefaultLists } from '../lib/checklists';
import type { Holiday } from '../lib/types';

/** Which trip the Expenses / Checklist tabs show. Remembered for the session, defaults to the current or next trip. */
function usePickedTrip() {
  const hs = useHolidays();
  const [picked, setPicked] = useState<string | null>(() => { try { return sessionStorage.getItem('hubTrip'); } catch { return null; } });
  const pick = (id: string) => { setPicked(id); try { sessionStorage.setItem('hubTrip', id); } catch { /* ignore */ } };
  const h = hs?.find(x => x.id === picked) ?? (hs ? focusTrip(hs) : undefined);
  return { hs, h, pick, picked };
}

const phaseLabel = (h: Holiday) => ({ current: 'Now', upcoming: 'Upcoming', past: 'Past' })[tripPhase(h)];

function TripPicker({ hs, h, pick, extra }: { hs: Holiday[]; h: Holiday; pick: (id: string) => void; extra?: { id: string; label: string } }) {
  if (hs.length + (extra ? 1 : 0) < 2) return null;
  const order = [...hs].sort((a, b) => b.start.localeCompare(a.start));
  return <div className="trip-picker" role="tablist" aria-label="Choose trip">
    {order.map(x => <button key={x.id} role="tab" aria-selected={x.id === h.id} className={'chip' + (x.id === h.id ? ' on' : '')} onClick={() => pick(x.id)}>
      {x.name}<span className="phase">{phaseLabel(x)}</span>
    </button>)}
    {extra && <button role="tab" aria-selected={h.id === extra.id} className={'chip' + (h.id === extra.id ? ' on' : '')} onClick={() => pick(extra.id)}>{extra.label}</button>}
  </div>;
}

/** Stand-in "holiday" so the standing lists reuse the same checklist editor. */
const DEFAULT_LISTS = { id: DEFAULT_LIST_ID, name: 'My usual', destinations: [], start: '', end: '', homeCurrency: 'AUD', currencies: [], adults: 1, children: 0, budget: 0, categories: [], categoryBudgets: {}, createdAt: 0 } as Holiday;

function NoTrips({ what }: { what: string }) {
  return <div className="card empty"><b>No holidays yet</b>Create a holiday to start {what}.<div className="spacer" /><button className="btn primary block" onClick={() => go('/new')}>New holiday</button></div>;
}

export function AllExpenses() {
  const { hs, h, pick } = usePickedTrip();
  const expenses = useExpenses(h?.id);
  if (!hs) return null;
  return <>
    <Header large title="Expenses" />
    {!h ? <NoTrips what="tracking expenses" /> : <>
      <TripPicker hs={hs} h={h} pick={pick} />
      <ExpenseSummary h={h} expenses={expenses} />
      <Expenses h={h} s={tripStats(h, expenses.filter(e => e.status === 'confirmed'))} expenses={expenses} />
    </>}
  </>;
}

function ExpenseSummary({ h, expenses }: { h: Holiday; expenses: ReturnType<typeof useExpenses> }) {
  const s = tripStats(h, expenses.filter(e => e.status === 'confirmed'));
  return <button className="hub-summary" onClick={() => go(`/trip/${h.id}`)}>
    <div><div className="title">{h.name}</div><div className="sub">{fmtRange(h.start, h.end)}</div></div>
    <div className="end"><div className="title num">{fmtMoney(s.spent, h.homeCurrency)}</div><div className="sub num">of {fmtMoney(h.budget, h.homeCurrency)}</div></div>
  </button>;
}

export function Checklists() {
  const { hs, h: trip, pick, picked } = usePickedTrip();
  useEffect(() => { ensureDefaultLists(); }, []);
  const h = !trip || picked === DEFAULT_LIST_ID ? DEFAULT_LISTS : trip;
  const isDefault = h.id === DEFAULT_LIST_ID;
  const [list, setList] = useState<'pretrip' | 'packing'>(() => { try { return (sessionStorage.getItem('hubList') as 'pretrip' | 'packing') || 'packing'; } catch { return 'packing'; } });
  const choose = (l: 'pretrip' | 'packing') => { setList(l); try { sessionStorage.setItem('hubList', l); } catch { /* ignore */ } };
  if (!hs) return null;
  return <>
    <Header large title="Checklist" />
    <>
      <TripPicker hs={hs} h={h} pick={pick} extra={{ id: DEFAULT_LIST_ID, label: 'My usual lists' }} />
      <p className="small muted" style={{ margin: '0 4px 10px' }}>{isDefault
        ? <>Your standing lists. Every new holiday starts with a copy, so changes here carry into future trips.{hs.length === 0 && <> <a href="#/new">Create a holiday</a> to tick things off for a trip.</>}</>
        : <>{h.name} · {fmtRange(h.start, h.end)}. Changes here only affect this trip.</>}</p>
      <div className="seg">
        <button className={list === 'packing' ? 'on' : ''} onClick={() => choose('packing')}>Packing</button>
        <button className={list === 'pretrip' ? 'on' : ''} onClick={() => choose('pretrip')}>Before you go</button>
      </div>
      <Checklist key={h.id + list} h={h} list={list} />
    </>
  </>;
}
