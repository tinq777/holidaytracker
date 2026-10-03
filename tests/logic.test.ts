import assert from 'node:assert/strict';
import { parseExpenseText } from '../src/lib/parseText.ts';
import { parseCSV, detectColumns, extractTxns, parseDate } from '../src/lib/csv.ts';
import { findMatches } from '../src/lib/match.ts';
import { tripStats, dailySummaries } from '../src/lib/calc.ts';

let n = 0; const t = (name: string, fn: () => void) => { fn(); n++; process.stdout.write(`✓ ${name}\n`); };
const ctx = { home: 'AUD', travel: ['CNY'], today: '2027-04-05', paymentMethods: [
  { id: 'pm-cash', name: 'Cash' }, { id: 'pm-credit', name: 'Credit card' }, { id: 'pm-alipay', name: 'Alipay' }, { id: 'pm-wechat', name: 'WeChat Pay' }, { id: 'c1', name: 'ANZ Black' }] };

t('voice: 128 yuan dinner, Alipay', () => {
  const r = parseExpenseText('128 yuan dinner, Alipay.', ctx);
  assert.equal(r.amount, 128); assert.equal(r.currency, 'CNY'); assert.equal(r.category, 'Food'); assert.equal(r.paymentMethodId, 'pm-alipay');
});
t('voice: 46 yuan Didi to the hotel', () => {
  const r = parseExpenseText('46 yuan Didi to the hotel.', ctx);
  assert.equal(r.amount, 46); assert.equal(r.category, 'Transport'); assert.equal(r.merchant, 'Didi');
});
t('voice: €35 lunch', () => {
  const r = parseExpenseText('€35 lunch.', { ...ctx, travel: ['EUR'] });
  assert.equal(r.amount, 35); assert.equal(r.currency, 'EUR'); assert.equal(r.category, 'Food');
});
t('voice: 299 yuan Pokémon shopping', () => {
  const r = parseExpenseText('299 yuan Pokémon shopping.', ctx);
  assert.equal(r.amount, 299); assert.equal(r.category, 'Shopping'); assert.match(r.merchant ?? '', /Pokémon/);
});
t('voice: named card + yesterday', () => {
  const r = parseExpenseText('¥1,250.50 hotel deposit on ANZ Black yesterday', ctx);
  assert.equal(r.amount, 1250.5); assert.equal(r.paymentMethodId, 'c1'); assert.equal(r.date, '2027-04-04'); assert.equal(r.category, 'Accommodation');
});
t('dates', () => {
  assert.equal(parseDate('02/10/2026'), '2026-10-02'); assert.equal(parseDate('2026-10-02'), '2026-10-02');
  assert.equal(parseDate('2 Oct 2026'), '2026-10-02'); assert.equal(parseDate('31/02/2026'), undefined);
});
t('csv with header + fx in description', () => {
  const csv = `Date,Description,Amount\n05/04/2027,"ALIPAY*RESTAURANT SHANGHAI CNY 128.00",-27.90\n05/04/2027,INTNL TRANSACTION FEE,-0.84\n06/04/2027,DIDI CHUXING,-10.05\n06/04/2027,PAYMENT THANK YOU,500.00`;
  const rows = parseCSV(csv); const map = detectColumns(rows)!;
  const { txns, skipped } = extractTxns(rows, map, 'AUD');
  assert.equal(txns.length, 3); assert.equal(skipped, 1);
  assert.equal(txns[0].foreignCurrency, 'CNY'); assert.equal(txns[0].foreignAmount, 128);
  assert.equal(txns[1].isFee, true);
});
t('csv headerless (ANZ style)', () => {
  const rows = parseCSV(`06/04/2027,"-10.05","DIDI CHUXING BEIJING"\n07/04/2027,"-65.20","POKEMON CENTER SHANGHAI"`);
  const map = detectColumns(rows)!; assert.equal(map.hasHeader, false);
  const { txns } = extractTxns(rows, map, 'AUD'); assert.equal(txns.length, 2); assert.equal(txns[1].amount, 65.2);
});
t('matching: one-to-one, no duplicates', () => {
  const exps = [
    { id: 'e1', date: '2027-04-05', amount: 128, currency: 'CNY', estHome: 27.2, merchant: 'Restaurant', paymentMethodName: 'Alipay' },
    { id: 'e2', date: '2027-04-06', amount: 46, currency: 'CNY', estHome: 9.8, merchant: 'Didi', paymentMethodName: 'Alipay' }];
  const txns = [
    { id: 't1', date: '2027-04-05', amount: 27.9, description: 'ALIPAY*RESTAURANT CNY 128.00', foreignAmount: 128, foreignCurrency: 'CNY', isFee: false },
    { id: 't2', date: '2027-04-05', amount: 0.84, description: 'INTNL TRANSACTION FEE', isFee: true },
    { id: 't3', date: '2027-04-07', amount: 10.05, description: 'DIDI CHUXING', isFee: false },
    { id: 't4', date: '2027-04-07', amount: 10.05, description: 'DIDI CHUXING', isFee: false }];
  const m = findMatches(exps, txns, 'AUD');
  assert.equal(m.length, 2);
  assert.equal(m.find(x => x.expenseId === 'e1')?.txnId, 't1');
  assert.ok(m.find(x => x.expenseId === 'e1')!.score >= 0.85);
  assert.ok(['t3', 't4'].includes(m.find(x => x.expenseId === 'e2')!.txnId));
});
t('stats + projection', () => {
  const h = { id: 'h', name: 'China 2027', destinations: ['China'], start: '2027-04-01', end: '2027-04-10', homeCurrency: 'AUD', currencies: ['CNY'], adults: 2, children: 2, budget: 8000, categories: [], categoryBudgets: {}, createdAt: 0 };
  const e = (id: string, cat: string, home: number, date: string) => ({ id, holidayId: 'h', status: 'confirmed' as const, source: 'manual' as const, merchant: id, amount: home, currency: 'AUD', date, category: cat, estHome: home, createdAt: 0 });
  const s = tripStats(h, [e('f', 'Flights', 2000, '2027-01-10'), e('a', 'Food', 200, '2027-04-01'), e('b', 'Food', 300, '2027-04-02')], '2027-04-02');
  assert.equal(s.spent, 2500); assert.equal(s.elapsedDays, 2); assert.equal(s.avgPerDay, 250); assert.equal(s.projectedTotal, 2500 + 250 * 8);
  assert.equal(s.dailyBudget, 600);
  assert.equal(dailySummaries([e('a', 'Food', 200, '2027-04-01'), e('f', 'Flights', 2000, '2027-04-01')])[0].total, 200);
});
process.stdout.write(`\n${n} tests passed\n`);
