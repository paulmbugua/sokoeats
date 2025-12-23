import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useOrgFeeInbound } from '@mytutorapp/shared/hooks/useOrgFeeInbound';

import { useShopContext } from '@mytutorapp/shared/context';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { getOrgRoster } from '@mytutorapp/shared/api/orgApi';
import { useOrgFeeStructures } from '@mytutorapp/shared/hooks/useOrgFeeStructures';
import { useOrgFeeBalances } from '@mytutorapp/shared/hooks/useOrgFeeBalances';
import { useOrgFeeStatement } from '@mytutorapp/shared/hooks/useOrgFeeStatement';
import type { FeeStructure, FeeStructureItem } from '@mytutorapp/shared/types';

import {
  calcTotalsPerCurrency,
  cn,
  emptyItem,
  LearnerLite,
  maxCurrencyValue,
  moneyFromCents,
  pickAdmissionCode,
  pickFeeLearnerRef,
  pickLearnerName,
  PROD_BASE,
  toCents,
} from './OrgFees.shared';

import { CopyRow, EmptyState, Badge, MoneyStack, SectionCard } from './OrgFees.ui';

import {
  ResponsiveChargeModal,
  ResponsivePaymentModal,
  StatementModal,
  UnmatchedPaymentsModal,
} from './OrgFees.modals';

function renderUpgradeCta(upgradeCta: any) {
  if (!upgradeCta) return null;

  if (React.isValidElement(upgradeCta)) return upgradeCta;
  if (typeof upgradeCta === 'string' || typeof upgradeCta === 'number') {
    return <div className="mt-4 text-sm text-slate-700 dark:text-slate-200">{upgradeCta}</div>;
  }

  if (typeof upgradeCta === 'object') {
    const headline = String(upgradeCta.headline || upgradeCta.title || 'Upgrade required');
    const body = String(upgradeCta.body || upgradeCta.message || 'Upgrade to Pro to use this feature.');

    const actionNode = React.isValidElement(upgradeCta.action) ? upgradeCta.action : null;
    const href = String(upgradeCta.href || upgradeCta.link || '/org/billing');
    const ctaLabel = String(upgradeCta.ctaLabel || upgradeCta.label || 'Upgrade');

    return (
      <EmptyState
        title={headline}
        body={body}
        action={
          actionNode || (
            <Link className="text-blue-600 underline" to={href}>
              {ctaLabel}
            </Link>
          )
        }
      />
    );
  }

  return (
    <pre className="mt-4 rounded-xl bg-slate-100 p-3 text-xs dark:bg-slate-800">
      {JSON.stringify(upgradeCta, null, 2)}
    </pre>
  );
}

const OrgFeesPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [learnerPage, setLearnerPage] = useState(1);
  const [learnerPageSize, setLearnerPageSize] = useState(10);

  const { backendUrl, orgToken } = useShopContext() as any;
  const { isPro, upgradeCta, org, activeOrgId } = useOrgProTools() as any;
  const orgId: string | undefined = activeOrgId || org?.id;

  const mode = useMemo<'none' | 'charge' | 'payment' | 'statement' | 'print'>(() => {
    const p = location.pathname;
    if (p.endsWith('/charge/new')) return 'charge';
    if (p.endsWith('/payment/new')) return 'payment';
    if (p.endsWith('/statement')) return 'statement';
    if (p.endsWith('/print')) return 'print';
    return 'none';
  }, [location.pathname]);

  const selectedLearnerId = searchParams.get('learnerId') || '';
  const closeToHome = () => navigate('/org/fees');

  const rosterQuery = useQuery({
    queryKey: ['orgRoster', backendUrl, orgId, orgToken],
    enabled: Boolean(backendUrl && orgId && orgToken),
    queryFn: async () => {
      /** ✅ FIX: treat roster response as any so we can safely fallback to .items */
      const raw = (await getOrgRoster(backendUrl, orgToken as string, orgId as string)) as any;
      const learnersRaw = (raw?.learners ?? raw?.items ?? []) as any[];
      const learners: LearnerLite[] = Array.isArray(learnersRaw) ? (learnersRaw as LearnerLite[]) : [];
      return { raw, learners };
    },
    staleTime: 30_000,
  });

  const learners: LearnerLite[] = rosterQuery.data?.learners || [];

  const classLabels = useMemo(() => {
    const s = new Set<string>();
    for (const l of learners) {
      const c = String(l.class_label || '').trim();
      if (c) s.add(c);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [learners]);

  const {
    structures,
    loading: structuresLoading,
    saving: structuresSaving,
    fetchStructures,
    saveStructure,
    editStructure,
    activateStructure,
    downloadStructurePdf,
  } = useOrgFeeStructures({ backendUrl, token: orgToken, orgId });

  const { balances, loading: balancesLoading, fetchBalances } = useOrgFeeBalances({
    backendUrl,
    token: orgToken,
    orgId,
  });

  const {
    charges,
    payments,
    summary,
    loading: statementLoading,
    fetchStatement,
    addCharge,
    addBulkCharges,
    addPayment,
    downloadStatementPdf,
  } = useOrgFeeStatement({ backendUrl, token: orgToken, orgId });

  const [structureForm, setStructureForm] = useState({
    title: '',
    description: '',
    currency: 'USD',
    effective_term: '',
    scopeType: 'class',
    scopeValue: '',
  });
  const [structureItems, setStructureItems] = useState<FeeStructureItem[]>([emptyItem()]);
  const [selectedStructureId, setSelectedStructureId] = useState<number | null>(null);

  const { rows: inboundUnmatched, loading: inboundLoading, fetchUnmatched, attachToLearner } =
    useOrgFeeInbound({ backendUrl, token: orgToken, orgId });

  const [unmatchedOpen, setUnmatchedOpen] = useState(false);

  useEffect(() => {
    if (backendUrl && orgId && orgToken && isPro) {
      fetchStructures();
      fetchBalances();
    }
  }, [backendUrl, orgId, orgToken, fetchStructures, fetchBalances, isPro]);

  useEffect(() => {
    if (selectedLearnerId && (mode === 'statement' || mode === 'print')) {
      fetchStatement(selectedLearnerId);
    }
  }, [selectedLearnerId, mode, fetchStatement]);

  useEffect(() => {
    if (!structures?.length) return;
    const active = structures.find((s: any) => s.is_active) || structures[0];
    setSelectedStructureId((prev) => prev ?? active.id);
  }, [structures]);

  useEffect(() => {
    if (!selectedStructureId) return;
    const s = (structures || []).find((x: any) => x.id === selectedStructureId);
    if (!s) return;

    setStructureForm({
      title: s.title || '',
      description: (s.description || '').replace(/\s+\|\s+Scope:.+$/, ''),
      currency: s.currency || 'USD',
      effective_term: s.effective_term || '',
      scopeType: 'class',
      scopeValue: (s.description || '').includes('Scope:')
        ? (s.description || '').split('Scope:')[1]?.trim() || ''
        : '',
    });

    setStructureItems(
      ((s.items || []) as FeeStructureItem[]).map((it, idx) => ({
        ...it,
        id: it.id || idx + 1,
        sort_order: it.sort_order ?? idx,
        currency: it.currency || s.currency || 'USD',
      })) || [emptyItem()],
    );
  }, [selectedStructureId, structures]);

  const mergedRows = useMemo(() => {
    const byLearner = new Map<string, any>();
    for (const b of balances || []) byLearner.set(String(b.learner_id), b);

    return learners.map((l) => {
      const feeLearnerId = pickFeeLearnerRef(l); // used for API calls
      const admission = pickAdmissionCode(l); // shown to humans
      const b = byLearner.get(String(feeLearnerId)) || { currencies: [] };

      return {
        learner: l,
        feeLearnerId,
        admission_code: admission,
        name: pickLearnerName(l),
        class_label: l.class_label || '',
        currencies: Array.isArray(b.currencies) ? b.currencies : [],
      };
    });
  }, [learners, balances]);

  const [q, setQ] = useState('');
  const [classFilter, setClassFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return mergedRows
      .filter((r) => {
        if (classFilter !== 'all' && String(r.class_label || '') !== classFilter) return false;
        if (!query) return true;

        return (
          String(r.name).toLowerCase().includes(query) ||
          String(r.feeLearnerId).toLowerCase().includes(query) ||
          String(r.class_label || '').toLowerCase().includes(query) ||
          String(r.admission_code || '').toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const aMax = Math.max(0, ...(a.currencies || []).map((x: any) => Number(x?.balance || 0)));
        const bMax = Math.max(0, ...(b.currencies || []).map((x: any) => Number(x?.balance || 0)));
        return bMax - aMax;
      });
  }, [mergedRows, q, classFilter]);

  const totalLearnerPages = useMemo(() => {
    if (!filtered.length) return 1;
    return Math.max(1, Math.ceil(filtered.length / learnerPageSize));
  }, [filtered.length, learnerPageSize]);

  const paginatedFiltered = useMemo(() => {
    const start = (learnerPage - 1) * learnerPageSize;
    return filtered.slice(start, start + learnerPageSize);
  }, [filtered, learnerPage, learnerPageSize]);

  useEffect(() => {
    // reset to first page when filters change
    setLearnerPage(1);
  }, [q, classFilter]);

  useEffect(() => {
    if (learnerPage > totalLearnerPages) setLearnerPage(totalLearnerPages);
  }, [learnerPage, totalLearnerPages]);

  const learnerRangeText = useMemo(() => {
    if (!filtered.length) return 'No learners found';
    const start = (learnerPage - 1) * learnerPageSize + 1;
    const end = Math.min(learnerPage * learnerPageSize, filtered.length);
    return `Showing ${start}–${end} of ${filtered.length} learners`;
  }, [filtered.length, learnerPage, learnerPageSize]);

  const totalStructure = useMemo(
    () => structureItems.reduce((acc, item) => acc + Number(item.amount_cents || 0), 0),
    [structureItems],
  );

  const handleSaveStructure = async () => {
    const payload = {
      title: structureForm.title,
      description: [
        structureForm.description,
        structureForm.scopeValue ? `Scope: ${structureForm.scopeType} ${structureForm.scopeValue}` : '',
      ]
        .filter(Boolean)
        .join(' | '),
      currency: structureForm.currency,
      effective_term: structureForm.effective_term || null,
      items: structureItems
        .filter((i) => i.label && i.amount_cents > 0)
        .map((item, idx) => ({
          label: item.label,
          amount_cents: item.amount_cents,
          currency: item.currency || structureForm.currency,
          cadence: item.cadence || null,
          is_optional: item.is_optional ?? false,
          sort_order: idx,
          metadata: (item as any).metadata || {},
        })),
    } as Partial<FeeStructure>;

    if (selectedStructureId) {
      await editStructure(selectedStructureId, payload);
    } else {
      const created = await saveStructure(payload);
      if (created?.id) setSelectedStructureId(created.id);
    }
    fetchStructures();
  };

  const handleActivateStructure = async (structureId?: number | null) => {
    if (!structureId) return;
    await activateStructure(structureId);
    fetchStructures();
  };

  const openCharge = (learnerId?: string) => {
    navigate('/org/fees/charge/new' + (learnerId ? `?learnerId=${encodeURIComponent(learnerId)}` : ''));
  };

  const openPayment = (learnerId?: string) => {
    navigate('/org/fees/payment/new' + (learnerId ? `?learnerId=${encodeURIComponent(learnerId)}` : ''));
  };

  const openStatement = (learnerId: string) => {
    navigate(`/org/fees/statement?learnerId=${encodeURIComponent(learnerId)}`);
  };

  const openPrint = (learnerId: string) => {
    navigate(`/org/fees/print?learnerId=${encodeURIComponent(learnerId)}`);
  };

  /** ✅ Load unmatched list when modal opens */
  useEffect(() => {
    if (unmatchedOpen) {
      fetchUnmatched();
    }
  }, [unmatchedOpen, fetchUnmatched]);

  if (!isPro) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <h1 className="text-2xl font-semibold">Fees</h1>
        <p className="text-sm text-slate-500">Upgrade to Pro to manage org fee structures and balances.</p>
        {renderUpgradeCta(upgradeCta)}
      </div>
    );
  }

  // ---------------- PRINT VIEW (kept as-is) ----------------
  if (mode === 'print') {
    const learner = learners.find((l) => pickFeeLearnerRef(l) === selectedLearnerId);
    const learnerName = learner ? pickLearnerName(learner) : selectedLearnerId || 'Learner';

    const totals = calcTotalsPerCurrency(charges || [], payments || []);
    const chargeRows = totals.map((t) => ({ currency: t.currency, value: t.charges }));
    const paymentRows = totals.map((t) => ({ currency: t.currency, value: t.payments }));
    const balanceRows = totals.map((t) => ({ currency: t.currency, value: t.balance }));

    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <div className="flex items-center justify-between print:hidden">
          <button
            type="button"
            onClick={() =>
              navigate('/org/fees' + (selectedLearnerId ? `?learnerId=${encodeURIComponent(selectedLearnerId)}` : ''))
            }
            className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Back
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => downloadStatementPdf(selectedLearnerId, 'statement.pdf')}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Download PDF
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              Print
            </button>
          </div>
        </div>

        {!selectedLearnerId ? (
          <EmptyState
            title="Pick a learner to print"
            body="Open a statement first, then click Print."
            action={
              <Link className="text-blue-600 underline" to="/org/fees">
                Go to Fees
              </Link>
            }
          />
        ) : statementLoading ? (
          <div className="text-sm text-slate-500">Loading statement…</div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-lg font-semibold">Fee Statement</div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {org?.name || 'Organization'} • {learnerName}
                </div>
                <div className="text-xs text-slate-500">
                  Learner ID: <span className="font-mono">{selectedLearnerId}</span>
                </div>
              </div>
              <div className="text-left text-xs text-slate-500 sm:text-right">Generated: {new Date().toLocaleString()}</div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-slate-500">Total charges</div>
                <div className="mt-2">
                  <MoneyStack rows={chargeRows} />
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-slate-500">Total payments</div>
                <div className="mt-2">
                  <MoneyStack rows={paymentRows} />
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-slate-500">Balance</div>
                <div className="mt-2">
                  <MoneyStack rows={balanceRows} />
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <div className="mb-2 text-sm font-semibold">Charges</div>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(charges || []).map((c: any) => (
                        <tr key={`c-${c.id}`} className="border-t border-slate-200 dark:border-slate-800">
                          <td className="px-3 py-2">{c.created_at ? new Date(c.created_at).toLocaleDateString() : '-'}</td>
                          <td className="px-3 py-2">{c.description || 'Fee'}</td>
                          <td className="px-3 py-2 text-right">{moneyFromCents(Number(c.amount_cents || 0), c.currency)}</td>
                        </tr>
                      ))}
                      {(!charges || charges.length === 0) && (
                        <tr>
                          <td className="px-3 py-3 text-slate-500" colSpan={3}>
                            No charges yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold">Payments</div>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left">Received</th>
                        <th className="px-3 py-2 text-left">Method</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(payments || []).map((p: any) => (
                        <tr key={`p-${p.id}`} className="border-t border-slate-200 dark:border-slate-800">
                          <td className="px-3 py-2">
                            {p.received_at
                              ? new Date(p.received_at).toLocaleString()
                              : p.created_at
                                ? new Date(p.created_at).toLocaleString()
                                : '-'}
                          </td>
                          <td className="px-3 py-2">{p.method || '-'}</td>
                          <td className="px-3 py-2 text-right">{moneyFromCents(Number(p.amount_cents || 0), p.currency)}</td>
                        </tr>
                      ))}
                      {(!payments || payments.length === 0) && (
                        <tr>
                          <td className="px-3 py-3 text-slate-500" colSpan={3}>
                            No payments yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="mt-4 text-[11px] text-slate-500">Note: Totals above are computed per currency from line items.</div>
          </div>
        )}
      </div>
    );
  }

  // ---------------- MAIN PAGE ----------------
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:py-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-blue-500">Org tools</p>
          <h1 className="text-2xl font-semibold">Fees & balances</h1>
          <p className="text-sm text-slate-500 dark:text-slate-300">
            Build fee structures, create charges, record payments, and generate printable statements.
          </p>
        </div>
      </div>

     <SectionCard
  title="Payment callback URLs (share with the school)"
  subtitle="Daraja will call these URLs when parents pay the PayBill. Bank integrations can post to the bank endpoint."
>
  <div className="space-y-3">
    <div className="grid gap-3 md:grid-cols-2">
      <CopyRow label="M-Pesa Daraja Validation URL" value={`${PROD_BASE}/api/fees/inbound/validate`} />
      <CopyRow label="M-Pesa Daraja Confirmation URL" value={`${PROD_BASE}/api/fees/inbound/confirm`} />
    </div>

    <CopyRow label="Bank inbound URL (for bank/partner system)" value={`${PROD_BASE}/api/fees/inbound/bank`} />

    {/* ✅ simplified admin actions */}
    <div className="mt-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">Unmatched payments</div>
          <div className="mt-1 text-slate-600 dark:text-slate-300">
            If a parent used the wrong admission number / no reference, open the unmatched list and attach it to the
            correct learner.
          </div>
        </div>

        <button
          type="button"
          onClick={async () => {
            setUnmatchedOpen(true);
            // modal also fetches on open, but keeping this makes it feel instant
            await fetchUnmatched();
          }}
          className="shrink-0 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          View unmatched
        </button>
      </div>

      <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-300">
        Tip: pick a payment, search the learner, then click <span className="font-semibold">Attach</span>.
      </div>
    </div>
  </div>
</SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Fee structure builder" subtitle="Line items, totals, and activation per scope">
          {/* ... unchanged builder UI ... */}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Title</div>
              <input
                value={structureForm.title}
                onChange={(e) => setStructureForm((f) => ({ ...f, title: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
                placeholder="e.g. Term 1 Fees"
              />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Currency</div>
              <select
                value={structureForm.currency}
                onChange={(e) => setStructureForm((f) => ({ ...f, currency: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <option value="USD">USD</option>
                <option value="KES">KES</option>
                <option value="QAR">QAR</option>
              </select>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Scope type</div>
              <select
                value={structureForm.scopeType}
                onChange={(e) => setStructureForm((f) => ({ ...f, scopeType: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <option value="class">Class</option>
                <option value="group">Group</option>
                <option value="grade">Grade</option>
                <option value="term">Term</option>
              </select>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Scope value</div>
              <input
                value={structureForm.scopeValue}
                onChange={(e) => setStructureForm((f) => ({ ...f, scopeValue: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
                placeholder="e.g. Grade 6"
              />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Effective term</div>
              <input
                value={structureForm.effective_term}
                onChange={(e) => setStructureForm((f) => ({ ...f, effective_term: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
                placeholder="e.g. 2025 Term 1"
              />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Description</div>
              <input
                value={structureForm.description}
                onChange={(e) => setStructureForm((f) => ({ ...f, description: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
                placeholder="Optional notes"
              />
            </div>
          </div>

          {/* ... rest of builder unchanged ... */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-200">
              <span>Line items</span>
              <button
                type="button"
                onClick={() => setStructureItems((prev) => [...prev, { ...emptyItem(), currency: structureForm.currency }])}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Add item
              </button>
            </div>

            <div className="space-y-2">
              {structureItems.map((item, idx) => (
                <div
                  key={`item-${idx}`}
                  className="grid gap-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800 md:grid-cols-12"
                >
                  <div className="md:col-span-4">
                    <div className="text-[11px] font-semibold text-slate-500">Label</div>
                    <input
                      value={item.label}
                      onChange={(e) =>
                        setStructureItems((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, label: e.target.value } : it)),
                        )
                      }
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
                      placeholder="Tuition"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <div className="text-[11px] font-semibold text-slate-500">Amount</div>
                    <input
                      value={(item.amount_cents / 100 || '').toString()}
                      onChange={(e) =>
                        setStructureItems((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, amount_cents: toCents(e.target.value) } : it)),
                        )
                      }
                      inputMode="decimal"
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <div className="text-[11px] font-semibold text-slate-500">Cadence</div>
                    <input
                      value={item.cadence || ''}
                      onChange={(e) =>
                        setStructureItems((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, cadence: e.target.value } : it)),
                        )
                      }
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
                      placeholder="per term"
                    />
                  </div>
                  <div className="md:col-span-2 flex flex-col justify-center gap-2 md:items-end">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(item.is_optional)}
                        onChange={(e) =>
                          setStructureItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, is_optional: e.target.checked } : it)),
                          )
                        }
                      />
                      <span className="text-xs text-slate-600 dark:text-slate-200">Optional</span>
                    </label>

                    <button
                      type="button"
                      onClick={() =>
                        setStructureItems((prev) => (prev.length === 1 ? [emptyItem()] : prev.filter((_, i) => i !== idx)))
                      }
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-500">Live total</div>
                <div className="text-lg font-semibold">{moneyFromCents(totalStructure, structureForm.currency)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={structuresSaving || !structureForm.title}
                  onClick={handleSaveStructure}
                  className={cn(
                    'rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700',
                    structuresSaving && 'opacity-60',
                  )}
                >
                  {selectedStructureId ? 'Update structure' : 'Save structure'}
                </button>
                <button
                  type="button"
                  disabled={!selectedStructureId || structuresSaving}
                  onClick={() => handleActivateStructure(selectedStructureId)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Activate
                </button>
                <button
                  type="button"
                  disabled={!selectedStructureId || structuresLoading}
                  onClick={() => selectedStructureId && downloadStructurePdf(selectedStructureId, 'fee-structure.pdf')}
                  className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Structure PDF
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Existing structures</div>
              <div className="space-y-2">
                {(structures || []).map((s: any) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedStructureId(s.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm',
                      'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800',
                      selectedStructureId === s.id &&
                        'border-blue-400 bg-blue-50/60 dark:border-blue-500/50 dark:bg-blue-900/10',
                    )}
                  >
                    <div>
                      <div className="font-semibold">{s.title}</div>
                      <div className="text-xs text-slate-500">
                        {s.description || 'No description'} • {s.currency}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {s.is_active ? <Badge tone="ok">Active</Badge> : <Badge tone="neutral">Draft</Badge>}
                      {s.effective_term ? <Badge tone="neutral">{s.effective_term}</Badge> : null}
                    </div>
                  </button>
                ))}

                {!structures?.length && !structuresLoading && (
                  <EmptyState
                    title="No fee structures yet"
                    body="Add line items and save to create your first structure."
                    action={
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStructureId(null);
                          setStructureForm({
                            title: '',
                            description: '',
                            currency: 'USD',
                            effective_term: '',
                            scopeType: 'class',
                            scopeValue: '',
                          });
                          setStructureItems([emptyItem()]);
                        }}
                        className="text-blue-600 hover:underline"
                      >
                        Start now
                      </button>
                    }
                  />
                )}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Quick actions" subtitle="Charges, payments, balances, and statements">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800">
              <div className="text-xs text-slate-500">Balances</div>
              <div className="mt-1 text-lg font-semibold">
                {balancesLoading ? 'Loading…' : `${balances?.length || 0} learners`}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => fetchBalances()}
                  className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800">
              <div className="text-xs text-slate-500">Statements</div>
              <div className="mt-1 text-lg font-semibold">Download PDFs</div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={!selectedLearnerId}
                  onClick={() => selectedLearnerId && downloadStatementPdf(selectedLearnerId, 'fee-statement.pdf')}
                  className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Statement PDF
                </button>
                <button
                  type="button"
                  disabled={!selectedLearnerId}
                  onClick={() => selectedLearnerId && openPrint(selectedLearnerId)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Print view
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800">
              <div className="text-xs text-slate-500">Charges</div>
              <div className="mt-1 text-lg font-semibold">Create per learner or bulk</div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => openCharge(selectedLearnerId || undefined)}
                  className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  New charge
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800">
              <div className="text-xs text-slate-500">Payments</div>
              <div className="mt-1 text-lg font-semibold">Record receipts</div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => openPayment(selectedLearnerId || undefined)}
                  className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600"
                >
                  Record payment
                </button>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Balances" subtitle="Search learners and open statements">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="grid gap-2 md:grid-cols-3 md:items-end">
            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Search</div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, ID, or class"
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
              />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Class filter</div>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <option value="all">All classes</option>
                {classLabels.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* ✅ Pagination + range text */}
            <div className="md:col-span-3">
              <div className="flex items-center gap-3 pt-5 text-sm text-slate-500">
                <span>{balancesLoading ? 'Refreshing balances…' : learnerRangeText}</span>

                <select
                  value={learnerPageSize}
                  onChange={(e) => setLearnerPageSize(Number(e.target.value))}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-800 dark:bg-slate-900"
                >
                  <option value={10}>10 / page</option>
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                </select>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={learnerPage <= 1}
                    onClick={() => setLearnerPage((p) => Math.max(1, p - 1))}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold disabled:opacity-60 dark:border-slate-800"
                  >
                    Prev
                  </button>

                  <span className="text-xs">
                    Page {learnerPage} / {totalLearnerPages}
                  </span>

                  <button
                    type="button"
                    disabled={learnerPage >= totalLearnerPages}
                    onClick={() => setLearnerPage((p) => Math.min(totalLearnerPages, p + 1))}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold disabled:opacity-60 dark:border-slate-800"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2 text-left">Learner</th>
                <th className="px-3 py-2 text-left">Class</th>
                <th className="px-3 py-2 text-right">Charges</th>
                <th className="px-3 py-2 text-right">Payments</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedFiltered.map((r) => {
                const feeLearnerId = r.feeLearnerId;
                const isSelected = selectedLearnerId && feeLearnerId === selectedLearnerId;

                const chargeRows = (r.currencies || []).map((x: any) => ({
                  currency: x.currency,
                  value: Number(x.charges || 0),
                }));
                const paymentRows = (r.currencies || []).map((x: any) => ({
                  currency: x.currency,
                  value: Number(x.payments || 0),
                }));
                const balanceRows = (r.currencies || []).map((x: any) => ({
                  currency: x.currency,
                  value: Number(x.balance || 0),
                }));
                const maxBal = maxCurrencyValue(balanceRows);

                return (
                  <tr
                    key={feeLearnerId}
                    className={cn(
                      'border-t border-slate-200 dark:border-slate-800',
                      isSelected && 'bg-blue-50/60 dark:bg-blue-900/10',
                    )}
                    onClick={() => setSearchParams({ learnerId: r.feeLearnerId })}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-slate-500">
                        <span className="font-mono">{r.admission_code || '—'}</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Internal: <span className="font-mono">{r.feeLearnerId}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">{r.class_label || '-'}</td>

                    {/* ✅ per-currency stacks */}
                    <td className="px-3 py-2 text-right">
                      <MoneyStack rows={chargeRows} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyStack rows={paymentRows} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Badge tone={maxBal > 0 ? 'warn' : 'ok'}>
                        <MoneyStack rows={balanceRows} />
                      </Badge>
                    </td>

                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCharge(feeLearnerId);
                          }}
                          className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          Charge
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openPayment(feeLearnerId);
                          }}
                          className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600"
                        >
                          Pay
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openStatement(feeLearnerId);
                          }}
                          className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Statement
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    {rosterQuery.isLoading ? 'Loading roster…' : 'No learners match your search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-2 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          Tip: select a learner, then open <span className="font-semibold">Statement</span> to view history and print.
        </div>
      </SectionCard>

      {mode === 'charge' && (
        <ResponsiveChargeModal
          title="Create fee charge"
          onClose={closeToHome}
          learners={learners}
          classLabels={classLabels}
          selectedLearnerId={selectedLearnerId}
          onCharge={async (payload, isBulk) => {
            if (isBulk) {
              await addBulkCharges(payload as any);
            } else {
              await addCharge(payload as any);
            }
            await fetchBalances();
            if (payload?.learner_id) await fetchStatement(payload.learner_id);
          }}
        />
      )}

      {mode === 'payment' && (
        <ResponsivePaymentModal
          title="Record payment"
          onClose={closeToHome}
          learners={learners}
          selectedLearnerId={selectedLearnerId}
          onPayment={async (payload) => {
            await addPayment(payload as any);
            await fetchBalances();
            if (payload?.learner_id) await fetchStatement(payload.learner_id);
          }}
        />
      )}

      {mode === 'statement' && (
        <StatementModal
          title={`Statement${selectedLearnerId ? ` • ${selectedLearnerId}` : ''}`}
          onClose={closeToHome}
          learnerId={selectedLearnerId}
          summary={summary}
          charges={charges}
          payments={payments}
          loading={statementLoading}
          onOpenCharge={() => openCharge(selectedLearnerId)}
          onOpenPayment={() => openPayment(selectedLearnerId)}
          onPrint={() => openPrint(selectedLearnerId)}
          onDownload={() => downloadStatementPdf(selectedLearnerId, 'fee-statement.pdf')}
        />
      )}

      {unmatchedOpen && (
        <UnmatchedPaymentsModal
          title="Unmatched inbound payments"
          onClose={() => setUnmatchedOpen(false)}
          loading={inboundLoading}
          rows={inboundUnmatched}
          learners={learners}
          onRefresh={fetchUnmatched}
          onAttach={async (inboundId, learnerId) => {
            await attachToLearner(inboundId, learnerId);
            await fetchUnmatched();
            await fetchBalances(); // refresh balances after matching
          }}
        />
      )}
    </div>
  );
};

export default OrgFeesPage;
