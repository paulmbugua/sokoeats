/* apps/mobile/src/screens/org/OrgInviteLanding.native.tsx */

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import tw from '../../../tailwind';
import { useRoute, useNavigation, RouteProp, NavigationProp } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrgInvite } from '@mytutorapp/shared/hooks';
import { acceptOrgInvite, acceptOrgMembershipInvite } from '@mytutorapp/shared/api';
import { resolveCourseTitleInfo } from '@mytutorapp/shared/utils/resolveCourseTitle';
import type { OrgInviteInfo } from '@mytutorapp/shared/types';

// Adjust if your app has a typed stack
type MainStackParamList = {
  OrgInviteLanding: { code: string };
  OrgLogin: { next?: string; reason?: string } | undefined;
  OrgProfile: undefined;
  OrgElearnPortal: undefined;

  RobotTutor:
    | {
        assignmentId: string;
        courseId?: string;
        courseTitle?: string;
        lock?: string;
        flow?: string;
        qt?: string;
        qs?: string;
      }
    | undefined;
};

type ScreenRoute = RouteProp<MainStackParamList, 'OrgInviteLanding'>;
type Nav = NavigationProp<MainStackParamList>;

// normalize & resolve quizType from varying shapes
type QuizType = 'mcq' | 'short';
const normalizeQuizType = (v: unknown): QuizType | null => {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return null;
  if (['mcq', 'multiple', 'multiple_choice', 'multiple-choice', 'choice', 'choices'].includes(s))
    return 'mcq';
  if (
    [
      'short',
      'open',
      'free',
      'shortanswer',
      'short-answer',
      'short_answer',
      'written',
      'fill',
      'fill_in',
      'fill-in',
    ].includes(s)
  )
    return 'short';
  return null;
};

const resolveLockedConfig = (meta: any) =>
  meta?.locked_config ?? meta?.meta?.locked_config ?? meta?.assignment?.locked_config ?? null;

const resolveQuizType = (meta: any): QuizType | null => {
  const lc = resolveLockedConfig(meta);
  const raw = lc?.quizType ?? meta?.quiz_type ?? meta?.quizType ?? null;
  return normalizeQuizType(raw);
};

const resolveQuizSize = (meta: any): number | null => {
  const lc = resolveLockedConfig(meta);
  const raw = lc?.quizSize ?? meta?.quiz_size ?? meta?.quizSize ?? null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const ROBOT_SCREEN = 'RobotTutor' as const;

const OrgInviteLandingNative: React.FC = () => {
  const route = useRoute<ScreenRoute>();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const code = route.params?.code ?? '';

  // ⬇️ Match web: allow both direct token and orgToken
  const { backendUrl, token, orgToken } = useShopContext() as any;
  const learnerToken = token || orgToken;

  // NEW: get kind + error from hook (assignment | membership)
  const { kind, data: meta, error: hookError, loading } = useOrgInvite(code);

  const [error, setError] = useState<string>('');
  const [accepting, setAccepting] = useState<boolean>(false);

  // surface hook error
  useEffect(() => {
    setError(hookError || '');
  }, [hookError]);

  // Policy (assignment-only in practice)
  const policy = useMemo(() => (meta as any)?.policy || {}, [meta]);
  const allowedDomains: string[] = useMemo(
    () => (Array.isArray(policy?.allowed_domains) ? policy.allowed_domains : []),
    [policy]
  );

  // Match web logic: domainRestricted from policy, but we only *show* UI for assignments
  const domainRestricted = !!policy?.domain_restricted && allowedDomains.length > 0;

  // ✅ Robust invite title resolver (assignment-only)
  const inviteTitleInfo = useMemo(() => {
    if (!meta || kind !== 'assignment') {
      return { title: 'Assigned Course', source: 'fallback' as const };
    }
    return resolveCourseTitleInfo({ inviteMeta: meta, fallback: 'Assigned Course' });
  }, [meta, kind]);

  useEffect(() => {
    if (!meta) return;
    console.log('[OrgInviteLandingNative] invite meta snapshot', {
      code,
      kind,
      title_override: (meta as any)?.title_override,
      course_title: (meta as any)?.course_title,
      assignment_course_title: (meta as any)?.assignment?.course_title,
      derivedTitle: inviteTitleInfo.title,
      derivedSource: inviteTitleInfo.source,
    });
  }, [meta, kind, code, inviteTitleInfo.title, inviteTitleInfo.source]);

  // Labels (assignment-only)
  const passMarkLabel = useMemo(() => {
    if (!meta || kind !== 'assignment') return '—';
    const assess = (meta as any)?.policy?.assessment || {};
    const fallback = (meta as any)?.pass_mark ?? (meta as any)?.default_pass_mark;
    const pass = assess.default_pass_mark ?? fallback;
    return pass != null ? `${pass}%` : '—';
  }, [meta, kind]);

  const timerLabel = useMemo(() => {
    if (!meta || kind !== 'assignment') return '—';
    const assess = (meta as any)?.policy?.assessment || {};
    const secs =
      assess.quiz_time_limit_s ?? (meta as any)?.timer_s ?? (meta as any)?.quiz_time_limit_s;
    if (!secs) return '—';
    return secs % 60 === 0 ? `${secs / 60} min` : `${secs}s`;
  }, [meta, kind]);

  const dueLabel = useMemo(() => {
    if (kind !== 'assignment') return null;
    const dRaw = (meta as OrgInviteInfo | undefined)?.due_at;
    if (!dRaw) return null;
    try {
      const d = new Date(dRaw);
      return d.toLocaleString();
    } catch {
      return dRaw;
    }
  }, [meta, kind]);

  const quizType = useMemo(
    () => (kind === 'assignment' ? resolveQuizType(meta as any) : null),
    [meta, kind]
  );
  const quizSize = useMemo(
    () => (kind === 'assignment' ? resolveQuizSize(meta as any) : null),
    [meta, kind]
  );

  const quizTypeLabel = useMemo(() => {
    if (!quizType) return '—';
    return quizType === 'short' ? 'Short answers (typed)' : 'Multiple choice (MCQ)';
  }, [quizType]);

  const quizTypeDesc = useMemo(() => {
    if (!quizType) return '';
    return quizType === 'short'
      ? 'You’ll type your answers. You can use subscripts/superscripts (e.g., H₂SO₄, SO₄²⁻). We’ll auto-mark.'
      : 'You’ll choose one of four options for each question.';
  }, [quizType]);

  // UI parts
  const orgName = (meta as OrgInviteInfo | undefined)?.org_name ?? 'Organization';
  const title = kind === 'membership' ? 'Join organization' : inviteTitleInfo.title;
  const subtitle =
    kind === 'membership'
      ? 'You have been invited to join this organization.'
      : 'Invitation to learn';

  const logoUrl = kind === 'assignment' ? (meta as OrgInviteInfo | undefined)?.logo_url : undefined;
  const signatureUrl =
    kind === 'assignment' ? (meta as OrgInviteInfo | undefined)?.signature_url : undefined;
  const maxAttempts =
    kind === 'assignment' ? (meta as OrgInviteInfo | undefined)?.max_attempts : undefined;

  const primaryCta = learnerToken
    ? kind === 'membership'
      ? 'Join Organization'
      : 'Accept & Join'
    : domainRestricted
      ? 'Sign in with allowed email'
      : 'Sign in to continue';

  const onAccept = useCallback(async () => {
    setError('');
    if (!code) {
      setError('Invalid invite.');
      return;
    }

    if (!learnerToken) {
      navigation.navigate('OrgLogin', {
        next: `/org/join/${code}`,
        reason: 'org_invite',
      });
      return;
    }

    setAccepting(true);
    try {
      if (kind === 'membership') {
        const resp: any = await acceptOrgMembershipInvite(backendUrl, learnerToken, code);
        if (!resp?.ok) throw new Error('Failed to join organization.');
        navigation.navigate('OrgElearnPortal' as never);
        return;
      }

      const resp: any = await acceptOrgInvite(backendUrl, learnerToken, code);
      if (!resp?.ok) throw new Error(resp?.message || 'Failed to accept invite.');

      const enrollment = resp.enrollment ?? resp.attempt ?? resp;

      const assignmentId =
        enrollment?.assignmentId ??
        (meta as OrgInviteInfo | undefined)?.assignment?.id ??
        (meta as OrgInviteInfo | undefined)?.id ??
        null;

      const courseId =
        enrollment?.courseId ??
        (meta as OrgInviteInfo | undefined)?.assignment?.course_id ??
        (meta as OrgInviteInfo | undefined)?.course_id ??
        '';

      if (!assignmentId) throw new Error('Invite accepted, but no assignment found.');
      if (!courseId) throw new Error('Shared course not found.');

      const qt = resolveQuizType(meta as any);
      const qs = resolveQuizSize(meta as any);
      const courseTitle = inviteTitleInfo.title;

      navigation.navigate(ROBOT_SCREEN, {
        assignmentId: String(assignmentId),
        courseId: courseId ? String(courseId) : undefined,
        courseTitle,
        lock: '1',
        flow: 'org',
        ...(qt ? { qt } : {}),
        ...(qs ? { qs: String(qs) } : {}),
      });
    } catch (e: any) {
      const apiMsg = e?.response?.data?.message || e?.message;
      const apiCode = e?.response?.data?.code;

      if (apiCode === 'EMAIL_DOMAIN_BLOCKED' && domainRestricted) {
        setError(
          `You're signed in with an email that isn’t allowed for this organization. Allowed domain(s): ${allowedDomains.join(
            ', '
          )}. Please sign in using an email on one of those domains, or ask your admin to add your domain.`
        );
      } else {
        setError(apiMsg || 'Failed to accept invite.');
      }
    } finally {
      setAccepting(false);
    }
  }, [
    backendUrl,
    learnerToken,
    code,
    navigation,
    meta,
    kind,
    domainRestricted,
    allowedDomains,
    inviteTitleInfo.title,
  ]);

  const topPad = Math.max(insets.top, 12);
  const bottomPad = Math.max(insets.bottom, 16);

  // Small UI helper for meta chips (light/dark)
  const Chip = ({ label }: { label: React.ReactNode }) => (
    <View style={tw`px-3 py-1 mr-2 mb-2 rounded-full bg-[#e7edf4] dark:bg-[#172534]`}>
      <Text style={tw`text-xs text-[#0d141c] dark:text-white`}>{label}</Text>
    </View>
  );

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`} edges={['top', 'bottom']}>
      {/* Soft background orbs (match FindTutor vibe) */}
      <View style={tw`absolute inset-0`}>
        <View style={tw`absolute -top-16 -right-10 h-36 w-36 rounded-full bg-pink-500/12 dark:bg-pink-500/10`} />
        <View style={tw`absolute -bottom-24 -left-20 h-44 w-44 rounded-full bg-sky-500/10 dark:bg-sky-500/10`} />
      </View>

      <ScrollView
        contentContainerStyle={[
          tw`grow items-center px-3`,
          { paddingTop: topPad + 8, paddingBottom: bottomPad + 16 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={tw`w-full max-w-xl rounded-2xl bg-white dark:bg-[#0f1821] border border-[#e2edf5] dark:border-white/10 p-4 shadow-sm`}
        >
          {/* Loading / invalid */}
          {loading ? (
            <View>
              <Text style={tw`text-[#49739c] dark:text-white/70 text-sm`}>Loading…</Text>
            </View>
          ) : !meta ? (
            <View>
              <Text style={tw`text-[#49739c] dark:text-white/70 text-sm`}>{error || 'Invalid invite.'}</Text>
            </View>
          ) : (
            <>
              {/* Header */}
              <View style={tw`flex-row items-center`}>
                {!!logoUrl && (
                  <Image
                    source={{ uri: logoUrl }}
                    style={tw`h-10 w-10 rounded mr-3 bg-[#e7edf4] dark:bg-[#172534]`}
                    resizeMode="cover"
                  />
                )}

                <View style={tw`flex-1`}>
                  <Text style={tw`text-[#49739c] dark:text-white/70 text-[13px]`}>{subtitle}</Text>
                  <Text style={tw`text-[#0d141c] dark:text-white text-lg font-semibold`} numberOfLines={2}>
                    {title}
                  </Text>
                  {!!orgName && (
                    <Text style={tw`text-[#49739c] dark:text-white/70 text-sm`} numberOfLines={1}>
                      {orgName}
                    </Text>
                  )}
                </View>
              </View>

              {/* Meta row — assignment-only */}
              {kind === 'assignment' && (
                <View style={tw`flex-row flex-wrap mt-4`}>
                  <Chip
                    label={
                      <>
                        Pass mark: <Text style={tw`font-bold`}>{passMarkLabel}</Text>
                      </>
                    }
                  />
                  <Chip
                    label={
                      <>
                        Timer: <Text style={tw`font-bold`}>{timerLabel}</Text>
                      </>
                    }
                  />
                  {typeof maxAttempts === 'number' && (
                    <Chip
                      label={
                        <>
                          Attempts: <Text style={tw`font-bold`}>{maxAttempts === 0 ? '∞' : maxAttempts}</Text>
                        </>
                      }
                    />
                  )}
                  {!!dueLabel && (
                    <Chip
                      label={
                        <>
                          Due: <Text style={tw`font-bold`}>{dueLabel}</Text>
                        </>
                      }
                    />
                  )}
                  <Chip
                    label={
                      <>
                        Answer type: <Text style={tw`font-bold`}>{quizTypeLabel}</Text>
                      </>
                    }
                  />
                  {quizSize != null && (
                    <Chip
                      label={
                        <>
                          Questions: <Text style={tw`font-bold`}>{quizSize}</Text>
                        </>
                      }
                    />
                  )}
                </View>
              )}

              {/* What to expect */}
              <View
                style={tw`mt-3 rounded-xl border border-[#e2edf5] dark:border-white/10 bg-[#f4f7fb] dark:bg-white/5 p-3 flex-row`}
              >
                <View
                  style={tw.style(
                    `h-8 w-8 rounded-lg items-center justify-center mr-3`,
                    kind === 'membership'
                      ? 'bg-sky-600'
                      : quizType === 'short'
                        ? 'bg-emerald-600'
                        : 'bg-indigo-600'
                  )}
                >
                  <Text style={tw`text-white`}>
                    {kind === 'membership' ? '🏫' : quizType === 'short' ? '⌨️' : '📝'}
                  </Text>
                </View>

                <View style={tw`flex-1`}>
                  <Text style={tw`text-[#0d141c] dark:text-white text-sm font-semibold`}>
                    {kind === 'membership' ? 'Organization access' : quizTypeLabel}
                  </Text>
                  <Text style={tw`text-[#49739c] dark:text-white/70 text-xs mt-0.5`}>
                    {kind === 'membership'
                      ? 'You will be added to this organization. Your admins can assign courses to you afterwards.'
                      : quizTypeDesc || 'Your organization set the answer format for this quiz.'}
                  </Text>
                </View>
              </View>

              {/* Domain restriction (assignment-only UI) */}
              {kind === 'assignment' && domainRestricted && (
                <View
                  style={tw`mt-3 rounded-lg bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-400/20 p-3`}
                >
                  <Text style={tw`text-yellow-800 dark:text-yellow-200 text-xs font-semibold`}>
                    Restricted invite
                  </Text>
                  <Text style={tw`text-yellow-800 dark:text-yellow-200 text-xs mt-1`}>
                    Only emails from <Text style={tw`font-bold`}>{allowedDomains.join(', ')}</Text> can accept this invite.
                    {learnerToken
                      ? ' If this isn’t your organization email, sign out and sign back in with the permitted address.'
                      : ' Please sign in using an email on one of those domains.'}
                  </Text>
                </View>
              )}

              {/* Actions */}
              <View style={tw`mt-4`}>
                <TouchableOpacity
                  onPress={onAccept}
                  disabled={accepting || loading}
                  style={tw`w-full rounded-xl bg-emerald-600 py-3 items-center ${accepting || loading ? 'opacity-60' : ''}`}
                >
                  {accepting || loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={tw`text-white font-semibold`}>{primaryCta}</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => navigation.goBack()}
                  style={tw`mt-2 w-full rounded-xl bg-[#e7edf4] dark:bg-[#172534] py-3 items-center border border-[#e2edf5] dark:border-white/10`}
                >
                  <Text style={tw`text-[#0d141c] dark:text-white`}>Cancel</Text>
                </TouchableOpacity>
              </View>

              {/* Signature (assignment-only) */}
              {kind === 'assignment' && !!signatureUrl && (
                <View style={tw`mt-4 items-start`}>
                  <Image source={{ uri: signatureUrl }} style={tw`h-10 w-40 opacity-70`} resizeMode="contain" />
                </View>
              )}

              {/* Error */}
              {!!error && (
                <Text style={tw`mt-3 text-rose-600 dark:text-yellow-300 text-xs`}>{error}</Text>
              )}

              {/* Footnote */}
              {!!orgName && (
                <Text style={tw`mt-4 text-[12px] text-[#49739c] dark:text-white/60`}>
                  {kind === 'membership' ? (
                    <>
                      By joining, you’ll be added to <Text style={tw`font-semibold`}>{orgName}</Text>. Your admins may assign
                      courses to you.
                    </>
                  ) : (
                    <>
                      By starting, you’ll be added as a learner in <Text style={tw`font-semibold`}>{orgName}</Text> for this course.
                      Your attempt may be timed and limited by your organization’s policy.
                    </>
                  )}
                </Text>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default OrgInviteLandingNative;
