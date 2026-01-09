// apps/mobile/src/screens/org/OrgElearnPortal.native.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Share,
  Linking,
  Switch,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { CommonActions, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import visamaster from '../../../assets/visamaster.png';
import mpesa from '../../../assets/mpesa.png';

import * as DocumentPicker from 'expo-document-picker';

import tw from '../../../tailwind';
import { useShopContext } from '@mytutorapp/shared/context';
import { uploadAsset } from '@mytutorapp/shared/api';

import {
  getMyOrgOrBootstrap,
  getOrgUsage,
  updateOrgBranding,
  createOrgAssignment,
  getOrgAnalytics,
  upgradeOrgTier,
  sendOrgReportTest,
  sendOrgReportRow,
  initOrgSubscription,
  confirmOrgSubscription,
  getOrgLearnersProgress,
  getOrgAssignmentsForLearner,
  submitOrgLegacyAssignment,
  createOrgLegacyAssignment,

  // ✅ parity with web
  getOrgRoster,
  getOrgAssignmentSubmissions,
  apiMarkOrgAssignmentOpened,
  type OrgResp as Org,
  type OrgAnalyticsRow,
  type OrgLearnerProgressRow,
  type OrgAssignmentRow,
} from '@mytutorapp/shared/api/orgApi';
import PlanPurchaseModalNative from './PlanPurchaseModal.native';
import type { MainStackParamList } from '../../navigation/types';
import type { OrgTier } from '@mytutorapp/shared/types';
import { useThemePref } from '../../theme/ThemeContext';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';

type TabKey = 'branding' | 'assign' | 'analytics' | 'examResults' | 'tools';

type Period = 'month' | 'term' | 'year';

const PAY_DEBUG = true; // turn off later
const RETURN_TO_KEY = 'org:returnToAfterSubmissions';

function redact(obj: any) {
  try {
    // avoid leaking tokens
    const clone = JSON.parse(JSON.stringify(obj ?? {}));
    if (clone?.headers?.Authorization) clone.headers.Authorization = 'Bearer ***';
    if (clone?.config?.headers?.Authorization) clone.config.headers.Authorization = 'Bearer ***';
    return clone;
  } catch {
    return obj;
  }
}

function payLog(label: string, data?: any) {
  if (!PAY_DEBUG) return;
  console.log(label, redact(data));
}

function openedKey(orgId: string | number) {
  return `org:openedAssignments:${orgId}`;
}

async function readOpenedMap(orgId: string | number): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(openedKey(orgId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeOpened(orgId: string | number, assignmentId: string | number, iso: string) {
  try {
    const key = openedKey(orgId);
    const current = await readOpenedMap(orgId);
    const next = { ...current, [assignmentId]: iso };
    await AsyncStorage.setItem(key, JSON.stringify(next));
  } catch {
    // ignore
  }
}

const ORG_TIERS: Record<OrgTier, { seats: number; features: string[] }> = {
  starter: {
    seats: 50,
    features: ['Branding', 'Assignments', 'Monthly analytics'],
  },
  pro: {
    seats: 500,
    features: ['Custom pass marks & timers', 'Monthly/Termly/Yearly analytics', 'Email reports'],
  },
  enterprise: {
    seats: 5000,
    features: ['SSO / domain restrict', 'CSV export', 'Webhooks', 'Priority support'],
  },
};

function resolveApprovalUrl(init: unknown): string | undefined {
  const obj = init as any;
  const candidates = [
    // ✅ add these
    obj?.authorizationUrl,
    obj?.checkoutUrl,
    obj?.approvalUrl,

    // existing
    obj?.approvalUrl,
    obj?.approveUrl,
    obj?.approval_url,
    obj?.redirectUrl,
    obj?.checkoutUrl,
    obj?.checkout_url,
    obj?.url,
    obj?.authorization_url,

    // axios / wrapped responses
    obj?.data?.authorizationUrl, // ✅ add
    obj?.data?.checkoutUrl, // ✅ add
    obj?.data?.approvalUrl, // ✅ add

    obj?.data?.approvalUrl,
    obj?.data?.approveUrl,
    obj?.data?.approval_url,
    obj?.data?.redirectUrl,
    obj?.data?.checkoutUrl,
    obj?.data?.checkout_url,
    obj?.data?.url,
    obj?.data?.authorization_url,

    // deeper nesting
    obj?.data?.data?.authorizationUrl,
    obj?.data?.data?.authorization_url,
    obj?.data?.data?.approval_url,
    obj?.data?.data?.checkoutUrl,
    obj?.data?.data?.url,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('http')) return c;
  }

  const links = Array.isArray(obj?.links)
    ? obj.links
    : Array.isArray(obj?.data?.links)
      ? obj.data.links
      : undefined;
  const approve = links?.find?.(
    (l: any) => l?.rel === 'approve' && typeof l?.href === 'string'
  )?.href;
  if (approve) return approve;

  if (typeof obj?.href === 'string') return obj.href;
  if (typeof obj?.data?.href === 'string') return obj.data.href;

  return undefined;
}

function resolvePaymentId(init: unknown): string | null {
  const obj = init as any;
  const candidates = [
    obj?.paymentId,
    obj?.id,
    obj?.data?.paymentId,
    obj?.data?.id,
    obj?.data?.data?.paymentId,
    obj?.data?.data?.id,

    // paystack “reference” is often what you store/use to confirm
    obj?.reference,
    obj?.data?.reference,
    obj?.data?.data?.reference,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

const Pill = ({ children }: { children: React.ReactNode }) => (
  <View
    style={tw`px-2 py-0.5 rounded-full bg-[#e7edf4] dark:bg-white/10 border border-[#d1e2f4] dark:border-white/10`}
  >
    <Text style={tw`text-[11px] text-[#0d141c] dark:text-white/90`}>{children}</Text>
  </View>
);

function useFeatureGates(tier: OrgTier) {
  const has = useCallback(
    (needle: string) => {
      const list = ORG_TIERS[tier]?.features || [];
      return list.some((f) => f.toLowerCase().includes(needle.toLowerCase()));
    },
    [tier]
  );

  return {
    canBranding: true,
    canAssignments: true,
    canMonthly: true,
    canCustomPassTimers: has('custom pass marks'),
    canMultiPeriodAnalytics: has('monthly/termly/yearly'),
    canEmailReports: has('email reports'),
    canSSO: has('sso'),
    canCSV: has('csv'),
    canWebhooks: has('webhooks'),
    hasPrioritySupport: has('priority support'),
  };
}

/** ─────────────────────────────────────────────────────────
 * Analytics summary (same idea as web, safe fallbacks)
 * ───────────────────────────────────────────────────────── */
type OrgAnalyticsSummary = {
  totalAttempts: number;
  totalPasses: number;
  overallPassRate: number;
  overallAvgScore: number;

  examsAttempts: number;
  examsPasses: number;
  examsPassRate: number;

  robotQuizAttempts: number;
  robotQuizPasses: number;
  robotQuizPassRate: number;

  assignmentAttempts: number;
  assignmentPasses: number;
  assignmentPassRate: number;

  examCardsGenerated?: number;
};

function deriveAnalyticsSummary(
  rows: OrgAnalyticsRow[],
  apiSummary?: Partial<OrgAnalyticsSummary> | null
): OrgAnalyticsSummary {
  type ExtRow = OrgAnalyticsRow & {
    source_kind?: string | null;
    source?: string | null;
    kind?: string | null;
    exams_attempts?: number | null;
    exams_passes?: number | null;
    robot_attempts?: number | null;
    robot_passes?: number | null;
    assignment_attempts?: number | null;
    assignment_passes?: number | null;
    exam_cards_generated?: number | null;
  };

  const extRows = (rows || []) as ExtRow[];

  let totalAttempts = 0;
  let totalPasses = 0;
  let scoreWeightedSum = 0;
  let scoreWeight = 0;

  let examsAttempts = 0;
  let examsPasses = 0;
  let robotAttempts = 0;
  let robotPasses = 0;
  let assignmentAttempts = 0;
  let assignmentPasses = 0;
  let examCardsGenerated = 0;

  for (const r of extRows) {
    const attempts = Number(r.attempts ?? 0);
    const passes = Number(r.passes ?? 0);
    const avg = Number((r as any).avg_score ?? (r as any).avgScore ?? 0);

    totalAttempts += attempts;
    totalPasses += passes;

    if (attempts > 0 && Number.isFinite(avg)) {
      scoreWeightedSum += avg * attempts;
      scoreWeight += attempts;
    }

    examsAttempts += Number(r.exams_attempts ?? 0);
    examsPasses += Number(r.exams_passes ?? 0);
    robotAttempts += Number(r.robot_attempts ?? 0);
    robotPasses += Number(r.robot_passes ?? 0);
    assignmentAttempts += Number(r.assignment_attempts ?? 0);
    assignmentPasses += Number(r.assignment_passes ?? 0);
    examCardsGenerated += Number(r.exam_cards_generated ?? 0);

    const kindRaw = String(r.source_kind ?? r.kind ?? r.source ?? '').toLowerCase();
    if (kindRaw.includes('exam')) {
      examsAttempts += attempts;
      examsPasses += passes;
    } else if (kindRaw.includes('assign')) {
      assignmentAttempts += attempts;
      assignmentPasses += passes;
    } else if (kindRaw.includes('quiz') || kindRaw.includes('robot')) {
      robotAttempts += attempts;
      robotPasses += passes;
    }
  }

  const overallPassRate = totalAttempts > 0 ? Math.round((totalPasses * 100) / totalAttempts) : 0;
  const overallAvgScore = scoreWeight > 0 ? +(scoreWeightedSum / scoreWeight).toFixed(1) : 0;

  const hasAnySourceSplit = examsAttempts > 0 || robotAttempts > 0 || assignmentAttempts > 0;
  if (!hasAnySourceSplit && totalAttempts > 0) {
    robotAttempts = totalAttempts;
    robotPasses = totalPasses;
  }

  const base: OrgAnalyticsSummary = {
    totalAttempts,
    totalPasses,
    overallPassRate,
    overallAvgScore,
    examsAttempts,
    examsPasses,
    examsPassRate: examsAttempts > 0 ? Math.round((examsPasses * 100) / examsAttempts) : 0,
    robotQuizAttempts: robotAttempts,
    robotQuizPasses: robotPasses,
    robotQuizPassRate: robotAttempts > 0 ? Math.round((robotPasses * 100) / robotAttempts) : 0,
    assignmentAttempts,
    assignmentPasses,
    assignmentPassRate:
      assignmentAttempts > 0 ? Math.round((assignmentPasses * 100) / assignmentAttempts) : 0,
    examCardsGenerated: examCardsGenerated || undefined,
  };

  if (!apiSummary) return base;

  const safeNum = (v: any) => (Number.isFinite(v) ? Number(v) : 0);
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(apiSummary).map(([k, v]) => [k, typeof v === 'number' ? safeNum(v) : v])
    ),
  } as OrgAnalyticsSummary;
}

const ToolIconTile = ({
  emoji,
  title,
  subtitle,
  disabled,
  badge,
  onPress,
}: {
  emoji: string;
  title: string;
  subtitle?: string;
  disabled?: boolean;
  badge?: string;
  onPress?: () => void;
}) => {
  const Wrap: any = disabled ? View : TouchableOpacity;

  return (
    <Wrap
      {...(!disabled ? { onPress } : {})}
      style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] overflow-hidden ${disabled ? 'opacity-60' : ''}`}
    >
      <View style={tw`p-3 min-h-[108px] items-center justify-center`}>
        {!!badge && (
          <View style={tw`absolute top-2 left-2 px-2 py-0.5 rounded-full border border-[#cedbe8] dark:border-white/10 bg-[#e7edf4] dark:bg-white/10`}>
            <Text style={tw`text-[10px] text-[#49739c] dark:text-white/70`}>{badge}</Text>
          </View>
        )}

        <View style={tw`h-12 w-12 rounded-2xl items-center justify-center border border-[#d1e2f4] dark:border-white/10 bg-[#f2f6fb] dark:bg-white/10`}>
          <Text style={tw`text-2xl`}>{emoji}</Text>
        </View>

        <Text style={tw`mt-2 text-sm font-semibold text-[#0d141c] dark:text-white`} numberOfLines={1}>
          {title}
        </Text>

        {!!subtitle && (
          <Text style={tw`mt-1 text-[11px] text-center text-[#6b7280] dark:text-white/70`} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
    </Wrap>
  );
};


const ScopeFields = ({
  classLabel,
  subjectKey,
  onChangeClass,
  onChangeSubject,
  errors,
  resolvedScheme,
}: {
  classLabel: string;
  subjectKey: string;
  onChangeClass: (v: string) => void;
  onChangeSubject: (v: string) => void;
  errors: { classLabel?: string; subjectKey?: string };
  resolvedScheme: 'light' | 'dark';
}) => {
  const borderErr = 'border-red-500/70';
  const borderOk = 'border-[#cedbe8] dark:border-white/10';

  return (
    <View style={tw`mt-3`}>
      <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
        Class / Grade <Text style={tw`text-red-500`}>*</Text>
      </Text>
      <TextInput
        style={tw`mt-1 px-3 py-2 rounded bg-white dark:bg-[#0f1821] border ${errors.classLabel ? borderErr : borderOk} text-[#0d141c] dark:text-white text-xs`}
        placeholder="e.g. Grade 7 Blue"
        placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
        value={classLabel}
        onChangeText={onChangeClass}
      />
      {!!errors.classLabel && (
        <Text style={tw`mt-1 text-[11px] text-red-600 dark:text-red-300`}>
          {errors.classLabel}
        </Text>
      )}

      <View style={tw`h-3`} />

      <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
        Subject <Text style={tw`text-red-500`}>*</Text>
      </Text>
      <TextInput
        style={tw`mt-1 px-3 py-2 rounded bg-white dark:bg-[#0f1821] border ${errors.subjectKey ? borderErr : borderOk} text-[#0d141c] dark:text-white text-xs`}
        placeholder="e.g. Mathematics, English, Physics"
        placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
        value={subjectKey}
        onChangeText={onChangeSubject}
      />
      {!!errors.subjectKey && (
        <Text style={tw`mt-1 text-[11px] text-red-600 dark:text-red-300`}>
          {errors.subjectKey}
        </Text>
      )}
    </View>
  );
};


/* ──────────────────────────────
   Main screen
────────────────────────────── */
const OrgElearnPortalNative: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { backendUrl, token, orgToken } = useShopContext() as any;
  const authToken: string | undefined = orgToken || token;

  const { org: orgCtx, role, membership } = (useOrg() ?? {}) as any;

const roleNorm = String(role || '').trim().toLowerCase();
// treat tutor == instructor for org screens
const isInstructor = roleNorm === 'instructor' || roleNorm === 'tutor';


  const route = useRoute<RouteProp<MainStackParamList, 'OrgElearnPortal'>>();
  const navigation = useNavigation<any>();
  const smartNavigate = useCallback(
    (routeName: string, params?: any) => {
      let nav: any = navigation;

      // climb up until we find a navigator that actually knows this route
      while (nav) {
        const names = nav.getState?.()?.routeNames;
        if (Array.isArray(names) && names.includes(routeName)) {
          nav.navigate(routeName, params);
          return;
        }
        nav = nav.getParent?.();
      }

      // last resort: dispatch a navigate action (may bubble)
      navigation.dispatch(CommonActions.navigate({ name: routeName as never, params } as never));
    },
    [navigation]
  );

  

  const handleBackToAssignments = useCallback(async () => {
    let returnTo: string | null = null;
    try {
      returnTo = await AsyncStorage.getItem(RETURN_TO_KEY);
    } catch {}

    if (returnTo) {
      try {
        await AsyncStorage.removeItem(RETURN_TO_KEY);
      } catch {}

      // return to instructor home and ask it to scroll to recent submissions
      smartNavigate('OrgInstructorHome', { scrollTo: 'recent-submissions' });
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    smartNavigate('OrgInstructorHome', { scrollTo: 'recent-submissions' });
  }, [navigation, smartNavigate]);

const openExamResults = useCallback(() => {
  const parent = navigation.getParent?.(); // parent Stack above Tab navigator (if any)
  (parent ?? navigation).navigate('OrgExamResultsPortal', { view: 'admin' });
}, [navigation]);

  const paramsAny = (route.params || {}) as any;

  const viewParam = paramsAny.view;
  const isLearnerView = viewParam === 'learner';
  const isSubmissionsView = !isLearnerView && viewParam === 'submissions';
  const assignmentIdFromRoute = paramsAny.assignmentId ?? paramsAny.assignment_id ?? '';

  const learnerStudentId = paramsAny.studentId ?? paramsAny.student_id ?? '';
  const learnerClassFromRoute = paramsAny.class ?? paramsAny.class_label ?? '';
  const learnerSubjectFromRoute =
    paramsAny.subject ?? paramsAny.subjectKey ?? paramsAny.subject_key ?? '';

  const [tab, setTab] = useState<TabKey>(isLearnerView || isInstructor ? 'assign' : 'branding');

  const [org, setOrg] = useState<Org | null>(null);
  const tier: OrgTier = (org?.tier as OrgTier) || 'starter';
  const tierMeta = ORG_TIERS[tier];
  const isProTier = tier === 'pro' || tier === 'enterprise';
  const seatsMax = tierMeta.seats;

  const primaryMembership = useMemo(() => (Array.isArray(membership) ? membership[0] : membership), [membership]);
  const hasFeeAccess =
    isProTier && (role || '').toLowerCase() === 'instructor' && (primaryMembership as any)?.can_access_fees === true;

  const learnerClassLabelResolved = useMemo(() => {
  const m: any = primaryMembership || {};
  return pickFirstStr(
    learnerClassFromRoute,
    paramsAny?.classLabel,
    m.class_label,
    m.classLabel
  );
}, [learnerClassFromRoute, paramsAny?.classLabel, primaryMembership]);

const learnerSubjectKeyResolved = useMemo(() => {
  const m: any = primaryMembership || {};
  return pickFirstStr(
    learnerSubjectFromRoute,
    paramsAny?.subjectKey,
    m.subject_key,
    m.subjectKey
  );
}, [learnerSubjectFromRoute, paramsAny?.subjectKey, primaryMembership]);


  const [seatsUsed, setSeatsUsed] = useState<number>(0);
  const [showProModal, setShowProModal] = useState(false);
  const [showEnterpriseModal, setShowEnterpriseModal] = useState(false);
  const { resolvedScheme } = useThemePref();

  const palette = useMemo(() => {
  const dark = resolvedScheme === 'dark';

  return {
    border: dark ? 'rgba(255,255,255,0.10)' : '#cedbe8',
    text: dark ? 'rgba(255,255,255,0.92)' : '#0d141c',
    textMuted: dark ? 'rgba(255,255,255,0.70)' : '#49739c',
    textSubtle: dark ? 'rgba(255,255,255,0.60)' : '#6b7280',
    softCard: dark ? 'rgba(255,255,255,0.06)' : '#e7edf4',
    headerBg: dark ? 'rgba(255,255,255,0.04)' : '#f8fbff',
    card: dark ? '#0f1821' : '#ffffff',

    // you call palette.chipBg('#6366f1') — keep the signature
    chipBg: (_hex?: string) => (dark ? 'rgba(99,102,241,0.18)' : '#e0e7ff'),
  };
}, [resolvedScheme]);


  const canBrandingRole = !isInstructor && !isLearnerView && !isSubmissionsView;
  const canUpgradePlan = !isInstructor && !isLearnerView && !isSubmissionsView;

  // branding form
  const [form, setForm] = useState<any>({
    name: '',
    logo_url: '',
    signature_url: '',
    instructor_signature_url: '',
     bursar_signature_url: '',
    certificate_title: 'Certificate of Completion',
    default_pass_mark: 70,
    quiz_time_limit_s: 900,
    allow_retry: false,
    email_domain: '',
    webhook_url: '',
    webhook_enabled: true,
    address_line1: '',
    address_line2: '',
    phone_number: '',
    contact_email: '',
    website_url: '',
  });

  // collapsible sections
  const [showLogoSection, setShowLogoSection] = useState(true);
  const [showSsoSection, setShowSsoSection] = useState(true);
  const [showInstructorsSection, setShowInstructorsSection] = useState(false);

  // upload busy
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [uploadingInstructorSignature, setUploadingInstructorSignature] = useState(false);
  const [uploadingBursarSignature, setUploadingBursarSignature] = useState(false);

  // Assign (AI course)
  const [courseId, setCourseId] = useState('');
  const [titleOverride, setTitleOverride] = useState('');
  const [passMark, setPassMark] = useState<number | ''>('');
  const [timer, setTimer] = useState<number | ''>('');
  const [dueAt, setDueAt] = useState<string>('');
  const [inviteLink, setInviteLink] = useState<string>('');

  // Scope (class / subject) for legacy + hints
  const [assignClassLabel, setAssignClassLabel] = useState('');
  const [assignSubjectKey, setAssignSubjectKey] = useState('');

  // deadline pickers
  const [legacyDueDate, setLegacyDueDate] = useState<Date | null>(null);
  const [legacyDuePickerOpen, setLegacyDuePickerOpen] = useState(false);

  const [aiDueDate, setAiDueDate] = useState<Date | null>(null);
  const [aiDuePickerOpen, setAiDuePickerOpen] = useState(false);

  // legacy assignment create
  const [legacyTitle, setLegacyTitle] = useState('');
  const [legacyInstructions, setLegacyInstructions] = useState('');
  const [legacyDueAt, setLegacyDueAt] = useState('');
  const [legacyAttachmentUrl, setLegacyAttachmentUrl] = useState<string | null>(null);
  const [legacyAttachmentLabel, setLegacyAttachmentLabel] = useState<string | null>(null);
  const [legacyUploadingAttachment, setLegacyUploadingAttachment] = useState(false);
  const [creatingLegacyAssignment, setCreatingLegacyAssignment] = useState(false);

  // analytics
  const [period, setPeriod] = useState<Period>('month');
  const [analytics, setAnalytics] = useState<OrgAnalyticsRow[]>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsSummary, setAnalyticsSummary] = useState<OrgAnalyticsSummary | null>(null);

  const [showCongrats, setShowCongrats] = useState(false);

  // learner progress
  const [lpRows, setLpRows] = useState<OrgLearnerProgressRow[]>([]);
  const [lpCursor, setLpCursor] = useState<string | null>(null);
  const [lpLoading, setLpLoading] = useState(false);

  // learner assignment view (legacy)
  const [learnerAssignments, setLearnerAssignments] = useState<OrgAssignmentRow[]>([]);
  const [learnerAssignmentsLoading, setLearnerAssignmentsLoading] = useState(false);
  const [aiPage, setAiPage] = useState(1);
  const [aiPageSize, setAiPageSize] = useState(10);
  const [classicPage, setClassicPage] = useState(1);
  const [classicPageSize, setClassicPageSize] = useState(10);

  const [scopeErrors, setScopeErrors] = useState<{ classLabel?: string; subjectKey?: string }>({});

const validateScope = useCallback(() => {
  const cls = (assignClassLabel || '').trim();
  const subj = (assignSubjectKey || '').trim();

  const next: { classLabel?: string; subjectKey?: string } = {};
  if (!cls) next.classLabel = 'Class/Grade is required';
  if (!subj) next.subjectKey = 'Subject is required';

  setScopeErrors(next);
  return Object.keys(next).length === 0;
}, [assignClassLabel, assignSubjectKey]);

const onChangeClassScope = useCallback((v: string) => {
  setAssignClassLabel(v);
  setScopeErrors((e) => ({ ...e, classLabel: undefined }));
}, []);

const onChangeSubjectScope = useCallback((v: string) => {
  setAssignSubjectKey(v);
  setScopeErrors((e) => ({ ...e, subjectKey: undefined }));
}, []);


  const isAiAssignmentRow = (row: OrgAssignmentRow) => {
    const invite = (row as any).invite_code || (row as any).inviteCode || null;
    if (invite) return true;

    const kind = ((row as any).source_kind || (row as any).kind || '').toString().toLowerCase();
    return kind.includes('robot') || kind.includes('ai') || kind.includes('teach');
  };

  const assignmentKey = (row: OrgAssignmentRow) => {
    const invite = (row as any).invite_code || (row as any).inviteCode || null;
    const createdAt = (row as any).created_at || (row as any).createdAt || '';
    const courseId = (row as any).course_id || (row as any).courseId || null;

    if (row.id != null) return String(row.id);
    if (invite) return String(invite);
    if (courseId || createdAt) return `${courseId || 'course'}-${createdAt || 'created'}`;
    return 'assignment-row';
  };

  type ClassicWorkStatus = 'pending' | 'submitted' | 'opened' | 'marked';

function pickIso(...xs: any[]): string | null {
  for (const x of xs) {
    if (typeof x !== 'string') continue;
    const d = new Date(x);
    if (!Number.isNaN(d.getTime())) return x;
  }
  return null;
}

function pickFirstStr(...xs: any[]): string {
  for (const x of xs) {
    if (typeof x === 'string' && x.trim()) return x.trim();
  }
  return '';
}


function deriveClassicWorkStatus(a: any): ClassicWorkStatus {
  // 1) Prefer explicit server status fields (web likely uses these now)
  const raw = String(
    a?.my_status ??
      a?.submission_status ??
      a?.review_status ??
      a?.status ??
      a?.state ??
      a?.progress_status ??
      ''
  )
    .trim()
    .toLowerCase();

  if (/(marked|graded|reviewed|checked|done)/i.test(raw)) return 'marked';
  if (/(opened|viewed|seen)/i.test(raw)) return 'opened';
  if (/(submitted|turned\s?in)/i.test(raw)) return 'submitted';
  if (/(pending|todo|assigned)/i.test(raw)) return 'pending';

  // 2) Otherwise infer from timestamps (backend changes often add these)
  const markedAt = pickIso(
    a?.my_marked_at,
    a?.marked_at,
    a?.graded_at,
    a?.reviewed_at,
    a?.latest_marked_at,
    a?.teacher_marked_at
  );
  if (markedAt) return 'marked';

  const openedAt = pickIso(
    a?.my_opened_at,
    a?.opened_at,
    a?.latest_opened_at,
    a?.viewed_at,
    a?.teacher_opened_at
  );
  if (openedAt) return 'opened';

  const submittedAt = pickIso(
    a?.my_submission_created_at,
    a?.latest_submission_at,
    a?.submitted_at,
    a?.last_submitted_at
  );

  const submissionCount = Number(a?.submission_count ?? a?.submissions_count ?? a?.answers_count ?? 0);
  const hasFlag = Boolean(a?.has_submission ?? a?.hasSubmitted);

  if (submittedAt || submissionCount > 0 || hasFlag) return 'submitted';
  return 'pending';
}

const StatusPill = ({ status }: { status: ClassicWorkStatus }) => {
  const label =
    status === 'marked'
      ? 'Marked'
      : status === 'opened'
        ? 'Opened'
        : status === 'submitted'
          ? 'Submitted'
          : 'Pending';

  const bg =
    status === 'marked'
      ? 'bg-emerald-600/15'
      : status === 'opened'
        ? 'bg-sky-600/15'
        : status === 'submitted'
          ? 'bg-amber-600/15'
          : 'bg-slate-600/10';

  const text =
    status === 'marked'
      ? 'text-emerald-700 dark:text-emerald-200'
      : status === 'opened'
        ? 'text-sky-700 dark:text-sky-200'
        : status === 'submitted'
          ? 'text-amber-800 dark:text-amber-200'
          : 'text-slate-700 dark:text-white/70';

  return (
    <View style={tw`px-2 py-0.5 rounded-full border border-white/10 ${bg}`}>
      <Text style={tw`text-[11px] ${text}`}>{label}</Text>
    </View>
  );
};


  // learner submit modal
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitAssignment, setSubmitAssignment] = useState<OrgAssignmentRow | null>(null);
  const [submitText, setSubmitText] = useState('');
  const [submitFileAsset, setSubmitFileAsset] = useState<any | null>(null);
  const [submitUploading, setSubmitUploading] = useState(false);

  // roster
  const [instructors, setInstructors] = useState<
    Array<{ user_id: number; name?: string; email?: string; role?: string }>
  >([]);

  // submissions view (single assignment)
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);
  const [submissionsAssignment, setSubmissionsAssignment] = useState<any | null>(null);
  const [submissionsRows, setSubmissionsRows] = useState<any[]>([]);

  const {
    canCustomPassTimers,
    canMultiPeriodAnalytics,
    canEmailReports,
    canSSO,
    canCSV,
    canWebhooks,
    hasPrioritySupport,
  } = useFeatureGates(tier);

  type AndroidPickerEvent = { type?: 'set' | 'dismissed' | 'neutralButtonPressed' | string };
  const TOOL_GAP = 12; // px
  const TOOL_COLS = 3;


  type AndroidOpenOptions = {
    value: Date;
    mode: 'date' | 'time';
    is24Hour?: boolean;
    onChange: (event: AndroidPickerEvent, date?: Date) => void;
    // keep it flexible for lib options / future props
    [key: string]: any;
  };

  const openAndroid = DateTimePickerAndroid.open as unknown as (opts: AndroidOpenOptions) => void;

  const openAndroidDateTime = useCallback((initial: Date, onDone: (d: Date) => void) => {
    openAndroid({
      value: initial,
      mode: 'date',
      is24Hour: true,
      onChange: (event, pickedDate) => {
        if (event?.type === 'dismissed' || !pickedDate) return;

        openAndroid({
          value: pickedDate,
          mode: 'time',
          is24Hour: true,
          onChange: (event2, pickedTime) => {
            if (event2?.type === 'dismissed' || !pickedTime) return;

            const merged = new Date(pickedDate);
            merged.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
            onDone(merged);
          },
        });
      },
    });
  }, []);

    const openWebPath = useCallback(
    async (path: string) => {
      const base = String(backendUrl || '').replace(/\/$/, '');
      if (!base) {
        Alert.alert('Unavailable', 'Missing backend URL.');
        return;
      }
      const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;

      try {
        const can = await Linking.canOpenURL(url);
        if (!can) throw new Error('cannot_open');
        await Linking.openURL(url);
      } catch {
        Alert.alert('Cannot open link', url);
      }
    },
    [backendUrl]
  );

  const hasRoute = useCallback(
    (routeName: string) => {
      let nav: any = navigation;
      while (nav) {
        const names = nav.getState?.()?.routeNames;
        if (Array.isArray(names) && names.includes(routeName)) return true;
        nav = nav.getParent?.();
      }
      return false;
    },
    [navigation]
  );

  const navOrWeb = useCallback(
    async (routeName: string, params?: any, webPath?: string) => {
      if (hasRoute(routeName)) {
        smartNavigate(routeName, params);
        return;
      }
      if (webPath) {
        await openWebPath(webPath);
        return;
      }
      Alert.alert('Unavailable', 'This tool is not available in this build yet.');
    },
    [hasRoute, openWebPath]
  );


  // keep per-tier payment state (so pro/enterprise don’t conflict)
  const proPaymentIdRef = useRef<string | null>(null);
  const entPaymentIdRef = useRef<string | null>(null);

  const refreshOrgAfterPayment = useCallback(async () => {
    if (!authToken) return;
    const updated = await getMyOrgOrBootstrap(backendUrl, authToken);
    setOrg(updated);
  }, [backendUrl, authToken]);

  const closeProModal = useCallback(() => {
    proPaymentIdRef.current = null;
    setShowProModal(false);
  }, []);

  const closeEnterpriseModal = useCallback(() => {
    entPaymentIdRef.current = null;
    setShowEnterpriseModal(false);
  }, []);

  const handlePlanCheckout = useCallback(
    async (
      tierToBuy: 'pro' | 'enterprise',
      paymentIdRef: React.MutableRefObject<string | null>,
      opts: {
        method: 'Paystack' | 'M-Pesa';
        cycle: 'monthly' | 'annual';
        plan: 'pro' | 'enterprise';
        phone?: string;
        reference?: string;
      }
    ) => {
      if (!org?.id || !authToken) {
        Alert.alert('Missing organization', 'Please sign in to your institution first.');
        return;
      }

      const apiCycle: 'monthly' | 'yearly' = opts.cycle === 'annual' ? 'yearly' : 'monthly';

      try {
        // ───────────────────────── M-PESA ─────────────────────────
        if (opts.method === 'M-Pesa') {
          const phone = (opts.phone || '').trim();
          if (!phone) {
            Alert.alert('Phone required', 'Enter your Safaricom phone number.');
            return;
          }

          // INIT
          if (!paymentIdRef.current) {
            const init = await initOrgSubscription(backendUrl, authToken, org.id, {
              tier: tierToBuy,
              cycle: apiCycle,
              method: 'MPESA',
              phone,
            });

            paymentIdRef.current = (init as any)?.paymentId ?? (init as any)?.id ?? null;

            Alert.alert(
              'STK Push sent',
              'Approve the request on your phone, then tap "Complete Payment". If it lags, open the reference box and submit the M-Pesa receipt.'
            );
            return;
          }

          // CONFIRM
          try {
            if (opts.reference?.trim()) {
              await confirmOrgSubscription(
                backendUrl,
                authToken,
                paymentIdRef.current!,
                opts.reference.trim()
              );
            } else {
              await confirmOrgSubscription(backendUrl, authToken, paymentIdRef.current!);
            }

            paymentIdRef.current = null;
            Alert.alert('Activated', 'Payment confirmed. Subscription activated ✅');

            await refreshOrgAfterPayment();

            if (tierToBuy === 'pro') closeProModal();
            else closeEnterpriseModal();

            return;
          } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || '';
            // keep paymentIdRef so user can retry confirm / add reference
            if (/pending|reference missing|still waiting|not confirmed/i.test(msg)) {
              Alert.alert(
                'Still pending',
                'We’re still waiting for M-Pesa confirmation. If you have the receipt, enter it and tap "Update Reference / Complete".'
              );
              return;
            }
            Alert.alert('Payment error', msg || 'Payment confirmation failed.');
            return;
          }
        }

        // ───────────────────────── PAYSTACK ─────────────────────────

        // INIT
        if (!paymentIdRef.current) {
          payLog('[PAYSTACK][INIT] about to call initOrgSubscription', {
            backendUrl,
            orgId: org.id,
            tierToBuy,
            apiCycle,
            method: 'PAYSTACK',
            hasAuthToken: !!authToken,
            tokenSource: orgToken ? 'orgToken' : token ? 'token' : 'none',
          });

          let init: any;
          try {
            init = await initOrgSubscription(backendUrl, authToken, org.id, {
              tier: tierToBuy,
              cycle: apiCycle,
              method: 'PAYSTACK',
            });
          } catch (e: any) {
            payLog('[PAYSTACK][INIT] initOrgSubscription threw', {
              message: e?.message,
              status: e?.response?.status,
              data: e?.response?.data,
            });
            throw e;
          }

          payLog('[PAYSTACK][INIT] raw init response', init);

          paymentIdRef.current = resolvePaymentId(init);

          const url = resolveApprovalUrl(init);

          payLog('[PAYSTACK][INIT] resolved fields', {
            paymentId: paymentIdRef.current,
            url,
            topKeys: Object.keys(init || {}).slice(0, 50),
            dataKeys: Object.keys(init?.data || {}).slice(0, 50),
            dataDataKeys: Object.keys(init?.data?.data || {}).slice(0, 50),
          });

          if (url) {
            const can = await Linking.canOpenURL(url);
            payLog('[PAYSTACK][INIT] canOpenURL', { url, can });
            if (!can) {
              Alert.alert('Cannot open Paystack', 'This device cannot open the checkout link.');
              return;
            }
            await Linking.openURL(url);
            Alert.alert(
              'Complete in browser',
              'After payment, return to the app and tap "Complete Payment".'
            );
          } else {
            Alert.alert(
              'Unavailable',
              `Paystack approval URL was not found.\n` +
                `Top keys: ${Object.keys(init || {})
                  .slice(0, 30)
                  .join(', ')}\n` +
                `data keys: ${Object.keys(init?.data || {})
                  .slice(0, 30)
                  .join(', ')}`
            );
          }

          return;
        }

        // CONFIRM
        if (opts.reference?.trim()) {
          await confirmOrgSubscription(
            backendUrl,
            authToken,
            paymentIdRef.current!,
            opts.reference.trim()
          );
        } else {
          await confirmOrgSubscription(backendUrl, authToken, paymentIdRef.current!);
        }

        paymentIdRef.current = null;
        Alert.alert('Activated', 'Payment confirmed. Subscription activated ✅');

        await refreshOrgAfterPayment();

        if (tierToBuy === 'pro') closeProModal();
        else closeEnterpriseModal();
      } catch (e: any) {
        const msg = e?.response?.data?.message || e?.message || 'Please try again.';
        Alert.alert('Payment failed', msg);
      }
    },
    [backendUrl, authToken, org?.id, refreshOrgAfterPayment, closeProModal, closeEnterpriseModal]
  );

  // hydrate from route params
  useEffect(() => {
    const p: any = route?.params ?? {};
const explicitTab = p.tab as TabKey | undefined;

if (explicitTab === 'examResults') {
  if (!isProTier) {
    Alert.alert('Locked', 'Exam results are available on PRO.');
    return;
  }
  openExamResults();
  // optional but recommended: clear param so it doesn't re-open on back
  navigation.setParams?.({ tab: undefined });
  return;
}

if (explicitTab) setTab(explicitTab);

    const cid = p.courseId;
    if (cid) setCourseId(cid);
    const cls = p.class_label ?? p.class;
    const subj = p.subject_key ?? p.subjectKey ?? p.subject;
    if (typeof cls === 'string' && cls) setAssignClassLabel(cls);
    if (typeof subj === 'string' && subj) setAssignSubjectKey(subj);
  }, [route.params]);

  // force away from branding
  useEffect(() => {
    if (!canBrandingRole && tab === 'branding') setTab('assign');
  }, [canBrandingRole, tab]);

  /* load org */
  useEffect(() => {
    (async () => {
      if (!authToken) return;
      try {
        const real = await getMyOrgOrBootstrap(backendUrl, authToken);
        setOrg(real);
        setForm((f: any) => ({ ...f, ...real }));
      } catch (err) {
        console.warn('[OrgPortalNative] org load failed', err);
      }
    })();
  }, [backendUrl, authToken]);

  /* usage seats */
  useEffect(() => {
    if (isLearnerView || isSubmissionsView) return;
    (async () => {
      if (!authToken || !org?.id) return;
      try {
        const { seats_used } = await getOrgUsage(backendUrl, authToken, org.id);
        setSeatsUsed(Number(seats_used ?? 0));
      } catch {
        setSeatsUsed(Number((org as any)?.seats_used ?? 0));
      }
    })();
  }, [org?.id, backendUrl, authToken, isLearnerView, isSubmissionsView]);

  /* roster */
  useEffect(() => {
    if (isLearnerView || isSubmissionsView) return;
    (async () => {
      if (!authToken || !org?.id) return;
      try {
        const roster = await getOrgRoster(backendUrl, authToken, org.id);
        const list = Array.isArray((roster as any)?.instructors) ? (roster as any).instructors : [];
        setInstructors(list);
      } catch {
        setInstructors([]);
      }
    })();
  }, [backendUrl, authToken, org?.id, isLearnerView, isSubmissionsView]);

  /* upload helper (logo/signature/instructor signature) */
  const handleUpload = useCallback(
    async (target: 'logo_url' | 'signature_url' | 'instructor_signature_url' | 'bursar_signature_url') => {
      if (!authToken) {
        Alert.alert('Sign in required', 'Please sign in before uploading images.');
        return;
      }

      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['image/*'],
          copyToCacheDirectory: true,
        });

        if (result.canceled || !result.assets || result.assets.length === 0) return;
        const asset = result.assets[0];
        if (!asset) return;

        const file: any = {
          uri: asset.uri,
          name: asset.name || `brand-${target}-${Date.now()}.jpg`,
          type: asset.mimeType || 'image/jpeg',
        };

         const setBusy =
          target === 'logo_url'
            ? setUploadingLogo
            : target === 'signature_url'
              ? setUploadingSignature
              : target === 'instructor_signature_url'
                ? setUploadingInstructorSignature
                : setUploadingBursarSignature;
        setBusy(true);

        const res: any = await uploadAsset(backendUrl, authToken, file, 'image');
        const url =
          typeof res === 'string' ? res : res?.url || res?.secure_url || res?.data?.url || '';

        if (!url) throw new Error('Upload completed but no URL was returned by the server.');

        setForm((f: any) => ({ ...f, [target]: url }));
        Alert.alert(
          'Uploaded',
          target === 'logo_url'
            ? 'Logo updated.'
            : target === 'signature_url'
              ? 'Signature updated.'
               : target === 'instructor_signature_url'
                ? 'Instructor signature updated.'
                : 'Bursar/Finance signature updated.'
        );
      } catch (e: any) {
        if (e?.message?.includes('canceled')) return;
        Alert.alert('Upload failed', e?.message || 'Please try again.');
      } finally {
        setUploadingLogo(false);
        setUploadingSignature(false);
        setUploadingInstructorSignature(false);
        setUploadingBursarSignature(false);
      }
    },
    [authToken, backendUrl]
  );

  /* save branding */
  const saveBranding = useCallback(async () => {
    if (!org?.id || !authToken) {
      Alert.alert(
        'Missing organization',
        'Please create your Institution account first (For Institutions → Login/Sign up).'
      );
      return;
    }

    if (!canBrandingRole) {
      Alert.alert(
        'Not allowed',
        'Branding settings can only be changed by your institution owner or admin.'
      );
      return;
    }

    const domStr = String(form.email_domain || '').trim();
    if (domStr) {
      const domains = domStr
        .split(',')
        .map((d: string) => d.trim().toLowerCase())
        .filter(Boolean);

      const bad = domains.filter((d: string) => {
        if (d.includes('://')) return true;
        if (d.includes('@')) return true;
        const cleaned = d.startsWith('*.') ? d.slice(2) : d;
        return !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(cleaned);
      });

      if (bad.length) {
        Alert.alert('Invalid domain(s)', bad.join(', '));
        return;
      }
    }

    if (form.webhook_enabled && (form.webhook_url || '').trim()) {
      const u = String(form.webhook_url || '').trim();
      if (!/^https:\/\/.+/i.test(u)) {
        Alert.alert('Invalid webhook URL', 'Webhook URL must be a valid HTTPS URL when enabled.');
        return;
      }
    }

    try {
      const updated = await updateOrgBranding(backendUrl, authToken, org.id, form);
      setOrg((prev) => ({ ...(prev ?? {}), ...(updated ?? {}) }) as Org);
      setForm((f: any) => ({ ...f, ...(updated ?? {}) }));
      setShowCongrats(true);
    } catch (e: any) {
      if (e?.response?.status === 403) {
        Alert.alert('Not available', 'Branding not available on your current plan.');
        return;
      }
      Alert.alert('Save failed', e?.response?.data?.message || 'Please try again.');
    }
  }, [backendUrl, authToken, org?.id, form, canBrandingRole]);

  /* instructor: pick attachment for classic assignment */
  const handlePickLegacyAttachment = useCallback(async () => {
    if (!authToken) {
      Alert.alert('Sign in required', 'Please sign in before attaching files.');
      return;
    }

    try {
      setLegacyUploadingAttachment(true);

      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'image/*',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];
      if (!asset) return;

      const file: any = {
        uri: asset.uri,
        name: asset.name || `assignment-${Date.now()}`,
        type: asset.mimeType || 'application/octet-stream',
      };

      const res: any = await uploadAsset(backendUrl, authToken, file, 'doc');

      const url =
        typeof res === 'string' ? res : res?.url || res?.secure_url || res?.data?.url || null;
      if (!url) throw new Error('Upload completed but no URL was returned.');

      setLegacyAttachmentUrl(url);
      setLegacyAttachmentLabel(asset.name || asset.uri);
      Alert.alert('File attached', 'Learners will be able to download this file.');
    } catch (e: any) {
      if (e?.message?.includes('canceled')) return;
      Alert.alert('Upload failed', e?.message || 'Please try again.');
    } finally {
      setLegacyUploadingAttachment(false);
    }
  }, [authToken, backendUrl]);

  /* instructor: create classic (file-based) assignment */
  const createLegacyAssignment = useCallback(async () => {
    if (!org?.id || !authToken) {
      Alert.alert('Missing organization', 'Please sign in to your institution first.');
      return;
    }

    const trimmedTitle = legacyTitle.trim();
    const classLabel = (assignClassLabel || '').trim();
    const subjectKey = (assignSubjectKey || '').trim();

    if (!trimmedTitle) {
      Alert.alert('Title required', 'Give this assignment a title before sharing.');
      return;
    }

    // web requires both; native now matches
   if (!validateScope()) {
  Alert.alert('Scope required', 'Please specify both Class/Grade and Subject so the right learners see this.');
  return;
}


    try {
      setCreatingLegacyAssignment(true);

      const payload: any = {
        title: trimmedTitle,
        instructions: legacyInstructions.trim() || null,
        due_at: legacyDueAt || null,
        class_label: classLabel,
        subject_key: subjectKey,
        attachment_url: legacyAttachmentUrl || null,
      };

      await createOrgLegacyAssignment(backendUrl, authToken, org.id, payload);

      Alert.alert(
        'Assignment shared',
        'Learners in the selected class/subject will see this assignment in their portal.'
      );

      setLegacyTitle('');
      setLegacyInstructions('');
      setLegacyDueAt('');
      setLegacyDueDate(null);
      setLegacyAttachmentUrl(null);
      setLegacyAttachmentLabel(null);
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to create assignment.';
      Alert.alert('Failed', msg);
    } finally {
      setCreatingLegacyAssignment(false);
    }
  }, [
    org?.id,
    authToken,
    backendUrl,
    legacyTitle,
    legacyInstructions,
    legacyDueAt,
    assignClassLabel,
    assignSubjectKey,
    legacyAttachmentUrl,
  ]);

  /* assignment create (AI course-based) */
 const createAssignment = useCallback(async () => {
  if (!org?.id || !authToken) return;

  const cid = (courseId || '').trim();
  if (!cid) {
    Alert.alert('Course required', 'Please enter/select a Course ID first.');
    return;
  }

  if (!validateScope()) {
    Alert.alert('Scope required', 'Please specify both Class/Grade and Subject.');
    return;
  }

  const classLabel = (assignClassLabel || '').trim();
  const subjectKey = (assignSubjectKey || '').trim();

  try {
    const payload: any = {
      courseId: cid,
      title_override: titleOverride || null,
      pass_mark: canCustomPassTimers ? passMark || null : null,
      timer_s: canCustomPassTimers ? timer || null : null,
      due_at: dueAt || null,

      // canonical (snake)
      class_label: classLabel,
      subject_key: subjectKey,

      // web-style aliases (camel + org_ + assign*)
      classLabel,
      subjectKey,
      org_class_label: classLabel,
      org_subject_key: subjectKey,
      orgClassLabel: classLabel,
      orgSubjectKey: subjectKey,
      assignClassLabel: classLabel,
      assignSubjectKey: subjectKey,
    };

    const a = await createOrgAssignment(backendUrl, authToken, org.id, payload);
    const link = `${backendUrl.replace(/\/$/, '')}/org/join/${(a as any).invite_code}`;
    setInviteLink(link);

    Alert.alert('Assignment created', 'Invite link generated.');
  } catch (e: any) {
    Alert.alert('Failed', e?.response?.data?.message || 'Failed to create assignment.');
  }
}, [
  org?.id,
  authToken,
  backendUrl,
  courseId,
  titleOverride,
  passMark,
  timer,
  dueAt,
  assignClassLabel,
  assignSubjectKey,
  canCustomPassTimers,
  validateScope,
]);


  /* analytics */
  const loadAnalytics = useCallback(async () => {
    if (isLearnerView || isSubmissionsView) return;
    if (!org?.id || !authToken) return;

    setLoadingAnalytics(true);
    try {
      const p: Period = canMultiPeriodAnalytics ? period : 'month';
      const resp: any = await getOrgAnalytics(backendUrl, authToken, org.id, p);

      const rows = resp?.data || [];
      setAnalytics(rows);
      setAnalyticsSummary(deriveAnalyticsSummary(rows, resp?.summary ?? null));
    } catch {
      setAnalytics([]);
      setAnalyticsSummary(null);
    } finally {
      setLoadingAnalytics(false);
    }
  }, [
    org?.id,
    backendUrl,
    authToken,
    period,
    canMultiPeriodAnalytics,
    isLearnerView,
    isSubmissionsView,
  ]);

  useEffect(() => {
    if (tab === 'analytics') loadAnalytics();
  }, [tab, loadAnalytics]);

  /* learner progress */
  const loadLearnerProgress = useCallback(
    async (reset: boolean) => {
      if (isLearnerView || isSubmissionsView) return;
      if (!org?.id || !authToken) return;

      setLpLoading(true);
      try {
        const resp = await getOrgLearnersProgress(backendUrl, authToken, org.id, {
          limit: 25,
          cursor: reset ? undefined : lpCursor || undefined,
        });

        setLpRows((prev) => (reset ? resp.data : [...prev, ...resp.data]));
        setLpCursor(resp.next_cursor ?? null);
      } finally {
        setLpLoading(false);
      }
    },
    [backendUrl, authToken, org?.id, lpCursor, isLearnerView, isSubmissionsView]
  );

  useEffect(() => {
    if (isLearnerView || isSubmissionsView) return;
    if (tab === 'analytics') loadLearnerProgress(true);
  }, [tab, loadLearnerProgress, isLearnerView, isSubmissionsView]);

  /* learner assignments */
  const loadLearnerAssignments = useCallback(async () => {
    if (!isLearnerView) return;
    if (!authToken || !org?.id) return;

    setLearnerAssignmentsLoading(true);
    try {
   const resp = await getOrgAssignmentsForLearner(backendUrl, authToken, org.id, {
  studentId: learnerStudentId || undefined,
  classLabel: learnerClassLabelResolved || undefined,
  subjectKey: learnerSubjectKeyResolved || undefined,

  include_status: true,
  includeStatus: true,
  include_opened: true,
  includeOpened: true,
  include_marked: true,
  includeMarked: true,
} as any);



      const rows = Array.isArray((resp as any)?.data) ? (resp as any).data : [];
      setLearnerAssignments(rows as OrgAssignmentRow[]);
    } catch (err) {
      console.warn('[OrgElearnPortalNative] load learner assignments failed', err);
      setLearnerAssignments([]);
    } finally {
      setLearnerAssignmentsLoading(false);
    }
  }, [
    isLearnerView,
    backendUrl,
    authToken,
    org?.id,
    learnerStudentId,
    learnerClassFromRoute,
    learnerSubjectFromRoute,
  ]);

  useEffect(() => {
    loadLearnerAssignments();
  }, [loadLearnerAssignments]);

  /* submissions view loader */
  const loadAssignmentSubmissions = useCallback(async () => {
    if (!isSubmissionsView) return;
    if (!authToken || !org?.id) return;
    if (!assignmentIdFromRoute) return;

    setSubmissionsLoading(true);
    setSubmissionsError(null);

    try {
      const nowIso = new Date().toISOString();

      apiMarkOrgAssignmentOpened(backendUrl, authToken, org.id, String(assignmentIdFromRoute)).catch((e) =>
        console.warn('[OrgElearnPortalNative] mark opened failed', e?.message || e),
      );

      writeOpened(org.id, assignmentIdFromRoute, nowIso);

      const res: any = await getOrgAssignmentSubmissions(
        backendUrl,
        authToken,
        org.id,
        String(assignmentIdFromRoute)
      );
      const openedAt = res?.assignment?.opened_at || nowIso;
      setSubmissionsAssignment(res?.assignment ? { ...res.assignment, opened_at: openedAt } : null);
      setSubmissionsRows(Array.isArray(res?.submissions) ? res.submissions : []);
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to load submissions.';
      setSubmissionsError(msg);
      setSubmissionsAssignment(null);
      setSubmissionsRows([]);
    } finally {
      setSubmissionsLoading(false);
    }
  }, [isSubmissionsView, authToken, org?.id, assignmentIdFromRoute, backendUrl]);

  useEffect(() => {
    loadAssignmentSubmissions();
  }, [loadAssignmentSubmissions]);

  /* learner: pick file */
  const handlePickSubmitFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'image/*',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;
      setSubmitFileAsset(result.assets[0]);
    } catch (e: any) {
      if (e?.message?.includes('canceled')) return;
      Alert.alert('File selection failed', e?.message || 'Please try again.');
    }
  }, []);

  /* deadline pickers */
  const handleLegacyDeadlinePress = () => {
    if (Platform.OS === 'android') {
      openAndroidDateTime(legacyDueDate ?? new Date(), (d) => {
        setLegacyDueDate(d);
        setLegacyDueAt(d.toISOString());
      });
      return;
    }
    setLegacyDuePickerOpen(true);
  };

  const handleAiDeadlinePress = () => {
    if (Platform.OS === 'android') {
      openAndroidDateTime(aiDueDate ?? new Date(), (d) => {
        setAiDueDate(d);
        setDueAt(d.toISOString());
      });
      return;
    }
    setAiDuePickerOpen(true);
  };

  const handleLegacyDueChange = (_event: any, selected?: Date) => {
    setLegacyDuePickerOpen(false);
    if (selected) {
      setLegacyDueDate(selected);
      setLegacyDueAt(selected.toISOString());
    }
  };

  const handleAiDueChange = (_event: any, selected?: Date) => {
    setAiDuePickerOpen(false);
    if (selected) {
      setAiDueDate(selected);
      setDueAt(selected.toISOString());
    }
  };

  /* learner: submit legacy work */
  const handleSubmitLegacyWork = useCallback(async () => {
    if (!submitAssignment || !authToken || !org?.id) {
      setSubmitOpen(false);
      return;
    }

    if (!submitText.trim() && !submitFileAsset) {
      Alert.alert('Missing work', 'Type an answer or attach a file before submitting.');
      return;
    }

    setSubmitUploading(true);
    try {
      let attachmentUrl: string | null = null;

      if (submitFileAsset) {
        const file: any = {
          uri: submitFileAsset.uri,
          name: submitFileAsset.name || 'assignment-upload',
          type: submitFileAsset.mimeType || 'application/octet-stream',
        };

        const res: any = await uploadAsset(backendUrl, authToken, file, 'doc');
        attachmentUrl =
          typeof res === 'string' ? res : res?.url || res?.secure_url || res?.data?.url || null;
      }

      await submitOrgLegacyAssignment(backendUrl, authToken, org.id, (submitAssignment as any).id, {
        answer_text: submitText.trim() || null,
        attachment_url: attachmentUrl,
      });

      Alert.alert('Submitted', 'Your work has been submitted ✅');

      setSubmitOpen(false);
      setSubmitAssignment(null);
      setSubmitText('');
      setSubmitFileAsset(null);

      await loadLearnerAssignments();
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to submit work.';
      Alert.alert('Submit failed', msg);
    } finally {
      setSubmitUploading(false);
    }
  }, [
    submitAssignment,
    submitText,
    submitFileAsset,
    backendUrl,
    authToken,
    org?.id,
    loadLearnerAssignments,
  ]);

  /* computed */
  const seatPct = Math.min(100, Math.round(((seatsUsed || 0) / seatsMax) * 100));
  const nearLimit = seatPct >= 90;

  const visibleTabs: TabKey[] = canBrandingRole
  ? ['branding', 'assign', 'analytics', 'examResults', 'tools']
  : ['assign', 'analytics', 'examResults', 'tools'];

  const TAB_LABEL: Record<TabKey, string> = {
  branding: 'Branding',
  assign: 'Assignments',
  analytics: 'Analytics',
  examResults: 'Exam results',
  tools: 'Tools',
};



  const aiAssignments = useMemo(
    () => learnerAssignments.filter((a: any) => isAiAssignmentRow(a)),
    [learnerAssignments],
  );
  const aiTotal = aiAssignments.length;
  const aiPageCount = useMemo(
    () => Math.max(1, Math.ceil((aiTotal || 0) / aiPageSize)),
    [aiTotal, aiPageSize],
  );
  const aiRangeStart = aiTotal ? (aiPage - 1) * aiPageSize + 1 : 0;
  const aiPageItems = useMemo(() => {
    const start = (aiPage - 1) * aiPageSize;
    return aiAssignments.slice(start, start + aiPageSize);
  }, [aiAssignments, aiPage, aiPageSize]);
  const aiRangeEnd = aiTotal ? Math.min(aiTotal, aiRangeStart + aiPageItems.length - 1) : 0;

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil((aiTotal || 0) / aiPageSize));
    if (aiPage > maxPage) setAiPage(maxPage);
  }, [aiTotal, aiPageSize, aiPage]);

  // Learner: classic-only filter (paged to mirror instructor recent submissions UX)
  const classicAssignments = useMemo(
    () =>
      learnerAssignments.filter((a: any) => {
        if (isAiAssignmentRow(a)) return false;

        const kind = String(a.source_kind || '').toLowerCase();
        const isLegacyKind = kind === 'legacy';

        const attachmentUrl =
          a.attachment_url ||
          a.attachmentUrl ||
          a.download_url ||
          a.downloadUrl ||
          a.resource_url ||
          a.resourceUrl ||
          null;

        return isLegacyKind || !!attachmentUrl;
      }),
    [learnerAssignments],
  );
  const classicTotal = classicAssignments.length;
  const classicPageCount = useMemo(
    () => Math.max(1, Math.ceil((classicTotal || 0) / classicPageSize)),
    [classicTotal, classicPageSize],
  );
  const classicRangeStart = classicTotal ? (classicPage - 1) * classicPageSize + 1 : 0;
  const classicPageItems = useMemo(() => {
    const start = (classicPage - 1) * classicPageSize;
    return classicAssignments.slice(start, start + classicPageSize);
  }, [classicAssignments, classicPage, classicPageSize]);
  const classicRangeEnd = classicTotal
    ? Math.min(classicTotal, classicRangeStart + classicPageItems.length - 1)
    : 0;

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil((classicTotal || 0) / classicPageSize));
    if (classicPage > maxPage) setClassicPage(maxPage);
  }, [classicTotal, classicPageSize, classicPage]);

  const { markedAssignments, submittedAssignments, pendingAssignments } = useMemo(() => {
    const marked: OrgAssignmentRow[] = [];
    const submitted: OrgAssignmentRow[] = [];
    const pending: OrgAssignmentRow[] = [];

    classicPageItems.forEach((a: any) => {
      const st = deriveClassicWorkStatus(a);

      if (st === 'marked') marked.push(a);
      else if (st === 'pending') pending.push(a);
      else submitted.push(a); // includes "submitted" + "opened"
    });

    return { markedAssignments: marked, submittedAssignments: submitted, pendingAssignments: pending };
  }, [classicPageItems]);


  const instructorEmails = useMemo(
    () => instructors.map((u) => (u.email || '').trim()).filter(Boolean),
    [instructors]
  );

  const bccChunks = useMemo(() => {
    if (!inviteLink) return [] as string[][];
    if (!instructorEmails.length) return [];

    const chunks: string[][] = [];
    const mkMailto = (arr: string[]) => {
      const subject = encodeURIComponent('Course invite');
      const body = encodeURIComponent(inviteLink);
      const bcc = encodeURIComponent(arr.join(','));
      return `mailto:?subject=${subject}&bcc=${bcc}&body=${body}`;
    };

    let cur: string[] = [];
    for (const e of instructorEmails) {
      const test = mkMailto([...cur, e]);
      if (test.length > 1800 || cur.length >= 50) {
        if (cur.length) chunks.push(cur);
        cur = [e];
      } else {
        cur.push(e);
      }
    }
    if (cur.length) chunks.push(cur);
    return chunks;
  }, [instructorEmails, inviteLink]);

  const emailInstructorsGroup = useCallback(
    async (emails: string[]) => {
      if (!inviteLink || !emails.length) return;
      const subject = encodeURIComponent('Course invite');
      const body = encodeURIComponent(inviteLink);
      const bcc = encodeURIComponent(emails.join(','));
      const url = `mailto:?subject=${subject}&bcc=${bcc}&body=${body}`;

      try {
        await Linking.openURL(url);
      } catch {
        await Share.share({ message: inviteLink });
      }
    },
    [inviteLink]
  );

  const shareViaWhatsApp = useCallback(async () => {
    if (!inviteLink) return;
    const text = encodeURIComponent(
      `Please share this course invite with your learners:\n\n${inviteLink}`
    );
    const waUrl = `https://wa.me/?text=${text}`;
    try {
      await Linking.openURL(waUrl);
    } catch {
      await Share.share({ message: inviteLink });
    }
  }, [inviteLink]);

  const copyLink = useCallback(async () => {
    if (!inviteLink) return;
    try {
      await Share.share({ message: inviteLink });
    } catch {}
  }, [inviteLink]);

  const renderLearnerAssignmentRow = (a: OrgAssignmentRow, status: ClassicWorkStatus) => {
    const key = assignmentKey(a);
    const dueLabel = (a as any).due_at
      ? new Date((a as any).due_at).toLocaleString()
      : 'No due date';
    const createdLabel = (a as any).created_at
      ? new Date((a as any).created_at).toLocaleString()
      : null;

    const attachmentUrl: string | null =
      (a as any).attachment_url ||
      (a as any).attachmentUrl ||
      (a as any).download_url ||
      (a as any).downloadUrl ||
      (a as any).resource_url ||
      (a as any).resourceUrl ||
      null;

    return (
      <View
        key={key}
        style={tw`mt-2 p-3 rounded-xl bg-[#f8fbff] dark:bg-[#111b28] border border-[#cedbe8] dark:border-white/10`}
      >
        <Text style={tw`text-[#0d141c] dark:text-white font-semibold`}>
          {(a as any).title || 'Untitled assignment'}
        </Text>

        <View style={tw`mt-2 flex-row items-center justify-between`}>
        <StatusPill status={status} />
        {(a as any).due_at ? (
          <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
            Due: {new Date((a as any).due_at).toLocaleString()}
          </Text>
        ) : (
          <Text style={tw`text-[11px] text-[#9CA3AF] dark:text-white/60`}>No due date</Text>
        )}
      </View>


       
        {createdLabel && (
          <Text style={tw`mt-1 text-[11px] text-[#9CA3AF] dark:text-white/60`}>
            Assigned: {createdLabel}
          </Text>
        )}

        {attachmentUrl && (
          <TouchableOpacity
            onPress={() => Linking.openURL(attachmentUrl)}
            style={tw`mt-2 px-3 py-1.5 rounded-lg bg-[#e7edf4] dark:bg-white/10 self-start`}
          >
            <Text style={tw`text-[#0d141c] dark:text-white text-xs`}>Open attachment</Text>
          </TouchableOpacity>
        )}

        <View style={tw`flex-row mt-3`}>
          <TouchableOpacity
            onPress={() => {
              setSubmitAssignment(a);
              setSubmitText('');
              setSubmitFileAsset(null);
              setSubmitOpen(true);
            }}
            style={tw`px-3 py-1.5 rounded-lg bg-indigo-600`}
          >
            <Text style={tw`text-white text-xs`}>
            {status === 'pending' ? 'Submit work' : 'Submit again'}
          </Text>

          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderAiAssignmentRow = (a: OrgAssignmentRow) => {
    const inviteCode =
      (a as any).invite_code || (a as any).inviteCode || (a as any).code || '';
    const title = (a as any).title || (a as any).title_override || (a as any).course_title || '';
    const label = title ? `AI assignment • ${title}` : 'AI assignment';
    const createdLabel = (a as any).created_at
      ? new Date((a as any).created_at).toLocaleString()
      : null;
    const passMark = (a as any).pass_mark ?? null;
    const timerSeconds = (a as any).timer_s ?? null;

    return (
      <View
        key={assignmentKey(a)}
        style={tw`mt-2 p-3 rounded-xl bg-[#f8fbff] dark:bg-[#111b28] border border-[#cedbe8] dark:border-white/10`}
      >
        <View style={tw`flex-row items-center flex-wrap`}>
          <Text style={tw`text-[#0d141c] dark:text-white font-semibold flex-1`} numberOfLines={2}>
            {title || 'AI assignment'}
          </Text>
          {!!(a as any).course_title && (
            <Text style={tw`ml-2 text-[11px] text-[#49739c] dark:text-white/70`} numberOfLines={1}>
              {(a as any).course_title}
            </Text>
          )}
        </View>

        <View style={tw`mt-1 flex-row flex-wrap`}>{/* tags */}
          {passMark != null && passMark !== '' && (
            <Text style={tw`mr-2 text-[11px] text-emerald-700 dark:text-emerald-200`}>🎯 Pass mark: {passMark}%</Text>
          )}
          {timerSeconds != null && timerSeconds !== '' && (
            <Text style={tw`mr-2 text-[11px] text-amber-700 dark:text-amber-200`}>⏱️ Timer: {timerSeconds}s</Text>
          )}
          {(a as any).due_at ? (
            <Text style={tw`mr-2 text-[11px] text-[#49739c] dark:text-white/70`}>
              📅 Due: {new Date((a as any).due_at).toLocaleString()}
            </Text>
          ) : null}
        </View>

        {createdLabel && (
          <Text style={tw`mt-1 text-[11px] text-[#9CA3AF] dark:text-white/60`}>Assigned: {createdLabel}</Text>
        )}

        <TouchableOpacity
          disabled={!inviteCode}
          onPress={() => inviteCode && navigation.navigate('OrgInviteLanding', { code: inviteCode })}
          style={tw`mt-3 px-3 py-1.5 rounded-lg ${inviteCode ? 'bg-indigo-600' : 'bg-[#e5e7eb]'}`}
        >
          <Text style={tw`${inviteCode ? 'text-white' : 'text-[#6b7280]'} text-xs font-semibold`} numberOfLines={1}>
            {label}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const isAiSubmissions = submissionsAssignment
    ? isAiAssignmentRow(submissionsAssignment as any)
    : false;

  // submissions view card
  const renderSubmissionRow = (row: any, idx: number) => {
    const name =
      row?.learner_display_name ||
      row?.display_name ||
      [row?.learner_first_name, row?.learner_last_name].filter(Boolean).join(' ') ||
      row?.learner_name ||
      row?.name ||
      row?.student_name ||
      row?.email ||
      row?.learner_email ||
      row?.student_email ||
      `Submission #${idx + 1}`;
    const admissionNumber =
      row?.admission_number ||
      row?.learner_admission_code ||
      row?.student_id ||
      row?.learner_id ||
      row?.user_id ||
      '';
    const submittedAt = row?.created_at || row?.submitted_at || row?.submittedAt || null;
    const aiScore = row?.ai_final_score;
    const aiAttempts = row?.ai_attempts_count;
    const aiLast = row?.ai_last_attempt_at;
    const scoreLabel = aiScore == null ? '—' : `${Math.round(Number(aiScore))}%`;
    const attemptsLabel =
      aiAttempts && aiAttempts > 0
        ? ` (${aiAttempts} attempt${aiAttempts === 1 ? '' : 's'})`
        : '';
    const lastAttemptLabel = aiLast
      ? ` • ${new Date(aiLast).toLocaleDateString()}`
      : '';

    const answerText = row?.answer_text ?? row?.answerText ?? '';
    const attachmentUrl =
      row?.attachment_url ?? row?.attachmentUrl ?? row?.file_url ?? row?.fileUrl ?? null;

    return (
      <View
        key={`${row?.id ?? idx}`}
        style={tw`mb-2 p-3 rounded-xl bg-[#f8fbff] dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
      >
        <Text style={tw`text-[#0d141c] dark:text-white font-semibold`} numberOfLines={1}>
          {name}
        </Text>
        <Text style={tw`text-[11px] text-[#6b7280] dark:text-white/70 mt-1`}>
          Admission No.: {admissionNumber || '—'}
        </Text>
        {submittedAt ? (
          <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70 mt-1`}>
            Submitted: {new Date(submittedAt).toLocaleString()}
          </Text>
        ) : null}

        {isAiSubmissions && (
          <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70 mt-1`}>
            Score: {scoreLabel}
            {attemptsLabel}
            {lastAttemptLabel}
          </Text>
        )}

        {!!answerText && (
          <Text style={tw`text-[11px] text-[#6b7280] dark:text-white/70 mt-2`} numberOfLines={4}>
            {answerText}
          </Text>
        )}

        {attachmentUrl && (
          <TouchableOpacity
            onPress={() => Linking.openURL(attachmentUrl)}
            style={tw`mt-2 px-3 py-1.5 rounded-lg bg-[#e7edf4] dark:bg-white/10 self-start`}
          >
            <Text style={tw`text-[#0d141c] dark:text-white text-xs`}>Open attachment</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`} edges={['top']}>
      <View style={[tw`flex-1 px-3`, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <ScrollView contentContainerStyle={tw`pt-3 pb-24`}>
          {/* ─────────────────────────────────────────
              SUBMISSIONS VIEW (owner/instructor)
             ───────────────────────────────────────── */}
          {isSubmissionsView ? (
            <>
              <View style={tw`mb-4`}>
                <Text style={tw`text-[#0d141c] dark:text-white text-2xl font-bold`}>
                  Assignment submissions
                </Text>
                <Text style={tw`text-[#49739c] dark:text-white/70 text-xs mt-1`}>
                  Review learner uploads and responses.
                </Text>
              </View>

                <View
                  style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`}
                >
                <View style={tw`flex-row items-center justify-between`}>
                  <View style={tw`flex-1 pr-2`}>
                    <Text style={tw`text-[#0d141c] dark:text-white font-semibold`}>
                      {(submissionsAssignment?.title ?? submissionsAssignment?.name) ||
                        'Assignment'}
                    </Text>
                    {!!submissionsAssignment?.class_label && (
                      <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70 mt-1`}>
                        Class: {submissionsAssignment.class_label} • Subject:{' '}
                        {submissionsAssignment.subject_key || '—'}
                      </Text>
                    )}
                  </View>

                  <TouchableOpacity
                    onPress={handleBackToAssignments}
                    style={tw`px-3 py-1.5 rounded-lg bg-[#e7edf4] dark:bg-white/10`}
                  >
                    <Text style={tw`text-xs text-[#0d141c] dark:text-white`}>Back</Text>
                  </TouchableOpacity>
                </View>

                <View style={tw`flex-row mt-3`}>
                  <TouchableOpacity
                    onPress={loadAssignmentSubmissions}
                    style={tw`px-3 py-2 rounded-lg bg-indigo-600`}
                  >
                    <Text style={tw`text-white text-xs`}>Refresh</Text>
                  </TouchableOpacity>
                </View>

                {submissionsLoading ? (
                  <View style={tw`py-6 items-center`}>
                    <ActivityIndicator color={resolvedScheme === 'dark' ? '#ffffff' : '#0d141c'} />
                  </View>
                ) : submissionsError ? (
                  <Text style={tw`mt-3 text-sm text-red-600 dark:text-red-300`}>
                    {submissionsError}
                  </Text>
                ) : submissionsRows.length === 0 ? (
                  <Text style={tw`mt-3 text-sm text-[#49739c] dark:text-white/70`}>
                    No submissions yet.
                  </Text>
                ) : (
                  <View style={tw`mt-3`}>
                    {submissionsRows.map((r, idx) => renderSubmissionRow(r, idx))}
                  </View>
                )}
              </View>
            </>
          ) : isLearnerView ? (
            /* ─────────────────────────────────────────
               LEARNER VIEW
             ───────────────────────────────────────── */
            <>
              <View style={tw`mb-4`}>
                <Text style={tw`text-[#0d141c] dark:text-white text-2xl font-bold`}>
                  Assignments shared with you
                </Text>
                <Text style={tw`text-[#49739c] dark:text-white/70 text-xs mt-1`}>
                  View both AI assignments (Teach with AI) and classic file-based work that your
                  teachers shared with you.
                </Text>

                {!!learnerClassFromRoute && (
                  <Text style={tw`text-[#49739c] dark:text-white/70 text-[11px] mt-1`}>
                    You&apos;re viewing work for{' '}
                    <Text style={tw`font-semibold`}>{learnerClassFromRoute}</Text>
                    {learnerSubjectFromRoute ? (
                      <>
                        {' '}
                        in <Text style={tw`font-semibold`}>{learnerSubjectFromRoute}</Text>
                      </>
                    ) : null}
                    .
                  </Text>
                )}
              </View>

              <View
                style={tw`mb-3 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`}
              >
                <View style={tw`flex-row justify-between items-center mb-2`}>
                  <View style={tw`flex-1 pr-2`}>
                    <Text style={tw`text-[#0d141c] dark:text-white text-base font-semibold`}>
                      AI assignments (Teach with AI)
                    </Text>
                    <Text style={tw`text-[#6b7280] dark:text-white/70 text-[11px] mt-1`}>
                      Join AI-powered assignments shared with you.
                    </Text>
                  </View>
                  {learnerAssignmentsLoading && (
                    <Text style={tw`text-[11px] text-[#6b7280] dark:text-white/70`}>Loading…</Text>
                  )}
                </View>

                {aiAssignments.length === 0 && !learnerAssignmentsLoading ? (
                  <Text style={tw`text-[11px] text-[#6b7280] dark:text-white/70`}>
                    No AI assignments yet. When a teacher shares one with your class, it will appear
                    here.
                  </Text>
                ) : (
                  aiPageItems.map((a) => renderAiAssignmentRow(a))
                )}

                {aiAssignments.length > 0 && (
                  <>
                    <View style={tw`flex-row items-center gap-2 mt-3`}>
                      {[10, 25, 50].map((size) => {
                        const active = size === aiPageSize;
                        return (
                          <TouchableOpacity
                            key={size}
                            onPress={() => {
                              setAiPageSize(size);
                              setAiPage(1);
                            }}
                            style={[
                              tw`px-2 py-1 rounded-full border`,
                              {
                                borderColor: active ? '#6366f1' : palette.border,
                                backgroundColor: active ? palette.chipBg('#6366f1') : palette.softCard,
                              },
                            ]}
                          >
                            <Text style={[tw`text-[11px] font-semibold`, { color: palette.text }]}>{size} rows</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <View style={tw`mt-2 flex-row items-center justify-between`}>
                      <Text style={[tw`text-[11px]`, { color: palette.textMuted }]}>
                        Showing {aiRangeStart}-{aiRangeEnd} of {aiTotal}
                      </Text>

                      <View style={tw`flex-row items-center gap-2`}>
                        <TouchableOpacity
                          onPress={() => setAiPage((p) => Math.max(1, p - 1))}
                          disabled={aiPage <= 1}
                          style={[
                            tw`px-3 py-2 rounded-full border`,
                            { borderColor: palette.border, opacity: aiPage <= 1 ? 0.4 : 1 },
                          ]}
                        >
                          <Text style={[tw`text-[11px] font-semibold`, { color: palette.text }]}>Prev</Text>
                        </TouchableOpacity>

                        <Text style={[tw`text-[11px]`, { color: palette.textSubtle }]}>Page {aiPage} / {aiPageCount}</Text>

                        <TouchableOpacity
                          onPress={() => setAiPage((p) => Math.min(aiPageCount, p + 1))}
                          disabled={aiRangeEnd >= aiTotal}
                          style={[
                            tw`px-3 py-2 rounded-full border`,
                            { borderColor: palette.border, opacity: aiRangeEnd >= aiTotal ? 0.4 : 1 },
                          ]}
                        >
                          <Text style={[tw`text-[11px] font-semibold`, { color: palette.text }]}>Next</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </>
                )}
              </View>

              <View
                style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`}
              >
                <View style={tw`flex-row justify-between items-center mb-2`}>
                  <View style={tw`flex-1 pr-2`}>
                    <Text style={tw`text-[#0d141c] dark:text-white text-base font-semibold`}>
                      Classic assignments
                    </Text>
                    <Text style={tw`text-[#6b7280] dark:text-white/70 text-[11px] mt-1`}>
                      Download file-based assignments, follow the instructions, and submit your work
                      back to the teacher.
                    </Text>
                  </View>
                  {learnerAssignmentsLoading && (
                    <Text style={tw`text-[11px] text-[#6b7280] dark:text-white/70`}>Loading…</Text>
                  )}
                </View>

                {/* Marked */}
              <View style={tw`mt-2`}>
                <Text style={tw`text-xs font-semibold text-[#0d141c] dark:text-white`}>
                  Marked / Reviewed
                </Text>
                {markedAssignments.length === 0 && !learnerAssignmentsLoading ? (
                  <Text style={tw`mt-1 text-[11px] text-[#6b7280] dark:text-white/70`}>
                    No marked assignments yet.
                  </Text>
                ) : (
                  markedAssignments.map((a) => renderLearnerAssignmentRow(a, 'marked'))
                )}
              </View>


                {/* Submitted */}
                <View style={tw`mt-2`}>
                  <Text style={tw`text-xs font-semibold text-[#0d141c] dark:text-white`}>
                    Submitted assignments
                  </Text>
                  {submittedAssignments.length === 0 && !learnerAssignmentsLoading ? (
                    <Text style={tw`mt-1 text-[11px] text-[#6b7280] dark:text-white/70`}>
                      You haven&apos;t submitted any classic assignments yet.
                    </Text>
                  ) : (
                    submittedAssignments.map((a: OrgAssignmentRow) =>
                      renderLearnerAssignmentRow(a, deriveClassicWorkStatus(a as any))
                    )
                  )}

                </View>

                {/* Pending */}
                <View style={tw`mt-4`}>
                  <Text style={tw`text-xs font-semibold text-[#0d141c] dark:text-white`}>
                    Assignments to work on
                  </Text>
                 {pendingAssignments.length === 0 && !learnerAssignmentsLoading ? (
                    <Text style={tw`mt-1 text-[11px] text-[#6b7280] dark:text-white/70`}>
                      You don&apos;t have any pending classic assignments for this class or subject yet.
                    </Text>
                  ) : (
                    pendingAssignments.map((a: OrgAssignmentRow) => renderLearnerAssignmentRow(a, 'pending'))
                  )}

                </View>

                {classicAssignments.length > 0 && (
                  <>
                    <View style={tw`flex-row items-center gap-2 mt-3`}>
                      {[10, 25, 50].map((size) => {
                        const active = size === classicPageSize;
                        return (
                          <TouchableOpacity
                            key={size}
                            onPress={() => {
                              setClassicPageSize(size);
                              setClassicPage(1);
                            }}
                            style={[
                              tw`px-2 py-1 rounded-full border`,
                              {
                                borderColor: active ? '#6366f1' : palette.border,
                                backgroundColor: active ? palette.chipBg('#6366f1') : palette.softCard,
                              },
                            ]}
                          >
                            <Text style={[tw`text-[11px] font-semibold`, { color: palette.text }]}>{size} rows</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <View style={tw`mt-2 flex-row items-center justify-between`}>
                      <Text style={[tw`text-[11px]`, { color: palette.textMuted }]}>
                        Showing {classicRangeStart}-{classicRangeEnd} of {classicTotal}
                      </Text>

                      <View style={tw`flex-row items-center gap-2`}>
                        <TouchableOpacity
                          onPress={() => setClassicPage((p) => Math.max(1, p - 1))}
                          disabled={classicPage <= 1}
                          style={[
                            tw`px-3 py-2 rounded-full border`,
                            { borderColor: palette.border, opacity: classicPage <= 1 ? 0.4 : 1 },
                          ]}
                        >
                          <Text style={[tw`text-[11px] font-semibold`, { color: palette.text }]}>Prev</Text>
                        </TouchableOpacity>

                        <Text style={[tw`text-[11px]`, { color: palette.textSubtle }]}>
                          Page {classicPage} / {classicPageCount}
                        </Text>

                        <TouchableOpacity
                          onPress={() => setClassicPage((p) => Math.min(classicPageCount, p + 1))}
                          disabled={classicRangeEnd >= classicTotal}
                          style={[
                            tw`px-3 py-2 rounded-full border`,
                            { borderColor: palette.border, opacity: classicRangeEnd >= classicTotal ? 0.4 : 1 },
                          ]}
                        >
                          <Text style={[tw`text-[11px] font-semibold`, { color: palette.text }]}>Next</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </>
                )}

                {!!learnerStudentId && (
                  <Text style={tw`mt-4 text-[11px] text-[#6b7280] dark:text-white/70`}>
                    Learner ID in this portal: <Text style={tw`font-mono`}>{learnerStudentId}</Text>
                    .
                  </Text>
                )}
              </View>
            </>
          ) : (
            /* ─────────────────────────────────────────
               OWNER / INSTRUCTOR VIEW
             ───────────────────────────────────────── */
            <>
              {/* header */}
              <View style={tw`mb-4`}>
                <Text style={tw`text-[#0d141c] dark:text-white text-2xl font-bold`}>
                  Institution E-Learning
                </Text>
                <Text style={tw`text-[#49739c] dark:text-white/70 text-xs mt-1`}>
                  {isInstructor ? 'Assignments • Analytics' : 'Branding • Assignments • Analytics'}
                </Text>
              </View>

             {/* tabs */}
                  <View style={tw`flex-row flex-wrap mb-3`}>
                    {visibleTabs.map((t) => {
                      const active = tab === t;
                      return (
                        <TouchableOpacity
                          key={t}
                          onPress={() => {
                            // ✅ EXAM RESULTS should navigate immediately (no local tab)
                            if (t === 'examResults') {
                              if (!isProTier) {
                                Alert.alert('Locked', 'Exam results are available on PRO.');
                                return;
                              }
                              openExamResults();
                              return;
                            }

                            setTab(t);
                          }}

                          style={tw`mr-2 mb-2 px-3 py-1.5 rounded-xl ${active ? 'bg-indigo-600' : 'bg-[#e7edf4] dark:bg-white/10'}`}
                        >
                          <Text
                            style={tw`${active ? 'text-white' : 'text-[#0d141c] dark:text-white'} text-sm`}
                            numberOfLines={1}
                          >
                            {TAB_LABEL[t] ?? t}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>


              {/* plan summary */}
              <View
                style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-3 mb-6`}
              >
                <View style={tw`flex-row flex-wrap items-center justify-between`}>
                  <View style={tw`flex-row flex-wrap items-center`}>
                    <Pill>
                      Plan: <Text style={tw`font-semibold`}>{tier.toUpperCase()}</Text>
                    </Pill>
                    <View style={tw`w-2`} />
                    <Pill>
                      Seats: {seatsUsed}/{seatsMax}
                    </Pill>
                    {hasPrioritySupport && (
                      <>
                        <View style={tw`w-2`} />
                        <Pill>Priority support</Pill>
                      </>
                    )}
                    {isInstructor && (
                      <>
                        <View style={tw`w-2`} />
                        <Pill>Instructor view</Pill>
                      </>
                    )}
                  </View>

                  {!isInstructor && (
                    <View style={tw`flex-row items-center mt-2`}>
                      <View
                        style={tw`w-32 h-2 rounded bg-[#e7edf4] dark:bg-white/10 overflow-hidden mr-2`}
                      >
                        <View
                          style={[
                            tw`${nearLimit ? 'bg-red-500' : 'bg-emerald-500'}`,
                            { height: '100%', width: `${seatPct}%` },
                          ]}
                        />
                      </View>
                      {nearLimit && (
                        <Text style={tw`text-red-600 dark:text-red-300 text-xs`}>
                          Near seat limit
                        </Text>
                      )}
                    </View>
                  )}
                </View>

                {!isInstructor && (
                  <View style={tw`flex-row flex-wrap mt-2`}>
                    {(['starter', 'pro', 'enterprise'] as OrgTier[])
                      .filter((t) => t !== tier)
                      .map((next) => (
                        <TouchableOpacity
                          key={next}
                          onPress={() => {
                            if (!canUpgradePlan) return;
                            if (next === 'pro') setShowProModal(true);
                            else if (next === 'enterprise') setShowEnterpriseModal(true);
                            else if (org?.id && authToken) {
                              upgradeOrgTier(backendUrl, authToken, org.id, next)
                                .then((j) => {
                                  setOrg((prev: Org | null) => ({
                                    ...((prev ?? {}) as Org),
                                    ...(j as any),
                                  }));
                                  Alert.alert(
                                    'Plan updated',
                                    `Changed plan to ${next.toUpperCase()}.`
                                  );
                                })
                                .catch(() =>
                                  Alert.alert('Failed', 'Plan change failed. Please try again.')
                                );
                            }
                          }}
                          style={tw`mr-2 mt-2 px-2 py-1 rounded-lg bg-indigo-600`}
                        >
                          <Text style={tw`text-white text-xs`}>Upgrade → {next.toUpperCase()}</Text>
                        </TouchableOpacity>
                      ))}
                  </View>
                )}

                <View style={tw`flex-row flex-wrap mt-2`}>
                  {ORG_TIERS[tier].features.map((f) => (
                    <View
                      key={f}
                      style={tw`mr-1 mt-1 px-2 py-0.5 rounded-full bg-[#e7edf4] dark:bg-white/10`}
                    >
                      <Text style={tw`text-[#0d141c] dark:text-white/90 text-[11px]`}>{f}</Text>
                    </View>
                  ))}
                </View>

                {isInstructor && (
                  <Text style={tw`mt-2 text-[11px] text-[#49739c] dark:text-white/70`}>
                    Your institution owner/admin manages branding and subscriptions. As an
                    instructor you can create assignments and view analytics here.
                  </Text>
                )}
              </View>

              {/* BRANDING */}
              {tab === 'branding' && canBrandingRole && (
                <View
                  style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4 mb-6`}
                >
                  <Text style={tw`text-[#0d141c] dark:text-white text-lg font-semibold mb-3`}>
                    Branding
                  </Text>

                  <Text style={tw`text-[#49739c] dark:text-white/80 text-xs`}>
                    Organization name
                  </Text>
                  <TextInput
                    value={form.name}
                    onChangeText={(v) => setForm((f: any) => ({ ...f, name: v }))}
                    placeholder="My School / Org"
                    placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                    style={tw`mt-1 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 rounded px-3 py-2 text-[#0d141c] dark:text-white`}
                  />

                  {/* LOGO & SIGNATURES */}
                  <View
                    style={tw`mt-4 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-[#f8fbff] dark:bg-white/5`}
                  >
                    <TouchableOpacity
                      onPress={() => setShowLogoSection((v) => !v)}
                      style={tw`flex-row items-center justify-between px-3 py-2`}
                    >
                      <View>
                        <Text style={tw`text-[#0d141c] dark:text-white text-sm font-semibold`}>
                          Logo & Signatures
                        </Text>
                        <Text style={tw`text-[#49739c] dark:text-white/70 text-[11px]`}>
                          Upload logo and signatures for certificates and reports.
                        </Text>
                      </View>
                      <Text style={tw`text-[#49739c] dark:text-white/70 text-lg`}>
                        {showLogoSection ? '−' : '+'}
                      </Text>
                    </TouchableOpacity>

                    {showLogoSection && (
                      <View style={tw`px-3 pb-3`}>
                        {/* logo */}
                        <Text style={tw`mt-2 text-[#49739c] dark:text-white/80 text-xs`}>
                          Logo image
                        </Text>
                        <View style={tw`flex-row items-center mt-1`}>
                          <TouchableOpacity
                            onPress={() => handleUpload('logo_url')}
                            disabled={uploadingLogo}
                            style={tw`px-3 py-2 rounded-xl bg-indigo-600 mr-2 ${uploadingLogo ? 'opacity-60' : ''}`}
                          >
                            {uploadingLogo ? (
                              <ActivityIndicator color="#fff" />
                            ) : (
                              <Text style={tw`text-white text-xs`}>Upload logo</Text>
                            )}
                          </TouchableOpacity>

                          <Text
                            numberOfLines={1}
                            style={tw`flex-1 text-[11px] ${form.logo_url ? 'text-[#49739c] dark:text-white/70' : 'text-[#9CA3AF] dark:text-white/50'}`}
                          >
                            {form.logo_url || 'No logo uploaded yet'}
                          </Text>
                        </View>

                        <Text style={tw`mt-2 text-[#49739c] dark:text-white/80 text-[11px]`}>
                          Or paste logo URL
                        </Text>
                        <TextInput
                          value={form.logo_url}
                          onChangeText={(v) => setForm((f: any) => ({ ...f, logo_url: v }))}
                          placeholder="https://…/logo.png"
                          placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                          style={tw`mt-1 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 rounded px-3 py-2 text-[#0d141c] dark:text-white text-xs`}
                        />

                        {/* principal signature */}
                        <View style={tw`h-3`} />
                        <Text style={tw`text-[#49739c] dark:text-white/80 text-xs`}>
                          Principal / Director signature image
                        </Text>
                        <View style={tw`flex-row items-center mt-1`}>
                          <TouchableOpacity
                            onPress={() => handleUpload('signature_url')}
                            disabled={uploadingSignature}
                            style={tw`px-3 py-2 rounded-xl bg-indigo-600 mr-2 ${uploadingSignature ? 'opacity-60' : ''}`}
                          >
                            {uploadingSignature ? (
                              <ActivityIndicator color="#fff" />
                            ) : (
                              <Text style={tw`text-white text-xs`}>Upload signature</Text>
                            )}
                          </TouchableOpacity>

                          <Text
                            numberOfLines={1}
                            style={tw`flex-1 text-[11px] ${form.signature_url ? 'text-[#49739c] dark:text-white/70' : 'text-[#9CA3AF] dark:text-white/50'}`}
                          >
                            {form.signature_url || 'No signature uploaded yet'}
                          </Text>
                        </View>

                        <Text style={tw`mt-2 text-[#49739c] dark:text-white/80 text-[11px]`}>
                          Or paste signature URL
                        </Text>
                        <TextInput
                          value={form.signature_url}
                          onChangeText={(v) => setForm((f: any) => ({ ...f, signature_url: v }))}
                          placeholder="https://…/signature.png"
                          placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                          style={tw`mt-1 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 rounded px-3 py-2 text-[#0d141c] dark:text-white text-xs`}
                        />

                        {/* instructor signature */}
                        <View style={tw`h-3`} />
                        <Text style={tw`text-[#49739c] dark:text-white/80 text-xs`}>
                          Instructor signature image (optional)
                        </Text>
                        <View style={tw`flex-row items-center mt-1`}>
                          <TouchableOpacity
                            onPress={() => handleUpload('instructor_signature_url')}
                            disabled={uploadingInstructorSignature}
                            style={tw`px-3 py-2 rounded-xl bg-indigo-600 mr-2 ${uploadingInstructorSignature ? 'opacity-60' : ''}`}
                          >
                            {uploadingInstructorSignature ? (
                              <ActivityIndicator color="#fff" />
                            ) : (
                              <Text style={tw`text-white text-xs`}>
                                Upload instructor signature
                              </Text>
                            )}
                          </TouchableOpacity>

                          <Text
                            numberOfLines={1}
                            style={tw`flex-1 text-[11px] ${form.instructor_signature_url ? 'text-[#49739c] dark:text-white/70' : 'text-[#9CA3AF] dark:text-white/50'}`}
                          >
                            {form.instructor_signature_url ||
                              'No instructor signature uploaded yet'}
                          </Text>
                        </View>

                        <Text style={tw`mt-2 text-[#49739c] dark:text-white/80 text-[11px]`}>
                          Or paste instructor signature URL
                        </Text>
                        <TextInput
                          value={form.instructor_signature_url}
                          onChangeText={(v) =>
                            setForm((f: any) => ({ ...f, instructor_signature_url: v }))
                          }
                          placeholder="https://…/instructor-signature.png"
                          placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                          style={tw`mt-1 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 rounded px-3 py-2 text-[#0d141c] dark:text-white text-xs`}
                        />

                        {/* bursar/finance signature */}
                              <View style={tw`h-3`} />
                              <Text style={tw`text-[#49739c] dark:text-white/80 text-xs`}>
                                Bursar / Finance office signature image (optional)
                              </Text>

                              <View style={tw`flex-row items-center mt-1`}>
                                <TouchableOpacity
                                  onPress={() => handleUpload('bursar_signature_url')}
                                  disabled={uploadingBursarSignature}
                                  style={tw`px-3 py-2 rounded-xl bg-indigo-600 mr-2 ${uploadingBursarSignature ? 'opacity-60' : ''}`}
                                >
                                  {uploadingBursarSignature ? (
                                    <ActivityIndicator color="#fff" />
                                  ) : (
                                    <Text style={tw`text-white text-xs`}>Upload bursar signature</Text>
                                  )}
                                </TouchableOpacity>

                                <Text
                                  numberOfLines={1}
                                  style={tw`flex-1 text-[11px] ${
                                    form.bursar_signature_url
                                      ? 'text-[#49739c] dark:text-white/70'
                                      : 'text-[#9CA3AF] dark:text-white/50'
                                  }`}
                                >
                                  {form.bursar_signature_url || 'No bursar signature uploaded yet'}
                                </Text>
                              </View>

                              <Text style={tw`mt-2 text-[#49739c] dark:text-white/80 text-[11px]`}>
                                Or paste bursar signature URL
                              </Text>

                              <TextInput
                                value={form.bursar_signature_url}
                                onChangeText={(v) => setForm((f: any) => ({ ...f, bursar_signature_url: v }))}
                                placeholder="https://…/bursar-signature.png"
                                placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                                style={tw`mt-1 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 rounded px-3 py-2 text-[#0d141c] dark:text-white text-xs`}
                              />

                      </View>
                    )}
                  </View>

                  {/* SSO & access */}
                  <View
                    style={tw`mt-4 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-[#f8fbff] dark:bg-white/5`}
                  >
                    <TouchableOpacity
                      onPress={() => setShowSsoSection((v) => !v)}
                      style={tw`flex-row items-center justify-between px-3 py-2`}
                    >
                      <View>
                        <Text style={tw`text-[#0d141c] dark:text-white text-sm font-semibold`}>
                          SSO & Access
                        </Text>
                        <Text style={tw`text-[#49739c] dark:text-white/70 text-[11px]`}>
                          Restrict enrollments to email domains and receive webhooks.
                        </Text>
                      </View>
                      <Text style={tw`text-[#49739c] dark:text-white/70 text-lg`}>
                        {showSsoSection ? '−' : '+'}
                      </Text>
                    </TouchableOpacity>

                    {showSsoSection && (
                      <View style={tw`px-3 pb-3`}>
                        <Text style={tw`mt-2 text-[#49739c] dark:text-white/80 text-xs`}>
                          Allowed email domains (comma separated)
                        </Text>
                        <TextInput
                          editable={canSSO}
                          value={form.email_domain ?? ''}
                          onChangeText={(v) => setForm((f: any) => ({ ...f, email_domain: v }))}
                          placeholder="example.edu, school.ac.ke"
                          placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                          style={tw`mt-1 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 rounded px-3 py-2 text-[#0d141c] dark:text-white ${!canSSO ? 'opacity-60' : ''}`}
                        />
                        {!canSSO && (
                          <Text style={tw`mt-1 text-[11px] text-[#ea580c] dark:text-amber-300/90`}>
                            Domain restrict / SSO is available on PRO and ENTERPRISE plans.
                          </Text>
                        )}

                        <View style={tw`flex-row items-center mt-4 justify-between`}>
                          <View>
                            <Text style={tw`text-[#49739c] dark:text-white/80 text-xs`}>
                              Webhook for completions
                            </Text>
                            <Text style={tw`text-[#6b7280] dark:text-white/60 text-[11px]`}>
                              Receive events when learners complete quizzes or certificates.
                            </Text>
                          </View>
                          <Switch
                            value={!!form.webhook_enabled}
                            onValueChange={(v: boolean) => {
                              if (!canWebhooks) return;
                              setForm((f: any) => ({ ...f, webhook_enabled: v }));
                            }}
                            disabled={!canWebhooks}
                            trackColor={{
                              false: resolvedScheme === 'dark' ? '#4b5563' : '#d1d5db',
                              true: '#4ade80',
                            }}
                            thumbColor={resolvedScheme === 'dark' ? '#f9fafb' : '#111827'}
                          />
                        </View>

                        <Text style={tw`mt-2 text-[#49739c] dark:text-white/80 text-xs`}>
                          Webhook URL (HTTPS)
                        </Text>
                        <TextInput
                          editable={canWebhooks}
                          value={form.webhook_url ?? ''}
                          onChangeText={(v) => setForm((f: any) => ({ ...f, webhook_url: v }))}
                          placeholder="https://example.com/webhooks/elearn"
                          placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                          style={tw`mt-1 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 rounded px-3 py-2 text-[#0d141c] dark:text-white ${!canWebhooks ? 'opacity-60' : ''}`}
                        />
                        {!canWebhooks && (
                          <Text style={tw`mt-1 text-[11px] text-[#ea580c] dark:text-amber-300/90`}>
                            Webhooks are available on ENTERPRISE plans.
                          </Text>
                        )}
                      </View>
                    )}
                  </View>

                  {/* instructors */}
                  <View
                    style={tw`mt-4 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-[#f8fbff] dark:bg-white/5`}
                  >
                    <TouchableOpacity
                      onPress={() => setShowInstructorsSection((v) => !v)}
                      style={tw`flex-row items-center justify-between px-3 py-2`}
                    >
                      <View>
                        <Text style={tw`text-[#0d141c] dark:text-white text-sm font-semibold`}>
                          Instructors & admins
                        </Text>
                        <Text style={tw`text-[#49739c] dark:text-white/70 text-[11px]`}>
                          View who can assign courses and manage reports.
                        </Text>
                      </View>
                      <Text style={tw`text-[#49739c] dark:text-white/70 text-lg`}>
                        {showInstructorsSection ? '−' : '+'}
                      </Text>
                    </TouchableOpacity>

                    {showInstructorsSection && (
                      <View style={tw`px-3 pb-3`}>
                        {instructors.length === 0 ? (
                          <Text style={tw`mt-2 text-[#49739c] dark:text-white/80 text-xs`}>
                            No instructors configured yet. Use the web dashboard → Institution →
                            E-Learning → Staff.
                          </Text>
                        ) : (
                          <>
                            {instructors.map((u) => (
                              <View
                                key={u.user_id}
                                style={tw`mt-2 p-2 rounded-xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
                              >
                                <Text
                                  style={tw`text-[#0d141c] dark:text-white text-sm font-semibold`}
                                >
                                  {u.name || u.email || `User #${u.user_id}`}
                                </Text>
                                {!!u.email && (
                                  <Text style={tw`text-[#49739c] dark:text-white/60 text-[11px]`}>
                                    {u.email}
                                  </Text>
                                )}
                                <Text style={tw`mt-1 text-[#49739c] dark:text-white/80 text-xs`}>
                                  Role: {u.role ? String(u.role).toUpperCase() : 'INSTRUCTOR'}
                                </Text>
                              </View>
                            ))}
                          </>
                        )}
                      </View>
                    )}
                  </View>

                  {/* certificate + defaults */}
                  <View style={tw`h-3`} />
                  <Text style={tw`text-[#49739c] dark:text-white/80 text-xs`}>
                    Certificate title
                  </Text>
                  <TextInput
                    value={form.certificate_title}
                    onChangeText={(v) => setForm((f: any) => ({ ...f, certificate_title: v }))}
                    placeholder="Certificate of Completion"
                    placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                    style={tw`mt-1 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 rounded px-3 py-2 text-[#0d141c] dark:text-white`}
                  />

                  <View style={tw`h-3`} />
                  <Text style={tw`text-[#49739c] dark:text-white/80 text-xs`}>
                    Default pass mark (%)
                  </Text>
                  <TextInput
                    keyboardType="numeric"
                    value={String(form.default_pass_mark ?? '')}
                    onChangeText={(v) =>
                      setForm((f: any) => ({ ...f, default_pass_mark: Number(v) || 0 }))
                    }
                    placeholder="70"
                    placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                    style={tw`mt-1 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 rounded px-3 py-2 text-[#0d141c] dark:text-white`}
                  />

                  <View style={tw`h-3`} />
                  <Text style={tw`text-[#49739c] dark:text-white/80 text-xs`}>
                    Quiz time limit (seconds)
                  </Text>
                  <TextInput
                    keyboardType="numeric"
                    value={String(form.quiz_time_limit_s ?? '')}
                    onChangeText={(v) =>
                      setForm((f: any) => ({ ...f, quiz_time_limit_s: Number(v) || 0 }))
                    }
                    placeholder="900"
                    placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                    style={tw`mt-1 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 rounded px-3 py-2 text-[#0d141c] dark:text-white`}
                  />

                  {/* contact */}
                  <View style={tw`h-3`} />
                  <Text style={tw`text-[#49739c] dark:text-white/80 text-xs`}>Address line 1</Text>
                  <TextInput
                    value={form.address_line1 ?? ''}
                    onChangeText={(v) => setForm((f: any) => ({ ...f, address_line1: v }))}
                    placeholder="123 Main Street"
                    placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                    style={tw`mt-1 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 rounded px-3 py-2 text-[#0d141c] dark:text-white`}
                  />

                  <View style={tw`h-3`} />
                  <Text style={tw`text-[#49739c] dark:text-white/80 text-xs`}>
                    Address line 2 (optional)
                  </Text>
                  <TextInput
                    value={form.address_line2 ?? ''}
                    onChangeText={(v) => setForm((f: any) => ({ ...f, address_line2: v }))}
                    placeholder="Street, City"
                    placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                    style={tw`mt-1 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 rounded px-3 py-2 text-[#0d141c] dark:text-white`}
                  />

                  <View style={tw`h-3`} />
                  <Text style={tw`text-[#49739c] dark:text-white/80 text-xs`}>Phone number</Text>
                  <TextInput
                    value={form.phone_number ?? ''}
                    onChangeText={(v) => setForm((f: any) => ({ ...f, phone_number: v }))}
                    placeholder="+00 123 456 789"
                    placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                    style={tw`mt-1 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 rounded px-3 py-2 text-[#0d141c] dark:text-white`}
                  />

                  <View style={tw`h-3`} />
                  <Text style={tw`text-[#49739c] dark:text-white/80 text-xs`}>Contact email</Text>
                  <TextInput
                    value={form.contact_email ?? ''}
                    onChangeText={(v) => setForm((f: any) => ({ ...f, contact_email: v }))}
                    placeholder="info@school.example"
                    placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                    style={tw`mt-1 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 rounded px-3 py-2 text-[#0d141c] dark:text-white`}
                  />

                  <View style={tw`h-3`} />
                  <Text style={tw`text-[#49739c] dark:text-white/80 text-xs`}>Website URL</Text>
                  <TextInput
                    value={form.website_url ?? ''}
                    onChangeText={(v) => setForm((f: any) => ({ ...f, website_url: v }))}
                    placeholder="https://school.example"
                    placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                    style={tw`mt-1 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 rounded px-3 py-2 text-[#0d141c] dark:text-white`}
                  />

                  {/* actions */}
                  <View style={tw`flex-row mt-4 flex-wrap`}>
                    <TouchableOpacity
                      onPress={saveBranding}
                      style={tw`px-4 py-2 rounded-xl bg-emerald-600`}
                    >
                      <Text style={tw`text-white font-semibold`}>Save branding</Text>
                    </TouchableOpacity>

                    {canEmailReports && (
                      <TouchableOpacity
                        onPress={async () => {
                          if (!org?.id || !authToken) return;
                          try {
                            const resp = await sendOrgReportTest(backendUrl, authToken, org.id);
                            Alert.alert(
                              (resp as any)?.ok ? 'Sent' : 'Failed',
                              (resp as any)?.ok
                                ? 'Test report queued to org admins.'
                                : 'Failed to send report.'
                            );
                          } catch {
                            Alert.alert('Error', 'Failed to send report.');
                          }
                        }}
                        style={tw`ml-2 px-4 py-2 rounded-xl bg-indigo-600`}
                      >
                        <Text style={tw`text-white font-semibold`}>Send test report</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              {/* ASSIGN */}
              {tab === 'assign' && (
                <View
                  style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`}
                >
                  <Text style={tw`text-[#0d141c] dark:text-white text-lg font-semibold mb-3`}>
                    Assignments
                  </Text>

                  {/* Scope hint */}
                  {(assignClassLabel || assignSubjectKey) && (
                    <View
                      style={tw`mb-3 rounded-xl bg-[#f8fbff] dark:bg-white/5 border border-[#cedbe8] dark:border-white/10 px-3 py-2`}
                    >
                      <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
                        This work is scoped to{' '}
                        {assignClassLabel ? (
                          <Text style={tw`font-semibold`}>{assignClassLabel}</Text>
                        ) : null}
                        {assignClassLabel && assignSubjectKey ? ' · ' : ''}
                        {assignSubjectKey ? (
                          <Text style={tw`font-semibold`}>{assignSubjectKey}</Text>
                        ) : null}
                        .
                      </Text>
                    </View>
                  )}

                  {/* CLASSIC */}
                  <View
                    style={tw`rounded-2xl bg-[#f8fbff] dark:bg-[#111b28] border border-[#cedbe8] dark:border-white/10 p-3 mb-4`}
                  >
                    <Text
                      style={tw`text-[11px] uppercase tracking-wide text-[#6b7280] dark:text-white/60`}
                    >
                      Classic assignment
                    </Text>
                    <Text style={tw`mt-1 text-sm font-semibold text-[#0d141c] dark:text-white`}>
                      Attach a worksheet or project brief
                    </Text>
                    <Text style={tw`mt-1 text-[11px] text-[#49739c] dark:text-white/70`}>
                      Learners download your file, complete the work, then submit their own file or
                      typed answer.
                    </Text>

                    <View style={tw`mt-3`}>
                      <ScopeFields
                          classLabel={assignClassLabel}
                          subjectKey={assignSubjectKey}
                          onChangeClass={onChangeClassScope}
                          onChangeSubject={onChangeSubjectScope}
                          errors={scopeErrors}
                          resolvedScheme={resolvedScheme}
                        />

                    </View>

                    <View style={tw`mt-3`}>
                      <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
                        Assignment title
                      </Text>
                      <TextInput
                        style={tw`mt-1 px-3 py-2 rounded bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 text-[#0d141c] dark:text-white text-xs`}
                        placeholder="Term 2 Algebra worksheet"
                        placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                        value={legacyTitle}
                        onChangeText={setLegacyTitle}
                      />

                      <View style={tw`h-3`} />
                      <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
                        Deadline (optional)
                      </Text>
                      <View style={tw`mt-1 flex-row items-center`}>
                        <TouchableOpacity
                          onPress={handleLegacyDeadlinePress}
                          style={tw`px-3 py-2 rounded bg-[#e7edf4] dark:bg-white/10`}
                        >
                          <Text style={tw`text-xs text-[#0d141c] dark:text-white`}>
                            {legacyDueAt ? 'Change deadline' : 'Pick date & time'}
                          </Text>
                        </TouchableOpacity>

                        <Text
                          style={tw`ml-2 flex-1 text-[11px] ${legacyDueAt ? 'text-[#49739c] dark:text-white/70' : 'text-[#9CA3AF] dark:text-white/50'}`}
                          numberOfLines={2}
                        >
                          {legacyDueAt
                            ? `${new Date(legacyDueAt).toLocaleString()} (${legacyDueAt})`
                            : 'No deadline set'}
                        </Text>
                      </View>
                    </View>

                    <View style={tw`mt-3`}>
                      <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
                        Instructions
                      </Text>
                      <TextInput
                        multiline
                        textAlignVertical="top"
                        style={tw`mt-1 px-3 py-2 rounded bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 text-[#0d141c] dark:text-white text-xs h-24`}
                        placeholder="Explain what learners should do, how to name their files, and how you will grade them…"
                        placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                        value={legacyInstructions}
                        onChangeText={setLegacyInstructions}
                      />
                    </View>

                    <View style={tw`mt-3`}>
                      <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
                        Attach assignment file (PDF, DOC, slides…)
                      </Text>
                      <View style={tw`mt-1 flex-row items-center`}>
                        <TouchableOpacity
                          onPress={handlePickLegacyAttachment}
                          disabled={legacyUploadingAttachment}
                          style={tw`px-3 py-2 rounded bg-[#e7edf4] dark:bg-white/10`}
                        >
                          {legacyUploadingAttachment ? (
                            <ActivityIndicator
                              color={resolvedScheme === 'dark' ? '#ffffff' : '#0d141c'}
                            />
                          ) : (
                            <Text style={tw`text-xs text-[#0d141c] dark:text-white`}>
                              {legacyAttachmentLabel ? 'Change attachment' : 'Pick attachment'}
                            </Text>
                          )}
                        </TouchableOpacity>

                        <Text
                          style={tw`ml-2 flex-1 text-[11px] ${legacyAttachmentLabel ? 'text-[#49739c] dark:text-white/70' : 'text-[#9CA3AF] dark:text-white/50'}`}
                          numberOfLines={1}
                        >
                          {legacyAttachmentLabel || 'No file selected'}
                        </Text>
                      </View>
                    </View>

                    <View style={tw`mt-3 flex-row justify-end`}>
                      <TouchableOpacity
                        onPress={createLegacyAssignment}
                        disabled={creatingLegacyAssignment}
                        style={tw`px-4 py-2 rounded-2xl bg-emerald-600 ${creatingLegacyAssignment ? 'opacity-60' : ''}`}
                      >
                        <Text style={tw`text-white text-sm font-semibold`}>
                          {creatingLegacyAssignment ? 'Sharing…' : 'Share with class'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* AI */}
                  <View
                    style={tw`rounded-2xl bg-[#f8fbff] dark:bg-white/5 border border-[#cedbe8] dark:border-white/10 p-3`}
                  >
                    <Text
                      style={tw`text-[11px] uppercase tracking-wide text-[#6b7280] dark:text-white/60`}
                    >
                      Teach with AI
                    </Text>
                    <Text style={tw`mt-1 text-sm font-semibold text-[#0d141c] dark:text-white`}>
                      Link a Robot Tutor course as an assignment
                    </Text>
                    <Text style={tw`mt-1 text-[11px] text-[#49739c] dark:text-white/70`}>
                      Choose an AI course, set optional pass marks and timers, then share the invite
                      link.
                    </Text>

                    <View style={tw`mt-2 flex-row`}>
                      <TouchableOpacity
                        onPress={() => navigation.navigate('RobotTutor')}
                        style={tw`px-3 py-1.5 rounded-xl bg-[#e7edf4] dark:bg-white/10`}
                      >
                        <Text style={tw`text-[11px] text-[#0d141c] dark:text-white`}>
                          Open “Teach with AI”
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View style={tw`mt-3`}>

                      <ScopeFields
                      classLabel={assignClassLabel}
                      subjectKey={assignSubjectKey}
                      onChangeClass={onChangeClassScope}
                      onChangeSubject={onChangeSubjectScope}
                      errors={scopeErrors}
                      resolvedScheme={resolvedScheme}
                    />

                      <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
                        Course ID
                      </Text>
                      <TextInput
                        value={courseId}
                        onChangeText={(v) => {
                          setCourseId(v);
                          navigation.setParams?.({ courseId: v });
                        }}
                        placeholder="course uuid"
                        placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                        style={tw`mt-1 px-3 py-2 rounded bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 text-[#0d141c] dark:text-white text-xs`}
                      />

                      <View style={tw`h-3`} />
                      <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
                        Title override (optional)
                      </Text>
                      <TextInput
                        value={titleOverride}
                        onChangeText={setTitleOverride}
                        placeholder="Intro to Cybersecurity — Cohort A"
                        placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                        style={tw`mt-1 px-3 py-2 rounded bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 text-[#0d141c] dark:text-white text-xs`}
                      />

                      {canCustomPassTimers && (
                        <>
                          <View style={tw`h-3`} />
                          <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
                            Pass mark (%)
                          </Text>
                          <TextInput
                            keyboardType="numeric"
                            value={String(passMark ?? '')}
                            onChangeText={(v) => setPassMark(v === '' ? '' : Number(v) || 0)}
                            placeholder="e.g. 70"
                            placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                            style={tw`mt-1 px-3 py-2 rounded bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 text-[#0d141c] dark:text-white text-xs`}
                          />

                          <View style={tw`h-3`} />
                          <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
                            Timer (seconds)
                          </Text>
                          <TextInput
                            keyboardType="numeric"
                            value={String(timer ?? '')}
                            onChangeText={(v) => setTimer(v === '' ? '' : Number(v) || 0)}
                            placeholder="e.g. 1800"
                            placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                            style={tw`mt-1 px-3 py-2 rounded bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 text-[#0d141c] dark:text-white text-xs`}
                          />
                        </>
                      )}

                      <View style={tw`h-3`} />
                      <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
                        Due at (optional)
                      </Text>
                      <View style={tw`mt-1 flex-row items-center`}>
                        <TouchableOpacity
                          onPress={handleAiDeadlinePress}
                          style={tw`px-3 py-2 rounded bg-[#e7edf4] dark:bg-white/10`}
                        >
                          <Text style={tw`text-xs text-[#0d141c] dark:text-white`}>
                            {dueAt ? 'Change deadline' : 'Pick date & time'}
                          </Text>
                        </TouchableOpacity>

                        <Text
                          style={tw`ml-2 flex-1 text-[11px] ${dueAt ? 'text-[#49739c] dark:text-white/70' : 'text-[#9CA3AF] dark:text-white/50'}`}
                          numberOfLines={2}
                        >
                          {dueAt
                            ? `${new Date(dueAt).toLocaleString()} (${dueAt})`
                            : 'No deadline set'}
                        </Text>
                      </View>
                    </View>

                    <View style={tw`flex-row mt-4`}>
                      <TouchableOpacity
                        onPress={createAssignment}
                        style={tw`px-4 py-2 rounded-xl bg-emerald-600`}
                      >
                        <Text style={tw`text-white font-semibold text-sm`}>
                          Create AI assignment
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {!!inviteLink && (
                      <View style={tw`mt-4`}>
                        <Text style={tw`text-[11px] text-[#49739c] dark:text-white/80 mb-1`}>
                          Invite link
                        </Text>
                        <Text selectable style={tw`text-xs text-[#0d141c] dark:text-white`}>
                          {inviteLink}
                        </Text>

                        {instructorEmails.length > 0 && (
                          <View style={tw`mt-2 flex-row flex-wrap`}>
                            {bccChunks.map((grp, idx) => (
                              <TouchableOpacity
                                key={`${idx}`}
                                onPress={() => emailInstructorsGroup(grp)}
                                style={tw`mr-2 mb-2 px-3 py-2 rounded bg-[#e7edf4] dark:bg-white/10`}
                              >
                                <Text style={tw`text-xs text-[#0d141c] dark:text-white`}>
                                  {bccChunks.length === 1
                                    ? 'Email instructors'
                                    : `Email instructors (grp ${idx + 1})`}
                                </Text>
                              </TouchableOpacity>
                            ))}

                            <TouchableOpacity
                              onPress={shareViaWhatsApp}
                              style={tw`mr-2 mb-2 px-3 py-2 rounded bg-[#e7edf4] dark:bg-white/10`}
                            >
                              <Text style={tw`text-xs text-[#0d141c] dark:text-white`}>
                                WhatsApp instructors
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        <TouchableOpacity
                          onPress={copyLink}
                          style={tw`mt-2 px-3 py-2 rounded bg-indigo-600 self-start`}
                        >
                          <Text style={tw`text-white text-xs`}>Share invite link</Text>
                        </TouchableOpacity>

                        {!!(form.email_domain || (org as any)?.email_domain) && (
                          <Text style={tw`mt-2 text-[11px] text-[#ea580c] dark:text-amber-300`}>
                            This invite is restricted to{' '}
                            <Text style={tw`font-semibold`}>
                              {String(form.email_domain || (org as any)?.email_domain || '').trim()}
                            </Text>
                            .
                          </Text>
                        )}
                      </View>
                    )}

                    <Text style={tw`mt-2 text-[11px] text-[#49739c] dark:text-white/70`}>
                      Use the AI invite link for timed quizzes and auto-marking. For open-ended
                      projects, use the classic assignment card above.
                    </Text>
                  </View>
                </View>
              )}

              {/* ANALYTICS */}
              {tab === 'analytics' && (
                <View
                  style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`}
                >
                  <View style={tw`flex-row justify-between items-center mb-3`}>
                    <Text style={tw`text-[#0d141c] dark:text-white text-lg font-semibold`}>
                      Analytics
                    </Text>

                    <View style={tw`flex-row`}>
                      <TouchableOpacity
                        onPress={() => setPeriod('month')}
                        style={tw`px-3 py-1.5 rounded-lg mr-2 ${period === 'month' ? 'bg-indigo-600' : 'bg-[#e7edf4] dark:bg-white/10'}`}
                      >
                        <Text
                          style={tw`${period === 'month' ? 'text-white' : 'text-[#0d141c] dark:text-white'} text-xs`}
                        >
                          Monthly
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        disabled={!canMultiPeriodAnalytics}
                        onPress={() => setPeriod('term')}
                        style={tw`px-3 py-1.5 rounded-lg mr-2 ${period === 'term' ? 'bg-indigo-600' : 'bg-[#e7edf4] dark:bg-white/10'} ${!canMultiPeriodAnalytics ? 'opacity-50' : ''}`}
                      >
                        <Text
                          style={tw`${period === 'term' ? 'text-white' : 'text-[#0d141c] dark:text-white'} text-xs`}
                        >
                          Termly
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        disabled={!canMultiPeriodAnalytics}
                        onPress={() => setPeriod('year')}
                        style={tw`px-3 py-1.5 rounded-lg ${period === 'year' ? 'bg-indigo-600' : 'bg-[#e7edf4] dark:bg-white/10'} ${!canMultiPeriodAnalytics ? 'opacity-50' : ''}`}
                      >
                        <Text
                          style={tw`${period === 'year' ? 'text-white' : 'text-[#0d141c] dark:text-white'} text-xs`}
                        >
                          Yearly
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={tw`flex-row mb-3 flex-wrap`}>
                    <TouchableOpacity
                      onPress={loadAnalytics}
                      style={tw`px-3 py-2 rounded-lg bg-indigo-600 mr-2`}
                    >
                      <Text style={tw`text-white text-xs`}>Refresh</Text>
                    </TouchableOpacity>

                    {canCSV && (
                      <TouchableOpacity
                        onPress={async () => {
                          try {
                            const rows: (string | number)[][] = [
                              ['Bucket', 'Attempts', 'Passes', 'Avg Score'],
                            ];
                            analytics.forEach((r) => {
                              const bucketISO = new Date((r as any).bucket).toISOString();
                              const attempts = Number((r as any).attempts ?? 0);
                              const passes = Number((r as any).passes ?? 0);
                              const avg = `${Math.round((r as any).avg_score ?? 0)}%`;
                              rows.push([bucketISO, attempts, passes, avg]);
                            });

                            const csv = rows
                              .map((r) =>
                                r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
                              )
                              .join('\n');

                            await Share.share({ message: csv });
                          } catch {
                            Alert.alert('Export failed', 'Could not export CSV.');
                          }
                        }}
                        style={tw`px-3 py-2 rounded-lg bg-[#e7edf4] dark:bg-white/10`}
                      >
                        <Text style={tw`text-[#0d141c] dark:text-white text-xs`}>Export CSV</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Summary cards */}
                  {analyticsSummary && (
                    <View style={tw`mb-3`}>
                      <View style={tw`flex-row flex-wrap`}>
                        <View
                          style={tw`mr-2 mb-2 px-3 py-2 rounded-xl bg-[#f8fbff] dark:bg-white/5 border border-[#cedbe8] dark:border-white/10`}
                        >
                          <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
                            Overall
                          </Text>
                          <Text style={tw`text-[#0d141c] dark:text-white font-semibold`}>
                            {analyticsSummary.overallAvgScore}% avg •{' '}
                            {analyticsSummary.overallPassRate}% pass
                          </Text>
                          <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
                            {analyticsSummary.totalAttempts} attempts •{' '}
                            {analyticsSummary.totalPasses} passes
                          </Text>
                        </View>

                        <View
                          style={tw`mr-2 mb-2 px-3 py-2 rounded-xl bg-[#f8fbff] dark:bg-white/5 border border-[#cedbe8] dark:border-white/10`}
                        >
                          <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
                            Robot quizzes
                          </Text>
                          <Text style={tw`text-[#0d141c] dark:text-white font-semibold`}>
                            {analyticsSummary.robotQuizPassRate}% pass
                          </Text>
                          <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
                            {analyticsSummary.robotQuizAttempts} attempts •{' '}
                            {analyticsSummary.robotQuizPasses} passes
                          </Text>
                        </View>

                        <View
                          style={tw`mr-2 mb-2 px-3 py-2 rounded-xl bg-[#f8fbff] dark:bg-white/5 border border-[#cedbe8] dark:border-white/10`}
                        >
                          <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
                            Assignments
                          </Text>
                          <Text style={tw`text-[#0d141c] dark:text-white font-semibold`}>
                            {analyticsSummary.assignmentPassRate}% pass
                          </Text>
                          <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
                            {analyticsSummary.assignmentAttempts} attempts •{' '}
                            {analyticsSummary.assignmentPasses} passes
                          </Text>
                        </View>

                        <View
                          style={tw`mr-2 mb-2 px-3 py-2 rounded-xl bg-[#f8fbff] dark:bg-white/5 border border-[#cedbe8] dark:border-white/10`}
                        >
                          <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
                            Exams
                          </Text>
                          <Text style={tw`text-[#0d141c] dark:text-white font-semibold`}>
                            {analyticsSummary.examsPassRate}% pass
                          </Text>
                          <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`}>
                            {analyticsSummary.examsAttempts} attempts •{' '}
                            {analyticsSummary.examsPasses} passes
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {loadingAnalytics ? (
                    <View style={tw`py-6 items-center`}>
                      <ActivityIndicator
                        color={resolvedScheme === 'dark' ? '#ffffff' : '#0d141c'}
                      />
                    </View>
                  ) : analytics.length === 0 ? (
                    <Text style={tw`text-[#49739c] dark:text-white/80 text-sm`}>
                      No analytics yet.
                    </Text>
                  ) : (
                    <View>
                      {analytics.map((row: any, idx: number) => (
                        <View
                          key={`${row.bucket}-${idx}`}
                          style={tw`mb-2 p-3 rounded-lg bg-[#f8fbff] dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
                        >
                          <Text style={tw`text-[#0d141c] dark:text-white font-semibold`}>
                            {new Date(row.bucket).toLocaleString()}
                          </Text>
                          <Text style={tw`text-[#49739c] dark:text-white/80 text-xs mt-1`}>
                            Attempts: {row.attempts} • Passes: {row.passes} • Avg:{' '}
                            {Math.round(row.avg_score ?? 0)}%
                          </Text>

                          {canEmailReports && (
                            <TouchableOpacity
                              onPress={() =>
                                sendOrgReportRow(
                                  backendUrl,
                                  authToken!,
                                  org!.id,
                                  new Date(row.bucket).toISOString(),
                                  period
                                )
                                  .then((ok) => {
                                    if ((ok as any)?.ok) Alert.alert('Queued', 'Report queued.');
                                    else Alert.alert('Failed', 'Failed to queue report.');
                                  })
                                  .catch(() => Alert.alert('Failed', 'Failed to queue report.'))
                              }
                              style={tw`mt-2 px-3 py-1.5 rounded bg-[#e7edf4] dark:bg-white/10 self-start`}
                            >
                              <Text style={tw`text-[#0d141c] dark:text-white text-xs`}>
                                Send report for this period
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                  {/* learner progress */}
                  <View style={tw`mt-4`}>
                    <View style={tw`flex-row items-center justify-between mb-2`}>
                      <Text style={tw`text-[#0d141c] dark:text-white text-base font-semibold`}>
                        Learner Progress (overall)
                      </Text>

                      <View style={tw`flex-row items-center`}>
                        {lpLoading && (
                          <Text style={tw`text-[#49739c] dark:text-white/70 text-xs mr-2`}>
                            Loading…
                          </Text>
                        )}
                        <TouchableOpacity
                          onPress={() => loadLearnerProgress(true)}
                          style={tw`px-3 py-1.5 rounded bg-[#e7edf4] dark:bg-white/10`}
                        >
                          <Text style={tw`text-[#0d141c] dark:text-white text-xs`}>Refresh</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {!lpRows.length && !lpLoading ? (
                      <Text style={tw`text-[#49739c] dark:text-white/70 text-sm`}>
                        No learner data yet.
                      </Text>
                    ) : (
                      <View>
                        {lpRows.map((r) => (
                          <View
                            key={String((r as any).user_id)}
                            style={tw`mb-2 p-3 rounded-lg bg-[#f8fbff] dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
                          >
                            <Text style={tw`text-[#0d141c] dark:text-white font-semibold`}>
                              {(r as any).name || (r as any).email || `User #${(r as any).user_id}`}
                            </Text>
                            {(r as any).email && (
                              <Text style={tw`text-[#49739c] dark:text-white/60 text-[11px]`}>
                                {(r as any).email}
                              </Text>
                            )}

                            <Text style={tw`text-[#49739c] dark:text-white/80 text-xs mt-1`}>
                              Attempts: {(r as any).attempts} • Passes: {(r as any).passes} • Avg:{' '}
                              {Math.round((r as any).avg_score ?? 0)}%
                            </Text>

                            <Text style={tw`text-[#49739c] dark:text-white/80 text-xs mt-1`}>
                              Completed: {(r as any).completed_assignments} • Progress:{' '}
                              {(r as any).progress_pct}%
                            </Text>

                            <Text style={tw`text-[#49739c] dark:text-white/60 text-[11px] mt-1`}>
                              Last Submit:{' '}
                              {(r as any).last_submit_at
                                ? new Date((r as any).last_submit_at).toLocaleString()
                                : '—'}
                            </Text>
                          </View>
                        ))}

                        {lpCursor && (
                          <TouchableOpacity
                            onPress={() => loadLearnerProgress(false)}
                            disabled={lpLoading}
                            style={tw`mt-1 px-3 py-1.5 rounded bg-indigo-600 self-start ${lpLoading ? 'opacity-60' : ''}`}
                          >
                            <Text style={tw`text-white text-xs`}>Load more</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              )}

           {/* PRO TOOLS */}
              {/* TOOLS */}
              {tab === 'tools' && (
                <View style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4 mb-6`}>
                  <Text style={tw`text-[#0d141c] dark:text-white text-lg font-semibold`}>
                    Tools
                  </Text>
                  <Text style={tw`text-[#49739c] dark:text-white/70 text-xs mt-1`}>
                    Quick shortcuts for attendance, fees, announcements, newsletters, clubs & sports.
                  </Text>

                <View style={[tw`mt-4 flex-row flex-wrap`, { marginHorizontal: -TOOL_GAP / 2 }]}>
                  {[
                    {
                      emoji: '✅',
                      title: 'Attendance',
                      subtitle: 'Sessions',
                      locked: !isProTier,
                      onPress: () => navOrWeb('OrgAttendance'),
                    },
                    ...(hasFeeAccess
                      ? [
                          {
                            emoji: '💳',
                            title: 'Fees',
                            subtitle: 'Balances',
                            locked: false,
                            onPress: () => navOrWeb('OrgFees'),
                          },
                        ]
                      : []),
                    {
                      emoji: '📣',
                      title: 'Announcements',
                      subtitle: 'Post',
                      locked: !isProTier,
                      onPress: () => navOrWeb('OrgAnnouncements'),
                    },
                    {
                      emoji: '📰',
                      title: 'Newsletters',
                      subtitle: 'Send',
                      locked: !isProTier,
                      onPress: () => navOrWeb('OrgNewsletters'),
                    },
                    {
                      emoji: '🤝',
                      title: 'Clubs',
                      subtitle: 'Manage',
                      locked: false,
                      onPress: () => navOrWeb('OrgToolsClubs', undefined, '/org/tools/clubs'),
                    },
                    {
                      emoji: '🏆',
                      title: 'Sports',
                      subtitle: 'Publish',
                      locked: false,
                      onPress: () => navOrWeb('OrgToolsSports', undefined, '/org/tools/sports'),
                    },
                    ...(canBrandingRole
                      ? [
                          {
                            emoji: '🎨',
                            title: 'Branding',
                            subtitle: 'Logo & info',
                            locked: false,
                            onPress: () => setTab('branding'),
                          },
                          {
                            emoji: '🔒',
                            title: 'SSO & Access',
                            subtitle: 'Domains',
                            locked: false,
                            onPress: () => {
                              setTab('branding');
                              setShowSsoSection(true);
                              setShowLogoSection(false);
                            },
                          },
                          {
                            emoji: '🔗',
                            title: 'Webhooks',
                            subtitle: 'Completions',
                            locked: !canWebhooks,
                            onPress: () => {
                              setTab('branding');
                              setShowSsoSection(true);
                              setShowLogoSection(false);
                            },
                          },
                        ]
                      : []),
                  ].map((it, idx) => (
                    <View
                      key={`${it.title}-${idx}`}
                      style={{
                        width: `${100 / TOOL_COLS}%`,
                        paddingHorizontal: TOOL_GAP / 2,
                        marginBottom: TOOL_GAP,
                      }}
                    >
                      <ToolIconTile
                        emoji={it.emoji}
                        title={it.title}
                        subtitle={it.subtitle}
                        disabled={it.locked}
                        badge={it.locked ? (it.title === 'Webhooks' ? 'Enterprise' : 'Locked') : undefined}
                        onPress={it.onPress}
                      />
                    </View>
                  ))}
                </View>


                  {!isProTier && (
                    <View style={tw`mt-3 rounded-2xl p-3 border border-amber-200/40 dark:border-amber-300/30 bg-amber-50/60 dark:bg-amber-500/10`}>
                      <Text style={tw`text-xs text-[#0d141c] dark:text-white/90`}>
                        Some tools are locked on <Text style={tw`font-semibold`}>Starter</Text>. Ask your institution admin to upgrade to PRO.
                      </Text>
                    </View>
                  )}

                  {isInstructor && (
                    <Text style={tw`mt-3 text-[11px] text-[#49739c] dark:text-white/70`}>
                      Instructor view: you can use unlocked tools and manage learning, but plan upgrades & branding are controlled by your institution admin.
                    </Text>
                  )}
                </View>
              )}

            </>
          )}
        </ScrollView>

        {/* ──────────────────────────────
           learner submit modal
        ─────────────────────────────── */}
        <Modal
          visible={submitOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setSubmitOpen(false)}
        >
          <View style={tw`flex-1 bg-black/50 justify-center items-center p-4`}>
            <View
              style={tw`w-full max-w-md rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 p-4`}
            >
              <Text style={tw`text-[#0d141c] dark:text-white text-lg font-semibold`}>
                Submit assignment
              </Text>
              <Text style={tw`text-[#49739c] dark:text-white/80 text-xs mt-1`}>
                {(submitAssignment as any)?.title || 'Untitled assignment'}
              </Text>

              <Text style={tw`mt-3 text-[#49739c] dark:text-white/80 text-xs`}>
                Your answer (optional)
              </Text>
              <TextInput
                multiline
                textAlignVertical="top"
                value={submitText}
                onChangeText={setSubmitText}
                placeholder="Type your working or short answers here…"
                placeholderTextColor={resolvedScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                style={tw`mt-1 h-28 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 rounded-xl px-3 py-2 text-[#0d141c] dark:text-white text-sm`}
              />

              <Text style={tw`mt-3 text-[#49739c] dark:text-white/80 text-xs`}>
                Attach file (optional)
              </Text>
              <TouchableOpacity
                onPress={handlePickSubmitFile}
                style={tw`mt-1 px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-white/10`}
                disabled={submitUploading}
              >
                <Text style={tw`text-[#0d141c] dark:text-white text-xs`}>
                  {submitFileAsset ? 'Change attachment' : 'Choose file'}
                </Text>
              </TouchableOpacity>

              {submitFileAsset && (
                <Text style={tw`mt-1 text-[11px] text-[#6b7280] dark:text-white/70`}>
                  Selected: {submitFileAsset.name || submitFileAsset.uri}
                </Text>
              )}

              <View style={tw`flex-row justify-end mt-4`}>
                <TouchableOpacity
                  onPress={() => setSubmitOpen(false)}
                  disabled={submitUploading}
                  style={tw`px-4 py-2 rounded-xl bg-[#e7edf4] dark:bg-white/10 mr-2`}
                >
                  <Text style={tw`text-[#0d141c] dark:text-white text-sm`}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSubmitLegacyWork}
                  disabled={submitUploading}
                  style={tw`px-4 py-2 rounded-xl bg-emerald-600 ${submitUploading ? 'opacity-60' : ''}`}
                >
                  <Text style={tw`text-white text-sm`}>
                    {submitUploading ? 'Submitting…' : 'Submit work'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Congrats modal */}
        <Modal
          visible={showCongrats}
          transparent
          animationType="fade"
          onRequestClose={() => setShowCongrats(false)}
        >
          <View style={tw`flex-1 bg-black/50 justify-center items-center p-4`}>
            <View
              style={tw`w-full max-w-md rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 p-5`}
            >
              <View style={tw`flex-row items-start`}>
                <View
                  style={tw`h-10 w-10 rounded-full bg-emerald-500/15 items-center justify-center mr-3`}
                >
                  <Text style={tw`text-xl`}>🎉</Text>
                </View>
                <View style={tw`flex-1`}>
                  <Text style={tw`text-[#0d141c] dark:text-white text-lg font-semibold`}>
                    Brand saved!
                  </Text>
                  <Text style={tw`text-[#49739c] dark:text-white/80 text-sm mt-1`}>
                    Your institution profile is ready. Want to set up an assignment now?
                  </Text>
                </View>
              </View>

              <View style={tw`mt-4 flex-row flex-wrap`}>
                <TouchableOpacity
                  onPress={() => {
                    setShowCongrats(false);
                    setTab('assign');
                  }}
                  style={tw`mr-2 mb-2 px-4 py-2 rounded-xl bg-emerald-600`}
                >
                  <Text style={tw`text-white font-semibold`}>Go to Assignments</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setShowCongrats(false)}
                  style={tw`mb-2 px-4 py-2 rounded-xl bg-[#e7edf4] dark:bg-white/10`}
                >
                  <Text style={tw`text-[#0d141c] dark:text-white`}>Not now</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* plan modals (NEW native modal) */}
        {authToken && org?.id && (
          <>
            <PlanPurchaseModalNative
              open={showProModal}
              onClose={closeProModal}
              tier="pro"
              orgName={(org as any)?.name}
              assets={{
                visamaster,
                mpesa,
              }}

              onCheckout={(opts) => handlePlanCheckout('pro', proPaymentIdRef, opts)}
            />

            <PlanPurchaseModalNative
              open={showEnterpriseModal}
              onClose={closeEnterpriseModal}
              tier="enterprise"
              orgName={(org as any)?.name}
             assets={{
              visamaster,
              mpesa,
            }}

              onCheckout={(opts) => handlePlanCheckout('enterprise', entPaymentIdRef, opts)}
            />
          </>
        )}

        {/* native date/time pickers */}
        {Platform.OS === 'ios' && legacyDuePickerOpen && (
          <DateTimePicker
            value={legacyDueDate ?? new Date()}
            mode="datetime"
            display="inline"
            onChange={handleLegacyDueChange}
          />
        )}

        {Platform.OS === 'ios' && aiDuePickerOpen && (
          <DateTimePicker
            value={aiDueDate ?? new Date()}
            mode="datetime"
            display="inline"
            onChange={handleAiDueChange}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

export default OrgElearnPortalNative;
