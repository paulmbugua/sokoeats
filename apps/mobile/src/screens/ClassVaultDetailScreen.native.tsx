// apps/mobile/src/screens/ClassVaultDetailScreen.native.tsx
import React, { useEffect, useRef, useState } from 'react';
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
} from 'react-native';
import {
  RouteProp,
  useRoute,
  useNavigation,
  NavigationProp,
} from '@react-navigation/native';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import tw from '../../tailwind';
import { useShopContext } from '@mytutorapp/shared/context';
import { useClassVaultDetail } from '@mytutorapp/shared/hooks/useClassVault';
import {
  fetchVideoReviews,
  submitVideoReview,
} from '@mytutorapp/shared/api/classVaultApi';
import type { MainStackParamList } from '../navigation/types';
import type { VideoReview } from '@mytutorapp/shared/types';

type DetailRoute = RouteProp<MainStackParamList, 'ClassVaultDetail'>;

export default function ClassVaultDetailScreen() {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const { backendUrl, token, profile } = useShopContext();
  const {
    params: { id: videoId },
  } = useRoute<DetailRoute>();

  const { video, resources, unlockContent, error } =
    useClassVaultDetail(videoId);
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
  }, [videoId]);

  // Fetch protected URLs once per id
  useEffect(() => {
    if (didRequestUnlockRef.current) return;
    didRequestUnlockRef.current = true;
    unlockContent().catch((err: { message?: string }) =>
      setUnlockError(err?.message || ''),
    );
  }, [unlockContent, videoId]);

  // Reviews
  const myId = profile?.id ? String(profile.id) : '';
  const hasMyReview = myId
    ? reviews.some((r) => String(r.student_id) === myId)
    : false;

  const loadReviews = async (): Promise<void> => {
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
  };

  useEffect(() => {
    void loadReviews();
  }, [backendUrl, videoId]);

  // always returns string (never undefined)
  const resolveUrl = (maybeUrl?: string): string => {
    if (!maybeUrl) return '';
    if (maybeUrl.startsWith('http://') || maybeUrl.startsWith('https://')) {
      return maybeUrl;
    }
    return `${backendUrl}${maybeUrl}`;
  };

  const fullVideoUrl = resolveUrl(resources?.video_url);
  const previewUri = resolveUrl(video?.preview_url);
  const videoUri = fullVideoUrl || previewUri;
  const pdfUri = resolveUrl(resources?.pdf_url);

  // safe link opener (downloads)
  const openLink = (url: string, label: string) => {
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
      ? Number(
          (
            reviews.reduce((s, r) => s + Number(r.rating), 0) /
            reviews.length
          ).toFixed(2),
        )
      : 0;

  // ---------- expo-video player (hooks MUST be unconditional) ----------
  // Create once, attach later; we'll swap sources as URLs resolve.
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 1; // seconds (frequency for `timeUpdate`)
    if (fullVideoUrl) p.play();
  });

  // Replace source whenever `videoUri` changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await player.pause();
        await player.replace(videoUri || null);
        if (!cancelled && fullVideoUrl) {
          player.play();
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoUri, fullVideoUrl, player]);

  // 80% watched gate with 'timeUpdate'
  const { currentTime = 0, duration = 0 } = useEvent(
    player,
    'timeUpdate',
    { currentTime: 0, duration: 0 } as any,
  ) as any;

  useEffect(() => {
    if (promptedRef.current || hasMyReview) return;
    if (!duration) return;
    const pct = currentTime / duration;
    if (pct >= 0.8) {
      promptedRef.current = true;
      setShowPrompt(true);
    }
  }, [currentTime, duration, hasMyReview]);

  // ---------- Early returns (AFTER all hooks) ----------
  if (error) {
    return (
      <View
        style={tw`flex-1 bg-gray-900 justify-center items-center p-4`}
      >
        <Text style={tw`text-red-500 text-center`}>{error}</Text>
      </View>
    );
  }

  if (!video) {
    return (
      <View
        style={tw`flex-1 bg-gray-900 justify-center items-center`}
      >
        <ActivityIndicator
          size="large"
          color={tw.color('pink-500')}
        />
      </View>
    );
  }

  // ---------- Main UI ----------
  return (
    <ScrollView
      contentContainerStyle={tw`bg-gray-900 p-4`}
      keyboardShouldPersistTaps="handled"
    >
      {/* Title */}
      <Text
        style={tw`text-2xl text-white font-bold mb-4 text-center`}
      >
        {video.title}
      </Text>

      {/* Video / Preview */}
      {videoUri !== '' && (
        <View
          style={tw`w-full h-56 mb-6 bg-black rounded-lg overflow-hidden`}
        >
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

      {/* Metadata */}
      <View style={tw`mb-6`}>
        <Text style={tw`text-gray-400 mb-1`}>Subject</Text>
        <Text style={tw`text-white mb-3`}>
          {video.subject ?? '—'}
        </Text>

        <Text style={tw`text-gray-400 mb-1`}>Grade Level</Text>
        <Text style={tw`text-white mb-3`}>
          {video.grade_level ?? '—'}
        </Text>

        {video.description ? (
          <>
            <Text style={tw`text-gray-400 mb-1`}>Description</Text>
            <Text style={tw`text-white mb-3`}>
              {video.description}
            </Text>
          </>
        ) : null}

        {video.tags?.length ? (
          <>
            <Text style={tw`text-gray-400 mb-1`}>Tags</Text>
            <View style={tw`flex-row flex-wrap mb-3`}>
              {video.tags.map((tag: string) => (
                <Text
                  key={tag}
                  style={tw`text-sm text-white bg-gray-800 px-2 py-1 rounded mr-2 mb-2`}
                >
                  {tag}
                </Text>
              ))}
            </View>
          </>
        ) : null}
      </View>

      {/* Rating summary + “Rate this video” opener */}
      <View style={tw`rounded-xl border border-gray-800 p-4 mb-4`}>
        <View style={tw`flex-row items-center`}>
          <Text style={tw`text-slate-200`}>
            <Text style={tw`font-semibold`}>Rating:</Text> ★ {avgRating} (
            {reviews.length})
          </Text>
          {loadingReviews && (
            <Text style={tw`ml-2 text-slate-400`}>Loading…</Text>
          )}
          {!!reviewsError && (
            <Text style={tw`ml-2 text-red-400`}>
              {reviewsError}
            </Text>
          )}
          {!hasMyReview && (
            <TouchableOpacity
              onPress={() => setShowPrompt(true)}
              style={tw`ml-auto px-3 py-1 rounded bg-pink-600`}
            >
              <Text
                style={tw`text-white text-sm font-semibold`}
              >
                Rate this video
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ——— Download / Purchase Buttons ——— */}

      {/* PDF Button */}
      {video.pdf_url && (
        <TouchableOpacity
          onPress={() => {
            if (!pdfUri) {
              navigation.navigate('BuyTokens');
              return;
            }
            openLink(pdfUri, 'PDF');
          }}
          style={tw.style(
            'w-full py-3 mb-4 rounded-lg',
            pdfUri ? 'bg-gray-800' : 'bg-gray-700',
          )}
        >
          <Text
            style={tw`text-center text-white font-medium`}
          >
            {pdfUri
              ? 'Download Class Notes (PDF)'
              : 'Purchase to Access PDF'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Full Video Button */}
      <TouchableOpacity
        onPress={() => {
          if (fullVideoUrl) openLink(fullVideoUrl, 'Video');
          else navigation.navigate('BuyTokens');
        }}
        style={tw.style(
          'w-full py-3 rounded-lg',
          fullVideoUrl ? 'bg-gray-800' : 'bg-gray-700',
        )}
      >
        <Text style={tw`text-center text-white font-medium`}>
          {fullVideoUrl
            ? 'Download Full Video'
            : 'Purchase to Access Video'}
        </Text>
      </TouchableOpacity>

      {/* Unlock error */}
      {unlockError ? (
        <Text
          style={tw`mt-4 text-sm text-yellow-400 text-center`}
        >
          {unlockError}
        </Text>
      ) : null}

      {/* Review Prompt Modal */}
      <Modal
        visible={showPrompt && !hasMyReview}
        transparent
        animationType="fade"
      >
        <View
          style={tw`flex-1 bg-black/60 justify-center items-center p-4`}
        >
          <View
            style={tw`w-full max-w-md rounded-2xl bg-gray-900 border border-gray-800 p-5`}
          >
            <Text
              style={tw`text-lg font-bold text-white mb-3`}
            >
              How was it?
            </Text>

            <Text style={tw`text-slate-300 mb-1`}>
              Rating (1–5)
            </Text>
            <TextInput
              placeholder="1 to 5"
              placeholderTextColor="#94a3b8"
              keyboardType="numeric"
              value={rating}
              onChangeText={setRating}
              style={tw`w-full p-3 rounded-xl bg-gray-800 text-white mb-3`}
            />

            <Text style={tw`text-slate-300 mb-1`}>
              Comment (optional)
            </Text>
            <TextInput
              placeholder="What did you think?"
              placeholderTextColor="#94a3b8"
              multiline
              maxLength={500}
              value={comment}
              onChangeText={setComment}
              style={tw`w-full h-24 p-3 rounded-xl bg-gray-800 text-white`}
            />

            <View style={tw`flex-row justify-end mt-4`}>
              <TouchableOpacity
                onPress={() => setShowPrompt(false)}
                style={tw`px-4 py-2 rounded bg-gray-700 mr-2`}
              >
                <Text style={tw`text-white`}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={saving}
                onPress={async () => {
                  const n = Number(rating);
                  if (!Number.isFinite(n) || n < 1 || n > 5) {
                    Alert.alert(
                      'Invalid rating',
                      'Please enter a number from 1 to 5.',
                    );
                    return;
                  }
                  if (!token) {
                    Alert.alert(
                      'Login required',
                      'You must be logged in to review.',
                    );
                    return;
                  }
                  try {
                    setSaving(true);
                    await submitVideoReview(
                      backendUrl,
                      token,
                      videoId,
                      {
                        rating: n,
                        comment:
                          comment.trim() || undefined,
                      },
                    );
                    setShowPrompt(false);
                    setComment('');
                    setRating('');
                    await loadReviews();
                  } catch {
                    Alert.alert(
                      'Error',
                      'Failed to submit review',
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
                style={tw.style(
                  'px-4 py-2 rounded',
                  saving
                    ? 'bg-pink-600 opacity-70'
                    : 'bg-pink-600',
                )}
              >
                <Text
                  style={tw`text-white font-semibold`}
                >
                  {saving ? 'Saving…' : 'Submit'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
