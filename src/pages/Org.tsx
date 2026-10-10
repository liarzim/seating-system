import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { repo } from '../data/repo';
import type { OrgChange, OrgDraft, Person, Role, Unit, UnitType } from '../data/types';
import { useAuth } from '../auth/AuthProvider';
import Dialog from '../components/Dialog';

const NO_UNIT = '__none__';
type Kind = 'unit' | 'person';
interface Pending { kind: Kind; ids: string[]; to: string | null }
interface Undo { kind: Kind; moves: { id: string; from: string | null }[]; label: string }

const todayIso = () => new Date().toISOString().slice(0, 10);

// Apply a draft's changes to copies of the data, to show "the structure as it will be".
function withDraft(units: Unit[], people: Person[], changes: OrgChange[]) {
  const u = new Map(units.map((x) => [x.id, { ...x }]));
  const p = new Map(people.map((x) => [x.id, { ...x }]));
  for (const c of changes) {
    if (c.kind === 'unit' && u.has(c.target_id)) u.get(c.target_id)!.parent_id = c.to_unit;
    if (c.kind === 'person' && p.has(c.target_id)) p.get(c.target_id)!.unit_id = c.to_unit;
  }
  return { units: [...u.values()], people: [...p.values()] };
}

export default function Org() {
  const { isManager } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [types, setTypes] = useState<UnitType[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [drafts, setDrafts] = useState<OrgDraft[]>([]);
  const [viewDraft, setViewDraft] = useState<string>('');           // '' = current structure
  const [changes, setChanges] = useState<OrgChange[]>([]);
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set()); // people ids
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [editUnit, setEditUnit] = useState<Unit | 'new' | null>(null);
  const [newParent, setNewParent] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState<{ kind: Kind; ids: string[] } | null>(null);
  const [menuUnit, setMenuUnit] = useState<Unit | null>(null); // small screens: actions in a dialog

  const load = useCallback(async () => {
    try {
      const [u, p, t, r, d] = await Promise.all([repo.units(), repo.people(), repo.unitTypes(), repo.roles(), repo.orgDrafts()]);
      setUnits(u); setPeople(p); setTypes(t); setRoles(r); setDrafts(d.filter((x) => x.status === 'draft'));
      setLoaded(true);
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadChanges = useCallback(async (id: string) => {
    if (!id) { setChanges([]); setConflicts(new Set()); return; }
    const [c, k] = await Promise.all([repo.orgChanges(id), repo.draftConflicts(id)]);
    setChanges(c); setConflicts(new Set(k.map((x) => x.change_id)));
  }, []);
  useEffect(() => { loadChanges(viewDraft).catch((e) => setError(e.message)); }, [viewDraft, loadChanges]);

  // What is shown: current structure, or the draft applied on top of it.
  const shown = useMemo(() => (viewDraft ? withDraft(units, people, changes) : { units, people }), [viewDraft, units, people, changes]);
  const changedIds = useMemo(() => new Set(changes.map((c) => c.target_id)), [changes]);

  const tree = useMemo(() => {
    const kids = new Map<string | null, Unit[]>();
    for (const u of shown.units) {
      const k = u.parent_id ?? null;
      if (!kids.has(k)) kids.set(k, []);
      kids.get(k)!.push(u);
    }
    const members = new Map<string, Person[]>();
    for (const p of shown.people) {
      const k = p.unit_id ?? NO_UNIT;
      if (!members.has(k)) members.set(k, []);
      members.get(k)!.push(p);
    }
    const total = new Map<string, number>();
    const count = (id: string): number => {
      if (total.has(id)) return total.get(id)!;
      const n = (members.get(id)?.length ?? 0) + (kids.get(id) ?? []).reduce((s, c) => s + count(c.id), 0);
      total.set(id, n);
      return n;
    };
    shown.units.forEach((u) => count(u.id));
    return { kids, members, total };
  }, [shown]);

  const unitName = useCallback((id: string | null) => (id ? units.find((u) => u.id === id)?.name ?? '?' : 'ללא שיוך'), [units]);
  const typeName = (id: string | null) => types.find((t) => t.id === id)?.name ?? '';
  const roleName = (id: string | null) => roles.find((r) => r.id === id)?.name ?? '';

  // Search: open the branches that contain matches.
  const q = query.trim();
  const matches = useMemo(() => {
    if (!q) return null;
    const hitPeople = new Set(shown.people.filter((p) => p.full_name.includes(q) || p.employee_no.includes(q)).map((p) => p.id));
    const hitUnits = new Set(shown.units.filter((u) => u.name.includes(q)).map((u) => u.id));
    const openUp = new Set<string>();
    const parentOf = new Map(shown.units.map((u) => [u.id, u.parent_id]));
    const climb = (id: string | null) => { while (id) { openUp.add(id); id = parentOf.get(id) ?? null; } };
    shown.people.forEach((p) => hitPeople.has(p.id) && climb(p.unit_id));
    hitUnits.forEach((id) => climb(parentOf.get(id) ?? null));
    if ([...hitPeople].some((id) => !shown.people.find((p) => p.id === id)?.unit_id)) openUp.add(NO_UNIT);
    return { hitPeople, hitUnits, openUp };
  }, [q, shown]);
  const isOpen = (id: string) => open.has(id) || Boolean(matches?.openUp.has(id));
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ---- moving ----------------------------------------------------------------
  const startMove = (kind: Kind, ids: string[], to: string | null) => {
    if (!isManager) return;
    const ids2 = ids.filter((id) => (kind === 'person'
      ? (shown.people.find((p) => p.id === id)?.unit_id ?? null) !== to
      : (shown.units.find((u) => u.id === id)?.parent_id ?? null) !== to && id !== to));
    if (ids2.length) setPending({ kind, ids: ids2, to });
  };

  const onDragStart = (e: DragEvent, kind: Kind, id: string) => {
    const ids = kind === 'person' && selected.has(id) ? [...selected] : [id];
    e.dataTransfer.setData('application/json', JSON.stringify({ kind, ids }));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDrop = (e: DragEvent, to: string | null) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove('is-drop');
    try {
      const { kind, ids } = JSON.parse(e.dataTransfer.getData('application/json'));
      startMove(kind, ids, to);
    } catch { /* not ours */ }
  };
  const dropProps = (to: string | null) => (isManager ? {
    onDragOver: (e: DragEvent) => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add('is-drop'); },
    onDragLeave: (e: DragEvent) => (e.currentTarget as HTMLElement).classList.remove('is-drop'),
    onDrop: (e: DragEvent) => onDrop(e, to),
  } : {});

  async function confirmMove(mode: 'now' | 'draft', draftId: string, newDraft: { name: string; date: string }) {
    if (!pending) return;
    setError(null);
    try {
      if (mode === 'now') {
        const moves = pending.ids.map((id) => ({
          id,
          from: pending.kind === 'person' ? (people.find((p) => p.id === id)?.unit_id ?? null) : (units.find((u) => u.id === id)?.parent_id ?? null),
        }));
        await repo.orgMove(pending.kind, pending.ids, pending.to, null);
        setUndo({ kind: pending.kind, moves, label: `${pending.ids.length === 1 ? 'הועבר' : `הועברו ${pending.ids.length}`} אל ${unitName(pending.to)}` });
      } else {
        let id = draftId;
        if (!id) id = (await repo.createDraft(newDraft.name, newDraft.date)).id;
        await repo.orgMove(pending.kind, pending.ids, pending.to, id);
        setViewDraft(id);
        await loadChanges(id);
      }
      setPending(null);
      setSelected(new Set());
      await load();
    } catch (e) { setError((e as Error).message); setPending(null); }
  }

  async function doUndo() {
    if (!undo) return;
    try {
      // group by original unit so each group goes back in one call
      const byFrom = new Map<string | null, string[]>();
      undo.moves.forEach((m) => { if (!byFrom.has(m.from)) byFrom.set(m.from, []); byFrom.get(m.from)!.push(m.id); });
      for (const [from, ids] of byFrom) await repo.orgMove(undo.kind, ids, from, null);
      setUndo(null);
      await load();
    } catch (e) { setError((e as Error).message); }
  }

  async function deleteUnit(u: Unit) {
    if (!window.confirm(`למחוק את היחידה "${u.name}"? אפשר למחוק רק יחידה ריקה.`)) return;
    try { await repo.remove('units', u.id); await load(); } catch (e) { setError((e as Error).message); }
  }

  async function saveUnit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const row = {
      name: String(f.get('name') || '').trim(),
      type_id: String(f.get('type_id') || '') || null,
      color: String(f.get('color') || '') || null,
    };
    if (!row.name) return;
    try {
      if (editUnit === 'new') await repo.insert('units', { ...row, parent_id: newParent });
      else if (editUnit) await repo.update('units', editUnit.id, row);
      setEditUnit(null);
      if (newParent) setOpen((s) => new Set(s).add(newParent));
      await load();
    } catch (x) { setError((x as Error).message); }
  }

  const draft = drafts.find((d) => d.id === viewDraft) ?? null;

  // ---- rendering ---------------------------------------------------------------
  const renderPeople = (unitId: string, depth: number) => (tree.members.get(unitId) ?? []).map((p) => {
    const hit = matches?.hitPeople.has(p.id);
    if (matches && !hit && !isOpen(unitId)) return null;
    return (
      <li key={p.id} className={`t-person${hit ? ' is-hit' : ''}${changedIds.has(p.id) ? ' is-changed' : ''}${p.active ? '' : ' is-off'}`}
        style={{ paddingInlineStart: `${depth * 1.25 + 1.75}rem` }}
        draggable={isManager} onDragStart={(e) => onDragStart(e, 'person', p.id)}>
        {isManager && (
          <input type="checkbox" aria-label={`בחירת ${p.full_name}`} checked={selected.has(p.id)}
            onChange={(e) => setSelected((s) => { const n = new Set(s); e.target.checked ? n.add(p.id) : n.delete(p.id); return n; })} />
        )}
        <span className="t-person-name">{p.full_name}</span>
        <span className="muted t-meta">{roleName(p.role_id)}</span>
        <span className="muted t-meta" dir="ltr">{p.employee_no}</span>
        {isManager && <button className="link-btn t-action" onClick={() => setMoveTo({ kind: 'person', ids: selected.has(p.id) ? [...selected] : [p.id] })}>העברה</button>}
      </li>
    );
  });

  const unitActions = (u: Unit, after: () => void = () => {}) => (
    <>
      <button className="link-btn" onClick={() => { after(); setNewParent(u.id); setEditUnit('new'); }}>תת-יחידה</button>
      <button className="link-btn" onClick={() => { after(); setEditUnit(u); }}>עריכה</button>
      <button className="link-btn" onClick={() => { after(); setMoveTo({ kind: 'unit', ids: [u.id] }); }}>העברה</button>
      <button className="link-btn" onClick={() => { after(); deleteUnit(u); }}>מחיקה</button>
    </>
  );

  const renderUnit = (u: Unit, depth: number): JSX.Element => {
    const kids = tree.kids.get(u.id) ?? [];
    const opened = isOpen(u.id);
    return (
      <li key={u.id} className="t-unit">
        <div className={`t-row${matches?.hitUnits.has(u.id) ? ' is-hit' : ''}${changedIds.has(u.id) ? ' is-changed' : ''}`}
          style={{ paddingInlineStart: `${depth * 1.25}rem` }}
          draggable={isManager} onDragStart={(e) => onDragStart(e, 'unit', u.id)} {...dropProps(u.id)}>
          <button className="t-toggle" aria-expanded={opened} aria-label={`${opened ? 'סגירת' : 'פתיחת'} ${u.name}`} onClick={() => toggle(u.id)}>
            {opened ? '▾' : '◂'}
          </button>
          {u.color && <span className="t-dot" style={{ background: u.color }} aria-hidden="true" />}
          <span className="t-name">{u.name}</span>
          <span className="muted t-meta">{typeName(u.type_id)}</span>
          <span className="t-count" title="אנשים כולל יחידות משנה">{tree.total.get(u.id) ?? 0}</span>
          {isManager && <span className="t-actions">{unitActions(u)}</span>}
          {isManager && <button className="icon-btn t-more" aria-label={`פעולות על ${u.name}`} onClick={() => setMenuUnit(u)}>⋯</button>}
        </div>
        {opened && (
          <ul className="t-list">
            {kids.map((k) => renderUnit(k, depth + 1))}
            {renderPeople(u.id, depth)}
          </ul>
        )}
      </li>
    );
  };

  if (!loaded && !error) return <p className="muted">טוען...</p>;

  const roots = tree.kids.get(null) ?? [];
  const noUnit = tree.members.get(NO_UNIT) ?? [];

  return (
    <>
      <div className="page-head">
        <h1>מבנה ארגוני</h1>
        <div className="toolbar">
          <input type="search" className="search" placeholder="חיפוש אדם, מספר עובד או יחידה" aria-label="חיפוש"
            value={query} onChange={(e) => setQuery(e.target.value)} />
          <label className="inline-label">
            תצוגה
            <select value={viewDraft} onChange={(e) => setViewDraft(e.target.value)}>
              <option value="">המבנה הנוכחי</option>
              {drafts.map((d) => <option key={d.id} value={d.id}>טיוטה: {d.name} ({new Date(d.effective_from).toLocaleDateString('he-IL')})</option>)}
            </select>
          </label>
          {isManager && <button className="btn" onClick={() => { setNewParent(null); setEditUnit('new'); }}>יחידה חדשה</button>}
        </div>
      </div>
      {isManager && <p className="lead">גררו יחידה או אדם אל יחידה אחרת, או השתמשו בכפתור "העברה". אפשר לסמן כמה אנשים ולהעביר אותם יחד.</p>}

      {error && <div className="notice" role="alert">{error} <button className="link-btn" onClick={() => setError(null)}>סגירה</button></div>}
      {undo && (
        <div className="once" role="status">
          <div className="once-row"><span>{undo.label}.</span>
            <button className="btn" onClick={doUndo}>ביטול ההעברה</button>
            <button className="link-btn" onClick={() => setUndo(null)}>סגירה</button></div>
        </div>
      )}
      {selected.size > 0 && (
        <div className="selbar">
          <span>{selected.size} אנשים מסומנים</span>
          <button className="btn" onClick={() => setMoveTo({ kind: 'person', ids: [...selected] })}>העברת המסומנים</button>
          <button className="link-btn" onClick={() => setSelected(new Set())}>ניקוי הסימון</button>
        </div>
      )}

      {draft && (
        <section className="draft-panel" aria-label="שינויים בטיוטה">
          <div className="draft-head">
            <strong>טיוטה "{draft.name}"</strong>
            <span className="muted">תיכנס לתוקף ב-{new Date(draft.effective_from).toLocaleDateString('he-IL')}. השינויים מסומנים בעץ.</span>
          </div>
          {changes.length === 0 ? <p className="muted">אין עדיין שינויים בטיוטה.</p> : (
            <ul className="draft-list">
              {changes.map((c) => {
                const name = c.kind === 'unit' ? unitName(c.target_id) : people.find((p) => p.id === c.target_id)?.full_name ?? '?';
                return (
                  <li key={c.id} className={conflicts.has(c.id) ? 'is-conflict' : ''}>
                    <span>{name}: {unitName(c.from_unit)} ← {unitName(c.to_unit)}</span>
                    {conflicts.has(c.id) && <span className="tag-alert">השתנה מאז</span>}
                    {isManager && <button className="link-btn" onClick={async () => { await repo.removeChange(c.id); await loadChanges(draft.id); }}>הסרה מהטיוטה</button>}
                  </li>
                );
              })}
            </ul>
          )}
          {isManager && (
            <div className="once-row">
              <button className="btn btn-primary" disabled={!changes.length} onClick={async () => {
                try {
                  const force = conflicts.size > 0 && window.confirm('יש שינויים שמתנגשים עם שינויים שנעשו אחרי שהטיוטה נוצרה. להחיל בכל זאת?');
                  if (conflicts.size > 0 && !force) return;
                  await repo.applyDraft(draft.id, force);
                  setViewDraft(''); await load();
                } catch (e) { setError((e as Error).message); }
              }}>להחיל עכשיו</button>
              <button className="link-btn" onClick={async () => {
                if (!window.confirm('לבטל את הטיוטה? השינויים שבה לא יוחלו.')) return;
                await repo.cancelDraft(draft.id); setViewDraft(''); await load();
              }}>ביטול הטיוטה</button>
            </div>
          )}
        </section>
      )}

      <ul className="tree" aria-label="עץ ארגוני">
        {roots.map((u) => renderUnit(u, 0))}
        <li className="t-unit">
          <div className="t-row t-none" {...dropProps(null)}>
            <button className="t-toggle" aria-expanded={isOpen(NO_UNIT)} aria-label="פתיחת ללא שיוך" onClick={() => toggle(NO_UNIT)}>{isOpen(NO_UNIT) ? '▾' : '◂'}</button>
            <span className="t-name">ללא שיוך</span>
            <span className="t-count">{noUnit.length}</span>
          </div>
          {isOpen(NO_UNIT) && <ul className="t-list">{renderPeople(NO_UNIT, 0)}</ul>}
        </li>
      </ul>

      <MoveDialog
        pending={pending} drafts={drafts} defaultDraft={viewDraft}
        describe={(p) => {
          const what = p.kind === 'unit'
            ? `היחידה "${unitName(p.ids[0])}" (${tree.total.get(p.ids[0]) ?? 0} אנשים)`
            : p.ids.length === 1 ? people.find((x) => x.id === p.ids[0])?.full_name ?? '' : `${p.ids.length} אנשים`;
          return `${what} אל "${unitName(p.to)}"`;
        }}
        onCancel={() => setPending(null)} onConfirm={confirmMove} />

      <Dialog open={menuUnit !== null} title={menuUnit ? menuUnit.name : ''} onClose={() => setMenuUnit(null)}>
        {menuUnit && <div className="menu-list">{unitActions(menuUnit, () => setMenuUnit(null))}</div>}
      </Dialog>

      <Dialog open={moveTo !== null} title="העברה אל" onClose={() => setMoveTo(null)}>
        {moveTo && (
          <form className="form" onSubmit={(e) => {
            e.preventDefault();
            const v = String(new FormData(e.currentTarget).get('to'));
            setMoveTo(null);
            startMove(moveTo.kind, moveTo.ids, v === NO_UNIT ? null : v);
          }}>
            <label>
              יחידת יעד
              <select name="to" defaultValue="">
                <option value="" disabled>בחרו יחידה</option>
                {moveTo.kind === 'person' && <option value={NO_UNIT}>ללא שיוך</option>}
                {moveTo.kind === 'unit' && <option value={NO_UNIT}>רמה עליונה (בלי יחידת אב)</option>}
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            <button className="btn btn-primary">המשך</button>
          </form>
        )}
      </Dialog>

      <Dialog open={editUnit !== null} title={editUnit === 'new' ? (newParent ? `יחידה חדשה תחת "${unitName(newParent)}"` : 'יחידה חדשה') : 'עריכת יחידה'} onClose={() => setEditUnit(null)}>
        {editUnit !== null && (
          <form className="form" onSubmit={saveUnit}>
            <label>שם<input name="name" required defaultValue={editUnit === 'new' ? '' : editUnit.name} /></label>
            <label>
              סוג
              <select name="type_id" defaultValue={editUnit === 'new' ? '' : editUnit.type_id ?? ''}>
                <option value="">ללא</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label>צבע במפה<input name="color" type="color" defaultValue={editUnit === 'new' ? '#0f6b5c' : editUnit.color ?? '#0f6b5c'} /></label>
            <button className="btn btn-primary">שמירה</button>
          </form>
        )}
      </Dialog>
    </>
  );
}

// Every move asks: now, or into a draft with a date.
function MoveDialog({ pending, drafts, defaultDraft, describe, onCancel, onConfirm }: {
  pending: Pending | null; drafts: OrgDraft[]; defaultDraft: string;
  describe: (p: Pending) => string;
  onCancel: () => void;
  onConfirm: (mode: 'now' | 'draft', draftId: string, newDraft: { name: string; date: string }) => Promise<void>;
}) {
  const [mode, setMode] = useState<'now' | 'draft'>('now');
  const [draftId, setDraftId] = useState('');
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (pending) { setMode(defaultDraft ? 'draft' : 'now'); setDraftId(defaultDraft); setName(''); setDate(todayIso()); }
  }, [pending, defaultDraft]);

  return (
    <Dialog open={pending !== null} title="העברה במבנה הארגוני" onClose={onCancel}>
      {pending && (
        <form className="form" onSubmit={async (e) => {
          e.preventDefault();
          if (mode === 'draft' && !draftId && !name.trim()) return;
          setBusy(true);
          await onConfirm(mode, draftId, { name: name.trim(), date });
          setBusy(false);
        }}>
          <p>{describe(pending)}</p>
          <fieldset className="radios">
            <legend className="sr-only">מתי</legend>
            <label><input type="radio" name="mode" checked={mode === 'now'} onChange={() => setMode('now')} /> להחיל מיד</label>
            <label><input type="radio" name="mode" checked={mode === 'draft'} onChange={() => setMode('draft')} /> להוסיף לטיוטה</label>
          </fieldset>
          {mode === 'draft' && (
            <>
              <label>
                טיוטה
                <select value={draftId} onChange={(e) => setDraftId(e.target.value)}>
                  <option value="">טיוטה חדשה</option>
                  {drafts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              {!draftId && (
                <>
                  <label>שם הטיוטה<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: ארגון מחדש ינואר" /></label>
                  <label>תאריך תוקף<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
                </>
              )}
            </>
          )}
          <div className="once-row">
            <button className="btn btn-primary" disabled={busy}>{mode === 'now' ? 'העברה' : 'הוספה לטיוטה'}</button>
            <button type="button" className="link-btn" onClick={onCancel}>ביטול</button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
