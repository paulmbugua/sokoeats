// apps/mobile/src/pages/MyCourses.native.tsx
/* eslint-disable no-console */
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  FlatList,
  TextInput,
  ScrollView,
  Alert,
  Image,
  Modal,
} from 'react-native';
import debounce from 'lodash.debounce';
import { MaterialIcons } from '@expo/vector-icons';

import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import tw from '../../tailwind';
import { useShopContext } from '@mytutorapp/shared/context';
import {
  useEnrollments,
  useOerCourses,
  useTopCourses,
  useWrapOerBook,
  useUnifiedSearch,
} from '@mytutorapp/shared/hooks';
import useCourseSearch, { normalizeCourseSearchMeta } from '@mytutorapp/shared/hooks/useCourseSearch';

import { downloadCertificateFile } from '@mytutorapp/shared/api';
import { getRequiredQuestions, getRequiredWeeks } from '@mytutorapp/shared/utils/programTrackRequirements';
import type { Course, ProgramTrack } from '@mytutorapp/shared/types';
import type { UnifiedSearchItem } from '@mytutorapp/shared/hooks/useUnifiedSearch';
import type { MainStackParamList } from '../navigation/types';
import type { StackNavigationProp } from '@react-navigation/stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import ExploreSearchFiltersBar from '../components/search/ExploreSearchFiltersBar.native';

import { useThemePref } from '../theme/ThemeContext';

type TabKey = 'library' | 'courses';
type Nav = StackNavigationProp<MainStackParamList>;

type TrackRequirements = {
  key: ProgramTrack;
  label: string;
  minLessons: number;
  minQuestions: number;
};

// Map any incoming aliases -> canonical ProgramTrack keys
const normalizeTrack = (track?: ProgramTrack | string | null): ProgramTrack => {
  const raw = String(track || '').toLowerCase().trim();

  if (raw === 'certificate') return 'certificate';
  if (raw === 'diploma' || raw === 'professional') return 'diploma';
  if (raw === 'degree' || raw === 'comprehensive') return 'degree';

  return 'certificate';
};

const getTrackLabel = (track?: ProgramTrack | string | null): string => {
  const key = normalizeTrack(track);

  if (key === 'certificate') return 'Certificate';
  if (key === 'diploma') return 'Professional';
  if (key === 'degree') return 'Comprehensive';

  return 'Certificate';
};

const getTrackRequirements = (track?: ProgramTrack | string | null): TrackRequirements => {
  const key = normalizeTrack(track);
  return {
    key,
    label: getTrackLabel(key),
    minLessons: getRequiredWeeks(key),
    minQuestions: getRequiredQuestions(key),
  };
};

/* ----------------------------- Small UI bits ----------------------------- */

// Compact star text
function StarRow({ avg, count }: { avg?: number; count?: number }) {
  const a = Math.round((avg ?? 0) * 2) / 2;
  const stars = [1, 2, 3, 4, 5].map((i) => (a >= i ? '★' : a + 0.5 === i ? '☆' : '☆')).join('');
  return (
    <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
      {stars} {avg ? avg.toFixed(1) : '—'} ({count ?? 0})
    </Text>
  );
}

/* ----------------------------- Helpers ----------------------------- */

// Safely coerce possible JSON-string objects into real objects
function coerceObj<T = any>(v: unknown): T | undefined {
  if (!v) return undefined;
  if (typeof v === 'object') return v as T;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s.startsWith('{') && s.endsWith('}')) {
      try {
        return JSON.parse(s) as T;
      } catch {
        /* ignore */
      }
    }
  }
  return undefined;
}

// Canonical way to pull tutor's user id from many possible shapes
function getTutorUserId(c: any): string | undefined {
  const userObj = coerceObj(c?.user);
  const raw =
    c?.tutor_id ??
    c?.tutorId ??
    c?.instructor?.id ??
    c?.tutor_profile?.id ??
    c?.profile?.id ??
    (userObj ? (userObj as any).id : undefined) ??
    c?.user_id;

  const s = raw == null ? '' : String(raw);
  return s || undefined;
}

// Centralized extractor so tutor name always renders even if backend fields vary
function getTutorInfo(c: unknown): { name: string; id?: string | number } {
  const obj = (c ?? {}) as Record<string, any>;
  const userObj = coerceObj(obj.user);

  const name =
    (typeof obj.tutor === 'string' && obj.tutor) ||
    (typeof obj.tutorName === 'string' && obj.tutorName) ||
    (obj.instructor && typeof obj.instructor.name === 'string' && obj.instructor.name) ||
    (obj.tutor_profile && typeof obj.tutor_profile.name === 'string' && obj.tutor_profile.name) ||
    (obj.profile && typeof obj.profile.name === 'string' && obj.profile.name) ||
    (userObj && typeof (userObj as any).name === 'string' && (userObj as any).name) ||
    '—';

  const id =
    obj.tutorId ??
    obj.tutor_id ??
    obj.instructor?.id ??
    obj.tutor_profile?.id ??
    obj.profile?.id ??
    (userObj ? (userObj as any).id : undefined) ??
    obj.user_id ??
    undefined;

  return { name, id };
}

const s = (x: any) => String(x || '').toLowerCase();

function isOerCourse(c: any): boolean {
  const provider = s(c?.provider);
  const source = s(c?.source || c?.origin || c?.type || c?.category);
  const codeish = s(c?.code || c?.slug || c?.oer_slug);
  return Boolean(
    c?.is_oer ||
      c?.isOer ||
      c?.wrapped_oer ||
      source.includes('oer') ||
      (source.includes('open') && source.includes('text')) ||
      provider.includes('oer') ||
      provider.includes('openstax') ||
      provider.includes('khan') ||
      provider.includes('ck-12') ||
      codeish.includes('oer')
  );
}

function wasUploadedByTutor(c: any): boolean {
  const role = s(c?.uploader_role || c?.created_by_role || c?.owner_role || c?.creatorRole);
  const hasTutorLink =
    Boolean(c?.tutor_id || c?.tutorId || c?.tutor_profile || c?.instructor?.id) ||
    typeof c?.tutor === 'string' ||
    typeof c?.tutorName === 'string';

  if (role) {
    if (['tutor', 'instructor', 'teacher'].includes(role)) return true;
    if (['system', 'oer', 'ingest', 'auto', 'robot'].includes(role)) return false;
  }
  return hasTutorLink;
}

/* ----------------------------- API URL ----------------------------- */
const makeApiUrl = (base?: string) => (path: string) => {
  const b = (base || '').replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  const baseHasApi = /\/api$/.test(b);
  const pathHasApi = /^\/api(\/|$)/.test(p);
  if (baseHasApi && pathHasApi) return b + p.replace(/^\/api/, '');
  if (!baseHasApi && !pathHasApi) return `${b}/api${p}`;
  return b + p;
};

const toWebBase = (base?: string) => (base || '').replace(/\/+$/, '').replace(/\/api$/i, '');

const resolveThumbUri = (backendBase?: string | null, raw?: string | null) => {
  if (!raw) return undefined;
  const st = String(raw).trim();
  if (/^https?:\/\//i.test(st)) return st;
  if (!backendBase) return undefined;

  const webBase = toWebBase(backendBase);
  const base = webBase.replace(/\/+$/, '');

  if (st.startsWith('/')) return `${base}${st}`;
  return `${base}/${st}`;
};

function toArray<T = any>(val: any): T[] {
  if (Array.isArray(val)) return val;
  if (val == null) return [];
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.items)) return parsed.items;
      if (Array.isArray(parsed?.data)) return parsed.data;
      return [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(val?.items)) return val.items;
  if (Array.isArray(val?.data)) return val.data;
  if (Array.isArray(val?.rows)) return val.rows;
  if (typeof val === 'object') {
    for (const k of ['collections', 'results', 'list']) {
      if (Array.isArray((val as any)[k])) return (val as any)[k];
    }
    const vals = Object.values(val);
    return vals.every((v) => typeof v === 'object') ? (vals as T[]) : [];
  }
  return [];
}

const extractCertId = (doc: any): string | null => {
  if (!doc) return null;
  const direct = doc?.certId || doc?.certificateId || doc?.id;
  if (typeof direct === 'string' && direct) return direct;
  const u = String(doc?.download_url || doc?.downloadUrl || doc?.url || '');
  const m =
    u.match(/\/certificates\/([^/]+)\/(?:download|view|raw)?/i) || u.match(/[?&]certId=([^&]+)/i);
  return m?.[1] ?? null;
};

/* ----------------------------- Small cards ----------------------------- */

const UnifiedLibraryCard: React.FC<{
  item: UnifiedSearchItem;
  backendBase?: string | null;
  onPress: () => void;
  badge?: string;
}> = ({ item, backendBase, onPress, badge }) => {
  const thumb =
    resolveThumbUri(backendBase, item.thumbnail_url || null) ||
    `https://picsum.photos/seed/${encodeURIComponent(String(item.id || item.title))}/800/450`;

  return (
    <Pressable
      onPress={onPress}
      style={tw`flex-1 mr-3 mb-3 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-3`}
    >
      <Image
        source={{ uri: thumb }}
        style={tw`w-full h-36 rounded-lg bg-slate-200 dark:bg-white/5`}
        resizeMode="cover"
      />
      <Text style={tw`mt-2 font-semibold text-sm text-slate-900 dark:text-white`} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={tw`text-xs text-[#49739c] dark:text-white/70 mt-0.5`} numberOfLines={1}>
        {item.subtitle ?? item.subject ?? item.provider ?? '—'}
      </Text>
      {badge ? (
        <View style={tw`mt-2`}>
          <Text
            style={tw`text-[11px] px-2 py-0.5 self-start rounded bg-[#e7edf4] dark:bg-[#172534] text-slate-900 dark:text-white/90`}
          >
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
};

const OerBookCard: React.FC<{
  book: any;
  backendBase?: string | null;
  onReader: () => void;
  onRobot?: () => void;
}> = ({ book, backendBase, onReader, onRobot }) => {
  const thumbRaw = book.thumbnail_url || book.cover_url;

  const thumb =
    resolveThumbUri(backendBase, thumbRaw) ||
    `https://picsum.photos/seed/${encodeURIComponent(
      String(book.slug ?? book.id ?? book.title ?? 'oer')
    )}/800/450`;

  return (
    <View style={tw`w-1/2 pr-2 mb-3`}>
      <View
        style={tw`rounded-xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-3`}
      >
        <Image
          source={{ uri: thumb }}
          style={tw`w-full h-36 rounded-lg bg-slate-200 dark:bg-white/5`}
          resizeMode="cover"
        />

        <View style={tw`mt-2 flex-row items-start justify-between`}>
          <Text
            style={tw`font-semibold text-sm text-slate-900 dark:text-white flex-1 pr-2`}
            numberOfLines={2}
          >
            {book.title}
          </Text>
          <Text
            style={tw`text-[11px] px-2 py-0.5 rounded bg-[#e7edf4] dark:bg-[#172534] text-slate-900 dark:text-white/90`}
          >
            BOOK
          </Text>
        </View>

        <Text style={tw`text-xs text-[#49739c] dark:text-white/70 mt-1`} numberOfLines={1}>
          {book.subject ?? '—'}
          {book.level ? ` • ${book.level}` : ''}
        </Text>

        <View style={tw`mt-3`}>
          <Pressable
            style={tw`h-10 rounded-lg bg-[#3d99f5] items-center justify-center`}
            onPress={onReader}
          >
            <Text style={tw`text-white text-xs font-semibold`}>Reader</Text>
          </Pressable>
          {/*
            TODO: Re-enable "Learn with RobotTeacher" for OER books once the mobile OER->AI wrap flow is finalized.
            (Kept here for quick re-enable.)
            {!!onRobot && (
              <Pressable
                style={tw`h-10 rounded-lg bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 items-center justify-center mt-2`}
                onPress={onRobot}
              >
                <Text style={tw`text-[#0d141c] dark:text-white text-xs font-semibold`}>
                  Learn with RobotTeacher
                </Text>
              </Pressable>
            )}
          */}
        </View>
      </View>
    </View>
  );
};

/* --------------------------------- Screen -------------------------------- */
const MyCoursesNative: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<any>();
  const { backendUrl, token, profile, role: ctxRole } = useShopContext();

  const rawRole = (profile as any)?.role ?? ctxRole ?? '';
  const roleStr = String(rawRole || '').toLowerCase();

  const { resolvedScheme } = useThemePref();
  const isDark = resolvedScheme === 'dark';
  const insets = useSafeAreaInsets();

  const navAny = navigation as unknown as {
    navigate: (...args: any[]) => void;
    getState: () => any;
  };

  const myId = String(profile?.id ?? '');

  const api = useMemo(() => makeApiUrl(backendUrl || ''), [backendUrl]);

  const [sandboxDbgEnabled, setSandboxDbgEnabled] = useState(false);
  const [sandboxDbgInfo, setSandboxDbgInfo] = useState<{
    url?: string;
    status?: number;
    preview?: string;
    count?: number;
  }>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const dbgParam = route?.params?.dbg === '1' || route?.params?.dbg === 1;
        if (dbgParam) {
          if (mounted) setSandboxDbgEnabled(true);
          return;
        }
        const stored = await AsyncStorage.getItem('DBG_SANDBOX_UNLOCK');
        if (mounted) setSandboxDbgEnabled(stored === '1');
      } catch {
        if (mounted) setSandboxDbgEnabled(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [route?.params]);

  type SandboxStatus = {
    totalWeeks: number | null;
    completedWeeks: number | null;
    quizEligible: boolean;
    certificateReady: boolean;
    loading: boolean;
    error?: string;
  };

  const [unlockedAi, setUnlockedAi] = useState<any[]>([]);
  const [unlockedAiLoading, setUnlockedAiLoading] = useState(false);
  const [unlockedAiErr, setUnlockedAiErr] = useState<string | null>(null);
  const [sandboxTrackById, setSandboxTrackById] = useState<Record<string, ProgramTrack>>({});
  const [sandboxStatusById, setSandboxStatusById] = useState<
    Record<string, SandboxStatus | undefined>
  >({});

  // Tabs
  const [tab, setTab] = useState<TabKey>('library');
  const [topCoursesPage, setTopCoursesPage] = useState(1);
  const [topCoursesExpanded, setTopCoursesExpanded] = useState(true);
  const topCoursesPageSize = 6;

  const {
    items: topCourses,
    total: topCoursesTotal,
    hasMore: topCoursesHasMore,
    loading: topCoursesLoading,
    error: topCoursesError,
  } = useTopCourses({
    backendUrl: backendUrl ?? '',
    page: topCoursesPage,
    pageSize: topCoursesPageSize,
    enabled: tab === 'courses',
  });

  const topCoursesResolvedTotal =
    topCoursesTotal ??
    (topCoursesHasMore
      ? topCoursesPage * topCoursesPageSize + 1
      : (topCoursesPage - 1) * topCoursesPageSize + topCourses.length);
  const topCoursesTotalPages = Math.max(1, Math.ceil(topCoursesResolvedTotal / topCoursesPageSize));

  /* ------------------ ✅ Server-driven: useCourseSearch for Courses tab ------------------ */
  const {
    courses: searchedCourses,
    loading: courseSearchLoading,
    handleSearch: handleCourseSearch,
    filters,
    patchFilters,
    clearFilters: clearCourseFilters,
    searchMeta: courseSearchMeta,
  } = useCourseSearch({ backendUrl: backendUrl ?? '' });

  const courseMeta = useMemo(() => normalizeCourseSearchMeta(courseSearchMeta), [courseSearchMeta]);
  const courseSearchError = courseMeta.error;

  /* ------------------ ✅ Unified: useUnifiedSearch for Library tab ------------------ */
  const {
    items: libraryItems,
    loading: librarySearchLoading,
    handleSearch: handleLibrarySearch,
    filters: libraryFilters,
    patchFilters: patchLibraryFilters,
    clearFilters: clearLibraryFilters,
    meta: librarySearchMeta,
  } = useUnifiedSearch({
    backendUrl: backendUrl ?? '',
    initialFilters: {
      kinds: ['oer_course', 'oer_video', 'purchased_video'],
      contentKinds: ['video'],
    },
  });

  const [stableLibraryItems, setStableLibraryItems] = useState<UnifiedSearchItem[]>([]);
  useEffect(() => {
    if (!librarySearchLoading) setStableLibraryItems((libraryItems ?? []) as UnifiedSearchItem[]);
  }, [librarySearchLoading, libraryItems]);

  const activeLibraryItems = librarySearchLoading
    ? stableLibraryItems
    : ((libraryItems ?? []) as UnifiedSearchItem[]);

  const freeOerCollections = useMemo(
    () => activeLibraryItems.filter((item) => item.kind === 'oer_course'),
    [activeLibraryItems]
  );
  const freeOerVideos = useMemo(
    () => activeLibraryItems.filter((item) => item.kind === 'oer_video'),
    [activeLibraryItems]
  );
  const purchasedVideos = useMemo(
    () => activeLibraryItems.filter((item) => item.kind === 'purchased_video'),
    [activeLibraryItems]
  );

  // Search box
  const [courseQuery, setCourseQuery] = useState('');

  // Drive server search from query (hook already debounces internally)
  useEffect(() => {
    try {
      handleCourseSearch(courseQuery);
    } catch {}
  }, [courseQuery, handleCourseSearch]);

  // Ensure default “tutor-first” behavior on mount / backendUrl change
  useEffect(() => {
    try {
      patchFilters({ isOer: false, sourceKind: 'tutor' });
      handleCourseSearch('');
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl]);

  const [stableCourses, setStableCourses] = useState<Course[]>([]);
  useEffect(() => {
    if (!courseSearchLoading) setStableCourses((searchedCourses ?? []) as Course[]);
  }, [courseSearchLoading, searchedCourses]);

  const activeCourses = courseSearchLoading ? stableCourses : searchedCourses;


  const courseFiltersState = useMemo(
    () => ({
      subject: filters.subject ?? '',
      grade: filters.gradeBand ?? '',
      level: filters.level ?? '',
      country: filters.country ?? '',
      minRating: filters.minRating ?? 0,
      maxPrice: filters.maxPrice ?? 0,
      duration: (filters as any).duration ?? '',
    }),
    [filters]
  );

  const handleCourseFiltersChange = useCallback(
    (next: any) => {
      patchFilters({
        subject: next.subject,
        gradeBand: next.grade,
        level: next.level,
        country: next.country,
        duration: next.duration,
        minRating: next.minRating,
        maxPrice: next.maxPrice,
      });
    },
    [patchFilters]
  );

  const clearAllCourses = useCallback(() => {
    clearCourseFilters();
    setCourseQuery('');
    try {
      handleCourseSearch('');
    } catch {}
  }, [clearCourseFilters, handleCourseSearch]);

  /* ------------------------------- Library tab (Vault + OER videos) ------------------------------- */

  const [libraryQuery, setLibraryQuery] = useState('');
  const [librarySubject, setLibrarySubject] = useState<string>('');
  const [libraryGrade, setLibraryGrade] = useState<string>('');
  const [libraryCountry, setLibraryCountry] = useState<string>('');
  const [libraryProvider, setLibraryProvider] = useState<string>('');
  const [libraryScope, setLibraryScope] = useState<'all' | 'purchased' | 'free'>('all');

  const debouncedLibrarySearch = useRef(
    debounce((q: string) => {
      try {
        handleLibrarySearch(q);
      } catch {}
    }, 250)
  );

  useEffect(() => {
    return () => debouncedLibrarySearch.current.cancel();
  }, []);

  useEffect(() => {
    debouncedLibrarySearch.current(libraryQuery);
  }, [libraryQuery]);

  useEffect(() => {
    if (!backendUrl) return;
    if (tab !== 'library') return;
    try {
      patchLibraryFilters({
        kinds: ['oer_course', 'oer_video', 'purchased_video'],
        contentKinds: ['video'],
        providers: [],
      });
      handleLibrarySearch('');
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, tab]);
  const clearAllLibrary = useCallback(() => {
    setLibrarySubject('');
    setLibraryGrade('');
    setLibraryCountry('');
    setLibraryProvider('');
    setLibraryScope('all');
    setLibraryQuery('');
    clearLibraryFilters();
    patchLibraryFilters({
      kinds: ['oer_course', 'oer_video', 'purchased_video'],
      contentKinds: ['video'],
      providers: [],
    });
    try {
      handleLibrarySearch('');
    } catch {}
  }, [clearLibraryFilters, patchLibraryFilters, handleLibrarySearch]);

  const handleLibraryFiltersChange = useCallback(
    (next: {
      subject?: string;
      grade?: string;
      country?: string;
      provider?: string;
      scope?: 'all' | 'purchased' | 'free';
    }) => {
      if (next.subject != null) setLibrarySubject(next.subject);
      if (next.grade != null) setLibraryGrade(next.grade);
      if (next.country != null) setLibraryCountry(next.country);
      if (next.provider != null) setLibraryProvider(next.provider);
      if (next.scope != null) setLibraryScope(next.scope);

      const patch: any = {};
      if (next.subject != null) patch.subject = String(next.subject || '').trim();
      if (next.grade != null) patch.gradeBand = String(next.grade || '').trim();
      if (next.country != null) patch.country = String(next.country || '').trim();
      if (next.provider != null) {
        const p = String(next.provider || '').trim();
        patch.providers = p ? [p] : [];
      }
      patch.kinds = ['oer_course', 'oer_video', 'purchased_video'];
      patch.contentKinds = ['video'];

      patchLibraryFilters(patch);
    },
    [setLibrarySubject, setLibraryGrade, setLibraryCountry, setLibraryProvider, setLibraryScope, patchLibraryFilters]
  );

  const libraryFiltersState = useMemo(
    () => ({
      subject: librarySubject,
      grade: libraryGrade,
      country: libraryCountry,
      provider: libraryProvider,
      scope: libraryScope,
    }),
    [librarySubject, libraryGrade, libraryCountry, libraryProvider, libraryScope]
  );

  const showPurchasedLibrary = libraryScope !== 'free';
  const showFreeLibrary = libraryScope !== 'purchased';

  useEffect(() => {
    const params = route?.params ?? {};
    const tabParam = params.tab;
    if (tabParam === 'library' || tabParam === 'courses') setTab(tabParam);

    const q = String(params.q ?? '').trim();
    if (q) {
      setCourseQuery(q);
      setLibraryQuery(q);
    }

    const subject = params.subject != null ? String(params.subject) : undefined;
    const gradeBand = params.gradeBand != null ? String(params.gradeBand) : undefined;
    const level = params.level != null ? String(params.level) : undefined;
    const country = params.country != null ? String(params.country) : undefined;
    const minRating = params.minRating != null ? Number(params.minRating) : undefined;
    const maxPrice = params.maxPrice != null ? Number(params.maxPrice) : undefined;
    const durationParam = params.duration != null ? String(params.duration) : undefined;
    const scope = params.scope;
    const provider = params.provider != null ? String(params.provider) : undefined;

    if (subject != null) {
      patchFilters({ subject });
      setLibrarySubject(subject);
      patchLibraryFilters({ subject });
    }
    if (gradeBand != null) {
      patchFilters({ gradeBand });
      setLibraryGrade(gradeBand);
      patchLibraryFilters({ gradeBand });
    }
    if (level != null) patchFilters({ level });

    if (country != null) {
      patchFilters({ country });
      setLibraryCountry(country);
      patchLibraryFilters({ country });
    }
    if (minRating != null && Number.isFinite(minRating)) patchFilters({ minRating });
    if (maxPrice != null && Number.isFinite(maxPrice)) patchFilters({ maxPrice });
    if (durationParam != null) patchFilters({ duration: durationParam } as any);

    if (provider != null) {
      setLibraryProvider(provider);
      patchLibraryFilters({ providers: [provider] });
    }
    if (scope === 'all' || scope === 'free' || scope === 'purchased') setLibraryScope(scope);
  }, [route?.params, patchFilters, patchLibraryFilters]);

  /* Enrollments */
  const { enrollments, fetchMine } = useEnrollments({
    backendUrl: backendUrl ?? '',
    token: token ?? '',
    studentId: 'me' as unknown as string | number,
  });

  useEffect(() => {
    if (token) void fetchMine();
  }, [token, fetchMine]);

  const enrolledCourseIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of enrollments as any[]) {
      const cid = String(e?.course_id ?? e?.courseId ?? '');
      if (cid) set.add(cid);
    }
    return set;
  }, [enrollments]);

  const resolveCourseTrack = useCallback((course: any): ProgramTrack | undefined => {
    const raw =
      course?.programTrack ??
      course?.program_track ??
      course?.track ??
      course?.track_key ??
      course?.program_track_key;

    const key = normalizeTrack(raw);
    return key;
  }, []);

  const extractWeeksCount = useCallback((course: any): number | null => {
    const syllabus = Array.isArray(course?.syllabus) ? course.syllabus.length : null;
    if (syllabus && syllabus > 0) return syllabus;
    const outline = Array.isArray(course?.outline) ? course.outline.length : null;
    if (outline && outline > 0) return outline;
    const outlineWeeks = Array.isArray(course?.outline_weeks) ? course.outline_weeks.length : null;
    if (outlineWeeks && outlineWeeks > 0) return outlineWeeks;
    const count =
      course?.week_count ??
      course?.weeks_count ??
      course?.outlineLen ??
      course?.outline_len ??
      course?.lessons_count ??
      null;
    const n = Number(count);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
    if (typeof course?.outline_json === 'string') {
      try {
        const parsed = JSON.parse(course.outline_json);
        if (Array.isArray(parsed)) return parsed.length;
        if (Array.isArray(parsed?.weeks)) return parsed.weeks.length;
      } catch {}
    }
    return null;
  }, []);

  const loadStoredTracks = useCallback(async (courses: any[]) => {
    const keys = courses.map((c) => `sandbox_track:${String(c?.id ?? '')}`);
    const entries = await AsyncStorage.multiGet(keys);
    const next: Record<string, ProgramTrack> = {};
    entries.forEach(([key, val]) => {
      const cid = key.replace('sandbox_track:', '');
      if (
        val === 'certificate' ||
        val === 'diploma' ||
        val === 'degree' ||
        val === 'professional' ||
        val === 'comprehensive'
      ) {
        next[cid] = normalizeTrack(val);
      }
    });
    return next;
  }, []);

  const persistTrack = useCallback(async (courseId: string, track: ProgramTrack) => {
    try {
      await AsyncStorage.setItem(`sandbox_track:${courseId}`, track);
    } catch {}
  }, []);

  useEffect(() => {
    if (!backendUrl || !token) {
      setUnlockedAi([]);
      setUnlockedAiErr(null);
      setUnlockedAiLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setUnlockedAiLoading(true);
      setUnlockedAiErr(null);
      const url = api('/courses/mine/unlocked-ai');

      try {
        const r = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const text = await r.clone().text().catch(() => '');
        if (sandboxDbgEnabled) {
          setSandboxDbgInfo({
            url,
            status: r.status,
            preview: text.slice(0, 300),
          });
        }

        if (!r.ok) throw new Error(text || `HTTP ${r.status}`);

        const j = await r.json().catch(() => ({}));
        const items = Array.isArray((j as any)?.items) ? (j as any).items : toArray<any>(j);

        if (!cancelled) {
          setUnlockedAi(items);
          if (sandboxDbgEnabled) {
            setSandboxDbgInfo((prev) => ({ ...prev, count: items.length }));
          }
        }
      } catch (e: any) {
        if (!cancelled) setUnlockedAiErr(e?.message || 'Failed to load');
      } finally {
        if (!cancelled) setUnlockedAiLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, backendUrl, token, sandboxDbgEnabled]);

  useEffect(() => {
    if (!unlockedAi.length) return;
    let cancelled = false;
    (async () => {
      const stored = await loadStoredTracks(unlockedAi);
      if (cancelled) return;
      setSandboxTrackById((prev) => {
        const next = { ...prev };
        unlockedAi.forEach((c: any) => {
          const cid = String(c.id ?? '');
          if (!cid || next[cid]) return;
          const fromCourse = resolveCourseTrack(c);
          next[cid] = stored[cid] ?? fromCourse ?? 'certificate';
        });
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [unlockedAi, loadStoredTracks, resolveCourseTrack]);

  /* Tutor name cache */
  const [tutorNameById, setTutorNameById] = useState<Record<string, string>>({});

  const tutorUserIdsInCourses = useMemo(() => {
    const set = new Set<string>();
    (searchedCourses as any[]).forEach((c) => {
      const id = getTutorUserId(c);
      if (id) set.add(id);
    });
    return Array.from(set);
  }, [searchedCourses]);

  useEffect(() => {
    // seed from embedded user objects
    const seed: Record<string, string> = {};
    (searchedCourses as any[]).forEach((c) => {
      const u = coerceObj<{ id?: string | number; name?: string }>((c as any).user);
      const id = u?.id != null ? String(u.id) : '';
      if (id && typeof u?.name === 'string' && !tutorNameById[id]) seed[id] = u.name;
    });
    if (Object.keys(seed).length) setTutorNameById((prev) => ({ ...prev, ...seed }));
  }, [searchedCourses, tutorNameById]);

  const fetchTutorNamesByUserIds = useCallback(
    async (ids: string[]): Promise<Record<string, string>> => {
      if (!ids.length) return {};
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      try {
        // ✅ Standardize: makeApiUrl injects /api, so path should be "/profile..."
        const url = api(`/profile?userIds=${encodeURIComponent(ids.join(','))}`);
        const res = await fetch(url, { headers });
        if (!res.ok) return {};

        const payload = await res.json();
        const out: Record<string, string> = {};

        const pickIdLocal = (it: any) =>
          String(it?.user_id ?? it?.userId ?? it?.user ?? it?.id ?? '');
        const pickNameLocal = (it: any) =>
          it?.name ?? it?.fullName ?? it?.displayName ?? it?.username ?? '—';

        const add = (it: any) => {
          const id = pickIdLocal(it);
          const name = pickNameLocal(it);
          if (id && name && name !== '—') out[id] = name;
        };

        if (Array.isArray(payload)) payload.forEach(add);
        else if (payload && typeof payload === 'object') {
          const arr =
            payload.profiles ??
            payload.items ??
            payload.data ??
            payload.results ??
            payload.rows ??
            payload.users;
          if (Array.isArray(arr)) arr.forEach(add);
          else for (const v of Object.values(payload)) if (v && typeof v === 'object') add(v);
        }
        return out;
      } catch {
        return {};
      }
    },
    [token, api]
  );

  const missingTutorUserIds = useMemo(
    () => tutorUserIdsInCourses.filter((id) => !tutorNameById[id]),
    [tutorUserIdsInCourses, tutorNameById]
  );

  useEffect(() => {
    if (!missingTutorUserIds.length) return;
    let cancelled = false;
    (async () => {
      const map = await fetchTutorNamesByUserIds(missingTutorUserIds);
      if (!cancelled && Object.keys(map).length) {
        setTutorNameById((prev) => ({ ...prev, ...map }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [missingTutorUserIds, fetchTutorNamesByUserIds]);

  const resolveTutorName = useCallback(
    (c: any): string | undefined => {
      const rawInfo = getTutorInfo(c);
      const userId = getTutorUserId(c) ?? (rawInfo.id != null ? String(rawInfo.id) : '');
      const name = userId && tutorNameById[userId] ? tutorNameById[userId] : rawInfo.name;
      return name && name !== '—' ? name : undefined;
    },
    [tutorNameById]
  );

  const displayRows = useMemo(
  () => (activeCourses ?? []).filter((c: any) => !!resolveTutorName(c)),
  [activeCourses, resolveTutorName]
);


  /* ----------------------- Ratings prefetch (courses) ----------------------- */
  const [ratings, setRatings] = useState<
    Record<string, { avg: number; count: number; my: boolean }>
  >({});
  const [openReview, setOpenReview] = useState<{ id: string; title: string } | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [posting, setPosting] = useState(false);

  const fetchCourseRatings = useCallback(
    async (courseId: string) => {
      try {
        const res = await fetch(`${backendUrl}/api/reviews/courses/${courseId}`);
        if (!res.ok) return;
        const data = await res.json();
        const avg = Number(data?.avgRating ?? 0);
        const count = Number(data?.totalReviews ?? 0);
        const my = Array.isArray(data?.reviews)
          ? data.reviews.some((r: any) => String(r.studentId) === myId)
          : false;
        setRatings((prev) => ({ ...prev, [courseId]: { avg, count, my } }));
      } catch {
        // silent
      }
    },
    [backendUrl, myId]
  );

  const debouncedFetchCourseRatings = useRef(
    debounce((courseId: string) => {
      void fetchCourseRatings(courseId);
    }, 200)
  );

  useEffect(() => () => debouncedFetchCourseRatings.current.cancel(), []);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    for (const it of viewableItems) {
      const id = String(it?.item?.id ?? '');
      if (id && !ratings[id]) debouncedFetchCourseRatings.current(id);
    }
  }).current;

  const ensureSandboxStatus = useCallback(
    async (course: any) => {
      const cid = String(course?.id ?? '');
      if (!cid || !backendUrl || !token) return;

      setSandboxStatusById((prev) => ({
        ...prev,
        [cid]: {
          totalWeeks: prev[cid]?.totalWeeks ?? null,
          completedWeeks: prev[cid]?.completedWeeks ?? null,
          quizEligible: prev[cid]?.quizEligible ?? false,
          certificateReady: prev[cid]?.certificateReady ?? false,
          loading: true,
          error: undefined,
        },
      }));

      try {
        let totalWeeks = extractWeeksCount(course);
        if (totalWeeks == null) {
          const courseRes = await fetch(api(`/courses/${cid}`), {
            headers: { Authorization: `Bearer ${token}` },
          });
          const courseData = courseRes.ok ? await courseRes.json().catch(() => ({})) : null;
          totalWeeks = extractWeeksCount(courseData) ?? totalWeeks;
        }

        const progressRes = await fetch(api(`/course-progress/${cid}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const progress = progressRes.ok ? await progressRes.json().catch(() => []) : [];
        const progressArr = Array.isArray(progress) ? progress : [];
        const completedWeeks = progressArr.filter((p: any) => p?.status === 'Completed').length;
        const progressMaxWeek = progressArr.reduce(
          (acc: number, p: any) => (Number(p?.week) > acc ? Number(p.week) : acc),
          0
        );
        if (!totalWeeks && progressMaxWeek > 0) totalWeeks = progressMaxWeek;

        const certRes = await fetch(
          api(`/certificates/status?courseId=${encodeURIComponent(cid)}`),
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const certJson = certRes.ok ? await certRes.json().catch(() => ({})) : {};
        const certificateReady = Boolean(
          certJson?.certificateReady || certJson?.hasCertificate || certJson?.canCertificate
        );
        const quizEligible =
          typeof totalWeeks === 'number' && totalWeeks > 0 ? completedWeeks >= totalWeeks : false;

        setSandboxStatusById((prev) => ({
          ...prev,
          [cid]: {
            totalWeeks: totalWeeks ?? null,
            completedWeeks,
            quizEligible,
            certificateReady,
            loading: false,
          },
        }));
      } catch (e: any) {
        setSandboxStatusById((prev) => ({
          ...prev,
          [cid]: {
            totalWeeks: prev[cid]?.totalWeeks ?? null,
            completedWeeks: prev[cid]?.completedWeeks ?? null,
            quizEligible: prev[cid]?.quizEligible ?? false,
            certificateReady: prev[cid]?.certificateReady ?? false,
            loading: false,
            error: e?.message || 'Failed to load status',
          },
        }));
      }
    },
    [api, backendUrl, token, extractWeeksCount]
  );

  const onUnlockedViewableItemsChanged = useRef(({ viewableItems }: any) => {
    for (const it of viewableItems) {
      const item = it?.item;
      const id = String(item?.id ?? '');
      if (!id) continue;
      const existing = sandboxStatusById[id];
      if (existing?.loading || existing?.totalWeeks) continue;
      void ensureSandboxStatus(item);
    }
  }).current;

  /* ------------------------------- OER (books + wrap) ------------------------------- */
  const { courses: oerCourses = [], loading: oerLoading, error: oerError } = useOerCourses();
  const { wrapBook } = useWrapOerBook();

  const oerBooks = useMemo(
    () => (oerCourses as any[]).filter((c) => c?.kind === 'book'),
    [oerCourses]
  );

  const hasRoute = (name: string): boolean => {
    try {
      const state = navigation.getState?.();
      const walk = (st: any): boolean => {
        if (!st) return false;
        const names = Array.isArray(st?.routeNames)
          ? st.routeNames
          : Array.isArray(st?.routes)
            ? st.routes.map((r: any) => r.name)
            : [];
        if (names.includes(name)) return true;
        const routes = Array.isArray(st?.routes) ? st.routes : [];
        for (const r of routes) if (r?.state && walk(r.state)) return true;
        return false;
      };
      return walk(state);
    } catch {
      return false;
    }
  };

  const goCollection = (id: string, kind: 'video' | 'doc') => {
    const candidates =
      kind === 'video'
        ? ['OerCollection', 'VideoCollection', 'CollectionDetail', 'Videos']
        : ['OerCollection', 'DocCollection', 'CollectionDetail', 'Courses'];

    for (const name of candidates) {
      if (hasRoute(name)) {
        if (name === 'Videos' || name === 'Courses') {
          navAny.navigate(name, kind === 'doc' ? { free: 1 } : undefined);
        } else {
          navAny.navigate(name, { id });
        }
        return;
      }
    }

    if (hasRoute('CourseDetail')) navAny.navigate('CourseDetail', { id });
  };

  const goOerReader = (idOrSlug: string | number) => {
    const id = String(idOrSlug);
    if (hasRoute('OerReaderFull')) {
      navAny.navigate('OerReaderFull', { id });
      return;
    }
    goCollection(id, 'doc');
  };

  const loadingVCols = librarySearchLoading;
  const errVCols = librarySearchMeta?.error ?? null;

  const goUnifiedItem = useCallback(
    (item: UnifiedSearchItem) => {
      if (item.kind === 'purchased_video') {
        const id = Number(item.id);
        if (Number.isFinite(id)) {
          navAny.navigate('ClassVaultDetail', { id });
        }
        return;
      }
      if (item.kind === 'oer_video') {
        if (hasRoute('VideoCollection')) {
          navAny.navigate('VideoCollection', { id: item.id });
          return;
        }
        goCollection(item.id, 'video');
        return;
      }
      if (item.kind === 'oer_course') {
        goCollection(item.id, 'video');
        return;
      }
      if (item.kind === 'tutor') {
        navAny.navigate('Profile', { id: item.id });
      }
    },
    [goCollection, hasRoute, navAny]
  );

  /* --------------------------------- Guards --------------------------------- */
  if (token && roleStr === 'tutor' && !profile) {
    return (
      <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`} edges={['top', 'bottom']}>
        <View style={tw`flex-1 items-center justify-center`}>
          <ActivityIndicator color={isDark ? '#ffffff' : '#0d141c'} />
          <Text style={tw`mt-2 text-sm text-[#49739c] dark:text-white/70`}>
            Checking your account…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  /* ----------------------------- Course card ----------------------------- */
  const renderCourseCard = ({ item }: { item: Course }) => {
    const cid = String((item as any).id);
    const tutorName = resolveTutorName(item);
    const priceDisplay =
      typeof (item as any).price === 'number'
        ? `$${(item as any).price}`
        : typeof (item as any).price === 'string'
          ? (item as any).price
          : '—';

    const isEnrolled = enrolledCourseIds.has(cid);
    const r = ratings[cid];

    return (
      <Pressable
        style={tw`rounded-xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-3 mb-3`}
        onPress={() =>
          navigation.navigate(isEnrolled ? 'CourseProgress' : 'CourseDetails', { courseId: cid })
        }
      >
        <View style={tw`flex-row items-start justify-between`}>
          <Text
            style={tw`font-semibold text-sm flex-1 pr-2 text-slate-900 dark:text-white`}
            numberOfLines={2}
          >
            {(item as any).title}
          </Text>
          <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
            {(item as any).level ?? '—'}
          </Text>
        </View>

        <Text style={tw`text-xs text-[#49739c] dark:text-white/70 mt-1`} numberOfLines={1}>
          {tutorName ?? '—'}
        </Text>

        <View style={tw`flex-row items-center justify-between mt-2`}>
          <Text style={tw`text-xs text-[#49739c] dark:text-white/70`} numberOfLines={1}>
            {String((item as any).duration ?? '—')}
          </Text>
          <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>{priceDisplay}</Text>
        </View>

        <View style={tw`flex-row items-center justify-between mt-2`}>
          <View>
            {r ? (
              <StarRow avg={r.avg} count={r.count} />
            ) : (
              <Text style={tw`text-xs text-[#49739c] dark:text-white/70 opacity-70`}>—</Text>
            )}
          </View>

          {isEnrolled ? (
            r?.my ? (
              <Pressable
                style={tw`h-9 px-3 rounded-lg bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
                onPress={() => navigation.navigate('CourseProgress', { courseId: cid })}
              >
                <Text style={tw`text-xs font-semibold text-slate-900 dark:text-white`}>
                  Enrolled
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={tw`h-9 px-3 rounded-lg bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
                onPress={() => setOpenReview({ id: cid, title: (item as any).title })}
              >
                <Text style={tw`text-xs font-semibold text-slate-900 dark:text-white`}>Review</Text>
              </Pressable>
            )
          ) : (
            <Pressable
              style={tw`h-9 px-3 rounded-lg bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
              onPress={() => navigation.navigate('CourseDetails', { courseId: cid })}
            >
              <Text style={tw`text-xs font-semibold text-slate-900 dark:text-white`}>View</Text>
            </Pressable>
          )}
        </View>
      </Pressable>
    );
  };

  const renderUnlockedCard = ({ item }: { item: any }) => {
    const cid = String(item?.id ?? '');
    const track = sandboxTrackById[cid] ?? resolveCourseTrack(item) ?? 'certificate';
    const reqs = getTrackRequirements(track);
    const status = sandboxStatusById[cid];
    const totalWeeks = status?.totalWeeks ?? null;
    const completedWeeks = status?.completedWeeks ?? 0;
    const quizEligible = status?.quizEligible ?? false;
    const certificateReady = status?.certificateReady ?? false;
    const weeksPct =
      totalWeeks && totalWeeks > 0
        ? Math.min(100, Math.round((completedWeeks / totalWeeks) * 100))
        : 0;
    const lessonsDone = Math.min(completedWeeks, reqs.minLessons);
    const questionsDone = Math.min(completedWeeks * 2, reqs.minQuestions);

    const thumb =
      resolveThumbUri(backendUrl, item?.thumbnail_url || item?.cover_url || item?.thumbnail) ||
      `https://picsum.photos/seed/${encodeURIComponent(String(item?.id ?? 'ai'))}/800/450`;

    const onTrackChange = (next: ProgramTrack) => {
      setSandboxTrackById((prev) => ({ ...prev, [cid]: next }));
      void persistTrack(cid, next);
    };

    const onDownloadCertificate = async () => {
      if (!backendUrl || !token) return;
      try {
        const res = await fetch(api('/certificates/generate'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ courseId: cid }),
        });
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(msg || 'Certificate unavailable');
        }
        const doc = await res.json().catch(() => ({}));
        const certId = extractCertId(doc);
        if (!certId) throw new Error('Certificate unavailable');
        const fileName = `${String(item?.title || 'certificate')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')}-${certId}.pdf`;
        await downloadCertificateFile(backendUrl, token, certId, fileName);
      } catch (e: any) {
        Alert.alert('Certificate', e?.message || 'Failed to download certificate');
      }
    };

    return (
      <View style={tw`rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 mb-3 overflow-hidden`}>
        <Image source={{ uri: thumb }} style={tw`w-full h-36 bg-[#e7edf4] dark:bg-[#172534]`} />
        <View style={tw`p-3`}>
          <View style={tw`flex-row items-start justify-between`}>
            <Text style={tw`font-semibold text-slate-900 dark:text-white flex-1`} numberOfLines={2}>
              {item?.title || 'Untitled course'}
            </Text>
            <View style={tw`ml-2 px-2 py-0.5 rounded-full bg-[#e7edf4] dark:bg-[#172534]`}>
              <Text style={tw`text-[10px] text-slate-700 dark:text-white/80`}>AI Sandbox</Text>
            </View>
          </View>

          <Text style={tw`text-xs text-[#49739c] dark:text-white/70 mt-1`}>
            {item?.subject ?? '—'} {item?.level ? `• ${item.level}` : ''}
          </Text>

          <View style={tw`flex-row flex-wrap mt-2`}>
            {(['certificate', 'diploma', 'degree'] as ProgramTrack[]).map((opt) => (
              <Pressable
                key={opt}
                onPress={() => onTrackChange(opt)}
                style={tw.style(
                  'px-3 h-7 rounded-full items-center justify-center mr-2 mb-2 border',
                  track === opt
                    ? 'bg-[#3d99f5] border-[#3d99f5]'
                    : 'bg-white dark:bg-[#0f1821] border-[#cedbe8] dark:border-white/10'
                )}
              >
                <Text
                  style={tw.style(
                    'text-[11px] font-semibold',
                    track === opt ? 'text-white' : 'text-slate-700 dark:text-white/80'
                  )}
                >
                  {getTrackRequirements(opt).label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={tw`rounded-xl bg-[#f6f9fc] dark:bg-[#172534] p-2 mt-1`}>
            <View style={tw`flex-row justify-between`}>
              <Text style={tw`text-[11px] text-[#314a64] dark:text-white/70`}>Lessons</Text>
              <Text style={tw`text-[11px] font-semibold text-[#314a64] dark:text-white`}>
                {lessonsDone}/{reqs.minLessons}
              </Text>
            </View>
            <View style={tw`flex-row justify-between mt-1`}>
              <Text style={tw`text-[11px] text-[#314a64] dark:text-white/70`}>Questions</Text>
              <Text style={tw`text-[11px] font-semibold text-[#314a64] dark:text-white`}>
                {questionsDone}/{reqs.minQuestions}
              </Text>
            </View>
          </View>

          <View style={tw`mt-2`}>
            <View style={tw`flex-row justify-between`}>
              <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>Weeks completed</Text>
              <Text style={tw`text-[11px] font-semibold text-[#49739c] dark:text-white/80`}>
                {totalWeeks ? `${completedWeeks}/${totalWeeks}` : '—'}
              </Text>
            </View>
            <View style={tw`h-2 bg-[#e7edf4] dark:bg-[#172534] rounded-full mt-1 overflow-hidden`}>
              <View style={tw.style('h-2 bg-[#3d99f5]', { width: `${weeksPct}%` })} />
            </View>
          </View>

          {status?.loading ? (
            <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70 mt-2`}>
              Loading eligibility…
            </Text>
          ) : status?.error ? (
            <Text style={tw`text-[11px] text-red-600 dark:text-red-400 mt-2`}>
              {status.error}
            </Text>
          ) : certificateReady ? (
            <Text style={tw`text-[11px] text-emerald-600 mt-2`}>Certificate ready ✅</Text>
          ) : quizEligible ? (
            <Text style={tw`text-[11px] text-indigo-600 mt-2`}>Final quiz available</Text>
          ) : (
            <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70 mt-2`}>
              Finish all weeks to unlock final quiz
            </Text>
          )}

          <View style={tw`flex-row mt-3`}>
            {certificateReady ? (
              <>
                <Pressable
                  onPress={onDownloadCertificate}
                  style={tw`flex-1 h-9 rounded-lg bg-[#3d99f5] items-center justify-center`}
                >
                  <Text style={tw`text-xs font-semibold text-white`}>Download certificate</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    navigation.navigate('CourseProgress', {
                      courseId: cid,
                      programTrack: track,
                      source: 'sandbox',
                    })
                  }
                  style={tw`ml-2 flex-1 h-9 rounded-lg bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 items-center justify-center`}
                >
                  <Text style={tw`text-xs font-semibold text-slate-900 dark:text-white`}>
                    Review weeks
                  </Text>
                </Pressable>
              </>
            ) : quizEligible ? (
              <>
                <Pressable
                  onPress={() =>
                    navigation.navigate('CourseProgress', {
                      courseId: cid,
                      programTrack: track,
                      source: 'sandbox',
                    })
                  }
                  style={tw`flex-1 h-9 rounded-lg bg-[#3d99f5] items-center justify-center`}
                >
                  <Text style={tw`text-xs font-semibold text-white`}>Open progress</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    navigation.navigate('CourseProgress', {
                      courseId: cid,
                      programTrack: track,
                      source: 'sandbox',
                    })
                  }
                  style={tw`ml-2 flex-1 h-9 rounded-lg bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 items-center justify-center`}
                >
                  <Text style={tw`text-xs font-semibold text-slate-900 dark:text-white`}>
                    Review weeks
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  onPress={() =>
                    navigation.navigate('CourseProgress', {
                      courseId: cid,
                      programTrack: track,
                      source: 'sandbox',
                    })
                  }
                  style={tw`flex-1 h-9 rounded-lg bg-[#3d99f5] items-center justify-center`}
                >
                  <Text style={tw`text-xs font-semibold text-white`}>
                    {completedWeeks > 0 ? 'Continue' : 'Start week'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    navigation.navigate('CourseProgress', {
                      courseId: cid,
                      programTrack: track,
                      source: 'sandbox',
                    })
                  }
                  style={tw`ml-2 flex-1 h-9 rounded-lg bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 items-center justify-center`}
                >
                  <Text style={tw`text-xs font-semibold text-slate-900 dark:text-white`}>
                    View progress
                  </Text>
                </Pressable>
              </>
            )}
          </View>

          {sandboxDbgEnabled ? (
            <Text style={tw`mt-2 text-[10px] text-[#7a94ad] dark:text-white/60`}>
              dbg: track={track} • progress=/progress/{cid}?programTrack={track}&source=sandbox
            </Text>
          ) : null}

          <View style={tw`flex-row justify-between mt-3`}>
            <Text style={tw`text-[11px] text-[#7a94ad] dark:text-white/60`}>
              Track: <Text style={tw`font-semibold`}>{reqs.label}</Text>
            </Text>
            <Pressable onPress={() => navigation.navigate('CourseDetails', { courseId: cid })}>
              <Text style={tw`text-[11px] underline text-[#49739c] dark:text-white/70`}>
                Details
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  const renderTopCourseCard = (item: any) => {
    const cid = String(item?.id ?? '');
    const isEnrolled = enrolledCourseIds.has(cid);
    const rating = typeof item?.rating === 'number' ? item.rating : undefined;
    const reviews = typeof item?.reviews === 'number' ? item.reviews : 0;
    const hero =
      resolveThumbUri(backendUrl, item?.thumbnail_url || item?.cover_url) ||
      `https://picsum.photos/seed/${encodeURIComponent(cid || 'top')}/800/450`;

    return (
      <View
        key={`top-${cid}`}
        style={tw`rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 overflow-hidden mb-3`}
      >
        <Image source={{ uri: hero }} style={tw`w-full h-36 bg-[#e7edf4] dark:bg-[#172534]`} />
        <View style={tw`p-3`}>
          <View style={tw`flex-row items-start justify-between`}>
            <Text
              style={tw`font-semibold text-sm text-slate-900 dark:text-white flex-1 pr-2`}
              numberOfLines={2}
            >
              {item?.title ?? 'Untitled'}
            </Text>
            <View style={tw`px-2 py-0.5 rounded-full bg-[#e7edf4] dark:bg-[#172534]`}>
              <Text style={tw`text-[10px] text-slate-700 dark:text-white/80`}>TOP</Text>
            </View>
          </View>

          <Text style={tw`text-xs text-[#49739c] dark:text-white/70 mt-1`} numberOfLines={1}>
            {item?.subject ?? '—'} {item?.level ? `• ${item.level}` : ''}
          </Text>

          <View style={tw`flex-row items-center justify-between mt-2`}>
            <Text style={tw`text-xs text-[#49739c] dark:text-white/70`} numberOfLines={1}>
              {String(item?.duration ?? '—')}
            </Text>
            {rating ? <StarRow avg={rating} count={reviews} /> : null}
          </View>

          <View style={tw`flex-row mt-3`}>
            {isEnrolled ? (
              <Pressable
                onPress={() => navigation.navigate('CourseProgress', { courseId: cid })}
                style={tw`flex-1 h-9 rounded-lg bg-[#3d99f5] items-center justify-center`}
              >
                <Text style={tw`text-xs font-semibold text-white`}>Continue</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => navigation.navigate('CourseDetails', { courseId: cid })}
                style={tw`flex-1 h-9 rounded-lg bg-[#3d99f5] items-center justify-center`}
              >
                <Text style={tw`text-xs font-semibold text-white`}>View</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => navAny.navigate('RobotTutor', { courseId: cid })}
              style={tw`ml-2 flex-1 h-9 rounded-lg bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 items-center justify-center`}
            >
              <Text style={tw`text-xs font-semibold text-slate-900 dark:text-white`}>
                Start with AI
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  /* ----------------------------- Tabs header ----------------------------- */
  const headerTabs = (
    <View
      style={tw`flex-row self-start rounded-xl p-1 bg-[#e7edf4] dark:bg-[#172534] border border-[#cedbe8] dark:border-white/10`}
    >
      <Pressable
        onPress={() => setTab('library')}
        style={tw.style(
          'h-9 px-3 rounded-lg items-center justify-center',
          tab === 'library' && 'bg-white dark:bg-[#0f1821]'
        )}
      >
        <Text
          style={tw.style(
            'text-xs font-semibold',
            tab === 'library'
              ? 'text-slate-900 dark:text-white'
              : 'text-slate-700 dark:text-white/70'
          )}
        >
          Explore Videos &amp; Notes
        </Text>
      </Pressable>

      <Pressable
        onPress={() => setTab('courses')}
        style={tw.style(
          'h-9 px-3 rounded-lg items-center justify-center',
          tab === 'courses' && 'bg-white dark:bg-[#0f1821]'
        )}
      >
        <Text
          style={tw.style(
            'text-xs font-semibold',
            tab === 'courses'
              ? 'text-slate-900 dark:text-white'
              : 'text-slate-700 dark:text-white/70'
          )}
        >
          Explore Courses
        </Text>
      </Pressable>
    </View>
  );

  /* ----------------------------- Courses header (web-like) ----------------------------- */
  const CoursesListHeader = (
    <View>
      <View style={tw`mt-3 mb-2`}>
        <Text style={tw`text-[20px] font-bold text-slate-900 dark:text-white px-0`}>
          Explore Courses
        </Text>
        <Text style={tw`text-[#49739c] dark:text-white/70 text-xs px-0`}>
          Find the perfect course to enhance your skills and knowledge.
        </Text>
      </View>

      {/* Unlocked AI Sandbox */}
      <View style={tw`mt-3`}>
        <View style={tw`flex-row items-center justify-between`}>
          <Text style={tw`text-base font-bold text-slate-900 dark:text-white`}>
            🧪 My AI Courses (Unlocked)
          </Text>
          <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
            {unlockedAiLoading
              ? 'Loading…'
              : `${unlockedAi.length} course${unlockedAi.length === 1 ? '' : 's'}`}
          </Text>
        </View>

        {sandboxDbgEnabled && !unlockedAiLoading && unlockedAi.length === 0 ? (
          <View
            style={tw`mt-2 rounded-xl bg-[#fff7ed] dark:bg-[#2a1e12] p-2 border border-[#f5d0a5] dark:border-[#5c3d1a]`}
          >
            <Text style={tw`text-[11px] font-semibold text-[#7a4b12] dark:text-[#f5d0a5]`}>
              unlocked-ai debug
            </Text>
            <Text style={tw`text-[11px] text-[#7a4b12] dark:text-[#f5d0a5]`}>
              url: {sandboxDbgInfo.url ?? '—'}
            </Text>
            <Text style={tw`text-[11px] text-[#7a4b12] dark:text-[#f5d0a5]`}>
              status: {String(sandboxDbgInfo.status ?? '—')}
            </Text>
            <Text style={tw`text-[11px] text-[#7a4b12] dark:text-[#f5d0a5]`}>
              items: {String(sandboxDbgInfo.count ?? '—')}
            </Text>
            <Text style={tw`text-[11px] text-[#7a4b12] dark:text-[#f5d0a5]`}>
              preview: {sandboxDbgInfo.preview ?? '—'}
            </Text>
          </View>
        ) : null}

        {unlockedAiErr && !unlockedAiLoading ? (
          <View style={tw`mt-2`}>
            <Text style={tw`text-xs text-red-600 dark:text-red-400`}>{unlockedAiErr}</Text>
          </View>
        ) : null}

        {unlockedAiLoading ? (
          <View style={tw`mt-3`}>
            {[0, 1].map((i) => (
              <View
                key={`ai-skeleton-${i}`}
                style={tw`rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 mb-3 overflow-hidden`}
              >
                <View style={tw`h-36 bg-[#e7edf4] dark:bg-[#172534]`} />
                <View style={tw`p-3`}>
                  <View style={tw`h-3 w-2/3 bg-[#e7edf4] dark:bg-[#172534] rounded`} />
                  <View style={tw`h-2 w-1/3 bg-[#e7edf4] dark:bg-[#172534] rounded mt-2`} />
                </View>
              </View>
            ))}
          </View>
        ) : unlockedAi.length === 0 ? (
          <Text style={tw`mt-2 text-xs text-[#49739c] dark:text-white/70`}>
            Unlock any AI Sandbox course and it will live here forever — ready to continue anytime.
          </Text>
        ) : (
          <FlatList
            data={unlockedAi}
            keyExtractor={(item) => String(item?.id ?? Math.random())}
            renderItem={renderUnlockedCard as any}
            scrollEnabled={false}
            contentContainerStyle={tw`mt-3 pb-1`}
            onViewableItemsChanged={onUnlockedViewableItemsChanged}
            viewabilityConfig={{ itemVisiblePercentThreshold: 40 }}
          />
        )}
      </View>

      {/* Top Courses */}
      <View style={tw`mt-4`}>
        <View style={tw`flex-row items-center justify-between`}>
          <Text style={tw`text-base font-bold text-slate-900 dark:text-white`}>🔥 Top Courses</Text>
          <View style={tw`flex-row items-center`}>
            <Text style={tw`text-xs text-[#49739c] dark:text-white/70 mr-3`}>
              {topCoursesLoading
                ? 'Loading…'
                : `${topCourses.length} course${topCourses.length === 1 ? '' : 's'}`}
            </Text>
            <Pressable onPress={() => setTopCoursesExpanded((prev) => !prev)}>
              <Text style={tw`text-xs underline text-[#49739c] dark:text-white/70`}>
                {topCoursesExpanded ? 'Show less' : 'Show more'}
              </Text>
            </Pressable>
          </View>
        </View>

        {!!topCoursesError && !topCoursesLoading && (
          <View style={tw`mt-2`}>
            <Text style={tw`text-xs text-red-600 dark:text-red-400`}>{topCoursesError}</Text>
          </View>
        )}

        {topCoursesExpanded && (
          <View style={tw`mt-3`}>
            {topCoursesLoading ? (
              <>
                {Array.from({ length: topCoursesPageSize }).map((_, i) => (
                  <View
                    key={`top-skel-${i}`}
                    style={tw`rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 mb-3 overflow-hidden`}
                  >
                    <View style={tw`h-36 bg-[#e7edf4] dark:bg-[#172534]`} />
                    <View style={tw`p-3`}>
                      <View style={tw`h-3 w-2/3 bg-[#e7edf4] dark:bg-[#172534] rounded`} />
                      <View style={tw`h-2 w-1/3 bg-[#e7edf4] dark:bg-[#172534] rounded mt-2`} />
                    </View>
                  </View>
                ))}
              </>
            ) : topCourses.length === 0 ? (
              <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
                No top courses available right now.
              </Text>
            ) : (
              <View>
                {topCourses.map((item) => renderTopCourseCard(item))}
                {topCoursesTotalPages > 1 && (
                  <View style={tw`flex-row items-center justify-between mt-2`}>
                    <Pressable
                      onPress={() => setTopCoursesPage((prev) => Math.max(1, prev - 1))}
                      disabled={topCoursesPage <= 1}
                      style={tw.style(
                        'h-8 px-3 rounded-lg bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 items-center justify-center',
                        topCoursesPage <= 1 && 'opacity-50'
                      )}
                    >
                      <Text style={tw`text-xs text-slate-900 dark:text-white`}>Prev</Text>
                    </Pressable>
                    <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
                      Page {topCoursesPage} of {topCoursesTotalPages}
                    </Text>
                    <Pressable
                      onPress={() =>
                        setTopCoursesPage((prev) => Math.min(topCoursesTotalPages, prev + 1))
                      }
                      disabled={topCoursesPage >= topCoursesTotalPages}
                      style={tw.style(
                        'h-8 px-3 rounded-lg bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 items-center justify-center',
                        topCoursesPage >= topCoursesTotalPages && 'opacity-50'
                      )}
                    >
                      <Text style={tw`text-xs text-slate-900 dark:text-white`}>Next</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </View>

      {/* OER Books */}
      <View style={tw`mt-2`}>
        <Text style={tw`text-base font-bold text-slate-900 dark:text-white mb-2 px-0`}>
          My Free OER Books
        </Text>

        {oerLoading && (
          <View style={tw`py-2`}>
            <Text style={tw`text-sm text-[#49739c] dark:text-white/70`}>Loading books…</Text>
          </View>
        )}
        {!!oerError && !oerLoading && (
          <View style={tw`py-2`}>
            <Text style={tw`text-sm text-red-600 dark:text-red-400`}>
              Failed to load OER books.
            </Text>
          </View>
        )}
        {!oerLoading && !oerError && oerBooks.length === 0 && (
          <View style={tw`py-2`}>
            <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
              No OER books available.
            </Text>
          </View>
        )}

        {!oerLoading && !oerError && oerBooks.length > 0 && (
          <View style={tw`-mx-1 px-1`}>
            <View style={tw`flex-row flex-wrap`}>
              {oerBooks.map((c: any) => {
                const idOrSlug = String(c.slug ?? c.id);
                return (
                  <OerBookCard
                    key={idOrSlug}
                    book={c}
                    backendBase={backendUrl}
                    onReader={() => goOerReader(idOrSlug)}
                    onRobot={async () => {
                      try {
                        const res = await wrapBook(idOrSlug);
                        const courseId = String((res as any)?.courseId ?? '');
                        if (!courseId) throw new Error('Missing wrapped course id');
                        navigation.navigate('CourseProgress', { courseId });
                      } catch (e: any) {
                        Alert.alert('Error', e?.message || 'Failed to start book course');
                      }
                    }}
                  />
                );
              })}
            </View>
          </View>
        )}
      </View>

      {/* AI chips (server parsed) */}
      {courseMeta.aiUsed && courseMeta.parsed ? (
        <View style={tw`mt-2 flex-row flex-wrap`}>
          {(() => {
            const p: any = courseMeta.parsed;
            const chips = [
              p.subject ? `Subject: ${p.subject}` : null,
              p.gradeBand ? `Grade: ${p.gradeBand}` : null,
              p.level ? `Level: ${p.level}` : null,
              p.country ? `Country: ${p.country}` : null,
              p.duration ? `Duration: ${p.duration}` : null,
              p.tutor ? `Tutor: ${p.tutor}` : null,
              p.minRating ? `Rating: ${p.minRating}+` : null,
              p.isOer ? `Free/OER` : null,
              p.maxPrice > 0 ? `Under: $${p.maxPrice}` : null,
              p.sort ? `Sort: ${p.sort}` : null,
            ].filter(Boolean);

            return chips.map((c) => (
              <View
                key={String(c)}
                style={tw`mr-2 mb-2 px-3 py-1 rounded-full bg-[#e7edf4] dark:bg-[#172534] border border-[#cedbe8] dark:border-white/10`}
              >
                <Text style={tw`text-[11px] text-slate-700 dark:text-white/80`}>{String(c)}</Text>
              </View>
            ));
          })()}
        </View>
      ) : null}

      {/* ✅ Always visible when user opens Explore Courses tab */}
      <ExploreSearchFiltersBar
        query={courseQuery}
        onQueryChange={setCourseQuery}
        filters={courseFiltersState}
        onFiltersChange={handleCourseFiltersChange}
        onClearAll={clearAllCourses}
        variant="courses"
        placeholder="Search courses by subject, grade, country…"
        isDark={isDark}
      />

      {!!courseSearchError && (
        <View style={tw`mt-2`}>
          <Text style={tw`text-sm text-red-600 dark:text-red-400`}>Failed to load courses.</Text>
        </View>
      )}

      <View style={tw`h-[1px] bg-[#cedbe8] dark:bg-white/10 my-4`} />
    </View>
  );

  // ---------------- Certificate verification (mobile) ----------------
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyValue, setVerifyValue] = useState('');

  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value || '').trim()
    );

  const submitVerify = useCallback(
    (raw?: string) => {
      const v = String(raw ?? verifyValue ?? '').trim();

      // If empty -> open the verify screen (no request)
      if (!v) {
        setVerifyOpen(false);
        setVerifyValue('');
        navigation.navigate('VerifyCertificate' as any, {} as any);
        return;
      }

      // UUID -> use id
      if (isUuid(v)) {
        setVerifyOpen(false);
        setVerifyValue('');
        navigation.navigate('VerifyCertificate' as any, { id: v } as any);
        return;
      }

      // ✅ Certificate Number -> use certNo
      const certNo = v.replace(/\s+/g, '').toUpperCase();
      setVerifyOpen(false);
      setVerifyValue('');
      navigation.navigate('VerifyCertificate' as any, { certNo } as any);
    },
    [navigation, verifyValue]
  );

  const VerifyCertificateModal = (
    <Modal
      visible={verifyOpen}
      animationType="fade"
      transparent
      onRequestClose={() => setVerifyOpen(false)}
    >
      <View style={tw`flex-1 bg-black/40 items-center justify-center p-4`}>
        <View
          style={tw`w-full max-w-md rounded-2xl bg-white dark:bg-[#0f1821] p-4 border border-[#cedbe8] dark:border-white/10`}
        >
          <Text style={tw`text-lg font-bold text-slate-900 dark:text-white`}>
            Verify Certificate
          </Text>

          <Text style={tw`text-xs text-[#49739c] dark:text-white/70 mt-1 mb-3`}>
            Enter a Certificate Number (e.g. AB-12345678) or a Certificate ID (UUID).
          </Text>

          <TextInput
            value={verifyValue}
            onChangeText={setVerifyValue}
            placeholder="Certificate Number or ID"
            placeholderTextColor={isDark ? '#9fb3d1' : '#7a8aa0'}
            autoCapitalize="characters"
            autoCorrect={false}
            style={tw`w-full text-sm rounded-lg p-3 bg-[#e7edf4] dark:bg-[#172534] text-slate-900 dark:text-white`}
          />

          <View style={tw`flex-row justify-end gap-2 mt-4`}>
            <Pressable
              onPress={() => {
                setVerifyOpen(false);
                setVerifyValue('');
              }}
              style={tw`h-10 px-4 rounded-xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 items-center justify-center`}
            >
              <Text style={tw`text-sm text-slate-900 dark:text-white`}>Cancel</Text>
            </Pressable>

            <Pressable
              onPress={() => submitVerify()}
              style={tw`h-10 px-4 rounded-xl bg-[#3d99f5] items-center justify-center`}
            >
              <Text style={tw`text-sm text-white font-semibold`}>Verify</Text>
            </Pressable>
          </View>

          <Pressable onPress={() => submitVerify('')} style={tw`mt-3 self-start`}>
            <Text style={tw`text-xs text-[#49739c] dark:text-white/70 underline`}>
              Open verification page instead
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  /* ----------------------------- Render ----------------------------- */
  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`} edges={['top', 'bottom']}>
      <View style={tw`flex-1`}>
        {/* Header */}
        <View style={tw`px-4 pt-4 pb-2`}>
          <View style={tw`items-start mb-3`}>
            <Pressable
              onPress={() => setVerifyOpen(true)}
              style={tw.style(
                'flex-row items-center justify-center h-10 px-4 rounded-2xl bg-white dark:bg-[#0f1821]',
                {
                  borderWidth: 1,
                  borderColor: '#3d99f5',
                }
              )}
            >
              <View style={tw`flex-row items-center`}>
                <MaterialIcons name="lock" size={14} color="#3d99f5" />
                <View style={tw`w-2`} />
                <Text style={tw`text-[12px] font-semibold text-slate-900 dark:text-white`}>
                  Verify Certificate
                </Text>
              </View>
            </Pressable>
          </View>

          <Text style={tw`text-[28px] font-extrabold text-[#0d141c] dark:text-white`}>
            My Courses
          </Text>

          <Text style={tw`text-[#49739c] dark:text-white/70 text-xs mt-1`}>
            Access your learning library or discover structured courses to level up.
          </Text>
          <View style={tw`mt-3`}>{headerTabs}</View>
        </View>

        {tab === 'library' ? (
          <ScrollView
            style={tw`flex-1`}
            contentContainerStyle={[tw`px-4 pb-6`, { paddingBottom: (insets.bottom || 12) + 24 }]}
            showsVerticalScrollIndicator={false}
          >
            <ExploreSearchFiltersBar
              query={libraryQuery}
              onQueryChange={setLibraryQuery}
              filters={libraryFiltersState}
              onFiltersChange={handleLibraryFiltersChange}
              onClearAll={clearAllLibrary}
              variant="library"
              placeholder="Search videos, notes, subjects, countries…"
              isDark={isDark}
            />

            {showPurchasedLibrary && (
              <>
                <Text style={tw`text-base font-bold text-slate-900 dark:text-white mb-2 mt-3`}>
                  My Purchased &amp; Saved Videos
                </Text>

                <View style={tw`rounded-xl overflow-hidden mt-1`}>
                  {loadingVCols && purchasedVideos.length === 0 ? (
                    <View style={tw`py-4 items-center`}>
                      <ActivityIndicator color={isDark ? '#ffffff' : '#0d141c'} />
                      <Text style={tw`mt-2 text-xs text-[#49739c] dark:text-white/70`}>
                        Loading purchased videos…
                      </Text>
                    </View>
                  ) : purchasedVideos.length === 0 ? (
                    <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
                      No purchased videos yet.
                    </Text>
                  ) : (
                    <FlatList
                      data={purchasedVideos}
                      keyExtractor={(item) => String(item.id)}
                      renderItem={({ item }) => (
                        <UnifiedLibraryCard
                          item={item}
                          backendBase={backendUrl}
                          badge="PURCHASED"
                          onPress={() => goUnifiedItem(item)}
                        />
                      )}
                      showsVerticalScrollIndicator={false}
                      scrollEnabled={false}
                      contentContainerStyle={tw`pb-4`}
                    />
                  )}
                </View>
              </>
            )}

            {showFreeLibrary && (
              <View style={tw`mt-5`}>
                <Text style={tw`text-base font-bold text-slate-900 dark:text-white mb-2`}>
                  Free OER Video Collections
                </Text>

                {loadingVCols && freeOerCollections.length === 0 && (
                  <View style={tw`py-4 items-center`}>
                    <ActivityIndicator color={isDark ? '#ffffff' : '#0d141c'} />
                    <Text style={tw`mt-2 text-xs text-[#49739c] dark:text-white/70`}>
                      Loading collections…
                    </Text>
                  </View>
                )}

                {errVCols && !loadingVCols && (
                  <Text style={tw`py-2 text-xs text-red-500 dark:text-red-400`}>{errVCols}</Text>
                )}

                {!loadingVCols &&
                  !errVCols &&
                  (freeOerCollections.length === 0 ? (
                    <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
                      No free OER video collections yet.
                    </Text>
                  ) : (
                    <FlatList
                      data={freeOerCollections}
                      keyExtractor={(item) => String(item.id)}
                      renderItem={({ item }) => (
                        <UnifiedLibraryCard
                          item={item}
                          backendBase={backendUrl}
                          badge="COLLECTION"
                          onPress={() => goUnifiedItem(item)}
                        />
                      )}
                      showsVerticalScrollIndicator={false}
                      scrollEnabled={false}
                      contentContainerStyle={tw`pb-4`}
                    />
                  ))}
              </View>
            )}

            {showFreeLibrary && (
              <View style={tw`mt-5`}>
                <Text style={tw`text-base font-bold text-slate-900 dark:text-white mb-2`}>
                  Free OER Videos
                </Text>

                {loadingVCols && freeOerVideos.length === 0 && (
                  <View style={tw`py-4 items-center`}>
                    <ActivityIndicator color={isDark ? '#ffffff' : '#0d141c'} />
                    <Text style={tw`mt-2 text-xs text-[#49739c] dark:text-white/70`}>
                      Loading videos…
                    </Text>
                  </View>
                )}

                {!loadingVCols && freeOerVideos.length === 0 ? (
                  <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
                    No free OER videos yet.
                  </Text>
                ) : (
                  <FlatList
                    data={freeOerVideos}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={({ item }) => (
                      <UnifiedLibraryCard
                        item={item}
                        backendBase={backendUrl}
                        badge="VIDEO"
                        onPress={() => goUnifiedItem(item)}
                      />
                    )}
                    showsVerticalScrollIndicator={false}
                    scrollEnabled={false}
                    contentContainerStyle={tw`pb-4`}
                  />
                )}
              </View>
            )}
          </ScrollView>
        ) : (
          <View style={tw`flex-1`}>
            {courseSearchLoading ? (
              <FlatList
                data={[]}
                ListHeaderComponent={
                  <View style={tw`px-4`}>
                    {CoursesListHeader}
                    <View style={tw`py-2 items-center`}>
                      <ActivityIndicator color={isDark ? '#ffffff' : '#0d141c'} />
                      <Text style={tw`mt-2 text-sm text-[#49739c] dark:text-white/70`}>
                        Loading courses…
                      </Text>
                    </View>
                  </View>
                }
                renderItem={null as any}
                keyExtractor={() => 'x'}
                contentContainerStyle={[tw`pb-6`, { paddingBottom: (insets.bottom || 12) + 24 }]}
              />
            ) : displayRows.length === 0 ? (
              <FlatList
                data={[]}
                ListHeaderComponent={
                  <View style={tw`px-4`}>
                    {CoursesListHeader}
                    <Text style={tw`text-sm text-[#49739c] dark:text-white/70 text-center mb-4`}>
                      No courses match your filters.
                    </Text>
                  </View>
                }
                renderItem={null as any}
                keyExtractor={() => 'x'}
                contentContainerStyle={[tw`pb-6`, { paddingBottom: (insets.bottom || 12) + 24 }]}
              />
            ) : (
              <FlatList
                data={displayRows as any}
                keyExtractor={(item) => String((item as any).id)}
                renderItem={renderCourseCard as any}
                contentContainerStyle={[
                  tw`pb-6 px-4`,
                  { paddingBottom: (insets.bottom || 12) + 24 },
                ]}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={{ itemVisiblePercentThreshold: 40 }}
                ListHeaderComponent={<View>{CoursesListHeader}</View>}
                ListHeaderComponentStyle={tw`px-0`}
              />
            )}
          </View>
        )}

        {/* Verify certificate modal */}
        {VerifyCertificateModal}

        {/* Review modal */}
        {openReview && (
          <View style={tw`absolute inset-0 bg-black/40 items-center justify-center p-4`}>
            <View
              style={tw`w-full max-w-md rounded-2xl bg-white dark:bg-[#0f1821] p-4 border border-[#cedbe8] dark:border-white/10`}
            >
              <Text style={tw`text-lg font-bold mb-1 text-slate-900 dark:text-white`}>
                Rate this course
              </Text>
              <Text style={tw`text-sm text-[#49739c] dark:text-white/70 mb-3`}>
                {openReview.title}
              </Text>

              <View style={tw`flex-row items-center gap-2 mb-3`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} onPress={() => setReviewRating(n)}>
                    <Text
                      style={
                        n <= reviewRating
                          ? tw`text-yellow-500 text-2xl`
                          : tw`text-[#49739c] dark:text-white/60 text-2xl`
                      }
                    >
                      ★
                    </Text>
                  </Pressable>
                ))}
              </View>

              <TextInput
                value={reviewComment}
                onChangeText={setReviewComment}
                placeholder="Optional comment (max 500 chars)"
                maxLength={500}
                multiline
                style={tw`w-full text-sm rounded-lg p-2 bg-[#e7edf4] dark:bg-[#172534] text-slate-900 dark:text-white min-h-[90px]`}
                placeholderTextColor={isDark ? '#9fb3d1' : '#7a8aa0'}
              />

              <View style={tw`mt-4 flex-row items-center gap-2 justify-end`}>
                <Pressable
                  onPress={() => setOpenReview(null)}
                  style={tw`h-10 px-4 rounded-xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 items-center justify-center`}
                >
                  <Text style={tw`text-sm text-slate-900 dark:text-white`}>Cancel</Text>
                </Pressable>

                <Pressable
                  disabled={posting || reviewRating < 1}
                  onPress={async () => {
                    if (!openReview || reviewRating < 1) return;
                    setPosting(true);
                    try {
                      const res = await fetch(`${backendUrl}/api/reviews/courses/${openReview.id}`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                        body: JSON.stringify({ rating: reviewRating, comment: reviewComment }),
                      });
                      if (!res.ok)
                        throw new Error(
                          (await res.text().catch(() => '')) || 'Failed to submit review'
                        );
                      await fetchCourseRatings(openReview.id);
                      setOpenReview(null);
                    } catch (e: any) {
                      Alert.alert('Error', e?.message || 'Failed to submit review');
                    } finally {
                      setPosting(false);
                    }
                  }}
                  style={tw.style(
                    'px-4 h-10 rounded-xl items-center justify-center bg-[#3d99f5]',
                    (posting || reviewRating < 1) && 'opacity-60'
                  )}
                >
                  <Text style={tw`text-white text-sm font-semibold`}>
                    {posting ? 'Saving…' : 'Submit'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

export default MyCoursesNative;
