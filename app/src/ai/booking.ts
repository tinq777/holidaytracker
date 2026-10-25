import { loadAISettings, DEFAULT_MODEL } from './index';
import { blobToDataURL } from '../lib/attachments';

/** One booking found in a confirmation (an itinerary PDF can hold several, e.g. flight + hotel package). */
export type ExtractedBooking =
  | ({ kind: 'flight' } & Common & { legs: { label?: string; from?: string; to?: string; flightNo?: string; departDate?: string; departTime?: string; arriveDate?: string; arriveTime?: string }[] })
  | ({ kind: 'car' } & Common & { pickupDate?: string; pickupTime?: string; pickupPlace?: string; dropoffDate?: string; dropoffTime?: string; dropoffPlace?: string })
  | ({ kind: 'hotel' } & Common & { city?: string; address?: string; checkIn?: string; checkInTime?: string; checkOut?: string; checkOutTime?: string; source?: string; paid?: boolean });

interface Common { name?: string; total?: number; currency?: string; paidDate?: string; bookingRef?: string; confidence: number }

export interface BookingContext { tripStart: string; tripEnd: string; homeCurrency: string; travelCurrencies: string[]; destinations: string[] }

export class BookingReadUnavailable extends Error {}

/** Reads a booking confirmation (PDF, screenshot or photo). Only runs when the user picks a file. */
export async function extractBookings(file: File, ctx: BookingContext): Promise<ExtractedBooking[]> {
  const s = await loadAISettings();
  if (s.provider === 'demo') return demoBookings(file, ctx);
  if (s.provider !== 'anthropic' || !s.apiKey) throw new BookingReadUnavailable('Reading bookings needs AI. Choose Claude in More → AI reading (or Demo to try it).');
  if (!navigator.onLine) throw new BookingReadUnavailable('Reading bookings needs an internet connection. You can still add it by hand and attach the file.');

  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const data = isPdf ? (await blobToDataURL(file)).split(',')[1] : await imageForAI(file);
  const source = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } };

  const prompt = `Read this travel booking confirmation and extract every booking in it (flights, car hire, hotels).
Trip context: ${ctx.destinations.join(', ') || 'unknown destination'}, ${ctx.tripStart} to ${ctx.tripEnd}. Home currency ${ctx.homeCurrency}.
Rules:
- Dates YYYY-MM-DD, times 24h HH:MM in LOCAL time as printed. If a year is missing, use the trip's year.
- total is the total price paid for that booking (number only) with an ISO 4217 currency. Omit if not shown.
- name: airline (e.g. "China Eastern"), rental company (e.g. "Hertz"), or hotel name.
- Flights: one leg per flight segment in order. label is "Departure" for the first outbound flight, "Return" for the first flight home, "Connection" for others. from/to are IATA codes if shown, else city names.
- Car: pickup/dropoff dates, times and locations.
- Hotel: city, address, check-in/check-out dates and times, source = booking site if shown (e.g. Booking.com). paid = true if the confirmation says it is prepaid / already charged, false if you pay at the property or it is only reserved with a card guarantee; omit if unclear.
- confidence 0-1 per booking.
Respond with ONLY JSON, no markdown:
{"bookings":[{"kind":"flight","name":"","total":0,"currency":"","paidDate":"","bookingRef":"","legs":[{"label":"","from":"","to":"","flightNo":"","departDate":"","departTime":"","arriveDate":"","arriveTime":""}],"confidence":0},{"kind":"car","name":"","total":0,"currency":"","bookingRef":"","pickupDate":"","pickupTime":"","pickupPlace":"","dropoffDate":"","dropoffTime":"","dropoffPlace":"","confidence":0},{"kind":"hotel","name":"","total":0,"currency":"","bookingRef":"","city":"","address":"","checkIn":"","checkInTime":"","checkOut":"","checkOutTime":"","source":"","paid":false,"confidence":0}]}
Include only the bookings actually present. If none, return {"bookings":[]}.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': s.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: s.model || DEFAULT_MODEL, max_tokens: 2000, messages: [{ role: 'user', content: [source, { type: 'text', text: prompt }] }] })
  });
  if (!res.ok) throw new Error(`AI request failed (${res.status})`);
  const out = await res.json();
  const text: string = (out.content ?? []).map((c: { text?: string }) => c.text ?? '').join('').replace(/```json|```/g, '');
  const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  return clean(Array.isArray(parsed.bookings) ? parsed.bookings : []);
}

/** Drops empty strings and invalid values so the editors only get real data. */
function clean(list: Record<string, unknown>[]): ExtractedBooking[] {
  const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const time = (v: unknown) => (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, '0') : undefined);
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : typeof v === 'string' && parseFloat(v) > 0 ? parseFloat(v) : undefined);
  return list.filter(b => b && ['flight', 'car', 'hotel'].includes(b.kind as string)).map(b => {
    const common = { name: str(b.name), total: num(b.total), currency: str(b.currency)?.toUpperCase(), paidDate: date(b.paidDate), bookingRef: str(b.bookingRef), confidence: typeof b.confidence === 'number' ? b.confidence : 0.6 };
    if (b.kind === 'flight') return { kind: 'flight', ...common, legs: ((b.legs as Record<string, unknown>[]) ?? []).map(l => ({ label: str(l.label), from: str(l.from), to: str(l.to), flightNo: str(l.flightNo), departDate: date(l.departDate), departTime: time(l.departTime), arriveDate: date(l.arriveDate), arriveTime: time(l.arriveTime) })) };
    if (b.kind === 'car') return { kind: 'car', ...common, pickupDate: date(b.pickupDate), pickupTime: time(b.pickupTime), pickupPlace: str(b.pickupPlace), dropoffDate: date(b.dropoffDate), dropoffTime: time(b.dropoffTime), dropoffPlace: str(b.dropoffPlace) };
    return { kind: 'hotel', ...common, city: str(b.city), address: str(b.address), checkIn: date(b.checkIn), checkInTime: time(b.checkInTime), checkOut: date(b.checkOut), checkOutTime: time(b.checkOutTime), source: str(b.source), paid: typeof b.paid === 'boolean' ? b.paid : undefined };
  }) as ExtractedBooking[];
}

async function imageForAI(file: Blob): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}

/** Demo: guesses the booking type from the file name (hotel / car / otherwise flight). Reads nothing. */
async function demoBookings(file: File, ctx: BookingContext): Promise<ExtractedBooking[]> {
  await new Promise(r => setTimeout(r, 600));
  const n = file.name.toLowerCase(); const cur = ctx.travelCurrencies[0] ?? ctx.homeCurrency;
  const addDays = (iso: string, d: number) => new Date(Date.parse(iso) + d * 86400000).toISOString().slice(0, 10);
  if (/hotel|stay|booking|accom|airbnb/.test(n)) return [{ kind: 'hotel', name: 'Demo Grand Hotel', city: ctx.destinations[0], total: 4200, currency: cur, bookingRef: 'DEMO-H123', checkIn: ctx.tripStart, checkInTime: '15:00', checkOut: addDays(ctx.tripStart, 4), checkOutTime: '11:00', source: 'Booking.com', paid: false, confidence: 0.9 }];
  if (/car|hire|rental|hertz|avis/.test(n)) return [{ kind: 'car', name: 'Demo Car Rental', total: 1800, currency: cur, bookingRef: 'DEMO-C456', pickupDate: ctx.tripStart, pickupTime: '10:00', pickupPlace: 'Airport', dropoffDate: ctx.tripEnd, dropoffTime: '09:00', dropoffPlace: 'Airport', confidence: 0.9 }];
  return [{ kind: 'flight', name: 'Demo Airways', total: 3120, currency: ctx.homeCurrency, bookingRef: 'DEMO6X', confidence: 0.9, legs: [
    { label: 'Departure', from: 'SYD', to: 'PVG', flightNo: 'DM562', departDate: ctx.tripStart, departTime: '21:05', arriveDate: addDays(ctx.tripStart, 1), arriveTime: '05:30' },
    { label: 'Return', from: 'PEK', to: 'SYD', flightNo: 'DM561', departDate: ctx.tripEnd, departTime: '13:00', arriveDate: addDays(ctx.tripEnd, 1), arriveTime: '06:10' }] }];
}
