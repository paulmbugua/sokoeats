import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Course } from '@mytutorapp/shared/types';
import { useShopContext } from '@mytutorapp/shared/context';
import useAppQuery from './useAppQuery';
import { searchCoursesApi, getCourses } from '@mytutorapp/shared/api';

const dev =
  typeof process !== 'undefined'
    ? process.env.NODE_ENV !== 'production'
    : false;

type UiFilters = {
  subject: string;
  gradeBand: string;
  level: string;
  minRating: number;
  maxPrice: number;
  isOer: boolean;
};

const DEFAULT_UI: UiFilters = {
  subject: '',
  gradeBand: '',
  level: '',
  minRating: 0,
  maxPrice: 0,
  isOer: false,
};

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
const throttle = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function useCourseSearch(opts?: { backendUrl?: string }) {
  const ctx = useShopContext();
  const backendUrl = cleanBase(ctx?.backendUrl) || cleanBase(opts?.backendUrl);
  const token = ctx?.token ?? undefined;

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
      'courseSearch',
      backendUrl,
      q,
      uiFilters.subject,
      uiFilters.gradeBand,
      uiFilters.level,
      uiFilters.minRating,
      uiFilters.maxPrice,
      uiFilters.isOer ? 1 : 0,
    ],
    [backendUrl, q, uiFilters]
  );

  const { data, isLoading: loading, refetch } = useAppQuery<Course[]>(
    queryKey,
    async () => {
      if (!backendUrl) return [];

      const limit = 48;
      const offset = 0;

      const params: Record<string, any> = { q, limit, offset };

      if (uiFilters.subject) params.subject = uiFilters.subject;
      if (uiFilters.gradeBand) params.gradeBand = uiFilters.gradeBand;
      if (uiFilters.level) params.level = uiFilters.level;
      if (uiFilters.minRating > 0) params.minRating = uiFilters.minRating;
      if (uiFilters.maxPrice > 0) params.maxPrice = uiFilters.maxPrice;
      if (uiFilters.isOer) params.isOer = 1;

      const t0 = Date.now();

      try {
        if (dev) console.debug('[useCourseSearch] params:', params);

        // ✅ now comes from @mytutorapp/shared/api (barrel)
        const resp: any = await searchCoursesApi(backendUrl, params);
        const ms = Date.now() - t0;

        const courses = Array.isArray(resp)
          ? resp
          : Array.isArray(resp?.courses)
          ? resp.courses
          : Array.isArray(resp?.rows)
          ? resp.rows
          : [];

        setSearchMeta({
          usingServer: true,
          parsed: resp?.parsed ?? null,
          limit: resp?.limit ?? limit,
          offset: resp?.offset ?? offset,
          rows: courses.length,
          aiUsed: resp?.meta?.aiUsed,
          ms,
        });

        return courses;
      } catch (err: any) {
        const ms = Date.now() - t0;
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          'searchCoursesApi failed';

        setSearchMeta({ usingServer: false, serverError: msg, ms });
        console.error('[useCourseSearch] failed → fallback:', msg);

        // ✅ fallback uses getCourses (which you DO export)
        await throttle(100);
        const fallback = await getCourses(backendUrl, token).catch(() => []);
        return Array.isArray(fallback) ? fallback : [];
      }
    },
    { enabled: Boolean(backendUrl), retry: false, staleTime: 15_000 }
  );

  const courses = data ?? [];

  const handleSearch = useCallback((term: string) => setRawQ(term ?? ''), []);

  const setSubjectFilter = useCallback((v: string) => {
    setUiFilters((p) => ({ ...p, subject: String(v || '').trim() }));
  }, []);

  const setGradeBandFilter = useCallback((v: string) => {
    setUiFilters((p) => ({ ...p, gradeBand: String(v || '').trim() }));
  }, []);

  const setLevelFilter = useCallback((v: string) => {
    setUiFilters((p) => ({ ...p, level: String(v || '').trim() }));
  }, []);

  const setMinRatingFilter = useCallback((n: number) => {
    const v = Number(n || 0);
    setUiFilters((p) => ({ ...p, minRating: Number.isFinite(v) ? v : 0 }));
  }, []);

  const setMaxPriceFilter = useCallback((n: number) => {
    const v = Number(n || 0);
    setUiFilters((p) => ({ ...p, maxPrice: Number.isFinite(v) ? v : 0 }));
  }, []);

  const setIsOerFilter = useCallback((b: boolean) => {
    setUiFilters((p) => ({ ...p, isOer: Boolean(b) }));
  }, []);

  const clearFilters = useCallback(() => {
    setRawQ('');
    setQ('');
    setUiFilters(DEFAULT_UI);
  }, []);

  return {
    courses,
    loading,
    handleSearch,

    uiFilters,
    setSubjectFilter,
    setGradeBandFilter,
    setLevelFilter,
    setMinRatingFilter,
    setMaxPriceFilter,
    setIsOerFilter,
    clearFilters,

    refetch,
    searchMeta,
  };
}
