// packages/shared/hooks/useResourcesExplore.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useShopContext } from '@mytutorapp/shared/context';
import type {
  Course,
  RecordedVideo,
  ResourceCategoryResult,
  UnifiedSearchResult,
} from '@mytutorapp/shared/types';
import type { OerBookItem, OerVideoItem } from '@mytutorapp/shared/api/resourcesApi';
import {
  fetchClassVaultExplore,
  fetchExploreCourses,
  fetchOerBooksExplore,
  fetchOerVideosExplore,
} from '@mytutorapp/shared/api/resourcesApi';
import { unifiedSearchApi } from '@mytutorapp/shared/api/searchApi';

const DEFAULT_LIMIT = 12;

// ✅ IMPORTANT: stable array references (do NOT inline these in render)
const KINDS_CLASSVAULT = ['classvault_market'] as const;
const KINDS_OER_VIDEOS = ['oer_video'] as const;
const KINDS_COURSES = ['course'] as const;
const KINDS_OER_COURSES = ['oer_course'] as const;

export type ResourceFilters = {
  subject: string;
  gradeBand: string;
  country: string;
  sourceKind: '' | 'oer' | 'tutor';
  scope: '' | 'free' | 'purchased';
  minRating: number; // 0..5
  maxPrice: number; // tokens, 0 = no cap
};

export const DEFAULT_FILTERS: ResourceFilters = {
  subject: '',
  gradeBand: '',
  country: '',
  sourceKind: '',
  scope: '',
  minRating: 0,
  maxPrice: 0,
};

type PaginatedState<T> = {
  items: T[];
  total: number;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
};

type PaginatedFetcher<T> = (params: {
  limit: number;
  offset: number;
}) => Promise<ResourceCategoryResult<T>>;

type TabKey = 'videos' | 'courses';

type UnifiedCategoryOpts<T> = {
  enabled: boolean;
  backendUrl: string;
  token?: string;
  query: string;
  limit?: number;
  kinds: readonly string[];
  primaryKind: string;
  filter?: (item: UnifiedSearchResult) => boolean;
  map: (item: UnifiedSearchResult) => T;

  // ✅ used only for dependency stability
  filtersKey?: string;
  filters?: ResourceFilters;
};

function isAbortError(err: any) {
  return (
    err?.name === 'CanceledError' ||
    err?.code === 'ERR_CANCELED' ||
    axios.isCancel(err)
  );
}

function normalizeCourseLevel(): Course['level'] {
  return 'Beginner';
}

function mapToRecordedVideo(item: UnifiedSearchResult): RecordedVideo {
  return {
    id: Number(item.id) || 0,
    tutor_id: 0,
    title: item.title,
    description: '',
    subject: item.subject,
    grade_level: undefined,
    price: 0,
    duration: undefined,
    tags: [],
    video_url: '',
    pdf_url: undefined,
    preview_url: undefined,
    thumbnail_url: item.thumbnail_url ?? undefined,
    created_at: new Date().toISOString(),
  };
}

function mapToCourse(item: UnifiedSearchResult): Course {
  return {
    id: String(item.id),
    tutorId: 0,
    title: item.title,
    description: '',
    level: normalizeCourseLevel(),
    duration: '',
    price: 0,
    syllabus: [],
    prerequisites: '',
    createdAt: new Date().toISOString(),
    subject: item.subject ?? undefined,
    thumbnail_url: item.thumbnail_url ?? undefined,
  } as unknown as Course;
}

function mapToOerVideo(item: UnifiedSearchResult): OerVideoItem {
  return {
    slug: item.id,
    title: item.title,
    provider: item.provider ?? null,
    subject: item.subject ?? null,
    thumbnail_url: item.thumbnail_url ?? null,
    source_url: null,
    embed_url: null,
    created_at: null,
  };
}

function mapToOerBook(item: UnifiedSearchResult): OerBookItem {
  return {
    id: item.id,
    slug: item.id,
    title: item.title,
    cover_url: item.thumbnail_url ?? null,
    created_at: null,
  };
}

function isOerBookResult(item: UnifiedSearchResult) {
  const href = String(item.href || '').toLowerCase();
  return href.startsWith('/oer/') && !href.startsWith('/oer/collections/');
}

function usePaginatedSection<T>(
  fetcher: PaginatedFetcher<T>,
  deps: unknown[],
  opts?: { enabled?: boolean; limit?: number }
): PaginatedState<T> {
  const enabled = opts?.enabled ?? true;
  const limit = opts?.limit ?? DEFAULT_LIMIT;

  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const fetchPage = useCallback(
    async (nextOffset: number, replace: boolean) => {
      if (!enabled) return;

      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const resp = await fetcherRef.current({ limit, offset: nextOffset });
        if (requestId !== requestIdRef.current) return;

        setItems((prev) => (replace ? resp.items : prev.concat(resp.items)));
        setTotal(resp.total ?? 0);
        setOffset(nextOffset + resp.items.length);
      } catch (err: any) {
        if (requestId !== requestIdRef.current) return;
        setError(err?.message ? String(err.message) : 'Failed to load');
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [enabled, limit]
  );

  const refresh = useCallback(() => {
    if (!enabled) return;
    requestIdRef.current += 1;
    setItems([]);
    setTotal(0);
    setOffset(0);
    void fetchPage(0, true);
  }, [enabled, fetchPage]);

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1;
      setItems([]);
      setTotal(0);
      setOffset(0);
      setLoading(false);
      setError(null);
      return;
    }

    void fetchPage(0, true);

    return () => {
      requestIdRef.current += 1;
    };
  }, [enabled, fetchPage, ...deps]);

  const hasMore = items.length < total;

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    void fetchPage(offset, false);
  }, [fetchPage, hasMore, loading, offset]);

  return useMemo(
    () => ({ items, total, loading, error, hasMore, loadMore, refresh }),
    [items, total, loading, error, hasMore, loadMore, refresh]
  );
}

function useUnifiedCategory<T>(opts: UnifiedCategoryOpts<T>): PaginatedState<T> {
  const {
    enabled,
    backendUrl,
    token,
    query,
    limit = DEFAULT_LIMIT,
    kinds,
    primaryKind,
    filter,
    map,
    filtersKey = '',
    filters,
  } = opts;

  const kindsCsv = useMemo(() => kinds.join(','), [kinds]);

  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);

  const abortCurrent = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
  }, []);

  const fetchPage = useCallback(
    async (nextOffset: number, replace: boolean) => {
      if (!enabled || !backendUrl) return;

      abortCurrent();
      const controller = new AbortController();
      controllerRef.current = controller;

      setLoading(true);
      setError(null);

      const f = filters ?? DEFAULT_FILTERS;

      try {
        const resp = await unifiedSearchApi(
          backendUrl,
          {
            q: query,
            kinds: kindsCsv,
            limit,
            offset: nextOffset,

            subject: f.subject || undefined,
            gradeBand: f.gradeBand || undefined,
            country: f.country || undefined,
            sourceKind: f.sourceKind || undefined,
            scope: f.scope || undefined,
            minRating: f.minRating > 0 ? f.minRating : undefined,
            maxPrice: f.maxPrice > 0 ? f.maxPrice : undefined,
          },
          token,
          controller.signal
        );

        const rawItems: UnifiedSearchResult[] = Array.isArray(resp?.items) ? resp.items : [];
        const meta = resp?.meta ?? {};
        const filtered = filter ? rawItems.filter(filter) : rawItems;
        const mapped = filtered.map(map);

        setItems((prev) => (replace ? mapped : prev.concat(mapped)));

        const nextOffsetValue = nextOffset + rawItems.length;
        setOffset(nextOffsetValue);

        const countByKindRaw = meta?.countsByKind?.[primaryKind];
        const countByKind = Number.isFinite(Number(countByKindRaw))
          ? Number(countByKindRaw)
          : undefined;

        setTotal((prev) =>
          typeof countByKind === 'number' ? countByKind : Math.max(prev, nextOffsetValue)
        );

        const totalValue = typeof countByKind === 'number' ? countByKind : nextOffsetValue;
        setHasMore(nextOffsetValue < totalValue);
      } catch (err: any) {
        if (isAbortError(err)) return;
        setError(err?.message ? String(err.message) : 'Failed to search');
      } finally {
        setLoading(false);
      }
    },
    [
      abortCurrent,
      backendUrl,
      enabled,
      kindsCsv,
      limit,
      map,
      primaryKind,
      query,
      token,
      filter,

      // ✅ re-run search when filters change
      filtersKey,
    ]
  );

  const refresh = useCallback(() => {
    if (!enabled) return;
    setItems([]);
    setTotal(0);
    setOffset(0);
    setHasMore(false);
    void fetchPage(0, true);
  }, [enabled, fetchPage]);

  useEffect(() => {
    if (!enabled) {
      abortCurrent();
      setItems([]);
      setTotal(0);
      setOffset(0);
      setHasMore(false);
      setLoading(false);
      setError(null);
      return;
    }

    refresh();
    return () => abortCurrent();
  }, [abortCurrent, enabled, refresh]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    void fetchPage(offset, false);
  }, [fetchPage, hasMore, loading, offset]);

  return useMemo(
    () => ({ items, total, loading, error, hasMore, loadMore, refresh }),
    [items, total, loading, error, hasMore, loadMore, refresh]
  );
}

/** ✅ NEW: treat "filters only" as search mode */
function hasActiveFilters(f?: ResourceFilters) {
  const x = f ?? DEFAULT_FILTERS;
  return Boolean(
    x.subject.trim() ||
      x.gradeBand.trim() ||
      x.country.trim() ||
      x.sourceKind ||
      x.scope ||
      x.minRating > 0 ||
      x.maxPrice > 0
  );
}

export function useResourcesExplore(
  query: string,
  activeTab: TabKey = 'videos',
  filters?: ResourceFilters
) {
  const { backendUrl, token } = useShopContext();
  const MIN_QUERY_LEN = 4;
  const cleanedQuery = query.trim();
  const queryActive = cleanedQuery.length >= MIN_QUERY_LEN;
  const effectiveQuery = queryActive ? cleanedQuery : '';
  const enabled = Boolean(backendUrl);

  const filtersKey = useMemo(() => JSON.stringify(filters ?? DEFAULT_FILTERS), [filters]);

  // ✅ KEY CHANGE
  const filtersActive = hasActiveFilters(filters);
  const isSearchActive = queryActive || filtersActive;

  // Explore fetchers (non-search)
  const fetchClassVaultPage = useCallback<PaginatedFetcher<RecordedVideo>>(
    ({ limit, offset }) =>
      fetchClassVaultExplore(backendUrl, {
        limit,
        offset,
        q: effectiveQuery || undefined,
      }),
    [backendUrl, effectiveQuery]
  );

  const fetchOerVideosPage = useCallback<PaginatedFetcher<OerVideoItem>>(
    ({ limit, offset }) =>
      fetchOerVideosExplore(backendUrl, {
        limit,
        offset,
        q: effectiveQuery || undefined,
      }),
    [backendUrl, effectiveQuery]
  );

  const fetchNormalCoursesPage = useCallback<PaginatedFetcher<Course>>(
    ({ limit, offset }) =>
      fetchExploreCourses(backendUrl, {
        limit,
        offset,
        q: effectiveQuery || undefined,
      }),
    [backendUrl, effectiveQuery]
  );

  const fetchOerBooksPage = useCallback<PaginatedFetcher<OerBookItem>>(
    ({ limit, offset }) =>
      fetchOerBooksExplore(backendUrl, {
        limit,
        offset,
        q: effectiveQuery || undefined,
      }),
    [backendUrl, effectiveQuery]
  );

  // Explore (only when NOT searching)
  const classVaultExplore = usePaginatedSection<RecordedVideo>(
    fetchClassVaultPage,
    [backendUrl, effectiveQuery],
    { enabled: enabled && !isSearchActive }
  );

  const oerVideosExplore = usePaginatedSection<OerVideoItem>(
    fetchOerVideosPage,
    [backendUrl, effectiveQuery],
    { enabled: enabled && !isSearchActive }
  );

  const normalCoursesExplore = usePaginatedSection<Course>(
    fetchNormalCoursesPage,
    [backendUrl, effectiveQuery],
    { enabled: enabled && !isSearchActive }
  );

  const oerBooksExplore = usePaginatedSection<OerBookItem>(
    fetchOerBooksPage,
    [backendUrl, effectiveQuery],
    { enabled: enabled && !isSearchActive }
  );

  // Unified search (runs when query OR filters are active)
  const classVaultSearch = useUnifiedCategory<RecordedVideo>({
    enabled: enabled && isSearchActive && activeTab === 'videos',
    backendUrl,
    token,
    query: effectiveQuery,
    kinds: KINDS_CLASSVAULT,
    primaryKind: 'classvault_market',
    map: mapToRecordedVideo,
    filters,
    filtersKey,
  });

  const oerVideosSearch = useUnifiedCategory<OerVideoItem>({
    enabled: enabled && isSearchActive && activeTab === 'videos',
    backendUrl,
    token,
    query: effectiveQuery,
    kinds: KINDS_OER_VIDEOS,
    primaryKind: 'oer_video',
    map: mapToOerVideo,
    filters,
    filtersKey,
  });

  const normalCoursesSearch = useUnifiedCategory<Course>({
    enabled: enabled && isSearchActive && activeTab === 'courses',
    backendUrl,
    token,
    query: effectiveQuery,
    kinds: KINDS_COURSES,
    primaryKind: 'course',
    map: mapToCourse,
    filters,
    filtersKey,
  });

  const oerBooksSearch = useUnifiedCategory<OerBookItem>({
    enabled: enabled && isSearchActive && activeTab === 'courses',
    backendUrl,
    token,
    query: effectiveQuery,
    kinds: KINDS_OER_COURSES,
    primaryKind: 'oer_course',
    filter: isOerBookResult,
    map: mapToOerBook,
    filters,
    filtersKey,
  });

  const classVault = isSearchActive ? classVaultSearch : classVaultExplore;
  const oerVideos = isSearchActive ? oerVideosSearch : oerVideosExplore;
  const normalCourses = isSearchActive ? normalCoursesSearch : normalCoursesExplore;
  const oerBooks = isSearchActive ? oerBooksSearch : oerBooksExplore;

  return useMemo(
    () => ({
      query: effectiveQuery,
      classVault,
      oerVideos,
      normalCourses,
      oerBooks,
    }),
    [effectiveQuery, classVault, oerVideos, normalCourses, oerBooks]
  );
}
