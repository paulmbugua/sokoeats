/* eslint-disable prettier/prettier */
import React, { useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import tw from '../../tailwind';

import { useShopContext } from '@mytutorapp/shared/context';
import { useEnrollments } from '@mytutorapp/shared/hooks/useEnrollments';
import { useCourses } from '@mytutorapp/shared/hooks';
import type { Course } from '@mytutorapp/shared/types';

type RouteParams = { courseId?: string | number; course?: Course };

/** Helper to coerce price into whole tokens */
function toTokens(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : 0;
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

const CourseEnrollmentNative: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { backendUrl, token, role, tokens: walletTokens = 0 } = useShopContext();

  // Params (allow passing a preloaded course too)
  const { courseId: routeCourseId, course: preloadedCourse } = (route?.params || {}) as RouteParams;
  const courseId = String(routeCourseId ?? '');

  // 🔒 Gate: must be logged in + student role
  useEffect(() => {
    if (!token) {
      // Push to Login; optionally pass next screen intent
      navigation.navigate('Login', { next: 'CourseEnrollment', params: { courseId } });
    }
  }, [token, navigation, courseId]);

  useEffect(() => {
    if (token && role && role !== 'student') {
      // Non-students back to Home (or any safe screen)
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    }
  }, [token, role, navigation]);

  // Enrollments API (use "me" so backend resolves from JWT)
  const { purchaseCourseAndEnroll, fetchMine, enrollments, loading, error } = useEnrollments({
    backendUrl,
    token,
    studentId: 'me' as unknown as string | number,
  });

  // Course fetcher (only if not passed in params)
  const {
    selectedCourse,
    loading: loadingCourse,
    error: courseError,
    fetchCourseById,
  } = useCourses({ backendUrl, token });

  useEffect(() => {
    if (!preloadedCourse && courseId) {
      void fetchCourseById(courseId);
    }
  }, [preloadedCourse, courseId, fetchCourseById]);

  // keep enrollments fresh
  useEffect(() => {
    if (token) void fetchMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, courseId]);

  const c: Course | undefined = preloadedCourse ?? selectedCourse ?? undefined;

  const alreadyEnrolled = useMemo(() => {
    if (!courseId) return false;
    return enrollments.some((e: any) => String(e.course_id ?? e.courseId) === String(courseId));
  }, [enrollments, courseId]);

  const priceTokens = useMemo(() => toTokens(c?.price), [c?.price]);
  const hasEnough = walletTokens >= priceTokens;

  const confirm = (title: string, message: string): Promise<boolean> =>
    new Promise((resolve) => {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'OK', onPress: () => resolve(true) },
      ]);
    });

  const handlePurchase = useCallback(async () => {
    if (!courseId || !c) return;

    const proceed = await confirm(
      'Confirm Purchase',
      `You are about to purchase "${c.title}" for ${priceTokens} tokens.\n\n` +
        `This amount will be deducted from your balance (${walletTokens} tokens). Continue?`
    );
    if (!proceed) return;

    if (!hasEnough) {
      const buy = await confirm('Insufficient tokens', 'Not enough tokens. Buy more now?');
      if (buy) navigation.navigate('BuyTokens');
      return;
    }

    try {
      await purchaseCourseAndEnroll(courseId, priceTokens);
      // Navigate to your progress screen (adjust route name if different)
      navigation.replace('CourseProgress', { courseId });
    } catch (e: any) {
      const msg: string = e?.message || '';
      if (/insufficient/i.test(msg)) {
        const buy = await confirm('Insufficient tokens', 'Not enough tokens. Buy more now?');
        if (buy) navigation.navigate('BuyTokens');
      }
      // Remaining errors shown below
    }
  }, [courseId, c, priceTokens, walletTokens, hasEnough, navigation, purchaseCourseAndEnroll]);

  /* ----------------------- Render states ----------------------- */
  if (!courseId) {
    return (
      <View style={tw`flex-1 items-center justify-center p-6`}>
        <Text style={tw`text-red-600`}>Missing course id.</Text>
      </View>
    );
  }

  if (loadingCourse && !c) {
    return (
      <View style={tw`flex-1 items-center justify-center p-6`}>
        <ActivityIndicator />
        <Text style={tw`mt-3 text-mutedGray`}>Loading course…</Text>
      </View>
    );
  }

  if (courseError && !c) {
    return (
      <View style={tw`flex-1 items-center justify-center p-6`}>
        <Text style={tw`text-red-600`}>Failed to load course.</Text>
      </View>
    );
  }

  if (!c) {
    return (
      <View style={tw`flex-1 items-center justify-center p-6`}>
        <Text style={tw`text-mutedGray`}>Course not found.</Text>
      </View>
    );
  }

  /* --------------------------- Main --------------------------- */
  return (
    <ScrollView style={tw`flex-1 bg-softGray`} contentContainerStyle={tw`p-4`}>
      <View style={tw`rounded-2xl bg-white p-6 shadow-soft`}>
        <Text style={tw`text-2xl font-bold text-darkText mb-2`}>{c.title}</Text>

        {!!c.description && <Text style={tw`text-darkText mb-4`}>{c.description}</Text>}

        <View style={tw`flex-row flex-wrap gap-3 mb-4`}>
          {!!c.level && <Text style={tw`text-mutedGray text-sm`}>Level: {c.level}</Text>}
          {!!c.duration && <Text style={tw`text-mutedGray text-sm`}>Duration: {c.duration}</Text>}
        </View>

        {/* Price + balance */}
        <View style={tw`mb-4`}>
          <Text style={tw`font-semibold text-darkText`}>Price: {priceTokens} tokens</Text>
          <Text style={tw`text-mutedGray text-xs`}>Your balance: {walletTokens} tokens</Text>
        </View>

        {alreadyEnrolled ? (
          <TouchableOpacity
            onPress={() => navigation.navigate('CourseProgress', { courseId })}
            style={tw`h-10 px-4 rounded-xl bg-softGray items-center justify-center`}
          >
            <Text style={tw`text-darkText font-semibold text-sm`}>Go to Course</Text>
          </TouchableOpacity>
        ) : (
          <View style={tw`flex-row items-center`}>
            <TouchableOpacity
              onPress={handlePurchase}
              disabled={loading}
              style={tw.style(
                'h-10 px-4 rounded-xl items-center justify-center bg-[#3d99f5]',
                loading && 'opacity-60'
              )}
            >
              <Text style={tw`text-white font-semibold text-sm`}>
                {loading ? 'Purchasing…' : 'Purchase & Enroll'}
              </Text>
            </TouchableOpacity>

            {!hasEnough && (
              <TouchableOpacity
                onPress={() => navigation.navigate('BuyTokens')}
                style={tw`ml-3 h-10 px-4 rounded-xl items-center justify-center bg-white border border-[#cedbe8]`}
              >
                <Text style={tw`text-darkText font-semibold text-sm`}>Buy Tokens</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {!!error && <Text style={tw`text-red-600 mt-4 text-sm`}>{String(error)}</Text>}

        {/* Syllabus preview */}
        {Array.isArray(c.syllabus) && c.syllabus.length > 0 && (
          <View style={tw`mt-8`}>
            <Text style={tw`text-xl font-semibold mb-2 text-darkText`}>Syllabus</Text>
            {c.syllabus.map((s: any) => (
              <View key={String(s.week)} style={tw`mb-1`}>
                <Text style={tw`text-darkText`}>
                  <Text style={tw`font-semibold`}>Week {s.week}:</Text> {s.topic}{' '}
                  {!!s.assignment && <Text>- {s.assignment}</Text>}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
};

export default CourseEnrollmentNative;
