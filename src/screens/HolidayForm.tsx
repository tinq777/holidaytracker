import { useEffect, useState } from 'react';
import { db, uid, deleteHoliday } from '../lib/db';
import { seedChecklists } from '../lib/checklists';
import { COMMON_CURRENCIES } from '../lib/money';
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
  const [error, setError] = useState('');
  const { confirm, toast } = useUI();
  useEffect(() => { if (existing) { setH(existing); setBudget(existing.budget ? String(existing.budget) : ''); } }, [existing?.id]); // eslint-disable-line

  const set = <K extends keyof Holiday>(k: K, v: Holiday[K]) => setH(p => ({ ...p, [k]: v }));
  const addDest = () => { const d = dest.trim(); if (d && !h.destinations.includes(d)) set('destinations', [...h.destinations, d]); setDest(''); };
  const addCurrency = (c: string) => { if (c && c !== h.homeCurrency && !h.currencies.includes(c)) set('currencies', [...h.currencies, c]); };

  async function save() {
    const d = dest.trim();
    const final: Holiday = { ...h, destinations: d && !h.destinations.includes(d) ? [...h.destinations, d] : h.destinations, budget: numOr(budget) ?? 0, name: h.name.trim() };
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
    <Field label="Overall budget">
      <div className="inline">
        <select className="input" style={{ flex: '0 0 96px' }} value={h.homeCurrency} onChange={e => set('homeCurrency', e.target.value)} aria-label="Home currency">
          {COMMON_CURRENCIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <input className="input num" inputMode="decimal" value={budget} placeholder="8000" onChange={e => setBudget(e.target.value)} />
      </div>
    </Field>
    <Field label="Travel currencies">
      <div className="chips">
        {h.currencies.map(c => <button type="button" key={c} className="chip on" onClick={() => set('currencies', h.currencies.filter(x => x !== c))}>{c} <span className="x">✕</span></button>)}
        <select className="chip" value="" onChange={e => addCurrency(e.target.value)} aria-label="Add currency">
          <option value="">+ Add currency</option>
          {COMMON_CURRENCIES.filter(c => c !== h.homeCurrency && !h.currencies.includes(c)).map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
    </Field>
    <div className="inline">
      <Field label="Adults"><Stepper value={h.adults} min={1} onChange={n => set('adults', n)} /></Field>
      <Field label="Children"><Stepper value={h.children} onChange={n => set('children', n)} /></Field>
    </div>
    {error && <div className="notice bad">{error}</div>}
    {!id && <LessonsReminder reviewed={h.reviewedLessonIds ?? []} onToggle={lid => set('reviewedLessonIds', (h.reviewedLessonIds ?? []).includes(lid) ? h.reviewedLessonIds!.filter(x => x !== lid) : [...(h.reviewedLessonIds ?? []), lid])} />}
    <div className="spacer" />
    <button className="btn primary block" onClick={save}>{id ? 'Save changes' : 'Create holiday'}</button>
    {id && <><div className="spacer" /><button className="btn danger block" onClick={remove}>Delete holiday</button></>}
  </>;
}
