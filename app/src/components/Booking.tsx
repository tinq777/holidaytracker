import { uid } from '../lib/db';
import { fmtDayTime } from '../lib/dates';
import { Field } from './ui';
import type { Accommodation, Expense, FlightLeg } from '../lib/types';

export const newLeg = (label: string, date?: string): FlightLeg => ({ id: uid(), label, departDate: date });
export const defaultLegs = (start: string, end: string) => [newLeg('Departure', start), newLeg('Return', end)];

/** Departure / return / extra flights, each with its own from-to, times and flight number. */
export function FlightLegsEditor({ legs, onChange }: { legs: FlightLeg[]; onChange: (l: FlightLeg[]) => void }) {
  const up = (i: number, p: Partial<FlightLeg>) => onChange(legs.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const add = () => {
    const last = legs[legs.length - 1];
    onChange([...legs, newLeg(legs.length === 0 ? 'Departure' : legs.length === 1 ? 'Return' : 'Connection', last?.arriveDate ?? last?.departDate)]);
  };
  return <>
    {legs.map((l, i) => <div className="leg" key={l.id}>
      <div className="leg-head">
        <input className="input" value={l.label} aria-label="Flight label" onChange={e => up(i, { label: e.target.value })} />
        <button type="button" className="btn ghost sm" onClick={() => onChange(legs.filter((_, j) => j !== i))}>Remove</button>
      </div>
      <div className="inline">
        <Field label="From"><input className="input" value={l.from ?? ''} placeholder="SYD" onChange={e => up(i, { from: e.target.value || undefined })} /></Field>
        <Field label="To"><input className="input" value={l.to ?? ''} placeholder="PVG" onChange={e => up(i, { to: e.target.value || undefined })} /></Field>
      </div>
      <Field label="Flight number"><input className="input" value={l.flightNo ?? ''} placeholder="e.g. MU562" autoCapitalize="characters" onChange={e => up(i, { flightNo: e.target.value || undefined })} /></Field>
      <div className="inline">
        <Field label="Departs"><input className="input" type="date" value={l.departDate ?? ''} onChange={e => up(i, { departDate: e.target.value || undefined, arriveDate: l.arriveDate && e.target.value > l.arriveDate ? e.target.value : l.arriveDate })} /></Field>
        <Field label="Time"><input className="input" type="time" value={l.departTime ?? ''} onChange={e => up(i, { departTime: e.target.value || undefined })} /></Field>
      </div>
      <div className="inline">
        <Field label="Arrives"><input className="input" type="date" value={l.arriveDate ?? l.departDate ?? ''} min={l.departDate} onChange={e => up(i, { arriveDate: e.target.value || undefined })} /></Field>
        <Field label="Time"><input className="input" type="time" value={l.arriveTime ?? ''} onChange={e => up(i, { arriveTime: e.target.value || undefined })} /></Field>
      </div>
    </div>)}
    <button type="button" className="btn block" onClick={add}>{legs.length === 0 ? '+ Add flight times' : legs.length === 1 ? '+ Add return flight' : '+ Add another flight'}</button>
  </>;
}

export function CarFields({ f, set }: { f: Expense; set: <K extends keyof Expense>(k: K, v: Expense[K]) => void }) {
  return <>
    <div className="section-label">Pick-up</div>
    <div className="inline">
      <Field label="Date"><input className="input" type="date" value={f.date} onChange={e => set('date', e.target.value)} /></Field>
      <Field label="Time"><input className="input" type="time" value={f.pickupTime ?? ''} onChange={e => set('pickupTime', e.target.value || undefined)} /></Field>
    </div>
    <Field label="Location"><input className="input" value={f.pickupPlace ?? ''} placeholder="e.g. Beijing Capital Airport T3" onChange={e => set('pickupPlace', e.target.value || undefined)} /></Field>
    <div className="section-label">Drop-off</div>
    <div className="inline">
      <Field label="Date"><input className="input" type="date" value={f.endDate ?? ''} min={f.date} onChange={e => set('endDate', e.target.value || undefined)} /></Field>
      <Field label="Time"><input className="input" type="time" value={f.dropoffTime ?? ''} onChange={e => set('dropoffTime', e.target.value || undefined)} /></Field>
    </div>
    <Field label="Location"><input className="input" value={f.dropoffPlace ?? ''} placeholder="Same as pick-up if blank" onChange={e => set('dropoffPlace', e.target.value || undefined)} /></Field>
  </>;
}

/* ---------- Read-only summary lines for the Plan tab ---------- */
const route = (l: FlightLeg) => (l.from || l.to ? `${l.from || '?'} → ${l.to || '?'}` : '');

export function legLines(legs: FlightLeg[] = []) {
  return legs.map(l => {
    const arr = l.arriveTime || (l.arriveDate && l.arriveDate !== l.departDate)
      ? `arrives ${l.arriveDate && l.arriveDate !== l.departDate ? fmtDayTime(l.arriveDate, l.arriveTime) : fmtDayTime(undefined, l.arriveTime)}` : '';
    return { key: l.id, label: l.label, main: fmtDayTime(l.departDate, l.departTime), extra: [route(l), l.flightNo, arr].filter(Boolean).join(' · ') };
  });
}

export function carLines(e: Expense) {
  return [
    { key: 'p', label: 'Pick-up', main: fmtDayTime(e.date, e.pickupTime), extra: e.pickupPlace ?? '' },
    ...(e.endDate ? [{ key: 'd', label: 'Drop-off', main: fmtDayTime(e.endDate, e.dropoffTime), extra: e.dropoffPlace ?? '' }] : [])
  ];
}

export function stayLines(a: Accommodation) {
  return [
    { key: 'i', label: 'Check-in', main: fmtDayTime(a.checkIn, a.checkInTime), extra: '' },
    { key: 'o', label: 'Check-out', main: fmtDayTime(a.checkOut, a.checkOutTime), extra: '' }
  ];
}

export function BookingLines({ lines }: { lines: { key: string; label: string; main: string; extra: string }[] }) {
  if (!lines.length) return null;
  return <div className="booking-lines">{lines.map(l => <div key={l.key} className="bl"><b>{l.label}</b> {l.main}{l.extra && <> · {l.extra}</>}</div>)}</div>;
}
