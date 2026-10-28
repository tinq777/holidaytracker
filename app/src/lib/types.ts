export const DEFAULT_CATEGORIES = ['Flights', 'Accommodation', 'Car hire', 'Transport', 'Food', 'Activities', 'Shopping', 'Kids', 'Other'];
/** Paid-up-front categories: counted in totals, excluded from day-to-day averages. */
export const BOOKED_CATEGORIES = ['Flights', 'Accommodation', 'Car hire'];

/** Adds categories introduced after a trip was created (e.g. Car hire), right after Accommodation. */
export function withCurrentCategories<T extends { categories: string[] }>(h: T): T {
  if (h.categories.includes('Car hire')) return h;
  const cats = [...h.categories]; const i = cats.indexOf('Accommodation');
  cats.splice(i >= 0 ? i + 1 : cats.length, 0, 'Car hire');
  return { ...h, categories: cats };
}
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
  /** Hotel check: places that matter in each city (theme park, station…), added by the user. */
  keyPlaces?: Record<string, string[]>;
  /** Ages of the children, for family prices on Booking.com / Trip.com links. */
  childAges?: (number | undefined)[];
  /** Old per-city dates (v1.8), converted to legs on edit. */
  cityDates?: Record<string, { from: string; to: string }>;
  /** Trip legs in order, e.g. Shanghai 20 Mar–2 Apr, Beijing 2–15 Apr, Shanghai 15–20 Apr. A city can appear more than once. */
  legs?: TripLeg[];
  createdAt: number;
}

export type ExpenseSource = 'screenshot' | 'receipt' | 'voice' | 'manual' | 'import' | 'accommodation' | 'booking';
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
  /** Car hire: drop-off date (pick-up is `date`). */
  endDate?: string;
  pickupTime?: string; dropoffTime?: string; pickupPlace?: string; dropoffPlace?: string;
  /** Flights: one entry per flight (departure, return, connections). */
  legs?: FlightLeg[];
  bookingRef?: string;
  /** Booked but not charged yet (mirrors an unpaid stay). Counts as committed, not spent. */
  unpaid?: boolean;
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
  checkInTime?: string; checkOutTime?: string; address?: string; bookingRef?: string;
  /** false = booked but not charged yet (pay at the hotel). Older stays without the field count as paid. */
  paid?: boolean;
  createdAt: number;
}

/** AI suggestions for one city on a trip. Stored so they're readable offline. */
export interface IdeaItem {
  id: string; name: string; note?: string; area?: string;
  kids?: boolean; price?: string; when?: string; // events: dates/times as text
  tag?: string; // shops: Neighbourhood, Boutique, Concept store, Market…
  near?: string; // eat: distance from the hotel, e.g. "5 min walk from Hilton"
  starred?: boolean;
}
export interface CityIdeas {
  id: string; // `${holidayId}|${city}`
  holidayId: string; city: string; from: string; to: string;
  see: IdeaItem[]; events: IdeaItem[]; shop?: IdeaItem[]; breakfast: IdeaItem[]; lunch: IdeaItem[]; dinner: IdeaItem[];
  generatedAt: number; source: 'ai' | 'ai-search' | 'demo';
  /** Hotels the eat suggestions were based on (to spot when the booking changes). */
  hotels?: string[];
}

export interface TripLeg { id: string; city: string; from: string; to: string }

/** Hotel check: one hotel on the shortlist for a city, with its AI report. */
export interface HotelCandidate {
  id: string; holidayId: string; city: string; legId?: string;
  name: string; link?: string; tripLink?: string; thumb?: string; // small listing screenshot
  pricePerNight?: number; currency?: string;
  status: 'checking' | 'done' | 'failed'; error?: string;
  report?: HotelReport; chosenStayId?: string; createdAt: number;
}
export interface HotelReport {
  name: string; area?: string; address?: string; stars?: number;
  verdict: 'good' | 'concerns' | 'red'; summary: string;
  pricePerNight?: number; currency?: string; valueNote?: string; typicalRange?: string; extras: string[];
  location: { place: string; time: string; note?: string }[];
  familyFit?: string; reviewsGood: string[]; reviewsBad: string[]; redFlags: string[]; saveTips?: string[];
  sources: { title: string; url: string }[]; tripUrl?: string;
  source: 'ai-search' | 'ai' | 'demo'; checkedAt: number;
}

export interface FlightLeg {
  id: string;
  label: string; // Departure, Return, Connection…
  from?: string; to?: string; flightNo?: string;
  departDate?: string; departTime?: string; arriveDate?: string; arriveTime?: string;
}

/** A ticket, booking confirmation or receipt stored on the device. ownerId is an expense or accommodation id. */
export interface Attachment {
  id: string; holidayId: string; ownerId: string;
  name: string; type: string; size: number; blob: Blob; createdAt: number;
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
