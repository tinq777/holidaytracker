import { db, uid, ensureDefaults } from './db';
import { seedChecklists } from './checklists';
import { saveAccommodation } from './accommodation';
import { DEFAULT_CATEGORIES, type Expense, type Holiday } from './types';

export async function loadSampleData() {
  await ensureDefaults();
  if ((await db.holidays.filter(h => h.name === 'China 2026' || h.name === 'Spain 2026').count()) > 0) return false;
  await db.rates.bulkPut([
    { pair: 'CNY>AUD', rate: 0.213, updatedAt: Date.now(), source: 'manual' },
    { pair: 'EUR>AUD', rate: 1.66, updatedAt: Date.now(), source: 'manual' }
  ]);
  const myCard = { id: 'pm-mycard', name: 'MyCard', kind: 'credit' as const, order: 7 };
  await db.paymentMethods.put(myCard);

  const china: Holiday = {
    id: uid(), name: 'China 2026', destinations: ['Shanghai', 'Beijing', 'Chengdu'], start: '2026-09-12', end: '2026-09-25',
    homeCurrency: 'AUD', currencies: ['CNY'], adults: 2, children: 2, budget: 9000, categories: [...DEFAULT_CATEGORIES],
    categoryBudgets: { Flights: 3200, Accommodation: 2400, Food: 1200, Transport: 500, Activities: 800, Shopping: 500, Kids: 200, Other: 200 },
    wentWell: 'High-speed trains were easy with the kids. Alipay worked almost everywhere.',
    improve: 'Hotels in Beijing were expensive, and the Guangzhou layover hotel added a lot for one night.', createdAt: Date.now() - 1e9
  };
  const spain: Holiday = {
    id: uid(), name: 'Spain 2026', destinations: ['Barcelona', 'Madrid'], start: '2026-06-20', end: '2026-06-29',
    homeCurrency: 'AUD', currencies: ['EUR'], adults: 2, children: 2, budget: 11000, categories: [...DEFAULT_CATEGORIES],
    categoryBudgets: {}, createdAt: Date.now() - 2e9
  };
  await db.holidays.bulkAdd([china, spain]);
  await seedChecklists(china.id, true); await seedChecklists(spain.id, true);
  await db.checklist.where('holidayId').anyOf(china.id, spain.id).modify({ done: true });

  const stays = [
    { hotel: 'Atour Hotel Bund', city: 'Shanghai', checkIn: '2026-09-12', checkOut: '2026-09-17', total: 4250, layover: false, source: 'Trip.com' },
    { hotel: 'Novotel Peace Beijing', city: 'Beijing', checkIn: '2026-09-17', checkOut: '2026-09-21', total: 4960, layover: false, source: 'Booking.com' },
    { hotel: 'Chengdu Tianfu Suites', city: 'Chengdu', checkIn: '2026-09-21', checkOut: '2026-09-24', total: 2280, layover: false, source: 'Trip.com' },
    { hotel: 'Pullman Guangzhou Airport', city: 'Guangzhou', checkIn: '2026-09-24', checkOut: '2026-09-25', total: 845, layover: true, source: 'Trip.com' }
  ];
  for (const s of stays) await saveAccommodation(china, { id: uid(), holidayId: china.id, currency: 'CNY', paymentMethodId: myCard.id, createdAt: Date.now(), ...s });

  const pm = (n: string) => ({ Alipay: 'pm-alipay', WeChat: 'pm-wechat', Cash: 'pm-cash', MyCard: myCard.id } as Record<string, string>)[n];
  const exp = (h: Holiday, date: string, merchant: string, amount: number, currency: string, category: string, payment: string, extra: Partial<Expense> = {}): Expense => {
    const rate = currency === 'AUD' ? 1 : currency === 'CNY' ? 0.213 : 1.66;
    return { id: uid(), holidayId: h.id, status: 'confirmed', source: 'manual', merchant, amount, currency, date, category, paymentMethodId: pm(payment), rate, rateSource: currency === 'AUD' ? 'same' : 'saved', estHome: Math.round(amount * rate * 100) / 100, createdAt: Date.now(), ...extra };
  };
  const c = china;
  await db.expenses.bulkAdd([
    exp(c, '2026-05-02', 'China Eastern', 3480, 'AUD', 'Flights', 'MyCard', { description: 'SYD–PVG return, 4 passengers' }),
    exp(c, '2026-09-12', 'Maglev', 200, 'CNY', 'Transport', 'Alipay'),
    exp(c, '2026-09-12', 'Din Tai Fung', 386, 'CNY', 'Food', 'Alipay', { actualHome: 84.1, fee: 1.26 }),
    exp(c, '2026-09-13', 'Shanghai Disneyland', 2196, 'CNY', 'Activities', 'MyCard', { actualHome: 476.2, fee: 14.29 }),
    exp(c, '2026-09-13', 'Restaurant', 128, 'CNY', 'Food', 'Alipay'),
    exp(c, '2026-09-14', 'Didi', 46, 'CNY', 'Transport', 'Alipay'),
    exp(c, '2026-09-14', 'Pokémon Store', 299, 'CNY', 'Shopping', 'Alipay'),
    exp(c, '2026-09-15', 'Luckin Coffee', 58, 'CNY', 'Food', 'WeChat'),
    exp(c, '2026-09-16', 'Yu Garden', 160, 'CNY', 'Activities', 'Alipay'),
    exp(c, '2026-09-17', 'G-train Shanghai–Beijing', 2200, 'CNY', 'Transport', 'Alipay'),
    exp(c, '2026-09-18', 'Great Wall Mutianyu', 680, 'CNY', 'Activities', 'Alipay'),
    exp(c, '2026-09-18', 'Quanjude Roast Duck', 520, 'CNY', 'Food', 'MyCard'),
    exp(c, '2026-09-19', 'Forbidden City', 240, 'CNY', 'Activities', 'Alipay'),
    exp(c, '2026-09-20', 'Toy shop', 168, 'CNY', 'Kids', 'Cash'),
    exp(c, '2026-09-21', 'Flight Beijing–Chengdu', 2380, 'CNY', 'Flights', 'MyCard'),
    exp(c, '2026-09-22', 'Panda Base', 220, 'CNY', 'Activities', 'Alipay'),
    exp(c, '2026-09-22', 'Hotpot', 410, 'CNY', 'Food', 'Alipay'),
    exp(c, '2026-09-23', 'Kuanzhai Alley', 340, 'CNY', 'Shopping', 'WeChat'),
    exp(c, '2026-09-24', 'Airport express', 120, 'CNY', 'Transport', 'Alipay')
  ]);
  const s = spain;
  await db.expenses.bulkAdd([
    exp(s, '2026-02-10', 'Qantas', 5200, 'AUD', 'Flights', 'MyCard'),
    exp(s, '2026-06-20', 'Hotel Barcelona', 1450, 'EUR', 'Accommodation', 'MyCard'),
    exp(s, '2026-06-24', 'Hotel Madrid', 980, 'EUR', 'Accommodation', 'MyCard'),
    exp(s, '2026-06-21', 'Sagrada Família', 120, 'EUR', 'Activities', 'MyCard'),
    exp(s, '2026-06-21', 'Tapas bar', 85, 'EUR', 'Food', 'MyCard'),
    exp(s, '2026-06-23', 'Train to Madrid', 210, 'EUR', 'Transport', 'MyCard'),
    exp(s, '2026-06-25', 'Prado', 60, 'EUR', 'Activities', 'MyCard'),
    exp(s, '2026-06-26', 'El Corte Inglés', 140, 'EUR', 'Shopping', 'MyCard'),
    exp(s, '2026-06-27', 'Restaurants (various)', 610, 'EUR', 'Food', 'Cash')
  ]);
  await db.lessons.bulkAdd([
    { id: uid(), holidayId: c.id, category: 'Hotels', text: 'Hotels were too expensive. Compare total hotel cost, including layover nights.', carryForward: true, createdAt: Date.now() },
    { id: uid(), holidayId: c.id, category: 'Hotels', text: 'Consider staying longer at layovers instead of paying for a hotel just to sleep.', carryForward: true, createdAt: Date.now() },
    { id: uid(), holidayId: c.id, category: 'Money', text: 'MyCard incurred overseas charges. Check credit-card fees before the trip.', carryForward: true, createdAt: Date.now() },
    { id: uid(), holidayId: c.id, category: 'Money', text: 'Check payment-app fees before using a linked credit card.', carryForward: true, createdAt: Date.now() },
    { id: uid(), holidayId: c.id, category: 'Kids', text: 'Travelling with kids requires more downtime.', carryForward: true, createdAt: Date.now() },
    { id: uid(), holidayId: s.id, category: 'Food', text: 'Dinner starts late in Spain. Feed the kids a big afternoon snack.', carryForward: false, createdAt: Date.now() }
  ]);
  return true;
}
