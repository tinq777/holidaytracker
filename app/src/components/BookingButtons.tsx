import { agodaUrl, bookingComUrl, copyName, googleHotelsUrl, tripComUrl, type LinkInput } from '../lib/bookingLinks';
import { useUI } from './ui';

/** Booking.com, Trip.com and Agoda (to book) plus Google Hotels (to compare), with dates and guests filled in. */
export function BookingButtons({ link, small }: { link: LinkInput; small?: boolean }) {
  const { toast } = useUI();
  const cls = 'btn' + (small ? ' sm' : '');
  const open = () => { copyName(link.name); toast('Hotel name copied, in case you need to paste it'); };
  const fmt = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const openGoogle = () => { copyName(link.name); toast(`Set the dates in Google: ${fmt(link.checkIn)} – ${fmt(link.checkOut)}`); };
  return <div className="site-grid">
    <a className={cls + ' site-btn booking'} href={bookingComUrl(link)} target="_blank" rel="noopener" onClick={open}>Booking.com</a>
    <a className={cls + ' site-btn trip'} href={tripComUrl(link)} target="_blank" rel="noopener" onClick={open}>Trip.com</a>
    <a className={cls + ' site-btn agoda'} href={agodaUrl(link)} target="_blank" rel="noopener" onClick={open}>Agoda</a>
    <a className={cls + ' site-btn google'} href={googleHotelsUrl(link)} target="_blank" rel="noopener" onClick={openGoogle}>Compare prices</a>
  </div>;
}
