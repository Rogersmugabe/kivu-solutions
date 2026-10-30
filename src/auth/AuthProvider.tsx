import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { rpc, rows, supabase, friendlyError } from '@/lib/supabase';
import { enabledFeatures, roleCan, subscriptionAllowsAccess, visiblePages, type Action, type Feature, type PageKey } from '@/lib/access';
import type { Profile, Role, Shop } from '@/lib/types';

type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'blocked'; message: string }
  | { status: 'ready' };

interface AuthContextValue {
  state: AuthState;
  session: Session | null;
  profile: Profile | null;
  shop: Shop | null;
  role: Role | null;
  isPlatformAdmin: boolean;
  features: Set<Feature>;
  pages: PageKey[];
  can: (action: Action) => boolean;
  hasFeature: (feature: Feature) => boolean;
  reloadShop: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadOrCreateProfile(session: Session): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (error) throw error;
  if (data) return data as Profile;
  // First sign-in after sign-up: create the owner's shop, or join the shop that invited this staff member.
  const meta = (session.user.user_metadata || {}) as Record<string, string>;
  const invite = (meta.staff_invite_code || '').trim().toUpperCase();
  if (invite) await rpc('claim_staff_invite', { p_code: invite, p_full_name: meta.full_name || '' });
  else await rpc('create_owner_shop', { p_shop_name: meta.shop_name || '', p_full_name: meta.full_name || '' });
  const created = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
  if (created.error) throw created.error;
  return created.data as Profile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const loadedFor = useRef<string | null>(null);

  const load = useCallback(async (s: Session) => {
    try {
      const p = await loadOrCreateProfile(s);
      const { data: shopRow, error } = await supabase.from('shops').select('*').eq('id', p.shop_id).single();
      if (error) throw error;
      const sh = shopRow as Shop;

      const flagRows = await rows<{ feature_key: string; enabled: boolean }>(
        supabase.from('shop_feature_flags').select('feature_key,enabled').eq('shop_id', sh.id)
      ).catch(() => []);
      const f: Record<string, boolean> = {};
      for (const r of flagRows) f[r.feature_key] = !!r.enabled;

      if (p.role !== 'owner') {
        if (!subscriptionAllowsAccess(sh)) throw new Error('This business subscription has ended. Ask the owner to renew Kivu.');
        if (!enabledFeatures(sh, f).has('staff')) throw new Error('Staff accounts need the Kivu Business plan or higher. Ask the owner to upgrade.');
        const { data: emp, error: empErr } = await supabase.from('employees').select('active').eq('shop_id', p.shop_id).eq('user_id', s.user.id).maybeSingle();
        if (empErr) throw empErr;
        if (!emp || emp.active === false) throw new Error('This staff account has been disabled. Ask the owner or a manager to reactivate it.');
      }

      const admin = await supabase.rpc('is_duka_admin');
      setIsPlatformAdmin(!admin.error && admin.data === true);
      setProfile(p);
      setShop(sh);
      setFlags(f);
      setState({ status: 'ready' });
    } catch (err) {
      loadedFor.current = null;
      setState({ status: 'blocked', message: friendlyError(err) });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const apply = (s: Session | null) => {
      if (cancelled) return;
      setSession(s);
      if (!s) {
        loadedFor.current = null;
        setProfile(null); setShop(null); setFlags({}); setIsPlatformAdmin(false);
        setState({ status: 'signed-out' });
        return;
      }
      // Token refreshes and repeat events for the same user: nothing to reload.
      if (loadedFor.current === s.user.id) return;
      loadedFor.current = s.user.id;
      setState({ status: 'loading' });
      void load(s);
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => apply(s));
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [load]);

  const reloadShop = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('shops').select('*').eq('id', profile.shop_id).single();
    if (data) setShop(data as Shop);
  }, [profile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const role = profile?.role ?? null;
    const features = enabledFeatures(shop, flags);
    return {
      state, session, profile, shop, role, isPlatformAdmin, features,
      pages: role ? visiblePages(role, shop, features, isPlatformAdmin) : [],
      can: (action: Action) => roleCan(role ?? undefined, action),
      hasFeature: (feature: Feature) => features.has(feature),
      reloadShop, signOut
    };
  }, [state, session, profile, shop, flags, isPlatformAdmin, reloadShop, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Signed-in, fully loaded context. Only call inside routes rendered when state is 'ready'. */
export function useShop() {
  const auth = useAuth();
  if (!auth.shop || !auth.profile || !auth.role || !auth.session) throw new Error('Shop context is not ready');
  return { ...auth, shop: auth.shop, profile: auth.profile, role: auth.role, session: auth.session };
}
