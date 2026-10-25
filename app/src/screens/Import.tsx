import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { parseCSV, detectColumns, extractTxns, type ColumnMap, type ParsedTxn } from '../lib/csv';
import { previewImport, commitImport, type ImportPreview } from '../lib/statement';
import { STRONG_MATCH } from '../lib/match';
import { addDays, fmtDate } from '../lib/dates';
import { fmtMoney } from '../lib/money';
import { useHoliday } from '../lib/hooks';
import { Header, Icon, Field, go, useUI } from '../components/ui';
import type { Expense } from '../lib/types';

export default function ImportScreen({ id }: { id: string }) {
  const h = useHoliday(id);
  const expenses = useLiveQuery(() => db.expenses.where('holidayId').equals(id).toArray(), [id], [] as Expense[]);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [map, setMap] = useState<ColumnMap | undefined>();
  const [fileName, setFileName] = useState('');
  const [all, setAll] = useState<ParsedTxn[]>([]);
  const [includeAll, setIncludeAll] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const { toast } = useUI();
  if (!h) return null;
  const lo = addDays(h.start, -3), hi = addDays(h.end, 3);

  async function build(m: ColumnMap, r: string[][], inclAll: boolean) {
    const { txns } = extractTxns(r, m, h!.homeCurrency);
    setAll(txns);
    const scoped = inclAll ? txns : txns.filter(t => t.date >= lo && t.date <= hi);
    const p = await previewImport(h!, scoped);
    setPreview(p); setAccepted(new Set(p.suggestions.filter(s => s.score >= STRONG_MATCH).map(s => s.tmpIndex)));
  }

  async function onFile(f?: File) {
    if (!f) return; setError(''); setFileName(f.name);
    const text = await f.text(); const r = parseCSV(text);
    if (r.length === 0) return setError('That file is empty.');
    setRows(r); const m = detectColumns(r); setMap(m);
    if (m) await build(m, r, includeAll); else setPreview(null);
  }

  async function doImport() {
    if (!preview) return;
    const n = await commitImport(h!, preview, accepted);
    toast(`${n} transactions imported, ${accepted.size} matched`);
    go(`/trip/${h!.id}/reconcile`);
  }

  const outside = all.filter(t => t.date < lo || t.date > hi).length;
  const cols = rows ? Math.max(...rows.slice(0, 5).map(r => r.length)) : 0;
  const colLabel = (i: number) => (map?.hasHeader ? rows![0][i] : `Column ${i + 1}: ${rows![0][i]?.slice(0, 18)}`);

  return <>
    <Header title="Import statement" back={`/trip/${id}/expenses`} />
    {!rows && <>
      <div className="card">
        <p style={{ marginTop: 0 }}>Upload a CSV exported from your bank or card. Card charges are matched to expenses you've already captured, so nothing is counted twice.</p>
        <label className="btn primary block" style={{ position: 'relative' }}><Icon name="upload" />Choose CSV file
          <input type="file" accept=".csv,text/csv,text/plain" style={{ position: 'absolute', inset: 0, opacity: 0 }} onChange={e => onFile(e.target.files?.[0])} /></label>
      </div>
      <p className="small muted" style={{ margin: '10px 4px' }}>The file is read on this phone and never uploaded. Most Australian banks export Date, Amount, Description; files with or without headers work.</p>
    </>}
    {error && <div className="notice bad">{error}</div>}

    {rows && !map && <div className="card">
      <p style={{ marginTop: 0 }}>Choose which columns hold the date, description and amount in <b>{fileName}</b>.</p>
      {(['date', 'description', 'amount'] as const).map(k => <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
        <select className="input" defaultValue="" onChange={e => setMap(m => ({ hasHeader: false, date: 0, description: 1, amount: 2, ...m, [k]: Number(e.target.value) }))}>
          <option value="" disabled>Choose column</option>{Array.from({ length: cols }, (_, i) => <option key={i} value={i}>{colLabel(i)}</option>)}
        </select></Field>)}
      <button className="btn primary block" onClick={() => map && build(map, rows, includeAll)}>Continue</button>
    </div>}

    {preview && <>
      <div className="card">
        <div className="title" style={{ fontWeight: 700 }}>{fileName}</div>
        <div className="small muted">{all.length} spending transactions found · {preview.fresh.length} new{preview.alreadyImported ? ` · ${preview.alreadyImported} already imported (skipped)` : ''}</div>
        {outside > 0 && <label className="switch" style={{ marginTop: 10, marginBottom: 0 }}><span className="small">Include {outside} transaction{outside > 1 ? 's' : ''} outside the trip dates (e.g. flights booked earlier)</span>
          <input type="checkbox" checked={includeAll} onChange={e => { setIncludeAll(e.target.checked); build(map!, rows!, e.target.checked); }} /></label>}
      </div>

      {preview.suggestions.length > 0 && <div className="section">
        <div className="section-head"><h3>Already captured</h3><span className="aside">{accepted.size} of {preview.suggestions.length} ticked</span></div>
        <p className="small muted" style={{ margin: '0 4px 8px' }}>These charges look like expenses you captured. Ticked ones are linked instead of added, and the actual charge replaces the estimate.</p>
        <div className="group">{preview.suggestions.map(s => { const t = preview.fresh[s.tmpIndex]; const e = expenses.find(x => x.id === s.expenseId); const on = accepted.has(s.tmpIndex);
          return <button className="row" key={s.tmpIndex} onClick={() => setAccepted(p => { const n = new Set(p); n.has(s.tmpIndex) ? n.delete(s.tmpIndex) : n.add(s.tmpIndex); return n; })}>
            <span className={'check' + (on ? ' on' : '')}>{on && <Icon name="check" size={16} stroke={3} />}</span>
            <div className="grow"><div className="title">{e?.merchant} · {e && fmtMoney(e.amount, e.currency)}</div><div className="sub">{t.description}</div></div>
            <div className="end"><div className="title num">{fmtMoney(t.amount, h.homeCurrency, { decimals: true })}</div><div className="sub">{fmtDate(t.date)} · {s.score >= STRONG_MATCH ? 'Match' : 'Possible'}</div></div>
          </button>; })}</div>
      </div>}

      <div className="section">
        <div className="section-head"><h3>New to review</h3><span className="aside">{preview.fresh.length - preview.suggestions.length}</span></div>
        <div className="group">{preview.fresh.map((t, i) => preview.suggestions.some(s => s.tmpIndex === i) ? null :
          <div className="row" key={i} style={{ cursor: 'default' }}><div className="grow"><div className="title" style={{ fontWeight: 550 }}>{t.description}</div><div className="sub">{fmtDate(t.date)}{t.foreignCurrency ? ` · ${fmtMoney(t.foreignAmount, t.foreignCurrency)}` : ''}{t.isFee ? ' · fee' : ''}</div></div>
            <div className="end num">{fmtMoney(t.amount, h.homeCurrency, { decimals: true })}</div></div>).slice(0, 60)}</div>
        <p className="small muted" style={{ margin: '8px 4px' }}>You'll decide what to do with these on the Reconcile screen. Nothing is added to your budget until you choose.</p>
      </div>
      <button className="btn primary block" onClick={doImport} disabled={!preview.fresh.length}>{preview.fresh.length ? `Import ${preview.fresh.length} transaction${preview.fresh.length === 1 ? "" : "s"}` : "Nothing new to import"}</button>
      <div className="spacer" />
      <button className="btn block" onClick={() => { setRows(null); setPreview(null); setMap(undefined); }}>Choose a different file</button>
    </>}
  </>;
}
