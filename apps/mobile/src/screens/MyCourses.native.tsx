/* eslint-disable no-console */
// apps/mobile/src/screens/MyCourses.native.tsx

import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { View, Text, SectionList, Pressable, Alert, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import AutoPreviewVideo from './AutoPreviewVideo.native';
import { Image } from 'expo-image';
import tw from '../../tailwind';

import { useAiCourse, useMyLibrary } from '@mytutorapp/shared/hooks';
import { useClassVault } from '@mytutorapp/shared/hooks/useClassVault';
import { useShopContext } from '@mytutorapp/shared/context';

import type { Course, RecordedVideo, TopCourse } from '@mytutorapp/shared/types';
import type { MainStackParamList } from '../navigation/types';

import { pickImageUriForCourse } from '../../utils/subjectImages'; // ✅ subject image fallback

type Nav = StackNavigationProp<MainStackParamList, 'Courses'>;

type SectionItem =
  | ({ kind: 'classvault'; sectionKey: string } & RecordedVideo)
  | ({ kind: 'course'; ai?: boolean; sectionKey: string } & Course);

type LibrarySection = {
  key: string;
  title: string;
  subtitle: string;
  data: SectionItem[];
  loading: boolean;
  error: string | null;
  emptyMessage: string;
  hasMore: boolean;
  loadMore: () => void;
};

let WebView: any = null;
try {
  WebView = require('react-native-webview').WebView;
} catch {
  WebView = null;
}

function toPdfPreviewUrl(pdfUrl: string) {
  const clean = pdfUrl.trim();
  if (!clean) return '';
  if (Platform.OS === 'android') {
    return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(clean)}`;
  }
  return clean;
}

function getVaultId(v: any): number {
  const raw = v?.id ?? v?.class_id ?? v?.video_id ?? v?.recorded_video_id;
  const n = Number(raw);
  return Number.isFinite(n) ? n : -1;
}

function cacheBust(item: any) {
  return String(item?.updated_at || item?.updatedAt || item?.created_at || item?.createdAt || Date.now());
}
function withBust(url?: string | null, bust?: string) {
  if (!url) return null;
  const v = bust || String(Date.now());
  return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(v)}`;
}
function courseThumb(c: any): string | null {
  return (
    c?.thumbnail_url ||
    c?.thumbnailUrl ||
    c?.thumb_url ||
    c?.thumbUrl ||
    c?.image_url ||
    c?.imageUrl ||
    c?.cover_url ||
    c?.coverUrl ||
    null
  );
}
/** ClassVault thumb candidates (so Purchased shows previews too) */
function classVaultThumb(v: any): string | null {
  return (
    v?.thumbnail_url ||
    v?.thumbnailUrl ||
    v?.preview_thumbnail_url ||
    v?.previewThumbnailUrl ||
    v?.poster_url ||
    v?.posterUrl ||
    v?.image_url ||
    v?.imageUrl ||
    null
  );
}

/* ─────────────────────────────────────────────────────────
 * UI atoms
 * ───────────────────────────────────────────────────────── */

const Badge: React.FC<{ label: string; tone?: 'blue' | 'red' }> = ({ label, tone = 'blue' }) => (
  <View
    style={tw.style(
      'mt-2 self-start rounded-full px-2 py-0.5',
      tone === 'blue' ? 'bg-blue-50 dark:bg-blue-500/10' : 'bg-red-50 dark:bg-red-500/10'
    )}
  >
    <Text
      style={tw.style(
        'text-[11px] font-semibold',
        tone === 'blue' ? 'text-blue-600 dark:text-blue-300' : 'text-red-600 dark:text-red-300'
      )}
    >
      {label}
    </Text>
  </View>
);

const TutorActions: React.FC<{
  onEdit: () => void;
  onDelete: () => void;
  deleting?: boolean;
}> = ({ onEdit, onDelete, deleting }) => (
  <View style={tw`absolute top-3 right-3 z-20 flex-row gap-2`}>
    <Pressable
      onPress={(e) => {
        e.stopPropagation?.();
        onEdit();
      }}
      style={tw`h-9 px-3 rounded-lg bg-slate-100 dark:bg-[#172534] justify-center`}
    >
      <Text style={tw`text-xs font-semibold text-slate-900 dark:text-white`}>Edit</Text>
    </Pressable>

    <Pressable
      disabled={!!deleting}
      onPress={(e) => {
        e.stopPropagation?.();
        onDelete();
      }}
      style={tw.style(
        `h-9 px-3 rounded-lg justify-center`,
        deleting ? 'bg-red-200/60' : 'bg-red-50 dark:bg-[#2a0d11]'
      )}
    >
      <Text style={tw`text-xs font-semibold text-red-600 dark:text-red-300`}>
        {deleting ? 'Deleting…' : 'Delete'}
      </Text>
    </Pressable>
  </View>
);

const ClassVaultCard: React.FC<{
  item: RecordedVideo;
  showTutorActions?: boolean;
  isPurchased?: boolean;
  deleting?: boolean;
  isVisible?: boolean;
  onPress: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}> = ({ item, showTutorActions, isPurchased, deleting, isVisible, onPress, onEdit, onDelete }) => {
  const bust = cacheBust(item);

  const pdfUrlRaw = withBust((item as any)?.pdf_url || '', bust) || '';
  const pdfPreviewUrl = pdfUrlRaw ? toPdfPreviewUrl(pdfUrlRaw) : '';

  const previewUrl = withBust((item as any)?.preview_url || (item as any)?.video_url || '', bust) || '';
  const thumbUrl = withBust(classVaultThumb(item) || '', bust) || '';

  const pdfOnly = Boolean((item as any)?.pdf_url) && !(item as any)?.video_url;
  const [pdfBlocked, setPdfBlocked] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      style={tw`mb-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111b25] overflow-hidden`}
    >
      <View style={tw`relative h-32 bg-[#0b1220] overflow-hidden`}>
        {pdfOnly && WebView && pdfPreviewUrl && !pdfBlocked ? (
          <WebView
            source={{ uri: pdfPreviewUrl }}
            style={{ flex: 1, backgroundColor: 'transparent' }}
            onError={() => setPdfBlocked(true)}
            javaScriptEnabled={false}
            domStorageEnabled={false}
          />
        ) : null}

        {thumbUrl && (!pdfOnly || pdfBlocked || !pdfPreviewUrl || !WebView) ? (
          <Image source={{ uri: thumbUrl }} style={tw`w-full h-full`} contentFit="cover" cachePolicy="none" />
        ) : null}

        {!pdfOnly && previewUrl && isVisible ? (
          <AutoPreviewVideo uri={previewUrl} shouldPlay style={tw`absolute inset-0`} />
        ) : null}

        <View style={tw`absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5`}>
          <Text style={tw`text-[11px] text-white font-semibold`}>{pdfOnly ? 'Notes' : 'Preview'}</Text>
        </View>

        {showTutorActions && onEdit && onDelete ? (
          <TutorActions onEdit={onEdit} onDelete={onDelete} deleting={deleting} />
        ) : null}

        {pdfOnly && (pdfBlocked || !WebView || !pdfPreviewUrl) ? (
          <View style={tw`absolute inset-0 items-center justify-center bg-black/35 px-3`}>
            <Text style={tw`text-xs text-white font-semibold`}>Notes preview unavailable</Text>
            <Text style={tw`text-[11px] text-white/80 mt-1 text-center`}>Tap to open and view the PDF.</Text>
          </View>
        ) : null}
      </View>

      <View style={tw`p-3`}>
        <Text style={tw`text-sm font-semibold text-slate-900 dark:text-white`} numberOfLines={2}>
          {item.title || 'Untitled'}
        </Text>
        <Text style={tw`text-xs text-slate-500 dark:text-white/60 mt-1`} numberOfLines={1}>
          {item.subject || (item as any)?.grade_level || 'ClassVault'}
        </Text>
        {isPurchased ? <Badge label="Purchased" /> : null}
      </View>
    </Pressable>
  );
};

const CourseCard: React.FC<{
  course: Course;
  backendUrl?: string;
  onPress: () => void;
  badge?: string;
}> = ({ course, backendUrl, onPress, badge }) => {
  const thumb = courseThumb(course) || pickImageUriForCourse(course as any, backendUrl);
  const src = withBust(thumb, cacheBust(course))!;

  return (
    <Pressable
      onPress={onPress}
      style={tw`mb-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111b25] overflow-hidden`}
    >
      <View style={tw`h-28 bg-slate-200 dark:bg-white/10`}>
        <Image source={{ uri: src }} style={tw`w-full h-full`} contentFit="cover" cachePolicy="none" />
      </View>

      <View style={tw`p-3`}>
        <Text style={tw`text-sm font-semibold text-slate-900 dark:text-white`} numberOfLines={2}>
          {course.title || 'Untitled course'}
        </Text>
        <Text style={tw`text-xs text-slate-500 dark:text-white/60 mt-1`} numberOfLines={1}>
          {(course as any).subject || 'Course'}
        </Text>
        {badge ? <Badge label={badge} /> : null}
      </View>
    </Pressable>
  );
};

const SectionHeader: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <View style={tw`px-4 pt-4 pb-2`}>
    <Text style={tw`text-lg font-semibold text-slate-900 dark:text-white`}>{title}</Text>
    <Text style={tw`text-xs text-slate-500 dark:text-white/60 mt-1`}>{subtitle}</Text>
  </View>
);

const SectionFooter: React.FC<{
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyMessage: string;
  hasMore: boolean;
  onLoadMore: () => void;
}> = ({ loading, error, empty, emptyMessage, hasMore, onLoadMore }) => (
  <View style={tw`px-4 pb-4`}>
    {loading && !error && empty ? (
      <Text style={tw`text-sm text-slate-500 dark:text-white/60`}>Loading…</Text>
    ) : null}
    {error ? <Text style={tw`text-sm text-red-500`}>{error}</Text> : null}
    {!loading && !error && empty ? (
      <Text style={tw`text-sm text-slate-500 dark:text-white/60`}>{emptyMessage}</Text>
    ) : null}
    {hasMore ? (
      <Pressable
        onPress={onLoadMore}
        style={tw`mt-3 self-start rounded-full bg-blue-500 px-4 py-2`}
      >
        <Text style={tw`text-sm font-semibold text-white`}>Load more</Text>
      </Pressable>
    ) : null}
  </View>
);

/* ─────────────────────────────────────────────────────────
 * ✅ Top AI courses promo (now up to 20 per batch)
 * ───────────────────────────────────────────────────────── */

const TopCoursesPromoGrid: React.FC<{
  backendUrl?: string;
  authToken?: string;
  onPick: (course: TopCourse) => void;
}> = ({ backendUrl, authToken, onPick }) => {
  const { topCourses, loadTopCourses, hasMoreCourses, coursesCursor, error } = useAiCourse(
    backendUrl || '',
    authToken,
    { defaultQuizType: 'mcq' }
  );

  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const promoCursorRef = useRef<string | null>(null);

  useEffect(() => {
    promoCursorRef.current = coursesCursor ?? null;
  }, [coursesCursor]);

  useEffect(() => {
    if (!error) return;
    setPromoError(error);
  }, [error]);

  const canLoadMore = Boolean(hasMoreCourses) || Boolean(promoCursorRef.current);

  const fetchTopCourses = useCallback(
    async (opts?: { append?: boolean }) => {
      if (!backendUrl || !authToken) return;
      setPromoLoading(true);
      setPromoError(null);
      try {
        await loadTopCourses({
          // ✅ increased to 20
          limit: 20,
          append: opts?.append,
          cursor: opts?.append ? promoCursorRef.current ?? undefined : undefined,
        });
      } catch (e: any) {
        setPromoError(e?.message || 'Failed to load courses');
      } finally {
        setPromoLoading(false);
      }
    },
    [backendUrl, authToken, loadTopCourses]
  );

  useEffect(() => {
    fetchTopCourses({ append: false });
  }, [fetchTopCourses]);

  if (!topCourses.length && promoLoading) {
    return (
      <View style={tw`mt-4`}>
        <Text style={tw`text-sm text-slate-500 dark:text-white/60`}>Loading top courses…</Text>
      </View>
    );
  }

  return (
    <View style={tw`mt-4`}>
      <View style={tw`rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111b25] p-4`}>
        <Text style={tw`text-base font-extrabold text-slate-900 dark:text-white`}>Top AI courses</Text>
        <Text style={tw`text-xs text-slate-500 dark:text-white/60 mt-1`}>
          Try one instantly with AI Tutor Studio
        </Text>

        {promoError ? (
          <View style={tw`mt-3`}>
            <Text style={tw`text-sm text-red-500`}>{promoError}</Text>
            <Pressable onPress={() => fetchTopCourses({ append: false })} style={tw`mt-2 self-start`}>
              <Text style={tw`text-sm font-semibold text-blue-600 dark:text-blue-400`}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={tw`mt-3 flex-row flex-wrap -mx-2`}>
          {topCourses.map((course) => {
            const thumb = courseThumb(course) || pickImageUriForCourse(course as any, backendUrl);
            const src = withBust(thumb, cacheBust(course))!;
            return (
              <View key={String(course.id)} style={tw`w-1/2 px-2 mb-4`}>
                <Pressable
                  onPress={() => onPick(course)}
                  style={tw`rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f1821] overflow-hidden`}
                >
                  <View style={tw`h-28 bg-slate-200 dark:bg-white/10`}>
                    <Image source={{ uri: src }} style={tw`w-full h-full`} contentFit="cover" cachePolicy="none" />
                  </View>
                  <View style={tw`p-3`}>
                    <Text style={tw`text-sm font-semibold text-slate-900 dark:text-white`} numberOfLines={2}>
                      {course.title || 'Untitled course'}
                    </Text>
                    <Text style={tw`text-xs text-slate-500 dark:text-white/60 mt-1`} numberOfLines={2}>
                      {course.blurb || 'AI course'}
                    </Text>
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>

        <Pressable
          onPress={() => fetchTopCourses({ append: true })}
          disabled={promoLoading || !canLoadMore}
          style={tw.style(
            'mt-1 rounded-xl px-4 py-3 items-center justify-center',
            promoLoading || !canLoadMore ? 'bg-slate-200 dark:bg-white/10' : 'bg-blue-500'
          )}
        >
          <Text
            style={tw.style(
              'text-sm font-extrabold',
              promoLoading || !canLoadMore ? 'text-slate-500 dark:text-white/60' : 'text-white'
            )}
          >
            {promoLoading ? 'Loading…' : canLoadMore ? 'Load more' : 'All loaded'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

const MyCoursesNative: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  // ✅ Footer overlay safety (like your other screens)
  const FOOTER_OVERLAY_PX = 84;
  const bottomPad = Math.max(FOOTER_OVERLAY_PX, FOOTER_OVERLAY_PX + insets.bottom);

  const { backendUrl, token } = useShopContext();
  const { role, isTutor, sections } = useMyLibrary();
  const { remove: removeVault } = useClassVault();
  const authToken = token;

  const [deletedCourseIds, setDeletedCourseIds] = useState<Set<string>>(new Set());
  const [deletedVaultIds, setDeletedVaultIds] = useState<Set<string>>(new Set());
  const [deletingVaultId, setDeletingVaultId] = useState<string | null>(null);

  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 55 }), []);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    const next = new Set<string>();
    for (const v of viewableItems || []) {
      const it = v?.item;
      if (!it) continue;
      if (it.kind === 'classvault') {
        const id = getVaultId(it);
        if (id > 0) next.add(`classvault:${id}`);
      }
    }
    setVisibleIds(next);
  }).current;

  const tryRefreshSection = useCallback(async (sec: any) => {
    try {
      if (typeof sec?.refresh === 'function') return await sec.refresh();
      if (typeof sec?.refetch === 'function') return await sec.refetch();
      if (typeof sec?.reload === 'function') return await sec.reload();
      if (typeof sec?.fetch === 'function') return await sec.fetch();
    } catch {}
  }, []);

  useEffect(() => {
    if (authToken) return;
    navigation.navigate(
      'Login' as any,
      {
        reason: 'auth',
        message: 'Please sign in to view your library',
        returnTo: 'Courses',
      } as any
    );
  }, [authToken, navigation]);

  const onDeleteVault = useCallback(
    (item: RecordedVideo) => {
      const idNum = getVaultId(item);
      if (idNum <= 0) {
        Alert.alert('Error', 'Invalid item id.');
        return;
      }

      Alert.alert('Delete item?', `Delete "${item.title || 'this item'}"? This cannot be undone.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const id = String(idNum);
            setDeletingVaultId(id);
            setDeletedVaultIds((prev) => new Set(prev).add(id));

            try {
              await removeVault(idNum);
              await tryRefreshSection(sections?.createdClassVault);
            } catch (e: any) {
              setDeletedVaultIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
              Alert.alert('Failed', e?.message || 'Failed to delete item.');
            } finally {
              setDeletingVaultId(null);
            }
          },
        },
      ]);
    },
    [removeVault, sections, tryRefreshSection]
  );

  const createdVaultItems = useMemo(() => {
    const raw = sections.createdClassVault.items || [];
    return raw.filter((x: any) => !deletedVaultIds.has(String(x?.id)));
  }, [sections.createdClassVault.items, deletedVaultIds]);

  const purchasedVaultItems = useMemo(() => {
    const raw = sections.purchasedClassVault.items || [];
    return raw.filter((x: any) => !deletedVaultIds.has(String(x?.id)));
  }, [sections.purchasedClassVault.items, deletedVaultIds]);

  const normalCourseItems = useMemo(() => {
    const raw = sections.normalCourses.items || [];
    return raw.filter((c: any) => !deletedCourseIds.has(String(c?.id)));
  }, [sections.normalCourses.items, deletedCourseIds]);

  const aiCourseItems = useMemo(() => {
    const raw = sections.aiCourses.items || [];
    return raw.filter((c: any) => !deletedCourseIds.has(String(c?.id)));
  }, [sections.aiCourses.items, deletedCourseIds]);

  const librarySections: LibrarySection[] = useMemo(() => {
    if (role === 'tutor') {
      return [
        {
          key: 'createdClassVault',
          title: 'Your ClassVault Videos & Notes',
          subtitle: 'Only your uploaded ClassVault content.',
          data: createdVaultItems.map((item) => ({ ...item, kind: 'classvault', sectionKey: 'createdClassVault' })),
          loading: sections.createdClassVault.loading,
          error: sections.createdClassVault.error,
          emptyMessage: 'You haven’t uploaded any ClassVault videos or notes yet.',
          hasMore: sections.createdClassVault.hasMore,
          loadMore: sections.createdClassVault.loadMore,
        },
        {
          key: 'normalCourses',
          title: 'Your Courses',
          subtitle: 'Courses you created for learners.',
          data: normalCourseItems.map((item) => ({ ...item, kind: 'course', sectionKey: 'normalCourses' })),
          loading: sections.normalCourses.loading,
          error: sections.normalCourses.error,
          emptyMessage: 'You haven’t created any courses yet.',
          hasMore: sections.normalCourses.hasMore,
          loadMore: sections.normalCourses.loadMore,
        },
        {
          key: 'aiCourses',
          title: 'Your AI Courses',
          subtitle: 'AI courses you personally unlocked.',
          data: aiCourseItems.map((item) => ({ ...item, kind: 'course', ai: true, sectionKey: 'aiCourses' })),
          loading: sections.aiCourses.loading,
          error: sections.aiCourses.error,
          emptyMessage: 'You haven’t unlocked any AI courses yet.',
          hasMore: sections.aiCourses.hasMore,
          loadMore: sections.aiCourses.loadMore,
        },
      ];
    }

    return [
      {
        key: 'purchasedClassVault',
        title: 'Purchased Videos & Notes',
        subtitle: 'Your ClassVault purchases live here.',
        data: purchasedVaultItems.map((item) => ({ ...item, kind: 'classvault', sectionKey: 'purchasedClassVault' })),
        loading: sections.purchasedClassVault.loading,
        error: sections.purchasedClassVault.error,
        emptyMessage: 'You haven’t purchased any videos or notes yet.',
        hasMore: sections.purchasedClassVault.hasMore,
        loadMore: sections.purchasedClassVault.loadMore,
      },
      {
        key: 'aiCourses',
        title: 'AI Courses',
        subtitle: 'AI-powered courses you unlocked.',
        data: aiCourseItems.map((item) => ({ ...item, kind: 'course', ai: true, sectionKey: 'aiCourses' })),
        loading: sections.aiCourses.loading,
        error: sections.aiCourses.error,
        emptyMessage: 'You haven’t unlocked any AI courses yet.',
        hasMore: sections.aiCourses.hasMore,
        loadMore: sections.aiCourses.loadMore,
      },
      {
        key: 'normalCourses',
        title: 'Courses',
        subtitle: 'Courses you enrolled in or purchased.',
        data: normalCourseItems.map((item) => ({ ...item, kind: 'course', sectionKey: 'normalCourses' })),
        loading: sections.normalCourses.loading,
        error: sections.normalCourses.error,
        emptyMessage: 'You haven’t enrolled in any courses yet.',
        hasMore: sections.normalCourses.hasMore,
        loadMore: sections.normalCourses.loadMore,
      },
    ];
  }, [role, sections, createdVaultItems, purchasedVaultItems, normalCourseItems, aiCourseItems]);

  const renderItem = ({ item }: { item: SectionItem }) => {
    if (item.kind === 'classvault') {
      const id = getVaultId(item);
      const deleting = deletingVaultId === String(id);
      const isPurchased = item.sectionKey === 'purchasedClassVault';
      const key = `classvault:${id}`;
      const isVisible = visibleIds.has(key);

      return (
        <ClassVaultCard
          item={{ ...(item as any), id }}
          isVisible={isVisible}
          isPurchased={isPurchased}
          showTutorActions={role === 'tutor' && item.sectionKey === 'createdClassVault'}
          deleting={deleting}
          onPress={() => {
            if (id <= 0) {
              Alert.alert('Error', 'Invalid item id. Please refresh.');
              return;
            }
            navigation.navigate('ClassVaultDetail', { id });
          }}
          onEdit={() => navigation.navigate('ClassVaultUpload')}
          onDelete={() => onDeleteVault({ ...(item as any), id } as any)}
        />
      );
    }

    if (item.ai) {
      return (
        <CourseCard
          course={item}
          backendUrl={backendUrl}
          badge="AI"
          onPress={() =>
            navigation.navigate('RobotTutor', {
              courseId: String(item.id),
              courseTitle: item.title,
              source: 'library',
            })
          }
        />
      );
    }

    return (
      <CourseCard
        course={item}
        backendUrl={backendUrl}
        onPress={() =>
          navigation.navigate(
            'CourseProgress',
            {
              courseId: String(item.id),
              source: 'library',
            } as any
          )
        }
      />
    );
  };

  if (!authToken) return null;

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
      <SectionList
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        sections={librarySections}
        keyExtractor={(item, index) => `${item.kind}-${String(item.id)}-${index}`}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => <SectionHeader title={section.title} subtitle={section.subtitle} />}
        renderSectionFooter={({ section }) => (
          <View>
            <SectionFooter
              loading={section.loading}
              error={section.error}
              empty={section.data.length === 0}
              emptyMessage={section.emptyMessage}
              hasMore={section.hasMore}
              onLoadMore={section.loadMore}
            />

            {/* ✅ Show Top AI courses under Courses when empty */}
            {section.key === 'normalCourses' &&
            section.data.length === 0 &&
            !section.loading &&
            !section.error ? (
              <TopCoursesPromoGrid
                backendUrl={backendUrl}
                authToken={authToken || undefined}
                onPick={(course) =>
                  navigation.navigate('RobotTutor', {
                    courseId: String(course.id),
                    courseTitle: course.title,
                    source: 'top-courses',
                  })
                }
              />
            ) : null}
          </View>
        )}
        ListHeaderComponent={
          <View style={tw`px-4 pt-4 pb-2`}>
            <Text style={tw`text-2xl font-extrabold text-slate-900 dark:text-white`}>My Library</Text>
            <Text style={tw`text-sm text-slate-500 dark:text-white/60 mt-1`}>
              {isTutor
                ? 'Everything you created or unlocked lives here.'
                : 'Your purchased and enrolled learning content lives here.'}
            </Text>

            {role === 'tutor' ? (
              <Pressable
                onPress={() => navigation.navigate('ClassVaultUpload')}
                style={tw`mt-4 self-start rounded-full bg-blue-500 px-4 py-2`}
              >
                <Text style={tw`text-sm font-semibold text-white`}>+ Upload to ClassVault</Text>
              </Pressable>
            ) : null}
          </View>
        }
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={tw.style('bg-slate-50 dark:bg-[#0b1016]', { paddingBottom: bottomPad })}
      />
    </SafeAreaView>
  );
};

export default MyCoursesNative;
