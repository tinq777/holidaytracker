import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { dailySummaries, homeCost, isBooked, tripStats, type TripStats } from '../lib/calc';
import { fmtDate, fmtLongDay, fmtRange, todayISO } from '../lib/dates';
import { fmtMoney } from '../lib/money';
import { useExpenses, useHoliday, usePaymentMethods } from '../lib/hooks';
import { confirmExpense } from '../lib/capture';
import { BudgetBar, CatDot, Header, Icon, Money, Sheet, Field, go, numOr, useUI } from '../components/ui';
import { useApp } from '../App';
import type { Expense, Holiday, PaymentMethod } from '../lib/types';
import Plan from './Plan';
import Review from './Review';

type Tab = 'overview' | 'expenses' | 'plan' | 'review';

export default function Trip({ id, tab }: { id: string; tab: Tab }) {
  const h = useHoliday(id);
  const expenses = useExpenses(id);
  if (h === undefined) return null;
  if (h === null || !h) return <div className="empty"><b>Holiday not found</b><button className="btn" onClick={() => go('/')}>Back to holidays</button></div>;
  const confirmed = expenses.filter(e => e.status === 'confirmed');
  const s = tripStats(h, confirmed);
  const t: Tab = ['overview', 'expenses', 'plan', 'review'].includes(tab) ? tab : 'overview';
  return <>
    <Header title={h.name} back="/" right={<button className="btn ghost" onClick={() => go(`/trip/${h.id}/edit`)}>Edit</button>} />
    <div className="muted small" style={{ textAlign: 'center', marginTop: -8 }}>{h.destinations.join(', ')}{h.destinations.length ? ' · ' : ''}{fmtRange(h.start, h.end)}</div>
    <div className="tabs">
      <div className="seg" role="tablist">
        {(['overview', 'expenses', 'plan', 'review'] as Tab[]).map(k => <button key={k} role="tab" aria-selected={t === k} className={t === k ? 'on' : ''} onClick={() => go(`/trip/${h.id}/${k}`)}>{k[0].toUpperCase() + k.slice(1)}</button>)}
      </div>
    </div>
    {t === 'overview' && <Overview h={h} s={s} expenses={expenses} />}
    {t === 'expenses' && <Expenses h={h} s={s} expenses={expenses} />}
    {t === 'plan' && <Plan h={h} />}
    {t === 'review' && <Review h={h} s={s} expenses={confirmed} />}
  </>;
}

function statusLine(h: Holiday, s: TripStats) {
  const c = h.homeCurrency;
  if (s.spent > h.budget) return { cls: 'over', text: `Over budget by ${fmtMoney(s.spent - h.budget, c)}` };
  if (s.projectedTotal !== null && s.phase === 'current' && s.projectedTotal > h.budget) return { cls: 'over', text: `Heading ${fmtMoney(s.projectedTotal - h.budget, c)} over` };
  if (s.status === 'watch') return { cls: 'watch', text: 'Close to budget' };
  if (s.phase === 'past') return { cls: 'ok', text: `${fmtMoney(h.budget - s.spent, c)} under budget` };
  return { cls: 'ok', text: 'On track' };
}

function Overview({ h, s, expenses }: { h: Holiday; s: TripStats; expenses: Expense[] }) {
  const { openCapture } = useApp();
  const [editBudgets, setEditBudgets] = useState(false);
  const lessons = useLiveQuery(() => db.lessons.where('holidayId').equals(h.id).count(), [h.id], 0);
  const inbox = expenses.filter(e => e.status === 'inbox').length;
  const c = h.homeCurrency; const st = statusLine(h, s);
  const today = dailySummaries(expenses.filter(e => e.status === 'confirmed')).find(d => d.date === todayISO());
  const cats = h.categories.filter(k => s.byCategory[k] || h.categoryBudgets[k]).concat(h.categories.filter(k => !s.byCategory[k] && !h.categoryBudgets[k]));

  return <>
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div className="big-answer">Spent<span className="amt">{fmtMoney(s.spent, c)}</span>of {fmtMoney(h.budget, c)} budget</div>
        <span className={'status-pill ' + st.cls}>{st.text}</span>
      </div>
      <div style={{ margin: '14px 0 8px' }}><BudgetBar spent={s.spent} budget={h.budget} projected={s.phase === 'current' ? s.projectedTotal : null} status={s.status} /></div>
      <div className="small" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span className={s.remaining < 0 ? 'bad' : 'muted'}>{s.remaining < 0 ? `${fmtMoney(-s.remaining, c)} over` : `${fmtMoney(s.remaining, c)} remaining`}</span>
        {s.phase === 'current' && s.projectedTotal !== null && <span className="muted">Striped: projected</span>}
      </div>
    </div>

    <div className="section" style={{ marginTop: 12 }}>
      <button className="btn capture" onClick={() => openCapture(h)}><Icon name="plus" size={24} stroke={2.6} />Capture expense</button>
      {inbox > 0 && <button className="notice info row" style={{ marginTop: 10 }} onClick={() => go(`/trip/${h.id}/expenses`)}>
        <span className="grow"><b>{inbox} expense{inbox > 1 ? 's' : ''} to confirm</b><div className="sub">Not counted in the budget until confirmed</div></span><Icon name="chev" size={18} /></button>}
    </div>

    {s.phase === 'past' && lessons === 0 && <button className="notice row" onClick={() => go(`/trip/${h.id}/review`)}>
      <span className="grow"><b>Trip finished. What did you learn?</b><div className="sub">Add a few lessons and they'll remind you next time.</div></span><Icon name="chev" size={18} /></button>}

    <div className="grid2" style={{ marginTop: 12 }}>
      <div className="stat"><small>{s.phase === 'upcoming' ? 'Days until departure' : 'Days remaining'}</small><b>{s.phase === 'upcoming' ? s.daysUntil : s.remainingDays}</b> <span className="muted small">{s.phase !== 'upcoming' && `of ${s.totalDays}`}</span></div>
      <div className="stat"><small>Average per day</small><b>{s.avgPerDay === null ? '—' : fmtMoney(s.avgPerDay, c)}</b><div className="tiny muted">excl. flights & hotels</div></div>
      <div className="stat"><small>Projected total</small><b>{s.projectedTotal === null ? '—' : fmtMoney(s.projectedTotal, c)}</b><div className="tiny muted">{s.phase === 'upcoming' ? 'starts on day 1' : s.phase === 'past' ? 'final' : 'estimate'}</div></div>
      <div className="stat"><small>Daily budget</small><b>{fmtMoney(s.dailyBudget, c)}</b><div className="tiny muted">{h.dailyBudget ? 'set by you' : 'after flights & hotels'}</div></div>
    </div>

    {s.phase === 'current' && <div className="section">
      <div className="section-head"><h3>Today</h3><span className="aside">{fmtLongDay(todayISO())}</span></div>
      <DayCard h={h} total={today?.total ?? 0} byCategory={today?.byCategory ?? {}} daily={s.dailyBudget} />
    </div>}

    {s.projectedTotal !== null && s.phase === 'current' && <p className="small muted" style={{ margin: '10px 4px' }}>
      Projection: {fmtMoney(s.spent, c)} spent + {fmtMoney(s.avgPerDay ?? 0, c)}/day × {s.remainingDays} days left = about {fmtMoney(s.projectedTotal, c)}. It's an estimate.</p>}

    <div className="section">
      <div className="section-head"><h3>Categories</h3><button className="btn ghost sm" onClick={() => setEditBudgets(true)}>Edit budgets</button></div>
      <div className="group">
        {cats.map(k => {
          const spent = s.byCategory[k] ?? 0; const b = h.categoryBudgets[k];
          return <div className="row" key={k} style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <CatDot cat={k} />
              <div className="grow"><div className="title" style={{ fontWeight: 550 }}>{k}</div></div>
              <div className="end"><Money v={spent} c={c} className="title" />{b ? <div className="sub">{spent > b ? <span className="bad">{fmtMoney(spent - b, c)} over</span> : `${fmtMoney(b - spent, c)} left of ${fmtMoney(b, c)}`}</div> : null}</div>
            </div>
            {b ? <BudgetBar spent={spent} budget={b} status={spent > b ? 'over' : spent > b * 0.9 ? 'watch' : 'ok'} thin /> : null}
          </div>;
        })}
      </div>
    </div>
    {s.estimatedShare > 0.02 && <p className="small muted" style={{ margin: '10px 4px' }}>About {Math.round(s.estimatedShare * 100)}% of this total uses estimated exchange rates. Import your card statement to replace estimates with actual charges and fees.</p>}
    {s.unconverted > 0 && <div className="notice">{s.unconverted} expense{s.unconverted > 1 ? 's have' : ' has'} no exchange rate yet and count as $0. Set a rate in More → Exchange rates.</div>}
    {editBudgets && <BudgetEditor h={h} onClose={() => setEditBudgets(false)} />}
  </>;
}

export function DayCard({ h, total, byCategory, daily }: { h: Holiday; total: number; byCategory: Record<string, number>; daily: number }) {
  const c = h.homeCurrency; const diff = daily - total;
  return <div className="card">
    {Object.keys(byCategory).length === 0 && <div className="muted">Nothing recorded yet today.</div>}
    {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span>{k}</span><Money v={v} c={c} /></div>)}
    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 8, fontWeight: 700 }}><span>Total</span><Money v={total} c={c} /></div>
    <div className="small" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
      <span className="muted">Budget {fmtMoney(daily, c)}/day</span>
      <span className={diff >= 0 ? 'good' : 'bad'}>{fmtMoney(Math.abs(diff), c)} {diff >= 0 ? 'under' : 'over'} daily budget</span>
    </div>
  </div>;
}

function BudgetEditor({ h, onClose }: { h: Holiday; onClose: () => void }) {
  const [total, setTotal] = useState(String(h.budget || ''));
  const [daily, setDaily] = useState(h.dailyBudget ? String(h.dailyBudget) : '');
  const [cats, setCats] = useState<Record<string, string>>(Object.fromEntries(h.categories.map(k => [k, h.categoryBudgets[k] ? String(h.categoryBudgets[k]) : ''])));
  const [newCat, setNewCat] = useState('');
  const { toast } = useUI();
  const sumCats = Object.values(cats).reduce((t, v) => t + (numOr(v) ?? 0), 0);
  async function save() {
    const categoryBudgets = Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, numOr(v)]).filter(([, v]) => v)) as Record<string, number>;
    await db.holidays.update(h.id, { budget: numOr(total) ?? 0, dailyBudget: numOr(daily), categoryBudgets, categories: Object.keys(cats) });
    toast('Budgets saved'); onClose();
  }
  return <Sheet title="Budgets" onClose={onClose} action={<button className="btn ghost" onClick={save}>Save</button>}>
    <Field label={`Overall budget (${h.homeCurrency})`}><input className="input num" inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} /></Field>
    <Field label="Daily spending budget (optional)"><input className="input num" inputMode="decimal" value={daily} placeholder="Worked out automatically" onChange={e => setDaily(e.target.value)} /></Field>
    <div className="section-head" style={{ marginTop: 18 }}><h3 style={{ fontSize: 17 }}>Category budgets</h3><span className="aside num">{fmtMoney(sumCats, h.homeCurrency)} allocated</span></div>
    <div className="group">
      {Object.keys(cats).map(k => <div className="row" key={k} style={{ cursor: 'default' }}>
        <CatDot cat={k} /><span className="grow">{k}</span>
        <input className="input num" style={{ width: 120, minHeight: 40, textAlign: 'right' }} inputMode="decimal" placeholder="—" value={cats[k]} onChange={e => setCats({ ...cats, [k]: e.target.value })} aria-label={`${k} budget`} />
      </div>)}
    </div>
    <div className="inline" style={{ marginTop: 12 }}>
      <input className="input" placeholder="Custom category" value={newCat} onChange={e => setNewCat(e.target.value)} />
      <button className="btn" style={{ flex: '0 0 auto' }} onClick={() => { const n = newCat.trim(); if (n && !(n in cats)) setCats({ ...cats, [n]: '' }); setNewCat(''); }}>Add</button>
    </div>
  </Sheet>;
}

/* ---------------- Expenses tab ---------------- */

export function ExpenseRow({ e, h, pms, selectable, selected, onSelect }: { e: Expense; h: Holiday; pms: PaymentMethod[]; selectable?: boolean; selected?: boolean; onSelect?: () => void }) {
  const { openExpense } = useApp();
  const pm = pms.find(p => p.id === e.paymentMethodId)?.name;
  const waiting = e.processing === 'waiting'; const failed = e.processing === 'failed';
  const needs = !e.amount;
  const low = e.status === 'inbox' && (e.confidence ?? 1) < 0.7;
  const title = e.merchant || (waiting ? 'Reading…' : needs ? 'Needs details' : e.description || 'Expense');
  return <div className="row" onClick={() => openExpense(e.id)} role="button" tabIndex={0} onKeyDown={k => k.key === 'Enter' && openExpense(e.id)}>
    {selectable && <button className={'check' + (selected ? ' on' : '')} disabled={needs || waiting} aria-label={selected ? 'Deselect' : 'Select'} onClick={ev => { ev.stopPropagation(); onSelect?.(); }}>{selected && <Icon name="check" size={16} stroke={3} />}</button>}
    {e.thumb ? <img className="thumb" src={e.thumb} alt="" /> : <CatDot cat={e.category} />}
    <div className="grow">
      <div className="title">{title}</div>
      <div className="sub">
        {waiting ? (navigator.onLine ? 'AI is reading this…' : 'Waiting for connection') : failed ? 'Could not read. Tap to fill in' : [e.category, pm].filter(Boolean).join(' · ')}
        {e.status === 'inbox' && !waiting && (needs ? <> <span className="pill bad">Fill in</span></> : low ? <> <span className="pill low">Check</span></> : null)}
        {e.status === 'confirmed' && isBooked(e.category) && <> <span className="pill">Booked</span></>}
        {e.statementTxnId && <> <span className="pill ok">Card ✓</span></>}
      </div>
    </div>
    <div className="end">
      {e.amount ? <Money v={e.amount} c={e.currency} className="title" /> : <span className="muted">—</span>}
      {e.currency !== h.homeCurrency && e.amount > 0 && <div className="sub num">{e.actualHome !== undefined ? '' : '≈'}{fmtMoney(homeCost(e), h.homeCurrency)}</div>}
    </div>
  </div>;
}

export function Expenses({ h, s, expenses }: { h: Holiday; s: TripStats; expenses: Expense[] }) {
  const { openCapture, openExpense } = useApp();
  const { toast } = useUI();
  const pms = usePaymentMethods();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [day, setDay] = useState<string | null>(null);
  const pendingTxns = useLiveQuery(() => db.statementTxns.where('holidayId').equals(h.id).filter(t => t.status === 'pending').count(), [h.id], 0);
  const inbox = expenses.filter(e => e.status === 'inbox').sort((a, b) => b.createdAt - a.createdAt);
  const ready = inbox.filter(e => e.amount > 0 && e.processing !== 'waiting');
  const confirmed = expenses.filter(e => e.status === 'confirmed');
  const byDate = useMemo(() => {
    const m = new Map<string, Expense[]>();
    confirmed.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).forEach(e => m.set(e.date, [...(m.get(e.date) ?? []), e]));
    return [...m.entries()];
  }, [confirmed]);
  const daily = dailySummaries(confirmed);

  async function batchConfirm() {
    const list = inbox.filter(e => sel.has(e.id));
    for (const e of list) await confirmExpense(e);
    setSel(new Set()); toast(`${list.length} expense${list.length > 1 ? 's' : ''} confirmed`);
  }
  const toggle = (id: string) => setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return <>
    <button className="btn capture" onClick={() => openCapture(h)}><Icon name="plus" size={24} stroke={2.6} />Capture expense</button>

    {inbox.length > 0 && <div className="section">
      <div className="section-head"><h3>To confirm</h3>
        {ready.length > 0 && <button className="btn ghost sm" onClick={() => setSel(sel.size ? new Set() : new Set(ready.filter(e => (e.confidence ?? 1) >= 0.7 || e.source === 'manual').map(e => e.id)))}>{sel.size ? 'Clear' : 'Select confident'}</button>}
      </div>
      <div className="group">{inbox.map(e => <ExpenseRow key={e.id} e={e} h={h} pms={pms} selectable selected={sel.has(e.id)} onSelect={() => toggle(e.id)} />)}</div>
      {sel.size > 0 && <button className="btn primary block" style={{ marginTop: 10 }} onClick={batchConfirm}><Icon name="check" />Confirm {sel.size}</button>}
      <p className="tiny muted" style={{ margin: '8px 4px 0' }}>Tap an expense to check or edit it. Items marked Check were read with low confidence.</p>
    </div>}

    <div className="section">
      <div className="btn-row">
        <button className="btn" onClick={() => go(`/trip/${h.id}/import`)}><Icon name="upload" size={20} />Import statement</button>
        <button className="btn" onClick={() => go(`/trip/${h.id}/reconcile`)}><Icon name="link" size={20} />Reconcile{pendingTxns > 0 && <span className="pill bad">{pendingTxns}</span>}</button>
      </div>
      <button className="btn ghost block" style={{ marginTop: 4 }} onClick={() => openExpense({ ...newDraft(h), category: 'Food' }, { confirmOnSave: true })}><Icon name="pen" size={18} />Type an expense manually</button>
    </div>

    {confirmed.length === 0 && inbox.length === 0 && <div className="empty"><b>No expenses yet</b>Capture a payment screenshot, photograph a receipt, or say what you spent.</div>}

    {byDate.map(([date, list]) => {
      const d = daily.find(x => x.date === date);
      const inTrip = date >= h.start && date <= h.end;
      const diff = s.dailyBudget - (d?.total ?? 0);
      return <div key={date}>
        <button className="day-head" style={{ width: 'calc(100% - 8px)', background: 'none', border: 0, cursor: inTrip ? 'pointer' : 'default', padding: 0 }} onClick={() => inTrip && setDay(date)}>
          <span>{inTrip ? fmtLongDay(date) : date < h.start ? `Before the trip · ${fmtDate(date)}` : `After the trip · ${fmtDate(date)}`}</span>
          {inTrip && d && <span className={diff >= 0 ? 'good' : 'bad'}>{fmtMoney(d.total, h.homeCurrency)}</span>}
        </button>
        <div className="group">{list.map(e => <ExpenseRow key={e.id} e={e} h={h} pms={pms} />)}</div>
      </div>;
    })}
    {day && (() => { const d = daily.find(x => x.date === day); return <Sheet title={fmtLongDay(day)} onClose={() => setDay(null)}>
      <DayCard h={h} total={d?.total ?? 0} byCategory={d?.byCategory ?? {}} daily={s.dailyBudget} />
      <p className="small muted">Flights and hotels are counted in the trip total, not in daily spending.</p>
    </Sheet>; })()}
  </>;
}

export function newDraft(h: Holiday): Expense {
  const t = todayISO();
  return { id: crypto.randomUUID?.() ?? String(Date.now()), holidayId: h.id, status: 'inbox', source: 'manual', merchant: '', amount: 0, currency: h.currencies[0] ?? h.homeCurrency, date: t >= h.start && t <= h.end ? t : h.start, category: 'Other', createdAt: Date.now() };
}
