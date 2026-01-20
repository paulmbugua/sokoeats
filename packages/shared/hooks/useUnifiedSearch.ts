// packages/shared/hooks/useUnifiedSearch.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';
import useAppQuery from './useAppQuery';
import { unifiedSearchApi } from '@mytutorapp/shared/api';
import type { UnifiedSearchResult } from '@mytutorapp/shared/types';

const cleanBase = (u?: string) => String(u || '').replace(/\/+$/, '');
const toStr = (v: any) => (v == null ? '' : String(v));
const normStr = (v: any) => toStr(v).trim();

export type UnifiedSearchItem = UnifiedSearchResult;

export type UnifiedSearchMeta = {
  usingServer: boolean;
  aiUsed: boolean;
  parsed: any | null;
  limit: number;
  offset: number;
  ms: number;
  countsByKind: Record<string, number>;
  warnings?: string[];
  error?: string | null;
};

export type UnifiedSearchFilters = {
  kinds?: string[] | string;
  subject?: string;
  gradeBand?: string;
  country?: string;
  provider?: string;
  providers?: string[] | string;
  contentKind?: string;
  contentKinds?: string[] | string;
  sourceKind?: string;
  scope?: string;
  minRating?: number;
  maxPrice?: number;
};

type UseUnifiedSearchOpts = {
  backendUrl?: string;
  initialFilters?: Partial<UnifiedSearchFilters>;
};

function toCommaList(v: any): string {
  if (v == null) return '';
  if (Array.isArray(v)) {
    return v.map((x) => normStr(x)).filter(Boolean).join(',');
  }
  return normStr(v);
}

function omitEmptyFilters(filters: UnifiedSearchFilters): Record<string, any> {
  const out: Record<string, any> = {};

  for (const [k, v] of Object.entries(filters)) {
    if (v == null) continue;

    if (typeof v === 'string') {
      const s = v.trim();
      if (!s) continue;
      if (k === 'sourceKind' && !s) continue;
      out[k] = s;
      continue;
    }

    if (Array.isArray(v)) {
      const csv = toCommaList(v);
      if (!csv) continue;
      out[k] = csv;
      continue;
    }

    if (typeof v === 'number') {
      if (!Number.isFinite(v) || v <= 0) continue;
      out[k] = v;
      continue;
    }

    if (typeof v === 'boolean') {
      out[k] = v;
      continue;
    }

    out[k] = v;
  }

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
  if (filters.kinds != null) {
    const csv = toCommaList(filters.kinds);
    if (csv) out.kinds = csv;
    else delete out.kinds;
  }

  if ('sourceKind' in out && !normStr(out.sourceKind)) delete out.sourceKind;

  return out;
}

function stableKey(obj: any): string {
  if (!obj || typeof obj !== 'object') return '';
  const keys = Object.keys(obj).sort();
  const normed: any = {};
  for (const k of keys) {
    normed[k] = obj[k];
  }
  return JSON.stringify(normed);
}

export default function useUnifiedSearch(opts?: UseUnifiedSearchOpts) {
  const ctx = useShopContext();
  const backendUrl = cleanBase(ctx?.backendUrl) || cleanBase(opts?.backendUrl);
  const token = ctx?.token ?? undefined;

  const [rawQ, setRawQ] = useState('');
  const [q, setQ] = useState('');

  const [filters, setFilters] = useState<UnifiedSearchFilters>(() => ({
    ...(opts?.initialFilters ?? {}),
  }));

  const [searchMeta, setSearchMeta] = useState<UnifiedSearchMeta>({
    usingServer: true,
    aiUsed: false,
    parsed: null,
    limit: 0,
    offset: 0,
    ms: 0,
    countsByKind: {},
    warnings: [],
    error: null,
  });

  useEffect(() => {
    const t = setTimeout(() => setQ(rawQ.trim()), 250);
    return () => clearTimeout(t);
  }, [rawQ]);

  const normalizedFilters = useMemo(() => omitEmptyFilters(filters), [filters]);

  const queryKey = useMemo(
    () => [
      'unifiedSearch',
      backendUrl,
      token ? 'auth' : 'anon',
      q,
      stableKey(normalizedFilters),
    ],
    [backendUrl, token, q, normalizedFilters]
  );

  const { data, isLoading: loading, refetch } = useAppQuery<UnifiedSearchItem[]>(
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
        const resp: any = await unifiedSearchApi(backendUrl, params, token);
        const ms = Date.now() - t0;

        const items = Array.isArray(resp?.items) ? resp.items : [];
        const meta = resp?.meta ?? {};

        setSearchMeta({
          usingServer: Boolean(meta.usingServer ?? true),
          aiUsed: Boolean(meta.aiUsed ?? meta.parsed),
          parsed: meta.parsed ?? null,
          limit: Number(meta.limit ?? limit) || limit,
          offset: Number(meta.offset ?? offset) || offset,
          ms: Number(meta.ms ?? ms) || ms,
          countsByKind: meta.countsByKind ?? {},
          warnings: Array.isArray(meta.warnings) ? meta.warnings : [],
          error: meta.error ? String(meta.error) : null,
        });

        return items;
      } catch (err: any) {
        setSearchMeta({
          usingServer: true,
          aiUsed: false,
          parsed: null,
          limit,
          offset,
          ms: Date.now() - t0,
          countsByKind: {},
          warnings: [],
          error: err?.message ? String(err.message) : 'Search failed',
        });
        return [];
      }
    },
    {
      enabled: Boolean(backendUrl),
    }
  );

  const handleSearch = useCallback((next: string) => {
    setRawQ(next ?? '');
  }, []);

  const patchFilters = useCallback((patch: Partial<UnifiedSearchFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ ...(opts?.initialFilters ?? {}) });
  }, [opts?.initialFilters]);

  return {
    items: (data ?? []) as UnifiedSearchItem[],
    loading,
    handleSearch,
    filters,
    patchFilters,
    clearFilters,
    meta: searchMeta,
    refetch,
  };
}
