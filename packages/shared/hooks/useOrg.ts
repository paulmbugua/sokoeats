// packages/shared/hooks/useOrg.ts
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useShopContext } from '@mytutorapp/shared/context';
import {
  fetchCurrentUser,
  getMyOrg,
  fetchOrgPricingTable,
  getMyOrgOrBootstrap,
  type OrgCurrency,
  type OrgPricingTable,
  OrgResp,
} from '@mytutorapp/shared/api/orgApi';
import type { OrgMembership, CurrentUser, OrgTier } from '@mytutorapp/shared/types';

type KV = {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
  removeItem: (k: string) => Promise<void>;
};

// Fallback in case storage isn’t injected (shouldn’t happen in your setup)
const memoryStorage: KV = (() => {
  const m = new Map<string, string>();
  return {
    async getItem(k) {
      return m.has(k) ? m.get(k)! : null;
    },
    async setItem(k, v) {
      m.set(k, v);
    },
    async removeItem(k) {
      m.delete(k);
    },
  };
})();

export function useOrg(opts?: { currency?: OrgCurrency }) {
  const { backendUrl, orgToken, userId, storage: ctxStorage } = useShopContext() as any;
  const storage: KV = useMemo(() => (ctxStorage as KV) || memoryStorage, [ctxStorage]);

  const authToken: string | undefined = orgToken;

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
  const [orgChecked, setOrgChecked] = useState(false);
  const triedBootstrapRef = useRef(false);
  const membershipHydratedRef = useRef(false);

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
        const a =
          (await storage.getItem('org:activeId')) ||
          (await storage.getItem('auth:orgId')) ||
          undefined;
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
    return () => {
      cancelled = true;
    };
  }, [storage]);

  // ─────────────────────────────────────────────────────────
  // Keep in sync with other web tabs (native: no-op)
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const onStorage = async (e: StorageEvent) => {
      // Only react to our relevant keys when storage area is localStorage (web)
      if (!e.key || (e.key !== 'org:activeId' && e.key !== 'auth:orgId' && e.key !== 'org:role'))
        return;

      const a =
        (await storage.getItem('org:activeId')) ||
        (await storage.getItem('auth:orgId')) ||
        undefined;
      const rRaw = await storage.getItem('org:role');
      const r = rRaw ? rRaw.toLowerCase() : undefined;

      setActiveOrgId(a);
      setLocalRole(r);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storage]);

  // ─────────────────────────────────────────────────────────
  // React Query-backed membership + org fetchers (deduped globally)
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authToken) {
      setMembership(null);
      setOrg(null);
      setCurrentUser(null);
      setActiveOrgId(undefined); // ✅ clear active org
      setLocalRole(undefined); // ✅ clear cached role
      setOrgChecked(false);
      membershipHydratedRef.current = false;
      triedBootstrapRef.current = false;
    }
  }, [authToken]);

  const membershipQuery = useQuery({
    queryKey: ['orgMembership', backendUrl, authToken],
    enabled: !!backendUrl && !!authToken,
    queryFn: () => fetchCurrentUser(backendUrl, authToken),
    staleTime: 120_000,
    refetchOnWindowFocus: false,
    retry: (failure) => {
      if (axios.isAxiosError(failure)) {
        const status = failure.response?.status;
        if (status === 401 || status === 403) return false;
      }
      return 1;
    },
  });

  useEffect(() => {
    setLoadingMembership(membershipQuery.isFetching);

    if (membershipQuery.data) {
      membershipHydratedRef.current = true;
      setCurrentUser(membershipQuery.data as CurrentUser);
      setMembership((membershipQuery.data as any)?.org ?? null);
    }

    if (membershipHydratedRef.current && !membershipQuery.isFetching && membershipQuery.isError) {
      setMembership(null);
      setCurrentUser(null);
    }
  }, [membershipQuery.data, membershipQuery.isError, membershipQuery.isFetching]);

  const orgQuery = useQuery({
    queryKey: ['orgEntity', backendUrl, authToken],
    enabled: !!backendUrl && !!authToken,
    refetchOnWindowFocus: false,
    staleTime: 120_000,
    queryFn: async () => {
      try {
        return await getMyOrg(backendUrl, authToken);
      } catch (e) {
        if (axios.isAxiosError(e)) {
          const status = e.response?.status;
          if (status === 404 && !triedBootstrapRef.current) {
            triedBootstrapRef.current = true;
            return await getMyOrgOrBootstrap(backendUrl, authToken);
          }
        }
        throw e;
      }
    },
    retry: (failure) => {
      if (axios.isAxiosError(failure)) {
        const status = failure.response?.status;
        if (status === 401 || status === 403 || status === 404) return false;
      }
      return 1;
    },
  });

  useEffect(() => {
    setLoadingOrg(orgQuery.isFetching);

    if (orgQuery.data) {
      const o = orgQuery.data;
      setOrg(o ?? null);
      setOrgChecked(true);

      setMembership((prev) => {
        if (Array.isArray(prev)) {
          return prev.map((m) =>
            m.orgId === o?.id && m.can_access_fees === undefined
              ? { ...m, can_access_fees: Boolean((o as any)?.can_access_fees) }
              : m,
          );
        }

        if (prev) {
          if (prev.can_access_fees === undefined && (o as any)?.can_access_fees !== undefined) {
            return { ...prev, can_access_fees: Boolean((o as any)?.can_access_fees) };
          }
          return prev;
        }

        if (!o) return prev;

        return {
          orgId: (o as any)?.id ?? '',
          role: ((o as any)?.my_role || (o as any)?.role || '').toLowerCase(),
          tier: (o as any)?.tier,
          can_access_fees: Boolean((o as any)?.can_access_fees),
        } as any;
      });

      (async () => {
        if (o?.id) {
          setActiveOrgId((prev) => prev ?? o.id);
          await storage.setItem('org:activeId', o.id);
        }

        const myRole = ((o as any)?.my_role || (o as any)?.role || '').toString().toLowerCase();

        if (myRole) {
          setLocalRole(myRole);
          await storage.setItem('org:role', myRole);
        } else {
          setLocalRole(undefined);
          await storage.removeItem('org:role');
        }
      })();
    }

    if (!orgQuery.isPending && orgQuery.isError) {
      setOrg(null);
      setOrgChecked(true);
    }
  }, [orgQuery.data, orgQuery.isError, orgQuery.isFetching, orgQuery.isPending, storage]);

  // ─────────────────────────────────────────────────────────
  // Derivations
  // ─────────────────────────────────────────────────────────
  const primaryMembership = useMemo(() => {
    if (!membership) return null;
    if (Array.isArray(membership)) {
      return (
        membership.find((m) => m.role === 'owner' || m.role === 'admin') || membership[0] || null
      );
    }
    return membership;
  }, [membership]);

  const effectiveOrgId =
    org?.id ??
    (Array.isArray(membership) ? membership[0]?.orgId : membership?.orgId) ??
    activeOrgId;

  const orgTier: OrgTier | undefined =
    (org?.tier as OrgTier | null) ?? (primaryMembership?.tier as OrgTier | undefined) ?? undefined;

  const hasOrg = Boolean(effectiveOrgId);
  const isStarterTier = hasOrg && (orgTier === 'starter' || (orgTier as any) === 'start');
  const isProTier = hasOrg && orgTier === 'pro';
  const isEnterpriseTier = hasOrg && orgTier === 'enterprise';

  const isOwnerOrAdmin =
    (!!primaryMembership &&
      (primaryMembership.role === 'owner' || primaryMembership.role === 'admin')) ||
    localRole === 'owner' ||
    localRole === 'admin';

  const orgSeats = typeof org?.seats === 'number' ? org.seats : undefined;

  const refresh = () => membershipQuery.refetch();
  const refreshOrg = () => orgQuery.refetch();
  const refreshAll = async () => {
    await Promise.allSettled([membershipQuery.refetch(), orgQuery.refetch()]);
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
    orgChecked,
    orgNotFound: orgChecked && !org && !loadingOrg,

    // Optional: expose role early for gating
    role: localRole || (primaryMembership?.role ?? undefined),
  };
}
