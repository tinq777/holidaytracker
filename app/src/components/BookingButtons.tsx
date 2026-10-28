import { bookingComUrl, copyName, tripComUrl, type LinkInput } from '../lib/bookingLinks';
import { useUI } from './ui';

/** "Booking.com" and "Trip.com" buttons with dates and guests filled in. */
export function BookingButtons({ link, small }: { link: LinkInput; small?: boolean }) {
  const { toast } = useUI();
  const cls = 'btn' + (small ? ' sm' : '');
  const open = () => { copyName(link.name); toast('Hotel name copied, in case you need to paste it'); };
  return <>
    <a className={cls + ' site-btn booking'} href={bookingComUrl(link)} target="_blank" rel="noopener" onClick={open}>Booking.com</a>
    <a className={cls + ' site-btn trip'} href={tripComUrl(link)} target="_blank" rel="noopener" onClick={open}>Trip.com</a>
  </>;
}
