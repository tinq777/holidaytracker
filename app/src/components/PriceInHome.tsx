import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getRate } from '../lib/rates';
import { fmtMoney } from '../lib/money';

/** Saved exchange rate from → to (refreshed once from the internet when online). */
export function useRate(from: string | undefined, to: string) {
  useEffect(() => { if (from && from !== to && navigator.onLine) getRate(from, to, true).catch(() => {}); }, [from, to]);
  return useLiveQuery(async () => (from ? (await getRate(from, to, false))?.rate : undefined), [from, to]);
}

/** Converts a nightly price to the home currency and the whole stay: "≈ A$255/night · A$3,315 for 13 nights". */
export function homePrice(amount: number | undefined, currency: string | undefined, home: string, nights: number, rate: number | undefined) {
  if (!amount) return null;
  const cur = currency || home;
  const per = cur === home ? amount : rate ? Math.round(amount * rate) : undefined;
  if (per === undefined) return { per: undefined, total: undefined, text: `Add a ${cur}→${home} rate in More → Exchange rates to see ${home}` };
  const total = Math.round(per * nights);
  return { per, total, text: `${cur === home ? '' : '≈ '}${fmtMoney(per, home)}/night · ${fmtMoney(total, home)} total for ${nights} night${nights === 1 ? '' : 's'} (${home})` };
}

/** One line under a hotel's local price showing the home-currency nightly and total cost. */
export function PriceInHome({ amount, currency, home, nights, strong }: { amount?: number; currency?: string; home: string; nights: number; strong?: boolean }) {
  const rate = useRate(currency && currency !== home ? currency : undefined, home);
  const p = homePrice(amount, currency, home, nights, rate);
  if (!p) return null;
  return <div className={'home-price' + (p.per === undefined ? ' missing' : '') + (strong ? ' strong' : '')}>{p.text}</div>;
}
