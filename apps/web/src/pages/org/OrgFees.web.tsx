// apps/web/src/pages/org/OrgFees.web.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useShopContext } from '@mytutorapp/shared/context';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { getOrgRoster } from '@mytutorapp/shared/api/orgApi';
import { useOrgFeeStructures } from '@mytutorapp/shared/hooks/useOrgFeeStructures';
import { useOrgFeeBalances } from '@mytutorapp/shared/hooks/useOrgFeeBalances';
import { useOrgFeeStatement } from '@mytutorapp/shared/hooks/useOrgFeeStatement';
import type { FeeStructure, FeeStructureItem } from '@mytutorapp/shared/types';

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
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

function toCents(amountMajor: string) {
  const n = Number(String(amountMajor || '').replace(/,/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

type LearnerLite = {
  id?: string;
  user_id?: string;
  learner_id?: string;
  admission_code?: string;
  name?: string;
  full_name?: string;
  class_label?: string;
  grade?: string;
};

function pickLearnerId(l: LearnerLite) {
  return l.id || l.learner_id || l.user_id || l.admission_code || '';
}

function pickLearnerName(l: LearnerLite) {
  return l.name || l.full_name || l.admission_code || l.learner_id || l.id || 'Learner';
}

const Badge: React.FC<{ children: React.ReactNode; tone?: 'warn' | 'ok' | 'neutral' }> = ({ children, tone = 'neutral' }) => {
  const cls =
    tone === 'warn'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
      : tone === 'ok'
        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';

  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', cls)}>{children}</span>;
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />

      <div className="absolute inset-0 flex items-end justify-center p-0 md:items-center md:p-4">
        <div
          className={cn(
            'w-full border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900',
            'rounded-t-2xl md:rounded-2xl',
            'max-h-[92vh] md:max-h-[88vh]',
            'overflow-hidden',
            'md:max-w-3xl',
          )}
        >
          <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
            <div className="text-base font-semibold">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Close
            </button>
          </div>

          <div className="max-h-[calc(92vh-64px)] overflow-y-auto p-4 md:max-h-[calc(88vh-64px)]">{children}</div>
        </div>
      </div>
    </div>
  );
};

const EmptyState: React.FC<{ title: string; body: string; action?: React.ReactNode }> = ({ title, body, action }) => (
  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
    <div className="font-semibold">{title}</div>
    <div className="mt-1 text-sm">{body}</div>
    {action ? <div className="mt-3">{action}</div> : null}
  </div>
);

const SectionCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
      </div>
    </div>
    <div className="mt-3">{children}</div>
  </div>
);

const emptyItem = (): FeeStructureItem => ({
  id: 0,
  structure_id: 0,
  label: '',
  amount_cents: 0,
  currency: 'USD',
  cadence: '',
  is_optional: false,
  sort_order: 0,
});

const OrgFeesPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

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
      const data = await getOrgRoster(backendUrl, orgToken as string, orgId as string);
      const learners: LearnerLite[] = data?.learners || data?.items || [];
      return { raw: data, learners: Array.isArray(learners) ? learners : [] };
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
    const active = structures.find((s) => s.is_active) || structures[0];
    setSelectedStructureId((prev) => prev ?? active.id);
  }, [structures]);

  useEffect(() => {
    if (!selectedStructureId) return;
    const s = structures.find((x) => x.id === selectedStructureId);
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
      (s.items || []).map((it, idx) => ({
        ...it,
        id: it.id || idx + 1,
        sort_order: it.sort_order ?? idx,
        currency: it.currency || s.currency || 'USD',
      })) || [emptyItem()],
    );
  }, [selectedStructureId, structures]);

  const mergedRows = useMemo(() => {
    const byLearner = new Map<string, { charges: number; payments: number; balance: number }>();
    for (const b of balances || []) byLearner.set(String(b.learner_id), b);

    return learners.map((l) => {
      const id = pickLearnerId(l);
      const b = byLearner.get(String(id)) || { charges: 0, payments: 0, balance: 0 };
      return {
        learner: l,
        learnerId: id,
        name: pickLearnerName(l),
        class_label: l.class_label || '',
        charges: b.charges,
        payments: b.payments,
        balance: b.balance,
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
          String(r.learnerId).toLowerCase().includes(query) ||
          String(r.class_label || '').toLowerCase().includes(query)
        );
      })
      .sort((a, b) => (b.balance || 0) - (a.balance || 0));
  }, [mergedRows, q, classFilter]);

  const totalStructure = useMemo(
    () => structureItems.reduce((acc, item) => acc + Number(item.amount_cents || 0), 0),
    [structureItems],
  );

  const handleSaveStructure = async () => {
    const payload = {
      title: structureForm.title,
      description: [structureForm.description, structureForm.scopeValue ? `Scope: ${structureForm.scopeType} ${structureForm.scopeValue}` : '']
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
          metadata: item.metadata || {},
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

  if (!isPro) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <h1 className="text-2xl font-semibold">Fees</h1>
        <p className="text-sm text-slate-500">Upgrade to Pro to manage org fee structures and balances.</p>
        {upgradeCta}
      </div>
    );
  }

  if (mode === 'print') {
    const learner = learners.find((l) => pickLearnerId(l) === selectedLearnerId);
    const learnerName = learner ? pickLearnerName(learner) : selectedLearnerId || 'Learner';

    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <div className="flex items-center justify-between print:hidden">
          <button
            type="button"
            onClick={() => navigate('/org/fees' + (selectedLearnerId ? `?learnerId=${encodeURIComponent(selectedLearnerId)}` : ''))}
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
                <div className="mt-1 text-base font-semibold">{moneyFromCents(summary.total_charges, payments[0]?.currency || 'USD')}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-slate-500">Total payments</div>
                <div className="mt-1 text-base font-semibold">{moneyFromCents(summary.total_payments, payments[0]?.currency || 'USD')}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-slate-500">Balance</div>
                <div className="mt-1 text-base font-semibold">{moneyFromCents(summary.balance, payments[0]?.currency || 'USD')}</div>
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
                            {p.received_at ? new Date(p.received_at).toLocaleString() : p.created_at ? new Date(p.created_at).toLocaleString() : '-'}
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
          </div>
        )}
      </div>
    );
  }

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

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Fee structure builder" subtitle="Line items, totals, and activation per scope">
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
                      onChange={(e) => setStructureItems((prev) => prev.map((it, i) => (i === idx ? { ...it, label: e.target.value } : it)))}
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
                      placeholder="Tuition"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <div className="text-[11px] font-semibold text-slate-500">Amount</div>
                    <input
                      value={(item.amount_cents / 100 || '').toString()}
                      onChange={(e) => setStructureItems((prev) => prev.map((it, i) => (i === idx ? { ...it, amount_cents: toCents(e.target.value) } : it)))}
                      inputMode="decimal"
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <div className="text-[11px] font-semibold text-slate-500">Cadence</div>
                    <input
                      value={item.cadence || ''}
                      onChange={(e) => setStructureItems((prev) => prev.map((it, i) => (i === idx ? { ...it, cadence: e.target.value } : it)))}
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
                      placeholder="per term"
                    />
                  </div>
                  <div className="md:col-span-1 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(item.is_optional)}
                      onChange={(e) => setStructureItems((prev) => prev.map((it, i) => (i === idx ? { ...it, is_optional: e.target.checked } : it)))}
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-200">Optional</span>
                  </div>
                  <div className="md:col-span-1 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setStructureItems((prev) => (prev.length === 1 ? [emptyItem()] : prev.filter((_, i) => i !== idx)))}
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
                  className={cn('rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700', structuresSaving && 'opacity-60')}
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
                {(structures || []).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedStructureId(s.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm',
                      'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800',
                      selectedStructureId === s.id && 'border-blue-400 bg-blue-50/60 dark:border-blue-500/50 dark:bg-blue-900/10',
                    )}
                  >
                    <div>
                      <div className="font-semibold">{s.title}</div>
                      <div className="text-xs text-slate-500">{s.description || 'No description'} • {s.currency}</div>
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
                          setStructureForm({ title: '', description: '', currency: 'USD', effective_term: '', scopeType: 'class', scopeValue: '' });
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
              <div className="mt-1 text-lg font-semibold">{balancesLoading ? 'Loading…' : `${balances?.length || 0} learners`}</div>
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
            <div className="flex items-center gap-2 pt-5 text-sm text-slate-500">
              {balancesLoading ? 'Refreshing balances…' : `${filtered.length} rows`}
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
              {filtered.map((r) => {
                const isSelected = selectedLearnerId && r.learnerId === selectedLearnerId;
                return (
                  <tr
                    key={r.learnerId}
                    className={cn('border-t border-slate-200 dark:border-slate-800', isSelected && 'bg-blue-50/60 dark:bg-blue-900/10')}
                    onClick={() => setSearchParams({ learnerId: r.learnerId })}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-slate-500">
                        <span className="font-mono">{r.learnerId}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">{r.class_label || '-'}</td>
                    <td className="px-3 py-2 text-right">{moneyFromCents(r.charges, 'USD')}</td>
                    <td className="px-3 py-2 text-right">{moneyFromCents(r.payments, 'USD')}</td>
                    <td className="px-3 py-2 text-right">
                      <Badge tone={r.balance > 0 ? 'warn' : 'ok'}>{moneyFromCents(r.balance, 'USD')}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCharge(r.learnerId);
                          }}
                          className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          Charge
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openPayment(r.learnerId);
                          }}
                          className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600"
                        >
                          Pay
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openStatement(r.learnerId);
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
    </div>
  );
};

function ResponsiveChargeModal({
  title,
  onClose,
  learners,
  classLabels,
  selectedLearnerId,
  onCharge,
}: {
  title: string;
  onClose: () => void;
  learners: LearnerLite[];
  classLabels: string[];
  selectedLearnerId: string;
  onCharge: (payload: any, isBulk?: boolean) => Promise<void>;
}) {
  const [chargeLearnerId, setChargeLearnerId] = useState('');
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeCurrency, setChargeCurrency] = useState('USD');
  const [chargeDesc, setChargeDesc] = useState('');
  const [chargeClassLabel, setChargeClassLabel] = useState('');
  const [chargeDueDate, setChargeDueDate] = useState('');
  const [chargeMode, setChargeMode] = useState<'single' | 'bulk'>('single');
  const [bulkLearnerIds, setBulkLearnerIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedLearnerId) setChargeLearnerId(selectedLearnerId);
  }, [selectedLearnerId]);

  const amount_cents = toCents(chargeAmount);
  const bulkCandidates = chargeClassLabel ? learners.filter((l) => String(l.class_label || '') === chargeClassLabel) : learners;

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600 dark:text-slate-200">
          <label className="flex cursor-pointer items-center gap-2 rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">
            <input type="radio" checked={chargeMode === 'single'} onChange={() => setChargeMode('single')} />
            Single learner
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">
            <input type="radio" checked={chargeMode === 'bulk'} onChange={() => setChargeMode('bulk')} />
            Bulk by class
          </label>
        </div>

        {chargeMode === 'single' ? (
          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Learner</div>
            <select
              value={chargeLearnerId}
              onChange={(e) => setChargeLearnerId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <option value="">Select learner…</option>
              {learners.map((l) => {
                const id = pickLearnerId(l);
                if (!id) return null;
                return (
                  <option key={id} value={id}>
                    {pickLearnerName(l)} ({id})
                  </option>
                );
              })}
            </select>
          </div>
        ) : (
          <div className="space-y-2">
            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Class</div>
              <select
                value={chargeClassLabel}
                onChange={(e) => setChargeClassLabel(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <option value="">All classes</option>
                {classLabels.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-500">{bulkLearnerIds.length} selected</div>
              <button
                type="button"
                onClick={() => {
                  const allIds = bulkCandidates.map((l) => pickLearnerId(l)).filter((x) => x && x !== 'undefined' && x !== 'null');
                  const allSelected = bulkLearnerIds.length === allIds.length;
                  setBulkLearnerIds(allSelected ? [] : allIds);
                }}
                className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Toggle all
              </button>
            </div>

            <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-800">
              {bulkCandidates.map((l) => {
                const id = String(pickLearnerId(l) || '').trim();
                if (!id) return null;
                const checked = bulkLearnerIds.includes(id);

                return (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setBulkLearnerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
                    />
                    <span className="text-sm">
                      {pickLearnerName(l)} <span className="text-xs text-slate-500">({id})</span>
                    </span>
                  </label>
                );
              })}

              {bulkCandidates.length === 0 && <div className="p-2 text-sm text-slate-500">No learners found for this class.</div>}
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Amount</div>
            <input
              value={chargeAmount}
              onChange={(e) => setChargeAmount(e.target.value)}
              placeholder="e.g. 25.00"
              inputMode="decimal"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Currency</div>
            <select
              value={chargeCurrency}
              onChange={(e) => setChargeCurrency(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <option value="USD">USD</option>
              <option value="KES">KES</option>
              <option value="QAR">QAR</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Description</div>
            <input
              value={chargeDesc}
              onChange={(e) => setChargeDesc(e.target.value)}
              placeholder="e.g. Tuition fee - Term 1"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Due date (optional)</div>
            <input
              value={chargeDueDate}
              onChange={(e) => setChargeDueDate(e.target.value)}
              type="date"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </div>

          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
            Preview: <span className="font-semibold">{moneyFromCents(amount_cents, chargeCurrency)}</span>
          </div>
        </div>

        {saving && <div className="text-xs text-slate-500">Saving charge…</div>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={
              (chargeMode === 'single' && !chargeLearnerId) ||
              (chargeMode === 'bulk' && bulkLearnerIds.length === 0) ||
              amount_cents <= 0 ||
              saving
            }
            onClick={async () => {
              if (amount_cents <= 0) return;
              setSaving(true);
              try {
                if (chargeMode === 'single') {
                  await onCharge(
                    {
                      learner_id: chargeLearnerId,
                      amount_cents,
                      currency: chargeCurrency,
                      description: chargeDesc || undefined,
                      class_label: chargeClassLabel || undefined,
                      due_date: chargeDueDate || undefined,
                    },
                    false,
                  );
                } else {
                  await onCharge(
                    {
                      learner_ids: bulkLearnerIds,
                      amount_cents,
                      currency: chargeCurrency,
                      description: chargeDesc || undefined,
                      class_label: chargeClassLabel || undefined,
                      due_date: chargeDueDate || undefined,
                    },
                    true,
                  );
                }
                setChargeAmount('');
                setChargeDesc('');
                setChargeDueDate('');
                onClose();
              } finally {
                setSaving(false);
              }
            }}
            className={cn('w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700', 'disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto')}
          >
            {chargeMode === 'bulk' ? `Create charges (${bulkLearnerIds.length})` : 'Create charge'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ResponsivePaymentModal({
  title,
  onClose,
  learners,
  selectedLearnerId,
  onPayment,
}: {
  title: string;
  onClose: () => void;
  learners: LearnerLite[];
  selectedLearnerId: string;
  onPayment: (payload: any) => Promise<void>;
}) {
  const [payLearnerId, setPayLearnerId] = useState('');
  const [payCurrency, setPayCurrency] = useState('USD');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payReference, setPayReference] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payReceivedAt, setPayReceivedAt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedLearnerId) setPayLearnerId(selectedLearnerId);
  }, [selectedLearnerId]);

  const amount_cents = toCents(payAmount);

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Learner</div>
            <select
              value={payLearnerId}
              onChange={(e) => setPayLearnerId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <option value="">Select learner…</option>
              {learners.map((l) => {
                const id = pickLearnerId(l);
                if (!id) return null;
                return (
                  <option key={id} value={id}>
                    {pickLearnerName(l)} ({id})
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Amount</div>
            <input
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="e.g. 10.00"
              inputMode="decimal"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Currency</div>
            <select
              value={payCurrency}
              onChange={(e) => setPayCurrency(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <option value="USD">USD</option>
              <option value="KES">KES</option>
              <option value="QAR">QAR</option>
            </select>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Method</div>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <option value="cash">Cash</option>
              <option value="pos">POS</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="mpesa">M-Pesa</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Reference (optional)</div>
            <input
              value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
              placeholder="Receipt number / transaction ref"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Note (optional)</div>
            <input
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="Any extra notes…"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Received at (optional)</div>
            <input
              value={payReceivedAt}
              onChange={(e) => setPayReceivedAt(e.target.value)}
              type="datetime-local"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
            <div className="mt-1 text-[11px] text-slate-500">If blank, statement still uses created_at.</div>
          </div>

          <div className="md:col-span-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
            Preview: <span className="font-semibold">{moneyFromCents(amount_cents, payCurrency)}</span>
          </div>
        </div>

        {saving && <div className="text-xs text-slate-500">Saving payment…</div>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!payLearnerId || amount_cents <= 0 || saving}
            onClick={async () => {
              if (amount_cents <= 0) return;
              setSaving(true);
              try {
                await onPayment({
                  learner_id: payLearnerId,
                  amount_cents,
                  currency: payCurrency,
                  method: payMethod || undefined,
                  reference: payReference || undefined,
                  note: payNote || undefined,
                  received_at: payReceivedAt ? new Date(payReceivedAt).toISOString() : undefined,
                });
                setPayAmount('');
                setPayReference('');
                setPayNote('');
                setPayReceivedAt('');
                onClose();
              } finally {
                setSaving(false);
              }
            }}
            className={cn('w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600', 'disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto')}
          >
            Record payment
          </button>
        </div>
      </div>
    </Modal>
  );
}

function StatementModal({
  title,
  onClose,
  learnerId,
  summary,
  charges,
  payments,
  loading,
  onOpenCharge,
  onOpenPayment,
  onPrint,
  onDownload,
}: {
  title: string;
  onClose: () => void;
  learnerId: string;
  summary: { total_charges: number; total_payments: number; balance: number };
  charges: any[];
  payments: any[];
  loading: boolean;
  onOpenCharge: () => void;
  onOpenPayment: () => void;
  onPrint: () => void;
  onDownload: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      {!learnerId ? (
        <EmptyState title="Select a learner" body="Pick a learner from the Fees list first." />
      ) : loading ? (
        <div className="text-sm text-slate-500">Loading statement…</div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <div className="text-xs text-slate-500">Charges</div>
              <div className="mt-1 text-base font-semibold">{moneyFromCents(summary.total_charges, charges?.[0]?.currency || 'USD')}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <div className="text-xs text-slate-500">Payments</div>
              <div className="mt-1 text-base font-semibold">{moneyFromCents(summary.total_payments, payments?.[0]?.currency || 'USD')}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <div className="text-xs text-slate-500">Balance</div>
              <div className="mt-1 text-base font-semibold">{moneyFromCents(summary.balance, payments?.[0]?.currency || 'USD')}</div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-semibold">History</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onOpenCharge}
                className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Add charge
              </button>
              <button
                type="button"
                onClick={onOpenPayment}
                className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600"
              >
                Add payment
              </button>
              <button
                type="button"
                onClick={onDownload}
                className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Statement PDF
              </button>
              <button
                type="button"
                onClick={onPrint}
                className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Print
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-200">Charges</div>
              <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
                {(charges || []).map((c: any) => (
                  <div key={`c-${c.id}`} className="border-b border-slate-200 p-3 text-sm dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{c.description || 'Fee'}</div>
                        <div className="mt-1 text-xs text-slate-500">{c.created_at ? new Date(c.created_at).toLocaleString() : '-'}{c.class_label ? ` • ${c.class_label}` : ''}</div>
                      </div>
                      <div className="shrink-0 font-semibold">{moneyFromCents(Number(c.amount_cents || 0), c.currency)}</div>
                    </div>
                  </div>
                ))}
                {(!charges || charges.length === 0) && <div className="p-3 text-sm text-slate-500">No charges yet.</div>}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-200">Payments</div>
              <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
                {(payments || []).map((p: any) => (
                  <div key={`p-${p.id}`} className="border-b border-slate-200 p-3 text-sm dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.method || 'payment'}</div>
                        <div className="mt-1 text-xs text-slate-500">{p.received_at || p.created_at ? new Date(p.received_at || p.created_at).toLocaleString() : '-'}{p.reference ? ` • ${p.reference}` : ''}</div>
                        {p.note ? <div className="mt-1 truncate text-xs text-slate-500">{p.note}</div> : null}
                      </div>
                      <div className="shrink-0 font-semibold">{moneyFromCents(Number(p.amount_cents || 0), p.currency)}</div>
                    </div>
                  </div>
                ))}
                {(!payments || payments.length === 0) && <div className="p-3 text-sm text-slate-500">No payments yet.</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default OrgFeesPage;
