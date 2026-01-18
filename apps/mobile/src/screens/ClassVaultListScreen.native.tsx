// apps/mobile/src/screens/ClassVaultListScreen.native.tsx
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Alert,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Pressable,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { MainStackParamList } from '../navigation/types';
import tw from '../../tailwind';
import { useShopContext } from '@mytutorapp/shared/context';
import { useClassVault } from '@mytutorapp/shared/hooks';
import { fetchVideoReviews } from '@mytutorapp/shared/api/classVaultApi';
import type { RecordedVideo, VideoReview } from '@mytutorapp/shared/types';
import debounce from 'lodash.debounce';

/* -------- Config -------- */
type TabKey = 'videos' | 'notes';
const VISIBLE_LIMIT = 8;
const DEBOUNCE_MS = 300;

type PdfItem = {
  id: number;
  title: string;
  price: number;
  subject?: string;
  grade_level?: string | number;
  tutor_id?: number;
  description?: string;
  metadata?: any;
  tags?: any[];
  country?: string;
  thumbnail_url?: string;
  preview_url?: string;
};

export interface ClassVaultFilters {
  category?: string[]; // subject
  ageGroup?: string[]; // grade
  country?: string; // applied in local filter
}

interface ClassVaultListScreenProps {
  filters: ClassVaultFilters;
  clearFilters?: () => void; // kept for future, but not used here
  searchTerm?: string;
  embedded?: boolean;
  showTitle?: boolean;
}

export default function ClassVaultListScreen({
  filters,
  clearFilters, // not used now (filtering handled in parent)
  searchTerm,
  embedded,
  showTitle = true,
}: ClassVaultListScreenProps) {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList, 'ClassVaultLibrary'>>();
  const { role, userId, backendUrl } = useShopContext();

  // Base hook filters from parent (subject + grade)
  const chosenSubject = filters.category?.[0] ?? '';
  const chosenGrade = filters.ageGroup?.[0] ?? '';

  const {
    videos,
    filteredVideos,
    filteredPdfRows,
    purchasedIds,
    loading,
    error,
    refresh,
    purchase,
    remove,
  } = useClassVault(chosenSubject, chosenGrade);

  const [tab, setTab] = useState<TabKey>('videos');
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [buyingId, setBuyingId] = useState<number | null>(null);

  // Preview player
  const previewPlayer = useVideoPlayer(null, (player) => {
    player.loop = true;
  });

  useEffect(() => {
    const current = filteredVideos.find((v) => v.id === previewId);
    const url = current?.preview_url || null;
    let cancelled = false;
    (async () => {
      try {
        previewPlayer.pause();
        await previewPlayer.replace(url);
        if (!cancelled && url) previewPlayer.play();
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewId, filteredVideos, previewPlayer]);

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  // Role scoping (tutor sees only their own uploads)
  const scopedVideos = useMemo(() => {
    if (role === 'tutor' && userId != null) {
      const me = Number(userId);
      return filteredVideos.filter((v) => Number(v.tutor_id) === me);
    }
    return filteredVideos;
  }, [filteredVideos, role, userId]);

  const scopedPdfRows: PdfItem[][] = useMemo(() => {
    if (role === 'tutor' && userId != null) {
      const me = Number(userId);
      const rows = filteredPdfRows
        .map(
          (row) =>
            row.filter((pdf) => Number((pdf as { tutor_id?: number }).tutor_id) === me) as PdfItem[]
        )
        .filter((row) => row.length > 0);
      return rows;
    }
    return filteredPdfRows as unknown as PdfItem[][];
  }, [filteredPdfRows, role, userId]);

  // Global text search from parent (optional)
  const q = (searchTerm ?? '').trim().toLowerCase();

  const displayVideos = useMemo(() => {
    const country = (filters.country ?? '').trim().toLowerCase();
    const base = q
      ? scopedVideos.filter((v) => {
          const titleMatch = v.title.toLowerCase().includes(q);
          const subjectMatch = (v.subject ?? '').toLowerCase().includes(q);
          const gradeMatch =
            v.grade_level != null ? String(v.grade_level).toLowerCase().includes(q) : false;
          const descMatch = (v.description ?? '').toLowerCase().includes(q);
          return titleMatch || subjectMatch || gradeMatch || descMatch;
        })
      : scopedVideos;

    if (!country) return base;
    return base.filter((v) => {
      const direct = String(v.country ?? '').toLowerCase();
      const meta = typeof v.metadata === 'string' ? v.metadata : JSON.stringify(v.metadata || {});
      return direct.includes(country) || meta.toLowerCase().includes(country);
    });
  }, [scopedVideos, q, filters.country]);

  const displayPdfRows = useMemo(() => {
    const country = (filters.country ?? '').trim().toLowerCase();
    const base = q
      ? scopedPdfRows
          .map((row) =>
            row.filter((pdf) => {
              const titleMatch = pdf.title.toLowerCase().includes(q);
              const subjectMatch = (pdf.subject ?? '').toLowerCase().includes(q);
              const gradeMatch =
                pdf.grade_level != null ? String(pdf.grade_level).toLowerCase().includes(q) : false;
              const descMatch = (pdf.description ?? '').toLowerCase().includes(q);
              return titleMatch || subjectMatch || gradeMatch || descMatch;
            })
          )
          .filter((row) => row.length > 0)
      : scopedPdfRows;

    if (!country) return base;

    return base
      .map((row) =>
        row.filter((pdf) => {
          const direct = String(pdf.country ?? '').toLowerCase();
          const meta = typeof pdf.metadata === 'string' ? pdf.metadata : JSON.stringify(pdf.metadata || {});
          return direct.includes(country) || meta.toLowerCase().includes(country);
        })
      )
      .filter((row) => row.length > 0);
  }, [scopedPdfRows, q, filters.country]);

  /* ---------- Ratings prefetch (match web behavior) ---------- */
  const [ratings, setRatings] = useState<Record<number, { avg: number; count: number }>>({});
  const fetchingIdsRef = useRef<Set<number>>(new Set());

  const idsToPrefetch = useMemo<number[]>(
    () => displayVideos.slice(0, VISIBLE_LIMIT).map((v) => v.id),
    [displayVideos]
  );

  const debouncedFetch = useMemo(
    () =>
      debounce(async (ids: number[]) => {
        if (!backendUrl) return;
        for (const id of ids) {
          if (ratings[id] || fetchingIdsRef.current.has(id)) continue;
          fetchingIdsRef.current.add(id);
          try {
            const data: VideoReview[] = await fetchVideoReviews(backendUrl, id);
            const count = data.length;
            const avg =
              count > 0
                ? Number((data.reduce((s, r) => s + Number(r.rating), 0) / count).toFixed(2))
                : 0;
            setRatings((prev) => (prev[id] ? prev : { ...prev, [id]: { avg, count } }));
          } finally {
            fetchingIdsRef.current.delete(id);
          }
        }
      }, DEBOUNCE_MS),
    [backendUrl, ratings]
  );

  useEffect(() => {
    const pending = idsToPrefetch.filter((id) => !ratings[id] && !fetchingIdsRef.current.has(id));
    if (pending.length > 0) debouncedFetch(pending);
    return () => {
      debouncedFetch.cancel();
    };
  }, [idsToPrefetch, ratings, debouncedFetch]);

  /* ---------- Early returns ---------- */
  if (loading) {
    return (
      <View style={tw`flex-1 items-center justify-center bg-slate-50 dark:bg-[#0b1016]`}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (error) {
    return (
      <View style={tw`flex-1 items-center justify-center bg-slate-50 dark:bg-[#0b1016] p-4`}>
        <Text style={tw`text-red-600 dark:text-red-400 text-center`}>{error}</Text>
      </View>
    );
  }

  const videosEmpty = displayVideos.length === 0;
  const notesEmpty = displayPdfRows.flat().length === 0;

  const Container: React.ElementType = embedded ? View : ScrollView;
  const containerProps = embedded
    ? { style: tw`flex-1 bg-slate-50 dark:bg-[#0b1016]` }
    : { contentContainerStyle: tw`px-4 py-4` };

  return (
    <View style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
      <Container {...(containerProps as any)}>
        {showTitle && (
          <View style={tw`flex-row items-end justify-between mb-2`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={tw`text-[20px] font-extrabold text-[#0d141c] dark:text-white`}>
                {role === 'tutor' ? 'Your Uploaded Classes' : 'Available Classes'}
              </Text>
            </View>
          </View>
        )}

        {/* Tabs */}
        <View
          style={tw`flex-row self-center bg-[#e7edf4] dark:bg-[#172534] border border-[#cedbe8] dark:border-white/10 rounded-full p-1 mb-3`}
        >
          <TouchableOpacity
            onPress={() => setTab('videos')}
            style={tw.style(
              'px-4 py-2 rounded-full',
              tab === 'videos' && 'bg-white dark:bg-[#0f1821]'
            )}
            accessibilityRole="button"
            accessibilityState={{ selected: tab === 'videos' }}
          >
            <Text
              style={tw.style(
                'text-xs font-semibold',
                tab === 'videos'
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-700 dark:text-white/70'
              )}
            >
              Videos
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab('notes')}
            style={tw.style(
              'px-4 py-2 rounded-full',
              tab === 'notes' && 'bg-white dark:bg-[#0f1821]'
            )}
            accessibilityRole="button"
            accessibilityState={{ selected: tab === 'notes' }}
          >
            <Text
              style={tw.style(
                'text-xs font-semibold',
                tab === 'notes'
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-700 dark:text-white/70'
              )}
            >
              Class Notes
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tutor empty message */}
        {role === 'tutor' && videos.length === 0 && (
          <View
            style={tw`bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 p-3 rounded-2xl mb-4`}
          >
            <Text style={tw`text-[#0d141c] dark:text-white font-semibold text-center`}>
              Earn passive income—upload once and get paid every time a student purchases.
            </Text>
          </View>
        )}

        {/* VIDEOS */}
        {tab === 'videos' ? (
          videosEmpty ? (
            <View style={tw`items-center mt-8`}>
              <Text style={tw`text-[#49739c] dark:text-white/70 text-center mb-4`}>
                {role === 'tutor' ? 'No recorded videos yet.' : 'No available videos.'}
              </Text>
              {role === 'tutor' && (
                <TouchableOpacity
                  onPress={() => navigation.navigate('ClassVaultUpload')}
                  style={tw`bg-[#3d99f5] px-6 py-3 rounded-full`}
                >
                  <Text style={tw`text-white font-semibold`}>Upload Your First Class</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            displayVideos.map((video) => {
              const stat = ratings[video.id];
              const hasRatings = Boolean(stat && stat.count > 0);
              const isPreviewing = previewId === video.id;

              return (
                <View
                  key={video.id}
                  style={tw`bg-white dark:bg-[#0f1821] border border-[#cedbe7] dark:border-white/10 p-4 rounded-2xl mb-4`}
                >
                  {/* Title & meta */}
                  <Text
                    style={tw`text-[#0d141c] dark:text-white font-semibold mb-1`}
                    numberOfLines={2}
                  >
                    {video.title}
                  </Text>

                  {/* ⭐ Ratings */}
                  {hasRatings ? (
                    <View style={tw`flex-row items-center`}>
                      {/* simple stars text if you want; or icon row */}
                      <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
                        {stat!.avg.toFixed(1)} ({stat!.count})
                      </Text>
                    </View>
                  ) : null}

                  <Text style={tw`text-[#49739c] dark:text-white/70 mt-1 mb-2`} numberOfLines={1}>
                    {video.subject ?? 'Unknown subject'} • Grade {video.grade_level}
                  </Text>
                  <Text
                    style={tw`text-[#0d141c] dark:text-white mb-1`}
                  >{`Price: ${video.price} tokens`}</Text>

                  {/* Preview */}
                  {!isPreviewing && (video.thumbnail_url || video.preview_url) ? (
                    <View style={tw`relative mt-3`}>
                      {video.thumbnail_url ? (
                        <Image
                          source={{ uri: video.thumbnail_url }}
                          style={tw`w-full h-48 rounded-xl`}
                        />
                      ) : (
                        <View
                          style={tw`w-full h-48 rounded-xl bg-black items-center justify-center`}
                        >
                          <FontAwesome5 name="play-circle" size={48} color="#ffffff" />
                        </View>
                      )}
                      {video.preview_url ? (
                        <TouchableOpacity
                          onPress={() => setPreviewId(video.id)}
                          style={tw`absolute inset-0 items-center justify-center`}
                          accessibilityRole="button"
                          accessibilityLabel="Play preview"
                        >
                          <FontAwesome5 name="play-circle" size={48} color="#ffffff" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}

                  {isPreviewing && video.preview_url && (
                    <View style={tw`w-full h-48 rounded-xl overflow-hidden mt-3`}>
                      <VideoView
                        player={previewPlayer}
                        style={tw`w-full h-full`}
                        nativeControls
                        allowsFullscreen
                        allowsPictureInPicture
                        contentFit="contain"
                      />
                      <TouchableOpacity
                        onPress={() => setPreviewId(null)}
                        style={tw`absolute top-2 right-2`}
                        accessibilityRole="button"
                        accessibilityLabel="Close preview"
                      >
                        <FontAwesome5 name="times-circle" size={24} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Actions */}
                  {role === 'tutor' ? (
                    <TouchableOpacity
                      onPress={() => handleDelete(video.id)}
                      style={tw`bg-red-600 py-2 rounded-xl mt-3`}
                    >
                      <Text style={tw`text-white text-center font-medium`}>Delete</Text>
                    </TouchableOpacity>
                  ) : purchasedIds.has(video.id) ? (
                    <>
                      <TouchableOpacity
                        onPress={() => handleDownload(video)}
                        style={tw`bg-[#e7edf4] dark:bg-[#172534] py-2 rounded-xl mt-3`}
                      >
                        <Text style={tw`text-slate-900 dark:text-white text-center font-medium`}>
                          Download
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() =>
                          navigation.navigate('ClassVaultDetail', {
                            id: video.id,
                          })
                        }
                        style={tw`bg-[#e7edf4] dark:bg-[#172534] py-2 rounded-xl mt-3`}
                      >
                        <Text style={tw`text-slate-900 dark:text-white text-center font-medium`}>
                          Review
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      disabled={buyingId === video.id}
                      onPress={() => handlePurchase(video)}
                      style={tw.style(
                        'bg-[#3d99f5] py-2 rounded-xl mt-3',
                        buyingId === video.id && 'opacity-60'
                      )}
                      accessibilityHint={buyingId === video.id ? 'Processing…' : undefined}
                    >
                      <Text style={tw`text-white text-center font-semibold`}>
                        {buyingId === video.id ? 'Purchasing…' : 'Purchase'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )
        ) : // NOTES
        notesEmpty ? (
          <View style={tw`items-center mt-8`}>
            <Text style={tw`text-[#49739c] dark:text-white/70 text-center mb-4`}>
              {role === 'tutor' ? 'No class notes uploaded yet.' : 'No class notes available.'}
            </Text>
            {role === 'tutor' && (
              <TouchableOpacity
                onPress={() => navigation.navigate('ClassVaultUpload')}
                style={tw`bg-[#3d99f5] px-6 py-3 rounded-full`}
              >
                <Text style={tw`text-white font-semibold`}>Upload Your First Notes</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          displayPdfRows.map((row: PdfItem[], idx: number) => (
            <View key={idx} style={tw`flex-row justify-between mb-4`}>
              {row.map((pdf: PdfItem) => (
                <View
                  key={pdf.id}
                  style={tw`flex-1 mx-1 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 p-4 rounded-2xl`}
                >
                  <FontAwesome5 name="file-pdf" size={48} color="#ef4444" style={tw`mb-2`} />
                  <Text
                    style={tw`text-[#0d141c] dark:text-white font-semibold mb-1`}
                    numberOfLines={2}
                  >
                    {pdf.title}
                  </Text>
                  <Text
                    style={tw`text-[#0d141c] dark:text-white`}
                  >{`Price: ${pdf.price} tokens`}</Text>

                  {role === 'tutor' ? (
                    <TouchableOpacity
                      onPress={() => handleDelete(pdf.id)}
                      style={tw`bg-red-600 py-2 rounded-xl mt-3`}
                    >
                      <Text style={tw`text-white text-center font-medium`}>Delete</Text>
                    </TouchableOpacity>
                  ) : purchasedIds.has(pdf.id) ? (
                    <TouchableOpacity
                      onPress={() => navigation.navigate('ClassVaultDetail', { id: pdf.id })}
                      style={tw`bg-[#e7edf4] dark:bg-[#172534] py-2 rounded-xl mt-3`}
                    >
                      <Text style={tw`text-slate-900 dark:text-white text-center font-medium`}>
                        Download
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      disabled={buyingId === pdf.id}
                      onPress={() => handlePurchase(pdf as unknown as RecordedVideo)}
                      style={tw.style(
                        'bg-[#3d99f5] py-2 rounded-xl mt-3',
                        buyingId === pdf.id && 'opacity-60'
                      )}
                    >
                      <Text style={tw`text-white text-center font-semibold`}>
                        {buyingId === pdf.id ? 'Purchasing…' : 'Purchase Access'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {row.length === 1 && <View style={tw`flex-1 mx-1`} />}
            </View>
          ))
        )}

        {/* Upload CTA */}
        {role === 'tutor' && videos.length > 0 && (
          <View style={tw`items-center my-6`}>
            <TouchableOpacity
              onPress={() => navigation.navigate('ClassVaultUpload')}
              style={tw`bg-[#3d99f5] px-6 py-3 rounded-full`}
            >
              <Text style={tw`text-white font-semibold`}>Upload New Class</Text>
            </TouchableOpacity>
          </View>
        )}
      </Container>
    </View>
  );

  /* ---------- Handlers (bottom) ---------- */
  async function handlePurchase(item: RecordedVideo) {
    if (buyingId === item.id) return;
    const confirmText =
      `You are about to purchase "${item.title}" for ${item.price} tokens.\n\n` +
      `This amount will be deducted from your balance. Do you want to continue?`;
    Alert.alert('Confirm Purchase', confirmText, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Purchase',
        onPress: async () => {
          try {
            setBuyingId(item.id);
            await purchase(item);
            Alert.alert('Success', `"${item.title}" is now unlocked.`, [
              {
                text: 'OK',
                onPress: () => navigation.navigate('ClassVaultDetail', { id: item.id }),
              },
            ]);
          } catch (err: unknown) {
            const message =
              typeof err === 'object' &&
              err &&
              'message' in err &&
              typeof (err as { message: unknown }).message === 'string'
                ? (err as { message: string }).message
                : 'Purchase failed';
            if (message.includes('Insufficient tokens')) {
              Alert.alert('Insufficient Tokens', 'Not enough tokens. Would you like to buy more?', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Buy Tokens',
                  onPress: () => navigation.navigate('BuyTokens'),
                },
              ]);
            } else {
              Alert.alert('Error', message);
            }
          } finally {
            setBuyingId(null);
          }
        },
      },
    ]);
  }

  function handleDownload(item: RecordedVideo | { id: number }) {
    navigation.navigate('ClassVaultDetail', { id: item.id });
  }

  async function handleDelete(id: number) {
    if (role !== 'tutor') return;
    Alert.alert('Delete Item', 'Delete this item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await remove(id);
          } catch {
            Alert.alert('Deletion failed');
          }
        },
      },
    ]);
  }
}
