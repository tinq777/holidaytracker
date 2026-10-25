import { useEffect, useState } from 'react';

let pending: (() => void) | null = null;
const listeners = new Set<() => void>();

/** Called by the service worker registration when a new version has been downloaded. */
export function announceUpdate(apply: () => void) { pending = apply; listeners.forEach(l => l()); }

/** "New version available" toast. Refresh applies it; your data is kept on the device either way. */
export function UpdateToast() {
  const [show, setShow] = useState(!!pending);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const l = () => setShow(true); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  if (!show) return null;
  return <div className="update-toast" role="status">
    <div className="grow"><b>New version available</b><div className="small">Refresh to get the latest update.</div></div>
    <button className="btn ghost sm" onClick={() => setShow(false)}>Later</button>
    <button className="btn sm primary" disabled={busy} onClick={() => { setBusy(true); pending?.(); setTimeout(() => location.reload(), 1500); }}>{busy ? 'Updating…' : 'Refresh'}</button>
  </div>;
}
