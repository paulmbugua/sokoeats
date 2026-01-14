/* eslint-disable no-console */
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import debounce from 'lodash.debounce';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import { useEnrollments, useOerCourses, useWrapOerBook, useTopCourses } from '@mytutorapp/shared/hooks';
import { downloadCertificateFile } from '@mytutorapp/shared/api/certificatesApi';
import { generateCertificatePdf } from '@mytutorapp/shared/api/aiCertificatesApi';
import { fetchCourseProgress } from '@mytutorapp/shared/api/courseProgressApi';
import { getRequiredQuestions, getRequiredWeeks } from '@mytutorapp/shared/utils/programTrackRequirements';
import type { Course, ProgramTrack } from '@mytutorapp/shared/types';
import ClassVaultList from '../components/ClassVaultList.web';
import CourseHero from '../components/CourseHero';
import useCourseSearch from '@mytutorapp/shared/hooks/useCourseSearch';

/* ─────────────────────────────────────────────────────────
  Tabs
────────────────────────────────────────────────────────── */
type TabKey = 'library' | 'courses';

/* ------------------------- Debug loggers ------------------------- */
const DEBUG_TUTORS = false;
const dlog = (...args: any[]) =>
  DEBUG_TUTORS && console.log('%c[MyCourses][Tutor]', 'color:#3d99f5;font-weight:bold;', ...args);

const DEBUG_OER = false;
const olog = (...args: any[]) =>
  DEBUG_OER && console.log('%c[MyCourses][OER]', 'color:#9b59b6;font-weight:bold;', ...args);

type TrackRequirements = {
  key: ProgramTrack;
  label: string;
  minLessons: number;
  minQuestions: number;
};

const normalizeTrackKey = (track?: ProgramTrack | string | null): ProgramTrack => {
  const raw = String(track || '').trim().toLowerCase();

  // ✅ allow new public-facing names (if they ever appear in data/URL/localStorage)
  if (raw === 'professional') return 'diploma';
  if (raw === 'comprehensive') return 'degree';

  if (raw === 'diploma' || raw === 'degree' || raw === 'certificate') return raw as ProgramTrack;
  return 'certificate';
};

const getTrackLabel = (track?: ProgramTrack | string | null): string => {
  const key = normalizeTrackKey(track);

  if (key === 'diploma') return 'Professional';     // ✅ was Diploma
  if (key === 'degree') return 'Comprehensive';     // ✅ was Degree
  return 'Certificate';
};

const getTrackRequirements = (track?: ProgramTrack | string | null): TrackRequirements => {
  const key = normalizeTrackKey(track);
  return {
    key,
    label: getTrackLabel(key),
    minLessons: getRequiredWeeks(key),
    minQuestions: getRequiredQuestions(key),
  };
};


/* --------------------- OER types --------------------- */
type OerKind = 'video' | 'doc';
type OerCollection = {
  id: string | number;
  title: string;
  description?: string;
  subject?: string;
  thumbnail_url?: string;
  cover_url?: string | null;
  items_count?: number;
  created_at?: string;
  content_kind?: OerKind | string | null;
  provider?: string;
  collection_type?: string;
  slug?: string;
  [k: string]: any;
};

/* --------------------- Route helpers --------------------- */
const sanitizeId = (routeId?: string): string => {
  let s = routeId ?? '';
  try {
    s = decodeURIComponent(s);
  } catch {}
  if (s.startsWith(':id')) s = s.slice(3);
  if (s.startsWith(':')) s = s.slice(1);
  return s;
};

const OER_READER_ROUTE_BASE = '/oer/collections';
const getOerReaderPath = (c: { id?: string | number; slug?: string }) =>
  `${OER_READER_ROUTE_BASE}/${encodeURIComponent(String(c.slug ?? c.id))}`;

/* --------------------- HTTP helpers --------------------- */
const makeApiUrl = (base: string) => (path: string) => {
  const b = (base || '').replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  const baseHasApi = /\/api$/.test(b);
  const pathHasApi = /^\/api(\/|$)/.test(p);
  if (baseHasApi && pathHasApi) return b + p.replace(/^\/api/, '');
  if (!baseHasApi && !pathHasApi) return `${b}/api${p}`;
  return b + p;
};

const norm = (v: any) =>
  String(v ?? '')
    .trim()
    .toLowerCase();

const isOerVideoCollectionStrict = (c: OerCollection): boolean => {
  const kind = norm(c.content_kind);
  if (kind === 'video' || kind === 'videos') return true;

  const ctype = norm(c.collection_type);
  if (ctype.includes('video') || ctype.includes('playlist')) return true;

  const title = norm(c.title);
  if (/\b(video|playlist|lecture|record(ed)?|stream)\b/.test(title)) return true;

  return false;
};

const isOpenStaxDoc = (c: OerCollection): boolean => {
  const prov = norm(c.provider);
  const slug = norm(c.slug);
  const title = norm(c.title);
  return prov.includes('openstax') || slug.includes('openstax') || title.includes('openstax');
};

const isDocKind = (c: OerCollection): boolean => {
  const kind = norm(c.content_kind);
  return kind === 'doc' || kind === 'docs';
};

/* --------------------- Tutor helpers --------------------- */
function coerceObj<T = any>(v: unknown): T | undefined {
  if (!v) return undefined;
  if (typeof v === 'object') return v as T;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s.startsWith('{') && s.endsWith('}')) {
      try {
        return JSON.parse(s) as T;
      } catch {}
    }
  }
  return undefined;
}

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

function isOerCourse(c: any): boolean {
  const s = (x: any) => String(x || '').toLowerCase();
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
  const role = String(
    c?.uploader_role || c?.created_by_role || c?.owner_role || c?.creatorRole || ''
  ).toLowerCase();
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

function toArray<T = any>(val: any): T[] {
  if (Array.isArray(val)) return val;
  if (val == null) return [];
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray((parsed as any)?.items)) return (parsed as any).items;
      if (Array.isArray((parsed as any)?.data)) return (parsed as any).data;
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

/* --------------------- Small UI bits --------------------- */
const CaretDown = ({ size = 20 }: { size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    fill="currentColor"
    viewBox="0 0 256 256"
  >
    <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" />
  </svg>
);

function StarRow({ avg, count }: { avg?: number; count?: number }) {
  const a = Math.round((avg ?? 0) * 2) / 2;
  const stars = [1, 2, 3, 4, 5].map((i) => (a >= i ? '★' : a + 0.5 === i ? '☆' : '☆')).join('');
  return (
    <span className="whitespace-nowrap" title={`${avg?.toFixed?.(1) ?? '0.0'} (${count ?? 0})`}>
      {stars} {avg ? avg.toFixed(1) : '—'} ({count ?? 0})
    </span>
  );
}

/* ─────────────────────────────────────────────────────────
  Component
────────────────────────────────────────────────────────── */
const MyCourses: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { backendUrl, token, profile } = useShopContext();
  const myId = String(profile?.id ?? '');

  const [tab, setTab] = useState<TabKey>('library');
  const [isNarrow, setIsNarrow] = useState(false);
  const [topCoursesPage, setTopCoursesPage] = useState(1);
  const [topCoursesExpanded, setTopCoursesExpanded] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 640px)');
    const onChange = () => setIsNarrow(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const topCoursesPageSize = isNarrow ? 6 : 9;
  useEffect(() => {
    setTopCoursesPage(1);
  }, [topCoursesPageSize]);

  /* ✅ NEW: Course search hook (this is where your "fix" goes) */
  const {
    courses: searchedCourses,
    loading: courseSearchLoading,
    handleSearch: handleCourseSearch,
    uiFilters: courseFilters,
    setSubjectFilter: setCourseSubject,
    setGradeBandFilter: setCourseGradeBand,
    setLevelFilter: setCourseLevel,
    setMinRatingFilter: setCourseMinRating,
    setMaxPriceFilter: setCourseMaxPrice,
    setIsOerFilter: setCourseIsOer,
    clearFilters: clearCourseFilters,
    searchMeta: courseSearchMeta,
  } = useCourseSearch({ backendUrl });

  /* Enrollments */
  const { enrollments, fetchMine } = useEnrollments({
    backendUrl,
    token: token ?? '',
    studentId: 'me' as unknown as string | number,
  });

  useEffect(() => {
    if (token) void fetchMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /* Search box (debounced) */
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useRef(
    debounce((q: string) => {
      try {
        handleCourseSearch(q);
      } catch {}
    }, 250)
  );

  useEffect(() => {
    return () => debouncedSearch.current.cancel();
  }, []);

  useEffect(() => {
    // initial load for Courses tab (also safe to pre-load even if user starts in Library)
    try {
      setCourseIsOer(false); // we want tutor-made courses in this page’s catalog
      handleCourseSearch('');
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl]);

  useEffect(() => {
    debouncedSearch.current(searchText);
  }, [searchText]);

  /* Extra local-only filter (your hook doesn’t expose duration) */
  const [duration, setDuration] = useState('');

  const enrolledCourseIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of enrollments as any[]) {
      const cid = String(e?.course_id ?? e?.courseId ?? '');
      if (cid) set.add(cid);
    }
    return set;
  }, [enrollments]);

  const {
    items: topCourses,
    total: topCoursesTotal,
    hasMore: topCoursesHasMore,
    loading: topCoursesLoading,
    error: topCoursesError,
  } = useTopCourses({
    backendUrl,
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

  /* Tutor names cache */
  const [tutorNameById, setTutorNameById] = useState<Record<string, string>>({});

  const apiBase = useMemo(() => (backendUrl || '').replace(/\/+$/, ''), [backendUrl]);
  const api = useMemo(() => makeApiUrl(apiBase), [apiBase]);

  const [unlockedAi, setUnlockedAi] = useState<any[]>([]);
  const [unlockedAiLoading, setUnlockedAiLoading] = useState(false);
  const [unlockedAiErr, setUnlockedAiErr] = useState<string | null>(null);

  const [unlockedAiDbg, setUnlockedAiDbg] = useState<{
    ranAt?: string;
    url?: string;
    phase?: string;
    status?: number;
    preview?: string;
    error?: string;
    build?: string | null;
    debugDb?: { db?: string; addr?: string; port?: number | string } | null;
    resolved?: { userId?: number | null; authUuid?: string | null } | null;
    entitlementsCount?: number | null;
    entitlementsJoinTitles?: string[];
  }>({});

  const sandboxDbgEnabled = useMemo(() => {
    try {
      const sp = new URLSearchParams(location.search);
      if (sp.get('dbg') === '1') return true;
      return localStorage.getItem('DBG_SANDBOX_UNLOCK') === '1';
    } catch {
      return false;
    }
  }, [location.search]);

  const sdbg = useCallback(
    (...args: any[]) => {
      if (sandboxDbgEnabled) {
        console.log('%c[MyCourses][Sandbox]', 'color:#27ae60;font-weight:bold;', ...args);
      }
    },
    [sandboxDbgEnabled]
  );

  type SandboxStatus = {
    totalWeeks: number | null;
    completedWeeks: number | null;
    quizEligible: boolean;
    quizPassed: boolean;
    certificateReady: boolean;
    loading: boolean;
    error?: string;
  };

  const [sandboxStatusById, setSandboxStatusById] = useState<
    Record<string, SandboxStatus | undefined>
  >({});
  const [sandboxTrackById, setSandboxTrackById] = useState<Record<string, ProgramTrack>>({});
  const sandboxRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sandboxObserver = useRef<IntersectionObserver | null>(null);
  const sandboxInFlight = useRef<Set<string>>(new Set());


useEffect(() => {
  if (!backendUrl || !token) {
    setUnlockedAi([]);
    setUnlockedAiErr(null);
    setUnlockedAiLoading(false);
    if (sandboxDbgEnabled) {
      setUnlockedAiDbg({
        ranAt: new Date().toISOString(),
        phase: 'SKIP',
        error: `backendUrl=${!!backendUrl}, token=${!!token}`,
      });
    }
    return;
  }

  let cancelled = false;

  (async () => {
    setUnlockedAiLoading(true);
    setUnlockedAiErr(null);

    const url = api('/courses/mine/unlocked-ai');
    if (sandboxDbgEnabled) {
      setUnlockedAiDbg({
        ranAt: new Date().toISOString(),
        url,
        phase: 'REQUEST',
      });
    }

    try {
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const text = await r.clone().text().catch(() => '');
      const buildHeader = r.headers.get('x-unlocked-ai-build');
      if (sandboxDbgEnabled) {
        setUnlockedAiDbg({
          ranAt: new Date().toISOString(),
          url,
          phase: 'RESPONSE',
          status: r.status,
          preview: text.slice(0, 400),
          build: buildHeader,
        });
      }

      if (!r.ok) throw new Error(text || `HTTP ${r.status}`);

      const j = await r.json().catch(() => ({}));
      const items = Array.isArray((j as any)?.items) ? (j as any).items : toArray<any>(j);

      if (sandboxDbgEnabled) {
        const debug = (j as any)?.debug;
        const entSample = Array.isArray(debug?.entitlementsJoinSample)
          ? debug.entitlementsJoinSample
          : [];
        const entTitles = entSample
          .map((row: any) => row?.title)
          .filter((title: any) => typeof title === 'string' && title.trim().length > 0);
        setUnlockedAiDbg((prev) => ({
          ...prev,
          build: buildHeader ?? prev.build ?? null,
          debugDb: debug?.db ?? null,
          resolved: debug?.resolved
            ? { userId: debug.resolved.userId, authUuid: debug.resolved.authUuid }
            : null,
          entitlementsCount:
            typeof debug?.entitlementsCount === 'number' ? debug.entitlementsCount : null,
          entitlementsJoinTitles: entTitles,
        }));
      }

      if (!cancelled) setUnlockedAi(items);
    } catch (e: any) {
      const msg = e?.message || String(e) || 'Failed to load';
      if (!cancelled) setUnlockedAiErr(msg);
      if (sandboxDbgEnabled) {
        setUnlockedAiDbg((prev) => ({
          ...prev,
          ranAt: new Date().toISOString(),
          phase: 'ERROR',
          error: msg,
        }));
      }
    } finally {
      if (!cancelled) setUnlockedAiLoading(false);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [api, token, backendUrl, sandboxDbgEnabled]);

 const resolveCourseTrack = useCallback((course: any): ProgramTrack | undefined => {
  const raw =
    course?.programTrack ??
    course?.program_track ??
    course?.track ??
    course?.track_key ??
    course?.program_track_key;

  const lc = String(raw || '').trim().toLowerCase();
  if (['certificate', 'diploma', 'degree', 'professional', 'comprehensive'].includes(lc)) {
    return normalizeTrackKey(lc);
  }
  return undefined;
}, []);

  const openCertificateVerify = useCallback(() => {
  if (typeof window === 'undefined') return;

  const raw =
    window.prompt(
      'Enter Certificate Number (e.g. AB-12345678) or Certificate ID (UUID):'
    ) || '';

  const value = raw.trim();
  if (!value) {
    navigate('/verify');
    return;
  }

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  if (isUuid) {
    navigate(`/verify/${encodeURIComponent(value)}`);
    return;
  }

  // Treat anything else as a certificate number
  const certNo = value.replace(/\s+/g, '').toUpperCase();
  navigate(`/verify/no/${encodeURIComponent(certNo)}`);
}, [navigate]);


 const getStoredTrack = useCallback((courseId: string): ProgramTrack | null => {
  try {
    const v = localStorage.getItem(`sandbox_track:${courseId}`);
    const lc = String(v || '').trim().toLowerCase();
    if (['certificate', 'diploma', 'degree', 'professional', 'comprehensive'].includes(lc)) {
      return normalizeTrackKey(lc);
    }
  } catch {}
  return null;
}, []);

  const persistTrack = useCallback((courseId: string, track: ProgramTrack) => {
    try {
      localStorage.setItem(`sandbox_track:${courseId}`, track);
    } catch {}
  }, []);

  useEffect(() => {
    if (!unlockedAi.length) return;
    setSandboxTrackById((prev) => {
      const next = { ...prev };
      unlockedAi.forEach((c: any) => {
        const cid = String(c.id ?? '');
        if (!cid || next[cid]) return;
        const stored = getStoredTrack(cid);
        const fromCourse = resolveCourseTrack(c);
        next[cid] = stored ?? fromCourse ?? 'certificate';
      });
      return next;
    });
  }, [unlockedAi, getStoredTrack, resolveCourseTrack]);

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

 const ensureSandboxStatus = useCallback(
  async (course: any, track: ProgramTrack | undefined) => {
    const cid = String(course?.id ?? '');
    if (!cid || !backendUrl || !token) return;

    // ✅ prevent re-entrant calls (IntersectionObserver can fire repeatedly)
    if (sandboxInFlight.current.has(cid)) return;
    sandboxInFlight.current.add(cid);

    // set loading state immediately
    setSandboxStatusById((prev) => ({
      ...prev,
      [cid]: {
        totalWeeks: prev[cid]?.totalWeeks ?? null,
        completedWeeks: prev[cid]?.completedWeeks ?? null,
        quizEligible: prev[cid]?.quizEligible ?? false,
        quizPassed: prev[cid]?.quizPassed ?? false,
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

      const progress = await fetchCourseProgress(backendUrl, cid, token);
      const completedWeeks = progress.filter((p) => p.status === 'Completed').length;

      const progressMaxWeek = progress.reduce(
        (acc, p) => (Number(p.week) > acc ? Number(p.week) : acc),
        0
      );
      if (!totalWeeks && progressMaxWeek > 0) totalWeeks = progressMaxWeek;

      const certRes = await fetch(
        api(`/certificates/status?courseId=${encodeURIComponent(cid)}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const certJson = certRes.ok ? await certRes.json().catch(() => ({})) : {};
      const quizPassed = Boolean(certJson?.canCertificate || certJson?.hasCertificate);
      const certificateReady = Boolean(certJson?.hasCertificate);

      const quizEligible =
        typeof totalWeeks === 'number' && totalWeeks > 0 ? completedWeeks >= totalWeeks : false;

      sdbg('status', {
        courseId: cid,
        track,
        totalWeeks,
        completedWeeks,
        quizEligible,
        quizPassed,
        certificateReady,
      });

      setSandboxStatusById((prev) => ({
        ...prev,
        [cid]: {
          totalWeeks: totalWeeks ?? null,
          completedWeeks,
          quizEligible,
          quizPassed,
          certificateReady,
          loading: false,
          error: undefined,
        },
      }));
    } catch (e: any) {
      setSandboxStatusById((prev) => ({
        ...prev,
        [cid]: {
          totalWeeks: prev[cid]?.totalWeeks ?? null,
          completedWeeks: prev[cid]?.completedWeeks ?? null,
          quizEligible: prev[cid]?.quizEligible ?? false,
          quizPassed: prev[cid]?.quizPassed ?? false,
          certificateReady: prev[cid]?.certificateReady ?? false,
          loading: false,
          error: e?.message || 'Failed to load status',
        },
      }));
    } finally {
      // ✅ always release lock
      sandboxInFlight.current.delete(cid);
    }
  },
  [api, backendUrl, token, extractWeeksCount, sdbg]
);

  useEffect(() => {
    if (!unlockedAi.length) return;
    if (sandboxObserver.current) sandboxObserver.current.disconnect();

    sandboxObserver.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = (entry.target as HTMLElement).dataset.courseId;
          if (!id) return;
          const course = unlockedAi.find((c: any) => String(c.id) === id);
          if (!course) return;
          const track = sandboxTrackById[id];
          const existing = sandboxStatusById[id];
          if (existing?.loading) return;
          if (!existing || existing.error) {
            void ensureSandboxStatus(course, track);
          }
        });
      },
      { rootMargin: '200px 0px' }
    );

    unlockedAi.forEach((c: any) => {
      const cid = String(c.id ?? '');
      const el = sandboxRefs.current[cid];
      if (cid && el) sandboxObserver.current?.observe(el);
    });

    return () => {
      sandboxObserver.current?.disconnect();
    };
  }, [unlockedAi, sandboxTrackById, sandboxStatusById, ensureSandboxStatus]);


  const fetchTutorNamesByUserIds = useCallback(
    async (ids: string[]): Promise<Record<string, string>> => {
      if (!ids.length) return {};
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const tryGET = async (path: string) => {
        const url = api(path);
        const res = await fetch(url, { headers });
        let preview = '';
        try {
          preview = (await res.clone().text()).slice(0, 200);
        } catch {}
        dlog('HTTP', res.status, url, 'preview:', preview);
        if (!res.ok) return null;
        try {
          return await res.json();
        } catch {
          return null;
        }
      };

      const out: Record<string, string> = {};
      const join = encodeURIComponent(ids.join(','));

      // NOTE: makeApiUrl already injects /api, so path should be "/profile..."
      const j = await tryGET(`/profile?userIds=${join}`);

      const pickIdLocal = (it: any) =>
        String(it?.user_id ?? it?.userId ?? it?.user ?? it?.id ?? '');
      const pickNameLocal = (it: any) =>
        it?.name ?? it?.fullName ?? it?.displayName ?? it?.username ?? '—';

      const add = (it: any) => {
        const id = pickIdLocal(it);
        const name = pickNameLocal(it);
        if (id && name && name !== '—') out[id] = name;
      };

      if (Array.isArray(j)) j.forEach(add);
      else if (j && typeof j === 'object') {
        const arr =
          (j as any).profiles ??
          (j as any).items ??
          (j as any).data ??
          (j as any).results ??
          (j as any).rows;
        if (Array.isArray(arr)) arr.forEach(add);
        else for (const v of Object.values(j)) if (v && typeof v === 'object') add(v);
      }

      return out;
    },
    [api, token]
  );

  const resolveTutorName = useCallback(
    (c: any): string | undefined => {
      const rawInfo = getTutorInfo(c);
      const userId = getTutorUserId(c) ?? (rawInfo.id != null ? String(rawInfo.id) : '');
      const name = userId && tutorNameById[userId] ? tutorNameById[userId] : rawInfo.name;
      return name && name !== '—' ? name : undefined;
    },
    [tutorNameById]
  );

  /* ✅ Catalog list now comes from searchedCourses (NOT useCourses) */
  const filteredRows = useMemo(() => {
    const rows = (searchedCourses ?? []) as any[];

    return rows
      .filter((c) => !isOerCourse(c) && wasUploadedByTutor(c)) // safety
      .filter((c) => {
        const cDuration = String(c.duration ?? '').toLowerCase();
        const okDuration = duration ? cDuration.includes(duration.toLowerCase()) : true;
        return okDuration;
      });
  }, [searchedCourses, duration]);

  const tutorUserIdsInCourses = useMemo(() => {
    const set = new Set<string>();
    (filteredRows as any[]).forEach((c) => {
      const id = getTutorUserId(c);
      if (id) set.add(id);
    });
    return Array.from(set);
  }, [filteredRows]);

  useEffect(() => {
    // seed from embedded user objects
    const seed: Record<string, string> = {};
    (filteredRows as any[]).forEach((c) => {
      const u = coerceObj<{ id?: string | number; name?: string }>((c as any).user);
      const id = u?.id != null ? String(u.id) : '';
      if (id && typeof u?.name === 'string' && !tutorNameById[id]) seed[id] = u.name;
    });
    if (Object.keys(seed).length) setTutorNameById((prev) => ({ ...prev, ...seed }));
  }, [filteredRows, tutorNameById]);

  const missingTutorUserIds = useMemo(
    () => tutorUserIdsInCourses.filter((id) => !tutorNameById[id]),
    [tutorUserIdsInCourses, tutorNameById]
  );

  useEffect(() => {
    if (!missingTutorUserIds.length) return;
    let cancelled = false;
    (async () => {
      try {
        const map = await fetchTutorNamesByUserIds(missingTutorUserIds);
        if (!cancelled && Object.keys(map).length)
          setTutorNameById((prev) => ({ ...prev, ...map }));
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [missingTutorUserIds, fetchTutorNamesByUserIds]);

  const displayRows = useMemo(
    () => filteredRows.filter((c) => !!resolveTutorName(c)),
    [filteredRows, resolveTutorName]
  );

  /* Ratings */
  const [ratings, setRatings] = useState<
    Record<string, { avg: number; count: number; my: boolean }>
  >({});
  const [openReview, setOpenReview] = useState<{ id: string; title: string } | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [posting, setPosting] = useState(false);

  const itemRefs = useRef<Record<string, HTMLElement | null>>({});
  const [_, setTick] = useState(0);

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
      } catch {}
    },
    [backendUrl, myId]
  );

  const debouncedFetchCourseRatings = useRef(
    debounce((courseId: string, cb?: () => void) => {
      void fetchCourseRatings(courseId).finally(() => cb?.());
    }, 200)
  );

  useEffect(() => () => debouncedFetchCourseRatings.current.cancel(), []);

  useEffect(() => {
    setTick((t) => t + 1);
  }, [displayRows]);

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const id = (e.target as HTMLElement).dataset.courseId;
            if (id && !ratings[id]) debouncedFetchCourseRatings.current(id);
          }
        });
      },
      { rootMargin: '120px' }
    );
    displayRows.forEach((c: any) => {
      const id = String(c.id);
      const el = itemRefs.current[id];
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [displayRows, ratings]);

  const prefetchOnHover = useCallback(
    (cid: string) => {
      if (!ratings[cid]) debouncedFetchCourseRatings.current(cid);
    },
    [ratings]
  );

  /* OER: API (collections & books) */
  const { courses: oerCourses = [], loading: oerLoading, error: oerError } = useOerCourses();
  const { wrapBook } = useWrapOerBook();

  useEffect(() => {
    olog('hook state changed', {
      loading: oerLoading,
      error: oerError,
      total: (oerCourses as any[]).length,
      sample: (oerCourses as any[])[0],
    });
  }, [oerLoading, oerError, oerCourses]);

  const oerBooks = useMemo(
    () => (oerCourses as any[]).filter((c) => c?.kind === 'book'),
    [oerCourses]
  );



  /* Fetch OER video collections */
  const [oerVideoCols, setOerVideoCols] = useState<OerCollection[]>([]);
  const [loadingVCols, setLoadingVCols] = useState(false);
  const [errVCols, setErrVCols] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    (async () => {
      if (!apiBase) return;
      setLoadingVCols(true);
      setErrVCols(null);
      try {
        let r = await fetch(api('/oer/collections?kind=video&limit=48'));
        let arr = r.ok ? toArray<OerCollection>(await r.json().catch(() => [])) : [];
        if (arr.length === 0) {
          r = await fetch(api('/oer/collections?kind=videos&limit=48'));
          if (r.ok) arr = toArray<OerCollection>(await r.json().catch(() => []));
        }
        if (arr.length === 0) {
          r = await fetch(api('/oer/collections?limit=48'));
          if (r.ok) {
            const all = toArray<OerCollection>(await r.json().catch(() => []));
            arr = all.filter(
              (c) => isOerVideoCollectionStrict(c) && !isDocKind(c) && !isOpenStaxDoc(c)
            );
          }
        }
        const cleaned = arr.filter(
          (c) => isOerVideoCollectionStrict(c) && !isDocKind(c) && !isOpenStaxDoc(c)
        );
        if (!aborted) setOerVideoCols(cleaned);
      } catch (e: any) {
        if (!aborted) setErrVCols(String(e?.message || e) || 'Failed to fetch');
      } finally {
        if (!aborted) setLoadingVCols(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [api, apiBase, apiBase]);

  /* UI consts */
  const TAB_BTN_BASE =
    'group relative inline-flex items-center justify-center h-11 sm:h-12 px-4 sm:px-6 rounded-xl ' +
    'font-bold text-sm sm:text-base tracking-wide transition-all ' +
    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#3d99f5]/60 ' +
    'focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-[#0a0f15]';

  const courseSearchError =
    (courseSearchMeta as any)?.error ||
    (courseSearchMeta as any)?.err ||
    (courseSearchMeta as any)?.message ||
    null;

  return (
    <div
      className="relative min-h-screen flex flex-col bg-slate-50 dark:bg-darkBg text-[#0d141c] dark:text-darkTextPrimary overflow-x-hidden"
      style={{ fontFamily: `Manrope, "Noto Sans", sans-serif` }}
    >
      <main className="flex-1 flex justify-center py-6 px-3 sm:px-4 lg:px-10">
        <div className="flex flex-col w-full max-w-[1200px]">
          {/* Header + tabs */}
          <section className="px-1 sm:px-0">
             <div className="flex justify-center mb-3">
              <button
                onClick={openCertificateVerify}
                className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-2xl
                           bg-white/90 dark:bg-[#0b1420]/90
                           ring-2 ring-[#3d99f5]/70 hover:ring-[#3d99f5]
                           shadow-lg backdrop-blur
                           text-sm font-bold tracking-wide
                           focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#3d99f5]/50
                           focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-[#0a0f15]"
                    title="Verify a certificate by number or ID"
                  aria-label="Verify Certificate (Number or ID)"

              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
                  <path d="M12 2a5 5 0 0 0-5 5v1H6a2 2 0 0 0-2 2v9a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-9a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 6V7a3 3 0 1 1 6 0v1H9Zm7.3 5.3-4.2 4.2a1 1 0 0 1-1.4 0l-2-2a1 1 0 1 1 1.4-1.4l1.3 1.3 3.5-3.5a1 1 0 0 1 1.4 1.4Z" />
                </svg>
                Verify Certificate
              </button>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex min-w-60 sm:min-w-72 flex-col gap-1">
                <h1 className="text-[24px] sm:text-[28px] md:text-[32px] font-bold leading-tight">
                  My Courses
                </h1>
                <p className="text-[#49739c] dark:text-darkTextSecondary text-xs sm:text-sm">
                  Access your learning library or discover structured courses to level up.
                </p>
              </div>
            


              <div
                role="tablist"
                aria-label="Explore content"
                className="inline-flex items-center rounded-2xl p-1.5 bg-white/80 dark:bg-[#0b1420]/80 ring-2 ring-[#3d99f5] dark:ring-[#3d99f5]/90 shadow-xl backdrop-blur supports-[backdrop-filter]:backdrop-blur"
              >
                <button
                  role="tab"
                  aria-selected={tab === 'library'}
                  aria-pressed={tab === 'library'}
                  onClick={() => setTab('library')}
                  title="Explore Videos & Notes"
                  className={[
                    TAB_BTN_BASE,
                    tab === 'library'
                      ? 'bg-[#3d99f5] text-white shadow-lg ring-1 ring-[#3d99f5]'
                      : 'bg-transparent text-[#0d141c] dark:text-darkTextPrimary ring-1 ring-[#3d99f5]/60 hover:bg-[#e7edf4]/80 dark:hover:bg:white/5',
                  ].join(' ')}
                >
                  Explore Videos &amp; Notes
                </button>

                <button
                  role="tab"
                  aria-selected={tab === 'courses'}
                  aria-pressed={tab === 'courses'}
                  onClick={() => setTab('courses')}
                  title="Explore Courses"
                  className={[
                    TAB_BTN_BASE,
                    'ml-1.5',
                    tab === 'courses'
                      ? 'bg-[#3d99f5] text-white shadow-lg ring-1 ring-[#3d99f5]'
                      : 'bg-transparent text-[#0d141c] dark:text-darkTextPrimary ring-1 ring-[#3d99f5]/60 hover:bg-[#e7edf4]/80 dark:hover:bg-white/5',
                  ].join(' ')}
                >
                  Explore Courses
                </button>
              </div>
            </div>
          </section>

          {/* Content */}
          <section className="mt-4 sm:mt-6">
            {tab === 'library' ? (
              <div className="rounded-2xl ring-1 ring-[#e7edf4] dark:ring-darkCard bg-white dark:bg-[#0f1821] overflow-hidden">
                {/* Purchased / Saved videos */}
                <div className="p-3 sm:p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[18px] sm:text-[20px] font-bold tracking-tight">
                      My Purchased & Saved Videos
                    </h2>
                  </div>
                  <div className="mt-3">
                    <ClassVaultList />
                  </div>
                </div>

                {/* Free OER Video Collections */}
                <div className="px-3 sm:px-4 pb-4">
                  <div className="mt-4 flex items-center justify-between">
                    <h3 className="text-[16px] sm:text-[18px] font-bold">
                      Free OER Video Collections
                    </h3>
                    {DEBUG_OER && (
                      <span className="text-[11px] text-[#49739c] dark:text-darkTextSecondary">
                        loading={String(loadingVCols)} · error={errVCols || '—'} · total=
                        {oerVideoCols.length}
                      </span>
                    )}
                  </div>

                  {loadingVCols && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div
                          key={i}
                          className="rounded-xl ring-1 ring-[#cedbe8] dark:ring-darkCard overflow-hidden"
                        >
                          <div className="aspect-video bg-gray-200/70 dark:bg:white/5 animate-pulse" />
                          <div className="p-3">
                            <div className="h-4 w-2/3 bg-gray-200/70 dark:bg-white/5 rounded animate-pulse" />
                            <div className="mt-2 h-3 w-1/2 bg-gray-200/70 dark:bg-white/5 rounded animate-pulse" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!loadingVCols && errVCols && (
                    <div className="py-3 text-sm text-red-600">{errVCols}</div>
                  )}

                  {!loadingVCols && !errVCols && (
                    <>
                      {oerVideoCols.length === 0 ? (
                        <div className="py-3 text-sm text-[#49739c] dark:text-darkTextSecondary">
                          No free OER video collections yet.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                          {oerVideoCols.map((col) => {
                            const to = getOerReaderPath(col);
                            const thumb =
                              col.cover_url ||
                              col.thumbnail_url ||
                              `https://picsum.photos/seed/${encodeURIComponent(
                                String(col.slug ?? col.id ?? col.title ?? 'oer')
                              )}/800/450`;

                            return (
                              <div
                                key={String(col.id ?? col.slug)}
                                className="group rounded-2xl ring-1 ring-[#cedbe8] dark:ring-darkCard bg-white dark:bg-[#0f1821] overflow-hidden flex flex-col"
                              >
                                <Link
                                  to={to}
                                  className="block aspect-video bg-slate-100 dark:bg-white/5 overflow-hidden"
                                  aria-label={`Open ${col.title}`}
                                >
                                  <img
                                    src={thumb}
                                    alt={col.title || 'OER Collection'}
                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                                    loading="lazy"
                                    decoding="async"
                                  />
                                </Link>

                                <div className="p-3 sm:p-4 flex-1 flex flex-col">
                                  <Link
                                    to={to}
                                    className="font-semibold leading-snug line-clamp-2 hover:underline"
                                    title={col.title}
                                  >
                                    {col.title}
                                  </Link>

                                  <div className="mt-1 text-xs text-[#49739c] dark:text-darkTextSecondary">
                                    {col.subject ?? '—'} • {col.items_count ?? 0} item
                                    {(col.items_count ?? 0) === 1 ? '' : 's'}
                                  </div>

                                  <div className="mt-3">
                                    <Link
                                      to={to}
                                      className="inline-flex items-center justify-center h-9 px-3 rounded-xl text-sm font-semibold bg-[#3d99f5] text-white hover:brightness-110"
                                    >
                                      View Collection
                                    </Link>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col">
                {/* Section header */}
                <div className="flex flex-wrap justify-between gap-3 p-3 sm:p-4">
                  <div className="flex min-w-60 sm:min-w-72 flex-col gap-1">
                    <p className="text-[22px] sm:text-[28px] md:text-[32px] font-bold leading-tight">
                      Explore Courses
                    </p>
                    <p className="text-[#49739c] dark:text-darkTextSecondary text-xs sm:text-sm">
                      Find the perfect course to enhance your skills and knowledge.
                    </p>
                  </div>
                </div>

                <div id="unlocked-ai" className="px-3 sm:px-4 mt-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold">🧪 My AI Courses (Unlocked)</h3>
                    <span className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                      {unlockedAiLoading
                        ? 'Loading…'
                        : `${unlockedAi.length} course${unlockedAi.length === 1 ? '' : 's'}`}
                    </span>
                  </div>

                  {sandboxDbgEnabled ? (
                    <div className="mt-2 text-[11px] rounded-xl bg-[#e7edf4] dark:bg-[#172534] p-2">
                      <div className="font-bold">unlocked-ai debug</div>
                      <div>phase: {unlockedAiDbg.phase ?? '—'}</div>
                      <div>ranAt: {unlockedAiDbg.ranAt ?? '—'}</div>
                      <div>url: {unlockedAiDbg.url ?? '—'}</div>
                      <div>status: {String(unlockedAiDbg.status ?? '—')}</div>
                      <div>build: {unlockedAiDbg.build ?? '—'}</div>
                      {unlockedAiDbg.error ? (
                        <div className="text-red-700">error: {unlockedAiDbg.error}</div>
                      ) : null}
                      <div className="mt-1 whitespace-pre-wrap break-words opacity-80">
                        {unlockedAiDbg.preview ?? '—'}
                      </div>
                    </div>
                  ) : null}

                  {sandboxDbgEnabled && !unlockedAiLoading && unlockedAi.length === 0 ? (
                    <div className="mt-2 text-[11px] rounded-xl bg-[#fff7ed] dark:bg-[#2a1e12] p-2 ring-1 ring-[#f5d0a5] dark:ring-[#5c3d1a]">
                      <div className="font-bold">unlocked-ai empty result debug</div>
                      <div>status: {String(unlockedAiDbg.status ?? '—')}</div>
                      <div>build: {unlockedAiDbg.build ?? '—'}</div>
                      <div>
                        db:{' '}
                        {unlockedAiDbg.debugDb
                          ? `${unlockedAiDbg.debugDb.db ?? '—'} @ ${unlockedAiDbg.debugDb.addr ?? '—'}:${
                              unlockedAiDbg.debugDb.port ?? '—'
                            }`
                          : '—'}
                      </div>
                      <div>
                        resolved: userId={String(unlockedAiDbg.resolved?.userId ?? '—')} · authUuid=
                        {unlockedAiDbg.resolved?.authUuid ?? '—'}
                      </div>
                      <div>
                        entitlementsCount: {String(unlockedAiDbg.entitlementsCount ?? '—')}
                      </div>
                      <div className="mt-1">
                        entitlementsJoinSample titles:{' '}
                        {unlockedAiDbg.entitlementsJoinTitles?.length
                          ? unlockedAiDbg.entitlementsJoinTitles.join(', ')
                          : '—'}
                      </div>
                    </div>
                  ) : null}

                  {unlockedAiErr && !unlockedAiLoading && (
                    <div className="mt-2 text-sm text-red-600">{unlockedAiErr}</div>
                  )}

                  {unlockedAiLoading && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div
                          key={i}
                          className="rounded-2xl ring-1 ring-[#cedbe8] dark:ring-darkCard bg-white dark:bg-[#0f1821] overflow-hidden"
                        >
                          <div className="aspect-video bg-gray-200/70 dark:bg:white/5 animate-pulse" />
                          <div className="p-3">
                            <div className="h-4 w-2/3 bg-gray-200/70 dark:bg-white/5 rounded animate-pulse" />
                            <div className="mt-2 h-3 w-1/2 bg-gray-200/70 dark:bg-white/5 rounded animate-pulse" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!unlockedAiLoading && !unlockedAiErr && unlockedAi.length === 0 && (
                    <div className="mt-2 text-xs text-[#49739c] dark:text-darkTextSecondary">
                      Unlock any AI Sandbox course and it will live here forever — ready to
                      continue anytime.
                    </div>
                  )}

                  {!unlockedAiLoading && unlockedAi.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                      {unlockedAi.map((c: any) => {
                        const cid = String(c.id);
                        const track = sandboxTrackById[cid] ?? resolveCourseTrack(c) ?? 'certificate';
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
                        const progressHref = `/progress/${cid}?programTrack=${track}&source=sandbox`;

                        const onTrackChange = (next: ProgramTrack) => {
                          setSandboxTrackById((prev) => ({ ...prev, [cid]: next }));
                          persistTrack(cid, next);
                          sdbg('track', { courseId: cid, next });
                        };

                        const onDownloadCertificate = async () => {
                          if (!backendUrl || !token) return;
                          try {
                            const doc = await generateCertificatePdf(backendUrl, token, {
                              courseId: cid,
                            });
                            const certId = (doc as any)?.id;
                            if (!certId) throw new Error('Certificate unavailable');
                            const filename = `${String(c.title || 'certificate')
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, '-')}-${certId}.pdf`;
                            await downloadCertificateFile(backendUrl, token, certId, filename);
                          } catch (e: any) {
                            alert(e?.message || 'Failed to download certificate');
                          }
                        };

                        return (
                          <div
                            key={cid}
                            data-course-id={cid}
                            ref={(el) => {
                              sandboxRefs.current[cid] = el;
                            }}

                            className="group rounded-2xl ring-1 ring-[#cedbe8] dark:ring-darkCard bg-white dark:bg-[#0f1821] overflow-hidden flex flex-col"
                          >
                            <CourseHero course={c} backendUrl={backendUrl} />

                            <div className="p-3 sm:p-4 flex-1 flex flex-col gap-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="font-semibold leading-snug line-clamp-2">
                                  {c.title}
                                </div>
                                <span className="text-[11px] rounded-full px-2 py-0.5 bg-[#e7edf4] dark:bg-[#172534]">
                                  AI Sandbox
                                </span>
                              </div>

                              <div className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                                {c.subject ?? '—'} {c.level ? `• ${c.level}` : ''}
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {(['certificate', 'diploma', 'degree'] as ProgramTrack[]).map(
                                  (opt) => (
                                    <button
                                      key={opt}
                                      onClick={() => onTrackChange(opt)}
                                      className={`px-3 h-7 rounded-full text-[11px] font-semibold ring-1 ${
                                        track === opt
                                          ? 'bg-[#3d99f5] text-white ring-[#3d99f5]'
                                          : 'bg-white dark:bg-[#0f1821] ring-[#cedbe8] dark:ring-darkCard'
                                      }`}
                                    >
                                      {getTrackRequirements(opt).label}
                                    </button>
                                  )
                                )}
                              </div>

                              <div className="rounded-xl bg-[#f6f9fc] dark:bg-[#142030] p-2 text-[11px] text-[#314a64] dark:text-darkTextSecondary">
                                <div className="flex items-center justify-between">
                                  <span>Lessons</span>
                                  <span className="font-semibold">
                                    {lessonsDone}/{reqs.minLessons}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>Questions</span>
                                  <span className="font-semibold">
                                    {questionsDone}/{reqs.minQuestions}
                                  </span>
                                </div>
                              </div>

                              <div>
                                <div className="flex items-center justify-between text-[11px] text-[#49739c] dark:text-darkTextSecondary">
                                  <span>Weeks completed</span>
                                  <span className="font-semibold">
                                    {totalWeeks ? `${completedWeeks}/${totalWeeks}` : '—'}
                                  </span>
                                </div>
                                <div className="mt-1 h-2 rounded-full bg-[#e7edf4] dark:bg-[#172534] overflow-hidden">
                                  <div
                                    className="h-2 bg-[#3d99f5]"
                                    style={{ width: `${weeksPct}%` }}
                                  />
                                </div>
                              </div>

                              {status?.loading ? (
                                <div className="text-[11px] text-[#49739c] dark:text-darkTextSecondary">
                                  Loading eligibility…
                                </div>
                              ) : status?.error ? (
                                <div className="text-[11px] text-red-600">{status.error}</div>
                              ) : certificateReady ? (
                                <div className="text-[11px] font-semibold text-emerald-600">
                                  Certificate ready ✅
                                </div>
                              ) : quizEligible ? (
                                <div className="text-[11px] font-semibold text-indigo-600">
                                  Final quiz available
                                </div>
                              ) : (
                                <div className="text-[11px] text-[#49739c] dark:text-darkTextSecondary">
                                  Finish all weeks to unlock final quiz
                                </div>
                              )}

                              <div className="mt-auto grid grid-cols-2 gap-2">
                                {certificateReady ? (
                                  <>
                                    <button
                                      onClick={onDownloadCertificate}
                                      className="h-9 rounded-xl bg-[#3d99f5] text-white text-xs font-semibold hover:brightness-110"
                                    >
                                      Download certificate
                                    </button>
                                    <button
                                      onClick={() => navigate(progressHref)}
                                      className="h-9 rounded-xl bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-xs font-semibold"
                                    >
                                      Review weeks
                                    </button>
                                  </>
                                ) : quizEligible ? (
                                  <>
                                    <button
                                      onClick={() => navigate(progressHref)}
                                      className="h-9 rounded-xl bg-[#3d99f5] text-white text-xs font-semibold hover:brightness-110"
                                    >
                                      Open progress
                                    </button>
                                    <button
                                      onClick={() => navigate(progressHref)}
                                      className="h-9 rounded-xl bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-xs font-semibold"
                                    >
                                      Review weeks
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => navigate(progressHref)}
                                      className="h-9 rounded-xl bg-[#3d99f5] text-white text-xs font-semibold hover:brightness-110"
                                    >
                                      {completedWeeks > 0 ? 'Continue week' : 'Start week'}
                                    </button>
                                    <button
                                      onClick={() => navigate(progressHref)}
                                      className="h-9 rounded-xl bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-xs font-semibold"
                                    >
                                      View progress
                                    </button>
                                  </>
                                )}
                              </div>

                              {sandboxDbgEnabled && (
                                <div className="text-[10px] text-[#7a94ad] dark:text-darkTextSecondary">
                                  dbg: track={track} • progress={progressHref}
                                </div>
                              )}

                              <div className="flex items-center justify-between text-[11px] text-[#7a94ad] dark:text-darkTextSecondary">
                                <span>
                                  Track: <span className="font-semibold">{reqs.label}</span>
                                </span>
                                <button
                                  onClick={() => navigate(`/courses/${cid}`)}
                                  className="underline underline-offset-2"
                                >
                                  Details
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Top Courses */}
                <div className="px-3 sm:px-4 mt-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold">🔥 Top Courses</h3>
                    <div className="flex items-center gap-3 text-xs text-[#49739c] dark:text-darkTextSecondary">
                      <span>
                        {topCoursesLoading
                          ? 'Loading…'
                          : `${topCourses.length} course${topCourses.length === 1 ? '' : 's'}`}
                      </span>
                      {isNarrow && (
                        <button
                          onClick={() => setTopCoursesExpanded((prev) => !prev)}
                          className="underline underline-offset-2"
                        >
                          {topCoursesExpanded ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </div>
                  </div>

                  {topCoursesError && !topCoursesLoading && (
                    <div className="mt-2 text-sm text-red-600">{topCoursesError}</div>
                  )}

                  {topCoursesExpanded && (
                    <>
                      {topCoursesLoading && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                          {Array.from({ length: topCoursesPageSize }).map((_, i) => (
                            <div
                              key={`top-skel-${i}`}
                              className="rounded-2xl ring-1 ring-[#cedbe8] dark:ring-darkCard bg-white dark:bg-[#0f1821] overflow-hidden"
                            >
                              <div className="aspect-video bg-gray-200/70 dark:bg:white/5 animate-pulse" />
                              <div className="p-3">
                                <div className="h-4 w-2/3 bg-gray-200/70 dark:bg-white/5 rounded animate-pulse" />
                                <div className="mt-2 h-3 w-1/2 bg-gray-200/70 dark:bg-white/5 rounded animate-pulse" />
                                <div className="mt-3 h-3 w-1/3 bg-gray-200/70 dark:bg-white/5 rounded animate-pulse" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {!topCoursesLoading && topCourses.length === 0 && !topCoursesError && (
                        <div className="mt-2 text-xs text-[#49739c] dark:text-darkTextSecondary">
                          No top courses available right now.
                        </div>
                      )}

                      {!topCoursesLoading && topCourses.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                          {topCourses.map((c: any) => {
                            const cid = String(c.id);
                            const isEnrolled = enrolledCourseIds.has(cid);
                            const rating = typeof c.rating === 'number' ? c.rating : undefined;
                            const reviews = typeof c.reviews === 'number' ? c.reviews : undefined;

                            return (
                              <div
                                key={cid}
                                className="rounded-2xl ring-1 ring-[#cedbe8] dark:ring-darkCard bg-white dark:bg-[#0f1821] overflow-hidden flex flex-col"
                              >
                                <CourseHero course={c as any} backendUrl={backendUrl} />

                                <div className="p-3 flex flex-col gap-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="font-semibold text-sm line-clamp-2">{c.title}</p>
                                    <span className="text-[11px] bg-[#e7edf4] dark:bg-[#172534] rounded px-2 py-0.5">
                                      TOP
                                    </span>
                                  </div>

                                  <p className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                                    {c.subject ?? '—'} {c.level ? `• ${c.level}` : ''}
                                  </p>

                                  <div className="flex items-center justify-between text-xs text-[#49739c] dark:text-darkTextSecondary">
                                    <span>{c.duration ?? '—'}</span>
                                    {rating ? <StarRow avg={rating} count={reviews ?? 0} /> : null}
                                  </div>

                                  <div className="mt-1 grid grid-cols-2 gap-2">
                                    {isEnrolled ? (
                                      <button
                                        className="h-9 rounded-lg bg-[#3d99f5] text-white text-xs font-semibold hover:brightness-110"
                                        onClick={() => navigate(`/progress/${cid}`)}
                                      >
                                        Continue
                                      </button>
                                    ) : (
                                      <button
                                        className="h-9 rounded-lg bg-[#3d99f5] text-white text-xs font-semibold hover:brightness-110"
                                        onClick={() => navigate(`/courses/${cid}`)}
                                      >
                                        View
                                      </button>
                                    )}
                                    <button
                                      className="h-9 rounded-lg bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-xs font-semibold"
                                      onClick={() =>
                                      navigate(
                                      `/robot-teach?courseId=${encodeURIComponent(cid)}&title=${encodeURIComponent(
                                        String(c.title || '')
                                      )}&courseTitle=${encodeURIComponent(String(c.title || ''))}`
                                    )

                                    }

                                    >
                                      Start with AI
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {!topCoursesLoading && topCoursesTotalPages > 1 && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#49739c] dark:text-darkTextSecondary">
                          <button
                            className="h-8 px-3 rounded-lg bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard disabled:opacity-50"
                            onClick={() => setTopCoursesPage((prev) => Math.max(1, prev - 1))}
                            disabled={topCoursesPage <= 1}
                          >
                            Prev
                          </button>
                          <span>
                            Page {topCoursesPage} of {topCoursesTotalPages}
                          </span>
                          <button
                            className="h-8 px-3 rounded-lg bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard disabled:opacity-50"
                            onClick={() =>
                              setTopCoursesPage((prev) => Math.min(topCoursesTotalPages, prev + 1))
                            }
                            disabled={topCoursesPage >= topCoursesTotalPages}
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>


                {/* OER Books */}
                <div className="px-3 sm:px-4 mt-4">
                  <h3 className="text-base font-bold mb-2">My Free OER Books</h3>

                  {DEBUG_OER && (
                    <div className="mb-2 text-[11px] text-[#49739c] dark:text-darkTextSecondary">
                      <span className="px-2 py-0.5 rounded bg-[#e7edf4] dark:bg-[#172534]">
                        OER: loading={String(oerLoading)} · error={oerError || '—'} · total=
                        {(oerCourses as any[]).length} · books={oerBooks.length}
                      </span>
                    </div>
                  )}

                  {oerLoading && <div className="text-sm py-3">Loading books…</div>}
                  {oerError && !oerLoading && (
                    <div className="text-sm py-3 text-red-600">Failed to load OER books.</div>
                  )}

                  {!oerLoading && !oerError && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {oerBooks.map((c: any) => {
                        const idOrSlug = String(c.slug ?? c.id);
                        return (
                          <div
                            key={idOrSlug}
                            className="rounded-xl ring-1 ring-[#cedbe8] dark:ring-darkCard bg-white dark:bg-[#0f1821] overflow-hidden flex flex-col"
                          >
                            <CourseHero course={c as any} backendUrl={backendUrl} />

                            <div className="p-3 flex flex-col gap-2">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-semibold text-sm line-clamp-2">{c.title}</p>
                                <span className="text-[11px] bg-[#e7edf4] dark:bg-[#172534] rounded px-2 py-0.5">
                                  BOOK
                                </span>
                              </div>

                              <p className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                                {c.subject ?? '—'} {c.level ? `• ${c.level}` : ''}
                              </p>

                              <div className="mt-1 flex gap-2">
                                <Link
                                  to={`/oer/${encodeURIComponent(sanitizeId(idOrSlug))}`}
                                  className="flex-1 h-9 rounded-lg bg-[#3d99f5] text-white text-xs font-semibold hover:brightness-110 inline-flex items-center justify-center"
                                  aria-label={`Open reader for ${c.title}`}
                                  title="Open Reader"
                                >
                                  Reader
                                </Link>

                                <button
                                  className="h-9 px-3 rounded-lg bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-xs font-semibold"
                                  onClick={async () => {
                                    try {
                                      const { courseId } = await wrapBook(idOrSlug);
                                      navigate(`/progress/${courseId}`);
                                    } catch (e: any) {
                                      alert(e?.message || 'Failed to start book course');
                                    }
                                  }}
                                  title="Start guided course"
                                >
                                  Learn with RobotTeacher
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!oerLoading && !oerError && oerBooks.length === 0 && (
                    <div className="py-3 text-xs text-[#49739c] dark:text-darkTextSecondary">
                      No OER books available.
                    </div>
                  )}
                </div>

                {/* ✅ Search + Filters (wired to useCourseSearch) */}
                <div className="px-3 sm:px-4 mt-5">
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <input
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="Search courses…"
                      className="flex-1 h-11 rounded-xl px-3 bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-sm outline-none focus:ring-4 focus:ring-[#3d99f5]/30"
                    />

                    <button
                      className="h-11 px-4 rounded-xl bg-[#3d99f5] text-white text-sm font-semibold hover:brightness-110"
                      onClick={() => handleCourseSearch(searchText)}
                      title="Search now"
                    >
                      Search
                    </button>
                  </div>

                  <div className="flex gap-2 sm:gap-3 mt-3 flex-wrap">
                    <button
                      className="flex h-9 items-center justify-center gap-x-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534] pl-3 pr-2 text-xs sm:text-sm"
                      onClick={() =>
                        setCourseSubject(prompt('Subject (e.g., Math, English):') || '')
                      }
                      title="Subject"
                    >
                      <span className="font-medium">Subject</span>
                      <span className="text-current">
                        <CaretDown size={16} />
                      </span>
                    </button>

                    <button
                      className="flex h-9 items-center justify-center gap-x-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534] pl-3 pr-2 text-xs sm:text-sm"
                      onClick={() =>
                        setCourseGradeBand(prompt('Grade band (e.g., K-5, 6-8, 9-12):') || '')
                      }
                      title="Grade band"
                    >
                      <span className="font-medium">Grade</span>
                      <span className="text-current">
                        <CaretDown size={16} />
                      </span>
                    </button>

                    <button
                      className="flex h-9 items-center justify-center gap-x-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534] pl-3 pr-2 text-xs sm:text-sm"
                      onClick={() =>
                        setCourseLevel(
                          prompt('Level (Beginner, Intermediate, Advanced, All Levels):') || ''
                        )
                      }
                      title="Level"
                    >
                      <span className="font-medium">Level</span>
                      <span className="text-current">
                        <CaretDown size={16} />
                      </span>
                    </button>

                    <button
                      className="flex h-9 items-center justify-center gap-x-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534] pl-3 pr-2 text-xs sm:text-sm"
                      onClick={() => {
                        const v = prompt('Min rating (1-5):') || '';
                        const n = Number(v);
                        setCourseMinRating(Number.isFinite(n) ? n : 0);
                      }}
                      title="Minimum rating"
                    >
                      <span className="font-medium">Min Rating</span>
                      <span className="text-current">
                        <CaretDown size={16} />
                      </span>
                    </button>

                    <button
                      className="flex h-9 items-center justify-center gap-x-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534] pl-3 pr-2 text-xs sm:text-sm"
                      onClick={() => {
                        const v = prompt('Max price (number only, e.g., 50):') || '';
                        const n = Number(v);
                        setCourseMaxPrice(Number.isFinite(n) ? n : 0);
                      }}
                      title="Max price"
                    >
                      <span className="font-medium">Max Price</span>
                      <span className="text-current">
                        <CaretDown size={16} />
                      </span>
                    </button>

                    <button
                      className="flex h-9 items-center justify-center gap-x-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534] pl-3 pr-2 text-xs sm:text-sm"
                      onClick={() =>
                        setDuration(prompt('Duration contains (e.g., "10 weeks"):') || '')
                      }
                      title="Duration (local)"
                    >
                      <span className="font-medium">Duration</span>
                      <span className="text-current">
                        <CaretDown size={16} />
                      </span>
                    </button>

                    {(courseFilters?.subject ||
                      courseFilters?.gradeBand ||
                      courseFilters?.level ||
                      (courseFilters?.minRating ?? 0) > 0 ||
                      (courseFilters?.maxPrice ?? 0) > 0 ||
                      duration) && (
                      <button
                        className="h-9 px-3 rounded-xl bg:white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-xs sm:text-sm font-medium hover:bg-slate-50 dark:hover:bg-[#0f1821]"
                        onClick={() => {
                          clearCourseFilters();
                          setDuration('');
                          setSearchText('');
                          try {
                            setCourseIsOer(false);
                            handleCourseSearch('');
                          } catch {}
                        }}
                        title="Clear all"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {courseSearchError && (
                    <div className="mt-3 text-sm text-red-600">Failed to load courses.</div>
                  )}
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-3 px-3 mt-4">
                  {courseSearchLoading && <div className="text-sm py-4">Loading courses…</div>}

                  {!courseSearchLoading &&
                    displayRows.map((c: any) => {
                      const cid = String(c.id);
                      const tutorName = resolveTutorName(c)!;
                      const priceDisplay =
                        typeof c.price === 'number'
                          ? `$${c.price}`
                          : typeof c.price === 'string'
                            ? c.price
                            : '—';
                      const isEnrolled = enrolledCourseIds.has(cid);
                      const r = ratings[cid];

                      return (
                        <div
                          key={cid}
                          data-course-id={cid}
                          ref={(el) => {
                            itemRefs.current[cid] = el;
                          }}
                          className="rounded-xl ring-1 ring-[#cedbe8] dark:ring-darkCard bg-white dark:bg-[#0f1821] p-3 flex flex-col gap-2"
                          onTouchStart={() => prefetchOnHover(cid)}
                          onMouseEnter={() => prefetchOnHover(cid)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-sm">{c.title}</h3>
                            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                              {c.level ?? '—'}
                            </div>
                          </div>
                          <div className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                            {tutorName}
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[#49739c] dark:text-darkTextSecondary">
                              {c.duration ?? '—'}
                            </span>
                            <span className="text-[#49739c] dark:text-darkTextSecondary">
                              {priceDisplay}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <div className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                              {r ? <StarRow avg={r.avg} count={r.count} /> : '—'}
                            </div>
                            {isEnrolled ? (
                              r?.my ? (
                                <button
                                  className="h-9 px-3 rounded-lg bg-[#e7edf4] dark:bg-[#172534] text-xs font-semibold"
                                  onClick={() => navigate(`/progress/${cid}`)}
                                >
                                  Enrolled
                                </button>
                              ) : (
                                <button
                                  className="h-9 px-3 rounded-lg bg-[#e7edf4] dark:bg-[#172534] text-xs font-semibold"
                                  onClick={() => setOpenReview({ id: cid, title: c.title })}
                                >
                                  Review
                                </button>
                              )
                            ) : (
                              <button
                                className="h-9 px-3 rounded-lg bg-[#e7edf4] dark:bg-[#172534] text-xs font-semibold"
                                onClick={() => navigate(`/courses/${cid}`)}
                              >
                                View
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                  {!courseSearchLoading && displayRows.length === 0 && (
                    <div className="py-6 text-center text-sm text-[#49739c] dark:text-darkTextSecondary">
                      No courses match your filters.
                    </div>
                  )}
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block px-4 py-3 @container mt-2">
                  <div className="overflow-x-auto rounded-xl border border-[#cedbe8] dark:border-darkCard bg-slate-50 dark:bg-[#0f1821]">
                    <table className="min-w-[900px] w-full">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-slate-100 dark:bg-[#0f1821]">
                          <th className="table-col-120 px-4 py-3 text-left text-sm font-medium w-[400px]">
                            Course
                          </th>
                          <th className="table-col-240 px-4 py-3 text-left text-sm font-medium w-[300px]">
                            Tutor
                          </th>
                          <th className="table-col-360 px-4 py-3 text-left text-sm font-medium w-60">
                            Level
                          </th>
                          <th className="table-col-480 px-4 py-3 text-left text-sm font-medium w-[220px]">
                            Duration
                          </th>
                          <th className="table-col-600 px-4 py-3 text-left text-sm font-medium w-[180px]">
                            Price
                          </th>
                          <th className="table-col-720 px-4 py-3 text-left text-sm font-medium w-[280px]">
                            Rating / Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {courseSearchLoading && (
                          <tr>
                            <td colSpan={6} className="px-4 py-6 text-sm">
                              Loading courses…
                            </td>
                          </tr>
                        )}

                        {!courseSearchLoading &&
                          displayRows.map((c: any) => {
                            const cid = String(c.id);
                            const tutorName = resolveTutorName(c)!;
                            const priceDisplay =
                              typeof c.price === 'number'
                                ? `$${c.price}`
                                : typeof c.price === 'string'
                                  ? c.price
                                  : '—';
                            const isEnrolled = enrolledCourseIds.has(cid);
                            const r = ratings[cid];

                            return (
                              <tr
                                key={cid}
                                className="border-t border-t-[#cedbe8] dark:border-darkCard"
                                onMouseEnter={() => prefetchOnHover(cid)}
                                data-course-id={cid}
                                ref={(el) => {
                                  itemRefs.current[cid] = el;
                                }}
                              >
                                <td className="table-col-120 h-[72px] px-4 py-2 w-[400px] text-sm">
                                  {c.title}
                                </td>
                                <td className="table-col-240 h-[72px] px-4 py-2 w-[300px] text-sm text-[#49739c] dark:text-darkTextSecondary">
                                  {tutorName}
                                </td>
                                <td className="table-col-360 h-[72px] px-4 py-2 w-60 text-sm">
                                  <button
                                    className="flex min-w-[84px] items-center justify-center rounded-xl h-8 px-4 bg-[#e7edf4] dark:bg-[#172534] text-sm font-medium w-full"
                                    onClick={() => setCourseLevel(String(c.level ?? ''))}
                                    title={`Filter by ${c.level ?? 'level'}`}
                                  >
                                    <span className="truncate">{c.level ?? '—'}</span>
                                  </button>
                                </td>
                                <td className="table-col-480 h-[72px] px-4 py-2 w-[220px] text-sm text-[#49739c] dark:text-darkTextSecondary">
                                  {c.duration ?? '—'}
                                </td>
                                <td className="table-col-600 h-[72px] px-4 py-2 w-[180px] text-sm text-[#49739c] dark:text-darkTextSecondary">
                                  {priceDisplay}
                                </td>
                                <td className="table-col-720 h-[72px] px-4 py-2 w-[280px] text-sm">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-[#49739c] dark:text-darkTextSecondary">
                                      {r ? (
                                        <StarRow avg={r.avg} count={r.count} />
                                      ) : (
                                        <span className="opacity-70">—</span>
                                      )}
                                    </div>
                                    {isEnrolled ? (
                                      r?.my ? (
                                        <button
                                          className="h-9 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] text-xs font-semibold"
                                          onClick={() => navigate(`/progress/${cid}`)}
                                        >
                                          Enrolled
                                        </button>
                                      ) : (
                                        <button
                                          className="h-9 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] text-xs font-semibold"
                                          onClick={() => setOpenReview({ id: cid, title: c.title })}
                                        >
                                          Review
                                        </button>
                                      )
                                    ) : (
                                      <button
                                        className="h-9 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] text-xs font-semibold"
                                        onClick={() => navigate(`/courses/${cid}`)}
                                      >
                                        View
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}

                        {!courseSearchLoading && displayRows.length === 0 && (
                          <tr className="border-t border-t-[#cedbe8] dark:border-darkCard">
                            <td
                              colSpan={6}
                              className="px-4 py-6 text-center text-sm text-[#49739c] dark:text-darkTextSecondary"
                            >
                              No courses match your filters.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <style>{`
                    @container(max-width:120px){.table-col-120{display:none;}}
                    @container(max-width:240px){.table-col-240{display:none;}}
                    @container(max-width:360px){.table-col-360{display:none;}}
                    @container(max-width:480px){.table-col-480{display:none;}}
                    @container(max-width:600px){.table-col-600{display:none;}}
                    @container(max-width:720px){.table-col-720{display:none;}}
                  `}</style>
                </div>

                {/* Pagination placeholder (keep yours) */}
                <div className="flex items-center justify-center gap-1 p-3 sm:p-4">
                  <button
                    className="flex size-9 sm:size-10 items-center justify-center rounded-full hover:bg-[#e7edf4] dark:hover:bg-[#172534]"
                    aria-label="Previous page"
                  >
                    ‹
                  </button>
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      className={`flex size-9 sm:size-10 items-center justify-center rounded-full text-xs sm:text-sm ${
                        n === 1 ? 'font-bold bg-[#e7edf4] dark:bg-[#172534]' : ''
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    className="flex size-9 sm:size-10 items-center justify-center rounded-full hover:bg-[#e7edf4] dark:hover:bg-[#172534]"
                    aria-label="Next page"
                  >
                    ›
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Review Modal */}
      {openReview && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-3 sm:p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0f1821] p-3 sm:p-4 ring-1 ring-[#cedbe8] dark:ring-darkCard">
            <h3 className="text-base sm:text-lg font-bold mb-1 sm:mb-2">Rate this course</h3>
            <p className="text-xs sm:text-sm text-[#49739c] dark:text-darkTextSecondary mb-2 sm:mb-3">
              {openReview.title}
            </p>

            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setReviewRating(n)}
                  className={
                    n <= reviewRating ? 'text-yellow-500 text-2xl' : 'text-[#49739c] text-2xl'
                  }
                  aria-label={`${n} star`}
                >
                  ★
                </button>
              ))}
            </div>

            <textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Optional comment (max 500 chars)"
              maxLength={500}
              className="w-full text-sm rounded-lg p-2 bg-[#e7edf4] dark:bg-[#172534] min-h-[90px]"
            />

            <div className="mt-3 sm:mt-4 flex items-center gap-2">
              <button
                disabled={posting || reviewRating < 1}
                onClick={async () => {
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
                    alert(e?.message || 'Failed to submit review');
                  } finally {
                    setPosting(false);
                  }
                }}
                className="px-4 h-10 rounded-xl bg-[#3d99f5] text-white text-sm font-semibold disabled:opacity-60"
              >
                {posting ? 'Saving…' : 'Submit'}
              </button>

              <button
                onClick={() => setOpenReview(null)}
                className="px-4 h-10 rounded-xl bg-white dark:bg-[#0f1821] ring-1 ring-[#cedbe8] dark:ring-darkCard text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyCourses;
