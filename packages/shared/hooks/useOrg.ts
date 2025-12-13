// packages/shared/hooks/useOrg.ts
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useShopContext } from '@mytutorapp/shared/context';
import {
  fetchCurrentUser,
  getMyOrg,
  fetchOrgPricingTable,
  type OrgCurrency,
  type OrgPricingTable,
} from '@mytutorapp/shared/api/orgApi';
import type { OrgMembership, CurrentUser, OrgTier } from '@mytutorapp/shared/types';
import type { OrgResp } from '@mytutorapp/shared/api/orgApi';

type KV = {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
  removeItem: (k: string) => Promise<void>;
};

// Fallback in case storage isn’t injected (shouldn’t happen in your setup)
const memoryStorage: KV = (() => {
  const m = new Map<string, string>();
  return {
    async getItem(k) { return m.has(k) ? m.get(k)! : null; },
    async setItem(k, v) { m.set(k, v); },
    async removeItem(k) { m.delete(k); },
  };
})();

export function useOrg(opts?: { currency?: OrgCurrency }) {

  const { backendUrl, token, orgToken, userId, storage: ctxStorage } = useShopContext() as any;
  const storage: KV = (ctxStorage as KV) || memoryStorage;

  const authToken: string | undefined = orgToken || token;

  

  // State
  const [membership, setMembership] = useState<OrgMembership | OrgMembership[] | null>(null);
  const [org, setOrg] = useState<OrgResp | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  // Primed-from-storage UI hints (async)
  const [activeOrgId, setActiveOrgId] = useState<string | undefined>(undefined);
  const [localRole, setLocalRole] = useState<string | undefined>(undefined);

  // Loading flags
  const [loadingMembership, setLoadingMembership] = useState(false);
  const [loadingOrg, setLoadingOrg] = useState(false);

    const [pricingCurrency, setPricingCurrency] = useState<OrgCurrency>(
    (opts?.currency ?? 'USD') as OrgCurrency
  );

  // Keep in sync if caller passes a different currency later
  useEffect(() => {
    if (opts?.currency && opts.currency !== pricingCurrency) {
      setPricingCurrency(opts.currency);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.currency]);

 const pricingQuery = useQuery({
  queryKey: ['orgPricingTable', backendUrl, pricingCurrency, authToken],
  queryFn: () => fetchOrgPricingTable(backendUrl, pricingCurrency, authToken),
  enabled: !!backendUrl && !!pricingCurrency && !!authToken, // if protected
  staleTime: 60_000,
});


  const orgPricingTable: OrgPricingTable | null = (pricingQuery.data ?? null) as any;


  // ─────────────────────────────────────────────────────────
  // Initial storage prime (works on both web & native)
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = (await storage.getItem('org:activeId')) || (await storage.getItem('auth:orgId')) || undefined;
        const rRaw = await storage.getItem('org:role');
        const r = rRaw ? rRaw.toLowerCase() : undefined;

        if (!cancelled) {
          setActiveOrgId(a);
          setLocalRole(r);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [storage]);

  // ─────────────────────────────────────────────────────────
  // Keep in sync with other web tabs (native: no-op)
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const onStorage = async (e: StorageEvent) => {
      // Only react to our relevant keys when storage area is localStorage (web)
      if (!e.key || (e.key !== 'org:activeId' && e.key !== 'auth:orgId' && e.key !== 'org:role')) return;

      const a = (await storage.getItem('org:activeId')) || (await storage.getItem('auth:orgId')) || undefined;
      const rRaw = await storage.getItem('org:role');
      const r = rRaw ? rRaw.toLowerCase() : undefined;

      setActiveOrgId(a);
      setLocalRole(r);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storage]);

  // ─────────────────────────────────────────────────────────
  // Network fetchers
  // ─────────────────────────────────────────────────────────
  const fetchMembership = useCallback(async (): Promise<void> => {
    if (!authToken) return;
    setLoadingMembership(true);
    try {
      const me: CurrentUser = await fetchCurrentUser(backendUrl, authToken);

      // Store full current user (for learner identity card, etc.)
      setCurrentUser(me);

      // Existing behavior: treat me.org as membership payload
      setMembership((me as any)?.org ?? null);
    } catch (e) {
      if (axios.isAxiosError(e)) {
        console.warn('[useOrg] fetchMembership failed', e.response?.status, e.message);
      }
      setMembership(null);
      setCurrentUser(null);
    } finally {
      setLoadingMembership(false);
    }
  }, [backendUrl, authToken]);

  const fetchOrg = useCallback(async (): Promise<void> => {
    if (!authToken) return;
    setLoadingOrg(true);
    try {
      const o = await getMyOrg(backendUrl, authToken);
      setOrg(o ?? null);

      // Update storage from server shape when available (works on web & native)
      if (o?.id) {
        setActiveOrgId(prev => prev ?? o.id);
        await storage.setItem('org:activeId', o.id);
      }

      const myRole = ((o as any)?.my_role || (o as any)?.role || '')
        .toString()
        .toLowerCase();

      if (myRole) {
        // ✅ ALWAYS overwrite with the server truth
        setLocalRole(myRole);
        await storage.setItem('org:role', myRole);
      } else {
        // Optional: clear when server gives no role
        setLocalRole(undefined);
        await storage.removeItem('org:role');
      }
    } catch (e) {
      if (axios.isAxiosError(e)) {
        console.warn('[useOrg] fetchOrg failed', e.response?.status, e.message);
      }
      setOrg(null);
    } finally {
      setLoadingOrg(false);
    }
  }, [backendUrl, authToken, storage]);

  useEffect(() => {
    if (!authToken) {
      setMembership(null);
      setOrg(null);
      setCurrentUser(null);
      setActiveOrgId(undefined);   // ✅ clear active org
      setLocalRole(undefined);     // ✅ clear cached role
      return;
    }
    fetchMembership();
    fetchOrg();
  }, [authToken, fetchMembership, fetchOrg]);

  // ─────────────────────────────────────────────────────────
  // Derivations
  // ─────────────────────────────────────────────────────────
  const primaryMembership = useMemo(() => {
    if (!membership) return null;
    if (Array.isArray(membership)) {
      return membership.find(m => m.role === 'owner' || m.role === 'admin') || membership[0] || null;
    }
    return membership;
  }, [membership]);

  const effectiveOrgId =
    org?.id ??
    (Array.isArray(membership) ? membership[0]?.orgId : membership?.orgId) ??
    activeOrgId;

  const orgTier: OrgTier | undefined =
    (org?.tier as OrgTier | null) ??
    (primaryMembership?.tier as OrgTier | undefined) ??
    undefined;

  const hasOrg = Boolean(effectiveOrgId);
  const isStarterTier = hasOrg && (orgTier === 'starter' || (orgTier as any) === 'start');
  const isProTier = hasOrg && orgTier === 'pro';
  const isEnterpriseTier = hasOrg && orgTier === 'enterprise';

  const isOwnerOrAdmin =
    (!!primaryMembership && (primaryMembership.role === 'owner' || primaryMembership.role === 'admin')) ||
    localRole === 'owner' || localRole === 'admin';

  const orgSeats = typeof org?.seats === 'number' ? org.seats : undefined;

  const refresh = fetchMembership;
  const refreshOrg = fetchOrg;
  const refreshAll = async () => {
    await Promise.allSettled([fetchMembership(), fetchOrg()]);
  };

  return {
    userId,
    currentUser, // 🔥 NEW: full current user from backend
    membership,
    refresh,

    org,
    orgTier,
    orgSeats,
    activeOrgId: effectiveOrgId,
    isOwnerOrAdmin,
    refreshOrg,
    refreshAll,
    loading: loadingMembership || loadingOrg,
    loadingMembership,
    loadingOrg,

    isStarterTier,
    isProTier,
    isEnterpriseTier,
    pricingCurrency,
    setPricingCurrency,
    orgPricingTable,
    orgPricingLoading: pricingQuery.isLoading,
    orgPricingError: pricingQuery.error,
    refreshPricing: pricingQuery.refetch,

    // Optional: expose role early for gating
    role: localRole || (primaryMembership?.role ?? undefined),
  };
}

