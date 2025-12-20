import { useCallback, useEffect, useMemo, useState } from 'react';
import type { OerCatalogItem, OerMeta, Course } from '@mytutorapp/shared/types';
import { useShopContext } from '@mytutorapp/shared/context';
import {
  fetchOerCatalog,
  wrapOerItem,
  fetchOerMeta,
  fetchOerCourses,
  fetchOerCourse,
  wrapOerBook,
} from '@mytutorapp/shared/api/oerApi';

/* ----------------------------------------------------------------------------
 * Catalog (flat items)
 * ------------------------------------------------------------------------- */

export function useOerCatalog(opts?: {
  type?: 'video' | 'text';
  subject?: string;
  provider?: string;
  limit?: number;
  offset?: number;
}) {
  const { backendUrl, token } = useShopContext();
  const [items, setItems] = useState<OerCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setErr] = useState<string>('');

  const params = useMemo(
    () => ({
      baseUrl: backendUrl,
      token,
      type: opts?.type,
      subject: opts?.subject,
      provider: opts?.provider,
      limit: opts?.limit,
      offset: opts?.offset,
    }),
    [backendUrl, token, opts?.type, opts?.subject, opts?.provider, opts?.limit, opts?.offset]
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await fetchOerCatalog(params);
      setItems(data);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load OER catalog');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, loading, error, reload };
}

export function useWrapOer() {
  const { backendUrl, token } = useShopContext();

  const wrap = useCallback(
    async (slug: string) => {
      return wrapOerItem({ baseUrl: backendUrl, token, slug });
    },
    [backendUrl, token]
  );

  return { wrap };
}

export function useOerMeta(courseId?: string) {
  const { backendUrl, token } = useShopContext();
  const [meta, setMeta] = useState<OerMeta>(null);

  useEffect(() => {
    if (!courseId) return;
    (async () => {
      try {
        const m = await fetchOerMeta({ baseUrl: backendUrl, token, courseId });
        setMeta(m);
      } catch {
        setMeta(null);
      }
    })();
  }, [backendUrl, token, courseId]);

  return meta;
}

/* ----------------------------------------------------------------------------
 * OER "Courses" (free courses derived from collections)
 * ------------------------------------------------------------------------- */

export function useOerCourses(opts?: { limit?: number; offset?: number; subject?: string }) {
  const { backendUrl } = useShopContext();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setErr] = useState<string>('');

  const params = useMemo(
    () => ({
      baseUrl: backendUrl,
      limit: opts?.limit,
      offset: opts?.offset,
      subject: opts?.subject,
    }),
    [backendUrl, opts?.limit, opts?.offset, opts?.subject]
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await fetchOerCourses(params);
      setCourses(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load free courses');
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { courses, loading, error, reload };
}

export function useOerCourse(idOrTitle?: string) {
  const { backendUrl } = useShopContext();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setErr] = useState<string>('');

  const reload = useCallback(async () => {
    if (!idOrTitle) return;
    setLoading(true);
    setErr('');
    try {
      const data = await fetchOerCourse({ baseUrl: backendUrl, idOrTitle });
      setCourse(data);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load course');
      setCourse(null);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, idOrTitle]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { course, loading, error, reload };
}

export function useWrapOerBook() {
  const { backendUrl, token } = useShopContext();
  return {
    wrapBook: useCallback(
      (idOrSlug: string) => {
        return wrapOerBook({ baseUrl: backendUrl, token, idOrSlug });
      },
      [backendUrl, token]
    ),
  };
}
