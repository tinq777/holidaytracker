import { db } from './db';

const TABLES = ['holidays', 'expenses', 'accommodations', 'paymentMethods', 'checklist', 'templates', 'lessons', 'statementTxns', 'rates', 'merchantRules'] as const;
type TableName = typeof TABLES[number];
export interface BackupFile { app: 'holiday-tracker'; version: 1; exportedAt: string; data: Record<TableName, unknown[]> }

/** Everything except settings (so an AI API key is never written into a backup file). */
export async function buildBackup(): Promise<BackupFile> {
  const data = {} as Record<TableName, unknown[]>;
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  return { app: 'holiday-tracker', version: 1, exportedAt: new Date().toISOString(), data };
}

export async function downloadBackup() {
  const b = await buildBackup();
  const name = `holiday-backup-${b.exportedAt.slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(b)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  // iOS home-screen apps: the share sheet is the reliable way to "Save to Files".
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; } catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'downloaded';
}

export function parseBackup(text: string): BackupFile {
  let j: BackupFile;
  try { j = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  if (j?.app !== 'holiday-tracker' || !j.data || !Array.isArray(j.data.holidays)) throw new Error('This is not a Holiday Tracker backup file.');
  return j;
}

export const summarise = (b: BackupFile) => ({
  holidays: (b.data.holidays as { name: string }[]).map(h => h.name),
  expenses: b.data.expenses?.length ?? 0
});

/** merge: add new + replace same-id records. replace: wipe this device first. */
export async function restoreBackup(b: BackupFile, mode: 'merge' | 'replace') {
  await db.transaction('rw', TABLES.map(t => db.table(t)), async () => {
    for (const t of TABLES) {
      if (mode === 'replace') await db.table(t).clear();
      const rows = b.data[t] ?? [];
      if (rows.length) await db.table(t).bulkPut(rows);
    }
  });
}
