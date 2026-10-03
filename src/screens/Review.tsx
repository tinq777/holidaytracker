import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from '../lib/db';
import { homeCost, nights, type TripStats } from '../lib/calc';
import { fmtMoney } from '../lib/money';
import { usePaymentMethods } from '../lib/hooks';
import { Field, Icon, Money, useUI } from '../components/ui';
import { LESSON_CATEGORIES, type Expense, type Holiday } from '../lib/types';

export default function Review({ h, s, expenses }: { h: Holiday; s: TripStats; expenses: Expense[] }) {
  const lessons = useLiveQuery(() => db.lessons.where('holidayId').equals(h.id).sortBy('createdAt'), [h.id], []);
  const stays = useLiveQuery(() => db.accommodations.where('holidayId').equals(h.id).toArray(), [h.id], []);
  const pms = usePaymentMethods();
  const [cat, setCat] = useState('Money'); const [text, setText] = useState('');
  const { toast } = useUI();
  const c = h.homeCurrency; const diff = h.budget - s.spent;
  const layoverExp = expenses.filter(e => e.accommodationId && stays.find(a => a.id === e.accommodationId)?.layover);
  const layoverNights = stays.filter(a => a.layover).reduce((t, a) => t + nights(a.checkIn, a.checkOut), 0);
  const fees = expenses.reduce((t, e) => t + (e.fee ?? 0), 0);
  const fxGap = expenses.filter(e => e.actualHome !== undefined && e.estHome !== undefined && e.currency !== c).reduce((t, e) => t + (e.actualHome! - e.estHome!), 0);
  const byPm = Object.entries(expenses.reduce<Record<string, number>>((m, e) => { const k = pms.find(p => p.id === e.paymentMethodId)?.name ?? 'Not recorded'; m[k] = (m[k] ?? 0) + homeCost(e); return m; }, {})).sort((a, b) => b[1] - a[1]);
  const addLesson = async () => { if (!text.trim()) return; await db.lessons.add({ id: uid(), holidayId: h.id, category: cat, text: text.trim(), carryForward: true, createdAt: Date.now() }); setText(''); toast('Lesson saved. It will remind you next trip'); };
  const line = (label: string, v: number, extra?: string) => <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}><span>{label}{extra && <span className="muted small"> {extra}</span>}</span><Money v={v} c={c} /></div>;

  return <>
    {s.phase !== 'past' && <p className="small muted" style={{ margin: '6px 4px' }}>This summary fills in as you go. Come back at the end of the trip to add lessons.</p>}
    <div className="card">
      <div className="big-answer">Total spent<span className="amt">{fmtMoney(s.spent, c)}</span></div>
      <div style={{ marginTop: 10 }}>
        {line('Budget', h.budget)}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontWeight: 700 }}><span>Difference</span><span className={'num ' + (diff >= 0 ? 'good' : 'bad')}>{fmtMoney(Math.abs(diff), c)} {diff >= 0 ? 'under' : 'over'}</span></div>
      </div>
      <div style={{ borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 8 }}>
        {h.categories.filter(k => s.byCategory[k]).map(k => <div key={k}>{line(k === 'Accommodation' ? 'Hotels' : k, s.byCategory[k])}</div>)}
      </div>
      <div style={{ borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 8 }} className="small">
        {line('Daily average', s.dayToDaySpent / Math.max(1, s.elapsedDays || s.totalDays), '(excl. flights & hotels)')}
        {layoverExp.length > 0 && line('Layover hotels', layoverExp.reduce((t, e) => t + homeCost(e), 0), `(${layoverNights} night${layoverNights > 1 ? 's' : ''})`)}
        {fees > 0 && line('Recorded fees', fees)}
        {Math.abs(fxGap) >= 1 && line('Actual vs estimated charges', fxGap, '(from statement)')}
      </div>
    </div>

    {byPm.length > 0 && <div className="section">
      <div className="section-head"><h3>By payment method</h3></div>
      <div className="card small">{byPm.map(([k, v]) => <div key={k}>{line(k, v)}</div>)}</div>
    </div>}

    <div className="section">
      <div className="section-head"><h3>Notes</h3></div>
      <Field label="What went well"><textarea className="input" defaultValue={h.wentWell} onBlur={e => db.holidays.update(h.id, { wentWell: e.target.value })} /></Field>
      <Field label="What could be improved"><textarea className="input" defaultValue={h.improve} onBlur={e => db.holidays.update(h.id, { improve: e.target.value })} /></Field>
    </div>

    <div className="section">
      <div className="section-head"><h3>What did you learn?</h3></div>
      <div className="chips" style={{ marginBottom: 8 }}>{LESSON_CATEGORIES.map(k => <button key={k} className={'chip' + (cat === k ? ' on' : '')} onClick={() => setCat(k)}>{k}</button>)}</div>
      <textarea className="input" value={text} onChange={e => setText(e.target.value)} placeholder="e.g. Layover hotels added a lot to the total cost." />
      <button className="btn primary block" style={{ marginTop: 8 }} onClick={addLesson} disabled={!text.trim()}>Add lesson</button>
      {lessons.length > 0 && <div className="group" style={{ marginTop: 12 }}>
        {lessons.map(l => <div className="lesson" key={l.id}>
          <div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 700 }}>{l.category}</div><div>{l.text}</div>
            <label className="tiny muted" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginTop: 4, cursor: 'pointer' }}><input type="checkbox" checked={l.carryForward} onChange={e => db.lessons.update(l.id, { carryForward: e.target.checked })} /> Remind me on future trips</label></div>
          <button className="icon-btn" style={{ boxShadow: 'none', color: 'var(--faint)' }} aria-label="Delete lesson" onClick={() => db.lessons.delete(l.id)}><Icon name="trash" size={18} /></button>
        </div>)}
      </div>}
    </div>
  </>;
}
