import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';
import type { Course, RecordedVideo, ResourceCategoryResult } from '@mytutorapp/shared/types';
import {
  fetchCreatedClassVault,
  fetchPurchasedClassVault,
  fetchTutorCoursesPaged,
  fetchUnlockedCourses,
} from '@mytutorapp/shared/api/libraryApi';

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

  // always keep latest fetcher (without re-triggering effects)
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
    // invalidate any in-flight request
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

    // initial / deps change
    void fetchPage(0, true);

    return () => {
      requestIdRef.current += 1;
    };
    // ✅ refresh removed from deps to avoid identity loops
  }, [enabled, limit, fetchPage, ...deps]);

  const hasMore = items.length < total;

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    void fetchPage(offset, false);
  }, [fetchPage, hasMore, loading, offset]);

  // ✅ memoize returned object to reduce downstream rerenders
  return useMemo(
    () => ({ items, total, loading, error, hasMore, loadMore, refresh }),
    [items, total, loading, error, hasMore, loadMore, refresh]
  );
}


export function useMyLibrary() {
  const { backendUrl, token, role, profile } = useShopContext();
  const normalizedRole = String(profile?.role || role || 'student').toLowerCase();
  const isTutor = normalizedRole === 'tutor';
  const isStudent = !isTutor;
  const ready = Boolean(backendUrl && token);

  const purchasedFetcher = useCallback(
    ({ limit, offset }: { limit: number; offset: number }) =>
      fetchPurchasedClassVault(backendUrl, token!, { limit, offset }),
    [backendUrl, token]
  );

  const createdFetcher = useCallback(
    ({ limit, offset }: { limit: number; offset: number }) =>
      fetchCreatedClassVault(backendUrl, token!, { limit, offset }),
    [backendUrl, token]
  );

  const aiFetcher = useCallback(
    ({ limit, offset }: { limit: number; offset: number }) =>
      fetchUnlockedCourses(backendUrl, token!, { limit, offset, ai: true }),
    [backendUrl, token]
  );

  const normalFetcher = useCallback(
    ({ limit, offset }: { limit: number; offset: number }) =>
      isTutor
        ? fetchTutorCoursesPaged(backendUrl, token!, { limit, offset })
        : fetchUnlockedCourses(backendUrl, token!, { limit, offset, ai: false }),
    [backendUrl, token, isTutor]
  );

  const purchasedClassVault = usePaginatedSection<RecordedVideo>(
    purchasedFetcher,
    [backendUrl, token],
    { enabled: ready && isStudent }
  );

  const createdClassVault = usePaginatedSection<RecordedVideo>(
    createdFetcher,
    [backendUrl, token],
    { enabled: ready && isTutor }
  );

  const aiCourses = usePaginatedSection<Course>(
    aiFetcher,
    [backendUrl, token],
    { enabled: ready }
  );

  const normalCourses = usePaginatedSection<Course>(
    normalFetcher,
    [backendUrl, token, isTutor],
    { enabled: ready }
  );

  return useMemo(
    () => ({
      role: normalizedRole,
      isTutor,
      isStudent,
      sections: { purchasedClassVault, createdClassVault, aiCourses, normalCourses },
    }),
    [normalizedRole, isTutor, isStudent, purchasedClassVault, createdClassVault, aiCourses, normalCourses]
  );
}
