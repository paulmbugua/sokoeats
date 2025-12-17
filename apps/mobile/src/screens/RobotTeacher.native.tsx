/* eslint-disable no-console */
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  StyleSheet,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, NavigationProp } from '@react-navigation/native';
import tw from '../../tailwind';
import { RefreshableScrollView } from '../refresh/Refreshable';
import LessonOverlayNative, { type LessonOverlayHandle } from './LessonOverlay.native';

import { useOrgAssignment } from '@mytutorapp/shared/hooks/useOrgAssignment';
import { useAiCourse } from '@mytutorapp/shared/hooks';
import { useShopContext } from '@mytutorapp/shared/context';
import { useAICertificates } from '@mytutorapp/shared/hooks';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';

import type { TopCourse } from '@mytutorapp/shared/types';
import type { MainStackParamList } from '../navigation/types';

import ControlsPanel from './RobotTeacherControls.native';
import LessonAndQuizPane from './RobotTeacherLessonAndQuiz.native';
import OrgShareDialog from '@/screens/org/OrgShareDialog.native';

// ─────────────────────────────────────────────────────────
// Utils / Debug
// ─────────────────────────────────────────────────────────
const DBG_ROBOT_TEACHER =
  __DEV__ && Boolean((globalThis as any)?.__DBG_ROBOT_TEACHER__);

export const dlog = (...args: any[]) => {
  if (!DBG_ROBOT_TEACHER) return;
  // eslint-disable-next-line no-console
  console.log('[RobotTeacher]', ...args);
};

// ─────────────────────────────────────────────────────────
// Types & Constants
// ─────────────────────────────────────────────────────────
type RobotTeacherRoute =
  | RouteProp<MainStackParamList, 'ClassVaultLibrary'>
  | RouteProp<MainStackParamList, 'Home'>
  | any;

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
] as const;
export type SizePresetKey = (typeof PRESETS)[number]['key'];

const TRACKS = [
  { key: 'module', label: 'Module', lessons: 8 },
  { key: 'certificate', label: 'Certificate', lessons: 12 },
  { key: 'diploma', label: 'Diploma', lessons: 18 },
  { key: 'degree', label: 'Degree', lessons: 24 },
] as const;
export type TrackKey = (typeof TRACKS)[number]['key'];

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

const getCourseBlurb = (c: TopCourse): string => {
  const maybe = (c as unknown as Record<string, unknown>)['description'];
  return typeof maybe === 'string' && maybe.trim() ? (maybe as string) : c.blurb;
};

const normQt = (v?: string | null): 'mcq' | 'short' | undefined => {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'short' ? 'short' : s === 'mcq' ? 'mcq' : undefined;
};

// ─────────────────────────────────────────────────────────
// CourseList (native)
// ─────────────────────────────────────────────────────────
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
        (it.title || '').toLowerCase().includes(q) ||
        (it.blurb || '').toLowerCase().includes(q)
    );
  }, [items, query]);

  return (
    <View style={tw`rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 p-3`}>
      {/* Actions */}
      <View style={tw`flex-row items-center gap-2 mb-2`}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search courses…"
          placeholderTextColor="#7a8aa0"
          style={tw`flex-1 rounded-xl px-3 py-2 bg-[#e7edf4] dark:bg-[#172534] text-[#0d141c] dark:text-white`}
        />
        <TouchableOpacity onPress={onRefresh} style={tw`px-3 py-2 rounded-lg bg-white dark:bg-[#172534] border border-[#cedbe8] dark:border-white/15`}>
          <Text style={tw`text-[#0d141c] dark:text-white text-xs font-semibold`}>Refresh</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onLoadMore}
          disabled={!hasMore}
          style={tw.style(
            'px-3 py-2 rounded-lg',
            hasMore ? 'bg-indigo-600' : 'bg-white dark:bg-[#172534] border border-[#cedbe8] dark:border-white/15 opacity-70'
          )}
        >
          <Text style={tw`${hasMore ? 'text-white' : 'text-[#0d141c] dark:text-white'} text-xs font-semibold`}>
            {hasMore ? 'Load more' : 'All loaded'}
          </Text>
        </TouchableOpacity>
      </View>

     {/* Horizontal chips */}
<RefreshableScrollView
  screenId="robot-tutor"
  horizontal
  showsHorizontalScrollIndicator={false}
  keyboardShouldPersistTaps="always"
  style={tw`md:hidden -mx-1 px-1 pb-2`}
  contentContainerStyle={tw`flex-row gap-2 items-start`}
>
  {visible.length ? (
    visible.map((l, i) => {
      const active = l.id === activeId;
      return (
        <TouchableOpacity
          key={l.id}
          onPress={() => onSelect(l.id)}
          style={tw.style(
            'px-3 py-2 rounded-full border',
            active
              ? 'bg-indigo-600 border-indigo-600'
              : 'bg-white dark:bg-[#172534] border-[#cedbe8] dark:border-white/15',
            // ✅ prevents the chip from stretching taller/wider than its content
            'self-start'
          )}
        >
          <Text style={tw`${active ? 'text-white' : 'text-[#0d141c] dark:text-white'} text-xs`}>
            {String(i + 1).padStart(2, '0')} • {l.title}
          </Text>
        </TouchableOpacity>
      );
    })
  ) : (
    <Text style={tw`text-[#49739c] dark:text-white/70 text-sm`}>No courses found.</Text>
  )}
</RefreshableScrollView>

      {/* Vertical list (tablet/desktop widths) */}
      <View style={tw`hidden md:flex`}>
        <RefreshableScrollView
       screenId="robot-tutor"
          style={tw`max-h-[70vh]`}
          contentContainerStyle={[tw`pr-1`, { paddingBottom: 16 }]}
          keyboardShouldPersistTaps="always"
        >
          {visible.length ? (
            visible.map((l, i) => {
              const active = l.id === activeId;
              return (
                <TouchableOpacity
                  key={l.id}
                  onPress={() => onSelect(l.id)}
                  style={tw.style(
                    'w-full rounded-lg px-3 py-2 mb-2 border',
                    active
                      ? 'bg-indigo-50 dark:bg-indigo-600/30 border-indigo-600'
                      : 'bg-white dark:bg-[#172534] border-[#cedbe8] dark:border-white/10'
                  )}
                >
                  <View style={tw`flex-row items-center gap-2`}>
                    <Text style={tw`text-[#49739c] dark:text-white/70 text-[11px]`}>
                      {String(i + 1).padStart(2, '0')}
                    </Text>
                    <Text style={tw`text-[#0d141c] dark:text-white flex-1`} numberOfLines={1}>
                      {l.title}
                    </Text>
                  </View>
                  {l.blurb ? (
                    <Text style={tw`text-[#49739c] dark:text-white/70 text-[11px] mt-0.5`} numberOfLines={2}>
                      {l.blurb}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })
          ) : (
            <Text style={tw`text-[#49739c] dark:text-white/70 text-sm`}>No courses found. Try another search.</Text>
          )}
        </RefreshableScrollView>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────
const RobotTeacher: React.FC<RobotTeacherProps> = ({
  defaultVoice = 'en-US-Wavenet-F',
  initialSsml = '',
  voiceName,
  themeOpen: themeOpenProp,
  onThemeOpenChange,
}) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const route = useRoute<RobotTeacherRoute>();

  const params = useMemo(
  () =>
    (route.params ?? {}) as {
      assignmentId?: string | null;
      courseId?: string | null;
      qt?: 'mcq' | 'short' | string | null;
    },
  [route.params]
);

// (Optional) keep a single log ONLY when debugging is explicitly enabled
useEffect(() => {
  dlog('mounted', { params });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);


  const [isMaximized, setIsMaximized] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
const [overlayState, setOverlayState] = useState<{
  words: any[];
  currentIndex: number;
  lesson: any | null;
} | null>(null);

const overlayRef = useRef<LessonOverlayHandle | null>(null);

const openOverlay = useCallback(() => {
  overlayRef.current?.toggle();
}, []);


  const effectiveVoice = voiceName || defaultVoice;
  const { backendUrl, token, role: globalRole } = useShopContext();
  const isGlobalAdmin = globalRole === 'admin' || globalRole === 'superadmin';

  const [internalThemeOpen, setInternalThemeOpen] = useState(false);
  const isThemeControlled = typeof themeOpenProp === 'boolean';
  const themeOpen = isThemeControlled ? (themeOpenProp as boolean) : internalThemeOpen;
  const setThemeOpen = (next: boolean | ((s: boolean) => boolean)) => {
    const v = typeof next === 'function' ? (next as (s: boolean) => boolean)(themeOpen) : next;
    if (!isThemeControlled) setInternalThemeOpen(v);
    onThemeOpenChange?.(v);
  };
 const urlQuizTypeHint = useMemo(() => normQt(params?.qt), [params?.qt]);

  const ai = useAiCourse(backendUrl, token || undefined, {
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
    quiz,
    answers,
    grade,
    step,
    error,
    ttsLoading,
    ttsError,
    loadTopCourses,
    selectCourse,
    startWithAI,
    generateQuizNow,
    answerQuestion,
    allAnswered,
    gradeNow,
    tryGenerateCertificate,
    startCustomTopic,
    nextLesson,
    hasNextLesson,
    onBeforePlay: aiOnBeforePlay,
    onEnded: aiOnEnded,
    currentIdx,
    getLessonAt,
    goNext,
    isBuildingNext,
    clearSelectedCourseCacheNow,
    clearTopCoursesCacheNow,
  } = ai as any;

  const { skus, loading: aiCertLoading, error: aiCertError, message: aiCertMsg, claim, generate: generateAICert } =
    useAICertificates({ backendUrl, token: token || '', courseId: selectedCourse?.id });

  const orgAssign = useOrgAssignment();
  const assignmentId = orgAssign?.assignmentId ?? undefined;
  const isOrgFlow = Boolean(orgAssign?.assignmentId);

  // knobs
  const [classLevel, setClassLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [sizePreset, setSizePreset] = useState<SizePresetKey>('standard');
  const [minutes, setMinutes] = useState<number>(20);
  const [totalLessons, setTotalLessons] = useState<number>(8);
  const [quizCount, setQuizCount] = useState<number>(16);
  const [programTrack, setProgramTrack] = useState<TrackKey>('module');
  const [customTitle, setCustomTitle] = useState('');

  // ✅ booleans expected by ControlsPanel
  const [overrideLessons, setOverrideLessons] = useState(false);
  const [overrideQuiz, setOverrideQuiz] = useState(false);

  // spinner / gating
  const [uiPreparing, setUiPreparing] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerLoading, setPlayerLoading] = useState<boolean>(false);
  const [starting, setStarting] = useState<boolean>(false);

  // run gate to avoid stale toggles
  const runIdRef = useRef(0);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const prevCourseIdRef = useRef<string | null>(null);

  // overrides helpers
  const defaultQuizForLessons = (n: number) => Math.max(4, n * 2);

  // timer
  const [localRemainingMs, setLocalRemainingMs] = useState<number | null>(null);
 useEffect(() => {
  const id = setInterval(() => {
    setLocalRemainingMs(ms => (ms == null ? null : Math.max(0, ms - 1000)));
  }, 1000);
  return () => clearInterval(id);
}, []);

  const timerSec =
    Number(
      (orgAssign as any)?.timerS ??
      (orgAssign as any)?.timerSec ??
      (orgAssign as any)?.timer_s ??
      (orgAssign as any)?.lockedConfig?.timer_s ??
      0
    ) || 0;

  const displayRemainingMs =
    (orgAssign?.remainingMs ?? 0) > 0 ? (orgAssign?.remainingMs as number) :
    (localRemainingMs ?? 0);

  // org role context
  const { activeOrgId, org: orgCtx, isStarterTier } = useOrg();
  const rolesRaw = [
    ...(Array.isArray(orgCtx?.roles) ? orgCtx.roles : []),
    orgCtx?.my_role,
    orgCtx?.role,
  ].filter(Boolean).map((r) => String(r).toLowerCase());
  const roles = new Set(rolesRaw);
  const isAdminOwner = roles.has('owner') || roles.has('admin');
  const isInstructor = roles.has('instructor') || roles.has('teacher');
  const canShareUi = Boolean(activeOrgId && (isAdminOwner || isInstructor || isGlobalAdmin));

  const isLockedLearner = Boolean(orgAssign?.locked ?? (isOrgFlow && !canShareUi));
  const showMinimalControls = isLockedLearner;
  const showCourseList = !isLockedLearner;

  const trackLessons = useMemo(() => {
    const t = TRACKS.find((x) => x.key === programTrack) ?? TRACKS[0];
    return t.lessons;
  }, [programTrack]);

  const restrictStarter = Boolean(activeOrgId && isStarterTier);
  const knobsDisabled = restrictStarter || isLockedLearner;
  const capMinutes = (m?: number) => (restrictStarter ? Math.min(m ?? 30, 30) : (m ?? 20));

  // 🔒 locked config
  const lockedMinutes  = (orgAssign as any)?.lockedConfig?.minutes as number | undefined;
  const lockedLessons  = (orgAssign as any)?.lockedConfig?.totalLessons as number | undefined;
  const lockedQuizSize = (orgAssign as any)?.lockedConfig?.quizSize as number | undefined;

  const minutesEffective = isLockedLearner
    ? capMinutes(typeof lockedMinutes === 'number' ? lockedMinutes : minutes)
    : minutes;

  const lessonsEffective = isLockedLearner
    ? (typeof lockedLessons === 'number' ? Math.max(1, lockedLessons) : trackLessons)
    : (overrideLessons ? totalLessons : trackLessons);

  const quizEffective = isLockedLearner
    ? (typeof lockedQuizSize === 'number' ? Math.max(4, lockedQuizSize) : 16)
    : (overrideQuiz ? quizCount : defaultQuizForLessons(lessonsEffective));

  const safeLessons = lessonsEffective;
  const safeQuiz = quizEffective;

  // reflect lock defaults
  useEffect(() => {
    if (!isLockedLearner) return;
    const lc = (orgAssign as any)?.lockedConfig || {};
    if (typeof lc.minutes === 'number') setMinutes(capMinutes(lc.minutes));
    if (typeof lc.totalLessons === 'number') setTotalLessons(Math.max(1, lc.totalLessons));
    if (typeof lc.quizSize === 'number') setQuizCount(Math.max(4, lc.quizSize));
  }, [isLockedLearner, orgAssign?.lockedConfig]);

  // keep counts in sync with track when not overriding
  useEffect(() => {
    if (!isLockedLearner && !overrideLessons) {
      setTotalLessons(trackLessons);
    }
    if (!isLockedLearner && !overrideQuiz) {
      setQuizCount(defaultQuizForLessons(trackLessons));
    }
  }, [trackLessons, isLockedLearner, overrideLessons, overrideQuiz]);

  // starter tier caps
  useEffect(() => {
    if (!restrictStarter || isLockedLearner) return;
    setMinutes((m) => capMinutes(m));
    setTotalLessons(trackLessons);
    setQuizCount(16);
  }, [restrictStarter, trackLessons, isLockedLearner]);

 
  // load top courses on mount
  useEffect(() => {
    (async () => {
      const preserveIds = params.courseId ? [params.courseId] : [];
      try {
        dlog('loadTopCourses:init {limit:200, preserveIds}', { preserveIds });
        await loadTopCourses?.({ limit: 200, preserveIds } as any);
      } catch {
        try { await loadTopCourses?.(); } catch { /* ignore */ }
      }
    })();
  }, [params.courseId, loadTopCourses]);

  // SSML + content deriveds (now mirrored with web)
  const hasAIContent = useMemo(
    () => Boolean(
      (joinedSsml && String(joinedSsml).trim()) ||
      (ssml && String(ssml).trim()) ||
      (Array.isArray(lessons) && lessons.length > 0)
    ),
    [joinedSsml, ssml, lessons]
  );
  const rawDisplaySsml: string = (hasAIContent ? (joinedSsml || ssml || '') : (initialSsml || '')).trim();
  const [lockedSsml, setLockedSsml] = useState<string | null>(null);
  const displaySsml: string = (lockedSsml ?? rawDisplaySsml).trim();
  const hasJoined = Boolean(joinedSsml && String(joinedSsml).trim());

  // Refs to mirror web behavior for robust start
  const topCoursesRef = useRef<TopCourse[]>([]);
  useEffect(() => { topCoursesRef.current = Array.isArray(topCourses) ? topCourses : []; }, [topCourses]);
  const selectedCourseRef = useRef<typeof selectedCourse>(selectedCourse);
  useEffect(() => { selectedCourseRef.current = selectedCourse; }, [selectedCourse]);

  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
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

  // Only allow first start when there is no built content yet
  const canStartNow = useMemo(() => {
    const hasSeed = Boolean(selectedCourse || (customTitle && customTitle.trim()));
    if (!hasSeed) return false;
    if (activeRunId !== null) return false;
    const noContentYet =
      !(joinedSsml && String(joinedSsml).trim()) &&
      !(ssml && String(ssml).trim()) &&
      !(Array.isArray(lessons) && lessons.length > 0) &&
      !(Array.isArray(outline) && outline.length > 0);
    return noContentYet;
  }, [
    selectedCourse,
    customTitle,
    activeRunId,
    joinedSsml,
    ssml,
    lessons.length,
    outline.length,
  ]);

  // preselect course from route param — cancel any active run
  useEffect(() => {
    if (!params.courseId || !topCourses?.length) return;
    if (selectedCourse?.id === params.courseId) return;
    const found = topCourses.find((c: TopCourse) => c.id === params.courseId) || null;
    if (found) {
      setActiveRunId(null);
      setUiPreparing(false);
      setPlayerReady(false);
      setPlayerLoading(false);
      setLockedSsml(null);
      selectCourse(found);
    }
  }, [params.courseId, topCourses, selectedCourse, selectCourse]);

  useEffect(() => {
    if (activeRunId !== null && hasJoined && playerReady) {
      setActiveRunId(null);
    }
  }, [activeRunId, hasJoined, playerReady]);

  useEffect(() => { if (isLockedLearner) setShareOpen(false); }, [isLockedLearner]);

  // auto-select first course — keep default "Start with AI"
  useEffect(() => {
    if (!selectedCourse && Array.isArray(topCourses) && topCourses.length > 0 && !customTitle.trim()) {
      dlog('auto-selecting first course', { id: topCourses[0]?.id, title: topCourses[0]?.title });
      setActiveRunId(null);
      setUiPreparing(false);
      setPlayerReady(false);
      setPlayerLoading(false);
      setLockedSsml(null);
      selectCourse(topCourses[0]);
    }
  }, [topCourses, selectedCourse, selectCourse, customTitle]);

  const compat = ai as any;
  const hasMoreCourses: boolean = Boolean(compat?.hasMoreCourses ?? compat?.coursesHasMore ?? compat?.hasMore);
  const handleLoadMore = async () => {
    const preserveIds = params.courseId ? [params.courseId] : [];
    const coursesCursor: string | null = compat?.coursesCursor ?? compat?.nextCursor ?? null;
    const opts = coursesCursor
      ? { append: true, cursor: coursesCursor, limit: 200, preserveIds }
      : { append: true, page: 'next', limit: 200, preserveIds };

    try {
      dlog('loadTopCourses:more', opts);
      await loadTopCourses?.(opts as any);
    } catch {
      try { await loadTopCourses?.({ append: true, preserveIds } as any); }
      catch { await loadTopCourses?.({ preserveIds } as any); }
    }
  };

  const refreshCourseList = useCallback(async () => {
    const preserveIds = params.courseId ? [params.courseId] : [];
    dlog('refreshCourseList → clearTopCoursesCacheNow + reload', { preserveIds });
    try { await clearTopCoursesCacheNow?.(); } catch {}
    try {
      await loadTopCourses?.({ limit: 200, preserveIds } as any);
    } catch {
      await loadTopCourses?.({ preserveIds } as any);
    }
  }, [clearTopCoursesCacheNow, loadTopCourses, params.courseId]);

  // Lesson list with stable id (parity with web)
 const lessonsArr = useMemo(() => {
  const total = Math.max(1, Number(safeLessons ?? 1));
  const out: any[] = [];

  for (let i = 0; i < total; i++) {
    const L = typeof getLessonAt === 'function' ? getLessonAt(i) : null;

    // Keep indices aligned. If not built yet, keep placeholder with empty ssml.
    // ✅ include overlay payload (formulas/tables/snippets/charts) if present from getLessonAt()
out.push({
  id: (L as any)?.id ?? `${selectedCourse?.id || 'course'}:${i}`,
  title: (L as any)?.title ?? outline?.[i]?.title ?? `Lesson ${i + 1}`,
  ssml: (L as any)?.ssml ?? '',
  markdown: (L as any)?.markdown ?? '',
  formulas: (L as any)?.formulas ?? [],
  tables: (L as any)?.tables ?? [],
  snippets: (L as any)?.snippets ?? [],
  charts: (L as any)?.charts ?? [],
});

  }

  return out;
}, [getLessonAt, safeLessons, selectedCourse?.id, outline]);

const currentLessonForOverlay = lessonsArr?.[Number(currentIdx ?? 0)] ?? null;
const overlayAvailable =
  !!(currentLessonForOverlay?.formulas?.length ||
     currentLessonForOverlay?.tables?.length ||
     currentLessonForOverlay?.snippets?.length ||
     currentLessonForOverlay?.charts?.length);


  useEffect(() => {
    if (hasAIContent) setIsMaximized(true);
  }, [hasAIContent]);

  // Auth helpers
  const goToLoginWithReturn = (reason?: string, message?: string) => {
    dlog('navigate → Login', { reason, message });
    navigation.navigate('Login' as any, { reason, message } as any);
  };
  const requireAuth = (reason?: string, message?: string) => {
    if (token) return true;
    goToLoginWithReturn(reason, message);
    return false;
  };

  // Quiz answer helper
  const disableQuiz = Boolean(
    (isOrgFlow && ((orgAssign?.expired) || (localRemainingMs !== null && localRemainingMs <= 0))) || grade
  );
  const handleAnswer = useCallback((qid: string, value: number | string) => {
    if (disableQuiz) return;
    answerQuestion(qid, value);
  }, [disableQuiz, answerQuestion]);

  // Prev navigation (parity with web)
  const goPrev = useCallback(async () => {
    if ((currentIdx ?? 0) <= 0) return false;
    if (typeof (ai as any).goTo === 'function') {
      (ai as any).goTo(currentIdx - 1);
      return true;
    }
    if (typeof (ai as any).setCurrentIdx === 'function') {
      (ai as any).setCurrentIdx(currentIdx - 1);
      return true;
    }
    return false;
  }, [currentIdx, ai]);

  const handlePlayerReady = useCallback(() => {
  setPlayerReady(true);
}, []);

const handlePlayerLoadingChange = useCallback((loading: boolean) => {
  setPlayerLoading(loading);
}, []);

const handleToggleMaximized = useCallback(() => {
  setIsMaximized(v => !v);
}, []);


  // ─────────────────────────────────────────────────────────
  // Prefetch policy: warm exactly N lessons once, then stop
  // ─────────────────────────────────────────────────────────
  const PREFETCH_BUFFER = 2;
  const prefetchedIdxRef = useRef<number | null>(null);

  const canBuildMore = useCallback(() => {
    const h = hasNextLesson as unknown as boolean | (() => boolean) | undefined;
    return typeof h === 'function' ? (h as () => boolean)() : Boolean(h);
  }, [hasNextLesson]);

  const prefetchAhead = useCallback(async (n: number = PREFETCH_BUFFER) => {
    if (typeof nextLesson !== 'function' || typeof getLessonAt !== 'function') return;
    const base = Number(currentIdx ?? 0);
    for (let k = 1; k <= n; k++) {
      const exists = !!getLessonAt(base + k);
      if (!exists && canBuildMore()) {
        try {
          await nextLesson({ silent: true });
        } catch (e) {
          console.warn('[prefetchAhead] nextLesson failed', e);
          break;
        }
      }
    }
  }, [currentIdx, getLessonAt, nextLesson, canBuildMore]);

  // Start — robust sequencing (parity-ish with web, but keeping your start gate)
  const onStart = useCallback(async () => {
    if (starting || !canStartNow) {
      dlog('onStart: ignored (starting=', starting, ', canStartNow=', canStartNow, ')');
      return;
    }
    setStarting(true);

    const courseSize = sizeToCourseSize[sizePreset];
    const opts: any = {
      assignmentId,
      courseSize,
      level: classLevel,
      minutes: minutesEffective,
      programTrack,
      totalLessons: safeLessons,
      voiceName: effectiveVoice,
    };

    const id = ++runIdRef.current;
    setActiveRunId(id);
    setUiPreparing(true);
    setPlayerReady(false);
    setPlayerLoading(true);
    setLockedSsml(null);

    try {
      const custom = customTitle.trim();

      if (custom) {
        await startCustomTopic(custom);
        await waitForSelection();
        opts.courseId = selectedCourseRef.current?.id;
        await startWithAI(opts);
        return;
      }

      let course = selectedCourseRef.current ?? topCoursesRef.current[0] ?? null;
      if (!course) {
        try { await loadTopCourses?.({ limit: 200, preserveIds: params.courseId ? [params.courseId] : [] } as any); } catch {}
        await waitForCourses();
        course = selectedCourseRef.current ?? topCoursesRef.current[0] ?? null;
      }

      if (course && (!selectedCourseRef.current || selectedCourseRef.current.id !== course.id)) {
        selectCourse(course);
        await waitForSelection();
      }

      if (!selectedCourseRef.current) {
        dlog('onStart: bail — no course available after waiting');
        Alert.alert('Could not start', 'No course is selected yet. Please choose a course and try again.');
        setActiveRunId(null);
        setUiPreparing(false);
        setPlayerLoading(false);
        return;
      }

      opts.courseId = selectedCourseRef.current.id;
      dlog('onStart → startWithAI', { opts, selectedId: selectedCourseRef.current.id });
      await startWithAI(opts);
    } catch (e) {
      console.error('[onStart] failed', e);
      setActiveRunId(null);
      setUiPreparing(false);
      setPlayerLoading(false);
    } finally {
      setStarting(false);
    }
  }, [
    starting, canStartNow,
    assignmentId, sizePreset, classLevel, minutesEffective, programTrack, safeLessons, effectiveVoice,
    customTitle, startCustomTopic, startWithAI, loadTopCourses, selectCourse, params.courseId
  ]);

  // course change — cancel any active run and spinner
  useEffect(() => {
    const cid = selectedCourse?.id || null;
    if (prevCourseIdRef.current === null) {
      prevCourseIdRef.current = cid;
      return;
    }
    if (cid !== prevCourseIdRef.current) {
      setActiveRunId(null);
      setUiPreparing(false);
      setPlayerReady(false);
      setPlayerLoading(false);
      setLockedSsml(null);
      prevCourseIdRef.current = cid;
    }
  }, [selectedCourse?.id]);

  // drop spinner & gate on AI/TTS errors
  useEffect(() => {
    if (error || ttsError) {
      setUiPreparing(false);
      setActiveRunId(null);
      setPlayerLoading(false);
    }
  }, [error, ttsError]);

  const refreshSelectedAI = useCallback(async () => {
    if (!selectedCourse) return;
    Alert.alert(
      'Refresh AI Content',
      'This clears the cached outline, narration, and quiz, then regenerates fresh content.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Refresh',
          style: 'destructive',
          onPress: async () => {
            dlog('refreshSelectedAI → clearSelectedCourseCacheNow then reseed', { courseId: selectedCourse.id });
            const id = ++runIdRef.current;
            setActiveRunId(id);
            setUiPreparing(true);
            setPlayerLoading(true);
            setPlayerReady(false);
            setLockedSsml(null);
            try { await clearSelectedCourseCacheNow?.(); } catch {}
            selectCourse(selectedCourse);
            await onStart();
          },
        },
      ]
    );
  }, [selectedCourse, clearSelectedCourseCacheNow, selectCourse, onStart]);

  // compat flags (for hasMore + degraded banners)
  const degraded: boolean = Boolean(compat?.degradedNotice?.degraded);

  // Gate "preparing" with activeRunId + playerLoading + readiness checks
  useEffect(() => {
    if (activeRunId === null) {
      setUiPreparing(false);
      return;
    }
    const shouldPrepare =
      step === 'outlining' ||
      step === 'narrating' ||
      !!ttsLoading ||
      !hasAIContent ||
      playerLoading ||
      !playerReady;

    setUiPreparing(shouldPrepare);
  }, [activeRunId, step, ttsLoading, hasAIContent, playerReady, playerLoading]);

  const preparingNow =
    (activeRunId !== null) && (
      uiPreparing ||
      step === 'outlining' ||
      step === 'narrating' ||
      !!ttsLoading ||
      !hasJoined ||
      playerLoading ||
      !playerReady
    );

  // Payment & certificate state (parity with web)
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [certUrl, setCertUrl] = useState<string | null>(null);
  const [downUrl, setDownUrl] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────
  // onBeforePlay / onEnded wrappers (SSML lock + prefetch)
  // ─────────────────────────────────────────────────────────
    const onBeforePlayWrapped = useCallback(async () => {
    dlog('Classroom onBeforePlay (policy)');
    if (!lockedSsml) setLockedSsml(rawDisplaySsml);

    // keep any internal AI hook behavior (TTS warmup, etc.)
    await aiOnBeforePlay?.();
  }, [lockedSsml, rawDisplaySsml, aiOnBeforePlay]);


    const onRequestStartWrapped = useCallback(async () => {
    const idx = Number(currentIdx ?? 0);

    // only once per lesson index
    if (prefetchedIdxRef.current === idx) return;

    dlog('Prefetch@70% → prefetchAhead', { idx, buffer: PREFETCH_BUFFER });

    await prefetchAhead(PREFETCH_BUFFER);
    prefetchedIdxRef.current = idx;
  }, [currentIdx, prefetchAhead]);

  const onEndedWrapped = useCallback(() => {
    dlog('Classroom onEnded (policy) — no further background generation');
    setLockedSsml(null);
    aiOnEnded?.();
  }, [aiOnEnded]);

const bottomPad = (insets?.bottom ?? 0) + 24;

const scrollContentContainerStyle = useMemo(
  () => [tw`px-3 py-4 md:px-5 md:py-6`, { paddingBottom: bottomPad }],
  [bottomPad]
);

const scrollContentInset = useMemo(
  () => ({ bottom: bottomPad }),
  [bottomPad]
);


 return (
  <SafeAreaView edges={['bottom']} style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
    <View style={tw`flex-1`}>
      <RefreshableScrollView
        screenId="robot-tutor"
        contentContainerStyle={scrollContentContainerStyle}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
        removeClippedSubviews={false}
        contentInsetAdjustmentBehavior="automatic"
        contentInset={scrollContentInset}
      >
        <View style={tw`flex-col md:flex-row gap-4`}>
          {/* LEFT (main) */}
          <View style={tw`${showCourseList ? 'md:w-2/3' : 'md:w-full'} w-full`}>
            <View style={tw`mb-4`}>
              <Text style={tw`text-[#0d141c] dark:text-white font-black text-2xl md:text-3xl`}>
                AI Tutor Studio
              </Text>
              <Text style={tw`text-[#49739c] dark:text-white/80 mt-1`}>
                Free lesson (audio + captions + slides) and quiz. Score{' '}
                <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>≥ 70%</Text> to unlock your certificate
                {isOrgFlow ? ' — covered by your organization' : ''}.
              </Text>
            </View>

            {/* Share dialog near header */}
            <Modal
              visible={canShareUi && shareOpen}
              transparent
              animationType="fade"
              onRequestClose={() => setShareOpen(false)}
            >
              <OrgShareDialog
                open={canShareUi && shareOpen}
                onClose={() => setShareOpen(false)}
                courseId={selectedCourse?.id || null}
                courseTitle={selectedCourse?.title || (customTitle || null)}
                totalLessons={safeLessons}
                quizCount={safeQuiz}
                minutes={capMinutes(minutes)}
              />
            </Modal>

            {degraded && (
              <View style={tw`rounded-xl p-3 bg-yellow-50 border border-yellow-300 mb-3`}>
                <Text style={tw`text-yellow-700 dark:text-yellow-200 text-sm`}>
                  High demand fallback: content may be simplified, but your progress still counts.
                </Text>
              </View>
            )}

            {/* Step indicator */}
            <View style={tw`flex-row flex-wrap items-center gap-2 mb-3`}>
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
                  <View
                    key={s.k}
                    style={tw.style(
                      'px-2 py-1 rounded-full border',
                      active
                        ? 'bg-indigo-50 dark:bg-indigo-600/30 border-indigo-600'
                        : 'bg-white dark:bg-[#172534] border-[#cedbe8] dark:border-white/10'
                    )}
                  >
                    <Text style={tw`text-[#0d141c] dark:text-white text-[11px]`}>
                      {i + 1}. {s.label}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Controls */}
            <ControlsPanel
              showMinimalControls={showMinimalControls}
              isLockedLearner={isLockedLearner}
              canShareUi={canShareUi}
              onOpenOverlay={openOverlay}
              overlayAvailable={overlayAvailable}
              restrictStarter={restrictStarter}
              knobsDisabled={knobsDisabled}
              onOpenShare={() => {
                setIsMaximized(false);
                setShareOpen(true);
              }}
              busy={preparingNow || starting}
              topCourses={(topCourses || []).map((c: TopCourse) => ({ id: c.id, title: c.title }))}
              selectedCourse={selectedCourse ? { id: selectedCourse.id, title: selectedCourse.title } : null}
              onSelectCourse={(id) => {
                const found = (topCourses || []).find((c: TopCourse) => c.id === id) || null;
                dlog('CourseSelect.onChange/Select →', { id, foundTitle: found?.title });

                setActiveRunId(null);
                setUiPreparing(false);
                setPlayerReady(false);
                setPlayerLoading(false);
                setLockedSsml(null);

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
              setProgramTrack={setProgramTrack}
              capMinutes={capMinutes}
              totalLessons={totalLessons}
              setTotalLessons={setTotalLessons}
              quizCount={quizCount}
              setQuizCount={setQuizCount}
              overrideLessons={overrideLessons}
              setOverrideLessons={setOverrideLessons}
              overrideQuiz={overrideQuiz}
              setOverrideQuiz={setOverrideQuiz}
              customTitle={customTitle}
              setCustomTitle={(s: string) => {
                setCustomTitle(s);
                if (s.trim()) selectCourse(null);
              }}
              hasAIContent={hasAIContent}
              onStart={onStart}
              onRefreshSelectedAI={refreshSelectedAI}
            />

            {/* Classroom / Outline / Quiz */}
            <LessonAndQuizPane
              compactPlayer={true}
              showCourseList={showCourseList}
              displaySsml={displaySsml}
              onPlayerReady={handlePlayerReady}
              onPlayerLoadingChange={handlePlayerLoadingChange}
              onToggleMaximized={handleToggleMaximized}
              onNext={goNext}
              onPrev={goPrev}
              isBuildingNext={isBuildingNext}
              lessonsArr={lessonsArr}
              activeIndex={currentIdx ?? 0}
              voiceName={voiceName || defaultVoice}
              courseTitle={selectedCourse?.title || (customTitle || 'AI Lesson')}
              isMaximized={isMaximized}
              course={selectedCourse || null}
              currentIdx={currentIdx ?? 0}
              outline={outline}
              backendUrl={backendUrl}
              onBeforePlay={onBeforePlayWrapped}
              onEnded={onEndedWrapped}
              onRequestStart={onRequestStartWrapped}
              themeOpen={themeOpen}
              onThemeOpenChange={(open: boolean) => {
                dlog('themeOpen →', open);
                setThemeOpen(open);
              }}
              isOrgFlow={isOrgFlow}
              assignmentId={assignmentId}
              timerSec={timerSec}
              generateQuizNow={async (
                count?: number,
                _courseSize?: string,
                _programTrack?: string,
                _totalLessons?: number,
                assignmentIdFromChild?: string,
                quizType?: 'mcq' | 'short',
                opts?: { lessonIndex?: number }
              ) => {
                const n = typeof count === 'number' ? count : safeQuiz;
                await generateQuizNow(
                  n,
                  sizeToCourseSize[sizePreset] as any,
                  programTrack as any,
                  safeLessons,
                  assignmentIdFromChild ?? assignmentId,
                  quizType,
                  opts
                );
              }}
              safeLessons={safeLessons}
              safeQuiz={safeQuiz}
              overrideLessons={overrideLessons} 
              quiz={quiz}
              answers={answers}
              onAnswer={handleAnswer}
              allAnswered={allAnswered}
              grade={grade}
              gradeNow={async () => {
                await gradeNow();
              }}
              token={token || ''}
              requireAuth={requireAuth}
              isOrgFlowFlag={isOrgFlow}
              skus={skus}
              aiCertLoading={aiCertLoading}
              aiCertError={aiCertError}
              aiCertMsg={aiCertMsg}
              claim={async (code: string) => {
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
              onStart={onStart}
              hasJoined={hasJoined}
              canAutoStart={false}
              onViewResults={(courseId: string, courseTitle: string, g: { scorePct: number; passMark: number; passed: boolean }) => {
                dlog('navigate → Results', { courseId, courseTitle, grade: g });
                navigation.navigate(
                  'Results' as any,
                  {
                    courseId,
                    courseTitle,
                    grade: {
                      scorePct: g.scorePct,
                      passMark: g.passMark,
                      passed: g.passed,
                    },
                  } as any
                );
              }}
              onOverlayState={setOverlayState}
            />
          </View>

          {/* RIGHT (course list) */}
          {showCourseList && (
            <View style={tw`w-full md:w-1/3`}>
              <CourseList
                items={(topCourses || []).map((c: TopCourse) => ({
                  id: c.id,
                  title: c.title,
                  blurb: getCourseBlurb(c),
                }))}
                activeId={selectedCourse?.id || null}
                onSelect={(id) => {
                  const found = (topCourses || []).find((c: TopCourse) => c.id === id) || null;
                  dlog('CourseList.onSelect', { id, title: found?.title });

                  setActiveRunId(null);
                  setUiPreparing(false);
                  setPlayerReady(false);
                  setPlayerLoading(false);
                  setLockedSsml(null);

                  selectCourse(found);
                }}
                onRefresh={refreshCourseList}
                onLoadMore={handleLoadMore}
                hasMore={Boolean(hasMoreCourses)}
              />
            </View>
          )}
        </View>
      </RefreshableScrollView>

      {/* ✅ GLOBAL OVERLAY LAYER (outside ScrollView, above everything) */}
      <View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFillObject, { zIndex: 999999, elevation: 999999 }]}
      >
        <LessonOverlayNative
          lesson={currentLessonForOverlay}
          rememberKey={`robotTutor:${selectedCourse?.id || customTitle || 'free'}`}
          zIndex={999999}
          ref={overlayRef}
        />
      </View>
    </View>
  </SafeAreaView>
);

};

export default RobotTeacher;
