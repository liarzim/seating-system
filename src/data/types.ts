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
