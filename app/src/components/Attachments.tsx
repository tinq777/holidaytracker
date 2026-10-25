import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { addAttachments, fmtSize, shareAttachment, MAX_ATTACHMENT_MB } from '../lib/attachments';
import { Icon, useUI } from './ui';
import type { Attachment } from '../lib/types';

export const useAttachmentCount = (ownerIds: string[]) =>
  useLiveQuery(async () => {
    const rows = await db.attachments.where('ownerId').anyOf(ownerIds).toArray();
    const m: Record<string, number> = {}; rows.forEach(r => (m[r.ownerId] = (m[r.ownerId] ?? 0) + 1)); return m;
  }, [ownerIds.join('|')], {} as Record<string, number>);

export function ClipCount({ n }: { n?: number }) {
  if (!n) return null;
  return <span className="clip-count" aria-label={`${n} attachment${n === 1 ? '' : 's'}`}><Icon name="clip" size={14} />{n}</span>;
}

/** Tickets, booking confirmations and receipts for one booking, stored on this device. */
export function Attachments({ holidayId, ownerId, label = 'Tickets & bookings' }: { holidayId: string; ownerId: string; label?: string }) {
  const list = useLiveQuery(() => db.attachments.where('ownerId').equals(ownerId).sortBy('createdAt'), [ownerId], []);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useUI();
  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const skipped = await addAttachments(holidayId, ownerId, files);
    setBusy(false);
    if (input.current) input.current.value = '';
    toast(skipped.length ? `Skipped ${skipped.length} file${skipped.length === 1 ? '' : 's'} over ${MAX_ATTACHMENT_MB} MB` : 'Attached');
  }
  return <div className="field">
    <span>{label}</span>
    {list.length > 0 && <div className="group attach-list">{list.map(a => <button type="button" key={a.id} className="row" onClick={() => setOpen(a)}>
      <Thumb a={a} />
      <div className="grow"><div className="title ellipsis">{a.name}</div><div className="sub">{a.type === 'application/pdf' ? 'PDF' : a.type.startsWith('image/') ? 'Image' : 'File'} · {fmtSize(a.size)}</div></div>
    </button>)}</div>}
    <button type="button" className="btn block attach-btn" disabled={busy} onClick={() => input.current?.click()}><Icon name="clip" size={18} />{busy ? 'Saving…' : list.length ? 'Attach another' : 'Attach ticket or booking'}</button>
    <input ref={input} type="file" accept="image/*,application/pdf,.pdf" multiple hidden onChange={e => onFiles(e.target.files)} aria-label="Attach files" />
    <small className="hint">PDFs, screenshots or photos. Kept on this device and included in backups.</small>
    {open && <Viewer a={open} onClose={() => setOpen(null)} />}
  </div>;
}

function useObjectURL(b?: Blob) {
  const [url, setUrl] = useState<string>();
  useEffect(() => { if (!b) return; const u = URL.createObjectURL(b); setUrl(u); return () => URL.revokeObjectURL(u); }, [b]);
  return url;
}

function Thumb({ a }: { a: Attachment }) {
  const url = useObjectURL(a.type.startsWith('image/') ? a.blob : undefined);
  return url ? <img className="attach-thumb" src={url} alt="" /> : <span className="attach-thumb icon"><Icon name="file" size={20} /></span>;
}

function Viewer({ a, onClose }: { a: Attachment; onClose: () => void }) {
  const url = useObjectURL(a.blob);
  const { confirm, toast } = useUI();
  const isImg = a.type.startsWith('image/'); const isPdf = a.type === 'application/pdf';
  return <div className="viewer" role="dialog" aria-modal aria-label={a.name}>
    <div className="viewer-head">
      <button className="btn ghost" onClick={onClose}>Close</button>
      <div className="ellipsis viewer-title">{a.name}</div>
      <button className="btn ghost" onClick={() => shareAttachment(a)}>Share</button>
    </div>
    <div className="viewer-body">
      {url && isImg && <img src={url} alt={a.name} />}
      {url && isPdf && <iframe src={url} title={a.name} />}
      {!isImg && !isPdf && <div className="empty"><b>No preview</b>Use Share to open it in another app.</div>}
    </div>
    <div className="viewer-foot">
      <button className="btn block" onClick={() => shareAttachment(a)}>Open in… / Save to Files</button>
      <button className="btn danger block" onClick={async () => { if (await confirm({ title: 'Remove this attachment?', ok: 'Remove', danger: true })) { await db.attachments.delete(a.id); toast('Attachment removed'); onClose(); } }}>Remove</button>
    </div>
  </div>;
}
