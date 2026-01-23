/// <reference path="../declarations.d.ts" />

import React, { useMemo, useEffect, useCallback } from 'react';
import { View, Text, Image, TouchableOpacity, ScrollView, TextInput, Modal } from 'react-native';
import { useRoute, useNavigation, RouteProp, NavigationProp } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MainStackParamList } from '../navigation/types';
import { FontAwesome } from '@expo/vector-icons';
import ProfileActions from '../screens/ProfileActions.native';
import TutorReviews from '../screens/TutorReviews.native';
import Spinner from '../screens/Spinner.native';
import useProfileDetail from '@mytutorapp/shared/hooks/useProfileDetail';
import { useShopContext } from '@mytutorapp/shared/context';
import { useProfileCard } from '@mytutorapp/shared/hooks';
import type { TutorProfile, Role, Profile } from '@mytutorapp/shared/types';
import debounce from 'lodash.debounce';
import tw from '../../tailwind';
import { useVideoPlayer, VideoView } from 'expo-video';
import ProfileCard from './ProfileCard.native';
import { useThemePref } from '../theme/ThemeContext';

type ProfileWithRatings = Profile & { rating: number; totalReviews: number };

/* ─────────────────────────────────────────────────────────
 * Adapters / helpers
 * ───────────────────────────────────────────────────────── */

const convertToTutorProfile = (profile: any): TutorProfile => {
  const expertise = profile?.description?.expertise ?? [];
  const teachingStyle = profile?.description?.teachingStyle ?? [];
  const roleValue: Role | undefined = (['tutor', 'student'] as Role[]).includes(
    (profile?.role as Role) ?? 'tutor'
  )
    ? (profile?.role as Role)
    : undefined;

  return {
    id: String(profile?.id ?? ''),
    user_id: String(profile?.user ?? profile?.id ?? ''),
    user: String(profile?.user ?? profile?.id ?? ''),
    name: profile?.name ?? '',
    category: profile?.category ?? '',
    gallery: profile?.gallery ?? [],
    role: roleValue,
    status: profile?.status as any,
    certified: false,
    pricing: {
      privateSession: String(profile?.pricing?.privateSession ?? '0'),
      groupSession: String(profile?.pricing?.groupSession ?? '0'),
      lecture: String(profile?.pricing?.lecture ?? '0'),
      workshop: String(profile?.pricing?.workshop ?? '0'),
    },
    video: profile?.video ?? '',
    lastOnline: undefined,
    description: {
      bio: profile?.description?.bio,
      expertise,
      teachingStyle,
    } as any,
    recommended: (profile?.recommended ?? []).map(convertToTutorProfile),
    languages: profile?.languages ?? [],
    rating: 0,
    totalReviews: 0,
  };
};

const tutorToProfile = (t: TutorProfile): ProfileWithRatings => ({
  id: t.id,
  user_id: t.user_id || String(t.user ?? t.id ?? ''),
  expertise: Array.isArray(t.description?.expertise) ? t.description!.expertise! : [],
  teachingStyle: Array.isArray(t.description?.teachingStyle) ? t.description!.teachingStyle! : [],

  name: t.name ?? '',
  role: (t.role ?? 'tutor') as Role,
  status: (t.status as Profile['status']) ?? undefined,

  category: t.category ?? '',
  gallery: t.gallery ?? [],

  rating: typeof t.rating === 'number' ? t.rating : 0,
  totalReviews: typeof t.totalReviews === 'number' ? t.totalReviews : 0,

  certified: t.certified === true,
});

const defaultTutorProfile: TutorProfile = {
  id: '',
  user_id: '',
  user: '',
  name: '',
  category: '',
  gallery: [],
  role: undefined,
  status: undefined,
  certified: false,
  pricing: { privateSession: '0', groupSession: '0', lecture: '0', workshop: '0' },
  video: '',
  lastOnline: undefined,
  description: {},
  recommended: [],
  languages: [],
  rating: 0,
  totalReviews: 0,
};

type ProfileRouteProp = RouteProp<MainStackParamList, 'Profile'>;

/** Match web: prefix backend URL only when asset path starts with "/" */
const resolveAsset = (backendUrl: string, raw?: string) => {
  if (!raw) return '';
  const base = backendUrl?.replace(/\/+$/, '') ?? '';
  return raw.startsWith('/') ? `${base}${raw}` : raw;
};

/** Pick a sensible default session (same heuristic as web) */
const pickDefaultSession = (pricing?: Record<string, number | string>) => {
  if (!pricing) return { type: '', cost: '' };
  const entries = Object.entries(pricing);
  if (!entries.length) return { type: '', cost: '' };
  const nonZero = entries.find(([, v]) => Number(v) > 0) ?? entries[0];
  const [type, price] = nonZero as [string, number | string];
  return { type, cost: String(price ?? '') };
};

/* ─────────────────────────────────────────────────────────
 * Screen
 * ───────────────────────────────────────────────────────── */

const ProfileDetailPage: React.FC = () => {
  const route = useRoute<ProfileRouteProp>();
  const params = route.params as { id?: string } | undefined;
  const id = String(params?.id ?? '');
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const { backendUrl, profile: myProfile, token } = useShopContext();

  // Safe area insets
  const insets = useSafeAreaInsets();
  // Re-render on theme change (so dark: classes apply)
  const { resolvedScheme } = useThemePref(); // 'light' | 'dark'

  // Load profile detail
  const {
    tutorProfile,
    loading,
    showChat,
    newMessage,
    setNewMessage,
    toggleChat,
    handleCreateSession,
    handleSendMessage,
    chatMessages,
    selectedImage,
    handleImageClick,
    closeModal,
  } = useProfileDetail(id, backendUrl);

  // Debounced sender
  const debouncedSendMessage = useMemo(() => debounce(handleSendMessage, 300), [handleSendMessage]);
  useEffect(() => () => debouncedSendMessage.cancel(), [debouncedSendMessage]);

  const numericProfile = useMemo(
    () => (tutorProfile ? convertToTutorProfile(tutorProfile as any) : defaultTutorProfile),
    [tutorProfile]
  );

  // Card metadata / impressions
  useProfileCard(numericProfile, backendUrl, token);

  const onCreateSession = useCallback(() => {
    try {
      const subject = numericProfile.category || 'General';
      const { type, cost } = pickDefaultSession(numericProfile.pricing as any);

      navigation.navigate('Account' as any, {
        tab: 'sessions',
        action: 'createSession',
        tutorId: (numericProfile.user_id || numericProfile.user) ?? '',
        tutorName: numericProfile.name ?? '',
        subject,
        sessionType: type,
        sessionCost: cost,
        pricing: JSON.stringify(numericProfile.pricing),
      });
    } catch {
      handleCreateSession(navigation.navigate as any);
    }
  }, [navigation, numericProfile, handleCreateSession]);

  // Media
  const hero = numericProfile.gallery[0] || '';
  const heroUri = resolveAsset(backendUrl, hero);
  const videoUri = resolveAsset(backendUrl, numericProfile.video);

  const profilePlayer = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    (async () => {
      try {
        await profilePlayer.pause();
        await profilePlayer.replace(videoUri || null);
      } catch {
        // ignore
      }
    })();
  }, [videoUri, profilePlayer]);

  const handleSendPress = useCallback(() => {
    debouncedSendMessage();
  }, [debouncedSendMessage]);

  // Early returns
  if (loading) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
        <View style={tw`flex-1 justify-center items-center`}>
          <Spinner />
        </View>
      </SafeAreaView>
    );
  }

  if (!tutorProfile) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
        <View style={tw`flex-1 justify-center items-center p-6`}>
          <Text style={tw`text-[#0d141c] dark:text-white/90`}>Tutor profile not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor =
    numericProfile.status === 'Online'
      ? 'bg-green-500'
      : numericProfile.status === 'Busy'
        ? 'bg-yellow-500'
        : numericProfile.status === 'Free'
          ? 'bg-purple-500'
          : 'bg-gray-500';

  const langs = numericProfile.languages ?? [];
  const expertise = numericProfile.description?.expertise ?? [];
  const teachingStyle = numericProfile.description?.teachingStyle ?? [];

  // Tutor-only: show School Grade / Year / Level from server (school_grade or schoolGrade)
  const isTutor = String(numericProfile.role || '').toLowerCase() === 'tutor';
  const gradeRaw = (tutorProfile as any)?.school_grade ?? (tutorProfile as any)?.schoolGrade;
  const displayGrade = typeof gradeRaw === 'string' ? gradeRaw : '';

  const pricingSections: [string, string][] = [
    ['Private Session (60 mins)', numericProfile.pricing.privateSession],
    ['Group Session (90 mins)', numericProfile.pricing.groupSession],
    ['Workshop (120 mins)', numericProfile.pricing.workshop],
    ['Lecture (180 mins)', numericProfile.pricing.lecture],
  ];

  const aboutSections: [string, string[]][] = [
    ['Expertise', expertise],
    ['Teaching Style', teachingStyle],
  ];

  // Dynamic bottom padding so content doesn't hide under chat/footer/home-indicator
  const CHAT_OVERLAY_HEIGHT = showChat ? 320 : 0; // overlay ~ max-h-72 (288) + input bar
  const FAB_ZONE = 88; // space for the chat FAB (bottom:24 + size)
  const bottomPad = insets.bottom + Math.max(CHAT_OVERLAY_HEIGHT, FAB_ZONE) + 24;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
      <ScrollView
        contentContainerStyle={[
          tw`pt-24 px-4 w-full max-w-5xl mx-auto`,
          { paddingBottom: bottomPad },
        ]}
      >
        {/* Primary image + video */}
        <View style={tw`w-full`}>
          <TouchableOpacity onPress={() => handleImageClick(hero)} activeOpacity={0.9}>
            <Image
              source={{ uri: heroUri || 'https://via.placeholder.com/800x600?text=Image' }}
              resizeMode="cover"
              style={tw`w-full h-80 rounded-lg shadow-lg`}
            />
          </TouchableOpacity>

          {!!numericProfile.video && (
            <View style={tw`mt-4 rounded-lg overflow-hidden shadow-lg`}>
              <VideoView
                player={profilePlayer}
                nativeControls
                contentFit="cover"
                allowsFullscreen
                allowsPictureInPicture
                style={tw`w-full h-40 rounded-lg`}
              />
            </View>
          )}
        </View>

        {/* Info card */}
        <View
          style={tw`w-full mt-6 rounded-lg shadow-lg bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 p-6`}
        >
          <View style={tw`flex-row items-center`}>
            <Image
              source={{ uri: heroUri || 'https://via.placeholder.com/200?text=Avatar' }}
              style={tw`h-20 w-20 rounded-full mr-4`}
            />

            <View style={tw`flex-shrink`}>
              <Text style={tw`text-2xl font-semibold text-[#0d141c] dark:text-white`}>
                {numericProfile.name}
              </Text>
              <Text style={tw`text-sm text-slate-700 dark:text-slate-300 mt-1`}>
                <Text style={tw`font-medium text-[#0d141c] dark:text-gray-200`}>Category: </Text>
                <Text style={tw`text-pink-600 dark:text-pink-400`}>
                  {numericProfile.category || 'N/A'}
                </Text>
              </Text>
              <Text style={tw`text-sm text-slate-700 dark:text-slate-300 mt-1`}>
                <Text style={tw`font-medium text-[#0d141c] dark:text-gray-200`}>Speaks: </Text>
                {langs.join(', ') || 'N/A'}
              </Text>
              {!!numericProfile.status && (
                <Text
                  style={tw.style(
                    'self-start text-[11px] mt-2 px-2 py-1 rounded-full text-white',
                    statusColor // 'bg-green-500' | 'bg-yellow-500' | 'bg-purple-500' | 'bg-gray-500'
                  )}
                >
                  {numericProfile.status}
                </Text>
              )}
            </View>
          </View>

          <TouchableOpacity
            onPress={onCreateSession}
            style={tw`mt-5 w-full bg-indigo-600 py-2 rounded-lg shadow items-center`}
          >
            <Text style={tw`text-white font-semibold`}>Create Session</Text>
          </TouchableOpacity>

          <View style={tw`mt-4`}>
            {pricingSections.map(([label, val]) => (
              <View key={label} style={tw`flex-row justify-between py-1`}>
                <Text style={tw`text-sm text-slate-700 dark:text-slate-300`}>{label}</Text>
                <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-gray-100`}>
                  {val} tokens
                </Text>
              </View>
            ))}
          </View>

          <View style={tw`mt-4`}>
            <ProfileActions
              recipientId={(numericProfile.user_id || numericProfile.user) as string}
              onSendMessage={toggleChat}
            />
          </View>
        </View>

        {/* About & Reviews */}
        <View style={tw`mt-8`}>
          <View
            style={tw`p-6 rounded-lg shadow-lg bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
          >
            <Text style={tw`text-xl font-semibold text-pink-600 dark:text-pink-400 mb-3`}>
              About Me
            </Text>
            <Text style={tw`text-[#0d141c] dark:text-gray-200 mb-4`}>
              {numericProfile.description?.bio || 'No bio available.'}
            </Text>

            {/* Grade / Class — heading styled like About */}
            {isTutor && !!displayGrade && (
              <View style={tw`mb-4`}>
                <Text style={tw`text-xl font-semibold text-pink-600 dark:text-pink-400`}>
                  Grade / Class
                </Text>
                <Text style={tw`text-[#0d141c] dark:text-gray-200 mt-1`}>{displayGrade}</Text>
              </View>
            )}

            <View style={tw`flex-row flex-wrap gap-6`}>
              {aboutSections.map(([title, items]) => (
                <View key={title} style={tw`w-full md:w-1/2`}>
                  <Text style={tw`text-lg font-semibold text-pink-600 dark:text-pink-400 mb-1`}>
                    {title}
                  </Text>
                  {items.length ? (
                    items.map((it, i) => (
                      <Text
                        key={`${title}-${i}`}
                        style={tw`text-[#0d141c] dark:text-gray-200 text-sm`}
                      >
                        {it}
                      </Text>
                    ))
                  ) : (
                    <Text style={tw`text-slate-500 dark:text-gray-400 text-sm`}>Not specified</Text>
                  )}
                </View>
              ))}
            </View>
          </View>

          <View style={tw`mt-6`}>
            <TutorReviews tutorId={(numericProfile.user_id || numericProfile.user) as string} />
          </View>
        </View>

        {/* Recommended tutors → ProfileCard tiles */}
        {(numericProfile.recommended?.length ?? 0) > 0 && (
          <View style={tw`mt-8`}>
            <Text style={tw`text-[#0d141c] dark:text-white text-lg font-semibold mb-3`}>
              Recommended Tutors
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={tw`gap-4 pr-4`}
            >
              {(numericProfile.recommended ?? []).map((t) => {
                const p = tutorToProfile(t);
                return (
                  <View key={p.id} style={tw`w-56`}>
                    <ProfileCard profile={p} />
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Selected image modal */}
      {selectedImage ? (
        <Modal transparent animationType="fade" onRequestClose={closeModal}>
          <View style={tw`absolute inset-0 bg-black bg-opacity-80 justify-center items-center`}>
            <TouchableOpacity style={tw`absolute top-6 right-6`} onPress={closeModal}>
              <FontAwesome name="times" size={24} color="white" />
            </TouchableOpacity>
            <Image
              source={{ uri: resolveAsset(backendUrl, selectedImage) }}
              style={tw`w-full h-full`}
              resizeMode="contain"
            />
          </View>
        </Modal>
      ) : null}

      {/* Chat FAB + overlay */}
      {String(myProfile?.id ?? '') !== String(numericProfile.id) && (
        <View style={[tw`absolute right-6`, { bottom: insets.bottom + 24 }]}>
          <TouchableOpacity
            onPress={toggleChat}
            style={tw`bg-pink-600 dark:bg-pink-500 p-3 rounded-full shadow-lg`}
          >
            <FontAwesome name="smile-o" size={20} color="white" />
          </TouchableOpacity>
        </View>
      )}
      {showChat && (
        <View
          style={[
            tw`absolute right-0 w-full max-w-md bg-white dark:bg-[#0f1821] border-t border-[#cedbe8] dark:border-white/10 shadow-xl`,
            { bottom: insets.bottom },
          ]}
        >
          <ScrollView contentContainerStyle={tw`p-4 max-h-72`}>
            {chatMessages.length ? (
              chatMessages.map((msg, i) => (
                <View
                  key={`${msg.sender}-${i}`}
                  style={tw`p-2 rounded mb-2 ${
                    msg.sender === 'me'
                      ? 'bg-indigo-600 self-end'
                      : 'bg-slate-200 dark:bg-gray-700 self-start'
                  }`}
                >
                  <Text
                    style={tw`${msg.sender === 'me' ? 'text-white' : 'text-[#0d141c] dark:text-white'}`}
                  >
                    {msg.content}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={tw`text-slate-600 dark:text-gray-400`}>Start the conversation!</Text>
            )}
          </ScrollView>
          <View
            style={[
              tw`flex-row items-center p-2 border-t border-[#cedbe8] dark:border-white/10`,
              { paddingBottom: insets.bottom },
            ]}
          >
            <TextInput
              value={newMessage}
              onChangeText={setNewMessage}
              placeholder="Type your message"
              placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
              style={tw`flex-1 bg-white dark:bg-gray-700 text-[#0d141c] dark:text-white px-3 py-2 rounded-l`}
            />
            <TouchableOpacity
              onPress={handleSendPress}
              style={tw`bg-pink-600 dark:bg-pink-500 px-4 py-2 rounded-r`}
            >
              <FontAwesome name="paper-plane" size={16} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

export default ProfileDetailPage;
