import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from '../lib/db';
import { nights, homeCost } from '../lib/calc';
import { fmtDate, todayISO } from '../lib/dates';
import { fmtMoney } from '../lib/money';
import { saveAccommodation, deleteAccommodation } from '../lib/accommodation';
import { replaceList } from '../lib/checklists';
import { usePaymentMethods } from '../lib/hooks';
import { CatDot, Field, Icon, Money, Sheet, numOr, useUI } from '../components/ui';
import { LessonsReminder } from '../components/LessonsReminder';
import { useApp } from '../App';
import { newDraft } from './Trip';
import type { Accommodation, ChecklistItem, Holiday } from '../lib/types';
import { Attachments, ClipCount, useAttachmentCount } from '../components/Attachments';
import { BookingLines, carLines, defaultLegs, legLines, stayLines } from '../components/Booking';
import { deleteAttachmentsFor } from '../lib/attachments';
import { BookingImport } from '../components/BookingImport';
import { BookingButtons } from '../components/BookingButtons';
import { ParkingNearby } from '../components/ParkingNearby';
import { cancelDaysLeft, latestCheck, saving } from '../lib/priceWatch';
import Ideas from './Ideas';

type Seg = 'bookings' | 'ideas' | 'pretrip' | 'packing';

export default function Plan({ h }: { h: Holiday }) {
  const [seg, setSeg] = useState<Seg>(() => { const v = sessionStorage.getItem('planSeg') as Seg; return ['bookings', 'ideas', 'pretrip', 'packing'].includes(v) ? v : 'bookings'; });
  const pick = (s: Seg) => { setSeg(s); try { sessionStorage.setItem('planSeg', s); } catch { /* ignore */ } };
  const toggleReviewed = (id: string) => {
    const r = h.reviewedLessonIds ?? [];
    db.holidays.update(h.id, { reviewedLessonIds: r.includes(id) ? r.filter(x => x !== id) : [...r, id] });
  };
  return <>
    <div className="seg scroll" style={{ marginBottom: 6 }}>
      {([['bookings', 'Bookings'], ['ideas', 'Ideas'], ['pretrip', 'Before you go'], ['packing', 'Packing']] as [Seg, string][]).map(([k, l]) => <button key={k} className={seg === k ? 'on' : ''} onClick={() => pick(k)}>{l}</button>)}
    </div>
    {seg === 'bookings' && <Bookings h={h} />}
    {seg === 'ideas' && <Ideas h={h} />}
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
  const cars = useLiveQuery(() => db.expenses.where('holidayId').equals(h.id).filter(e => e.category === 'Car hire').sortBy('date'), [h.id], []);
  const [edit, setEdit] = useState<Accommodation | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const clips = useAttachmentCount([...flights.map(e => e.id), ...cars.map(e => e.id), ...stays.map(a => a.id)]);
  const c = h.homeCurrency;
  const costOf = (a: Accommodation) => { const e = linked.find(x => x.accommodationId === a.id); return e ? homeCost(e) : a.homeAmount ?? 0; };
  const totalNights = stays.reduce((t, a) => t + nights(a.checkIn, a.checkOut), 0);
  const totalCost = stays.reduce((t, a) => t + costOf(a), 0);
  const layovers = stays.filter(a => a.layover);
  const layoverCost = layovers.reduce((t, a) => t + costOf(a), 0);
  const unpaidCost = stays.filter(a => a.paid === false).reduce((t, a) => t + costOf(a) * (1 - depositShare(a)), 0);
  const blank = (): Accommodation => ({ id: uid(), holidayId: h.id, hotel: '', city: '', checkIn: h.start, checkOut: h.start > h.end ? h.start : nextDay(h.start), total: 0, currency: h.currencies[0] ?? c, layover: false, paid: false, createdAt: Date.now() });

  return <>
    <div className="section">
      <BookingImport h={h} renderStay={(a, note, done) => <StayEditor h={h} a={a} note={note} onClose={done} />} />
    </div>

    <div className="section">
      <div className="section-head"><h3>Flights</h3><button className="btn ghost sm" onClick={() => openExpense({ ...newDraft(h), category: 'Flights', currency: c, date: todayISO(), legs: defaultLegs(h.start, h.end) }, { confirmOnSave: true })}>+ Add flight</button></div>
      {flights.length === 0 ? <div className="card muted small">Add what you paid for flights so the budget reflects it.</div> :
        <div className="group">{flights.map(e => <BookingRow key={e.id} cat="Flights" title={e.merchant || 'Flight'} clips={clips[e.id]} onClick={() => openExpense(e.id)}
          price={<><Money v={homeCost(e)} c={c} className="title" />{e.currency !== c && <div className="sub num">{fmtMoney(e.amount, e.currency)}</div>}</>}>
          {e.legs?.length ? <BookingLines lines={legLines(e.legs)} /> : <div className="sub">Paid {fmtDate(e.date, { day: 'numeric', month: 'short', year: 'numeric' })} · tap to add flight times</div>}
          {e.bookingRef && <div className="sub">Ref {e.bookingRef}</div>}
        </BookingRow>)}</div>}
    </div>

    <div className="section">
      <div className="section-head"><h3>Car hire</h3><button className="btn ghost sm" onClick={() => openExpense({ ...newDraft(h), category: 'Car hire', currency: c, date: h.start, endDate: h.end }, { confirmOnSave: true })}>+ Add car hire</button></div>
      {cars.length === 0 ? <div className="card muted small">Add the rental total here. Like flights and hotels, it's kept out of your daily spending. Log fuel, tolls and parking as Transport.</div> :
        <div className="group">{cars.map(e => { const d = e.endDate && e.endDate > e.date ? nights(e.date, e.endDate) : null; const cost = homeCost(e);
          return <BookingRow key={e.id} cat="Car hire" title={e.merchant || 'Car hire'} clips={clips[e.id]} onClick={() => openExpense(e.id)}
            price={<Money v={cost} c={c} className="title" />}>
            {d && <div className="sub num">{d} day{d === 1 ? '' : 's'} · {fmtMoney(cost / d, c)}/day</div>}
            <BookingLines lines={carLines(e)} />{e.bookingRef && <div className="sub">Ref {e.bookingRef}</div>}
          </BookingRow>; })}</div>}
    </div>

    <div className="section">
      <div className="section-head"><h3>Accommodation</h3><button className="btn ghost sm" onClick={() => setEdit(blank())}>+ Add stay</button></div>
      {stays.length > 0 && <div className="grid2" style={{ marginBottom: 10 }}>
        <div className="stat"><small>Total accommodation</small><b>{fmtMoney(totalCost, c)}</b><div className="tiny muted">{totalNights} night{totalNights === 1 ? '' : 's'}</div>{unpaidCost > 0 && <div className="tiny" style={{ color: 'var(--link)' }}>{fmtMoney(unpaidCost, c)} not paid yet</div>}</div>
        <div className="stat"><small>Average per night</small><b>{fmtMoney(totalNights ? totalCost / totalNights : 0, c)}</b>{layovers.length > 0 && <div className="tiny warn">Layovers: {fmtMoney(layoverCost, c)}</div>}</div>
      </div>}
      {stays.length === 0 ? <div className="card muted small">Add each hotel to see cost per night, and flag layover stays so they stand out in the trip review.</div> :
        <div className="group">{stays.map(a => { const n = nights(a.checkIn, a.checkOut); const cost = costOf(a);
          return <BookingRow key={a.id} cat="Accommodation" title={<>{a.hotel}{a.layover && <> <span className="pill low">Layover</span></>}</>} clips={clips[a.id]} onClick={() => setViewId(a.id)}
            price={<Money v={cost} c={c} className="title" />}>
            {a.paid === false && <div style={{ margin: '2px 0' }}><span className="pill unpaid">{payLabel(a)}</span></div>}
            <WatchLine a={a} />
            <div className="sub">{a.city ? a.city + ' · ' : ''}<span className="num">{n} night{n > 1 ? 's' : ''} · {fmtMoney(cost / n, c)}/night</span></div>
            <BookingLines lines={stayLines(a)} />{a.bookingRef && <div className="sub">Ref {a.bookingRef}</div>}
          </BookingRow>; })}</div>}
    </div>
    {viewId && !edit && <StayView h={h} id={viewId} onClose={() => setViewId(null)} onEdit={a => setEdit(a)} />}
    {edit && <StayEditor h={h} a={edit} onClose={() => setEdit(null)} />}
  </>;
}
const nextDay = (iso: string) => new Date(new Date(iso + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);

/** Booking card: icon, name and price on top, then dates and times across the full width. */
function BookingRow({ cat, title, price, clips, onClick, children }: { cat: string; title: ReactNode; price: ReactNode; clips?: number; onClick: () => void; children: ReactNode }) {
  return <button className="row booking-row" onClick={onClick}>
    <div className="booking-top"><CatDot cat={cat} /><div className="grow title">{title}<ClipCount n={clips} /></div><div className="end">{price}</div></div>
    <div className="booking-body">{children}</div>
  </button>;
}

/** Under a stay in Bookings: free-cancellation deadline and any cheaper price found. */
function WatchLine({ a }: { a: Accommodation }) {
  const d = cancelDaysLeft(a); const sv = saving(a);
  if (!a.freeCancelUntil) return null;
  const when = fmtDate(a.freeCancelUntil, { day: 'numeric', month: 'short' });
  if (d === undefined) return <div className="sub">Free cancellation ended {when}</div>;
  return <div className="watch-line">
    {sv && sv > 0 ? <span className="pill ok">↓ {fmtMoney(sv, a.currency)} cheaper found</span> : null}
    <span className={'pill' + (d <= 7 ? ' low' : '')}>Free cancel until {when}</span>
  </div>;
}

const SITES = ['Booking.com', 'Trip.com', 'Agoda', 'Google', 'Hotel direct', 'Other'];

/** Log today's price for the same room and dates; shows the difference from what you booked. */
function PriceWatch({ h, a, onChecks }: { h: Holiday; a: Accommodation; onChecks: (pc: Accommodation['priceChecks']) => void }) {
  const [price, setPrice] = useState(''); const [site, setSite] = useState(a.source && SITES.includes(a.source) ? a.source : 'Booking.com');
  const { toast } = useUI();
  const checks = (a.priceChecks ?? []).slice().sort((x, y) => y.at - x.at);
  const d = cancelDaysLeft(a); const sv = saving(a); const last = latestCheck(a);
  const kids = Array.from({ length: h.children }, (_, i) => h.childAges?.[i]);
  async function add() {
    const v = numOr(price); if (!v) return toast("Enter today's total price");
    const next = [{ id: uid(), at: Date.now(), total: v, currency: a.currency, site }, ...(a.priceChecks ?? [])].slice(0, 20);
    await db.accommodations.update(a.id, { priceChecks: next }); onChecks(next); setPrice('');
    const diff = a.total - v;
    toast(diff > 0 ? `${fmtMoney(diff, a.currency)} cheaper than you booked` : diff < 0 ? `${fmtMoney(-diff, a.currency)} more than you booked` : 'Same as you booked');
  }
  return <div className="card price-watch">
    <b>Price watch</b>
    <p className="tiny muted" style={{ margin: '2px 0 8px' }}>You booked {fmtMoney(a.total, a.currency)} for the stay{a.freeCancelUntil ? `, free cancellation until ${fmtDate(a.freeCancelUntil, { day: 'numeric', month: 'short' })}${d === undefined ? ' (passed)' : d === 0 ? ' (today)' : ` (${d} day${d === 1 ? '' : 's'} left)`}` : ''}. Check the same room and dates, then log the total here.</p>
    {sv !== undefined && last && <div className={'notice small ' + (sv > 0 ? 'good-notice' : 'soft')}>
      {sv > 0 ? <><b>↓ {fmtMoney(sv, a.currency)} cheaper</b> on {last.site} ({new Date(last.at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}).{d !== undefined ? ` Book the new rate first, then cancel this one before ${fmtDate(a.freeCancelUntil!, { day: 'numeric', month: 'short' })}.` : a.freeCancelUntil ? ' Free cancellation has ended, so check the cancellation fee first.' : ' Check your cancellation terms before rebooking.'}</>
        : sv < 0 ? <>Latest price is {fmtMoney(-sv, a.currency)} higher than you booked. Your booking is the better deal.</> : <>Same price as you booked.</>}
    </div>}
    <div className="site-row" style={{ marginBottom: 8 }}><BookingButtons small link={{ name: a.hotel, city: a.city, checkIn: a.checkIn, checkOut: a.checkOut, adults: h.adults, childAges: kids, rooms: h.adults + h.children > 4 ? 2 : 1, currency: a.currency }} /></div>
    <div className="inline">
      <Field label={`Today's total (${a.currency})`}><input className="input num" inputMode="decimal" value={price} placeholder={String(a.total)} onChange={e => setPrice(e.target.value)} /></Field>
      <Field label="Where"><select className="input" value={site} onChange={e => setSite(e.target.value)}>{SITES.map(x => <option key={x}>{x}</option>)}</select></Field>
    </div>
    <button className="btn block" onClick={add}>Log price</button>
    {checks.length > 0 && <div className="group" style={{ marginTop: 10 }}>{checks.slice(0, 5).map(c => { const diff = c.currency === a.currency ? a.total - c.total : 0;
      return <div key={c.id} className="row" style={{ cursor: 'default' }}><div className="grow"><div className="title">{fmtMoney(c.total, c.currency)}</div><div className="sub">{c.site} · {new Date(c.at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</div></div>
        <div className={'end small' + (diff > 0 ? ' good' : diff < 0 ? ' bad' : '')} style={{ fontWeight: 600 }}>{diff > 0 ? `↓ ${fmtMoney(diff, a.currency)}` : diff < 0 ? `↑ ${fmtMoney(-diff, a.currency)}` : 'Same'}</div></div>; })}</div>}
  </div>;
}

const depositShare = (a: Accommodation) => (a.paid === false && a.deposit && a.total > 0 ? Math.min(1, a.deposit / a.total) : 0);
const payLabel = (a: Accommodation) => (depositShare(a) > 0 ? `Deposit paid · ${fmtMoney(a.total - a.deposit!, a.currency)} to pay` : 'Not paid yet');

/** Read-only view of a stay. Edit opens the editor; price watch and files work right here. */
function StayView({ h, id, onClose, onEdit }: { h: Holiday; id: string; onClose: () => void; onEdit: (a: Accommodation) => void }) {
  const a = useLiveQuery(() => db.accommodations.get(id), [id]);
  const linked = useLiveQuery(() => db.expenses.where('accommodationId').equals(id).first(), [id]);
  const pms = usePaymentMethods();
  if (!a) return null;
  const n = nights(a.checkIn, a.checkOut);
  const pm = pms.find(p => p.id === a.paymentMethodId)?.name;
  const homeTotal = linked ? homeCost(linked) : a.homeAmount;
  const row = (label: string, value: ReactNode) => value ? <div className="view-row"><span>{label}</span><b>{value}</b></div> : null;
  return <Sheet title={a.hotel || 'Stay'} onClose={onClose} action={<button className="btn ghost" onClick={() => onEdit(a)}>Edit</button>}>
    <div className="card stay-view">
      <div className="view-head">
        <div className="small muted">{[a.city, a.source].filter(Boolean).join(' · ')}</div>
        <div className="view-pills">
          {a.layover && <span className="pill low">Layover</span>}
          <span className={'pill ' + (a.paid === false ? 'unpaid' : 'ok')}>{a.paid === false ? payLabel(a) : 'Paid'}</span>
        </div>
      </div>
      <BookingLines lines={stayLines(a)} />
      <div className="view-price">
        <b className="num">{fmtMoney(a.total, a.currency)}</b> <span className="muted small">for {n} night{n === 1 ? '' : 's'} · {fmtMoney(a.total / n, a.currency)}/night</span>
        {a.currency !== h.homeCurrency && homeTotal ? <div className="small muted num">≈ {fmtMoney(homeTotal, h.homeCurrency)} ({h.homeCurrency})</div> : null}
      </div>
      {a.paid === false && (a.deposit ?? 0) > 0 && row('Deposit paid', fmtMoney(a.deposit!, a.currency))}
      {a.paid === false && row('Still to pay', <>{fmtMoney(Math.max(0, a.total - (a.deposit ?? 0)), a.currency)}{a.balanceDue ? <span className="muted"> by {fmtDate(a.balanceDue, { day: 'numeric', month: 'short' })}</span> : null}</>)}
      {row('Free cancellation until', a.freeCancelUntil && fmtDate(a.freeCancelUntil, { day: 'numeric', month: 'short', year: 'numeric' }))}
      {row('Booking reference', a.bookingRef)}
      {row('Paid with', pm)}
      {a.address && <a className="view-row link" href={`https://maps.apple.com/?q=${encodeURIComponent(`${a.address}, ${a.city}`)}`} target="_blank" rel="noopener"><span>Address</span><b>{a.address}</b></a>}
    </div>
    <ParkingNearby a={a} />
    {a.total > 0 && <PriceWatch h={h} a={a} onChecks={() => {}} />}
    <Attachments holidayId={h.id} ownerId={a.id} label="Booking confirmation" />
    <button className="btn block" onClick={() => onEdit(a)}>Edit stay</button>
  </Sheet>;
}

export function StayEditor({ h, a, onClose: close, note }: { h: Holiday; a: Accommodation; onClose: () => void; note?: string }) {
  const onClose = async () => { if (!(await db.accommodations.get(a.id))) await deleteAttachmentsFor(a.id); close(); };
  const [s, setS] = useState(a); const [total, setTotal] = useState(a.total ? String(a.total) : ''); const [home, setHome] = useState(a.homeAmount ? String(a.homeAmount) : '');
  const [deposit, setDeposit] = useState(a.deposit ? String(a.deposit) : '');
  const [payMode, setPay] = useState<'full' | 'deposit' | 'none'>(a.paid !== false ? 'full' : a.deposit ? 'deposit' : 'none');
  const pms = usePaymentMethods(); const { toast, confirm } = useUI();
  const exists = useLiveQuery(() => db.accommodations.get(a.id), [a.id]);
  const set = <K extends keyof Accommodation>(k: K, v: Accommodation[K]) => setS(p => ({ ...p, [k]: v }));
  const n = s.checkOut > s.checkIn ? nights(s.checkIn, s.checkOut) : 0;
  async function save() {
    if (!s.hotel.trim()) return toast('Add the hotel name');
    if (!n) return toast('Check-out must be after check-in');
    const dep = payMode === 'deposit' ? numOr(deposit) : undefined;
    if (payMode === 'deposit' && !dep) return toast('Enter the deposit amount');
    if (dep && dep > (numOr(total) ?? 0)) return toast("Deposit can't be more than the total");
    await saveAccommodation(h, { ...s, hotel: s.hotel.trim(), total: numOr(total) ?? 0, homeAmount: numOr(home), paid: payMode === 'full', deposit: dep, balanceDue: payMode === 'deposit' ? s.balanceDue : undefined });
    toast('Stay saved'); onClose();
  }
  return <Sheet title={exists ? 'Edit stay' : 'Add stay'} onClose={onClose} action={<button className="btn ghost" onClick={save}>Save</button>}>
    {note && <div className="notice soft small">✨ {note}</div>}
    <Field label="Hotel"><input className="input" value={s.hotel} onChange={e => set('hotel', e.target.value)} placeholder="Pullman Guangzhou Airport" autoFocus={!exists} /></Field>
    <Field label="City"><input className="input" value={s.city} onChange={e => set('city', e.target.value)} /></Field>
    <Field label="Address"><input className="input" value={s.address ?? ''} placeholder="Optional, handy for taxis" onChange={e => set('address', e.target.value || undefined)} /></Field>
    <div className="section-label">Check-in</div>
    <div className="inline">
      <Field label="Date"><input className="input" type="date" value={s.checkIn} onChange={e => set('checkIn', e.target.value)} /></Field>
      <Field label="From"><input className="input" type="time" value={s.checkInTime ?? ''} onChange={e => set('checkInTime', e.target.value || undefined)} /></Field>
    </div>
    <div className="section-label">Check-out</div>
    <div className="inline">
      <Field label="Date"><input className="input" type="date" value={s.checkOut} min={s.checkIn} onChange={e => set('checkOut', e.target.value)} /></Field>
      <Field label="By"><input className="input" type="time" value={s.checkOutTime ?? ''} onChange={e => set('checkOutTime', e.target.value || undefined)} /></Field>
    </div>
    <div className="inline">
      <Field label="Total price"><input className="input num" inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} /></Field>
      <Field label="Currency"><select className="input" value={s.currency} onChange={e => set('currency', e.target.value)}>{[...new Set([...h.currencies, h.homeCurrency, s.currency])].map(c => <option key={c}>{c}</option>)}</select></Field>
    </div>
    {s.currency !== h.homeCurrency && <Field label={`${h.homeCurrency} equivalent (optional; estimated if blank)`}><input className="input num" inputMode="decimal" value={home} onChange={e => setHome(e.target.value)} /></Field>}
    <div className="inline">
      <Field label="Booking source"><input className="input" value={s.source ?? ''} placeholder="Trip.com, Booking.com…" onChange={e => set('source', e.target.value)} /></Field>
      <Field label="Booking reference"><input className="input" value={s.bookingRef ?? ''} placeholder="Optional" onChange={e => set('bookingRef', e.target.value || undefined)} /></Field>
    </div>
    <Field label="Free cancellation until" hint="Optional. The app reminds you to recheck prices before this date, while you can still cancel and rebook."><input className="input" type="date" value={s.freeCancelUntil ?? ''} max={s.checkIn} onChange={e => set('freeCancelUntil', e.target.value || undefined)} /></Field>
    <Field label="Paid with"><select className="input" value={s.paymentMethodId ?? ''} onChange={e => set('paymentMethodId', e.target.value || undefined)}><option value="">—</option>{pms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
    <div className="section-label">Payment</div>
    <div className="seg pay-seg">
      {(['full', 'deposit', 'none'] as const).map(k => <button key={k} type="button" className={payMode === k ? 'on' : ''} onClick={() => setPay(k)}>{k === 'full' ? 'Paid in full' : k === 'deposit' ? 'Deposit paid' : 'Not paid yet'}</button>)}
    </div>
    {payMode === 'deposit' && <div className="inline">
      <Field label={`Deposit paid (${s.currency})`}><input className="input num" inputMode="decimal" value={deposit} placeholder="0" onChange={e => setDeposit(e.target.value)} /></Field>
      <Field label="Balance due"><input className="input" type="date" value={s.balanceDue ?? ''} max={s.checkOut} onChange={e => set('balanceDue', e.target.value || undefined)} /></Field>
    </div>}
    <p className="small muted" style={{ margin: '4px 4px 12px' }}>{payMode === 'full' ? 'Counted as spent.' : payMode === 'deposit'
      ? (numOr(deposit) && numOr(total) ? `${fmtMoney(numOr(deposit)!, s.currency)} counted as spent, ${fmtMoney(Math.max(0, (numOr(total) ?? 0) - (numOr(deposit) ?? 0)), s.currency)} as still to pay.` : 'Enter the deposit; the rest is counted as still to pay.')
      : 'Not charged yet: counted as "still to pay", not spent.'}</p>
    <label className="switch"><span><b>Layover / transit stay</b><div className="small muted">Highlighted in the trip review</div></span><input type="checkbox" checked={s.layover} onChange={e => set('layover', e.target.checked)} /></label>
    {n > 0 && numOr(total) ? <div className="notice info num">{n} night{n > 1 ? 's' : ''} · {fmtMoney((numOr(total) ?? 0) / n, s.currency)} per night</div> : null}
    <Attachments holidayId={h.id} ownerId={a.id} label="Booking confirmation" />
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
