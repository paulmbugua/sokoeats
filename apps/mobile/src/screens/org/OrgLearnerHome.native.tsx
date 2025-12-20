/* eslint-disable prettier/prettier */
/* eslint-disable react-hooks/exhaustive-deps */

import React, { useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import tw from '../../../tailwind';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { useThemePref } from '../../theme/ThemeContext';

/* ------------------------------------------------------------------ */
/* Types – mirror web URL params using route params                   */
/* ------------------------------------------------------------------ */

type OrgLearnerHomeParams = {
  // learner hint from QR / login link
  studentId?: string | number;
  student_id?: string | number;

  // subject hints
  subject?: string;
  subjectKey?: string;
  subject_key?: string;
};

type ParamList = {
  OrgLearnerHome: OrgLearnerHomeParams | undefined;
};

/* ------------------------------------------------------------------ */
/* Theming helper (same as your original palette)                     */
/* ------------------------------------------------------------------ */

function usePalette() {
  const { resolvedScheme } = useThemePref();
  const isDark = resolvedScheme === 'dark';
  return {
    isDark,
    bg: isDark ? '#020617' : '#f8fafc', // slate-950 vs slate-50
    card: isDark ? '#0b1016' : '#ffffff',
    softCard: isDark ? '#050816' : '#ffffff',
    border: isDark ? 'rgba(148,163,184,0.28)' : '#cedbe8',
    divider: isDark ? 'rgba(15,23,42,1)' : '#e7edf4',
    text: isDark ? '#e5f0ff' : '#0d141c',
    textMuted: isDark ? 'rgba(148,163,184,0.95)' : '#49739c',
    textSubtle: isDark ? 'rgba(148,163,184,0.85)' : 'rgba(73,115,156,0.75)',
    chipBg: (_c: string) => (isDark ? `${_c}24` : '#e7edf4'),
    chipDot: (c: string) => c,
    surface(style?: any) {
      return [
        tw`rounded-3xl p-4`,
        {
          backgroundColor: this.card,
          borderColor: this.border,
          borderWidth: 1,
        },
        style,
      ];
    },
    smallSurface(style?: any) {
      return [
        tw`rounded-2xl p-3`,
        {
          backgroundColor: this.card,
          borderColor: this.border,
          borderWidth: 1,
        },
        style,
      ];
    },
    softSurface(style?: any) {
      return [
        tw`rounded-3xl p-4`,
        {
          backgroundColor: this.softCard,
          borderColor: this.border,
          borderWidth: 1,
        },
        style,
      ];
    },
  };
}

/* ------------------------------------------------------------------ */
/* Screen                                                             */
/* ------------------------------------------------------------------ */

const OrgLearnerHomeNative: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ParamList, 'OrgLearnerHome'>>();
  const params = (route.params ?? {}) as OrgLearnerHomeParams;

  const palette = usePalette();

  const { org, role, currentUser } = (useOrg?.() ?? {}) as any;

  // Shop context – mirror web version
  const {
    orgLogout,
    userId: ctxUserId,
    user: shopUser,
    orgLearner: ctxOrgLearner,
    orgUser: ctxOrgUser,
  } = useShopContext() as any;

  /* ------------------------------------------------------------------ */
  /* URL-style params (studentId, subject, etc.)                        */
  /* ------------------------------------------------------------------ */

  const rawStudentIdParam = useMemo(() => {
    const v =
      params.studentId != null
        ? String(params.studentId)
        : params.student_id != null
          ? String(params.student_id)
          : '';
    return v.trim();
  }, [params.studentId, params.student_id]);

  const subjectParam = useMemo(() => {
    const v = params.subject ?? params.subjectKey ?? params.subject_key ?? '';
    return v ?? '';
  }, [params.subject, params.subjectKey, params.subject_key]);

  const orgName: string = org?.name || org?.org_name || 'Your Institution';

  const planLabel: string = org?.tier ? String(org.tier).toUpperCase() : 'STARTER';

  const portalLabel: string = role ? `${String(role).toUpperCase()} PORTAL` : 'LEARNER PORTAL';

  /* ------------------------------------------------------------------ */
  /* Learner identity – same precedence as web component                */
  /* ------------------------------------------------------------------ */

  const learnerProfileFromOrg =
    (currentUser as any)?.org_learner_profile ||
    (currentUser as any)?.orgLearnerProfile ||
    (currentUser as any)?.org_learner_profiles?.[0] ||
    null;

  const learnerProfileFromShop =
    (shopUser as any)?.org_learner_profile ||
    (shopUser as any)?.orgLearnerProfile ||
    (shopUser as any)?.org_learner_profiles?.[0] ||
    null;

  // ✅ Canonical learner object
  const learner: any =
    learnerProfileFromOrg ||
    learnerProfileFromShop ||
    ctxOrgLearner ||
    ctxOrgUser ||
    shopUser ||
    currentUser ||
    null;

  // Canonical learner user id (exam sheets student_user_id)
  const learnerUserId: number | string | null =
    learner?.user_id ??
    learner?.student_user_id ??
    learner?.userId ??
    learner?.id ??
    ctxUserId ??
    shopUser?.id ??
    shopUser?.user_id ??
    shopUser?.userId ??
    null;

  // ✅ Canonical learner studentId
  const learnerStudentId: string =
    rawStudentIdParam && rawStudentIdParam.trim() !== ''
      ? rawStudentIdParam.trim()
      : learnerUserId != null
        ? String(learnerUserId)
        : '';

  // Optional: treat "no learner" + no param as loading
  const isLoading = !learner && !rawStudentIdParam;

  /* ------------------------------------------------------------------ */
  /* Derived display fields (same as web)                               */
  /* ------------------------------------------------------------------ */

  const learnerName: string =
    learner?.name || learner?.full_name || learner?.fullName || learner?.email || 'Learner';

  const learnerEmail: string =
    learner?.email || learner?.email_address || learner?.guardian_email || '';

  const learnerGrade: string | null =
    learner?.class_label || learner?.classLabel || learner?.grade || null;

  const learnerSubject: string | null =
    (subjectParam && subjectParam.trim() !== '' ? subjectParam.trim() : null) ||
    learner?.subject ||
    learner?.subject_name ||
    learner?.subject_label ||
    null;

  const admissionCode: string | null = learner?.admission_code || learner?.admissionCode || null;

  const learnerPhotoFromProfile: string | null =
    (learnerProfileFromOrg &&
      (learnerProfileFromOrg.photo_url || learnerProfileFromOrg.photoUrl)) ||
    (learnerProfileFromShop &&
      (learnerProfileFromShop.photo_url || learnerProfileFromShop.photoUrl)) ||
    null;

  const learnerPhoto: string | null =
    learnerPhotoFromProfile || learner?.photo_url || learner?.photoUrl || null;

  const learnerInitial = (learnerName || 'L').trim().charAt(0).toUpperCase();

  /* ------------------------------------------------------------------ */
  /* Logout – same behaviour as web (clear org + go to org login)       */
  /* ------------------------------------------------------------------ */

  const handleLogout = useCallback(async () => {
    if (orgLogout) {
      await orgLogout();
    }
    navigation.replace('InstitutionLogin', { logoutOrg: true });
  }, [orgLogout, navigation]);

  /* ------------------------------------------------------------------ */
  /* Navigation params (mirror web hrefs, but via native routes)        */
  /* ------------------------------------------------------------------ */

  // Exams learner view (use studentId when available)
  const examsParams: any = {
    view: 'learner',
  };
  if (learnerStudentId) {
    examsParams.studentId = learnerStudentId;
  }

  // Courses – learner-aware filters
  const courseNavParams: any = {
    view: 'learner',
  };
  if (learnerStudentId) courseNavParams.studentId = learnerStudentId;
  if (learnerGrade) courseNavParams.class = learnerGrade;
  if (learnerSubject) courseNavParams.subject = learnerSubject;

  // Assignments – learner-only view (legacy/file assignments)
  const assignNavParams: any = {
    view: 'learner',
    tab: 'assign',
  };
  if (learnerStudentId) assignNavParams.studentId = learnerStudentId;
  if (learnerGrade) assignNavParams.class = learnerGrade;
  if (learnerSubject) assignNavParams.subject = learnerSubject;

  // Results & certificates (Robot Tutor + legacy overview)
  const resultsNavParams: any = {};
  if (learnerStudentId) resultsNavParams.studentId = learnerStudentId;

  /* ------------------------------------------------------------------ */
  /* Logs – same as web component                                      */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    console.log('[OrgLearnerHomeNative] learner ids', {
      rawStudentIdParam,
      learnerUserId,
      learnerStudentId,
      hasProfile: !!learner,
      learner,
      orgCurrentUser: currentUser,
      shopUser,
      ctxOrgLearner,
      ctxOrgUser,
      ctxUserId: ctxUserId ?? null,
    });
  }, [
    rawStudentIdParam,
    learnerUserId,
    learnerStudentId,
    learner,
    currentUser,
    shopUser,
    ctxOrgLearner,
    ctxOrgUser,
    ctxUserId,
  ]);

  useEffect(() => {
    console.log('[OrgLearnerHomeNative] navigation + filters', {
      learnerStudentId,
      learnerUserId,
      learnerGrade,
      learnerSubject,
      examsParams,
      courseNavParams,
      assignNavParams,
      resultsNavParams,
    });
  }, [
    learnerStudentId,
    learnerUserId,
    learnerGrade,
    learnerSubject,
    examsParams,
    courseNavParams,
    assignNavParams,
    resultsNavParams,
  ]);

  /* ------------------------------------------------------------------ */
  /* Loading view – theme aware, text matches web copy                  */
  /* ------------------------------------------------------------------ */

  if (isLoading) {
    return (
      <SafeAreaView
        style={[tw`flex-1 items-center justify-center`, { backgroundColor: palette.bg }]}
      >
        <View style={palette.softSurface(tw`w-full max-w-xs`)}>
          <Text
            style={[
              tw`text-[11px] uppercase tracking-[1.6px] text-center`,
              { color: palette.textSubtle },
            ]}
          >
            LEARNER PORTAL
          </Text>
          <Text style={[tw`mt-2 text-lg font-semibold text-center`, { color: palette.text }]}>
            Preparing your learner dashboard…
          </Text>
          <Text style={[tw`mt-2 text-xs text-center`, { color: palette.textMuted }]}>
            Please wait a moment while we load your institution profile and learner account.
          </Text>

          <View style={tw`mt-4 flex-row justify-center items-center`}>
            <ActivityIndicator color={palette.text} />
            <Text style={[tw`ml-2 text-[11px]`, { color: palette.textSubtle }]}>Loading…</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Main render – sections mirror OrgLearnerHome.web.tsx               */
  /* ------------------------------------------------------------------ */

  return (
    <SafeAreaView style={[tw`flex-1`, { backgroundColor: palette.bg }]}>
      <ScrollView contentContainerStyle={tw`px-4 py-6 pb-10`} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={palette.surface(tw`flex-row items-center justify-between gap-3`)}>
          <View style={tw`flex-1 min-w-0`}>
            <Text
              style={[tw`text-[11px] uppercase tracking-[1.6px]`, { color: palette.textSubtle }]}
              numberOfLines={1}
            >
              {portalLabel}
            </Text>
            <Text style={[tw`mt-0.5 text-xl font-bold`, { color: palette.text }]} numberOfLines={1}>
              {orgName}
            </Text>
            <Text style={[tw`mt-0.5 text-xs`, { color: palette.textMuted }]}>{planLabel} plan</Text>
          </View>

          <View style={tw`items-end`}>
            <TouchableOpacity
              onPress={handleLogout}
              accessibilityRole="button"
              accessibilityLabel="Sign out from this learner portal"
              style={[
                tw`px-3 py-1.5 rounded-full`,
                {
                  borderWidth: 1,
                  borderColor: palette.border,
                  backgroundColor: palette.softCard,
                },
              ]}
            >
              <Text style={[tw`text-[11px] font-medium`, { color: palette.text }]}>
                Not you? <Text style={tw`font-semibold`}>Sign out</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Learner identity */}
        <View style={palette.surface(tw`mt-4`)}>
          <View style={tw`flex-row items-center gap-3`}>
            {/* Avatar */}
            <View
              style={[
                tw`h-12 w-12 rounded-full items-center justify-center overflow-hidden`,
                {
                  backgroundColor: palette.divider,
                },
              ]}
            >
              {learnerPhoto ? (
                <Image
                  source={{ uri: learnerPhoto }}
                  style={tw`h-full w-full`}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <Text style={[tw`text-lg font-bold`, { color: palette.text }]}>
                  {learnerInitial}
                </Text>
              )}
            </View>

            {/* Details */}
            <View style={tw`flex-1 min-w-0`}>
              <Text
                style={[tw`text-[11px] uppercase tracking-[1.6px]`, { color: palette.textSubtle }]}
              >
                Signed in learner
              </Text>

              <View style={tw`mt-0.5 flex-row flex-wrap items-center gap-2`}>
                <Text
                  style={[tw`text-base font-semibold`, { color: palette.text }]}
                  numberOfLines={1}
                >
                  {learnerName}
                </Text>

                {learnerGrade && (
                  <View
                    style={[
                      tw`px-2 py-0.5 rounded-full`,
                      {
                        backgroundColor: palette.chipBg('#22c55e'),
                        borderWidth: 1,
                        borderColor: palette.isDark ? 'rgba(74,222,128,0.3)' : '#22c55e',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        tw`text-[11px]`,
                        {
                          color: palette.isDark ? '#bbf7d0' : '#166534',
                        },
                      ]}
                    >
                      Grade / Class: {learnerGrade}
                    </Text>
                  </View>
                )}

                {learnerSubject && (
                  <View
                    style={[
                      tw`px-2 py-0.5 rounded-full`,
                      {
                        backgroundColor: palette.chipBg('#0ea5e9'),
                        borderWidth: 1,
                        borderColor: palette.isDark ? 'rgba(56,189,248,0.3)' : '#0ea5e9',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        tw`text-[11px]`,
                        {
                          color: palette.isDark ? '#bae6fd' : '#075985',
                        },
                      ]}
                    >
                      Subject focus: {learnerSubject}
                    </Text>
                  </View>
                )}
              </View>

              <View style={tw`mt-2`}>
                <View style={tw`flex-row flex-wrap gap-1 items-baseline`}>
                  <Text style={[tw`text-[11px]`, { color: palette.textSubtle }]}>📧 Email:</Text>
                  <Text style={[tw`text-[11px] font-mono`, { color: palette.text }]}>
                    {learnerEmail || 'No email on file yet – ask your teacher to update it.'}
                  </Text>
                </View>

                {admissionCode && (
                  <View style={tw`mt-1 flex-row flex-wrap gap-1 items-baseline`}>
                    <Text style={[tw`text-[11px]`, { color: palette.textSubtle }]}>
                      🆔 Admission No:
                    </Text>
                    <Text style={[tw`text-[11px] font-mono`, { color: palette.text }]}>
                      {admissionCode}
                    </Text>
                  </View>
                )}

                <Text style={[tw`mt-1 text-[11px]`, { color: palette.textSubtle }]}>
                  If this name or grade doesn&apos;t look correct, sign out and ask your teacher to
                  confirm your login card.
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Exam results & report cards */}
        <View style={palette.surface(tw`mt-4`)}>
          <View style={tw`flex-col gap-3 md:flex-row md:items-center md:justify-between`}>
            <View style={tw`flex-1`}>
              <Text style={[tw`text-lg font-semibold`, { color: palette.text }]}>
                Exam results &amp; report cards
              </Text>
              <Text style={[tw`mt-1 text-xs`, { color: palette.textMuted }]}>
                View your official institution exam marks and download report cards as PDF for each
                term or exam session.
              </Text>
            </View>

            {/* 🔐 learner-only mode with studentId when available */}
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('OrgExamResultsPortal', {
                  view: 'learner',
                  ...(learnerStudentId ? { studentId: learnerStudentId } : {}),
                })
              }
              accessibilityRole="button"
              accessibilityLabel="Open my exam results"
              style={[
                tw`mt-2 px-4 py-2 rounded-2xl flex-row items-center justify-center`,
                {
                  backgroundColor: '#0284c7', // sky-600
                },
              ]}
            >
              <Text style={[tw`text-sm font-semibold`, { color: '#ffffff' }]}>
                📄 Open my results
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[tw`mt-2 text-[11px]`, { color: palette.textSubtle }]}>
            Results are powered by your institution&apos;s DayBreak exams workspace. You can save or
            print the downloaded report cards.
          </Text>
        </View>

        {/* Learning tools */}
        <View style={palette.surface(tw`mt-4`)}>
          <Text style={[tw`text-base font-semibold mb-2`, { color: palette.text }]}>
            Learning tools
          </Text>

          <View style={tw`gap-3`}>
            {/* Assignments – legacy/file-based only */}
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('OrgElearnPortal', {
                  ...assignNavParams,
                  from: 'learner',
                })
              }
              accessibilityRole="button"
              accessibilityLabel="Open assignments"
              style={[
                tw`rounded-2xl px-3 py-3`,
                {
                  borderWidth: 1,
                  borderColor: palette.border,
                  backgroundColor: palette.softCard,
                },
              ]}
            >
              <View style={tw`flex-row items-center justify-between gap-2`}>
                <Text style={[tw`text-sm font-semibold`, { color: palette.text }]}>
                  Assignments (files)
                </Text>
                <Text style={[tw`text-[11px]`, { color: palette.isDark ? '#c7d2fe' : '#4f46e5' }]}>
                  Open →
                </Text>
              </View>
              <Text style={[tw`mt-1 text-xs`, { color: palette.textMuted }]}>
                See only file-based assignments (PDFs, docs, images) that your teachers have shared
                with you using the classic / legacy flow.
              </Text>
            </TouchableOpacity>

            {/* Results & certificates */}
            <TouchableOpacity
              onPress={() => navigation.navigate('Results', resultsNavParams)}
              accessibilityRole="button"
              accessibilityLabel="Open results and certificates"
              style={[
                tw`rounded-2xl px-3 py-3`,
                {
                  borderWidth: 1,
                  borderColor: palette.border,
                  backgroundColor: palette.softCard,
                },
              ]}
            >
              <View style={tw`flex-row items-center justify-between gap-2`}>
                <Text style={[tw`text-sm font-semibold`, { color: palette.text }]}>
                  Results &amp; certificates
                </Text>
                <Text style={[tw`text-[11px]`, { color: palette.isDark ? '#c7d2fe' : '#4f46e5' }]}>
                  View →
                </Text>
              </View>
              <Text style={[tw`mt-1 text-xs`, { color: palette.textMuted }]}>
                Check your quiz results from Robot Tutor and legacy exams. Certificates are
                currently available for Robot Tutor quizzes only.
              </Text>
            </TouchableOpacity>

            {/* Course library – learner-aware */}
            <TouchableOpacity
              onPress={() => navigation.navigate('Courses', courseNavParams)}
              accessibilityRole="button"
              accessibilityLabel="Open course library"
              style={[
                tw`rounded-2xl px-3 py-3`,
                {
                  borderWidth: 1,
                  borderColor: palette.border,
                  backgroundColor: palette.softCard,
                },
              ]}
            >
              <View style={tw`flex-row items-center justify-between gap-2`}>
                <Text style={[tw`text-sm font-semibold`, { color: palette.text }]}>
                  Course library
                </Text>
                <Text style={[tw`text-[11px]`, { color: palette.isDark ? '#c7d2fe' : '#4f46e5' }]}>
                  Browse →
                </Text>
              </View>
              <Text style={[tw`mt-1 text-xs`, { color: palette.textMuted }]}>
                Explore courses, OER resources, and AI lessons connected to your account, class
                {learnerGrade ? ` (${learnerGrade})` : ''} and
                {learnerSubject ? ` subject (${learnerSubject}).` : ' subjects.'}
              </Text>
            </TouchableOpacity>

            {/* Messages & help */}
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('Messages', {
                  studentId: learnerStudentId || undefined,
                })
              }
              accessibilityRole="button"
              accessibilityLabel="Open messages and help"
              style={[
                tw`rounded-2xl px-3 py-3`,
                {
                  borderWidth: 1,
                  borderColor: palette.border,
                  backgroundColor: palette.softCard,
                },
              ]}
            >
              <View style={tw`flex-row items-center justify-between gap-2`}>
                <Text style={[tw`text-sm font-semibold`, { color: palette.text }]}>
                  Messages &amp; help
                </Text>
                <Text style={[tw`text-[11px]`, { color: palette.isDark ? '#c7d2fe' : '#4f46e5' }]}>
                  Open →
                </Text>
              </View>
              <Text style={[tw`mt-1 text-xs`, { color: palette.textMuted }]}>
                Reach your instructors or support and keep all school communication in one place.
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Helpful chips */}
        <View style={palette.surface(tw`mt-4 mb-4`)}>
          <Text style={[tw`text-base font-semibold mb-2`, { color: palette.text }]}>Helpful</Text>
          <View style={tw`flex-row flex-wrap gap-2`}>
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('OrgElearnPortal', {
                  ...assignNavParams,
                  from: 'learner',
                })
              }
              style={[
                tw`px-3 py-1 rounded-full`,
                {
                  backgroundColor: palette.softCard,
                  borderWidth: 1,
                  borderColor: palette.border,
                },
              ]}
            >
              <Text style={[tw`text-xs`, { color: palette.text }]}>Assignments</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                navigation.navigate('OrgExamResultsPortal', {
                  view: 'learner',
                  ...(learnerStudentId ? { studentId: learnerStudentId } : {}),
                })
              }
              style={[
                tw`px-3 py-1 rounded-full`,
                {
                  backgroundColor: palette.softCard,
                  borderWidth: 1,
                  borderColor: palette.border,
                },
              ]}
            >
              <Text style={[tw`text-xs`, { color: palette.text }]}>Exam results</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.navigate('Results', resultsNavParams)}
              style={[
                tw`px-3 py-1 rounded-full`,
                {
                  backgroundColor: palette.softCard,
                  borderWidth: 1,
                  borderColor: palette.border,
                },
              ]}
            >
              <Text style={[tw`text-xs`, { color: palette.text }]}>Certificates</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.navigate('Courses', courseNavParams)}
              style={[
                tw`px-3 py-1 rounded-full`,
                {
                  backgroundColor: palette.softCard,
                  borderWidth: 1,
                  borderColor: palette.border,
                },
              ]}
            >
              <Text style={[tw`text-xs`, { color: palette.text }]}>Course library</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.navigate('OrgProfile')}
              style={[
                tw`px-3 py-1 rounded-full`,
                {
                  backgroundColor: palette.softCard,
                  borderWidth: 1,
                  borderColor: palette.border,
                },
              ]}
            >
              <Text style={[tw`text-xs`, { color: palette.text }]}>Institution profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.navigate('Help')}
              style={[
                tw`px-3 py-1 rounded-full`,
                {
                  backgroundColor: palette.softCard,
                  borderWidth: 1,
                  borderColor: palette.border,
                },
              ]}
            >
              <Text style={[tw`text-xs`, { color: palette.text }]}>Help</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default OrgLearnerHomeNative;
