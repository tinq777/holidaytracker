import { useEffect, useState } from 'react';
import { db, uid, deleteHoliday } from '../lib/db';
import { seedChecklists } from '../lib/checklists';
import { COMMON_CURRENCIES, fmtMoney } from '../lib/money';
import { daysBetween } from '../lib/dates';
import { getSetting, setSetting } from '../lib/db';
import { estimateBudget, BudgetEstimateUnavailable, type SpendStyle } from '../ai/budget';
import { refreshRates } from '../lib/rates';
import { DEFAULT_CATEGORIES, type Holiday } from '../lib/types';
import { Field, Header, Stepper, go, numOr, useUI } from '../components/ui';
import { LessonsReminder } from '../components/LessonsReminder';
import { useHoliday } from '../lib/hooks';

const empty = (): Holiday => ({ id: uid(), name: '', destinations: [], start: '', end: '', homeCurrency: 'AUD', currencies: [], adults: 2, children: 0, budget: 0, categories: [...DEFAULT_CATEGORIES], categoryBudgets: {}, reviewedLessonIds: [], createdAt: Date.now() });

export default function HolidayForm({ id }: { id?: string }) {
  const existing = useHoliday(id);
  const [h, setH] = useState<Holiday>(empty);
  const [dest, setDest] = useState('');
  const [budget, setBudget] = useState('');
  const [flights, setFlights] = useState('');
  const [stays, setStays] = useState('');
  const [daily, setDaily] = useState('');
  const [car, setCar] = useState('');
  const [origin, setOrigin] = useState('');
  const [estimating, setEstimating] = useState(false);
  const [style, setStyle] = useState<SpendStyle>('moderate');
  const [estimate, setEstimate] = useState<{ notes: string[]; source: 'ai' | 'demo'; daily?: { food: number; transport: number; activities: number } } | null>(null);
  const [estError, setEstError] = useState('');
  const [error, setError] = useState('');
  const { confirm, toast } = useUI();
  useEffect(() => { if (existing) {
    setH(existing); setBudget(existing.budget ? String(existing.budget) : '');
    const str = (n?: number) => (n ? String(n) : '');
    setFlights(str(existing.categoryBudgets.Flights)); setStays(str(existing.categoryBudgets.Accommodation)); setCar(str(existing.categoryBudgets['Car hire'])); setDaily(str(existing.dailyBudget));
  } }, [existing?.id]); // eslint-disable-line
  useEffect(() => { getSetting<string>('flyingFrom', '').then(setOrigin); }, []);

  // Trip length: days are counted inclusively (1–14 April = 14 days, 13 nights).
  const nights = h.start && h.end && h.end >= h.start ? daysBetween(h.start, h.end) : null;
  const days = nights === null ? null : nights + 1;

  // Changing any part of the breakdown recalculates the total; the total can still be typed directly.
  const sumParts = (f: string, a: string, d: string, k: string = car) => {
    const parts = [numOr(f), numOr(a), numOr(k), numOr(d) !== undefined && days ? numOr(d)! * days : undefined];
    if (parts.every(x => x === undefined)) return;
    setBudget(String(Math.round(parts.reduce<number>((t, x) => t + (x ?? 0), 0))));
  };
  const setPart = (which: 'f' | 'a' | 'd' | 'k', v: string) => {
    const f = which === 'f' ? v : flights, a = which === 'a' ? v : stays, d = which === 'd' ? v : daily, k = which === 'k' ? v : car;
    if (which === 'f') setFlights(v); else if (which === 'a') setStays(v); else if (which === 'k') setCar(v); else setDaily(v);
    sumParts(f, a, d, k);
  };
  useEffect(() => { if (days) sumParts(flights, stays, daily); }, [days]); // eslint-disable-line

  async function runEstimate() {
    setEstError('');
    const destinations = dest.trim() ? [...h.destinations, dest.trim()] : h.destinations;
    if (!destinations.length) return setEstError('Add a destination first.');
    if (days === null || nights === null) return setEstError('Add the start and end dates first.');
    setEstimating(true);
    try {
      if (origin.trim()) setSetting('flyingFrom', origin.trim());
      const e = await estimateBudget({ destinations, start: h.start, end: h.end, days, nights, adults: h.adults, children: h.children, homeCurrency: h.homeCurrency, origin: origin.trim() || undefined, style });
      const f = String(e.flights), a = String(e.accommodation), d = String(e.dailySpend);
      setFlights(f); setStays(a); setDaily(d); sumParts(f, a, d);
      setEstimate({ notes: e.notes, source: e.source, daily: e.daily });
    } catch (err) {
      setEstError(err instanceof BudgetEstimateUnavailable ? err.message : 'Could not get an estimate right now. Try again, or enter amounts yourself.');
    } finally { setEstimating(false); }
  }

  const set = <K extends keyof Holiday>(k: K, v: Holiday[K]) => setH(p => ({ ...p, [k]: v }));
  const addDest = () => { const d = dest.trim(); if (d && !h.destinations.includes(d)) set('destinations', [...h.destinations, d]); setDest(''); };
  const addCurrency = (c: string) => { if (c && c !== h.homeCurrency && !h.currencies.includes(c)) set('currencies', [...h.currencies, c]); };

  async function save() {
    const d = dest.trim();
    const categoryBudgets = { ...h.categoryBudgets };
    for (const [cat, v] of [['Flights', flights], ['Accommodation', stays], ['Car hire', car]] as const) { const n = numOr(v); if (n) categoryBudgets[cat] = n; else delete categoryBudgets[cat]; }
    const final: Holiday = { ...h, destinations: d && !h.destinations.includes(d) ? [...h.destinations, d] : h.destinations, budget: numOr(budget) ?? 0, name: h.name.trim(), categoryBudgets, dailyBudget: numOr(daily) || undefined };
    if (!final.name) return setError('Give the holiday a name, like "China 2027".');
    if (!final.start || !final.end) return setError('Add the start and end dates.');
    if (final.end < final.start) return setError('The end date is before the start date.');
    if (id) await db.holidays.put(final);
    else { await db.holidays.add(final); await seedChecklists(final.id, final.children > 0); }
    refreshRates(final.homeCurrency, final.currencies);
    toast(id ? 'Holiday updated' : 'Holiday created');
    go(`/trip/${final.id}`);
  }

  async function remove() {
    if (!id) return;
    if (await confirm({ title: `Delete ${h.name}?`, body: 'All expenses, stays, checklists and lessons for this holiday will be removed from this device. Export a backup first if you might need them.', ok: 'Delete holiday', danger: true })) {
      await deleteHoliday(id); go('/'); toast('Holiday deleted');
    }
  }

  return <>
    <Header title={id ? 'Edit holiday' : 'New holiday'} back={id ? `/trip/${id}` : '/'} right={<button className="btn ghost" onClick={save}>Save</button>} />
    <Field label="Holiday name"><input className="input" value={h.name} placeholder="China 2027" onChange={e => set('name', e.target.value)} autoFocus={!id} /></Field>
    <Field label="Destinations">
      {h.destinations.length > 0 && <div className="chips" style={{ marginBottom: 8 }}>{h.destinations.map(d => <button key={d} type="button" className="chip on" onClick={() => set('destinations', h.destinations.filter(x => x !== d))}>{d} <span className="x">✕</span></button>)}</div>}
      <div className="inline"><input className="input" value={dest} placeholder="Shanghai" onChange={e => setDest(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addDest())} />
        <button type="button" className="btn" style={{ flex: '0 0 auto' }} onClick={addDest}>Add</button></div>
    </Field>
    <div className="inline">
      <Field label="Start"><input className="input" type="date" value={h.start} onChange={e => { set('start', e.target.value); if (!h.end || h.end < e.target.value) set('end', e.target.value); }} /></Field>
      <Field label="End"><input className="input" type="date" value={h.end} min={h.start} onChange={e => set('end', e.target.value)} /></Field>
    </div>
    {days !== null && <div className="trip-length"><b>{days}</b> day{days === 1 ? '' : 's'} · <b>{nights}</b> night{nights === 1 ? '' : 's'}</div>}
    <div className="inline">
      <Field label="Adults"><Stepper value={h.adults} min={1} onChange={n => set('adults', n)} /></Field>
      <Field label="Children"><Stepper value={h.children} onChange={n => set('children', n)} /></Field>
    </div>
    <div className="section-head" style={{ marginTop: 18 }}><h3>Budget</h3>
      <select className="input sm-select" value={h.homeCurrency} onChange={e => set('homeCurrency', e.target.value)} aria-label="Home currency">
        {COMMON_CURRENCIES.map(c => <option key={c}>{c}</option>)}
      </select>
    </div>
    <div className="card pad">
      <Field label="Flying from"><input className="input" value={origin} placeholder="Sydney" onChange={e => setOrigin(e.target.value)} /></Field>
      <div className="field"><span>Travel style</span>
        <div className="seg">{(['budget', 'moderate', 'comfortable'] as SpendStyle[]).map(k => <button type="button" key={k} className={style === k ? 'on' : ''} onClick={() => setStyle(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}</div>
      </div>
      <button type="button" className="btn block estimate" onClick={runEstimate} disabled={estimating}>{estimating ? 'Estimating…' : '✨ Estimate budget with AI'}</button>
      <p className="tiny muted" style={{ margin: '6px 4px 12px' }}>Suggests flights, accommodation and daily spending for {h.adults + h.children} {h.adults + h.children === 1 ? 'person' : 'people'} from your destination and dates. You can change every number.</p>
      {estError && <div className="notice warn small">{estError}</div>}
      {estimate && <div className="notice soft small" style={{ marginBottom: 12 }}>
        <b>{estimate.source === 'demo' ? 'Demo estimate' : 'AI estimate'} for {h.adults + h.children} {h.adults + h.children === 1 ? 'person' : 'people'}. Adjust anything.</b>
        {estimate.daily && <div style={{ marginTop: 6 }}>Per day: food {fmtMoney(estimate.daily.food, h.homeCurrency)} · transport {fmtMoney(estimate.daily.transport, h.homeCurrency)} · activities {fmtMoney(estimate.daily.activities, h.homeCurrency)}. Shopping isn't included, so add a little if you plan to shop.</div>}
        {estimate.notes.length > 0 && <ul className="est-notes">{estimate.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      </div>}
      <Field label="Flights (total, return)"><input className="input num" inputMode="decimal" value={flights} placeholder="0" onChange={e => setPart('f', e.target.value)} /></Field>
      <Field label="Accommodation (total)" hint={nights && numOr(stays) ? `${fmtMoney(numOr(stays)! / nights, h.homeCurrency)} per night` : undefined}><input className="input num" inputMode="decimal" value={stays} placeholder="0" onChange={e => setPart('a', e.target.value)} /></Field>
      <Field label="Car hire (total, optional)" hint="Leave blank if you won't hire a car."><input className="input num" inputMode="decimal" value={car} placeholder="0" onChange={e => setPart('k', e.target.value)} /></Field>
      <Field label="Daily spending (per day, everyone)" hint={days && numOr(daily) ? `Food, transport, activities · × ${days} days = ${fmtMoney(numOr(daily)! * days, h.homeCurrency)}` : 'Food, transport, activities. Not flights or hotels.'}><input className="input num" inputMode="decimal" value={daily} placeholder="0" onChange={e => setPart('d', e.target.value)} /></Field>
      <Field label="Total budget" hint="Adds up the amounts above. You can type a different total."><input className="input num total-input" inputMode="decimal" value={budget} placeholder="8000" onChange={e => setBudget(e.target.value)} /></Field>
    </div>
    <Field label="Currencies for this trip" hint={`${h.homeCurrency} is always included. Add the currencies you'll pay in while away.`}>
      <div className="chips">
        <span className="chip home-chip">{h.homeCurrency}<span className="phase">home</span></span>
        {h.currencies.map(c => <button type="button" key={c} className="chip on" onClick={() => set('currencies', h.currencies.filter(x => x !== c))}>{c} <span className="x">✕</span></button>)}
        <select className="chip" value="" onChange={e => addCurrency(e.target.value)} aria-label="Add currency">
          <option value="">+ Add currency</option>
          {COMMON_CURRENCIES.filter(c => c !== h.homeCurrency && !h.currencies.includes(c)).map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
    </Field>
    {error && <div className="notice bad">{error}</div>}
    {!id && <LessonsReminder reviewed={h.reviewedLessonIds ?? []} onToggle={lid => set('reviewedLessonIds', (h.reviewedLessonIds ?? []).includes(lid) ? h.reviewedLessonIds!.filter(x => x !== lid) : [...(h.reviewedLessonIds ?? []), lid])} />}
    <div className="spacer" />
    <button className="btn primary block" onClick={save}>{id ? 'Save changes' : 'Create holiday'}</button>
    {id && <><div className="spacer" /><button className="btn danger block" onClick={remove}>Delete holiday</button></>}
  </>;
}
