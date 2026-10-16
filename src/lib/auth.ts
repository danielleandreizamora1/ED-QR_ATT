import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { getProfile, type Role } from '@/lib/profiles';

export type { Role } from '@/lib/profiles';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

export type SignUpProfile = {
  full_name: string;
  role: 'student' | 'teacher' | 'admin';
};

let globalSession: Session | null = null;
let globalUser: User | null = null;
let globalLoading = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function setAuth(session: Session | null) {
  globalSession = session;
  globalUser = session?.user ?? null;
  globalLoading = false;
  notify();
}

export function useAuth(): AuthState {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => forceRender((value) => value + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { session: globalSession, user: globalUser, loading: globalLoading };
}

export async function signUp(email: string, password: string, profile?: SignUpProfile) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: Linking.createURL('login'),
      data: profile ? { full_name: profile.full_name, role: profile.role } : undefined,
    },
  });
  // When email confirmation is disabled, data.session is set and we can update the profile directly.
  // When email confirmation is enabled, data.session is null and the DB trigger handle_new_user()
  // will create the profile from raw_user_meta_data (see supabase/schema.sql).
  // We still attempt a direct update when we have an authenticated session for immediate consistency.
  if (!error && data.session && profile) {
    await supabase
      .from('profiles')
      .update({ full_name: profile.full_name, role: profile.role })
      .eq('id', data.session.user.id);
  }
  if (!error && data.session) setAuth(data.session);
  return { data, error };
}

async function syncProfileFromMetadata(user: User) {
  // Repair ONLY the display name from sign-up metadata.
  //
  // Role is deliberately never synced here: raw_user_meta_data.role is frozen
  // at registration and would silently UNDO admin role changes on every login
  // (teacher → student reverts to teacher because metadata still says teacher).
  // Roles are written once by the handle_new_user trigger at sign-up and can
  // only change afterwards through admin setUserRole().
  const metaName = user.user_metadata?.full_name as string | undefined;
  const name = typeof metaName === 'string' ? metaName.trim() : '';
  if (!name) return;
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();
  const currentName = (profile as { full_name?: string | null } | null)?.full_name;
  if (!profile || currentName) return;
  await supabase.from('profiles').update({ full_name: name }).eq('id', user.id);
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error && data.session) {
    setAuth(data.session);
    // Repair missing display names only — roles are never touched on sign-in
    // (see syncProfileFromMetadata; syncing role here undid admin changes).
    await syncProfileFromMetadata(data.session.user);
  }
  return { data, error };
}

export async function signOut() {
  // Proper logout: revoke the server session first, then clear local state
  // regardless of outcome so no stale session survives on-device.
  try {
    const { error } = await supabase.auth.signOut();
    if (error) return { error: error.message };
  } finally {
    setAuth(null);
  }
  return { error: null };
}

export async function completeAuthFromUrl(url: string) {
  const { queryParams } = Linking.parse(url);
  const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
  if (!code) return false;

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) return false;

  setAuth(data.session);
  await syncProfileFromMetadata(data.session.user);
  return true;
}

// --- Role-based access control (RBAC) ----------------------------------------
// Event-driven pattern: screens subscribe to profile role and react to changes.

export function useRole(): { role: Role | null; loading: boolean } {
  const { user } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(Boolean(user));

  useEffect(() => {
    let active = true;
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void getProfile(user.id).then((profile) => {
      if (!active) return;
      setRole(profile?.role ?? 'student');
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [user]);

  return { role, loading };
}

export function canCreateEvents(role: Role | null): boolean {
  return role === 'teacher' || role === 'admin';
}

export function canManageAll(role: Role | null): boolean {
  return role === 'admin';
}

export { can as hasCapability, ROLES } from '@/lib/roles';