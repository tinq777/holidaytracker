import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import type { Lesson } from '../lib/types';

type LessonWithTrip = Lesson & { trip: string };
import { Icon } from './ui';

/** Lessons carried forward from other trips. "Reviewed" is per holiday and optional. */
export function LessonsReminder({ excludeHolidayId, reviewed, onToggle, startOpen = true }: { excludeHolidayId?: string; reviewed: string[]; onToggle: (id: string) => void; startOpen?: boolean }) {
  const data = useLiveQuery<LessonWithTrip[], LessonWithTrip[]>(async () => {
    const ls = await db.lessons.filter(l => l.carryForward && l.holidayId !== excludeHolidayId).toArray();
    const hs = await db.holidays.toArray();
    return ls.map(l => ({ ...l, trip: hs.find(h => h.id === l.holidayId)?.name ?? '' }));
  }, [excludeHolidayId], [] as LessonWithTrip[]);
  const [open, setOpen] = useState(startOpen);
  if (!data.length) return null;
  const left = data.filter(l => !reviewed.includes(l.id)).length;
  const byCat = data.reduce<Record<string, LessonWithTrip[]>>((m, l) => ((m[l.category] ??= []).push(l), m), {});
  return <div className="section">
    <div className="section-head">
      <h3>Lessons from previous trips</h3>
      <button className="btn ghost sm" onClick={() => setOpen(!open)}>{open ? 'Hide' : left ? `Show (${left})` : 'Show'}</button>
    </div>
    {open && <div className="group">
      {Object.entries(byCat).map(([cat, ls]) => ls.map((l, i) => {
        const done = reviewed.includes(l.id);
        return <div className="lesson" key={l.id}>
          <span style={{ fontSize: 18 }} aria-hidden>{done ? '✓' : '⚠'}</span>
          <div style={{ flex: 1, color: done ? 'var(--faint)' : undefined }}>
            {i === 0 && <div className="small" style={{ fontWeight: 700, color: 'var(--ink)' }}>{cat}</div>}
            <div>{l.text}</div>
            <div className="tiny muted">{l.trip}</div>
          </div>
          <button className={'check' + (done ? ' on' : '')} aria-label={done ? 'Mark as not reviewed' : 'Mark as reviewed'} onClick={() => onToggle(l.id)}>{done && <Icon name="check" size={16} stroke={3} />}</button>
        </div>;
      }))}
    </div>}
  </div>;
}
