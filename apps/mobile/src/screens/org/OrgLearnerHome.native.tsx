/* eslint-disable prettier/prettier */
/* eslint-disable react-hooks/exhaustive-deps */

// apps/mobile/src/screens/org/OrgLearnerHome.native.tsx
import React, { useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';

import tw from '../../../tailwind';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { useThemePref } from '../../theme/ThemeContext';
import { useOrgLearnerFees } from '@mytutorapp/shared/hooks/useOrgLearnerFees';
import {
  apiListLearnerNewsletters,
  apiGetMyFeeStatement,
  apiGetMyFeeStructure,
} from '@mytutorapp/shared/api/orgProApi';

/* ------------------------------------------------------------------ */
/* Types – mirror web URL params using route params                   */
/* ------------------------------------------------------------------ */

type OrgLearnerHomeParams = {
  studentId?: string | number;
  student_id?: string | number;

  subject?: string;
  subjectKey?: string;
  subject_key?: string;
};

type ParamList = {
  OrgLearnerHome: OrgLearnerHomeParams | undefined;
};

/* ------------------------------------------------------------------ */
/* Small helpers (same behavior as web)                               */
/* ------------------------------------------------------------------ */

function pickNumber(...xs: any[]) {
  for (const x of xs) {
    const n = Number(x);
    if (!Number.isNaN(n) && Number.isFinite(n)) return n;
  }
  return 0;
}
function pickString(...xs: any[]) {
  for (const x of xs) {
    const s = typeof x === 'string' ? x : x == null ? '' : String(x);
    if (s.trim()) return s.trim();
  }
  return '';
}
function pickArray(...xs: any[]) {
  for (const x of xs) if (Array.isArray(x)) return x;
  return [];
}

function moneyFromCents(cents?: number, currency?: string) {
  const cur = (currency || 'USD').toUpperCase();
  const v = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(v);
  } catch {
    return `${cur} ${v.toFixed(2)}`;
  }
}

// More tolerant: supports amount_cents, amountCents, cents, value_cents, OR amount/value (units)
function amountToCents(it: any) {
  const direct =
    it?.amount_cents ??
    it?.amountCents ??
    it?.cents ??
    it?.value_cents ??
    it?.valueCents ??
    it?.amount_in_cents ??
    it?.amountInCents;

  const directN = Number(direct);
  if (!Number.isNaN(directN) && Number.isFinite(directN)) return directN;

  const raw = it?.amount ?? it?.value;
  const n = Number(raw);
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;

  if (Number.isInteger(n) && Math.abs(n) > 100000) return n; // already cents
  return Math.round(n * 100);
}
function sumCents(items: any[]) {
  return (items || []).reduce((acc, it) => acc + amountToCents(it), 0);
}

/* ------------------------------------------------------------------ */
/* Theming helper                                                     */
/* ------------------------------------------------------------------ */

function usePalette() {
  const { resolvedScheme } = useThemePref();
  const isDark = resolvedScheme === 'dark';
  return {
    isDark,
    bg: isDark ? '#020617' : '#f8fafc',
    card: isDark ? '#0b1220' : '#ffffff',
    softCard: isDark ? '#0b1220' : '#ffffff',
    border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(226,232,240,0.90)',
    text: isDark ? 'rgba(255,255,255,0.95)' : '#0f172a',
    textMuted: isDark ? 'rgba(255,255,255,0.70)' : '#475569',
    textSubtle: isDark ? 'rgba(255,255,255,0.55)' : '#64748b',
    chipBg: (hex: string) => (isDark ? `${hex}24` : 'rgba(241,245,249,1)'),
    surface(style?: any) {
      return [
        tw`rounded-3xl p-4`,
        { backgroundColor: this.card, borderColor: this.border, borderWidth: 1 },
        style,
      ];
    },
    smallSurface(style?: any) {
      return [
        tw`rounded-2xl p-3`,
        { backgroundColor: this.card, borderColor: this.border, borderWidth: 1 },
        style,
      ];
    },
  };
}

/* ------------------------------------------------------------------ */
/* Tile component (native equivalent of IconTile)                     */
/* ------------------------------------------------------------------ */

function Tile({
  title,
  subtitle,
  emoji,
  tone,
  badge,
  disabled,
  onPress,
  palette,
}: {
  title: string;
  subtitle?: string;
  emoji: string;
  tone?: 'indigo' | 'emerald' | 'sky' | 'amber' | 'rose' | 'slate';
  badge?: string;
  disabled?: boolean;
  onPress?: () => void;
  palette: ReturnType<typeof usePalette>;
}) {
  const ring =
    tone === 'emerald'
      ? palette.isDark
        ? 'rgba(52,211,153,0.28)'
        : 'rgba(16,185,129,0.28)'
      : tone === 'sky'
        ? palette.isDark
          ? 'rgba(56,189,248,0.28)'
          : 'rgba(14,165,233,0.24)'
        : tone === 'amber'
          ? palette.isDark
            ? 'rgba(251,191,36,0.25)'
            : 'rgba(245,158,11,0.22)'
          : tone === 'rose'
            ? palette.isDark
              ? 'rgba(251,113,133,0.22)'
              : 'rgba(244,63,94,0.18)'
            : tone === 'slate'
              ? palette.isDark
                ? 'rgba(255,255,255,0.12)'
                : 'rgba(148,163,184,0.22)'
              : palette.isDark
                ? 'rgba(129,140,248,0.24)'
                : 'rgba(99,102,241,0.20)';

  const iconBg =
    tone === 'emerald'
      ? palette.chipBg('#10b981')
      : tone === 'sky'
        ? palette.chipBg('#0ea5e9')
        : tone === 'amber'
          ? palette.chipBg('#f59e0b')
          : tone === 'rose'
            ? palette.chipBg('#fb7185')
            : tone === 'slate'
              ? palette.isDark
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(241,245,249,1)'
              : palette.chipBg('#6366f1');

  const Wrap: any = disabled ? View : TouchableOpacity;

  return (
    <Wrap
      {...(!disabled ? { onPress } : {})}
      style={[
        tw`rounded-2xl p-3`,
        {
          backgroundColor: palette.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.95)',
          borderWidth: 1,
          borderColor: palette.border,
          opacity: disabled ? 0.55 : 1,
        },
      ]}
    >
      {badge ? (
        <View
          style={[
            tw`self-start px-2 py-0.5 rounded-full mb-2`,
            {
              backgroundColor: palette.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(241,245,249,1)',
              borderColor: palette.border,
              borderWidth: 1,
            },
          ]}
        >
          <Text style={[tw`text-[10px]`, { color: palette.textMuted }]}>{badge}</Text>
        </View>
      ) : null}

      <View style={tw`flex-row items-center gap-10 justify-between`}>
        <View style={tw`flex-1 pr-2`}>
          <Text style={[tw`text-sm font-semibold`, { color: palette.text }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[tw`mt-1 text-[11px]`, { color: palette.textMuted }]} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View
          style={[
            tw`h-12 w-12 rounded-2xl items-center justify-center`,
            {
              backgroundColor: iconBg,
              borderWidth: 1,
              borderColor: ring,
            },
          ]}
        >
          <Text style={tw`text-2xl`}>{emoji}</Text>
        </View>
      </View>
    </Wrap>
  );
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

  const {
    orgLogout,
    userId: ctxUserId,
    user: shopUser,
    orgLearner: ctxOrgLearner,
    orgUser: ctxOrgUser,
    backendUrl,
    orgToken,
  } = useShopContext() as any;

  const orgId = org?.id;

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
    return (v ?? '').toString();
  }, [params.subject, params.subjectKey, params.subject_key]);

  const orgName: string = org?.name || org?.org_name || 'Your Institution';
  const planLabel: string = org?.tier ? String(org.tier).toUpperCase() : 'STARTER';
  const isProTier =
    String(org?.tier || '').toLowerCase() === 'pro' ||
    String(org?.tier || '').toLowerCase() === 'enterprise';

  const portalLabel: string = role ? `${String(role).toUpperCase()} PORTAL` : 'LEARNER PORTAL';

  // Learner identity (same precedence as web)
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

  const learner: any =
    learnerProfileFromOrg ||
    learnerProfileFromShop ||
    ctxOrgLearner ||
    ctxOrgUser ||
    shopUser ||
    currentUser ||
    null;

  const learnerUserBase: any = shopUser || currentUser || ctxOrgUser || null;

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

  const learnerStudentId: string =
    rawStudentIdParam && rawStudentIdParam.trim() !== ''
      ? rawStudentIdParam.trim()
      : learnerUserId != null
        ? String(learnerUserId)
        : '';

  const isLoading = !learner && !rawStudentIdParam;

  const learnerName: string =
    learnerUserBase?.name ||
    learner?.name ||
    learner?.full_name ||
    learner?.fullName ||
    learnerUserBase?.email ||
    learner?.email ||
    'Learner';

  const learnerEmail: string =
    learnerUserBase?.email ||
    learner?.email ||
    learnerUserBase?.email_address ||
    learner?.email_address ||
    learner?.guardian_email ||
    '';

  const learnerGrade: string | null = learner?.class_label || learner?.classLabel || learner?.grade || null;

  const learnerSubject: string | null =
    (subjectParam && subjectParam.trim() !== '' ? subjectParam.trim() : null) ||
    learner?.subject ||
    learner?.subject_name ||
    learner?.subject_label ||
    null;

  const admissionCode: string | null = learner?.admission_code || learner?.admissionCode || null;

  const learnerPhotoFromProfile: string | null =
    (learnerProfileFromOrg && (learnerProfileFromOrg.photo_url || learnerProfileFromOrg.photoUrl)) ||
    (learnerProfileFromShop && (learnerProfileFromShop.photo_url || learnerProfileFromShop.photoUrl)) ||
    null;

  const learnerPhoto: string | null = learnerPhotoFromProfile || learner?.photo_url || learner?.photoUrl || null;
  const learnerInitial = (learnerName || 'L').trim().charAt(0).toUpperCase();

  const handleLogout = useCallback(async () => {
    if (orgLogout) await orgLogout();
    navigation.replace('InstitutionLogin', { logoutOrg: true });
  }, [orgLogout, navigation]);

  /* ------------------------------------------------------------------ */
  /* Fees (legacy hook) – fallback/preview                              */
  /* ------------------------------------------------------------------ */

  const fees = useOrgLearnerFees({
    backendUrl,
    token: orgToken,
    orgId: orgId || undefined,
  });

  const feeLoading = (fees as any)?.loading ?? (fees as any)?.isLoading ?? false;
  const feeError = (fees as any)?.error ?? null;

  const feeStructure =
    (fees as any)?.structure ?? (fees as any)?.feeStructure ?? (fees as any)?.myFeeStructure ?? null;

  const fallbackCurrency: string = pickString(
    feeStructure?.currency,
    (fees as any)?.currency,
    (fees as any)?.balances?.currency,
    'KES',
  );

  /* ------------------------------------------------------------------ */
  /* Fees (balances/statement) – Pro/Enterprise                          */
  /* ------------------------------------------------------------------ */

  const statementQ = useQuery({
    queryKey: ['org-my-fee-statement', orgId],
    enabled: !!backendUrl && !!orgToken && !!orgId && isProTier,
    queryFn: async () => apiGetMyFeeStatement(backendUrl, String(orgId), orgToken),
  });

  const statement: any = statementQ.data || null;
  const summaryBy = pickArray(statement?.summary_by_currency, statement?.summaryByCurrency, []);
  const summary0 = summaryBy?.[0] || null;

  const primaryCurrency = pickString(
    statement?.summary?.currency,
    statement?.currency,
    summary0?.currency,
    fallbackCurrency,
    'KES',
  );

  const primaryRow =
    summaryBy.find((r: any) => pickString(r?.currency).toUpperCase() === primaryCurrency.toUpperCase()) ||
    summary0;

  const billedCents = pickNumber(
    statement?.summary?.total_charges,
    primaryRow?.total_charges,
    statement?.summary?.billed_cents,
    statement?.charges_total_cents,
    statement?.chargesTotalCents,
  );

  const paidCents = pickNumber(
    statement?.summary?.total_payments,
    primaryRow?.total_payments,
    statement?.summary?.paid_cents,
    statement?.payments_total_cents,
    statement?.paymentsTotalCents,
  );

  const balanceCents = pickNumber(
    statement?.summary?.balance,
    primaryRow?.balance,
    statement?.summary?.balance_cents,
    statement?.balance_cents,
    billedCents - paidCents,
  );

  /* ------------------------------------------------------------------ */
  /* Fees (structure) – Pro/Enterprise                                  */
  /* ------------------------------------------------------------------ */

  const structureQ = useQuery({
    queryKey: ['org-my-fee-structure', orgId],
    enabled: !!backendUrl && !!orgToken && !!orgId && isProTier,
    queryFn: async () => apiGetMyFeeStructure(backendUrl, String(orgId), orgToken),
  });

  const structure: any = structureQ.data || null;
  const structureItems: any[] = pickArray(structure?.items, structure?.structure?.items, []);

  const expectedCurrency = pickString(
    structure?.currency,
    structure?.structure?.currency,
    structureItems?.[0]?.currency,
    primaryCurrency,
    fallbackCurrency,
    'KES',
  );

  const expectedTotalCents = sumCents(structureItems);

  const summaryForExpected =
    summaryBy.find((r: any) => pickString(r?.currency).toUpperCase() === expectedCurrency.toUpperCase()) ||
    primaryRow ||
    summary0;

  const paidForExpectedCents = pickNumber(summaryForExpected?.total_payments, paidCents);

  const expectedRemainingCents =
    expectedTotalCents > 0 ? Math.max(expectedTotalCents - paidForExpectedCents, 0) : 0;

  const paidSharePct = expectedTotalCents > 0 ? Math.round((paidForExpectedCents / expectedTotalCents) * 100) : 0;
  const paidSharePctClamped = Math.max(0, Math.min(100, paidSharePct));

  const previewItems: any[] = useMemo(() => {
    if (structureItems?.length) return structureItems;
    const legacyItems = feeStructure?.items ?? feeStructure?.structure_items ?? [];
    return Array.isArray(legacyItems) ? legacyItems : [];
  }, [structureItems, feeStructure]);

  const previewStructureTitle = pickString(
    structure?.title,
    structure?.name,
    structure?.structure?.title,
    feeStructure?.name,
    feeStructure?.title,
    feeStructure?.id ? `Structure #${feeStructure.id}` : '',
    '—',
  );

  /* ------------------------------------------------------------------ */
  /* Newsletters                                                        */
  /* ------------------------------------------------------------------ */

  const newslettersQ = useQuery({
    queryKey: ['learner-newsletters', orgId],
    queryFn: async () => {
      if (!backendUrl || !orgId) return { items: [] };
      return apiListLearnerNewsletters(backendUrl, String(orgId), orgToken);
    },
    enabled: !!backendUrl && !!orgToken && !!orgId,
  });

  const learnerNewsletters = newslettersQ.data?.items || [];
  const newslettersLoading = newslettersQ.isLoading;

  /* ------------------------------------------------------------------ */
  /* Navigation params (mirror web hrefs, via native routes)            */
  /* ------------------------------------------------------------------ */

  const examsParams: any = { view: 'learner', ...(learnerStudentId ? { studentId: learnerStudentId } : {}) };

  const courseNavParams: any = { view: 'learner' };
  if (learnerStudentId) courseNavParams.studentId = learnerStudentId;
  if (learnerGrade) courseNavParams.class = learnerGrade;
  if (learnerSubject) courseNavParams.subject = learnerSubject;

  const activitiesNavParams: any = { view: 'learner' };
  if (learnerStudentId) activitiesNavParams.studentId = learnerStudentId;
  if (learnerGrade) activitiesNavParams.class = learnerGrade;
  if (learnerSubject) activitiesNavParams.subject = learnerSubject;

  const assignNavParams: any = { view: 'learner', tab: 'assign' };
  if (learnerStudentId) assignNavParams.studentId = learnerStudentId;
  if (learnerGrade) assignNavParams.class = learnerGrade;
  if (learnerSubject) assignNavParams.subject = learnerSubject;

  const resultsNavParams: any = learnerStudentId ? { studentId: learnerStudentId } : {};

  const goFees = () => {
    navigation.navigate('OrgLearnerFees', {
      ...(learnerStudentId ? { studentId: learnerStudentId } : {}),
    });
  };

  const navTargets = React.useMemo(
    () => ({
      assignments: () => navigation.navigate('OrgElearnPortal', { ...assignNavParams, from: 'learner' }),
      courses: () => navigation.navigate('Courses', courseNavParams),
      exams: () => navigation.navigate('OrgExamResultsPortal', examsParams),
      certificates: () => navigation.navigate('Results', resultsNavParams),
      sports: () => navigation.navigate('OrgLearnerSportsClubs', { tab: 'sports' }),
      clubs: () => navigation.navigate('OrgLearnerSportsClubs', { tab: 'clubs' }),
      newsletters: () => navigation.navigate('OrgLearnerNewsletters'),
      messages: () => navigation.navigate('Messages', { studentId: learnerStudentId || undefined }),
      fees: goFees,
      announcements: () =>
        navigation.navigate('OrgElearnPortal', { ...activitiesNavParams, tab: 'tools', from: 'learner' }),
    }),
    [
      navigation,
      assignNavParams,
      courseNavParams,
      examsParams,
      resultsNavParams,
      activitiesNavParams,
      learnerStudentId,
      goFees,
    ],
  );

  const tileConfig = React.useMemo(
    () =>
      [
        {
          key: 'assignments',
          emoji: '📝',
          title: 'Assignments',
          subtitle: 'Files',
          tone: 'indigo' as const,
          onPress: navTargets.assignments,
        },
        {
          key: 'courses',
          emoji: '📚',
          title: 'Courses',
          subtitle: 'Library',
          tone: 'sky' as const,
          onPress: navTargets.courses,
        },
        {
          key: 'exams',
          emoji: '🧾',
          title: 'Exams',
          subtitle: 'Results',
          tone: 'sky' as const,
          onPress: navTargets.exams,
        },
        {
          key: 'certificates',
          emoji: '🏅',
          title: 'Certificates',
          subtitle: 'Achievements',
          tone: 'emerald' as const,
          onPress: navTargets.certificates,
        },
        {
          key: 'sports',
          emoji: '🏆',
          title: 'Sports',
          subtitle: 'Calendar',
          tone: 'amber' as const,
          onPress: navTargets.sports,
        },
        {
          key: 'clubs',
          emoji: '🤝',
          title: 'Clubs',
          subtitle: 'Societies',
          tone: 'indigo' as const,
          onPress: navTargets.clubs,
        },
        {
          key: 'newsletters',
          emoji: '📰',
          title: 'Newsletters',
          subtitle: newslettersLoading ? 'Loading…' : learnerNewsletters?.length ? 'New!' : 'Archive',
          tone: (learnerNewsletters?.length ? 'emerald' : 'slate') as const,
          badge: newslettersLoading ? '' : learnerNewsletters?.length ? 'Latest' : undefined,
          onPress: navTargets.newsletters,
        },
        {
          key: 'messages',
          emoji: '💬',
          title: 'Messages',
          subtitle: 'Help',
          tone: 'rose' as const,
          onPress: navTargets.messages,
        },
        {
          key: 'fees',
          emoji: '💳',
          title: 'Fees',
          subtitle: isProTier ? 'Statement' : 'Locked',
          tone: (isProTier ? 'emerald' : 'slate') as const,
          disabled: !isProTier,
          badge: !isProTier ? 'Pro required' : undefined,
          onPress: isProTier ? navTargets.fees : undefined,
        },
        {
          key: 'announcements',
          emoji: '📣',
          title: 'Announcements',
          subtitle: isProTier ? 'Feed' : 'Locked',
          tone: (isProTier ? 'sky' : 'slate') as const,
          disabled: !isProTier,
          badge: !isProTier ? 'Pro required' : undefined,
          onPress: isProTier ? navTargets.announcements : undefined,
        },
      ],
    [
      navTargets,
      newslettersLoading,
      learnerNewsletters?.length,
      isProTier,
    ],
  );

  const tileRows = React.useMemo(() => {
    const rows: any[][] = [];
    const items = tileConfig || [];
    for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
    return rows;
  }, [tileConfig]);

  const refreshFees = () => {
    (fees as any)?.refresh?.();
    statementQ?.refetch?.();
    structureQ?.refetch?.();
  };

  useEffect(() => {
    if (backendUrl && orgToken && orgId) {
      (fees as any)?.refresh?.();
      if (isProTier) {
        statementQ?.refetch?.();
        structureQ?.refetch?.();
      }
    }
  }, [backendUrl, orgToken, orgId, isProTier]);

  useEffect(() => {
    console.log('[OrgLearnerHomeNative] learner ids', {
      rawStudentIdParam,
      learnerUserId,
      learnerStudentId,
      hasProfile: !!learner,
      orgCurrentUser: currentUser,
      shopUser,
      ctxOrgLearner,
      ctxOrgUser,
      ctxUserId: ctxUserId ?? null,
    });
  }, [rawStudentIdParam, learnerUserId, learnerStudentId, learner, currentUser, shopUser, ctxOrgLearner, ctxOrgUser, ctxUserId]);

  /* ------------------------------------------------------------------ */
  /* Loading view                                                       */
  /* ------------------------------------------------------------------ */

  if (isLoading) {
    return (
      <SafeAreaView style={[tw`flex-1 items-center justify-center`, { backgroundColor: palette.bg }]}>
        <View style={palette.smallSurface(tw`w-full max-w-xs`)}>
          <Text style={[tw`text-[11px] uppercase tracking-[1.6px] text-center`, { color: palette.textSubtle }]}>
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
  /* Main render – mirrors OrgLearnerHome.web.tsx                        */
  /* ------------------------------------------------------------------ */

  const showStructureLoading = isProTier ? structureQ.isLoading : feeLoading;
  const showStructureError = isProTier ? structureQ.error : feeError;

  const latestNewsletterTitle = pickString(
    learnerNewsletters?.[0]?.title,
    learnerNewsletters?.[0]?.subject,
    'Newsletter',
  );

  return (
    <SafeAreaView style={[tw`flex-1`, { backgroundColor: palette.bg }]}>
      <ScrollView contentContainerStyle={tw`px-4 py-6 pb-12`} keyboardShouldPersistTaps="handled">
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
                  backgroundColor: palette.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.95)',
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
            <View
              style={[
                tw`h-12 w-12 rounded-2xl items-center justify-center overflow-hidden`,
                { backgroundColor: palette.isDark ? 'rgba(16,185,129,0.18)' : 'rgba(16,185,129,0.12)' },
              ]}
            >
              {learnerPhoto ? (
                <Image source={{ uri: learnerPhoto }} style={tw`h-full w-full`} contentFit="cover" transition={200} />
              ) : (
                <Text style={[tw`text-lg font-bold`, { color: palette.text }]}>{learnerInitial}</Text>
              )}
            </View>

            <View style={tw`flex-1 min-w-0`}>
              <Text style={[tw`text-[11px] uppercase tracking-[1.6px]`, { color: palette.textSubtle }]}>
                Signed in learner
              </Text>

              <View style={tw`mt-0.5 flex-row flex-wrap items-center`}>
                <Text style={[tw`text-base font-semibold`, { color: palette.text }]} numberOfLines={1}>
                  {learnerName}
                </Text>
              </View>

              <View style={tw`mt-2 flex-row flex-wrap gap-2`}>
                {learnerGrade ? (
                  <View
                    style={[
                      tw`px-2 py-0.5 rounded-full`,
                      { backgroundColor: palette.chipBg('#22c55e'), borderWidth: 1, borderColor: palette.isDark ? 'rgba(74,222,128,0.28)' : 'rgba(34,197,94,0.25)' },
                    ]}
                  >
                    <Text style={[tw`text-[11px]`, { color: palette.isDark ? '#bbf7d0' : '#166534' }]}>
                      Grade / Class: {learnerGrade}
                    </Text>
                  </View>
                ) : null}

                {learnerSubject ? (
                  <View
                    style={[
                      tw`px-2 py-0.5 rounded-full`,
                      { backgroundColor: palette.chipBg('#0ea5e9'), borderWidth: 1, borderColor: palette.isDark ? 'rgba(56,189,248,0.28)' : 'rgba(14,165,233,0.22)' },
                    ]}
                  >
                    <Text style={[tw`text-[11px]`, { color: palette.isDark ? '#bae6fd' : '#075985' }]}>
                      Subject focus: {learnerSubject}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={tw`mt-2`}>
                <View style={tw`flex-row flex-wrap gap-1 items-baseline`}>
                  <Text style={[tw`text-[11px]`, { color: palette.textSubtle }]}>📧 Email:</Text>
                  <Text style={[tw`text-[11px] font-mono`, { color: palette.text }]} numberOfLines={2}>
                    {learnerEmail || 'No email on file yet – ask your teacher to update it.'}
                  </Text>
                </View>

                {admissionCode ? (
                  <View style={tw`mt-1 flex-row flex-wrap gap-1 items-baseline`}>
                    <Text style={[tw`text-[11px]`, { color: palette.textSubtle }]}>🆔 Admission No:</Text>
                    <Text style={[tw`text-[11px] font-mono`, { color: palette.text }]}>{admissionCode}</Text>
                  </View>
                ) : null}

                <Text style={[tw`mt-1 text-[11px]`, { color: palette.textSubtle }]}>
                  If this name or grade doesn&apos;t look correct, sign out and ask your teacher to confirm your login card.
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Fees & balances (matches web) */}
        <View style={palette.surface(tw`mt-4`)}>
          <View style={tw`flex-row items-center justify-between gap-3`}>
            <View style={tw`flex-1`}>
              <Text style={[tw`text-lg font-semibold`, { color: palette.text }]}>Fees &amp; balances</Text>
              <Text style={[tw`mt-1 text-xs`, { color: palette.textMuted }]}>
                Your balance is calculated from charges and payments recorded by the school.
              </Text>
            </View>

            <View style={tw`flex-row items-center gap-2`}>
              <TouchableOpacity
                onPress={refreshFees}
                style={[
                  tw`px-3 py-1.5 rounded-full`,
                  { borderWidth: 1, borderColor: palette.border, backgroundColor: palette.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.95)' },
                ]}
              >
                <Text style={[tw`text-[11px] font-medium`, { color: palette.text }]}>Refresh</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={navTargets.fees}
                style={[tw`px-4 py-2 rounded-2xl`, { backgroundColor: '#059669' }]}
              >
                <Text style={[tw`text-sm font-semibold`, { color: '#fff' }]}>💳 Open fees</Text>
              </TouchableOpacity>
            </View>
          </View>

          {!isProTier ? (
            <View
              style={[
                tw`mt-3 rounded-2xl p-3`,
                { borderWidth: 1, borderColor: palette.isDark ? 'rgba(245,158,11,0.35)' : 'rgba(245,158,11,0.30)', backgroundColor: palette.isDark ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.10)' },
              ]}
            >
              <Text style={[tw`text-xs`, { color: palette.text }]}>
                This institution’s fees module is available on <Text style={tw`font-semibold`}>Pro/Enterprise</Text>. If you need fee access, ask your admin.
              </Text>
            </View>
          ) : statementQ.isLoading ? (
            <Text style={[tw`mt-3 text-sm`, { color: palette.textMuted }]}>Loading your balances…</Text>
          ) : statementQ.error ? (
            <View
              style={[
                tw`mt-3 rounded-2xl p-3`,
                { borderWidth: 1, borderColor: palette.isDark ? 'rgba(244,63,94,0.35)' : 'rgba(244,63,94,0.25)', backgroundColor: palette.isDark ? 'rgba(244,63,94,0.12)' : 'rgba(244,63,94,0.08)' },
              ]}
            >
              <Text style={[tw`text-xs`, { color: palette.text }]}>
                Could not load balances.{' '}
                <Text style={{ color: palette.textMuted }}>
                  {String(((statementQ.error as any)?.message || statementQ.error) ?? '')}
                </Text>
              </Text>
            </View>
          ) : !statement ? (
            <Text style={[tw`mt-3 text-sm`, { color: palette.textMuted }]}>
              No fee statement is available yet. Please ask the school office.
            </Text>
          ) : summaryBy.length > 1 ? (
            <View style={tw`mt-4 gap-3`}>
              {summaryBy.map((r: any) => (
                <View key={String(r.currency)} style={palette.smallSurface()}>
                  <Text style={[tw`text-[11px]`, { color: palette.textSubtle }]}>
                    {String(r.currency || '').toUpperCase()}
                  </Text>
                  <View style={tw`mt-2 gap-1`}>
                    <View style={tw`flex-row justify-between`}>
                      <Text style={[tw`text-xs`, { color: palette.textMuted }]}>Total billed</Text>
                      <Text style={[tw`text-xs font-semibold`, { color: palette.text }]}>
                        {moneyFromCents(r.total_charges, r.currency)}
                      </Text>
                    </View>
                    <View style={tw`flex-row justify-between`}>
                      <Text style={[tw`text-xs`, { color: palette.textMuted }]}>Total paid</Text>
                      <Text style={[tw`text-xs font-semibold`, { color: palette.text }]}>
                        {moneyFromCents(r.total_payments, r.currency)}
                      </Text>
                    </View>
                    <View style={tw`flex-row justify-between`}>
                      <Text style={[tw`text-xs`, { color: palette.textMuted }]}>Balance</Text>
                      <Text style={[tw`text-xs font-semibold`, { color: palette.text }]}>
                        {moneyFromCents(r.balance, r.currency)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={tw`mt-4 flex-row gap-3`}>
              <View style={[palette.smallSurface(tw`flex-1`)]}>
                <Text style={[tw`text-[11px]`, { color: palette.textSubtle }]}>Total billed</Text>
                <Text style={[tw`mt-1 text-lg font-bold`, { color: palette.text }]}>
                  {moneyFromCents(billedCents, primaryCurrency)}
                </Text>
              </View>
              <View style={[palette.smallSurface(tw`flex-1`)]}>
                <Text style={[tw`text-[11px]`, { color: palette.textSubtle }]}>Total paid</Text>
                <Text style={[tw`mt-1 text-lg font-bold`, { color: palette.text }]}>
                  {moneyFromCents(paidCents, primaryCurrency)}
                </Text>
              </View>
              <View style={[palette.smallSurface(tw`flex-1`)]}>
                <Text style={[tw`text-[11px]`, { color: palette.textSubtle }]}>Balance</Text>
                <Text style={[tw`mt-1 text-lg font-bold`, { color: palette.text }]}>
                  {moneyFromCents(balanceCents, primaryCurrency)}
                </Text>
              </View>
            </View>
          )}

          {/* Expected total + share */}
          <View style={[tw`mt-4 pt-4`, { borderTopWidth: 1, borderTopColor: palette.border }]}>
            <View style={tw`flex-row flex-wrap items-center justify-between gap-2`}>
              <Text style={[tw`text-xs`, { color: palette.textMuted }]}>
                Fee structure:{' '}
                <Text style={[tw`font-semibold`, { color: palette.text }]}>{previewStructureTitle}</Text>
              </Text>

              <Text style={[tw`text-xs`, { color: palette.textMuted }]}>
                Expected total:{' '}
                <Text style={[tw`font-semibold`, { color: palette.text }]}>
                  {expectedTotalCents > 0 ? moneyFromCents(expectedTotalCents, expectedCurrency) : '—'}
                </Text>
              </Text>
            </View>

            {isProTier && expectedTotalCents > 0 ? (
              <View style={tw`mt-3 gap-2`}>
                <View style={palette.smallSurface()}>
                  <Text style={[tw`text-[11px]`, { color: palette.textSubtle }]}>Paid (share)</Text>
                  <Text style={[tw`mt-1 text-sm font-semibold`, { color: palette.text }]}>
                    {moneyFromCents(paidForExpectedCents, expectedCurrency)}{' '}
                    <Text style={{ color: palette.textMuted }}>• {paidSharePct}%</Text>
                  </Text>
                  <View style={[tw`mt-2 h-2 rounded-full overflow-hidden`, { backgroundColor: palette.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(226,232,240,0.85)' }]}>
                    <View style={{ height: '100%', width: `${paidSharePctClamped}%`, backgroundColor: 'rgba(16,185,129,0.75)' }} />
                  </View>
                </View>

                <View style={tw`flex-row gap-2`}>
                  <View style={[palette.smallSurface(tw`flex-1`)]}>
                    <Text style={[tw`text-[11px]`, { color: palette.textSubtle }]}>Remaining (to expected)</Text>
                    <Text style={[tw`mt-1 text-sm font-semibold`, { color: palette.text }]}>
                      {moneyFromCents(expectedRemainingCents, expectedCurrency)}
                    </Text>
                    <Text style={[tw`mt-1 text-[11px]`, { color: palette.textSubtle }]}>
                      Based on the published fee structure.
                    </Text>
                  </View>

                  <View style={[palette.smallSurface(tw`flex-1`)]}>
                    <Text style={[tw`text-[11px]`, { color: palette.textSubtle }]}>Expected total</Text>
                    <Text style={[tw`mt-1 text-sm font-semibold`, { color: palette.text }]}>
                      {moneyFromCents(expectedTotalCents, expectedCurrency)}
                    </Text>
                    <Text style={[tw`mt-1 text-[11px]`, { color: palette.textSubtle }]}>
                      “Expected” may differ from “Billed”.
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}

            {!isProTier ? (
              <Text style={[tw`mt-2 text-sm`, { color: palette.textMuted }]}>
                Fee structure preview is available on Pro/Enterprise.
              </Text>
            ) : showStructureLoading ? (
              <Text style={[tw`mt-2 text-sm`, { color: palette.textMuted }]}>Loading fee structure…</Text>
            ) : showStructureError ? (
              <Text style={[tw`mt-2 text-sm`, { color: palette.textMuted }]}>Could not load fee structure.</Text>
            ) : previewItems?.length ? (
              <View style={[tw`mt-3 rounded-2xl overflow-hidden`, { borderWidth: 1, borderColor: palette.border, backgroundColor: palette.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.95)' }]}>
                {previewItems.slice(0, 6).map((it, idx) => (
                  <View
                    key={String(it?.id ?? idx)}
                    style={[
                      tw`px-3 py-2 flex-row items-center justify-between gap-2`,
                      idx > 0 ? { borderTopWidth: 1, borderTopColor: palette.border } : null,
                    ]}
                  >
                    <Text style={[tw`text-xs flex-1`, { color: palette.textMuted }]} numberOfLines={1}>
                      {it?.label || it?.name || it?.title || `Item ${idx + 1}`}
                    </Text>
                    <Text style={[tw`text-xs font-semibold`, { color: palette.text }]}>
                      {moneyFromCents(amountToCents(it), pickString(it?.currency, expectedCurrency))}
                    </Text>
                  </View>
                ))}

                {previewItems.length > 6 ? (
                  <Text style={[tw`px-3 py-2 text-[11px]`, { color: palette.textSubtle }]}>
                    + {previewItems.length - 6} more items (open fees to view all)
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={[tw`mt-2 text-sm`, { color: palette.textMuted }]}>No structure items found yet.</Text>
            )}
          </View>
        </View>

        {/* Exam results & report cards */}
        <View style={palette.surface(tw`mt-4`)}>
          <Text style={[tw`text-lg font-semibold`, { color: palette.text }]}>Exam results &amp; report cards</Text>
          <Text style={[tw`mt-1 text-xs`, { color: palette.textMuted }]}>
            View your official institution exam marks and download report cards as PDF for each term or exam session.
          </Text>

          <TouchableOpacity
            onPress={navTargets.exams}
            style={[tw`mt-3 px-4 py-2 rounded-2xl items-center`, { backgroundColor: '#0284c7' }]}
          >
            <Text style={[tw`text-sm font-semibold`, { color: '#fff' }]}>📄 Open my results</Text>
          </TouchableOpacity>

          <Text style={[tw`mt-2 text-[11px]`, { color: palette.textSubtle }]}>
            Results are powered by your institution&apos;s DayBreak exams workspace. You can save or print the downloaded report cards.
          </Text>
        </View>

        {/* Learning tools (tiles grid like web) */}
        <View style={palette.surface(tw`mt-4`)}>
          <View style={tw`flex-row items-center justify-between`}>
            <View style={tw`flex-1`}>
              <Text style={[tw`text-base font-semibold`, { color: palette.text }]}>Learning tools</Text>
              <Text style={[tw`mt-1 text-xs`, { color: palette.textMuted }]}>
                Tap an activity. Everything here is personalized for you.
              </Text>
            </View>
          </View>

          <View style={tw`mt-4 gap-3`}>
            {tileRows.map((row, idx) => (
              <View key={`row-${idx}`} style={tw`flex-row gap-3`}>
                {row.map((tile: any) => (
                  <View key={tile.key} style={tw`flex-1`}>
                    <Tile
                      palette={palette}
                      emoji={tile.emoji}
                      title={tile.title}
                      subtitle={tile.subtitle}
                      tone={tile.tone}
                      badge={tile.badge}
                      disabled={tile.disabled}
                      onPress={tile.onPress}
                    />
                  </View>
                ))}
                {row.length === 1 ? <View style={tw`flex-1`} /> : null}
              </View>
            ))}

            {!newslettersLoading && learnerNewsletters?.length ? (
              <View
                style={[
                  tw`mt-1 rounded-2xl p-3`,
                  { borderWidth: 1, borderColor: palette.border, backgroundColor: palette.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(241,245,249,1)' },
                ]}
              >
                <Text style={[tw`text-[11px] uppercase tracking-[1.6px]`, { color: palette.textSubtle }]}>
                  Latest newsletter
                </Text>
                <Text style={[tw`mt-1 text-sm font-semibold`, { color: palette.text }]} numberOfLines={2}>
                  {latestNewsletterTitle}
                </Text>
                <TouchableOpacity onPress={navTargets.newsletters} style={tw`mt-2`}>
                  <Text style={[tw`text-xs font-semibold`, { color: palette.isDark ? '#a5b4fc' : '#4f46e5' }]}>
                    Open newsletters →
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>

        {/* Helpful chips */}
        <View style={palette.surface(tw`mt-4 mb-4`)}>
          <Text style={[tw`text-base font-semibold mb-2`, { color: palette.text }]}>Helpful</Text>

          <View style={tw`flex-row flex-wrap gap-2`}>
            {[
              { label: 'Assignments', go: navTargets.assignments },
              { label: 'Exam results', go: navTargets.exams },
              { label: 'Certificates', go: navTargets.certificates },
              { label: 'Course library', go: navTargets.courses },
              { label: 'Institution profile', go: () => navigation.navigate('OrgProfile') },
              { label: 'Help', go: () => navigation.navigate('Help') },
            ].map((x) => (
              <TouchableOpacity
                key={x.label}
                onPress={x.go}
                style={[
                  tw`px-3 py-1 rounded-full`,
                  { backgroundColor: palette.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(241,245,249,1)', borderWidth: 1, borderColor: palette.border },
                ]}
              >
                <Text style={[tw`text-xs`, { color: palette.text }]}>{x.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default OrgLearnerHomeNative;
