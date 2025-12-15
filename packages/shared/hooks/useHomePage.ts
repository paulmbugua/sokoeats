import { useEffect, useMemo, useCallback, useState } from 'react';
import type { Profile } from '@mytutorapp/shared/types';
import { fetchTutorProfiles } from '@mytutorapp/shared/api';
import { searchTutorsApi } from '@mytutorapp/shared/api/profileApi';
import { useShopContext } from '@mytutorapp/shared/context';
import useAppQuery from './useAppQuery';

const dev =
  typeof process !== 'undefined'
    ? process.env.NODE_ENV !== 'production'
    : false;

type UiFilters = {
  country: string;
  subject: string;
  minRating: number;
  maxTokens: number; // ✅
};

const DEFAULT_UI: UiFilters = {
  country: '',
  subject: '',
  minRating: 0,
  maxTokens: 0,
};


const throttle = (ms: number) => new Promise((r) => setTimeout(r, ms));

type SearchMeta = {
  usingServer: boolean;
  aiUsed?: boolean;
  rows?: number;

  parsed?: any;
  limit?: number;
  offset?: number;

  serverError?: string;
  ms?: number;
};

const cleanBase = (u?: string) => String(u || '').replace(/\/+$/, '');

// ✅ optionally pass a fallback baseUrl (handy for web pages)
const useHomePage = (opts?: { backendUrl?: string }) => {
  const ctx = useShopContext();
  const backendUrl = cleanBase(ctx?.backendUrl) || cleanBase(opts?.backendUrl);

  const [rawQ, setRawQ] = useState('');
  const [q, setQ] = useState('');
  const [uiFilters, setUiFilters] = useState<UiFilters>(DEFAULT_UI);

  const [searchMeta, setSearchMeta] = useState<SearchMeta>({ usingServer: true });

  useEffect(() => {
    const t = setTimeout(() => setQ(rawQ.trim()), 250);
    return () => clearTimeout(t);
  }, [rawQ]);

 const queryKey = useMemo(
  () => [
    'tutorSearch',
    backendUrl,
    q,
    uiFilters.country,
    uiFilters.subject,
    uiFilters.minRating,
    uiFilters.maxTokens,
  ],
  [backendUrl, q, uiFilters.country, uiFilters.subject, uiFilters.minRating, uiFilters.maxTokens]
);


  const { data, isLoading: loading, refetch: reloadProfiles } = useAppQuery<Profile[]>(
    queryKey,
    async (): Promise<Profile[]> => {
      if (!backendUrl) return [];

      const limit = 48;
      const offset = 0;

      const params: Record<string, any> = { q, limit, offset };
      if (uiFilters.country) params.country = uiFilters.country;
      if (uiFilters.subject) params.subject = uiFilters.subject;
      if (uiFilters.minRating > 0) params.minRating = uiFilters.minRating;
      if (uiFilters.maxTokens > 0) params.maxTokens = uiFilters.maxTokens; // ✅


      const t0 = Date.now();

      try {
        if (dev) console.debug('[useHomePage] searchTutorsApi params:', params);

        const resp: any = await searchTutorsApi(backendUrl, params);
        const ms = Date.now() - t0;

        // ✅ robust response parsing
        const profiles = Array.isArray(resp)
          ? resp
          : Array.isArray(resp?.profiles)
          ? resp.profiles
          : Array.isArray(resp?.rows)
          ? resp.rows
          : [];

        setSearchMeta({
          usingServer: true,
          parsed: resp?.parsed ?? null,
          limit: resp?.limit ?? limit,
          offset: resp?.offset ?? offset,
          rows: profiles.length,
          ms,
        });

        return profiles.filter((p: any) => String(p?.role || '').toLowerCase() === 'tutor');
      } catch (err: any) {
        const ms = Date.now() - t0;
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          'searchTutorsApi failed';

        setSearchMeta({ usingServer: false, serverError: msg, ms });
        console.error('[useHomePage] searchTutorsApi failed → fallback:', msg);

        await throttle(100);
        const fallback = await fetchTutorProfiles(backendUrl);
        return (fallback || []).filter((p: any) => String(p?.role || '').toLowerCase() === 'tutor');
      }
    },
    {
      enabled: Boolean(backendUrl),
      retry: false,
      staleTime: 15_000,
    }
  );

  const filteredProfiles: Profile[] = data ?? [];

  const handleSearch = useCallback((term: string) => {
    setRawQ(term ?? '');
  }, []);

  const setCountryFilter = useCallback((iso2: string) => {
    setUiFilters((prev) => ({ ...prev, country: String(iso2 || '').toUpperCase().trim() }));
  }, []);

  const setSubjectFilter = useCallback((subject: string) => {
    setUiFilters((prev) => ({ ...prev, subject: String(subject || '').trim() }));
  }, []);

  const setMinRatingFilter = useCallback((n: number) => {
    const v = Number(n || 0);
    setUiFilters((prev) => ({ ...prev, minRating: Number.isFinite(v) ? v : 0 }));
  }, []);

  const setMaxTokensFilter = useCallback((n: number) => {
  const v = Number(n || 0);
  setUiFilters((prev) => ({ ...prev, maxTokens: Number.isFinite(v) ? v : 0 }));
}, []);


  const clearFilters = useCallback(() => {
    setRawQ('');
    setQ('');
    setUiFilters(DEFAULT_UI);
  }, []);

  return {
    filteredProfiles,
    loading,
    handleSearch,

    uiFilters,
    setSubjectFilter,
    setCountryFilter,
    setMinRatingFilter,
    setMaxTokensFilter,
    clearFilters,

    reloadProfiles,
    searchMeta,
  };
};

export default useHomePage;
