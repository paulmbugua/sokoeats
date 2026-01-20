// apps/mobile/src/pages/MyEnrollments.native.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import tw from '../../tailwind';
import { useShopContext } from '@mytutorapp/shared/context';
import { useEnrollments } from '@mytutorapp/shared/hooks';
import type { Enrollment } from '@mytutorapp/shared/types';
import type { MainStackParamList } from '../navigation/types';

type NormalizedEnrollment = {
  id: string;
  courseId: string;
  title: string;
  description: string;
  level: string;
  startedAt: string | null;
  status: string;
  progress: number;
};

function normalizeEnrollment(row: unknown): NormalizedEnrollment {
  const o = (row ?? {}) as Record<string, unknown>;
  const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
  const num = (v: unknown, fallback = 0): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;

  const id = str(o.id) || String(o.id ?? '');
  const courseId = str(o['courseId']) || str(o['course_id']);
  const title = str(o['title']) || str(o['courseTitle']) || 'Course';
  const description = str(o['description']);
  const level = str(o['level']) || 'All levels';
  const startedAt = str(o['started_at']) || str(o['enrolled_at']) || str(o['startedAt']) || null;
  const status = str(o['status']) || 'active';
  const progress = num(o['progress']);

  return { id, courseId, title, description, level, startedAt, status, progress };
}

const MyEnrollmentsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const { backendUrl, token, profile, role: ctxRole } = useShopContext();

  const [deleting, setDeleting] = useState<string | null>(null);

  const goHome = () => navigation.navigate('Home');
  const goCourses = () => navigation.navigate('Resources', { tab: 'courses' });
  const goCourse = (courseId: string) => navigation.navigate('CourseDetails', { courseId });
  const goLogin = () => navigation.navigate('Login');
  const goCreateCourse = () => navigation.navigate('CreateCourse');

  // Prefer profile.role (source of truth), fallback to ctxRole
  const rawRole = (profile as any)?.role ?? ctxRole ?? '';
  const roleStr = String(rawRole || '').toLowerCase();

  console.log('[MyEnrollments] token?', !!token);
  console.log(
    '[MyEnrollments] profile.role:',
    (profile as any)?.role,
    'ctxRole:',
    ctxRole,
    'roleStr:',
    roleStr
  );

  // Student-only: enrollments hook
  const { enrollments, loading, error, setError, fetchMine, cancel, setEnrollments } =
    useEnrollments({
      backendUrl,
      token,
      studentId: 'me' as unknown as string | number,
    });

  // Fetch enrollments only when we *know* this is a student
  useEffect(() => {
    if (!token) {
      console.log('[MyEnrollments] Skipping fetchMine: no token');
      return;
    }
    if (roleStr !== 'student') {
      console.log('[MyEnrollments] Skipping fetchMine: role is not student ->', roleStr);
      return;
    }

    console.log('[MyEnrollments] Calling fetchMine() for student "me"');
    fetchMine().catch((err) => {
      console.log('[MyEnrollments] fetchMine error:', err);
    });
  }, [token, roleStr, fetchMine]);

  // Tutors: redirect away from MyEnrollments
  useEffect(() => {
    if (!token) return;
    if (roleStr !== 'tutor') return;

    console.log('[MyEnrollments] Tutor role detected; redirecting to CreateCourse…');
    try {
      goCreateCourse();
    } catch (err) {
      console.log('[MyEnrollments] Redirect to CreateCourse failed; going Home. Error:', err);
      goHome();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, roleStr]);

  // ── Auth & role gates ──────────────────────────────────────────────────────

  // Not logged in → prompt user to log in
  if (!token) {
    return (
      <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
        <View style={tw`flex-1 items-center justify-center px-6`}>
          <Text style={tw`text-xl font-semibold text-[#0d141c] dark:text-white`}>
            Please sign in
          </Text>
          <Text style={tw`text-sm text-[#49739c] dark:text-white/70 mt-2 text-center`}>
            You need to be logged in to view your enrollments.
          </Text>
          <Pressable
            onPress={goLogin}
            style={tw`mt-4 rounded-xl h-10 px-4 bg-[#3d99f5] items-center justify-center`}
          >
            <Text style={tw`text-white font-semibold text-sm`}>Go to Login</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Tutor → we already trigger redirect in useEffect, but show placeholder meanwhile
  if (roleStr === 'tutor') {
    return (
      <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
        <View style={tw`flex-1 items-center justify-center px-6`}>
          <ActivityIndicator />
          <Text style={tw`mt-2 text-sm text-[#49739c] dark:text-white/70`}>Redirecting…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Explicit non-student role (admin, orgOwner, etc.) → access denied
  if (roleStr && roleStr !== 'student') {
    console.log('[MyEnrollments] Non-student role; access denied:', roleStr);
    return (
      <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
        <View style={tw`flex-1 items-center justify-center px-6`}>
          <Text style={tw`text-xl font-semibold text-[#0d141c] dark:text-gray-100`}>
            Access denied
          </Text>
          <Text style={tw`text-sm text-[#64748b] dark:text-gray-400 mt-2 text-center`}>
            This page is only available to student accounts.
          </Text>
          <Pressable
            onPress={goHome}
            style={tw`mt-4 rounded-xl h-10 px-4 bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
          >
            <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>
              Go back home
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // NOTE:
  // If roleStr is '' here, we just fall through and behave like a "student view
  // with maybe-empty enrollments" instead of getting stuck on "Checking your account…"

  const handleUnenroll = async (enrollmentId: string) => {
    console.log('[MyEnrollments] Unenroll pressed for id:', enrollmentId);

    setDeleting(enrollmentId);
    try {
      setEnrollments((prev) =>
        prev.filter((e) => String((e as Enrollment).id) !== String(enrollmentId))
      );
      await cancel(enrollmentId);
      console.log('[MyEnrollments] Successfully unenrolled from', enrollmentId);
    } catch (err) {
      console.log('[MyEnrollments] Failed to unenroll, refetching. Error:', err);
      await fetchMine().catch((e) =>
        console.log('[MyEnrollments] fetchMine after unenroll failed:', e)
      );
      setError('Failed to unenroll. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
      <ScrollView
        contentContainerStyle={tw`flex-grow px-4 py-6 pb-10`}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={tw`flex-row items-center justify-between mb-4`}>
          <Text style={tw`text-[28px] font-extrabold text-[#0d141c] dark:text-white`}>
            My Enrollments
          </Text>
          <Pressable
            onPress={goCourses}
            style={tw`rounded-xl h-10 px-4 bg-[#3d99f5] items-center justify-center`}
          >
            <Text style={tw`text-white text-sm font-semibold`}>Explore courses</Text>
          </Pressable>
        </View>

        {/* States */}
        {loading && (
          <View style={tw`flex-row items-center mb-3`}>
            <ActivityIndicator />
            <Text style={tw`ml-2 text-sm text-[#49739c] dark:text-white/70`}>
              Loading your enrollments…
            </Text>
          </View>
        )}

        {!loading && !!error && (
          <Text style={tw`text-sm text-red-600 dark:text-red-400 mb-3`}>{String(error)}</Text>
        )}

        {!loading && !error && enrollments.length === 0 && (
          <View
            style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`}
          >
            <Text style={tw`text-base text-[#0d141c] dark:text-white`}>
              You have no enrollments yet.
            </Text>
            <Text style={tw`text-sm text-[#49739c] dark:text-white/70 mt-1`}>
              Browse the catalog to get started.
            </Text>
            <Pressable
              onPress={goCourses}
              style={tw`mt-4 rounded-xl h-10 px-4 bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
            >
              <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>
                Go to Catalog
              </Text>
            </Pressable>
          </View>
        )}

        {/* List */}
        {!loading && !error && enrollments.length > 0 && (
          <View style={tw`mt-2 flex flex-col gap-4`}>
            {enrollments.map((row) => {
              const n = normalizeEnrollment(row);
              const pct = Math.max(0, Math.min(100, Number(n.progress ?? 0)));

              return (
                <View
                  key={n.id}
                  style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`}
                >
                  <View style={tw`flex-row items-start justify-between`}>
                    <View style={tw`flex-1 pr-3`}>
                      <Text
                        numberOfLines={1}
                        style={tw`text-base font-semibold text-[#0d141c] dark:text-white`}
                      >
                        {n.title}
                      </Text>
                      {!!n.description && (
                        <Text
                          numberOfLines={2}
                          style={tw`text-sm text-[#49739c] dark:text-white/70 mt-0.5`}
                        >
                          {n.description}
                        </Text>
                      )}
                    </View>
                    <View style={tw`px-2 py-1 rounded-lg bg-[#e7edf4] dark:bg-[#172534]`}>
                      <Text style={tw`text-xs text-[#0d141c] dark:text-white`}>{n.status}</Text>
                    </View>
                  </View>

                  {/* Progress */}
                  <View style={tw`flex-row items-center mt-3`}>
                    <View
                      style={tw`flex-1 h-1.5 rounded bg-[#cedbe8] dark:bg-white/10 overflow-hidden`}
                    >
                      <View style={[tw`h-1.5 rounded bg-[#3d99f5]` as any, { width: `${pct}%` }]} />
                    </View>
                    <Text style={tw`ml-3 text-xs font-medium text-[#0d141c] dark:text-white`}>
                      {pct}%
                    </Text>
                  </View>

                  <Text style={tw`text-xs text-[#49739c] dark:text-white/70 mt-2`}>
                    {n.startedAt ? `Started: ${new Date(n.startedAt).toLocaleDateString()}` : '—'}
                  </Text>

                  {/* Actions */}
                  <View style={tw`flex-row items-center gap-2 mt-3`}>
                    <Pressable
                      onPress={() => goCourse(n.courseId)}
                      style={tw`rounded-xl h-9 px-3 bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
                    >
                      <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>
                        View course
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => handleUnenroll(String(n.id))}
                      disabled={deleting === String(n.id)}
                      style={tw`rounded-xl h-9 px-3 items-center justify-center bg-red-50 dark:bg-[#2a0d11] ${
                        deleting === String(n.id) ? 'opacity-60' : ''
                      }`}
                    >
                      <Text style={tw`text-sm font-semibold text-red-600 dark:text-red-400`}>
                        {deleting === String(n.id) ? 'Removing…' : 'Unenroll'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default MyEnrollmentsScreen;
