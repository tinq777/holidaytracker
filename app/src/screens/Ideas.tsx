import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { fmtRange } from '../lib/dates';
import { cityRange } from '../lib/cityDates';
import { suggestIdeas, mergeStarred, IdeasUnavailable } from '../ai/ideas';
import { useOnline, useUI } from '../components/ui';
import type { CityIdeas, Holiday, IdeaItem } from '../lib/types';

type Section = 'see' | 'events' | 'shop' | 'breakfast' | 'lunch' | 'dinner';
type HotelRef = { name: string; address?: string; from: string; to: string };

/** Cities to suggest for: the trip's destinations plus any non-layover hotel cities, each with its dates and hotels. */
export function useCities(h: Holiday) {
  const stays = useLiveQuery(() => db.accommodations.where('holidayId').equals(h.id).toArray(), [h.id], []);
  const norm = (s: string) => s.trim().toLowerCase();
  const names = [...h.destinations];
  for (const a of stays) if (!a.layover && a.city && !names.some(n => norm(n) === norm(a.city))) names.push(a.city);
  return names.map(city => {
    const { from, to, dated, mine } = cityRange(h, stays, city);
    const hotels: HotelRef[] = mine.filter(a => a.hotel).sort((a, b) => a.checkIn.localeCompare(b.checkIn)).map(a => ({ name: a.hotel, address: a.address, from: a.checkIn, to: a.checkOut }));
    return { city, from, to, fromStays: dated, hotels };
  }).sort((a, b) => a.from.localeCompare(b.from));
}

export default function Ideas({ h }: { h: Holiday }) {
  const cities = useCities(h);
  const saved = useLiveQuery(() => db.ideas.where('holidayId').equals(h.id).toArray(), [h.id], []);
  if (!cities.length) return <div className="card empty"><b>Add a destination first</b>Edit the trip to add the cities you're visiting, then come back for ideas.</div>;
  return <>
    <p className="small muted" style={{ margin: '10px 4px 12px' }}>
      Things to do, what's on, where to shop and where to eat in each city{h.children ? ', picked with the kids in mind' : ''}. Saved on your phone, so you can read them offline.
    </p>
    {cities.map(c => <CityCard key={c.city} h={h} {...c} ideas={saved.find(s => s.city === c.city)} others={cities.filter(x => x.city !== c.city).map(x => x.city)} />)}
  </>;
}

function CityCard({ h, city, from, to, fromStays, hotels, ideas, others }: { h: Holiday; city: string; from: string; to: string; fromStays: boolean; hotels: HotelRef[]; ideas?: CityIdeas; others: string[] }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(true);
  const online = useOnline();
  const { toast } = useUI();

  async function run() {
    setErr(''); setBusy(true);
    try {
      const next = await suggestIdeas({ holidayId: h.id, city, from, to, adults: h.adults, children: h.children, otherCities: others, hotels });
      await db.ideas.put(mergeStarred(ideas, next));
      toast(`Ideas for ${city} ready`);
    } catch (e) {
      setErr(e instanceof IdeasUnavailable ? e.message : "Couldn't get suggestions right now. Try again in a moment.");
    } finally { setBusy(false); }
  }

  const star = async (k: Section, id: string) => {
    if (!ideas) return;
    await db.ideas.put({ ...ideas, [k]: (ideas[k] ?? []).map(x => (x.id === id ? { ...x, starred: !x.starred } : x)) });
  };
  const remove = async (k: Section, id: string) => { if (ideas) await db.ideas.put({ ...ideas, [k]: (ideas[k] ?? []).filter(x => x.id !== id) }); };

  const hotelNow = hotels.map(x => x.name).join('|'), hotelThen = (ideas?.hotels ?? []).join('|');
  return <div className="section city-ideas">
    <div className="section-head">
      <button className="city-title" onClick={() => setOpen(!open)} aria-expanded={open}>
        <h3>{city}</h3><span className="small muted">{fmtRange(from, to)}{!fromStays && ' (whole trip; set city dates in Edit trip)'}</span>
      </button>
      <button className="btn ghost sm" disabled={busy || !online} onClick={run}>{busy ? 'Thinking…' : ideas ? 'Refresh' : '✨ Suggest'}</button>
    </div>
    {err && <div className="notice warn small">{err}</div>}
    {!ideas && !busy && <div className="card muted small">Tap ✨ Suggest for things to see and do, what's on {fmtRange(from, to)}, boutique shopping, and breakfast, lunch and dinner spots.{!fromStays && ' Add your hotels to get dates for each city.'}</div>}
    {busy && !ideas && <div className="card muted small">Looking up {city}{h.children ? ' with the kids in mind' : ''}… this can take up to a minute.</div>}
    {ideas && open && <>
      <Group title="See & do" k="see" items={ideas.see} city={city} star={star} remove={remove} />
      <Group title={`What's on · ${fmtRange(from, to)}`} k="events" items={ideas.events} city={city} star={star} remove={remove}
        empty={ideas.source === 'ai-search' ? 'Nothing special found for these dates.' : 'No events listed.'}
        caption={ideas.source === 'ai' ? 'Web search was unavailable, so these are events that usually happen at this time of year. Check dates before you go.' : 'Check dates and tickets before you go.'} />
      <Group title="Shop" k="shop" items={ideas.shop ?? []} city={city} star={star} remove={remove}
        empty={ideas.shop ? 'No boutique picks this time.' : 'Tap Refresh to add boutique and trendy shopping ideas.'} />
      <div className="eat-head">Eat</div>
      {hotelNow && hotelNow !== hotelThen
        ? <div className="notice small">{hotelThen ? 'Your hotel has changed.' : "You've added a hotel."} Tap Refresh for places near {hotels.map(x => x.name).join(' and ')}.</div>
        : <p className="tiny muted" style={{ margin: '0 4px 4px' }}>{hotelNow ? `Near ${hotels.map(x => x.name).join(' and ')}` : "Add your hotel in Bookings to get places near where you're staying."}</p>}
      <Group title="Breakfast" k="breakfast" items={ideas.breakfast} city={city} star={star} remove={remove} sub />
      <Group title="Lunch" k="lunch" items={ideas.lunch} city={city} star={star} remove={remove} sub />
      <Group title="Dinner" k="dinner" items={ideas.dinner} city={city} star={star} remove={remove} sub />
      <p className="tiny muted" style={{ margin: '8px 4px 0' }}>
        {ideas.source === 'demo' ? 'Demo suggestions, not real places. Choose Claude in More → AI reading for real ones.' : `Suggested by Claude on ${new Date(ideas.generatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}. Opening hours change, so check before heading out.`} ★ keeps an idea when you refresh.
      </p>
    </>}
  </div>;
}

function Group({ title, k, items, city, star, remove, empty, caption, sub }: {
  title: string; k: Section; items: IdeaItem[]; city: string; sub?: boolean; empty?: string; caption?: string;
  star: (k: Section, id: string) => void; remove: (k: Section, id: string) => void;
}) {
  if (!items.length && !empty) return null;
  return <>
    <div className={sub ? 'idea-sub' : 'idea-head'}>{title}</div>
    {items.length ? <div className="group">{items.map(x => <div key={x.id} className="row idea">
      <div className="grow">
        <a className="title idea-name" href={`https://maps.apple.com/?q=${encodeURIComponent(`${x.name}, ${city}`)}`} target="_blank" rel="noopener">{x.name}</a>
        {x.note && <div className="sub">{x.note}</div>}
        <div className="idea-meta">{[x.tag, x.when, x.near ?? x.area, x.price, x.kids === true ? 'Kid-friendly' : x.kids === false ? 'Not ideal for kids' : ''].filter(Boolean).join(' · ')}</div>
      </div>
      <div className="idea-actions">
        <button className={'star' + (x.starred ? ' on' : '')} aria-label={x.starred ? 'Unstar' : 'Star to keep'} onClick={() => star(k, x.id)}>{x.starred ? '★' : '☆'}</button>
        <button className="x" aria-label="Remove" onClick={() => remove(k, x.id)}>×</button>
      </div>
    </div>)}</div> : <div className="card muted small">{empty}</div>}
    {caption && items.length > 0 && <p className="tiny muted" style={{ margin: '6px 4px 0' }}>{caption}</p>}
  </>;
}
