import { keywordCategory } from './categorise';
import { addDays, todayISO } from './dates';

export interface ParsedText {
  amount?: number; currency?: string; merchant?: string; description?: string;
  category?: string; paymentMethodId?: string; date?: string; confidence: number;
}

const CURRENCY_WORDS: [RegExp, string][] = [
  [/^(yuan|rmb|cny|kuai|元|块)$/i, 'CNY'], [/^(euro|euros|eur)$/i, 'EUR'], [/^(yen|jpy|円)$/i, 'JPY'],
  [/^(pounds?|quid|gbp)$/i, 'GBP'], [/^(baht|thb)$/i, 'THB'], [/^(rupiah|idr)$/i, 'IDR'], [/^(dong|vnd)$/i, 'VND'],
  [/^(won|krw)$/i, 'KRW'], [/^(ringgit|myr)$/i, 'MYR'], [/^(usd|us dollars?)$/i, 'USD'], [/^(aud|aussie dollars?)$/i, 'AUD'],
  [/^(nzd)$/i, 'NZD'], [/^(sgd)$/i, 'SGD'], [/^(hkd)$/i, 'HKD'], [/^(dollars?|bucks)$/i, '$']
];
const SYMBOLS: Record<string, string> = { '¥': 'YEN', '￥': 'YEN', '€': 'EUR', '£': 'GBP', '฿': 'THB', '₩': 'KRW', '₫': 'VND', '$': '$', 'rp': 'IDR' };
const BRANDS = ['didi', 'uber', 'grab', 'starbucks', 'luckin', 'kfc', "mcdonald's", 'mcdonalds', 'pokémon store', 'pokemon store', 'pokémon center', 'pokemon center', 'uniqlo', 'familymart', '7-eleven', 'disneyland', 'meituan', 'taobao', 'ikea', 'bolt'];
const STOP = new Set(['a', 'an', 'the', 'for', 'at', 'on', 'with', 'via', 'using', 'paid', 'pay', 'by', 'and', 'of', 'in', 'spent', 'yesterday', 'today', 'to']);

export interface ParseContext { home: string; travel: string[]; paymentMethods: { id: string; name: string }[]; today?: string }

function resolveCurrency(token: string, ctx: ParseContext): string {
  if (token === '$') return ctx.travel.find(c => c.endsWith('D')) ?? ctx.home;
  if (token === 'YEN') return ctx.travel.includes('JPY') && !ctx.travel.includes('CNY') ? 'JPY' : 'CNY';
  return token;
}

export function parseExpenseText(input: string, ctx: ParseContext): ParsedText {
  let text = input.trim().replace(/[.!]+$/, '');
  const out: ParsedText = { confidence: 0 };
  const today = ctx.today ?? todayISO();

  // amount with optional currency symbol/code before or word after
  const m = text.match(/(¥|￥|€|£|฿|₩|₫|\$|rp\s?|[A-Z]{3}\s?)?\s?(\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(yuan|rmb|cny|kuai|元|块|euros?|eur|yen|jpy|円|pounds?|quid|gbp|baht|thb|rupiah|idr|dong|vnd|won|krw|ringgit|myr|usd|aud|nzd|sgd|hkd|dollars?|bucks)?\b/i);
  if (m) {
    out.amount = parseFloat(m[2].replace(/[,\s]/g, '') + (m[3] ? '.' + m[3] : ''));
    let cur: string | undefined;
    const pre = m[1]?.trim();
    if (pre) cur = SYMBOLS[pre.toLowerCase()] ?? (/^[A-Z]{3}$/.test(pre) ? pre : undefined);
    if (!cur && m[4]) cur = CURRENCY_WORDS.find(([re]) => re.test(m[4]))?.[1];
    out.currency = cur ? resolveCurrency(cur, ctx) : ctx.travel[0] ?? ctx.home;
    text = (text.slice(0, m.index) + ' ' + text.slice((m.index ?? 0) + m[0].length)).trim();
  }

  // dates
  if (/\byesterday\b/i.test(text)) out.date = addDays(today, -1);
  else out.date = today;

  // payment method: longest name that appears
  const lower = ' ' + text.toLowerCase() + ' ';
  const pms = [...ctx.paymentMethods].sort((a, b) => b.name.length - a.name.length);
  for (const pm of pms) {
    const n = pm.name.toLowerCase();
    const alias = n === 'wechat pay' ? ['wechat pay', 'wechat', 'weixin'] : n === 'credit card' ? ['credit card', 'card', 'credit'] : n === 'debit card' ? ['debit card', 'debit'] : [n];
    const hit = alias.find(a => lower.includes(' ' + a + ' ') || lower.includes(' ' + a + ',') || lower.includes(' ' + a));
    if (hit) { out.paymentMethodId = pm.id; text = text.replace(new RegExp(`\\b(paid\\s+)?(with|by|on|via|using)?\\s*${hit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), ' '); break; }
  }

  const desc = text.replace(/\byesterday\b|\btoday\b/gi, ' ').replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim();
  out.description = desc || undefined;
  out.category = keywordCategory(desc);

  const brand = BRANDS.find(b => desc.toLowerCase().includes(b));
  if (brand) out.merchant = titleCase(brand);
  else {
    const words = desc.split(' ').filter(w => w && !STOP.has(w.toLowerCase()));
    // "to the hotel" style destinations are description, not merchant
    const toIdx = desc.toLowerCase().indexOf(' to ');
    const head = toIdx > 0 ? desc.slice(0, toIdx).split(' ').filter(w => !STOP.has(w.toLowerCase())) : words;
    out.merchant = head.length ? titleCase(head.slice(0, 3).join(' ')) : undefined;
  }

  out.confidence = (out.amount ? 0.45 : 0) + (m?.[1] || m?.[4] ? 0.2 : 0) + (out.category ? 0.2 : 0) + (out.merchant ? 0.1 : 0) + (out.paymentMethodId ? 0.05 : 0);
  return out;
}

export const titleCase = (s: string) => s.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1));
