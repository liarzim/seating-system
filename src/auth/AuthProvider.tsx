import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { signInMethod, supabase } from '../lib/supabase';
import { repo } from '../data/repo';
import type { AppRole, AppUser, Settings } from '../data/types';

interface AuthState {
  ready: boolean;
  session: Session | null;
  appUser: AppUser | null;
  role: AppRole | null; // null = visitor
  isManager: boolean;
  isSystemAdmin: boolean;
  mustChangePassword: boolean;
  settings: Settings;
  // Logged in with Google but no account was created for this email.
  notRegistered: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [settings, setSettings] = useState<Settings>({});

  const load = useCallback(async (s: Session | null) => {
    setSession(s);
    const [u, st] = await Promise.all([
      s ? repo.myAppUser(s.user.id).catch(() => null) : Promise.resolve(null),
      repo.settings().catch(() => ({})),
    ]);
    setAppUser(u);
    setSettings(st);
    setReady(true);
  }, []);

  useEffect(() => {
    repo.applyDueDrafts().catch(() => undefined);
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') load(s);
      else setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const value = useMemo<AuthState>(() => {
    const active = appUser?.active ? appUser : null;
    const role = active?.role ?? null;
    return {
      ready,
      session,
      appUser: active,
      role,
      isManager: role === 'manager' || role === 'system_admin',
      isSystemAdmin: role === 'system_admin',
      // Only a password login has to replace the initial password; Google users never see it.
      mustChangePassword: Boolean(active?.must_change_password && signInMethod(session?.access_token) === 'password'),
      settings,
      notRegistered: Boolean(session && ready && !active),
      refresh: () => supabase.auth.getSession().then(({ data }) => load(data.session)),
      signOut: async () => {
        await supabase.auth.signOut();
      },
    };
  }, [ready, session, appUser, settings, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

export const settingOn = (s: Settings, key: string) => s[key] === true;
