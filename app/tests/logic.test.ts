import assert from 'node:assert/strict';
import { parseExpenseText } from '../src/lib/parseText.ts';
import { parseCSV, detectColumns, extractTxns, parseDate } from '../src/lib/csv.ts';
import { findMatches } from '../src/lib/match.ts';
import { tripStats, dailySummaries } from '../src/lib/calc.ts';
import { keywordCategory } from '../src/lib/categorise.ts';
import { round2 } from '../src/lib/money.ts';
import { cleanText, cleanDeep } from '../src/ai/text.ts';
import { bookingComUrl, tripComUrl, parseTripLink, agodaUrl, googleHotelsUrl } from '../src/lib/bookingLinks.ts';
import { splitEvenly, cityRange, tripStops } from '../src/lib/cityDates.ts';

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
t('car hire is a booked cost, not daily spend', () => {
  const h = { id: 'h', name: 'NZ', destinations: ['Queenstown'], start: '2027-04-01', end: '2027-04-10', homeCurrency: 'AUD', currencies: [], adults: 2, children: 0, budget: 5000, categories: [], categoryBudgets: { 'Car hire': 600 }, createdAt: 0 };
  const e = (id: string, cat: string, home: number, date: string) => ({ id, holidayId: 'h', status: 'confirmed' as const, source: 'manual' as const, merchant: id, amount: home, currency: 'AUD', date, category: cat, estHome: home, createdAt: 0 });
  const s = tripStats(h, [e('c', 'Car hire', 600, '2027-04-01'), e('a', 'Food', 100, '2027-04-01')], '2027-04-01');
  assert.equal(s.avgPerDay, 100); assert.equal(s.dailyBudget, 440);
  assert.equal(dailySummaries([e('c', 'Car hire', 600, '2027-04-01'), e('a', 'Food', 100, '2027-04-01')])[0].total, 100);
  assert.equal(keywordCategory('Hertz Queenstown airport'), 'Car hire');
  assert.equal(keywordCategory('Didi to the hotel'), 'Transport');
});
t('unpaid hotels are committed, not spent', () => {
  const h = { id: 'h', name: 'Melb', destinations: ['Melbourne'], start: '2026-11-13', end: '2026-11-16', homeCurrency: 'AUD', currencies: [], adults: 2, children: 0, budget: 4000, categories: [], categoryBudgets: {}, createdAt: 0 };
  const e = (id: string, cat: string, home: number, unpaid?: boolean) => ({ id, holidayId: 'h', status: 'confirmed' as const, source: 'manual' as const, merchant: id, amount: home, currency: 'AUD', date: '2026-11-13', category: cat, estHome: home, unpaid, createdAt: 0 });
  const s = tripStats(h, [e('f', 'Flights', 600), e('hotel', 'Accommodation', 900, true), e('food', 'Food', 100)], '2026-11-01');
  assert.equal(s.spent, 700); assert.equal(s.toPay, 900); assert.equal(s.committed, 1600); assert.equal(s.remaining, 2400);
  assert.equal(s.dailyBudget, round2((4000 - 1500) / 4));
});
t('AI citation tags are stripped', () => {
  assert.equal(cleanText('<cite index="21-4,21-5">Fantastic location, close to metro</cite>'), 'Fantastic location, close to metro');
  assert.equal(cleanText('<cite index="28-4">Price is high</cite>. At this price, rooms are dated.'), 'Price is high. At this price, rooms are dated.');
  assert.equal(cleanText('<cite index="39-3">Two-bedroom units</cite>. <cite index="47-1">Sleep 4</cite>.'), 'Two-bedroom units. Sleep 4.');
  const r = cleanDeep({ summary: '<cite index="1">Good</cite>', sources: [{ title: 'TA', url: 'https://x.com/<a>' }] });
  assert.equal(r.summary, 'Good'); assert.equal(r.sources[0].url, 'https://x.com/<a>');
});
t('booking links carry dates, guests and child ages', () => {
  const i = { name: 'Ascott Huai Hai Road', city: 'Shanghai', checkIn: '2027-04-02', checkOut: '2027-04-08', adults: 3, childAges: [8, 5], rooms: 2, currency: 'CNY' };
  const b = new URL(bookingComUrl(i)).searchParams;
  assert.equal(b.get('checkin'), '2027-04-02'); assert.equal(b.get('group_adults'), '3'); assert.equal(b.get('group_children'), '2'); assert.deepEqual(b.getAll('age'), ['8', '5']); assert.equal(b.get('no_rooms'), '2');
  const t2 = new URL(tripComUrl(i)).searchParams;
  assert.equal(t2.get('checkin'), '2027/04/02'); assert.equal(t2.get('ages'), '8,5'); assert.equal(t2.get('crn'), '2');
});
t('trip legs: split evenly, repeat cities, per-leg dates', () => {
  const legs = splitEvenly('2027-03-20', '2027-04-20', [{ id: 'a', city: 'Shanghai' }, { id: 'b', city: 'Beijing' }, { id: 'c', city: 'Shanghai' }]);
  assert.deepEqual(legs.map(l => [l.from, l.to]), [['2027-03-20', '2027-03-31'], ['2027-03-31', '2027-04-10'], ['2027-04-10', '2027-04-20']]);
  const h = { id: 'h', name: 'C', destinations: ['Shanghai', 'Beijing'], start: '2027-03-20', end: '2027-04-20', homeCurrency: 'AUD', currencies: [], adults: 2, children: 2, budget: 1, categories: [], categoryBudgets: {}, createdAt: 0, legs };
  const stops = tripStops(h, []);
  assert.equal(stops.length, 3); assert.equal(stops[2].city, 'Shanghai'); assert.equal(stops[2].from, '2027-04-10'); assert.ok(stops[2].label.includes('10 Apr'));
  const r = cityRange(h, [], 'Shanghai'); assert.equal(r.ranges.length, 2); assert.equal(r.from, '2027-03-20'); assert.equal(r.to, '2027-04-20');
  // older per-city dates still work
  const old = { ...h, legs: undefined, cityDates: { Beijing: { from: '2027-04-05', to: '2027-04-20' } } };
  assert.equal(tripStops(old, [])[0].from, '2027-04-05');
});
t('Trip.com app links use the share-link format when the hotel id is known', () => {
  const share = 'https://au.trip.com/hotels/w/detail/?checkin=2027-04-06&checkout=2027-04-17&cityid=2&curr=AUD&fromShare=TripAppDetail&hotelid=123245486&locale=en-AU';
  assert.deepEqual(parseTripLink(share), { hotelId: '123245486', cityId: '2', short: undefined });
  assert.equal(parseTripLink('https://www.trip.com/hotels/shanghai-hotel-detail-123245486/ascott/').hotelId, '123245486');
  const i = { name: 'Ascott', city: 'Shanghai', checkIn: '2027-03-20', checkOut: '2027-04-02', adults: 2, childAges: [8, 5], rooms: 1, tripLink: 'https://www.trip.com/hotels/shanghai-hotel-detail-123245486/' };
  const u = new URL(tripComUrl(i));
  assert.equal(u.host + u.pathname, 'au.trip.com/hotels/w/detail/'); assert.equal(u.searchParams.get('hotelid'), '123245486');
  assert.equal(u.searchParams.get('cityid'), '2'); assert.equal(u.searchParams.get('checkin'), '2027-03-20');
  assert.equal(tripComUrl({ ...i, tripLink: 'https://www.trip.com/w/DAzAFeY4wW2' }), 'https://www.trip.com/w/DAzAFeY4wW2');
});
t('Agoda and Google Hotels links', () => {
  const i = { name: 'Ascott', city: 'Shanghai', checkIn: '2027-04-02', checkOut: '2027-04-08', adults: 2, childAges: [8, 5], rooms: 1 };
  const a = new URL(agodaUrl(i)).searchParams;
  assert.equal(a.get('checkIn'), '2027-04-02'); assert.equal(a.get('los'), '6'); assert.equal(a.get('childages'), '8,5'); assert.equal(a.get('adults'), '2');
  assert.equal(new URL(googleHotelsUrl(i)).searchParams.get('q'), 'Ascott Shanghai');
});
process.stdout.write(`\n${n} tests passed\n`);
