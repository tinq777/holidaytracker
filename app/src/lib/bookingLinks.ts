/** Links that open Booking.com / Trip.com on this hotel with the trip's dates and guests filled in.
 *  Prices shown there are the user's own logged-in prices (Genius, Trip.com member rates). */
export interface LinkInput { name: string; city: string; checkIn: string; checkOut: string; adults: number; childAges: (number | undefined)[]; rooms: number; currency?: string }

export function bookingComUrl(i: LinkInput) {
  const p = new URLSearchParams({ ss: `${i.name}, ${i.city}`, checkin: i.checkIn, checkout: i.checkOut, group_adults: String(i.adults), group_children: String(i.childAges.length), no_rooms: String(i.rooms) });
  // Booking.com needs every child's age; without them it asks on arrival.
  i.childAges.forEach(a => { if (a !== undefined) p.append('age', String(a)); });
  if (i.currency) p.set('selected_currency', i.currency);
  return `https://www.booking.com/searchresults.html?${p}`;
}

export function tripComUrl(i: LinkInput) {
  const d = (s: string) => s.replace(/-/g, '/');
  const p = new URLSearchParams({ keyword: `${i.name} ${i.city}`, checkin: d(i.checkIn), checkout: d(i.checkOut), adult: String(i.adults), children: String(i.childAges.length), crn: String(i.rooms) });
  const ages = i.childAges.filter((a): a is number => a !== undefined);
  if (ages.length) p.set('ages', ages.join(','));
  if (i.currency) p.set('curr', i.currency);
  return `https://www.trip.com/hotels/list?${p}`;
}

/** Copies the hotel name so it can be pasted if a site opens on a general search page. */
export function copyName(name: string) { try { navigator.clipboard?.writeText(name); } catch { /* not allowed: fine */ } }
