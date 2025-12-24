// apps/web/src/pages/org/OrgLearnerFees.web.tsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { useShopContext } from '@mytutorapp/shared/context';
import {
  apiGetMyFeeStatement,
  apiDownloadMyFeeStatementPdf,
  apiGetMyFeeStructure, // ✅ ADD
  apiDownloadMyFeeStructurePdf, // ✅ ADD
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
  // View switch (Statement vs Fee Structure)
  // ─────────────────────────────────────────────
  const [view, setView] = React.useState<'statement' | 'structure'>('statement');

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

  const learnerGrade: string = learner?.class_label || learner?.classLabel || learner?.grade || '';

  const admissionCode: string = learner?.admission_code || learner?.admissionCode || '';

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
    enabled: !!backendUrl && !!orgToken && !!orgId && isProTier,
    queryFn: async () => apiGetMyFeeStatement(backendUrl, String(orgId), orgToken),
  });

  const statement: any = statementQ.data || null;

  // ✅ Prefer backend summary_by_currency (supports multi-currency)
  const summaryBy = pickArray(statement?.summary_by_currency, statement?.summaryByCurrency, []);
  const summary0 = summaryBy?.[0] || null;

  // ✅ Primary currency for top summary cards (single-currency UX)
  const primaryCurrency = pickString(
    statement?.summary?.currency,
    statement?.currency,
    summary0?.currency,
    'KES',
  );

  // ✅ Totals (prefer backend summary; fall back to summary_by_currency[0]; then other shapes)
  const billedCents = pickNumber(
    statement?.summary?.total_charges,
    summary0?.total_charges,
    statement?.summary?.billed_cents,
    statement?.summary?.billedCents,
    statement?.charges_total_cents,
    statement?.chargesTotalCents,
  );

  const paidCents = pickNumber(
    statement?.summary?.total_payments,
    summary0?.total_payments,
    statement?.summary?.paid_cents,
    statement?.summary?.paidCents,
    statement?.payments_total_cents,
    statement?.paymentsTotalCents,
  );

  const balanceCents = pickNumber(
    statement?.summary?.balance,
    summary0?.balance,
    statement?.summary?.balance_cents,
    statement?.summary?.balanceCents,
    statement?.balance_cents,
    statement?.balanceCents,
    billedCents - paidCents,
  );

  const charges = pickArray(statement?.charges, statement?.items?.charges, statement?.statement?.charges);
  const payments = pickArray(statement?.payments, statement?.items?.payments, statement?.statement?.payments);

  // ─────────────────────────────────────────────
  // Structure query
  // ─────────────────────────────────────────────
  const structureQ = useQuery({
    queryKey: ['org-my-fee-structure', orgId],
    enabled: !!backendUrl && !!orgToken && !!orgId && isProTier,
    queryFn: async () => apiGetMyFeeStructure(backendUrl, String(orgId), orgToken),
  });

  const structure: any = structureQ.data || null;

  const structureItems = pickArray(structure?.items, structure?.structure?.items, []);
  const structureTitle = pickString(structure?.title, structure?.structure?.title, 'Fee structure');
  const structureTerm = pickString(structure?.effective_term, structure?.effectiveTerm, '');
  const structureDesc = pickString(structure?.description, structure?.note, '');
  const structureScopeType = pickString(structure?.scope_type, structure?.scopeType, '');
  const structureScopeValue = pickString(structure?.scope_value, structure?.scopeValue, '');

  const structureTotalCents = React.useMemo(() => {
    return (structureItems || []).reduce((acc: number, it: any) => {
      const amt = pickNumber(it?.amount_cents, it?.amountCents, it?.amount, 0);
      return acc + amt;
    }, 0);
  }, [structureItems]);

  const structureCurrency = pickString(
    structure?.currency,
    structure?.structure?.currency,
    structureItems?.[0]?.currency,
    'KES',
  );

  // ─────────────────────────────────────────────
  // Download Statement PDF
  // ─────────────────────────────────────────────
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);

  const downloadPdf = React.useCallback(async () => {
    setDownloadError(null);

    if (!backendUrl || !orgToken || !orgId || !learnerStudentId) return;

    setDownloading(true);
    try {
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
          : e?.response?.data?.message || e?.message || 'Failed to download PDF.';
      setDownloadError(String(msg));
    } finally {
      setDownloading(false);
    }
  }, [backendUrl, orgToken, orgId, learnerStudentId, org?.name, admissionCode]);

  // ─────────────────────────────────────────────
  // Download Structure PDF
  // ─────────────────────────────────────────────
  const [downloadingStructure, setDownloadingStructure] = React.useState(false);
  const [downloadStructureError, setDownloadStructureError] = React.useState<string | null>(null);

  const downloadStructurePdf = React.useCallback(async () => {
    setDownloadStructureError(null);
    if (!backendUrl || !orgToken || !orgId) return;

    setDownloadingStructure(true);
    try {
      const blob = await apiDownloadMyFeeStructurePdf(backendUrl, String(orgId), orgToken);
      const blobUrl = URL.createObjectURL(blob);

      const safeOrg = sanitizeFilenamePart(org?.name || 'org');
      const safeAdm = sanitizeFilenamePart(admissionCode || learnerStudentId || 'learner');
      const filename = `fee-structure-${safeOrg}-${safeAdm}.pdf`;

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
          ? 'Structure PDF route not found (404). Confirm /fees/learner/structure.pdf exists.'
          : e?.response?.data?.message || e?.message || 'Failed to download structure PDF.';
      setDownloadStructureError(String(msg));
    } finally {
      setDownloadingStructure(false);
    }
  }, [backendUrl, orgToken, orgId, org?.name, admissionCode, learnerStudentId]);

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

        {/* Switcher */}
        <section className={card}>
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex rounded-full border border-white/15 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setView('statement')}
                className={`px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold transition ${
                  view === 'statement' ? 'bg-white text-[#0b1220]' : 'text-white/80 hover:bg-white/10'
                }`}
              >
                Statement
              </button>
              <button
                type="button"
                onClick={() => setView('structure')}
                className={`px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold transition ${
                  view === 'structure' ? 'bg-white text-[#0b1220]' : 'text-white/80 hover:bg-white/10'
                }`}
              >
                Fee structure
              </button>
            </div>

            <div className="text-[11px] text-white/60">
              {view === 'statement' ? 'Your history' : 'Official breakdown'}
            </div>
          </div>

          <p className="mt-2 text-sm text-white/70">
            {view === 'statement'
              ? 'This shows charges and payments recorded by the school.'
              : 'This shows the school’s current fee breakdown for your class/grade.'}
          </p>
        </section>

        {/* Pro gating */}
        {!isProTier ? (
          <section className={card}>
            <div className="rounded-xl border border-amber-500/30 bg-amber-900/20 p-3 text-sm text-amber-100">
              This institution’s fees module is available on <b>Pro/Enterprise</b>. If you need fee
              details here, ask your admin.
            </div>
          </section>
        ) : !learnerStudentId ? (
          <section className={card}>
            <div className="rounded-xl border border-rose-500/30 bg-rose-900/20 p-3 text-sm text-rose-100">
              Could not determine your student ID. Please sign out and use the correct learner login
              card (or open this page with <span className="font-mono">?studentId=...</span>).
            </div>
          </section>
        ) : view === 'structure' ? (
          <>
            {/* STRUCTURE VIEW */}
            {structureQ.isLoading ? (
              <section className={card}>
                <div className="text-sm text-white/70">Loading fee structure…</div>
              </section>
            ) : structureQ.error ? (
              <section className={card}>
                <div className="rounded-xl border border-rose-500/30 bg-rose-900/20 p-3 text-sm text-rose-100">
                  Could not load fee structure.{' '}
                  <span className="text-white/70">
                    {String((structureQ.error as any)?.message || structureQ.error)}
                  </span>
                </div>
              </section>
            ) : !structure || (!structureItems?.length && !structure?.title) ? (
              <section className={card}>
                <div className="text-sm text-white/70">
                  No fee structure has been published for your class yet. Please ask the school
                  office.
                </div>
              </section>
            ) : (
              <section className={card}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold truncate">{structureTitle}</h2>

                    <div className="mt-1 text-xs text-white/60 space-y-1">
                      {structureTerm ? (
                        <div>
                          Term: <span className="text-white/80">{structureTerm}</span>
                        </div>
                      ) : null}

                      {structureScopeType || structureScopeValue ? (
                        <div>
                          Applies to:{' '}
                          <span className="text-white/80">
                            {structureScopeType ? structureScopeType.toUpperCase() : 'SCOPE'}{' '}
                            {structureScopeValue ? `• ${structureScopeValue}` : ''}
                          </span>
                        </div>
                      ) : null}

                      {structureDesc ? <div className="text-white/60">{structureDesc}</div> : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => structureQ.refetch()}
                      className="text-[11px] sm:text-xs px-3 py-1.5 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-white/80 font-medium transition"
                    >
                      Refresh
                    </button>

                    <button
                      type="button"
                      onClick={downloadStructurePdf}
                      disabled={downloadingStructure}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl font-semibold text-sm transition ${
                        downloadingStructure
                          ? 'bg-sky-600/50 cursor-not-allowed'
                          : 'bg-sky-600 hover:bg-sky-500'
                      }`}
                    >
                      {downloadingStructure ? 'Preparing…' : '⬇️ Structure PDF'}
                    </button>
                  </div>
                </div>

                {downloadStructureError ? (
                  <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-900/20 p-3 text-sm text-rose-100">
                    {downloadStructureError}
                  </div>
                ) : null}

                {/* Total */}
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:col-span-1">
                    <div className="text-xs text-white/60">Total</div>
                    <div className="text-lg font-bold">
                      {moneyFromCents(structureTotalCents, structureCurrency)}
                    </div>
                    <div className="mt-1 text-[11px] text-white/50">Optional items may not be required.</div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden sm:col-span-2">
                    <div className="px-3 py-2 text-xs text-white/60 border-b border-white/10">
                      Breakdown
                    </div>
                    <div className="divide-y divide-white/10">
                      {structureItems.map((it: any, idx: number) => {
                        const label = pickString(it?.label, it?.name, `Item ${idx + 1}`);
                        const amt = pickNumber(it?.amount_cents, it?.amountCents, it?.amount, 0);
                        const cur = pickString(it?.currency, structureCurrency);
                        const cadence = pickString(it?.cadence, '');
                        const isOpt = Boolean(it?.is_optional ?? it?.isOptional);

                        return (
                          <div
                            key={it?.id ?? `${label}-${idx}`}
                            className="px-3 py-2 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="text-sm text-white/85 truncate">{label}</div>
                              <div className="text-[11px] text-white/50">
                                {cadence ? cadence : '—'} {isOpt ? '• Optional' : '• Required'}
                              </div>
                            </div>
                            <div className="text-sm font-semibold">{moneyFromCents(amt, cur)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-[11px] text-white/50">
                  Tip: “Fee structure” is the published plan. Your “Statement” reflects what has actually
                  been billed/paid.
                </p>
              </section>
            )}
          </>
        ) : (
          <>
            {/* STATEMENT VIEW (your existing UI unchanged) */}
            {statementQ.isLoading ? (
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

                  {summaryBy.length > 1 ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {summaryBy.map((r: any) => (
                        <div key={r.currency} className="rounded-xl border border-white/10 bg-white/5 p-3">
                          <div className="text-xs text-white/60">
                            {String(r.currency || '').toUpperCase()}
                          </div>
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

                  <p className="mt-3 text-[11px] text-white/50">
                    If anything looks wrong, contact the school office. Learners can only view their own
                    statement.
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

                          // ✅ row currency: use backend row currency first
                          const rowCur = pickString(c?.currency, primaryCurrency);

                          return (
                            <div
                              key={c?.id ?? `${desc}-${idx}`}
                              className="px-3 py-2 flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <div className="text-sm text-white/85 truncate">{desc}</div>
                                {date ? <div className="text-[11px] text-white/50">{date}</div> : null}
                              </div>
                              <div className="text-sm font-semibold">{moneyFromCents(amt, rowCur)}</div>
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
                          const date = pickString(p?.date, p?.received_at, p?.created_at, '');
                          const amt = pickNumber(p?.amount_cents, p?.amountCents, p?.amount, 0);

                          // ✅ row currency: use backend row currency first
                          const rowCur = pickString(p?.currency, primaryCurrency);

                          return (
                            <div
                              key={p?.id ?? `${title}-${idx}`}
                              className="px-3 py-2 flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <div className="text-sm text-white/85 truncate">{title}</div>
                                {date ? <div className="text-[11px] text-white/50">{date}</div> : null}
                              </div>
                              <div className="text-sm font-semibold">{moneyFromCents(amt, rowCur)}</div>
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
          </>
        )}
      </div>
    </div>
  );
};

export default OrgLearnerFeesPage;
