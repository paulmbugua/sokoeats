/* eslint-disable no-console */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, NavigationProp } from '@react-navigation/native';
import tw from '../../tailwind';
import { useShopContext } from '@mytutorapp/shared/context';
// Optional: if you want “Learn Course” like web, uncomment next line and use startOerRobot()
// import { useWrapOer } from '@mytutorapp/shared/hooks';

/* ─────────────────────────────────────────────────────────
   Types
   ───────────────────────────────────────────────────────── */
type MainStackParamList = {
  Videos: undefined;
  VideoCollection: { id: string | number };
  // CourseProgress?: { courseId: string }; // optional, if you wire RobotTeacher flow
};

type VideosRoute =
  | RouteProp<MainStackParamList, 'Videos'>
  | RouteProp<MainStackParamList, 'VideoCollection'>;

type Collection = {
  id: string | number;
  title: string;
  description?: string | null;
  subject?: string | null;
  thumbnail_url?: string | null;
  items_count?: number;
  content_kind?: string | null;
  [k: string]: any;
};

type OerItem = {
  slug: string;
  title: string;
  type: 'video' | 'text';
  provider: string;
  subject: string | null;
  grade_level?: string | null;
  thumbnail_url: string | null;
  source_url: string | null;
  embed_url: string | null;
  license: string | null;
  [k: string]: any;
};

/* ─────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────── */
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
    const vals = Object.values(val);
    return vals.every((v) => typeof v === 'object') ? (vals as T[]) : [];
  }
  return [];
}

const safeNumber = (v: any, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/* ─────────────────────────────────────────────────────────
   Small UI bits
   ───────────────────────────────────────────────────────── */
const SectionHeader = ({ title, right }: { title: string; right?: React.ReactNode }) => (
  <View style={tw`flex-row items-center justify-between mb-3`}>
    <Text style={tw`text-[#0d141c] dark:text-white font-bold text-2xl`}>{title}</Text>
    {right ? right : null}
  </View>
);

const PlayThumb = ({ uri, onPress }: { uri?: string | null; onPress?: () => void }) => (
  <TouchableOpacity
    activeOpacity={0.9}
    onPress={onPress}
    style={tw`relative w-full rounded-lg overflow-hidden bg-black/70`}
  >
    {uri ? (
      <Image source={{ uri }} style={[tw`w-full`, { aspectRatio: 16 / 9 }]} resizeMode="cover" />
    ) : (
      <View style={[tw`w-full bg-black/70`, { aspectRatio: 16 / 9 }]} />
    )}
    <View style={tw`absolute inset-0 items-center justify-center`}>
      <Text style={tw`text-white text-4xl`}>▶</Text>
    </View>
  </TouchableOpacity>
);

/* ─────────────────────────────────────────────────────────
   Screen
   ───────────────────────────────────────────────────────── */
const VideosNative: React.FC = () => {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<NavigationProp<MainStackParamList>>();
  const route = useRoute<VideosRoute>();
  const params: any = route.params ?? {};
  const collectionId = params?.id ?? null;

  const { backendUrl: rawBackend } = useShopContext();
  const backendUrl = (rawBackend || '').replace(/\/+$/, '');
  // const { wrap: wrapOer } = useWrapOer(); // optional RobotTeacher jump

  const isList = !collectionId;

  // List state
  const [collections, setCollections] = useState<Collection[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [listRefreshing, setListRefreshing] = useState(false);

  // Detail state
  const [items, setItems] = useState<OerItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [itemsRefreshing, setItemsRefreshing] = useState(false);
  const list = useMemo(() => toArray<Collection>(collections), [collections]);
  const itemList = useMemo(() => toArray<OerItem>(items), [items]);

  /* ── Fetch: LIST ─────────────────────────────────────── */
  const loadCollections = useCallback(async () => {
    if (!backendUrl) return;
    setListLoading(true);
    setListError(null);
    try {
      const tryFetch = async (qs: string) => {
        const r = await fetch(`${backendUrl}/api/oer/collections?${qs}`);
        if (!r.ok) return [];
        const data = await r.json().catch(() => []);
        return toArray<Collection>(data);
      };

      // 1) Preferred
      let arr = await tryFetch('kind=video&limit=48');
      // 2) Backend variant
      if (arr.length === 0) arr = await tryFetch('content_kind=video&limit=48');
      // 3) Last resort: fetch all, filter client-side
      if (arr.length === 0) {
        const all = await tryFetch('limit=48');
        arr = all.filter(
          (c) =>
            String(c.content_kind || '')
              .toLowerCase()
              .includes('video') || /video/i.test(c.title || '')
        );
      }

      setCollections(arr);
    } catch (e: any) {
      setCollections([]);
      setListError(String(e?.message || e) || 'Failed to load collections');
    } finally {
      setListLoading(false);
    }
  }, [backendUrl]);

  const refreshCollections = useCallback(async () => {
    setListRefreshing(true);
    try {
      await loadCollections();
    } finally {
      setListRefreshing(false);
    }
  }, [loadCollections]);

  /* ── Fetch: DETAIL ───────────────────────────────────── */
  const loadItems = useCallback(async () => {
    if (!backendUrl || !collectionId) return;
    setItemsLoading(true);
    setItemsError(null);
    try {
      const r = await fetch(
        `${backendUrl}/api/oer/collections/${encodeURIComponent(String(collectionId))}/items`
      );
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const data = await r.json().catch(() => []);
      setItems(toArray<OerItem>(data));
    } catch (e: any) {
      setItems([]);
      setItemsError(String(e?.message || e) || 'Failed to load items');
    } finally {
      setItemsLoading(false);
    }
  }, [backendUrl, collectionId]);

  const refreshItems = useCallback(async () => {
    setItemsRefreshing(true);
    try {
      await loadItems();
    } finally {
      setItemsRefreshing(false);
    }
  }, [loadItems]);

  /* ── Effects ─────────────────────────────────────────── */
  useEffect(() => {
    if (!backendUrl) return;
    if (isList) loadCollections();
    else loadItems();
  }, [backendUrl, isList, loadCollections, loadItems]);

  /* ── Render: LIST ────────────────────────────────────── */
  if (isList) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={listRefreshing}
              onRefresh={refreshCollections}
              tintColor="#3d99f5"
            />
          }
          contentContainerStyle={[tw`px-3 py-4`, { paddingBottom: (insets?.bottom ?? 0) + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <SectionHeader title="Free Video Collections" />

          {/* Loading */}
          {listLoading ? (
            <View style={tw`py-10 items-center`}>
              <ActivityIndicator />
              <Text style={tw`mt-2 text-[#49739c] dark:text-white/70`}>Loading…</Text>
            </View>
          ) : null}

          {/* Error */}
          {!listLoading && listError ? (
            <View style={tw`rounded-xl p-3 bg-red-50 border border-red-200`}>
              <Text style={tw`text-red-700`}>{listError}</Text>
            </View>
          ) : null}

          {/* Empty */}
          {!listLoading && !listError && list.length === 0 ? (
            <Text style={tw`text-[#49739c] dark:text-white/70 py-10`}>No collections yet.</Text>
          ) : null}

          {/* Grid (2 columns on native) */}
          <View style={tw`flex-row flex-wrap -mx-1`}>
            {list.map((c) => {
              const count = safeNumber(c.items_count, 0);
              return (
                <View key={String(c.id)} style={tw`w-1/2 px-1 mb-3`}>
                  <View
                    style={tw`bg-white dark:bg-[#0f1821] rounded-lg ring-1 ring-[#e7edf4] dark:ring-darkCard shadow-sm overflow-hidden`}
                  >
                    <PlayThumb
                      uri={c.thumbnail_url || undefined}
                      onPress={() => nav.navigate('VideoCollection', { id: c.id })}
                    />
                    <View style={tw`p-3`}>
                      <Text
                        numberOfLines={2}
                        style={tw`text-[#0d141c] dark:text-white font-semibold`}
                      >
                        {c.title}
                      </Text>
                      <Text style={tw`text-xs text-[#49739c] dark:text-white/70 mt-1`}>
                        {c.subject ?? '—'} • {count} item{count === 1 ? '' : 's'}
                      </Text>
                      {c.description ? (
                        <Text
                          numberOfLines={2}
                          style={tw`text-xs text-[#49739c] dark:text-white/70 mt-1`}
                        >
                          {c.description}
                        </Text>
                      ) : null}
                      <View style={tw`mt-3`}>
                        <TouchableOpacity
                          onPress={() => nav.navigate('VideoCollection', { id: c.id })}
                          style={tw`h-9 px-4 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
                        >
                          <Text style={tw`text-xs font-semibold text-[#0d141c] dark:text-white`}>
                            View Collection
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  /* ── Render: DETAIL ──────────────────────────────────── */

  const openUrl = (u?: string | null) => {
    if (!u) return;
    try {
      Linking.openURL(u);
    } catch {}
  };

  // Optional RobotTeacher jump (requires route + hook wired in your app):
  // const startOerRobot = async (slug: string) => {
  //   try {
  //     const { courseId } = await wrapOer(slug);
  //     nav.navigate('CourseProgress', { courseId } as any);
  //   } catch (e: any) {
  //     console.warn('Failed to launch RobotTeacher', e?.message || e);
  //   }
  // };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={itemsRefreshing}
            onRefresh={refreshItems}
            tintColor="#3d99f5"
          />
        }
        contentContainerStyle={[tw`px-3 py-4`, { paddingBottom: (insets?.bottom ?? 0) + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <SectionHeader
          title="Collection"
          right={
            <TouchableOpacity
              onPress={() => nav.navigate('Videos')}
              style={tw`px-3 py-2 rounded-lg bg-white dark:bg-[#172534] border border-[#cedbe8] dark:border-white/15`}
            >
              <Text style={tw`text-xs font-semibold text-[#0d141c] dark:text-white`}>
                All Collections
              </Text>
            </TouchableOpacity>
          }
        />

        {itemsLoading ? (
          <View style={tw`py-10 items-center`}>
            <ActivityIndicator />
            <Text style={tw`mt-2 text-[#49739c] dark:text-white/70`}>Loading…</Text>
          </View>
        ) : null}

        {!itemsLoading && itemsError ? (
          <View style={tw`rounded-xl p-3 bg-red-50 border border-red-200`}>
            <Text style={tw`text-red-700`}>{itemsError}</Text>
          </View>
        ) : null}

        {!itemsLoading && !itemsError && itemList.length === 0 ? (
          <Text style={tw`text-[#49739c] dark:text-white/70 py-10`}>
            No items in this collection.
          </Text>
        ) : null}

        <View style={tw`flex-row flex-wrap -mx-1`}>
          {itemList.map((v) => {
            const watchUrl = v.embed_url || v.source_url || '';
            const badge = `${(v.provider || '').toUpperCase()} • OER`;

            return (
              <View key={v.slug} style={tw`w-1/2 px-1 mb-3`}>
                <View
                  style={tw`bg-white dark:bg-[#0f1821] rounded-lg ring-1 ring-[#e7edf4] dark:ring-darkCard shadow-sm overflow-hidden`}
                >
                  <PlayThumb uri={v.thumbnail_url || undefined} onPress={() => openUrl(watchUrl)} />
                  <View style={tw`p-3`}>
                    <Text
                      numberOfLines={2}
                      style={tw`text-[#0d141c] dark:text-white font-semibold text-sm`}
                    >
                      {v.title}
                    </Text>
                    <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70 mt-1`}>
                      {badge}
                      {v.subject ? ` • ${v.subject}` : ''}
                      {v.grade_level ? ` • ${v.grade_level}` : ''}
                    </Text>

                    <View style={tw`mt-3 flex-row gap-2`}>
                      {v.source_url ? (
                        <TouchableOpacity
                          onPress={() => openUrl(v.source_url!)}
                          style={tw`flex-1 h-9 rounded-lg bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/15 items-center justify-center`}
                        >
                          <Text style={tw`text-xs font-semibold text-[#0d141c] dark:text-white`}>
                            View at Source
                          </Text>
                        </TouchableOpacity>
                      ) : null}

                      {v.embed_url ? (
                        <TouchableOpacity
                          onPress={() => openUrl(v.embed_url!)}
                          style={tw`flex-1 h-9 rounded-lg bg-[#3d99f5] items-center justify-center`}
                        >
                          <Text style={tw`text-xs font-semibold text-white`}>Watch</Text>
                        </TouchableOpacity>
                      ) : null}

                      {/* Optional: “Learn Course” like web (requires RobotTeacher flow) */}
                      {/* <TouchableOpacity
                        onPress={() => startOerRobot(v.slug)}
                        style={tw`flex-1 h-9 rounded-lg border border-[#cedbe8] dark:border-white/15 items-center justify-center`}
                      >
                        <Text style={tw`text-xs font-semibold text-[#0d141c] dark:text-white`}>Learn Course</Text>
                      </TouchableOpacity> */}
                    </View>

                    {v.license ? (
                      <Text style={tw`mt-2 text-[11px] text-[#49739c] dark:text-white/70`}>
                        License: {v.license}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default VideosNative;
