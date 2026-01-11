import { useEffect, useMemo, useState } from 'react';
import { fetchTopCoursesWithMeta } from '../api/aiCourseApi';
import type { TopCourse } from '../types';

type UseTopCoursesArgs = {
  backendUrl?: string;
  page: number;
  pageSize: number;
  aiOnly?: boolean;
  enabled?: boolean;
};

export type TopCoursesResult = {
  items: TopCourse[];
  total: number | null;
  page: number;
  pageSize: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
};

export function useTopCourses({
  backendUrl,
  page,
  pageSize,
  aiOnly = false,
  enabled = true,
}: UseTopCoursesArgs): TopCoursesResult {
  const [items, setItems] = useState<TopCourse[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);

  useEffect(() => {
    if (!backendUrl || !enabled) {
      setItems([]);
      setTotal(null);
      setHasMore(false);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const offset = (safePage - 1) * safePageSize;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchTopCoursesWithMeta(backendUrl, {
          aiOnly,
          limit: safePageSize,
          offset,
        });
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
        setHasMore(res.hasMore);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || 'Failed to load top courses');
        setItems([]);
        setTotal(null);
        setHasMore(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [backendUrl, safePage, safePageSize, aiOnly, enabled]);

  return useMemo(
    () => ({
      items,
      total,
      page: safePage,
      pageSize: safePageSize,
      hasMore,
      loading,
      error,
    }),
    [items, total, safePage, safePageSize, hasMore, loading, error]
  );
}
