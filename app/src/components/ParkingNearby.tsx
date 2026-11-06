import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting, setSetting } from '../lib/db';
import { findParking, type ParkingResult } from '../ai/parking';
import { HotelCheckUnavailable } from '../ai/hotel';
import { AIError } from '../ai/claude';
import { useOnline } from './ui';
import type { Accommodation } from '../lib/types';

/** Parking at and near a booked stay: map search buttons plus an AI check that's saved for offline. */
export function ParkingNearby({ a }: { a: Accommodation }) {
  const key = `parking|${a.id}`;
  const saved = useLiveQuery(() => getSetting<ParkingResult | null>(key, null), [key]);
  const car = useLiveQuery(() => db.expenses.where('holidayId').equals(a.holidayId).filter(e => e.category === 'Car hire' && e.date < a.checkOut && (e.endDate ?? e.date) >= a.checkIn).first(), [a.id, a.checkIn, a.checkOut]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const online = useOnline();
  const where = [a.hotel, a.address, a.city].filter(Boolean).join(', ');
  const google = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`parking near ${where}`)}`;
  const apple = `https://maps.apple.com/?q=${encodeURIComponent(`parking near ${where}`)}`;
  const spotMap = (name: string) => `https://maps.apple.com/?q=${encodeURIComponent(`${name}, ${a.city}`)}`;

  async function run() {
    setErr(''); setBusy(true);
    try {
      await setSetting(key, await findParking({ hotel: a.hotel, address: a.address, city: a.city, checkIn: a.checkIn, checkOut: a.checkOut, car: car?.merchant }));
    } catch (e) {
      setErr(e instanceof HotelCheckUnavailable || e instanceof AIError ? e.message : "Couldn't check parking right now. Try again in a moment.");
    } finally { setBusy(false); }
  }

  return <div className="card parking">
    <div className="section-head" style={{ margin: 0 }}>
      <b>Parking nearby</b>
      <button className="btn ghost sm" disabled={busy || !online} onClick={run}>{busy ? 'Checking…' : saved ? 'Refresh' : '✨ Check parking'}</button>
    </div>
    {car && <p className="small muted" style={{ margin: '4px 0 0' }}>You have a hire car on these dates.</p>}
    {err && <div className="notice warn small">{err}</div>}
    {!saved && !busy && <p className="small muted" style={{ margin: '6px 0 0' }}>Check whether the hotel has parking, the closest car parks with walk times and prices, and local tips.</p>}
    {busy && <p className="small muted" style={{ margin: '6px 0 0' }}>Looking up parking near {a.hotel}… this can take up to a minute.</p>}
    {saved && <>
      <div className="view-row"><span>At the hotel</span><b>{saved.hotel.onSite === 'yes' ? (saved.hotel.price || 'Yes') : saved.hotel.onSite === 'no' ? 'No parking' : 'Not sure'}</b></div>
      {saved.hotel.note && <p className="tiny muted" style={{ margin: '-4px 0 6px' }}>{saved.hotel.note}</p>}
      {saved.spots.length > 0 && <div className="group" style={{ marginTop: 6 }}>{saved.spots.map((p, n) => <a key={n} className="row idea" href={spotMap(p.name)} target="_blank" rel="noopener" style={{ color: 'inherit', textDecoration: 'none' }}>
        <div className="grow">
          <div className="title idea-name">{p.name}</div>
          {p.note && <div className="sub">{p.note}</div>}
          <div className="idea-meta">{[p.walk, p.price, p.type].filter(Boolean).join(' · ')}</div>
        </div>
      </a>)}</div>}
      {!saved.spots.length && <p className="small muted">No public car parks found close by.</p>}
      {saved.tips.length > 0 && <ul className="small parking-tips">{saved.tips.map((t, n) => <li key={n}>{t}</li>)}</ul>}
      <p className="tiny muted" style={{ margin: '6px 0 0' }}>{saved.source === 'demo' ? 'Demo results, not real car parks.' : `Checked ${new Date(saved.at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}${saved.source === 'ai' ? ' without web search' : ''}. Prices are approximate, so confirm before you park.`}</p>
    </>}
    <div className="site-grid" style={{ marginTop: 10 }}>
      <a className="btn" href={apple} target="_blank" rel="noopener">Apple Maps</a>
      <a className="btn" href={google} target="_blank" rel="noopener">Google Maps</a>
    </div>
  </div>;
}
