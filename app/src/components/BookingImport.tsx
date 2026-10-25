import { useRef, useState } from 'react';
import { db, uid } from '../lib/db';
import { addAttachments } from '../lib/attachments';
import { extractBookings, BookingReadUnavailable, type ExtractedBooking } from '../ai/booking';
import { newLeg } from './Booking';
import { newDraft } from '../screens/Trip';
import ExpenseEditor from '../screens/ExpenseEditor';
import { useUI } from './ui';
import type { Accommodation, Expense, Holiday } from '../lib/types';

type Item = { kind: 'expense'; e: Expense } | { kind: 'stay'; a: Accommodation };

/**
 * "Add from confirmation": the user picks a booking PDF or screenshot, AI reads it, and each booking found
 * opens in its editor already filled in, with the file attached. Nothing is saved until the user confirms.
 */
export function BookingImport({ h, renderStay }: { h: Holiday; renderStay: (a: Accommodation, note: string, onClose: () => void) => JSX.Element }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<Item[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const { toast } = useUI();

  async function onFile(file?: File) {
    if (input.current) input.current.value = '';
    if (!file) return;
    setError(''); setBusy(true);
    try {
      const found = await extractBookings(file, { tripStart: h.start, tripEnd: h.end, homeCurrency: h.homeCurrency, travelCurrencies: h.currencies, destinations: h.destinations });
      if (!found.length) { setError("Couldn't find flight, car hire or hotel details in that file. Add the booking by hand below and attach the file to it."); return; }
      // Make sure any new currency is available on the trip.
      const extra = [...new Set(found.map(b => b.currency).filter((c): c is string => !!c && c !== h.homeCurrency && !h.currencies.includes(c)))];
      if (extra.length) await db.holidays.update(h.id, { currencies: [...h.currencies, ...extra] });
      const items = found.map(b => toItem(b, h));
      for (const it of items) await addAttachments(h.id, it.kind === 'expense' ? it.e.id : it.a.id, [file]);
      const low = found.some(b => b.confidence < 0.7);
      setNote(`Filled in from ${file.name}${items.length > 1 ? ` (${items.length} bookings found, one at a time)` : ''}. ${low ? 'Some details were unclear, so please check carefully.' : 'Check the details, then save.'} The file is attached.`);
      setQueue(items);
    } catch (e) {
      setError(e instanceof BookingReadUnavailable ? e.message : "Couldn't read that file right now. Try again, or add the booking by hand and attach the file.");
    } finally { setBusy(false); }
  }

  const next = () => setQueue(q => { const rest = q.slice(1); if (!rest.length) toast('Done'); return rest; });
  const cur = queue[0];

  return <>
    <button className="btn block import-booking" disabled={busy} onClick={() => input.current?.click()}>
      {busy ? 'Reading booking…' : '✨ Add from a booking'}
    </button>
    <p className="tiny muted" style={{ margin: '6px 4px 0' }}>Pick a PDF, email screenshot or photo. Flights, car hire and hotels are filled in for you to check, and the file is attached.</p>
    <input ref={input} type="file" accept="application/pdf,.pdf,image/*" hidden aria-label="Booking confirmation file" onChange={e => onFile(e.target.files?.[0])} />
    {error && <div className="notice warn small">{error}</div>}
    {cur?.kind === 'expense' && <ExpenseEditor key={cur.e.id} target={cur.e} confirmOnSave note={note} onClose={next} />}
    {cur?.kind === 'stay' && renderStay(cur.a, note, next)}
  </>;
}

function toItem(b: ExtractedBooking, h: Holiday): Item {
  const cur = b.currency ?? h.homeCurrency;
  if (b.kind === 'hotel') {
    const checkIn = b.checkIn ?? h.start;
    const checkOut = b.checkOut && b.checkOut > checkIn ? b.checkOut : new Date(Date.parse(checkIn) + 86400000).toISOString().slice(0, 10);
    return { kind: 'stay', a: { id: uid(), holidayId: h.id, hotel: b.name ?? '', city: b.city ?? '', address: b.address, checkIn, checkInTime: b.checkInTime, checkOut, checkOutTime: b.checkOutTime, total: b.total ?? 0, currency: cur, source: b.source, bookingRef: b.bookingRef, layover: false, paid: b.paid ?? false, createdAt: Date.now() } };
  }
  const base = { ...newDraft(h), source: 'booking' as const, merchant: b.name ?? '', amount: b.total ?? 0, currency: cur, bookingRef: b.bookingRef, confidence: b.confidence };
  if (b.kind === 'car') return { kind: 'expense', e: { ...base, category: 'Car hire', date: b.pickupDate ?? h.start, endDate: b.dropoffDate, pickupTime: b.pickupTime, pickupPlace: b.pickupPlace, dropoffTime: b.dropoffTime, dropoffPlace: b.dropoffPlace } };
  return { kind: 'expense', e: { ...base, category: 'Flights', date: b.paidDate ?? base.date, legs: b.legs.map((l, i) => ({ ...newLeg(l.label ?? (i === 0 ? 'Departure' : 'Flight'), l.departDate), from: l.from, to: l.to, flightNo: l.flightNo, departTime: l.departTime, arriveDate: l.arriveDate, arriveTime: l.arriveTime })) } };
}
