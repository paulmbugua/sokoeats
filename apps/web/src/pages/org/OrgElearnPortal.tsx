// apps/web/src/pages/org/OrgElearnPortal.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link, useLocation } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import { uploadAsset, getMyOrgOrBootstrap } from '@mytutorapp/shared/api';
import SeoHead from '../../components/seo/SeoHead';
import { trackPurchase } from '@/analytics/ga4';
import { buildOrgPlanItem, majorFromMinor, safeNumber } from '@/analytics/ecomBuilders';
import { clearCheckout, readCheckout, stashCheckout } from '@/analytics/checkoutStash';
import { clearCheckoutOnce } from '@/analytics/checkoutOnce';

import {
  getOrgLearnersProgress,
  type OrgLearnerProgressRow,
  getOrgRoster,
  getOrgUsage,
  updateOrgBranding,
  createOrgAssignment,
  getOrgAnalytics,
  upgradeOrgTier,
  sendOrgReportTest,
  sendOrgReportRow,
  initOrgSubscription,
  confirmOrgSubscription,
  type OrgResp as Org,
  type OrgAnalyticsRow,
  createOrgLegacyAssignment,
  submitOrgLegacyAssignment,
  // 👇 used for learner read-only assignments view (legacy-only)
  getOrgAssignmentsForLearner,
  type OrgAssignmentRow,
  getOrgAssignmentSubmissions,
  apiMarkOrgAssignmentOpened,
  getOrgInstructorAiSubmissionDetail,
  type OrgAiSubmissionRow,
} from '@mytutorapp/shared/api/orgApi';

import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { assets } from '../../assets/assets';
import PlanPurchaseModalWeb from './PlanPurchaseModal.web';

import type { OrgTier } from '@mytutorapp/shared/types';
import { BrandingAssignPane, AnalyticsPane } from './OrgPortalPanes';

type TabKey = 'branding' | 'assign' | 'analytics' | 'tools';
type Period = 'month' | 'term' | 'year';
type BillingCycle = 'monthly' | 'annual';
type PayMethod = 'Paystack' | 'M-Pesa';

type OrgAnalyticsSummary = {
  /** All graded learning events (Robot Teacher, exams, assignments) */
  totalAttempts: number;
  totalPasses: number;
  overallPassRate: number; // 0–100
  overallAvgScore: number; // 0–100

  /** Exams – term reports / class reports coming from the exams portal */
  examsAttempts: number;
  examsPasses: number;
  examsPassRate: number;

  /** Robot Teacher quizzes (AI courses + org assignments powered by RT) */
  robotQuizAttempts: number;
  robotQuizPasses: number;
  robotQuizPassRate: number;

  /** Instructor grading on assignments (AI or legacy) */
  assignmentAttempts: number;
  assignmentPasses: number;
  assignmentPassRate: number;

  /** Optional: how many exam cards / class reports generated in this period */
  examCardsGenerated?: number;
};

/**
 * Merge backend summary (if provided) + per-bucket rows into one
 * stable summary object. Safe even if backend hasn’t been upgraded yet.
 */
function deriveAnalyticsSummary(
  rows: OrgAnalyticsRow[],
  apiSummary?: Partial<OrgAnalyticsSummary> | null
): OrgAnalyticsSummary {
  type ExtRow = OrgAnalyticsRow & {
    source_kind?: string | null;
    source?: string | null;
    kind?: string | null;
    // optional per-source columns your backend can emit
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
    const avg = Number(
      // allow either snake_case or camelCase
      (r as any).avg_score ?? (r as any).avgScore ?? 0
    );

    totalAttempts += attempts;
    totalPasses += passes;

    if (attempts > 0 && Number.isFinite(avg)) {
      scoreWeightedSum += avg * attempts;
      scoreWeight += attempts;
    }

    // Optional explicit per-source numeric columns
    examsAttempts += Number(r.exams_attempts ?? 0);
    examsPasses += Number(r.exams_passes ?? 0);

    robotAttempts += Number(r.robot_attempts ?? 0);
    robotPasses += Number(r.robot_passes ?? 0);

    assignmentAttempts += Number(r.assignment_attempts ?? 0);
    assignmentPasses += Number(r.assignment_passes ?? 0);

    examCardsGenerated += Number(r.exam_cards_generated ?? 0);

    // Fallback: infer source from kind/source field where possible
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

  // If backend hasn’t given us any per-source split at all, treat
  // everything as Robot Teacher quizzes so the UI isn’t empty.
  const hasAnySourceSplit = examsAttempts > 0 || robotAttempts > 0 || assignmentAttempts > 0;

  if (!hasAnySourceSplit && totalAttempts > 0) {
    robotAttempts = totalAttempts;
    robotPasses = totalPasses;
  }

  const safe = (v: number | undefined) => (Number.isFinite(v as any) ? Number(v) : 0);

  // Base derived summary
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

  // If backend already returns a summary block, let it override
  // individual numbers when present, but keep our fallbacks.
  if (!apiSummary) return base;

  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(apiSummary).map(([k, v]) => [k, typeof v === 'number' ? safe(v) : v])
    ),
  } as OrgAnalyticsSummary;
}

type MiniUser = { id: string | number; name?: string; email?: string };

export const ORG_TIERS: Record<OrgTier, { seats: number; features: string[] }> = {
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

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs text-slate-500 dark:text-gray-300">{children}</div>
);

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="
        inline-flex items-center px-2 py-0.5 rounded-full text-[11px]
        bg-[#e7edf4] text-slate-800 ring-1 ring-[#d1e2f4]
        dark:bg-white/10 dark:text-white dark:ring-white/20
      "
    >
      {children}
    </span>
  );
}

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

function LockableButton({
  locked,
  badge = 'PRO',
  className,
  onClick,
  children,
  title,
}: {
  locked: boolean;
  badge?: string;
  className: string;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="relative inline-flex w-full sm:w-auto">
      <button
        type="button"
        disabled={locked}
        onClick={(e) => {
          if (locked) {
            e.preventDefault();
            return;
          }
          onClick();
        }}
        className={cx(
          className,
          locked && 'opacity-60 cursor-not-allowed hover:brightness-100'
        )}
        aria-disabled={locked}
        title={locked ? `${badge} required` : title}
      >
        {children}
      </button>

      {locked && badge ? (
        <span className="absolute -top-2 -left-2 text-[10px] px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-700 dark:bg-white/10 dark:text-white/70 dark:border-white/10">
          {badge}
        </span>
      ) : null}
    </div>
  );
}


const getAttachmentUrlFromRow = (a: any): string | null =>
  a?.attachment_url ||
  a?.attachmentUrl ||
  a?.download_url ||
  a?.downloadUrl ||
  a?.resource_url ||
  a?.resourceUrl ||
  null;

type AssignmentType = 'ai' | 'legacy';

const getAssignmentType = (row: any): AssignmentType => {
  const kindRaw = String(row?.source_kind ?? row?.kind ?? row?.assignment_kind ?? '').toLowerCase();

  // ✅ Legacy wins if it looks like a file/note assignment
  const attachmentUrl = getAttachmentUrlFromRow(row);
  if (kindRaw === 'legacy' || kindRaw === 'classic' || Boolean(attachmentUrl)) return 'legacy';

  // ✅ AI if invite exists
  const invite = row?.invite_code ?? row?.inviteCode ?? row?.code ?? null;
  if (invite) return 'ai';

  // ✅ AI if course exists
  const courseId =
    row?.course_id ?? row?.courseId ?? row?.course_uuid ?? row?.courseUUID ?? null;
  if (courseId != null) return 'ai';

  // Default safe fallback
  return 'legacy';
};

const isAiAssignmentRow = (row: OrgAssignmentRow) => getAssignmentType(row) === 'ai';
const isLegacyAssignmentRow = (row: OrgAssignmentRow) => getAssignmentType(row) === 'legacy';

const assignmentKey = (row: OrgAssignmentRow) => {
  const invite = (row as any).invite_code || (row as any).inviteCode || null;
  const createdAt = (row as any).created_at || (row as any).createdAt || '';
  const courseId =
    (row as any).course_id || (row as any).courseId || (row as any).course_uuid || null;

  if (row.id != null) return String(row.id);
  if (invite) return String(invite);
  if (courseId || createdAt) return `${courseId || 'course'}:${createdAt || 'created'}`;
  return 'assignment-row';
};

function PortalIconTile({
  title,
  subtitle,
  icon,
  tone = 'indigo',
  badge,
  disabled,
  onClick,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  tone?: 'indigo' | 'emerald' | 'sky' | 'amber' | 'rose' | 'slate';
  badge?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const toneCls =
    tone === 'emerald'
      ? 'from-emerald-500/20 to-emerald-500/5 ring-emerald-300/50 text-emerald-700 dark:from-emerald-500/25 dark:to-emerald-500/5 dark:ring-emerald-400/30 dark:text-emerald-100'
      : tone === 'sky'
        ? 'from-sky-500/20 to-sky-500/5 ring-sky-300/50 text-sky-700 dark:from-sky-500/25 dark:to-sky-500/5 dark:ring-sky-400/30 dark:text-sky-100'
        : tone === 'amber'
          ? 'from-amber-500/20 to-amber-500/5 ring-amber-300/50 text-amber-800 dark:from-amber-500/25 dark:to-amber-500/5 dark:ring-amber-400/30 dark:text-amber-100'
          : tone === 'rose'
            ? 'from-rose-500/20 to-rose-500/5 ring-rose-300/50 text-rose-700 dark:from-rose-500/25 dark:to-rose-500/5 dark:ring-rose-400/30 dark:text-rose-100'
            : tone === 'slate'
              ? 'from-slate-200/70 to-slate-50 ring-slate-200 text-slate-700 dark:from-white/10 dark:to-white/5 dark:ring-white/10 dark:text-white'
              : 'from-indigo-500/20 to-indigo-500/5 ring-indigo-300/50 text-indigo-700 dark:from-indigo-500/25 dark:to-indigo-500/5 dark:ring-indigo-400/30 dark:text-indigo-100';

  const base =
    'group relative rounded-2xl ring-1 ring-[#e7edf4] dark:ring-white/10 ' +
    'bg-white dark:bg-[#0b1420] transition overflow-hidden ' +
    'hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3d99f5]';

  const disabledCls = 'opacity-60 cursor-not-allowed hover:translate-y-0 hover:shadow-none';

  const inner =
    'flex flex-col items-center justify-center text-center px-2 py-3 min-h-[104px]';

  const iconWrap =
    'h-12 w-12 rounded-2xl grid place-items-center bg-gradient-to-br ring-1 shadow-inner ' + toneCls;

  const titleCls = 'mt-2 text-[12px] sm:text-sm font-semibold text-[#0d141c] dark:text-white/95';
  const subCls = 'mt-1 text-[10px] sm:text-[11px] leading-snug text-[#49739c] dark:text-white/65';

  const content = (
    <>
      <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition">
        <div className="absolute -top-10 -right-10 h-28 w-28 rounded-full bg-slate-400/10 dark:bg-white/10 blur-2xl" />
        <div className="absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-slate-400/10 dark:bg-white/10 blur-2xl" />
      </div>

      <div className="absolute top-2 right-2 text-[11px] text-slate-400 dark:text-white/40 group-hover:text-slate-500 dark:group-hover:text-white/70 transition">
        ↗
      </div>

      {badge ? (
        <div className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-700 dark:bg-white/10 dark:text-white/70 dark:border-white/10">
          {badge}
        </div>
      ) : null}

      <div className={inner}>
        <div className={iconWrap}>{icon}</div>
        <div className={titleCls}>{title}</div>
        {subtitle ? <div className={subCls}>{subtitle}</div> : null}
      </div>
    </>
  );

  if (disabled || !onClick) {
    return <div className={cx(base, disabledCls)}>{content}</div>;
  }

  return (
    <button type="button" onClick={onClick} className={base} title={title}>
      {content}
    </button>
  );
}


export default function OrgElearnPortal() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const viewParam = searchParams.get('view');
  const isLearnerView = viewParam === 'learner';
  const tabParamRaw = (searchParams.get('tab') || '').toLowerCase();

// Learner only needs a small set of tabs (what we allow via URL)
const learnerAllowedTabs = new Set(['assign', 'tools']); // add 'exams' if you later handle it here

const resolvedTabForLearner: TabKey =
  (tabParamRaw === 'tools' ? 'tools' : 'assign'); // default to assign


  const learnerStudentId = searchParams.get('studentId') ?? searchParams.get('student_id') ?? '';

  // NEW: deep-link into a specific assignment’s submissions
  const assignmentIdFromUrl = searchParams.get('assignmentId') ?? '';
  const isSubmissionsView = !isLearnerView && viewParam === 'submissions';
  const aiAttemptIdFromUrl = searchParams.get('attemptId') ?? '';
  const isAiSubmissionView = !isLearnerView && viewParam === 'ai-submission';

  // NEW: class + subject hints coming from learner portal
  const learnerClassFromUrl = searchParams.get('class') ?? searchParams.get('class_label') ?? '';
  const learnerSubjectFromUrl =
    searchParams.get('subject') ??
    searchParams.get('subjectKey') ??
    searchParams.get('subject_key') ??
    '';

  const { backendUrl, token: userToken, orgToken } = useShopContext();
  const authToken = orgToken;

  const { role, org: orgFromGate } = useOrg({ currency: 'USD' }); // role doesn't depend on pricing currency

  const isInstructor = role === 'instructor';

  const [tab, setTab] = useState<TabKey>(() => {
  if (isLearnerView) return resolvedTabForLearner;
  return isInstructor ? 'assign' : 'branding';
});

  const [instructors, setInstructors] = useState<MiniUser[]>([]);

  // org & plan
  const [org, setOrg] = useState<Org | null>(null);
  const orgHydratedOnceRef = useRef(false);
  const tier: OrgTier = (org?.tier as OrgTier) || 'starter';
  const tierMeta = ORG_TIERS[tier];
  const isProTier = tier === 'pro' || tier === 'enterprise';
  const seatsMax = tierMeta.seats;
  const [seatsUsed, setSeatsUsed] = useState<number>(0);

  // plan modals
  const [showProModal, setShowProModal] = useState(false);
  const [showEnterpriseModal, setShowEnterpriseModal] = useState(false);

  // branding state
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

  // assign (admin/instructor creation side)
  const [courseId, setCourseId] = useState('');
  const [titleOverride, setTitleOverride] = useState('');
  const [passMark, setPassMark] = useState<number | ''>('');
  const [timer, setTimer] = useState<number | ''>('');
  const [dueAt, setDueAt] = useState<string>('');
  const [inviteLink, setInviteLink] = useState<string>('');

  // NEW: keep track of assignment scope (class/subject) from selected course
  const [assignClassLabel, setAssignClassLabel] = useState<string>('');
  const [assignSubjectKey, setAssignSubjectKey] = useState<string>('');

  // 🔎 Learner-side, read-only assignment list
  const [learnerAssignments, setLearnerAssignments] = useState<OrgAssignmentRow[]>([]);
  const [learnerAssignmentsLoading, setLearnerAssignmentsLoading] = useState(false);
  const [aiPage, setAiPage] = useState(1);
  const [aiPageSize, setAiPageSize] = useState(10);
  const [classicPage, setClassicPage] = useState(1);
  const [classicPageSize, setClassicPageSize] = useState(10);

  // NEW: instructor/org view – detailed submissions for a single assignment
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);
  const [submissionsAssignment, setSubmissionsAssignment] = useState<any | null>(null);
  const [submissionsRows, setSubmissionsRows] = useState<any[]>([]);

  const [aiSubmissionLoading, setAiSubmissionLoading] = useState(false);
  const [aiSubmissionError, setAiSubmissionError] = useState<string | null>(null);
  const [aiSubmission, setAiSubmission] = useState<OrgAiSubmissionRow | null>(null);

  // analytics
  const [period, setPeriod] = useState<Period>('month');
  const [analytics, setAnalytics] = useState<OrgAnalyticsRow[]>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsSummary, setAnalyticsSummary] = useState<OrgAnalyticsSummary | null>(null);

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [uploadingInstructorSignature, setUploadingInstructorSignature] = useState(false);
const [uploadingBursarSignature, setUploadingBursarSignature] = useState(false);

  const mpesaPaymentIdRef = useRef<string | null>(null);

  // celebration modal
  const [showCongrats, setShowCongrats] = useState(false);

  const [lpRows, setLpRows] = useState<OrgLearnerProgressRow[]>([]);
  const [lpCursor, setLpCursor] = useState<string | null>(null);
  const [lpLoading, setLpLoading] = useState(false);

  // CTA pulse (only used in admin/instructor view)
  const [ctaPulse, setCtaPulse] = useState(false);

  // Legacy (file-based) assignment composer
  const [legacyTitle, setLegacyTitle] = useState('');
  const [legacyInstructions, setLegacyInstructions] = useState('');
  const [legacyDueAt, setLegacyDueAt] = useState('');
  const [legacyAttachmentUrl, setLegacyAttachmentUrl] = useState<string>('');
  const [legacyUploadingAttachment, setLegacyUploadingAttachment] = useState(false);
  const [creatingLegacyAssignment, setCreatingLegacyAssignment] = useState(false);

  // Learner submission modal state (for legacy assignments)
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitAssignment, setSubmitAssignment] = useState<OrgAssignmentRow | null>(null);
  const [submitText, setSubmitText] = useState('');
  const [submitFile, setSubmitFile] = useState<File | null>(null);
  const [submitUploading, setSubmitUploading] = useState(false);

  const handleUploadLegacyAttachment = async (file: File | null) => {
    if (!file) return null;

    if (!authToken) {
      alert('Please sign in to upload attachments.');
      return null;
    }
    if (!org?.id) {
      alert('Open your institution portal first.');
      return null;
    }

    setLegacyUploadingAttachment(true);
    try {
      const res: any = await uploadAsset(backendUrl, authToken, file, 'doc');

      const url =
        typeof res === 'string' ? res : res?.url || res?.secure_url || res?.data?.url || '';

      if (!url) {
        throw new Error('Upload finished but no URL was returned.');
      }

      setLegacyAttachmentUrl(url);
      return url;
    } catch (e: any) {
      console.error('[OrgElearnPortal] legacy attachment upload error', e);
      alert(e?.message || 'Failed to upload attachment.');
      return null;
    } finally {
      setLegacyUploadingAttachment(false);
    }
  };

  const sendTestReport = useCallback(async () => {
    if (!org?.id || !authToken) {
      alert('Open your institution portal first.');
      return;
    }
    try {
      await sendOrgReportTest(backendUrl, authToken, org.id);
      alert('Test report queued to your org admins.');
    } catch (e: any) {
      console.error(e);
      alert('Failed to send test report.');
    }
  }, [backendUrl, authToken, org?.id]);

  const createLegacyAssignment = async () => {
    if (!org?.id || !authToken) {
      alert('Open your institution portal first.');
      return;
    }

    

    const trimmedTitle = legacyTitle.trim();
    const classLabel = (assignClassLabel || '').trim();
    const subjectKey = (assignSubjectKey || '').trim();

    if (!trimmedTitle) {
      alert('Give your assignment a short title.');
      return;
    }
    if (!classLabel || !subjectKey) {
      alert('Please specify both Class/Grade and Subject so the right learners see this.');
      return;
    }

    setCreatingLegacyAssignment(true);
    try {
      const body = {
          // ✅ add these (safe even if backend ignores one)
          source_kind: 'legacy',
          kind: 'legacy',

          title: trimmedTitle,
          instructions: legacyInstructions.trim() || null,
          class_label: classLabel,
          subject_key: subjectKey,
          attachment_url: legacyAttachmentUrl || null,
          due_at: legacyDueAt || null,
        };


      await createOrgLegacyAssignment(backendUrl, authToken, org.id, body);
      alert('Assignment shared with the selected class.');

      // Reset for next one
      setLegacyTitle('');
      setLegacyInstructions('');
      setLegacyDueAt('');
      setLegacyAttachmentUrl('');
    } catch (e: any) {
      console.error('[OrgElearnPortal] createLegacyAssignment error', e);
      const msg = e?.response?.data?.message || e?.message || 'Failed to create assignment.';
      alert(msg);
    } finally {
      setCreatingLegacyAssignment(false);
    }
  };

  /** Learner-mode assignments loader (legacy-only via backend + front-end filter) */
  const loadLearnerAssignments = useCallback(async () => {
    if (!isLearnerView) return;
    if (!authToken || !org?.id) return;

    setLearnerAssignmentsLoading(true);
    try {
      const resp = await getOrgAssignmentsForLearner(backendUrl, authToken, org.id, {
        studentId: learnerStudentId || undefined,
        classLabel: learnerClassFromUrl || undefined,
        subjectKey: learnerSubjectFromUrl || undefined,
      });

      const rows = Array.isArray(resp?.data) ? resp.data : [];
      setLearnerAssignments(rows as OrgAssignmentRow[]);
    } catch (err) {
      console.warn('[OrgElearnPortal] load learner assignments failed', err);
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
    learnerClassFromUrl,
    learnerSubjectFromUrl,
  ]);

  const loadAssignmentSubmissions = useCallback(async () => {
    if (!isSubmissionsView) return;
    if (!authToken || !org?.id) return;
    if (!assignmentIdFromUrl) return;

    setSubmissionsLoading(true);
    setSubmissionsError(null);

    try {
      apiMarkOrgAssignmentOpened(backendUrl, authToken, org.id, assignmentIdFromUrl).catch((e) =>
        console.warn('[OrgElearnPortal] mark opened failed', e?.message || e),
      );

      try {
        const key = `org:openedAssignments:${String(org.id)}`;
        const raw = sessionStorage.getItem(key);
        const map = raw ? JSON.parse(raw) : {};
        map[String(assignmentIdFromUrl)] = new Date().toISOString();
        sessionStorage.setItem(key, JSON.stringify(map));
      } catch {}

      const res = await getOrgAssignmentSubmissions(
        backendUrl,
        authToken,
        org.id,
        assignmentIdFromUrl
      );

      const openedAt = res?.assignment?.opened_at || new Date().toISOString();
      setSubmissionsAssignment(res.assignment ? { ...res.assignment, opened_at: openedAt } : null);
      setSubmissionsRows(Array.isArray(res.submissions) ? res.submissions : []);
    } catch (e: any) {
      console.error('[OrgElearnPortal] loadAssignmentSubmissions error', {
        message: e?.message,
        status: e?.response?.status,
        data: e?.response?.data,
        url: `${backendUrl}/api/orgs/${org?.id}/assignments/${assignmentIdFromUrl}/submissions`,
      });

      setSubmissionsError(
        e?.response?.data?.message || e?.message || 'Failed to load submissions.'
      );
      setSubmissionsAssignment(null);
      setSubmissionsRows([]);
    } finally {
      setSubmissionsLoading(false);
    }
  }, [isSubmissionsView, authToken, org?.id, assignmentIdFromUrl, backendUrl]);

  const loadAiSubmission = useCallback(async () => {
    if (!isAiSubmissionView) return;
    if (!authToken || !org?.id) return;
    if (!aiAttemptIdFromUrl) return;

    setAiSubmissionLoading(true);
    setAiSubmissionError(null);

    try {
      const res = await getOrgInstructorAiSubmissionDetail(
        backendUrl,
        authToken,
        org.id,
        aiAttemptIdFromUrl,
      );

      const submission = res?.submission as OrgAiSubmissionRow | undefined;
      setAiSubmission(submission || null);

      if (submission?.assignment_id) {
        try {
          const key = `org:openedAssignments:${String(org.id)}`;
          const raw = sessionStorage.getItem(key);
          const map = raw ? JSON.parse(raw) : {};
          map[String(submission.assignment_id)] = new Date().toISOString();
          sessionStorage.setItem(key, JSON.stringify(map));
        } catch {}
      }
    } catch (e: any) {
      console.error('[OrgElearnPortal] loadAiSubmission error', {
        message: e?.message,
        status: e?.response?.status,
        data: e?.response?.data,
      });
      setAiSubmissionError(e?.response?.data?.message || e?.message || 'Failed to load submission.');
      setAiSubmission(null);
    } finally {
      setAiSubmissionLoading(false);
    }
  }, [isAiSubmissionView, authToken, org?.id, aiAttemptIdFromUrl, backendUrl]);

  useEffect(() => {
    loadAssignmentSubmissions();
  }, [loadAssignmentSubmissions]);

  useEffect(() => {
    loadAiSubmission();
  }, [loadAiSubmission]);

  useEffect(() => {
    loadLearnerAssignments();
  }, [loadLearnerAssignments]);

  const handleSubmitLegacyWork = async () => {
    if (!submitAssignment || !authToken || !org?.id) {
      setSubmitOpen(false);
      return;
    }

    if (!submitText.trim() && !submitFile) {
      alert('Type an answer or attach a file before submitting.');
      return;
    }

    setSubmitUploading(true);
    try {
      let attachmentUrl: string | null = null;

      if (submitFile) {
        const res: any = await uploadAsset(backendUrl, authToken, submitFile, 'doc');
        attachmentUrl =
          typeof res === 'string' ? res : res?.url || res?.secure_url || res?.data?.url || '';
      }

      await submitOrgLegacyAssignment(backendUrl, authToken, org.id, submitAssignment.id, {
        answer_text: submitText.trim() || null,
        attachment_url: attachmentUrl,
      });

      alert('Your work has been submitted ✅');
      setSubmitOpen(false);
      setSubmitAssignment(null);
      setSubmitText('');
      setSubmitFile(null);

      // 🔄 refresh assignments so “submitted” view is always up to date
      await loadLearnerAssignments();
    } catch (e: any) {
      console.error('[OrgElearnPortal] submit legacy work error', e);
      const msg = e?.response?.data?.message || e?.message || 'Failed to submit work.';
      alert(msg);
    } finally {
      setSubmitUploading(false);
    }
  };

  const loadLearnerProgress = useCallback(
    async (reset: boolean) => {
      if (isLearnerView) return; // 🔐 skip in learner view
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
    [backendUrl, authToken, org?.id, lpCursor, isLearnerView]
  );

  const setCourseIdAndUrl = useCallback(
    (next: string) => {
      setCourseId(next);

      const sp = new URLSearchParams(window.location.search);
      if (next) sp.set('courseId', next);
      else sp.delete('courseId');

      // keep current tab (and other params) intact
      if (tab) sp.set('tab', tab);

      const nextUrl = `${window.location.pathname}?${sp.toString()}${window.location.hash}`;
      window.history.replaceState(null, '', nextUrl);

      // also cache for cross-route handoff
      if (next) sessionStorage.setItem('ai:lastCourseId', next);
    },
    [tab]
  );

  useEffect(() => {
    if (isLearnerView) return; // no pulsing CTA in learner view
    const interval = setInterval(() => {
      setCtaPulse(true);
      const t = setTimeout(() => setCtaPulse(false), 1200);
      return () => clearTimeout(t);
    }, 8000);
    return () => clearInterval(interval);
  }, [isLearnerView]);

    const goCreateAI = useCallback(() => {
    navigate('/robot-teach');
  }, [navigate]);

  // ✅ ADD THIS (right after goCreateAI is perfect)
  const goFeesSecure = useCallback(() => {
    if (!org?.id) {
      alert('Open your institution portal first.');
      return;
    }

    // 10 minute UX unlock (avoid prompting repeatedly)
    const unlockKey = `org:feesUnlock:${org.id}`;
    let unlocked = false;
    try {
      const at = Number(sessionStorage.getItem(unlockKey) || 0);
      unlocked = at > 0 && Date.now() - at < 10 * 60 * 1000;
    } catch {}

    if (unlocked) {
      navigate('/org/fees');
      return;
    }

    const sp = new URLSearchParams();
    sp.set('kind', 'instructor');
    sp.set('reauth', 'fees');
    sp.set('orgId', String(org.id));
    sp.set('returnTo', '/org/fees');

    navigate(`/org/login?${sp.toString()}`);
  }, [navigate, org?.id]); // (org is in scope; org?.id is enough)


  
 const handleBackToAssignments = useCallback(() => {
  // 1) Preferred: go back to the exact instructor-home URL we came from
  let returnTo: string | null = null;
  try {
    returnTo = sessionStorage.getItem('org:returnToAfterSubmissions');
  } catch {}

  if (returnTo) {
    try {
      sessionStorage.removeItem('org:returnToAfterSubmissions');
    } catch {}
    navigate(returnTo, { replace: true });
    return;
  }

  // 2) Next best: normal browser history back
  if (window.history.length > 1) {
    navigate(-1);
    return;
  }

  // 3) Hard fallback (CHANGE THIS PATH if your instructor home route differs)
  navigate('/org/instructor-home#recent-submissions', { replace: true });
}, [navigate]);


  useEffect(() => {
    if (!orgFromGate) return;

    setOrg((prev) => {
      if (prev && prev.id === orgFromGate.id) return { ...orgFromGate, ...prev } as Org;
      return orgFromGate as Org;
    });

    if (!orgHydratedOnceRef.current) {
      setForm((f: any) => ({ ...f, ...orgFromGate }));
      orgHydratedOnceRef.current = true;
    }
  }, [orgFromGate]);

  // Clear M-Pesa paymentId if both modals are closed
  useEffect(() => {
    if (!showProModal && !showEnterpriseModal) {
      mpesaPaymentIdRef.current = null;
    }
  }, [showProModal, showEnterpriseModal]);

  useEffect(() => {
    if (isLearnerView) return; // seats & usage irrelevant to learner
    if (!authToken || !org?.id) return;
    (async () => {
      try {
        const { seats_used } = await getOrgUsage(backendUrl, authToken, org.id);
        setSeatsUsed(Number(seats_used ?? 0));
      } catch {
        setSeatsUsed(Number(org?.seats_used ?? 0));
      }
    })();
  }, [org?.id, org?.seats_used, backendUrl, authToken, isLearnerView]);

  // Load instructors (still useful for branding/assign tabs; not in learner view)
  useEffect(() => {
    if (isLearnerView) return;
    (async () => {
      if (!authToken || !org?.id) return;
      try {
        const roster = await getOrgRoster(backendUrl, authToken, org.id);
        setInstructors(Array.isArray(roster?.instructors) ? roster.instructors : []);
      } catch {
        setInstructors([]);
      }
    })();
  }, [backendUrl, authToken, org?.id, isLearnerView]);

  /** Feature gates */
  const hasFeature = useCallback(
    (needle: string) => {
      const list = ORG_TIERS[tier]?.features || [];
      return list.some((f) => f.toLowerCase().includes(needle.toLowerCase()));
    },
    [tier]
  );

  const canBranding = !isInstructor && !isLearnerView;
  const canAssignments = !isLearnerView; // learners see read-only list, not the admin assignment creator
  const canMonthly = !isLearnerView;
  const canCustomPassTimers = hasFeature('Custom pass marks & timers');
  const canMultiPeriodAnalytics = hasFeature('Monthly/Termly/Yearly');
  const canEmailReports = hasFeature('Email reports');
  const canSSO = hasFeature('SSO');
  const canCSV = hasFeature('CSV export');
  const canWebhooks = hasFeature('Webhooks');
  const hasPrioritySupport = hasFeature('Priority support');
  const canUpgradePlan = !isInstructor && !isLearnerView;

  /** If branding is not allowed (e.g. instructor), force away from "branding" tab */
  useEffect(() => {
    if (!canBranding && tab === 'branding') {
      setTab('assign');
    }
  }, [canBranding, tab]);

  /** Upload helper (passed down) */
  const handleUpload = async (
    file: File | null,
     target: 'logo_url' | 'signature_url' | 'instructor_signature_url' | 'bursar_signature_url'
  ) => {
    if (!file) return;

    if (!authToken) {
      alert('Please sign in to upload images.');
      return;
    }

    if (!/^image\//.test(file.type)) {
      alert('Please choose an image file (png, jpg, webp, svg).');
      return;
    }

   const setBusy =
    target === 'logo_url'
      ? setUploadingLogo
      : target === 'signature_url'
        ? setUploadingSignature
        : target === 'instructor_signature_url'
          ? setUploadingInstructorSignature
          : setUploadingBursarSignature; // ✅ new

    setBusy(true);
    try {
      console.debug('[upload] start', {
        name: file.name,
        size: file.size,
        type: file.type,
      });

      const res: any = await uploadAsset(backendUrl, authToken, file, 'image');

      const url =
        typeof res === 'string' ? res : res?.url || res?.secure_url || res?.data?.url || '';

      if (!url) {
        console.error('[upload] unexpected response:', res);
        throw new Error('Upload completed but no URL was returned by the server.');
      }

      console.debug('[upload] success url:', url);
      setForm((f: any) => ({ ...f, [target]: url }));
    } catch (e: any) {
      console.error('[upload] error', e);
      alert(e?.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  /** Save branding (kept here for validation & confetti) */
  const saveBranding = async () => {
    if (!org?.id || !authToken) {
      alert(
        'No organization found or not authenticated. Please create your Institution account first (For Institutions → Login/Sign up).'
      );
      return;
    }

    if (!canBranding) {
      alert('Branding settings can only be changed by your institution owner/admin.');
      return;
    }

    // Validate email domains
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
        alert(`Invalid domain(s): ${bad.join(', ')}`);
        return;
      }
    }
    if (form.webhook_enabled) {
      const u = String(form.webhook_url || '').trim();
      if (!/^https:\/\/.+/i.test(u)) {
        alert('Webhook URL must be a valid HTTPS URL when webhooks are enabled.');
        return;
      }
    }

    try {
      const updated = await updateOrgBranding(backendUrl, authToken, org.id, form);
      setOrg((prev) => ({ ...(prev ?? {}), ...(updated ?? {}) }) as Org);
      setForm((f: any) => ({ ...f, ...(updated ?? {}) }));

      setShowCongrats(true);
      try {
        const { default: confetti } = await import('canvas-confetti');
        const burst = (count: number) =>
          confetti({
            particleCount: count,
            spread: 72,
            startVelocity: 45,
            origin: { y: 0.7 },
            ticks: 180,
            scalar: 1.2,
          });
        burst(140);
        setTimeout(() => burst(100), 300);
        setTimeout(() => burst(80), 650);
      } catch {}
    } catch (e: any) {
      if (e?.response?.status === 403) {
        alert('Branding not available on your current role or plan.');
        return;
      }
      alert('Failed to save. Please try again.');
    }
  };

  /** Assignment create (admin/instructor) */
  const createAssignment = async () => {
    if (!org?.id || !authToken || !courseId) {
      alert('Pick a course before creating an assignment.');
      return;
    }

     const classLabel = (assignClassLabel || '').trim();
  const subjectKey = (assignSubjectKey || '').trim();
  if (!classLabel || !subjectKey) {
    alert('Please specify both Class/Grade and Subject so the right learners see this AI assignment.');
    return;
  }
    try {
    const payload: any = {
      courseId,
      title_override: titleOverride || null,
      pass_mark: canCustomPassTimers ? passMark || null : null,
      timer_s: canCustomPassTimers ? timer || null : null,
      due_at: dueAt || null,

      // 🔗 scope by class & subject
      org_class_label: classLabel,
      orgClassLabel: classLabel,
      class_label: classLabel,

      org_subject_key: subjectKey,
      orgSubjectKey: subjectKey,
      subject_key: subjectKey,
    };

   

      const a = await createOrgAssignment(backendUrl, authToken, org.id, payload);
      const link = `${window.location.origin}/org/join/${a.invite_code}`;
      setInviteLink(link);

      alert('Assignment created and invite link generated. Share with instructors or learners.');
    } catch {
      alert('Failed to create assignment');
    }
  };

  /** Analytics */
  const loadAnalytics = useCallback(async () => {
    if (isLearnerView) return; // 🔐 learner view has no analytics dashboard
    if (!org?.id || !authToken) return;
    setLoadingAnalytics(true);
    try {
      const p: Period = canMultiPeriodAnalytics ? period : 'month';
      const resp = await getOrgAnalytics(backendUrl, authToken, org.id, p);

      const rows: OrgAnalyticsRow[] = Array.isArray(resp?.data) ? resp.data : [];

      setAnalytics(rows);

      // Optional: backend can send { summary: {...} }
      const apiSummary = (resp?.summary ??
        resp?.meta ??
        null) as Partial<OrgAnalyticsSummary> | null;

      setAnalyticsSummary(deriveAnalyticsSummary(rows, apiSummary));
    } catch (e) {
      console.warn('[OrgElearnPortal] loadAnalytics failed', e);
      setAnalytics([]);
      setAnalyticsSummary(null);
    } finally {
      setLoadingAnalytics(false);
    }
  }, [org?.id, backendUrl, authToken, period, canMultiPeriodAnalytics, isLearnerView]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    if (isLearnerView) return;
    if (tab === 'analytics') loadLearnerProgress(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, org?.id, authToken, isLearnerView]);

  // --- hydrate courseId + tab from URL (and a fallback from sessionStorage) ---
  useEffect(() => {
    if (isLearnerView) return; // learner view is locked to a simple assignments view
    const sp = new URLSearchParams(window.location.search);
    const explicitTab = sp.get('tab') as TabKey | null;
    const cid = sp.get('courseId');
    const fromShare = sp.get('from') === 'share';

    const desiredTab: TabKey =
      explicitTab === 'assign' || explicitTab === 'analytics' || explicitTab === 'branding'
        ? explicitTab
        : isInstructor
          ? ('assign' as TabKey)
          : 'branding';

    setTab(!canBranding && desiredTab === 'branding' ? 'assign' : desiredTab);

    if (cid) {
      setCourseId(cid);
      return;
    }

    if (fromShare) {
      try {
        const saved = sessionStorage.getItem('ai:lastCourseId');
        if (saved) {
          setCourseId(saved);
          setTab('assign');
          sessionStorage.removeItem('ai:lastCourseId');
        }
      } catch {}
    }
  }, [canBranding, isInstructor, isLearnerView]);

  useEffect(() => {
  if (!isLearnerView) return;
  setTab(resolvedTabForLearner);
}, [isLearnerView, resolvedTabForLearner]);


  /** Plan controls */
  const onUpgradeClick = (next: OrgTier) => {
    if (!canUpgradePlan) return;

    if (next === 'pro') {
      setShowProModal(true);
    } else if (next === 'enterprise') {
      setShowEnterpriseModal(true);
    } else {
      if (org?.id && authToken) {
        upgradeOrgTier(backendUrl, authToken, org.id, next)
          .then((j) => {
            setOrg((prev: Org | null) => ({
              ...((prev ?? {}) as Org),
              ...j,
            }));
            alert(`Changed plan to ${next.toUpperCase()}.`);
          })
          .catch(() => alert('Plan change failed. Please try again.'));
      }
    }
  };

  const refreshOrgAfterPayment = useCallback(async () => {
    if (!authToken) return;
    const updated = await getMyOrgOrBootstrap(backendUrl, authToken);
    setOrg(updated);
  }, [backendUrl, authToken]);

  /** CSV export */
  const downloadCSV = useCallback(() => {
    try {
      const rows: (string | number)[][] = [['Bucket', 'Attempts', 'Passes', 'Avg Score']];
      analytics.forEach((r) => {
        const bucketISO = new Date(r.bucket).toISOString();
        const attempts = Number(r.attempts ?? 0);
        const passes = Number(r.passes ?? 0);
        const avg = `${Math.round(r.avg_score ?? 0)}%`;
        rows.push([bucketISO, attempts, passes, avg]);
      });
      const csv = rows
        .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const blob = new Blob(['\uFEFF' + csv], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `org-analytics-${period}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to export CSV.');
    }
  }, [analytics, period]);

  const fireOrgPurchase = (txRef: string, payload: {
    tier: 'pro' | 'enterprise';
    cycle: 'monthly' | 'yearly';
    amountMajor: number;
    currency: string;
    orgName?: string | null;
    orgId?: string | number | null;
    method: 'mpesa' | 'paystack';
  }) => {
    if (!txRef) return;
    const value = safeNumber(payload.amountMajor, 0);

    // purchase: only after backend confirm success
    trackPurchase({
      transaction_id: txRef,
      currency: String(payload.currency || 'KES').toUpperCase(),
      value,
      payment_type: payload.method,
      affiliation: 'DayBreak Learner',
      org_id: payload.orgId ?? undefined,
      org_name: payload.orgName ?? undefined,
      items: [buildOrgPlanItem({ tier: payload.tier, cycle: payload.cycle, amountMajor: value })],
    });
  };

  const finalizeOrgPurchaseFromStash = (opts: {
    txRef: string;
    tier: 'pro' | 'enterprise';
    cycle: 'monthly' | 'yearly';
    method: 'mpesa' | 'paystack';
  }) => {
    const stashed = readCheckout('checkout:org');
    const amountMajor = safeNumber(stashed?.value, 0);
    const currency = String(stashed?.currency || 'KES').toUpperCase();
    const tier = (stashed?.tier as 'pro' | 'enterprise') || opts.tier;
    const cycle = (stashed?.cycle as 'monthly' | 'yearly') || opts.cycle;
    const checkoutKey = `org:${stashed?.orgId ?? org?.id ?? 'unknown'}:${tier}:${cycle}`;

    fireOrgPurchase(opts.txRef, {
      tier,
      cycle,
      amountMajor,
      currency,
      orgName: stashed?.orgName || org?.name || undefined,
      orgId: stashed?.orgId || org?.id || undefined,
      method: opts.method,
    });
    clearCheckout('checkout:org');
    clearCheckoutOnce(checkoutKey);
  };

  /** Checkout handler (M-Pesa / Paystack) */
  const handleCheckout = useCallback(
    async (
      target: 'pro' | 'enterprise',
      opts: {
        method: PayMethod;
        cycle: BillingCycle;
        phone?: string;
        reference?: string;
      }
    ) => {
      if (!canUpgradePlan) {
        alert('Only institution owners/admins can manage subscriptions.');
        return;
      }

      if (!org?.id || !authToken) {
        alert('Please sign in and open your organization first.');
        return;
      }
      const apiCycle: 'monthly' | 'yearly' = opts.cycle === 'annual' ? 'yearly' : 'monthly';
      const apiMethod: 'MPESA' | 'PAYSTACK' = opts.method === 'M-Pesa' ? 'MPESA' : 'PAYSTACK';

      try {
        // M-Pesa flow
        if (apiMethod === 'MPESA') {
          if (!opts.phone) {
            alert('Enter your Safaricom phone');
            return;
          }

          if (!/^2547\d{8}$/.test(String(opts.phone))) {
            alert('Phone must be like 2547XXXXXXXX');
            return;
          }

          if (!mpesaPaymentIdRef.current) {
            const init = await initOrgSubscription(backendUrl, authToken, org.id, {
              tier: target,
              cycle: apiCycle,
              method: 'MPESA',
              phone: opts.phone,
            });
            mpesaPaymentIdRef.current = init.paymentId;
            const expectedKesMinor = (init as any)?.charge?.expectedKesMinor;
            const amountMajor = majorFromMinor(expectedKesMinor);
            stashCheckout('checkout:org', {
              kind: 'org',
              tier: target,
              cycle: apiCycle,
              currency: 'KES',
              value: amountMajor || readCheckout('checkout:org')?.value || 0,
              orgId: org.id,
              orgName: org?.name,
              timestamp: Date.now(),
            });

            alert(
              'STK Push sent. After approving on your phone, tap “Complete Payment”. If confirmation lags, you may paste the M-Pesa receipt below and press “Update Reference / Complete”.'
            );
            return;
          }

          if (opts.reference) {
            await confirmOrgSubscription(
              backendUrl,
              authToken,
              mpesaPaymentIdRef.current!,
              opts.reference
            );
            finalizeOrgPurchaseFromStash({
              txRef: opts.reference || String(mpesaPaymentIdRef.current || ''),
              tier: target,
              cycle: apiCycle,
              method: 'mpesa',
            });
            mpesaPaymentIdRef.current = null;
            alert('Payment confirmed. Subscription activated ✅');
            if (target === 'pro') setShowProModal(false);
            if (target === 'enterprise') setShowEnterpriseModal(false);
            const updated = await getMyOrgOrBootstrap(backendUrl, authToken);
            setOrg(updated);
            return;
          }

          try {
            await confirmOrgSubscription(backendUrl, authToken, mpesaPaymentIdRef.current!);
            finalizeOrgPurchaseFromStash({
              txRef: String(mpesaPaymentIdRef.current || ''),
              tier: target,
              cycle: apiCycle,
              method: 'mpesa',
            });
            mpesaPaymentIdRef.current = null;
            alert('Payment confirmed. Subscription activated ✅');
            if (target === 'pro') setShowProModal(false);
            if (target === 'enterprise') setShowEnterpriseModal(false);
            const updated = await getMyOrgOrBootstrap(backendUrl, authToken);
            setOrg(updated);
            return;
          } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || '';
            if (/reference missing/i.test(msg)) {
              await new Promise((r) => setTimeout(r, 5000));
              try {
                await confirmOrgSubscription(backendUrl, authToken, mpesaPaymentIdRef.current!);
                finalizeOrgPurchaseFromStash({
                  txRef: String(mpesaPaymentIdRef.current || ''),
                  tier: target,
                  cycle: apiCycle,
                  method: 'mpesa',
                });
                mpesaPaymentIdRef.current = null;
                alert('Payment confirmed. Subscription activated ✅');
                if (target === 'pro') setShowProModal(false);
                if (target === 'enterprise') setShowEnterpriseModal(false);
                const updated = await getMyOrgOrBootstrap(backendUrl, authToken);
                setOrg(updated);
                return;
              } catch (err2: any) {
                const msg2 = err2?.response?.data?.message || err2?.message || '';
                if (/reference missing/i.test(msg2)) {
                  alert(
                    'We’re still waiting for M-Pesa to confirm. If you have the receipt on your phone, enter it below and press “Update Reference / Complete”.'
                  );
                  return;
                }
                alert(msg2 || 'Payment confirmation failed. Please try again.');
                return;
              }
            }
            alert(msg || 'Payment confirmation failed. Please try again.');
            return;
          }
        }

        // Paystack flow
        if (apiMethod === 'PAYSTACK') {
          const init = await initOrgSubscription(backendUrl, authToken, org.id, {
            tier: target,
            cycle: apiCycle,
            method: 'PAYSTACK',
          } as any);

          const authUrl = (init as any).authorizationUrl || (init as any).authorization_url || '';
          const paymentId = (init as any).paymentId || (init as any).payment_id || '';
          const expectedKesMinor = (init as any)?.charge?.expectedKesMinor;
          const amountMajor = majorFromMinor(expectedKesMinor);
          const reference = String((init as any)?.reference || '').trim() || undefined;

          if (!authUrl) {
            alert('Paystack init failed: missing authorization URL');
            return;
          }

          stashCheckout('checkout:org', {
            kind: 'org',
            tier: target,
            cycle: apiCycle,
            currency: 'KES',
            value: amountMajor || readCheckout('checkout:org')?.value || 0,
            reference,
            orgId: org.id,
            orgName: org?.name,
            timestamp: Date.now(),
          });

          try {
            if (paymentId) sessionStorage.setItem('org:lastPaystackPaymentId', String(paymentId));
            sessionStorage.setItem('org:lastPaystackTier', String(target));
            sessionStorage.setItem('org:lastPaystackCycle', String(apiCycle));
            sessionStorage.setItem('org:lastPaystackAt', String(Date.now()));
            sessionStorage.setItem('org:lastPaystackOrgId', String(org.id));
          } catch {}

          window.location.href = authUrl;
          return;
        }


        // Paystack handled via the Paystack Buttons in the modal
      } catch (err: any) {
        const msg =
          err?.response?.data?.message || err?.message || 'Payment failed — please try again.';
        alert(msg);
      }
    },
    [backendUrl, org?.id, authToken, canUpgradePlan]
  );


  useEffect(() => {
  const sp = new URLSearchParams(window.location.search);
  const paystackRef = sp.get('reference');
  if (!paystackRef) return;
  if (!authToken) return;      // wait until tokens hydrate
  if (!org?.id) return;        // wait until org hydrates

  // ✅ prevent duplicate confirm + duplicate GA
  const onceKey = `org:paystack:confirmed:${paystackRef}`;
  try {
    if (sessionStorage.getItem(onceKey) === '1') return;
    sessionStorage.setItem(onceKey, '1');
  } catch {}

  (async () => {
    try {
      // read what we saved before redirect
      const paymentId = sessionStorage.getItem('org:lastPaystackPaymentId') || '';
      const tier = (sessionStorage.getItem('org:lastPaystackTier') || 'pro') as 'pro' | 'enterprise';
      const cycle = (sessionStorage.getItem('org:lastPaystackCycle') || 'monthly') as 'monthly' | 'yearly';

      // (optional) time guard: ignore ancient returns
      const at = Number(sessionStorage.getItem('org:lastPaystackAt') || 0);
      if (at && Date.now() - at > 60 * 60 * 1000) {
        // older than 1 hour
        console.warn('[Paystack return] too old, ignoring');
        return;
      }

      // ✅ IMPORTANT: confirm/verify on backend first
      // Use paymentId if you have it; otherwise fall back to ref.
      await confirmOrgSubscription(backendUrl, authToken, paymentId || paystackRef, paystackRef);

      finalizeOrgPurchaseFromStash({
        txRef: paystackRef,
        tier,
        cycle,
        method: 'paystack',
      });

      await refreshOrgAfterPayment();

      // ✅ cleanup URL so refresh doesn't re-run
      sp.delete('reference');
      const qs = sp.toString();
      window.history.replaceState({}, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);

      // optional: cleanup session markers
      try {
        sessionStorage.removeItem('org:lastPaystackPaymentId');
        sessionStorage.removeItem('org:lastPaystackTier');
        sessionStorage.removeItem('org:lastPaystackCycle');
        sessionStorage.removeItem('org:lastPaystackAt');
        sessionStorage.removeItem('org:lastPaystackOrgId');
      } catch {}
    } catch (e) {
      console.warn('[Paystack return] confirm failed', e);
      // allow retry if you want:
      try { sessionStorage.removeItem(onceKey); } catch {}
    }
  })();
}, [backendUrl, authToken, org?.id, refreshOrgAfterPayment]);

  

  /** Helpers */
  const seatPct = Math.min(100, Math.round(((seatsUsed || 0) / seatsMax) * 100));
  const nearLimit = seatPct >= 90;
  const visibleTabs: TabKey[] = isInstructor
    ? ['assign', 'analytics', 'tools']
    : ['branding', 'assign', 'analytics', 'tools'];

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      alert('Invite link copied!');
    } catch {}
  };

  // Legacy-only slice for learner view
  const getAttachmentUrl = (a: any): string | null =>
    a?.attachment_url ||
    a?.attachmentUrl ||
    a?.download_url ||
    a?.downloadUrl ||
    a?.resource_url ||
    a?.resourceUrl ||
    null;

  const aiAssignments = React.useMemo(
    () => learnerAssignments.filter((a) => getAssignmentType(a) === 'ai'),
    [learnerAssignments],
  );
  const aiTotal = aiAssignments.length;
  const aiPageCount = React.useMemo(
    () => Math.max(1, Math.ceil((aiTotal || 0) / aiPageSize)),
    [aiTotal, aiPageSize],
  );
  const aiRangeStart = aiTotal ? (aiPage - 1) * aiPageSize + 1 : 0;
  const aiPageItems = React.useMemo(() => {
    const start = (aiPage - 1) * aiPageSize;
    return aiAssignments.slice(start, start + aiPageSize);
  }, [aiAssignments, aiPage, aiPageSize]);
  const aiRangeEnd = aiTotal ? Math.min(aiTotal, aiRangeStart + aiPageItems.length - 1) : 0;

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil((aiTotal || 0) / aiPageSize));
    if (aiPage > maxPage) setAiPage(maxPage);
  }, [aiTotal, aiPageSize, aiPage]);

  const classicAssignments = React.useMemo(
    () => learnerAssignments.filter((a) => getAssignmentType(a) === 'legacy'),
    [learnerAssignments],
  );
  const classicTotal = classicAssignments.length;
  const classicPageCount = React.useMemo(
    () => Math.max(1, Math.ceil((classicTotal || 0) / classicPageSize)),
    [classicTotal, classicPageSize],
  );
  const classicRangeStart = classicTotal ? (classicPage - 1) * classicPageSize + 1 : 0;
  const classicPageItems = React.useMemo(() => {
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

  // 🚦 Partition into submitted vs pending (paged to match instructor recent submissions UX)
  const { submittedAssignments, pendingAssignments } = React.useMemo(() => {
    const submitted: OrgAssignmentRow[] = [];
    const pending: OrgAssignmentRow[] = [];

    classicPageItems.forEach((a) => {
      const submissionCount =
        (a as any).submission_count ??
        (a as any).submissions_count ??
        (a as any).answers_count ??
        0;

      const hasFlag = (a as any).has_submission ?? (a as any).hasSubmitted ?? false;

      const submissionTimestamp =
        (a as any).latest_submission_at ||
        (a as any).submitted_at ||
        (a as any).last_submitted_at ||
        (a as any).my_submission_created_at ||
        null;

      const hasSubmitted =
        Boolean(hasFlag) || Number(submissionCount) > 0 || Boolean(submissionTimestamp);

      if (hasSubmitted) submitted.push(a);
      else pending.push(a);
    });

    return { submittedAssignments: submitted, pendingAssignments: pending };
  }, [classicPageItems]);

  return (
<div
  className="relative min-h-screen flex flex-col bg-slate-50 dark:bg-darkBg text-[#0d141c] dark:text-darkTextPrimary overflow-x-hidden"
  style={{ fontFamily: `Manrope, "Noto Sans", sans-serif` }}
>
  <SeoHead
    title="Institution Portal | DayBreak"
    description="Manage your institution’s learning portal, branding, and analytics."
    canonicalPath={location.pathname}
    noindex
  />
  <main className="flex-1 flex justify-center py-6 px-3 sm:px-4 lg:px-10">
    <div className="w-full max-w-screen-xl mx-auto space-y-4">
      {isLearnerView ? (
        <>
          {tab === 'assign' && (
            <>
              {/* ─────────────────────────────
                  LEARNER VIEW: read-only list
                 ───────────────────────────── */}
              <header className="space-y-2">
                <h1 className="text-[24px] sm:text-[28px] md:text-[32px] font-bold leading-tight">
                  Assignments shared with you
                </h1>
                <div className="text-[#49739c] dark:text-white/70 text-xs sm:text-sm">
                  These file-based assignments (PDFs, docs, images) were shared by your teachers
                  using the classic / legacy flow. Download the attachment, follow the instructions,
                  and submit your work back to the teacher.
                  {learnerClassFromUrl && (
                    <>
                      {' '}
                      You&apos;re currently viewing work for <strong>{learnerClassFromUrl}</strong>
                      {learnerSubjectFromUrl && (
                        <>
                          {' '}
                          in <strong>{learnerSubjectFromUrl}</strong>.
                        </>
                      )}
                    </>
                  )}
                </div>
              </header>

              <section className="rounded-2xl ring-1 ring-[#e7edf4] dark:ring-white/10 bg-white dark:bg-[#0f1821] p-3 sm:p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm sm:text-base font-semibold">AI assignments (Teach with AI)</h2>
                    <p className="text-[11px] sm:text-xs text-slate-600 dark:text-white/70">
                      Join AI-powered assignments shared with you. Tap the button to open the invite link.
                    </p>
                  </div>
                  {learnerAssignmentsLoading && (
                    <span className="text-[11px] text-slate-500 dark:text-white/60">Loading…</span>
                  )}
                </div>

                {aiAssignments.length === 0 && !learnerAssignmentsLoading && (
                  <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/15 px-4 py-4 text-[11px] sm:text-xs text-slate-500 dark:text-white/65">
                    No AI assignments yet. When a teacher creates a Teach with AI assignment for your class, it will appear here.
                  </div>
                )}

                {aiAssignments.length > 0 && (
                  <ul className="space-y-2">
                    {aiPageItems.map((a) => {
                      const inviteCode =
                        (a as any).invite_code || (a as any).inviteCode || (a as any).code || '';
                      const title = a.title || a.title_override || a.course_title || '';
                      const label = title ? `AI assignment • ${title}` : 'AI assignment';
                      const createdLabel = a.created_at
                        ? new Date(a.created_at).toLocaleString()
                        : null;
                      const passMark = (a as any).pass_mark ?? null;
                      const timerSeconds = (a as any).timer_s ?? null;

                      return (
                        <li
                          key={assignmentKey(a)}
                          className="rounded-xl border border-[#e7edf4] dark:border-white/10 bg-slate-50/80 dark:bg-[#111b28] px-3 py-3 sm:px-4 sm:py-3.5 flex flex-col gap-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm sm:text-base font-semibold truncate max-w-full">
                                  {title || 'AI assignment'}
                                </span>
                                {a.course_title && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100 dark:bg-sky-500/10 dark:text-sky-100 dark:border-sky-500/40">
                                    <span>📘</span>
                                    <span>{a.course_title}</span>
                                  </span>
                                )}
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-100 dark:border-indigo-500/40">
                                  <span>🤖</span>
                                  <span>Teach with AI</span>
                                </span>
                              </div>

                              <div className="mt-1 flex flex-wrap gap-2 text-[11px] sm:text-xs text-slate-600 dark:text-white/70">
                                {passMark != null && passMark !== '' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-100 dark:border-emerald-500/40">
                                    <span>🎯</span>
                                    <span>Pass mark: {passMark}%</span>
                                  </span>
                                )}
                                {timerSeconds != null && timerSeconds !== '' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 dark:bg-amber-500/10 dark:text-amber-100 dark:border-amber-500/40">
                                    <span>⏱️</span>
                                    <span>Timer: {timerSeconds}s</span>
                                  </span>
                                )}
                                {a.due_at && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 border border-slate-200 dark:bg-white/5 dark:text-white/80 dark:border-white/10">
                                    <span>📅</span>
                                    <span>Due: {new Date(a.due_at).toLocaleString()}</span>
                                  </span>
                                )}
                              </div>

                              {createdLabel && (
                                <div className="mt-1 text-[10px] text-slate-400 dark:text-white/50">
                                  Assigned: {createdLabel}
                                </div>
                              )}
                            </div>

                            <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                              {inviteCode ? (
                                <Link
                                  to={`/org/join/${encodeURIComponent(inviteCode)}`}
                                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500"
                                >
                                  <span className="text-base">🚀</span>
                                  <span>{label}</span>
                                </Link>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs sm:text-sm bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/80">
                                  Invite code unavailable
                                </span>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {aiAssignments.length > 0 && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-600 dark:text-white/70">
                    <div className="flex items-center gap-2">
                      <span>Rows:</span>
                      <select
                        value={aiPageSize}
                        onChange={(e) => {
                          setAiPageSize(Number(e.target.value) || 10);
                          setAiPage(1);
                        }}
                        className="rounded-full bg-white dark:bg-[#0f1821] px-2 py-1 ring-1 ring-black/10 dark:ring-white/10"
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                      </select>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span>
                        Showing {aiRangeStart}-{aiRangeEnd} of {aiTotal}
                      </span>
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setAiPage((p) => Math.max(1, p - 1))}
                          disabled={aiPage <= 1}
                          className="rounded-full border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40 dark:border-white/10 dark:bg-white/5"
                        >
                          ← Prev
                        </button>
                        <span>
                          Page {aiPage} / {aiPageCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => setAiPage((p) => Math.min(aiPageCount, p + 1))}
                          disabled={aiPage >= aiPageCount || aiRangeEnd >= aiTotal}
                          className="rounded-full border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40 dark:border-white/10 dark:bg-white/5"
                        >
                          Next →
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-2xl ring-1 ring-[#e7edf4] dark:ring-white/10 bg-white dark:bg-[#0f1821] p-3 sm:p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm sm:text-base font-semibold">Classic assignments</h2>
                    <p className="text-[11px] sm:text-xs text-slate-600 dark:text-white/70">
                      Download file-based assignments, follow the instructions, and submit your work
                      back to the teacher.
                    </p>
                  </div>
                  {learnerAssignmentsLoading && (
                    <span className="text-[11px] text-slate-500 dark:text-white/60">Loading…</span>
                  )}
                </div>

<div className="mt-2 space-y-4">
  {/* Submitted classic (legacy) assignments */}
  <div>
    <h3 className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-white mb-1.5">
      Submitted (Classic)
    </h3>

    {submittedAssignments.length === 0 && !learnerAssignmentsLoading && (
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/15 px-4 py-4 text-[11px] sm:text-xs text-slate-500 dark:text-white/65">
        You haven&apos;t submitted any classic (file / note) assignments yet.
      </div>
    )}

    {submittedAssignments.length > 0 && (
      <ul className="space-y-2">
        {submittedAssignments.map((a) => {
          const anyA = a as any;
          const key = assignmentKey(a);

          const dueLabel = anyA.due_at ? new Date(anyA.due_at).toLocaleString() : 'No due date';
          const createdLabel = anyA.created_at ? new Date(anyA.created_at).toLocaleString() : null;

          const attachmentUrl = getAttachmentUrlFromRow(anyA);
          const instructions = String(anyA.instructions ?? anyA.note ?? '').trim();

          return (
            <li
              key={key}
              className="rounded-xl border border-[#e7edf4] dark:border-white/10 bg-slate-50/80 dark:bg-[#111b28] px-3 py-3 sm:px-4 sm:py-3.5 flex flex-col gap-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm sm:text-base font-semibold truncate max-w-full">
                      {anyA.title || 'Untitled assignment'}
                    </span>

                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-100 dark:border-emerald-500/40">
                      ✅ Submitted
                    </span>

                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 border border-slate-200 dark:bg-white/5 dark:text-white/80 dark:border-white/10">
                      📎 Classic
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] sm:text-xs text-slate-600 dark:text-white/70">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 border border-slate-200 dark:bg-white/5 dark:text-white/80 dark:border-white/10">
                      📅 Due: {dueLabel}
                    </span>
                  </div>

                  {createdLabel && (
                    <div className="mt-1 text-[10px] text-slate-400 dark:text-white/50">
                      Assigned: {createdLabel}
                    </div>
                  )}

                  {(instructions || attachmentUrl) && (
                    <div className="mt-2 text-[11px] sm:text-xs text-slate-600 dark:text-white/75 space-y-1">
                      {attachmentUrl && (
                        <a
                          href={attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 hover:text-sky-700 dark:hover:text-sky-200"
                        >
                          ⬇️ Download assignment file
                        </a>
                      )}
                      {instructions && (
                        <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-white/60">
                          {instructions.length > 140 ? `${instructions.slice(0, 140)}…` : instructions}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitAssignment(a as OrgAssignmentRow);
                      setSubmitText('');
                      setSubmitFile(null);
                      setSubmitOpen(true);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                  >
                    ✏️ Submit again
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    )}
  </div>

  {/* Assignments to work on (classic) */}
  <div>
    <h3 className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-white mb-1.5">
      Assignments to work on (Classic)
    </h3>

    {pendingAssignments.length === 0 && !learnerAssignmentsLoading && (
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/15 px-4 py-4 text-[11px] sm:text-xs text-slate-500 dark:text-white/65">
        You don&apos;t have any pending classic assignments yet.
      </div>
    )}

    {pendingAssignments.length > 0 && (
      <ul className="space-y-2">
        {pendingAssignments.map((a) => {
          const anyA = a as any;
          const key = assignmentKey(a);

          const dueLabel = anyA.due_at ? new Date(anyA.due_at).toLocaleString() : 'No due date';
          const createdLabel = anyA.created_at ? new Date(anyA.created_at).toLocaleString() : null;

          const attachmentUrl = getAttachmentUrlFromRow(anyA);
          const instructions = String(anyA.instructions ?? anyA.note ?? '').trim();

          return (
            <li
              key={key}
              className="rounded-xl border border-[#e7edf4] dark:border-white/10 bg-slate-50/80 dark:bg-[#111b28] px-3 py-3 sm:px-4 sm:py-3.5 flex flex-col gap-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm sm:text-base font-semibold truncate max-w-full">
                      {anyA.title || 'Untitled assignment'}
                    </span>

                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 border border-slate-200 dark:bg-white/5 dark:text-white/80 dark:border-white/10">
                      📎 Classic
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] sm:text-xs text-slate-600 dark:text-white/70">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 border border-slate-200 dark:bg-white/5 dark:text-white/80 dark:border-white/10">
                      📅 Due: {dueLabel}
                    </span>
                  </div>

                  {createdLabel && (
                    <div className="mt-1 text-[10px] text-slate-400 dark:text-white/50">
                      Assigned: {createdLabel}
                    </div>
                  )}

                  {(instructions || attachmentUrl) && (
                    <div className="mt-2 text-[11px] sm:text-xs text-slate-600 dark:text-white/75 space-y-1">
                      {attachmentUrl && (
                        <a
                          href={attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 hover:text-sky-700 dark:hover:text-sky-200"
                        >
                          ⬇️ Download assignment file
                        </a>
                      )}
                      {instructions && (
                        <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-white/60">
                          {instructions.length > 140 ? `${instructions.slice(0, 140)}…` : instructions}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitAssignment(a as OrgAssignmentRow);
                      setSubmitText('');
                      setSubmitFile(null);
                      setSubmitOpen(true);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                  >
                    ✏️ Submit work
                  </button>
                </div>
              </div>

              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-white/55">
                After completing the work, submit here so your teacher can mark it.
              </p>
            </li>
          );
        })}
      </ul>
    )}
  </div>
</div>

                {classicAssignments.length > 0 && (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-600 dark:text-white/70">
                    <div className="flex items-center gap-2">
                      <span>Rows:</span>
                      <select
                        value={classicPageSize}
                        onChange={(e) => {
                          setClassicPageSize(Number(e.target.value) || 10);
                          setClassicPage(1);
                        }}
                        className="rounded-full bg-white dark:bg-[#0f1821] px-2 py-1 ring-1 ring-black/10 dark:ring-white/10"
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                      </select>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span>
                        Showing {classicRangeStart}-{classicRangeEnd} of {classicTotal}
                      </span>

                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setClassicPage((p) => Math.max(1, p - 1))}
                          disabled={classicPage <= 1}
                          className="rounded-full border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40 dark:border-white/10 dark:bg-white/5"
                        >
                          ← Prev
                        </button>
                        <span>
                          Page {classicPage} / {classicPageCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => setClassicPage((p) => Math.min(classicPageCount, p + 1))}
                          disabled={classicPage >= classicPageCount || classicRangeEnd >= classicTotal}
                          className="rounded-full border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40 dark:border-white/10 dark:bg-white/5"
                        >
                          Next →
                        </button>
                      </div>
                    </div>
                  </div>
                )}


                {learnerStudentId && (
                  <p className="mt-3 text-[10px] sm:text-[11px] text-slate-500 dark:text-white/55">
                    Learner ID in this portal: <span className="font-mono">{learnerStudentId}</span>
                    . If this doesn&apos;t match your login card, ask your teacher to confirm.
                  </p>
                )}
              </section>

              {submitOpen && submitAssignment && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
                  <div className="w-full max-w-lg rounded-2xl bg-white text-[#0d141c] dark:bg-[#0f1821] dark:text-darkTextPrimary ring-1 ring-[#cedbe8] dark:ring-white/10 shadow-xl">
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] text-slate-500 dark:text-white/60">
                          Submit assignment
                        </div>
                        <div className="text-sm sm:text-base font-semibold truncate">
                          {submitAssignment.title || 'Untitled assignment'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSubmitOpen(false)}
                        className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                      >
                        Close
                      </button>
                    </div>

                    <div className="px-4 py-3 space-y-3 max-h-[70vh] overflow-y-auto">
                      <div className="text-[11px] sm:text-xs text-slate-600 dark:text-white/70">
                        You can type your answer, attach a file (PDF, DOC, images), or both. Your
                        teacher will see the time you submitted.
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-white/80 mb-1">
                          Your answer (optional)
                        </label>
                        <textarea
                          rows={4}
                          value={submitText}
                          onChange={(e) => setSubmitText(e.target.value)}
                          className="w-full text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-[#0b1420] text-[#0d141c] dark:text-white px-3 py-2 outline-none focus:ring-2 focus:ring-sky-500/70"
                          placeholder="Type your working or short answers here…"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-white/80 mb-1">
                          Attach file (optional)
                        </label>
                        <input
                          type="file"
                          onChange={(e) => setSubmitFile(e.target.files?.[0] ?? null)}
                          className="block w-full text-[11px] sm:text-xs text-slate-600 dark:text-slate-300
                            file:mr-3 file:py-1.5 file:px-3 file:rounded-xl
                            file:border-0 file:text-xs file:font-semibold
                            file:bg-slate-900/90 file:text-white
                            hover:file:bg-slate-900
                            dark:file:bg-slate-200 dark:file:text-slate-900 dark:hover:file:bg-white/90"
                        />
                        {submitFile && (
                          <div className="mt-1 text-[11px] text-slate-500 dark:text-white/65">
                            Selected: <span className="font-mono">{submitFile.name}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="px-4 py-3 border-t border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSubmitOpen(false)}
                        className="px-3 py-1.5 rounded-xl text-xs sm:text-sm bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                        disabled={submitUploading}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSubmitLegacyWork}
                        disabled={submitUploading}
                        className="px-4 py-1.5 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {submitUploading ? 'Submitting…' : 'Submit work'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'tools' && (
            <section className="rounded-2xl ring-1 ring-[#e7edf4] dark:ring-white/10 bg-white dark:bg-[#0f1821] p-3 sm:p-4 space-y-3">
              <h1 className="text-[24px] sm:text-[28px] md:text-[32px] font-bold leading-tight">
                Tools & updates
              </h1>
              <p className="text-[#49739c] dark:text-white/70 text-xs sm:text-sm">
                Announcements and newsletters shared by your institution.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => navigate('/org/newsletters')}
                  className="rounded-2xl border border-[#d9e5f2] bg-white px-4 py-3 text-left hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-[#0b1420]"
                >
                  <div className="text-sm font-semibold">Newsletters</div>
                  <p className="text-xs text-[#49739c] dark:text-white/70">
                    View termly newsletters from your school.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/org/announcements')}
                  className="rounded-2xl border border-[#d9e5f2] bg-white px-4 py-3 text-left hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-[#0b1420]"
                >
                  <div className="text-sm font-semibold">Announcements</div>
                  <p className="text-xs text-[#49739c] dark:text-white/70">
                    Read school notices and pinned updates.
                  </p>
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTab('assign')}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                >
                  ← Back to assignments
                </button>
              </div>
            </section>
          )}
        </>
      ) : (
        

            <>
              {/* ─────────────────────────────
                  OWNER / INSTRUCTOR VIEW
                 ───────────────────────────── */}
              <header className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
                  <div>
                    <h1 className="text-[24px] sm:text-[28px] md:text-[32px] font-bold leading-tight">
                      Institution E-Learning
                    </h1>
                    <div className="text-[#49739c] dark:text-white/70 text-xs sm:text-sm">
                      {isInstructor
                        ? 'Assignments • Analytics'
                        : 'Branding • Assignments • Analytics'}
                    </div>
                  </div>

{/* Tabs + CTA (wrap-friendly) */}
<div className="-mx-1 px-1">
  <div className="flex flex-col gap-2">
    {/* Tabs (wrap on small screens) */}
    <div className="flex flex-wrap items-center gap-2">
      {visibleTabs.map((t) => (
        <button
          key={t}
          className={`px-3 py-1.5 rounded-xl text-sm ring-1 whitespace-nowrap ${
            tab === t
              ? 'bg-[#3d99f5] text-white ring-[#3d99f5]'
              : 'bg-white/80 text-[#0d141c] ring-[#3d99f5]/60 hover:bg-[#e7edf4] dark:bg-[#0b1420]/80 dark:text-darkTextPrimary dark:ring-[#3d99f5]/90 dark:hover:bg-white/5'
          }`}
          onClick={() => setTab(t)}
        >
          {t[0].toUpperCase() + t.slice(1)}
        </button>
      ))}
    </div>

    {/* Exam Results on next line (below tabs) + desktop CTA */}
    <div className="flex flex-wrap items-center gap-2">
      <LockableButton
  locked={!isProTier}
  badge="PRO"
  onClick={() => navigate('/org/exams')}
  className="
    inline-flex w-full sm:w-auto justify-center items-center gap-1.5 px-3 py-2 rounded-2xl text-sm font-semibold
    bg-[#e7edf4] text-[#0d141c] hover:bg-[#d7e4f0]
    dark:bg-[#172534] dark:text-white dark:hover:bg-[#1f2f46]
    focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3d99f5]
    focus-visible:ring-offset-2 focus-visible:ring-offset-white
    dark:focus-visible:ring-offset-slate-900
  "
  title="Open Exam Results"
>
  <span className="text-base">📊</span>
  <span>Exam results</span>
</LockableButton>


      {/* Primary CTA (keeps your existing behavior: hidden on mobile, sticky CTA handles mobile) */}
      <button
        onClick={goCreateAI}
        title="Type any topic — AI builds your course"
        className={[
          'relative group hidden sm:inline-flex items-center gap-1.5',
          'ml-1 px-4 py-2 rounded-2xl text-sm font-semibold',
          'bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-500',
          'text-white ring-1 ring-emerald-300/30 shadow-lg shadow-emerald-500/20',
          'transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300',
          ctaPulse ? 'motion-safe:animate-pulse' : '',
          'motion-reduce:transition-none motion-reduce:animate-none',
        ].join(' ')}
      >
        <span className="text-base leading-none">🤖</span>
        <span>Create with AI</span>
        <span className="relative ml-1 h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-white/70 opacity-60 motion-safe:animate-ping motion-reduce:hidden"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
        </span>
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-60 transition duration-300 blur-lg bg-emerald-400/30"
        />
      </button>
    </div>
  </div>
</div>

                </div>

                {/* Plan bar */}
                <div
                  className="
                    rounded-2xl ring-1 ring-[#e7edf4] dark:ring-white/10
                    bg-white/95 dark:bg-slate-900/70
                    p-3 sm:p-4 shadow-sm dark:shadow-none
                  "
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill>
                        Plan: <span className="ml-1 font-semibold">{tier.toUpperCase()}</span>
                      </Pill>

                      {!isInstructor && (
                        <Pill>
                          Seats: {seatsUsed}/{seatsMax}
                        </Pill>
                      )}

                      {hasPrioritySupport && <Pill>Priority support</Pill>}
                      {isInstructor && <Pill>Instructor view</Pill>}
                    </div>

                    {!isInstructor && (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        {/* seat usage bar */}
                        <div className="flex-1 sm:flex-none sm:w-40 h-2 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden ring-1 ring-slate-200 dark:ring-slate-700">
                          <div
                            className={`h-full ${nearLimit ? 'bg-red-500' : 'bg-emerald-500'}`}
                            style={{ width: `${seatPct}%` }}
                          />
                        </div>

                        {nearLimit && (
                          <span className="text-xs text-red-600 dark:text-red-400">
                            Near seat limit
                          </span>
                        )}

                        <div className="hidden sm:block w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />

                        {/* upgrade buttons */}
                        <div className="flex flex-wrap gap-1">
                          {(['starter', 'pro', 'enterprise'] as OrgTier[])
                            .filter((t) => t !== tier)
                            .map((next) => (
                              <button
                                key={next}
                                onClick={() => onUpgradeClick(next)}
                                className="
                                  px-2 py-1 rounded-lg text-xs
                                  bg-indigo-600 hover:bg-indigo-500 text-white
                                "
                                title={`Upgrade to ${next.toUpperCase()}`}
                              >
                                Upgrade → {next.toUpperCase()}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* feature chips */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {ORG_TIERS[tier].features.map((f) => (
                      <span
                        key={f}
                        className="
                          px-2 py-0.5 rounded-full text-[11px]
                          bg-[#e7edf4] text-slate-800
                          dark:bg-white/10 dark:text-white/90
                        "
                      >
                        {f}
                      </span>
                    ))}
                  </div>

                  {isInstructor && (
                    <div className="mt-2 text-[11px] text-[#49739c] dark:text-white/70">
                      Your institution owner/admin manages branding and subscriptions. As an
                      instructor you can create assignments and view analytics here.
                    </div>
                  )}
                </div>
              </header>

              {/* AI submission detail (from instructor home recent submissions AI tab) */}
              {tab === 'assign' && isAiSubmissionView && (
                <section className="mt-4 rounded-2xl ring-1 ring-[#e7edf4] dark:ring-white/10 bg-white dark:bg-[#0f1821] p-3 sm:p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <h2 className="text-sm sm:text-base font-semibold">AI submission</h2>
                      <p className="text-[11px] sm:text-xs text-slate-600 dark:text-darkTextSecondary">
                        You’re viewing a learner’s AI quiz attempt. Scores are read-only for instructors.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      {aiSubmissionLoading && (
                        <span className="text-[11px] text-slate-500 dark:text-darkTextSecondary">Loading…</span>
                      )}
                      <button
                        type="button"
                        onClick={handleBackToAssignments}
                        className="inline-flex items-center justify-center px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                      >
                        ← Back to assignments
                      </button>
                    </div>
                  </div>

                  {aiSubmissionError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] sm:text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100">
                      {aiSubmissionError}
                    </div>
                  )}

                  {!aiSubmissionLoading && !aiSubmissionError && !aiSubmission && (
                    <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/15 px-4 py-4 text-[11px] sm:text-xs text-slate-500 dark:text-white/65">
                      No submission found for this link.
                    </div>
                  )}

                  {aiSubmission && (
                    <div className="rounded-xl border border-[#e7edf4] dark:border-white/10 bg-slate-50/80 dark:bg-[#111b28] px-3 py-3 sm:px-4 sm:py-3.5 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <div className="text-sm sm:text-base font-semibold">
                            {aiSubmission.assignment_title || aiSubmission.course_title || 'AI course'}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] sm:text-xs text-slate-600 dark:text-white/70">
                            {aiSubmission.course_title && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100 dark:bg-sky-500/10 dark:text-sky-100 dark:border-sky-500/40">
                                📘 {aiSubmission.course_title}
                              </span>
                            )}
                            {aiSubmission.assignment_class_label && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 border border-slate-200 dark:bg-white/5 dark:text-white/80 dark:border-white/10">
                                🎓 Class: {aiSubmission.assignment_class_label}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right text-[11px] sm:text-xs text-slate-500 dark:text-white/65 space-y-1">
                          <div>
                            Submitted: {aiSubmission.submitted_at ? new Date(aiSubmission.submitted_at).toLocaleString() : 'Not timestamped'}
                          </div>
                          <div>
                            Attempt: #{aiSubmission.attempt_no ?? 1}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 sm:px-4 sm:py-4 dark:border-white/10 dark:bg-[#0b1420] grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-white/50">Learner</div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-white/90">{aiSubmission.learner_display_name || 'Learner'}</div>
                          {aiSubmission.learner_email && (
                            <div className="text-[11px] text-slate-600 dark:text-white/70">{aiSubmission.learner_email}</div>
                          )}
                          {aiSubmission.admission_number && (
                            <div className="text-[11px] text-slate-600 dark:text-white/70">Adm {aiSubmission.admission_number}</div>
                          )}
                        </div>

                        <div className="space-y-1">
                          <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-white/50">Score</div>
                          <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-200">
                            {aiSubmission.score_pct == null ? '—' : `${Math.round(Number(aiSubmission.score_pct))}%`}
                          </div>
                          {aiSubmission.pass_mark != null && (
                            <div className="text-[11px] text-slate-600 dark:text-white/70">Pass mark: {aiSubmission.pass_mark}%</div>
                          )}
                          <div className="text-[11px] text-slate-500 dark:text-white/60">Read-only instructor view</div>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Assignment submissions detail (deep-link from instructor home) */}
              {tab === 'assign' && isSubmissionsView && (
                <section className="mt-4 rounded-2xl ring-1 ring-[#e7edf4] dark:ring-white/10 bg-white dark:bg-[#0f1821] p-3 sm:p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <h2 className="text-sm sm:text-base font-semibold">Assignment submissions</h2>
                      <p className="text-[11px] sm:text-xs text-slate-600 dark:text-darkTextSecondary">
                        You’re viewing all learner submissions for this assignment. Use this view
                        after clicking a row from “Recent submissions” on the Instructor home.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      {submissionsLoading && (
                        <span className="text-[11px] text-slate-500 dark:text-darkTextSecondary">
                          Loading…
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleBackToAssignments}
                        className="inline-flex items-center justify-center px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                      >
                        ← Back to assignments
                      </button>
                    </div>
                  </div>

                  {/* Assignment header */}
                  <div className="rounded-xl border border-[#e7edf4] dark:border-white/10 bg-slate-50/80 dark:bg-[#111b28] px-3 py-3 sm:px-4 sm:py-3.5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <div className="text-sm sm:text-base font-semibold">
                          {submissionsAssignment?.title ||
                            submissionsAssignment?.title_override ||
                            submissionsAssignment?.course_title ||
                            'Assignment'}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] sm:text-xs text-slate-600 dark:text-white/70">
                          {submissionsAssignment?.course_title && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100 dark:bg-sky-500/10 dark:text-sky-100 dark:border-sky-500/40">
                              📘 {submissionsAssignment.course_title}
                            </span>
                          )}
                          {submissionsAssignment?.org_class_label && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 border border-slate-200 dark:bg-white/5 dark:text-white/80 dark:border-white/10">
                              🎓 Class: {submissionsAssignment.org_class_label}
                            </span>
                          )}
                          {submissionsAssignment?.org_subject_key && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-100 dark:border-emerald-500/40">
                              📚 Subject: {submissionsAssignment.org_subject_key}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right text-[11px] sm:text-xs text-slate-500 dark:text-white/65">
                        <div>
                          Total submissions:{' '}
                          <span className="font-semibold">{submissionsRows.length}</span>
                        </div>
                        {submissionsAssignment?.due_at && (
                          <div>Due: {new Date(submissionsAssignment.due_at).toLocaleString()}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Error / empty states */}
                  {submissionsError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] sm:text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100">
                      {submissionsError}
                    </div>
                  )}

                  {!submissionsError && !submissionsLoading && submissionsRows.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/15 px-4 py-4 text-[11px] sm:text-xs text-slate-500 dark:text-white/65">
                      No submissions have been recorded for this assignment yet. Once learners start
                      submitting work, you’ll see them listed here.
                    </div>
                  )}

                  {/* Submissions table */}
                  {submissionsRows.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs sm:text-sm">
                        <thead className="text-left text-slate-600 dark:text-white/70">
                          <tr>
                            <th className="py-2 pr-4">Learner</th>
                            <th className="py-2 pr-4">Admission No.</th>
                            <th className="py-2 pr-4">Submitted at</th>
                            <th className="py-2 pr-4">Answer</th>
                            <th className="py-2 pr-4">Attachment</th>
                            {submissionsAssignment &&
                              isAiAssignmentRow(submissionsAssignment as any) && (
                              <th className="py-2 pr-4">Score</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {submissionsRows.map((s) => {
                            const submittedRaw =
                              s.submitted_at || s.created_at || s.updated_at || null;

                            const key = String(
                              s.id ??
                                s.submission_id ??
                                `${s.assignment_id ?? submissionsAssignment?.id ?? 'a'}-${submittedRaw || 'submitted'}`
                            );

                            const name =
                              s.learner_display_name ||
                              s.display_name ||
                              `${[s.learner_first_name, s.learner_last_name]
                                .filter(Boolean)
                                .join(' ')}`.trim() ||
                              s.learner_name ||
                              s.student_name ||
                              s.name ||
                              s.email ||
                              s.learner_email ||
                              'Learner';

                            const identifier =
                              s.admission_number ||
                              s.learner_admission_code ||
                              s.student_id ||
                              s.learner_id ||
                              s.user_id ||
                              null;

                            const email = s.email || s.learner_email || null;

                            const submittedLabel = submittedRaw
                              ? new Date(submittedRaw).toLocaleString()
                              : '—';

                            const aiScore = s.ai_final_score;
                            const aiAttempts = s.ai_attempts_count;
                            const aiLast = s.ai_last_attempt_at;
                            const aiLabel =
                              aiScore == null
                                ? '—'
                                : `${Math.round(Number(aiScore))}%`;

                            const answerText = (s.answer_text || s.text || '') as string;
                            const attachmentUrl: string | null =
                              s.attachment_url || s.file_url || s.resource_url || null;

                            return (
                              <tr
                                key={key}
                                className="border-t border-[#e7edf4] dark:border-white/10 align-top"
                              >
                                <td className="py-2 pr-4">
                                  <div className="font-medium">{name}</div>
                                  {email && (
                                    <div className="text-[11px] text-slate-500 dark:text-white/60">
                                      {email}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2 pr-4 text-[11px] sm:text-xs text-slate-600 dark:text-white/70">
                                  {identifier ? (
                                    <span className="font-mono">{identifier}</span>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td className="py-2 pr-4 text-[11px] sm:text-xs text-slate-600 dark:text-white/70">
                                  {submittedLabel}
                                </td>
                                <td className="py-2 pr-4 text-[11px] sm:text-xs text-slate-600 dark:text-white/80 max-w-xs sm:max-w-md">
                                  {answerText ? (
                                    <span title={answerText}>
                                      {answerText.length > 120
                                        ? `${answerText.slice(0, 120)}…`
                                        : answerText}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 dark:text-white/50">
                                      (No typed answer)
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 pr-4 text-[11px] sm:text-xs">
                                  {attachmentUrl ? (
                                    <a
                                      href={attachmentUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                                    >
                                      ⬇️ Open file
                                    </a>
                                  ) : (
                                    <span className="text-slate-400 dark:text-white/50">
                                      No file
                                    </span>
                                  )}
                                </td>
                                {submissionsAssignment &&
                                  isAiAssignmentRow(submissionsAssignment as any) && (
                                  <td className="py-2 pr-4 text-[11px] sm:text-xs text-slate-600 dark:text-white/70 whitespace-nowrap">
                                    {aiLabel}
                                    {aiAttempts ? ` (${aiAttempts} attempt${aiAttempts === 1 ? '' : 's'})` : ''}
                                    {aiLast ? ` • ${new Date(aiLast).toLocaleDateString()}` : ''}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}

              {/* PANES (split) */}
              {(tab === 'branding' || tab === 'assign') && (
                <BrandingAssignPane
                  tab={tab}
                  setTab={setTab}
                  uploadingBursarSignature={uploadingBursarSignature}
                  // capabilities
                  canBranding={canBranding}
                  canAssignments={canAssignments}
                  canCustomPassTimers={canCustomPassTimers}
                  canSSO={canSSO}
                  canWebhooks={canWebhooks}
                  canEmailReports={canEmailReports}
                  instructors={instructors}
                  // org/session
                  org={org}
                  token={authToken}
                  tutorToken={userToken}
                  backendUrl={backendUrl}
                  // branding form
                  form={form}
                  setForm={setForm}
                  uploadingLogo={uploadingLogo}
                  uploadingSignature={uploadingSignature}
                  uploadingInstructorSignature={uploadingInstructorSignature}
                  onUpload={handleUpload}
                  onSaveBranding={saveBranding}
                  onSendTestReport={sendTestReport}
                  // assignment
                  courseId={courseId}
                  setCourseId={setCourseId}
                  titleOverride={titleOverride}
                  setTitleOverride={setTitleOverride}
                  passMark={passMark}
                  setPassMark={setPassMark}
                  timer={timer}
                  setTimer={setTimer}
                  dueAt={dueAt}
                  setDueAt={setDueAt}
                  onCreateAssignment={createAssignment}
                  inviteLink={inviteLink}
                  copyLink={copyLink}
                  setCourseIdAndUrl={setCourseIdAndUrl}
                  // NEW: assignment scope for class / subject
                  assignClassLabel={assignClassLabel}
                  assignSubjectKey={assignSubjectKey}
                  setAssignScope={(opts: { classLabel?: string; subjectKey?: string }) => {
                    if ('classLabel' in opts) {
                      setAssignClassLabel(opts.classLabel || '');
                    }
                    if ('subjectKey' in opts) {
                      setAssignSubjectKey(opts.subjectKey || '');
                    }
                  }}
                  // NEW: legacy assignment props
                  legacyTitle={legacyTitle}
                  setLegacyTitle={setLegacyTitle}
                  legacyInstructions={legacyInstructions}
                  setLegacyInstructions={setLegacyInstructions}
                  legacyDueAt={legacyDueAt}
                  setLegacyDueAt={setLegacyDueAt}
                  legacyAttachmentUrl={legacyAttachmentUrl}
                  legacyUploadingAttachment={legacyUploadingAttachment}
                  onUploadLegacyAttachment={handleUploadLegacyAttachment}
                  onCreateLegacyAssignment={createLegacyAssignment}
                  creatingLegacyAssignment={creatingLegacyAssignment}
                />
              )}
              {tab === 'analytics' && (
                <>
                  <AnalyticsPane
                    period={period}
                    setPeriod={setPeriod}
                    canMultiPeriodAnalytics={canMultiPeriodAnalytics}
                    canEmailReports={canEmailReports}
                    canCSV={canCSV}
                    loadingAnalytics={loadingAnalytics}
                    analytics={analytics}
                    summary={analyticsSummary ?? undefined}
                    onRefresh={loadAnalytics}
                    onExportCSV={downloadCSV}
                    onSendReportRow={async (bucketISO, p) => {
                      if (!org?.id || !authToken) return;
                      try {
                        const ok = await sendOrgReportRow(
                          backendUrl,
                          authToken,
                          org.id,
                          bucketISO,
                          p
                        );
                        alert(ok?.ok ? 'Report queued.' : 'Failed to queue report.');
                      } catch {
                        alert('Failed to queue report.');
                      }
                    }}
                    canMonthly={canMonthly}
                  />

                  {/* Overall learner progress (simple, read-only) */}
                  <section className="mt-4 rounded-2xl ring-1 ring-[#e7edf4] dark:ring-white/10 bg-white dark:bg-[#0f1821] p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h3 className="text-sm sm:text-base font-semibold">
                        Learner Progress (overall)
                      </h3>
                      <div className="flex items-center gap-2">
                        {lpLoading && (
                          <span className="text-xs text-slate-500 dark:text-white/70">
                            Loading…
                          </span>
                        )}
                        <button className="chip" onClick={() => loadLearnerProgress(true)}>
                          Refresh
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs sm:text-sm">
                        <thead className="text-left text-slate-600 dark:text-white/70">
                          <tr>
                            <th className="py-2 pr-4">Learner</th>
                            <th className="py-2 pr-4">Attempts</th>
                            <th className="py-2 pr-4">Passes</th>
                            <th className="py-2 pr-4">Avg</th>
                            <th className="py-2 pr-4">Completed</th>
                            <th className="py-2 pr-4">% Progress</th>
                            <th className="py-2 pr-4">Last Submit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lpRows.map((r) => (
                            <tr
                              key={String(r.user_id)}
                              className="border-t border-[#e7edf4] dark:border-white/10"
                            >
                              <td className="py-2 pr-4">
                                <div className="font-medium">
                                  {r.name || r.email || `User #${r.user_id}`}
                                </div>
                                {r.email && (
                                  <div className="text-[11px] text-slate-500 dark:text-white/60">
                                    {r.email}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 pr-4">{r.attempts}</td>
                              <td className="py-2 pr-4">{r.passes}</td>
                              <td className="py-2 pr-4">
                                {r.avg_score != null ? Math.round(r.avg_score) : 0}%
                              </td>
                              <td className="py-2 pr-4">{r.completed_assignments}</td>
                              <td className="py-2 pr-4">{r.progress_pct}%</td>
                              <td className="py-2 pr-4">
                                {r.last_submit_at
                                  ? new Date(r.last_submit_at).toLocaleString()
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                          {!lpRows.length && !lpLoading && (
                            <tr className="border-t border-[#e7edf4] dark:border-white/10">
                              <td
                                className="py-6 pr-4 text-slate-500 dark:text-white/60"
                                colSpan={7}
                              >
                                No learner data yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {lpCursor && (
                      <div className="mt-3">
                        <button
                          className="chip chip-active"
                          disabled={lpLoading}
                          onClick={() => loadLearnerProgress(false)}
                        >
                          Load more
                        </button>
                      </div>
                    )}
                  </section>
                </>
              )}
              {tab === 'tools' && (
                <section className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">Org tools</h2>
                      <p className="text-sm text-[#49739c] dark:text-darkTextSecondary">
                        Attendance, balances, newsletters, and announcements live here.
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-[#e7edf4] px-2.5 py-1 text-xs font-semibold text-[#0d141c] ring-1 ring-[#3d99f5]/50 dark:bg-[#172534] dark:text-white">
                      Pro &amp; Enterprise
                    </span>
                  </div>

                  {!isProTier && (
                    <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-100">
                      <div className="font-semibold">Upgrade to unlock org tools</div>
                      <p className="text-sm">These tools are available on Pro and Enterprise plans.</p>
                      <button
                        type="button"
                        onClick={() => navigate('/org/profile')}
                        className="mt-2 inline-flex items-center gap-2 rounded-lg bg-[#3d99f5] px-3 py-2 text-xs font-semibold text-white hover:bg-[#2e7ad2]"
                      >
                        View plans
                      </button>
                    </div>
                  )}

<div className="mt-3 grid gap-3 grid-cols-3 sm:grid-cols-4 lg:grid-cols-6">
  <PortalIconTile
    title="Attendance"
    subtitle="Sessions"
    icon={<span className="text-2xl">✅</span>}
    tone="emerald"
    disabled={!isProTier}
    badge={!isProTier ? 'Locked' : undefined}
    onClick={() => navigate('/org/attendance')}
  />

  <PortalIconTile
    title="Fees"
    subtitle="Balances"
    icon={<span className="text-2xl">💳</span>}
    tone="emerald"
    disabled={!isProTier}
    badge={!isProTier ? 'Locked' : undefined}
    onClick={goFeesSecure}
  />

  <PortalIconTile
    title="Newsletters"
    subtitle="Send"
    icon={<span className="text-2xl">📰</span>}
    tone="sky"
    disabled={!isProTier}
    badge={!isProTier ? 'Locked' : undefined}
    onClick={() => navigate('/org/newsletters')}
  />

  <PortalIconTile
    title="Announcements"
    subtitle="Post"
    icon={<span className="text-2xl">📣</span>}
    tone="indigo"
    disabled={!isProTier}
    badge={!isProTier ? 'Locked' : undefined}
    onClick={() => navigate('/org/announcements')}
  />

  <PortalIconTile
    title="Clubs"
    subtitle="Manage"
    icon={<span className="text-2xl">🤝</span>}
    tone="slate"
    disabled={!isProTier}
    badge={!isProTier ? 'Locked' : undefined}
    onClick={() => navigate('/org/tools/clubs')}
  />

  <PortalIconTile
    title="Sports"
    subtitle="Publish"
    icon={<span className="text-2xl">🏆</span>}
    tone="amber"
    disabled={!isProTier}
    badge={!isProTier ? 'Locked' : undefined}
    onClick={() => navigate('/org/tools/sports')}
  />
</div>

                </section>
              )}
            </>
          )}
        </div>
      </main>

      {/* Congrats modal – only relevant to owners (not learners) */}
      {!isLearnerView && showCongrats && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white text-[#0d141c] dark:bg-[#0f1821] dark:text-white ring-1 ring-[#cedbe8] dark:ring-white/10 p-5">
            <div className="flex items-start gap-3">
              <div className="shrink-0 h-10 w-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <span className="text-xl">🎉</span>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">Brand saved!</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-white/80">
                  Your institution profile is ready. Want to create your first course with AI now?
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setShowCongrats(false);
                  goCreateAI();
                }}
                className="btn bg-emerald-600 hover:bg-emerald-500"
              >
                Create with AI
              </button>
              <button
                onClick={() => {
                  setShowCongrats(false);
                  setTab('assign');
                }}
                className="chip chip-active"
                title="Go to Assignments"
              >
                Set up an assignment
              </button>
              <button
                onClick={() => setShowCongrats(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 text-[#0d141c] hover:bg-slate-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile sticky CTA – admin/instructor only */}
      {!isLearnerView && (
        <div className="sm:hidden fixed bottom-4 left-4 right-4 z-[95]">
          <button
            onClick={goCreateAI}
            aria-label="Create with AI"
            className={[
              'relative w-full inline-flex items-center justify-center gap-2',
              'px-5 py-3 rounded-2xl text-base font-semibold',
              'bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-500',
              'text-white ring-1 ring-emerald-300/30 shadow-xl shadow-emerald-500/25',
              'transition-all duration-300 active:scale-[0.98]',
              ctaPulse ? 'motion-safe:animate-pulse' : '',
              'motion-reduce:transition-none motion-reduce:animate-none',
            ].join(' ')}
          >
            <span className="text-xl leading-none">🤖</span>
            <span>Create with AI</span>
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-px rounded-2xl blur-lg opacity-50 bg-emerald-400/30"
            />
            <span className="absolute -top-1.5 -right-1.5 h-3 w-3">
              <span className="absolute inline-flex h-full w-full rounded-full bg-white/70 opacity-60 motion-safe:animate-ping motion-reduce:hidden"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
            </span>
          </button>
        </div>
      )}

      {/* Modals – only for owners/admins (not learner view) */}
      {!isLearnerView && org && authToken && canUpgradePlan && (
        <>
          <PlanPurchaseModalWeb
            open={showProModal}
            onClose={() => setShowProModal(false)}
            tier="pro"
            orgName={org?.name}
            orgId={org?.id}
            assets={{
              visamaster: assets?.visamaster, // adjust keys to your assets file
              mpesa: assets?.mpesa,
            }}
            onCheckout={(opts) => handleCheckout('pro', opts)}
          />

          <PlanPurchaseModalWeb
            open={showEnterpriseModal}
            onClose={() => setShowEnterpriseModal(false)}
            tier="enterprise"
            orgName={org?.name}
            orgId={org?.id}
            assets={{
              visamaster: assets?.visamaster,
              mpesa: assets?.mpesa,
            }}
            onCheckout={(opts) => handleCheckout('enterprise', opts)}
          />
        </>
      )}
    </div>
  );
}
