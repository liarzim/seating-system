import { createClient } from '@supabase/supabase-js';

export const API_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
export const ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
export const isConfigured = Boolean(API_URL && ANON_KEY);

// One client for the whole app. Sessions are kept in localStorage by supabase-js
// and refreshed automatically.
export const supabase = createClient(API_URL || 'http://invalid.local', ANON_KEY || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// How the current session signed in ('password', 'oauth', ...), from the token's amr claim.
export function signInMethod(accessToken: string | undefined): string | null {
  if (!accessToken) return null;
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.amr?.[0]?.method ?? null;
  } catch {
    return null;
  }
}
