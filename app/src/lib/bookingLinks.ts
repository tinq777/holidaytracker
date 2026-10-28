/** Links that open Booking.com / Trip.com on this hotel with the trip's dates and guests filled in.
 *  Prices shown there are the user's own logged-in prices (Genius, Trip.com member rates). */
export interface LinkInput { name: string; city: string; checkIn: string; checkOut: string; adults: number; childAges: (number | undefined)[]; rooms: number; currency?: string; tripLink?: string; agodaLink?: string }

export function bookingComUrl(i: LinkInput) {
  const p = new URLSearchParams({ ss: `${i.name}, ${i.city}`, checkin: i.checkIn, checkout: i.checkOut, group_adults: String(i.adults), group_children: String(i.childAges.length), no_rooms: String(i.rooms) });
  // Booking.com needs every child's age; without them it asks on arrival.
  i.childAges.forEach(a => { if (a !== undefined) p.append('age', String(a)); });
  if (i.currency) p.set('selected_currency', i.currency);
  return `https://www.booking.com/searchresults.html?${p}`;
}

/** Trip.com city ids (from Trip.com links). Shanghai 2 is confirmed from an app share link. */
const TRIP_CITY_IDS: Record<string, string> = { beijing: '1', shanghai: '2', tokyo: '228', paris: '192', singapore: '73' };

/** Pulls the hotel id (and city id) out of any Trip.com hotel link: app share links, au./www. detail pages, SEO pages. */
export function parseTripLink(url?: string): { hotelId?: string; cityId?: string; short?: string } {
  if (!url || !/trip\.com/i.test(url)) return {};
  const hotelId = url.match(/[?&]hotel[iI]d=(\d+)/)?.[1] ?? url.match(/hotel-detail-(\d+)/)?.[1] ?? url.match(/\/hotels\/[^/]*-(\d{5,})\b/)?.[1];
  const cityId = url.match(/[?&]city[iI]d=(\d+)/)?.[1];
  const short = /trip\.com\/w\/[A-Za-z0-9]+/.test(url) ? url : undefined;
  return { hotelId, cityId, short };
}

/**
 * The Trip.com app opens hotel pages in the format its share links use (au.trip.com/hotels/w/detail).
 * With a known hotel id we use that, with this stop's dates and guests. Otherwise the website search.
 */
export function tripComUrl(i: LinkInput) {
  const ages = i.childAges.filter((a): a is number => a !== undefined);
  const t = parseTripLink(i.tripLink);
  if (t.hotelId) {
    const cityId = t.cityId ?? TRIP_CITY_IDS[i.city.trim().toLowerCase()];
    const p = new URLSearchParams({ checkin: i.checkIn, checkout: i.checkOut, ...(cityId ? { cityid: cityId } : {}), curr: i.currency ?? 'AUD', hotelid: t.hotelId, locale: 'en-AU', adult: String(i.adults), children: String(i.childAges.length), crn: String(i.rooms) });
    if (ages.length) p.set('ages', ages.join(','));
    return `https://au.trip.com/hotels/w/detail/?${p}`;
  }
  if (t.short) return t.short; // an app share link opens the app as-is
  const d = (s: string) => s.replace(/-/g, '/');
  const p = new URLSearchParams({ keyword: `${i.name} ${i.city}`, checkin: d(i.checkIn), checkout: d(i.checkOut), adult: String(i.adults), children: String(i.childAges.length), crn: String(i.rooms) });
  const cityId = TRIP_CITY_IDS[i.city.trim().toLowerCase()];
  if (cityId) p.set('city', cityId);
  if (ages.length) p.set('ages', ages.join(','));
  if (i.currency) p.set('curr', i.currency);
  return `https://www.trip.com/hotels/list?${p}`;
}

/** Agoda share links (agoda.com/sh-app/…) open the app as they are. */
export const isAgodaShort = (u?: string) => !!u && /agoda\.com\/sh-app\//i.test(u);
/** A full Agoda hotel page, e.g. agoda.com/shanghai-centre…/hotel/shanghai-cn.html */
export const isAgodaHotel = (u?: string) => !!u && /agoda\.com\/.*\/hotel\//i.test(u);

/**
 * Agoda: with the hotel's own page (or a share link from the app) we open that hotel; a full page gets this
 * stop's dates, nights, guests, children's ages and rooms. Otherwise a search by name.
 */
export function agodaUrl(i: LinkInput) {
  const los = Math.max(1, Math.round((Date.parse(i.checkOut) - Date.parse(i.checkIn)) / 86400000));
  const ages = i.childAges.filter((a): a is number => a !== undefined);
  const params: Record<string, string> = { checkIn: i.checkIn, checkOut: i.checkOut, los: String(los), rooms: String(i.rooms), adults: String(i.adults), children: String(i.childAges.length) };
  if (ages.length) params.childAges = ages.join(',');
  if (i.currency) params.currencyCode = i.currency;
  if (isAgodaHotel(i.agodaLink)) {
    const u = new URL(i.agodaLink!);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  }
  if (isAgodaShort(i.agodaLink)) return i.agodaLink!;
  const p = new URLSearchParams({ textToSearch: `${i.name}, ${i.city}`, ...params });
  if (ages.length) p.set('childages', ages.join(','));
  return `https://www.agoda.com/search?${p}`;
}

/** Google Hotels for this hotel. Google doesn't accept dates in a link, so the search is just the hotel and city
 *  (adding dates to the text made Google show a whole-city list instead of the hotel). */
export function googleHotelsUrl(i: LinkInput) {
  return `https://www.google.com/travel/search?${new URLSearchParams({ q: `${i.name} ${i.city}`, hl: 'en-AU', gl: 'au' })}`;
}

export const opensTripApp = (i: LinkInput) => { const t = parseTripLink(i.tripLink); return !!(t.hotelId || t.short); };
export const opensAgodaHotel = (i: LinkInput) => isAgodaHotel(i.agodaLink) || isAgodaShort(i.agodaLink);

/** Copies the hotel name so it can be pasted if a site opens on a general search page. */
export function copyName(name: string) { try { navigator.clipboard?.writeText(name); } catch { /* not allowed: fine */ } }
