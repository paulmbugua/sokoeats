/* apps/mobile/src/screens/ProfileDetail.native.tsx */
import React, { useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useNavigation, useRoute, RouteProp, NavigationProp } from '@react-navigation/native';

import tw from '../../tailwind';
import { useShopContext } from '@mytutorapp/shared/context';
import useProfileDetail from '@mytutorapp/shared/hooks/useProfileDetail';
import useProfileCard from '@mytutorapp/shared/hooks/useProfileCard';
import type { TutorProfile } from '@mytutorapp/shared/types';
import ProfileActions from './ProfileActions.native'; // ✅ ensure you have native version (or adjust path)
import TutorReviews from './TutorReviews.native'; // ✅ ensure you have native version (or adjust path)
import type { MainStackParamList } from '../navigation/types';

type R = RouteProp<MainStackParamList, 'Profile'>;
type Nav = NavigationProp<MainStackParamList>;

const defaultTutorProfile: TutorProfile = {
  id: '',
  user_id: '',
  user: '',
  name: '',
  category: '',
  gallery: [],
  video: '',
  role: undefined,
  status: undefined,
  lastOnline: undefined,
  description: {},
  recommended: [],
  languages: [],
  pricing: { privateSession: '0', groupSession: '0', lecture: '0', workshop: '0' },
  rating: 0,
  totalReviews: 0,
};

const pickDefaultSession = (pricing?: Record<string, number | string>) => {
  if (!pricing) return { type: '', cost: '' };

  const entries = Object.entries(pricing);
  if (entries.length === 0) return { type: '', cost: '' };

  const nonZero = entries.find(([, v]) => Number(v) > 0);
  const fallback = entries[0]; // always exists here
  const [type, price] = (nonZero ?? fallback) as [string, number | string];

  return { type, cost: String(price ?? '') };
};


export default function ProfileDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();

  const id = route.params?.id;
  const { backendUrl, token } = useShopContext();

  const {
    tutorProfile,
    loading,
    selectedImage,
    handleImageClick,
    closeModal,
    chatStatus,
    prebookingUsed,
    handleSendPrebookingInquiry,
    myProfile,
  } = useProfileDetail(id!, backendUrl);

  const profile: TutorProfile = useMemo(() => {
    const tp = tutorProfile as Partial<TutorProfile> | undefined;
    return tp && tp.id ? (tp as TutorProfile) : defaultTutorProfile;
  }, [tutorProfile]);

  // ✅ keep parity with web (analytics / card behavior)
  useProfileCard(profile, backendUrl, token);

  const resolveAsset = useCallback(
    (raw?: string) => (raw?.startsWith('/') ? `${backendUrl}${raw}` : raw || ''),
    [backendUrl]
  );

  const [showInquiryModal, setShowInquiryModal] = useState(false);
  const [inquiryForm, setInquiryForm] = useState({
    topic: '',
    level: '',
    availability: '',
    note: '',
  });
  const [inquiryError, setInquiryError] = useState('');
  const [sendingInquiry, setSendingInquiry] = useState(false);

  const onCreateSession = useCallback(
    (note?: string) => {
      const subject = profile.category || 'General';
      const { type, cost } = pickDefaultSession(profile.pricing);

      navigation.navigate('Account', {
        tab: 'sessions',
        action: 'createSession',
        tutorId: (profile.user_id || profile.user) ?? '',
        tutorName: profile.name ?? '',
        subject,
        sessionType: type || '',
        sessionCost: cost || '',
        pricing: profile.pricing ? JSON.stringify(profile.pricing) : undefined,
        // carry note in multiple fields (mirrors web query params usage)
        note: note || undefined,
        comment: note || undefined,
        description: note || undefined,
      } as any);
    },
    [navigation, profile]
  );

  const onQuickQuestions = useCallback(() => {
    onCreateSession('Quick question: Can you share your availability this week?');
  }, [onCreateSession]);

  const openMessagesThread = useCallback(() => {
    if (!profile.id) return;
    navigation.navigate('Messages', { studentId: profile.id } as any);
  }, [navigation, profile.id]);

  const canSendInquiry =
    myProfile?.role === 'student' && chatStatus === 'locked' && !prebookingUsed;

  const handleInquirySubmit = useCallback(async () => {
    setInquiryError('');
    if (!inquiryForm.topic || !inquiryForm.level || !inquiryForm.availability) {
      setInquiryError('Please fill topic, level, and availability.');
      return;
    }

    setSendingInquiry(true);
    const result = await handleSendPrebookingInquiry({
      topic: inquiryForm.topic,
      level: inquiryForm.level,
      availability: inquiryForm.availability,
      note: inquiryForm.note || undefined,
    });
    setSendingInquiry(false);

    if (!result.ok) {
      setInquiryError(result.message || 'Unable to send inquiry.');
      return;
    }

    setInquiryForm({ topic: '', level: '', availability: '', note: '' });
    setShowInquiryModal(false);
  }, [handleSendPrebookingInquiry, inquiryForm]);

  if (loading) {
    return (
      <SafeAreaView style={[tw`flex-1 bg-white dark:bg-black`, { paddingTop: insets.top }]}>
        <View style={tw`flex-1 items-center justify-center`}>
          <ActivityIndicator />
          <Text style={tw`mt-3 text-gray-600 dark:text-gray-300`}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!tutorProfile) {
    return (
      <SafeAreaView style={[tw`flex-1 bg-white dark:bg-black`, { paddingTop: insets.top }]}>
        <View style={tw`flex-1 items-center justify-center px-6`}>
          <Text style={tw`text-gray-800 dark:text-gray-100 font-semibold`}>
            Tutor profile not found.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor =
    profile.status === 'Online'
      ? 'bg-green-500'
      : profile.status === 'Busy'
        ? 'bg-yellow-500'
        : profile.status === 'Free'
          ? 'bg-purple-500'
          : 'bg-gray-500';

  const languages = profile.languages ?? [];
  const expertise = profile.description?.expertise ?? [];
  const teachingStyle = profile.description?.teachingStyle ?? [];

  // Tutor-only Grade/Class (same as web)
  const isTutor = (profile.role || '').toLowerCase() === 'tutor';
  const gradeRaw = (tutorProfile as any)?.school_grade ?? (tutorProfile as any)?.schoolGrade;
  const displayGrade = typeof gradeRaw === 'string' ? gradeRaw : '';

  const pricingSections: [string, string][] = [
    ['Private Session (60 mins)', profile.pricing.privateSession],
    ['Group Session (90 mins)', profile.pricing.groupSession],
    ['Workshop (120 mins)', profile.pricing.workshop],
    ['Lecture (180 mins)', profile.pricing.lecture],
  ];

  return (
    <SafeAreaView style={[tw`flex-1 bg-white dark:bg-black`, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={tw`px-4 pb-10`}>
        {/* Hero image */}
        <Pressable
          onPress={() => handleImageClick(profile.gallery?.[0] || '')}
          style={tw`mt-3 rounded-2xl overflow-hidden border border-gray-200 dark:border-white/10`}
        >
          <Image
            source={{ uri: resolveAsset(profile.gallery?.[0]) || undefined }}
            style={tw`w-full h-64`}
            contentFit="cover"
          />
        </Pressable>

        {/* Card */}
        <View style={tw`mt-4 rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-4`}>
          <View style={tw`flex-row items-center`}>
            <Image
              source={{ uri: resolveAsset(profile.gallery?.[0]) || undefined }}
              style={tw`w-16 h-16 rounded-full border border-gray-200 dark:border-white/10`}
              contentFit="cover"
            />
            <View style={tw`ml-3 flex-1`}>
              <Text style={tw`text-lg font-semibold text-gray-900 dark:text-white`}>
                {profile.name}
              </Text>

              <Text style={tw`mt-0.5 text-sm text-gray-600 dark:text-gray-300`}>
                <Text style={tw`font-semibold text-gray-800 dark:text-gray-100`}>Category: </Text>
                <Text style={tw`text-blue-600 dark:text-blue-400 font-semibold`}>
                  {profile.category || 'N/A'}
                </Text>
              </Text>

              <Text style={tw`mt-0.5 text-sm text-gray-600 dark:text-gray-300`}>
                <Text style={tw`font-semibold text-gray-800 dark:text-gray-100`}>Speaks: </Text>
                <Text style={tw`text-gray-800 dark:text-gray-100`}>
                  {languages.join(', ') || 'N/A'}
                </Text>
              </Text>
            </View>
          </View>

          {/* Create Session */}
          <Pressable
            onPress={() => onCreateSession()}
            style={tw`mt-4 h-12 rounded-xl bg-blue-600 items-center justify-center`}
          >
            <Text style={tw`text-white font-semibold`}>Create Session</Text>
          </Pressable>

          {/* Pricing */}
          <View style={tw`mt-4`}>
            {pricingSections.map(([label, val]) => (
              <View key={label} style={tw`flex-row justify-between py-1`}>
                <Text style={tw`text-sm text-gray-700 dark:text-gray-200`}>{label}</Text>
                <Text style={tw`text-sm font-semibold text-gray-900 dark:text-white`}>
                  {val} tokens
                </Text>
              </View>
            ))}
          </View>

          {/* ✅ Actions block (matches web) */}
          <View style={tw`mt-4`}>
            {/* Quick Questions */}
            <Pressable
              onPress={onQuickQuestions}
              style={tw`h-12 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 items-center justify-center`}
            >
              <Text style={tw`font-semibold text-gray-900 dark:text-white`}>Quick Questions</Text>
            </Pressable>

            {/* Message Tutor OR Locked banner */}
            {chatStatus === 'unlocked' ? (
              <Pressable
                onPress={openMessagesThread}
                style={tw`mt-3 h-12 rounded-xl bg-blue-600 items-center justify-center`}
              >
                <Text style={tw`text-white font-semibold`}>Message Tutor</Text>
              </Pressable>
            ) : (
              <View
                style={tw`mt-3 rounded-xl border border-dashed border-amber-200 bg-amber-50 px-4 py-3`}
              >
                <Text style={tw`text-amber-900 font-semibold`}>Chat unlocks after booking.</Text>
              </View>
            )}

            {/* Send 1 Inquiry (only when allowed) */}
            {canSendInquiry && (
              <Pressable
                onPress={() => setShowInquiryModal(true)}
                style={tw`mt-3 h-12 rounded-xl bg-indigo-600 items-center justify-center`}
              >
                <Text style={tw`text-white font-semibold`}>Send 1 Inquiry</Text>
              </Pressable>
            )}

            {/* Profile actions (report/block/etc) */}
            <View style={tw`mt-3`}>
              <ProfileActions recipientId={(profile.user_id || profile.user) as string} />
            </View>
          </View>
        </View>

        {/* About */}
        <View style={tw`mt-4 rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-4`}>
          <Text style={tw`text-lg font-semibold text-blue-600 dark:text-blue-400`}>About Me</Text>
          <Text style={tw`mt-2 text-gray-800 dark:text-gray-100`}>
            {profile.description?.bio || 'No bio available.'}
          </Text>

          {isTutor && displayGrade ? (
            <View style={tw`mt-4`}>
              <Text style={tw`text-lg font-semibold text-blue-600 dark:text-blue-400`}>
                Grade / Class
              </Text>
              <Text style={tw`mt-1 text-gray-800 dark:text-gray-100`}>{displayGrade}</Text>
            </View>
          ) : null}

          <View style={tw`mt-4`}>
            <Text style={tw`text-base font-semibold text-blue-600 dark:text-blue-400`}>
              Expertise
            </Text>
            {expertise.length ? (
              expertise.map((it, idx) => (
                <Text key={`${it}-${idx}`} style={tw`mt-1 text-sm text-gray-800 dark:text-gray-100`}>
                  • {it}
                </Text>
              ))
            ) : (
              <Text style={tw`mt-1 text-sm text-gray-600 dark:text-gray-300`}>Not specified</Text>
            )}
          </View>

          <View style={tw`mt-4`}>
            <Text style={tw`text-base font-semibold text-blue-600 dark:text-blue-400`}>
              Teaching Style
            </Text>
            {teachingStyle.length ? (
              teachingStyle.map((it, idx) => (
                <Text key={`${it}-${idx}`} style={tw`mt-1 text-sm text-gray-800 dark:text-gray-100`}>
                  • {it}
                </Text>
              ))
            ) : (
              <Text style={tw`mt-1 text-sm text-gray-600 dark:text-gray-300`}>Not specified</Text>
            )}
          </View>
        </View>

        {/* Reviews */}
        <View style={tw`mt-4 rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-4`}>
          <TutorReviews tutorId={(profile.user_id || profile.user) as string} />
        </View>

        {/* Recommended */}
        {!!profile.recommended?.length && (
          <View style={tw`mt-4 rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-4`}>
            <ProfileActions.Recommended recommended={profile.recommended} statusColor={statusColor} />
          </View>
        )}

      </ScrollView>

      {/* ✅ Inquiry Modal (matches web fields) */}
      <Modal visible={showInquiryModal} transparent animationType="fade" onRequestClose={() => setShowInquiryModal(false)}>
        <View style={tw`flex-1 bg-black/60 items-center justify-center px-4`}>
          <View style={tw`w-full max-w-xl rounded-2xl bg-white dark:bg-black border border-gray-200 dark:border-white/10 p-4`}>
            <Text style={tw`text-lg font-semibold text-blue-600 dark:text-blue-400`}>Send 1 Inquiry</Text>

            <View style={tw`mt-3`}>
              <TextInput
                value={inquiryForm.topic}
                onChangeText={(t) => setInquiryForm((p) => ({ ...p, topic: t }))}
                placeholder="Topic (e.g. Algebra basics)"
                placeholderTextColor={Platform.OS === 'ios' ? '#999' : undefined}
                style={tw`mt-2 px-3 py-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white`}
              />
              <TextInput
                value={inquiryForm.level}
                onChangeText={(t) => setInquiryForm((p) => ({ ...p, level: t }))}
                placeholder="Level (e.g. Grade 10)"
                placeholderTextColor={Platform.OS === 'ios' ? '#999' : undefined}
                style={tw`mt-2 px-3 py-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white`}
              />
              <TextInput
                value={inquiryForm.availability}
                onChangeText={(t) => setInquiryForm((p) => ({ ...p, availability: t }))}
                placeholder="Availability (e.g. Weeknights after 6pm)"
                placeholderTextColor={Platform.OS === 'ios' ? '#999' : undefined}
                style={tw`mt-2 px-3 py-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white`}
              />
              <TextInput
                value={inquiryForm.note}
                onChangeText={(t) => setInquiryForm((p) => ({ ...p, note: t }))}
                placeholder="Optional note"
                placeholderTextColor={Platform.OS === 'ios' ? '#999' : undefined}
                multiline
                style={tw`mt-2 px-3 py-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white min-h-[90px]`}
              />

              {!!inquiryError && (
                <Text style={tw`mt-2 text-sm text-red-600 dark:text-red-400`}>{inquiryError}</Text>
              )}
            </View>

            <View style={tw`mt-4 flex-row justify-end`}>
              <Pressable
                onPress={() => setShowInquiryModal(false)}
                style={tw`px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10`}
              >
                <Text style={tw`text-gray-700 dark:text-gray-200 font-semibold`}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleInquirySubmit}
                disabled={sendingInquiry}
                style={tw`ml-2 px-4 py-3 rounded-xl bg-blue-600 ${sendingInquiry ? 'opacity-60' : ''}`}
              >
                <Text style={tw`text-white font-semibold`}>
                  {sendingInquiry ? 'Sending...' : 'Send Inquiry'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ✅ Lightbox */}
      <Modal visible={!!selectedImage} transparent animationType="fade" onRequestClose={closeModal}>
        <Pressable onPress={closeModal} style={tw`flex-1 bg-black/80 items-center justify-center p-4`}>
          <Image
            source={{ uri: resolveAsset(selectedImage || '') }}
            style={tw`w-full h-[75%] rounded-2xl`}
            contentFit="contain"
          />
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
