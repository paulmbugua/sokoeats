// packages/shared/hooks/useOrgAssignment.ts
import { useEffect, useMemo, useState } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';

type LockedConfig = {
  minutes?: number;
  totalLessons?: number;
  quizSize?: number;
  [k: string]: unknown;
};

type AttemptMeta = {
  attemptId: string;
  assignmentId: string;
  courseId: string;

  // ✅ NEW (backend may already send them; we just surface)
  title_override?: string | null;
  course_title?: string | null;
  assignment_title?: string | null;

  locked_config: LockedConfig | null;
  passMark: number;
  timer_s: number;
  due_at: string | null;
  status: 'active' | 'expired' | 'submitted' | string;
  org_id: string;
};

type OrgAssignmentOptions = {
  /** Pass route params (RN) or explicitly override values */
  params?: Partial<
    Record<'assignmentId' | 'attemptId' | 'lock', string | number | boolean | null | undefined>
  >;
  /** Raw search string if you have it (web): e.g., "?assignmentId=123&attemptId=abc&lock=1" */
  search?: string;
};

function getParamFromOptions(
  name: 'assignmentId' | 'attemptId' | 'lock',
  opts?: OrgAssignmentOptions,
): string | null {
  // 1) Highest priority: explicit params
  const pVal = opts?.params?.[name];
  if (pVal !== undefined && pVal !== null) return String(pVal);

  // 2) Next: explicit search string
  if (opts?.search) {
    const sp = new URLSearchParams(opts.search.startsWith('?') ? opts.search : `?${opts.search}`);
    return sp.get(name);
  }

  // 3) Fallback: browser URL if available (safe in SSR/RN)
  try {
    if (typeof window !== 'undefined' && window?.location?.search) {
      const sp = new URLSearchParams(window.location.search);
      return sp.get(name);
    }
  } catch {
    // ignore
  }

  return null;
}

const DBG = (() => {
  try {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('DBG_SHARE') === '1' || localStorage.getItem('DBG_ORG') === '1';
  } catch {
    return false;
  }
})();

export function useOrgAssignment(options?: OrgAssignmentOptions) {
  const assignmentIdQ = getParamFromOptions('assignmentId', options) || '';
  const attemptIdQ = getParamFromOptions('attemptId', options) || '';
  const lockQ = getParamFromOptions('lock', options);
  const lockFlag = lockQ === '1' || lockQ === 'true';

  // ✅ Use orgToken everywhere for org assignment meta fetch
  const { backendUrl, orgToken } = useShopContext() as any;

  const [meta, setMeta] = useState<AttemptMeta | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // fetch meta once we have (attemptId OR assignmentId) + orgToken
  useEffect(() => {
    let aborted = false;

    (async () => {
      if (!orgToken) {
        setMeta(null);
        setRemainingMs(0);
        return;
      }
      if (!attemptIdQ && !assignmentIdQ) {
        setMeta(null);
        setRemainingMs(0);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const url = attemptIdQ
          ? `${backendUrl}/api/orgs/attempts/${encodeURIComponent(attemptIdQ)}/meta`
          : `${backendUrl}/api/orgs/assignments/${encodeURIComponent(assignmentIdQ)}/mine`;

        const r = await fetch(url, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${orgToken}`,
          },
        });

        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        const data = await r.json();
        if (aborted) return;

        const m: AttemptMeta | null = data?.meta || null;
        setMeta(m);

        // seed timer immediately
        const due = m?.due_at ? new Date(m.due_at).getTime() : 0;
        setRemainingMs(due ? Math.max(0, due - Date.now()) : 0);

        if (DBG) {
          console.log('[useOrgAssignment] meta loaded', {
            assignmentIdQ,
            attemptIdQ,
            courseId: m?.courseId,
            title_override: (m as any)?.title_override,
            course_title: (m as any)?.course_title,
            assignment_title: (m as any)?.assignment_title,
            metaKeys: m ? Object.keys(m as any) : [],
          });
        }
      } catch (e: any) {
        if (!aborted) setError(e?.message || 'Failed to load assignment');
      } finally {
        if (!aborted) setLoading(false);
      }
    })();

    return () => {
      aborted = true;
    };
  }, [attemptIdQ, assignmentIdQ, backendUrl, orgToken]);

  // tick remaining time
  useEffect(() => {
    if (!meta?.due_at) return;
    const due = new Date(meta.due_at).getTime();

    const tick = () => setRemainingMs(Math.max(0, due - Date.now()));
    tick();

    const id = globalThis.setInterval ? globalThis.setInterval(tick, 1000) : setInterval(tick, 1000);
    return () =>
      globalThis.clearInterval ? globalThis.clearInterval(id as any) : clearInterval(id as any);
  }, [meta?.due_at]);

  const expired = useMemo(() => remainingMs <= 0 && !!meta?.due_at, [remainingMs, meta?.due_at]);

  return {
    // ids & flags
    assignmentId: meta?.assignmentId || assignmentIdQ || null,
    attemptId: meta?.attemptId || attemptIdQ || null,
    courseId: meta?.courseId || null,

    // ✅ surface title fields
    titleOverride: (meta as any)?.title_override ?? null,
    courseTitle: (meta as any)?.course_title ?? null,
    assignmentTitle: (meta as any)?.assignment_title ?? null,

    locked: lockFlag || Boolean(assignmentIdQ || attemptIdQ),

    // meta for locking UI + generation
    lockedConfig: (meta?.locked_config || null) as LockedConfig | null,
    passMark: meta?.passMark ?? null,
    timerS: meta?.timer_s ?? null,
    dueAt: meta?.due_at ?? null,
    status: meta?.status ?? null,

    // timer state
    remainingMs,
    expired,

    // raw + load state
    meta,
    loading,
    error,
  };
}
