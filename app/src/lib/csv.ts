import { isISODate } from './dates';

export function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  const t = text.replace(/^\uFEFF/, '');
  const delim = (t.split('\n')[0].match(/;/g)?.length ?? 0) > (t.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell.trim()); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell.trim()); cell = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some(x => x !== '')) rows.push(row);
  return rows;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Parses common bank date formats. Day-first is assumed for slashed dates (AU/UK banks). */
export function parseDate(s: string, dayFirst = true): string | undefined {
  s = s.trim().split(/[ T]\d{1,2}:\d{2}/)[0].trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return dayFirst ? iso(y, +m[2], +m[1]) : iso(y, +m[1], +m[2]); }
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-,]+(\d{2,4})$/);
  if (m) { const mo = MONTHS.indexOf(m[2].toLowerCase()) + 1; const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return mo ? iso(y, mo, +m[1]) : undefined; }
  m = s.match(/^([A-Za-z]{3})[A-Za-z]*\s(\d{1,2}),?\s(\d{4})$/);
  if (m) { const mo = MONTHS.indexOf(m[1].toLowerCase()) + 1; return mo ? iso(+m[3], mo, +m[2]) : undefined; }
  return undefined;
}
function iso(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const r = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isISODate(r) ? r : undefined;
}

export function parseAmount(s: string): number | undefined {
  if (!s) return undefined;
  let t = s.trim(); let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/\bDR\b/i.test(t)) neg = true;
  t = t.replace(/\b(CR|DR|AUD|USD)\b/gi, '').replace(/[$€£¥\s]/g, '');
  if (t.endsWith('-')) { neg = true; t = t.slice(0, -1); }
  if (!/^[-+]?\d[\d,]*(\.\d+)?$/.test(t)) return undefined;
  const n = parseFloat(t.replace(/,/g, ''));
  return isNaN(n) ? undefined : neg ? -Math.abs(n) : n;
}

export interface ColumnMap { hasHeader: boolean; date: number; description: number; amount?: number; debit?: number; credit?: number; currency?: number }

export function detectColumns(rows: string[][]): ColumnMap | undefined {
  if (!rows.length) return undefined;
  const head = rows[0].map(h => h.toLowerCase());
  const looksHeader = head.some(h => /date|amount|description|details|narrative|debit|credit|merchant|transaction/.test(h)) && !head.some(h => parseDate(h));
  const find = (re: RegExp) => { const i = head.findIndex(h => re.test(h)); return i >= 0 ? i : undefined; };
  if (looksHeader) {
    const date = find(/^(transaction )?date|date$|posted|processed/) ?? find(/date/);
    const description = find(/description|details|narrative|merchant|payee|particulars|memo/) ?? find(/transaction/);
    const amount = find(/^amount|amount$|value/);
    const debit = find(/debit|withdrawal|money out|paid out/);
    const credit = find(/credit|deposit|money in|paid in/);
    const currency = find(/currency|ccy/);
    if (date === undefined || description === undefined || (amount === undefined && debit === undefined)) return undefined;
    return { hasHeader: true, date, description, amount, debit, credit, currency };
  }
  // headerless (e.g. ANZ/CBA exports): infer by content
  const sample = rows.slice(0, 20); const width = Math.max(...sample.map(r => r.length));
  let date = -1, amount = -1, description = -1, bestLen = 0;
  for (let c = 0; c < width; c++) {
    const vals = sample.map(r => r[c] ?? '');
    if (date < 0 && vals.filter(v => parseDate(v)).length >= sample.length * 0.8) { date = c; continue; }
    if (amount < 0 && vals.filter(v => parseAmount(v) !== undefined).length >= sample.length * 0.8) { amount = c; continue; }
    const len = vals.reduce((s, v) => s + (/[a-z]/i.test(v) ? v.length : 0), 0);
    if (len > bestLen) { bestLen = len; description = c; }
  }
  if (date < 0 || amount < 0 || description < 0) return undefined;
  return { hasHeader: false, date, description, amount };
}

export interface ParsedTxn { date: string; description: string; amount: number; foreignAmount?: number; foreignCurrency?: string; isFee: boolean; raw: string[] }

const FX_RE = /(?:\b([A-Z]{3})\s?(\d[\d,]*\.?\d*)|(\d[\d,]*\.\d{2})\s?([A-Z]{3})\b)/;
const FEE_RE = /\b(fee|intnl|int'?l|international|overseas|o\/s|foreign)\b.*\b(fee|charge|txn|transaction)\b|\bforeign (currency|transaction)\b|\bintl txn\b|\bo\/s txn fee\b/i;

export function extractTxns(rows: string[][], map: ColumnMap, home: string): { txns: ParsedTxn[]; skipped: number } {
  const data = map.hasHeader ? rows.slice(1) : rows;
  // Determine sign convention: if most amounts are negative, negatives are spend.
  const amounts = data.map(r => map.amount !== undefined ? parseAmount(r[map.amount]) : undefined).filter((n): n is number => n !== undefined);
  const negMostly = amounts.filter(n => n < 0).length >= amounts.length / 2;
  const txns: ParsedTxn[] = []; let skipped = 0;
  for (const r of data) {
    const date = parseDate(r[map.date] ?? '');
    const description = (r[map.description] ?? '').replace(/\s+/g, ' ').trim();
    let spend: number | undefined;
    if (map.debit !== undefined && (r[map.debit] ?? '').trim()) spend = Math.abs(parseAmount(r[map.debit]) ?? NaN);
    else if (map.amount !== undefined) {
      const a = parseAmount(r[map.amount]);
      if (a !== undefined) spend = negMostly ? (a < 0 ? -a : undefined) : (a > 0 ? a : undefined);
    }
    if (!date || !description || spend === undefined || isNaN(spend) || spend === 0) { skipped++; continue; }
    const fx = description.match(FX_RE);
    let foreignCurrency: string | undefined, foreignAmount: number | undefined;
    if (fx) {
      const cur = fx[1] ?? fx[4]; const amt = parseFloat((fx[2] ?? fx[3]).replace(/,/g, ''));
      if (cur && cur !== home && !isNaN(amt) && /^(CNY|EUR|USD|GBP|JPY|THB|IDR|VND|KRW|SGD|HKD|NZD|MYR|PHP|INR|CAD|CHF|TWD|FJD|RMB)$/.test(cur)) {
        foreignCurrency = cur === 'RMB' ? 'CNY' : cur; foreignAmount = amt;
      }
    }
    if (map.currency !== undefined) {
      const c = (r[map.currency] ?? '').toUpperCase();
      if (c && c !== home && /^[A-Z]{3}$/.test(c) && !foreignCurrency) { foreignCurrency = c; foreignAmount = spend; }
    }
    txns.push({ date, description, amount: Math.round(spend * 100) / 100, foreignAmount, foreignCurrency, isFee: FEE_RE.test(description), raw: r });
  }
  return { txns, skipped };
}

export const txnFingerprint = (t: { date: string; description: string; amount: number }) => `${t.date}|${t.amount.toFixed(2)}|${t.description.toLowerCase().replace(/\s+/g, ' ').slice(0, 40)}`;
