/* eslint-disable no-console */
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  StyleSheet,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute, RouteProp, NavigationProp } from '@react-navigation/native';
import tw from '../../tailwind';
import { RefreshableScrollView } from '../refresh/Refreshable';
import LessonOverlayNative, { type LessonOverlayHandle } from './LessonOverlay.native';
import { resolveCourseTitleInfo } from '@mytutorapp/shared/utils/resolveCourseTitle';
import { getRequiredWeeks, normalizeProgramTrack } from '@mytutorapp/shared/utils/programTrackRequirements';
import * as Linking from 'expo-linking';
import * as Localization from 'expo-localization';

import { useOrgAssignment } from '@mytutorapp/shared/hooks/useOrgAssignment';
import { useAiCourse, useAICertificates } from '@mytutorapp/shared/hooks';
import { useShopContext } from '@mytutorapp/shared/context';

import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { updateCourseProgress } from '@mytutorapp/shared/api/courseProgressApi';
import { startLanguageCourse, purchaseLanguageBundle } from '@mytutorapp/shared/api';
import { detectLanguageIntent, isLanguageIntentText } from '@mytutorapp/shared/utils/languageDetection';

import type { TopCourse } from '@mytutorapp/shared/types';
import type { MainStackParamList } from '../navigation/types';

import ControlsPanel from './RobotTeacherControls.native';
import LessonAndQuizPane from './RobotTeacherLessonAndQuiz.native';
import OrgShareDialog from '@/screens/org/OrgShareDialog.native';

// ─────────────────────────────────────────────────────────
// Utils / Debug
// ─────────────────────────────────────────────────────────
const DBG_ROBOT_TEACHER = __DEV__ && Boolean((globalThis as any)?.__DBG_ROBOT_TEACHER__);

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
  { key: 'module', label: 'Module', lessons: getRequiredWeeks('module') },
  { key: 'certificate', label: 'Certificate', lessons: getRequiredWeeks('certificate') },
  { key: 'diploma', label: 'Professional', lessons: getRequiredWeeks('diploma') },     // ✅
  { key: 'degree', label: 'Comprehensive', lessons: getRequiredWeeks('degree') },     // ✅
] as const;
export type TrackKey = (typeof TRACKS)[number]['key'];

const ESL_CARD_LABEL = 'English (ESL)';
const SUPPORT_LANGUAGE_STORAGE_KEY = 'learning_support_language_v1';

const LANGUAGE_CARDS = [
  { key: 'en_esl', language: ESL_CARD_LABEL, emoji: '🇬🇧', subtitle: 'Work + daily life' },
  { key: 'de', language: 'German', emoji: '🇩🇪', subtitle: 'Start a lesson' },
  { key: 'fr', language: 'French', emoji: '🇫🇷', subtitle: 'Build confidence' },
  { key: 'es', language: 'Spanish', emoji: '🇪🇸', subtitle: 'Quick practice' },
  { key: 'ar', language: 'Arabic', emoji: '🇸🇦', subtitle: 'New phrases' },
  { key: 'hi', language: 'Hindi', emoji: '🇮🇳', subtitle: 'Everyday talk' },
  { key: 'ur', language: 'Urdu', emoji: '🇵🇰', subtitle: 'Quick practice' },
  { key: 'tr', language: 'Turkish', emoji: '🇹🇷', subtitle: 'New phrases' },
  { key: 'ru', language: 'Russian', emoji: '🇷🇺', subtitle: 'Build confidence' },
  { key: 'tl', language: 'Tagalog', emoji: '🇵🇭', subtitle: 'Start a lesson' },
  { key: 'ml', language: 'Malayalam', emoji: '🇮🇳', subtitle: 'Daily life' },
] as const;

type SupportLanguageOption = 'auto' | 'ar' | 'hi' | 'ur' | 'en';
type SupportLanguageResolved = Exclude<SupportLanguageOption, 'auto'>;

const SUPPORT_LANGUAGE_OPTIONS: Array<{
  value: SupportLanguageOption;
  label: string;
  subtitle?: string;
}> = [
  { value: 'auto', label: 'Auto (recommended)', subtitle: 'Uses your device + region' },
  { value: 'ar', label: 'Arabic', subtitle: 'العربية' },
  { value: 'hi', label: 'Hindi', subtitle: 'हिन्दी' },
  { value: 'ur', label: 'Urdu', subtitle: 'اردو' },
  { value: 'en', label: 'English', subtitle: 'English' },
];



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
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  return s === 'short' ? 'short' : s === 'mcq' ? 'mcq' : undefined;
};

const normalizeLocaleTag = (value?: string | null) =>
  String(value || '')
    .trim()
    .replace('_', '-')
    .toLowerCase();

const normalizeCountryHint = (value?: string | null) => {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  if (raw === 'QATAR') return 'QA';
  if (raw === 'SAUDI ARABIA' || raw === 'SAUDI') return 'SA';
  if (raw === 'UNITED ARAB EMIRATES' || raw === 'UAE') return 'AE';
  if (raw === 'PAKISTAN') return 'PK';
  if (raw === 'INDIA') return 'IN';
  return raw;
};

const resolveSupportLanguageAuto = ({
  locale,
  profileLanguage,
  uiLanguage,
  timeZone,
  profileCountry,
  orgCountry,
}: {
  locale?: string | null;
  profileLanguage?: string | null;
  uiLanguage?: string | null;
  timeZone?: string | null;
  profileCountry?: string | null;
  orgCountry?: string | null;
}): SupportLanguageResolved => {
  const prioritizedLangs = [profileLanguage, uiLanguage];
  for (const lang of prioritizedLangs) {
    const normalized = normalizeLocaleTag(lang);
    if (normalized.startsWith('ar')) return 'ar';
    if (normalized.startsWith('hi')) return 'hi';
    if (normalized.startsWith('ur')) return 'ur';
    if (normalized.startsWith('en')) return 'en';
  }

  const normalizedLocale = normalizeLocaleTag(locale);
  if (normalizedLocale.startsWith('ar')) return 'ar';
  if (normalizedLocale.startsWith('hi')) return 'hi';
  if (normalizedLocale.startsWith('ur')) return 'ur';

  const tz = String(timeZone || '').trim();
  if (tz === 'Asia/Riyadh' || tz === 'Asia/Qatar') return 'ar';
  if (tz === 'Asia/Kolkata') return 'hi';
  if (tz === 'Asia/Karachi') return 'ur';

  const countryRaw = normalizeCountryHint(profileCountry) || normalizeCountryHint(orgCountry);

  const arabicCountries = new Set([
    'AE',
    'SA',
    'QA',
    'KW',
    'BH',
    'OM',
    'EG',
    'JO',
    'IQ',
    'LB',
    'MA',
    'DZ',
    'TN',
    'LY',
    'SD',
    'SY',
    'YE',
  ]);

  if (arabicCountries.has(countryRaw)) return 'ar';
  if (countryRaw === 'IN') return 'hi';
  if (countryRaw === 'PK') return 'ur';

  return 'en';
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
        (it.title || '').toLowerCase().includes(q) || (it.blurb || '').toLowerCase().includes(q)
    );
  }, [items, query]);

  return (
    <View
      style={tw`rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 p-3`}
    >
      {/* Actions */}
      <View style={tw`flex-row items-center gap-2 mb-2`}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search courses…"
          placeholderTextColor="#7a8aa0"
          style={tw`flex-1 rounded-xl px-3 py-2 bg-[#e7edf4] dark:bg-[#172534] text-[#0d141c] dark:text-white`}
        />
        <TouchableOpacity
          onPress={onRefresh}
          style={tw`px-3 py-2 rounded-lg bg-white dark:bg-[#172534] border border-[#cedbe8] dark:border-white/15`}
        >
          <Text style={tw`text-[#0d141c] dark:text-white text-xs font-semibold`}>Refresh</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onLoadMore}
          disabled={!hasMore}
          style={tw.style(
            'px-3 py-2 rounded-lg',
            hasMore
              ? 'bg-indigo-600'
              : 'bg-white dark:bg-[#172534] border border-[#cedbe8] dark:border-white/15 opacity-70'
          )}
        >
          <Text
            style={tw`${hasMore ? 'text-white' : 'text-[#0d141c] dark:text-white'} text-xs font-semibold`}
          >
            {hasMore ? 'Load more' : 'All loaded'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Horizontal chips */}
      <ScrollView
        horizontal
        nestedScrollEnabled
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
                <Text
                  style={tw`${active ? 'text-white' : 'text-[#0d141c] dark:text-white'} text-xs`}
                >
                  {String(i + 1).padStart(2, '0')} • {l.title}
                </Text>
              </TouchableOpacity>
            );
          })
        ) : (
          <Text style={tw`text-[#49739c] dark:text-white/70 text-sm`}>No courses found.</Text>
        )}
      </ScrollView>

      {/* Vertical list (tablet/desktop widths) */}
      <View style={tw`hidden md:flex`}>
       <ScrollView
          nestedScrollEnabled
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
                    <Text
                      style={tw`text-[#49739c] dark:text-white/70 text-[11px] mt-0.5`}
                      numberOfLines={2}
                    >
                      {l.blurb}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })
          ) : (
            <Text style={tw`text-[#49739c] dark:text-white/70 text-sm`}>
              No courses found. Try another search.
            </Text>
          )}
        </ScrollView>
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
  // ✅ Deep-link query params (works for shared links / invites)
const url = Linking.useURL();

const qp = useMemo(
  () => (url ? (Linking.parse(url).queryParams ?? {}) : {}),
  [url]
);

const qpLocked = String((qp as any).lock ?? '') === '1';

const qpCourseId = String((qp as any).courseId ?? (qp as any).course_id ?? '').trim();
const qpAssignmentId = String((qp as any).assignmentId ?? (qp as any).assignment_id ?? '').trim();
const qpCourseTitle = String(
  (qp as any).courseTitle ??
  (qp as any).ct ??
  (qp as any).title ??   // ✅ support "title"
  (qp as any).t ??       // ✅ support "t"
  ''
).trim();

const qpProgramTrack = String(
  (qp as any).programTrack ?? (qp as any).program_track ?? (qp as any).track ?? ''
).trim();
const qpLockTrack = String((qp as any).lockTrack ?? (qp as any).trackLock ?? '').trim() === '1';
const qpStartWeek = String((qp as any).startWeek ?? (qp as any).start_week ?? '').trim();
const qpSource = String((qp as any).source ?? '').trim();

// optional: if you also pass qt/qs in shared links
const qpQt = String((qp as any).qt ?? '').trim();
const qpQs = String((qp as any).qs ?? '').trim();

const params = useMemo(
  () => {
    const rp = (route.params ?? {}) as any;

    // ✅ prefer deep-link qp over navigation params when present
    const merged: any = { ...rp };

    if (qpAssignmentId) merged.assignmentId = qpAssignmentId;
    if (qpCourseId) merged.courseId = qpCourseId;
    if (qpCourseTitle) merged.courseTitle = qpCourseTitle;
    if (qpLocked) merged.lock = '1';
    if (qpProgramTrack) merged.programTrack = qpProgramTrack;
    if (qpLockTrack) merged.lockTrack = '1';
    if (qpStartWeek) merged.startWeek = qpStartWeek;
    if (qpSource) merged.source = qpSource;

    if (qpQt) merged.qt = qpQt;
    if (qpQs) merged.qs = qpQs;

    return merged as {
      assignmentId?: string | null;
      courseId?: string | null;
      courseTitle?: string | null;
      programTrack?: string | null;
      lock?: string | null;
      lockTrack?: string | null;
      startWeek?: string | number | null;
      source?: string | null;
      flow?: string | null;
      qt?: 'mcq' | 'short' | string | null;
      qs?: string | null;
    };
  },
  [
    route.params,
    qpAssignmentId,
    qpCourseId,
    qpCourseTitle,
    qpLocked,
    qpProgramTrack,
    qpLockTrack,
    qpStartWeek,
    qpSource,
    qpQt,
    qpQs,
  ]
);

  const startWeekValue = useMemo(() => {
    const parsed = params?.startWeek != null ? Number(params.startWeek) : null;
    return typeof parsed === 'number' && Number.isFinite(parsed)
      ? Math.max(1, Math.trunc(parsed))
      : null;
  }, [params?.startWeek]);
  const startIdx =
    typeof startWeekValue === 'number' && Number.isFinite(startWeekValue)
      ? Math.max(0, startWeekValue - 1)
      : null;
  const isSandboxSource = params?.source === 'sandbox';
const wantedCourseId = useMemo(() => {
  const cid = params?.courseId ? String(params.courseId).trim() : '';
  return cid || '';
}, [params?.courseId]);



  // (Optional) keep a single log ONLY when debugging is explicitly enabled
  useEffect(() => {
    dlog('mounted', { params });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isMaximized, setIsMaximized] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharedCourseMissing, setSharedCourseMissing] = useState(false);
  const [sharedCourseChecked, setSharedCourseChecked] = useState(false);
  const [disableRefresh, setDisableRefresh] = useState(false);

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
  const {
    backendUrl,
    token,
    orgToken,
    authMode,
    role: globalRole,
    profile,
    language: uiLanguage,
  } = useShopContext() as any;
  const authToken = authMode === 'org' ? orgToken : token;

  // ✅ Language learning must use the user's token (wallet tokens live on user)
  const languageToken = token;

  // ─────────────────────────────────────────────────────────
  // Auth helpers (must be declared BEFORE requireLanguageAuth)
  // ─────────────────────────────────────────────────────────
  const goToLoginWithReturn = useCallback(
    (reason?: string, message?: string) => {
      dlog('navigate → Login', { reason, message });
      navigation.navigate('Login' as any, { reason, message } as any);
    },
    [navigation]
  );

  const requireAuth = useCallback(
    (reason?: string, message?: string) => {
      if (authToken) return true;
      goToLoginWithReturn(reason, message);
      return false;
    },
    [authToken, goToLoginWithReturn]
  );

  const requireLanguageAuth = useCallback(
    (reason?: string, message?: string) => {
      if (languageToken) return true;
      goToLoginWithReturn(reason ?? 'language-learning', message ?? 'Please sign in to continue.');
      return false;
    },
    [languageToken, goToLoginWithReturn]
  );


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

  const ai = useAiCourse(backendUrl, authToken || undefined, {
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
    joinedNarrationDisplay,
    joinedNarrationTts,
    quiz,
    answers,
    grade,
    step,
    error,
    ttsLoading,
    ttsError,
    gateMode,
    gateNotice,
    gateUsage,
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
    setCurrentIdx,
    getLessonAt,
    goNext,
    isBuildingNext,
    clearSelectedCourseCacheNow,
    clearTopCoursesCacheNow,
  } = ai as any;

  const {
    skus,
    loading: aiCertLoading,
    error: aiCertError,
    message: aiCertMsg,
    claim,
    generate: generateAICert,
  } = useAICertificates({ backendUrl,  token: authToken || '', courseId: selectedCourse?.id });

  const orgAssign = useOrgAssignment();


  const assignmentId =
  (orgAssign as any)?.assignmentId ??
  (params.assignmentId ? String(params.assignmentId) : undefined);

const isOrgFlow = Boolean(assignmentId);

const shareHasAssignment = Boolean(qpAssignmentId);

// ✅ don’t validate against topCourses in orgToken invite flow (or assignment share)
const validateAgainstTopCourses = Boolean(
  params.courseId && !shareHasAssignment && !isOrgFlow && !orgToken
);



  // knobs
  const [classLevel, setClassLevel] = useState<'beginner' | 'intermediate' | 'advanced'>(
    'beginner'
  );
  const [sizePreset, setSizePreset] = useState<SizePresetKey>('standard');
  const [minutes, setMinutes] = useState<number>(20);
  const [totalLessons, setTotalLessons] = useState<number>(8);
  const [quizCount, setQuizCount] = useState<number>(16);
  const [programTrack, setProgramTrack] = useState<TrackKey>('module');
  const [customTitle, setCustomTitle] = useState('');
  
  const [fetchedRouteTitle, setFetchedRouteTitle] = useState('');

  const [programTrackLocked, setProgramTrackLocked] = useState(false);

  // ✅ booleans expected by ControlsPanel
  const [overrideLessons, setOverrideLessons] = useState(false);
  const [overrideQuiz, setOverrideQuiz] = useState(false);

  // spinner / gating
  const [uiPreparing, setUiPreparing] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerLoading, setPlayerLoading] = useState<boolean>(false);
  const [starting, setStarting] = useState<boolean>(false);

  // ─────────────────────────────────────────────────────────
// Language prompt bundle (web parity)
// ─────────────────────────────────────────────────────────
const LANGUAGE_FREE_LIMIT = 5;
const LANGUAGE_BUNDLE_PROMPTS = 300;
const LANGUAGE_BUNDLE_TOKENS = 20;

const [languageLaunching, setLanguageLaunching] = useState(false);
const [languageActive, setLanguageActive] = useState<string | null>(null);
const [llUnlockOpen, setLlUnlockOpen] = useState(false);
const [llUnlockBusy, setLlUnlockBusy] = useState(false);
const [llUnlockErr, setLlUnlockErr] = useState<string | null>(null);
const [supportLanguageOpen, setSupportLanguageOpen] = useState(false);
const [supportLanguageSetting, setSupportLanguageSetting] =
  useState<SupportLanguageOption>('auto');
const unlockedLanguageCoursesRef = useRef<Set<string>>(new Set());
const pendingLanguageStartRef = useRef<{
  prompt: string;
  languageLabel: string;
  source: 'banner' | 'teachMe';
} | null>(null);
const [llUnlockCtx, setLlUnlockCtx] = useState<{
  courseId: string;
  prompt: string;
  languageLabel: string;
  resetAt?: string | null;
} | null>(null);


useEffect(() => {
  if (!llUnlockOpen) return;

  console.log('[LL] unlock modal open', {
    hasBackendUrl: !!backendUrl,
    hasLanguageToken: !!languageToken,
    busy: llUnlockBusy,
    ctx: llUnlockCtx,
    ctxCourseIdLen: llUnlockCtx?.courseId ? String(llUnlockCtx.courseId).length : 0,
  });
}, [llUnlockOpen, llUnlockBusy, llUnlockCtx, backendUrl, languageToken]);

useEffect(() => {
  let mounted = true;
  (async () => {
    try {
      const stored = await AsyncStorage.getItem(SUPPORT_LANGUAGE_STORAGE_KEY);
      const value = String(stored || '').toLowerCase() as SupportLanguageOption;
      if (mounted && ['auto', 'ar', 'hi', 'ur', 'en'].includes(value)) {
        setSupportLanguageSetting(value);
      }
    } catch {
      /* ignore */
    }
  })();
  return () => {
    mounted = false;
  };
}, []);

const deviceLocale = useMemo(() => {
  // expo-localization modern API
  const tag = Localization.getLocales?.()?.[0]?.languageTag;
  return tag || 'en-US';
}, []);

const deviceTimeZone = useMemo(() => {
  // Prefer calendar timeZone if available
  const tz = Localization.getCalendars?.()?.[0]?.timeZone;
  return String(tz || '').trim();
}, []);


const profileLanguage = useMemo(
  () =>
    (profile as any)?.language ||
    (profile as any)?.preferred_language ||
    (profile as any)?.preferredLanguage ||
    null,
  [profile],
);

const profileCountry = useMemo(
  () =>
    (profile as any)?.country ||
    (profile as any)?.countryCode ||
    (profile as any)?.country_code ||
    null,
  [profile],
);

const updateSupportLanguageSetting = useCallback(async (next: SupportLanguageOption) => {
  setSupportLanguageSetting(next);
  try {
    await AsyncStorage.setItem(SUPPORT_LANGUAGE_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
}, []);



// lightweight in-memory cache (web uses localStorage; native keeps this per app session)
const llCourseIdCacheRef = useRef<Map<string, string>>(new Map());

const normalizeLangKey = (s?: string | null) => {
  const t = String(s ?? '').trim().toLowerCase();
  if (!t) return '';
  if (t.includes('english') || t.includes('esl')) return 'english_esl';
  if (t.includes('deutsch') || t.includes('german')) return 'german';
  if (t.includes('français') || t.includes('francais') || t.includes('french')) return 'french';
  if (t.includes('español') || t.includes('espanol') || t.includes('spanish')) return 'spanish';
  if (t.includes('arabic') || t.includes('arab') || t.includes('عربي')) return 'arabic';
  if (t.includes('hindi') || t.includes('हिन्दी') || t.includes('हिंदी')) return 'hindi';
  if (t.includes('urdu') || t.includes('اردو')) return 'urdu';
  if (t.includes('turkish') || t.includes('türkçe') || t.includes('turkce')) return 'turkish';
  if (t.includes('russian') || t.includes('рус')) return 'russian';
  if (t.includes('tagalog') || t.includes('filipino')) return 'tagalog';
  if (t.includes('malayalam') || t.includes('മലയാളം')) return 'malayalam';
  return t;
};

const llCourseIdStorageKey = (langKey: string) => `ll_course_id_v1_${langKey}`;

const cacheLanguageCourseId = useCallback(
  async (languageLabel: string, courseId: string, targetLanguage?: string) => {
    const cid = String(courseId || '').trim();
    if (!cid) return;

    const keys = new Set<string>();
    const k1 = normalizeLangKey(languageLabel);
    const k2 = normalizeLangKey(targetLanguage);

    if (k1) keys.add(k1);
    if (k2) keys.add(k2);

    for (const k of keys) {
      llCourseIdCacheRef.current.set(k, cid);
      AsyncStorage.setItem(llCourseIdStorageKey(k), cid).catch(() => {});
    }
  },
  []
);

const getCachedLanguageCourseId = useCallback(async (languageLabel: string) => {
  const k = normalizeLangKey(languageLabel);
  if (!k) return '';

  const mem = llCourseIdCacheRef.current.get(k);
  if (mem) return mem;

  try {
    const stored = await AsyncStorage.getItem(llCourseIdStorageKey(k));
    const cid = String(stored || '').trim();
    if (cid) llCourseIdCacheRef.current.set(k, cid);
    return cid;
  } catch {
    return '';
  }
}, []);

const inferLanguageLabelFromPrompt = (prompt: string) => {
  const p = String(prompt || '').toLowerCase();
  if (p.includes('teach me english') || p.includes('english')) return ESL_CARD_LABEL;
  if (p.includes('german') || p.includes('deutsch')) return 'German';
  if (p.includes('french') || p.includes('français') || p.includes('francais')) return 'French';
  if (p.includes('spanish') || p.includes('español') || p.includes('espanol')) return 'Spanish';
  if (p.includes('arabic') || p.includes('arab') || p.includes('عربي')) return 'Arabic';
  if (p.includes('hindi') || p.includes('हिन्दी') || p.includes('हिंदी')) return 'Hindi';
  if (p.includes('urdu') || p.includes('اردو')) return 'Urdu';
  if (p.includes('turkish') || p.includes('türkçe') || p.includes('turkce')) return 'Turkish';
  if (p.includes('russian') || p.includes('рус')) return 'Russian';
  if (p.includes('tagalog') || p.includes('filipino')) return 'Tagalog';
  if (p.includes('malayalam') || p.includes('മലയാളം')) return 'Malayalam';
  return '';
};


  // run gate to avoid stale toggles
  const runIdRef = useRef(0);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const prevCourseIdRef = useRef<string | null>(null);

   // ─────────────────────────────────────────────────────────
  // 409 lesson-cap alert (show once, avoid spam)
  // ─────────────────────────────────────────────────────────
  const lessonCapToastRef = useRef<{ key: string; at: number } | null>(null);

  const getHttpStatus = (e: any): number | null => {
    return (
      e?.status ??
      e?.response?.status ??
      e?.response?.data?.status ??
      e?.data?.status ??
      e?.data?.statusCode ??
      e?.statusCode ??
      null
    );
  };

  const getErrText = (e: any): string => {
    return String(
      e?.message ??
        e?.response?.data?.message ??
        e?.response?.data?.error ??
        e?.data?.message ??
        e?.data?.error ??
        ''
    );
  };

  const isLessonCap409 = (e: any): boolean => {
    const status = getHttpStatus(e);
    if (status !== 409) return false;

    const msg = getErrText(e).toLowerCase();
    // match common server messages, but keep it flexible
    return (
      (msg.includes('lesson') && msg.includes('60')) ||
      msg.includes('reached 60') ||
      msg.includes('max lessons') ||
      msg.includes('lesson limit') ||
      msg.includes('lessons limit') ||
      msg.includes('limit reached')
    );
  };


  useEffect(() => {
  let cancelled = false;

  (async () => {
    if (!backendUrl) return;
    if (!authToken) return;
    if (!isSandboxSource) return;
    if (!wantedCourseId) return;

    // if route already provides title, don't fetch
    const routeTitle = String(params?.courseTitle ?? '').trim();
    if (routeTitle) return;

    // if selectedCourse already has a meaningful title, don't fetch
    const existing = String(selectedCourse?.title || '').trim();
    if (existing && existing.toLowerCase() !== 'assigned course') return;

    try {
      const base = backendUrl.replace(/\/+$/, '');
      const url = `${base}/api/courses/${encodeURIComponent(wantedCourseId)}`;

      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!r.ok) return;

      const j: any = await r.json().catch(() => null);
      const t = String(j?.title ?? j?.course?.title ?? '').trim();
      if (!t) return;

      if (!cancelled) setFetchedRouteTitle(t);
    } catch {
      // ignore
    }
  })();

  return () => {
    cancelled = true;
  };
}, [backendUrl, authToken, isSandboxSource, wantedCourseId, params?.courseTitle, selectedCourse?.title]);

useEffect(() => {
  if (!isSandboxSource) return;
  if (!wantedCourseId) return;

  const t = fetchedRouteTitle.trim();
  if (!t) return;

  // If selection matches, just upgrade placeholder title.
  if (selectedCourse?.id === wantedCourseId) {
    const cur = String(selectedCourse?.title || '').trim();
    if (!cur || cur.toLowerCase() === 'assigned course') {
      selectCourse({ ...(selectedCourse as any), title: t } as any);
    }
    return;
  }

  // If no selection yet (common in sandbox shares), seed minimal selection
  if (!selectedCourse) {
    selectCourse({
      id: wantedCourseId,
      title: t,
      blurb: '',
      rating: 0,
      reviews: 0,
    } as any);
  }
}, [isSandboxSource, wantedCourseId, fetchedRouteTitle, selectedCourse?.id, selectedCourse?.title, selectedCourse, selectCourse]);


  const showLessonCapOnce = useCallback(
    (courseKey: string) => {
      const now = Date.now();
      const last = lessonCapToastRef.current;

      // throttle: same course -> only once per ~15s (prefetch can retry)
      if (last && last.key === courseKey && now - last.at < 15000) return;

      lessonCapToastRef.current = { key: courseKey, at: now };

      Alert.alert('Lesson limit reached', "You’ve reached 60 lessons for this course.");
    },
    [/* Alert is stable */]
  );

  // overrides helpers
  const defaultQuizForLessons = (n: number) => Math.max(4, n * 2);

  // timer
  const [localRemainingMs, setLocalRemainingMs] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      setLocalRemainingMs((ms) => (ms == null ? null : Math.max(0, ms - 1000)));
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
    (orgAssign?.remainingMs ?? 0) > 0
      ? (orgAssign?.remainingMs as number)
      : (localRemainingMs ?? 0);

  // org role context
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

  const orgCountry = useMemo(
    () =>
      (orgCtx as any)?.country ||
      (orgCtx as any)?.countryCode ||
      (orgCtx as any)?.country_code ||
      null,
    [orgCtx],
  );

  const resolvedSupportLanguage = useMemo<SupportLanguageResolved>(() => {
    if (supportLanguageSetting !== 'auto') return supportLanguageSetting;
    return resolveSupportLanguageAuto({
      locale: deviceLocale,
      profileLanguage,
      uiLanguage,
      timeZone: deviceTimeZone,
      profileCountry,
      orgCountry,
    });
  }, [
    deviceLocale,
    deviceTimeZone,
    orgCountry,
    profileCountry,
    profileLanguage,
    supportLanguageSetting,
    uiLanguage,
  ]);

const lockedByParam = params.lock === '1';
const lockTrackByParam = params.lockTrack === '1';

const isLockedLearner =
  lockedByParam ||
  Boolean((orgAssign as any)?.locked) ||
  (isOrgFlow && !canShareUi);


  const showMinimalControls = isLockedLearner;
  const showCourseList = !isLockedLearner;

  useEffect(() => {
    const trackFromParam = params.programTrack ? normalizeProgramTrack(params.programTrack) : null;
    if (trackFromParam) {
      setProgramTrack(trackFromParam as TrackKey);
    }
    setProgramTrackLocked(lockTrackByParam);
  }, [params.programTrack, lockTrackByParam]);

  const startIdxAppliedRef = useRef<{ courseId: string | null; startIdx: number | null }>({
    courseId: null,
    startIdx: null,
  });

  

  useEffect(() => {
    if (startIdx == null) return;
    if (!outline?.length) return;
    const courseKey = String(selectedCourse?.id || params.courseId || '');
    if (!courseKey) return;
    if (
      startIdxAppliedRef.current.courseId === courseKey &&
      startIdxAppliedRef.current.startIdx === startIdx
    ) {
      return;
    }
    const clamped = Math.max(0, Math.min(startIdx, Math.max(0, outline.length - 1)));
    if (typeof setCurrentIdx === 'function') {
      setCurrentIdx(clamped);
    }
    startIdxAppliedRef.current = { courseId: courseKey, startIdx };
  }, [startIdx, outline?.length, selectedCourse?.id, params.courseId, setCurrentIdx]);

  const completedWeeksRef = useRef<Set<number>>(new Set());
  const prevIdxRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isSandboxSource) {
      prevIdxRef.current = currentIdx ?? null;
      return;
    }
    const prevIdx = prevIdxRef.current;
    if (prevIdx == null) {
      prevIdxRef.current = currentIdx ?? null;
      return;
    }
    if ((currentIdx ?? 0) <= prevIdx) {
      prevIdxRef.current = currentIdx ?? null;
      return;
    }
    const weekToComplete = prevIdx + 1;
    if (completedWeeksRef.current.has(weekToComplete)) {
      prevIdxRef.current = currentIdx ?? null;
      return;
    }
    const progressCourseId = String(selectedCourse?.id || params.courseId || '');
    if (!progressCourseId || !backendUrl || !authToken) {
      prevIdxRef.current = currentIdx ?? null;
      return;
    }
    completedWeeksRef.current.add(weekToComplete);
    updateCourseProgress(
      backendUrl,
      { courseId: progressCourseId, week: weekToComplete, status: 'Completed' },
      authToken
    ).catch((e) => {
      completedWeeksRef.current.delete(weekToComplete);
      dlog('auto-complete failed', e);
    });
    prevIdxRef.current = currentIdx ?? null;
  }, [currentIdx, isSandboxSource, backendUrl, authToken, selectedCourse?.id, params.courseId]);

  useEffect(() => {
    dlog('startWeek', {
      startWeek: startWeekValue,
      startIdx,
      currentIdx,
      outlineLen: outline?.length ?? 0,
      source: params?.source ?? '—',
    });
  }, [startWeekValue, startIdx, currentIdx, outline?.length, params?.source]);

  const titleInfo = useMemo(() => {
  const routeTitle = String(params?.courseTitle ?? '').trim();
  return resolveCourseTitleInfo({
    routeTitle: (routeTitle || fetchedRouteTitle).trim(),
    assignmentMeta: (orgAssign as any)?.meta,
    selectedCourseTitle: selectedCourse?.title || fetchedRouteTitle,
    customTitle,
    fallback: 'Assigned Course', // ✅ match web casing
  });
}, [params?.courseTitle, fetchedRouteTitle, orgAssign, selectedCourse?.title, customTitle]);


const effectiveCourseTitle = titleInfo.title || 'AI Lesson';

const trackReqs = useMemo(() => {
  const t = TRACKS.find((x) => x.key === programTrack) ?? TRACKS[0];
  // Mirrors your default quiz policy: questions ~= lessons * 2
  const questions = Math.max(4, t.lessons * 2);
  return { label: t.label, lessons: t.lessons, questions };
}, [programTrack]);

const trackLockSource = useMemo(() => {
  if (!programTrackLocked) return null;
  if (lockTrackByParam) return 'link';
  return 'policy';
}, [programTrackLocked, lockTrackByParam]);



  const trackLessons = useMemo(() => {
    const t = TRACKS.find((x) => x.key === programTrack) ?? TRACKS[0];
    return t.lessons;
  }, [programTrack]);

  const restrictStarter = Boolean(activeOrgId && isStarterTier);
  const knobsDisabled = restrictStarter || isLockedLearner;
  const capMinutes = (m?: number) => (restrictStarter ? Math.min(m ?? 30, 30) : (m ?? 20));

  // 🔒 locked config
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

  const quizEffective = isLockedLearner
    ? typeof lockedQuizSize === 'number'
      ? Math.max(4, lockedQuizSize)
      : 16
    : overrideQuiz
      ? quizCount
      : defaultQuizForLessons(lessonsEffective);

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

  useEffect(() => {
    if (!programTrackLocked) return;
    setOverrideLessons(false);
    setOverrideQuiz(false);
  }, [programTrackLocked]);

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
        try {
          await loadTopCourses?.();
        } catch {
          /* ignore */
        }
      }
    })();
  }, [params.courseId, loadTopCourses]);

  // SSML + content deriveds (now mirrored with web)
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
  const displaySsml: string = (lockedSsml ?? rawDisplaySsml).trim();
  const hasJoined = Boolean(joinedSsml && String(joinedSsml).trim());

  // Refs to mirror web behavior for robust start
  const topCoursesRef = useRef<TopCourse[]>([]);
  useEffect(() => {
    topCoursesRef.current = Array.isArray(topCourses) ? topCourses : [];
  }, [topCourses]);
  const selectedCourseRef = useRef<typeof selectedCourse>(selectedCourse);
  useEffect(() => {
    selectedCourseRef.current = selectedCourse;
  }, [selectedCourse]);

  

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

  // Only allow first start when there is no built content yet
  const lessonsLen = Array.isArray(lessons) ? lessons.length : 0;
const outlineLen = Array.isArray(outline) ? outline.length : 0;

const canStartNow = useMemo(() => {
  const hasSeed = Boolean(selectedCourse || (customTitle && customTitle.trim()) || params.courseId);
  if (!hasSeed) return false;
  if (activeRunId !== null) return false;

  const noContentYet =
    !(joinedSsml && String(joinedSsml).trim()) &&
    !(ssml && String(ssml).trim()) &&
    lessonsLen === 0 &&
    outlineLen === 0;

  return noContentYet;
}, [selectedCourse, customTitle, params.courseId, activeRunId, joinedSsml, ssml, lessonsLen, outlineLen]);


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
  if (!params.courseId) {
    setSharedCourseMissing(false);
    setSharedCourseChecked(false);
    return;
  }

  // ✅ skip local validation (orgToken invite / assignment share)
  if (!validateAgainstTopCourses) {
    setSharedCourseMissing(false);
    setSharedCourseChecked(true);
    return;
  }

  if (!Array.isArray(topCourses) || topCourses.length === 0) return;

  const found = topCourses.some((c: TopCourse) => String(c.id) === String(params.courseId));
  setSharedCourseMissing(!found);
  setSharedCourseChecked(true);
}, [params.courseId, topCourses, validateAgainstTopCourses]);


  useEffect(() => {
    if (activeRunId !== null && hasJoined && playerReady) {
      setActiveRunId(null);
    }
  }, [activeRunId, hasJoined, playerReady]);

  useEffect(() => {
    if (isLockedLearner) setShareOpen(false);
  }, [isLockedLearner]);

  // auto-select first course — keep default "Start with AI"
  useEffect(() => {
    if (
      !selectedCourse &&
      Array.isArray(topCourses) &&
      topCourses.length > 0 &&
      !customTitle.trim() &&
      !params.courseId
    ) {
      dlog('auto-selecting first course', { id: topCourses[0]?.id, title: topCourses[0]?.title });
      setActiveRunId(null);
      setUiPreparing(false);
      setPlayerReady(false);
      setPlayerLoading(false);
      setLockedSsml(null);
      selectCourse(topCourses[0]);
    }
  }, [topCourses, selectedCourse, selectCourse, customTitle, params.courseId]);

  const compat = ai as any;
  const hasMoreCourses: boolean = Boolean(
    compat?.hasMoreCourses ?? compat?.coursesHasMore ?? compat?.hasMore
  );
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
      try {
        await loadTopCourses?.({ append: true, preserveIds } as any);
      } catch {
        await loadTopCourses?.({ preserveIds } as any);
      }
    }
  };

  const refreshCourseList = useCallback(async () => {
    const preserveIds = params.courseId ? [params.courseId] : [];
    dlog('refreshCourseList → clearTopCoursesCacheNow + reload', { preserveIds });
    try {
      await clearTopCoursesCacheNow?.();
    } catch {}
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
  const overlayAvailable = !!(
    currentLessonForOverlay?.formulas?.length ||
    currentLessonForOverlay?.tables?.length ||
    currentLessonForOverlay?.snippets?.length ||
    currentLessonForOverlay?.charts?.length
  );

  useEffect(() => {
    if (hasAIContent) setIsMaximized(true);
  }, [hasAIContent]);


  const resetRunUi = useCallback(() => {
  setActiveRunId(null);
  setUiPreparing(false);
  setPlayerLoading(false);
  setPlayerReady(false);
  setLockedSsml(null);
}, []);

const parseLanguageGate = useCallback((res: any) => {
  const ent =
    res?.entitlement ??
    res?.languageStart?.entitlement ??
    res?.data?.entitlement ??
    null;

  const promptsUsed = Number(
    res?.promptsUsed ??
      res?.prompts_used ??
      ent?.promptsUsed ??
      ent?.prompts_used ??
      0
  );

  const promptsLimit = Number(
    res?.promptsLimit ??
      res?.prompts_limit ??
      ent?.promptsLimit ??
      ent?.prompts_limit ??
      0
  );

  const resetsAt =
    res?.resetsAt ??
    res?.resetAt ??
    res?.nextResetAt ??
    ent?.resetsAt ??
    ent?.resetAt ??
    null;

  const effectiveLimit = promptsLimit || LANGUAGE_FREE_LIMIT;

  const bundleBlocked = Boolean(
    res?.bundleBlocked ??
      res?.bundle_blocked ??
      ent?.bundleBlocked ??
      ent?.bundle_blocked ??
      (effectiveLimit > 0 && promptsUsed >= effectiveLimit)
  );

  return { bundleBlocked, promptsUsed, promptsLimit: effectiveLimit, resetsAt };
}, []);

const [llUnlockNowTs, setLlUnlockNowTs] = useState(() => Date.now());

const formatCountdown = useCallback((ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}, []);

useEffect(() => {
  if (!llUnlockOpen || !llUnlockCtx?.resetAt) return;
  const id = setInterval(() => setLlUnlockNowTs(Date.now()), 1000);
  return () => clearInterval(id);
}, [llUnlockOpen, llUnlockCtx?.resetAt]);

const llUnlockResetLabel = useMemo(() => {
  const resetAt = llUnlockCtx?.resetAt;
  if (!resetAt) return null;
  const ts = new Date(resetAt).getTime();
  if (Number.isNaN(ts)) return null;
  const remaining = ts - llUnlockNowTs;
  if (remaining <= 0) {
    return `Resets at ${new Date(ts).toLocaleString()}`;
  }
  return `Resets in ${formatCountdown(remaining)}`;
}, [llUnlockCtx?.resetAt, llUnlockNowTs, formatCountdown]);

const extractLanguageCourseId = useCallback((x: any): string => {
  const candidates = [
    x?.courseId,
    x?.course_id,
    x?.id,

    // entitlement shapes (you already parse entitlement in parseLanguageGate)
    x?.entitlement?.courseId,
    x?.entitlement?.course_id,

    // common nested shapes
    x?.languageStart?.courseId,
    x?.languageStart?.course_id,
    x?.languageStart?.id,
    x?.languageStart?.entitlement?.courseId,
    x?.languageStart?.entitlement?.course_id,

    // API wrappers
    x?.data?.courseId,
    x?.data?.course_id,
    x?.data?.id,
    x?.data?.entitlement?.courseId,
    x?.data?.entitlement?.course_id,
  ];

  for (const c of candidates) {
    const s = String(c ?? '').trim();
    if (s) return s;
  }
  return '';
}, []);


const startLanguageFlow = useCallback(
  async (prompt: string, languageLabel: string, source: 'banner' | 'teachMe') => {
    const ok = requireLanguageAuth('language-learning', 'Please sign in to start language learning.');
    if (!ok) {
      pendingLanguageStartRef.current = null;
      return 'error';
    }

    if (!backendUrl || !languageToken) {
      pendingLanguageStartRef.current = null;
      return 'error';
    }

    try {
      const res: any = await startLanguageCourse(backendUrl, languageToken as string, prompt, {
        orgId: activeOrgId ?? null,
      });

      const gate = parseLanguageGate(res);

      const courseId = extractLanguageCourseId(res);
      const isManuallyUnlocked =
        Boolean(courseId) && unlockedLanguageCoursesRef.current.has(courseId);
      await cacheLanguageCourseId(languageLabel, courseId, res?.targetLanguage);

     if (gate.bundleBlocked && !isManuallyUnlocked) {
  resetRunUi();
  setLlUnlockErr(null);

  const cid =
    courseId ||
    (await getCachedLanguageCourseId(languageLabel)) ||
    (await getCachedLanguageCourseId(inferLanguageLabelFromPrompt(prompt) || languageLabel));

  dlog('LL gate → open unlock modal', {
    languageLabel,
    prompt,
    extractedCourseId: courseId,
    resolvedCourseId: cid,
    promptsUsed: gate.promptsUsed,
    limit: gate.promptsLimit,
  });

  setLlUnlockCtx({ courseId: cid, prompt, languageLabel, resetAt: gate.resetsAt });
  setLlUnlockOpen(true);
  // pending action queued until unlock succeeds
  pendingLanguageStartRef.current = { prompt, languageLabel, source };
  return 'locked';
}


      resetRunUi();
      navigation.navigate('LanguageLearning' as any, {
        courseId,
        languageStart: res,
      } as any);
      pendingLanguageStartRef.current = null;
      return 'started';
    } catch (err: any) {
      const data = err?.data ?? err?.response?.data ?? null;
      const msgText = String(data?.message || data?.error || err?.message || '');

      let courseId = extractLanguageCourseId(data) || extractLanguageCourseId(err);

      if (!courseId) {
        const cached = llCourseIdCacheRef.current.get(String(languageLabel || '').toLowerCase());
        if (cached) courseId = String(cached).trim();
      }

      const blocked = Boolean(
        data?.bundleBlocked ||
          data?.bundle_blocked ||
          data?.code === 'PROMPT_LIMIT_REACHED' ||
          data?.error === 'PROMPT_LIMIT_REACHED' ||
          data?.code === 'LANGUAGE_BUNDLE_BLOCKED' ||
          /free prompt limit|prompt limit|unlock/i.test(msgText)
      );

      if (blocked && !unlockedLanguageCoursesRef.current.has(courseId)) {
        const label =
          String(languageLabel || '').trim() || inferLanguageLabelFromPrompt(prompt) || 'Language';

        const cid =
          courseId ||
          (await getCachedLanguageCourseId(label)) ||
          (await getCachedLanguageCourseId(inferLanguageLabelFromPrompt(prompt) || label));

        resetRunUi();
        setLlUnlockErr(null);
        setLlUnlockCtx({
          courseId: cid,
          prompt,
          languageLabel: label,
          resetAt:
            data?.resetsAt ||
            data?.resetAt ||
            data?.nextResetAt ||
            data?.entitlement?.resetsAt ||
            null,
        });
        setLlUnlockOpen(true);
        // pending action queued until unlock succeeds
        pendingLanguageStartRef.current = { prompt, languageLabel: label, source };
        return 'locked';
      }

      resetRunUi();
      Alert.alert('Language Learning', msgText || 'Unable to start language learning.');
      pendingLanguageStartRef.current = null;
      return 'error';
    }
  },
 [
  requireLanguageAuth,
  backendUrl,
  languageToken,
  activeOrgId,
  navigation,
  parseLanguageGate,
  extractLanguageCourseId,
  resetRunUi,
  cacheLanguageCourseId,
  getCachedLanguageCourseId,
]

);

  const attemptLanguageStart = useCallback(
    async (prompt: string, languageLabel: string, source: 'banner' | 'teachMe') => {
      pendingLanguageStartRef.current = { prompt, languageLabel, source };
      await startLanguageFlow(prompt, languageLabel, source);
    },
    [startLanguageFlow]
  );

  const resumePendingLanguageStart = useCallback(async () => {
    const pending = pendingLanguageStartRef.current;
    if (!pending) return;
    // resume the queued action after unlock success
    await startLanguageFlow(pending.prompt, pending.languageLabel, pending.source);
  }, [startLanguageFlow]);

  const closeLanguageUnlockModal = useCallback(() => {
    if (llUnlockBusy) return;
    setLlUnlockOpen(false);
    setLlUnlockCtx(null);
    setLlUnlockErr(null);
    pendingLanguageStartRef.current = null;
  }, [llUnlockBusy]);

  // Quiz answer helper
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
    setIsMaximized((v) => !v);
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

  const prefetchAhead = useCallback(
    async (n: number = PREFETCH_BUFFER) => {
      if (typeof nextLesson !== 'function' || typeof getLessonAt !== 'function') return;
      const base = Number(currentIdx ?? 0);
      for (let k = 1; k <= n; k++) {
        const exists = !!getLessonAt(base + k);
        if (!exists && canBuildMore()) {
          try {
            await nextLesson({ silent: true });
                   } catch (e) {
            // 🔔 show cap message for HTTP 409 lesson limit
            if (isLessonCap409(e)) {
              const courseKey = selectedCourseRef.current?.id || customTitle.trim() || 'free';
              showLessonCapOnce(courseKey);
              break;
            }

            console.warn('[prefetchAhead] nextLesson failed', e);
            break;
          }

        }
      }
    },
    [currentIdx, getLessonAt, nextLesson, canBuildMore,customTitle, showLessonCapOnce]
  );

  // Start — robust sequencing (parity-ish with web, but keeping your start gate)
 const onStart = useCallback(async () => {
  if (starting || languageLaunching || llUnlockBusy || !canStartNow) {
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

    // ✅ Custom topic flow stays the same
    if (custom) {
      const ok = requireLanguageAuth(
        'language-learning',
        'Please sign in with your user account to start language learning.'
      );

      if (!ok) {
        setActiveRunId(null);
        setUiPreparing(false);
        setPlayerLoading(false);
        return;
      }

      const intent = detectLanguageIntent(custom);

      if (!intent && isLanguageIntentText(custom)) {
        let msg =
          'Which language do you want to learn? We currently support German, French, Spanish, and Arabic.';
        try {
          await startLanguageCourse(backendUrl, languageToken as string, custom, {
            orgId: activeOrgId ?? null,
          });
        } catch (err: any) {
          msg = err?.response?.data?.message || msg;
        }
        Alert.alert('Language Learning', msg);
        setActiveRunId(null);
        setUiPreparing(false);
        setPlayerLoading(false);
        return;
      }

      if (intent) {
        const langLabel =
          (intent as any)?.language ||
          (intent as any)?.targetLanguage ||
          (intent as any)?.label ||
          'Language';

        setLanguageActive(String(langLabel));
        setLanguageLaunching(true);

        try {
          await attemptLanguageStart(custom, String(langLabel), 'teachMe');
        } finally {
          setLanguageLaunching(false);
          setLanguageActive(null);
        }

        return;
      }

      await startCustomTopic(custom);
      await waitForSelection();

      opts.courseId = selectedCourseRef.current?.id;

      try {
        await startWithAI(opts);
      } catch (e: any) {
        const status = e?.status ?? e?.response?.status;
        if (String(status) === '404') {
          setSharedCourseMissing(true);
          setSharedCourseChecked(true);
        }
        throw e;
      }

      return;
    }

    let course: any = null;

    // ✅ 1) If a shared courseId was passed, prefer it
    const sharedId = params.courseId ? String(params.courseId) : '';
    if (sharedId) {
      // ✅ orgToken invite / assignment share: don’t require local course list
      if (!validateAgainstTopCourses) {
        opts.courseId = sharedId;

        try {
          await startWithAI(opts);
        } catch (e: any) {
          const status = e?.status ?? e?.response?.status;
          if (String(status) === '404') {
            setSharedCourseMissing(true);
            setSharedCourseChecked(true);
          }
          throw e;
        }

        return;
      }

      // Ensure courses are loaded
      if (!topCoursesRef.current.length) {
        try {
          await loadTopCourses?.({
            limit: 200,
            preserveIds: [sharedId],
          } as any);
        } catch {}
        await waitForCourses();
      }

      course =
        selectedCourseRef.current?.id === sharedId
          ? selectedCourseRef.current
          : topCoursesRef.current.find((c: any) => String(c?.id) === sharedId) || null;

      if (!course) {
        Alert.alert('Shared course not found', 'Please ask your instructor to resend the link.');
        setActiveRunId(null);
        setUiPreparing(false);
        setPlayerLoading(false);
        return;
      }
    } else {
      // ✅ 2) Normal behavior: selected or first
      course = selectedCourseRef.current ?? topCoursesRef.current[0] ?? null;

      if (!course) {
        try {
          await loadTopCourses?.({ limit: 200 } as any);
        } catch {}
        await waitForCourses();
        course = selectedCourseRef.current ?? topCoursesRef.current[0] ?? null;
      }
    }

    // Sync selection if needed
    if (course && (!selectedCourseRef.current || selectedCourseRef.current.id !== course.id)) {
      selectCourse(course);
      await waitForSelection();
    }

    if (!selectedCourseRef.current) {
      Alert.alert('Could not start', 'No course is selected yet. Please try again.');
      setActiveRunId(null);
      setUiPreparing(false);
      setPlayerLoading(false);
      return;
    }

    opts.courseId = selectedCourseRef.current.id;
    dlog('onStart → startWithAI', { opts, selectedId: selectedCourseRef.current.id });

    try {
      await startWithAI(opts);
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      if (String(status) === '404') {
        setSharedCourseMissing(true);
        setSharedCourseChecked(true);
      }
      throw e;
    }

    return;
  } catch (e) {
    // 🔔 show cap message for HTTP 409 lesson limit
    if (isLessonCap409(e)) {
      const courseKey = selectedCourseRef.current?.id || customTitle.trim() || 'free';
      showLessonCapOnce(courseKey);
    }

    console.error('[onStart] failed', e);
    setActiveRunId(null);
    setUiPreparing(false);
    setPlayerLoading(false);
  } finally {
    setStarting(false);
  }
}, [
  starting,
  languageLaunching,
  llUnlockBusy,
  canStartNow,
  attemptLanguageStart,
  assignmentId,
  sizePreset,
  classLevel,
  minutesEffective,
  programTrack,
  safeLessons,
  effectiveVoice,
  customTitle,
  startCustomTopic,
  startWithAI,
  loadTopCourses,
  selectCourse,
  params.courseId,
  validateAgainstTopCourses,
  requireLanguageAuth,
  backendUrl,
  languageToken,
  activeOrgId,
  waitForSelection,
  waitForCourses,
]);

const openSupportLanguageModal = useCallback(() => {
  if (languageLaunching || llUnlockBusy) return;
  const ok = requireLanguageAuth('language-learning', 'Please sign in to start language learning.');
  if (!ok) return;
  setSupportLanguageOpen(true);
}, [languageLaunching, llUnlockBusy, requireLanguageAuth]);

const startEnglishEsl = useCallback(async () => {
  if (languageLaunching || llUnlockBusy) return;

  const ok = requireLanguageAuth('language-learning', 'Please sign in to start language learning.');
  if (!ok) return;

  const prompt = `Teach me English [support=${resolvedSupportLanguage}]`;
  setCustomTitle(prompt);
  if (prompt.trim()) selectCourse(null);

  setLanguageActive(ESL_CARD_LABEL);
  setLanguageLaunching(true);
  setSupportLanguageOpen(false);

  try {
    resetRunUi();
    await attemptLanguageStart(prompt, ESL_CARD_LABEL, 'banner');
  } finally {
    setLanguageLaunching(false);
    setLanguageActive(null);
  }
}, [
  languageLaunching,
  llUnlockBusy,
  requireLanguageAuth,
  resolvedSupportLanguage,
  attemptLanguageStart,
  resetRunUi,
  selectCourse,
]);

const startLanguageFromCard = useCallback(async (language: string) => {
  if (languageLaunching || llUnlockBusy) return;

  const ok = requireLanguageAuth('language-learning', 'Please sign in to start language learning.');
  if (!ok) return;

  const prompt = `Teach me ${language}`;
  setCustomTitle(prompt);
  if (prompt.trim()) selectCourse(null);

  setLanguageActive(language);
  setLanguageLaunching(true);

  try {
    resetRunUi();
    await attemptLanguageStart(prompt, language, 'banner');
  } finally {
    setLanguageLaunching(false);
    setLanguageActive(null);
  }
}, [languageLaunching, llUnlockBusy, requireLanguageAuth, attemptLanguageStart, resetRunUi, selectCourse]);

  
  

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
            dlog('refreshSelectedAI → clearSelectedCourseCacheNow then reseed', {
              courseId: selectedCourse.id,
            });
            const id = ++runIdRef.current;
            setActiveRunId(id);
            setUiPreparing(true);
            setPlayerLoading(true);
            setPlayerReady(false);
            setLockedSsml(null);
            try {
              await clearSelectedCourseCacheNow?.();
            } catch {}
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
    activeRunId !== null &&
    (uiPreparing ||
      step === 'outlining' ||
      step === 'narrating' ||
      !!ttsLoading ||
      !hasJoined ||
      playerLoading ||
      !playerReady);

      const ctaBusy = preparingNow || starting || languageLaunching || llUnlockBusy;


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

  const scrollContentInset = useMemo(() => ({ bottom: bottomPad }), [bottomPad]);
  const lockRefreshOff = useCallback(() => setDisableRefresh(true), []);
  const unlockRefresh = useCallback(() => setDisableRefresh(false), []);
  

  return (
    <SafeAreaView edges={['bottom']} style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
      <View style={tw`flex-1`}>
       <RefreshableScrollView
        screenId="robot-tutor"
        refreshEnabled={!disableRefresh}
        scrollEnabled
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
                <View style={tw`mb-3`}>
                  <Text style={tw`text-[10px] uppercase tracking-[0.3em] text-[#6b7280] dark:text-white/60 mb-2`}>
                    Learn a language
                  </Text>
<ScrollView
  horizontal
  nestedScrollEnabled
  showsHorizontalScrollIndicator={false}
  keyboardShouldPersistTaps="handled"
  contentContainerStyle={tw`gap-3 pl-1 pr-6`} // ✅ right padding so last card is fully tappable
  // ✅ only disable refresh while user is actually dragging/flinging this horizontal list
  onScrollBeginDrag={lockRefreshOff}
  onMomentumScrollBegin={lockRefreshOff}
  onScrollEndDrag={unlockRefresh}
  onMomentumScrollEnd={unlockRefresh}
>
  {LANGUAGE_CARDS.map((card) => (
    <Pressable
      key={card.key}
      disabled={languageLaunching || llUnlockBusy || starting}
      // ❌ remove onPressIn/onPressOut (these were canceling taps)
      onPress={() =>
        card.language === ESL_CARD_LABEL ? openSupportLanguageModal() : startLanguageFromCard(card.language)
      }
      hitSlop={6}
      style={({ pressed }) => [
        tw`w-40 rounded-2xl border border-white/40 dark:border-white/10 bg-white dark:bg-[#141b24] px-4 py-3`,
        pressed && !languageLaunching && !llUnlockBusy && !starting ? tw`opacity-80` : null,
      ]}
    >
                        <View style={tw`flex-row items-center justify-between`}>
                        <Text style={tw`text-lg`} accessibilityLabel={`${card.language} flag`}>
                        {card.emoji}
                      </Text>


                        {languageLaunching && languageActive === card.language ? (
                          <View
                            style={tw`flex-row items-center gap-1 rounded-full px-2 py-1 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-400/20`}
                          >
                            <ActivityIndicator size={12} color="#10b981" />
                            <Text style={tw`text-[10px] font-semibold text-emerald-700 dark:text-emerald-200`}>
                              running
                            </Text>
                          </View>
                        ) : (
                          <Text style={tw`text-[10px] font-semibold text-emerald-500`}>NEW</Text>
                        )}
                      </View>


                        <Text style={tw`mt-2 text-sm font-semibold text-[#0d141c] dark:text-white`}>
                          {card.language}
                        </Text>
                        <Text style={tw`text-xs text-[#6b7280] dark:text-white/60`}>
                          {card.subtitle}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
                <Text style={tw`text-[#0d141c] dark:text-white font-black text-2xl md:text-3xl`}>
                  AI Tutor Studio
                </Text>

             
            {/* ✅ Track requirements line when locked */}
            {programTrackLocked ? (
              <Text style={tw`mt-1 text-[11px] text-[#49739c] dark:text-white/70`}>
                {trackReqs.label} track: {trackReqs.lessons} lessons • {trackReqs.questions} questions
                {DBG_ROBOT_TEACHER && trackLockSource ? (
                  <Text style={tw`text-[10px] text-[#49739c] dark:text-white/50`}>
                    {' '}
                    (locked via {trackLockSource})
                  </Text>
                ) : null}
              </Text>
            ) : null}

                <Text style={tw`text-[#49739c] dark:text-white/80 mt-1`}>
                  Free lesson (audio + captions + slides) and quiz. Score{' '}
                  <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>≥ 70%</Text> to
                  unlock your certificate
                  {isOrgFlow ? ' — covered by your organization' : ''}.
                </Text>
                {validateAgainstTopCourses && sharedCourseChecked && sharedCourseMissing ? (
                  <View
                    style={tw`mt-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3 py-2`}
                  >
                    <Text style={tw`text-amber-800 dark:text-amber-100 text-sm`}>
                      Shared course not found. Please ask your instructor to resend the link.
                    </Text>
                  </View>
                ) : null}

              </View>

              <Modal
                visible={supportLanguageOpen}
                transparent
                animationType="slide"
                onRequestClose={() => setSupportLanguageOpen(false)}
              >
                <Pressable
                  onPress={() => setSupportLanguageOpen(false)}
                  style={[StyleSheet.absoluteFillObject, tw`bg-black/50`]}
                />
                <View
                  style={[
                    tw`absolute bottom-0 left-0 right-0 bg-white dark:bg-[#141b24] rounded-t-3xl border-t border-[#cedbe8] dark:border-white/10 px-5 pt-4`,
                    { paddingBottom: (insets?.bottom ?? 0) + 16 },
                  ]}
                >
                  <View style={tw`flex-row items-center justify-between mb-2`}>
                    <Text style={tw`text-base font-semibold text-[#0d141c] dark:text-white`}>
                      Choose your support language
                    </Text>
                    <Pressable onPress={() => setSupportLanguageOpen(false)} hitSlop={10}>
                      <Text style={tw`text-sm text-[#6b7280] dark:text-white/70`}>Close</Text>
                    </Pressable>
                  </View>
                  <Text style={tw`text-xs text-[#6b7280] dark:text-white/70 mb-3`}>
                    This sets your explanation language for English lessons.
                  </Text>
                  <View style={tw`gap-2`}>
                    {SUPPORT_LANGUAGE_OPTIONS.map((opt) => {
                      const active = supportLanguageSetting === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          onPress={() => updateSupportLanguageSetting(opt.value)}
                          style={tw.style(
                            'rounded-xl border px-3 py-2 flex-row items-center justify-between',
                            active
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
                              : 'border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#141b24]',
                          )}
                        >
                          <View>
                            <Text
                              style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}
                            >
                              {opt.label}
                            </Text>
                            {opt.subtitle ? (
                              <Text style={tw`text-xs text-[#6b7280] dark:text-white/60`}>
                                {opt.subtitle}
                              </Text>
                            ) : null}
                          </View>
                          {active ? (
                            <Text style={tw`text-indigo-600 dark:text-indigo-300 text-sm`}>✓</Text>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {supportLanguageSetting === 'auto' ? (
                    <Text style={tw`text-xs text-[#6b7280] dark:text-white/60 mt-3`}>
                      Auto resolves to: {resolvedSupportLanguage.toUpperCase()}
                    </Text>
                  ) : null}
                  <TouchableOpacity
                    onPress={startEnglishEsl}
                    disabled={languageLaunching || llUnlockBusy || starting}
                    style={tw.style(
                      'mt-4 rounded-xl py-3 items-center',
                      languageLaunching || llUnlockBusy || starting
                        ? 'bg-slate-200 dark:bg-slate-700'
                        : 'bg-indigo-600',
                    )}
                  >
                    <Text
                      style={tw`text-sm font-semibold ${
                        languageLaunching || llUnlockBusy || starting
                          ? 'text-[#6b7280] dark:text-white/70'
                          : 'text-white'
                      }`}
                    >
                      Start English
                    </Text>
                  </TouchableOpacity>
                </View>
              </Modal>

              <Modal
  visible={Boolean(llUnlockOpen && llUnlockCtx)}
  transparent
  animationType="fade"
  onRequestClose={() => {
    closeLanguageUnlockModal();
  }}
>
  <View style={tw`flex-1 items-center justify-center px-4`}>
    {/* backdrop */}
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => {
        closeLanguageUnlockModal();
      }}
      style={tw`absolute inset-0 bg-black/50`}
    />

    {/* card */}
    <View style={tw`w-full max-w-md rounded-3xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 p-5`}>
      <View style={tw`flex-row items-start gap-3`}>
        <View style={tw`h-11 w-11 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-600/20 dark:border-emerald-400/20 items-center justify-center`}>
          <Text style={tw`text-xl`}>🔒</Text>
        </View>

        <View style={tw`flex-1`}>
          <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>
            Unlock more prompts
          </Text>
          <Text style={tw`mt-1 text-xs text-[#49739c] dark:text-white/70`}>
            You’ve used your free prompts for{' '}
            <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
              {llUnlockCtx?.languageLabel}
            </Text>
            . Unlock{' '}
            <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
              {LANGUAGE_BUNDLE_PROMPTS}
            </Text>{' '}
            prompts for{' '}
            <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
              {LANGUAGE_BUNDLE_TOKENS} tokens
            </Text>{' '}
            and start instantly.
          </Text>
          {llUnlockResetLabel ? (
            <Text style={tw`mt-2 text-xs text-[#49739c] dark:text-white/70`}>
              {llUnlockResetLabel}
            </Text>
          ) : null}
        </View>
      </View>

      {llUnlockErr ? (
        <View style={tw`mt-3 rounded-2xl border border-rose-300/60 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 px-3 py-2`}>
          <Text style={tw`text-xs text-rose-700 dark:text-rose-200`}>
            {llUnlockErr}
          </Text>
        </View>
      ) : null}

      <View style={tw`mt-4 flex-row gap-2`}>
        <TouchableOpacity
          disabled={llUnlockBusy}
          onPress={() => {
          closeLanguageUnlockModal();
        }}
        style={tw`flex-1 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-[#eef3f8] dark:bg-white/5 px-4 py-3 items-center`}
        >
          <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white/80`}>
            Not now
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          disabled={llUnlockBusy || !llUnlockCtx?.courseId}
        onPress={async () => {
         if (!backendUrl || !languageToken || !llUnlockCtx?.courseId) return;

          // capture ctx locally (because we will clear state)
          const ctx = llUnlockCtx;
          dlog('LL unlock press', { courseId: ctx.courseId, languageLabel: ctx.languageLabel });

          setLlUnlockBusy(true);
          setLlUnlockErr(null);

          // 1) Purchase first (keep modal open + spinner for this part)
          try {
           dlog('LL unlock purchase start', { courseId: ctx.courseId });
           await purchaseLanguageBundle(backendUrl, languageToken as string, ctx.courseId);
           dlog('LL unlock purchase success', { courseId: ctx.courseId });
           unlockedLanguageCoursesRef.current.add(ctx.courseId);
          } catch (e: any) {
            setLlUnlockErr(
              String(
                e?.data?.message ||
                  e?.response?.data?.message ||
                  e?.message ||
                  'Unable to unlock prompts.'
              )
            );
            setLlUnlockBusy(false);
            return;
          }

          // 2) Close modal immediately after purchase (so it doesn't linger)
          setLlUnlockOpen(false);
          setLlUnlockCtx(null);
          setLlUnlockErr(null);
          dlog('LL unlock modal close', { courseId: ctx.courseId });

          // allow state to paint before we start the next call/navigation
          await new Promise<void>((r) => setTimeout(() => r(), 0));

          // 3) Kick off the exact same flow as clicking a language card
          setLanguageActive(ctx.languageLabel);
          setLanguageLaunching(true);
          dlog('LL unlock start flow', { courseId: ctx.courseId, languageLabel: ctx.languageLabel });

          try {
            await resumePendingLanguageStart();
          } finally {
            setLanguageLaunching(false);
            setLanguageActive(null);
            setLlUnlockBusy(false);
          }
        }}

          style={tw`flex-1 rounded-2xl bg-emerald-500 px-4 py-3 items-center`}
        >
          <View style={tw`flex-row items-center gap-2`}>
            {llUnlockBusy ? <ActivityIndicator size={12} color="#fff" /> : null}
            <Text style={tw`text-sm font-semibold text-white`}>
              {llUnlockBusy ? 'Unlocking…' : 'Unlock & Start'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <Text style={tw`mt-2 text-[11px] text-[#49739c] dark:text-white/50`}>
        Smooth flow: pay once, continue learning without interruptions.
      </Text>
    </View>
  </View>
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
                programTrackLocked={programTrackLocked}
                canShareUi={canShareUi}
                onOpenOverlay={openOverlay}
                displayCourseTitle={effectiveCourseTitle}
                canStartNow={canStartNow} 
                overlayAvailable={overlayAvailable}
                overlayHintEligible={
                  overlayAvailable &&
                  (hasAIContent ||
                    step === 'narrating' ||
                    step === 'quizzing' ||
                    Boolean(quiz?.questions?.length))
                }
                restrictStarter={restrictStarter}
                knobsDisabled={knobsDisabled || ctaBusy}
                onOpenShare={() => {
                  setIsMaximized(false);
                  setShareOpen(true);
                }}
               busy={ctaBusy}
                topCourses={(topCourses || []).map((c: TopCourse) => ({
                  id: c.id,
                  title: c.title,
                }))}
                selectedCourse={
                  selectedCourse ? { id: selectedCourse.id, title: selectedCourse.title } : null
                }
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
                 urlQuizTypeHint={urlQuizTypeHint}
                onPrev={goPrev}
                isBuildingNext={isBuildingNext}
                lessonsArr={lessonsArr}
                activeIndex={currentIdx ?? 0}
                voiceName={voiceName || defaultVoice}
                courseTitle={effectiveCourseTitle}
                isMaximized={isMaximized}
                course={selectedCourse || null}
                currentIdx={currentIdx ?? 0}
                outline={outline}
                backendUrl={backendUrl}
                hasJoined={hasJoined}
                joinedNarrationDisplay={joinedNarrationDisplay}
                joinedNarrationTts={joinedNarrationTts}
                gateMode={gateMode}
                gateNotice={gateNotice}
                gateUsage={gateUsage}
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
                token={authToken || ''}
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
                canAutoStart={false}
                onViewResults={(
                  courseId: string,
                  courseTitle: string,
                  g: { scorePct: number; passMark: number; passed: boolean }
                ) => {
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
        
              {/* Share dialog near header */}
             
                <OrgShareDialog
                  open={canShareUi && shareOpen}
                  onClose={() => setShareOpen(false)}
                  courseId={selectedCourse?.id || null}
                  courseTitle={effectiveCourseTitle || null}
                  totalLessons={safeLessons}
                  quizCount={safeQuiz}
                  minutes={capMinutes(minutes)}
                />

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
