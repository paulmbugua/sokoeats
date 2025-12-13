// apps/web/src/pages/org/OrgElearnPortal.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import { uploadAsset } from '@mytutorapp/shared/api';
import {
  getOrgLearnersProgress,
  type OrgLearnerProgressRow,
  getOrgRoster,
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
  type OrgResp as Org,
  type OrgAnalyticsRow,
  createOrgLegacyAssignment,
  submitOrgLegacyAssignment,
  // 👇 used for learner read-only assignments view (legacy-only)
  getOrgAssignmentsForLearner,
  type OrgAssignmentRow,
  getOrgAssignmentSubmissions,
  OrgPricingTable,
} from '@mytutorapp/shared/api/orgApi';

import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { assets } from '../..//assets/assets';
import PlanPurchaseModalWeb from './PlanPurchaseModal.web';

import type { OrgTier } from '@mytutorapp/shared/types';
import { BrandingAssignPane, AnalyticsPane } from './OrgPortalPanes';

type TabKey = 'branding' | 'assign' | 'analytics';
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
    const kindRaw = String(
      r.source_kind ?? r.kind ?? r.source ?? ''
    ).toLowerCase();

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

  const overallPassRate =
    totalAttempts > 0 ? Math.round((totalPasses * 100) / totalAttempts) : 0;
  const overallAvgScore =
    scoreWeight > 0 ? +(scoreWeightedSum / scoreWeight).toFixed(1) : 0;

  // If backend hasn’t given us any per-source split at all, treat
  // everything as Robot Teacher quizzes so the UI isn’t empty.
  const hasAnySourceSplit =
    examsAttempts > 0 || robotAttempts > 0 || assignmentAttempts > 0;

  if (!hasAnySourceSplit && totalAttempts > 0) {
    robotAttempts = totalAttempts;
    robotPasses = totalPasses;
  }

  const safe = (v: number | undefined) =>
    Number.isFinite(v as any) ? Number(v) : 0;

  // Base derived summary
  const base: OrgAnalyticsSummary = {
    totalAttempts,
    totalPasses,
    overallPassRate,
    overallAvgScore,
    examsAttempts,
    examsPasses,
    examsPassRate:
      examsAttempts > 0 ? Math.round((examsPasses * 100) / examsAttempts) : 0,
    robotQuizAttempts: robotAttempts,
    robotQuizPasses: robotPasses,
    robotQuizPassRate:
      robotAttempts > 0
        ? Math.round((robotPasses * 100) / robotAttempts)
        : 0,
    assignmentAttempts,
    assignmentPasses,
    assignmentPassRate:
      assignmentAttempts > 0
        ? Math.round((assignmentPasses * 100) / assignmentAttempts)
        : 0,
    examCardsGenerated: examCardsGenerated || undefined,
  };

  // If backend already returns a summary block, let it override
  // individual numbers when present, but keep our fallbacks.
  if (!apiSummary) return base;

  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(apiSummary).map(([k, v]) => [
        k,
        typeof v === 'number' ? safe(v) : v,
      ])
    ),
  } as OrgAnalyticsSummary;
}

type MiniUser = { id: string | number; name?: string; email?: string };

export const ORG_TIERS: Record<
  OrgTier,
  { seats: number; features: string[] }
> = {
  starter: {
    seats: 50,
    features: ['Branding', 'Assignments', 'Monthly analytics'],
  },
  pro: {
    seats: 500,
    features: [
      'Custom pass marks & timers',
      'Monthly/Termly/Yearly analytics',
      'Email reports',
    ],
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

/** ─────────────────────────────────────────────────────────
 * Plan purchase modal (M-Pesa + Paystack only)
 * ───────────────────────────────────────────────────────── */
function PlanPurchaseModal({
  open,
  onClose,
  tier,
  orgName,
  onCheckout,

  // ✅ NEW
  pricing,
  pricingLoading,
  pricingCurrency,
  onCurrencyChange,
}: {
  open: boolean;
  onClose: () => void;
  tier: 'pro' | 'enterprise';
  orgName?: string | null;
  onCheckout: (opts: {
    method: PayMethod;
    cycle: BillingCycle;
    plan: 'pro' | 'enterprise';
    phone?: string;
    reference?: string;
  }) => void;

  // ✅ NEW
 pricing: OrgPricingTable | null;
  pricingLoading: boolean;
  pricingCurrency: 'USD' | 'KES';
  onCurrencyChange: (c: 'USD' | 'KES') => void;
}) {

  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [method, setMethod] = useState<PayMethod>('M-Pesa'); // default to KES flow
  const [phone, setPhone] = useState('');
  const [reference, setReference] = useState('');

  
    const billCycleKey: 'monthly' | 'yearly' =
    cycle === 'annual' ? 'yearly' : 'monthly';

  const currency: 'USD' | 'KES' = method === 'M-Pesa' ? 'KES' : 'USD';

  // ✅ pull from pricing table
  const priceCents: number | null =
    pricing?.tiers?.[tier]?.[billCycleKey] ?? null;

  const seatsForPlan: number | null =
    pricing?.tiers?.[tier]?.seats ?? null;


    function formatPrice(cur: 'USD' | 'KES', cents: number | null, key: 'monthly' | 'yearly') {
    const suffix = key === 'monthly' ? '/ mo' : '/ yr';
    if (cents == null) return `— ${suffix}`;
    if (cur === 'USD') return `$ ${(cents / 100).toFixed(2)} ${suffix}`;
    return `KSh ${Math.round(cents / 100).toLocaleString('en-KE')} ${suffix}`;
  }


  const priceLabel = formatPrice(currency, priceCents, billCycleKey);
  const amountLabel = `${tier.toUpperCase()} • ${
    cycle === 'monthly' ? 'Monthly' : 'Annual'
  } • ${priceLabel}`;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div className="relative z-10 w-full max-w-lg sm:max-w-xl md:max-w-2xl rounded-2xl bg-white text-[#0d141c] dark:bg-[#0f1821] dark:text-white ring-1 ring-[#cedbe8] dark:ring-white/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-slate-200 dark:border-white/10">
          <div className="min-w-0">
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-white/60 truncate">
              Upgrade for {orgName || 'your organization'}
            </div>
            <h3 className="text-base sm:text-lg font-semibold truncate">
              {tier === 'pro' ? 'Upgrade to PRO' : 'Upgrade to ENTERPRISE'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg px-2.5 py-1 text-xs sm:text-sm bg-slate-100 text-[#0d141c] hover:bg-slate-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[85vh] overflow-y-auto px-3 sm:px-4 py-3 sm:py-4 space-y-3 sm:space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {/* LEFT */}
            <div className="space-y-3">
              {/* Billing */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs sm:text-sm text-slate-600 dark:text-white/70">
                  Billing:
                </span>
                <div className="inline-flex rounded-lg overflow-hidden ring-1 ring-slate-200 dark:ring-white/10 text-xs sm:text-sm">
                  <button
                    onClick={() => setCycle('monthly')}
                    className={`px-2.5 sm:px-3 py-1.5 ${
                      cycle === 'monthly'
                        ? 'bg-slate-200 dark:bg-white/10'
                        : 'bg-transparent hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setCycle('annual')}
                    className={`px-2.5 sm:px-3 py-1.5 ${
                      cycle === 'annual'
                        ? 'bg-slate-200 dark:bg-white/10'
                        : 'bg-transparent hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    Annual
                  </button>
                </div>
              </div>

              {/* Method */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs sm:text-sm text-slate-600 dark:text-white/70">
                  Pay with:
                </span>
                <div className="inline-flex rounded-lg overflow-hidden ring-1 ring-slate-200 dark:ring-white/10 text-xs sm:text-sm">
                  <button
                    onClick={() => {
                      setMethod('Paystack');
                      onCurrencyChange('USD');
                    }}
                    className={`px-2.5 sm:px-3 py-1.5 ${
                      method === 'Paystack'
                        ? 'bg-slate-200 dark:bg-white/10'
                        : 'bg-transparent hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                    title="Charges in USD"
                  >
                    Paystack
                  </button>
                  <button
                    onClick={() => setMethod('M-Pesa')}
                    className={`px-2.5 sm:px-3 py-1.5 ${
                      method === 'M-Pesa'
                        ? 'bg-slate-200 dark:bg-white/10'
                        : 'bg-transparent hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                    title="Charges in KES"
                  >
                    M-Pesa
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-white/60">
                <span className="font-medium">Note:</span> M-Pesa charges in <b>KES</b>. Paystack charges in <b>USD</b>.
              </p>

              {/* M-Pesa */}
              {method === 'M-Pesa' && (
                <div className="rounded-xl ring-1 ring-slate-200 bg-slate-50 dark:ring-white/10 dark:bg-white/5 p-3 sm:p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-white">
                    M-Pesa (KES)
                  </h4>

                  <label className="block">
                    <span className="text-xs sm:text-sm text-slate-700 dark:text-white/80">
                      Safaricom Phone Number
                    </span>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="2547XXXXXXXX"
                      className="w-full mt-1 p-2 rounded bg-white text-[#0d141c] ring-1 ring-slate-200 outline-none focus:ring-slate-400 dark:bg-[#0f1821] dark:text-white dark:ring-white/10 dark:focus:ring-white/20 text-sm"
                    />
                  </label>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() =>
                        onCheckout({
                          method: 'M-Pesa',
                          cycle,
                          plan: tier,
                          phone,
                          reference,
                        })
                      }
                      className="w-full sm:w-auto px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm"
                      title="Send STK push"
                    >
                      Initiate STK Push
                    </button>
                    <button
                      onClick={() =>
                        onCheckout({ method: 'M-Pesa', cycle, plan: tier, phone })
                      }
                      className="w-full sm:w-auto px-3 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm"
                      title="Mark complete after confirming on device"
                    >
                      Complete Payment
                    </button>
                  </div>

                  <details className="group rounded-lg bg-slate-50 dark:bg-white/5 ring-1 ring-slate-200 dark:ring-white/10">
                    <summary className="cursor-pointer list-none px-3 py-2 text-xs sm:text-sm text-slate-700 dark:text-white/80 flex items-center justify-between">
                      Having issues? Enter M-Pesa reference
                      <span className="ml-2 text-slate-500 dark:text-white/60 group-open:rotate-180 transition-transform">
                        ▾
                      </span>
                    </summary>
                    <div className="px-3 pb-3 space-y-2">
                      <input
                        type="text"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="Receipt / reference number"
                        className="w-full p-2 rounded bg-white text-[#0d141c] ring-1 ring-slate-200 outline-none focus:ring-slate-400 dark:bg-[#0f1821] dark:text-white dark:ring-white/10 dark:focus:ring-white/20 text-sm"
                      />
                      <button
                        onClick={() =>
                          onCheckout({
                            method: 'M-Pesa',
                            cycle,
                            plan: tier,
                            phone,
                            reference,
                          })
                        }
                        className="w-full px-3 py-2 rounded bg-orange-600 hover:bg-orange-500 text-white text-sm"
                      >
                        Update Reference / Complete
                      </button>
                    </div>
                  </details>
                </div>
              )}

              {/* Paystack */}
              {method === 'Paystack' && (
                <div className="rounded-xl ring-1 ring-slate-200 dark:ring-white/10 bg-slate-50 dark:bg-white/5 p-3 sm:p-4 space-y-2">
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-white">
                    Paystack (USD)
                  </h4>

                  <p className="text-[11px] text-slate-600 dark:text-white/70">
                    You’ll be redirected to Paystack to pay for <b>{amountLabel}</b>.
                  </p>

                  <button
                    onClick={() =>
                      onCheckout({ method: 'Paystack', cycle, plan: tier })
                    }
                    className="w-full px-3 py-2 rounded bg-slate-900 hover:bg-slate-800 text-white text-sm"
                  >
                    Continue to Paystack
                  </button>

                  <p className="text-[11px] text-slate-500 dark:text-white/60">
                    After payment, you’ll return here and your subscription will activate automatically.
                  </p>
                </div>
              )}
            </div>

            {/* RIGHT */}
            <div className="space-y-3">
              <div className="rounded-xl ring-1 ring-slate-200 dark:ring-white/10 bg-slate-50 dark:bg-white/5 p-3 sm:p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="text-sm sm:text-base font-semibold truncate text-slate-900 dark:text-white">
                    {tier.toUpperCase()} plan
                  </h4>
                  <div className="text-right shrink-0">
                    <div className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white">
                      {priceLabel}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-white/60">
                      {billCycleKey === 'monthly' ? 'per month' : 'per year'} • {currency}
                    </div>
                  </div>
                </div>

                <details className="group rounded-lg bg-white dark:bg-white/5 ring-1 ring-slate-200 dark:ring-white/10">
                  <summary className="cursor-pointer list-none px-3 py-2 text-xs sm:text-sm text-slate-800 dark:text-white/80 flex items-center justify-between">
                    Plan features
                    <span className="ml-2 text-slate-500 dark:text-white/60 group-open:rotate-180 transition-transform">
                      ▾
                    </span>
                  </summary>
                  <ul className="px-4 pb-3 text-xs sm:text-sm list-disc space-y-1 text-slate-800 dark:text-white/90">
                    {tier === 'pro' ? (
                      <>
                        <li>Up to 500 seats</li>
                        <li>Custom pass marks & timers</li>
                        <li>Monthly / Termly / Yearly analytics</li>
                        <li>Email reports to admins</li>
                      </>
                    ) : (
                      <>
                        <li>Up to 5,000 seats</li>
                        <li>SSO / domain restrict</li>
                        <li>CSV export & Webhooks</li>
                        <li>Priority support</li>
                      </>
                    )}
                  </ul>
                </details>

                <div className="text-[11px] sm:text-xs text-slate-600 dark:text-white/70">
                  Selected: <b>{amountLabel}</b>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* backdrop click */}
      <button
        aria-hidden
        className="absolute inset-0 w-full h-full cursor-default"
        onClick={onClose}
        style={{ pointerEvents: 'auto' }}
      />
    </div>
  );
}


export default function OrgElearnPortal() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const viewParam = searchParams.get('view');
  const isLearnerView = viewParam === 'learner';

  const learnerStudentId =
    searchParams.get('studentId') ?? searchParams.get('student_id') ?? '';

    // NEW: deep-link into a specific assignment’s submissions
const assignmentIdFromUrl = searchParams.get('assignmentId') ?? '';
const isSubmissionsView = !isLearnerView && viewParam === 'submissions';


  // NEW: class + subject hints coming from learner portal
  const learnerClassFromUrl =
    searchParams.get('class') ?? searchParams.get('class_label') ?? '';
  const learnerSubjectFromUrl =
    searchParams.get('subject') ??
    searchParams.get('subjectKey') ??
    searchParams.get('subject_key') ??
    '';

  const { backendUrl, token: userToken, orgToken } = useShopContext();
  const authToken = orgToken || userToken;

    const { role } = useOrg({ currency: 'USD' }); // role doesn't depend on pricing currency


  const isInstructor = role === 'instructor';

  const [tab, setTab] = useState<TabKey>(
    isLearnerView ? 'assign' : isInstructor ? 'assign' : 'branding'
  );
  const [instructors, setInstructors] = useState<MiniUser[]>([]);

  // org & plan
  const [org, setOrg] = useState<Org | null>(null);
  const tier: OrgTier = (org?.tier as OrgTier) || 'starter';
  const tierMeta = ORG_TIERS[tier];
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

  // NEW: instructor/org view – detailed submissions for a single assignment
const [submissionsLoading, setSubmissionsLoading] = useState(false);
const [submissionsError, setSubmissionsError] = useState<string | null>(null);
const [submissionsAssignment, setSubmissionsAssignment] = useState<any | null>(null);
const [submissionsRows, setSubmissionsRows] = useState<any[]>([]);

  // analytics
  const [period, setPeriod] = useState<Period>('month');
  const [analytics, setAnalytics] = useState<OrgAnalyticsRow[]>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
    const [analyticsSummary, setAnalyticsSummary] =
    useState<OrgAnalyticsSummary | null>(null);

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [uploadingInstructorSignature, setUploadingInstructorSignature] =
    useState(false);

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
  const [legacyUploadingAttachment, setLegacyUploadingAttachment] =
    useState(false);
  const [creatingLegacyAssignment, setCreatingLegacyAssignment] = useState(false);

  // Learner submission modal state (for legacy assignments)
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitAssignment, setSubmitAssignment] =
    useState<OrgAssignmentRow | null>(null);
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
        typeof res === 'string'
          ? res
          : res?.url || res?.secure_url || res?.data?.url || '';

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
      const msg =
        e?.response?.data?.message ||
        e?.message ||
        'Failed to create assignment.';
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
      const resp = await getOrgAssignmentsForLearner(
        backendUrl,
        authToken,
        org.id,
        {
          studentId: learnerStudentId || undefined,
          classLabel: learnerClassFromUrl || undefined,
          subjectKey: learnerSubjectFromUrl || undefined,
        }
      );

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
    const res = await getOrgAssignmentSubmissions(
      backendUrl,
      authToken,
      org.id,
      assignmentIdFromUrl
    );

    setSubmissionsAssignment(res.assignment ?? null);
    setSubmissionsRows(Array.isArray(res.submissions) ? res.submissions : []);
  } catch (e: any) {
    console.error('[OrgElearnPortal] loadAssignmentSubmissions error', {
      message: e?.message,
      status: e?.response?.status,
      data: e?.response?.data,
      url: `${backendUrl}/api/orgs/${org?.id}/assignments/${assignmentIdFromUrl}/submissions`,
    });

    setSubmissionsError(
      e?.response?.data?.message ||
        e?.message ||
        'Failed to load submissions.'
    );
    setSubmissionsAssignment(null);
    setSubmissionsRows([]);
  } finally {
    setSubmissionsLoading(false);
  }
}, [isSubmissionsView, authToken, org?.id, assignmentIdFromUrl, backendUrl]);


useEffect(() => {
  loadAssignmentSubmissions();
}, [loadAssignmentSubmissions]);


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
          typeof res === 'string'
            ? res
            : res?.url || res?.secure_url || res?.data?.url || '';
      }

      await submitOrgLegacyAssignment(
        backendUrl,
        authToken,
        org.id,
        submitAssignment.id,
        {
          answer_text: submitText.trim() || null,
          attachment_url: attachmentUrl,
        }
      );

      alert('Your work has been submitted ✅');
      setSubmitOpen(false);
      setSubmitAssignment(null);
      setSubmitText('');
      setSubmitFile(null);

      // 🔄 refresh assignments so “submitted” view is always up to date
      await loadLearnerAssignments();
    } catch (e: any) {
      console.error('[OrgElearnPortal] submit legacy work error', e);
      const msg =
        e?.response?.data?.message ||
        e?.message ||
        'Failed to submit work.';
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
        const resp = await getOrgLearnersProgress(
          backendUrl,
          authToken,
          org.id,
          { limit: 25, cursor: reset ? undefined : lpCursor || undefined }
        );
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

      const nextUrl = `${window.location.pathname}?${sp.toString()}${
        window.location.hash
      }`;
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

  const handleBackToAssignments = useCallback(() => {
  const sp = new URLSearchParams(window.location.search);
  sp.delete('view');
  sp.delete('assignmentId');
  if (!sp.get('tab')) sp.set('tab', 'assign');

  const nextUrl = `${window.location.pathname}?${sp.toString()}${window.location.hash}`;
  navigate(nextUrl, { replace: true });
}, [navigate]);


  useEffect(() => {
    (async () => {
      if (!authToken) return;
      try {
        const real = await getMyOrgOrBootstrap(backendUrl, authToken);
        setOrg(real);
        setForm((f: any) => ({ ...f, ...real }));
      } catch (err) {
        console.warn('[OrgElearnPortal] org load failed', err);
      }
    })();
  }, [backendUrl, authToken]);

  useEffect(() => {
    if (!authToken) navigate('/org/login', { replace: true });
  }, [authToken, navigate]);

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
        const { seats_used } = await getOrgUsage(
          backendUrl,
          authToken,
          org.id
        );
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
        setInstructors(
          Array.isArray(roster?.instructors) ? roster.instructors : []
        );
      } catch {
        setInstructors([]);
      }
    })();
  }, [backendUrl, authToken, org?.id, isLearnerView]);

  /** Feature gates */
  const hasFeature = useCallback(
    (needle: string) => {
      const list = ORG_TIERS[tier]?.features || [];
      return list.some((f) =>
        f.toLowerCase().includes(needle.toLowerCase())
      );
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
    target: 'logo_url' | 'signature_url' | 'instructor_signature_url'
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
        : setUploadingInstructorSignature;

    setBusy(true);
    try {
      console.debug('[upload] start', {
        name: file.name,
        size: file.size,
        type: file.type,
      });

      const res: any = await uploadAsset(backendUrl, authToken, file, 'image');

      const url =
        typeof res === 'string'
          ? res
          : res?.url || res?.secure_url || res?.data?.url || '';

      if (!url) {
        console.error('[upload] unexpected response:', res);
        throw new Error(
          'Upload completed but no URL was returned by the server.'
        );
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
        alert(
          'Webhook URL must be a valid HTTPS URL when webhooks are enabled.'
        );
        return;
      }
    }

    try {
      const updated = await updateOrgBranding(
        backendUrl,
        authToken,
        org.id,
        form
      );
      setOrg((prev) => ({ ...(prev ?? {}), ...(updated ?? {}) } as Org));
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
    try {
      const payload: any = {
        courseId,
        title_override: titleOverride || null,
        pass_mark: canCustomPassTimers ? passMark || null : null,
        timer_s: canCustomPassTimers ? timer || null : null,
        due_at: dueAt || null,
        // 🔗 NEW: scope by class & subject so learner view filter can pick it up
        org_class_label: assignClassLabel || null,
        orgClassLabel: assignClassLabel || null,
        org_subject_key: assignSubjectKey || null,
        orgSubjectKey: assignSubjectKey || null,
      };

      const a = await createOrgAssignment(
        backendUrl,
        authToken,
        org.id,
        payload
      );
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

      const rows: OrgAnalyticsRow[] = Array.isArray(resp?.data)
        ? resp.data
        : [];

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
  }, [
    org?.id,
    backendUrl,
    authToken,
    period,
    canMultiPeriodAnalytics,
    isLearnerView,
  ]);


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
      explicitTab === 'assign' ||
      explicitTab === 'analytics' ||
      explicitTab === 'branding'
        ? explicitTab
        : (isInstructor ? 'assign' as TabKey : 'branding');

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
      const rows: (string | number)[][] = [
        ['Bucket', 'Attempts', 'Passes', 'Avg Score'],
      ];
      analytics.forEach((r) => {
        const bucketISO = new Date(r.bucket).toISOString();
        const attempts = Number(r.attempts ?? 0);
        const passes = Number(r.passes ?? 0);
        const avg = `${Math.round(r.avg_score ?? 0)}%`;
        rows.push([bucketISO, attempts, passes, avg]);
      });
      const csv = rows
        .map((r) =>
          r
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(',')
        )
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

  /** Checkout handler (M-Pesa / PayPal) */
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
      const apiCycle: 'monthly' | 'yearly' =
        opts.cycle === 'annual' ? 'yearly' : 'monthly';
      const apiMethod: 'MPESA' | 'PAYSTACK' =
        opts.method === 'M-Pesa' ? 'MPESA' : 'PAYSTACK';

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
            const init = await initOrgSubscription(
              backendUrl,
              authToken,
              org.id,
              {
                tier: target,
                cycle: apiCycle,
                method: 'MPESA',
                phone: opts.phone,
              }
            );
            mpesaPaymentIdRef.current = init.paymentId;

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
            mpesaPaymentIdRef.current = null;
            alert('Payment confirmed. Subscription activated ✅');
            if (target === 'pro') setShowProModal(false);
            if (target === 'enterprise') setShowEnterpriseModal(false);
            const updated = await getMyOrgOrBootstrap(backendUrl, authToken);
            setOrg(updated);
            return;
          }

          try {
            await confirmOrgSubscription(
              backendUrl,
              authToken,
              mpesaPaymentIdRef.current!
            );
            mpesaPaymentIdRef.current = null;
            alert('Payment confirmed. Subscription activated ✅');
            if (target === 'pro') setShowProModal(false);
            if (target === 'enterprise') setShowEnterpriseModal(false);
            const updated = await getMyOrgOrBootstrap(backendUrl, authToken);
            setOrg(updated);
            return;
          } catch (err: any) {
            const msg =
              err?.response?.data?.message || err?.message || '';
            if (/reference missing/i.test(msg)) {
              await new Promise((r) => setTimeout(r, 5000));
              try {
                await confirmOrgSubscription(
                  backendUrl,
                  authToken,
                  mpesaPaymentIdRef.current!
                );
                mpesaPaymentIdRef.current = null;
                alert('Payment confirmed. Subscription activated ✅');
                if (target === 'pro') setShowProModal(false);
                if (target === 'enterprise')
                  setShowEnterpriseModal(false);
                const updated = await getMyOrgOrBootstrap(
                  backendUrl,
                  authToken
                );
                setOrg(updated);
                return;
              } catch (err2: any) {
                const msg2 =
                  err2?.response?.data?.message || err2?.message || '';
                if (/reference missing/i.test(msg2)) {
                  alert(
                    'We’re still waiting for M-Pesa to confirm. If you have the receipt on your phone, enter it below and press “Update Reference / Complete”.'
                  );
                  return;
                }
                alert(
                  msg2 || 'Payment confirmation failed. Please try again.'
                );
                return;
              }
            }
            alert(msg || 'Payment confirmation failed. Please try again.');
            return;
          }
        }

        // ✅ Paystack flow  <-- ADD THIS BLOCK HERE
        if (apiMethod === 'PAYSTACK') {
          const init = await initOrgSubscription(backendUrl, authToken, org.id, {
            tier: target,
            cycle: apiCycle,
            method: 'PAYSTACK',

          } as any);

          const authUrl =
            (init as any).authorizationUrl ||
            (init as any).authorization_url ||
            '';

          const paymentId =
            (init as any).paymentId ||
            (init as any).payment_id ||
            '';

          if (!authUrl) {
            alert('Paystack init failed: missing authorization URL');
            return;
          }

          try {
            if (paymentId) {
              sessionStorage.setItem('org:lastPaystackPaymentId', String(paymentId));
              sessionStorage.setItem('org:lastPaystackOrgId', String(org.id));
              sessionStorage.setItem('org:lastPaystackTier', String(target));
              sessionStorage.setItem('org:lastPaystackCycle', String(apiCycle));
              sessionStorage.setItem('org:lastPaystackAt', String(Date.now()));
            }
          } catch {}

          window.location.href = authUrl; // ✅ SAME TAB
          return;
        }

        // PAYPAL handled via the PayPal Buttons in the modal
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          'Payment failed — please try again.';
        alert(msg);
      }
    },
    [backendUrl, org?.id, authToken, canUpgradePlan]
  );

  /** Helpers */
  const seatPct = Math.min(
    100,
    Math.round(((seatsUsed || 0) / seatsMax) * 100)
  );
  const nearLimit = seatPct >= 90;
  const visibleTabs: TabKey[] = isInstructor
    ? ['assign', 'analytics']
    : ['branding', 'assign', 'analytics'];

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      alert('Invite link copied!');
    } catch {}
  };

  // Legacy-only slice for learner view
  const legacyAssignments = React.useMemo(
    () =>
      learnerAssignments.filter((a) => {
        const kind = (a.source_kind || '').toLowerCase();
        const isLegacyKind = kind === 'legacy';
        const attachmentUrl =
          (a as any).attachment_url ||
          (a as any).attachmentUrl ||
          (a as any).download_url ||
          (a as any).downloadUrl ||
          (a as any).resource_url ||
          (a as any).resourceUrl ||
          null;

        // treat "legacy" rows as those explicitly marked or clearly file-based
        return isLegacyKind || (!!attachmentUrl && !a.course_id);
      }),
    [learnerAssignments]
  );

  // 🚦 Partition into submitted vs pending
  const { submittedAssignments, pendingAssignments } = React.useMemo(() => {
    const submitted: OrgAssignmentRow[] = [];
    const pending: OrgAssignmentRow[] = [];

    legacyAssignments.forEach((a) => {
      const submissionCount =
        (a as any).submission_count ??
        (a as any).submissions_count ??
        (a as any).answers_count ??
        0;

      const hasFlag =
        (a as any).has_submission ??
        (a as any).hasSubmitted ??
        false;

      const submissionTimestamp =
        (a as any).latest_submission_at ||
        (a as any).submitted_at ||
        (a as any).last_submitted_at ||
        (a as any).my_submission_created_at ||
        null;

      const hasSubmitted =
        Boolean(hasFlag) ||
        Number(submissionCount) > 0 ||
        Boolean(submissionTimestamp);

      if (hasSubmitted) submitted.push(a);
      else pending.push(a);
    });

    return { submittedAssignments: submitted, pendingAssignments: pending };
  }, [legacyAssignments]);

  return (
    <div
      className="relative min-h-screen flex flex-col bg-slate-50 dark:bg-darkBg text-[#0d141c] dark:text-darkTextPrimary overflow-x-hidden"
      style={{ fontFamily: `Manrope, "Noto Sans", sans-serif` }}
    >
      <main className="flex-1 flex justify-center py-6 px-3 sm:px-4 lg:px-10">
        <div className="w-full max-w-screen-xl mx-auto space-y-4">
          {isLearnerView ? (
            <>
              {/* ─────────────────────────────
                  LEARNER VIEW: read-only list
                 ───────────────────────────── */}
              <header className="space-y-2">
                <h1 className="text-[24px] sm:text-[28px] md:text-[32px] font-bold leading-tight">
                  Assignments shared with you
                </h1>
                <div className="text-[#49739c] dark:text-white/70 text-xs sm:text-sm">
                  These file-based assignments (PDFs, docs, images) were shared by your
                  teachers using the classic / legacy flow. Download the attachment,
                  follow the instructions, and submit your work back to the teacher.
                  {learnerClassFromUrl && (
                    <>
                      {' '}You&apos;re currently viewing work for{' '}
                      <strong>{learnerClassFromUrl}</strong>
                      {learnerSubjectFromUrl && (
                        <>
                          {' '}in{' '}
                          <strong>{learnerSubjectFromUrl}</strong>.
                        </>
                      )}
                    </>
                  )}
                </div>
              </header>

              <section className="rounded-2xl ring-1 ring-[#e7edf4] dark:ring-white/10 bg-white dark:bg-[#0f1821] p-3 sm:p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm sm:text-base font-semibold">
                      Your assignments
                    </h2>
                    <p className="text-[11px] sm:text-xs text-slate-600 dark:text-white/70">
                      You can only see assignments that your institution has
                      shared with you. New work will appear here automatically
                      when a teacher targets your class / subject.
                    </p>
                  </div>
                  {learnerAssignmentsLoading && (
                    <span className="text-[11px] text-slate-500 dark:text-white/60">
                      Loading…
                    </span>
                  )}
                </div>

                <div className="mt-2 space-y-4">
                  {/* Submitted assignments */}
                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-white mb-1.5">
                      Submitted assignments
                    </h3>

                    {submittedAssignments.length === 0 && !learnerAssignmentsLoading && (
                      <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/15 px-4 py-4 text-[11px] sm:text-xs text-slate-500 dark:text-white/65">
                        You haven&apos;t submitted any legacy (file-based) assignments yet.
                        When you submit work, it will appear here.
                      </div>
                    )}

                    {submittedAssignments.length > 0 && (
                      <ul className="space-y-2">
                        {submittedAssignments.map((a) => {
                          const key = String(a.id ?? a.invite_code ?? Math.random());
                          const dueLabel = a.due_at
                            ? new Date(a.due_at).toLocaleString()
                            : 'No due date';
                          const createdLabel = a.created_at
                            ? new Date(a.created_at).toLocaleString()
                            : null;

                          const kind = 'Legacy / classic (file-based)';

                          const rawCourseId =
                            (a as any).course_id ??
                            (a as any).courseId ??
                            (a as any).course_uuid ??
                            (a as any).courseUUID ??
                            null;
                          const courseIdForRow = rawCourseId ? String(rawCourseId) : '';

                          const attachmentUrl: string | null =
                            (a as any).attachment_url ||
                            (a as any).attachmentUrl ||
                            (a as any).download_url ||
                            (a as any).downloadUrl ||
                            (a as any).resource_url ||
                            (a as any).resourceUrl ||
                            null;

                          return (
                            <li
                              key={key}
                              className="rounded-xl border border-[#e7edf4] dark:border-white/10 bg-slate-50/80 dark:bg-[#111b28] px-3 py-3 sm:px-4 sm:py-3.5 flex flex-col gap-3"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-sm sm:text-base font-semibold truncate max-w-full">
                                      {a.title || 'Untitled assignment'}
                                    </span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] sm:text-xs text-slate-600 dark:text-white/70">
                                    {a.course_title && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100 dark:bg-sky-500/10 dark:text-sky-100 dark:border-sky-500/40">
                                        <span>📘</span>
                                        <span>{a.course_title}</span>
                                      </span>
                                    )}
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-100 dark:border-emerald-500/40">
                                      <span>⚙️</span>
                                      <span>{kind}</span>
                                    </span>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 border border-slate-200 dark:bg-white/5 dark:text-white/80 dark:border-white/10">
                                      <span>📅</span>
                                      <span>Due: {dueLabel}</span>
                                    </span>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600/10 text-emerald-700 border border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100">
                                      <span>✅</span>
                                      <span>Submitted</span>
                                    </span>
                                  </div>

                                  {createdLabel && (
                                    <div className="mt-1 text-[10px] text-slate-400 dark:text-white/50">
                                      Assigned: {createdLabel}
                                    </div>
                                  )}

                                  {attachmentUrl && (
                                    <div className="mt-2 text-[11px] sm:text-xs text-slate-600 dark:text-white/75">
                                      <a
                                        href={attachmentUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="underline underline-offset-2 hover:text-sky-700 dark:hover:text-sky-200"
                                      >
                                        ⬇️ Download assignment file
                                      </a>{' '}
                                      to review what you submitted.
                                    </div>
                                  )}
                                </div>

                                <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                  {courseIdForRow && (
                                    <Link
                                      to={`/courses/${encodeURIComponent(courseIdForRow)}/progress`}
                                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold bg-white text-[#0d141c] ring-1 ring-[#d1e2f4] hover:bg-[#e7edf4] dark:bg-[#0b1420] dark:text-white dark:ring-white/15 dark:hover:bg-white/5"
                                    >
                                      <span className="text-base">📚</span>
                                      <span>Go to course</span>
                                    </Link>
                                  )}

                                  {attachmentUrl && (
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
                                      <span className="text-base">✏️</span>
                                      <span>Submit again</span>
                                    </button>
                                  )}
                                </div>
                              </div>

                              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-white/55">
                                Your submission stays listed here so you can always see which work you&apos;ve already sent.
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {/* Assignments to work on */}
                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-white mb-1.5">
                      Assignments to work on
                    </h3>

                    {pendingAssignments.length === 0 && !learnerAssignmentsLoading && (
                      <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/15 px-4 py-4 text-[11px] sm:text-xs text-slate-500 dark:text-white/65">
                        You don&apos;t have any pending legacy (file-based) assignments for this class or subject yet.
                        New work shared by your teacher will appear here.
                      </div>
                    )}

                    {pendingAssignments.length > 0 && (
                      <ul className="space-y-2">
                        {pendingAssignments.map((a) => {
                          const key = String(a.id ?? a.invite_code ?? Math.random());
                          const dueLabel = a.due_at
                            ? new Date(a.due_at).toLocaleString()
                            : 'No due date';
                          const createdLabel = a.created_at
                            ? new Date(a.created_at).toLocaleString()
                            : null;

                          const kind = 'Legacy / classic (file-based)';

                          const rawCourseId =
                            (a as any).course_id ??
                            (a as any).courseId ??
                            (a as any).course_uuid ??
                            (a as any).courseUUID ??
                            null;
                          const courseIdForRow = rawCourseId ? String(rawCourseId) : '';

                          const attachmentUrl: string | null =
                            (a as any).attachment_url ||
                            (a as any).attachmentUrl ||
                            (a as any).download_url ||
                            (a as any).downloadUrl ||
                            (a as any).resource_url ||
                            (a as any).resourceUrl ||
                            null;

                          return (
                            <li
                              key={key}
                              className="rounded-xl border border-[#e7edf4] dark:border-white/10 bg-slate-50/80 dark:bg-[#111b28] px-3 py-3 sm:px-4 sm:py-3.5 flex flex-col gap-3"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-sm sm:text-base font-semibold truncate max-w-full">
                                      {a.title || 'Untitled assignment'}
                                    </span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] sm:text-xs text-slate-600 dark:text-white/70">
                                    {a.course_title && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100 dark:bg-sky-500/10 dark:text-sky-100 dark:border-sky-500/40">
                                        <span>📘</span>
                                        <span>{a.course_title}</span>
                                      </span>
                                    )}
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-100 dark:border-emerald-500/40">
                                      <span>⚙️</span>
                                      <span>{kind}</span>
                                    </span>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 border border-slate-200 dark:bg-white/5 dark:text-white/80 dark:border-white/10">
                                      <span>📅</span>
                                      <span>Due: {dueLabel}</span>
                                    </span>
                                  </div>

                                  {createdLabel && (
                                    <div className="mt-1 text-[10px] text-slate-400 dark:text-white/50">
                                      Assigned: {createdLabel}
                                    </div>
                                  )}

                                  {attachmentUrl && (
                                    <div className="mt-2 text-[11px] sm:text-xs text-slate-600 dark:text-white/75">
                                      <a
                                        href={attachmentUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="underline underline-offset-2 hover:text-sky-700 dark:hover:text-sky-200"
                                      >
                                        ⬇️ Download assignment file
                                      </a>{' '}
                                      and follow your teacher&apos;s instructions before submitting.
                                    </div>
                                  )}
                                </div>

                                <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                  {courseIdForRow && (
                                    <Link
                                      to={`/courses/${encodeURIComponent(courseIdForRow)}/progress`}
                                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold bg-white text-[#0d141c] ring-1 ring-[#d1e2f4] hover:bg-[#e7edf4] dark:bg-[#0b1420] dark:text-white dark:ring-white/15 dark:hover:bg-white/5"
                                    >
                                      <span className="text-base">📚</span>
                                      <span>Go to course</span>
                                    </Link>
                                  )}

                                  {attachmentUrl && (
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
                                      <span className="text-base">✏️</span>
                                      <span>Submit work</span>
                                    </button>
                                  )}
                                </div>
                              </div>

                              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-white/55">
                                After completing the work, your teacher may ask you to upload or share your answers through the course, quiz,
                                or the Messages area of your portal.
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>


                {learnerStudentId && (
                  <p className="mt-3 text-[10px] sm:text-[11px] text-slate-500 dark:text:white/55">
                    Learner ID in this portal:{' '}
                    <span className="font-mono">{learnerStudentId}</span>. If this
                    doesn&apos;t match your login card, ask your teacher to confirm.
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
                        className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-white/10 dark:text-white dark:hover:bg:white/20"
                      >
                        Close
                      </button>
                    </div>

                    <div className="px-4 py-3 space-y-3 max-h-[70vh] overflow-y-auto">
                      <div className="text-[11px] sm:text-xs text-slate-600 dark:text:white/70">
                        You can type your answer, attach a file (PDF, DOC, images),
                        or both. Your teacher will see the time you submitted.
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text:white/80 mb-1">
                          Your answer (optional)
                        </label>
                        <textarea
                          rows={4}
                          value={submitText}
                          onChange={(e) => setSubmitText(e.target.value)}
                          className="w-full text-xs sm:text-sm rounded-xl border border-slate-200 dark:border:white/15 bg-slate-50 dark:bg-[#0b1420] text-[#0d141c] dark:text:white px-3 py-2 outline-none focus:ring-2 focus:ring-sky-500/70"
                          placeholder="Type your working or short answers here…"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text:white/80 mb-1">
                          Attach file (optional)
                        </label>
                        <input
                          type="file"
                          onChange={(e) =>
                            setSubmitFile(e.target.files?.[0] ?? null)
                          }
                          className="block w-full text-[11px] sm:text-xs text-slate-600 dark:text-slate-300
                            file:mr-3 file:py-1.5 file:px-3 file:rounded-xl
                            file:border-0 file:text-xs file:font-semibold
                            file:bg-slate-900/90 file:text-white
                            hover:file:bg-slate-900
                            dark:file:bg-slate-200 dark:file:text-slate-900 dark:hover:file:bg-white/90"
                        />
                        {submitFile && (
                          <div className="mt-1 text-[11px] text-slate-500 dark:text:white/65">
                            Selected: <span className="font-mono">{submitFile.name}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="px-4 py-3 border-t border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSubmitOpen(false)}
                        className="px-3 py-1.5 rounded-xl text-xs sm:text-sm bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-white/10 dark:text:white dark:hover:bg:white/20"
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
                    <div className="text-[#49739c] dark:text:white/70 text-xs sm:text-sm">
                      {isInstructor
                        ? 'Assignments • Analytics'
                        : 'Branding • Assignments • Analytics'}
                    </div>
                  </div>

                  {/* Tabs + CTA */}
                  <div className="-mx-1 px-1 overflow-x-auto">
                    <div className="flex items-center gap-2 min-w-max">
                      <div className="flex gap-2">
                        {visibleTabs.map((t) => (
                          <button
                            key={t}
                            className={`px-3 py-1.5 rounded-xl text-sm ring-1 whitespace-nowrap ${
                              tab === t
                                ? 'bg-[#3d99f5] text-white ring-[#3d99f5]'
                                : 'bg-white/80 text-[#0d141c] ring-[#3d99f5]/60 hover:bg-[#e7edf4] dark:bg-[#0b1420]/80 dark:text-darkTextPrimary dark:ring-[#3d99f5]/90 dark:hover:bg:white/5'
                            }`}
                            onClick={() => setTab(t)}
                          >
                            {t[0].toUpperCase() + t.slice(1)}
                          </button>
                        ))}
                      </div>

                     {/* 📊 Exam results – PRO & ENTERPRISE only */}
                      {(tier === 'pro' || tier === 'enterprise') && (
                        <button
                          onClick={() => navigate('/org/exams')}
                          className="
                            hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl text-sm font-semibold
                            bg-[#e7edf4] text-[#0d141c] hover:bg-[#d7e4f0]
                            dark:bg-[#172534] dark:text-white dark:hover:bg-[#1f2f46]
                            focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3d99f5]
                            focus-visible:ring-offset-2 focus-visible:ring-offset-white
                            dark:focus-visible:ring-offset-slate-900
                          "
                        >
                          <span className="text-base">📊</span>
                          <span>Exam results</span>
                        </button>
                      )}


                      {/* Primary CTA */}
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
                        Plan:{' '}
                        <span className="ml-1 font-semibold">
                          {tier.toUpperCase()}
                        </span>
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
                            className={`h-full ${
                              nearLimit ? 'bg-red-500' : 'bg-emerald-500'
                            }`}
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
                    <div className="mt-2 text-[11px] text-[#49739c] dark:text:white/70">
                      Your institution owner/admin manages branding and subscriptions.
                      As an instructor you can create assignments and view analytics here.
                    </div>
                  )}
                </div>
              </header>

              {/* Assignment submissions detail (deep-link from instructor home) */}
                {tab === 'assign' && isSubmissionsView && (
                  <section className="mt-4 rounded-2xl ring-1 ring-[#e7edf4] dark:ring-white/10 bg-white dark:bg-[#0f1821] p-3 sm:p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <h2 className="text-sm sm:text-base font-semibold">
                          Assignment submissions
                        </h2>
                        <p className="text-[11px] sm:text-xs text-slate-600 dark:text-darkTextSecondary">
                          You’re viewing all learner submissions for this assignment.
                          Use this view after clicking a row from “Recent submissions”
                          on the Instructor home.
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
                            <span className="font-semibold">
                              {submissionsRows.length}
                            </span>
                          </div>
                          {submissionsAssignment?.due_at && (
                            <div>
                              Due:{' '}
                              {new Date(
                                submissionsAssignment.due_at
                              ).toLocaleString()}
                            </div>
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
                        No submissions have been recorded for this assignment yet.
                        Once learners start submitting work, you’ll see them listed here.
                      </div>
                    )}

                    {/* Submissions table */}
                    {submissionsRows.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs sm:text-sm">
                          <thead className="text-left text-slate-600 dark:text-white/70">
                            <tr>
                              <th className="py-2 pr-4">Learner</th>
                              <th className="py-2 pr-4">Identifier</th>
                              <th className="py-2 pr-4">Submitted at</th>
                              <th className="py-2 pr-4">Answer</th>
                              <th className="py-2 pr-4">Attachment</th>
                            </tr>
                          </thead>
                          <tbody>
                            {submissionsRows.map((s) => {
                              const key = String(
                                s.id ??
                                  s.submission_id ??
                                  `${s.assignment_id ?? submissionsAssignment?.id ?? 'a'}-${Math.random()}`
                              );

                              const name =
                                s.learner_name ||
                                s.student_name ||
                                s.name ||
                                null;

                              const identifier =
                                s.student_id ||
                                s.learner_id ||
                                s.user_id ||
                                s.admission_code ||
                                null;

                              const submittedRaw =
                                s.submitted_at ||
                                s.created_at ||
                                s.updated_at ||
                                null;

                              const submittedLabel = submittedRaw
                                ? new Date(submittedRaw).toLocaleString()
                                : '—';

                              const answerText = (s.answer_text || s.text || '') as string;
                              const attachmentUrl: string | null =
                                s.attachment_url ||
                                s.file_url ||
                                s.resource_url ||
                                null;

                              return (
                                <tr
                                  key={key}
                                  className="border-t border-[#e7edf4] dark:border-white/10 align-top"
                                >
                                  <td className="py-2 pr-4">
                                    <div className="font-medium">
                                      {name || 'Unknown learner'}
                                    </div>
                                    {s.email && (
                                      <div className="text-[11px] text-slate-500 dark:text-white/60">
                                        {s.email}
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
                          <span className="text-xs text-slate-500 dark:text:white/70">
                            Loading…
                          </span>
                        )}
                        <button
                          className="chip"
                          onClick={() => loadLearnerProgress(true)}
                        >
                          Refresh
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs sm:text-sm">
                        <thead className="text-left text-slate-600 dark:text:white/70">
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
                                {r.avg_score != null
                                  ? Math.round(r.avg_score)
                                  : 0}
                                %
                              </td>
                              <td className="py-2 pr-4">
                                {r.completed_assignments}
                              </td>
                              <td className="py-2 pr-4">{r.progress_pct}%</td>
                              <td className="py-2 pr-4">
                                {r.last_submit_at
                                  ? new Date(
                                      r.last_submit_at
                                    ).toLocaleString()
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
            </>
          )}
        </div>
      </main>

      {/* Congrats modal – only relevant to owners (not learners) */}
      {!isLearnerView && showCongrats && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white text-[#0d141c] dark:bg-[#0f1821] dark:text:white ring-1 ring-[#cedbe8] dark:ring-white/10 p-5">
            <div className="flex items-start gap-3">
              <div className="shrink-0 h-10 w-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <span className="text-xl">🎉</span>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">Brand saved!</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text:white/80">
                  Your institution profile is ready. Want to create your first
                  course with AI now?
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
                className="px-3 py-1.5 rounded-xl bg-slate-100 text-[#0d141c] hover:bg-slate-200 dark:bg-white/10 dark:text:white dark:hover:bg:white/15"
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
