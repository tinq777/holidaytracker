import { db, uid } from './db';
import type { Attachment } from './types';

export const MAX_ATTACHMENT_MB = 15;

/** Photos are downsized (tickets stay readable at 2000px); PDFs and other files are kept as they are. */
async function prepare(file: File): Promise<{ blob: Blob; type: string; name: string }> {
  if (file.type.startsWith('image/') && file.type !== 'image/gif') {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.82));
      if (blob && blob.size < file.size) return { blob, type: 'image/jpeg', name: file.name.replace(/\.(heic|heif|png|webp)$/i, '.jpg') };
    } catch { /* fall back to the original */ }
  }
  return { blob: file, type: file.type || 'application/octet-stream', name: file.name };
}

/** Returns the names of files skipped for being too large. */
export async function addAttachments(holidayId: string, ownerId: string, files: FileList | File[]): Promise<string[]> {
  const skipped: string[] = [];
  for (const f of Array.from(files)) {
    if (f.size > MAX_ATTACHMENT_MB * 1024 * 1024) { skipped.push(f.name); continue; }
    const p = await prepare(f);
    const a: Attachment = { id: uid(), holidayId, ownerId, name: p.name || 'Attachment', type: p.type, size: p.blob.size, blob: p.blob, createdAt: Date.now() };
    await db.attachments.add(a);
  }
  return skipped;
}

export const deleteAttachmentsFor = (ownerId: string) => db.attachments.where('ownerId').equals(ownerId).delete();

/** Opens the iOS share sheet (Save to Files, Books, Mail…). Falls back to a download elsewhere. */
export async function shareAttachment(a: Attachment) {
  const file = new File([a.blob], a.name, { type: a.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: a.name }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(a.blob);
  const link = document.createElement('a'); link.href = url; link.download = a.name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const fmtSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/* Backups are JSON, so files travel as data URLs. */
export const blobToDataURL = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
export function dataURLToBlob(d: string): Blob {
  const [head, body] = d.split(',', 2);
  const type = head.match(/data:([^;,]+)/)?.[1] ?? 'application/octet-stream';
  const bin = head.includes(';base64') ? atob(body) : decodeURIComponent(body);
  const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
