import { useEffect, useMemo, useState } from 'react';
import { repo } from '../data/repo';
import type { FloorOccupancy, WorkDay } from '../data/types';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dateLabel = (d: Date) => d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });

// Today, or the next work day when today is not one.
function defaultDay(today: Date, active: Set<number>): Date {
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    if (active.has(d.getDay())) return d;
  }
  return today;
}

function SeatStrip({ total, taken }: { total: number; taken: number }) {
  return (
    <div className="seats" role="img" aria-label={`${taken} תפוסים מתוך ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < taken ? 'seat seat-taken' : 'seat'} />
      ))}
    </div>
  );
}

export default function Home() {
  const today = useMemo(() => new Date(), []);
  const [workDays, setWorkDays] = useState<WorkDay[]>([]);
  const [day, setDay] = useState<Date | null>(null);
  const [rows, setRows] = useState<FloorOccupancy[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    repo.workDays()
      .then((w) => {
        setWorkDays(w);
        setDay(defaultDay(today, new Set(w.filter((x) => x.active).map((x) => x.day))));
      })
      .catch((e) => setError(e.message));
  }, [today]);

  useEffect(() => {
    if (!day) return;
    setRows(null);
    repo.floorOccupancy(iso(day)).then(setRows).catch((e) => setError(e.message));
  }, [day]);

  // The week (Sunday-based) that contains the selected day, active days only.
  const week = useMemo(() => {
    if (!day) return [];
    const sunday = addDays(day, -day.getDay());
    return workDays.filter((w) => w.active).map((w) => ({ w, date: addDays(sunday, w.day) }));
  }, [day, workDays]);

  const sites = useMemo(() => {
    const m = new Map<string, { name: string; code: string; floors: FloorOccupancy[] }>();
    for (const r of rows ?? []) {
      if (!m.has(r.site_id)) m.set(r.site_id, { name: r.site_name, code: r.site_code, floors: [] });
      m.get(r.site_id)!.floors.push(r);
    }
    return [...m.values()];
  }, [rows]);

  const totalFree = (rows ?? []).reduce((s, r) => s + r.free, 0);

  if (error) return <div className="notice" role="alert">לא הצלחנו לטעון את הנתונים מהשרת. {error}</div>;

  return (
    <>
      <div className="day-head">
        <h1 className="day-title">
          {day ? <>{totalFree} <span className="day-title-rest">מקומות פנויים {iso(day) === iso(today) ? 'היום' : `ביום ${workDays.find((w) => w.day === day.getDay())?.name}`}</span></> : ' '}
        </h1>
        <div className="week" role="tablist" aria-label="בחירת יום">
          <button className="week-step" aria-label="שבוע קודם" onClick={() => day && setDay(addDays(day, -7))}>›</button>
          {week.map(({ w, date }) => (
            <button
              key={w.day}
              role="tab"
              aria-selected={day ? iso(date) === iso(day) : false}
              className={`week-day${day && iso(date) === iso(day) ? ' is-on' : ''}${iso(date) === iso(today) ? ' is-today' : ''}`}
              onClick={() => setDay(date)}
            >
              <span className="week-day-name">{w.name}</span>
              <span className="week-day-date">{dateLabel(date)}</span>
            </button>
          ))}
          <button className="week-step" aria-label="שבוע הבא" onClick={() => day && setDay(addDays(day, 7))}>‹</button>
        </div>
      </div>

      {rows === null ? (
        <p className="muted">טוען...</p>
      ) : rows.length === 0 ? (
        <div className="empty">
          <p>עוד לא הוגדרו אתרים וקומות.</p>
        </div>
      ) : (
        sites.map((s) => (
          <section key={s.code} className="site" aria-labelledby={`site-${s.code}`}>
            <h2 id={`site-${s.code}`} className="site-name">{s.name}</h2>
            <ul className="floors">
              {s.floors.map((f) => (
                <li key={f.floor_id} className="floor">
                  <div className="floor-num" aria-hidden="true">{f.floor_number}</div>
                  <div className="floor-body">
                    <div className="floor-line">
                      <span className="floor-name">{f.floor_name}</span>
                      <span className={`floor-free${f.free === 0 ? ' is-full' : ''}`}>
                        {f.free === 0 ? 'אין מקומות פנויים' : `${f.free} פנויים`}
                        <span className="muted"> מתוך {f.work_seats}</span>
                      </span>
                    </div>
                    <SeatStrip total={f.work_seats} taken={f.taken} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
