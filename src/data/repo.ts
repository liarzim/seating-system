// Data access layer. Every screen goes through these functions, never through
// the client directly, so moving to another backend later means replacing
// this file only.
import { supabase } from '../lib/supabase';
import type { AppRole, AppUser, FloorOccupancy, ManagedUser, Settings, WorkDay } from './types';

function fail(error: { message: string } | null, what: string): never {
  throw new Error(`${what}: ${error?.message ?? 'unknown error'}`);
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
