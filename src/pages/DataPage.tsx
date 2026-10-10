import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { repo } from '../data/repo';
import type { Floor, ImportResult, Person, PlanVersion, Role, Room, Site, Unit, UnitType } from '../data/types';
import Dialog from '../components/Dialog';
import { COLUMNS, KIND_LABEL, downloadSheet, parseFile, type ImportKind } from '../lib/excel';

type Tab = 'people' | 'sites' | 'lists' | 'secure' | 'import' | 'admin';

interface Data {
  people: Person[]; units: Unit[]; roles: Role[]; types: UnitType[];
  sites: Site[]; floors: Floor[]; rooms: Room[]; access: { room_id: string; person_id: string }[];
  versions: PlanVersion[];
}

export default function DataPage() {
  const { isManager, isSystemAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>('people');
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [people, units, roles, types, sites, floors, rooms, access, versions] = await Promise.all([
        repo.people(), repo.units(), repo.roles(), repo.unitTypes(), repo.sites(), repo.floors(), repo.rooms(),
        repo.secureAccess(), repo.planVersions(),
      ]);
      setD({ people, units, roles, types, sites, floors, rooms, access, versions });
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!isManager) return <div className="notice">המסך הזה פתוח למנהלים בלבד.</div>;

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setError(null); setOk(null);
    try { await fn(); await load(); if (done) setOk(done); } catch (e) { setError((e as Error).message); }
  };

  const tabs: [Tab, string][] = [
    ['people', 'אנשים'], ['sites', 'אתרים וקומות'], ['lists', 'תפקידים וסוגי יחידות'],
    ['secure', 'חדרים מאובטחים'], ['import', 'ייבוא מאקסל'],
    ...(isSystemAdmin ? [['admin', 'ניהול נתונים'] as [Tab, string]] : []),
  ];

  return (
    <>
      <h1>נתונים</h1>
      <div className="tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' is-on' : ''}`} onClick={() => { setTab(k); setError(null); setOk(null); }}>{label}</button>
        ))}
      </div>
      {error && <div className="notice" role="alert">{error}</div>}
      {ok && <div className="once" role="status">{ok}</div>}
      {!d ? <p className="muted">טוען...</p> : (
        <>
          {tab === 'people' && <PeopleTab d={d} run={run} />}
          {tab === 'sites' && <SitesTab d={d} run={run} />}
          {tab === 'lists' && <ListsTab d={d} run={run} />}
          {tab === 'secure' && <SecureTab d={d} run={run} />}
          {tab === 'import' && <ImportTab d={d} onDone={load} />}
          {tab === 'admin' && isSystemAdmin && <AdminTab run={run} />}
        </>
      )}
    </>
  );
}

type Run = (fn: () => Promise<unknown>, done?: string) => Promise<void>;

// ---- people -------------------------------------------------------------------
function PeopleTab({ d, run }: { d: Data; run: Run }) {
  const [q, setQ] = useState('');
  const [unit, setUnit] = useState('');
  const [limit, setLimit] = useState(100);
  const [edit, setEdit] = useState<Person | 'new' | null>(null);
  const unitName = (id: string | null) => (id ? d.units.find((u) => u.id === id)?.name ?? '' : '');
  const roleName = (id: string | null) => (id ? d.roles.find((r) => r.id === id)?.name ?? '' : '');
  const list = useMemo(() => d.people.filter((p) =>
    (!q || p.full_name.includes(q) || p.employee_no.includes(q) || (p.email ?? '').includes(q)) &&
    (!unit || (unit === '-' ? !p.unit_id : p.unit_id === unit))), [d.people, q, unit]);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const row = {
      employee_no: String(f.get('employee_no')).trim(),
      full_name: String(f.get('full_name')).trim(),
      email: String(f.get('email')).trim() || null,
      unit_id: String(f.get('unit_id')) || null,
      role_id: String(f.get('role_id')) || null,
      active: f.get('active') === 'on',
    };
    await run(async () => {
      if (edit === 'new') await repo.insert('people', row); else if (edit) await repo.update('people', edit.id, row);
      setEdit(null);
    }, 'נשמר');
  }

  return (
    <>
      <div className="toolbar">
        <input type="search" className="search" placeholder="חיפוש שם, מספר עובד או אימייל" aria-label="חיפוש" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="inline-label">
          יחידה
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="">הכל</option>
            <option value="-">ללא שיוך</option>
            {d.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <button className="btn" onClick={() => setEdit('new')}>אדם חדש</button>
        <span className="muted">{list.length} אנשים</span>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>שם</th><th>מספר עובד</th><th>יחידה</th><th>תפקיד</th><th>אימייל</th><th><span className="sr-only">פעולות</span></th></tr></thead>
          <tbody>
            {list.slice(0, limit).map((p) => (
              <tr key={p.id} className={p.active ? '' : 'is-off'}>
                <td>{p.full_name}{!p.active && <span className="muted"> (לא פעיל)</span>}</td>
                <td dir="ltr" className="cell-num">{p.employee_no}</td>
                <td>{unitName(p.unit_id) || <span className="muted">ללא שיוך</span>}</td>
                <td>{roleName(p.role_id)}</td>
                <td dir="ltr" className="cell-email">{p.email}</td>
                <td><button className="link-btn" onClick={() => setEdit(p)}>עריכה</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length > limit && <button className="btn" onClick={() => setLimit(limit + 200)}>הצגת עוד</button>}

      <Dialog open={edit !== null} title={edit === 'new' ? 'אדם חדש' : 'עריכת אדם'} onClose={() => setEdit(null)}>
        {edit !== null && (
          <form className="form" onSubmit={save}>
            <label>מספר עובד<input name="employee_no" dir="ltr" required defaultValue={edit === 'new' ? '' : edit.employee_no} /></label>
            <label>שם מלא<input name="full_name" required defaultValue={edit === 'new' ? '' : edit.full_name} /></label>
            <label>אימייל<input name="email" type="email" dir="ltr" defaultValue={edit === 'new' ? '' : edit.email ?? ''} /></label>
            <label>יחידה
              <select name="unit_id" defaultValue={edit === 'new' ? '' : edit.unit_id ?? ''}>
                <option value="">ללא שיוך</option>
                {d.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            <label>תפקיד
              <select name="role_id" defaultValue={edit === 'new' ? '' : edit.role_id ?? ''}>
                <option value="">ללא</option>
                {d.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label className="check"><input type="checkbox" name="active" defaultChecked={edit === 'new' ? true : edit.active} /> פעיל</label>
            <p className="hint">אדם שעזב מסמנים כלא פעיל במקום למחוק, כדי לשמור על ההיסטוריה.</p>
            <button className="btn btn-primary">שמירה</button>
          </form>
        )}
      </Dialog>
    </>
  );
}

// ---- sites and floors --------------------------------------------------------
function SitesTab({ d, run }: { d: Data; run: Run }) {
  const [editSite, setEditSite] = useState<Site | 'new' | null>(null);
  const [editFloor, setEditFloor] = useState<{ floor: Floor | null; site: string } | null>(null);

  return (
    <>
      <div className="toolbar"><button className="btn" onClick={() => setEditSite('new')}>אתר חדש</button></div>
      {d.sites.map((s) => (
        <section key={s.id} className="site">
          <div className="site-name row-between">
            <span>{s.name} <span className="muted">{s.city} · {s.code}</span>{!s.active && <span className="muted"> (לא פעיל)</span>}</span>
            <span className="row-actions">
              <button className="link-btn" onClick={() => setEditSite(s)}>עריכה</button>
              <button className="link-btn" onClick={() => setEditFloor({ floor: null, site: s.id })}>קומה חדשה</button>
            </span>
          </div>
          <ul className="plain-list">
            {d.floors.filter((f) => f.site_id === s.id).map((f) => {
              const rooms = d.rooms.filter((r) => r.floor_id === f.id);
              return (
                <li key={f.id} className="row-between">
                  <span>{f.name} <span className="muted">· {rooms.length} חדרים</span>{!f.active && <span className="muted"> (לא פעילה)</span>}</span>
                  <button className="link-btn" onClick={() => setEditFloor({ floor: f, site: s.id })}>עריכה</button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="hint">חדרים ומושבים מסמנים על מפת הקומה (בעורך המפות, בשלב הבא).</p>

      <Dialog open={editSite !== null} title={editSite === 'new' ? 'אתר חדש' : 'עריכת אתר'} onClose={() => setEditSite(null)}>
        {editSite !== null && (
          <form className="form" onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const row = { name: String(f.get('name')).trim(), city: String(f.get('city')).trim() || null, code: String(f.get('code')).trim().toUpperCase(), active: f.get('active') === 'on' };
            run(async () => { if (editSite === 'new') await repo.insert('sites', row); else await repo.update('sites', editSite.id, row); setEditSite(null); }, 'נשמר');
          }}>
            <label>שם<input name="name" required defaultValue={editSite === 'new' ? '' : editSite.name} /></label>
            <label>עיר<input name="city" defaultValue={editSite === 'new' ? '' : editSite.city ?? ''} /></label>
            <label>קוד קצר <span className="muted">(2 עד 6 אותיות באנגלית או ספרות, למשל JRS)</span>
              <input name="code" dir="ltr" required pattern="[A-Za-z0-9]{2,6}" defaultValue={editSite === 'new' ? '' : editSite.code} /></label>
            <label className="check"><input type="checkbox" name="active" defaultChecked={editSite === 'new' ? true : editSite.active} /> פעיל</label>
            <button className="btn btn-primary">שמירה</button>
          </form>
        )}
      </Dialog>

      <Dialog open={editFloor !== null} title={editFloor?.floor ? 'עריכת קומה' : 'קומה חדשה'} onClose={() => setEditFloor(null)}>
        {editFloor !== null && (
          <form className="form" onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const number = Number(f.get('number'));
            const row = { site_id: editFloor.site, number, name: String(f.get('name')).trim() || `קומה ${number}`, active: f.get('active') === 'on' };
            run(async () => { if (editFloor.floor) await repo.update('floors', editFloor.floor.id, row); else await repo.insert('floors', row); setEditFloor(null); }, 'נשמר');
          }}>
            <label>מספר קומה<input name="number" type="number" required defaultValue={editFloor.floor?.number ?? ''} /></label>
            <label>שם תצוגה<input name="name" placeholder="למשל: קומה 6" defaultValue={editFloor.floor?.name ?? ''} /></label>
            <label className="check"><input type="checkbox" name="active" defaultChecked={editFloor.floor?.active ?? true} /> פעילה</label>
            <button className="btn btn-primary">שמירה</button>
          </form>
        )}
      </Dialog>
    </>
  );
}

// ---- roles and unit types ----------------------------------------------------
function ListsTab({ d, run }: { d: Data; run: Run }) {
  const List = ({ title, table, items, used }: { title: string; table: 'roles' | 'unit_types'; items: { id: string; name: string }[]; used: (id: string) => number }) => (
    <section className="site">
      <h2 className="site-name">{title}</h2>
      <ul className="plain-list">
        {items.map((i) => (
          <li key={i.id} className="row-between">
            <span>{i.name} <span className="muted">· {used(i.id)}</span></span>
            <span className="row-actions">
              <button className="link-btn" onClick={() => {
                const name = window.prompt('שם חדש', i.name);
                if (name && name.trim() && name !== i.name) run(() => repo.update(table, i.id, { name: name.trim() }), 'נשמר');
              }}>שינוי שם</button>
              <button className="link-btn" onClick={() => window.confirm(`למחוק את "${i.name}"?`) && run(() => repo.remove(table, i.id), 'נמחק')}>מחיקה</button>
            </span>
          </li>
        ))}
      </ul>
      <form className="form form-row" onSubmit={(e) => {
        e.preventDefault();
        const input = e.currentTarget.elements.namedItem('name') as HTMLInputElement;
        const name = input.value.trim();
        if (name) run(async () => { await repo.insert(table, table === 'unit_types' ? { name, sort_order: items.length + 1 } : { name }); input.value = ''; }, 'נוסף');
      }}>
        <input name="name" aria-label={`${title}: חדש`} placeholder="הוספה" />
        <button className="btn">הוספה</button>
      </form>
    </section>
  );
  return (
    <div className="two-col">
      <List title="תפקידים" table="roles" items={d.roles} used={(id) => d.people.filter((p) => p.role_id === id).length} />
      <List title="סוגי יחידות" table="unit_types" items={d.types} used={(id) => d.units.filter((u) => u.type_id === id).length} />
    </div>
  );
}

// ---- secure rooms -----------------------------------------------------------------
function SecureTab({ d, run }: { d: Data; run: Run }) {
  const workRooms = d.rooms.filter((r) => r.kind === 'work');
  const secure = workRooms.filter((r) => r.is_secure);
  const [roomId, setRoomId] = useState(secure[0]?.id ?? '');
  const [pick, setPick] = useState('');
  const floorName = (r: Room) => {
    const f = d.floors.find((x) => x.id === r.floor_id);
    const s = d.sites.find((x) => x.id === f?.site_id);
    return `${s?.name ?? ''} ${f?.name ?? ''}`;
  };
  const allowed = d.access.filter((a) => a.room_id === roomId).map((a) => d.people.find((p) => p.id === a.person_id)).filter(Boolean) as Person[];
  const candidates = d.people.filter((p) => p.active && !allowed.some((a) => a.id === p.id));

  return (
    <div className="two-col">
      <section className="site">
        <h2 className="site-name">אילו חדרים מאובטחים</h2>
        <ul className="plain-list">
          {workRooms.map((r) => (
            <li key={r.id}>
              <label className="check">
                <input type="checkbox" checked={r.is_secure} onChange={(e) => run(() => repo.update('rooms', r.id, { is_secure: e.target.checked }))} />
                {r.name} <span className="muted">· {floorName(r)}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>
      <section className="site">
        <h2 className="site-name">מי מורשה</h2>
        {secure.length === 0 ? <p className="muted">אין חדרים מאובטחים.</p> : (
          <>
            <label className="inline-label">חדר
              <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                {secure.map((r) => <option key={r.id} value={r.id}>{r.name} · {floorName(r)}</option>)}
              </select>
            </label>
            <form className="form form-row" onSubmit={(e) => { e.preventDefault(); if (pick) run(async () => { await repo.grantSecure(roomId, pick); setPick(''); }); }}>
              <select aria-label="הוספת אדם" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">הוספת אדם...</option>
                {candidates.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.employee_no})</option>)}
              </select>
              <button className="btn" disabled={!pick}>הוספה</button>
            </form>
            <ul className="plain-list">
              {allowed.map((p) => (
                <li key={p.id} className="row-between">
                  <span>{p.full_name} <span className="muted" dir="ltr">{p.employee_no}</span></span>
                  <button className="link-btn" onClick={() => run(() => repo.revokeSecure(roomId, p.id))}>הסרה</button>
                </li>
              ))}
            </ul>
            <p className="hint">{allowed.length} מורשים. מי שאינו ברשימה לא יוכל להיות משובץ בחדר.</p>
          </>
        )}
      </section>
    </div>
  );
}

// The database reports import problems in English; show them in Hebrew.
const DAY_LETTER = ['א', 'ב', 'ג', 'ד', 'ה'];
function importError(msg: string): string {
  const rules: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/^missing name$/, () => 'חסר שם יחידה'],
    [/^parent not found: (.*)$/, (m) => `יחידת האב "${m[1]}" לא קיימת`],
    [/^cycle: (.*)$/, (m) => `היחידה "${m[1]}" לא יכולה להיות מתחת לעצמה`],
    [/^missing employee_no or full_name$/, () => 'חסר מספר עובד או שם מלא'],
    [/^unit not found: (.*)$/, (m) => `היחידה "${m[1]}" לא קיימת. ייבאו קודם את המבנה הארגוני או תקנו את השם`],
    [/^employee not found: (.*)$/, (m) => `אין עובד עם מספר ${m[1] || '(ריק)'}`],
    [/^seat not found$/, () => 'המושב לא נמצא. בדקו אתר, קומה, חדר ומושב'],
    [/^seat or person already assigned on day (\d)$/, (m) => `המושב או העובד כבר משובצים ביום ${DAY_LETTER[Number(m[1])] ?? m[1]}`],
    [/secure room/i, () => 'לעובד אין הרשאה לחדר המאובטח'],
    [/^Day (\d) is not an active work day/, (m) => `יום ${DAY_LETTER[Number(m[1])] ?? m[1]} אינו יום עבודה פעיל`],
    [/^Seat or room is not active/, () => 'המושב או החדר אינם פעילים'],
    [/only be assigned in work rooms/, () => 'אפשר לשבץ רק בחדרי עבודה'],
    [/^Person is not active/, () => 'העובד אינו פעיל'],
  ];
  for (const [re, fn] of rules) { const m = msg.match(re); if (m) return fn(m); }
  return msg;
}

// ---- Excel import ------------------------------------------------------------------
function ImportTab({ d, onDone }: { d: Data; onDone: () => Promise<void> }) {
  const [kind, setKind] = useState<ImportKind>('people');
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [version, setVersion] = useState(d.versions.find((v) => v.status === 'published')?.id ?? d.versions[0]?.id ?? '');
  const [replace, setReplace] = useState(false);

  const reset = () => { setRows(null); setPreview(null); setDone(null); setErr(null); setFileName(''); };
  const call = (r: Record<string, unknown>[], dry: boolean) =>
    kind === 'units' ? repo.importUnits(r, dry)
      : kind === 'people' ? repo.importPeople(r, dry)
        : repo.importAssignments(version, r, replace, dry);

  async function onFile(file: File) {
    reset(); setBusy(true); setFileName(file.name);
    try {
      const parsed = await parseFile(kind, file);
      if (parsed.missing.length) { setErr(`חסרות עמודות בקובץ: ${parsed.missing.join(', ')}. הורידו את התבנית והשתמשו בכותרות שלה.`); return; }
      if (!parsed.rows.length) { setErr('לא נמצאו שורות בקובץ.'); return; }
      setRows(parsed.rows);
      setPreview(await call(parsed.rows, true));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function exportCurrent() {
    const unitName = (id: string | null) => (id ? d.units.find((u) => u.id === id)?.name ?? '' : '');
    if (kind === 'units') {
      await downloadSheet('units', d.units.map((u) => ({ name: u.name, type: d.types.find((t) => t.id === u.type_id)?.name ?? '', parent: unitName(u.parent_id) })));
    } else if (kind === 'people') {
      await downloadSheet('people', d.people.map((p) => ({ employee_no: p.employee_no, full_name: p.full_name, email: p.email ?? '', unit: unitName(p.unit_id), role: d.roles.find((r) => r.id === p.role_id)?.name ?? '' })));
    } else {
      await downloadSheet('assignments');
    }
  }

  return (
    <section className="narrow-wide">
      <div className="toolbar">
        <label className="inline-label">מה מייבאים
          <select value={kind} onChange={(e) => { setKind(e.target.value as ImportKind); reset(); }}>
            {(Object.keys(KIND_LABEL) as ImportKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <button className="btn" onClick={() => downloadSheet(kind)}>הורדת תבנית ריקה</button>
        {kind !== 'assignments' && <button className="btn" onClick={exportCurrent}>הורדת הנתונים הקיימים</button>}
      </div>
      <p className="hint">עמודות: {COLUMNS[kind].map((c) => c.header).join(', ')}.
        {kind === 'units' && ' יחידה קיימת (לפי שם) מתעדכנת, יחידה חדשה נוספת.'}
        {kind === 'people' && ' עובד קיים (לפי מספר עובד) מתעדכן, עובד חדש נוסף. ייבאו קודם את המבנה הארגוני.'}
        {kind === 'assignments' && ' השיבוץ נכנס לגרסת התבנית שתבחרו.'}
      </p>
      {kind === 'assignments' && (
        <div className="toolbar">
          <label className="inline-label">גרסת תבנית
            <select value={version} onChange={(e) => setVersion(e.target.value)}>
              {d.versions.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.status === 'published' ? 'פעילה' : v.status === 'draft' ? 'טיוטה' : 'ארכיון'})</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> להחליף את כל השיבוצים בגרסה</label>
        </div>
      )}

      <label className="drop">
        <input type="file" accept=".xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
        <span>{busy ? 'בודק את הקובץ...' : fileName ? `קובץ: ${fileName}. לבחירת קובץ אחר לחצו כאן` : 'לחצו לבחירת קובץ אקסל (.xlsx)'}</span>
      </label>

      {err && <div className="notice" role="alert">{err}</div>}
      {preview && !done && (
        <div className="preview" aria-live="polite">
          <h2>תצוגה מקדימה</h2>
          <p>{rows?.length} שורות בקובץ: {preview.inserted} {kind === 'assignments' ? 'שיבוצים ייווספו' : 'חדשים'}{preview.updated !== undefined ? `, ${preview.updated} יתעדכנו` : ''}.</p>
          {preview.errors.length > 0 ? (
            <>
              <p className="notice">נמצאו {preview.errors.length} שגיאות. תקנו את הקובץ וטענו אותו שוב. כל עוד יש שגיאות, שום דבר לא נשמר.</p>
              <div className="table-wrap"><table className="table">
                <thead><tr><th className="nowrap">שורה בקובץ</th><th>שגיאה</th></tr></thead>
                <tbody>{preview.errors.slice(0, 200).map((e, i) => <tr key={i}><td className="cell-num">{e.row + 1}</td><td>{importError(e.error)}</td></tr>)}</tbody>
              </table></div>
            </>
          ) : (
            <button className="btn btn-primary" disabled={busy} onClick={async () => {
              setBusy(true);
              try { const r = await call(rows!, false); setDone(r); await onDone(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
            }}>ייבוא {rows?.length} שורות</button>
          )}
        </div>
      )}
      {done && (
        <div className="once" role="status">
          {done.applied ? `הייבוא הושלם: ${done.inserted} נוספו${done.updated !== undefined ? `, ${done.updated} עודכנו` : ''}.` : 'הייבוא לא בוצע. בדקו את השגיאות.'}
          {' '}<button className="link-btn" onClick={reset}>ייבוא נוסף</button>
        </div>
      )}
    </section>
  );
}

// ---- system admin: demo and delete ------------------------------------------------
function AdminTab({ run }: { run: Run }) {
  const [word, setWord] = useState('');
  const [scope, setScope] = useState<'demo' | 'people' | 'all'>('demo');
  const needed = scope === 'demo' ? 'דמה' : 'מחק';
  const text = {
    demo: 'מוחק את כל הנתונים (חוץ ממשתמשים והגדרות) וטוען נתוני דמה: 2 אתרים, 3 קומות, 250 אנשים בדויים ושיבוץ שבועי.',
    people: 'מוחק את כל האנשים, השיבוצים, הטיוטות והרשאות החדרים המאובטחים. אתרים, קומות, חדרים ויחידות נשארים.',
    all: 'מוחק הכל: אתרים, קומות, חדרים, מושבים, יחידות, אנשים ושיבוצים. משתמשים והגדרות נשארים.',
  }[scope];
  return (
    <section className="narrow">
      <p className="lead">פעולות שאי אפשר לבטל. כל פעולה נרשמת ביומן השינויים.</p>
      <fieldset className="radios">
        <legend className="sr-only">פעולה</legend>
        <label><input type="radio" checked={scope === 'demo'} onChange={() => { setScope('demo'); setWord(''); }} /> טעינת נתוני דמה מחדש</label>
        <label><input type="radio" checked={scope === 'people'} onChange={() => { setScope('people'); setWord(''); }} /> מחיקת אנשים ושיבוצים</label>
        <label><input type="radio" checked={scope === 'all'} onChange={() => { setScope('all'); setWord(''); }} /> מחיקת כל הנתונים</label>
      </fieldset>
      <p>{text}</p>
      <form className="form" onSubmit={(e) => {
        e.preventDefault();
        if (word !== needed) return;
        run(async () => { if (scope === 'demo') await repo.loadDemo(); else await repo.resetData(scope); setWord(''); },
          scope === 'demo' ? 'נתוני הדמה נטענו' : 'הנתונים נמחקו');
      }}>
        <label>כדי לאשר, הקלידו "{needed}"<input value={word} onChange={(e) => setWord(e.target.value)} /></label>
        <button className="btn btn-danger" disabled={word !== needed}>{scope === 'demo' ? 'טעינת נתוני דמה' : 'מחיקה'}</button>
      </form>
      <p className="hint">לפני מחיקה של נתונים אמיתיים, הורידו גיבוי: "הורדת הנתונים הקיימים" בלשונית הייבוא. גיבוי מלא בקובץ אחד יתווסף בשלב הניהול.</p>
    </section>
  );
}
