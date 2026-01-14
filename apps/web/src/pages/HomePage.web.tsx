// apps/web/src/pages/HomePage.web.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import debounce from 'lodash.debounce';
import { useHomePage, useCourses } from '@mytutorapp/shared/hooks';

import type { Profile, Course } from '@mytutorapp/shared/types';
import { fetchVideoReviews } from '@mytutorapp/shared/api/classVaultApi';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';
import {
  faStar as faStarSolid,
  faStarHalfAlt as faStarHalf,
  faStar as faStarOutlineAlias,
  faPlayCircle,
  faCheckCircle,
} from '@fortawesome/free-solid-svg-icons';

import { motion, useReducedMotion, Variants } from 'framer-motion';
import CourseHero from '../components/CourseHero';

const FALLBACK_AVATAR = (name = 'Tutor') =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=223649&color=ffffff`;

const HERO_BG =
  'https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?q=80&w=2000&auto=format&fit=crop';

// --- Limits (desktop vs mobile) ---
const FEATURED_TUTOR_LIMIT_DESKTOP = 12;
const FEATURED_TUTOR_LIMIT_MOBILE = 6;

const FEATURED_VIDEOS_LIMIT_DESKTOP = 8;
const FEATURED_VIDEOS_LIMIT_MOBILE = 4;

const FEATURED_COURSES_LIMIT_DESKTOP = 8;
const FEATURED_COURSES_LIMIT_MOBILE = 4;

const FREE_COURSES_LIMIT_DESKTOP = 4;
const FREE_COURSES_LIMIT_MOBILE = 4;

const FREE_VIDEOS_LIMIT_DESKTOP = 4;
const FREE_VIDEOS_LIMIT_MOBILE = 4;

const RECOMMENDED_COURSES_LIMIT_DESKTOP = 8;
const RECOMMENDED_COURSES_LIMIT_MOBILE = 4;

// Internal helper for featured tutor memo
const FEATURED_TUTOR_LIMIT = FEATURED_TUTOR_LIMIT_DESKTOP;

const DEBOUNCE_MS = 250;

// 👉 Path base for the OER reader page
const OER_READER_ROUTE_BASE = '/oer/collections';
const getOerReaderPath = (c: { id?: string | number; slug?: string }) =>
  `${OER_READER_ROUTE_BASE}/${encodeURIComponent(String(c.slug ?? c.id))}`;

type HomeCard = {
  id?: string | number;
  slug?: string | number; // optional, but helps if you ever pass numeric slugs/ids interchangeably
  kind?: string | null;
  content_kind?: string | null; // 'text' | 'video' | 'pdf' | etc.
};

const hrefForItem = (it: HomeCard) => {
  const id = encodeURIComponent(String(it.id ?? it.slug ?? ''));
  const kind = String(it.content_kind ?? it.kind ?? '').toLowerCase();

  if (kind === 'video') return `/oer/collections/${id}`; // open playlist/video flow
  if (kind === 'text') return `/oer/${id}`; // open HTML reader

  // sensible defaults (keeps all OER in the OER readers)
  if (kind === 'pdf' || kind === 'book') return `/oer/${id}`;
  return `/oer/${id}`;
};

// OER readers
const getOerDocHref = (c: any) => `/oer/${encodeURIComponent(String(c?.slug ?? c?.id ?? ''))}`;
const getOerCollectionHref = (c: any) =>
  `/oer/collections/${encodeURIComponent(String(c?.slug ?? c?.id ?? ''))}`;

// Prevent dev StrictMode double-run
function useEffectOnceInStrict(effect: React.EffectCallback, deps: React.DependencyList) {
  const did = React.useRef(false);
  useEffect(() => {
    if (did.current) return;
    did.current = true;
    return effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* ----------------------------- Local types ------------------------------- */
type OerKind = 'video' | 'doc';
type OerCollection = {
  id: string | number;
  title: string;
  description?: string;
  subject?: string;
  thumbnail_url?: string;
  items_count?: number;
  created_at?: string;
  content_kind?: OerKind;
  provider?: string;
  collection_type?: string;
  // allow extra keys
  [k: string]: any;
};

/* ----------------------------- Motion variants ---------------------------- */
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'easeOut' } },
};

const fadeInScale: Variants = {
  hidden: { opacity: 0, scale: 0.98, y: 10 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
};

const sectionStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, when: 'beforeChildren' } },
};

/* ----------------------------- UI helpers -------------------------------- */
function StarRow({ avg }: { avg: number }) {
  const rounded = Math.round(avg * 2) / 2;
  const icons: React.ReactElement[] = [];
  for (let i = 1; i <= 5; i++) {
    if (rounded >= i) {
      icons.push(
        <FontAwesomeIcon key={i} icon={faStarSolid as IconProp} className="text-yellow-500" />
      );
    } else if (rounded + 0.5 === i) {
      icons.push(
        <FontAwesomeIcon key={i} icon={faStarHalf as IconProp} className="text-yellow-500" />
      );
    } else {
      icons.push(
        <FontAwesomeIcon
          key={i}
          icon={faStarOutlineAlias as IconProp}
          className="text-yellow-500 opacity-30"
        />
      );
    }
  }
  return (
    <span aria-label={`Rated ${avg} out of 5`} className="inline-flex gap-0.5">
      {icons}
    </span>
  );
}

function extractRating(x: any): { avg: number; count: number } {
  const avg = Number(x?.avgRating ?? x?.rating ?? x?.stars ?? x?.avg_rating ?? 0);
  const count = Number(
    x?.ratingsCount ?? x?.reviewCount ?? x?.totalReviews ?? x?.ratings_count ?? 0
  );
  return { avg: Number.isFinite(avg) ? avg : 0, count: Number.isFinite(count) ? count : 0 };
}

const sStr = (v: any) => String(v ?? '').toLowerCase();
const hasAny = (obj: any, keys: string[]) =>
  keys.some((k) => {
    const v = obj?.[k];
    return v !== undefined && v !== null && String(v).length > 0;
  });

/** TRUE if a record is a video / playlist / stream (paid or OER) */
const isVideoish = (c: any): boolean => {
  const kind = sStr(
    c?.content_kind ?? c?.content_type ?? c?.resource_type ?? c?.type ?? c?.category ?? c?.kind
  );
  // accept both singular/plural
  if (kind === 'video' || kind === 'videos') return true;
  if (/(^|[^a-z])(video|videos|playlist|recorded|lecture|stream)(s)?($|[^a-z])/.test(kind))
    return true;
  if (typeof c?.is_video === 'boolean' && c.is_video) return true;

  if (
    hasAny(c, [
      'video_url',
      'video',
      'videoSrc',
      'preview_url',
      'previewUrl',
      'stream_url',
      'youtube_id',
      'youtubeId',
      'youtube_url',
      'vimeo_id',
      'wistia_id',
    ])
  )
    return true;

  return false;
};

/** TRUE if a record is a document-like learning asset (PDF/HTML/books/notes) */
const isDocish = (c: any): boolean => {
  const kind = sStr(
    c?.content_kind ?? c?.content_type ?? c?.resource_type ?? c?.type ?? c?.category ?? c?.kind
  );
  // accept both singular/plural
  if (kind === 'doc' || kind === 'docs') return true;

  const mime = sStr(c?.mime || c?.mime_type || c?.contentType);
  const url = String(c?.file_url || c?.download_url || c?.url || c?.web_url || '');

  if (
    /(book|textbook|pdf|ebook|document|doc|docs|article|page|html|note|notes|handout|worksheet|guide|summary)/.test(
      kind
    )
  )
    return true;
  if (mime.includes('pdf') || mime.includes('html')) return true;
  if (/\.pdf($|\?)/i.test(url) || /\.html?($|\?)/i.test(url)) return true;
  if (sStr(c?.provider).includes('openstax')) return true;
  if (hasAny(c, ['html', 'html_content', 'html_url', 'article_html', 'article_url'])) return true;
  return false;
};

const isFreeCourse = (c: any): boolean => {
  if (!c) return false;
  if ((c.isFree ?? c.free ?? c.oer) === true) return true;
  const price = c.price ?? c.cost ?? c.amount ?? c.listPrice ?? 0;
  const ss = String(price).trim().toLowerCase();
  if (ss === 'free' || ss === '$0' || ss === '0' || ss === '0.00') return true;
  const n = Number(price);
  return Number.isFinite(n) && n <= 0;
};

const uniqById = <T extends { id?: string | number }>(arr: T[]) => {
  const seen = new Set<string | number>();
  return arr.filter((x) => {
    const key = x?.id ?? Math.random();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const interleave = <T, U>(a: T[], b: U[], limit: number): Array<T | U> => {
  const out: Array<T | U> = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max && out.length < limit; i++) {
    if (a[i]) out.push(a[i]);
    if (b[i] && out.length < limit) out.push(b[i]);
  }
  return out.slice(0, limit);
};

// “Real” course = from `courses` table (not a video, not an OER doc)
const isRealCourse = (c: any) => !isVideoish(c) && !isDocish(c);

// Prefer slug; fallback id
const idOrSlug = (c: any) => String(c?.slug || c?.id || '');

// Strong OER detection for things that might not include content_kind
const isOerLike = (c: any) => {
  const provider = sStr(c?.provider);
  const k = sStr(c?.kind); // e.g. 'collection' | 'book' | 'doc'
  const ck = sStr(c?.content_kind ?? c?.contentKind ?? c?.type); // e.g. 'video' | 'doc' | 'text' | 'pdf'

  if (provider === 'oer') return true;
  if (k === 'collection' || k === 'book' || k === 'doc' || k === 'oer') return true;
  if (ck === 'doc' || ck === 'text' || ck === 'pdf' || ck === 'book') return true;
  return false;
};

// Build href per item
// ✅ Route builder
const getHrefForItem = (c: any) => {
  const id = encodeURIComponent(idOrSlug(c));
  const ckind = sStr(c?.content_kind ?? c?.contentKind ?? c?.type);

  // 1) OER only
  if (isOerLike(c)) {
    if (ckind.includes('video')) return `/oer/collections/${id}`;
    return `/oer/${id}`; // OER text/books to OER reader
  }

  // 2) Non-OER videos → recorded video/detail
  if (isVideoish(c)) return `/class-vault/${id}`;

  // 3) Everything else (including non-OER “text/PDF-ish”) → normal course details
  return `/courses/${encodeURIComponent(String(c?.id ?? ''))}`;
};

// Dev logger that STILL returns href in prod
const debugHrefFor = (item: any, section: string) => {
  const href = getHrefForItem(item);
  if (import.meta.env.DEV) {
    console.log('[HomePage] hrefForItem', {
      section,
      id: idOrSlug(item),
      provider: item?.provider,
      kind: item?.kind,
      content_kind: item?.content_kind,
      href,
    });
  }
  return href;
};

/* ------------------------------------------------------------------------- */

const HomePage: React.FC = () => {
  const prefersReducedMotion = useReducedMotion() ?? false;

  const { filteredProfiles, loading } = useHomePage();
  const backendUrl = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? '';

  const {
    featuredCourses = [], // from courses table (paid + free)
    featuredVideos = [], // from recorded_videos (paid + free)
    recommendedCourses = [],
    fetchFeaturedCourses,
    fetchFeaturedVideos,
    fetchRecommendedCourses,
  } = useCourses({ backendUrl });

  // ENV log
  useEffect(() => {
    console.log('[HomePage] ENV / Backend');
    console.log('VITE_BACKEND_URL =', backendUrl);
  }, [backendUrl]);

  // (b) Use StrictMode-safe effect for initial fetches
  useEffectOnceInStrict(() => {
    if (!backendUrl) return;
    console.log('[HomePage] Initial featured/recommended fetch');
    void fetchFeaturedCourses({ limit: FEATURED_COURSES_LIMIT_DESKTOP * 2, minCount: 1 });
    void fetchFeaturedVideos({ limit: FEATURED_VIDEOS_LIMIT_DESKTOP, minCount: 1 });
    void fetchRecommendedCourses({ limit: RECOMMENDED_COURSES_LIMIT_DESKTOP, minCount: 1 });
  }, [backendUrl, fetchFeaturedCourses, fetchFeaturedVideos, fetchRecommendedCourses]);

  // Track changes
  useEffect(() => {
    console.log('[HomePage] featuredCourses[] changed', {
      len: featuredCourses.length,
      sample: featuredCourses.slice(0, 2),
    });
  }, [featuredCourses]);
  useEffect(() => {
    console.log('[HomePage] featuredVideos[] changed', {
      len: featuredVideos.length,
      sample: featuredVideos.slice(0, 2),
    });
  }, [featuredVideos]);
  useEffect(() => {
    console.log('[HomePage] recommendedCourses[] changed', {
      len: recommendedCourses.length,
      sample: recommendedCourses.slice(0, 2),
    });
  }, [recommendedCourses]);

  /* -------------------------- Featured Tutors --------------------------- */
  const tutorProfiles: Profile[] = useMemo(
    () => filteredProfiles.filter((p) => p.role === 'tutor') as unknown as Profile[],
    [filteredProfiles]
  );

  const resolveTutorImage = (p: any, fallbackName?: string) => {
    const g0 = Array.isArray(p?.gallery) ? p.gallery[0] : undefined;
    if (typeof g0 === 'string' && g0.length > 0) {
      if (/^https?:\/\//i.test(g0)) return g0;
      if (g0.startsWith('/') && backendUrl) return `${backendUrl.replace(/\/+$/, '')}${g0}`;
    }
    return FALLBACK_AVATAR(fallbackName ?? p?.name ?? 'Tutor');
  };

  const featuredTutors = useMemo(() => {
    const rows: {
      id: string;
      name: string;
      subject: string;
      image: string;
      category?: string;
      ratingAvg: number;
      ratingCount: number;
      certified: boolean;
    }[] = tutorProfiles.map((p: any) => {
      const image = resolveTutorImage(p, p?.name || 'Tutor');
      const { avg, count } = extractRating(p);

      return {
        id: p.user_id ?? p.id ?? String(p.name ?? 'Tutor'),
        name: p.name ?? 'Tutor',
        subject: p.category ?? 'Tutor',
        image,
        category: p.category,
        ratingAvg: avg,
        ratingCount: count,
        certified: Boolean(p.certified),
      };
    });

    // Sort by rating (highest first), then by rating count
    rows.sort((a, b) => {
      if (b.ratingAvg !== a.ratingAvg) return b.ratingAvg - a.ratingAvg;
      return b.ratingCount - a.ratingCount;
    });

    // Take up to 12
    return rows.slice(0, FEATURED_TUTOR_LIMIT);
  }, [tutorProfiles, backendUrl]);

  const coursePrice = (c: Course) =>
    typeof c.price === 'number' ? `${c.price} Tokens` : (c.price ?? '');

  /* ----------------------- Ratings Prefetch (Courses) -------------------- */
  const [courseRatings, setCourseRatings] = useState<
    Record<string, { avg: number; count: number }>
  >({});
  const fetchingCourseIdsRef = useRef<Set<string>>(new Set());

  const fetchCourseRatings = async (courseId: string) => {
    if (!backendUrl || fetchingCourseIdsRef.current.has(courseId) || courseRatings[courseId])
      return;
    try {
      fetchingCourseIdsRef.current.add(courseId);
      const res = await fetch(`${backendUrl}/api/reviews/courses/${courseId}`);
      if (!res.ok) return;
      const data = await res.json();
      const avg = Number(data?.avgRating ?? 0) || 0;
      const count = Number(data?.totalReviews ?? 0) || 0;
      setCourseRatings((prev) => (prev[courseId] ? prev : { ...prev, [courseId]: { avg, count } }));
    } catch {
      // silent
    } finally {
      fetchingCourseIdsRef.current.delete(courseId);
    }
  };

  const debouncedFetchCourseRatings = useMemo(
    () => debounce((cid: string) => void fetchCourseRatings(cid), DEBOUNCE_MS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [backendUrl, courseRatings]
  );

  useEffect(() => () => debouncedFetchCourseRatings.cancel(), [debouncedFetchCourseRatings]);

  /* ------------------------ Ratings Prefetch (Videos) -------------------- */
  const [videoRatings, setVideoRatings] = useState<
    Record<string | number, { avg: number; count: number }>
  >({});
  const fetchingVideoIdsRef = useRef<Set<string | number>>(new Set());

  const fetchVideoRating = async (vid: number | string) => {
    if (!backendUrl || fetchingVideoIdsRef.current.has(vid) || videoRatings[vid]) return;
    try {
      fetchingVideoIdsRef.current.add(vid);
      const reviews = await fetchVideoReviews(backendUrl, Number(vid));
      const count = Array.isArray(reviews) ? reviews.length : 0;
      const avg = count
        ? Number(
            (reviews.reduce((s: number, r: any) => s + Number(r.rating), 0) / count).toFixed(2)
          )
        : 0;
      setVideoRatings((prev) => (prev[vid] ? prev : { ...prev, [vid]: { avg, count } }));
    } catch {
      // silent
    } finally {
      fetchingVideoIdsRef.current.delete(vid);
    }
  };

  const debouncedFetchVideoRating = useMemo(
    () => debounce((vid: string | number) => void fetchVideoRating(vid), DEBOUNCE_MS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [backendUrl, videoRatings]
  );

  useEffect(() => () => debouncedFetchVideoRating.cancel(), [debouncedFetchVideoRating]);

  const prefetchCourseOnHover = (cid: string) => debouncedFetchCourseRatings(cid);
  const prefetchVideoOnHover = (vid: number | string) => debouncedFetchVideoRating(vid);

  const [openPreviewId, setOpenPreviewId] = useState<string | number | null>(null);

  /* ---------------------- OER: split by kind (doc/video) ----------------- */
  const [oerDocs, setOerDocs] = useState<OerCollection[]>([]);
  const [oerVideos, setOerVideos] = useState<OerCollection[]>([]);

  // (c) One request per type + AbortController, StrictMode-safe
  useEffectOnceInStrict(() => {
    if (!backendUrl) return;
    const base = backendUrl.replace(/\/+$/, '');
    const ac = new AbortController();

    const load = async () => {
      const urlDocs = `${base}/api/oer/collections?kind=doc&limit=48`;
      const urlVids = `${base}/api/oer/collections?kind=video&limit=48`;
      console.log('[HomePage] OER collections fetch');
      console.log('DOCS URL:', urlDocs);
      console.log('VIDEOS URL:', urlVids);

      const t0 = Date.now();
      try {
        const [docsRes, vidsRes] = await Promise.all([
          fetch(urlDocs, { signal: ac.signal }),
          fetch(urlVids, { signal: ac.signal }),
        ]);

        console.log('DOCS status:', docsRes.status);
        console.log('VIDEOS status:', vidsRes.status);

        const docs = docsRes.ok ? await docsRes.json().catch(() => []) : [];
        const vids = vidsRes.ok ? await vidsRes.json().catch(() => []) : [];
        setOerDocs(Array.isArray(docs) ? docs : []);
        setOerVideos(Array.isArray(vids) ? vids : []);
        console.log('DOCS length:', Array.isArray(docs) ? docs.length : 0);
        console.log('VIDEOS length:', Array.isArray(vids) ? vids.length : 0);
      } catch (err) {
        console.warn('[HomePage] OER fetch error', err);
      } finally {
        console.log('[HomePage] OER fetch durMs', Date.now() - t0);
      }
    };

    void load();
    return () => ac.abort();
  }, [backendUrl]);

  /* ----------------------- Featured (MIXED per requirements) ------------- */

  // 1) Featured VIDEOS: mix recorded_videos + OER video-only collections (tutors first)
  const recordedFeatured = useMemo(
    () => featuredVideos.filter((v: any) => isVideoish(v)).slice(0, FEATURED_VIDEOS_LIMIT_DESKTOP),
    [featuredVideos]
  );

  // We'll keep at least 2 OER collections for the Free Videos section (if available),
  // and also ensure at most half of Featured tiles are OER (so tutors stay prioritized).
  const featuredVideosMixed = useMemo(() => {
    const oerPool = oerVideos.slice(0, FEATURED_VIDEOS_LIMIT_DESKTOP * 2);

    const need = Math.max(0, FEATURED_VIDEOS_LIMIT_DESKTOP - recordedFeatured.length);
    const maxOerShare = Math.ceil(FEATURED_VIDEOS_LIMIT_DESKTOP / 2); // <= half of Featured can be OER
    const reserveForFree = Math.min(2, Math.max(0, oerPool.length)); // keep ≥2 for Free grid when possible
    const availableOerForFeatured = Math.max(0, oerPool.length - reserveForFree);

    const useOerCount = Math.max(0, Math.min(need, maxOerShare, availableOerForFeatured));

    const oerForFeatured = oerPool.slice(0, useOerCount);

    type MixedVideoItem =
      | { kind: 'recorded'; data: any }
      | { kind: 'oerCollection'; data: OerCollection };

    const a = recordedFeatured.map((v) => ({ kind: 'recorded', data: v }) as MixedVideoItem);
    const b = oerForFeatured.map((c) => ({ kind: 'oerCollection', data: c }) as MixedVideoItem);

    const mixed = interleave(a, b, FEATURED_VIDEOS_LIMIT_DESKTOP) as MixedVideoItem[];

    console.log('[HomePage] featuredVideosMixed sizes', {
      recorded: a.length,
      oerForFeatured: b.length,
      mixedShown: mixed.length,
      reservedForFree: reserveForFree,
    });

    return mixed;
  }, [recordedFeatured, oerVideos]);

  // Prefetch ratings for the recorded videos we actually show
  useEffect(() => {
    featuredVideosMixed.forEach((item) => {
      if (item.kind === 'recorded') debouncedFetchVideoRating(item.data.id);
    });
  }, [featuredVideosMixed, debouncedFetchVideoRating]);

  // Track which OER video collections we already used in Featured Videos
  const usedOerVideoCollectionIds = useMemo(() => {
    const s = new Set<string | number>();
    featuredVideosMixed.forEach((it) => {
      if (it.kind === 'oerCollection') s.add(it.data.id);
    });
    return s;
  }, [featuredVideosMixed]);

  // 2) Featured COURSES: mix normal courses (courses table) + OER docs (PDF/HTML/books) (tutors first)
  const featuredNormalCourses = useMemo(
    () => featuredCourses.slice(0, FEATURED_COURSES_LIMIT_DESKTOP * 2),
    [featuredCourses]
  );

  const freeOerDocs = useMemo(
    () => oerDocs.slice(0, FEATURED_COURSES_LIMIT_DESKTOP * 2),
    [oerDocs]
  );

  const featuredCoursesDisplay = useMemo(() => {
    const mixed = interleave<any, OerCollection>(
      featuredNormalCourses,
      freeOerDocs,
      FEATURED_COURSES_LIMIT_DESKTOP
    );
    console.log('[HomePage] featuredCoursesDisplay sizes', {
      normalCourses: featuredNormalCourses.length,
      freeOerDocs: freeOerDocs.length,
      mixedShown: mixed.length,
    });
    return mixed;
  }, [featuredNormalCourses, freeOerDocs]);

  // Track OER docs consumed in Featured Courses (to avoid duplication below)
  const usedFreeDocIds = useMemo(() => {
    const s = new Set<string | number>();
    featuredCoursesDisplay.forEach((c: any) => {
      if (isDocish(c)) s.add(c.id);
    });
    return s;
  }, [featuredCoursesDisplay]);

  // Recommended courses (NO videos)
  const recommendedCoursesOnly = useMemo(
    () => recommendedCourses.filter((c: any) => !isVideoish(c)),
    [recommendedCourses]
  );

  // Extra logs
  useEffect(() => {
    console.log('[HomePage] Free Courses section', {
      allOerDocs: oerDocs.length,
      usedInFeatured: usedFreeDocIds.size,
      rendered: Math.min(
        FREE_COURSES_LIMIT_DESKTOP,
        Math.max(0, oerDocs.length - usedFreeDocIds.size)
      ),
    });
  }, [oerDocs, usedFreeDocIds]);

  useEffect(() => {
    console.log('[HomePage] Free Videos section', {
      allOerVideoCols: oerVideos.length,
      usedInFeatured: usedOerVideoCollectionIds.size,
      rendered: Math.min(
        FREE_VIDEOS_LIMIT_DESKTOP,
        Math.max(0, oerVideos.length - usedOerVideoCollectionIds.size)
      ),
    });
  }, [oerVideos, usedOerVideoCollectionIds]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-softGray dark:bg-darkBg text-darkText dark:text-darkTextPrimary">
        Loading tutor profiles...
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-softGray dark:bg-darkBg text-darkText dark:text-darkTextPrimary overflow-x-hidden">
      {!prefersReducedMotion && (
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full blur-3xl bg-indigo-300/20" />
          <div className="absolute top-10 right-10 h-80 w-80 rounded-full blur-3xl bg-cyan-300/20" />
        </div>
      )}

      <main className="flex-1">
        <div className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-8 lg:py-10">
          {/* Hero */}
          <motion.section
            className="relative overflow-hidden rounded-2xl"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <div
              className="min-h-[52vh] lg:min-h-[60vh] bg-cover bg-center flex flex-col items-center justify-center gap-4 sm:gap-5 px-4 text-center"
              style={{
                backgroundImage: `linear-gradient(rgba(0,0,0,.25), rgba(0,0,0,.55)), url("${HERO_BG}")`,
              }}
            >
              <motion.h2
                className="font-black tracking-tight text-[clamp(1.75rem,4vw,3.25rem)] text-darkTextPrimary"
                variants={fadeUp}
                initial="hidden"
                animate="show"
              >
                Unlock Your Potential with Expert Tutors
              </motion.h2>

              <motion.p
                className="max-w-[800px] text-darkTextPrimary/90"
                variants={fadeUp}
                initial="hidden"
                animate="show"
                transition={{ delay: 0.08 }}
              >
                Connect with top-rated tutors for personalized learning experiences.
              </motion.p>

              <motion.div
                variants={fadeUp}
                initial="hidden"
                animate="show"
                transition={{ delay: 0.16 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex flex-col md:flex-row items-center gap-3">
                  <Link
                    to="/find-tutor"
                    className="inline-flex items-center justify-center rounded-xl h-11 px-6 bg-primary text-white font-semibold shadow-sm hover:shadow transition active:translate-y-[1px]"
                  >
                    Find a Tutor
                  </Link>
                  <Link
                    to="/robot-teach"
                    className="inline-flex items-center justify-center rounded-xl h-11 px-6 bg-white text-primary font-semibold shadow-sm hover:shadow transition active:translate-y-[1px]"
                  >
                    Learn with A.i
                  </Link>
                </div>
              </motion.div>
            </div>
          </motion.section>

          {/* ⭐ Featured Tutors */}
          <motion.section
            className="mt-10"
            variants={sectionStagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.15 }}
          >
            <motion.div className="flex items-center justify-between px-1" variants={fadeUp}>
              <h3 className="text-[22px] font-bold tracking-tight">Featured Tutors</h3>
              <Link to="/find-tutor" className="text-primary hover:underline">
                See All Tutors
              </Link>
            </motion.div>

            {/* Mobile */}
            <div className="mt-4 grid grid-cols-2 gap-4 md:hidden">
              {featuredTutors.length === 0 && (
                <p className="text-darkTextSecondary px-1 col-span-2">No featured tutors yet.</p>
              )}
              {featuredTutors.slice(0, FEATURED_TUTOR_LIMIT_MOBILE).map((t, idx) => (
                <motion.div
                  key={`${t.id}-${t.subject}`}
                  variants={fadeInScale}
                  transition={{ delay: 0.02 * idx }}
                  whileHover={{ y: -3 }}
                >
                  <Link
                    to={`/profile/${t.id}`}
                    className="block rounded-2xl ring-1 ring-gray-200 dark:ring-darkCard hover:ring-primary transition p-3 bg-white dark:bg-[#0f1821]"
                  >
                    <div className="relative mx-auto w-20 aspect-square">
                      <div
                        className="h-full w-full bg-center bg-cover rounded-full ring-1 ring-gray-200 dark:ring-darkCard"
                        style={{ backgroundImage: `url("${t.image}")` }}
                      />
                      {t.certified && (
                        <div className="absolute top-1 left-1 inline-flex items-center gap-1 rounded-full bg-emerald-600/90 text-white text-[10px] px-2 py-0.5 shadow">
                          <FontAwesomeIcon icon={faCheckCircle as IconProp} />
                          Certified
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-center">
                      <p className="font-medium truncate">{t.name}</p>
                      <p className="text-xs text-darkTextSecondary truncate">{t.subject}</p>
                      <div className="mt-1 flex items-center justify-center gap-1.5">
                        <StarRow avg={t.ratingAvg} />
                        {t.ratingCount > 0 && (
                          <span className="text-[11px] text-darkTextSecondary">
                            ({t.ratingCount})
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>

            {/* Desktop */}
            <div className="mt-4 hidden md:grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {featuredTutors.length === 0 && (
                <p className="text-darkTextSecondary px-1 col-span-full">No featured tutors yet.</p>
              )}
              {featuredTutors.slice(0, FEATURED_TUTOR_LIMIT_DESKTOP).map((t, idx) => (
                <motion.div
                  key={`${t.id}-${t.subject}`}
                  variants={fadeInScale}
                  transition={{ delay: 0.02 * idx }}
                  whileHover={{ y: -4 }}
                >
                  <Link
                    to={`/profile/${t.id}`}
                    className="group rounded-2xl ring-1 ring-gray-200 dark:ring-darkCard hover:ring-primary transition p-4 bg-white dark:bg-[#0f1821] block"
                  >
                    <div className="relative mx-auto w-24 aspect-square">
                      <div
                        className="h-full w-full bg-center bg-cover rounded-full ring-1 ring-gray-200 dark:ring-darkCard group-hover:ring-primary transition"
                        style={{ backgroundImage: `url("${t.image}")` }}
                      />
                      {t.certified && (
                        <div className="absolute top-1 left-1 inline-flex items-center gap-1 rounded-full bg-emerald-600/90 text-white text-[10px] px-2 py-0.5 shadow">
                          <FontAwesomeIcon icon={faCheckCircle as IconProp} />
                          Certified
                        </div>
                      )}
                    </div>
                    <div className="mt-3 text-center">
                      <p className="font-medium truncate">{t.name}</p>
                      <p className="text-darkTextSecondary">{t.subject}</p>
                      <div className="mt-1 flex items-center justify-center gap-2">
                        <StarRow avg={t.ratingAvg} />
                        {t.ratingCount > 0 && (
                          <span className="text-xs text-darkTextSecondary">({t.ratingCount})</span>
                        )}
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* ⭐ Featured Videos (MIX: recorded + OER video-only collections) */}
          <motion.section
            className="mt-12"
            variants={sectionStagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.15 }}
          >
            <motion.div className="flex items-center justify-between px-1" variants={fadeUp}>
              <h3 className="text-[22px] font-bold tracking-tight">Featured Videos</h3>
              <Link to="/videos" className="text-primary hover:underline">
                See All
              </Link>
            </motion.div>

            {/* Mobile */}
            <div className="mt-4 grid grid-cols-1 gap-4 md:hidden">
              {featuredVideosMixed.length === 0 && (
                <p className="text-darkTextSecondary px-1">No videos to show yet.</p>
              )}
              {featuredVideosMixed.slice(0, FEATURED_VIDEOS_LIMIT_MOBILE).map((item, idx) => {
                if (item.kind === 'recorded') {
                  const v = item.data;
                  const subject = v?.subject ?? v?.category ?? v?.topic ?? v?.title ?? 'Video';
                  const grade = v?.grade_level ?? v?.grade ?? v?.level ?? '—';
                  const priceTokens = Number.isFinite(Number(v?.price)) ? Number(v?.price) : 0;

                  const base = extractRating(v);
                  const r = videoRatings[v.id] ?? base;

                  const thumb =
                    v?.thumbnail_url || v?.thumb || v?.thumbnail || v?.previewImage || '';
                  const previewSrc =
                    v?.preview_url || v?.previewUrl || v?.preview || v?.sample || '';
                  const isControls = openPreviewId === v.id;

                  // 🔍 debug + navigation target
                  const href = debugHrefFor(v, 'FeaturedVideos:recorded');

                  return (
                    <motion.div
                      key={`vid-m-rec-${v.id}`}
                      variants={fadeInScale}
                      transition={{ delay: 0.02 * idx }}
                      whileHover={{ y: -3 }}
                      onMouseEnter={() => prefetchVideoOnHover(v.id)}
                    >
                      <div className="bg-white dark:bg-[#0f1821] rounded-xl overflow-hidden ring-1 ring-gray-200 dark:ring-darkCard hover:ring-primary transition">
                        <div className="relative">
                          {previewSrc ? (
                            <>
                              <video
                                key={String(v.id) + String(isControls)}
                                src={previewSrc}
                                poster={thumb || undefined}
                                className="w-full aspect-video object-cover"
                                muted
                                playsInline
                                loop
                                autoPlay
                                controls={isControls}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenPreviewId((prev) => (prev === v.id ? null : v.id))
                                }
                                className="absolute inset-0"
                                aria-label={isControls ? 'Hide controls' : 'Show controls'}
                                title={isControls ? 'Hide controls' : 'Show controls'}
                              />
                            </>
                          ) : (
                            <div
                              className="w-full aspect-video bg-center bg-cover flex items-center justify-center text-white text-5xl"
                              style={{ backgroundImage: `url("${thumb}")` }}
                              aria-label={`${subject} preview not available`}
                            >
                              <FontAwesomeIcon
                                icon={faPlayCircle as IconProp}
                                className="drop-shadow"
                              />
                            </div>
                          )}
                        </div>

                        <div className="p-4">
                          <h4 className="font-semibold truncate">{v.title ?? subject}</h4>
                          <div className="mt-1 flex items-center gap-2">
                            <StarRow avg={r.avg} />
                            {r.count > 0 && (
                              <span className="text-xs text-darkTextSecondary">({r.count})</span>
                            )}
                          </div>
                          <p className="text-sm text-darkTextSecondary mt-1">
                            {subject} • Grade {grade}
                          </p>
                          <p className="text-sm mt-3">
                            <span className="font-medium">Price:</span> {priceTokens.toFixed(0)}{' '}
                            tokens
                          </p>
                          <div className="mt-3">
                            <Link
                              to={href || `/class-vault/${v.id}`}
                              className="inline-flex items-center justify-center rounded-xl h-9 px-4 bg-primary text-white text-sm font-semibold hover:brightness-110"
                            >
                              Purchase
                            </Link>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                // OER video collection card → canonical OER collection route (with debug)
                const col = item.data;
                const title = col?.title ?? 'Collection';
                const thumb = col?.thumbnail_url || col?.thumb || '';
                const itemsCount = col?.items_count ?? 0;

                const href = debugHrefFor(col, 'FeaturedVideos:oerCollection');

                return (
                  <motion.div
                    key={`vid-m-oer-${col.id}`}
                    variants={fadeInScale}
                    transition={{ delay: 0.02 * idx }}
                    whileHover={{ y: -3 }}
                  >
                    <Link
                      to={hrefForItem({ id: col.id, kind: 'video' })}
                      className="block bg-white dark:bg-[#0f1821] rounded-xl overflow-hidden ring-1 ring-gray-200 dark:ring-darkCard hover:ring-primary transition"
                    >
                      {thumb ? (
                        <img src={thumb} alt={title} className="w-full aspect-video object-cover" />
                      ) : (
                        <div className="w-full aspect-video bg-black/70" />
                      )}
                      <div className="p-4">
                        <h4 className="font-semibold truncate">{title}</h4>
                        <p className="text-sm text-darkTextSecondary mt-1">
                          Free Video Collection • {itemsCount} item
                          {itemsCount === 1 ? '' : 's'}
                        </p>
                        <div className="mt-3">
                          <span className="inline-flex items-center justify-center rounded-xl h-9 px-4 bg-primary text-white text-sm font-semibold hover:brightness-110">
                            View Collection
                          </span>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>

            {/* Desktop */}
            <div className="mt-4 hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {featuredVideosMixed.length === 0 && (
                <p className="text-darkTextSecondary px-1 col-span-full">No videos to show yet.</p>
              )}

              {featuredVideosMixed.slice(0, FEATURED_VIDEOS_LIMIT_DESKTOP).map((item, idx) => {
                if (item.kind === 'recorded') {
                  const v = item.data;
                  const subject = v?.subject ?? v?.category ?? v?.topic ?? v?.title ?? 'Video';
                  const grade = v?.grade_level ?? v?.grade ?? v?.level ?? '—';
                  const priceTokens = Number.isFinite(Number(v?.price)) ? Number(v?.price) : 0;

                  const base = extractRating(v);
                  const r = videoRatings[v.id] ?? base;

                  const thumb =
                    v?.thumbnail_url || v?.thumb || v?.thumbnail || v?.previewImage || '';
                  const previewSrc =
                    v?.preview_url || v?.previewUrl || v?.preview || v?.sample || '';
                  const isControls = openPreviewId === v.id;

                  const href = debugHrefFor(v, 'FeaturedVideos:recorded');

                  return (
                    <motion.div
                      key={`vid-rec-${v.id}`}
                      variants={fadeInScale}
                      transition={{ delay: 0.02 * idx }}
                      whileHover={{ y: -4 }}
                      onMouseEnter={() => prefetchVideoOnHover(v.id)}
                    >
                      <div className="bg-white dark:bg-[#0f1821] rounded-xl overflow-hidden ring-1 ring-gray-200 dark:ring-darkCard hover:ring-primary transition">
                        <div className="relative">
                          {previewSrc ? (
                            <>
                              <video
                                key={String(v.id) + String(isControls)}
                                src={previewSrc}
                                poster={thumb || undefined}
                                className="w-full aspect-video object-cover"
                                muted
                                playsInline
                                loop
                                autoPlay
                                controls={isControls}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenPreviewId((prev) => (prev === v.id ? null : v.id))
                                }
                                className="absolute inset-0"
                                aria-label={isControls ? 'Hide controls' : 'Show controls'}
                                title={isControls ? 'Hide controls' : 'Show controls'}
                              />
                            </>
                          ) : (
                            <div
                              className="w-full aspect-video bg-center bg-cover flex items-center justify-center text-white text-5xl"
                              style={{ backgroundImage: `url("${thumb}")` }}
                              aria-label={`${subject} preview not available`}
                            >
                              <FontAwesomeIcon
                                icon={faPlayCircle as IconProp}
                                className="drop-shadow"
                              />
                            </div>
                          )}
                        </div>

                        <div className="p-4">
                          <h4 className="font-semibold truncate">{v.title ?? subject}</h4>
                          <div className="mt-1 flex items-center gap-2">
                            <StarRow avg={r.avg} />
                            {r.count > 0 && (
                              <span className="text-xs text-darkTextSecondary">({r.count})</span>
                            )}
                          </div>
                          <p className="text-sm text-darkTextSecondary mt-1">
                            {subject} • Grade {grade}
                          </p>
                          <p className="text-sm mt-3">
                            <span className="font-medium">Price:</span> {priceTokens.toFixed(0)}{' '}
                            tokens
                          </p>
                          <div className="mt-3">
                            <Link
                              to={href || `/class-vault/${v.id}`}
                              className="inline-flex items-center justify-center rounded-lg h-9 px-4 bg-primary text-white text-sm font-medium hover:brightness-110"
                            >
                              Purchase
                            </Link>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                // OER video collection → canonical route (with debug)
                const col = item.data;
                const title = col?.title ?? 'Collection';
                const thumb = col?.thumbnail_url || col?.thumb || '';
                const itemsCount = col?.items_count ?? 0;

                const href = debugHrefFor(col, 'FeaturedVideos:oerCollection');

                return (
                  <motion.div
                    key={`vid-oer-${col.id}`}
                    variants={fadeInScale}
                    transition={{ delay: 0.02 * idx }}
                    whileHover={{ y: -4 }}
                  >
                    <Link
                      to={hrefForItem({ id: col.id, kind: 'video' })}
                      className="block bg-white dark:bg-[#0f1821] rounded-xl overflow-hidden ring-1 ring-gray-200 dark:ring-darkCard hover:ring-primary transition"
                    >
                      {thumb ? (
                        <img src={thumb} alt={title} className="w-full aspect-video object-cover" />
                      ) : (
                        <div className="w-full aspect-video bg-black/70" />
                      )}
                      <div className="p-4">
                        <h4 className="font-semibold truncate">{title}</h4>
                        <p className="text-sm text-darkTextSecondary mt-1">
                          Free Video Collection • {itemsCount} item
                          {itemsCount === 1 ? '' : 's'}
                        </p>
                        <div className="mt-3">
                          <span className="inline-flex items-center justify-center rounded-lg h-9 px-4 bg-primary text-white text-sm font-medium hover:brightness-110">
                            View Collection
                          </span>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </motion.section>

          {/* ⭐ Featured Courses (MIX: normal courses + OER docs) */}
          <motion.section
            className="mt-12"
            variants={sectionStagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.15 }}
          >
            <motion.div className="flex items-center justify-between px-1" variants={fadeUp}>
              <h3 className="text-[22px] font-bold tracking-tight">Featured Courses</h3>
              <Link to="/courses" className="text-primary hover:underline">
                Browse All
              </Link>
            </motion.div>

            {/* Mobile */}
            <div className="mt-4 grid grid-cols-2 gap-4 md:hidden">
              {featuredCoursesDisplay.length === 0 && (
                <p className="text-darkTextSecondary px-1 col-span-2">No featured courses yet.</p>
              )}
              {featuredCoursesDisplay
                .slice(0, FEATURED_COURSES_LIMIT_MOBILE)
                .map((c: any, idx: number) => {
                  const cid = String(c.id);
                  const base = extractRating(c);
                  const r = courseRatings[cid] ?? base;
                  const free = isFreeCourse(c);

                  const href = debugHrefFor(c, 'FeaturedCourses');

                  return (
                    <motion.div
                      key={`featc-m-${cid}`}
                      variants={fadeInScale}
                      transition={{ delay: 0.02 * idx }}
                      whileHover={{ y: -3 }}
                    >
                      <Link
                        to={href}
                        className="block bg-white dark:bg-[#0f1821] rounded-xl overflow-hidden ring-1 ring-gray-200 dark:ring-darkCard hover:ring-primary transition"
                        onMouseEnter={() => {
                          if (isRealCourse(c)) prefetchCourseOnHover(String(c.id));
                        }}
                        onClick={() => debugHrefFor(c, 'click:FeaturedCourses')}
                      >
                        <CourseHero course={c} backendUrl={backendUrl} />
                        <div className="p-3">
                          <h4 className="font-semibold text-sm truncate">{c.title}</h4>
                          <div className="mt-1 flex items-center gap-1.5">
                            <StarRow avg={r.avg} />
                            {r.count > 0 && (
                              <span className="text-[11px] text-darkTextSecondary">
                                ({r.count})
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-darkTextSecondary line-clamp-2 mt-1">
                            {c.description ||
                              (free
                                ? 'Open & free to start learning.'
                                : 'Learn with a top-rated course.')}
                          </p>
                          <div className="mt-2 text-[12px] text-darkTextSecondary">
                            {free ? (
                              <>
                                <span className="inline-flex items-center rounded bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 px-2 h-6 mr-2">
                                  Free
                                </span>
                                <span className="inline-flex items-center rounded bg-[#e7edf4] dark:bg-[#172534] px-2 h-6">
                                  Level: {c.level ?? '—'}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="inline-flex items-center rounded bg-[#e7edf4] dark:bg-[#172534] px-2 h-6 mr-2">
                                  Level: {c.level ?? '—'}
                                </span>
                                {c.price != null && isRealCourse(c) && (
                                  <span className="inline-flex items-center rounded bg-[#e7edf4] dark:bg-[#172534] px-2 h-6">
                                    {coursePrice(c)}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
            </div>

            {/* Desktop */}
            <div className="mt-4 hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {featuredCoursesDisplay.length === 0 && (
                <p className="text-darkTextSecondary px-1 col-span-full">
                  No featured courses yet.
                </p>
              )}
              {featuredCoursesDisplay
                .slice(0, FEATURED_COURSES_LIMIT_DESKTOP)
                .map((c: any, idx: number) => {
                  const cid = String(c.id);
                  const base = extractRating(c);
                  const r = courseRatings[cid] ?? base;
                  const free = isFreeCourse(c);

                  const href = debugHrefFor(c, 'FeaturedCourses');

                  return (
                    <motion.div
                      key={`featc-${cid}`}
                      variants={fadeInScale}
                      transition={{ delay: 0.02 * idx }}
                      whileHover={{ y: -4 }}
                    >
                      <Link
                        to={href}
                        className="block bg-white dark:bg-[#0f1821] rounded-xl overflow-hidden ring-1 ring-gray-200 dark:ring-darkCard hover:ring-primary transition"
                        onMouseEnter={() => {
                          if (isRealCourse(c)) prefetchCourseOnHover(cid);
                        }}
                        onClick={() => debugHrefFor(c, 'click:FeaturedCourses')}
                      >
                        <CourseHero course={c} backendUrl={backendUrl} />
                        <div className="p-4">
                          <h4 className="font-semibold truncate">{c.title}</h4>
                          <div className="mt-1 flex items-center gap-2">
                            <StarRow avg={r.avg} />
                            {r.count > 0 && (
                              <span className="text-xs text-darkTextSecondary">({r.count})</span>
                            )}
                          </div>
                          <p className="text-sm text-darkTextSecondary line-clamp-2 mt-1">
                            {c.description ||
                              (free
                                ? 'Open & free to start learning.'
                                : 'Learn with a top-rated course.')}
                          </p>
                          <div className="mt-3 text-sm text-darkTextSecondary">
                            {free ? (
                              <>
                                <span className="inline-flex items-center rounded bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 px-2 h-7 mr-2">
                                  Free
                                </span>
                                <span className="inline-flex items-center rounded bg-[#e7edf4] dark:bg-[#172534] px-2 h-7">
                                  Level: {c.level ?? '—'}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="inline-flex items-center rounded bg-[#e7edf4] dark:bg-[#172534] px-2 h-7 mr-2">
                                  Level: {c.level ?? '—'}
                                </span>
                                {c.price != null && isRealCourse(c) && (
                                  <span className="inline-flex items-center rounded bg-[#e7edf4] dark:bg-[#172534] px-2 h-7">
                                    {coursePrice(c)}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
            </div>
          </motion.section>

          {/* ⭐ Free Courses (OER docs ONLY) — exclude those used in Featured */}
          <motion.section
            className="mt-12"
            variants={sectionStagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.15 }}
          >
            <motion.div className="flex items-center justify-between px-1" variants={fadeUp}>
              <h3 className="text-[22px] font-bold tracking-tight">Free Courses</h3>
              <Link to="/courses?free=1" className="text-primary hover:underline">
                Browse Free
              </Link>
            </motion.div>

            {(() => {
              const freeFiltered: OerCollection[] = oerDocs.filter(
                (c: OerCollection) => !usedFreeDocIds.has(c.id)
              );

              return (
                <>
                  {/* Mobile */}
                  <div className="mt-4 grid grid-cols-2 gap-4 md:hidden">
                    {freeFiltered.length === 0 && (
                      <p className="text-darkTextSecondary px-1 col-span-2">No free courses yet.</p>
                    )}
                    {freeFiltered
                      .slice(0, FREE_COURSES_LIMIT_MOBILE)
                      .map((c: OerCollection, idx: number) => {
                        const cid = String(c.id);
                        const base = extractRating(c);
                        const r = courseRatings[cid] ?? base;

                        const href = debugHrefFor(c, 'FreeCourses');

                        return (
                          <motion.div
                            key={`free-m-${cid}`}
                            variants={fadeInScale}
                            transition={{ delay: 0.02 * idx }}
                            whileHover={{ y: -3 }}
                          >
                            <Link
                              to={href}
                              className="block bg-white dark:bg-[#0f1821] rounded-xl overflow-hidden ring-1 ring-gray-200 dark:ring-darkCard hover:ring-primary transition"
                            >
                              <CourseHero course={c as any} backendUrl={backendUrl} />
                              <div className="p-3">
                                <h4 className="font-semibold text-sm truncate">{c.title}</h4>
                                <div className="mt-1 flex items-center gap-1.5">
                                  <StarRow avg={r.avg} />
                                  {r.count > 0 && (
                                    <span className="text-[11px] text-darkTextSecondary">
                                      ({r.count})
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-darkTextSecondary line-clamp-2 mt-1">
                                  {c.description || 'Open & free to start learning.'}
                                </p>
                                <div className="mt-2 text-[12px]">
                                  <span className="inline-flex items-center rounded bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 px-2 h-6 mr-2">
                                    Free
                                  </span>
                                  <span className="inline-flex items-center rounded bg-[#e7edf4] dark:bg-[#172534] px-2 h-6">
                                    Level: {(c as any).level ?? '—'}
                                  </span>
                                </div>
                              </div>
                            </Link>
                          </motion.div>
                        );
                      })}
                  </div>

                  {/* Desktop */}
                  <div className="mt-4 hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {freeFiltered.length === 0 && (
                      <p className="text-darkTextSecondary px-1 col-span-full">
                        No free courses yet.
                      </p>
                    )}
                    {freeFiltered
                      .slice(0, FREE_COURSES_LIMIT_DESKTOP)
                      .map((c: OerCollection, idx: number) => {
                        const cid = String(c.id);
                        const base = extractRating(c);
                        const r = courseRatings[cid] ?? base;

                        const href = debugHrefFor(c, 'FreeCourses');

                        return (
                          <motion.div
                            key={`free-${cid}`}
                            variants={fadeInScale}
                            transition={{ delay: 0.02 * idx }}
                            whileHover={{ y: -4 }}
                          >
                            <Link
                              to={href}
                              className="block bg-white dark:bg-[#0f1821] rounded-xl overflow-hidden ring-1 ring-gray-200 dark:ring-darkCard hover:ring-primary transition"
                            >
                              <CourseHero course={c as any} backendUrl={backendUrl} />
                              <div className="p-4">
                                <h4 className="font-semibold truncate">{c.title}</h4>
                                <div className="mt-1 flex items-center gap-2">
                                  <StarRow avg={r.avg} />
                                  {r.count > 0 && (
                                    <span className="text-xs text-darkTextSecondary">
                                      ({r.count})
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-darkTextSecondary line-clamp-2 mt-1">
                                  {c.description || 'Open & free to start learning.'}
                                </p>
                                <div className="mt-3 text-sm">
                                  <span className="inline-flex items-center rounded bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 px-2 h-7 mr-2">
                                    Free
                                  </span>
                                  <span className="inline-flex items-center rounded bg-[#e7edf4] dark:bg-[#172534] px-2 h-7">
                                    Level: {(c as any).level ?? '—'}
                                  </span>
                                </div>
                              </div>
                            </Link>
                          </motion.div>
                        );
                      })}
                  </div>
                </>
              );
            })()}
          </motion.section>

          {/* ⭐ Free Videos (from OER, VIDEO-ONLY) — exclude those used in Featured */}
          <motion.section
            className="mt-12"
            variants={sectionStagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.15 }}
          >
            <motion.div className="flex items-center justify-between px-1" variants={fadeUp}>
              <h3 className="text-[22px] font-bold tracking-tight">Free Videos</h3>
              <Link to="/videos" className="text-primary hover:underline">
                See All
              </Link>
            </motion.div>

            {(() => {
              const freeVideoCols: OerCollection[] = oerVideos.filter(
                (c: OerCollection) => !usedOerVideoCollectionIds.has(c.id)
              );

              return (
                <>
                  {/* Mobile */}
                  <div className="mt-4 grid grid-cols-1 gap-4 md:hidden">
                    {freeVideoCols.length === 0 && (
                      <p className="text-darkTextSecondary px-1">No free videos to show yet.</p>
                    )}
                    {freeVideoCols
                      .slice(0, FREE_VIDEOS_LIMIT_MOBILE)
                      .map((col: OerCollection, idx: number) => {
                        const href = debugHrefFor(col, 'FreeVideos');

                        return (
                          <motion.div
                            key={`col-m-${col.id}`}
                            variants={fadeInScale}
                            transition={{ delay: 0.02 * idx }}
                            whileHover={{ y: -3 }}
                          >
                            <Link
                              to={hrefForItem({ id: col.id, kind: 'video' })}
                              className="block bg-white dark:bg-[#0f1821] rounded-xl overflow-hidden ring-1 ring-gray-200 dark:ring-darkCard hover:ring-primary transition"
                            >
                              {col.thumbnail_url ? (
                                <img
                                  src={col.thumbnail_url}
                                  alt={col.title}
                                  className="w-full aspect-video object-cover"
                                />
                              ) : (
                                <div className="w-full aspect-video bg-black/70" />
                              )}
                              <div className="p-4">
                                <h4 className="font-semibold truncate">{col.title}</h4>
                                <p className="text-sm text-darkTextSecondary mt-1">
                                  Free Video Collection • {col.items_count ?? 0} item
                                  {(col.items_count ?? 0) === 1 ? '' : 's'}
                                </p>
                                <div className="mt-3">
                                  <span className="inline-flex items-center justify-center rounded-xl h-9 px-4 bg-primary text-white text-sm font-semibold hover:brightness-110">
                                    View Collection
                                  </span>
                                </div>
                              </div>
                            </Link>
                          </motion.div>
                        );
                      })}
                  </div>

                  {/* Desktop */}
                  <div className="mt-4 hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {freeVideoCols.length === 0 && (
                      <p className="text-darkTextSecondary px-1 col-span-full">
                        No free videos to show yet.
                      </p>
                    )}
                    {freeVideoCols
                      .slice(0, FREE_VIDEOS_LIMIT_DESKTOP)
                      .map((col: OerCollection, idx: number) => {
                        const href = debugHrefFor(col, 'FreeVideos');

                        return (
                          <motion.div
                            key={`col-${col.id}`}
                            variants={fadeInScale}
                            transition={{ delay: 0.02 * idx }}
                            whileHover={{ y: -4 }}
                          >
                            <Link
                              to={hrefForItem({ id: col.id, kind: 'video' })}
                              className="block bg-white dark:bg-[#0f1821] rounded-xl overflow-hidden ring-1 ring-gray-200 dark:ring-darkCard hover:ring-primary transition"
                            >
                              {col.thumbnail_url ? (
                                <img
                                  src={col.thumbnail_url}
                                  alt={col.title}
                                  className="w-full aspect-video object-cover"
                                />
                              ) : (
                                <div className="w-full aspect-video bg-black/70" />
                              )}
                              <div className="p-4">
                                <h4 className="font-semibold truncate">{col.title}</h4>
                                <p className="text-sm text-darkTextSecondary mt-1">
                                  Free Video Collection • {col.items_count ?? 0} item
                                  {(col.items_count ?? 0) === 1 ? '' : 's'}
                                </p>
                                <div className="mt-3">
                                  <span className="inline-flex items-center justify-center rounded-lg h-9 px-4 bg-primary text-white text-sm font-medium hover:brightness-110">
                                    View Collection
                                  </span>
                                </div>
                              </div>
                            </Link>
                          </motion.div>
                        );
                      })}
                  </div>
                </>
              );
            })()}
          </motion.section>

          {/* ⭐ Recommended Courses (NO VIDEOS) – updated limits */}
          <motion.section
            className="mt-12"
            variants={sectionStagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.15 }}
          >
            <motion.div className="flex items-center justify-between px-1" variants={fadeUp}>
              <h3 className="text-[22px] font-bold tracking-tight">Recommended Courses</h3>
              <Link to="/courses" className="text-primary hover:underline">
                Browse all
              </Link>
            </motion.div>

            {/* Mobile */}
            <div className="mt-4 grid grid-cols-2 gap-4 md:hidden">
              {recommendedCoursesOnly.length === 0 && (
                <p className="text-darkTextSecondary px-1 col-span-2">No recommendations yet.</p>
              )}
              {recommendedCoursesOnly.slice(0, RECOMMENDED_COURSES_LIMIT_MOBILE).map((c, idx) => {
                const cid = String(c.id);
                const base = extractRating(c);
                const r = courseRatings[cid] ?? base;
                return (
                  <motion.div
                    key={`recc-m-${cid}`}
                    variants={fadeInScale}
                    transition={{ delay: 0.02 * idx }}
                    whileHover={{ y: -3 }}
                  >
                    <Link
                      to={getHrefForItem(c)}
                      className="block bg-white dark:bg-[#0f1821] rounded-xl overflow-hidden ring-1 ring-gray-200 dark:ring-darkCard hover:ring-primary transition"
                      onMouseEnter={() => {
                        if (isRealCourse(c)) prefetchCourseOnHover(String(c.id));
                      }}
                    >
                      <CourseHero course={c} backendUrl={backendUrl} />
                      <div className="p-3">
                        <h4 className="font-semibold text-sm truncate">{c.title}</h4>
                        <div className="mt-1 flex items-center gap-1.5">
                          <StarRow avg={r.avg} />
                          {r.count > 0 && (
                            <span className="text-[11px] text-darkTextSecondary">({r.count})</span>
                          )}
                        </div>
                        <p className="text-xs text-darkTextSecondary line-clamp-2 mt-1">
                          {c.description || 'Top picks based on quality and popularity.'}
                        </p>
                        <div className="mt-2">
                          <span className="inline-flex items-center justify-center rounded-lg h-8 px-3 bg-primary text-white text-xs font-medium hover:brightness-110">
                            View Course
                          </span>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>

            {/* Desktop */}
            <div className="mt-4 hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {recommendedCoursesOnly.length === 0 && (
                <p className="text-darkTextSecondary px-1 col-span-full">No recommendations yet.</p>
              )}
              {recommendedCoursesOnly.slice(0, RECOMMENDED_COURSES_LIMIT_DESKTOP).map((c, idx) => {
                const cid = String(c.id);
                const base = extractRating(c);
                const r = courseRatings[cid] ?? base;
                return (
                  <motion.div
                    key={`recc-${cid}`}
                    variants={fadeInScale}
                    transition={{ delay: 0.02 * idx }}
                    whileHover={{ y: -4 }}
                  >
                    <Link
                      to={getHrefForItem(c)}
                      className="block bg-white dark:bg-[#0f1821] rounded-xl overflow-hidden ring-1 ring-gray-200 dark:ring-darkCard hover:ring-primary transition"
                      onMouseEnter={() => {
                        if (isRealCourse(c)) prefetchCourseOnHover(String(c.id));
                      }}
                    >
                      <CourseHero course={c} backendUrl={backendUrl} />
                      <div className="p-4">
                        <h4 className="font-semibold truncate">{c.title}</h4>
                        <div className="mt-1 flex items-center gap-2">
                          <StarRow avg={r.avg} />
                          {r.count > 0 && (
                            <span className="text-xs text-darkTextSecondary">({r.count})</span>
                          )}
                        </div>
                        <p className="text-sm text-darkTextSecondary line-clamp-2 mt-1">
                          {c.description || 'Top picks based on quality and popularity.'}
                        </p>
                        <div className="mt-3">
                          <span className="inline-flex items-center justify-center rounded-lg h-9 px-4 bg-primary text-white text-sm font-medium hover:brightness-110">
                            View Course
                          </span>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </motion.section>
        </div>
      </main>
    </div>
  );
};

export default HomePage;
