// apps/mobile/src/pages/CourseDetails.native.tsx
/* eslint-disable prettier/prettier */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Linking,
} from 'react-native';
import debounce from 'lodash.debounce';
import { useRoute, useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useShopContext } from '@mytutorapp/shared/context';
import { useCourses, useEnrollments, useOerMeta } from '@mytutorapp/shared/hooks';
import { useCourseReviews } from '@mytutorapp/shared/hooks/useCourseReviews';

import type { Course } from '@mytutorapp/shared/types';
import type { MainStackParamList } from '../navigation/types';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';

import tw from '../../tailwind';

interface MaybeInstructor {
  tutorName?: string;
  instructor?: { name?: string; bio?: string };
}

type Nav = StackNavigationProp<MainStackParamList, 'CourseDetails'>;
type Rt = RouteProp<MainStackParamList, 'CourseDetails'>;

const FOOTER_OFFSET = 80;

/* --------------------------------- Stars --------------------------------- */
const StarRow: React.FC<{ avg?: number; count?: number }> = ({ avg = 0, count = 0 }) => {
  const a = Math.round(avg * 2) / 2;
  return (
    <View style={tw`flex-row items-center`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text
          key={i}
          style={tw.style(
            'mr-0.5 text-lg',
            a >= i ? 'text-yellow-500' : a + 0.5 === i ? 'text-yellow-500/70' : 'text-yellow-500/30'
          )}
        >
          ★
        </Text>
      ))}
      <Text style={tw`ml-1 text-sm text-[#49739c] dark:text-darkTextSecondary`}>
        {avg.toFixed(1)} ({count})
      </Text>
    </View>
  );
};

/** Coerce any price-like value to whole tokens (non-negative int) */
function toTokens(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : 0;
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

/* --------------------------------- UI Bits -------------------------------- */
const Pill: React.FC<React.PropsWithChildren<{}>> = ({ children }) => (
  <View style={tw`h-8 px-3 rounded-lg bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}>
    <Text style={tw`text-sm text-slate-900 dark:text-slate-100`}>{children}</Text>
  </View>
);

const CenterMessage: React.FC<{ text: string; variant?: 'error' | 'normal' }> = ({
  text,
  variant = 'normal',
}) => (
  <View style={tw`flex-1 items-center justify-center px-6`}>
    <Text
      style={tw.style(
        'text-base text-center',
        variant === 'error'
          ? 'text-red-600 dark:text-red-400'
          : 'text-slate-800 dark:text-slate-100'
      )}
    >
      {text}
    </Text>
  </View>
);

const CourseDetailsNative: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const courseId = String(route.params?.courseId ?? '');

  const insets = useSafeAreaInsets();
  const topPad = Math.max(insets.top, 12);
  const bottomPad = Math.max(insets.bottom, 16);

  const { backendUrl, token, profile, tokens: walletTokens = 0 } = useShopContext();
  const role = String(profile?.role ?? '').toLowerCase();
  const myId = String(profile?.id ?? '');

  // --- Fetch course details ---
  const {
    selectedCourse,
    loading: loadingCourse,
    error: courseError,
    fetchCourseById,
  } = useCourses({ backendUrl, token });

  useEffect(() => {
    if (courseId) void fetchCourseById(courseId);
  }, [courseId, fetchCourseById]);

  const c: Course | null | undefined = selectedCourse ?? null;

  // --- OER meta ---
  const oerMeta = useOerMeta(courseId);

  // --- Enrollments + Purchase flow ---
  const {
    enroll,
    cancel,
    enrollments,
    loading: enrollmentsLoading,
    error: enrollError,
    fetchMine,
    purchaseCourseAndEnroll, // purchase + auto-enroll
  } = useEnrollments({
    backendUrl,
    token: token ?? '',
    studentId: 'me' as unknown as string | number,
  });

  useEffect(() => {
    if (token) void fetchMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const myEnrollment = useMemo(() => {
    if (!courseId) return undefined;
    return enrollments.find((e: any) => String(e?.course_id ?? e?.courseId) === String(courseId));
  }, [enrollments, courseId]);

  // Always treat price as tokens
  const priceTokens = useMemo(() => toTokens(c?.price), [c?.price]);
  const hasEnough = walletTokens >= priceTokens;

  // Tutor block
  const mi = (c ?? {}) as Course & MaybeInstructor;
  const tutorName = mi.tutorName || mi.instructor?.name || 'Your tutor';
  const tutorBio = mi.instructor?.bio || 'Experienced educator';

  // -------- Reviews wiring --------
  const { avg, count, hasMyReview, reload, submit, posting } = useCourseReviews(
    backendUrl,
    courseId,
    { myStudentId: myId, token: token ?? '' }
  );
  const debouncedReload = useMemo(
    () =>
      debounce(() => {
        void reload();
      }, 200),
    [reload]
  );
  useEffect(() => () => debouncedReload.cancel(), [debouncedReload]);

  const [openReview, setOpenReview] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  // ----- Actions -----
  const confirm = (title: string, message: string): Promise<boolean> =>
    new Promise((resolve) => {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'OK', onPress: () => resolve(true) },
      ]);
    });

  const onPurchaseAndEnroll = async () => {
    if (!courseId || !c) return;

    const proceed = await confirm(
      'Purchase & Enroll',
      `You are about to purchase "${c.title}" for ${priceTokens} tokens.\n\nThis amount will be deducted from your balance (${walletTokens} tokens). Continue?`
    );
    if (!proceed) return;

    if (!hasEnough) {
      const goBuy = await confirm(
        'Insufficient balance',
        'Not enough tokens. Would you like to buy more now?'
      );
      if (goBuy) navigation.navigate('BuyTokens');
      return;
    }

    try {
      await purchaseCourseAndEnroll(courseId, priceTokens);
      navigation.navigate('CourseProgress', { courseId });
    } catch (e: any) {
      const msg: string = e?.message || '';
      if (/insufficient/i.test(msg)) {
        const go = await confirm('Insufficient balance', 'Not enough tokens. Buy more now?');
        if (go) navigation.navigate('BuyTokens');
      }
    }
  };

  const onContinue = () => {
    if (!courseId) return;
    navigation.navigate('CourseProgress', { courseId });
  };

  const onUnenroll = async () => {
    if (!myEnrollment?.id) return;
    try {
      await cancel(String(myEnrollment.id));
      debouncedReload();
    } catch {}
  };

  const onSubmitReview = useCallback(async () => {
    if (rating < 1 || !courseId) return;
    await submit(rating, comment);
    setOpenReview(false);
    setRating(0);
    setComment('');
  }, [submit, rating, comment, courseId]);

  // Mobile transcript open (only when OER + enrolled)
  const onOpenTranscript = useCallback(async () => {
    if (!oerMeta || !backendUrl || !courseId) return;
    const url = `${backendUrl.replace(/\/+$/, '')}/api/oer/transcript/${courseId}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Error', 'Could not open transcript link.');
    }
  }, [oerMeta, backendUrl, courseId]);

  // ----- Guards / content selection -----
  let body: React.ReactNode;

  if (!courseId) {
    body = <CenterMessage text="Missing course id." variant="error" />;
  } else if (loadingCourse && !c) {
    body = (
      <View style={tw`flex-1 items-center justify-center px-6`}>
        <ActivityIndicator />
        <Text style={tw`mt-2 text-[#49739c] dark:text-white/70`}>Loading course…</Text>
      </View>
    );
  } else if (courseError && !c) {
    body = <CenterMessage text="Failed to load course." variant="error" />;
  } else if (!c) {
    body = <CenterMessage text="Course not found." />;
  } else {
    const isEnrolled = Boolean(myEnrollment);
    const disablePrimary = !token || enrollmentsLoading;

    body = (
      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={[
          tw`pb-6`,
          {
            paddingTop: topPad,
            paddingBottom: bottomPad + FOOTER_OFFSET, // nothing behind footer
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Outer container to center content */}
        <View style={tw`w-full px-4`}>
          <View style={[tw`w-full`, { maxWidth: 900, alignSelf: 'center' }]}>
            {/* Header */}
            <View style={tw`flex-row items-start justify-between gap-4`}>
              {/* Left: title / meta */}
              <View style={tw`flex-1 pr-2`}>
                <Text
                  style={tw`text-xs tracking-[2px] uppercase text-pink-500/80 dark:text-pink-400`}
                >
                  DayBreak Course
                </Text>
                <Text
                  style={tw`mt-1 text-[26px] font-extrabold tracking-[-0.02em] text-slate-900 dark:text-darkTextPrimary`}
                >
                  {c.title}
                </Text>

                {!!c.description && (
                  <Text style={tw`mt-2 text-sm text-[#49739c] dark:text-darkTextSecondary`}>
                    {c.description}
                  </Text>
                )}

                {/* OER badge */}
                {oerMeta && (
                  <View style={tw`mt-2`}>
                    <Pill>
                      OER •{' '}
                      {((oerMeta as any)?.catalog_provider?.toUpperCase?.() || 'OER') as string}
                    </Pill>
                  </View>
                )}

                {/* Rating */}
                <View style={tw`mt-2`}>
                  <StarRow avg={avg} count={count} />
                </View>

                {/* Meta pills */}
                <View style={tw`mt-3 flex-row flex-wrap gap-2`}>
                  {!!c.level && <Pill>Level: {c.level}</Pill>}
                  {!!c.duration && <Pill>Duration: {c.duration}</Pill>}
                  <Pill>Price: {priceTokens} tokens</Pill>
                </View>

                {/* Balance helper */}
                <Text style={tw`mt-2 text-xs text-[#49739c] dark:text-darkTextSecondary`}>
                  Your balance: {walletTokens} tokens
                </Text>
              </View>

              {/* Right: actions column */}
              <View style={[tw`gap-2`, { width: 190 }]}>
                {role === 'tutor' ? (
                  <Pressable
                    onPress={() => navigation.navigate('Courses')}
                    style={tw`h-10 px-4 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
                  >
                    <Text style={tw`text-sm font-semibold text-slate-900 dark:text-slate-100`}>
                      Manage / Share
                    </Text>
                  </Pressable>
                ) : isEnrolled ? (
                  <>
                    <Pressable
                      onPress={onContinue}
                      style={tw`h-10 px-5 rounded-xl bg-[#3d99f5] items-center justify-center`}
                    >
                      <Text style={tw`text-sm font-semibold text-white`}>Continue Course</Text>
                    </Pressable>

                    <Pressable
                      onPress={onUnenroll}
                      style={tw`h-10 px-4 rounded-xl bg-white dark:bg-[#0f1821] items-center justify-center border border-[#cedbe8] dark:border-darkCard`}
                    >
                      <Text style={tw`text-sm font-semibold text-slate-900 dark:text-slate-100`}>
                        Unenroll
                      </Text>
                    </Pressable>

                    {/* OER transcript (when enrolled) */}
                    {oerMeta && (
                      <Pressable
                        onPress={onOpenTranscript}
                        style={tw`h-10 px-4 rounded-xl bg-white dark:bg-[#0f1821] items-center justify-center border border-[#cedbe8] dark:border-darkCard`}
                      >
                        <Text style={tw`text-sm font-semibold text-slate-900 dark:text-slate-100`}>
                          Download Transcript (Free)
                        </Text>
                      </Pressable>
                    )}

                    {/* Review button when enrolled & not yet reviewed */}
                    {!hasMyReview && (
                      <Pressable
                        onPress={() => setOpenReview(true)}
                        style={tw`h-10 px-4 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
                      >
                        <Text style={tw`text-sm font-semibold text-slate-900 dark:text-slate-100`}>
                          Review this course
                        </Text>
                      </Pressable>
                    )}
                  </>
                ) : (
                  <View style={tw`gap-2`}>
                    <Pressable
                      onPress={onPurchaseAndEnroll}
                      disabled={disablePrimary}
                      style={tw.style(
                        'h-10 px-5 rounded-xl items-center justify-center bg-[#3d99f5]',
                        disablePrimary && 'opacity-60'
                      )}
                    >
                      <Text style={tw`text-sm font-semibold text-white`}>
                        {enrollmentsLoading ? 'Checking…' : 'Purchase & Enroll'}
                      </Text>
                    </Pressable>

                    {!hasEnough && (
                      <Pressable
                        onPress={() => navigation.navigate('BuyTokens')}
                        style={tw`h-10 px-4 rounded-xl bg-white dark:bg-[#0f1821] items-center justify-center border border-[#cedbe8] dark:border-darkCard`}
                      >
                        <Text style={tw`text-sm font-semibold text-slate-900 dark:text-slate-100`}>
                          Buy Tokens
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}

                {/* Achievements quick link */}
                <Pressable
                  onPress={() => navigation.navigate('Achievements')}
                  style={tw`h-10 px-4 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
                >
                  <Text style={tw`text-sm font-semibold text-slate-900 dark:text-slate-100`}>
                    Achievements
                  </Text>
                </Pressable>

                {/* Back */}
                <Pressable
                  onPress={() => navigation.goBack()}
                  style={tw`h-10 px-4 rounded-xl bg-white dark:bg-[#0f1821] items-center justify-center border border-[#cedbe8] dark:border-darkCard`}
                >
                  <Text style={tw`text-sm font-semibold text-slate-900 dark:text-slate-100`}>
                    Back
                  </Text>
                </Pressable>

                {!!enrollError && (
                  <Text style={tw`mt-1 text-xs text-red-600 dark:text-red-400`}>
                    {String(enrollError)}
                  </Text>
                )}
              </View>
            </View>

            {/* Tutor card */}
            <View
              style={tw`mt-6 rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-4`}
            >
              <Text style={tw`text-lg font-bold mb-3 text-slate-900 dark:text-white`}>
                About the tutor
              </Text>
              <View style={tw`flex-row items-center gap-3`}>
                <View style={tw`h-12 w-12 rounded-full bg-[#e7edf4] dark:bg-[#172534]`} />
                <View style={tw`flex-1`}>
                  <Text style={tw`font-semibold text-slate-900 dark:text-white`}>{tutorName}</Text>
                  <Text style={tw`text-sm text-[#49739c] dark:text-darkTextSecondary`}>
                    {tutorBio}
                  </Text>
                </View>
              </View>
            </View>

            {/* Syllabus preview */}
            <View
              style={tw`mt-6 rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-4`}
            >
              <Text style={tw`text-lg font-bold mb-3 text-slate-900 dark:text-white`}>
                Syllabus
              </Text>
              {Array.isArray(c.syllabus) && c.syllabus.length > 0 ? (
                <View style={tw`gap-2`}>
                  {c.syllabus.slice(0, 12).map((w) => (
                    <View key={w.week} style={tw`mb-1`}>
                      <Text style={tw`font-medium text-slate-900 dark:text-white`}>
                        Week {w.week}:{' '}
                        <Text style={tw`text-slate-800 dark:text-slate-300`}>
                          {w.topic || 'TBA'}
                        </Text>
                      </Text>
                      {!!w.assignment && (
                        <Text style={tw`mt-0.5 text-xs text-[#49739c] dark:text-darkTextSecondary`}>
                          Assignment: {w.assignment}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={tw`text-sm text-[#49739c] dark:text-darkTextSecondary`}>
                  No syllabus yet.
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Review modal */}
        <Modal
          visible={openReview}
          transparent
          animationType="fade"
          onRequestClose={() => setOpenReview(false)}
        >
          <View style={tw`flex-1 bg-black/40 items-center justify-center`}>
            <View
              style={tw`w-11/12 max-w-md rounded-2xl bg-white dark:bg-[#0f1821] p-4 border border-[#cedbe8] dark:border-darkCard`}
            >
              <Text style={tw`text-lg font-bold mb-2 text-slate-900 dark:text-white`}>
                Rate this course
              </Text>
              <Text style={tw`text-sm text-[#49739c] dark:text-darkTextSecondary mb-3`}>
                {c.title}
              </Text>

              <View style={tw`flex-row items-center gap-2 mb-3`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} onPress={() => setRating(n)}>
                    <Text
                      style={tw.style(
                        'text-2xl',
                        n <= rating ? 'text-yellow-500' : 'text-[#49739c]'
                      )}
                    >
                      ★
                    </Text>
                  </Pressable>
                ))}
              </View>

              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="Optional comment (max 500 chars)"
                maxLength={500}
                multiline
                style={tw`w-full text-sm rounded-lg p-2 bg-[#e7edf4] dark:bg-[#172534] text-slate-900 dark:text-slate-100`}
                placeholderTextColor="#7a8aa0"
              />

              <View style={tw`mt-4 flex-row items-center gap-2`}>
                <Pressable
                  disabled={posting || rating < 1}
                  onPress={onSubmitReview}
                  style={tw.style(
                    'px-4 h-10 rounded-xl items-center justify-center bg-[#3d99f5]',
                    (posting || rating < 1) && 'opacity-60'
                  )}
                >
                  <Text style={tw`text-sm font-semibold text-white`}>
                    {posting ? 'Saving…' : 'Submit'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setOpenReview(false)}
                  style={tw`px-4 h-10 rounded-xl items-center justify-center bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-darkCard`}
                >
                  <Text style={tw`text-sm font-semibold text-slate-900 dark:text-slate-100`}>
                    Cancel
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`} edges={['top', 'bottom']}>
      {/* Soft background orbs */}
      <View style={tw`absolute inset-0`}>
        <View
          style={tw`absolute -top-16 -right-10 h-36 w-36 rounded-full bg-pink-500/12 dark:bg-pink-500/10`}
        />
        <View
          style={tw`absolute -bottom-24 -left-20 h-44 w-44 rounded-full bg-sky-500/10 dark:bg-sky-500/10`}
        />
      </View>

      {body}
    </SafeAreaView>
  );
};

export default CourseDetailsNative;
