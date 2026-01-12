/* apps/web/src/components/RobotTeacher.web.tsx */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useOrgAssignment } from '@mytutorapp/shared/hooks/useOrgAssignment';
import { useAiCourse, useAICertificates } from '@mytutorapp/shared/hooks';
import { useShopContext } from '@mytutorapp/shared/context';
import { updateCourseProgress } from '@mytutorapp/shared/api/courseProgressApi';

import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import OrgShareDialog from '@/components/org/OrgShareDialog';

import ControlsPanel, { type SizePresetKey, type TrackKey } from './RobotTeacherControls';
import LessonAndQuizPane from './RobotTeacherLessonAndQuiz';
import { resolveCourseTitleInfo } from '@mytutorapp/shared/utils/resolveCourseTitle';
import { getProgramTrackRequirements } from '@mytutorapp/shared/utils/programTrack';
import { getRequiredWeeks, normalizeProgramTrack } from '@mytutorapp/shared/utils/programTrackRequirements';

import type { TopCourse, ProgramTrack } from '@mytutorapp/shared/types';

const dbgEnabled = () => {
  if (typeof window === 'undefined') return false;
  const qs = new URLSearchParams(window.location.search);
  if (qs.has('dbg') || qs.get('debug') === '1') return true;
  return localStorage.getItem('DBG_SHARE') === '1' || localStorage.getItem('DBG_AI') === '1';
};

const normId = (v: any) => String(v ?? '').trim();

export const dlog = (...args: any[]) => {
  if (dbgEnabled()) console.log('[RobotTeacher]', ...args);
};

type RobotTeacherProps = {
  defaultVoice?: string;
  initialSsml?: string;
  voiceName?: string;
  themeOpen?: boolean;
  onThemeOpenChange?: (open: boolean) => void;
};

const PRESETS = [
  { key: 'quick', label: 'Quick', min: 10 },
  { key: 'standard', label: 'Standard', min: 20 },
  { key: 'extended', label: 'Extended', min: 30 },
  { key: 'intensive', label: 'Intensive', min: 45 },
  { key: 'marathon', label: 'Marathon', min: 60 },
] as const satisfies readonly { key: SizePresetKey; label: string; min: number }[];

const TRACKS = [
  { key: 'module', label: 'Module', lessons: getRequiredWeeks('module') },
  { key: 'certificate', label: 'Certificate', lessons: getRequiredWeeks('certificate') },
  { key: 'diploma', label: 'Professional', lessons: getRequiredWeeks('diploma') },
  { key: 'degree', label: 'Comprehensive', lessons: getRequiredWeeks('degree') },
] as const satisfies readonly { key: TrackKey; label: string; lessons: number }[];



const sizeToCourseSize: Record<
  SizePresetKey,
  'mini' | 'standard' | 'extended' | 'deep_dive' | 'bootcamp'
> = {
  quick: 'mini',
  standard: 'standard',
  extended: 'extended',
  intensive: 'deep_dive',
  marathon: 'bootcamp',
};

function getCourseBlurb(c: TopCourse): string {
  const maybe = (c as unknown as Record<string, unknown>)['description'];
  return typeof maybe === 'string' && maybe.trim() ? (maybe as string) : c.blurb;
}

/* Minimal course list */
function CourseList({
  items,
  activeId,
  onSelect,
  onRefresh,
  onLoadMore,
  hasMore,
}: {
  items: { id: string; title: string; blurb?: string }[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onLoadMore: () => void;
  hasMore: boolean;
}) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        (it.title || '').toLowerCase().includes(q) || (it.blurb || '').toLowerCase().includes(q)
    );
  }, [items, query]);

  return (
    <div className="panel p-3">
      <div className="flex items-center gap-2 mb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search courses…"
          className="input !py-2 !px-3 text-sm"
        />
        <button onClick={onRefresh} className="chip" title="Reload list">
          Refresh
        </button>
        <button
          onClick={onLoadMore}
          disabled={!hasMore}
          className={`chip ${hasMore ? 'chip-active' : ''}`}
          title="Load more courses"
        >
          {hasMore ? 'Load more' : 'All loaded'}
        </button>
      </div>

      <div
        className="md:hidden flex gap-2 overflow-x-auto pb-2 -mx-1 px-1"
        style={{ scrollbarWidth: 'thin' }}
      >
        {visible.length ? (
          visible.map((l, i) => {
            const active = l.id === activeId;
            return (
              <button
                key={l.id}
                onClick={() => onSelect(l.id)}
                className={`chip ${active ? 'chip-active' : ''} whitespace-nowrap`}
                title={l.blurb || l.title}
              >
                {String(i + 1).padStart(2, '0')} • {l.title}
              </button>
            );
          })
        ) : (
          <span className="text-sm text-gray-500 dark:text-white/60">No courses found.</span>
        )}
      </div>

      <div className="hidden md:block">
        <div
          className="space-y-2 max-h-[70vh] overflow-auto pr-1"
          style={{ scrollbarWidth: 'thin' }}
        >
          {visible.length ? (
            visible.map((l, i) => {
              const active = l.id === activeId;
              return (
                <button
                  key={l.id}
                  onClick={() => onSelect(l.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition
                  ${
                    active
                      ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-600/40 dark:text-white dark:ring-indigo-500'
                      : 'bg-white ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-white/5 dark:ring-white/10 dark:text-white/90 dark:hover:bg-white/10'
                  }`}
                  title={l.blurb || l.title}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-white/60">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="truncate">{l.title}</span>
                  </div>
                  {l.blurb ? (
                    <div className="text-[11px] text-gray-500 dark:text-white/60 line-clamp-2 mt-0.5">
                      {l.blurb}
                    </div>
                  ) : null}
                </button>
              );
            })
          ) : (
            <div className="text-sm text-gray-500 dark:text-white/60">
              No courses found. Try another search.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const RobotTeacher: React.FC<RobotTeacherProps> = ({
  defaultVoice = 'en-US-Wavenet-F',
  initialSsml = '',
  voiceName,
  themeOpen: themeOpenProp,
  onThemeOpenChange,
}) => {
  const compactPlayer = true;
  const navigate = useNavigate();
  const location = useLocation();
  const sp = React.useMemo(() => new URLSearchParams(location.search), [location.search]);
  // ── Share/lock query params (shared sandbox course) ─────────
  const locked = sp.get('lock') === '1';
  const qpCourseId = sp.get('courseId') || sp.get('course_id') || '';
  const qpAssignmentId = sp.get('assignmentId') || sp.get('assignment_id') || '';
  const qpCourseTitle =
  sp.get('courseTitle') ||
  sp.get('ct') ||
  sp.get('title') ||     // ✅ support "title" too (from MyCourses)
  sp.get('t') ||         // ✅ optional short alias
  '';

  const qpProgramTrack = sp.get('programTrack') || sp.get('program_track') || '';
  const qpStartWeek = sp.get('startWeek') || sp.get('start_week');
  const qpSource = sp.get('source') || '';
  const qpLockTrack = sp.get('lockTrack') === '1' || sp.get('trackLock') === '1';
  const startWeekParsed = qpStartWeek ? Number(qpStartWeek) : null;
  const startWeekValue =
    typeof startWeekParsed === 'number' && Number.isFinite(startWeekParsed)
      ? Math.max(1, Math.trunc(startWeekParsed))
      : null;
  const startIdx =
    typeof startWeekValue === 'number' && Number.isFinite(startWeekValue)
      ? Math.max(0, startWeekValue - 1)
      : null;
  const isSandboxSource = qpSource === 'sandbox';

  const normQt = (v?: string | null): 'mcq' | 'short' | undefined => {
    const s = String(v ?? '')
      .trim()
      .toLowerCase();
    return s === 'short' ? 'short' : s === 'mcq' ? 'mcq' : undefined;
  };
  const urlQuizTypeHint = normQt(sp.get('qt'));

  // ── Mount/scroll effects ─────────────────────────────────
  useEffect(() => {
    console.log('[RobotTeacher] mounted', { DBG_ENABLED: dbgEnabled() });
  }, []);
  useEffect(() => {
    const prevX = document.body.style.overflowX;
    document.body.style.overflowX = 'hidden';
    return () => {
      document.body.style.overflowX = prevX;
    };
  }, []);

  // ── UI state ─────────────────────────────────────────────
  const [isMaximized, setIsMaximized] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  useEffect(() => {
    const prev = document.body.style.overflow;
    const shouldLock = isMaximized && !shareOpen;
    document.body.style.overflow = shouldLock ? 'hidden' : '';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMaximized, shareOpen]);

  // ── Contexts & hooks ─────────────────────────────────────
  const effectiveVoice = voiceName || defaultVoice;
  const { backendUrl, token, orgToken, role: globalRole } = useShopContext() as any;
  const authToken = token || orgToken || undefined;
  const isGlobalAdmin = globalRole === 'admin' || globalRole === 'superadmin';

  const [internalThemeOpen, setInternalThemeOpen] = useState(false);
  const isThemeControlled = typeof themeOpenProp === 'boolean';
  const themeOpen = isThemeControlled ? (themeOpenProp as boolean) : internalThemeOpen;
  const setThemeOpen = (next: boolean | ((s: boolean) => boolean)) => {
    const v = typeof next === 'function' ? (next as (s: boolean) => boolean)(themeOpen) : next;
    if (!isThemeControlled) setInternalThemeOpen(v);
    onThemeOpenChange?.(v);
  };

  const ai = useAiCourse(backendUrl, authToken, {
    urlQuizTypeHint,
    defaultQuizType: 'mcq',
  });

  const {
    topCourses,
    selectedCourse,
    outline,
    lessons,
    ssml,
    joinedSsml,
    gateMode,
    gateNotice,
    gateUsage,
    quiz,
    answers,
    grade,
    step,
    ttsLoading,
    error: aiError,
    loadTopCourses,
    selectCourse,
    startWithAI,
    generateQuizNow,
    answerQuestion,
    allAnswered,
    gradeNow,
    tryGenerateCertificate,
    startCustomTopic,
    onBeforePlay: aiOnBeforePlay,
    onEnded: aiOnEnded,
    currentIdx,
    setCurrentIdx,
    getLessonAt,
    goNext,
    goPrev,
    isBuildingNext,
    clearSelectedCourseCacheNow,
    clearTopCoursesCacheNow,
  } = ai;

  const {
    skus,
    loading: aiCertLoading,
    error: aiCertError,
    message: aiCertMsg,
    claim,
    generate: generateAICert,
  } = useAICertificates({
    backendUrl,
    token: authToken,
    courseId: selectedCourse?.id,
  });
  // keep stable refs like native
  const topCoursesRef = React.useRef<TopCourse[]>([]);
  useEffect(() => {
    topCoursesRef.current = Array.isArray(topCourses) ? topCourses : [];
  }, [topCourses]);

  const selectedCourseRef = React.useRef<typeof selectedCourse>(selectedCourse);
  useEffect(() => {
    selectedCourseRef.current = selectedCourse;
  }, [selectedCourse]);

  const startIdxAppliedRef = React.useRef<{ courseId: string | null; startIdx: number | null }>({
    courseId: null,
    startIdx: null,
  });

  useEffect(() => {
    if (startIdx == null) return;
    if (!outline.length) return;
    const courseKey = String(selectedCourse?.id || qpCourseId || '');
    if (!courseKey) return;
    if (
      startIdxAppliedRef.current.courseId === courseKey &&
      startIdxAppliedRef.current.startIdx === startIdx
    ) {
      return;
    }
    const clamped = Math.max(0, Math.min(startIdx, Math.max(0, outline.length - 1)));
    setCurrentIdx(clamped);
    startIdxAppliedRef.current = { courseId: courseKey, startIdx };
  }, [startIdx, outline.length, selectedCourse?.id, qpCourseId, setCurrentIdx]);

  const completedWeeksRef = React.useRef<Set<number>>(new Set());
  const prevIdxRef = React.useRef<number | null>(null);

  useEffect(() => {
    if (!isSandboxSource) {
      prevIdxRef.current = currentIdx;
      return;
    }
    const prevIdx = prevIdxRef.current;
    if (prevIdx == null) {
      prevIdxRef.current = currentIdx;
      return;
    }
    if (currentIdx <= prevIdx) {
      prevIdxRef.current = currentIdx;
      return;
    }
    const weekToComplete = prevIdx + 1;
    if (completedWeeksRef.current.has(weekToComplete)) {
      prevIdxRef.current = currentIdx;
      return;
    }
    const progressCourseId = String(selectedCourse?.id || qpCourseId || '');
    if (!progressCourseId || !backendUrl || !authToken) {
      prevIdxRef.current = currentIdx;
      return;
    }
    completedWeeksRef.current.add(weekToComplete);
    updateCourseProgress(
      backendUrl,
      { courseId: progressCourseId, week: weekToComplete, status: 'Completed' },
      authToken
    ).catch((e) => {
      completedWeeksRef.current.delete(weekToComplete);
      if (dbgEnabled()) console.warn('[RobotTeacher] auto-complete failed', e);
    });
    prevIdxRef.current = currentIdx;
  }, [currentIdx, isSandboxSource, backendUrl, authToken, selectedCourse?.id, qpCourseId]);

  useEffect(() => {
    if (!dbgEnabled()) return;
    console.log('[RobotTeacher] startWeek', {
      startWeek: startWeekValue,
      startIdx,
      currentIdx,
      outlineLen: outline.length,
      source: qpSource || '—',
    });
  }, [startWeekValue, startIdx, currentIdx, outline.length, qpSource]);

  // tiny helpers – same idea as native
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  const waitForCourses = async (timeoutMs = 5000, pollMs = 50) => {
    const t0 = Date.now();
    while (topCoursesRef.current.length === 0 && Date.now() - t0 < timeoutMs) {
      await sleep(pollMs);
    }
    return topCoursesRef.current.length > 0;
  };

  const waitForSelection = async (timeoutMs = 3000, pollMs = 50) => {
    const t0 = Date.now();
    while (!selectedCourseRef.current && Date.now() - t0 < timeoutMs) {
      await sleep(pollMs);
    }
    return selectedCourseRef.current;
  };

  const orgAssign = useOrgAssignment();

  
  const assignmentId = orgAssign?.assignmentId ?? undefined;
  const isOrgFlow = Boolean(orgAssign?.assignmentId);
  const assignmentIdForAi = authToken ? assignmentId : undefined;
  // ── Timer owned by parent ────────────────────────────────
  const [localRemainingMs, setLocalRemainingMs] = useState<number | null>(null);

  
  useEffect(() => {
    if (localRemainingMs == null || localRemainingMs <= 0) return;
    const id = window.setInterval(() => {
      setLocalRemainingMs((ms) => (ms == null ? null : Math.max(0, ms - 1000)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [localRemainingMs]);

  const timerSec =
    Number(
      (orgAssign as any)?.timerS ??
        (orgAssign as any)?.timerSec ??
        (orgAssign as any)?.timer_s ??
        (orgAssign as any)?.lockedConfig?.timer_s ??
        0
    ) || 0;

  const displayRemainingMs =
    (orgAssign?.remainingMs ?? 0) > 0
      ? (orgAssign?.remainingMs as number)
      : (localRemainingMs ?? 0);

  // ── Payment/cert state ───────────────────────────────────
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [certUrl, setCertUrl] = useState<string | null>(null);
  const [downUrl, setDownUrl] = useState<string | null>(null);

  // ── SSML locking (no mutation while playing) ─────────────
  const hasAIContent = useMemo(
    () =>
      Boolean(
        (joinedSsml && String(joinedSsml).trim()) ||
          (ssml && String(ssml).trim()) ||
          (Array.isArray(lessons) && lessons.length > 0)
      ),
    [joinedSsml, ssml, lessons]
  );
  const rawDisplaySsml: string = (
    hasAIContent ? joinedSsml || ssml || '' : initialSsml || ''
  ).trim();
  const [lockedSsml, setLockedSsml] = useState<string | null>(null);
  const onBeforePlayWrapped = useCallback(async () => {
    if (!lockedSsml) setLockedSsml(rawDisplaySsml);
    await aiOnBeforePlay?.();
  }, [lockedSsml, rawDisplaySsml, aiOnBeforePlay]);
  const onEndedWrapped = useCallback(() => {
    setLockedSsml(null);
    aiOnEnded?.();
  }, [aiOnEnded]);
  const displaySsml = lockedSsml ?? rawDisplaySsml;
  const hasJoined = Boolean(joinedSsml && String(joinedSsml).trim());

  // ── Org & role gating (compute BEFORE deriveds use them) ─
  const { activeOrgId, org: orgCtx, isStarterTier } = useOrg();
  const rolesRaw = [
    ...(Array.isArray(orgCtx?.roles) ? orgCtx.roles : []),
    orgCtx?.my_role,
    orgCtx?.role,
  ]
    .filter(Boolean)
    .map((r) => String(r).toLowerCase());
  const roles = new Set(rolesRaw);
  const isAdminOwner = roles.has('owner') || roles.has('admin');
  const isInstructor = roles.has('instructor') || roles.has('teacher');
  const canShareUi = Boolean(activeOrgId && (isAdminOwner || isInstructor || isGlobalAdmin));

  // ── Controls state (declare BEFORE deriveds that use them) ─
  const [classLevel, setClassLevel] = useState<'beginner' | 'intermediate' | 'advanced'>(
    'beginner'
  );
  const [sizePreset, setSizePreset] = useState<SizePresetKey>('standard');
  const [minutes, setMinutes] = useState<number>(20);
  const [totalLessons, setTotalLessons] = useState<number>(8);
  const [quizCount, setQuizCount] = useState<number>(16);
  const [programTrack, setProgramTrack] = useState<ProgramTrack>('module');

  const [programTrackLocked, setProgramTrackLocked] = useState(false);
  const [programTrackLockSource, setProgramTrackLockSource] = useState<
    'param' | 'storage' | 'default' | null
  >(null);
  const [customTitle, setCustomTitle] = useState('');
  const [fetchedRouteTitle, setFetchedRouteTitle] = useState('');

  const [preparing, setPreparing] = useState(false);
  const runIdRef = React.useRef(0);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const startMutexRef = React.useRef(false);
  const [blockedUntilStart, setBlockedUntilStart] = useState(false);
  const [overrideLessons, setOverrideLessons] = useState(false);
  const [overrideQuiz, setOverrideQuiz] = useState(false);

  const setProgramTrackFromUi = useCallback((k: ProgramTrack) => {
  setProgramTrack(k);
}, [setProgramTrack]);


  const assignmentMetaObj = useMemo(() => {
  const m = (orgAssign as any)?.meta;
  if (!m) return undefined;
  if (typeof m === 'object') return m as any;
  if (typeof m === 'string') {
    const s = m.trim();
    if (!s) return undefined;
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  }
  return undefined;
}, [orgAssign]);

const displayTitle = useMemo(() => {
  const clean = (x: any) => {
    const t = String(x ?? '').trim();
    if (!t) return '';
    const lc = t.toLowerCase();
    if (lc === 'undefined' || lc === 'null') return '';
    return t;
  };

  return (
    clean(customTitle) ||
    clean((assignmentMetaObj as any)?.title_override) ||
    clean(selectedCourse?.title) ||
    clean(qpCourseTitle) ||
    clean((assignmentMetaObj as any)?.course_title) ||
    'Assigned Course'
  );
}, [customTitle, assignmentMetaObj, selectedCourse?.title, qpCourseTitle]);


  useEffect(() => {
    const trackFromParam = qpProgramTrack ? normalizeProgramTrack(qpProgramTrack) : null;
    if (trackFromParam) {
      setProgramTrack(trackFromParam as TrackKey);
      if (qpLockTrack) {
        setProgramTrackLocked(true);
        setProgramTrackLockSource('param');
        if (dbgEnabled()) {
          console.log('[RobotTeacher] locked programTrack (param)', trackFromParam);
        }
      } else {
        setProgramTrackLocked(false);
      }
      return;
    }

    if (qpCourseId) {
      try {
        const stored = localStorage.getItem(`sandbox_track:${qpCourseId}`);
        const trackFromStorage = stored ? normalizeProgramTrack(stored) : null;
        if (trackFromStorage) {
          setProgramTrack(trackFromStorage as TrackKey);
          if (qpLockTrack) {
            setProgramTrackLocked(true);
            setProgramTrackLockSource('storage');
            if (dbgEnabled()) {
              console.log('[RobotTeacher] locked programTrack (storage)', trackFromStorage);
            }
          } else {
            setProgramTrackLocked(false);
          }
          return;
        }
      } catch {}
    }

    setProgramTrackLockSource('default');
    if (!qpLockTrack) setProgramTrackLocked(false);
  }, [qpProgramTrack, qpCourseId, qpLockTrack]);

  useEffect(() => {
    if (!programTrackLocked) return;
    setOverrideLessons(false);
    setOverrideQuiz(false);
  }, [programTrackLocked, setOverrideLessons, setOverrideQuiz]);

  const [coursesLoadDone, setCoursesLoadDone] = useState(false);

  const lastRunKeyRef = React.useRef<string | null>(null);

  // player readiness (parity with native)
  const [playerReady, setPlayerReady] = useState(false);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [starting, setStarting] = useState(false);

  // ── Deriveds (order matters) ─────────────────────────────
  const isLockedLearner = Boolean(orgAssign?.locked ?? (isOrgFlow && !canShareUi));

  const restrictStarter = Boolean(activeOrgId && isStarterTier);
  const knobsDisabled = restrictStarter || isLockedLearner;
  const capMinutes = (m?: number) => (restrictStarter ? Math.min(m ?? 30, 30) : (m ?? 20));

  const trackLessons = useMemo(() => {
    const t = TRACKS.find((x) => x.key === programTrack) ?? TRACKS[0];
    return t.lessons;
  }, [programTrack]);

  const lockedMinutes = (orgAssign as any)?.lockedConfig?.minutes as number | undefined;
  const lockedLessons = (orgAssign as any)?.lockedConfig?.totalLessons as number | undefined;
  const lockedQuizSize = (orgAssign as any)?.lockedConfig?.quizSize as number | undefined;

  const minutesEffective = isLockedLearner
    ? capMinutes(typeof lockedMinutes === 'number' ? lockedMinutes : minutes)
    : minutes;

  const lessonsEffective = isLockedLearner
    ? typeof lockedLessons === 'number'
      ? Math.max(1, lockedLessons)
      : trackLessons
    : overrideLessons
      ? totalLessons
      : trackLessons;

  const defaultQuizForLessons = (n: number) => Math.max(4, n * 2);

  const quizEffective = isLockedLearner
    ? typeof lockedQuizSize === 'number'
      ? Math.max(4, lockedQuizSize)
      : 16
    : overrideQuiz
      ? quizCount
      : defaultQuizForLessons(lessonsEffective);

  const safeLessons = lessonsEffective;
  const safeQuiz = quizEffective;

  const titleInfo = useMemo(() => {
  return resolveCourseTitleInfo({
    routeTitle: (qpCourseTitle || fetchedRouteTitle) ?? '',
    assignmentMeta: (orgAssign as any)?.meta,
    selectedCourseTitle: selectedCourse?.title || fetchedRouteTitle,
    customTitle,
    fallback: 'Assigned Course',
  });
}, [qpCourseTitle, fetchedRouteTitle, orgAssign, selectedCourse?.title, customTitle]);

  useEffect(() => {
    dlog('course title resolve', {
      qpCourseTitle,
      assignmentMetaTitleOverride: (orgAssign as any)?.meta?.title_override,
      assignmentMetaCourseTitle: (orgAssign as any)?.meta?.course_title,
      selectedCourseTitle: selectedCourse?.title,
      customTitle: customTitle.trim(),
      resolvedTitle: titleInfo.title,
      resolvedSource: titleInfo.source,
    });
  }, [
    qpCourseTitle,
    orgAssign,
    selectedCourse?.title,
    customTitle,
    titleInfo.title,
    titleInfo.source,
  ]);

  

  // ── Busy helpers (must be declared before canStartNow) ──
  const isAiBusy = step === 'outlining' || step === 'narrating' || ttsLoading;
  const busyUi = starting || (activeRunId !== null && isAiBusy) || preparing;

 const courseIdParam = qpCourseId || null;
 const wantedCourseId = courseIdParam ? normId(courseIdParam) : null;
 const assignedCourseId = orgAssign?.courseId ? normId(orgAssign.courseId) : null;
 const desiredCourseId = wantedCourseId || assignedCourseId || null;

// If a courseId is in the URL (share link), it must win over any stale/default selection.
const effectiveCourseIdForStart =
   desiredCourseId || selectedCourseRef.current?.id || selectedCourse?.id || null;

const canStartNow = useMemo(() => {
  // ✅ always block starts while AI is busy / mutex is held
  const aiReallyBusy = (activeRunId !== null && isAiBusy) || startMutexRef.current;
  if (aiReallyBusy) return false;

  const custom = customTitle.trim();
  
  if (custom) return true;

  // ✅ If URL has courseId, only allow start once we’re actually on that course
  // (prevents starting course[0] while list/selection is still catching up)
  if (wantedCourseId) {
  // ✅ sandbox courseId is valid even if not in topCourses
  if (isSandboxSource) return true;

  const selId = normId(selectedCourseRef.current?.id || selectedCourse?.id || '');
  return selId === wantedCourseId;
}


  if (effectiveCourseIdForStart) return true;

   return false;
}, [
  customTitle,
  wantedCourseId,
  effectiveCourseIdForStart,
   isSandboxSource,
  activeRunId,
  isAiBusy,
  selectedCourse?.id,
]);

useEffect(() => {
  if (!isSandboxSource) return;
  if (!wantedCourseId) return;
  const t = fetchedRouteTitle.trim();
  if (!t) return;

  const selId = normId(selectedCourse?.id || '');
  if (selId !== wantedCourseId) return;

  const cur = String(selectedCourse?.title || '').trim();
  if (cur && cur !== 'Assigned Course') return;

  selectCourse({ ...(selectedCourse as any), title: t } as any);
}, [isSandboxSource, wantedCourseId, fetchedRouteTitle, selectedCourse?.id, selectedCourse?.title, selectCourse]);


  useEffect(() => {
    lastRunKeyRef.current = null;
  }, [selectedCourse?.id, customTitle]);

  useEffect(() => {
    dlog('state: canStartNow/busyUi update', {
      canStartNow,
      busyUi,
      isAiBusy,
      activeRunId,
      startMutex: startMutexRef.current,
      customTitle: customTitle.trim(),
      selectedCourseId: selectedCourse?.id || null,
      step,
      ttsLoading,
    });
  }, [canStartNow, busyUi, isAiBusy, activeRunId, customTitle, selectedCourse, step, ttsLoading]);

  useEffect(() => {
    dlog('state: ai progress', {
      step,
      ttsLoading,
      outlineLen: outline.length,
      lessonsLen: lessons.length,
      selectedCourseId: selectedCourse?.id || null,
      error: aiError || null,
    });
  }, [step, ttsLoading, outline, lessons, selectedCourse]);

  // ── Effects that depend on deriveds ──────────────────────

  useEffect(() => {
    if (activeRunId === null) {
      setPreparing(false);
      return;
    }

    const shouldPrepare =
      step === 'outlining' ||
      step === 'narrating' ||
      !!ttsLoading ||
      !hasAIContent ||
      playerLoading ||
      !playerReady;

    setPreparing(shouldPrepare);
  }, [activeRunId, step, ttsLoading, hasAIContent, playerLoading, playerReady]);

  useEffect(() => {
  // ✅ Only reset when user changes course while NOT in a start/run
  if (activeRunId !== null || preparing || starting) return;

  setBlockedUntilStart(true);
  setLockedSsml(null);
  setPlayerReady(false);
  setPlayerLoading(false);
}, [selectedCourse?.id, activeRunId, preparing, starting]);


  useEffect(() => {
    if (!isLockedLearner) return;
    const lc = (orgAssign as any)?.lockedConfig || {};
    if (typeof lc.minutes === 'number') setMinutes(capMinutes(lc.minutes));
    if (typeof lc.totalLessons === 'number') setTotalLessons(Math.max(1, lc.totalLessons));
    if (typeof lc.quizSize === 'number') setQuizCount(Math.max(4, lc.quizSize));
  }, [isLockedLearner, orgAssign?.lockedConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isLockedLearner && !overrideLessons) setTotalLessons(trackLessons);
    if (!isLockedLearner && !overrideQuiz) setQuizCount(defaultQuizForLessons(trackLessons));
  }, [trackLessons, isLockedLearner, overrideLessons, overrideQuiz]);

  useEffect(() => {
    if (!restrictStarter || isLockedLearner) return;
    setMinutes((m: number) => capMinutes(m));
    setTotalLessons(trackLessons);
    setQuizCount(16);
  }, [restrictStarter, trackLessons, isLockedLearner]);

  useEffect(() => {
    dlog('env', {
      backendUrl,
      tokenPresent: Boolean(token),
      canShareUi,
      isInstructor,
      activeOrgId,
      isOrgFlow,
    });
  }, [backendUrl, token, canShareUi, isInstructor, activeOrgId, isOrgFlow]);

  // ── Data loading & selection ─────────────────────────────
  const [sharedCourseMissing, setSharedCourseMissing] = useState(false);
  const [sharedCourseChecked, setSharedCourseChecked] = useState(false);
  
  

  useEffect(() => {
  let cancelled = false;

  (async () => {
    setCoursesLoadDone(false);

    const preserveIds = [desiredCourseId].filter(Boolean) as string[];
    try {
      dlog('loadTopCourses:init {limit:200, preserveIds}', { preserveIds });
      await loadTopCourses?.({ limit: 200, preserveIds } as any);
    } catch {
      try {
        await loadTopCourses?.();
      } catch {}
    } finally {
      if (!cancelled) setCoursesLoadDone(true);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [desiredCourseId, loadTopCourses]);

  const shareHasAssignment = Boolean(qpAssignmentId); // ✅ only link param
  const validateAgainstTopCourses = Boolean(
  wantedCourseId && !shareHasAssignment && !isOrgFlow && !isSandboxSource
);



useEffect(() => {
  let cancelled = false;

  (async () => {
    if (!backendUrl) return;
    if (!authToken) return; // sandbox courses are usually private
    if (!isSandboxSource) return;
    if (!wantedCourseId) return;

    // if URL already provides a title, don't fetch
    if (qpCourseTitle && qpCourseTitle.trim()) return;

    // if we already have a meaningful title, don't fetch
    const existing = String(selectedCourse?.title || '').trim();
    if (existing && existing !== 'Assigned Course') return;

    try {
      const base = backendUrl.replace(/\/+$/, '');
      const url = `${base}/api/courses/${encodeURIComponent(wantedCourseId)}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!r.ok) return;

      const j: any = await r.json().catch(() => null);
      const t = String(j?.title ?? j?.course?.title ?? '').trim();
      if (!t) return;

      if (!cancelled) setFetchedRouteTitle(t);
    } catch {}
  })();

  return () => {
    cancelled = true;
  };
}, [backendUrl, authToken, isSandboxSource, wantedCourseId, qpCourseTitle, selectedCourse?.title]);

 useEffect(() => {
  if (!wantedCourseId) return;
  if (!coursesLoadDone) return;

  const list = Array.isArray(topCourses) ? topCourses : [];
  const selectedId = selectedCourse ? normId(selectedCourse.id) : null;
  if (selectedId === wantedCourseId) return;

  const found = list.find((c) => normId(c.id) === wantedCourseId) || null;

  if (found) {
    setPreparing(false);
    setActiveRunId(null);
    setBlockedUntilStart(true);
    setLockedSsml(null);
    selectCourse(found);
    return;
  }

  // ✅ sandbox courses won’t be in topCourses; seed minimal so UI works
  if (isSandboxSource) {
    dlog('sandbox shared course not in top list → seed synthetic', { wantedCourseId });
    selectCourse({
      id: wantedCourseId,
     title: displayTitle,
      blurb: '',
      rating: 0,
      reviews: 0,
    } as any);
  }
}, [
  wantedCourseId,
  coursesLoadDone,
  topCourses,
  selectedCourse?.id,
  selectCourse,
  isSandboxSource,
  titleInfo.title,
]);


 useEffect(() => {
  if (!assignedCourseId) return;
  if (!coursesLoadDone) return;

  // don’t wipe progress if already running/ready
  if (hasAIContent || step !== 'idle') return;

  const selId = normId(selectedCourseRef.current?.id || selectedCourse?.id || '');
  if (selId === assignedCourseId) return;

  const list = Array.isArray(topCourses) ? topCourses : [];
  const found = list.find((c) => normId(c.id) === assignedCourseId) || null;

  if (found) {
    dlog('auto-select assignment course', { assignedCourseId, title: found.title });
    selectCourse(found);
  } else {
    // seed a minimal course so quiz/cert flows don’t get blocked by selectedCourse=null
    dlog('assignment course missing from list → seed synthetic', { assignedCourseId });
    selectCourse({
      id: assignedCourseId,
      title: titleInfo.title,
      blurb: '',
      rating: 0,
      reviews: 0,
    } as any);
  }
}, [assignedCourseId, coursesLoadDone, topCourses, hasAIContent, step, selectCourse, titleInfo.title]);

useEffect(() => {
  if (activeRunId === null) return;
  if (step !== 'error' && !aiError) return;

  dlog('run reset on ai error', { step, aiError });
  setActiveRunId(null);
  setPreparing(false);
  setPlayerLoading(false);
  setPlayerReady(false);
}, [activeRunId, step, aiError]);


 useEffect(() => {
  if (!validateAgainstTopCourses) {
    setSharedCourseMissing(false);
    setSharedCourseChecked(false);
    return;
  }

  if (!coursesLoadDone) return;

  const list = Array.isArray(topCourses) ? topCourses : [];
  const foundInList = list.some((c) => normId(c.id) === wantedCourseId);
  const selectedMatches = selectedCourse && normId(selectedCourse.id) === wantedCourseId;

  setSharedCourseMissing(!(foundInList || selectedMatches));
  setSharedCourseChecked(true);
}, [
  validateAgainstTopCourses,
  coursesLoadDone,
  topCourses,
  wantedCourseId,
  selectedCourse?.id,
]);

  useEffect(() => {
    if (isLockedLearner) setShareOpen(false);
  }, [isLockedLearner]);

  useEffect(() => {
    if (
      !selectedCourse &&
      Array.isArray(topCourses) &&
      topCourses.length > 0 &&
      !customTitle.trim()
    ) {
      // ✅ DO NOT override locked selection from share link
      if (locked && qpCourseId) return;

      // old behavior (only when NOT locked and no explicit courseId)
      if (!courseIdParam) {
        dlog('auto-selecting first course', { id: topCourses[0]?.id, title: topCourses[0]?.title });
        selectCourse(topCourses[0]);
      }
    }
  }, [topCourses, selectedCourse, selectCourse, customTitle, courseIdParam, locked, qpCourseId]);

  const coursesCursor = (ai as any)?.coursesCursor ?? (ai as any)?.nextCursor ?? null;
  const hasMoreCourses: boolean = Boolean(
    (ai as any)?.hasMoreCourses ?? (ai as any)?.coursesHasMore ?? (ai as any)?.hasMore
  );
  const degraded: boolean = Boolean((ai as any)?.degradedNotice?.degraded);

  const handleLoadMore = async () => {
    const preserveIds = [desiredCourseId].filter(Boolean) as string[];
    const opts = coursesCursor
      ? { append: true, cursor: coursesCursor, limit: 200, preserveIds }
      : { append: true, page: 'next', limit: 200, preserveIds };
    try {
      dlog('loadTopCourses:more', opts);
      await loadTopCourses?.(opts as any);
    } catch {
      try {
        await loadTopCourses?.({ append: true, preserveIds } as any);
      } catch {
        await loadTopCourses?.({ preserveIds } as any);
      }
    }
  };

  const handlePlayerLoadingChange = useCallback(
    (b: boolean) => {
      if (activeRunId === null) return;
      setPlayerLoading((prev) => (prev === b ? prev : b));
      // ⛔ don’t setPreparing here; let your existing effect compute preparing
    },
    [activeRunId]
  );

  const handlePlayerReady = useCallback(() => {
    // only mark ready for an active run (prevents stale “ready” from old mounts)
    if (activeRunId === null) return;
    setPlayerReady(true);
    setPlayerLoading(false);
  }, [activeRunId]);

  const refreshCourseList = useCallback(async () => {
    const preserveIds = courseIdParam ? [courseIdParam] : [];
    dlog('refreshCourseList → clearTopCoursesCacheNow + reload', { preserveIds });
    try {
      await clearTopCoursesCacheNow?.();
    } catch {}
    try {
      await loadTopCourses?.({ limit: 200, preserveIds } as any);
    } catch {
      await loadTopCourses?.({ preserveIds } as any);
    }
  }, [clearTopCoursesCacheNow, loadTopCourses, courseIdParam]);

  // Lesson list with stable id
  const lessonsArr = useMemo(() => {
    const L = typeof getLessonAt === 'function' ? getLessonAt(currentIdx) : null;
    if (!L) return [];
    const stableId = (L as any).id ?? `${selectedCourse?.id || 'course'}:${currentIdx}`;
    return [{ ...L, id: stableId }];
  }, [getLessonAt, currentIdx, selectedCourse?.id]);

  useEffect(() => {
    if (hasAIContent && typeof window !== 'undefined' && window.innerWidth < 768) {
      dlog('mobile: auto-maximize classroom');
      setIsMaximized(true);
    }
  }, [hasAIContent]);

  // ── Auth helpers ─────────────────────────────────────────
  const goToLoginWithReturn = (reason?: string, message?: string) => {
    const next = `${location.pathname}${location.search}${location.hash}`;
    try {
      sessionStorage.setItem('auth:returnTo', next);
    } catch {}

    // If we're in an org/assignment flow, prefer the institution login page
    const dest = isOrgFlow || orgToken ? '/org/login' : '/login';

    dlog('navigate → login', {
      dest,
      reason,
      message,
      next,
      isOrgFlow,
      hasToken: !!token,
      hasOrgToken: !!orgToken,
    });

    navigate(dest, { state: { next, reason, message }, replace: true });
  };

  const requireAuth = (reason?: string, message?: string) => {
    // ✅ Accept either normal user token or org token
    if (authToken) return true;
    goToLoginWithReturn(reason, message);
    return false;
  };

  // ── Quiz helpers ─────────────────────────────────────────
  const disableQuiz = Boolean(
    (isOrgFlow && (orgAssign?.expired || (localRemainingMs !== null && localRemainingMs <= 0))) ||
      grade
  );
  const handleAnswer = useCallback(
    (qid: string, value: number | string) => {
      if (disableQuiz) return;
      answerQuestion(qid, value);
    },
    [disableQuiz, answerQuestion]
  );

  // ── Start course (uses deriveds above) ───────────────────
  const onStart = useCallback(async () => {
    if (starting || !canStartNow) {
      dlog('onStart: ignored', {
        starting,
        canStartNow,
        activeRunId,
        startMutex: startMutexRef.current,
      });
      return;
    }

    const custom = customTitle.trim();
    const cid = effectiveCourseIdForStart;

   if (!custom && !cid) {
      window.alert('Pick a course or type a topic first.');
      return;
    }
    


    setStarting(true);
    setBlockedUntilStart(false);

    // ⬇️ ensure we reuse the same knobs for both top list & sandbox
    const courseSize = sizeToCourseSize[sizePreset];
    const opts: any = {
      assignmentId: assignmentIdForAi,
      courseSize,
      level: classLevel,
      minutes: minutesEffective,
      programTrack,
      totalLessons: safeLessons,
      voiceName: effectiveVoice,
    };

    // mark run + spinner + reset player
    const id = ++runIdRef.current;
    setActiveRunId(id);
    setPreparing(true);
    setPlayerReady(false);
    setPlayerLoading(true);
    setLockedSsml(null);

   try {
  // -------- custom topic flow (Teach me) ----------
  if (custom) {
    const ok = requireAuth('ai_sandbox', 'Please sign in to create a custom AI course.');
    if (!ok) {
      setActiveRunId(null);
      setPreparing(false);
      setPlayerLoading(false);
      return;
    }
    dlog('onStart → startCustomTopic (sandbox)', { custom, opts });
    await startCustomTopic(custom, opts);
    await waitForSelection();
    return;
  }

  // ✅ REPLACE EVERYTHING BELOW WITH THIS
  if (cid) opts.courseId = cid;

  dlog('onStart → startWithAI', { opts, cid, wantedCourseId });
  await startWithAI(opts);
  return;
} catch (e) {
  console.error('[RobotTeacher.web:onStart] failed', e);
  setActiveRunId(null);
  setPreparing(false);
  setPlayerLoading(false);
} finally {
  setStarting(false);
}

  }, [
    starting,
    canStartNow,
    customTitle,
    selectedCourse,
    assignmentIdForAi,
    sizePreset,
    classLevel,
    minutesEffective,
    programTrack,
    safeLessons,
    effectiveVoice,
    courseIdParam,
    startCustomTopic,
    startWithAI,
    loadTopCourses,
    selectCourse,
    requireAuth,
  ]);

  const onRequestStartGuarded = useCallback(() => {
    // Player may ask to "start" — ignore if we already have content or we're busy
    if (blockedUntilStart) return;
    if (!canStartNow) {
      dlog('onRequestStartGuarded ignored (already has content or busy)');
      return;
    }
    if (activeRunId === null) setActiveRunId(++runIdRef.current);
    onStart();
  }, [blockedUntilStart, activeRunId, onStart, canStartNow]);

  const refreshSelectedAI = useCallback(async () => {
    if (!selectedCourse) return;
    const ok = window.confirm(
      'Refresh this course’s AI content?\n\nThis clears the cached outline, narration, and quiz, then regenerates fresh content.'
    );
    if (!ok) return;
    dlog('refreshSelectedAI → clearSelectedCourseCacheNow then reseed', {
      courseId: selectedCourse.id,
    });
    try {
      await clearSelectedCourseCacheNow?.();
    } catch {}
    selectCourse(selectedCourse);
    await onStart();
  }, [selectedCourse, clearSelectedCourseCacheNow, selectCourse, onStart]);

  return (
    <div className="text-darkText dark:text-white">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6">
        {/* LEFT */}
        <div
          className={`order-1 space-y-4 sm:space-y-6 ${!isLockedLearner ? 'md:col-span-8' : 'md:col-span-12'}`}
        >
          <header className="space-y-1">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-darkText dark:text-white">
              AI Tutor Studio
            </h1>

            {/* ADD THIS */}
            <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 rounded-full bg-white/5 ring-1 ring-white/10">
              <span className="text-xs text-gray-600 dark:text-white/70">Now learning:</span>
              <span className="text-sm font-semibold truncate max-w-[60vw]">{displayTitle}</span>

              {dbgEnabled() ? (
                <span className="text-[10px] opacity-70">({titleInfo.source})</span>
              ) : null}
            </div>
            {programTrackLocked ? (
              <div className="mt-2 text-[11px] text-gray-600 dark:text-white/70">
                {(() => {
                  const reqs = getProgramTrackRequirements(programTrack);
                  return `${reqs.label} track: ${reqs.lessons} lessons • ${reqs.questions} questions`;
                })()}
                {dbgEnabled() ? (
                  <span className="ml-2 text-[10px] opacity-70">
                    (locked via {programTrackLockSource || 'default'})
                  </span>
                ) : null}
              </div>
            ) : null}
            <p className="text-sm sm:text-base text-gray-600 dark:text-white/75">
              Free lesson (audio + captions + slides) and quiz. Score{' '}
              <span className="font-semibold">≥ 70%</span> to unlock your certificate
              {isOrgFlow ? ' — covered by your organization' : ''}.
            </p>
           {validateAgainstTopCourses && sharedCourseChecked && sharedCourseMissing && (
              <div className="text-sm text-amber-700 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3 py-2">
                Shared course not found. Please ask your instructor to resend the link.
              </div>
            )}
          </header>

          {/* Org share dialog */}
          <OrgShareDialog
            open={canShareUi && shareOpen}
            onClose={() => setShareOpen(false)}
            courseId={selectedCourse?.id || null}
           courseTitle={displayTitle}
            totalLessons={safeLessons}
            quizCount={safeQuiz}
            minutes={capMinutes(minutes)}
          />

          {degraded && (
            <div className="panel p-3 text-sm text-yellow-800 dark:text-yellow-200 bg-yellow-50 dark:bg-yellow-500/10 ring-yellow-200 dark:ring-yellow-500/40">
              High demand fallback: content may be simplified, but your progress still counts.
            </div>
          )}

          {/* Step indicator */}
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {[
              { k: 'course', label: 'Choose' },
              { k: 'outline', label: 'Outline' },
              { k: 'lessons', label: 'Lessons' },
              { k: 'quiz', label: 'Quiz' },
              { k: 'cert', label: 'Certificate' },
            ].map((s, i) => {
              const active =
                (i === 0 && !outline.length) ||
                (i === 1 && step === 'outlining') ||
                (i === 2 && (step === 'narrating' || hasAIContent)) ||
                (i === 3 && (quiz?.questions?.length || step === 'quizzing')) ||
                (i === 4 && Boolean(grade?.passed));
              return (
                <div
                  key={s.k}
                  className={`px-2 py-1 rounded-full ring-1 ${
                    active
                      ? 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg白/15 dark:text-white dark:ring-white/30'.replace(
                          '白',
                          'white'
                        )
                      : 'bg-white text-gray-700 ring-gray-200 dark:bg-white/5 dark:text-white/70 dark:ring-white/10'
                  }`}
                >
                  {i + 1}. {s.label}
                </div>
              );
            })}
          </div>

          {/* Controls */}
          <ControlsPanel
  showMinimalControls={isLockedLearner}
  isLockedLearner={isLockedLearner}
  programTrackLocked={programTrackLocked}
  busy={busyUi}
  canShareUi={canShareUi}
  restrictStarter={restrictStarter}
  knobsDisabled={knobsDisabled}
  onOpenShare={() => {
    setIsMaximized(false);
    setShareOpen(true);
  }}
  topCourses={(topCourses || []).map((c: TopCourse) => ({ id: c.id, title: c.title }))}
  selectedCourse={selectedCourse ? { id: selectedCourse.id, title: selectedCourse.title } : null}
  displayCourseTitle={displayTitle}
  onSelectCourse={(id) => {
    setPreparing(false);
    setActiveRunId(null);
    setBlockedUntilStart(true);
    const found = (topCourses || []).find((c) => c.id === id) || null;
    dlog('CourseSelect.onChange/Select →', { id, foundTitle: found?.title });
    selectCourse(found);
  }}
  PRESETS={PRESETS}
  TRACKS={TRACKS}
  trackLessons={trackLessons}
  sizePreset={sizePreset}
  setSizePreset={setSizePreset}
  minutes={minutes}
  setMinutes={setMinutes}
  classLevel={classLevel}
  setClassLevel={setClassLevel}
  programTrack={programTrack}
  setProgramTrack={setProgramTrackFromUi}  // ✅ wrapper fixes TS mismatch
  capMinutes={capMinutes}
  customTitle={customTitle}
  setCustomTitle={(s) => {
    setCustomTitle(s);
    if (s.trim()) selectCourse(null);
  }}
  hasAIContent={hasAIContent}
  onStart={onStart}
  onRefreshSelectedAI={refreshSelectedAI}
  totalLessons={totalLessons}
  setTotalLessons={setTotalLessons}
  quizCount={quizCount}
  setQuizCount={setQuizCount}
  overrideLessons={overrideLessons}
  setOverrideLessons={setOverrideLessons}
  overrideQuiz={overrideQuiz}
  setOverrideQuiz={setOverrideQuiz}
  canStartNow={canStartNow}
/>


          {/* Classroom + Outline + Quiz */}
          <LessonAndQuizPane
            compactPlayer={compactPlayer}
            showCourseList={!isLockedLearner}
            onNext={goNext}
            onPrev={goPrev}
            onPlayerReady={handlePlayerReady}
            isAdmin={Boolean(isGlobalAdmin || isAdminOwner)}
            isBuildingNext={isBuildingNext}
            lessonsArr={lessonsArr}
            voiceName={voiceName || defaultVoice}
            courseTitle={displayTitle}
            isMaximized={isMaximized}
            onToggleMaximized={() => setIsMaximized((v) => !v)}
            course={selectedCourse || null}
            outline={outline}
            currentIdx={currentIdx}
            backendUrl={backendUrl}
            hasJoined={hasJoined}
            gateMode={gateMode}
            gateNotice={gateNotice}
            gateUsage={gateUsage}
            displaySsml={displaySsml}
            onBeforePlay={onBeforePlayWrapped}
            onEnded={onEndedWrapped}
            onStart={onStart}
            onPlayerLoadingChange={handlePlayerLoadingChange}
            themeOpen={themeOpen}
            onThemeOpenChange={(open) => {
              dlog('themeOpen →', open);
              setThemeOpen(open);
            }}
            isOrgFlow={isOrgFlow}
            assignmentId={assignmentId}
            timerSec={timerSec}
            generateQuizNow={async (
              count,
              _courseSize,
              _programTrack,
              _totalLessons,
              assignmentIdFromChild,
              quizType,
              opts?: { lessonIndex?: number }
            ) => {
              await generateQuizNow(
                count,
                sizeToCourseSize[sizePreset],
                programTrack,
                safeLessons,
                assignmentIdFromChild ?? assignmentIdForAi,
                quizType,
                opts
              );
            }}
            safeLessons={safeLessons}
            safeQuiz={safeQuiz}
            quiz={quiz}
            answers={answers}
            onAnswer={handleAnswer}
            allAnswered={allAnswered}
            grade={grade}
            gradeNow={async () => {
              await gradeNow();
            }}
            token={authToken || ''}
            requireAuth={requireAuth}
            isOrgFlowFlag={isOrgFlow}
            skus={skus}
            aiCertLoading={aiCertLoading}
            aiCertError={aiCertError}
            aiCertMsg={aiCertMsg}
            claim={async (code) => {
              await claim(code);
            }}
            tryGenerateCertificate={tryGenerateCertificate}
            generateAICert={generateAICert}
            paymentOpen={paymentOpen}
            setPaymentOpen={setPaymentOpen}
            certUrl={certUrl}
            setCertUrl={setCertUrl}
            downUrl={downUrl}
            setDownUrl={setDownUrl}
            localRemainingMs={localRemainingMs}
            setLocalRemainingMs={setLocalRemainingMs}
            displayRemainingMs={displayRemainingMs}
            disableQuiz={disableQuiz}
            onViewResults={(courseId, courseTitle, g) => {
              dlog('navigate → /results', { courseId, courseTitle, grade: g });
              navigate('/results', {
                state: {
                  courseId,
                  courseTitle,
                  grade: { scorePct: g.scorePct, passMark: g.passMark, passed: g.passed },
                },
              });
            }}
          />
        </div>

        {/* RIGHT: course list */}
        {!isLockedLearner && (
          <aside className="md:col-span-4 order-2">
            <div className="md:sticky md:top-20 space-y-3">
              <CourseList
                items={(topCourses || []).map((c: TopCourse) => ({
                  id: c.id,
                  title: c.title,
                  blurb: getCourseBlurb(c),
                }))}
                activeId={selectedCourse?.id || null}
                onSelect={(id) => {
                  const found = (topCourses || []).find((c) => c.id === id) || null;
                  dlog('CourseList.onSelect', { id, title: found?.title });
                  setPreparing(false);
                  setActiveRunId(null);
                  setBlockedUntilStart(true);
                  setLockedSsml(null);
                  selectCourse(found);
                }}
                onRefresh={refreshCourseList}
                onLoadMore={handleLoadMore}
                hasMore={Boolean(hasMoreCourses)}
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

export default RobotTeacher;
