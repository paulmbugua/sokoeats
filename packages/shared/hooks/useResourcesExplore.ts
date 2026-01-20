import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useShopContext } from '@mytutorapp/shared/context';
import type { Course, RecordedVideo, ResourceCategoryResult, UnifiedSearchResult } from '@mytutorapp/shared/types';
import type { OerBookItem, OerVideoItem } from '@mytutorapp/shared/api/resourcesApi';
import {
  fetchClassVaultExplore,
  fetchExploreCourses,
  fetchOerBooksExplore,
  fetchOerVideosExplore,
} from '@mytutorapp/shared/api/resourcesApi';
import { unifiedSearchApi } from '@mytutorapp/shared/api/searchApi';

const DEFAULT_LIMIT = 12;

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
  kinds: string[];
  primaryKind: string;
  filter?: (item: UnifiedSearchResult) => boolean;
  map: (item: UnifiedSearchResult) => T;
};

function isAbortError(err: any) {
  return err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' || axios.isCancel(err);
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

  const fetchPage = useCallback(
    async (nextOffset: number, replace: boolean) => {
      if (!enabled) return;
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const resp = await fetcher({ limit, offset: nextOffset });
        if (requestId !== requestIdRef.current) return;
        setItems((prev) => (replace ? resp.items : prev.concat(resp.items)));
        setTotal(resp.total ?? 0);
        setOffset(nextOffset + resp.items.length);
      } catch (err: any) {
        if (requestId !== requestIdRef.current) return;
        const msg = err?.message ? String(err.message) : 'Failed to load';
        setError(msg);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [enabled, fetcher, limit]
  );

  const refresh = useCallback(() => {
    if (!enabled) return;
    setItems([]);
    setTotal(0);
    setOffset(0);
    void fetchPage(0, true);
  }, [enabled, fetchPage]);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setTotal(0);
      setOffset(0);
      setLoading(false);
      setError(null);
      return;
    }
    refresh();
    return () => {
      requestIdRef.current += 1;
    };
  }, [enabled, refresh, ...deps]);

  const hasMore = items.length < total;
  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    void fetchPage(offset, false);
  }, [fetchPage, hasMore, loading, offset]);

  return { items, total, loading, error, hasMore, loadMore, refresh };
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
  } = opts;

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

      try {
        const resp = await unifiedSearchApi(
          backendUrl,
          {
            q: query,
            kinds: kinds.join(','),
            limit,
            offset: nextOffset,
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

        const countByKind = Number(meta?.countsByKind?.[primaryKind] ?? 0);
        setTotal((prev) => Math.max(prev, countByKind, nextOffsetValue));
        setHasMore(rawItems.length === limit);
      } catch (err: any) {
        if (isAbortError(err)) return;
        const msg = err?.message ? String(err.message) : 'Failed to search';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [abortCurrent, backendUrl, enabled, kinds, limit, map, primaryKind, query, token, filter]
  );

  const refresh = useCallback(() => {
    if (!enabled) return;
    setItems([]);
    setTotal(0);
    setOffset(0);
    void fetchPage(0, true);
  }, [enabled, fetchPage]);

  useEffect(() => {
    if (!enabled) {
      abortCurrent();
      setLoading(false);
      setError(null);
      return;
    }
    refresh();
    return () => abortCurrent();
  }, [abortCurrent, enabled, query, refresh]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    void fetchPage(offset, false);
  }, [fetchPage, hasMore, loading, offset]);

  return { items, total, loading, error, hasMore, loadMore, refresh };
}

export function useResourcesExplore(query: string, activeTab: TabKey = 'videos') {
  const { backendUrl, token } = useShopContext();
  const cleanedQuery = query.trim();
  const enabled = Boolean(backendUrl);
  const isSearchActive = cleanedQuery.length > 0;

  const classVaultExplore = usePaginatedSection<RecordedVideo>(
    ({ limit, offset }) =>
      fetchClassVaultExplore(backendUrl, { limit, offset, q: cleanedQuery || undefined }),
    [backendUrl, cleanedQuery],
    { enabled: enabled && !isSearchActive }
  );

  const oerVideosExplore = usePaginatedSection<OerVideoItem>(
    ({ limit, offset }) =>
      fetchOerVideosExplore(backendUrl, { limit, offset, q: cleanedQuery || undefined }),
    [backendUrl, cleanedQuery],
    { enabled: enabled && !isSearchActive }
  );

  const normalCoursesExplore = usePaginatedSection<Course>(
    ({ limit, offset }) =>
      fetchExploreCourses(backendUrl, { limit, offset, q: cleanedQuery || undefined }),
    [backendUrl, cleanedQuery],
    { enabled: enabled && !isSearchActive }
  );

  const oerBooksExplore = usePaginatedSection<OerBookItem>(
    ({ limit, offset }) =>
      fetchOerBooksExplore(backendUrl, { limit, offset, q: cleanedQuery || undefined }),
    [backendUrl, cleanedQuery],
    { enabled: enabled && !isSearchActive }
  );

  const classVaultSearch = useUnifiedCategory<RecordedVideo>({
    enabled: enabled && isSearchActive && activeTab === 'videos',
    backendUrl,
    token,
    query: cleanedQuery,
    kinds: ['classvault_market'],
    primaryKind: 'classvault_market',
    map: mapToRecordedVideo,
  });

  const oerVideosSearch = useUnifiedCategory<OerVideoItem>({
    enabled: enabled && isSearchActive && activeTab === 'videos',
    backendUrl,
    token,
    query: cleanedQuery,
    kinds: ['oer_video'],
    primaryKind: 'oer_video',
    map: mapToOerVideo,
  });

  const normalCoursesSearch = useUnifiedCategory<Course>({
    enabled: enabled && isSearchActive && activeTab === 'courses',
    backendUrl,
    token,
    query: cleanedQuery,
    kinds: ['course'],
    primaryKind: 'course',
    map: mapToCourse,
  });

  const oerBooksSearch = useUnifiedCategory<OerBookItem>({
    enabled: enabled && isSearchActive && activeTab === 'courses',
    backendUrl,
    token,
    query: cleanedQuery,
    kinds: ['oer_course'],
    primaryKind: 'oer_course',
    filter: isOerBookResult,
    map: mapToOerBook,
  });

  const classVault = isSearchActive ? classVaultSearch : classVaultExplore;
  const oerVideos = isSearchActive ? oerVideosSearch : oerVideosExplore;
  const normalCourses = isSearchActive ? normalCoursesSearch : normalCoursesExplore;
  const oerBooks = isSearchActive ? oerBooksSearch : oerBooksExplore;

  return useMemo(
    () => ({
      query: cleanedQuery,
      classVault,
      oerVideos,
      normalCourses,
      oerBooks,
    }),
    [cleanedQuery, classVault, oerVideos, normalCourses, oerBooks]
  );
}
