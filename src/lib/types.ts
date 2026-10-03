export const DEFAULT_CATEGORIES = ['Flights', 'Accommodation', 'Transport', 'Food', 'Activities', 'Shopping', 'Kids', 'Other'];
/** Paid-up-front categories: counted in totals, excluded from day-to-day averages. */
export const BOOKED_CATEGORIES = ['Flights', 'Accommodation'];
export const LESSON_CATEGORIES = ['Flights', 'Hotels', 'Money', 'Transport', 'Food', 'Kids', 'Packing', 'Activities', 'Planning', 'Other'];

export interface Holiday {
  id: string;
  name: string;
  destinations: string[];
  start: string; // YYYY-MM-DD
  end: string;
  homeCurrency: string;
  currencies: string[]; // travel currencies (excluding home)
  adults: number;
  children: number;
  budget: number;
  categories: string[];
  categoryBudgets: Record<string, number>;
  dailyBudget?: number; // optional override
  wentWell?: string;
  improve?: string;
  reviewedLessonIds?: string[];
  createdAt: number;
}

export type ExpenseSource = 'screenshot' | 'receipt' | 'voice' | 'manual' | 'import' | 'accommodation';
export type ExpenseStatus = 'inbox' | 'confirmed';

export interface Expense {
  id: string;
  holidayId: string;
  status: ExpenseStatus;
  source: ExpenseSource;
  merchant: string;
  description?: string;
  amount: number; // original amount, never overwritten by conversion
  currency: string; // original currency
  date: string;
  time?: string;
  category: string;
  paymentMethodId?: string;
  rate?: number; // home units per 1 foreign unit, as used for the estimate
  rateSource?: 'online' | 'saved' | 'manual' | 'same';
  estHome?: number; // estimated home-currency value
  actualHome?: number; // actual card charge in home currency, when known
  fee?: number; // separate fee in home currency, when known
  confidence?: number; // 0..1 from extraction
  suggestedCategory?: string; // what the extractor/rules suggested, for learning
  thumb?: string; // small data URL
  pendingImage?: string; // compressed data URL waiting for AI processing (deleted after)
  processing?: 'waiting' | 'failed';
  accommodationId?: string;
  statementTxnId?: string;
  createdAt: number;
}

export interface Accommodation {
  id: string;
  holidayId: string;
  hotel: string;
  city: string;
  checkIn: string;
  checkOut: string;
  total: number;
  currency: string;
  homeAmount?: number; // home-currency equivalent if known
  source?: string; // booking source
  layover: boolean;
  paymentMethodId?: string;
  createdAt: number;
}

export interface PaymentMethod {
  id: string;
  name: string;
  kind: 'cash' | 'credit' | 'debit' | 'wallet' | 'transfer' | 'other';
  order: number;
}

export interface ChecklistItem {
  id: string;
  holidayId: string;
  list: 'packing' | 'pretrip';
  group: string;
  text: string;
  done: boolean;
  order: number;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  list: 'packing' | 'pretrip';
  items: { group: string; text: string }[];
  createdAt: number;
}

export interface Lesson {
  id: string;
  holidayId: string;
  category: string;
  text: string;
  carryForward: boolean;
  createdAt: number;
}

export interface StatementTxn {
  id: string;
  holidayId: string;
  importId: string;
  fingerprint: string; // for re-import dedupe
  date: string;
  description: string;
  amount: number; // home currency, positive = spend
  foreignAmount?: number;
  foreignCurrency?: string;
  isFee: boolean;
  status: 'pending' | 'matched' | 'added' | 'dismissed' | 'fee-attached';
  expenseId?: string;
  rejectedExpenseIds?: string[]; // "not a match" decisions
  createdAt: number;
}

export interface Rate { pair: string; rate: number; updatedAt: number; source: 'online' | 'manual' }
export interface MerchantRule { key: string; category: string; paymentMethodId?: string; uses: number; updatedAt: number }
export interface Setting { key: string; value: unknown }
