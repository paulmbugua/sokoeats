// packages/shared/hooks/useCourseSearch.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Course } from '@mytutorapp/shared/types';
import { useShopContext } from '@mytutorapp/shared/context';
import useAppQuery from './useAppQuery';
import { searchCoursesApi, getCourses } from '@mytutorapp/shared/api';

const dev =
  typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : false;

  

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

export type NormalizedCourseSearchMeta = {
  usingServer: boolean;
  aiUsed: boolean;
  parsed: any | null;
  rows: number;
  limit: number;
  offset: number;
  ms: number;
  error: string | null;
};

export function normalizeCourseSearchMeta(m: any): NormalizedCourseSearchMeta {
  const meta = m && typeof m === 'object' ? m : {};
  const parsed = meta.parsed ?? null;
  const aiUsed = Boolean(meta.aiUsed ?? parsed);

  return {
    usingServer: Boolean(meta.usingServer),
    aiUsed,
    parsed,
    rows: Number(meta.rows ?? 0) || 0,
    limit: Number(meta.limit ?? 0) || 0,
    offset: Number(meta.offset ?? 0) || 0,
    ms: Number(meta.ms ?? 0) || 0,
    error: meta.serverError ? String(meta.serverError) : null,
  };
}

const cleanBase = (u?: string) => String(u || '').replace(/\/+$/, '');
const throttle = (ms: number) => new Promise((r) => setTimeout(r, ms));
const toStr = (v: any) => (v == null ? '' : String(v));
const normStr = (v: any) => toStr(v).trim();

/**
 * Server-driven search filters (AI parsing happens server-side).
 * Client just passes user intent through to the server.
 */
export type ServerFilters = {
  subject?: string;
  gradeBand?: string;
  level?: string;

  country?: string;
  countryIso2?: string;
  duration?: string;
  tutor?: string;

  minRating?: number;
  maxPrice?: number;

  isOer?: boolean;
  sort?: string;

  scope?: string; // 'all' | 'free' | 'purchased' etc

  // OER-related filters
  providers?: string[] | string;     // allow string or array
  contentKinds?: string[] | string;  // allow string or array

  // IMPORTANT: leave undefined/empty unless you are sure backend supports it.
  // In your app, default tutor search wants this, but library search MUST clear it.
  sourceKind?: string; // 'tutor' | 'oer' | 'sandbox' etc
};

type UseCourseSearchOpts = {
  backendUrl?: string;

  /**
   * Optional initial filters override.
   * Example for Library (OER video collections):
   * { isOer: true, contentKinds: ['video'], sourceKind: '' }
   */
  initialFilters?: Partial<ServerFilters>;
};

/**
 * Convert array-ish values into a comma separated string.
 * This is intentionally used because it is the most compatible format across:
 * - URL query serialization
 * - Express req.query parsing
 * - your backend helpers (toArr can split comma strings safely)
 */
function toCommaList(v: any): string {
  if (v == null) return '';
  if (Array.isArray(v)) {
    return v.map((x) => normStr(x)).filter(Boolean).join(',');
  }
  // if already a string like "video,doc"
  const s = normStr(v);
  return s;
}

function omitEmptyFilters(filters: ServerFilters): Record<string, any> {
  const out: Record<string, any> = {};

  for (const [k, v] of Object.entries(filters)) {
    if (v == null) continue;

    // strings
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s) continue;
      // keep empty sourceKind out (let it be absent instead of "")
      if (k === 'sourceKind' && !s) continue;
      out[k] = s;
      continue;
    }

    // arrays (we normalize to comma strings to avoid backend 500s)
    if (Array.isArray(v)) {
      const csv = toCommaList(v);
      if (!csv) continue;
      out[k] = csv;
      continue;
    }

    // numbers
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || v <= 0) continue;
      out[k] = v;
      continue;
    }

    // booleans
    if (typeof v === 'boolean') {
      if (k === 'isOer' && v === false) continue; // omit isOer=false
      out[k] = v;
      continue;
    }

    // objects (rare here)
    out[k] = v;
  }

  // ✅ special normalization for these two filters:
  // accept array or string, always send comma string
  if (filters.providers != null) {
    const csv = toCommaList(filters.providers);
    if (csv) out.providers = csv;
    else delete out.providers;
  }
  if (filters.contentKinds != null) {
    const csv = toCommaList(filters.contentKinds);
    if (csv) out.contentKinds = csv;
    else delete out.contentKinds;
  }

  // ✅ Avoid sending sourceKind="" (some backends treat empty differently)
  if ('sourceKind' in out && !normStr(out.sourceKind)) delete out.sourceKind;

  return out;
}

/**
 * Stable stringify for queryKey (so order doesn't cause refetch loops)
 */
function stableKey(obj: any): string {
  if (!obj || typeof obj !== 'object') return '';
  const keys = Object.keys(obj).sort();
  const normed: any = {};
  for (const k of keys) {
    normed[k] = obj[k];
  }
  return JSON.stringify(normed);
}

export default function useCourseSearch(opts?: UseCourseSearchOpts) {
  const ctx = useShopContext();
  const backendUrl = cleanBase(ctx?.backendUrl) || cleanBase(opts?.backendUrl);
  const token = ctx?.token ?? undefined;

  const [rawQ, setRawQ] = useState('');
  const [q, setQ] = useState('');

  // ✅ Default tutor-first, allow caller override
  const [filters, setFilters] = useState<ServerFilters>(() => ({
    isOer: false,
    sourceKind: 'tutor',
    ...(opts?.initialFilters ?? {}),
  }));

  const [searchMeta, setSearchMeta] = useState<SearchMeta>({ usingServer: true });

  useEffect(() => {
    const t = setTimeout(() => setQ(rawQ.trim()), 250);
    return () => clearTimeout(t);
  }, [rawQ]);

  // Normalize filters for key + request
  const normalizedFilters = useMemo(() => omitEmptyFilters(filters), [filters]);

  const queryKey = useMemo(
    () => [
      'courseSearch',
      backendUrl,
      token ? 'auth' : 'anon',
      q,
      stableKey(normalizedFilters),
    ],
    [backendUrl, token, q, normalizedFilters]
  );

  const { data, isLoading: loading, refetch } = useAppQuery<Course[]>(
    queryKey,
    async () => {
      if (!backendUrl) return [];

      const limit = 48;
      const offset = 0;

      const params: Record<string, any> = {
        q,
        limit,
        offset,
        ...normalizedFilters,
      };

      const t0 = Date.now();

      try {
        if (dev) console.debug('[useCourseSearch] params:', params);

        const resp: any = await searchCoursesApi(backendUrl, params, token);
        const ms = Date.now() - t0;

        const courses = Array.isArray(resp)
          ? resp
          : Array.isArray(resp?.courses)
          ? resp.courses
          : Array.isArray(resp?.rows)
          ? resp.rows
          : [];

        const parsed = resp?.parsed ?? null;

        setSearchMeta({
          usingServer: true,
          parsed,
          aiUsed: Boolean(parsed),
          limit: resp?.limit ?? limit,
          offset: resp?.offset ?? offset,
          rows: courses.length,
          ms,
        });

        return courses;
      } catch (err: any) {
        const ms = Date.now() - t0;

        const msg =
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          'searchCoursesApi failed';

        setSearchMeta({ usingServer: false, serverError: msg, ms });
        console.error('[useCourseSearch] failed → fallback:', msg, { params });

        // fallback keeps UI alive
        await throttle(100);
        const fallback = await getCourses(backendUrl, token).catch(() => []);
        return Array.isArray(fallback) ? fallback : [];
      }
    },
    { enabled: Boolean(backendUrl), retry: false, staleTime: 15_000 }
  );

  const courses = data ?? [];

  const handleSearch = useCallback((term: string) => setRawQ(term ?? ''), []);

  const patchFilters = useCallback((next: Partial<ServerFilters>) => {
    setFilters((p) => ({ ...p, ...next }));
  }, []);

  /**
   * ✅ Allows caller to intentionally "reset" into a different mode.
   * Example:
   * resetFilters({ isOer:true, contentKinds:['video'], sourceKind:'' })
   */
  const resetFilters = useCallback((next?: Partial<ServerFilters>) => {
    setFilters({
      isOer: false,
      sourceKind: 'tutor',
      ...(next ?? {}),
    });
  }, []);

  const clearFilters = useCallback(() => {
    setRawQ('');
    setQ('');
    setFilters({ isOer: false, sourceKind: 'tutor' });
  }, []);

  return {
    courses,
    loading,
    handleSearch,

    filters,
    patchFilters,
    resetFilters,

    clearFilters,

    refetch,
    searchMeta,
  };
}
