const SYMBOL_OVERRIDES: Record<string, string> = { CNY: '¥', JPY: '¥', EUR: '€', GBP: '£', AUD: '$', USD: 'US$', NZD: 'NZ$', THB: '฿', KRW: '₩', VND: '₫', IDR: 'Rp', INR: '₹', SGD: 'S$', HKD: 'HK$', MYR: 'RM', PHP: '₱' };
const NO_DECIMALS = new Set(['JPY', 'KRW', 'VND', 'IDR']);

export function fmtMoney(amount: number | undefined, currency: string, opts: { decimals?: boolean; sign?: boolean } = {}) {
  if (amount === undefined || isNaN(amount)) return '—';
  const dec = opts.decimals ?? (!NO_DECIMALS.has(currency) && Math.abs(amount) < 1000 && Math.round(amount) !== amount);
  const sym = SYMBOL_OVERRIDES[currency] ?? currency + ' ';
  const n = Math.abs(amount).toLocaleString('en-AU', { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 });
  const sign = amount < 0 ? '−' : opts.sign && amount > 0 ? '+' : '';
  return `${sign}${sym}${n}`;
}
export const round2 = (n: number) => Math.round(n * 100) / 100;

export const COMMON_CURRENCIES = ['AUD', 'CNY', 'EUR', 'USD', 'GBP', 'JPY', 'NZD', 'SGD', 'HKD', 'THB', 'IDR', 'VND', 'KRW', 'MYR', 'PHP', 'INR', 'CAD', 'CHF', 'TWD', 'FJD'];
