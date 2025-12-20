// apps/mobile/src/screens/StudentLearningProgress.native.tsx
import React, { useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import tw from '../../tailwind';

import { useShopContext } from '@mytutorapp/shared/context';
import { useEnrollments } from '@mytutorapp/shared/hooks';
import type { Enrollment } from '@mytutorapp/shared/types';
import type { MainStackParamList } from '../navigation/types';

// ✅ Locally augment the stack with the missing route
type LocalStack = MainStackParamList & {
  CourseContinue: { courseId: string | number };
};

export default function StudentLearningProgressNative() {
  // ✅ Now navigate knows about 'CourseContinue'
  const navigation = useNavigation<NavigationProp<LocalStack>>();
  const { backendUrl, token, profile } = useShopContext();

  // studentId like elsewhere (user_id or id)
  const studentId =
    (profile as { user_id?: number | string; id?: number | string } | null)?.user_id ??
    (profile as { id?: number | string } | null)?.id;

  const { enrollments, loading, error, fetchMine } = useEnrollments({
    backendUrl,
    token: token ?? '',
    studentId: studentId as string | number | undefined,
  });

  useEffect(() => {
    if (studentId) fetchMine();
  }, [studentId, fetchMine]);

  const onContinue = useCallback(
    (courseId: string | number) => {
      navigation.navigate('CourseContinue', { courseId });
    },
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }: { item: Enrollment }) => {
      const pct = Math.max(0, Math.min(100, Number(item.progress ?? 0)));

      return (
        <View
          style={tw`flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-4 py-3`}
        >
          <View style={tw`flex-col`}>
            <Text style={tw`text-base font-semibold`}>
              {/* If your API includes course title, render it here; fallback shows the id */}
              Course #{String(item.courseId)}
            </Text>
            <Text style={tw`text-[#49739c] dark:text-darkTextSecondary text-sm`}>
              {pct}% completed
            </Text>
          </View>

          <View style={tw`sm:ml-auto w-full sm:w-auto sm:flex-row sm:items-center sm:gap-3`}>
            <View
              style={tw`w-full sm:w-[180px] overflow-hidden rounded-sm bg-[#cedbe8] dark:bg-[#0f1821`}
            >
              <View style={[tw`h-1.5 rounded-full bg-[#3d99f5]`, { width: `${pct}%` }]} />
            </View>

            <TouchableOpacity
              onPress={() => onContinue(item.courseId)}
              accessibilityRole="button"
              style={tw`mt-3 sm:mt-0 rounded-lg h-10 px-4 items-center justify-center bg-[#3d99f5]`}
            >
              <Text style={tw`text-white font-semibold`}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [onContinue]
  );

  const keyExtractor = useCallback((e: Enrollment) => String(e.id ?? `${e.courseId}`), []);

  const content = useMemo(() => {
    if (loading) {
      return (
        <View style={tw`py-4`}>
          <View style={tw`flex-row items-center gap-2`}>
            <ActivityIndicator />
            <Text style={tw`text-sm text-[#49739c]`}>Loading your progress…</Text>
          </View>
        </View>
      );
    }

    if (!loading && error) {
      return <Text style={tw`text-sm text-red-600 py-2`}>Failed to load progress.</Text>;
    }

    if (!loading && !error && enrollments.length === 0) {
      return (
        <Text style={tw`text-sm text-[#49739c] py-2`}>You haven’t enrolled in any course yet.</Text>
      );
    }

    return (
      <FlatList
        data={enrollments}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={tw`h-3`} />}
        contentContainerStyle={tw`gap-3`}
      />
    );
  }, [loading, error, enrollments, keyExtractor, renderItem]);

  return (
    <View>
      <Text style={tw`text-[20px] sm:text-[22px] font-bold tracking-[-0.015em] px-4 pb-3 pt-5`}>
        Learning progress
      </Text>
      <View style={tw`mx-4`}>{content}</View>
    </View>
  );
}
