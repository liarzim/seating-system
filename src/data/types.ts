export type AppRole = 'employee' | 'manager' | 'system_admin';

export interface AppUser {
  id: string;
  email: string;
  role: AppRole;
  person_id: string | null;
  must_change_password: boolean;
  active: boolean;
}

export interface FloorOccupancy {
  site_id: string;
  site_name: string;
  site_code: string;
  floor_id: string;
  floor_name: string;
  floor_number: number;
  work_seats: number;
  taken: number;
  free: number;
  is_work_day: boolean;
}

export interface WorkDay {
  day: number; // 0 = Sunday
  name: string;
  active: boolean;
}

export type Settings = Record<string, unknown>;

export interface ManagedUser {
  id: string;
  email: string;
  role: AppRole;
  active: boolean;
  must_change_password: boolean;
  person_id: string | null;
  person_name: string | null;
  last_sign_in_at: string | null;
  providers: string[];
}

export const ROLE_LABEL: Record<AppRole, string> = {
  employee: 'עובד/ת',
  manager: 'מנהל/ת',
  system_admin: 'מנהל/ת מערכת',
};

export interface UnitType { id: string; name: string; sort_order: number }
export interface Role { id: string; name: string }
export interface Unit {
  id: string;
  name: string;
  type_id: string | null;
  parent_id: string | null;
  color: string | null;
  sort_order: number;
  active: boolean;
}
export interface Person {
  id: string;
  employee_no: string;
  full_name: string;
  email: string | null;
  unit_id: string | null;
  role_id: string | null;
  active: boolean;
}
export interface Site { id: string; code: string; name: string; city: string | null; sort_order: number; active: boolean }
export interface Floor { id: string; site_id: string; number: number; name: string; sort_order: number; active: boolean }
export interface Room { id: string; floor_id: string; name: string; kind: 'work' | 'meeting' | 'other'; is_secure: boolean; active: boolean }
export interface PlanVersion { id: string; name: string; effective_from: string; status: 'draft' | 'published' | 'archived' }
export interface OrgDraft {
  id: string;
  name: string;
  effective_from: string;
  status: 'draft' | 'applied' | 'cancelled';
  linked_version_id: string | null;
}
export interface OrgChange {
  id: string;
  draft_id: string | null;
  kind: 'unit' | 'person';
  target_id: string;
  from_unit: string | null;
  to_unit: string | null;
  applied_at: string | null;
  created_at: string;
}
export interface ImportResult {
  inserted: number;
  updated?: number;
  errors: { row: number; error: string }[];
  applied: boolean;
}
