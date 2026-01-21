// apps/mobile/src/screens/ClassVaultDetailScreen.native.tsx
/* eslint-disable prettier/prettier */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Linking,
  ActivityIndicator,
  ScrollView,
  Modal,
  TextInput,
  Platform,
  StatusBar,
} from 'react-native';
import { RouteProp, useRoute, useNavigation, NavigationProp } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import tw from '../../tailwind';
import { useShopContext } from '@mytutorapp/shared/context';
import { useClassVaultDetail } from '@mytutorapp/shared/hooks/useClassVault';
import { fetchVideoReviews, submitVideoReview } from '@mytutorapp/shared/api/classVaultApi';
import type { MainStackParamList } from '../navigation/types';
import type { VideoReview } from '@mytutorapp/shared/types';
import { useThemePref } from '../theme/ThemeContext';

type DetailRoute = RouteProp<MainStackParamList, 'ClassVaultDetail'>;

const toVideoSource = (uri: string | null | undefined) => {
  const u = (uri ?? '').trim();
  return u ? ({ uri: u } as any) : null;
};

export default function ClassVaultDetailScreen() {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const { backendUrl, token, profile } = useShopContext();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useThemePref();

    const {
    params: { id: videoId },
  } = useRoute<DetailRoute>();

  // ✅ normalize route param (prevents NaN/undefined → 404)
  const safeVideoId = Number(videoId);
  const isValidId = Number.isFinite(safeVideoId) && safeVideoId > 0;

  // ✅ always call hook (unconditional), but with the normalized id
  const { video, resources, unlockContent, error } = useClassVaultDetail(
    isValidId ? safeVideoId : 0
  );

  // ✅ debug once per id
  useEffect(() => {
    console.log('[ClassVaultDetail] route id:', videoId, 'safe:', safeVideoId, 'valid:', isValidId);
  }, [videoId, safeVideoId, isValidId]);

  const [unlockError, setUnlockError] = useState<string>('');

  // ------- Reviews state (parity with web) -------
  const [reviews, setReviews] = useState<VideoReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState<boolean>(false);
  const [reviewsError, setReviewsError] = useState<string>('');
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [rating, setRating] = useState<string>(''); // TextInput friendly
  const [comment, setComment] = useState<string>('');

  // Prevent duplicate unlock calls (StrictMode)
  const didRequestUnlockRef = useRef<boolean>(false);

  // 80% watched gate (with expo-video)
  const promptedRef = useRef<boolean>(false);

  // Reset unlock guard when switching videos
  useEffect(() => {
    didRequestUnlockRef.current = false;
    promptedRef.current = false;
    setUnlockError('');
  }, [videoId]);

  // Fetch protected URLs once per id (best effort; if not purchased, will show a friendly state)
  useEffect(() => {
    if (!token) return; // no auto-unlock if not logged in
    if (didRequestUnlockRef.current) return;
    didRequestUnlockRef.current = true;
    unlockContent().catch((err: { message?: string }) => setUnlockError(err?.message || ''));
  }, [unlockContent, videoId, token]);

  // Reviews
  const myId = profile?.id ? String(profile.id) : '';
  const hasMyReview = myId ? reviews.some((r) => String(r.student_id) === myId) : false;

  const loadReviews = useCallback(async (): Promise<void> => {
    try {
      setLoadingReviews(true);
      setReviewsError('');
      const data = await fetchVideoReviews(backendUrl, videoId);
      setReviews(data);
    } catch {
      setReviewsError('Failed to load reviews');
    } finally {
      setLoadingReviews(false);
    }
  }, [backendUrl, videoId]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  // always returns string (never undefined)
  const resolveUrl = (maybeUrl?: string | null): string => {
    if (!maybeUrl) return '';
    if (maybeUrl.startsWith('http://') || maybeUrl.startsWith('https://')) return maybeUrl;
    return `${backendUrl}${maybeUrl}`;
  };

  // New API (public-safe metadata): video/pdf urls are NOT present publicly.
  // Use flags when available (has_video/has_pdf), else fallback to old fields.
  const hasVideo = Boolean((video as any)?.has_video) || Boolean((video as any)?.video_url);
  const hasPdf = Boolean((video as any)?.has_pdf) || Boolean((video as any)?.pdf_url);

  const fullVideoUrl = resolveUrl(resources?.video_url ?? '');
  const previewUri = resolveUrl((video as any)?.preview_url ?? '');
  const videoUri = fullVideoUrl || previewUri;
  const pdfUri = resolveUrl(resources?.pdf_url ?? '');

   const initialSource = toVideoSource(videoUri);

  // safe link opener (downloads)
  const openLink = (url: string, label: string) => {
    if (!url) {
      Alert.alert('Unavailable', `${label} is not available.`);
      return;
    }
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) return Linking.openURL(url);
        throw new Error();
      })
      .catch(() => Alert.alert('Error', `Could not open ${label}.`));
  };

  // rating summary
  const avgRating =
    reviews.length > 0
      ? Number((reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length).toFixed(2))
      : 0;

  // ---------- expo-video player (hooks MUST be unconditional) ----------
  // ✅ Fix TS2345: pass `undefined` not `null`
  const player = useVideoPlayer(initialSource as any, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 1;
    // we no longer auto-play inside init because source may change
  });

   useEffect(() => {
    let cancelled = false;

    const next = toVideoSource(videoUri);
    if (!next) return; // ✅ don't call replace with undefined/null

    (async () => {
      try {
        await player.pause();
        await player.replace(next as any); // ✅ VideoSource
        if (!cancelled && fullVideoUrl) player.play();
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [videoUri, fullVideoUrl, player]);
  // 80% watched gate with 'timeUpdate'
  const { currentTime = 0, duration = 0 } = useEvent(player, 'timeUpdate', {
    currentTime: 0,
    duration: 0,
  } as any) as any;

  useEffect(() => {
    if (promptedRef.current || hasMyReview) return;
    if (!duration) return;
    const pct = currentTime / duration;
    if (pct >= 0.8) {
      promptedRef.current = true;
      setShowPrompt(true);
    }
  }, [currentTime, duration, hasMyReview]);

  // ---------- Theme-aware styles ----------
  const placeholderColor = resolvedScheme === 'dark' ? '#9CA3AF' : '#64748B';

  const bg = resolvedScheme === 'dark' ? '#0b1016' : '#f8fafc';
  const screenBg = tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`;

  const card = tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821]`;
  const titleText = tw`text-[#0d141c] dark:text-white`;
  const subtleText = tw`text-slate-700 dark:text-slate-300`;
  const labelText = tw`text-[#49739c] dark:text-gray-200`;

  const input = tw`w-full p-3 rounded-xl bg-slate-50 dark:bg-[#0b1016] border border-[#cedbe8] dark:border-white/10 text-[#0d141c] dark:text-white`;

  const primaryBtn = tw`px-3 py-2 rounded-xl bg-pink-600`;
  const primaryBtnText = tw`text-white text-sm font-semibold`;

  const softBtn = tw`px-4 py-2 rounded-xl bg-slate-200 dark:bg-white/10`;
  const softBtnText = tw`font-semibold text-[#0d141c] dark:text-white`;

  // ✅ Footer guard (so bottom content isn't hidden behind FooterNav)
  const FOOTER_GUARD = 96;
  const bottomPad = Math.max(insets.bottom, 16) + FOOTER_GUARD;
    // ---------- Early returns (AFTER all hooks) ----------
  if (!isValidId) {
    return (
      <SafeAreaView style={screenBg} edges={['top', 'left', 'right']}>
        <StatusBar
          barStyle={resolvedScheme === 'dark' ? 'light-content' : 'dark-content'}
          backgroundColor={bg}
        />
        <View style={tw`flex-1 items-center justify-center px-4`}>
          <Text style={tw`text-red-600 dark:text-red-400 text-center`}>
            Invalid video id. Please go back and refresh.
          </Text>
        </View>
      </SafeAreaView>
    );
  }


  // ---------- Early returns (AFTER all hooks) ----------
  if (error) {
    return (
      <SafeAreaView style={screenBg} edges={['top', 'left', 'right']}>
        <StatusBar
          barStyle={resolvedScheme === 'dark' ? 'light-content' : 'dark-content'}
          backgroundColor={bg}
        />
        <View style={tw`flex-1 items-center justify-center px-4`}>
          <Text style={tw`text-red-600 dark:text-red-400 text-center`}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!video) {
    return (
      <SafeAreaView style={screenBg} edges={['top', 'left', 'right']}>
        <StatusBar
          barStyle={resolvedScheme === 'dark' ? 'light-content' : 'dark-content'}
          backgroundColor={bg}
        />
        <View style={tw`flex-1 items-center justify-center`}>
          <ActivityIndicator size="large" color={resolvedScheme === 'dark' ? '#ffffff' : '#0d141c'} />
        </View>
      </SafeAreaView>
    );
  }

  const canAccessVideo = Boolean(fullVideoUrl);
  const canAccessPdf = Boolean(pdfUri);

  // ---------- Main UI ----------
  return (
    <SafeAreaView style={screenBg} edges={['top', 'left', 'right']}>
      <StatusBar
        barStyle={resolvedScheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={bg}
      />

      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={[tw`px-4 pt-4`, { paddingBottom: bottomPad }]}
        scrollIndicatorInsets={{ bottom: bottomPad }}
        contentInset={Platform.OS === 'ios' ? { bottom: bottomPad } : undefined}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.select({ ios: 'on-drag', android: 'none' })}
      >
        {/* Title */}
        <Text style={[tw`text-2xl font-extrabold text-center mb-4`, titleText]}>{video.title}</Text>

        {/* Video / Preview */}
        {videoUri !== '' && (
          <View style={[tw`w-full h-56 mb-5 rounded-2xl overflow-hidden`, card]}>
            <VideoView
              player={player}
              style={tw`w-full h-full`}
              nativeControls
              allowsFullscreen
              allowsPictureInPicture
              contentFit="contain"
            />
          </View>
        )}

        {/* Metadata card */}
        <View style={[tw`p-4 mb-4`, card]}>
          <Text style={[tw`text-xs font-semibold mb-1`, labelText]}>Subject</Text>
          <Text style={[tw`mb-3`, titleText]}>{(video as any).subject ?? '—'}</Text>

          <Text style={[tw`text-xs font-semibold mb-1`, labelText]}>Grade Level</Text>
          <Text style={[tw`mb-3`, titleText]}>{(video as any).grade_level ?? '—'}</Text>

          {(video as any).description ? (
            <>
              <Text style={[tw`text-xs font-semibold mb-1`, labelText]}>Description</Text>
              <Text style={[tw`mb-3`, subtleText]}>{(video as any).description}</Text>
            </>
          ) : null}

          {(video as any).tags?.length ? (
            <>
              <Text style={[tw`text-xs font-semibold mb-2`, labelText]}>Tags</Text>
              <View style={tw`flex-row flex-wrap`}>
                {(video as any).tags.map((tag: string) => (
                  <Text
                    key={tag}
                    style={tw`text-xs text-[#0d141c] dark:text-white bg-[#e7edf4] dark:bg-[#172534] px-2 py-1 rounded-full mr-2 mb-2`}
                  >
                    {tag}
                  </Text>
                ))}
              </View>
            </>
          ) : null}
        </View>

        {/* Rating summary + opener */}
        <View style={[tw`p-4 mb-4`, card]}>
          <View style={tw`flex-row items-center`}>
            <Text style={[tw`text-sm`, subtleText]}>
              <Text style={[tw`font-semibold`, titleText]}>Rating:</Text> ★ {avgRating} (
              {reviews.length})
            </Text>

            {loadingReviews && (
              <Text style={tw`ml-2 text-slate-500 dark:text-slate-400`}>Loading…</Text>
            )}
            {!!reviewsError && (
              <Text style={tw`ml-2 text-red-600 dark:text-red-400`}>{reviewsError}</Text>
            )}

            {!hasMyReview && (
              <TouchableOpacity
                onPress={() => setShowPrompt(true)}
                activeOpacity={0.9}
                style={[tw`ml-auto`, primaryBtn]}
              >
                <Text style={primaryBtnText}>Rate this video</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* PDF Button (NEW: use hasPdf flag + unlocked resource) */}
        {hasPdf ? (
          <TouchableOpacity
            onPress={() => {
              if (!token) {
                Alert.alert('Login required', 'Please log in to access downloads.');
                return;
              }
              if (canAccessPdf) openLink(pdfUri, 'PDF');
              else navigation.navigate('BuyTokens');
            }}
            activeOpacity={0.9}
            style={tw.style(
              'w-full py-3 mb-3 rounded-2xl border',
              canAccessPdf
                ? 'bg-white dark:bg-[#0f1821] border-[#cedbe8] dark:border-white/10'
                : 'bg-slate-200 dark:bg-white/5 border-slate-300 dark:border-white/10'
            )}
          >
            <Text style={[tw`text-center font-semibold`, titleText]}>
              {canAccessPdf ? 'Download Class Notes (PDF)' : 'Purchase to Access PDF'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Full Video Button (NEW: use hasVideo flag + unlocked resource) */}
        {hasVideo ? (
          <TouchableOpacity
            onPress={() => {
              if (!token) {
                Alert.alert('Login required', 'Please log in to access downloads.');
                return;
              }
              if (canAccessVideo) openLink(fullVideoUrl, 'Video');
              else navigation.navigate('BuyTokens');
            }}
            activeOpacity={0.9}
            style={tw.style(
              'w-full py-3 rounded-2xl border',
              canAccessVideo
                ? 'bg-white dark:bg-[#0f1821] border-[#cedbe8] dark:border-white/10'
                : 'bg-slate-200 dark:bg-white/5 border-slate-300 dark:border-white/10'
            )}
          >
            <Text style={[tw`text-center font-semibold`, titleText]}>
              {canAccessVideo ? 'Download Full Video' : 'Purchase to Access Video'}
            </Text>
          </TouchableOpacity>
        ) : null}

        

        {/* Unlock error */}
        {unlockError ? (
          <Text style={tw`mt-3 text-sm text-amber-700 dark:text-amber-300 text-center`}>
            {unlockError}
          </Text>
        ) : null}

        {/* Review Prompt Modal */}
        <Modal visible={showPrompt && !hasMyReview} transparent animationType="fade">
          <View style={tw`flex-1 bg-black/60 justify-center items-center p-4`}>
            <View style={[tw`w-full max-w-md p-5`, card]}>
              <Text style={[tw`text-lg font-bold mb-3`, titleText]}>How was it?</Text>

              <Text style={[tw`mb-1 text-sm font-semibold`, labelText]}>Rating (1–5)</Text>
              <TextInput
                placeholder="1 to 5"
                placeholderTextColor={placeholderColor}
                keyboardType="numeric"
                value={rating}
                onChangeText={setRating}
                style={[input, tw`mb-3`]}
              />

              <Text style={[tw`mb-1 text-sm font-semibold`, labelText]}>Comment (optional)</Text>
              <TextInput
                placeholder="What did you think?"
                placeholderTextColor={placeholderColor}
                multiline
                maxLength={500}
                value={comment}
                onChangeText={setComment}
                style={[input, tw`h-24`]}
                textAlignVertical="top"
              />

              <View style={tw`flex-row justify-end mt-4`}>
                <TouchableOpacity
                  onPress={() => setShowPrompt(false)}
                  activeOpacity={0.9}
                  style={[softBtn, tw`mr-2`]}
                >
                  <Text style={softBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={saving}
                  activeOpacity={0.9}
                  onPress={async () => {
                    const n = Number(rating);
                    if (!Number.isFinite(n) || n < 1 || n > 5) {
                      Alert.alert('Invalid rating', 'Please enter a number from 1 to 5.');
                      return;
                    }
                    if (!token) {
                      Alert.alert('Login required', 'You must be logged in to review.');
                      return;
                    }
                    try {
                      setSaving(true);
                      await submitVideoReview(backendUrl, token, videoId, {
                        rating: n,
                        comment: comment.trim() || undefined,
                      });
                      setShowPrompt(false);
                      setComment('');
                      setRating('');
                      await loadReviews();
                    } catch {
                      Alert.alert('Error', 'Failed to submit review');
                    } finally {
                      setSaving(false);
                    }
                  }}
                  style={tw.style('px-4 py-2 rounded-xl bg-pink-600', saving && 'opacity-70')}
                >
                  <Text style={tw`text-white font-semibold`}>{saving ? 'Saving…' : 'Submit'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}
