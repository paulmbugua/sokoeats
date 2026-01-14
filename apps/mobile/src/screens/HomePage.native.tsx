/* eslint-disable prettier/prettier */
// apps/mobile/src/screens/HomePage.native.tsx

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import debounce from 'lodash.debounce';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import type { SharedValue } from 'react-native-reanimated';

import Animated, {
  Extrapolation,
  FadeIn,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Video, ResizeMode } from 'expo-av';

import { useHomePage, useCourses, useClassVault } from '@mytutorapp/shared/hooks';

import { fetchVideoReviews } from '@mytutorapp/shared/api/classVaultApi';
import { useShopContext } from '@mytutorapp/shared/context';
import { pickImageForCourse } from '../../utils/subjectImages';
import type { MainStackParamList } from '../navigation/types';
import type { Profile, Course, RecordedVideo } from '@mytutorapp/shared/types';

import tw from '../../tailwind';
import { useThemePref } from '../theme/ThemeContext';

/* ------------------------------------------------------------------ */
/* Constants & helpers                                                */
/* ------------------------------------------------------------------ */

const FALLBACK_AVATAR = (name = 'Tutor') =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=223649&color=ffffff`;

const FALLBACK_CARD = (title?: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(title || 'OER')}&background=223649&color=ffffff&size=512`;

const FEATURED_TUTOR_LIMIT = 12;
const VISIBLE_LIMIT = 6;
const DEBOUNCE_MS = 250;

type Ratingish = {
  avgRating?: number;
  rating?: number;
  stars?: number;
  ratingsCount?: number;
  reviewCount?: number;
  totalReviews?: number;
  count?: number;
};

type OerCollection = {
  id: string | number;
  title: string;
  description?: string;
  subject?: string;
  thumbnail_url?: string;
  items_count?: number;
  content_kind?: 'video' | 'doc';
  provider?: string;
  kind?: string;
};

/* ----------------------------- Generic utils ---------------------------- */

function extractRating(x: any): { avg: number; count: number } {
  const avgRaw = x?.avgRating ?? x?.rating ?? x?.stars ?? x?.avg_rating ?? 0;
  const countRaw =
    x?.ratingsCount ?? x?.reviewCount ?? x?.totalReviews ?? x?.ratings_count ?? x?.count ?? 0;
  const avg = Number.isFinite(Number(avgRaw)) ? Number(avgRaw) : 0;
  const count = Number.isFinite(Number(countRaw)) ? Number(countRaw) : 0;
  return { avg, count };
}

function starRow(avg: number): string {
  const rounded = Math.round(avg * 2) / 2;
  const out: string[] = [];
  for (let i = 1; i <= 5; i++) out.push(rounded >= i ? '★' : '☆');
  return out.join('');
}

function resolveTutorImage(p: Profile | Record<string, unknown>, backendUrl: string): string {
  const g = (p as Record<string, unknown>)?.gallery;
  const g0 = Array.isArray(g) ? g[0] : undefined;
  if (typeof g0 === 'string' && g0.length > 0) {
    if (/^https?:\/\//i.test(g0)) return g0;
    if (g0.startsWith('/') && backendUrl) {
      return `${backendUrl.replace(/\/+$/, '')}${g0}`;
    }
  }
  const fallbackName =
    typeof (p as Record<string, unknown>)?.name === 'string'
      ? ((p as Record<string, unknown>).name as string)
      : 'Tutor';
  return FALLBACK_AVATAR(fallbackName);
}

function coursePrice(c: Course): string {
  return typeof c.price === 'number' ? `${c.price} Tokens` : (c.price ?? '');
}

const sStr = (v: any) => String(v ?? '').toLowerCase();
const hasAny = (obj: any, keys: string[]) =>
  keys.some((k) => {
    const v = obj?.[k];
    return v !== undefined && v !== null && String(v).length > 0;
  });

const isVideoish = (c: any): boolean => {
  const kind = sStr(
    c?.content_kind ?? c?.content_type ?? c?.resource_type ?? c?.type ?? c?.category ?? c?.kind
  );
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

const isDocish = (c: any): boolean => {
  const kind = sStr(
    c?.content_kind ?? c?.content_type ?? c?.resource_type ?? c?.type ?? c?.category ?? c?.kind
  );
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

const isRealCourse = (c: any) => !isVideoish(c) && !isDocish(c);

const isOerLike = (c: any) => {
  const provider = sStr(c?.provider);
  const k = sStr(c?.kind);
  const ck = sStr(c?.content_kind ?? c?.contentKind ?? c?.type);
  if (provider === 'oer') return true;
  if (k === 'collection' || k === 'book' || k === 'doc' || k === 'oer') return true;
  if (ck === 'doc' || ck === 'text' || ck === 'pdf' || ck === 'book') return true;
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

const idOrSlug = (c: any) => String(c?.slug ?? c?.id ?? '');

/** Interleave arrays up to a limit */
function interleave<T, U>(a: readonly T[], b: readonly U[], limit: number): Array<T | U> {
  const out: Array<T | U> = [];
  let i = 0;
  let j = 0;
  while (out.length < limit && (i < a.length || j < b.length)) {
    if (i < a.length) {
      const ai = a[i++];
      if (ai !== undefined) out.push(ai);
    }
    if (out.length >= limit) break;
    if (j < b.length) {
      const bj = b[j++];
      if (bj !== undefined) out.push(bj);
    }
  }
  return out;
}

function unwrapCloudinaryFetch(raw?: string | null): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';

  const match = s.match(/^https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/fetch\/[^/]+\/(.+)$/i);
  if (!match?.[1]) return s;

  const encodedPart = match[1];
  let decoded = '';
  try {
    decoded = decodeURIComponent(encodedPart);
  } catch {
    decoded = encodedPart;
  }

  const [beforeQuery = ''] = decoded.split(/[?#]/);
  const lower = beforeQuery.toLowerCase();

  if (lower.endsWith('.svg')) return s;
  if (/^https?:\/\//i.test(decoded)) return decoded;

  return s;
}

/* -------------------- Absolute URL + thumbnail helpers ------------------- */

const toWebBase = (base?: string) => (base || '').replace(/\/+$/, '').replace(/\/api$/i, '');

function toAbsUrl(backendUrl?: string, src?: string | null): string {
  const raw = String(src ?? '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!backendUrl) return '';

  const webBase = toWebBase(backendUrl);
  const root = webBase.replace(/\/+$/, '');

  if (raw.startsWith('/')) return `${root}${raw}`;
  return `${root}/${raw}`;
}

function pickThumb(obj: any, backendUrl?: string): string {
  const candRaw =
    obj?.thumbnail_url ??
    obj?.thumb ??
    obj?.thumbnail ??
    obj?.thumbnailUrl ??
    obj?.thumb_url ??
    obj?.thumbUrl ??
    obj?.previewImage ??
    obj?.poster ??
    obj?.image ??
    obj?.cover ??
    obj?.cover_url;

  const cand = unwrapCloudinaryFetch(candRaw);
  if (/^https?:\/\//i.test(cand)) return cand;
  return toAbsUrl(backendUrl, cand);
}

function pickCourseAwareThumb(obj: any, backendUrl?: string): string {
  const explicit = pickThumb(obj, backendUrl);
  if (explicit) return explicit;
  if (isRealCourse(obj)) return pickImageForCourse(obj as any, backendUrl);
  return '';
}

/* ---------------------- CardMedia (Image / Video) ------------------------ */

const CardMedia: React.FC<{ src?: string; title?: string; previewUrl?: string }> = ({
  src,
  title,
  previewUrl,
}) => {
  const trimmed = String(src ?? '').trim();
  const videoSrc = String(previewUrl ?? '').trim();
  const uri = trimmed;

  if (!uri && !videoSrc) {
    return (
      <View style={tw`w-full mb-3 overflow-hidden rounded-xl bg-slate-200 dark:bg-white/5`}>
        <View style={{ width: '100%', aspectRatio: 16 / 9 }} />
      </View>
    );
  }

  return (
    <View style={tw`w-full mb-3 overflow-hidden rounded-xl bg-slate-200 dark:bg-white/5`}>
      {videoSrc ? (
        <Video
          source={{ uri: videoSrc }}
          style={{ width: '100%', aspectRatio: 16 / 9 }}
          resizeMode={ResizeMode.COVER}
          isMuted
          shouldPlay
          isLooping
        />
      ) : (
        <Image
          source={{ uri }}
          resizeMode="cover"
          style={{ width: '100%', aspectRatio: 16 / 9 }}
          onError={(e) => {
            // eslint-disable-next-line no-console
            console.log('[CardMedia] image error', { title, uri, error: e.nativeEvent });
          }}
        />
      )}
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* Animation helpers                                                  */
/* ------------------------------------------------------------------ */

const usePressScale = (initial = 1) => {
  const scale = useSharedValue(initial);
  const onIn = () => {
    scale.value = withSpring(0.98, { damping: 20, stiffness: 260 });
  };
  const onOut = () => {
    scale.value = withSpring(1, { damping: 16, stiffness: 200 });
  };
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return { onIn, onOut, style };
};

const SectionReveal: React.FC<
  React.PropsWithChildren<{ scrollY: SharedValue<number>; offset?: number; duration?: number }>
> = ({ scrollY, offset = 140, duration = 500, children }) => {
  const yRef = useRef(0);
  const [, setMeasured] = useState(false);
  const revealed = useSharedValue(0);

  const onLayout = useCallback((e: any) => {
    yRef.current = e.nativeEvent.layout.y;
    setMeasured(true);
  }, []);

  const aStyle = useAnimatedStyle(() => {
    const start = Math.max(0, yRef.current - offset);
    const end = yRef.current + 40;

    const progress = interpolate(scrollY.value, [start, end], [0, 1], Extrapolation.CLAMP);

    if (progress >= 0.99 && revealed.value === 0) revealed.value = 1;

    const isRevealed = revealed.value === 1;
    const opacity = isRevealed ? 1 : progress;
    const translateY = isRevealed
      ? 0
      : interpolate(scrollY.value, [start, end], [16, 0], Extrapolation.CLAMP);

    return { opacity, transform: [{ translateY }] };
  });

  return (
    <Animated.View onLayout={onLayout} entering={FadeIn.duration(duration)} style={aStyle}>
      {children}
    </Animated.View>
  );
};

const CardFadeIn: React.FC<React.PropsWithChildren<{ index?: number }>> = ({
  children,
  index = 0,
}) => {
  const delay = index * 60;
  return <Animated.View entering={FadeIn.delay(delay).duration(280)}>{children}</Animated.View>;
};

const SpringButton: React.FC<{ onPress: () => void; bg: string; children: React.ReactNode }> = ({
  onPress,
  bg,
  children,
}) => {
  const { onIn, onOut, style } = usePressScale();
  return (
    <Animated.View style={style}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={onIn}
        onPressOut={onOut}
        activeOpacity={0.9}
        style={tw`${bg} rounded-xl h-11 px-6 justify-center items-center`}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
};

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

const HomePageNative: React.FC = () => {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const navAny = navigation as unknown as {
    navigate: (...args: any[]) => void;
    getState: () => any;
  };

  const hasRoute = (name: string): boolean => {
    try {
      const state = navigation.getState?.();
      const walk = (s: any): boolean => {
        if (!s) return false;
        const names = Array.isArray(s?.routeNames)
          ? s.routeNames
          : Array.isArray(s?.routes)
            ? s.routes.map((r: any) => r.name)
            : [];
        if (names.includes(name)) return true;
        const routes = Array.isArray(s?.routes) ? s.routes : [];
        for (const r of routes) {
          if (r?.state && walk(r.state)) return true;
        }
        return false;
      };
      return walk(state);
    } catch {
      return false;
    }
  };

  const goTutorProfile = (id: string) => {
    if (hasRoute('Profile')) navAny.navigate('Profile', { id });
  };

  // ✅ align with your MainStackParamList: CourseDetails({ courseId })
  const goCourse = (courseId: string) => {
    if (hasRoute('CourseDetails')) navAny.navigate('CourseDetails', { courseId });
    else if (hasRoute('Courses')) navAny.navigate('Courses');
  };

  const goRecordedVideo = (id: number) => {
    if (hasRoute('ClassVaultDetail')) navAny.navigate('ClassVaultDetail', { id });
    else if (hasRoute('ClassVaultLibrary')) navAny.navigate('ClassVaultLibrary');
    else if (hasRoute('Videos')) navAny.navigate('Videos');
  };

  // ✅ your stack has OerCollectionReader({ id })
  const goOerReader = (id: string) => {
    if (hasRoute('OerCollectionReader')) {
      navAny.navigate('OerCollectionReader', { id });
      return;
    }
    if (hasRoute('Courses')) navAny.navigate('Courses', { free: 1 });
  };

  const goVideosIndex = () => {
    if (hasRoute('Videos')) navAny.navigate('Videos');
    else if (hasRoute('ClassVaultLibrary')) navAny.navigate('ClassVaultLibrary');
  };

  const goCoursesIndex = () => {
    if (hasRoute('Courses')) navAny.navigate('Courses');
  };

  const goCollection = (id: string, kind: 'video' | 'doc') => {
    // keep behavior simple + consistent: collection reader if present, else fall back to indexes
    if (hasRoute('OerCollectionReader')) {
      navAny.navigate('OerCollectionReader', { id });
      return;
    }
    if (kind === 'video') goVideosIndex();
    else goCoursesIndex();
  };

  const navigateForItem = (c: any) => {
    const id = idOrSlug(c);
    const ckind = sStr(c?.content_kind ?? c?.contentKind ?? c?.type);

    if (isOerLike(c)) {
      if (ckind.includes('video')) return goCollection(id, 'video');
      return goOerReader(id);
    }
    if (isVideoish(c)) return goRecordedVideo(Number(c?.id ?? 0));
    return goCourse(String(c?.id ?? id));
  };

  const { backendUrl, token, role } = useShopContext();
  const { purchasedIds, purchase, refresh: refreshClassVault } = useClassVault('', ''); // ✅ just to get purchasedIds + purchase flow

  const [buyingId, setBuyingId] = useState<number | null>(null);

  const isUnlocked = useCallback(
    (id: number) => Boolean(purchasedIds && purchasedIds.has(id)),
    [purchasedIds]
  );
  const insets = useSafeAreaInsets();

  const FOOTER_OVERLAY_PX = 84;
  const bottomPad = Math.max(FOOTER_OVERLAY_PX, FOOTER_OVERLAY_PX + insets.bottom);

  const { filteredProfiles, loading } = useHomePage();
  const {
    featuredCourses = [],
    featuredVideos = [],
    recommendedCourses = [],
    fetchFeaturedCourses,
    fetchFeaturedVideos,
    fetchRecommendedCourses,
  } = useCourses({ backendUrl });

  const [oerDocs, setOerDocs] = useState<OerCollection[]>([]);
  const [oerVideos, setOerVideos] = useState<OerCollection[]>([]);

  const [refreshing, setRefreshing] = useState(false);

  const reloadOer = useCallback(async () => {
    if (!backendUrl) return;
    const base = backendUrl.replace(/\/+$/, '');
    const [r1, r2] = await Promise.all([
      fetch(`${base}/api/oer/collections?kind=doc&limit=48&raster=1`).then((r) =>
        r.ok ? r.json() : []
      ),
      fetch(`${base}/api/oer/collections?kind=video&limit=48&raster=1`).then((r) =>
        r.ok ? r.json() : []
      ),
    ]);
    setOerDocs(Array.isArray(r1) ? r1 : []);
    setOerVideos(Array.isArray(r2) ? r2 : []);
  }, [backendUrl]);

  const onRefresh = useCallback(async () => {
    if (!backendUrl) return;
    setRefreshing(true);
    try {
      await Promise.all([
        reloadOer(),
        fetchFeaturedCourses({ limit: VISIBLE_LIMIT, minCount: 1 }),
        fetchFeaturedVideos({ limit: VISIBLE_LIMIT, minCount: 1 }),
        fetchRecommendedCourses({ limit: VISIBLE_LIMIT, minCount: 1 }),
        refreshClassVault?.(),
        // if your useHomePage hook exposes something like refetch, you can also call it:
        // (home as any)?.refetch?.(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [backendUrl, reloadOer, fetchFeaturedCourses, fetchFeaturedVideos, fetchRecommendedCourses]);

  useEffect(() => {
    if (!backendUrl) return;
    const base = backendUrl.replace(/\/+$/, '');
    const ac = new AbortController();
    const load = async () => {
      try {
        const [r1, r2] = await Promise.all([
          fetch(`${base}/api/oer/collections?kind=doc&limit=48&raster=1`, { signal: ac.signal }),
          fetch(`${base}/api/oer/collections?kind=video&limit=48&raster=1`, { signal: ac.signal }),
        ]);
        const d1 = r1.ok ? await r1.json().catch(() => []) : [];
        const d2 = r2.ok ? await r2.json().catch(() => []) : [];
        setOerDocs(Array.isArray(d1) ? d1 : []);
        setOerVideos(Array.isArray(d2) ? d2 : []);
      } catch {
        setOerDocs([]);
        setOerVideos([]);
      }
    };
    void load();
    return () => ac.abort();
  }, [backendUrl]);

  useEffect(() => {
    if (!backendUrl) return;
    void fetchFeaturedCourses({ limit: VISIBLE_LIMIT, minCount: 1 });
    void fetchFeaturedVideos({ limit: VISIBLE_LIMIT, minCount: 1 });
    void fetchRecommendedCourses({ limit: VISIBLE_LIMIT, minCount: 1 });
  }, [backendUrl, fetchFeaturedCourses, fetchFeaturedVideos, fetchRecommendedCourses]);

  /* -------------------------- Featured Tutors --------------------------- */

  const tutorProfiles: Profile[] = useMemo(
    () => filteredProfiles.filter((p: Profile) => p.role === 'tutor'),
    [filteredProfiles]
  );

  const featuredTutors = useMemo(() => {
    const rows = tutorProfiles.map((p: any) => {
      const image = resolveTutorImage(p, backendUrl!);
      const { avg, count } = extractRating(p);
      return {
        id: String(p.user_id ?? p.id ?? p.name ?? 'Tutor'),
        name: p.name ?? 'Tutor',
        subject: p.category ?? 'Tutor',
        image,
        category: p.category,
        ratingAvg: avg,
        ratingCount: count,
        certified: Boolean(p.certified),
      };
    });

    rows.sort((a, b) => {
      if (b.ratingAvg !== a.ratingAvg) return b.ratingAvg - a.ratingAvg;
      return b.ratingCount - a.ratingCount;
    });

    return rows.slice(0, FEATURED_TUTOR_LIMIT);
  }, [tutorProfiles, backendUrl]);

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
      const data: { avgRating?: number; totalReviews?: number } = await res.json();
      const avg = Number(data?.avgRating ?? 0) || 0;
      const count = Number(data?.totalReviews ?? 0) || 0;
      setCourseRatings((prev) => (prev[courseId] ? prev : { ...prev, [courseId]: { avg, count } }));
    } catch {
      // ignore
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

  useEffect(() => {
    const ids = [
      ...featuredCourses.slice(0, VISIBLE_LIMIT),
      ...recommendedCourses.slice(0, VISIBLE_LIMIT),
    ]
      .map((c: Course) => String(c.id))
      .filter(Boolean);
    ids.forEach((cid) => debouncedFetchCourseRatings(cid));
  }, [featuredCourses, recommendedCourses, debouncedFetchCourseRatings]);

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
            (
              reviews.reduce((s, r) => s + Number((r as { rating: number }).rating), 0) / count
            ).toFixed(2)
          )
        : 0;
      setVideoRatings((prev) => (prev[vid] ? prev : { ...prev, [vid]: { avg, count } }));
    } catch {
      // ignore
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

  /* --------------------------- Scroll driver ----------------------------- */

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  /* ---------------------------- OER mixing ------------------------------- */

  type MixedVideoItem =
    | { kind: 'recorded'; data: RecordedVideo }
    | { kind: 'oerCollection'; data: OerCollection };

  const featuredRecordedVideos = useMemo(
    () =>
      (featuredVideos as RecordedVideo[]).filter((v: any) => isVideoish(v)).slice(0, VISIBLE_LIMIT),
    [featuredVideos]
  );

  const featuredVideosMixed: MixedVideoItem[] = useMemo(() => {
    const oerPool = (oerVideos as OerCollection[]).slice(0, VISIBLE_LIMIT * 2);
    const need = Math.max(0, VISIBLE_LIMIT - featuredRecordedVideos.length);
    const maxOerShare = Math.ceil(VISIBLE_LIMIT / 2);
    const reserveForFree = Math.min(2, Math.max(0, oerPool.length));
    const availableOerForFeatured = Math.max(0, oerPool.length - reserveForFree);
    const useOerCount = Math.max(0, Math.min(need, maxOerShare, availableOerForFeatured));
    const a = featuredRecordedVideos.map((v) => ({ kind: 'recorded', data: v }) as MixedVideoItem);
    const b = oerPool
      .slice(0, useOerCount)
      .map((c) => ({ kind: 'oerCollection', data: c }) as MixedVideoItem);
    return interleave(a, b, VISIBLE_LIMIT) as MixedVideoItem[];
  }, [featuredRecordedVideos, oerVideos]);

  const usedOerVideoCollectionIds = useMemo(() => {
    const s = new Set<string | number>();
    featuredVideosMixed.forEach((it) => {
      if (it.kind === 'oerCollection') s.add(it.data.id);
    });
    return s;
  }, [featuredVideosMixed]);

  const featuredNormalCourses = useMemo(
    () => (featuredCourses as Course[]).slice(0, VISIBLE_LIMIT * 2),
    [featuredCourses]
  );
  const freeOerDocs = useMemo(
    () => (oerDocs as OerCollection[]).slice(0, VISIBLE_LIMIT * 2),
    [oerDocs]
  );

  const featuredCoursesDisplay = useMemo(
    () => interleave<Course, OerCollection>(featuredNormalCourses, freeOerDocs, VISIBLE_LIMIT),
    [featuredNormalCourses, freeOerDocs]
  );

  const usedFreeDocIds = useMemo(() => {
    const s = new Set<string | number>();
    (featuredCoursesDisplay as Array<Course | OerCollection>).forEach((c: any) => {
      if (isDocish(c)) s.add(c.id);
    });
    return s;
  }, [featuredCoursesDisplay]);

  const freeCoursesToShow = useMemo(
    () =>
      (oerDocs as OerCollection[]).filter((c) => !usedFreeDocIds.has(c.id)).slice(0, VISIBLE_LIMIT),
    [oerDocs, usedFreeDocIds]
  );

  const freeVideoCollections = useMemo(
    () =>
      (oerVideos as OerCollection[])
        .filter((c) => !usedOerVideoCollectionIds.has(c.id))
        .slice(0, VISIBLE_LIMIT),
    [oerVideos, usedOerVideoCollectionIds]
  );

  const recommendedCoursesOnly = useMemo(
    () => (recommendedCourses as Course[]).filter((c: any) => !isVideoish(c)),
    [recommendedCourses]
  );
  const handleRecordedVideoPress = useCallback(
    (v: RecordedVideo) => {
      const vid = Number((v as any)?.id ?? 0);
      if (!vid) return;

      // Tutors: just open detail (they're managing content, not buying)
      if (String(role || '').toLowerCase() === 'tutor') {
        goRecordedVideo(vid);
        return;
      }

      // Unlocked: open and it will auto-play full video in detail screen
      if (isUnlocked(vid)) {
        goRecordedVideo(vid);
        return;
      }

      // Not logged in
      if (!token) {
        Alert.alert('Login required', 'Please login to purchase and watch this class.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Login', onPress: () => navAny.navigate('Login') },
        ]);
        return;
      }

      // Locked: prompt purchase
      const price = Number((v as any)?.price ?? 0) || 0;
      const title = String((v as any)?.title ?? 'this class');

      Alert.alert(
        'Unlock to Watch',
        `“${title}” is locked.\n\nUnlock for ${price} tokens to play and download.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Buy Tokens',
            onPress: () => {
              // If your stack has BuyTokens, go there
              try {
                navAny.navigate('BuyTokens');
              } catch {
                // fallback: open ClassVaultLibrary
                goVideosIndex();
              }
            },
          },
          {
            text: buyingId === vid ? 'Purchasing…' : 'Unlock',
            onPress: async () => {
              if (buyingId === vid) return;
              try {
                setBuyingId(vid);
                await purchase?.(v as any);

                Alert.alert('Unlocked', `“${title}” is now unlocked.`, [
                  { text: 'Play now', onPress: () => goRecordedVideo(vid) },
                ]);
              } catch (err: any) {
                const msg = String(err?.message ?? 'Purchase failed');
                if (msg.includes('Insufficient tokens')) {
                  Alert.alert(
                    'Insufficient Tokens',
                    'Not enough tokens. Would you like to buy more?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Buy Tokens', onPress: () => navAny.navigate('BuyTokens') },
                    ]
                  );
                } else {
                  Alert.alert('Error', msg);
                }
              } finally {
                setBuyingId(null);
              }
            },
          },
        ]
      );
    },
    [role, token, isUnlocked, purchase, buyingId, navAny, goRecordedVideo, goVideosIndex]
  );

  const { resolvedScheme } = useThemePref();

  if (loading) {
    return (
      <SafeAreaView
        edges={['top', 'left', 'right']}
        style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}
      >
        <View style={tw`flex-1 justify-center items-center`}>
          <ActivityIndicator
            size="large"
            color={resolvedScheme === 'dark' ? '#ffffff' : '#0d141c'}
          />
          <Text style={tw`mt-2 text-[#0d141c] dark:text-white/90`}>Loading tutor profiles...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
      <Animated.ScrollView
        style={tw`flex-1`}
        contentContainerStyle={{ paddingBottom: bottomPad }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={resolvedScheme === 'dark' ? '#ffffff' : '#0d141c'}
          />
        }
      >
        {/* Featured Tutors – always visible, no SectionReveal */}
        <View style={tw`mt-6 px-4`}>
          <View style={tw`flex-row items-center justify-between`}>
            <Text style={tw`text-xl font-bold text-[#0d141c] dark:text-white`}>
              Featured Tutors
            </Text>
            <TouchableOpacity onPress={() => navAny.navigate('FindTutor')}>
              <Text style={tw`text-pink-600`}>See All Tutors</Text>
            </TouchableOpacity>
          </View>

          {featuredTutors.length === 0 ? (
            <Text style={tw`text-slate-600 dark:text-slate-300 mt-2`}>No featured tutors yet.</Text>
          ) : (
            <View style={tw`mt-3 flex-row flex-wrap -mx-1`}>
              {featuredTutors.slice(0, VISIBLE_LIMIT).map((t, idx) => (
                <TouchableOpacity
                  key={`${t.id}-${t.subject}`}
                  onPress={() => goTutorProfile(String(t.id))}
                  style={tw`w-1/2 px-1 mb-3`}
                  activeOpacity={0.9}
                >
                  <CardFadeIn index={idx}>
                    <View
                      style={tw`rounded-2xl p-3 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
                    >
                      <View style={tw`relative self-center`}>
                        <Image
                          source={{ uri: t.image }}
                          style={tw`w-16 h-16 rounded-full`}
                          resizeMode="cover"
                        />
                        {t.certified ? (
                          <View
                            style={tw`absolute -top-1 -left-1 bg-emerald-500 rounded-full px-2 py-0.5`}
                          >
                            <Text style={tw`text-[9px] font-semibold text-white`}>✓ Certified</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={tw`mt-2 items-center`}>
                        <Text
                          numberOfLines={1}
                          style={tw`text-[13px] font-medium text-[#0d141c] dark:text-white`}
                        >
                          {t.name}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={tw`text-[11px] text-slate-600 dark:text-slate-400`}
                        >
                          {t.subject}
                        </Text>
                        <Text style={tw`text-yellow-600 dark:text-yellow-400 text-[11px] mt-1`}>
                          {starRow(t.ratingAvg)} {t.ratingCount > 0 ? `(${t.ratingCount})` : ''}
                        </Text>
                      </View>
                    </View>
                  </CardFadeIn>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Featured Courses (mixed normal + OER docs) – 2-column grid */}
        <View style={tw`mt-6 px-4`}>
          <View style={tw`flex-row items-center justify-between`}>
            <Text style={tw`text-xl font-bold text-[#0d141c] dark:text-white`}>
              Featured Courses
            </Text>
            <TouchableOpacity onPress={goCoursesIndex}>
              <Text style={tw`text-pink-600`}>Browse All</Text>
            </TouchableOpacity>
          </View>

          {featuredCoursesDisplay.length === 0 ? (
            <Text style={tw`text-slate-600 dark:text-slate-300 mt-2`}>
              No featured courses yet.
            </Text>
          ) : (
            <SectionReveal scrollY={scrollY} offset={160}>
              <View style={tw`mt-3 flex-row flex-wrap -mx-1`}>
                {featuredCoursesDisplay.slice(0, VISIBLE_LIMIT).map((c: any, idx) => {
                  const cid = String(c.id);
                  const base = extractRating(c);
                  const r = courseRatings[cid] ?? base;
                  const thumb = pickCourseAwareThumb(c, backendUrl) || FALLBACK_CARD(c.title);
                  const free = isDocish(c) || isFreeCourse(c);

                  return (
                    <TouchableOpacity
                      key={`featc-${cid}`}
                      onPress={() => navigateForItem(c)}
                      activeOpacity={0.9}
                      style={tw`w-1/2 px-1 mb-3`}
                    >
                      <CardFadeIn index={idx}>
                        <View
                          style={tw`rounded-2xl p-4 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
                        >
                          <CardMedia src={thumb} title={c.title} />
                          <Text
                            numberOfLines={1}
                            style={tw`font-semibold text-[#0d141c] dark:text-white`}
                          >
                            {c.title}
                          </Text>
                          <Text style={tw`text-yellow-600 dark:text-yellow-400 text-xs mt-1`}>
                            {starRow(r.avg)} {r.count > 0 ? `(${r.count})` : ''}
                          </Text>

                          <Text
                            numberOfLines={2}
                            style={tw`text-slate-600 dark:text-slate-400 text-sm mt-1`}
                          >
                            {c.description ||
                              (free
                                ? 'Open & free to start learning.'
                                : 'Learn with a top-rated course.')}
                          </Text>

                          <View style={tw`flex-row mt-2`}>
                            {free ? (
                              <>
                                <Text
                                  style={tw`text-emerald-700 dark:text-emerald-300 text-xs mr-3`}
                                >
                                  Free
                                </Text>
                                <Text style={tw`text-slate-600 dark:text-slate-400 text-xs`}>
                                  Level: {c.level ?? '—'}
                                </Text>
                              </>
                            ) : (
                              <>
                                <Text style={tw`text-slate-600 dark:text-slate-400 text-xs mr-3`}>
                                  Level: {c.level ?? '—'}
                                </Text>
                                {c.price != null && isRealCourse(c) && (
                                  <Text style={tw`text-slate-600 dark:text-slate-400 text-xs`}>
                                    {coursePrice(c)}
                                  </Text>
                                )}
                              </>
                            )}
                          </View>
                        </View>
                      </CardFadeIn>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </SectionReveal>
          )}
        </View>

        {/* Featured Videos (mixed recorded + OER collections) – keep single column */}
        <View style={tw`mt-6 px-4`}>
          <View style={tw`flex-row items-center justify-between`}>
            <Text style={tw`text-xl font-bold text-[#0d141c] dark:text-white`}>
              Featured Videos
            </Text>
            <TouchableOpacity onPress={goVideosIndex}>
              <Text style={tw`text-pink-600`}>See All</Text>
            </TouchableOpacity>
          </View>

          {featuredVideosMixed.length === 0 ? (
            <Text style={tw`text-slate-600 dark:text-slate-300 mt-2`}>No videos to show yet.</Text>
          ) : (
            <SectionReveal scrollY={scrollY} offset={160}>
              <View style={tw`mt-3`}>
                {featuredVideosMixed.slice(0, VISIBLE_LIMIT).map((item, idx) => {
                  if (item.kind === 'recorded') {
                    const v = item.data;
                    const unlocked = isUnlocked(Number(v.id));
                    const subject =
                      (v as any).subject ??
                      (v as any).category ??
                      (v as any).topic ??
                      v.title ??
                      'Video';
                    const grade =
                      (v as any).grade_level ?? (v as any).grade ?? (v as any).level ?? '—';
                    const priceTokens = Number.isFinite(Number((v as any).price))
                      ? Number((v as any).price)
                      : 0;
                    const base = extractRating(v as unknown as Ratingish);
                    const r = videoRatings[v.id] ?? base;
                    const thumb =
                      pickThumb(v, backendUrl) || FALLBACK_CARD((v as any).title || subject);
                    const previewUrl = (v as any).preview_url ?? (v as any).previewUrl ?? '';

                    return (
                      <TouchableOpacity
                        key={`vid-rec-${String(v.id)}`}
                        onPress={() => handleRecordedVideoPress(v)}
                        activeOpacity={0.9}
                      >
                        <CardFadeIn index={idx}>
                          <View
                            style={tw`mb-3 rounded-2xl p-4 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
                          >
                            <CardMedia
                              src={thumb}
                              title={(v as any).title || subject}
                              previewUrl={previewUrl}
                            />
                            <Text
                              numberOfLines={1}
                              style={tw`font-semibold text-[#0d141c] dark:text-white`}
                            >
                              {v.title ?? subject}
                            </Text>
                            <Text style={tw`text-yellow-600 dark:text-yellow-400 text-xs mt-1`}>
                              {starRow(r.avg)} {r.count > 0 ? `(${r.count})` : ''}
                            </Text>
                            <Text style={tw`text-slate-600 dark:text-slate-400 text-sm mt-1`}>
                              {subject} • Grade {grade}
                            </Text>
                            <Text style={tw`text-slate-700 dark:text-slate-200 text-sm mt-2`}>
                              <Text style={tw`font-medium`}>Price:</Text> {priceTokens.toFixed(0)}{' '}
                              tokens
                            </Text>
                            <Text style={tw`text-pink-600 dark:text-pink-400 mt-2`}>
                              {unlocked
                                ? 'Play →'
                                : buyingId === Number(v.id)
                                  ? 'Unlocking…'
                                  : 'Unlock →'}
                            </Text>
                          </View>
                        </CardFadeIn>
                      </TouchableOpacity>
                    );
                  }

                  const col = item.data;
                  const thumb = pickThumb(col, backendUrl) || FALLBACK_CARD(col.title);

                  return (
                    <TouchableOpacity
                      key={`vid-col-${col.id}`}
                      onPress={() => goCollection(String(col.id), 'video')}
                      activeOpacity={0.9}
                    >
                      <CardFadeIn index={idx}>
                        <View
                          style={tw`mb-3 rounded-2xl p-4 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
                        >
                          <CardMedia src={thumb} title={col.title} />
                          <Text
                            numberOfLines={1}
                            style={tw`font-semibold text-[#0d141c] dark:text-white`}
                          >
                            {col.title ?? 'Collection'}
                          </Text>
                          <Text style={tw`text-slate-600 dark:text-slate-400 text-sm mt-1`}>
                            Free Video Collection
                            {typeof col.items_count === 'number'
                              ? ` • ${col.items_count} item${col.items_count === 1 ? '' : 's'}`
                              : ''}
                          </Text>
                          <Text style={tw`text-pink-600 dark:text-pink-400 mt-2`}>
                            View Collection →
                          </Text>
                        </View>
                      </CardFadeIn>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </SectionReveal>
          )}
        </View>

        {/* Free Courses (OER docs only) – 2-column grid */}
        <View style={tw`mt-6 px-4`}>
          <View style={tw`flex-row items-center justify-between`}>
            <Text style={tw`text-xl font-bold text-[#0d141c] dark:text-white`}>Free Courses</Text>
            <TouchableOpacity onPress={goCoursesIndex}>
              <Text style={tw`text-pink-600`}>Browse Free</Text>
            </TouchableOpacity>
          </View>

          {freeCoursesToShow.length === 0 ? (
            <Text style={tw`text-slate-600 dark:text-slate-300 mt-2`}>No free courses yet.</Text>
          ) : (
            <SectionReveal scrollY={scrollY} offset={160}>
              <View style={tw`mt-3 flex-row flex-wrap -mx-1`}>
                {freeCoursesToShow.slice(0, VISIBLE_LIMIT).map((c, idx) => {
                  const cid = String(c.id);
                  const base = extractRating(c);
                  const r = courseRatings[cid] ?? base;
                  const thumb = pickCourseAwareThumb(c, backendUrl) || FALLBACK_CARD(c.title);

                  return (
                    <TouchableOpacity
                      key={`free-${cid}`}
                      onPress={() => goOerReader(cid)}
                      activeOpacity={0.9}
                      style={tw`w-1/2 px-1 mb-3`}
                    >
                      <CardFadeIn index={idx}>
                        <View
                          style={tw`rounded-2xl p-4 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
                        >
                          <CardMedia src={thumb} title={c.title} />
                          <Text
                            numberOfLines={1}
                            style={tw`font-semibold text-[#0d141c] dark:text-white`}
                          >
                            {c.title}
                          </Text>
                          <Text style={tw`text-yellow-600 dark:text-yellow-400 text-xs mt-1`}>
                            {starRow(r.avg)} {r.count > 0 ? `(${r.count})` : ''}
                          </Text>
                          <Text
                            numberOfLines={2}
                            style={tw`text-slate-600 dark:text-slate-400 text-sm mt-1`}
                          >
                            {c.description || 'Open & free to start learning.'}
                          </Text>
                          <View style={tw`flex-row mt-2`}>
                            <Text style={tw`text-emerald-700 dark:text-emerald-300 text-xs mr-3`}>
                              Free
                            </Text>
                            <Text style={tw`text-slate-600 dark:text-slate-400 text-xs`}>
                              Level: {(c as any).level ?? '—'}
                            </Text>
                          </View>
                        </View>
                      </CardFadeIn>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </SectionReveal>
          )}
        </View>

        {/* Free Videos (remaining OER video collections) – keep single column */}
        <View style={tw`mt-6 px-4`}>
          <View style={tw`flex-row items-center justify-between`}>
            <Text style={tw`text-xl font-bold text-[#0d141c] dark:text-white`}>Free Videos</Text>
            <TouchableOpacity onPress={goVideosIndex}>
              <Text style={tw`text-pink-600`}>See All</Text>
            </TouchableOpacity>
          </View>

          {freeVideoCollections.length === 0 ? (
            <Text style={tw`text-slate-600 dark:text-slate-300 mt-2`}>
              No free videos to show yet.
            </Text>
          ) : (
            <SectionReveal scrollY={scrollY} offset={160}>
              <View style={tw`mt-3`}>
                {freeVideoCollections.slice(0, VISIBLE_LIMIT).map((col, idx) => {
                  const thumb = pickThumb(col, backendUrl) || FALLBACK_CARD(col.title);
                  return (
                    <TouchableOpacity
                      key={`col-${col.id}`}
                      onPress={() => goCollection(String(col.id), 'video')}
                      activeOpacity={0.9}
                    >
                      <CardFadeIn index={idx}>
                        <View
                          style={tw`mb-3 rounded-2xl p-4 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
                        >
                          <CardMedia src={thumb} title={col.title} />
                          <Text
                            numberOfLines={1}
                            style={tw`font-semibold text-[#0d141c] dark:text-white`}
                          >
                            {col.title ?? 'Collection'}
                          </Text>
                          <Text style={tw`text-slate-600 dark:text-slate-400 text-sm mt-1`}>
                            Free Video Collection
                            {typeof col.items_count === 'number'
                              ? ` • ${col.items_count} item${col.items_count === 1 ? '' : 's'}`
                              : ''}
                          </Text>
                          <Text style={tw`text-pink-600 dark:text-pink-400 mt-2`}>
                            View Collection →
                          </Text>
                        </View>
                      </CardFadeIn>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </SectionReveal>
          )}
        </View>

        {/* Recommended Courses (no videos) – 2-column grid */}
        <View style={tw`mt-6 px-4`}>
          <View style={tw`flex-row items-center justify-between`}>
            <Text style={tw`text-xl font-bold text-[#0d141c] dark:text-white`}>
              Recommended Courses
            </Text>
            <TouchableOpacity onPress={goCoursesIndex}>
              <Text style={tw`text-pink-600`}>Browse all</Text>
            </TouchableOpacity>
          </View>

          {recommendedCoursesOnly.length === 0 ? (
            <Text style={tw`text-slate-600 dark:text-slate-300 mt-2`}>No recommendations yet.</Text>
          ) : (
            <SectionReveal scrollY={scrollY} offset={160}>
              <View style={tw`mt-3 flex-row flex-wrap -mx-1`}>
                {recommendedCoursesOnly.slice(0, VISIBLE_LIMIT).map((c: Course, idx) => {
                  const cid = String(c.id);
                  const base = extractRating(c);
                  const r = courseRatings[cid] ?? base;
                  const thumb = pickCourseAwareThumb(c, backendUrl) || FALLBACK_CARD(c.title);

                  return (
                    <TouchableOpacity
                      key={`recc-${cid}`}
                      onPress={() => navigateForItem(c)}
                      activeOpacity={0.9}
                      style={tw`w-1/2 px-1 mb-3`}
                    >
                      <CardFadeIn index={idx}>
                        <View
                          style={tw`rounded-2xl p-4 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
                        >
                          <CardMedia src={thumb} title={c.title} />
                          <Text
                            numberOfLines={1}
                            style={tw`font-semibold text-[#0d141c] dark:text-white`}
                          >
                            {c.title}
                          </Text>
                          <Text style={tw`text-yellow-600 dark:text-yellow-400 text-xs mt-1`}>
                            {starRow(r.avg)} {r.count > 0 ? `(${r.count})` : ''}
                          </Text>
                          <Text
                            numberOfLines={2}
                            style={tw`text-slate-600 dark:text-slate-400 text-sm mt-1`}
                          >
                            {c.description || 'Top picks based on quality and popularity.'}
                          </Text>
                        </View>
                      </CardFadeIn>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </SectionReveal>
          )}
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
};

export default HomePageNative;
