import Dexie, { type Table } from 'dexie';
import type { Accommodation, ChecklistItem, ChecklistTemplate, Expense, Holiday, Lesson, MerchantRule, PaymentMethod, Rate, Setting, StatementTxn } from './types';

export class HolidayDB extends Dexie {
  holidays!: Table<Holiday, string>;
  expenses!: Table<Expense, string>;
  accommodations!: Table<Accommodation, string>;
  paymentMethods!: Table<PaymentMethod, string>;
  checklist!: Table<ChecklistItem, string>;
  templates!: Table<ChecklistTemplate, string>;
  lessons!: Table<Lesson, string>;
  statementTxns!: Table<StatementTxn, string>;
  rates!: Table<Rate, string>;
  merchantRules!: Table<MerchantRule, string>;
  settings!: Table<Setting, string>;

  constructor() {
    super('holiday-tracker');
    this.version(1).stores({
      holidays: 'id, start, end',
      expenses: 'id, holidayId, status, date, [holidayId+status], accommodationId, statementTxnId, processing',
      accommodations: 'id, holidayId, checkIn',
      paymentMethods: 'id, order',
      checklist: 'id, holidayId, [holidayId+list]',
      templates: 'id, list',
      lessons: 'id, holidayId, category',
      statementTxns: 'id, holidayId, importId, fingerprint, status',
      rates: 'pair',
      merchantRules: 'key',
      settings: 'key'
    });
  }
}

export const db = new HolidayDB();

export const uid = () =>
  (globalThis.crypto && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'pm-cash', name: 'Cash', kind: 'cash', order: 0 },
  { id: 'pm-credit', name: 'Credit card', kind: 'credit', order: 1 },
  { id: 'pm-debit', name: 'Debit card', kind: 'debit', order: 2 },
  { id: 'pm-alipay', name: 'Alipay', kind: 'wallet', order: 3 },
  { id: 'pm-wechat', name: 'WeChat Pay', kind: 'wallet', order: 4 },
  { id: 'pm-transfer', name: 'Bank transfer', kind: 'transfer', order: 5 },
  { id: 'pm-other', name: 'Other', kind: 'other', order: 6 }
];

export async function ensureDefaults() {
  if ((await db.paymentMethods.count()) === 0) await db.paymentMethods.bulkPut(DEFAULT_PAYMENT_METHODS);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await db.settings.get(key);
  return (s?.value as T) ?? fallback;
}
export const setSetting = (key: string, value: unknown) => db.settings.put({ key, value });

/** Ask the browser not to evict our data (important on iOS). */
export async function requestPersistence() {
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch { /* ignore */ }
}

export async function deleteHoliday(id: string) {
  await db.transaction('rw', [db.holidays, db.expenses, db.accommodations, db.checklist, db.lessons, db.statementTxns], async () => {
    await db.expenses.where('holidayId').equals(id).delete();
    await db.accommodations.where('holidayId').equals(id).delete();
    await db.checklist.where('holidayId').equals(id).delete();
    await db.lessons.where('holidayId').equals(id).delete();
    await db.statementTxns.where('holidayId').equals(id).delete();
    await db.holidays.delete(id);
  });
}
