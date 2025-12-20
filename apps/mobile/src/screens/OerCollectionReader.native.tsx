/* eslint-disable prettier/prettier */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  Alert,
  FlatList,
  Linking,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import { useShopContext } from '@mytutorapp/shared/context';
import { useWrapOerBook } from '@mytutorapp/shared/hooks';
import type { MainStackParamList } from '../navigation/types';
import tw from '../../tailwind';

/* -------------------------------------------------------------------------- */
/* Types & helpers                                                            */
/* -------------------------------------------------------------------------- */
type CollectionItemKind = 'video' | 'book' | 'pdf' | 'text' | 'collection' | 'audio';

export type CollectionItem = {
  id?: string | number;
  title: string;
  kind?: CollectionItemKind;
  slug?: string;
  source_url?: string;
  file_url?: string;
  web_url?: string | null;
  cover_url?: string | null;
  video_url?: string;
  url?: string;
  provider?: string;
  embed_url?: string;
  duration?: string;
  pages?: number;
  [key: string]: any;
};

type OerRouteName = 'OerCollectionReader';
type OerParams = { id: string };
type Nav = StackNavigationProp<MainStackParamList, OerRouteName>;
type Rt = RouteProp<MainStackParamList, OerRouteName>;

const lsKey = (collectionId: string | number, suffix: string) =>
  `oer.collection.${collectionId}.${suffix}`;

const sanitizeId = (routeId?: string) => {
  let s = routeId ?? '';
  try {
    s = decodeURIComponent(s);
  } catch {}
  if (s.startsWith(':id')) s = s.slice(3);
  if (s.startsWith(':')) s = s.slice(1);
  return s;
};

const isProbablyPdfUrl = (u?: string) => !!u && /\.pdf($|\?)/i.test(u);
const isProbablyVideoUrl = (u?: string) =>
  !!u &&
  /(youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com|\.m3u8($|\?)|\.mp4($|\?)|\.webm($|\?)|\/playlist\?list=)/i.test(
    u
  );

const toWatchLikeYouTube = (raw?: string) => {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, '');
    const sp = u.searchParams;

    const yt =
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtube-nocookie.com' ||
      host === 'youtu.be' ||
      host.endsWith('.youtube.com');
    if (!yt) return raw;

    if (u.pathname.startsWith('/shorts/')) {
      const segs = u.pathname.split('/');
      const id = segs[2] ?? '';
      return `https://www.youtube.com/watch?v=${id}`;
    }

    if (host === 'youtu.be') return raw;
    if (u.pathname.startsWith('/embed/')) {
      const id = u.pathname.split('/')[2];
      const list = sp.get('list');
      return list
        ? `https://www.youtube.com/watch?v=${id}&list=${list}`
        : `https://www.youtube.com/watch?v=${id}`;
    }
    return raw;
  } catch {
    return raw;
  }
};

const toYouTubeEmbed = (raw?: string) => {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, '');
    const sp = u.searchParams;
    const list = sp.get('list');
    const v = sp.get('v');

    const baseParams = `modestbranding=1&playsinline=1&rel=0`;

    if ((u.pathname === '/playlist' || list) && !v) {
      return `https://www.youtube.com/embed/videoseries?list=${list ?? ''}&${baseParams}`;
    }

    let id = '';
    if (host === 'youtu.be') id = u.pathname.slice(1);
    else if (u.pathname.startsWith('/embed/')) {
      const segs = u.pathname.split('/');
      id = segs[2] ?? '';
    } else if (u.pathname.startsWith('/shorts/')) {
      const segs = u.pathname.split('/');
      id = segs[2] ?? '';
    } else if (v) id = v;

    if (id) {
      return `https://www.youtube-nocookie.com/embed/${id}?${baseParams}${list ? `&list=${list}` : ''}`;
    }
    return raw;
  } catch {
    return raw;
  }
};

const getPlayableUrl = (it?: CollectionItem) => {
  if (!it) return '';
  const raw = it.embed_url || it.video_url || it.source_url || (it as any).url || '';
  return toWatchLikeYouTube(raw);
};

const normalizeKind = (it: CollectionItem): CollectionItemKind => {
  const raw = String(it.kind || (it as any).type || (it as any).category || '').toLowerCase();
  const s = it.source_url || '';
  const f = it.file_url || (it as any).pdf_url || '';
  const e = it.embed_url || '';
  const v = it.video_url || '';
  const u = (it as any).url || '';
  if (raw.includes('video') || [e, s, v, u].some(isProbablyVideoUrl)) return 'video';
  if (raw.includes('pdf') || [s, f].some(isProbablyPdfUrl)) return 'pdf';
  if (raw.includes('book')) return 'book';
  if (raw.includes('text')) {
    if ([s, f].some(isProbablyPdfUrl)) return 'pdf';
    return 'text';
  }
  if ([e, s, v, u].some(isProbablyVideoUrl)) return 'video';
  if ([s, f].some(isProbablyPdfUrl)) return 'pdf';
  return 'collection';
};

const getPdfUrl = (it: CollectionItem) => it.file_url || (it as any).pdf_url || it.source_url || '';
const getVideoUrl = (it: CollectionItem) =>
  it.video_url || it.embed_url || it.source_url || (it as any).url || '';

async function tryJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function coerceItemsFromPayload(payload: any, slugOrId: string): CollectionItem[] {
  if (payload && Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload)) return payload;

  const html = payload?.web_url || payload?.html_url;
  if (html) {
    return [
      {
        id: payload?.id ?? slugOrId,
        slug: payload?.slug ?? slugOrId,
        title: payload?.title || payload?.name || 'Untitled Book',
        kind: 'text',
        web_url: html,
        cover_url: payload?.cover_url || null,
        provider: payload?.provider || payload?.origin || 'OER',
        pages: payload?.pages,
      },
    ];
  }

  const file = payload?.file_url || payload?.pdf_url || payload?.source_url || payload?.url || '';
  if (file) {
    const isPdf = isProbablyPdfUrl(file);
    return [
      {
        id: payload?.id ?? slugOrId,
        slug: payload?.slug ?? slugOrId,
        title: payload?.title || payload?.name || 'Untitled Book',
        kind: isPdf ? 'pdf' : 'text',
        web_url: isPdf ? null : file,
        ...(isPdf ? { file_url: file } : {}),
        cover_url: payload?.cover_url || null,
        provider: payload?.provider || payload?.origin || 'OER',
      },
    ];
  }

  if (payload?.data && Array.isArray(payload.data.items)) return payload.data.items;
  return [];
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */
const OerCollectionReaderNative: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const id = sanitizeId(String((route.params as any)?.id ?? ''));

  const { backendUrl, token } = useShopContext();
  const { wrapBook } = useWrapOerBook();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);

  // UI state
  const [openPlaylist, setOpenPlaylist] = useState(false);
  const [openNotes, setOpenNotes] = useState(false);
  const [search, setSearch] = useState('');

  // Notes (per item)
  const activeItem = items[activeIndex];
  const notesKey = useMemo(
    () =>
      lsKey(id || 'x', `item.${String(activeItem?.id ?? activeItem?.slug ?? activeIndex)}.notes`),
    [id, activeItem, activeIndex]
  );
  const [notes, setNotes] = useState('');

  // Persist & restore active index
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(lsKey(id || 'x', 'activeIndex'));
        const n = saved ? Number(saved) : 0;
        if (Number.isFinite(n)) setActiveIndex(Math.max(0, n));
      } catch {}
    })();
  }, [id]);

  useEffect(() => {
    AsyncStorage.setItem(lsKey(id || 'x', 'activeIndex'), String(activeIndex)).catch(() => {});
  }, [id, activeIndex]);

  // Load notes for current item
  useEffect(() => {
    (async () => {
      try {
        const t = await AsyncStorage.getItem(notesKey);
        setNotes(t || '');
      } catch {
        setNotes('');
      }
    })();
  }, [notesKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      AsyncStorage.setItem(notesKey, notes).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [notesKey, notes]);

  // Fetch items
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const base = (backendUrl || '').replace(/\/+$/, '');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const candidates = [
          `${base}/api/oer/collections/${encodeURIComponent(id)}/items`,
          `${base}/api/oer/collections/by-slug/${encodeURIComponent(id)}/items`,
          `${base}/api/oer/books/${encodeURIComponent(id)}`,
          `${base}/api/oer/books/by-slug/${encodeURIComponent(id)}`,
          `${base}/api/oer/items?collection=${encodeURIComponent(id)}`,
          `${base}/oer/collections/${encodeURIComponent(id)}/items`,
        ];

        let found: CollectionItem[] = [];
        for (const url of candidates) {
          try {
            const payload = await tryJson(url, headers);
            const coerced = coerceItemsFromPayload(payload, id);
            if (Array.isArray(coerced) && coerced.length > 0) {
              found = coerced;
              break;
            }
          } catch {
            /* try next */
          }
        }

        if (!cancelled) {
          if (found.length === 0) {
            setItems([]);
            setError('No items found for this collection/book.');
          } else {
            setItems(found);
          }
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load collection');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backendUrl, id, token]);

  // Kinds & URLs
  const playableUrl = useMemo(() => getPlayableUrl(activeItem), [activeItem]);
  const kind = activeItem ? normalizeKind(activeItem) : undefined;
  const guessedVideo = !!playableUrl && isProbablyVideoUrl(playableUrl);
  const isPdf = useMemo(() => {
    if (!activeItem) return false;
    if (kind === 'pdf') return true;
    const url = getPdfUrl(activeItem) || activeItem?.source_url || (activeItem as any)?.url || '';
    const mime = (activeItem as any)?.mime_type || (activeItem as any)?.content_type || '';
    return isProbablyPdfUrl(url) || String(mime).toLowerCase().includes('application/pdf');
  }, [activeItem, kind]);
  const isHtml = !!activeItem?.web_url && !guessedVideo && !isPdf;

  const youTubeEmbed = useMemo(() => toYouTubeEmbed(playableUrl), [playableUrl]);
  const externalUrl = useMemo(
    () => (activeItem ? activeItem.source_url || getVideoUrl(activeItem) : ''),
    [activeItem]
  ); // ✅ getVideoUrl only called when activeItem exists

  // PDF in WebView: Android often needs Google Docs viewer; iOS can open PDF directly.
  const pdfUrl = useMemo(() => {
    const url = getPdfUrl(activeItem || ({} as any));
    if (!url) return '';
    if (Platform.OS === 'android' && !url.startsWith('file://')) {
      const enc = encodeURIComponent(url);
      return `https://drive.google.com/viewerng/viewer?embedded=true&url=${enc}`;
    }
    return `${url}#toolbar=1`;
  }, [activeItem]);

  const canRobot = isPdf && Boolean(activeItem?.slug || activeItem?.id);

  const openExternal = useCallback(async (url?: string) => {
    if (!url) return;
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) await Linking.openURL(url);
      else Alert.alert('Cannot open link', url);
    } catch {
      Alert.alert('Cannot open link', url);
    }
  }, []);

  const openRobotTeacher = useCallback(async () => {
    if (!canRobot || !activeItem) return;
    try {
      const idOrSlug = String(activeItem.slug ?? activeItem.id);
      const { courseId } = await wrapBook(idOrSlug);
      navigation.navigate('CourseProgress', { courseId });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to start guided reading');
    }
  }, [activeItem, canRobot, navigation, wrapBook]);

  const goPrev = () => setActiveIndex((i) => Math.max(0, i - 1));
  const goNext = () => setActiveIndex((i) => Math.min(items.length - 1, i + 1));

  /* ---------------------------------------------------------------------- */
  /* Render                                                                  */
  /* ---------------------------------------------------------------------- */
  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
      {/* Header */}
      <View style={tw`px-4 pt-3 pb-2 border-b border-[#e7edf4] dark:border-darkCard`}>
        <View style={tw`flex-row items-center justify-between`}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={tw`rounded-xl h-9 px-3 bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
          >
            <Text style={tw`text-sm text-[#0d141c] dark:text-white`}>Back</Text>
          </Pressable>

          <View style={tw`flex-row items-center gap-2`}>
            {canRobot && (
              <Pressable
                onPress={openRobotTeacher}
                style={tw`rounded-xl h-9 px-3 bg-[#3d99f5] items-center justify-center`}
              >
                <Text style={tw`text-white text-sm font-semibold`}>Learn with RobotTeacher</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => setOpenNotes(true)}
              style={tw`rounded-xl h-9 px-3 bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
            >
              <Text style={tw`text-sm text-[#0d141c] dark:text-white`}>Notes</Text>
            </Pressable>
            <Pressable
              onPress={() => setOpenPlaylist(true)}
              style={tw`rounded-xl h-9 px-3 bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
            >
              <Text style={tw`text-sm text-[#0d141c] dark:text-white`}>Playlist</Text>
            </Pressable>
          </View>
        </View>

        {/* Title + provider */}
        <View style={tw`mt-3`}>
          <Text
            style={tw`text-[22px] font-extrabold text-[#0d141c] dark:text-white`}
            numberOfLines={2}
          >
            {activeItem?.title || '—'}
          </Text>
          {!!activeItem?.provider && (
            <View
              style={tw`mt-2 self-start h-8 px-3 rounded-lg bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
            >
              <Text style={tw`text-xs text-[#0d141c] dark:text-white`}>
                Provider: {activeItem.provider}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Body */}
      {loading ? (
        <View style={tw`flex-1 items-center justify-center`}>
          <ActivityIndicator />
          <Text style={tw`mt-2 text-[#49739c] dark:text-white/70`}>Loading…</Text>
        </View>
      ) : error ? (
        <View style={tw`flex-1 items-center justify-center p-6`}>
          <Text style={tw`text-red-600`}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={tw`flex-1 items-center justify-center p-6`}>
          <Text style={tw`text-[#49739c] dark:text-white/70`}>No items in this collection.</Text>
        </View>
      ) : (
        <View style={tw`flex-1`}>
          {/* Viewer */}
          {guessedVideo ? (
            // YouTube/player via WebView
            <WebView
              style={tw`flex-1`}
              source={{ uri: youTubeEmbed || playableUrl || 'about:blank' }}
              allowsFullscreenVideo
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={['*']}
              setSupportMultipleWindows
            />
          ) : isPdf ? (
            <WebView
              style={tw`flex-1`}
              source={{ uri: pdfUrl || 'about:blank' }}
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={['*']}
              allowsFullscreenVideo
            />
          ) : isHtml ? (
            <WebView
              style={tw`flex-1`}
              source={{ uri: String(activeItem?.web_url || '') || 'about:blank' }}
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={['*']}
              allowsInlineMediaPlayback
              allowsFullscreenVideo
            />
          ) : (
            <View style={tw`flex-1 items-center justify-center p-6`}>
              <Text style={tw`text-[#49739c] dark:text-white/70 text-center`}>
                Item type not recognized.
              </Text>
              {!!externalUrl && (
                <Pressable
                  onPress={() => openExternal(externalUrl)}
                  style={tw`mt-3 rounded-xl h-10 px-4 bg-white dark:bg-[#0f1821] items-center justify-center border border-[#cedbe8] dark:border-darkCard`}
                >
                  <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>
                    Open source
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Bottom nav */}
          <View
            style={tw`px-4 py-2 border-t border-[#e7edf4] dark:border-darkCard flex-row items-center justify-between`}
          >
            <Pressable
              onPress={goPrev}
              disabled={activeIndex <= 0}
              style={tw.style(
                'rounded-xl h-9 px-3 items-center justify-center',
                activeIndex <= 0
                  ? 'bg-[#e7edf4] dark:bg-[#172534] opacity-60'
                  : 'bg-[#e7edf4] dark:bg-[#172534]'
              )}
            >
              <Text style={tw`text-sm text-[#0d141c] dark:text-white`}>‹ Previous</Text>
            </Pressable>

            <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
              {activeIndex + 1} / {items.length}
            </Text>

            <Pressable
              onPress={goNext}
              disabled={activeIndex >= items.length - 1}
              style={tw.style(
                'rounded-xl h-9 px-3 items-center justify-center',
                activeIndex >= items.length - 1
                  ? 'bg-[#e7edf4] dark:bg-[#172534] opacity-60'
                  : 'bg-[#e7edf4] dark:bg-[#172534]'
              )}
            >
              <Text style={tw`text-sm text-[#0d141c] dark:text-white`}>Next ›</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Playlist Drawer */}
      <Modal
        visible={openPlaylist}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenPlaylist(false)}
      >
        <View style={tw`flex-1 bg-black/40`}>
          <View
            style={tw`absolute left-0 top-0 bottom-0 w-4/5 max-w-[320px] rounded-r-2xl bg-white dark:bg-[#0f1821] border-r border-[#cedbe8] dark:border-darkCard p-3`}
          >
            <View style={tw`flex-row items-center gap-2 mb-2`}>
              <Text style={tw`text-base font-semibold text-[#0d141c] dark:text-white`}>
                Playlist
              </Text>
              <View style={tw`flex-1`} />
              <Pressable
                onPress={() => setOpenPlaylist(false)}
                style={tw`h-8 px-3 rounded-lg bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
              >
                <Text style={tw`text-xs text-[#0d141c] dark:text-white`}>Close</Text>
              </Pressable>
            </View>

            <View
              style={tw`flex-row items-center bg-[#e7edf4] dark:bg-[#172534] rounded-xl px-3 h-10 mb-2`}
            >
              <TextInput
                placeholder="Search title…"
                placeholderTextColor="#7a8aa0"
                value={search}
                onChangeText={setSearch}
                style={tw`flex-1 text-[#0d141c] dark:text-white`}
              />
            </View>

            <FlatList
              data={items
                .map((it, idx) => ({ it, idx }))
                .filter(({ it }) =>
                  search
                    ? String(it.title || '')
                        .toLowerCase()
                        .includes(search.toLowerCase())
                    : true
                )}
              keyExtractor={(row) => String(row.it.id ?? row.it.slug ?? row.idx)}
              renderItem={({ item: row }) => {
                const k = normalizeKind(row.it);
                const active = row.idx === activeIndex;
                return (
                  <Pressable
                    onPress={() => {
                      setActiveIndex(row.idx);
                      setOpenPlaylist(false);
                    }}
                    style={tw.style(
                      'w-full rounded-xl px-3 py-2 mb-1 border border-[#e7edf4] dark:border-darkCard',
                      active ? 'bg-[#e7edf4] dark:bg-[#172534]' : 'bg-transparent'
                    )}
                  >
                    <Text
                      style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}
                      numberOfLines={2}
                    >
                      {row.it.title}
                    </Text>
                    <Text style={tw`text-xs text-[#49739c] dark:text-white/70 mt-0.5`}>
                      {k === 'video'
                        ? 'Video'
                        : isProbablyPdfUrl(getPdfUrl(row.it))
                          ? 'PDF'
                          : 'Item'}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>
          <Pressable style={tw`flex-1`} onPress={() => setOpenPlaylist(false)} />
        </View>
      </Modal>

      {/* Notes Drawer */}
      <Modal
        visible={openNotes}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenNotes(false)}
      >
        <View style={tw`flex-1 bg-black/40`}>
          <View
            style={tw`absolute right-0 top-0 bottom-0 w-11/12 max-w-[360px] rounded-l-2xl bg-white dark:bg-[#0f1821] border-l border-[#cedbe8] dark:border-darkCard p-3`}
          >
            <View style={tw`flex-row items-center gap-2 mb-2`}>
              <Text style={tw`text-base font-semibold text-[#0d141c] dark:text-white`}>
                Notes & Highlights
              </Text>
              <View style={tw`flex-1`} />
              <Pressable
                onPress={() => setOpenNotes(false)}
                style={tw`h-8 px-3 rounded-lg bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
              >
                <Text style={tw`text-xs text-[#0d141c] dark:text-white`}>Close</Text>
              </Pressable>
            </View>

            <View style={tw`mb-2 flex-row flex-wrap gap-2`}>
              {canRobot && (
                <Pressable
                  onPress={() => {
                    setOpenNotes(false);
                    openRobotTeacher();
                  }}
                  style={tw`h-9 px-3 rounded-xl bg-[#3d99f5] items-center justify-center`}
                >
                  <Text style={tw`text-white text-xs font-semibold`}>Learn with RobotTeacher</Text>
                </Pressable>
              )}
              {!!activeItem?.source_url && (
                <Pressable
                  onPress={() => openExternal(activeItem.source_url)}
                  style={tw`h-9 px-3 rounded-xl border border-[#cedbe8] dark:border-darkCard items-center justify-center`}
                >
                  <Text style={tw`text-xs font-semibold text-[#0d141c] dark:text-white`}>
                    Open source
                  </Text>
                </Pressable>
              )}
            </View>

            <Text style={tw`text-xs text-[#49739c] dark:text-white/70 mb-2`}>
              Your notes are saved automatically on this device.
            </Text>

            <View style={tw`flex-1`}>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Type notes, highlights, or questions…"
                placeholderTextColor="#7a8aa0"
                style={tw`flex-1 rounded-xl p-3 bg-[#e7edf4] dark:bg-[#172534] text-[#0d141c] dark:text-white`}
                multiline
                textAlignVertical="top"
              />
              <View style={tw`mt-1 flex-row items-center justify-between`}>
                <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>Local only</Text>
                <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
                  {notes.length} / 4000
                </Text>
              </View>
            </View>
          </View>
          <Pressable style={tw`flex-1`} onPress={() => setOpenNotes(false)} />
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default OerCollectionReaderNative;
