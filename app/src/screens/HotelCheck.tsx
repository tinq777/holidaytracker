import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from '../lib/db';
import { fmtRange } from '../lib/dates';
import { fmtMoney } from '../lib/money';
import { nights as countNights } from '../lib/calc';
import { compressImage } from '../lib/images';
import { checkHotel, HotelCheckUnavailable } from '../ai/hotel';
import { Field, Sheet, useOnline, useUI } from '../components/ui';
import { useCities } from './Ideas';
import type { Accommodation, Holiday, HotelCandidate, HotelReport } from '../lib/types';

const VERDICT: Record<HotelReport['verdict'], { label: string; cls: string }> = {
  good: { label: 'Good pick', cls: 'ok' }, concerns: { label: 'Some concerns', cls: 'low' }, red: { label: 'Red flags', cls: 'bad' }
};

/**
 * Hotel check: research hotels on your shortlist against this trip (places that matter, dates, who's travelling),
 * compare them side by side, then turn the chosen one into a booking.
 */
export default function HotelCheck({ h, renderStay }: { h: Holiday; renderStay: (a: Accommodation, note: string, onClose: () => void) => JSX.Element }) {
  const cities = useCities(h);
  const [pick, setPick] = useState<string | null>(null);
  const city = cities.find(c => c.city === pick) ?? cities[0];
  const all = useLiveQuery(() => db.hotels.where('holidayId').equals(h.id).sortBy('createdAt'), [h.id], []);
  const [open, setOpen] = useState<HotelCandidate | null>(null);
  const [compare, setCompare] = useState(false);
  const [booking, setBooking] = useState<{ a: Accommodation; cand: HotelCandidate } | null>(null);
  if (!city) return <div className="card empty"><b>Add a destination first</b>Edit the trip to add the cities you're visiting.</div>;
  const list = all.filter(x => x.city === city.city);
  const done = list.filter(x => x.status === 'done' && x.report);
  const n = countNights(city.from, city.to);

  function book(c: HotelCandidate) {
    const r = c.report!; const per = r.pricePerNight ?? c.pricePerNight;
    setOpen(null);
    setBooking({ cand: c, a: { id: uid(), holidayId: h.id, hotel: r.name || c.name, city: city.city, address: r.address, checkIn: city.from, checkOut: city.to,
      total: per ? Math.round(per * n) : 0, currency: r.currency ?? c.currency ?? h.currencies[0] ?? h.homeCurrency, layover: false, paid: false, createdAt: Date.now() } });
  }

  return <>
    <p className="small muted" style={{ margin: '10px 4px 12px' }}>Shortlisting hotels? Check each one against your trip: travel times to the places that matter, value for money, whether it suits {h.children ? 'the family' : 'you'}, what reviewers keep saying, and any red flags.</p>
    {cities.length > 1 && <div className="trip-picker" role="tablist" aria-label="City">{cities.map(c =>
      <button key={c.city} role="tab" aria-selected={c.city === city.city} className={'chip' + (c.city === city.city ? ' on' : '')} onClick={() => setPick(c.city)}>{c.city}<span className="phase">{all.filter(x => x.city === c.city).length || ''}</span></button>)}</div>}
    <div className="small muted" style={{ margin: '0 4px 10px' }}>{city.city} · {fmtRange(city.from, city.to)} · {n} night{n === 1 ? '' : 's'}{!city.fromStays && ' (whole trip; add a hotel booking to set this city\'s dates)'}</div>

    <KeyPlaces h={h} city={city.city} />
    <CheckForm h={h} city={city.city} from={city.from} to={city.to} />

    {list.length > 0 && <div className="section">
      <div className="section-head"><h3>Shortlist</h3>{done.length >= 2 && <button className="btn ghost sm" onClick={() => setCompare(true)}>Compare {done.length}</button>}</div>
      <div className="group">{list.map(c => <CandidateRow key={c.id} c={c} onOpen={() => setOpen(c)} />)}</div>
    </div>}

    {open && <ReportSheet h={h} c={all.find(x => x.id === open.id) ?? open} onClose={() => setOpen(null)} onBook={book} />}
    {compare && <CompareSheet list={done} onClose={() => setCompare(false)} onOpen={c => { setCompare(false); setOpen(c); }} />}
    {booking && renderStay(booking.a, `Filled in from Hotel check. Price is ${n} night${n === 1 ? '' : 's'} × the nightly rate; adjust to what you actually paid.`, async () => {
      const saved = await db.accommodations.get(booking.a.id);
      if (saved) await db.hotels.update(booking.cand.id, { chosenStayId: saved.id });
      setBooking(null);
    })}
  </>;
}

/* ---------- Places that matter ---------- */
function useKeyPlaces(h: Holiday, city: string) {
  const ideas = useLiveQuery(() => db.ideas.get(`${h.id}|${city}`), [h.id, city]);
  const own = h.keyPlaces?.[city] ?? [];
  const starred = ideas ? [...ideas.see, ...ideas.events, ...(ideas.shop ?? [])].filter(x => x.starred).map(x => x.name) : [];
  const suggestions = ideas ? ideas.see.map(x => x.name).filter(n => !own.includes(n) && !starred.includes(n)).slice(0, 4) : [];
  return { own, starred, suggestions, all: [...new Set([...own, ...starred])] };
}

function KeyPlaces({ h, city }: { h: Holiday; city: string }) {
  const { own, starred, suggestions } = useKeyPlaces(h, city);
  const [text, setText] = useState('');
  const save = (list: string[]) => db.holidays.update(h.id, { keyPlaces: { ...(h.keyPlaces ?? {}), [city]: list } });
  const add = (p: string) => { const v = p.trim(); if (v && !own.includes(v)) save([...own, v]); setText(''); };
  return <div className="card" style={{ marginBottom: 12 }}>
    <b>Places that matter in {city}</b>
    <p className="tiny muted" style={{ margin: '2px 0 10px' }}>Theme parks, sights, the train station or airport you'll use. Each hotel is checked against these.</p>
    <div className="chips">
      {starred.map(p => <span key={p} className="chip home-chip">★ {p}</span>)}
      {own.map(p => <button key={p} className="chip on" onClick={() => save(own.filter(x => x !== p))}>{p} <span className="x">✕</span></button>)}
      {!starred.length && !own.length && <span className="small muted">None yet. Starred Ideas show up here too.</span>}
    </div>
    <div className="inline" style={{ marginTop: 10 }}>
      <input className="input" value={text} placeholder="e.g. Shanghai Disneyland" onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add(text))} />
      <button className="btn" style={{ flex: '0 0 auto' }} onClick={() => add(text)}>Add</button>
    </div>
    {suggestions.length > 0 && <div className="chips" style={{ marginTop: 8 }}>{suggestions.map(s => <button key={s} className="chip" onClick={() => add(s)}>+ {s}</button>)}</div>}
  </div>;
}

/* ---------- Check a hotel ---------- */
function CheckForm({ h, city, from, to }: { h: Holiday; city: string; from: string; to: string }) {
  const { all: places } = useKeyPlaces(h, city);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cur, setCur] = useState(h.currencies[0] ?? h.homeCurrency);
  const [shot, setShot] = useState<{ ai: string; thumb: string } | null>(null);
  const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const online = useOnline();
  const { toast } = useUI();

  async function onShot(f?: File) {
    if (file.current) file.current.value = '';
    if (!f) return;
    const [ai, thumb] = await Promise.all([compressImage(f, 1600, 0.8), compressImage(f, 220, 0.7)]);
    setShot({ ai: ai.split(',')[1], thumb });
  }

  async function run() {
    setErr('');
    const v = name.trim();
    if (!v && !shot) return setErr('Type the hotel name or paste its link, or add a screenshot of the listing.');
    const link = /^https?:\/\//i.test(v) ? v : undefined;
    const per = parseFloat(price) > 0 ? parseFloat(price) : undefined;
    const c: HotelCandidate = { id: uid(), holidayId: h.id, city, name: link ? '' : v, link, thumb: shot?.thumb, pricePerNight: per, currency: per ? cur : undefined, status: 'checking', createdAt: Date.now() };
    await db.hotels.add(c);
    const screenshot = shot?.ai;
    setName(''); setPrice(''); setShot(null);
    try {
      const report = await checkHotel({ name: c.name, link, screenshot, city, checkIn: from, checkOut: to, nights: countNights(from, to), adults: h.adults, children: h.children, homeCurrency: h.homeCurrency, places, pricePerNight: per, currency: c.currency });
      await db.hotels.update(c.id, { status: 'done', report, name: report.name || c.name });
      toast(`${report.name || 'Hotel'} checked`);
    } catch (e) {
      const msg = e instanceof HotelCheckUnavailable ? e.message : "Couldn't check that hotel right now. Tap it to try again.";
      await db.hotels.update(c.id, { status: 'failed', error: msg });
      if (e instanceof HotelCheckUnavailable) setErr(msg);
    }
  }

  return <div className="card">
    <b>Check a hotel</b>
    <Field label="Hotel name or link"><input className="input" value={name} placeholder="e.g. Hilton Shanghai City" onChange={e => setName(e.target.value)} /></Field>
    <div className="inline">
      <Field label="Price per night (optional)"><input className="input num" inputMode="decimal" value={price} placeholder="0" onChange={e => setPrice(e.target.value)} /></Field>
      <Field label="Currency"><select className="input" value={cur} onChange={e => setCur(e.target.value)}>{[...new Set([...h.currencies, h.homeCurrency])].map(c => <option key={c}>{c}</option>)}</select></Field>
    </div>
    {shot ? <div className="shot-row"><img src={shot.thumb} alt="Listing screenshot" /><span className="grow small">Listing screenshot added. Price, room and rating are read from it.</span><button className="btn ghost sm" onClick={() => setShot(null)}>Remove</button></div>
      : <button className="btn block" onClick={() => file.current?.click()}>Add listing screenshot (optional)</button>}
    <input ref={file} type="file" accept="image/*" hidden aria-label="Listing screenshot" onChange={e => onShot(e.target.files?.[0])} />
    {err && <div className="notice warn small">{err}</div>}
    <button className="btn primary block" style={{ marginTop: 10 }} disabled={!online} onClick={run}>{online ? '✨ Check hotel' : 'Connect to the internet to check'}</button>
    <p className="tiny muted" style={{ margin: '8px 2px 0' }}>Uses Claude with web search for recent reviews, about 10–15¢ per check. Travel times are estimates.</p>
  </div>;
}

/* ---------- Shortlist ---------- */
function CandidateRow({ c, onOpen }: { c: HotelCandidate; onOpen: () => void }) {
  const r = c.report; const per = r?.pricePerNight ?? c.pricePerNight; const v = r ? VERDICT[r.verdict] : null;
  return <button className="row hotel-row" onClick={onOpen}>
    {c.thumb ? <img className="attach-thumb" src={c.thumb} alt="" /> : <span className="attach-thumb icon">🏨</span>}
    <div className="grow">
      <div className="title">{r?.name || c.name || 'Hotel from screenshot'}</div>
      {c.status === 'checking' && <div className="sub">Checking… this can take up to a minute</div>}
      {c.status === 'failed' && <div className="sub bad">{c.error ?? 'Check failed'} Tap to retry.</div>}
      {r && <div className="sub wrap">{r.summary}</div>}
      <div className="hotel-meta">
        {v && <span className={'pill ' + v.cls}>{v.label}</span>}
        {c.chosenStayId && <span className="pill ok">Booked</span>}
        {per && <span className="num">{fmtMoney(per, r?.currency ?? c.currency ?? '')}/night</span>}
        {r?.area && <span>{r.area}</span>}
        {r && r.redFlags.length > 0 && <span className="bad">{r.redFlags.length} red flag{r.redFlags.length > 1 ? 's' : ''}</span>}
      </div>
    </div>
  </button>;
}

function ReportSheet({ h, c, onClose, onBook }: { h: Holiday; c: HotelCandidate; onClose: () => void; onBook: (c: HotelCandidate) => void }) {
  const { confirm } = useUI();
  const r = c.report;
  async function retry() {
    await db.hotels.update(c.id, { status: 'checking', error: undefined });
    const city = c.city;
    const stays = await db.accommodations.where('holidayId').equals(h.id).toArray();
    const mine = stays.filter(a => !a.layover && a.city && a.city.toLowerCase().includes(city.toLowerCase()));
    const from = mine.length ? mine.map(a => a.checkIn).sort()[0] : h.start; const to = mine.length ? mine.map(a => a.checkOut).sort().slice(-1)[0] : h.end;
    const ideas = await db.ideas.get(`${h.id}|${city}`);
    const places = [...new Set([...(h.keyPlaces?.[city] ?? []), ...(ideas ? [...ideas.see, ...ideas.events, ...(ideas.shop ?? [])].filter(x => x.starred).map(x => x.name) : [])])];
    try {
      const report = await checkHotel({ name: r?.name || c.name, link: c.link, city, checkIn: from, checkOut: to, nights: countNights(from, to), adults: h.adults, children: h.children, homeCurrency: h.homeCurrency, places, pricePerNight: c.pricePerNight, currency: c.currency });
      await db.hotels.update(c.id, { status: 'done', report });
    } catch (e) { await db.hotels.update(c.id, { status: 'failed', error: e instanceof HotelCheckUnavailable ? e.message : "Couldn't check that hotel right now." }); }
  }
  const v = r ? VERDICT[r.verdict] : null;
  return <Sheet title={r?.name || c.name || 'Hotel'} onClose={onClose}>
    {!r && <div className="card muted small">{c.status === 'checking' ? 'Still checking…' : c.error ?? 'Not checked yet.'}</div>}
    {r && <>
      <div className="report-head">
        {v && <span className={'status-pill ' + (v.cls === 'ok' ? 'ok' : v.cls === 'bad' ? 'over' : 'watch')}>{v.label}</span>}
        <p style={{ margin: '10px 0 0' }}>{r.summary}</p>
        <div className="small muted" style={{ marginTop: 6 }}>{[r.stars ? `${r.stars}★` : '', r.area, r.address].filter(Boolean).join(' · ')}</div>
      </div>
      {r.redFlags.length > 0 && <div className="notice bad"><b>Red flags</b><ul className="rep-list">{r.redFlags.map(x => <li key={x}>{x}</li>)}</ul></div>}
      <div className="rep-head">Getting around</div>
      {r.location.length ? <div className="group">{r.location.map(l => <div key={l.place} className="row"><div className="grow"><div className="title wrap">{l.place}</div>{l.note && <div className="sub wrap">{l.note}</div>}</div><div className="end small" style={{ fontWeight: 600 }}>{l.time}</div></div>)}</div>
        : <div className="card muted small">Add places that matter to see travel times.</div>}
      <div className="rep-head">Value</div>
      <div className="card small">
        {(r.pricePerNight ?? c.pricePerNight) && <div><b className="num">{fmtMoney(r.pricePerNight ?? c.pricePerNight, r.currency ?? c.currency ?? '')}</b> per night{r.typicalRange && <span className="muted"> · typical for the area {r.typicalRange}</span>}</div>}
        {r.valueNote && <div style={{ marginTop: 4 }}>{r.valueNote}</div>}
        {r.extras.length > 0 && <ul className="rep-list">{r.extras.map(x => <li key={x}>{x}</li>)}</ul>}
      </div>
      {r.familyFit && <><div className="rep-head">{h.children ? 'Family fit' : 'Room fit'}</div><div className="card small">{r.familyFit}</div></>}
      <div className="rep-head">What reviewers say</div>
      <div className="card small">
        {r.reviewsGood.length > 0 && <ul className="rep-list good">{r.reviewsGood.map(x => <li key={x}>{x}</li>)}</ul>}
        {r.reviewsBad.length > 0 && <ul className="rep-list badl">{r.reviewsBad.map(x => <li key={x}>{x}</li>)}</ul>}
        {!r.reviewsGood.length && !r.reviewsBad.length && <span className="muted">No review themes found.</span>}
      </div>
      {r.sources.length > 0 && <><div className="rep-head">Sources</div><div className="group">{r.sources.map(s => <a key={s.url} className="row" href={s.url} target="_blank" rel="noopener"><div className="grow"><div className="title wrap">{s.title}</div><div className="sub">{new URL(s.url).hostname}</div></div></a>)}</div></>}
      <p className="tiny muted" style={{ margin: '10px 4px' }}>{r.source === 'demo' ? 'Demo report, not a real hotel. Choose Claude in More → AI reading for real checks.' : `${r.source === 'ai' ? 'Web search was unavailable, so this is from Claude\'s own knowledge. ' : ''}Checked ${new Date(r.checkedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}. Travel times are estimates; confirm anything important before booking.`}</p>
    </>}
    {c.link && <a className="btn block" href={c.link} target="_blank" rel="noopener" style={{ marginBottom: 8 }}>Open listing</a>}
    <a className="btn block" href={`https://maps.apple.com/?q=${encodeURIComponent(`${r?.name || c.name}, ${c.city}`)}`} target="_blank" rel="noopener">Show on map</a>
    {r && !c.chosenStayId && <button className="btn primary block" style={{ marginTop: 8 }} onClick={() => onBook(c)}>Book this one</button>}
    {c.chosenStayId && <div className="notice soft small">Added to your bookings.</div>}
    <div className="inline" style={{ marginTop: 8 }}>
      {c.status !== 'checking' && <button className="btn" onClick={retry}>{r ? 'Check again' : 'Try again'}</button>}
      <button className="btn danger" onClick={async () => { if (await confirm({ title: 'Remove from shortlist?', ok: 'Remove', danger: true })) { await db.hotels.delete(c.id); onClose(); } }}>Remove</button>
    </div>
  </Sheet>;
}

/* ---------- Compare ---------- */
function CompareSheet({ list, onClose, onOpen }: { list: HotelCandidate[]; onClose: () => void; onOpen: (c: HotelCandidate) => void }) {
  const places = [...new Set(list.flatMap(c => c.report!.location.map(l => l.place)))].slice(0, 6);
  const time = (c: HotelCandidate, p: string) => c.report!.location.find(l => l.place === p)?.time ?? '—';
  const rows: [string, (c: HotelCandidate) => React.ReactNode][] = [
    ['Verdict', c => <span className={'pill ' + VERDICT[c.report!.verdict].cls}>{VERDICT[c.report!.verdict].label}</span>],
    ['Per night', c => { const p = c.report!.pricePerNight ?? c.pricePerNight; return p ? fmtMoney(p, c.report!.currency ?? c.currency ?? '') : '—'; }],
    ['Typical', c => c.report!.typicalRange ?? '—'],
    ['Area', c => c.report!.area ?? '—'],
    ...places.map(p => [p, (c: HotelCandidate) => time(c, p)] as [string, (c: HotelCandidate) => React.ReactNode]),
    ['Family fit', c => c.report!.familyFit ?? '—'],
    ['Top concern', c => c.report!.reviewsBad[0] ?? '—'],
    ['Red flags', c => c.report!.redFlags.length ? c.report!.redFlags.join('; ') : 'None found']
  ];
  return <Sheet title="Compare hotels" onClose={onClose}>
    <div className="table-wrap"><table className="cmp hotel-cmp">
      <thead><tr><th></th>{list.map(c => <th key={c.id}><button className="link-btn" onClick={() => onOpen(c)}>{c.report!.name || c.name}</button></th>)}</tr></thead>
      <tbody>{rows.map(([label, f]) => <tr key={label}><td>{label}</td>{list.map(c => <td key={c.id}>{f(c)}</td>)}</tr>)}</tbody>
    </table></div>
    <p className="tiny muted" style={{ margin: '8px 4px' }}>Tap a hotel name for its full report and to book it.</p>
  </Sheet>;
}
