import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { addTxnAsExpense, attachFee, dismissTxn, linkMatch, pendingSuggestions, rejectSuggestion, restoreTxn, unlinkMatch } from '../lib/statement';
import { homeCost } from '../lib/calc';
import { daysBetween, fmtDate } from '../lib/dates';
import { fmtMoney } from '../lib/money';
import { useHoliday, usePaymentMethods } from '../lib/hooks';
import { Header, Icon, Sheet, go, useUI } from '../components/ui';
import type { Expense, StatementTxn } from '../lib/types';

export default function Reconcile({ id }: { id: string }) {
  const h = useHoliday(id);
  const txns = useLiveQuery(() => db.statementTxns.where('holidayId').equals(id).sortBy('date'), [id], [] as StatementTxn[]);
  const expenses = useLiveQuery(() => db.expenses.where('holidayId').equals(id).filter(e => e.status === 'confirmed').toArray(), [id], [] as Expense[]);
  const suggestions = useLiveQuery(async () => (h ? pendingSuggestions(h) : []), [h, txns, expenses], []);
  const pms = usePaymentMethods();
  const [manual, setManual] = useState<StatementTxn | null>(null);
  const [showMatched, setShowMatched] = useState(false);
  const { toast } = useUI();
  if (!h) return null;
  const c = h.homeCurrency;
  const exp = (eid?: string) => expenses.find(e => e.id === eid);
  const matched = txns.filter(t => t.status === 'matched' || t.status === 'fee-attached');
  const suggestedIds = new Set(suggestions.map(s => s.txnId));
  const pending = txns.filter(t => t.status === 'pending' && !t.isFee && !suggestedIds.has(t.id));
  const fees = txns.filter(t => t.status === 'pending' && t.isFee);
  const dismissed = txns.filter(t => t.status === 'dismissed');
  const capturedNoCharge = expenses.filter(e => !e.statementTxnId && e.source !== 'import' && e.currency !== c);
  const actual = expenses.reduce((t, e) => t + homeCost(e), 0);
  const estimatedLeft = expenses.filter(e => e.actualHome === undefined && e.currency !== c).length;

  const feeTarget = (t: StatementTxn) => expenses.filter(e => e.statementTxnId && Math.abs(daysBetween(e.date, t.date)) <= 1).sort((a, b) => Math.abs(daysBetween(a.date, t.date)) - Math.abs(daysBetween(b.date, t.date)) || Math.abs((a.actualHome ?? 0) * 0.03 - t.amount) - Math.abs((b.actualHome ?? 0) * 0.03 - t.amount))[0];
  const ExpLine = ({ e }: { e: Expense }) => <><div className="title">{e.merchant || 'Expense'} · <span className="num">{fmtMoney(e.amount, e.currency)}</span></div><div className="sub">Captured · {fmtDate(e.date)} · {pms.find(p => p.id === e.paymentMethodId)?.name ?? e.category}</div></>;
  const TxnLine = ({ t }: { t: StatementTxn }) => <><div className="title" style={{ fontWeight: 550 }}>{t.description}</div><div className="sub">Card · {fmtDate(t.date)} · <span className="num">{fmtMoney(t.amount, c, { decimals: true })}</span></div></>;

  return <>
    <Header title="Reconcile" back={`/trip/${id}/expenses`} />
    {txns.length === 0 ? <div className="card empty"><b>Nothing to reconcile yet</b>Import a card or bank CSV to compare it with the expenses you captured.<div className="spacer" /><button className="btn primary block" onClick={() => go(`/trip/${id}/import`)}>Import statement</button></div> : <>
      <div className="card">
        <div className="big-answer">Trip cost so far<span className="amt">{fmtMoney(actual, c)}</span>{estimatedLeft ? `${estimatedLeft} foreign expense${estimatedLeft > 1 ? 's are' : ' is'} still estimated` : 'All foreign expenses use actual charges'}</div>
        <div className="grid2" style={{ marginTop: 12 }}>
          <div><b className="num good">{matched.length}</b> <span className="small muted">matched</span></div>
          <div><b className="num warn">{suggestions.length + pending.length + fees.length}</b> <span className="small muted">need review</span></div>
        </div>
      </div>

      {suggestions.length > 0 && <div className="section">
        <div className="section-head"><h3>Possible matches</h3></div>
        {suggestions.map(s => { const t = txns.find(x => x.id === s.txnId)!; const e = exp(s.expenseId); if (!t || !e) return null;
          return <div className="card" key={s.txnId}>
            <ExpLine e={e} /><div style={{ margin: '6px 0', color: 'var(--faint)' }}><Icon name="link" size={16} /></div><TxnLine t={t} />
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn sm" onClick={() => rejectSuggestion(t.id, e.id)}>Not a match</button>
              <button className="btn sm primary" onClick={async () => { await linkMatch(t.id, e.id); toast('Matched: actual charge recorded'); }}>Match</button>
            </div>
          </div>; })}
      </div>}

      {pending.length > 0 && <div className="section">
        <div className="section-head"><h3>Needs review</h3><span className="aside">Not yet in your budget</span></div>
        <div className="group">{pending.map(t => <div className="row" key={t.id} style={{ cursor: 'default', flexWrap: 'wrap' }}>
          <div className="grow" style={{ minWidth: '60%' }}><TxnLine t={t} /></div>
          <div className="btn-row" style={{ width: '100%' }}>
            <button className="btn sm" onClick={() => dismissTxn(t.id)}>Dismiss</button>
            <button className="btn sm" onClick={() => setManual(t)}>Match…</button>
            <button className="btn sm primary" onClick={async () => { await addTxnAsExpense(h, t.id); toast('Added as an expense'); }}>Add</button>
          </div>
        </div>)}</div>
      </div>}

      {fees.length > 0 && <div className="section">
        <div className="section-head"><h3>Fees</h3><span className="aside num">{fmtMoney(fees.reduce((t, f) => t + f.amount, 0), c, { decimals: true })}</span></div>
        <div className="group">{fees.map(t => { const target = feeTarget(t); return <div className="row" key={t.id} style={{ cursor: 'default', flexWrap: 'wrap' }}>
          <div className="grow" style={{ minWidth: '60%' }}><TxnLine t={t} />{target && <div className="sub">Likely belongs to {target.merchant}</div>}</div>
          <div className="btn-row" style={{ width: '100%' }}>
            <button className="btn sm" onClick={() => dismissTxn(t.id)}>Dismiss</button>
            {target ? <button className="btn sm primary" onClick={async () => { await attachFee(t.id, target.id); toast(`Fee added to ${target.merchant}`); }}>Add to {target.merchant.slice(0, 14)}</button>
              : <button className="btn sm primary" onClick={() => addTxnAsExpense(h, t.id)}>Add as expense</button>}
          </div>
        </div>; })}</div>
      </div>}

      {capturedNoCharge.length > 0 && <div className="section">
        <div className="section-head"><h3>Captured, no card charge found</h3><span className="aside">{capturedNoCharge.length}</span></div>
        <p className="small muted" style={{ margin: '0 4px 8px' }}>Usually cash, or a card you haven't imported yet. These keep their estimated cost.</p>
        <div className="group">{capturedNoCharge.slice(0, 30).map(e => <div className="row" key={e.id} style={{ cursor: 'default' }}><div className="grow"><ExpLine e={e} /></div><div className="end num">≈{fmtMoney(homeCost(e), c)}</div></div>)}</div>
      </div>}

      {matched.length > 0 && <div className="section">
        <div className="section-head"><h3>Matched</h3><button className="btn ghost sm" onClick={() => setShowMatched(!showMatched)}>{showMatched ? 'Hide' : `Show ${matched.length}`}</button></div>
        {showMatched && <div className="group">{matched.map(t => { const e = exp(t.expenseId); return <div className="row" key={t.id} style={{ cursor: 'default' }}>
          <span className="check on"><Icon name="check" size={16} stroke={3} /></span>
          <div className="grow"><div className="title">{e?.merchant ?? t.description}{e && <span className="num"> · {fmtMoney(e.amount, e.currency)}</span>}</div><div className="sub">{t.status === 'fee-attached' ? 'Fee' : 'Card'} {fmtMoney(t.amount, c, { decimals: true })} · {fmtDate(t.date)}</div></div>
          {t.status === 'matched' && <button className="btn ghost sm" onClick={() => unlinkMatch(t.id)}>Unlink</button>}
        </div>; })}</div>}
      </div>}

      {dismissed.length > 0 && <p className="small muted" style={{ margin: '14px 4px' }}>{dismissed.length} dismissed transaction{dismissed.length > 1 ? 's' : ''}. <button className="btn ghost sm" onClick={() => dismissed.forEach(t => restoreTxn(t.id))}>Restore</button></p>}
    </>}
    {manual && <Sheet title="Match to an expense" onClose={() => setManual(null)}>
      <div className="card" style={{ marginBottom: 10 }}><TxnLine t={manual} /></div>
      <div className="group">{expenses.filter(e => !e.statementTxnId && e.source !== 'import').sort((a, b) => Math.abs(daysBetween(a.date, manual.date)) - Math.abs(daysBetween(b.date, manual.date))).slice(0, 40).map(e =>
        <button className="row" key={e.id} onClick={async () => { await linkMatch(manual.id, e.id); setManual(null); toast('Matched'); }}><div className="grow"><ExpLine e={e} /></div><Icon name="chev" size={18} /></button>)}</div>
    </Sheet>}
  </>;
}
