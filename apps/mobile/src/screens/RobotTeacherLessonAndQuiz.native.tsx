// apps/mobile/src/screens/RobotTeacherLessonAndQuiz.native.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Linking,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import tw from '../../tailwind';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QuizConfirmModal from './QuizConfirmModal.native';
import Markdown from '@/screens/Markdown.native';
import { useShopContext } from '@mytutorapp/shared/context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ClassroomThemeShell from '@/screens/ClassroomThemeShell.native';
import PaymentWidget from './PaymentWidget.native';
import { downloadCertificateFile, downloadTranscriptFile } from '@mytutorapp/shared/api';
import type { DbCourseSize, ProgramTrack } from '@mytutorapp/shared/types';
import AntiCheatGuard from './AntiCheatGuard.native';
import { useAttemptIntegrity } from '@mytutorapp/shared/hooks/useAttemptIntegrity';
import { getStableDeviceId } from '@mytutorapp/shared/utils/deviceId';

// ─────────────────────────────────────────────────────────
// fmt helpers
// ─────────────────────────────────────────────────────────
const fmtDuration = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${String(sec).padStart(2, '0')}s` : `${sec}s`;
};
const fmtHMS = (totalSeconds: number) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};
const fmtHMSms = (ms: number) => fmtHMS(Math.floor(Math.max(0, ms) / 1000));

// ---- Quiz size helpers (match web) ----
const MIN_PER_LESSON = 4;
const isInt = (n: unknown) => Number.isInteger(typeof n === 'string' ? Number(n) : n);

function minQuestionsFor(totalLessons: number, opts?: { lessonIndex?: number }) {
  const units = isInt(opts?.lessonIndex) ? 1 : Math.max(1, Number(totalLessons) || 0);
  return MIN_PER_LESSON * units;
}
function applyMinPerLesson(
  requested: number | undefined | null,
  totalLessons: number,
  opts?: { lessonIndex?: number }
) {
  const req = Number(requested ?? 0);
  const minQ = minQuestionsFor(totalLessons, opts);
  return Math.max(minQ, Number.isFinite(req) ? req : 0);
}

// ---- Cert/transcript id helpers (match web) ----
const extractCertId = (docOrUrl: any): string | null => {
  const direct = docOrUrl?.certId || docOrUrl?.certificateId || docOrUrl?.id;
  if (typeof direct === 'string' && direct) return direct;
  const u = String(docOrUrl?.download_url || docOrUrl?.downloadUrl || docOrUrl?.url || docOrUrl || '');
  const m =
    u.match(/\/certificates\/([^/]+)\/(?:download|view|raw)?/i) ||
    u.match(/[?&]certId=([^&]+)/i);
  return m?.[1] ?? null;
};
const extractTranscriptId = (docOrUrl: any): string | null => {
  const direct = docOrUrl?.transcriptId || docOrUrl?.id;
  if (typeof direct === 'string' && direct) return direct;
  const u = String(docOrUrl?.download_url || docOrUrl?.url || docOrUrl || '');
  const m = u.match(/\/transcripts\/([^/]+)\/(?:download|view|raw)?/i);
  return m?.[1] ?? null;
};
const slug = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'document';

// ─────────────────────────────────────────────────────────
// types
// ─────────────────────────────────────────────────────────
interface LessonAndQuizProps {
  compactPlayer: boolean;
  showCourseList: boolean;
  onPlayerReady?: () => void;
  // classroom
  displaySsml: string;
  onNext?: () => Promise<boolean> | boolean;
  onPrev?: () => boolean | Promise<boolean>;
  isBuildingNext?: boolean;
  lessonsArr: any[];
  voiceName: string;
  currentIdx: number;
   activeIndex?: number;
  courseTitle: string;
  onOverlayState?: (s: { words: any[]; currentIndex: number; lesson: any | null }) => void;
  isMaximized: boolean;
  onPlayerLoadingChange?: (loading: boolean) => void;
  onToggleMaximized: () => void;
  onStart?: () => Promise<void> | void;     // ← add
   hasJoined?: boolean;   
   canAutoStart?: boolean;                    // ← add
  course: any;
  outline: any[];
  backendUrl: string;
  onBeforePlay: () => Promise<void> | void;
  onEnded: () => void;
  onRequestStart?: (meta?: { reason?: string; courseId?: string; lessonId?: string }) => void;
  onRequestEnd?: (meta?: { reason?: string; ok?: boolean; error?: string }) => void;
  themeOpen: boolean;
  onThemeOpenChange: (open: boolean) => void;
  // outline → quiz
  isOrgFlow: boolean;
  assignmentId?: string;
  timerSec: number;
  urlQuizTypeHint?: 'mcq' | 'short';
  generateQuizNow: (
    numQuestions?: number,
    courseSize?: DbCourseSize,
    programTrack?: ProgramTrack,
    totalLessons?: number,
    assignmentId?: string,
    quizType?: 'mcq' | 'short',
    opts?: { lessonIndex?: number }
  ) => Promise<void> | void;
  safeLessons: number;
  safeQuiz: number;
  overrideLessons?: boolean;

  // quiz
  quiz: any;
  answers: Record<string, number | string>;
  onAnswer: (qid: string, value: number | string) => void;
  allAnswered: boolean; // (kept for compatibility)
  grade: any;
  gradeNow: () => Promise<void> | void;
  token: string;
  requireAuth: (reason?: string, message?: string) => boolean;
  // cert + payments
  isOrgFlowFlag: boolean;
  skus: any[] | undefined;
  aiCertLoading: boolean;
  aiCertError: string | null | undefined;
  aiCertMsg: string | null | undefined;
  claim: (code: string) => Promise<void>;
  tryGenerateCertificate: () => Promise<any>;
  generateAICert: () => Promise<any>;
  paymentOpen: boolean;
  setPaymentOpen: (b: boolean) => void;
  certUrl: string | null;
  setCertUrl: (s: string | null) => void;
  downUrl: string | null;
  setDownUrl: (s: string | null) => void;
  // timer + lock
  localRemainingMs: number | null;
  setLocalRemainingMs: (ms: number | null) => void;
  displayRemainingMs: number;
  disableQuiz: boolean;
  // results
  onViewResults: (courseId: string, courseTitle: string, grade: any) => void;
  /** Admins can reveal short-answer solutions; learners cannot */
  isAdmin?: boolean;
  
}

const LessonAndQuizPane: React.FC<LessonAndQuizProps> = ({
  compactPlayer,
  showCourseList,
  displaySsml,
  lessonsArr,
  onNext,
  onPrev,
  isBuildingNext,
  voiceName,
  courseTitle,
  isMaximized,
  onToggleMaximized,
  course,
  outline,
  backendUrl,
  onBeforePlay,
  onEnded,
  themeOpen,
  onThemeOpenChange,
  isOrgFlow,
  assignmentId,
  timerSec,
  urlQuizTypeHint,
  generateQuizNow,
  safeLessons,
  safeQuiz,
  quiz,
  overrideLessons,
  answers,
  onAnswer,
  grade,
  gradeNow,
  token,
  requireAuth,
  isOrgFlowFlag,
  skus,
  aiCertLoading,
  aiCertError,
  onPlayerReady,
  onStart,          // ← add
  hasJoined,        // ← add
  canAutoStart = false,
  aiCertMsg,
  claim,
  tryGenerateCertificate,
  generateAICert,
  paymentOpen,
  setPaymentOpen,
  certUrl,
  setCertUrl,
  downUrl,
  setDownUrl,
  localRemainingMs,
  setLocalRemainingMs,
  displayRemainingMs,
  disableQuiz,
  onViewResults,
  isAdmin = false,
  currentIdx,
  activeIndex,
  onPlayerLoadingChange,
  onOverlayState,
}) => {
  // Prop sanity
  if (typeof generateQuizNow !== 'function') {
    console.warn('[LessonAndQuizPane] generateQuizNow prop is missing or not a function.');
  }

  const [innerPlayerReady, setInnerPlayerReady] = useState(false);
  const forwardedReadyRef = useRef(false);

  const {
    attempt, attemptId,
    deviceId: boundDeviceId, bindDeviceId,
    quizActive, markActive, markNotActive,
    elapsedMs, backgrounds, suspicions,
    start: startAttempt,
    submit: submitAttempt,
    bumpSuspicion,
  } = useAttemptIntegrity(backendUrl, token);

  const onPlayerLoadingChangeRef = useRef(onPlayerLoadingChange);

useEffect(() => {
  onPlayerLoadingChangeRef.current = onPlayerLoadingChange;
}, [onPlayerLoadingChange]);

useEffect(() => {
  forwardedReadyRef.current = false;
  setInnerPlayerReady(false);
  onPlayerLoadingChangeRef.current?.(true);
}, [displaySsml, currentIdx, lessonsArr?.[0]?.id]);

  
useEffect(() => {
  lessonsArrRef.current = Array.isArray(lessonsArr) ? lessonsArr : [];
}, [lessonsArr]);

useEffect(() => {
  currentIdxRef.current = Number(currentIdx ?? 0);
}, [currentIdx]);

const lastEmitRef = useRef(0);
const SENT_END = /[.!?…]+["')\]]?$/;

const handleWordSync = useCallback(
  
  (p: { words: any[]; currentIndex: number }) => {
    if (!onOverlayState) return;

    const now = Date.now();
    const w = p.words?.[p.currentIndex]?.text ?? '';
    const shouldEmit = SENT_END.test(String(w)) || (now - lastEmitRef.current > 250);
    if (!shouldEmit) return;

    lastEmitRef.current = now;

    const idx = currentIdxRef.current;
    const arr = lessonsArrRef.current;
    const lessonForOverlay = arr[idx] ?? arr[0] ?? null;

    onOverlayState({
      words: p.words || [],
      currentIndex: Number(p.currentIndex) || 0,
      lesson: lessonForOverlay,
    });
  },
  [onOverlayState]
);

  useEffect(() => {
    (async () => {
      const id = await getStableDeviceId();
      bindDeviceId(id);
    })();
  }, [bindDeviceId]);

  const hasRenderableLesson = useMemo(() => {
    const first = Array.isArray(lessonsArr) ? lessonsArr[0] : null;
    const perLessonOk = !!(first?.ssml && String(first.ssml).trim().length > 0);
    const joinedOk = !!(displaySsml && String(displaySsml).trim().length > 0);
    return perLessonOk || joinedOk;
  }, [lessonsArr, displaySsml]);

  useEffect(() => {
  if (innerPlayerReady && hasRenderableLesson && !forwardedReadyRef.current) {
    forwardedReadyRef.current = true;
    onPlayerReady?.();
  }
}, [innerPlayerReady, hasRenderableLesson, onPlayerReady]);


  const { width, height: winH } = useWindowDimensions();
const insets = useSafeAreaInsets();
const horizontalPadding = 24;
const maxWidth = Math.min(width - horizontalPadding, 1088);
const OUTLINE_GAP = 24;
const SAFE_V = (insets?.top ?? 0) + (insets?.bottom ?? 0);

// ───────── More compact player height ─────────
// Base maximum we are allowed to use (screen minus margins/safe-area)
const baseMax = Math.max(280, winH - OUTLINE_GAP - SAFE_V);

// ~40–45% of the screen in normal mode, up to baseMax
const compactHeight = Math.min(baseMax, winH * 0.60);

// ~75% of the screen when maximized, up to baseMax
const maximizedHeight = Math.min(baseMax, winH * 0.75);

// Final height: smaller by default, taller only when maximized
const desiredHeight = isMaximized ? maximizedHeight : compactHeight;

  // ───────────────────────────────────────────────────────
  // state
  // ───────────────────────────────────────────────────────
  const { tokens = 0, refreshUserDetails } = useShopContext();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmInfo, setConfirmInfo] = useState<{ lessons: number; questions: number; timeLabel: string } | null>(null);

  const startingAttemptRef = useRef(false);
  const submittingRef = useRef(false);
  const shownLockAlertRef = React.useRef(false);
const lessonsArrRef = useRef<any[]>([]);
const currentIdxRef = useRef<number>(0);
  const [pendingQuizGen, setPendingQuizGen] = useState(false);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPlayClickRef = useRef(0);
  const guardedBeforePlay = useCallback(async () => {
    const now = Date.now();
    if (now - lastPlayClickRef.current < 400) return;
    lastPlayClickRef.current = now;
    await onBeforePlay?.();
  }, [onBeforePlay]);

  const [forceUnlock, setForceUnlock] = useState(false);

  // math keypad (native: modal bottom sheet)
  const [mathOpen, setMathOpen] = useState(false);
  const lastShortQidRef = useRef<string | null>(null);
  const [shortHeights, setShortHeights] = useState<Record<string, number>>({});

  // org-locked config read at runtime
  const [orgMeta, setOrgMeta] = useState<{
    quizSize?: number;
    totalLessons?: number;
    timer_s?: number;
    quizType?: 'mcq' | 'short';
  } | null>(null);

  // working answers (number | string)
  const [retakeMode, setRetakeMode] = useState(false);
  const [workingAnswers, setWorkingAnswers] = useState<Record<string, number | string | undefined>>({});

  // certificate persistence (AsyncStorage)
  const lsKey = useMemo(() => (course?.id ? `cert:last:${course.id}` : null), [course?.id]);
  const [persistedCert, setPersistedCert] = useState<{
    certUrl?: string | null;
    downUrl?: string | null;
    certId?: string | null;
    courseId?: string | null;
    courseTitle?: string | null;
    ts?: number;
  } | null>(null);
  const [hideCertPill, setHideCertPill] = useState(false);
  const [paymentOk, setPaymentOk] = useState(false);

  // NEW: standard vs extended flags
  const [certPaid, setCertPaid] = useState(false);
  const [extendedPaid, setExtendedPaid] = useState(false);

  const looksExtendedSku = (sku: any): boolean => {
    const s = (v: any) => (typeof v === 'string' ? v.toLowerCase() : '');
    const title = s(sku?.title);
    const code = s(sku?.code);
    const tier = s(sku?.tier || sku?.plan || sku?.level || sku?.kind);
    const tags = Array.isArray(sku?.tags) ? sku.tags.map(s) : [];
    return (
      tier.includes('extended') ||
      title.includes('extended') ||
      title.includes('transcript') ||
      /\b(ext|extended|xtra|plus)\b/.test(code) ||
      tags.includes('extended') || tags.includes('transcript')
    );
  };

  // Small helper to call your backend consistently
  const api = useCallback(async function <T = any>(path: string, init?: RequestInit): Promise<T> {
    const r = await fetch(`${backendUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (r.status === 204) return null as any;
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e: any = new Error((data as any)?.error || `Request failed: ${r.status}`);
      e.status = r.status;
      e.data = data;
      throw e;
    }
    return data;
  }, [backendUrl, token]);

  // Check if the user has paid for this course's certificate (Standard/Extended)
  const checkPaymentStatus = useCallback(async () => {
    try {
      const courseId = course?.id;
      if (!courseId) {
        setPaymentOk(false);
        setCertPaid(false);
        setExtendedPaid(false);
        return;
      }
      const s = await api<any>(`/api/certificates/status?courseId=${encodeURIComponent(courseId)}`).catch(() => null);

      const tier = typeof s?.tier === 'string' ? s.tier.toLowerCase() : null;
      const hasExtended = s?.extended === true || s?.canTranscript === true || tier === 'extended';
      const hasAnyCert =
        hasExtended || s?.paid === true || s?.hasCertificate === true || s?.canCertificate === true || tier === 'standard';

      setCertPaid(Boolean(hasAnyCert || downUrl));
      setExtendedPaid(Boolean(isOrgFlowFlag || hasExtended));
      setPaymentOk(Boolean(hasAnyCert || downUrl));
    } catch {
      setCertPaid(Boolean(downUrl));
      setExtendedPaid(prev => Boolean(prev || isOrgFlowFlag));
      setPaymentOk(Boolean(downUrl));
    }
  }, [api, course?.id, downUrl, isOrgFlowFlag]);

  // Initial + course-change checks
  useEffect(() => {
    checkPaymentStatus();
  }, [checkPaymentStatus]);

  // Re-check after the payment panel closes
  const prevPaymentOpenRef = useRef(paymentOpen);
  useEffect(() => {
    if (prevPaymentOpenRef.current && !paymentOpen) {
      checkPaymentStatus();
    }
    prevPaymentOpenRef.current = paymentOpen;
  }, [paymentOpen, checkPaymentStatus]);

  // ───────────────────────────────────────────────────────
  // quiz type helpers
  // ───────────────────────────────────────────────────────
  const normQt = (v: unknown): 'mcq' | 'short' | undefined => {
    const s = String(v ?? '').trim().toLowerCase();
    if (s === 'short') return 'short';
    if (s === 'mcq') return 'mcq';
    return undefined;
  };

  // Match web precedence: quiz → org lock → url hint → default 'mcq'
  const enforcedQuizType: 'mcq' | 'short' = useMemo(() => {
    const fromQuiz = typeof quiz?.quizType === 'string' ? String(quiz.quizType).toLowerCase() : undefined;
    const fromOrg = orgMeta?.quizType;
    const fromUrl = urlQuizTypeHint;
    const t = (fromQuiz || fromOrg || fromUrl || 'mcq') as 'mcq' | 'short';
    return t === 'short' ? 'short' : 'mcq';
  }, [quiz?.quizType, orgMeta?.quizType, urlQuizTypeHint]);

  useEffect(() => {
    if (!pendingQuizGen) return;
    if (Array.isArray(quiz?.questions) && quiz.questions.length > 0) {
      setPendingQuizGen(false);
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      try {
        for (const q of quiz.questions) {
          if (!q?.id) throw new Error('Generated quiz question missing id');
          if (enforcedQuizType === 'mcq' && !Array.isArray(q?.choices)) {
            throw new Error('MCQ question missing choices');
          }
        }
      } catch {
        Alert.alert('Quiz error', 'Questions look malformed. Please try again.');
      }
    }
  }, [pendingQuizGen, quiz?.questions, enforcedQuizType]);

  // What we *ask* the generator to create (if org lock not known yet)
  const desiredQuizType: 'mcq' | 'short' = (orgMeta?.quizType || urlQuizTypeHint || 'mcq') as 'mcq' | 'short';

  const assignmentKey = useMemo(() => {
    if (assignmentId) return String(assignmentId);
    const cid = course?.id || course?.slug || courseTitle || 'free-course';
    return `free:${String(cid)}`;
  }, [assignmentId, course?.id, course?.slug, courseTitle]);

  const viewQuestions = useMemo(() => {
    const qt = enforcedQuizType;
    const src = Array.isArray(quiz?.questions) ? quiz!.questions : [];
    return src.map((q: any) => ({
      ...q,
      type: qt,
      choices: qt === 'mcq' ? (Array.isArray(q?.choices) ? q.choices : []) : q?.choices,
    }));
  }, [quiz?.questions, enforcedQuizType]);

  // ───────────────────────────────────────────────────────
  // timers & lock
  // ───────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      if (!isOrgFlow || !assignmentId || !token) return;
      try {
        const r = await fetch(
          `${backendUrl}/api/orgs/assignments/${encodeURIComponent(assignmentId)}/mine`,
          { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } }
        );
        if (!r.ok) return;
        const data = await r.json();
        const lc =
          data?.meta?.locked_config ??
          data?.locked_config ??
          data?.assignment?.locked_config ??
          {};
        const t = Number(data?.meta?.timer_s ?? data?.timer_s);
        const rawQt =
          lc?.quizType ??
          lc?.quiz_type ??
          data?.quizType ??
          data?.quiz_type;

        setOrgMeta({
          quizSize: Number(lc?.quizSize ?? lc?.quiz_size) || undefined,
          totalLessons: Number(lc?.totalLessons ?? lc?.total_lessons) || undefined,
          timer_s: Number.isFinite(t) ? t : undefined,
          quizType: normQt(rawQt),
        });
      } catch {/* ignore */}
    })();
  }, [isOrgFlow, assignmentId, token, backendUrl]);

  useEffect(() => {
    const ts = Number(quiz?.timerSec);
    if (Number.isFinite(ts) && ts > 0) {
      setLocalRemainingMs(ts * 1000);
      if (!quizActive) markActive();
    }
  }, [quiz?.timerSec, markActive, quizActive, setLocalRemainingMs]);

  const displayLessons = orgMeta?.totalLessons ?? safeLessons ?? outline?.length ?? 0;

   const userOverrodeLessons = !!overrideLessons && !isOrgFlow; 
  const minOptsForDisplay = userOverrodeLessons ? {} : { lessonIndex: currentIdx };
  const requestedQForDisplay = Number(orgMeta?.quizSize ?? safeQuiz ?? 0);
  // enforce min rule per lesson
const displayQuestions = applyMinPerLesson(requestedQForDisplay, displayLessons, minOptsForDisplay);

  const displayTimerSec = Number(quiz?.timerSec) || (orgMeta?.timer_s ?? timerSec ?? 0);

  const baseMs = useMemo(() => {
    const candidates = [
      Number.isFinite(displayRemainingMs) ? Number(displayRemainingMs) : null,
      Number.isFinite(localRemainingMs as any) ? Number(localRemainingMs) : null,
      displayTimerSec > 0 ? displayTimerSec * 1000 : null,
    ].filter((n): n is number => typeof n === 'number' && n !== null);
    if (!candidates.length) return 0;
    const positive = candidates.filter((n) => n > 0);
    return positive.length ? Math.max(...positive) : Math.max(...candidates);
  }, [displayRemainingMs, localRemainingMs, displayTimerSec]);

  // ✅ define remainingMsTicker BEFORE using it in isLocked
  const remainingMsTicker = Math.max(0, baseMs - elapsedMs);

  // let force unlock expire when ticker hits 0
  useEffect(() => {
    if (remainingMsTicker <= 0 && forceUnlock) setForceUnlock(false);
  }, [remainingMsTicker, forceUnlock]);

  // ✅ single authoritative "hasTimer" and "isLocked"
  const hasTimer = displayTimerSec > 0;
  const isLocked = useMemo(() => {
    if (forceUnlock) return false;
    return Boolean(disableQuiz || (hasTimer && remainingMsTicker <= 0));
  }, [forceUnlock, disableQuiz, hasTimer, remainingMsTicker]);

  // ───────────────────────────────────────────────────────
  // cert persistence (AsyncStorage)
  // ───────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      if (!lsKey) return;
      try {
        const raw = await AsyncStorage.getItem(lsKey);
        if (raw) setPersistedCert(JSON.parse(raw));
      } catch {/* ignore */}
    })();
  }, [lsKey]);

  useEffect(() => {
    (async () => {
      if (!lsKey) return;
      if (!certUrl && !downUrl) return;
      // Try to recover an id from either URL shape
      const certIdFromDown = downUrl?.match(/\/certificates\/([^/]+)\/download/)?.[1] ?? null;
      const certIdFromView = certUrl?.match(/\/certificates\/([^/]+)/)?.[1] ?? null;
      const certId = certIdFromDown || certIdFromView || null;
      const payload = {
        certUrl: certUrl ?? null,
        downUrl: downUrl ?? null,
        certId,
        courseId: course?.id ?? null,
        courseTitle,
        ts: Date.now(),
      };
      setPersistedCert(payload);
      try {
        await AsyncStorage.setItem(lsKey, JSON.stringify(payload));
      } catch {/* ignore */}
    })();
  }, [lsKey, certUrl, downUrl, course?.id, courseTitle]);

  // hydrate workingAnswers whenever a (new) quiz arrives
useEffect(() => {
  const ids = (quiz?.questions || []).map((q: any) => q.id);
  if (!ids.length) {
    setWorkingAnswers({});
    return;
  }
  setWorkingAnswers(() => {
    const next: Record<string, number | string | undefined> = {};
    const isMcq = enforcedQuizType === 'mcq';
    for (const q of quiz.questions) {
      const v = (answers && (answers as any)[q.id]) as number | string | undefined;
      if (v === undefined) continue;
      next[q.id] = isMcq ? Number(v) : String(v);
    }
    return next;
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [quiz?.questions?.map((q: any) => q.id).join('|')]);


  // Centralized certificate download (positional args)
  const handleDownloadCertificate = useCallback(async () => {
    try {
      if (!requireAuth('download_certificate', 'Please sign in to download your certificate.')) return;

      // Try to resolve a certificate id from persisted state or URLs
      const certId =
        persistedCert?.certId ||
        downUrl?.match(/\/certificates\/([^/]+)\/download/)?.[1] ||
        certUrl?.match(/\/certificates\/([^/]+)/)?.[1] ||
        null;

      if (certId) {
        const fileName = `${(courseTitle || 'certificate').trim().replace(/\s+/g, '-').toLowerCase()}-${certId}.pdf`;
        await downloadCertificateFile(backendUrl, token, certId, fileName);
        return;
      }

      if (downUrl) { await Linking.openURL(downUrl); return; }
      if (certUrl) { await Linking.openURL(certUrl); return; }
      Alert.alert('Download unavailable', 'No certificate URL found yet.');
    } catch (e) {
      console.error('[certificate] download failed', e);
      try {
        if (downUrl) { await Linking.openURL(downUrl); return; }
        if (certUrl) { await Linking.openURL(certUrl); return; }
      } catch {}
      Alert.alert('Download failed', 'Please try again in a moment.');
    }
  }, [backendUrl, token, requireAuth, persistedCert?.certId, downUrl, certUrl, courseTitle]);

  // Post-generate handler (auto-download + flags)
  const handleGeneratedCert = useCallback(async (doc: any, assumeExtended: boolean) => {
    if (!doc) return;

    setCertUrl(doc?.url ?? null);
    const anyUrl = doc?.download_url ?? doc?.downloadUrl ?? doc?.url ?? null;
    setDownUrl(anyUrl);

    setCertPaid(true);
    if (assumeExtended || looksExtendedSku(doc)) setExtendedPaid(true);

    const certId = extractCertId(doc);
    const fileName = `${slug(courseTitle || 'certificate')}-${certId || 'certificate'}.pdf`;
    try {
      if (certId) {
        await downloadCertificateFile(backendUrl, token, certId, fileName);
      } else if (anyUrl) {
        await Linking.openURL(anyUrl);
      } else {
        Alert.alert('Certificate generated', 'But no download link was returned.');
      }
    } catch {
      if (anyUrl) { try { await Linking.openURL(anyUrl); } catch {} }
    }

    try { await refreshUserDetails?.(); } catch {}
    try { await checkPaymentStatus(); } catch {}
  }, [backendUrl, token, courseTitle, refreshUserDetails, checkPaymentStatus, setCertUrl, setDownUrl]);

  // keypad helpers (short answers)
  const SUBS: Record<string, string> = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋' };
  const SUPS: Record<string, string> = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻' };
  const toSub = (s: string) => s.replace(/[0-9+\-]/g, (m) => SUBS[m] || m);
  const toSup = (s: string) => s.replace(/[0-9+\-]/g, (m) => SUPS[m] || m);

  const applyToLastShort = (transformer: (s: string) => string) => {
    const qid = lastShortQidRef.current;
    if (!qid) return;
    const raw = String(workingAnswers[qid] ?? '');
    const next = transformer(raw);
    setWorkingAnswers((p) => ({ ...p, [qid]: next }));
    onAnswer?.(qid, next);
  };

  const insertSymbol = (sym: string) => {
    const qid = lastShortQidRef.current;
    if (!qid) return;
    const raw = String(workingAnswers[qid] ?? '');
    const next = raw + sym;
    setWorkingAnswers((p) => ({ ...p, [qid]: next }));
    onAnswer?.(qid, next);
  };

  // quiz normalization + validation
  const allAnsweredLocal = useMemo(() => {
    const qArr = Array.isArray(quiz?.questions) ? viewQuestions : [];
    if (!qArr.length) return false;
    return qArr.every((qq: any) => {
      const qid = qq?.id;
      if (!qid) return false;
      const v = workingAnswers[qid];
      return enforcedQuizType === 'short'
        ? typeof v === 'string' && v.trim() !== ''
        : typeof v === 'number' && Number.isFinite(v) && v >= 0;
    });
  }, [quiz?.questions, workingAnswers, enforcedQuizType]);

  const canSubmit = !isLocked && allAnsweredLocal;

  // handlers
  const handleAnswer = (qid: string, value: number | string) => {
    if (isLocked) return;
    const isMcq = enforcedQuizType === 'mcq';
    const next = isMcq ? Number(value) : value;
    setWorkingAnswers((prev) => ({ ...prev, [qid]: next }));
    onAnswer?.(qid, next);
  };

  const handleSubmit = useCallback(async () => {
    if (!requireAuth('grade_quiz', 'Please sign in to submit and grade your quiz.')) return;
    try {
      // normalize quiz
      try {
        const qt = enforcedQuizType;
        if (quiz && (quiz as any).quizType !== 'mcq' && (quiz as any).quizType !== 'short') {
          (quiz as any).quizType = qt;
        }
        if (quiz?.questions) {
          (quiz as any).questions = viewQuestions.map((q: any) => ({
            ...q,
            type: qt,
            choices: qt === 'mcq' ? (Array.isArray(q?.choices) ? q.choices : []) : q?.choices
          }));
        }
      } catch {}

      // push normalized answers up
      if (onAnswer && quiz?.questions?.length) {
        for (const q of viewQuestions) {
          const qid = q?.id;
          if (!qid) continue;
          const raw = workingAnswers[qid];
          if (enforcedQuizType === 'short') {
            onAnswer(qid, String(raw ?? '').trim());
          } else {
            const n = typeof raw === 'number' ? raw : Number(raw);
            if (Number.isFinite(n)) onAnswer(qid, n);
          }
        }
      }

      // payload
     const payloadAnswers = viewQuestions.map((q: any) => {
  const qid = q?.id;
  const v = qid ? workingAnswers[qid] : undefined;

  if (enforcedQuizType === 'short') {
    return { questionId: qid, answerText: String(v ?? '').trim() };
  }

  const choiceIndex =
    typeof v === 'number' ? v :
    typeof v === 'string' ? Number(v) : -1;

  return { questionId: qid, choiceIndex: Number.isFinite(choiceIndex) ? choiceIndex : -1 };
});


      // submit attempt (regular + org)
      await submitAttempt(assignmentKey, payloadAnswers);
      await gradeNow();
      setRetakeMode(false);
      markNotActive();
    } catch (err) {
      console.error(err);
      Alert.alert('Submit failed', 'Please try again.');
    }
  }, [
    requireAuth,
    enforcedQuizType,
    quiz,
    viewQuestions,
    onAnswer,
    workingAnswers,
    submitAttempt,
    assignmentKey,
    gradeNow,
    markNotActive,
  ]);

  // Non-org: did the user manually set lesson count?
  const manualLessonsSelected = useMemo(
  () => userOverrodeLessons && Number.isFinite(Number(safeLessons)) && Number(safeLessons) > 0,
  [userOverrodeLessons, safeLessons]
);


  const startQuiz = useCallback(async () => {
    if (!confirmInfo) return;
    try {
      setConfirmOpen(false);

      // ORG: start attempt on backend and seed timer from server
      if (isOrgFlow && typeof assignmentId === 'string' && assignmentId.length > 0) {
        if (!requireAuth('start_attempt', 'Please sign in to start your attempt.')) return;

        const timerSecEff =
          (orgMeta?.timer_s ?? timerSec ?? 0) > 0 ? Number(orgMeta?.timer_s ?? timerSec) : 0;

        const att = await startAttempt({
          assignmentId,
          timerSec: timerSecEff,
          heartbeatSec: 15,
          maxBackgrounds: 2,
          maxSuspicion: 5,
        });

        const ms = (att?.remainingMs ?? 0) || (timerSecEff > 0 ? timerSecEff * 1000 : 0);
        if (ms > 0) setLocalRemainingMs(ms);
        setForceUnlock(true);
        markActive();
      } else {
        // NON-ORG: local timer only
        const effective = Number(quiz?.timerSec) || (orgMeta?.timer_s ?? timerSec ?? 0);
        if (effective > 0) setLocalRemainingMs(effective * 1000);
        setForceUnlock(true);
        markActive();
      }

      // Compute desired size with min-per-lesson rule
      const desiredRequested =
        (orgMeta?.quizSize ?? undefined) ??
        (safeQuiz ?? undefined) ??
        Number(confirmInfo.questions || 0);

      const minOpts = userOverrodeLessons ? {} : { lessonIndex: currentIdx };
      const desiredQ = applyMinPerLesson(Number(desiredRequested || 0), displayLessons, minOpts)

      // Respect org-locked quiz size by not overriding it
      const passNumQ =
        (isOrgFlow && assignmentId && Number.isFinite(orgMeta?.quizSize))
          ? undefined
          : desiredQ;

      const passTotalLessons = manualLessonsSelected ? Number(safeLessons) : undefined;

      await Promise.resolve(
        generateQuizNow
          ? generateQuizNow(
              passNumQ,
              undefined,
              undefined,
              passTotalLessons,
              assignmentId,
              desiredQuizType,
              { lessonIndex: currentIdx }
            )
          : Promise.reject(new Error('generateQuizNow is not provided'))
      );

      setPendingQuizGen(true);
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = setTimeout(() => {
        if (!Array.isArray(quiz?.questions) || quiz.questions.length === 0) {
          Alert.alert('No questions', 'The quiz could not be generated. Please try again.');
        }
        setPendingQuizGen(false);
        pendingTimerRef.current = null;
      }, 8000);
    } catch (err: any) {
      console.error('[Generate quiz] failed', err);
      Alert.alert('Could not start quiz', typeof err?.message === 'string' ? err.message : 'Please try again.');
    }
  }, [
    confirmInfo,
    requireAuth,
    isOrgFlow,
    assignmentId,
    orgMeta?.quizSize,
    orgMeta?.timer_s,
    timerSec,
    startAttempt,
    setLocalRemainingMs,
    setForceUnlock,
    markActive,
    generateQuizNow,
    desiredQuizType,
    currentIdx,
    quiz?.questions,
    enforcedQuizType,
    safeQuiz,
    quiz?.timerSec,
    displayLessons,
    safeLessons,
    manualLessonsSelected,
  ]);

  // Transcript generation (native)
  const downloadTranscript = useCallback(async () => {
    if (!requireAuth('download_transcript', 'Please sign in to download your transcript.')) return;

    // Org: always allowed. Non-org: Extended required.
    if (!isOrgFlowFlag && !extendedPaid) {
      setPaymentOpen(true);
      return;
    }
    const courseId = course?.id;
    if (!courseId) { Alert.alert('Transcript', 'Missing course ID.'); return; }

    try {
      const payload: any = { courseId };

      if (Array.isArray(outline) && outline.length) {
        payload.lessonsLearnt = outline
          .map((s: any) => String(s?.title || '').trim())
          .filter(Boolean);
      }

      const t: any = await api(`/api/transcripts/generate`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const trId = extractTranscriptId(t);
      const anyUrl = t?.download_url ?? t?.url ?? null;
      const fileName = `${slug(courseTitle || 'transcript')}-${(trId || 'transcript')}.pdf`;
      if (trId) {
        await downloadTranscriptFile(backendUrl, token, trId, fileName);
      } else if (anyUrl) {
        await Linking.openURL(anyUrl);
      } else {
        Alert.alert('Transcript', 'Generated, but no download link was returned.');
      }
    } catch (e: any) {
      if (e?.status === 402) {
        setPaymentOpen(true);
        return;
      }
      Alert.alert('Transcript', 'Could not generate/download transcript. Please try again.');
    }
  }, [api, course?.id, isOrgFlowFlag, extendedPaid, requireAuth, setPaymentOpen, backendUrl, token, courseTitle, outline]);

  // ───────────────────────────────────────────────────────
  // UI
  // ───────────────────────────────────────────────────────
  const hasTranscriptAccess = Boolean(isOrgFlowFlag || extendedPaid);

  return (
    <>
      {/* Player */}
        <View style={tw`relative z-0 items-center`}>
          <View
            style={[
              tw.style('rounded-[28px] border border-white/15 bg-white/5'),
              {
                alignSelf: 'center',
                width: '100%',
                maxWidth: 1088,        // keep as-is; width already spans mobile
                height: desiredHeight, // compact vs maximized height
                overflow: 'hidden',
              },
            ]}
          >
            <ClassroomThemeShell
              ssml={displaySsml}
              lessons={lessonsArr}
              voiceName={voiceName}
              title={courseTitle}
              maximized={isMaximized}
              onToggleMaximize={onToggleMaximized}
              course={course}
              outline={outline}
              backendUrlOverride={backendUrl}
              onPlayerReady={() => setInnerPlayerReady(true)}
              onPlayerLoadingChange={onPlayerLoadingChange}
              playing
              playJoinedIfAvailable={!!hasJoined}
              onBeforePlay={guardedBeforePlay}
              onEnded={onEnded}
              onNext={onNext}
              onPrev={onPrev}
              activeIndex={currentIdx}
              isBuildingNext={isBuildingNext}
              themeOpen={themeOpen}
              plannedCount={safeLessons}
              onThemeOpenChange={onThemeOpenChange}
              showFloatingThemeButton={false}
              playerHeight={desiredHeight}
              onWordSync={handleWordSync}   
              onRequestStart={async () => {
                // ✅ Never auto-generate unless parent explicitly allows it
                if (!canAutoStart) return;

                // ✅ If we already have something to play, do nothing
                if (hasRenderableLesson) return;

                await onStart?.();
              }}

            />
          </View>
        </View>
      
      

      {/* Outline + Generate */}
      {Array.isArray(outline) && outline.length > 0 && (
        <View style={tw`mt-3 rounded-2xl bg-slate-900/60 border border-slate-800 p-4`}>
          <Text style={tw`text-white font-semibold mb-2`}>Lesson outline</Text>
          <View>
            {outline.filter(Boolean).map((s: any, i: number) => (
              <View key={s?.id ?? `sec-${i}`} style={tw`mb-2`}>
                <Text style={tw`text-white font-medium`}>{s?.title ?? `Lesson ${i + 1}`}</Text>
                {(Array.isArray(s?.keyPoints) ? s.keyPoints : []).map((k: string, idx: number) => (
                  <Text
                    key={`${s?.id ?? i}-kp-${idx}`}
                    style={tw`text-white/80 text-sm ml-3`}
                  >
                    • {k}
                  </Text>
                ))}
              </View>
            ))}
          </View>

          <View style={tw`mt-3 flex-row items-center gap-2`}>
            <TouchableOpacity
              onPress={() => {
                const timeLabel = displayTimerSec > 0 ? fmtHMS(displayTimerSec) : 'No time limit';
                setConfirmInfo({ lessons: displayLessons, questions: displayQuestions, timeLabel });
                setConfirmOpen(true);
              }}
              style={tw`px-3 py-2 rounded-full bg-indigo-600`}
            >
              <Text style={tw`text-white font-semibold text-sm`}>Generate quiz</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <AntiCheatGuard
        deviceId={boundDeviceId}
        quizActive={quizActive}
        elapsedMs={elapsedMs}
        backgrounds={backgrounds}
        suspicions={suspicions}
        policy={{
          heartbeatSec: attempt?.heartbeatSec ?? 15,
          maxBackgrounds: attempt?.maxBackgrounds ?? 2,
          maxSuspicion: attempt?.maxSuspicion ?? 5,
          timerSec: Number(quiz?.timerSec) || (orgMeta?.timer_s ?? timerSec ?? 0),
        }}
        onTooManyBackgrounds={() => {
          if (shownLockAlertRef.current) return;
          shownLockAlertRef.current = true;

          if (canSubmit) {
            handleSubmit().finally(() => {
              setTimeout(() => { shownLockAlertRef.current = false; }, 1500);
            });
          } else {
            Alert.alert('Quiz locked', 'Too many app switches. Please submit or retry.');
            setTimeout(() => { shownLockAlertRef.current = false; }, 1500);
          }
        }}
        onBumpSuspicion={(d) => bumpSuspicion(d)}
      />

      {/* Quiz */}
      {Array.isArray(quiz?.questions) && viewQuestions.length > 0 ? (
        <View style={tw`mt-3 rounded-2xl bg-slate-900/60 border border-slate-800 p-4`}>
          <Text style={tw`text-white font-semibold text-center`}>Quick quiz</Text>

          {/* time banner */}
          <View style={tw.style('mt-2 px-2 py-1 rounded', isLocked ? 'bg-red-600/20' : 'bg-white/10')}>
            <Text style={tw`text-white text-xs text-center`}>
              {hasTimer
                ? (isLocked ? 'Time up — quiz locked' : `Time left: ${fmtHMSms(remainingMsTicker)}`)
                : `Time elapsed: ${Math.floor(elapsedMs / 1000)}s`}
            </Text>
          </View>

          {/* type + keypad */}
          <View style={tw`mt-2 items-center`}>
            <Text style={tw`text-white/80 text-xs`}>
              Answer type:{' '}
              <Text style={tw`text-white font-semibold`}>
                {enforcedQuizType === 'short' ? 'Short (typed)' : 'Multiple choice (MCQ)'}
              </Text>
            </Text>
            {enforcedQuizType === 'short' && !isLocked && (
              <TouchableOpacity
                onPress={() => setMathOpen((v) => !v)}
                style={tw`mt-2 px-3 py-1.5 rounded-full bg-indigo-600`}
              >
                <Text style={tw`text-white text-sm`}>∑ Math keypad</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={tw`text-white/70 text-xs text-center mt-2 mb-2`}>Answer all to submit.</Text>

          <View>
            {viewQuestions.map((q: any, idx: number) => {
              if (!q?.id) return null; // guard malformed
              const qType = enforcedQuizType;
              return (
                <View key={q.id} style={tw`rounded-xl bg-white/5 border border-white/10 p-3 mb-3`}>
                  <Text style={tw`text-white text-[15px] font-medium mb-2`}>
                    <Text>{idx + 1}. </Text>
                    <Markdown inline>{String(q?.display || q?.prompt || '')}</Markdown>
                  </Text>

                  {qType === 'short' ? (
                    <View>
                      <TextInput
                        multiline
                        value={String(workingAnswers[q.id] ?? '')}
                        onChangeText={(t) => { lastShortQidRef.current = q.id; handleAnswer(q.id, t); }}
                        onFocus={() => { lastShortQidRef.current = q.id; }}
                        onContentSizeChange={(e) => {
                          const h = Math.min(320, Math.max(40, e.nativeEvent.contentSize.height));
                          setShortHeights((p) => ({ ...p, [q.id]: h }));
                        }}
                        placeholder="Type your answer"
                        placeholderTextColor="#94a3b8"
                        editable={!isLocked}
                        style={tw.style(
                          'text-white bg-slate-800/70 rounded-xl px-3 py-2',
                          isLocked ? 'opacity-60' : ''
                        )}
                      />

                      {/* admin solution reveal */}
                      {isAdmin && (
                        <View style={tw`mt-2`}>
                          <Text style={tw`text-amber-300 text-[11px]`}>Admin: show answer</Text>
                          <View style={tw`mt-1`}>
                            {q.answer ? <Text style={tw`text-white/80 text-xs`}><Text style={tw`font-bold`}>Answer:</Text> {String(q.answer)}</Text> : null}
                            {Array.isArray(q.accept) && q.accept.length > 0 && (
                              <Text style={tw`text-white/80 text-xs`}><Text style={tw`font-bold`}>Accept:</Text> {q.accept.join(', ')}</Text>
                            )}
                            {q.regex ? <Text style={tw`text-white/80 text-xs`}><Text style={tw`font-bold`}>Regex:</Text> {String(q.regex)}</Text> : null}
                            {q.explanation ? <Text style={tw`text-white/80 text-xs mt-1`}><Text style={tw`font-bold`}>Explanation:</Text> {q.explanation}</Text> : null}
                          </View>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={tw`gap-2`}>
                      {/* MCQ choices */}
                      {Array.isArray(q.choices) && q.choices.length > 0 ? (
                        q.choices.map((c: string, i: number) => {
                          const raw = workingAnswers[q.id];
                          const current =
                            typeof raw === 'string' ? Number(raw) :
                            typeof raw === 'number' ? raw : NaN;
                          const isSelected = current === i;

                          return (
                            <Pressable
                              key={`${q.id}:${i}`}
                              onPress={() => handleAnswer(q.id, i)}
                              disabled={isLocked}
                              hitSlop={8}
                              pressRetentionOffset={{ top: 16, left: 16, right: 16, bottom: 16 }}
                              android_ripple={{ borderless: false }}
                              accessibilityRole="button"
                              accessibilityState={{ disabled: isLocked, selected: isSelected }}
                              style={({ pressed }) =>
                                tw.style(
                                  'px-4 py-3 rounded-xl border',
                                  isSelected ? 'bg-emerald-600/30 border-emerald-500' : 'bg-white/5 border-white/10',
                                  pressed ? 'opacity-80' : '',
                                  isLocked ? 'opacity-60' : ''
                                )
                              }
                            >
                              <Text style={tw`text-white`}>{String(c || '')}</Text>
                            </Pressable>
                          );
                        })
                      ) : (
                        <Text style={tw`text-amber-300 text-[12px]`}>
                          No choices provided for this MCQ. Please refresh or contact your admin.
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          <View style={tw`mt-2 flex-row flex-wrap items-center gap-2`}>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={tw.style(
                'px-4 py-2 rounded-xl',
                canSubmit ? 'bg-emerald-600' : 'bg-slate-700 opacity-60'
              )}
            >
              <Text style={tw`text-white font-semibold`}>Submit quiz</Text>
            </TouchableOpacity>

            {grade && (
              <Text style={tw`text-white/80 text-sm`}>
                Score: <Text style={tw`font-semibold`}>{grade.scorePct}%</Text> (Pass mark {grade.passMark}%)
              </Text>
            )}

            {grade && course?.id && (
              <TouchableOpacity
                onPress={() => onViewResults(course.id, courseTitle, grade)}
                style={tw`px-3 py-2 rounded-full bg-slate-800`}
              >
                <Text style={tw`text-white text-sm`}>View Results</Text>
              </TouchableOpacity>
            )}
          </View>

          {grade && grade.passed && !retakeMode && (
            <View style={tw`mt-3 rounded-xl bg-emerald-600/10 border border-emerald-500 p-3`}>
              <Text style={tw`text-emerald-200 text-sm`}>
                {grade?.passed
                  ? '🎉 Great job! You passed (≥ ' + grade.passMark + '%).'
                  : '🎓 You’re eligible for a certificate.'}
              </Text>

              {isOrgFlowFlag ? (
                <>
                  <Text style={tw`text-white/70 text-xs mt-2`}>
                    Covered by your organization — no payment needed.
                  </Text>
                  <View style={tw`mt-2 flex-row flex-wrap items-center gap-2`}>
                    <TouchableOpacity
                      onPress={async () => {
                        try {
                          const sku = (skus && skus[0]) || null;
                          if (sku) {
                            try { await claim(sku.code); } catch {/* ignore */}
                          }
                          const doc =
                            (await tryGenerateCertificate().catch(() => null)) ||
                            (await generateAICert().catch(() => null));
                          await handleGeneratedCert(doc, /* assumeExtended */ true);
                        } catch (e) {
                          console.error('[org] manual issue failed', e);
                          Alert.alert('Issue failed', 'Please try again.');
                        }
                      }}
                      style={tw`px-4 py-2 rounded-xl bg-emerald-600`}
                    >
                      <Text style={tw`text-white font-semibold`}>Generate Certificate</Text>
                    </TouchableOpacity>

                    {certUrl ? (
                      <>
                        <TouchableOpacity
                          onPress={() => { if (certUrl) Linking.openURL(certUrl); }}

                          style={tw`px-3 py-2 rounded-full bg-slate-800`}
                        >
                          <Text style={tw`text-white text-sm`}>View certificate</Text>
                        </TouchableOpacity>
                        {downUrl ? (
                          <TouchableOpacity
                            onPress={handleDownloadCertificate}
                            style={tw`px-4 py-2 rounded-xl bg-indigo-600`}
                          >
                            <Text style={tw`text-white font-semibold`}>Download PDF</Text>
                          </TouchableOpacity>
                        ) : null}
                        {/* New: Transcript (org always allowed) */}
                        <TouchableOpacity
                          onPress={downloadTranscript}
                          style={tw`px-4 py-2 rounded-xl bg-indigo-600`}
                        >
                          <Text style={tw`text-white font-semibold`}>Download Transcript</Text>
                        </TouchableOpacity>
                      </>
                    ) : null}
                  </View>
                  {!certUrl && (
                    <Text style={tw`text-white/70 text-[12px] mt-2`}>
                      Your certificate will be generated at no cost.
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <View style={tw`mt-2`}>
                    <Text style={tw`text-white/70 text-xs`}>Pay in tokens (no processing fees)</Text>
                    {aiCertLoading ? <Text style={tw`text-white/60 text-xs mt-1`}>Loading certificate options…</Text> : null}
                    {aiCertError ? <Text style={tw`text-red-300 text-xs mt-1`}>{aiCertError}</Text> : null}
                    {aiCertMsg ? <Text style={tw`text-emerald-300 text-xs mt-1`}>{aiCertMsg}</Text> : null}

                    {!paymentOk && (
                      <Text style={tw`text-white/70 text-[11px] mt-2`}>
                        Payment required to unlock <Text style={tw`font-semibold`}>Claim &amp; Generate</Text>.
                      </Text>
                    )}

                    {/* Balance hint */}
                    <Text style={tw`text-white/70 text-[11px] mt-2`}>
                      Your balance: <Text style={tw`font-semibold`}>{Number(tokens) || 0}</Text> tokens
                    </Text>

                    <View style={tw`mt-2`}>
                      {(skus || []).map((sku) => {
                        const price =
                          Number(sku?.price_tokens ?? sku?.priceTokens ?? sku?.price ?? 0);
                        const hasEnoughTokens = (Number(tokens) || 0) >= price;
                        const canClaimNow = Boolean(grade?.passed) && hasEnoughTokens;
                        const isExtended = looksExtendedSku(sku);

                        return (
                          <View
                            key={sku.code}
                            style={tw`flex-row items-center justify-between rounded-lg border border-white/10 p-2 bg-white/5 mb-2`}
                          >
                            <View>
                              <Text style={tw`text-white font-medium`}>{sku.title}</Text>
                              <Text style={tw`text-white/60 text-[11px]`}>{sku.code}</Text>
                            </View>

                            <View style={tw`flex-row items-center gap-2`}>
                              <Text style={tw`text-white font-semibold`}>{price} Tokens</Text>

                              <TouchableOpacity
                                disabled={!canClaimNow}
                                onPress={async () => {
                                  if (!token || !canClaimNow) return;
                                  try {
                                    await claim(sku.code);
                                    const doc: any = await generateAICert();

                                    // reflect purchase
                                    setCertPaid(true);
                                    if (isExtended) setExtendedPaid(true);

                                    await handleGeneratedCert(doc, /* assumeExtended */ isExtended);

                                    try { await refreshUserDetails?.(); } catch {}
                                  } catch (e) {
                                    console.error('[tokens] claim/generate failed', e);
                                    Alert.alert('Certificate', 'Could not generate certificate.');
                                  }
                                }}
                                style={tw.style(
                                  'px-3 py-1.5 rounded',
                                  canClaimNow ? 'bg-emerald-600' : 'bg-emerald-600/50'
                                )}
                              >
                                <Text style={tw`text-white text-sm font-semibold`}>Claim &amp; Generate</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>

                    {(skus?.length ?? 0) > 0 && (Number(tokens) || 0) < Number(skus?.[0]?.price_tokens ?? 0) && (
                      <View style={tw`mt-2`}>
                        <Text style={tw`text-white/70 text-[11px]`}>
                          Not enough tokens? <Text style={tw`font-semibold`}>Top up and try again.</Text>
                        </Text>
                        <View style={tw`mt-2 flex-row gap-2`}>
                          <TouchableOpacity
                            onPress={() => setPaymentOpen(true)}
                            style={tw`px-4 py-2 rounded-xl bg-indigo-600`}
                          >
                            <Text style={tw`text-white font-semibold`}>Buy tokens</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>

                  <Text style={tw`text-white/60 text-xs mt-3`}>
                    Prefer paying with card or PayPal/M-Pesa?
                  </Text>
                  <View style={tw`mt-1 flex-row flex-wrap items-center gap-2`}>
                    <TouchableOpacity onPress={() => setPaymentOpen(true)} style={tw`px-4 py-2 rounded-xl bg-indigo-600`}>
                      <Text style={tw`text-white font-semibold`}>Pay with PayPal / M-Pesa</Text>
                    </TouchableOpacity>

                    {certUrl ? (
                      <TouchableOpacity
                        onPress={() => { if (certUrl) Linking.openURL(certUrl); }}

                        style={tw`px-3 py-2 rounded-full bg-slate-800`}
                      >
                        <Text style={tw`text-white text-sm`}>View certificate</Text>
                      </TouchableOpacity>
                    ) : null}

                    {true ? (
                      <TouchableOpacity
                        onPress={handleDownloadCertificate}
                        disabled={!(certUrl || downUrl || persistedCert?.certUrl || persistedCert?.downUrl)}
                        style={tw`px-4 py-2 rounded-xl bg-indigo-600`}
                      >
                        <Text style={tw`text-white font-semibold`}>Download PDF</Text>
                      </TouchableOpacity>
                    ) : null}

                    {/* New: Transcript button (gated by Extended for non-org) */}
                    <TouchableOpacity
                      onPress={downloadTranscript}
                      disabled={!hasTranscriptAccess}
                      style={tw.style('px-4 py-2 rounded-xl', hasTranscriptAccess ? 'bg-indigo-600' : 'bg-indigo-600/40')}
                    >
                      <Text style={tw`text-white font-semibold`}>Download Transcript</Text>
                    </TouchableOpacity>
                  </View>

                  {!certUrl && (
                    <Text style={tw`text-white/70 text-[12px] mt-2`}>
                      Once payment completes (tokens or fiat), we’ll generate your certificate instantly.
                    </Text>
                  )}
                </>
              )}
            </View>
          )}

          {grade && !grade.passed && !retakeMode && (
            <View style={tw`mt-3 rounded-xl bg-red-600/10 border border-red-500 p-3`}>
              <Text style={tw`text-red-200 text-sm`}>
                You scored {grade.scorePct}%. Review the lesson and try again.
              </Text>

              {/* Retry CTA (org flow) */}
              {isOrgFlow && assignmentId ? (
                <View style={tw`mt-3`}>
                  <TouchableOpacity
                    onPress={async () => {
                      if (!requireAuth('start_attempt', 'Please sign in to retry.')) return;
                      if (startingAttemptRef.current) return;
                      startingAttemptRef.current = true;

                      try {
                        if (isOrgFlow && typeof assignmentId === 'string' && assignmentId.length > 0) {
                          const timerSecEff =
                            (orgMeta?.timer_s ?? timerSec ?? 0) > 0 ? Number(orgMeta?.timer_s ?? timerSec) : 0;

                          const att = await startAttempt({
                            assignmentId,
                            timerSec: timerSecEff,
                            heartbeatSec: 15,
                            maxBackgrounds: 2,
                            maxSuspicion: 5,
                          });

                          const ms = (att?.remainingMs ?? 0) || (timerSecEff > 0 ? timerSecEff * 1000 : 0);
                          if (ms > 0) setLocalRemainingMs(ms);
                          setForceUnlock(true);
                          markActive();
                        } else {
                          const effective = Number(quiz?.timerSec) || (orgMeta?.timer_s ?? timerSec ?? 0);
                          if (effective > 0) setLocalRemainingMs(effective * 1000);
                          setForceUnlock(true);
                          markActive();
                        }

                        setRetakeMode(true);
                        setWorkingAnswers({});

                        // Retry with min rule
                        const retryRequested = Number(displayQuestions || 0);
                        const minOptsRetry = manualLessonsSelected ? {} : { lessonIndex: currentIdx };
                        const retryQ = applyMinPerLesson(retryRequested, displayLessons, minOptsRetry);
                        const passTotalLessonsRetry = manualLessonsSelected ? Number(safeLessons) : undefined;

                        await generateQuizNow?.(
                          retryQ,
                          undefined,
                          undefined,
                          passTotalLessonsRetry,
                          assignmentId,
                          desiredQuizType,
                          { lessonIndex: currentIdx }
                        );

                        setPendingQuizGen(true);
                        if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
                        pendingTimerRef.current = setTimeout(() => {
                          if (!Array.isArray(quiz?.questions) || quiz.questions.length === 0) {
                            Alert.alert('No questions', 'The quiz could not be generated. Please try again.');
                          }
                          setPendingQuizGen(false);
                          pendingTimerRef.current = null;
                        }, 8000);
                      } catch (e) {
                        console.error('[retry] failed', e);
                        Alert.alert('Retry failed', 'Please try again.');
                      } finally {
                        startingAttemptRef.current = false;
                      }
                    }}
                    style={tw`px-4 py-2 rounded-xl bg-indigo-600`}
                  >
                    <Text style={tw`text-white font-semibold`}>Retry quiz</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={tw`mt-3`}>
                  <TouchableOpacity
                    onPress={async () => {
                      setRetakeMode(true);
                      setWorkingAnswers({});
                      markActive();

                      if (displayTimerSec > 0) setLocalRemainingMs(displayTimerSec * 1000);

                      const retryRequested = Number(displayQuestions || 0);
                      const minOptsRetry = manualLessonsSelected ? {} : { lessonIndex: currentIdx };
                      const retryQ = applyMinPerLesson(retryRequested, displayLessons, minOptsRetry);
                      const passTotalLessonsRetry = manualLessonsSelected ? Number(safeLessons) : undefined;

                      await generateQuizNow?.(
                        retryQ,
                        undefined,
                        undefined,
                        passTotalLessonsRetry,
                        assignmentId,
                        desiredQuizType,
                        { lessonIndex: currentIdx }
                      );

                      setPendingQuizGen(true);
                      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
                      pendingTimerRef.current = setTimeout(() => {
                        if (!Array.isArray(quiz?.questions) || quiz.questions.length === 0) {
                          Alert.alert('No questions', 'The quiz could not be generated. Please try again.');
                        }
                        setPendingQuizGen(false);
                        pendingTimerRef.current = null;
                      }, 8000);
                    }}
                    style={tw`px-4 py-2 rounded-xl bg-indigo-600`}
                  >
                    <Text style={tw`text-white font-semibold`}>Retry quiz</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Math keypad (native modal) */}
          <Modal visible={mathOpen && enforcedQuizType === 'short' && !isLocked} transparent animationType="fade" onRequestClose={() => setMathOpen(false)}>
            <View style={tw`flex-1 justify-end bg-black/40`}>
              <View style={tw`bg-slate-900 rounded-t-2xl border border-slate-800 p-3`}>
                <View style={tw`flex-row items-center justify-between mb-2`}>
                  <Text style={tw`text-white font-semibold`}>Math keypad</Text>
                  <TouchableOpacity onPress={() => setMathOpen(false)} style={tw`px-3 py-1.5 rounded-full bg-slate-800`}>
                    <Text style={tw`text-white text-sm`}>Close</Text>
                  </TouchableOpacity>
                </View>

                <View style={tw`flex-row flex-wrap -m-1`}>
                  {['π','×','÷','±','√','^','≤','≥','≈','∞','°','·','θ','α','β','γ','µ','∑','∫','≠','→','←','↔','∈','∉','∩','∪','∧','∨','⊂','⊆'].map((k) => (
                    <TouchableOpacity key={k} onPress={() => insertSymbol(k)} style={tw`m-1 px-3 py-2 rounded-md bg-slate-800`}>
                      <Text style={tw`text-white text-base`}>{k}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={tw`mt-3 flex-row gap-2`}>
                  <TouchableOpacity onPress={() => applyToLastShort(toSub)} style={tw`px-3 py-2 rounded-full bg-slate-800`}>
                    <Text style={tw`text-white`}>Subscript (x₂)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => applyToLastShort(toSup)} style={tw`px-3 py-2 rounded-full bg-slate-800`}>
                    <Text style={tw`text-white`}>Superscript (x²)</Text>
                  </TouchableOpacity>
                </View>

                <Text style={tw`text-white/60 text-[11px] mt-2`}>
                  Tip: focus a short-answer box first, then tap symbols.
                </Text>
              </View>
            </View>
          </Modal>
        </View>
      ) : null}

      {/* Shared Confirm Modal */}
      {confirmInfo ? (
        <QuizConfirmModal
          open={confirmOpen}
          lessons={Number.isFinite(confirmInfo?.lessons) ? Number(confirmInfo!.lessons) : 0}
          questions={Number.isFinite(confirmInfo?.questions) ? Number(confirmInfo!.questions) : 0}
          timeLabel={confirmInfo?.timeLabel ?? 'No time limit'}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={startQuiz}
        />
      ) : null}

      {/* Payments (non-org) */}
      {!isOrgFlowFlag && (
        <PaymentWidget
          isOpen={paymentOpen}
          onClose={() => setPaymentOpen(false)}
          title="Unlock Certificate"
          showTutorPreview={false}
        />
      )}
    </>
  );
};

export default React.memo(LessonAndQuizPane);
