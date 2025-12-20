// apps/mobile/src/screens/TutorCourseStatsRow.native.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useShopContext } from '@mytutorapp/shared/context';
import { useEnrollments } from '@mytutorapp/shared/hooks';
import type { Enrollment } from '@mytutorapp/shared/types';
import type { MainStackParamList } from '../navigation/types';

type Props = {
  courseId: string;
  title?: string;
  onEditPress?: (courseId: string) => void;
  onManageStudentsPress?: (courseId: string) => void;
  onViewPress?: (courseId: string) => void;
};

/** Locally extend the navigator with the routes used here */
type LocalStack = MainStackParamList & {
  EditCoursePage: { courseId: string };
  CourseDetails: { courseId: string };
  TutorCourseStudents?: { courseId: string };
  Results?: {
    courseId?: string;
    courseTitle?: string;
    grade?: { scorePct: number; passMark: number; passed: boolean };
  };
};

export default function TutorCourseStatsRow({
  courseId,
  title,
  onEditPress,
  onManageStudentsPress,
  onViewPress,
}: Props) {
  const navigation = useNavigation<NavigationProp<LocalStack>>();
  const { backendUrl, token } = useShopContext();
  const { enrollments, fetchByCourse, loading, error } = useEnrollments({
    backendUrl,
    token: token ?? '',
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchByCourse(courseId)
      .catch(() => {})
      .finally(() => mounted && setReady(true));
    return () => {
      mounted = false;
    };
  }, [courseId, fetchByCourse]);

  const avgPct = useMemo(() => {
    if (!enrollments.length) return 0;
    const sum = enrollments.reduce((acc, e: Enrollment) => acc + (Number(e.progress) || 0), 0);
    return Math.round(sum / enrollments.length);
  }, [enrollments]);

  const handleEdit = () => {
    if (onEditPress) return onEditPress(courseId);
    navigation.navigate('EditCoursePage', { courseId });
  };

  const handleManageStudents = () => {
    if (onManageStudentsPress) return onManageStudentsPress(courseId);
    // If you have a dedicated screen, prefer it:
    if ('TutorCourseStudents' in ({} as LocalStack)) {
      navigation.navigate('TutorCourseStudents', { courseId });
      return;
    }
    // Fallback to a safe route with optional params
    navigation.navigate('Results', {});
  };

  const handleView = () => {
    if (onViewPress) return onViewPress(courseId);
    navigation.navigate('CourseDetails', { courseId });
  };

  return (
    <View className="rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 pr-3">
          <Text numberOfLines={1} className="text-base font-semibold">
            {title ?? `Course #${courseId}`}
          </Text>
          <Text className="text-[#49739c] dark:text-darkTextSecondary text-sm">Quick stats</Text>
        </View>

        <Pressable
          onPress={handleEdit}
          className="rounded-lg h-8 px-3 items-center justify-center bg-[#e7edf4] dark:bg-[#172534]"
        >
          <Text className="font-semibold text-slate-900 dark:text-slate-100">Edit</Text>
        </Pressable>
      </View>

      <View className="mt-3 flex-row gap-3">
        <View className="flex-1 rounded-xl border border-[#cedbe8] dark:border-darkCard p-3">
          <Text className="text-[#49739c] dark:text-darkTextSecondary">Enrollments</Text>
          <View className="flex-row items-center mt-1">
            {loading && !ready ? (
              <ActivityIndicator />
            ) : (
              <Text className="text-lg font-bold">{enrollments.length}</Text>
            )}
          </View>
        </View>

        <View className="flex-1 rounded-xl border border-[#cedbe8] dark:border-darkCard p-3">
          <Text className="text-[#49739c] dark:text-darkTextSecondary">Avg completion</Text>
          <Text className="text-lg font-bold mt-1">{error ? '—' : `${avgPct}%`}</Text>
        </View>
      </View>

      <View className="mt-3 flex-row items-center justify-between">
        <Pressable
          onPress={handleManageStudents}
          className="rounded-lg h-8 px-3 items-center justify-center bg-[#e7edf4] dark:bg-[#172534]"
        >
          <Text className="font-semibold text-slate-900 dark:text-slate-100">Manage students</Text>
        </Pressable>

        <Pressable
          onPress={handleView}
          className="rounded-lg h-8 px-3 items-center justify-center bg-[#3d99f5]"
        >
          <Text className="font-semibold text-white">View</Text>
        </Pressable>
      </View>
    </View>
  );
}
