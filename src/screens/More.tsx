import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid, setSetting } from '../lib/db';
import { downloadBackup, parseBackup, restoreBackup, summarise, type BackupFile } from '../lib/backup';
import { refreshRates, setManualRate, fillMissingEstimates } from '../lib/rates';
import { loadSampleData } from '../lib/demo';
import { loadAISettings, DEFAULT_MODEL, type AISettings } from '../ai';
import { AnthropicProvider } from '../ai/providers';
import { usePaymentMethods } from '../lib/hooks';
import { Field, Header, Icon, Sheet, go, useOnline, useUI } from '../components/ui';
import type { PaymentMethod } from '../lib/types';

export default function More({ section }: { section?: string }) {
  if (section === 'backup') return <Backup />;
  if (section === 'ai') return <AI />;
  if (section === 'payments') return <Payments />;
  if (section === 'rates') return <Rates />;
  if (section === 'data') return <DataSection />;
  const Row = ({ to, title, sub }: { to: string; title: string; sub: string }) => <button className="row" onClick={() => go(to)}><div className="grow"><div className="title">{title}</div><div className="sub">{sub}</div></div><span className="chev"><Icon name="chev" size={18} /></span></button>;
  return <>
    <Header large title="More" />
    <div className="group">
      <Row to="/more/backup" title="Backup and restore" sub="Save all holiday data to a file, or restore it" />
    </div>
    <div className="spacer" />
    <div className="group">
      <Row to="/compare" title="Compare trips" sub="Side by side costs for past holidays" />
      <Row to="/more/payments" title="Payment methods" sub="Name your cards, e.g. ANZ Black" />
      <Row to="/more/rates" title="Exchange rates" sub="Saved rates used for estimates" />
      <Row to="/more/ai" title="AI reading" sub="Read screenshots and receipts automatically" />
      <Row to="/more/data" title="Storage and privacy" sub="What's stored, learned categories, sample data" />
    </div>
    <p className="small muted" style={{ margin: '16px 4px' }}>Your data lives only on this device. No account, no tracking, no ads. Export a backup now and then; deleting the app from your Home Screen deletes its data.</p>
  </>;
}

function Backup() {
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [err, setErr] = useState('');
  const { toast } = useUI();
  const counts = useLiveQuery(async () => ({ h: await db.holidays.count(), e: await db.expenses.count() }), []);
  const lastExport = useLiveQuery(() => db.settings.get('lastExport'), []);
  async function onFile(f?: File) { setErr(''); if (!f) return; try { setPending(parseBackup(await f.text())); } catch (e) { setErr((e as Error).message); } }
  async function apply(mode: 'merge' | 'replace') { await restoreBackup(pending!, mode); setPending(null); toast('Backup restored'); go('/'); }
  return <>
    <Header title="Backup" back="/more" />
    <div className="card">
      <b>Export backup</b>
      <p className="small muted" style={{ margin: '4px 0 12px' }}>{counts?.h ?? 0} holiday{counts?.h === 1 ? '' : 's'} and {counts?.e ?? 0} expense{counts?.e === 1 ? '' : 's'} saved as one JSON file. On iPhone, choose "Save to Files". Your AI key is never included.</p>
      <button className="btn primary block" onClick={async () => { const r = await downloadBackup(); if (r !== 'cancelled') { await setSetting('lastExport', Date.now()); toast('Backup exported'); } }}><Icon name="download" />Export backup</button>
      {lastExport?.value ? <p className="tiny muted" style={{ marginBottom: 0 }}>Last exported {new Date(lastExport.value as number).toLocaleString('en-AU')}</p> : null}
    </div>
    <div className="card">
      <b>Import backup</b>
      <p className="small muted" style={{ margin: '4px 0 12px' }}>You'll see what's in the file before anything changes.</p>
      <label className="btn block" style={{ position: 'relative' }}><Icon name="upload" />Choose backup file<input type="file" accept=".json,application/json" style={{ position: 'absolute', inset: 0, opacity: 0 }} onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
      {err && <div className="notice bad">{err}</div>}
    </div>
    {pending && <Sheet title="Restore backup" onClose={() => setPending(null)}>
      <div className="notice">This will add/replace holiday data on this device.</div>
      <p className="small">Backup from {new Date(pending.exportedAt).toLocaleString('en-AU')}: {summarise(pending).holidays.length} holiday{summarise(pending).holidays.length === 1 ? '' : 's'} ({summarise(pending).holidays.join(', ') || 'none'}), {summarise(pending).expenses} expenses.</p>
      <button className="btn primary block" onClick={() => apply('merge')}>Add to this device</button>
      <p className="tiny muted">Keeps everything already here. Records that exist in both are replaced by the backup's version.</p>
      <button className="btn danger block" onClick={() => apply('replace')}>Replace everything on this device</button>
      <p className="tiny muted">Deletes current data first, then restores the backup.</p>
    </Sheet>}
  </>;
}

function AI() {
  const [s, setS] = useState<AISettings | null>(null);
  const [test, setTest] = useState('');
  const online = useOnline(); const { toast } = useUI();
  useEffect(() => { loadAISettings().then(setS); }, []);
  if (!s) return null;
  const save = async (n: AISettings) => { setS(n); await setSetting('ai', n); };
  async function runTest() {
    setTest('Testing…');
    try { const r = await new AnthropicProvider(s!.apiKey!, s!.model || DEFAULT_MODEL).extract({ kind: 'text', source: 'voice', text: '128 yuan dinner, Alipay' }, { homeCurrency: 'AUD', travelCurrencies: ['CNY'], categories: ['Food', 'Transport', 'Other'], paymentMethods: ['Alipay', 'Cash'], tripStart: '2027-04-01', tripEnd: '2027-04-14', today: '2027-04-02' }); setTest(`Working: ${r.merchant ?? ''} ${r.amount} ${r.currency}, ${r.category}`); }
    catch (e) { setTest((e as Error).message); }
  }
  const opt = (id: AISettings['provider'], title: string, sub: string) => <button className={'row'} onClick={() => save({ ...s, provider: id })}>
    <span className={'check' + (s.provider === id ? ' on' : '')}>{s.provider === id && <Icon name="check" size={16} stroke={3} />}</span>
    <div className="grow"><div className="title">{title}</div><div className="sub" style={{ whiteSpace: 'normal' }}>{sub}</div></div></button>;
  return <>
    <Header title="AI reading" back="/more" />
    <p className="small muted" style={{ margin: '0 4px 12px' }}>Spoken and typed entries are always understood on this phone. AI is only needed to read screenshots and receipt photos, and only runs when you capture one.</p>
    <div className="group">
      {opt('none', 'Off', 'Images are saved to To confirm for you to fill in. Nothing leaves the phone.')}
      {opt('demo', 'Demo', 'Returns sample results (¥128 restaurant, ¥46 Didi…) without reading the image. For trying the workflow.')}
      {opt('anthropic', 'Claude', 'Sends the captured image to Anthropic\'s API using your own key.')}
    </div>
    {s.provider === 'anthropic' && <div className="card" style={{ marginTop: 12 }}>
      <Field label="Anthropic API key"><input className="input" type="password" autoComplete="off" value={s.apiKey ?? ''} placeholder="sk-ant-…" onChange={e => save({ ...s, apiKey: e.target.value.trim() })} /></Field>
      <Field label="Model"><input className="input" value={s.model ?? DEFAULT_MODEL} onChange={e => save({ ...s, model: e.target.value.trim() })} /></Field>
      <p className="tiny muted">The key is stored on this device only and is not included in backups. Use a key with a low spending limit, since anyone with this phone unlocked could use the app.</p>
      <button className="btn block" disabled={!s.apiKey || !online} onClick={runTest}>{online ? 'Test connection' : 'Connect to the internet to test'}</button>
      {test && <p className="small">{test}</p>}
    </div>}
    <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => { toast('Saved'); go('/more'); }}>Done</button>
  </>;
}

function Payments() {
  const pms = usePaymentMethods(); const [name, setName] = useState(''); const [kind, setKind] = useState<PaymentMethod['kind']>('credit');
  const { confirm } = useUI();
  const builtIn = (id: string) => id.startsWith('pm-') && id !== 'pm-mycard';
  return <>
    <Header title="Payment methods" back="/more" />
    <div className="group">{pms.map(p => <div className="row" key={p.id} style={{ cursor: 'default' }}>
      <div className="grow"><div className="title">{p.name}</div><div className="sub">{{ cash: 'Cash', credit: 'Credit card', debit: 'Debit card', wallet: 'Payment app', transfer: 'Bank transfer', other: 'Other' }[p.kind]}</div></div>
      {!builtIn(p.id) && <button className="icon-btn" style={{ boxShadow: 'none', color: 'var(--faint)' }} aria-label={`Remove ${p.name}`} onClick={async () => { if (await confirm({ title: `Remove ${p.name}?`, body: 'Expenses already paid with it keep their record but show no payment method.', ok: 'Remove', danger: true })) db.paymentMethods.delete(p.id); }}><Icon name="trash" size={18} /></button>}
    </div>)}</div>
    <div className="section">
      <div className="section-head"><h3>Add a card or method</h3></div>
      <Field label="Name"><input className="input" value={name} placeholder="ANZ Black" onChange={e => setName(e.target.value)} /></Field>
      <div className="chips" style={{ marginBottom: 12 }}>{(['credit', 'debit', 'wallet', 'cash', 'other'] as const).map(k => <button key={k} className={'chip' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>{{ credit: 'Credit', debit: 'Debit', wallet: 'Payment app', cash: 'Cash', other: 'Other' }[k]}</button>)}</div>
      <button className="btn primary block" disabled={!name.trim()} onClick={async () => { await db.paymentMethods.add({ id: uid(), name: name.trim(), kind, order: pms.length }); setName(''); }}>Add</button>
    </div>
  </>;
}

function Rates() {
  const data = useLiveQuery(async () => {
    const hs = await db.holidays.toArray(); const pairs = new Set<string>();
    hs.forEach(h => h.currencies.forEach(c => pairs.add(`${c}>${h.homeCurrency}`)));
    const rates = await db.rates.toArray();
    return [...pairs].map(p => ({ pair: p, r: rates.find(x => x.pair === p) }));
  }, []);
  const online = useOnline(); const { toast } = useUI(); const [busy, setBusy] = useState(false);
  async function update() {
    setBusy(true); const hs = await db.holidays.toArray(); let ok = false;
    for (const home of new Set(hs.map(h => h.homeCurrency))) ok = (await refreshRates(home, [...new Set(hs.filter(h => h.homeCurrency === home).flatMap(h => h.currencies))])) || ok;
    for (const h of hs) await fillMissingEstimates(h);
    setBusy(false); toast(ok ? 'Rates updated' : 'Could not reach the rates service');
  }
  return <>
    <Header title="Exchange rates" back="/more" />
    <p className="small muted" style={{ margin: '0 4px 12px' }}>Each expense keeps the rate used when it was recorded. New expenses use these saved rates; actual card charges replace estimates when you import a statement.</p>
    {data?.length ? <div className="group">{data.map(({ pair, r }) => { const [from, to] = pair.split('>'); return <div className="row" key={pair} style={{ cursor: 'default' }}>
      <div className="grow"><div className="title">1 {from} = {r ? r.rate.toFixed(4) : '?'} {to}</div><div className="sub">{r ? `${r.source === 'manual' ? 'Set by you' : 'Online'} · ${new Date(r.updatedAt).toLocaleDateString('en-AU')}` : 'No rate saved yet'}</div></div>
      <button className="btn sm" onClick={async () => { const v = prompt(`${to} per 1 ${from}`, r ? r.rate.toFixed(4) : ''); const n = v ? parseFloat(v) : NaN; if (n > 0) { await setManualRate(from, to, n); for (const h of await db.holidays.toArray()) await fillMissingEstimates(h); toast('Rate saved'); } }}>Set</button>
    </div>; })}</div> : <div className="empty">Add travel currencies to a holiday to see rates here.</div>}
    <div className="spacer" />
    <button className="btn primary block" disabled={!online || busy} onClick={update}>{online ? (busy ? 'Updating…' : 'Update from internet') : 'Offline: saved rates in use'}</button>
  </>;
}

function DataSection() {
  const [est, setEst] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({});
  const rules = useLiveQuery(() => db.merchantRules.orderBy('key').toArray(), [], []);
  const images = useLiveQuery(() => db.expenses.filter(e => !!e.pendingImage).count(), [], 0);
  const { toast, confirm } = useUI();
  useEffect(() => { (async () => { const e = await navigator.storage?.estimate?.(); const p = await navigator.storage?.persisted?.(); setEst({ usage: e?.usage, quota: e?.quota, persisted: p }); })(); }, []);
  return <>
    <Header title="Storage and privacy" back="/more" />
    <div className="card small">
      <div>Using {est.usage !== undefined ? `${(est.usage / 1048576).toFixed(1)} MB` : '—'} on this device{est.persisted ? ', protected from automatic clean-up' : ''}.</div>
      <div className="muted" style={{ marginTop: 6 }}>Captured images are shrunk and kept only until you confirm the expense; after that a small thumbnail remains. {images} full image{images === 1 ? '' : 's'} waiting in To confirm.</div>
    </div>
    <div className="section">
      <div className="section-head"><h3>Learned categories</h3><span className="aside">{rules.length}</span></div>
      <p className="small muted" style={{ margin: '0 4px 8px' }}>When you confirm or correct an expense, the app remembers that merchant's category on this phone.</p>
      {rules.length > 0 && <div className="group">{rules.slice(0, 50).map(r => <div className="row" key={r.key} style={{ cursor: 'default' }}><div className="grow"><div className="title" style={{ fontWeight: 550 }}>{r.key}</div><div className="sub">{r.category} · used {r.uses}×</div></div>
        <button className="btn ghost sm" onClick={() => db.merchantRules.delete(r.key)}>Forget</button></div>)}</div>}
    </div>
    <div className="section">
      <div className="section-head"><h3>Sample data</h3></div>
      <button className="btn block" onClick={async () => toast((await loadSampleData()) ? 'Sample trips added: China 2026 and Spain 2026' : 'Sample trips are already here')}>Add sample trips</button>
      <div className="spacer" />
      <button className="btn danger block" onClick={async () => { if (await confirm({ title: 'Erase all data on this device?', body: 'Every holiday, expense and setting will be deleted. Export a backup first if you need it.', ok: 'Erase everything', danger: true })) { await db.delete(); location.hash = '/'; location.reload(); } }}>Erase all data</button>
    </div>
  </>;
}
