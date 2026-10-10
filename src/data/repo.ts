// Data access layer. Every screen goes through these functions, never through
// the client directly, so moving to another backend later means replacing
// this file only.
import { supabase } from '../lib/supabase';
import type {
  AppRole, AppUser, Floor, FloorOccupancy, ImportResult, ManagedUser, OrgChange, OrgDraft, Person,
  PlanVersion, Role, Room, Settings, Site, Unit, UnitType, WorkDay,
} from './types';

function fail(error: { message: string } | null, what: string): never {
  // Hebrew messages are already user-facing; technical ones keep their detail.
  if (/[\u0590-\u05FF]/.test(what)) throw new Error(what);
  throw new Error(`${what}: ${error?.message ?? 'unknown error'}`);
}

// Turn database constraint errors into something a manager can act on.
function friendlyWrite(error: { code?: string; message: string; details?: string | null }): string {
  if (error.code === '23505') return 'כבר קיימת רשומה עם אותו ערך (למשל אותו מספר עובד או אותו שם)';
  if (error.code === '23503') return 'אי אפשר למחוק: יש רשומות שתלויות בה (אנשים, יחידות משנה או שיבוצים). העבירו או השביתו אותן קודם';
  if (error.code === '23514' && /under itself/.test(error.message)) return 'אי אפשר להעביר יחידה אל תוך יחידה שמתחתיה';
  if (error.code === '42501') return 'אין לכם הרשאה לפעולה הזו';
  return 'השמירה נכשלה';
}

export const repo = {
  async myAppUser(userId: string): Promise<AppUser | null> {
    const { data, error } = await supabase
      .from('app_users')
      .select('id, email, role, person_id, must_change_password, active')
      .eq('id', userId)
      .maybeSingle();
    if (error) fail(error, 'Loading user');
    return data as AppUser | null;
  },

  async completePasswordChange(): Promise<void> {
    const { error } = await supabase.rpc('complete_password_change');
    if (error) fail(error, 'Saving password state');
  },

  async settings(): Promise<Settings> {
    const { data, error } = await supabase.from('settings').select('key, value');
    if (error) fail(error, 'Loading settings');
    return Object.fromEntries((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  },

  async workDays(): Promise<WorkDay[]> {
    const { data, error } = await supabase.from('work_days').select('day, name, active').order('day');
    if (error) fail(error, 'Loading work days');
    return data as WorkDay[];
  },

  async floorOccupancy(date: string): Promise<FloorOccupancy[]> {
    const { data, error } = await supabase.rpc('floor_occupancy', { d: date });
    if (error) fail(error, 'Loading occupancy');
    return data as FloorOccupancy[];
  },

  // ---- reference data -------------------------------------------------
  async unitTypes(): Promise<UnitType[]> {
    const { data, error } = await supabase.from('unit_types').select('id, name, sort_order').order('sort_order');
    if (error) fail(error, 'Loading unit types');
    return data as UnitType[];
  },
  async roles(): Promise<Role[]> {
    const { data, error } = await supabase.from('roles').select('id, name').order('name');
    if (error) fail(error, 'Loading roles');
    return data as Role[];
  },
  async units(): Promise<Unit[]> {
    const { data, error } = await supabase.from('units').select('id, name, type_id, parent_id, color, sort_order, active').order('sort_order').order('name');
    if (error) fail(error, 'Loading units');
    return data as Unit[];
  },
  async people(): Promise<Person[]> {
    const { data, error } = await supabase.from('people')
      .select('id, employee_no, full_name, email, unit_id, role_id, active').order('full_name').limit(5000);
    if (error) fail(error, 'Loading people');
    return data as Person[];
  },
  async sites(): Promise<Site[]> {
    const { data, error } = await supabase.from('sites').select('id, code, name, city, sort_order, active').order('sort_order');
    if (error) fail(error, 'Loading sites');
    return data as Site[];
  },
  async floors(): Promise<Floor[]> {
    const { data, error } = await supabase.from('floors').select('id, site_id, number, name, sort_order, active').order('sort_order').order('number');
    if (error) fail(error, 'Loading floors');
    return data as Floor[];
  },
  async rooms(): Promise<Room[]> {
    const { data, error } = await supabase.from('rooms').select('id, floor_id, name, kind, is_secure, active').order('sort_order');
    if (error) fail(error, 'Loading rooms');
    return data as Room[];
  },
  async planVersions(): Promise<PlanVersion[]> {
    const { data, error } = await supabase.from('plan_versions').select('id, name, effective_from, status').order('effective_from', { ascending: false });
    if (error) fail(error, 'Loading plan versions');
    return data as PlanVersion[];
  },
  async secureAccess(): Promise<{ room_id: string; person_id: string }[]> {
    const { data, error } = await supabase.from('secure_room_access').select('room_id, person_id').limit(10000);
    if (error) fail(error, 'Loading secure room access');
    return data as { room_id: string; person_id: string }[];
  },

  // ---- generic writes on base tables (RLS allows managers only) ---------
  async insert<T>(table: string, row: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.from(table).insert(row).select().single();
    if (error) fail(error, friendlyWrite(error));
    return data as T;
  },
  async update(table: string, id: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.from(table).update(patch).eq('id', id);
    if (error) fail(error, friendlyWrite(error));
  },
  async remove(table: string, id: string): Promise<void> {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) fail(error, friendlyWrite(error));
  },
  async grantSecure(room_id: string, person_id: string): Promise<void> {
    const { error } = await supabase.from('secure_room_access').insert({ room_id, person_id });
    if (error && error.code !== '23505') fail(error, 'Granting access');
  },
  async revokeSecure(room_id: string, person_id: string): Promise<void> {
    const { error } = await supabase.from('secure_room_access').delete().eq('room_id', room_id).eq('person_id', person_id);
    if (error) fail(error, 'Removing access');
  },

  // ---- org tree ----------------------------------------------------------
  async orgMove(kind: 'unit' | 'person', targets: string[], toUnit: string | null, draftId: string | null): Promise<void> {
    const { error } = await supabase.rpc('org_move_many', { p_kind: kind, p_targets: targets, p_to_unit: toUnit, p_draft: draftId });
    if (error) fail(error, /under itself/.test(error.message) ? 'אי אפשר להעביר יחידה אל תוך יחידה שמתחתיה' : 'Moving');
  },
  async orgDrafts(): Promise<OrgDraft[]> {
    const { data, error } = await supabase.from('org_drafts').select('id, name, effective_from, status, linked_version_id').order('effective_from');
    if (error) fail(error, 'Loading drafts');
    return data as OrgDraft[];
  },
  async orgChanges(draftId: string): Promise<OrgChange[]> {
    const { data, error } = await supabase.from('org_changes').select('*').eq('draft_id', draftId).order('created_at');
    if (error) fail(error, 'Loading draft changes');
    return data as OrgChange[];
  },
  async createDraft(name: string, effective_from: string): Promise<OrgDraft> {
    return repo.insert<OrgDraft>('org_drafts', { name, effective_from });
  },
  async removeChange(id: string): Promise<void> {
    const { error } = await supabase.rpc('org_remove_change', { p_change: id });
    if (error) fail(error, 'Removing change');
  },
  async applyDraft(id: string, force: boolean): Promise<number> {
    const { data, error } = await supabase.rpc('org_apply_draft', { p_draft: id, p_force: force });
    if (error) fail(error, /conflicts/.test(error.message) ? 'יש בטיוטה שינויים שמתנגשים עם שינויים מיידיים שנעשו אחריה' : 'Applying draft');
    return data as number;
  },
  async cancelDraft(id: string): Promise<void> {
    const { error } = await supabase.rpc('org_cancel_draft', { p_draft: id });
    if (error) fail(error, 'Cancelling draft');
  },
  async draftConflicts(id: string): Promise<{ change_id: string }[]> {
    const { data, error } = await supabase.rpc('org_draft_conflicts', { p_draft: id });
    if (error) fail(error, 'Checking conflicts');
    return data as { change_id: string }[];
  },

  // ---- imports (dry run first, then for real) ------------------------------
  async importUnits(rows: unknown[], dryRun: boolean): Promise<ImportResult> {
    const { data, error } = await supabase.rpc('import_units', { p_rows: rows, p_dry_run: dryRun });
    if (error) fail(error, 'Import');
    return data as ImportResult;
  },
  async importPeople(rows: unknown[], dryRun: boolean): Promise<ImportResult> {
    const { data, error } = await supabase.rpc('import_people', { p_rows: rows, p_dry_run: dryRun });
    if (error) fail(error, 'Import');
    return data as ImportResult;
  },
  async importAssignments(version: string, rows: unknown[], replace: boolean, dryRun: boolean): Promise<ImportResult> {
    const { data, error } = await supabase.rpc('import_assignments', { p_version: version, p_rows: rows, p_replace: replace, p_dry_run: dryRun });
    if (error) fail(error, 'Import');
    return data as ImportResult;
  },

  // ---- system admin ----------------------------------------------------------
  async loadDemo(): Promise<{ people: number; seats: number; assignments: number }> {
    const { data, error } = await supabase.rpc('admin_load_demo', { p_confirm: 'דמה' });
    if (error) fail(error, 'Loading demo data');
    return data as { people: number; seats: number; assignments: number };
  },
  async resetData(scope: 'people' | 'all'): Promise<void> {
    const { error } = await supabase.rpc('admin_reset_data', { p_scope: scope, p_confirm: 'מחק' });
    if (error) fail(error, 'Deleting data');
  },

  // Org drafts whose date has arrived are applied by the database; calling this
  // on load is how "activation by date" works without a scheduler.
  async applyDueDrafts(): Promise<void> {
    await supabase.rpc('apply_due_org_drafts');
  },
};

// ---- user management (system admin) -------------------------------------
// Runs through the server function, which holds the admin key.
async function adminCall<T>(body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const r = await fetch('/api/admin-users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || `שגיאה ${r.status}`);
  return json as T;
}

export const adminRepo = {
  list: () => adminCall<{ users: ManagedUser[] }>({ action: 'list' }).then((r) => r.users),
  create: (email: string, password: string, role: AppRole, employee_no?: string) =>
    adminCall<{ id: string }>({ action: 'create', email, password, role, employee_no }),
  resetPassword: (user_id: string, password: string) => adminCall({ action: 'reset_password', user_id, password }),
  setRole: (user_id: string, role: AppRole) => adminCall({ action: 'set_role', user_id, role }),
  setActive: (user_id: string, active: boolean) => adminCall({ action: 'set_active', user_id, active }),
};

// Readable initial passwords: no look-alike characters, always 12 long with
// upper, lower, digit and a symbol.
export function generatePassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#%*-+'];
  const all = sets.join('');
  const pick = (s: string) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  const chars = sets.map(pick);
  while (chars.length < 12) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
