import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from '../lib/db';
import { nights, homeCost } from '../lib/calc';
import { fmtDate, fmtRange, todayISO } from '../lib/dates';
import { fmtMoney } from '../lib/money';
import { saveAccommodation, deleteAccommodation } from '../lib/accommodation';
import { replaceList } from '../lib/checklists';
import { usePaymentMethods } from '../lib/hooks';
import { CatDot, Field, Icon, Money, Sheet, numOr, useUI } from '../components/ui';
import { LessonsReminder } from '../components/LessonsReminder';
import { useApp } from '../App';
import { newDraft } from './Trip';
import type { Accommodation, ChecklistItem, Holiday } from '../lib/types';

type Seg = 'bookings' | 'pretrip' | 'packing';

export default function Plan({ h }: { h: Holiday }) {
  const [seg, setSeg] = useState<Seg>(() => (sessionStorage.getItem('planSeg') as Seg) || 'bookings');
  const pick = (s: Seg) => { setSeg(s); try { sessionStorage.setItem('planSeg', s); } catch { /* ignore */ } };
  const toggleReviewed = (id: string) => {
    const r = h.reviewedLessonIds ?? [];
    db.holidays.update(h.id, { reviewedLessonIds: r.includes(id) ? r.filter(x => x !== id) : [...r, id] });
  };
  return <>
    <div className="seg" style={{ marginBottom: 6 }}>
      {([['bookings', 'Bookings'], ['pretrip', 'Before you go'], ['packing', 'Packing']] as [Seg, string][]).map(([k, l]) => <button key={k} className={seg === k ? 'on' : ''} onClick={() => pick(k)}>{l}</button>)}
    </div>
    {seg === 'bookings' && <Bookings h={h} />}
    {seg === 'pretrip' && <Checklist h={h} list="pretrip" />}
    {seg === 'packing' && <Checklist h={h} list="packing" />}
    <LessonsReminder excludeHolidayId={h.id} reviewed={h.reviewedLessonIds ?? []} onToggle={toggleReviewed} startOpen={false} />
  </>;
}

/* ---------- Flights + accommodation ---------- */
function Bookings({ h }: { h: Holiday }) {
  const { openExpense } = useApp();
  const stays = useLiveQuery(() => db.accommodations.where('holidayId').equals(h.id).sortBy('checkIn'), [h.id], []);
  const linked = useLiveQuery(() => db.expenses.where('holidayId').equals(h.id).filter(e => !!e.accommodationId).toArray(), [h.id], []);
  const flights = useLiveQuery(() => db.expenses.where('holidayId').equals(h.id).filter(e => e.category === 'Flights').sortBy('date'), [h.id], []);
  const [edit, setEdit] = useState<Accommodation | null>(null);
  const c = h.homeCurrency;
  const costOf = (a: Accommodation) => { const e = linked.find(x => x.accommodationId === a.id); return e ? homeCost(e) : a.homeAmount ?? 0; };
  const totalNights = stays.reduce((t, a) => t + nights(a.checkIn, a.checkOut), 0);
  const totalCost = stays.reduce((t, a) => t + costOf(a), 0);
  const layovers = stays.filter(a => a.layover);
  const layoverCost = layovers.reduce((t, a) => t + costOf(a), 0);
  const blank = (): Accommodation => ({ id: uid(), holidayId: h.id, hotel: '', city: '', checkIn: h.start, checkOut: h.start > h.end ? h.start : nextDay(h.start), total: 0, currency: h.currencies[0] ?? c, layover: false, createdAt: Date.now() });

  return <>
    <div className="section">
      <div className="section-head"><h3>Flights</h3><button className="btn ghost sm" onClick={() => openExpense({ ...newDraft(h), category: 'Flights', currency: c, date: todayISO() }, { confirmOnSave: true })}>+ Add flight</button></div>
      {flights.length === 0 ? <div className="card muted small">Add what you paid for flights so the budget reflects it.</div> :
        <div className="group">{flights.map(e => <button key={e.id} className="row" onClick={() => openExpense(e.id)}>
          <CatDot cat="Flights" /><div className="grow"><div className="title">{e.merchant || 'Flight'}</div><div className="sub">{e.description || fmtDate(e.date, { day: 'numeric', month: 'short', year: 'numeric' })}</div></div>
          <div className="end"><Money v={homeCost(e)} c={c} className="title" />{e.currency !== c && <div className="sub num">{fmtMoney(e.amount, e.currency)}</div>}</div></button>)}</div>}
    </div>

    <div className="section">
      <div className="section-head"><h3>Accommodation</h3><button className="btn ghost sm" onClick={() => setEdit(blank())}>+ Add stay</button></div>
      {stays.length > 0 && <div className="grid2" style={{ marginBottom: 10 }}>
        <div className="stat"><small>Total accommodation</small><b>{fmtMoney(totalCost, c)}</b><div className="tiny muted">{totalNights} night{totalNights === 1 ? '' : 's'}</div></div>
        <div className="stat"><small>Average per night</small><b>{fmtMoney(totalNights ? totalCost / totalNights : 0, c)}</b>{layovers.length > 0 && <div className="tiny warn">Layovers: {fmtMoney(layoverCost, c)}</div>}</div>
      </div>}
      {stays.length === 0 ? <div className="card muted small">Add each hotel to see cost per night, and flag layover stays so they stand out in the trip review.</div> :
        <div className="group">{stays.map(a => { const n = nights(a.checkIn, a.checkOut); const cost = costOf(a); return <button key={a.id} className="row" onClick={() => setEdit(a)}>
          <CatDot cat="Accommodation" />
          <div className="grow"><div className="title">{a.hotel}{a.layover && <> <span className="pill low">Layover</span></>}</div><div className="sub">{a.city ? a.city + ' · ' : ''}{fmtRange(a.checkIn, a.checkOut)}</div></div>
          <div className="end"><Money v={cost} c={c} className="title" /><div className="sub num">{n} night{n > 1 ? 's' : ''} · {fmtMoney(cost / n, c)}/night</div></div>
        </button>; })}</div>}
    </div>
    {edit && <StayEditor h={h} a={edit} onClose={() => setEdit(null)} />}
  </>;
}
const nextDay = (iso: string) => new Date(new Date(iso + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);

function StayEditor({ h, a, onClose }: { h: Holiday; a: Accommodation; onClose: () => void }) {
  const [s, setS] = useState(a); const [total, setTotal] = useState(a.total ? String(a.total) : ''); const [home, setHome] = useState(a.homeAmount ? String(a.homeAmount) : '');
  const pms = usePaymentMethods(); const { toast, confirm } = useUI();
  const exists = useLiveQuery(() => db.accommodations.get(a.id), [a.id]);
  const set = <K extends keyof Accommodation>(k: K, v: Accommodation[K]) => setS(p => ({ ...p, [k]: v }));
  const n = s.checkOut > s.checkIn ? nights(s.checkIn, s.checkOut) : 0;
  async function save() {
    if (!s.hotel.trim()) return toast('Add the hotel name');
    if (!n) return toast('Check-out must be after check-in');
    await saveAccommodation(h, { ...s, hotel: s.hotel.trim(), total: numOr(total) ?? 0, homeAmount: numOr(home) });
    toast('Stay saved'); onClose();
  }
  return <Sheet title={exists ? 'Stay' : 'Add stay'} onClose={onClose} action={<button className="btn ghost" onClick={save}>Save</button>}>
    <Field label="Hotel"><input className="input" value={s.hotel} onChange={e => set('hotel', e.target.value)} placeholder="Pullman Guangzhou Airport" autoFocus={!exists} /></Field>
    <Field label="City"><input className="input" value={s.city} onChange={e => set('city', e.target.value)} /></Field>
    <div className="inline">
      <Field label="Check-in"><input className="input" type="date" value={s.checkIn} onChange={e => set('checkIn', e.target.value)} /></Field>
      <Field label="Check-out"><input className="input" type="date" value={s.checkOut} min={s.checkIn} onChange={e => set('checkOut', e.target.value)} /></Field>
    </div>
    <div className="inline">
      <Field label="Total price"><input className="input num" inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} /></Field>
      <Field label="Currency"><select className="input" value={s.currency} onChange={e => set('currency', e.target.value)}>{[...new Set([...h.currencies, h.homeCurrency])].map(c => <option key={c}>{c}</option>)}</select></Field>
    </div>
    {s.currency !== h.homeCurrency && <Field label={`${h.homeCurrency} equivalent (optional; estimated if blank)`}><input className="input num" inputMode="decimal" value={home} onChange={e => setHome(e.target.value)} /></Field>}
    <Field label="Booking source"><input className="input" value={s.source ?? ''} placeholder="Trip.com, Booking.com, direct…" onChange={e => set('source', e.target.value)} /></Field>
    <Field label="Paid with"><select className="input" value={s.paymentMethodId ?? ''} onChange={e => set('paymentMethodId', e.target.value || undefined)}><option value="">—</option>{pms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
    <label className="switch"><span><b>Layover / transit stay</b><div className="small muted">Highlighted in the trip review</div></span><input type="checkbox" checked={s.layover} onChange={e => set('layover', e.target.checked)} /></label>
    {n > 0 && numOr(total) ? <div className="notice info num">{n} night{n > 1 ? 's' : ''} · {fmtMoney((numOr(total) ?? 0) / n, s.currency)} per night</div> : null}
    <button className="btn primary block" onClick={save}>Save stay</button>
    {exists && <><div className="spacer" /><button className="btn danger block" onClick={async () => { if (await confirm({ title: 'Delete this stay?', body: 'Its cost will be removed from the budget too.', ok: 'Delete', danger: true })) { await deleteAccommodation(a.id); onClose(); } }}>Delete stay</button></>}
  </Sheet>;
}

/* ---------- Checklists ---------- */
export function Checklist({ h, list }: { h: Holiday; list: ChecklistItem['list'] }) {
  const items = useLiveQuery(() => db.checklist.where('[holidayId+list]').equals([h.id, list]).sortBy('order'), [h.id, list], []);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<Record<string, string>>({});
  const [newGroup, setNewGroup] = useState('');
  const [picker, setPicker] = useState(false);
  const { toast, confirm } = useUI();
  const groups = [...new Set(items.map(i => i.group))];
  const done = items.filter(i => i.done).length;
  const maxOrder = items.reduce((m, i) => Math.max(m, i.order), 0);
  const add = async (group: string) => { const t = (adding[group] ?? '').trim(); if (!t) return; await db.checklist.add({ id: uid(), holidayId: h.id, list, group, text: t, done: false, order: maxOrder + 1 }); setAdding({ ...adding, [group]: '' }); };
  const saveTemplate = async () => {
    const name = prompt('Template name', `${h.name} ${list === 'packing' ? 'packing' : 'pre-trip'}`); if (!name) return;
    await db.templates.add({ id: uid(), name, list, items: items.map(i => ({ group: i.group, text: i.text })), createdAt: Date.now() }); toast('Template saved');
  };

  return <div className="section" style={{ marginTop: 14 }}>
    <div className="section-head">
      <h3>{list === 'packing' ? `${done} of ${items.length} packed` : `${done} of ${items.length} done`}</h3>
      <button className="btn ghost sm" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</button>
    </div>
    {items.length > 0 && <div style={{ marginBottom: 10 }}><div className="bar thin"><i style={{ width: `${(done / items.length) * 100}%` }} /></div></div>}
    {groups.map(g => <div key={g} style={{ marginBottom: 14 }}>
      <div className="day-head" style={{ marginTop: 6 }}>
        {editing ? <input className="input" style={{ minHeight: 38 }} defaultValue={g} aria-label="Group name" onBlur={e => { const v = e.target.value.trim(); if (v && v !== g) db.checklist.where('[holidayId+list]').equals([h.id, list]).filter(i => i.group === g).modify({ group: v }); }} /> : <span>{g}</span>}
        {!editing && <span>{items.filter(i => i.group === g && i.done).length}/{items.filter(i => i.group === g).length}</span>}
      </div>
      <div className="group">
        {items.filter(i => i.group === g).map(i => <div key={i.id} className={'checkitem' + (i.done && !editing ? ' done' : '')}>
          {editing ? <>
            <input className="input" style={{ minHeight: 40, flex: 1 }} defaultValue={i.text} aria-label="Item" onBlur={e => { const v = e.target.value.trim(); if (v && v !== i.text) db.checklist.update(i.id, { text: v }); }} />
            <button className="icon-btn" style={{ boxShadow: 'none', color: 'var(--bad)' }} aria-label={`Delete ${i.text}`} onClick={() => db.checklist.delete(i.id)}><Icon name="trash" size={20} /></button>
          </> : <>
            <button className={'check' + (i.done ? ' on' : '')} aria-label={i.done ? `Untick ${i.text}` : `Tick ${i.text}`} onClick={() => db.checklist.update(i.id, { done: !i.done })}>{i.done && <Icon name="check" size={16} stroke={3} />}</button>
            <span className="text" onClick={() => db.checklist.update(i.id, { done: !i.done })}>{i.text}</span>
          </>}
        </div>)}
        <div className="checkitem">
          <input className="input" style={{ minHeight: 40, flex: 1, border: 0, padding: '0 4px' }} placeholder="Add item" value={adding[g] ?? ''} onChange={e => setAdding({ ...adding, [g]: e.target.value })} onKeyDown={e => e.key === 'Enter' && add(g)} />
          {(adding[g] ?? '').trim() && <button className="btn sm primary" onClick={() => add(g)}>Add</button>}
        </div>
      </div>
    </div>)}
    <div className="inline">
      <input className="input" placeholder="New group, e.g. Beach" value={newGroup} onChange={e => setNewGroup(e.target.value)} />
      <button className="btn" style={{ flex: '0 0 auto' }} disabled={!newGroup.trim()} onClick={() => { setAdding({ ...adding, [newGroup.trim()]: '' }); db.checklist.add({ id: uid(), holidayId: h.id, list, group: newGroup.trim(), text: 'New item', done: false, order: maxOrder + 1 }); setNewGroup(''); }}>Add group</button>
    </div>
    <div className="btn-row" style={{ marginTop: 12 }}>
      <button className="btn sm" onClick={() => setPicker(true)}>Copy from…</button>
      <button className="btn sm" onClick={saveTemplate} disabled={!items.length}>Save as template</button>
      {done > 0 && <button className="btn sm" onClick={async () => { if (await confirm({ title: 'Untick everything?', ok: 'Untick all' })) db.checklist.where('[holidayId+list]').equals([h.id, list]).modify({ done: false }); }}>Reset</button>}
    </div>
    {picker && <SourcePicker h={h} list={list} onClose={() => setPicker(false)} />}
  </div>;
}

function SourcePicker({ h, list, onClose }: { h: Holiday; list: ChecklistItem['list']; onClose: () => void }) {
  const data = useLiveQuery(async () => {
    const templates = await db.templates.where('list').equals(list).toArray();
    const hs = (await db.holidays.toArray()).filter(x => x.id !== h.id);
    const prev = await Promise.all(hs.map(async x => ({ h: x, items: await db.checklist.where('[holidayId+list]').equals([x.id, list]).sortBy('order') })));
    return { templates, prev: prev.filter(p => p.items.length) };
  }, [h.id, list]);
  const { confirm, toast } = useUI();
  const use = async (name: string, items: { group: string; text: string }[]) => {
    if (await confirm({ title: `Replace this list with "${name}"?`, body: `${items.length} items. Ticks will be cleared.`, ok: 'Replace list' })) { await replaceList(h.id, list, items); toast('List copied'); onClose(); }
  };
  return <Sheet title="Copy a checklist" onClose={onClose}>
    {!data ? null : <>
      {data.templates.length > 0 && <><div className="day-head">Saved templates</div><div className="group">{data.templates.map(t => <button className="row" key={t.id} onClick={() => use(t.name, t.items)}><div className="grow"><div className="title">{t.name}</div><div className="sub">{t.items.length} items</div></div><Icon name="chev" size={18} /></button>)}</div></>}
      {data.prev.length > 0 && <><div className="day-head">From another holiday</div><div className="group">{data.prev.map(p => <button className="row" key={p.h.id} onClick={() => use(p.h.name, p.items)}><div className="grow"><div className="title">{p.h.name}</div><div className="sub">{p.items.length} items</div></div><Icon name="chev" size={18} /></button>)}</div></>}
      {!data.templates.length && !data.prev.length && <div className="empty">No templates or other holidays yet.</div>}
    </>}
  </Sheet>;
}
