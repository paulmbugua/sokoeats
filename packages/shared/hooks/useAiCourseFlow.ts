// packages/shared/hooks/useAiCourseFlow.ts
import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  fetchTopCourses,
  createOutline,
  createQuiz,
  gradeQuizApi,
  createAiSandboxCourse,
  createLessonSSML,
  clearCourseCache,
  clearTopCoursesCache,
} from '../api/aiCourseApi';
import { useRobotSpeaker } from './useRobotSpeaker';
import { buildGradePayload } from '../utils/buildGradePayload';
import { useTtsQueue } from './useTtsQueue';

import {
  getEligibility as certGetEligibility,
  generateCertificate as certGenerate,
} from '@mytutorapp/shared/api';

import type {
  Certificate,
  TopCourse,
  AiOutlineSection,
  Quiz,
  GradeResult,
  AILesson,
  ProgramTrack,
  AiOutlineRequest,
  AiQuizRequest,
  DbCourseSize,
  AiOutlineResponse,
  LessonGateMode,
  LessonGateNotice,
  LessonGateUsage,
} from '@mytutorapp/shared/types';

export type StartState =
  | 'idle'
  | 'outlining'
  | 'narrating'
  | 'ready'
  | 'quizzing'
  | 'graded'
  | 'error';

type LoadTopOptions = {
  limit?: number;
  append?: boolean;
  cursor?: string | null;
  page?: 'next' | 'prev' | number | string;
  aiOnly?: boolean;
  preserveIds?: string[];
  offset?: number;
};

type CourseSize = DbCourseSize;

type FlowHints = {
  orgQuizType?: 'mcq' | 'short';
  urlQuizTypeHint?: 'mcq' | 'short';
  defaultQuizType?: 'mcq' | 'short';
  clientScreen?: string;
};

// Keep a light “lesson” shape compatible with API responses
type LessonLite = {
  id: string;
  title?: string;
  ssml: string;
  markdown?: string;
  formulas?: any[];
  tables?: any[];
  images?: any[];
  charts?: any[];
  snippets?: any[];
};

// ---------- config/constants ----------
const MAX_RETRIES = 3;

const DBG = (() => {
  try {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('DBG_AI') === '1';
  } catch {
    return false;
  }
})();

const SIZE_PRESETS: Record<
  CourseSize,
  { minutes: number; paragraphs: number; sentencesPerParagraph: number; finalQuizSize: number }
> = {
  mini: { minutes: 12, paragraphs: 8, sentencesPerParagraph: 2, finalQuizSize: 4 },
  standard: { minutes: 25, paragraphs: 10, sentencesPerParagraph: 2, finalQuizSize: 6 },
  extended: { minutes: 32, paragraphs: 12, sentencesPerParagraph: 2, finalQuizSize: 8 },
  deep_dive: { minutes: 45, paragraphs: 14, sentencesPerParagraph: 2, finalQuizSize: 10 },
  bootcamp: { minutes: 60, paragraphs: 16, sentencesPerParagraph: 2, finalQuizSize: 12 },
};

type RetryableError = {
  headers?: Record<string, string | number | undefined>;
  retryAfter?: number;
  retryAfterSec?: number;
  status?: number;
  code?: number;
  message?: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function parseRetryAfter(e: RetryableError, fallbackMs: number) {
  const hdr =
    e?.headers?.['retry-after'] ?? e?.headers?.['Retry-After'] ?? e?.retryAfter ?? e?.retryAfterSec;
  if (typeof hdr === 'number') {
    const seconds = hdr > 1000 ? hdr / 1000 : hdr;
    return Math.max(250, Math.round(seconds * 1000));
  }
  if (typeof hdr === 'string') {
    const n = Number(hdr.trim());
    if (!Number.isNaN(n)) return Math.max(250, Math.round(n * 1000));
  }
  return fallbackMs;
}
function getStatusCode(err: unknown): number {
  const e = err as Partial<RetryableError>;
  return typeof e.status === 'number'
    ? e.status
    : typeof e.code === 'number'
      ? (e.code as number)
      : 0;
}
function getMessage(err: unknown): string | undefined {
  return (err as { message?: string })?.message;
}

function parseLessonCapMessage(err: unknown): string | null {
  const status = getStatusCode(err);
  if (status !== 409) return null;

  const bodyText = (err as any)?.bodyText;
  if (typeof bodyText === 'string' && bodyText.trim()) {
    try {
      const parsed = JSON.parse(bodyText);
      if (parsed?.error === 'LESSON_CAP_REACHED') {
        return parsed?.message || 'Lesson limit reached (60).';
      }
    } catch {
      if (bodyText.toLowerCase().includes('lesson limit')) return bodyText;
    }
  }

  const msg = getMessage(err);
  if (msg && msg.toLowerCase().includes('lesson limit')) return msg;

  return 'Lesson limit reached (60).';
}

function getOrCreateAnonId(): string {
  const key = 'ANON_ID';
  try {
    if (typeof window !== 'undefined' && window?.localStorage) {
      const existing = localStorage.getItem(key);
      if (existing && existing.trim()) return existing.trim();

      const fresh = `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(key, fresh);
      return fresh;
    }
  } catch {}

  // RN / no localStorage: per-run fallback (still works, but resets on restart)
  return `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}


// ---------- defaults (declare BEFORE any usage) ----------
const DEFAULT_SIZE = {
  level: 'beginner' as const,
  courseSize: ((): CourseSize => {
    try {
      return (localStorage.getItem('AI_COURSE_SIZE') as CourseSize) || 'mini';
    } catch {
      return 'mini';
    }
  })(),
  voiceName: 'en-US-JennyNeural',
};

export function useAiCourse(backendUrl: string, authToken?: string, flowHints?: FlowHints) {
  const [topCourses, setTopCourses] = useState<TopCourse[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<TopCourse | null>(null);
  const [outline, setOutline] = useState<AiOutlineSection[]>([]);
  const token = authToken;
  // We’ll still expose `lessons` for UI lists, and grow it as each lesson is built
  const [lessons, setLessons] = useState<AILesson[]>([]);
  const [currentLessonIndex, setCurrentLessonIndex] = useState<number>(0);
  const [joinedSsml, setJoinedSsml] = useState<string>('');
  const [ssml, setSsml] = useState<string>('');
  const anonId = useMemo(() => getOrCreateAnonId(), []);

  const { clear: clearQueue, playNext } = useTtsQueue((next) => {
    if (next?.trim()) setSsml(next);
  });

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [grade, setGrade] = useState<GradeResult | null>(null);

  const [step, setStep] = useState<StartState>('idle');
  const [error, setError] = useState<string | null>(null);

  const [degradedNotice, setDegradedNotice] = useState<{
    degraded: boolean;
    reason: string;
  } | null>(null);
  const [gateMode, setGateMode] = useState<LessonGateMode>('narration');
  const [gateNotice, setGateNotice] = useState<LessonGateNotice | null>(null);
  const [gateUsage, setGateUsage] = useState<LessonGateUsage[]>([]);
  const [entitlementUsage, setEntitlementUsage] = useState<
    { used: number; max: number } | null
  >(null);
  const [certificate, setCertificate] = useState<Certificate | null>(null);

  const [hasMoreCourses, setHasMoreCourses] = useState<boolean>(false);
  const [coursesCursor, setCoursesCursor] = useState<string | null>(null);

  const { reset: resetTts, loading: ttsLoading, error: ttsError } = useRobotSpeaker();

  // Track/abort a single “run” of outline+lessons generation
  const runIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const assignmentIdRef = useRef<string | null>(null);
  // Per-index lesson cache + in-flight dedupe
  const lessonCacheRef = useRef<Map<number, LessonLite>>(new Map());
  const inflightLessonsRef = useRef<Map<number, Promise<LessonLite>>>(new Map());

  // Prefetcher knobs
  const lastVoiceRef = useRef(DEFAULT_SIZE.voiceName);
  const lastSizeRef = useRef<CourseSize>(DEFAULT_SIZE.courseSize);

  // Outline ref for cheap access
  const outlineRef = useRef<AiOutlineSection[]>([]);
  useEffect(() => {
    outlineRef.current = outline;
  }, [outline]);

  // cleanup
  useEffect(() => {
    return () => {
      try {
        abortRef.current?.abort('unmount');
      } catch {}
    };
  }, []);

  // ---------- Top courses (with pagination) ----------
  const loadTopCourses = useCallback(
    async (opts?: LoadTopOptions) => {
      const { aiOnly = false } = opts || {};
      setError(null);
      try {
        const raw: any = await fetchTopCourses(backendUrl, {
          aiOnly,
          limit: opts?.limit,
          cursor: opts?.cursor,
          page: opts?.page,
          offset: opts?.offset,
        } as any);

        const rows: TopCourse[] = Array.isArray(raw)
          ? raw
          : ((raw?.rows as TopCourse[]) ??
            (raw?.courses as TopCourse[]) ??
            (raw?.data as TopCourse[]) ??
            []);

        const hasMoreFlag = raw?.hasMore ?? raw?.has_more ?? raw?.hasNext;
        const cursorPresent = raw?.nextCursor != null || typeof raw?.next_cursor !== 'undefined';
        const normalizedHasMore: boolean = Boolean(hasMoreFlag ?? cursorPresent) && rows.length > 0;
        const normalizedCursor: string | null =
          raw?.nextCursor ?? raw?.next_cursor ?? raw?.cursor ?? null;

        const isSandbox = (t: TopCourse) => {
          const title = (t.title || '').toLowerCase();
          const blurb = (t.blurb || '').toLowerCase();
          return (
            blurb.startsWith('ai sandbox course for:') || title.startsWith('ai sandbox course for:')
          );
        };

        const keep = new Set(opts?.preserveIds || []);
        const incoming = rows.filter((r) => !isSandbox(r) || keep.has(r.id));

        setTopCourses((prev) => {
          const merged = opts?.append ? [...prev, ...incoming] : incoming;
          const seen = new Set<string>();
          const deduped = merged.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
          deduped.sort((a, b) =>
            (a.title || '').localeCompare(b.title || '', undefined, {
              sensitivity: 'base',
              numeric: true,
            })
          );
          return deduped;
        });

        setHasMoreCourses(Boolean(normalizedHasMore));
        setCoursesCursor(normalizedCursor);

        if (DBG)
          console.info('[ai] top courses', {
            count: rows.length,
            append: !!opts?.append,
            hasMore: normalizedHasMore,
            nextCursor: normalizedCursor,
          });
      } catch (e: unknown) {
        setError(getMessage(e) || 'Failed to load courses');
        if (DBG) console.warn('[ai] fetchTopCourses failed', e);
        throw e;
      }
    },
    [backendUrl]
  );

  // Reset EVERYTHING on course switch
  const selectCourse = useCallback(
    (course: TopCourse | null) => {
      try {
        abortRef.current?.abort('switch-course');
      } catch {}
      abortRef.current = null;
      runIdRef.current++;
      assignmentIdRef.current = null;
      setSelectedCourse(course);

      // clear old state & caches
      setOutline([]);
      outlineRef.current = [];
      setLessons([]);
      lessonCacheRef.current.clear();
      inflightLessonsRef.current.clear();

      setCurrentLessonIndex(0);
      setJoinedSsml('');
      setSsml('');
      clearQueue();
      setQuiz(null);
      setAnswers({});
      setGrade(null);
      setCertificate(null);
      setEntitlementUsage(null);
      setDegradedNotice(null);
      resetTts();
      setStep('idle');
      setError(null);

      if (DBG) console.info('[ai] selectCourse', { courseId: course?.id || null });
    },
    [resetTts, clearQueue]
  );

  // “Authoritative” player index for current lesson
  const [currentIdx, setCurrentIdx] = useState(0);

  // Keep legacy index in sync for UI compatibility
  useEffect(() => setCurrentLessonIndex(currentIdx), [currentIdx]);

  // Derive current lesson from the cache for convenience (also updates when currentIdx changes)
  const currentLesson = useMemo<AILesson | null>(() => {
    const L = lessonCacheRef.current.get(currentIdx) as AILesson | undefined;
    return L ?? null;
  }, [currentIdx, lessons.length]);

  // Keep `ssml` in sync whenever currentIdx changes and we have the lesson
  useEffect(() => {
    const L = lessonCacheRef.current.get(currentIdx);
    if (L?.ssml) setSsml(L.ssml);
  }, [currentIdx, lessons.length]);

  // Simple nav booleans from outline length
  const hasPrevLesson = useMemo(() => currentIdx > 0, [currentIdx]);
  const hasNextLesson = useMemo(
    () => (outlineRef.current?.length || 0) > currentIdx + 1,
    [currentIdx, outlineRef.current?.length]
  );

  const onNarrationEnded = useCallback(() => {
    playNext();
  }, [playNext]);

  // ---------- per-index, deduped lesson builder ----------
  // ---------- per-index, deduped lesson builder ----------
  const ensureLesson = useCallback(
    async (
      index: number,
      olOverride?: AiOutlineSection[],
      courseIdOverride?: string
    ): Promise<LessonLite> => {
      if (index < 0) throw new Error('bad index');

      if (DBG) {
        console.info('[ai] ensureLesson: enter', {
          index,
          hasOverrideOutline: !!olOverride?.length,
          courseIdOverride,
        });
      }

      const ol = (olOverride && olOverride.length ? olOverride : outlineRef.current) || [];

      if (!ol || ol.length === 0) {
        if (DBG) console.warn('[ai] ensureLesson: outline not ready yet', { index });
        await sleep(50);
        const re = outlineRef.current || [];
        if (!re.length) {
          const err: any = new Error('outline_not_ready');
          err.code = 'OUTLINE_NOT_READY';
          if (DBG) console.error('[ai] ensureLesson: outline still empty', { index });
          throw err;
        }
        return ensureLesson(index, re, courseIdOverride);
      }

      const courseId = courseIdOverride || selectedCourse?.id;
      if (!courseId) {
        const err: any = new Error('no_course_selected');
        err.code = 'NO_COURSE';
        if (DBG) console.error('[ai] ensureLesson: no courseId', { index });
        throw err;
      }

      const cached = lessonCacheRef.current.get(index);
      if (cached) {
        if (DBG) console.info('[ai] ensureLesson: using cached', { index });
        return cached;
      }

      const inflight = inflightLessonsRef.current.get(index);
      if (inflight) {
        if (DBG) console.info('[ai] ensureLesson: awaiting inflight', { index });
        return inflight;
      }

      const p = (async () => {
        if (DBG) {
          console.info('[ai] ensureLesson: createLessonSSML', {
            index,
            courseId,
            voiceName: lastVoiceRef.current,
            courseSize: lastSizeRef.current,
          });
        }

        const pack = await (async () => {
          try {
            return await createLessonSSML(
              backendUrl,
              {
                courseId,
                outline: ol,
                voiceName: lastVoiceRef.current,
                courseSize: lastSizeRef.current,
                start: index,
                count: 1,
                programTrack: buildKnobs({ courseSize: lastSizeRef.current }).programTrack,
                assignmentId: assignmentIdRef.current ?? undefined,
                noPrewarm: 1,
              } as any,
              { token, anonId, clientScreen: flowHints?.clientScreen },
            );
          } catch (e: unknown) {
            const capMsg = parseLessonCapMessage(e);
            if (capMsg && getStatusCode(e) === 409) {
              setError(capMsg);
              setStep('error');
              const err: any = new Error(capMsg);
              err.code = 'LESSON_CAP_REACHED';
              err.status = getStatusCode(e);
              throw err;
            }
            throw e;
          }
        })();

        const mode = ((pack as any)?.mode as LessonGateMode | undefined) || 'narration';

        setGateMode(mode);
        setGateNotice(((pack as any)?.notice as LessonGateNotice) || null);
        setGateUsage(((pack as any)?.usage as LessonGateUsage[]) || []);

        const ent =
          (pack as any)?.entitlement as { max?: number; used?: number } | undefined;
        if (ent && typeof ent.max === 'number') {
          setEntitlementUsage({
            max: Number(ent.max),
            used: Number(ent.used ?? 0),
          });
        }

        const maybeL = pack?.lessons?.[0] as LessonLite | undefined;

        // Ensure we ALWAYS end up with a real LessonLite (never undefined)
        let L: LessonLite;

        if (maybeL) {
          L = maybeL;
        } else if (mode === 'notes_only') {
          // Notes-only mode may legitimately not have SSML; provide a safe placeholder lesson
          const fallbackTitle = String(ol?.[index]?.title || `Lesson ${index + 1}`);
          L = {
            id: `${courseId}:notes_only:${index}`,
            title: fallbackTitle,
            ssml: '',
            markdown: '_Notes are available, but narration is currently locked._',
          };
        } else {
          // Not notes_only and no lesson returned -> backend didn’t give what we need
          throw new Error('lesson_missing');
        }

// If narration is allowed, SSML must be present
if (!L.ssml && mode !== 'notes_only') {
  if (DBG) {
    console.error('[ai] ensureLesson: lesson build returned empty ssml', {
      index,
      pack,
    });
  }
  throw new Error('lesson build failed');
}

if (DBG) {
  console.info('[ai] lesson artifacts', {
    id: L.id,
    index,
    ssmlLen: (L.ssml || '').length,
    formulas: L.formulas?.length || 0,
    tables: L.tables?.length || 0,
    charts: L.charts?.length || 0,
    snippets: L.snippets?.length || 0,
  });
}

if ((pack as any)?.notice) setDegradedNotice((pack as any).notice);

lessonCacheRef.current.set(index, L);

setLessons((prev) => {
  const seen = new Set(prev.map((x) => String(x.id)));
  if (seen.has(String(L.id))) return prev;
  return [...prev, L as AILesson];
});

return L;
  })().finally(() => inflightLessonsRef.current.delete(index));

      inflightLessonsRef.current.set(index, p);
      return p;
    },
    [backendUrl, selectedCourse, token]
  );

  // Prefetch neighbors (call when play is armed or just started)
  const prefetchingRef = useRef(false);
  const prefetchedSet = useRef<Set<number>>(new Set());

  const prefetchAround = useCallback(
    async (index: number) => {
      if (prefetchingRef.current) return;
      const next = index + 1;
      if (prefetchedSet.current.has(next)) return;
      prefetchingRef.current = true;
      try {
        await ensureLesson(next);
        prefetchedSet.current.add(next);
      } finally {
        prefetchingRef.current = false;
      }
    },
    [ensureLesson]
  );

  // Jump to lesson by index, ensuring it exists first
  const goToLesson = useCallback(
    async (index: number) => {
      const ol = outlineRef.current ?? [];
      if (ol.length === 0) return;

      const clamped = Math.max(0, Math.min(index, ol.length - 1));
      try {
        await ensureLesson(clamped);
      } catch (e) {
        if (DBG) console.warn('[ai] goToLesson ensureLesson failed', e);
      }

      setCurrentIdx(clamped);
      if (DBG) console.info('[ai] goToLesson', { index: clamped, total: ol.length });
    },
    [ensureLesson] // ✅ keep callback fresh when ensureLesson changes
  );

  // ---------- knobs ----------
  function buildKnobs(input?: {
    courseSize?: CourseSize;
    level?: 'beginner' | 'intermediate' | 'advanced';
    minutes?: number;
    paragraphs?: number;
    sentencesPerParagraph?: number;
    finalQuizSize?: number;
    programTrack?: ProgramTrack;
    totalLessons?: number;
  }) {
    const courseSize = input?.courseSize || DEFAULT_SIZE.courseSize;

    const defaultTrackBySize: Record<CourseSize, ProgramTrack> = {
      mini: 'module',
      standard: 'certificate',
      extended: 'certificate',
      deep_dive: 'diploma',
      bootcamp: 'degree',
    };
    const programTrack = input?.programTrack || defaultTrackBySize[courseSize];

    return {
      courseSize,
      level: input?.level || DEFAULT_SIZE.level,
      targetMinutes: input?.minutes ?? SIZE_PRESETS[courseSize].minutes,
      paragraphs: input?.paragraphs ?? SIZE_PRESETS[courseSize].paragraphs,
      sentencesPerParagraph:
        input?.sentencesPerParagraph ?? SIZE_PRESETS[courseSize].sentencesPerParagraph,
      finalQuizSize: input?.finalQuizSize ?? SIZE_PRESETS[courseSize].finalQuizSize,
      programTrack,
      totalLessons: input?.totalLessons,
    };
  }

  // --- UPDATED startWithAI: outline → prime L0 (no streaming/full-pack) ---
  const startWithAI = useCallback(
    async (opts?: {
      courseId?: string;
      courseSize?: CourseSize;
      level?: 'beginner' | 'intermediate' | 'advanced';
      minutes?: number;
      voiceName?: string;
      paragraphs?: number;
      sentencesPerParagraph?: number;
      programTrack?: ProgramTrack;
      totalLessons?: number;
      assignmentId?: string;
    }) => {
      const courseId = opts?.courseId || selectedCourse?.id;
      if (!courseId) {
        const msg = 'Could not resolve courseId for this run (custom topic?).';
        if (DBG)
          console.warn('[ai] startWithAI: no courseId/selectedCourse', { opts, selectedCourse });
        setError(msg);
        setStep('error');
        return;
      }

      if (DBG) {
        console.info('[ai] startWithAI: enter', {
          courseId,
          opts,
          hasAuthToken: !!token,
        });
      }

      setError(null);
      setStep('outlining');
      setEntitlementUsage(null);

      const voice = opts?.voiceName || DEFAULT_SIZE.voiceName;
      const knobs = buildKnobs({
        courseSize: opts?.courseSize,
        level: opts?.level,
        minutes: opts?.minutes,
        paragraphs: opts?.paragraphs,
        sentencesPerParagraph: opts?.sentencesPerParagraph,
        programTrack: opts?.programTrack,
        totalLessons: opts?.totalLessons,
      });

      lastVoiceRef.current = voice;
      lastSizeRef.current = knobs.courseSize;

      runIdRef.current += 1;
      const thisRun = runIdRef.current;

      try {
        abortRef.current?.abort('superseded');
      } catch {}
      abortRef.current = new AbortController();
      const { signal } = abortRef.current;

      // 1) Outline (with retries on 503/429)
      let outlineResp: AiOutlineResponse | undefined;
      let attempt = 0;
      for (;;) {
        try {
          const outlineReq: AiOutlineRequest = {
            courseId,
            level: knobs.level,
            courseSize: knobs.courseSize,
            targetMinutes: knobs.targetMinutes,
            paragraphs: knobs.paragraphs,
            sentencesPerParagraph: knobs.sentencesPerParagraph,
            programTrack: knobs.programTrack,
            totalLessons: knobs.totalLessons,
            assignmentId: opts?.assignmentId,
          };

          if (DBG) {
            console.info('[ai] startWithAI: createOutline attempt', {
              attempt,
              outlineReq,
            });
          }

         outlineResp = await createOutline(backendUrl, outlineReq, { signal, token, anonId });

          break;
        } catch (e: unknown) {
          attempt++;
          const status = getStatusCode(e);
          if ((status !== 503 && status !== 429) || attempt >= MAX_RETRIES) {
            if (DBG) {
              console.error('[ai] startWithAI: createOutline failed', {
                attempt,
                status,
                error: e,
              });
            }
            throw e;
          }
          const delay = parseRetryAfter(e as RetryableError, 1500 * attempt);
          if (DBG) {
            console.warn('[ai] outline 503/429 retry', { attempt, delayMs: delay });
          }
          await sleep(delay);
        }
      }

      const ol = outlineResp?.outline ?? [];
      setOutline(ol);
      outlineRef.current = ol;

      if (DBG) {
        console.info('[ai] startWithAI: outline ready', {
          sections: ol.length,
          runId: thisRun,
        });
      }

      if (!Array.isArray(ol) || ol.length === 0) {
        setStep('error');
        setError('AI could not generate an outline for this course...');
        if (DBG) {
          console.warn('[ai] startWithAI: empty outline', { courseId });
        }
        return;
      }
      assignmentIdRef.current =
      typeof opts?.assignmentId === 'string' && opts.assignmentId.trim()
        ? opts.assignmentId.trim()
        : null;

      setStep('narrating');

      // 2) PRIME the first lesson (fast!) — no joined playback
      lessonCacheRef.current.clear();
      inflightLessonsRef.current.clear();

      try {
        const L0 = await ensureLesson(0, ol, courseId); // ⬅️ pass courseId
        setLessons([L0 as AILesson]);
        setCurrentIdx(0);
        setSsml(L0.ssml);
        setJoinedSsml(''); // joined mode OFF
        setStep('ready');

        if (DBG) {
          console.info('[ai] startWithAI: first lesson ready', {
            lessonId: (L0 as any)?.id,
            ssmlLen: (L0 as any)?.ssml?.length ?? 0,
          });
        }
      } catch (e: unknown) {
        const msg = getMessage(e) || 'AI failed to prepare the first lesson';
        setError(msg);
        setStep('error');
        if (DBG) {
          console.error('[ai] startWithAI: ensureLesson(0) failed', {
            error: e,
            message: msg,
          });
        }
      }
    },
    [backendUrl, selectedCourse, token, ensureLesson]
  );

  const startCustomTopic = useCallback(
    async (
      title: string,
      opts?: {
        assignmentId?: string;
        courseSize?: CourseSize;
        level?: 'beginner' | 'intermediate' | 'advanced';
        minutes?: number;
        voiceName?: string;
        paragraphs?: number;
        sentencesPerParagraph?: number;
        programTrack?: ProgramTrack;
        totalLessons?: number;
      }
    ) => {
      setError(null);

      if (DBG) {
        console.info('[ai] startCustomTopic: enter', {
          title,
          opts,
          hasAuthToken: !!token,
          backendUrl,
        });
      }

      try {
        const chosenSize: CourseSize = opts?.courseSize || DEFAULT_SIZE.courseSize;
        const preset = SIZE_PRESETS[chosenSize];

        const raw = await createAiSandboxCourse(
          backendUrl,
          {
            title,
            courseSize: chosenSize,
            minutes: opts?.minutes ?? preset.minutes,
            assignmentId: opts?.assignmentId,
          } as any,
          { token,anonId } as any
        );

        // 🔍 Normalize backend response shape
        const sandbox = (raw as any)?.course || (raw as any)?.data || raw;

        if (!sandbox || !sandbox.id) {
          const msg = `Sandbox course missing id (got: ${JSON.stringify(raw)})`;
          if (DBG) console.error('[ai] startCustomTopic: bad sandbox response', { raw });
          setError(msg);
          setStep('error');
          return;
        }

        const sandboxCourse: TopCourse = {
          id: sandbox.id,
          title: sandbox.title || sandbox.name || `AI sandbox: ${title}`,
          blurb: sandbox.description || '',
          rating: 0,
          reviews: 0,
        };

        if (DBG) {
          console.info('[ai] startCustomTopic: sandbox normalized', {
            sandbox,
            sandboxCourse,
            chosenSize,
          });
        }

        // ✅ Use the hook’s selectCourse so caches are reset correctly
        setTopCourses((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          if (seen.has(sandboxCourse.id)) return prev;
          return [sandboxCourse, ...prev];
        });

        selectCourse(sandboxCourse);

        // Now kick off the usual flow with a guaranteed courseId
        await startWithAI({
          courseId: sandboxCourse.id,
          assignmentId: opts?.assignmentId,
          courseSize: chosenSize,
          level: opts?.level || DEFAULT_SIZE.level,
          voiceName: opts?.voiceName || DEFAULT_SIZE.voiceName,
          paragraphs: opts?.paragraphs ?? preset.paragraphs,
          sentencesPerParagraph: opts?.sentencesPerParagraph ?? preset.sentencesPerParagraph,
          programTrack: opts?.programTrack,
          totalLessons: opts?.totalLessons,
          minutes: opts?.minutes ?? preset.minutes,
        });

        if (DBG) {
          console.info('[ai] startCustomTopic: startWithAI finished', {
            courseId: sandboxCourse.id,
          });
        }
      } catch (e: unknown) {
        const msg = getMessage(e) || 'Failed to start custom topic';
        setError(msg);
        setStep('error');
        if (DBG) {
          console.error('[ai] startCustomTopic failed', {
            error: e,
            message: msg,
          });
        }
      }
    },
    [backendUrl, startWithAI, token, selectCourse]
  );

  // Player helpers
  const onBeforePlay = useCallback(async () => {
    if (!(outlineRef.current?.length > 0)) {
      if (DBG) console.info('[ai] onBeforePlay skipped: outline not ready');
      return;
    }
    try {
      await ensureLesson(currentIdx); // ensure current exists
    } catch {}
    prefetchAround(currentIdx); // quietly build next ones
  }, [currentIdx, ensureLesson, prefetchAround]);

  const [isBuildingNext, setIsBuildingNext] = useState(false);

  const goNext = useCallback(async () => {
    const target = currentIdx + 1;
    const total = outlineRef.current?.length || 0;
    if (target >= total) return false;

    if (lessonCacheRef.current.has(target)) {
      setCurrentIdx(target);
      return true;
    }
    setIsBuildingNext(true);
    try {
      await ensureLesson(target);
      setCurrentIdx(target);
      return true;
    } finally {
      setIsBuildingNext(false);
    }
  }, [currentIdx, ensureLesson]);

  const goPrev = useCallback(async () => {
    const target = Math.max(0, currentIdx - 1);
    if (lessonCacheRef.current.has(target)) {
      setCurrentIdx(target);
      return true;
    }
    try {
      await ensureLesson(target);
    } catch {}
    setCurrentIdx(target);
    return true;
  }, [currentIdx, ensureLesson]);

  const onEnded = useCallback(async () => {
    await goNext();
  }, [goNext]);

  // --------- generateQuizNow (honors arg/org/url/default) ----------
  const generateQuizNow = useCallback(
    async (
      numQuestions?: number,
      courseSize?: CourseSize,
      programTrack?: ProgramTrack,
      totalLessons?: number,
      assignmentId?: string,
      quizType?: 'mcq' | 'short',
      opts?: { lessonIndex?: number }
    ) => {
      const effectiveQt: 'mcq' | 'short' =
        (quizType as 'mcq' | 'short' | undefined) ??
        flowHints?.orgQuizType ??
        flowHints?.urlQuizTypeHint ??
        flowHints?.defaultQuizType ??
        'mcq';

      if (!selectedCourse || !outline.length) return;
      setError(null);
      setStep('quizzing');
      setQuiz(null);

      const size = courseSize || DEFAULT_SIZE.courseSize;

      try {
        setQuiz(null);
        setAnswers({});
        setGrade(null);

        const safeOutline = (outline || []).map((s: any) => ({
          id: s?.id,
          title: String(s?.title || '').slice(0, 200),
          keyPoints: (Array.isArray(s?.keyPoints) ? s.keyPoints : [])
            .map((k: any) => String(k || '').trim())
            .filter(Boolean)
            .slice(0, 10),
        }));

        const qt: 'mcq' | 'short' = effectiveQt;

        const wantedNumQ =
          typeof numQuestions === 'number' && Number.isFinite(numQuestions)
            ? Math.max(3, Math.min(30, Math.floor(numQuestions)))
            : undefined;

        const base = {
          courseId: selectedCourse.id,
          outline: safeOutline,
          courseSize: size,
          level: DEFAULT_SIZE.level,
          programTrack,
          totalLessons: totalLessons ?? safeOutline.length,
          assignmentId,
          quizType: qt,
          lessonIndex:
            typeof opts?.lessonIndex === 'number'
              ? Math.max(0, Math.min(opts.lessonIndex, safeOutline.length - 1))
              : programTrack
                ? currentIdx
                : undefined,
        };

        const quizReq: AiQuizRequest = {
          ...base,
          ...(wantedNumQ !== undefined ? { numQuestions: wantedNumQ } : {}),
        };

        const q = await createQuiz(backendUrl, quizReq, { token, anonId });
        setQuiz(q.quiz);
        setAnswers({});
        if (DBG) console.info('[ai] quiz generated', { questions: q.quiz?.questions?.length || 0 });
      } catch (e: unknown) {
        setQuiz(null);
        setError(getMessage(e) || 'AI failed to generate quiz');
        setStep('error');
      }
    },
    [
      backendUrl,
      selectedCourse,
      outline,
      token,
      flowHints?.orgQuizType,
      flowHints?.urlQuizTypeHint,
      flowHints?.defaultQuizType,
      currentIdx,
    ]
  );
  // ----------------------------------------------------------------

  const answerQuestion = useCallback((questionId: string, value: number | string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  type AnyQuiz = Quiz | null | undefined;
  type AnyQuestion = (Quiz['questions'][number] & Record<string, unknown>) | undefined;

  function inferIsShort(q: AnyQuiz): boolean {
    const qt = (q as any)?.quizType;
    if (qt === 'short') return true;
    if (qt === 'mcq') return false;
    const first = (q?.questions?.[0] as AnyQuestion) || undefined;
    return !(first && Array.isArray((first as any).choices));
  }

  const allAnswered = useMemo(() => {
    const qs = quiz?.questions || [];
    if (!qs.length) return false;

    const isShort = inferIsShort(quiz);

    return qs.every((q) => {
      const v = answers[q.id];
      return isShort
        ? typeof v === 'string' && v.trim() !== ''
        : typeof v === 'number' && Number.isFinite(v) && v >= 0;
    });
  }, [quiz, answers]);

  const gradeNow = useCallback(
    async (passMark?: number) => {
      if (!token) {
        setError('Please sign in to submit and grade your quiz.');
        return;
      }
      if (!quiz?.questions?.length) return;
      setError(null);
      try {
        const payload: any = buildGradePayload(quiz, answers);
        if (typeof passMark === 'number') payload.passMark = passMark;
        const g = await gradeQuizApi(backendUrl, token, payload);
        setGrade(g);
        setStep('graded');
        return g;
      } catch (e: unknown) {
        setError(getMessage(e) || 'Grading failed');
        setStep('error');
        throw e;
      }
    },
    [backendUrl, token, quiz, answers]
  );

  const tryGenerateCertificate = useCallback(async () => {
    if (!token) {
      setError('Please sign in to request your certificate.');
      if (DBG) console.warn('[ai] tryGenerateCertificate aborted: no token');
      return null;
    }
    if (!selectedCourse) return null;

    try {
      const elig = await certGetEligibility(backendUrl, token, selectedCourse.id);
      if (DBG) console.info('[ai] cert eligibility', elig);
      if (!elig.eligible) {
        setError(elig.reason || 'Not eligible for certificate yet.');
        return null;
      }
      const cert = await certGenerate(backendUrl, token, selectedCourse.id);
      setCertificate(cert);
      if (DBG) console.info('[ai] certificate generated', { id: cert?.id || null });
      return cert;
    } catch (e: unknown) {
      setError(getMessage(e) || 'Certificate generation failed');
      if (DBG) console.error('[ai] tryGenerateCertificate failed', e);
      return null;
    }
  }, [backendUrl, token, selectedCourse]);

  const clearSelectedCourseCacheNow = useCallback(async () => {
    if (!selectedCourse) return 0;
    try {
      const res = await clearCourseCache(backendUrl, selectedCourse.id, { token });
      if (DBG)
        console.info('[ai] cache cleared for course', {
          courseId: selectedCourse.id,
          removed: res?.removed ?? 0,
        });
      return res?.removed ?? 0;
    } catch (e: unknown) {
      if (DBG) console.warn('[ai] clearSelectedCourseCacheNow failed', e);
      throw e;
    }
  }, [backendUrl, token, selectedCourse]);

  const clearTopCoursesCacheNow = useCallback(async () => {
    try {
      const res = await clearTopCoursesCache(backendUrl, { token });
      if (DBG) console.info('[ai] top-courses cache cleared', { removed: res?.removed ?? 0 });
      return res?.removed ?? 0;
    } catch (e: unknown) {
      if (DBG) console.warn('[ai] clearTopCoursesCacheNow failed', e);
      throw e;
    }
  }, [backendUrl, token]);

  return {
    // data
    topCourses,
    selectedCourse,
    outline,

    lessons, // grows as lessons are built
    currentLessonIndex, // kept in sync with currentIdx
    currentLesson,
    joinedSsml,
    ssml,
    degradedNotice,
    gateMode,
    gateNotice,
    gateUsage,
    entitlementUsage,

    quiz,
    answers,
    grade,

    certificate,

    // state
    step,
    error,
    ttsLoading,
    ttsError,

    // pagination
    hasMoreCourses,
    coursesCursor,

    // actions
    loadTopCourses,
    selectCourse,

    startWithAI,
    startCustomTopic,

    // nav
    goToLesson, // async now (ensures lesson first)
    nextLesson: goNext,
    prevLesson: goPrev,
    hasNextLesson,
    hasPrevLesson,

    // player hooks
    currentIdx,
    setCurrentIdx,
    onBeforePlay,
    onEnded,
    goNext,
    goPrev,
    isBuildingNext,
    getLessonAt: (i: number) => lessonCacheRef.current.get(i) || null,
    ensureLesson,

    // quiz/cert
    generateQuizNow,
    answerQuestion,
    allAnswered,
    gradeNow,
    tryGenerateCertificate,

    // misc
    clearSelectedCourseCacheNow,
    clearTopCoursesCacheNow,
    onNarrationEnded,
  };
}
