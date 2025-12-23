// apps/web/src/pages/org/OrgLearnerFees.web.tsx
import React from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { useShopContext } from '@mytutorapp/shared/context';
import {
  apiGetMyFeeStatement,
  apiDownloadMyFeeStatementPdf, // we'll add this helper below (or build URL directly)
} from '@mytutorapp/shared/api/orgProApi';

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

function sanitizeFilenamePart(s: string) {
  return String(s || '')
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80);
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

const OrgLearnerFeesPage: React.FC = () => {
  const { org, role, currentUser } = (useOrg?.() ?? {}) as any;
  const [params] = useSearchParams();

  const {
    backendUrl,
    orgToken,
    userId: ctxUserId,
    user: shopUser,
    orgLearner: ctxOrgLearner,
    orgUser: ctxOrgUser,
  } = useShopContext() as any;

  const orgId = org?.id;

  const plan = String(org?.tier || '').toLowerCase();
  const isProTier = plan === 'pro' || plan === 'enterprise';

  // ─────────────────────────────────────────────
  // Resolve learner identity (same strategy as OrgLearnerHome)
  // ─────────────────────────────────────────────
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

  // Allow deep links: /org/learn/fees?studentId=123
  const rawStudentIdParam = params.get('studentId') ?? params.get('student_id') ?? '';
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

  const learnerGrade: string =
    learner?.class_label || learner?.classLabel || learner?.grade || '';

  const admissionCode: string =
    learner?.admission_code || learner?.admissionCode || '';

  const learnerPhoto: string =
    (learnerProfileFromOrg && (learnerProfileFromOrg.photo_url || learnerProfileFromOrg.photoUrl)) ||
    (learnerProfileFromShop && (learnerProfileFromShop.photo_url || learnerProfileFromShop.photoUrl)) ||
    learner?.photo_url ||
    learner?.photoUrl ||
    '';

  const learnerInitial = (learnerName || 'L').trim().charAt(0).toUpperCase();

  // ─────────────────────────────────────────────
  // Statement query (reuses your existing API route)
  // ─────────────────────────────────────────────
 const statementQ = useQuery({
  queryKey: ['org-my-fee-statement', orgId],
  enabled: !!backendUrl && !!orgToken && !!orgId && isProTier, // keep your plan gating if you want
  queryFn: async () => {
    return apiGetMyFeeStatement(backendUrl, String(orgId), orgToken);
  },
});


  const statement: any = statementQ.data || null;

  const currency = pickString(
    statement?.currency,
    statement?.balances?.currency,
    statement?.structure?.currency,
    'USD',
  );

  // Totals (support multiple shapes)
  const billedCents = pickNumber(
  statement?.summary?.total_charges,
  statement?.summary?.billed_cents,
  statement?.summary?.billedCents,
  statement?.charges_total_cents,
  statement?.chargesTotalCents,
);

const paidCents = pickNumber(
  statement?.summary?.total_payments,
  statement?.summary?.paid_cents,
  statement?.summary?.paidCents,
  statement?.payments_total_cents,
  statement?.paymentsTotalCents,
);

const balanceCents = pickNumber(
  statement?.summary?.balance,
  statement?.summary?.balance_cents,
  statement?.summary?.balanceCents,
  statement?.balance_cents,
  statement?.balanceCents,
  billedCents - paidCents,
);


  const charges = pickArray(statement?.charges, statement?.items?.charges, statement?.statement?.charges);
  const payments = pickArray(statement?.payments, statement?.items?.payments, statement?.statement?.payments);

  // ─────────────────────────────────────────────
  // Download PDF (endpoint may need to match your backend)
  // ─────────────────────────────────────────────
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);

  const downloadPdf = React.useCallback(async () => {
    setDownloadError(null);

    if (!backendUrl || !orgToken || !orgId || !learnerStudentId) return;

    setDownloading(true);
    try {
      const base = String(backendUrl).replace(/\/+$/, '');

     
      const blob = await apiDownloadMyFeeStatementPdf(backendUrl, String(orgId), orgToken);
      const blobUrl = URL.createObjectURL(blob);

      const safeOrg = sanitizeFilenamePart(org?.name || 'org');
      const safeAdm = sanitizeFilenamePart(admissionCode || learnerStudentId);
      const filename = `fee-statement-${safeOrg}-${safeAdm}.pdf`;

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (e: any) {
      const msg =
        e?.response?.status === 404
          ? 'PDF download route not found (404). Confirm the backend fee statement PDF endpoint path.'
          : e?.response?.data?.message ||
            e?.message ||
            'Failed to download PDF.';
      setDownloadError(String(msg));
    } finally {
      setDownloading(false);
    }
  }, [backendUrl, orgToken, orgId, learnerStudentId, org?.name, admissionCode]);

  // ─────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────
  const portalLabel = role ? `${String(role).toUpperCase()} PORTAL` : 'LEARNER PORTAL';
  const planLabel = org?.tier ? String(org.tier).toUpperCase() : 'STARTER';

  return (
    <div className="min-h-screen bg-[#0b1220] text-white px-3 sm:px-4 py-6">
      <div className="max-w-screen-lg mx-auto space-y-4">
        {/* Header */}
        <header className={`${card} flex items-start justify-between gap-3`}>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/60">
              {portalLabel} • FEES
            </div>
            <h1 className="text-xl sm:text-2xl font-bold truncate mt-0.5">
              {org?.name || 'Your Institution'}
            </h1>
            <div className="text-xs text-white/60 mt-1">{planLabel} plan</div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <Link
              to="/org/learn"
              className="text-[11px] sm:text-xs px-3 py-1.5 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-white/80 font-medium transition"
            >
              ← Back
            </Link>
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
              <p className="text-[11px] uppercase tracking-[0.16em] text-white/60">Fee statement for</p>

              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <div className="text-base sm:text-lg font-semibold truncate">{learnerName}</div>

                {learnerGrade ? (
                  <span className="text-[11px] sm:text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-200 border border-emerald-400/30">
                    Grade / Class: {learnerGrade}
                  </span>
                ) : null}
              </div>

              <div className="mt-2 space-y-0.5 text-xs text-white/70">
                <div className="flex flex-wrap gap-1 items-baseline">
                  <span className="opacity-80">📧 Email:</span>
                  <span className="font-mono break-all">
                    {learnerEmail || 'No email on file yet – ask your teacher to update it.'}
                  </span>
                </div>

                {admissionCode ? (
                  <div className="flex flex-wrap gap-1 items-baseline">
                    <span className="opacity-80">🆔 Admission No:</span>
                    <span className="font-mono">{admissionCode}</span>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-1 items-baseline">
                  <span className="opacity-80">Student ID:</span>
                  <span className="font-mono">{learnerStudentId || '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pro gating */}
        {!isProTier ? (
          <section className={card}>
            <div className="rounded-xl border border-amber-500/30 bg-amber-900/20 p-3 text-sm text-amber-100">
              This institution’s fees module is available on <b>Pro/Enterprise</b>. If you need fee
              statements here, ask your admin.
            </div>
          </section>
        ) : !learnerStudentId ? (
          <section className={card}>
            <div className="rounded-xl border border-rose-500/30 bg-rose-900/20 p-3 text-sm text-rose-100">
              Could not determine your student ID. Please sign out and use the correct learner login
              card (or open this page with <span className="font-mono">?studentId=...</span>).
            </div>
          </section>
        ) : statementQ.isLoading ? (
          <section className={card}>
            <div className="text-sm text-white/70">Loading your fee statement…</div>
          </section>
        ) : statementQ.error ? (
          <section className={card}>
            <div className="rounded-xl border border-rose-500/30 bg-rose-900/20 p-3 text-sm text-rose-100">
              Could not load fee statement.{' '}
              <span className="text-white/70">
                {String((statementQ.error as any)?.message || statementQ.error)}
              </span>
            </div>
          </section>
        ) : !statement ? (
          <section className={card}>
            <div className="text-sm text-white/70">
              No fee statement is available yet. Please ask the school office.
            </div>
          </section>
        ) : (
          <>
            {/* Summary */}
            <section className={card}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Statement summary</h2>
                  <p className="text-sm text-white/70">
                    Totals are based on charges and payments recorded by the school.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => statementQ.refetch()}
                    className="text-[11px] sm:text-xs px-3 py-1.5 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-white/80 font-medium transition"
                  >
                    Refresh
                  </button>

                  <button
                    type="button"
                    onClick={downloadPdf}
                    disabled={downloading}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl font-semibold text-sm transition ${
                      downloading
                        ? 'bg-emerald-600/50 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-500'
                    }`}
                  >
                    {downloading ? 'Preparing…' : '⬇️ Download PDF'}
                  </button>
                </div>
              </div>

              {downloadError ? (
                <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-900/20 p-3 text-sm text-rose-100">
                  {downloadError}
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-xs text-white/60">Total billed</div>
                  <div className="text-lg font-bold">{moneyFromCents(billedCents, currency)}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-xs text-white/60">Total paid</div>
                  <div className="text-lg font-bold">{moneyFromCents(paidCents, currency)}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-xs text-white/60">Balance</div>
                  <div className="text-lg font-bold">{moneyFromCents(balanceCents, currency)}</div>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-white/50">
                If anything looks wrong, contact the school office. Learners can only view their own statement.
              </p>
            </section>

            {/* Charges */}
            <section className={card}>
              <h3 className="text-base font-semibold">Recent charges</h3>
              {charges.length ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                  <div className="divide-y divide-white/10">
                    {charges.slice(0, 12).map((c: any, idx: number) => {
                      const desc = pickString(c?.description, c?.label, c?.name, 'Charge');
                      const date = pickString(c?.due_date, c?.date, c?.created_at, '');
                      const amt = pickNumber(c?.amount_cents, c?.amountCents, c?.amount, 0);
                      return (
                        <div
                          key={c?.id ?? `${desc}-${idx}`}
                          className="px-3 py-2 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-sm text-white/85 truncate">{desc}</div>
                            {date ? (
                              <div className="text-[11px] text-white/50">{date}</div>
                            ) : null}
                          </div>
                          <div className="text-sm font-semibold">{moneyFromCents(amt, currency)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-white/70">No charges recorded yet.</p>
              )}
            </section>

            {/* Payments */}
            <section className={card}>
              <h3 className="text-base font-semibold">Recent payments</h3>
              {payments.length ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                  <div className="divide-y divide-white/10">
                    {payments.slice(0, 12).map((p: any, idx: number) => {
                      const method = pickString(p?.method, p?.payment_method, p?.channel, '');
                      const title = method ? `Payment (${method})` : 'Payment';
                      const date = pickString(p?.date, p?.created_at, '');
                      const amt = pickNumber(p?.amount_cents, p?.amountCents, p?.amount, 0);
                      return (
                        <div
                          key={p?.id ?? `${title}-${idx}`}
                          className="px-3 py-2 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-sm text-white/85 truncate">{title}</div>
                            {date ? (
                              <div className="text-[11px] text-white/50">{date}</div>
                            ) : null}
                          </div>
                          <div className="text-sm font-semibold">{moneyFromCents(amt, currency)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-white/70">No payments recorded yet.</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default OrgLearnerFeesPage;
