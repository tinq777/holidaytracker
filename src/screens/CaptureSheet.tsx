import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { captureImages, captureText } from '../lib/capture';
import { loadAISettings } from '../ai';
import { Icon, Sheet, go, useUI } from '../components/ui';
import { useApp } from '../App';
import { newDraft } from './Trip';
import type { Holiday } from '../lib/types';

type SR = { start: () => void; stop: () => void; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void; lang: string; interimResults: boolean };

export default function CaptureSheet({ holiday: h, onClose, onEdit }: { holiday: Holiday; onClose: () => void; onEdit: (id: string) => void }) {
  const [mode, setMode] = useState<'pick' | 'voice' | 'busy'>('pick');
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const rec = useRef<SR | null>(null);
  const ai = useLiveQuery(() => loadAISettings(), []);
  const { toast } = useUI();
  const { openExpense } = useApp();
  const SpeechRec = (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition;
  useEffect(() => () => rec.current?.stop(), []);

  async function onFiles(files: FileList | null, source: 'screenshot' | 'receipt') {
    if (!files?.length) return;
    setMode('busy');
    try {
      const ids = await captureImages(h, [...files], source);
      if (ids.length === 1) onEdit(ids[0]);
      else { onClose(); toast(`${ids.length} ${source}s added to To confirm`); go(`/trip/${h.id}/expenses`); }
    } catch (e) { toast((e as Error).message); setMode('pick'); }
  }

  async function submitText() {
    if (!text.trim()) return;
    setMode('busy');
    const id = await captureText(h, text.trim());
    onEdit(id);
  }

  function listen() {
    if (!SpeechRec) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new SpeechRec(); r.lang = navigator.language || 'en-AU'; r.interimResults = true;
    r.onresult = e => setText(Array.from(e.results).map(x => x[0].transcript).join(' '));
    r.onend = () => setListening(false); r.onerror = () => setListening(false);
    rec.current = r; r.start(); setListening(true);
  }

  const aiOff = ai && ai.provider === 'none';
  return <Sheet title={mode === 'voice' ? 'Say it' : 'Capture expense'} onClose={onClose} action={mode === 'voice' ? <button className="btn ghost" onClick={submitText} disabled={!text.trim()}>Add</button> : undefined}>
    {mode === 'busy' && <div className="empty"><b>Saving…</b>Images are shrunk before they're stored on this phone.</div>}
    {mode === 'pick' && <>
      <div className="capture-grid">
        <label className="capture-opt">
          <span className="ic"><Icon name="image" /></span><span><b>Screenshot</b><br /><small>Alipay, WeChat, bank app. Pick one or several.</small></span>
          <input type="file" accept="image/*" multiple onChange={e => onFiles(e.target.files, 'screenshot')} aria-label="Choose screenshots" />
        </label>
        <label className="capture-opt">
          <span className="ic"><Icon name="camera" /></span><span><b>Receipt photo</b><br /><small>Take a photo or choose one</small></span>
          <input type="file" accept="image/*" capture="environment" onChange={e => onFiles(e.target.files, 'receipt')} aria-label="Photograph a receipt" />
        </label>
        <button className="capture-opt" onClick={() => setMode('voice')}>
          <span className="ic"><Icon name="mic" /></span><span><b>Say it</b><br /><small>"128 yuan dinner, Alipay"</small></span>
        </button>
        <button className="capture-opt" onClick={() => { onClose(); openExpense(newDraft(h), { confirmOnSave: true }); }}>
          <span className="ic"><Icon name="pen" /></span><span><b>Type it</b><br /><small>Quick manual entry</small></span>
        </button>
      </div>
      <p className="small muted" style={{ margin: '14px 4px 0' }}>
        {aiOff ? <>AI reading is off, so screenshots and receipts are saved for you to fill in. Spoken entries are understood on this phone. <a href="#/more/ai" onClick={onClose}>Turn on AI reading</a></>
          : ai?.provider === 'demo' ? <>Demo mode: screenshots return sample results and are not actually read. <a href="#/more/ai" onClick={onClose}>Change</a></>
          : <>Images are sent to the AI provider you chose only when you capture them here.</>}
      </p>
    </>}
    {mode === 'voice' && <>
      <textarea className="input" autoFocus value={text} onChange={e => setText(e.target.value)} placeholder={'128 yuan dinner, Alipay\n46 yuan Didi to the hotel\n€35 lunch'} style={{ minHeight: 120, fontSize: 19 }} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), submitText())} />
      {SpeechRec ? <button className={'btn block ' + (listening ? 'danger' : 'primary')} style={{ marginTop: 10 }} onClick={listen}><Icon name="mic" />{listening ? 'Stop listening' : 'Start speaking'}</button>
        : <p className="small muted">Tip: tap the microphone on your keyboard to dictate.</p>}
      <button className="btn block" style={{ marginTop: 10 }} onClick={submitText} disabled={!text.trim()}>Add expense</button>
      <p className="small muted">Amount, currency, category and payment method are picked out for you. Works offline.</p>
    </>}
  </Sheet>;
}
