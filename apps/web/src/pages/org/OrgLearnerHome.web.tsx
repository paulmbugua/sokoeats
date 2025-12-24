// apps/web/src/pages/org/OrgLearnerHome.web.tsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrgLearnerFees } from '@mytutorapp/shared/hooks/useOrgLearnerFees';
import { apiListLearnerNewsletters, apiGetMyFeeStatement } from '@mytutorapp/shared/api/orgProApi';

const card = 'rounded-2xl ring-1 ring-white/10 bg-white/5 p-4 sm:p-5';

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

  // Heuristic: if it's a big integer, treat as cents; else treat as units and convert to cents
  if (Number.isInteger(n) && Math.abs(n) > 100000) return n;
  return Math.round(n * 100);
}

function sumCents(items: any[]) {
  return (items || []).reduce((acc, it) => acc + amountToCents(it), 0);
}

const OrgLearnerHome: React.FC = () => {
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

  // ─────────────────────────────────────────────
  // Learner identity
  // ─────────────────────────────────────────────
  const rawStudentIdParam = params.get('studentId') ?? params.get('student_id') ?? '';
  const subjectParam = params.get('subject') ?? params.get('subjectKey') ?? params.get('subject_key') ?? '';

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

  const toolsQueryParts: string[] = [];
  toolsQueryParts.push('view=learner', 'tab=tools');
  if (learnerStudentId) toolsQueryParts.push(`studentId=${encodeURIComponent(learnerStudentId)}`);
  if (learnerGrade) toolsQueryParts.push(`class=${encodeURIComponent(learnerGrade)}`);
  if (learnerSubject) toolsQueryParts.push(`subject=${encodeURIComponent(learnerSubject)}`);
  const learnerToolsHref = `/org/portal${toolsQueryParts.length ? `?${toolsQueryParts.join('&')}` : ''}`;

  const courseQueryParts: string[] = [];
  courseQueryParts.push('view=learner');
  if (learnerStudentId) courseQueryParts.push(`studentId=${encodeURIComponent(learnerStudentId)}`);
  if (learnerGrade) courseQueryParts.push(`class=${encodeURIComponent(learnerGrade)}`);
  if (learnerSubject) courseQueryParts.push(`subject=${encodeURIComponent(learnerSubject)}`);
  const coursesHref = `/courses${courseQueryParts.length ? `?${courseQueryParts.join('&')}` : ''}`;

  const assignQueryParts: string[] = [];
  assignQueryParts.push('view=learner', 'tab=assign');
  if (learnerStudentId) assignQueryParts.push(`studentId=${encodeURIComponent(learnerStudentId)}`);
  if (learnerGrade) assignQueryParts.push(`class=${encodeURIComponent(learnerGrade)}`);
  if (learnerSubject) assignQueryParts.push(`subject=${encodeURIComponent(learnerSubject)}`);
  const assignmentsHref = `/org/portal${assignQueryParts.length ? `?${assignQueryParts.join('&')}` : ''}`;

  const resultsHref = learnerStudentId ? `/results?studentId=${encodeURIComponent(learnerStudentId)}` : '/results';

  // ─────────────────────────────────────────────
  // Fees (Structure) – keep for item preview only
  // ─────────────────────────────────────────────
  const fees = useOrgLearnerFees({ backendUrl, token: orgToken, orgId: orgId || undefined });

  const feeLoading = (fees as any)?.loading ?? (fees as any)?.isLoading ?? false;
  const feeError = (fees as any)?.error ?? null;

  const feeStructure =
    (fees as any)?.structure ?? (fees as any)?.feeStructure ?? (fees as any)?.myFeeStructure ?? null;

  const feeItems: any[] = feeStructure?.items ?? feeStructure?.structure_items ?? [];
  const structureCurrency: string = pickString(
    feeStructure?.currency,
    (fees as any)?.currency,
    (fees as any)?.balances?.currency,
    'KES',
  );

  const totalStructureCents = sumCents(feeItems);

  // ─────────────────────────────────────────────
  // Fees (Balances) – this is the REAL “billed/paid/balance”
  // ─────────────────────────────────────────────
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
    structureCurrency,
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

  React.useEffect(() => {
    if (backendUrl && orgToken && orgId) {
      if ((fees as any)?.refresh) (fees as any).refresh();
      if (statementQ?.refetch && isProTier) statementQ.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, orgToken, orgId]);

  // ─────────────────────────────────────────────
  // Newsletters
  // ─────────────────────────────────────────────
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

  // Optional: simple loading view while contexts boot
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0b1220] text-white px-3 sm:px-4 py-6 flex items-center justify-center">
        <div className="max-w-md w-full text-center space-y-3">
          <p className="text-xs uppercase tracking-[0.16em] text-white/50">LEARNER PORTAL</p>
          <p className="text-lg font-semibold">Preparing your learner dashboard…</p>
          <p className="text-xs text-white/60">
            Please wait a moment while we load your institution profile and learner account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-white px-3 sm:px-4 py-6">
      <div className="max-w-screen-lg mx-auto space-y-4">
        {/* Header */}
        <header className={`${card} flex items-center justify-between gap-3`}>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/60">{portalLabel}</div>
            <h1 className="text-xl sm:text-2xl font-bold truncate mt-0.5">{orgName}</h1>
            <div className="text-xs text-white/60 mt-0.5">{planLabel} plan</div>
          </div>

          <div className="shrink-0 flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={handleLogout}
              className="text-[11px] sm:text-xs px-3 py-1.5 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-white/80 font-medium transition"
              title="Sign out from this learner portal"
            >
              Not you? <span className="font-semibold">Sign out</span>
            </button>
          </div>
        </header>

        {/* Learner identity */}
        <section className={card}>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-gradient-to-br from-emerald-500/60 to-sky-500/60 flex items-center justify-center text-lg sm:text-xl font-bold shadow-inner overflow-hidden">
              {learnerPhoto ? (
                <img src={learnerPhoto} alt={learnerName} className="h-full w-full object-cover" />
              ) : (
                <span>{learnerInitial}</span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-[0.16em] text-white/60">Signed in learner</p>

              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <div className="text-base sm:text-lg font-semibold truncate">{learnerName}</div>

                {learnerGrade && (
                  <span className="text-[11px] sm:text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-200 border border-emerald-400/30">
                    Grade / Class: {learnerGrade}
                  </span>
                )}

                {learnerSubject && (
                  <span className="text-[11px] sm:text-xs px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-200 border border-sky-400/30">
                    Subject focus: {learnerSubject}
                  </span>
                )}
              </div>

              <div className="mt-2 space-y-0.5 text-xs text-white/70">
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

                <p className="mt-1 text-[11px] text-white/50">
                  If this name or grade doesn&apos;t look correct, sign out and ask your teacher to confirm your login
                  card.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Fees & balances (FIXED) */}
        <section className={card}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Fees &amp; balances</h2>
              <p className="text-sm text-white/70">
                Your balance is calculated from charges and payments recorded by the school.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  (fees as any)?.refresh?.();
                  statementQ?.refetch?.();
                }}
                className="text-[11px] sm:text-xs px-3 py-1.5 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-white/80 font-medium transition"
              >
                Refresh
              </button>

              <Link
                to={learnerFeesHref}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-sm"
              >
                <span>💳</span>
                Open fees
              </Link>
            </div>
          </div>

          {!isProTier ? (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-900/20 p-3 text-sm text-amber-100">
              This institution’s fees module is available on <b>Pro/Enterprise</b>. If you need fee access, ask your
              admin.
            </div>
          ) : statementQ.isLoading ? (
            <div className="mt-3 text-sm text-white/70">Loading your balances…</div>
          ) : statementQ.error ? (
            <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-900/20 p-3 text-sm text-rose-100">
              Could not load balances.{' '}
              <span className="text-white/70">
                {String(((statementQ.error as any)?.message || statementQ.error) ?? '')}
              </span>
              <div className="mt-2 text-xs text-white/60">
                Tip: If the balances endpoint is working on the fees page but not here, confirm the same token/orgId are
                present and this page is inside the same org session.
              </div>
            </div>
          ) : !statement ? (
            <div className="mt-3 text-sm text-white/70">
              No fee statement is available yet. Please ask the school office.
            </div>
          ) : summaryBy.length > 1 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {summaryBy.map((r: any) => (
                <div key={r.currency} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-xs text-white/60">{String(r.currency || '').toUpperCase()}</div>
                  <div className="mt-2 text-sm space-y-1">
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
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/60">Total billed</div>
                <div className="text-lg font-bold">{moneyFromCents(billedCents, primaryCurrency)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/60">Total paid</div>
                <div className="text-lg font-bold">{moneyFromCents(paidCents, primaryCurrency)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/60">Balance</div>
                <div className="text-lg font-bold">{moneyFromCents(balanceCents, primaryCurrency)}</div>
              </div>
            </div>
          )}

          {/* Structure preview (secondary; NOT the balance) */}
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-white/70">
                Fee structure:{' '}
                <span className="text-white font-semibold">
                  {feeStructure?.name || feeStructure?.title || (feeStructure?.id ? `Structure #${feeStructure.id}` : '—')}
                </span>
              </div>

              <div className="text-sm">
                <span className="text-white/60">Structure total:</span>{' '}
                <span className="font-semibold">
                  {feeStructure ? moneyFromCents(totalStructureCents, structureCurrency) : '—'}
                </span>
              </div>
            </div>

            {!feeStructure ? (
              <div className="mt-2 text-sm text-white/70">
                {feeLoading ? 'Loading fee structure…' : feeError ? 'Could not load fee structure.' : 'No structure assigned yet.'}
              </div>
            ) : feeItems?.length ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                <div className="divide-y divide-white/10">
                  {feeItems.slice(0, 6).map((it, idx) => (
                    <div key={it?.id ?? idx} className="px-3 py-2 flex items-center justify-between gap-2">
                      <div className="text-sm text-white/80 truncate">
                        {it?.label || it?.name || it?.title || `Item ${idx + 1}`}
                      </div>
                      <div className="text-sm font-semibold">
                        {moneyFromCents(amountToCents(it), pickString(it?.currency, structureCurrency))}
                      </div>
                    </div>
                  ))}
                </div>

                {feeItems.length > 6 && (
                  <div className="px-3 py-2 text-xs text-white/60">
                    + {feeItems.length - 6} more items (open fees to view all)
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-2 text-sm text-white/70">This structure has no items yet.</div>
            )}
          </div>
        </section>

        {/* Exam results */}
        <section className={card}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Exam results &amp; report cards</h2>
              <p className="text-sm text-white/70">
                View your official institution exam marks and download report cards as PDF for each term or exam session.
              </p>
            </div>
            <Link
              to={examsHref}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-sky-600 hover:bg-sky-500 font-semibold text-sm"
            >
              <span>📄</span>
              Open my results
            </Link>
          </div>
          <p className="mt-2 text-xs text-white/60">
            Results are powered by your institution&apos;s DayBreak exams workspace. You can save or print the downloaded report cards.
          </p>
        </section>

        {/* Learning tools */}
        <section className={card}>
          <h3 className="text-base font-semibold mb-2">Learning tools</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              to={assignmentsHref}
              className="group rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-3 flex flex-col justify-between transition"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">Assignments (files)</h4>
                  <span className="text-[11px] text-indigo-300 group-hover:translate-x-0.5 transition">Open →</span>
                </div>
                <p className="mt-1 text-xs text-white/70">
                  See only file-based assignments (PDFs, docs, images) that your teachers have shared with you using the classic / legacy flow.
                </p>
              </div>
            </Link>

            <Link
              to={resultsHref}
              className="group rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-3 flex flex-col justify-between transition"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">Results &amp; certificates</h4>
                  <span className="text-[11px] text-indigo-300 group-hover:translate-x-0.5 transition">View →</span>
                </div>
                <p className="mt-1 text-xs text-white/70">
                  Check your quiz results from Robot Tutor and legacy exams. Certificates are currently available for Robot Tutor quizzes only.
                </p>
              </div>
            </Link>

            <div
              className={`rounded-xl px-3 py-3 flex flex-col justify-between transition border ${
                isProTier ? 'bg-white/5 hover:bg-white/10 border-white/10' : 'bg-amber-900/20 border-amber-500/30'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold">School newsletters</h4>
                  <p className="mt-1 text-xs text-white/70">
                    Read end-of-term newsletters from your school. Download as PDF anytime.
                    {!newslettersLoading && learnerNewsletters?.length ? (
                      <span className="block mt-1 text-[11px] text-white/60">
                        Latest: {pickString(learnerNewsletters?.[0]?.title, learnerNewsletters?.[0]?.subject, 'Newsletter')}
                      </span>
                    ) : null}
                  </p>
                </div>

                <Link to="/org/learner/newsletters" className="text-[11px] text-indigo-300 hover:text-indigo-200 whitespace-nowrap">
                  Open →
                </Link>
              </div>
            </div>

            <Link
              to={coursesHref}
              className="group rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-3 flex flex-col justify-between transition"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">Course library</h4>
                  <span className="text-[11px] text-indigo-300 group-hover:translate-x-0.5 transition">Browse →</span>
                </div>
                <p className="mt-1 text-xs text-white/70">
                  Explore courses, OER resources, and AI lessons connected to your account
                  {learnerGrade ? ` (${learnerGrade})` : ''} and {learnerSubject ? `subject (${learnerSubject}).` : 'subjects.'}
                </p>
              </div>
            </Link>

            <Link
              to="/messages"
              className="group rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-3 flex flex-col justify-between transition"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">Messages &amp; help</h4>
                  <span className="text-[11px] text-indigo-300 group-hover:translate-x-0.5 transition">Open →</span>
                </div>
                <p className="mt-1 text-xs text-white/70">
                  Reach your instructors or support and keep all school communication in one place.
                </p>
              </div>
            </Link>
          </div>

          {/* Optional tools shortcut (kept, since you had it) */}
          <div className="mt-3">
            <Link
              to={learnerToolsHref}
              className="text-[11px] sm:text-xs px-3 py-1.5 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-white/80 font-medium transition inline-flex items-center gap-2"
            >
              🧰 Open learner tools
            </Link>
          </div>
        </section>

        {/* Helpful quick links */}
        <section className={card}>
          <h3 className="text-base font-semibold mb-2">Helpful</h3>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link to={assignmentsHref} className="bg-white/5 border border-white/10 text-xs px-3 py-1 rounded-full hover:bg-white/10">
              Assignments
            </Link>
            <Link to={examsHref} className="bg-white/5 border border-white/10 text-xs px-3 py-1 rounded-full hover:bg-white/10">
              Exam results
            </Link>
            <Link to={resultsHref} className="bg-white/5 border border-white/10 text-xs px-3 py-1 rounded-full hover:bg-white/10">
              Certificates
            </Link>
            <Link to={coursesHref} className="bg-white/5 border border-white/10 text-xs px-3 py-1 rounded-full hover:bg-white/10">
              Course library
            </Link>
            <Link to="/org/profile" className="bg-white/5 border border-white/10 text-xs px-3 py-1 rounded-full hover:bg-white/10">
              Institution profile
            </Link>
            <Link to="/help" className="bg-white/5 border border-white/10 text-xs px-3 py-1 rounded-full hover:bg-white/10">
              Help
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
};

export default OrgLearnerHome;
