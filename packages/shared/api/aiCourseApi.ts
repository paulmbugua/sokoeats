// @mytutorapp/shared/api/aiCourseApi.ts

import type {
  TopCourse,
  AiOutlineResponse,
  AiOutlineSection,
  GenerateLessonSSMLResponse,
  Quiz,
  GradeRequest,
  GradeResult,
  CoursePackage,
  LegacySize,
  DbCourseSize,
  AiOutlineRequest,
  AiLessonSSMLRequest,
  AiQuizRequest,
  LessonGateMode,
} from '@mytutorapp/shared/types';

type Jsonish = Record<string, unknown> | Array<unknown> | undefined;

function normalizeBase(url: string) {
  return url?.endsWith('/') ? url.slice(0, -1) : url;
}

function buildHeaders(
  token?: string,
  isJson = true,
  programTrack?: string,
  anonId?: string,
  clientScreen?: string
): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (isJson) h['Content-Type'] = 'application/json';

  // ✅ Only attach Authorization when we have a real token
  const safeToken = typeof token === 'string' ? token.trim() : '';
  const safeAnon = typeof anonId === 'string' ? anonId.trim() : '';
  if (safeAnon) h['X-Anon-Id'] = safeAnon;

  if (safeToken && safeToken.toLowerCase() !== 'null' && safeToken.toLowerCase() !== 'undefined') {
    h['Authorization'] = `Bearer ${safeToken}`;
  }

  // optional: support X-Program-Track if you want header visibility
  if (programTrack && programTrack.trim()) {
    h['X-Program-Track'] = programTrack.trim();
  }
  if (clientScreen && clientScreen.trim()) {
    h['x-client-screen'] = clientScreen.trim();
  }

  return h;
}

// -------------------- Debug switch --------------------
const DBG_AI = ((): boolean => {
  try {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('DBG_AI') === '1';
  } catch {
    return false;
  }
})();

// -------------------- Error class --------------------
export class HttpError extends Error {
  status: number;
  bodyText?: string;
  url?: string;
  retryAfterSec?: number;
  tag?: string;
  constructor(message: string, status: number, extras?: Partial<HttpError>) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    Object.assign(this, extras);
  }
}

// -------------------- Common options --------------------
type CommonOpts = {
  signal?: AbortSignal;
  token?: string;
  programTrack?: string;
  timeoutMs?: number;
  anonId?: string; // ✅ NEW
  clientScreen?: string;
};


export function normalizeLessonGate<
  T extends { mode?: LessonGateMode; lessons?: any[]; joinedSsml?: string },
>(data: T): T & { mode: LessonGateMode } {
  const mode: LessonGateMode = data?.mode === 'notes_only' ? 'notes_only' : 'narration';
  const normalized: any = { ...data, mode };

  if (mode === 'notes_only') {
    normalized.joinedSsml = '';
    if (Array.isArray(normalized.lessons)) {
      normalized.lessons = normalized.lessons.map((l: any) => ({ ...l, ssml: '' }));
    }
  }

  return normalized;
}

// Create a derived AbortSignal that auto-aborts after timeoutMs.
function withTimeoutSignal(
  baseSignal: AbortSignal | undefined,
  timeoutMs: number | undefined
): { signal?: AbortSignal; cancel: () => void } {
  if (!timeoutMs || timeoutMs <= 0) return { signal: baseSignal, cancel: () => {} };

  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();

  // tie parent cancellation
  if (baseSignal) {
    if (baseSignal.aborted) ctrl.abort();
    else baseSignal.addEventListener('abort', onAbort, { once: true });
  }

  // timeout
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  const cancel = () => {
    clearTimeout(timer);
    if (baseSignal) baseSignal.removeEventListener('abort', onAbort as any);
  };

  return { signal: ctrl.signal, cancel };
}

// -------------------- Minimal body meta for logs --------------------
type MinimalReqMeta =
  | {
      outlineLen?: number;
      joinedSsmlBytes?: number;
      courseId?: string;
      level?: string;
      courseSize?: string;
    }
  | undefined;

// -------------------- fetchJson --------------------
async function fetchJson<T>(
  input: RequestInfo,
  init?: RequestInit,
  errorPrefix?: string,
  tagLabel?: string
): Promise<T> {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let res: Response;
  let text = '';
  try {
    res = await fetch(input, init);
    text = await res.text();
  } catch (err: any) {
    // Network/abort errors
    const url =
      typeof input === 'string'
        ? input
        : typeof input === 'object' && input && 'url' in input
          ? (input as any).url
          : '';
    const tag =
      tagLabel ??
      (url.includes('/api/ai/lesson-ssml')
        ? '[api:lesson-ssml]'
        : url.includes('/api/ai/outline')
          ? '[api:outline]'
          : url.includes('/api/ai/quiz')
            ? '[api:quiz]'
            : url.includes('/api/ai/grade')
              ? '[api:grade]'
              : url.includes('/api/ai/cache/clear-course')
                ? '[api:cache-course]'
                : url.includes('/api/ai/cache/clear-top-courses')
                  ? '[api:cache-top]'
                  : url.includes('/api/courses/ai-sandbox')
                    ? '[api:ai-sandbox]'
                    : '[api]');
    throw new HttpError(err?.message || 'Network error', 0, { tag, url });
  }
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    let url = '';
    if (typeof input === 'string') {
      url = input;
    } else if (typeof input === 'object' && input !== null && 'url' in input) {
      url = (input as { url: string }).url;
    }
    const meth = init?.method || 'GET';

    // summarize request body safely (for debugging only)
    let reqBodyMeta: MinimalReqMeta = undefined;
    if (init?.body && typeof init.body === 'string') {
      try {
        const parsed = JSON.parse(init.body) as unknown;
        if (typeof parsed === 'object' && parsed !== null) {
          const o = parsed as Record<string, unknown>;
          const meta: Record<string, unknown> = {};
          if (Array.isArray(o.outline)) meta.outlineLen = o.outline.length;
          if (typeof o.joinedSsml === 'string')
            meta.joinedSsmlBytes = (o.joinedSsml as string).length;
          if (typeof o.courseId === 'string') meta.courseId = o.courseId as string;
          if (typeof o.level === 'string') meta.level = o.level as string;
          if (typeof o.courseSize === 'string') meta.courseSize = o.courseSize as string;
          reqBodyMeta = meta as MinimalReqMeta;
        }
      } catch {
        // ignore parse errors (debug only)
      }
    }

    const tag =
      tagLabel ??
      (url.includes('/api/ai/lesson-ssml')
        ? '[api:lesson-ssml]'
        : url.includes('/api/ai/outline')
          ? '[api:outline]'
          : url.includes('/api/ai/quiz')
            ? '[api:quiz]'
            : url.includes('/api/ai/grade')
              ? '[api:grade]'
              : url.includes('/api/ai/cache/clear-course')
                ? '[api:cache-course]'
                : url.includes('/api/ai/cache/clear-top-courses')
                  ? '[api:cache-top]'
                  : url.includes('/api/courses/ai-sandbox')
                    ? '[api:ai-sandbox]'
                    : '[api]');

    if (DBG_AI) {
      console.log(`${tag} ${meth} ${url}`, {
        status: res.status,
        ms: Math.round(t1 - t0),
        body: reqBodyMeta,
        respBytes: text?.length ?? 0,
      });
    }

    if (!res.ok) {
      // Conditionally log error bodies when debugging
      if (DBG_AI)
        console.error(`${tag} ERROR ${res.status} ${meth} ${url} — body:`, text || '(empty)');
      const retryAfter = Number(res.headers.get('Retry-After') || '');
      const msg = text || res.statusText || `HTTP ${res.status}`;
      throw new HttpError(
        errorPrefix ? `${errorPrefix} (${res.status}): ${msg}` : msg,
        res.status,
        {
          bodyText: text,
          url,
          retryAfterSec: Number.isFinite(retryAfter) ? retryAfter : undefined,
          tag,
        }
      );
    }
  } catch (e) {
    // If our throw above was caught here, rethrow it; otherwise ignore debug errors
    if (e instanceof HttpError) throw e;
  }

  // Gate JSON parse on content-type (fallback: return {} on non-JSON empty responses)
  const ctype = res.headers.get('content-type') || '';
  const looksJson = /\bapplication\/json\b/i.test(ctype);
  if (looksJson) {
    try {
      return text ? (JSON.parse(text) as T) : ({} as T);
    } catch {
      throw new HttpError(
        errorPrefix ? `${errorPrefix}: Invalid JSON` : 'Invalid JSON',
        res.status,
        { bodyText: text }
      );
    }
  }
  return {} as T;
}

/* ────────────────────────────────────────────────────────────
 * GET /api/ai/courses/top
 * ─────────────────────────────────────────────────────────── */
type TopCoursesArg =
  | boolean
  | {
      aiOnly?: boolean;
      limit?: number;
      offset?: number;
    };

export async function fetchTopCourses(
  backendUrl: string,
  arg?: TopCoursesArg
): Promise<TopCourse[]> {
  const base = normalizeBase(backendUrl);

  const aiOnly = typeof arg === 'boolean' ? arg : Boolean(arg?.aiOnly);
  const limit = typeof arg === 'object' && typeof arg.limit === 'number' ? arg.limit : undefined;
  const offset = typeof arg === 'object' && typeof arg.offset === 'number' ? arg.offset : undefined;

  const params = new URLSearchParams();
  if (aiOnly) params.set('aiOnly', '1');
  if (limit) params.set('limit', String(limit));
  if (typeof offset === 'number') params.set('offset', String(offset));

  const qs = params.toString() ? `?${params.toString()}` : '';
  return fetchJson<TopCourse[]>(
    `${base}/api/ai/courses/top${qs}`,
    { method: 'GET', headers: buildHeaders(undefined, false) },
    'Failed to load courses',
    '[api:top-courses]'
  );
}

type TopCoursesMeta = {
  items: TopCourse[];
  total: number | null;
  hasMore: boolean;
  offset: number;
  limit: number;
};

export async function fetchTopCoursesWithMeta(
  backendUrl: string,
  arg?: TopCoursesArg
): Promise<TopCoursesMeta> {
  const base = normalizeBase(backendUrl);
  const aiOnly = typeof arg === 'boolean' ? arg : Boolean(arg?.aiOnly);
  const limit = typeof arg === 'object' && typeof arg.limit === 'number' ? arg.limit : 50;
  const offset = typeof arg === 'object' && typeof arg.offset === 'number' ? arg.offset : 0;

  const params = new URLSearchParams();
  if (aiOnly) params.set('aiOnly', '1');
  if (limit) params.set('limit', String(limit));
  if (typeof offset === 'number') params.set('offset', String(offset));

  const qs = params.toString() ? `?${params.toString()}` : '';
  const url = `${base}/api/ai/courses/top${qs}`;
  const res = await fetch(url, { method: 'GET', headers: buildHeaders(undefined, false) });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new HttpError('Failed to load courses', res.status, { bodyText: text });
  }
  let items: TopCourse[] = [];
  try {
    items = text ? (JSON.parse(text) as TopCourse[]) : [];
  } catch {
    throw new HttpError('Failed to load courses: Invalid JSON', res.status, { bodyText: text });
  }
  const totalRaw = res.headers.get('x-total-ranked');
  const total = totalRaw ? Number(totalRaw) : null;
  const hasMoreHeader = res.headers.get('x-has-more');
  const hasMore =
    hasMoreHeader != null
      ? hasMoreHeader === 'true'
      : total != null
        ? offset + items.length < total
        : false;
  return { items, total: Number.isFinite(total as number) ? total : null, hasMore, offset, limit };
}

/* ────────────────────────────────────────────────────────────
 * POST /api/ai/outline
 * ─────────────────────────────────────────────────────────── */
export async function createOutline(
  backendUrl: string,
  body: AiOutlineRequest,
  opts?: CommonOpts
): Promise<AiOutlineResponse> {
  const base = normalizeBase(backendUrl);
  const headers = buildHeaders(opts?.token, true, opts?.programTrack, opts?.anonId);

  const { signal, cancel } = withTimeoutSignal(opts?.signal, opts?.timeoutMs);
  try {
    return await fetchJson<AiOutlineResponse>(
      `${base}/api/ai/outline`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      },
      'Outline generation failed',
      '[api:outline]'
    );
  } finally {
    cancel();
  }
}

/* ────────────────────────────────────────────────────────────
 * POST /api/ai/lesson-ssml
 * ─────────────────────────────────────────────────────────── */
export async function createLessonSSML(
  backendUrl: string,
  body: AiLessonSSMLRequest,
  opts?: CommonOpts
): Promise<GenerateLessonSSMLResponse> {
  const base = normalizeBase(backendUrl);

  // ✅ PASS anonId into headers
  const headers = buildHeaders(
    opts?.token,
    true,
    opts?.programTrack,
    opts?.anonId,
    opts?.clientScreen
  );

  const { signal, cancel } = withTimeoutSignal(opts?.signal, opts?.timeoutMs);
  try {
    const resp = await fetchJson<GenerateLessonSSMLResponse>(
      `${base}/api/ai/lesson-ssml`,
      {
        method: 'POST',
        headers,
        credentials: 'include',

        // ✅ OPTIONAL but recommended: also send anonId in body (backend already accepts it)
        body: JSON.stringify({ ...body, anonId: opts?.anonId }),

        signal,
      },
      'SSML generation failed',
      '[api:lesson-ssml]'
    );
    return normalizeLessonGate(resp);
  } finally {
    cancel();
  }
}

/* ────────────────────────────────────────────────────────────
 * POST /api/ai/quiz
 * ─────────────────────────────────────────────────────────── */
export async function createQuiz(
  backendUrl: string,
  body: AiQuizRequest,
  opts?: CommonOpts
): Promise<{ quiz: Quiz }> {
  const base = normalizeBase(backendUrl);
  const headers = buildHeaders(opts?.token, true, opts?.programTrack, opts?.anonId);


  const { signal, cancel } = withTimeoutSignal(opts?.signal, opts?.timeoutMs);
  try {
    return await fetchJson<{ quiz: Quiz }>(
      `${base}/api/ai/quiz`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      },
      'Quiz generation failed',
      '[api:quiz]'
    );
  } finally {
    cancel();
  }
}

/* ────────────────────────────────────────────────────────────
 * POST /api/ai/grade (auth)
 * ─────────────────────────────────────────────────────────── */
export async function gradeQuizApi(
  backendUrl: string,
  token: string,
  payload: GradeRequest,
  opts?: { signal?: AbortSignal; timeoutMs?: number } // no programTrack needed
): Promise<GradeResult> {
  const base = normalizeBase(backendUrl);
  const headers = buildHeaders(token, true);

  const { signal, cancel } = withTimeoutSignal(opts?.signal, opts?.timeoutMs);
  try {
    return await fetchJson<GradeResult>(
      `${base}/api/ai/grade`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal,
      },
      'Grading failed',
      '[api:grade]'
    );
  } finally {
    cancel();
  }
}

/* ────────────────────────────────────────────────────────────
 * POST /api/ai/course-package
 * ─────────────────────────────────────────────────────────── */
export async function createCoursePackage(
  backendUrl: string,
  body: {
    courseId: string;
    level?: 'beginner' | 'intermediate' | 'advanced';
    targetMinutes?: number;
    voiceName?: string;
    numQuestions?: number;
    size?: LegacySize;
    courseSize?: DbCourseSize;
    paragraphs?: number;
    sentencesPerParagraph?: number;
  },
  opts?: CommonOpts
): Promise<CoursePackage> {
  const base = normalizeBase(backendUrl);
  const headers = buildHeaders(opts?.token, true, opts?.programTrack, opts?.anonId);


  const { signal, cancel } = withTimeoutSignal(opts?.signal, opts?.timeoutMs);
  try {
    return await fetchJson<CoursePackage>(
      `${base}/api/ai/course-package`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body as Jsonish),
        signal,
      },
      'Course package generation failed',
      '[api:course-package]'
    );
  } finally {
    cancel();
  }
}

/* ────────────────────────────────────────────────────────────
 * POST /api/courses/ai-sandbox
 * ─────────────────────────────────────────────────────────── */
// reuse your existing CommonOpts type above
// type CommonOpts = { signal?: AbortSignal; token?: string; programTrack?: string; timeoutMs?: number; };

export async function createAiSandboxCourse(
  backendUrl: string,
  titleOrInit:
    | string
    | {
        title: string;
        courseSize?: DbCourseSize;
        size?: LegacySize;
        minutes?: number;
        assignmentId?: string;
      },
  opts?: CommonOpts
): Promise<{ id: string; title: string; description?: string }> {
  const base = normalizeBase(backendUrl);

  const body =
    typeof titleOrInit === 'string'
      ? { title: titleOrInit }
      : {
          title: titleOrInit.title,
          courseSize: titleOrInit.courseSize,
          size: titleOrInit.size,
          minutes: titleOrInit.minutes,
          assignmentId: titleOrInit.assignmentId,
        };

  const headers = buildHeaders(opts?.token, true, opts?.programTrack);

  const { signal, cancel } = withTimeoutSignal(opts?.signal, opts?.timeoutMs);

  try {
    return await fetchJson<{ id: string; title: string; description?: string }>(
      `${base}/api/courses/ai-sandbox`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      },
      'Failed to create AI course',
      '[api:ai-sandbox]'
    );
  } finally {
    cancel();
  }
}

/* ────────────────────────────────────────────────────────────
 * POST /api/ai/cache/clear-course
 * POST /api/ai/cache/clear-top-courses
 * (Cache admin helpers)
 * ─────────────────────────────────────────────────────────── */
export async function clearCourseCache(
  backendUrl: string,
  courseId: string,
  opts?: { signal?: AbortSignal; token?: string; timeoutMs?: number }
): Promise<{ removed: number }> {
  const base = normalizeBase(backendUrl);
  const { signal, cancel } = withTimeoutSignal(opts?.signal, opts?.timeoutMs);
  try {
    return await fetchJson<{ removed: number }>(
      `${base}/api/ai/cache/clear-course`,
      {
        method: 'POST',
        headers: buildHeaders(opts?.token, true),
        body: JSON.stringify({ courseId }),
        signal,
      },
      'Failed to clear course cache',
      '[api:cache-course]'
    );
  } finally {
    cancel();
  }
}

export async function clearTopCoursesCache(
  backendUrl: string,
  opts?: { signal?: AbortSignal; token?: string; timeoutMs?: number }
): Promise<{ removed: number }> {
  const base = normalizeBase(backendUrl);
  const { signal, cancel } = withTimeoutSignal(opts?.signal, opts?.timeoutMs);
  try {
    return await fetchJson<{ removed: number }>(
      `${base}/api/ai/cache/clear-top-courses`,
      {
        method: 'POST',
        headers: buildHeaders(opts?.token, true),
        body: JSON.stringify({}), // explicit empty payload
        signal,
      },
      'Failed to clear top courses cache',
      '[api:cache-top]'
    );
  } finally {
    cancel();
  }
}
