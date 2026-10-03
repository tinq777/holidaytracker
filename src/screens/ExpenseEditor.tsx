import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { confirmExpense, findDuplicate, processPending } from '../lib/capture';
import { getRate, withEstimate } from '../lib/rates';
import { learnFromConfirmation } from '../lib/learning';
import { fmtMoney, round2 } from '../lib/money';
import { fmtDate } from '../lib/dates';
import { homeCost } from '../lib/calc';
import { usePaymentMethods } from '../lib/hooks';
import { Field, Sheet, numOr, useUI, Icon } from '../components/ui';
import type { Expense } from '../lib/types';

export default function ExpenseEditor({ target, onClose, confirmOnSave }: { target: Expense | string; onClose: () => void; confirmOnSave?: boolean }) {
  const id = typeof target === 'string' ? target : target.id;
  const stored = useLiveQuery(() => db.expenses.get(id), [id]);
  const isDraft = typeof target !== 'string' && stored === undefined;
  const base: Expense | undefined = stored ?? (typeof target === 'string' ? undefined : target);
  const h = useLiveQuery(() => (base ? db.holidays.get(base.holidayId) : undefined), [base?.holidayId]);
  const pms = usePaymentMethods();
  const { toast, confirm } = useUI();
  const [f, setF] = useState<Expense | null>(null);
  const [amt, setAmt] = useState(''); const [actual, setActual] = useState(''); const [fee, setFee] = useState(''); const [rate, setRate] = useState('');
  const [dup, setDup] = useState<Expense | undefined>();
  const [showMoney, setShowMoney] = useState(false);

  // (re)load form when the record first appears or when AI processing finishes
  const loadKey = `${base?.id}|${base?.processing ?? ''}`;
  useEffect(() => {
    if (!base) return;
    setF(base); setAmt(base.amount ? String(base.amount) : ''); setActual(base.actualHome !== undefined ? String(base.actualHome) : ''); setFee(base.fee !== undefined ? String(base.fee) : '');
    setRate(base.rate ? String(round2(base.rate * 10000) / 10000) : '');
    setShowMoney(base.actualHome !== undefined || base.fee !== undefined);
  }, [loadKey]); // eslint-disable-line
  useEffect(() => { if (f) findDuplicate({ ...f, amount: numOr(amt) ?? 0 }).then(setDup); }, [amt, f?.currency, f?.date]); // eslint-disable-line
  // when currency changes, pick up the saved rate for it
  useEffect(() => { if (f && h) getRate(f.currency, h.homeCurrency, navigator.onLine).then(r => setRate(r ? String(Math.round(r.rate * 10000) / 10000) : '')); }, [f?.currency, h?.homeCurrency]); // eslint-disable-line

  if (!base || !f || !h) return null;
  const set = <K extends keyof Expense>(k: K, v: Expense[K]) => setF(p => p && ({ ...p, [k]: v }));
  const amountN = numOr(amt) ?? 0; const rateN = numOr(rate);
  const foreign = f.currency !== h.homeCurrency;
  const est = foreign ? (rateN ? round2(amountN * rateN) : undefined) : amountN;
  const waiting = base.processing === 'waiting';
  const currencies = [...new Set([...h.currencies, h.homeCurrency, f.currency])];
  const inbox = base.status === 'inbox';

  function build(): Expense {
    return { ...f!, amount: amountN, estHome: est, rate: foreign ? rateN : 1, rateSource: foreign ? (rateN ? (f!.rate && Math.abs((f!.rate ?? 0) - (rateN ?? 0)) < 1e-6 ? f!.rateSource : 'manual') : undefined) : 'same', actualHome: numOr(actual), fee: numOr(fee) };
  }
  async function save(confirmIt: boolean) {
    if (!amountN) return toast('Enter the amount first');
    let e = build();
    if (foreign && rateN === undefined) e = await withEstimate(e, h!);
    if (confirmIt) { await confirmExpense(e); toast(`${e.merchant || 'Expense'} confirmed`); }
    else { await db.expenses.put(e); if (e.status === 'confirmed' && e.merchant) await learnFromConfirmation(e.merchant, e.category, e.paymentMethodId); toast('Saved'); }
    onClose();
  }
  async function remove() {
    if (isDraft) return onClose();
    if (await confirm({ title: 'Delete this expense?', ok: 'Delete', danger: true })) {
      const snapshot = await db.expenses.get(id);
      await db.expenses.delete(id);
      if (snapshot?.statementTxnId) await db.statementTxns.update(snapshot.statementTxnId, { status: 'pending', expenseId: undefined });
      onClose(); toast('Expense deleted', snapshot ? { label: 'Undo', run: () => db.expenses.put(snapshot) } : undefined);
    }
  }
  const primaryLabel = inbox || isDraft ? (confirmOnSave && isDraft ? 'Add expense' : 'Confirm expense') : 'Save';

  return <Sheet title={isDraft ? 'New expense' : inbox ? 'Confirm expense' : 'Expense'} onClose={onClose} action={<button className="btn ghost" onClick={() => save(inbox || isDraft)}>{inbox || isDraft ? 'Done' : 'Save'}</button>}>
    {base.pendingImage && <img className="preview-img" src={base.pendingImage} alt="Captured image" />}
    {waiting && <div className="notice info">{navigator.onLine ? 'Reading the image…' : 'Saved. It will be read automatically when you\'re back online, or fill it in now.'}</div>}
    {base.processing === 'failed' && <div className="notice bad">The image couldn't be read. Fill in the details, or <button className="btn ghost sm" onClick={async () => { await db.expenses.update(id, { processing: 'waiting' }); processPending(id); }}>try again</button></div>}
    {inbox && !waiting && base.confidence !== undefined && base.confidence > 0 && base.confidence < 0.7 && <div className="notice">Not fully sure about this one. Please check the details.</div>}
    {dup && <div className="notice">Possible duplicate: {dup.merchant || 'an expense'} for {fmtMoney(dup.amount, dup.currency)} on {fmtDate(dup.date)} is already recorded.</div>}

    <div className="card" style={{ padding: '10px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <select className="input" style={{ width: 92, flex: '0 0 auto' }} value={f.currency} onChange={e => set('currency', e.target.value)} aria-label="Currency">
          {currencies.map(c => <option key={c}>{c}</option>)}
        </select>
        <input className="amount-input" inputMode="decimal" placeholder="0" value={amt} onChange={e => setAmt(e.target.value)} aria-label="Amount" autoFocus={isDraft} />
      </div>
      {foreign && <div className="small muted num" style={{ paddingBottom: 4 }}>{est !== undefined ? <>≈ {fmtMoney(est, h.homeCurrency, { decimals: true })} {h.homeCurrency} estimated</> : 'No exchange rate yet. Add one below.'}</div>}
    </div>

    <Field label="Merchant"><input className="input" value={f.merchant} placeholder="Restaurant" onChange={e => set('merchant', e.target.value)} /></Field>
    <Field label="Category"><div className="chips">{h.categories.map(c => <button key={c} type="button" className={'chip' + (f.category === c ? ' on' : '')} onClick={() => set('category', c)}>{c}</button>)}</div></Field>
    <Field label="Paid with"><div className="chips">{pms.map(p => <button key={p.id} type="button" className={'chip' + (f.paymentMethodId === p.id ? ' on' : '')} onClick={() => set('paymentMethodId', f.paymentMethodId === p.id ? undefined : p.id)}>{p.name}</button>)}</div></Field>
    <div className="inline">
      <Field label="Date"><input className="input" type="date" value={f.date} onChange={e => set('date', e.target.value)} /></Field>
      <Field label="Time"><input className="input" type="time" value={f.time ?? ''} onChange={e => set('time', e.target.value || undefined)} /></Field>
    </div>
    <Field label="Note"><input className="input" value={f.description ?? ''} placeholder="Optional" onChange={e => set('description', e.target.value || undefined)} /></Field>

    {foreign && <>
      <button className="btn ghost" style={{ paddingLeft: 4 }} onClick={() => setShowMoney(!showMoney)}>{showMoney ? 'Hide' : 'Show'} rate, actual charge and fees</button>
      {showMoney && <div className="card" style={{ marginBottom: 12 }}>
        <Field label={`Exchange rate (${h.homeCurrency} per 1 ${f.currency})`}><input className="input num" inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} placeholder="e.g. 0.2195" /></Field>
        <Field label={`Actual card charge (${h.homeCurrency})`}><input className="input num" inputMode="decimal" value={actual} onChange={e => setActual(e.target.value)} placeholder="From your statement, if known" /></Field>
        <Field label={`Separate fee (${h.homeCurrency})`}><input className="input num" inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)} placeholder="e.g. overseas transaction fee" /></Field>
        <div className="small muted">True cost: <b className="num" style={{ color: 'var(--ink)' }}>{fmtMoney(homeCost({ estHome: est, actualHome: numOr(actual), fee: numOr(fee) }), h.homeCurrency, { decimals: true })}</b>{numOr(actual) === undefined && ' (estimated)'}. Record fees only when you know them; a wallet payment doesn't always carry a card fee too.</div>
      </div>}
    </>}

    <button className="btn primary block" onClick={() => save(inbox || isDraft)}><Icon name="check" />{primaryLabel}</button>
    {!isDraft && <><div className="spacer" /><button className="btn danger block" onClick={remove}>Delete</button></>}
  </Sheet>;
}
