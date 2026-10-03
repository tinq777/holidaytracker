import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { fmtMoney } from '../lib/money';

/* ---------- routing (hash based: works on GitHub Pages and offline) ---------- */
export function useRoute() {
  const [hash, setHash] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => { const f = () => { setHash(location.hash.slice(1) || '/'); window.scrollTo(0, 0); }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return hash.split('?')[0].split('/').filter(Boolean);
}
export const go = (path: string) => { location.hash = path; };

export function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => { const a = () => setOn(true), b = () => setOn(false); addEventListener('online', a); addEventListener('offline', b); return () => { removeEventListener('online', a); removeEventListener('offline', b); }; }, []);
  return on;
}

/* ---------- icons ---------- */
const P: Record<string, ReactNode> = {
  trips: <><path d="M4 7h16v12H4z" /><path d="M9 7V5h6v2" /><path d="M4 12h16" /></>,
  expenses: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18M7 15h4" /></>,
  checklist: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M3.5 18l1.5 1.5 2.5-2.5" /></>,
  more: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="m15 5-7 7 7 7" />,
  chev: <path d="m9 6 6 6-6 6" />,
  camera: <><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  image: <><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9.5" r="1.6" /><path d="m5 18 5-5 3 3 2-2 4 4" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></>,
  pen: <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  upload: <><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4 15v4h16v-4" /></>,
  download: <><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" /><path d="M4 15v4h16v-4" /></>,
  bed: <><path d="M3 18V7M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6" /><circle cx="7" cy="11" r="2" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.6 0l3-3A4 4 0 0 0 13 5.4l-1 1" /><path d="M14 10a4 4 0 0 0-5.6 0l-3 3A4 4 0 0 0 11 18.6l1-1" /></>,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  scale: <><path d="M12 4v16M5 20h14M6 8h12" /><path d="m6 8-3 6a3 3 0 0 0 6 0zM18 8l-3 6a3 3 0 0 0 6 0z" /></>
};
export function Icon({ name, size = 22, stroke = 2 }: { name: keyof typeof P | string; size?: number; stroke?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{P[name]}</svg>;
}

export const CATEGORY_STYLE: Record<string, { emoji: string; bg: string }> = {
  Flights: { emoji: '✈️', bg: '#E4ECF7' }, Accommodation: { emoji: '🛏️', bg: '#ECE7F6' }, Transport: { emoji: '🚕', bg: '#FFF2CC' },
  Food: { emoji: '🍜', bg: '#FCE7DE' }, Activities: { emoji: '🎟️', bg: '#E2F2EA' }, Shopping: { emoji: '🛍️', bg: '#F8E3EC' },
  Kids: { emoji: '🧸', bg: '#FFF0E0' }, Other: { emoji: '•', bg: '#ECEFF2' }
};
export function CatDot({ cat }: { cat: string }) {
  const s = CATEGORY_STYLE[cat] ?? { emoji: cat.slice(0, 1).toUpperCase(), bg: '#ECEFF2' };
  return <span className="cat-dot" style={{ background: s.bg, color: '#13202E' }} aria-hidden>{s.emoji}</span>;
}

export function Money({ v, c, className, sign }: { v: number | undefined; c: string; className?: string; sign?: boolean }) {
  return <span className={'num ' + (className ?? '')}>{fmtMoney(v, c, { sign })}</span>;
}

export function BudgetBar({ spent, budget, projected, status, thin }: { spent: number; budget: number; projected?: number | null; status: string; thin?: boolean }) {
  const w = (n: number) => `${Math.min(100, budget > 0 ? (n / budget) * 100 : 0)}%`;
  return (
    <div className={`bar ${status} ${thin ? 'thin' : ''}`} role="progressbar" aria-valuenow={Math.round(spent)} aria-valuemax={budget}>
      {projected != null && projected > spent && <i className="proj" style={{ width: w(projected) }} />}
      <i style={{ width: w(spent) }} />
    </div>
  );
}

/* ---------- sheet ---------- */
export function Sheet({ title, onClose, children, action }: { title: string; onClose: () => void; children: ReactNode; action?: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); document.body.style.overflow = 'hidden'; return () => { removeEventListener('keydown', k); document.body.style.overflow = ''; }; }, [onClose]);
  return <>
    <div className="backdrop" onClick={onClose} />
    <div className="sheet" role="dialog" aria-modal aria-label={title}>
      <div className="grabber" />
      <div className="sheet-head">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <h3>{title}</h3>
        <div style={{ minWidth: 70, textAlign: 'right' }}>{action}</div>
      </div>
      <div className="sheet-body">{children}</div>
    </div>
  </>;
}

/* ---------- toast + confirm ---------- */
type ToastT = { msg: string; action?: { label: string; run: () => void } } | null;
type ConfirmT = { title: string; body?: string; ok: string; danger?: boolean; resolve: (v: boolean) => void } | null;
const Ctx = createContext<{ toast: (msg: string, action?: { label: string; run: () => void }) => void; confirm: (o: { title: string; body?: string; ok: string; danger?: boolean }) => Promise<boolean> }>({ toast: () => {}, confirm: async () => false });
export const useUI = () => useContext(Ctx);

export function UIProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<ToastT>(null);
  const [c, setC] = useState<ConfirmT>(null);
  const toast = useCallback((msg: string, action?: { label: string; run: () => void }) => { setT({ msg, action }); }, []);
  useEffect(() => { if (!t) return; const id = setTimeout(() => setT(null), t.action ? 5000 : 2600); return () => clearTimeout(id); }, [t]);
  const confirm = useCallback((o: { title: string; body?: string; ok: string; danger?: boolean }) => new Promise<boolean>(resolve => setC({ ...o, resolve })), []);
  const close = (v: boolean) => { c?.resolve(v); setC(null); };
  return <Ctx.Provider value={{ toast, confirm }}>
    {children}
    {t && <div className="toast" role="status">{t.msg}{t.action && <button onClick={() => { t.action!.run(); setT(null); }}>{t.action.label}</button>}</div>}
    {c && <>
      <div className="backdrop" onClick={() => close(false)} />
      <div className="sheet" role="alertdialog" aria-label={c.title}>
        <div className="sheet-body" style={{ paddingTop: 22 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 20 }}>{c.title}</h3>
          {c.body && <p className="muted" style={{ marginTop: 0 }}>{c.body}</p>}
          <div className="btn-row" style={{ marginTop: 18 }}>
            <button className="btn" onClick={() => close(false)}>Cancel</button>
            <button className={'btn ' + (c.danger ? 'danger' : 'primary')} onClick={() => close(true)}>{c.ok}</button>
          </div>
        </div>
      </div>
    </>}
  </Ctx.Provider>;
}

export function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (n: number) => void; min?: number }) {
  return <div className="stepper"><button type="button" aria-label="Decrease" onClick={() => onChange(Math.max(min, value - 1))}>−</button><b>{value}</b><button type="button" aria-label="Increase" onClick={() => onChange(value + 1)}>+</button></div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function Header({ title, back, right, large }: { title: string; back?: string | (() => void); right?: ReactNode; large?: boolean }) {
  const onBack = typeof back === 'function' ? back : () => (back ? go(back) : history.back());
  if (large) return <div className="top"><h1>{title}</h1>{right}</div>;
  return <div className="top">
    <button className="back" onClick={onBack}><Icon name="back" size={24} />Back</button>
    <h2>{title}</h2>
    <div style={{ minWidth: 66, display: 'flex', justifyContent: 'flex-end' }}>{right}</div>
  </div>;
}

export const numOr = (s: string) => { const n = parseFloat(s.replace(/,/g, '')); return isNaN(n) ? undefined : n; };
