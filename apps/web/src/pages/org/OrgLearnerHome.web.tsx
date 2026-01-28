// apps/web/src/pages/org/OrgLearnerHome.web.tsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrgLearnerFees } from '@mytutorapp/shared/hooks/useOrgLearnerFees';
import {
  apiListLearnerNewsletters,
  apiGetMyFeeStatement,
  apiGetMyFeeStructure,
} from '@mytutorapp/shared/api/orgProApi';
import SeoHead from '../../components/seo/SeoHead';

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

const pageShell =
  'min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-darkTextPrimary px-3 sm:px-4 py-6';

const card =
  'rounded-3xl border border-slate-200/70 dark:border-darkCard bg-white/90 dark:bg-[#0b1220] p-4 sm:p-5 shadow-sm';

function moneyFromCents(cents?: number, currency?: string) {
  const cur = (currency || 'USD').toUpperCase();
  const v = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(v);
  } catch {
    return `${cur} ${v.toFixed(2)}`;
  }
}

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

  if (Number.isInteger(n) && Math.abs(n) > 100000) return n;
  return Math.round(n * 100);
}
function sumCents(items: any[]) {
  return (items || []).reduce((acc, it) => acc + amountToCents(it), 0);
}

function IconTile({
  to,
  icon,
  title,
  subtitle,
  tone = 'indigo',
  badge,
  disabled,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  tone?: 'indigo' | 'emerald' | 'sky' | 'amber' | 'rose' | 'slate';
  badge?: string;
  disabled?: boolean;
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
              ? 'from-slate-200/60 to-slate-50 ring-slate-200 text-slate-700 dark:from-white/10 dark:to-white/5 dark:ring-white/10 dark:text-white'
              : 'from-indigo-500/20 to-indigo-500/5 ring-indigo-300/50 text-indigo-700 dark:from-indigo-500/25 dark:to-indigo-500/5 dark:ring-indigo-400/30 dark:text-indigo-100';

  const base =
    'group relative rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-white/5 ' +
    'hover:bg-slate-50 dark:hover:bg-white/10 transition overflow-hidden ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 dark:focus-visible:ring-white/20';

  const inner =
    'flex flex-col items-center justify-center text-center px-3 py-4 sm:py-5 min-h-[108px] sm:min-h-[124px]';

  const iconWrap =
    'h-12 w-12 sm:h-14 sm:w-14 rounded-2xl grid place-items-center bg-gradient-to-br ring-1 shadow-inner ' +
    toneCls;

  const titleCls = 'mt-2 text-sm font-semibold text-slate-900 dark:text-white/95';
  const subCls = 'mt-1 text-[11px] leading-snug text-slate-600 dark:text-white/60';

  const shine = (
    <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition">
      <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-slate-400/10 dark:bg-white/10 blur-2xl" />
      <div className="absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-slate-400/10 dark:bg-white/10 blur-2xl" />
    </div>
  );

  if (disabled) {
    return (
      <div className={cn(base, 'opacity-60 cursor-not-allowed')}>
        <div className={inner}>
          <div className={cn(iconWrap, 'ring-slate-200 dark:ring-white/10')}>{icon}</div>
          <div className={titleCls}>{title}</div>
          {subtitle ? <div className={subCls}>{subtitle}</div> : null}
          {badge ? (
            <div className="mt-2 text-[10px] px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-700 dark:bg-white/10 dark:text-white/70 dark:border-white/10">
              {badge}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <Link to={to} className={base} title={title}>
      {shine}

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
    </Link>
  );
}

const OrgLearnerHome: React.FC = () => {
  const location = useLocation();
  const { org, role, currentUser } = (useOrg?.() ?? {}) as any;
  const [params] = useSearchParams();
  const navigate = useNavigate();

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

  const orgName: string = org?.name || org?.org_name || 'Your Institution';
  const planLabel: string = org?.tier ? org.tier.toString().toUpperCase() : 'STARTER';
  const isProTier =
    String(org?.tier || '').toLowerCase() === 'pro' ||
    String(org?.tier || '').toLowerCase() === 'enterprise';

  const portalLabel = role ? `${String(role).toUpperCase()} PORTAL` : 'LEARNER PORTAL';

  // Learner identity
  const rawStudentIdParam = params.get('studentId') ?? params.get('student_id') ?? '';
  const subjectParam =
    params.get('subject') ?? params.get('subjectKey') ?? params.get('subject_key') ?? '';

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
    (learnerProfileFromOrg && (learnerProfileFromOrg.photo_url || learnerProfileFromOrg.photoUrl)) ||
    (learnerProfileFromShop && (learnerProfileFromShop.photo_url || learnerProfileFromShop.photoUrl)) ||
    null;

  const learnerPhoto: string | null =
    learnerPhotoFromProfile || learner?.photo_url || learner?.photoUrl || null;

  const learnerInitial = (learnerName || 'L').trim().charAt(0).toUpperCase();

  const isLoading = !learner && !rawStudentIdParam;

  const handleLogout = React.useCallback(async () => {
    if (orgLogout) await orgLogout();
    navigate('/org/login', { replace: true });
  }, [orgLogout, navigate]);

  const learnerFeesHref = learnerStudentId
    ? `/org/learn/fees?studentId=${encodeURIComponent(learnerStudentId)}`
    : `/org/learn/fees`;

  const examsHref = learnerStudentId
    ? `/org/exams?view=learner&studentId=${encodeURIComponent(learnerStudentId)}`
    : '/org/exams?view=learner';

  const courseQueryParts: string[] = [];
  courseQueryParts.push('view=learner');
  if (learnerStudentId) courseQueryParts.push(`studentId=${encodeURIComponent(learnerStudentId)}`);
  if (learnerGrade) courseQueryParts.push(`class=${encodeURIComponent(learnerGrade)}`);
  if (learnerSubject) courseQueryParts.push(`subject=${encodeURIComponent(learnerSubject)}`);
  const coursesHref = `/courses${courseQueryParts.length ? `?${courseQueryParts.join('&')}` : ''}`;

  const activitiesQueryParts: string[] = [];
  activitiesQueryParts.push('view=learner');
  if (learnerStudentId) activitiesQueryParts.push(`studentId=${encodeURIComponent(learnerStudentId)}`);
  if (learnerGrade) activitiesQueryParts.push(`class=${encodeURIComponent(learnerGrade)}`);
  if (learnerSubject) activitiesQueryParts.push(`subject=${encodeURIComponent(learnerSubject)}`);

  const baseActivitiesHref = `/org/learn/activities${
    activitiesQueryParts.length ? `?${activitiesQueryParts.join('&')}` : ''
  }`;

  const sportsCalendarHref = `${baseActivitiesHref}${activitiesQueryParts.length ? '&' : '?'}tab=sports`;
  const clubsSocietiesHref = `${baseActivitiesHref}${activitiesQueryParts.length ? '&' : '?'}tab=clubs`;

  const assignQueryParts: string[] = [];
  assignQueryParts.push('view=learner', 'tab=assign');
  if (learnerStudentId) assignQueryParts.push(`studentId=${encodeURIComponent(learnerStudentId)}`);
  if (learnerGrade) assignQueryParts.push(`class=${encodeURIComponent(learnerGrade)}`);
  if (learnerSubject) assignQueryParts.push(`subject=${encodeURIComponent(learnerSubject)}`);
  const assignmentsHref = `/org/portal${assignQueryParts.length ? `?${assignQueryParts.join('&')}` : ''}`;

  const resultsHref = learnerStudentId
    ? `/results?studentId=${encodeURIComponent(learnerStudentId)}`
    : '/results';

  // Fees (legacy hook) – optional fallback for preview
  const fees = useOrgLearnerFees({ backendUrl, token: orgToken, orgId: orgId || undefined });
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

  // Fees (Balances)
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

  // Fees (Structure)
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

  const previewItems: any[] = React.useMemo(() => {
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

  const previewCurrency = expectedCurrency;

  React.useEffect(() => {
    if (backendUrl && orgToken && orgId) {
      (fees as any)?.refresh?.();
      if (isProTier) {
        statementQ?.refetch?.();
        structureQ?.refetch?.();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, orgToken, orgId, isProTier]);

  // Newsletters
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

  if (isLoading) {
    return (
      <div className={cn(pageShell, 'flex items-center justify-center')}>
        <div className="max-w-md w-full text-center space-y-3">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-darkTextSecondary">
            LEARNER PORTAL
          </p>
          <p className="text-lg font-semibold">Preparing your learner dashboard…</p>
          <p className="text-xs text-slate-600 dark:text-darkTextSecondary">
            Please wait a moment while we load your institution profile and learner account.
          </p>
        </div>
      </div>
    );
  }

  const showStructureLoading = isProTier ? structureQ.isLoading : feeLoading;
  const showStructureError = isProTier ? structureQ.error : feeError;

  const heroBg =
    'relative overflow-hidden rounded-3xl border border-slate-200/70 dark:border-darkCard bg-white/90 dark:bg-[#0b1220] ' +
    'before:absolute before:inset-0 ' +
    'before:bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_55%),radial-gradient(circle_at_bottom,rgba(56,189,248,0.10),transparent_55%)] ' +
    'dark:before:bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.22),transparent_55%),radial-gradient(circle_at_bottom,rgba(56,189,248,0.16),transparent_55%)] ' +
    'before:opacity-100';

  return (
    <div className={pageShell}>
      <SeoHead
        title="Learner Portal | DayBreak"
        description="Access your institution learner dashboard."
        canonicalPath={location.pathname}
        noindex
      />
      <div className="max-w-screen-lg mx-auto space-y-4">
        {/* Header */}
        <header className={cn(heroBg, 'p-4 sm:p-5 flex items-center justify-between gap-3')}>
          <div className="relative min-w-0">
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-600 dark:text-darkTextSecondary">
              {portalLabel}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold truncate mt-0.5">{orgName}</h1>
            <div className="text-xs text-slate-600 dark:text-darkTextSecondary mt-0.5">{planLabel} plan</div>
          </div>

          <div className="relative shrink-0 flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={handleLogout}
              className="text-[11px] sm:text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition
                         dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white/80"
              title="Sign out from this learner portal"
            >
              Not you? <span className="font-semibold">Sign out</span>
            </button>
          </div>
        </header>

        {/* Learner identity */}
        <section className={cn(card, 'relative overflow-hidden')}>
          <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-sky-500/10 blur-3xl" />

          <div className="relative flex items-center gap-3 sm:gap-4">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-gradient-to-br from-emerald-500/60 to-sky-500/60 flex items-center justify-center text-lg sm:text-xl font-bold shadow-inner overflow-hidden ring-1 ring-slate-200/50 dark:ring-white/10">
              {learnerPhoto ? (
                <img src={learnerPhoto} alt={learnerName} className="h-full w-full object-cover" />
              ) : (
                <span className="text-white">{learnerInitial}</span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-600 dark:text-darkTextSecondary">
                Signed in learner
              </p>

              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <div className="text-base sm:text-lg font-semibold truncate">{learnerName}</div>

                {learnerGrade && (
                  <span className="text-[11px] sm:text-xs px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800
                                   dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-400/30">
                    Grade / Class: {learnerGrade}
                  </span>
                )}

                {learnerSubject && (
                  <span className="text-[11px] sm:text-xs px-2 py-0.5 rounded-full border border-sky-200 bg-sky-50 text-sky-800
                                   dark:bg-sky-500/15 dark:text-sky-200 dark:border-sky-400/30">
                    Subject focus: {learnerSubject}
                  </span>
                )}
              </div>

              <div className="mt-2 space-y-0.5 text-xs text-slate-700 dark:text-white/70">
                <div className="flex flex-wrap gap-1 items-baseline">
                  <span className="opacity-80">📧 Email:</span>
                  <span className="font-mono break-all">
                    {learnerEmail || 'No email on file yet – ask your teacher to update it.'}
                  </span>
                </div>

                {admissionCode && (
                  <div className="flex flex-wrap gap-1 items-baseline">
                    <span className="opacity-80">🆔 Admission No:</span>
                    <span className="font-mono">{admissionCode}</span>
                  </div>
                )}

                <p className="mt-1 text-[11px] text-slate-500 dark:text-white/50">
                  If this name or grade doesn&apos;t look correct, sign out and ask your teacher to confirm your login card.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Fees & balances */}
        <section className={cn(card, 'relative overflow-hidden')}>
          <div className="pointer-events-none absolute -top-12 -left-12 h-36 w-36 rounded-full bg-emerald-500/10 blur-3xl" />

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Fees &amp; balances</h2>
              <p className="text-sm text-slate-600 dark:text-darkTextSecondary">
                Your balance is calculated from charges and payments recorded by the school.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  (fees as any)?.refresh?.();
                  statementQ?.refetch?.();
                  structureQ?.refetch?.();
                }}
                className="text-[11px] sm:text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition
                           dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white/80"
              >
                Refresh
              </button>

              <Link
                to={learnerFeesHref}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-sm text-white shadow-sm"
              >
                <span>💳</span>
                Open fees
              </Link>
            </div>
          </div>

          {!isProTier ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-100">
              This institution’s fees module is available on <b>Pro/Enterprise</b>. If you need fee access, ask your admin.
            </div>
          ) : statementQ.isLoading ? (
            <div className="mt-3 text-sm text-slate-600 dark:text-darkTextSecondary">Loading your balances…</div>
          ) : statementQ.error ? (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-900/20 dark:text-rose-100">
              Could not load balances.{' '}
              <span className="text-slate-600 dark:text-white/70">
                {String(((statementQ.error as any)?.message || statementQ.error) ?? '')}
              </span>
            </div>
          ) : !statement ? (
            <div className="mt-3 text-sm text-slate-600 dark:text-darkTextSecondary">
              No fee statement is available yet. Please ask the school office.
            </div>
          ) : summaryBy.length > 1 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {summaryBy.map((r: any) => (
                <div key={r.currency} className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="text-xs text-slate-600 dark:text-white/60">{String(r.currency || '').toUpperCase()}</div>
                  <div className="mt-2 text-sm space-y-1 text-slate-700 dark:text-white/80">
                    <div className="flex justify-between">
                      <span>Total billed</span>
                      <b>{moneyFromCents(r.total_charges, r.currency)}</b>
                    </div>
                    <div className="flex justify-between">
                      <span>Total paid</span>
                      <b>{moneyFromCents(r.total_payments, r.currency)}</b>
                    </div>
                    <div className="flex justify-between">
                      <span>Balance</span>
                      <b>{moneyFromCents(r.balance, r.currency)}</b>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
                <div className="text-xs text-slate-600 dark:text-white/60">Total billed</div>
                <div className="text-lg font-bold">{moneyFromCents(billedCents, primaryCurrency)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
                <div className="text-xs text-slate-600 dark:text-white/60">Total paid</div>
                <div className="text-lg font-bold">{moneyFromCents(paidCents, primaryCurrency)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
                <div className="text-xs text-slate-600 dark:text-white/60">Balance</div>
                <div className="text-lg font-bold">{moneyFromCents(balanceCents, primaryCurrency)}</div>
              </div>
            </div>
          )}

          {/* Expected total + share */}
          <div className="mt-4 pt-4 border-t border-slate-200/70 dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-slate-600 dark:text-white/70">
                Fee structure:{' '}
                <span className="text-slate-900 dark:text-white font-semibold">{previewStructureTitle}</span>
              </div>

              <div className="text-sm">
                <span className="text-slate-600 dark:text-white/60">Expected total:</span>{' '}
                <span className="font-semibold">
                  {expectedTotalCents > 0 ? moneyFromCents(expectedTotalCents, expectedCurrency) : '—'}
                </span>
              </div>
            </div>

            {isProTier && expectedTotalCents > 0 ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="text-[11px] text-slate-600 dark:text-white/60">Paid (share)</div>
                  <div className="text-sm font-semibold">
                    {moneyFromCents(paidForExpectedCents, expectedCurrency)}{' '}
                    <span className="text-slate-600 dark:text-white/60">• {paidSharePct}%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-200/80 dark:bg-white/10 overflow-hidden">
                    <div className="h-full bg-emerald-500/70" style={{ width: `${paidSharePctClamped}%` }} />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="text-[11px] text-slate-600 dark:text-white/60">Remaining (to expected)</div>
                  <div className="text-sm font-semibold">
                    {moneyFromCents(expectedRemainingCents, expectedCurrency)}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-white/50">Based on the published fee structure.</div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="text-[11px] text-slate-600 dark:text-white/60">Expected total</div>
                  <div className="text-sm font-semibold">{moneyFromCents(expectedTotalCents, expectedCurrency)}</div>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-white/50">“Expected” may differ from “Billed”.</div>
                </div>
              </div>
            ) : null}

            {!isProTier ? (
              <div className="mt-2 text-sm text-slate-600 dark:text-darkTextSecondary">
                Fee structure preview is available on Pro/Enterprise.
              </div>
            ) : showStructureLoading ? (
              <div className="mt-2 text-sm text-slate-600 dark:text-darkTextSecondary">Loading fee structure…</div>
            ) : showStructureError ? (
              <div className="mt-2 text-sm text-rose-700 dark:text-rose-200">Could not load fee structure.</div>
            ) : previewItems?.length ? (
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-white/10 dark:bg-white/5">
                <div className="divide-y divide-slate-200/70 dark:divide-white/10">
                  {previewItems.slice(0, 6).map((it, idx) => (
                    <div key={it?.id ?? idx} className="px-3 py-2 flex items-center justify-between gap-2">
                      <div className="text-sm text-slate-700 dark:text-white/80 truncate">
                        {it?.label || it?.name || it?.title || `Item ${idx + 1}`}
                      </div>
                      <div className="text-sm font-semibold">
                        {moneyFromCents(amountToCents(it), pickString(it?.currency, previewCurrency))}
                      </div>
                    </div>
                  ))}
                </div>

                {previewItems.length > 6 && (
                  <div className="px-3 py-2 text-xs text-slate-600 dark:text-white/60">
                    + {previewItems.length - 6} more items (open fees to view all)
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-600 dark:text-darkTextSecondary">No structure items found yet.</div>
            )}
          </div>
        </section>

        {/* Exam results */}
        <section className={cn(card, 'relative overflow-hidden')}>
          <div className="pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full bg-sky-500/10 blur-3xl" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Exam results &amp; report cards</h2>
              <p className="text-sm text-slate-600 dark:text-darkTextSecondary">
                View your official institution exam marks and download report cards as PDF for each term or exam session.
              </p>
            </div>
            <Link
              to={examsHref}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-sky-600 hover:bg-sky-500 font-semibold text-sm text-white shadow-sm"
            >
              <span>📄</span>
              Open my results
            </Link>
          </div>
          <p className="mt-2 text-xs text-slate-600 dark:text-darkTextSecondary">
            Results are powered by your institution&apos;s DayBreak exams workspace. You can save or print the downloaded report cards.
          </p>
        </section>

        {/* Learning tools */}
        <section className={cn(card, 'relative overflow-hidden')}>
          <div className="pointer-events-none absolute -bottom-12 -right-12 h-44 w-44 rounded-full bg-indigo-500/10 blur-3xl" />

          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">Learning tools</h3>
              <p className="text-xs text-slate-600 dark:text-darkTextSecondary mt-1">
                Tap an activity. Everything here is personalized for you.
              </p>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-600 dark:text-darkTextSecondary">
              <span className="px-2 py-1 rounded-full bg-slate-50 border border-slate-200 dark:bg-white/5 dark:border-white/10">
                Modern tiles
              </span>
              {learnerGrade ? (
                <span className="px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-400/20 dark:text-emerald-200">
                  {learnerGrade}
                </span>
              ) : null}
              {learnerSubject ? (
                <span className="px-2 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-800 dark:bg-sky-500/10 dark:border-sky-400/20 dark:text-sky-200">
                  {learnerSubject}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-3 grid-cols-3 sm:grid-cols-4 lg:grid-cols-6">
            <IconTile to={assignmentsHref} icon={<span className="text-2xl">📝</span>} title="Assignments" subtitle="Files" tone="indigo" />
            <IconTile to={coursesHref} icon={<span className="text-2xl">📚</span>} title="Courses" subtitle="Library" tone="sky" />
            <IconTile to={examsHref} icon={<span className="text-2xl">🧾</span>} title="Exams" subtitle="Results" tone="sky" />
            <IconTile to={resultsHref} icon={<span className="text-2xl">🏅</span>} title="Certificates" subtitle="Achievements" tone="emerald" />
            <IconTile to={sportsCalendarHref} icon={<span className="text-2xl">🏆</span>} title="Sports" subtitle="Calendar" tone="amber" />
            <IconTile to={clubsSocietiesHref} icon={<span className="text-2xl">🤝</span>} title="Clubs" subtitle="Societies" tone="indigo" />

            <IconTile
              to="/org/learner/newsletters"
              icon={<span className="text-2xl">📰</span>}
              title="Newsletters"
              subtitle={newslettersLoading ? 'Loading…' : learnerNewsletters?.length ? 'New!' : 'Archive'}
              tone={learnerNewsletters?.length ? 'emerald' : 'slate'}
              badge={newslettersLoading ? '' : learnerNewsletters?.length ? 'Latest' : undefined}
            />

            <IconTile to="/messages" icon={<span className="text-2xl">💬</span>} title="Messages" subtitle="Help" tone="rose" />

            <IconTile
              to={learnerFeesHref}
              icon={<span className="text-2xl">💳</span>}
              title="Fees"
              subtitle={isProTier ? 'Statement' : 'Locked'}
              tone={isProTier ? 'emerald' : 'slate'}
              disabled={!isProTier}
              badge={!isProTier ? 'Pro required' : undefined}
            />
          </div>

          {!newslettersLoading && learnerNewsletters?.length ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-600 dark:text-darkTextSecondary">
                Latest newsletter
              </div>
              <div className="mt-1 text-sm font-semibold">
                {pickString(learnerNewsletters?.[0]?.title, learnerNewsletters?.[0]?.subject, 'Newsletter')}
              </div>
              <div className="mt-2">
                <Link to="/org/learner/newsletters" className="text-xs text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200">
                  Open newsletters →
                </Link>
              </div>
            </div>
          ) : null}
        </section>

        {/* Helpful quick links */}
        <section className={cn(card, 'relative overflow-hidden')}>
          <div className="pointer-events-none absolute -top-12 -right-12 h-36 w-36 rounded-full bg-slate-500/5 blur-3xl" />
          <h3 className="text-base font-semibold mb-2">Helpful</h3>
          <div className="flex flex-wrap gap-2 text-sm">
            {[
              ['Assignments', assignmentsHref],
              ['Exam results', examsHref],
              ['Certificates', resultsHref],
              ['Course library', coursesHref],
              ['Institution profile', '/org/profile'],
              ['Help', '/help'],
            ].map(([label, href]) => (
              <Link
                key={label}
                to={href}
                className="bg-slate-50 border border-slate-200 text-xs px-3 py-1 rounded-full hover:bg-slate-100 transition
                           dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10"
              >
                {label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default OrgLearnerHome;
