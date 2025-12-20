// apps/web/src/pages/org/OrgFees.web.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { useShopContext } from '@mytutorapp/shared/context';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import {
  apiCreateFeeCharge,
  apiBulkFeeCharges,
  apiRecordFeePayment,
  apiGetFeeBalances,
  apiGetFeeStatement,
} from '@mytutorapp/shared/api/orgProApi';

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

function stripBase(base: string) {
  return String(base || '').replace(/\/+$/, '');
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

// ✅ Canonical learner identifier preference: use DB pk/id first.
function pickLearnerId(l: LearnerLite) {
  return l.id || l.learner_id || l.user_id || l.admission_code || '';
}

function pickLearnerName(l: LearnerLite) {
  return l.name || l.full_name || l.admission_code || l.learner_id || l.id || 'Learner';
}

const Badge: React.FC<{ children: React.ReactNode; tone?: 'warn' | 'ok' | 'neutral' }> = ({
  children,
  tone = 'neutral',
}) => {
  const cls =
    tone === 'warn'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
      : tone === 'ok'
        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';

  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', cls)}>{children}</span>;
};

const Modal: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => {
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
            'md:max-w-2xl',
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

          <div className="max-h-[calc(92vh-64px)] overflow-y-auto p-4 md:max-h-[calc(88vh-64px)]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

const EmptyState: React.FC<{ title: string; body: string; action?: React.ReactNode }> = ({
  title,
  body,
  action,
}) => (
  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
    <div className="font-semibold">{title}</div>
    <div className="mt-1 text-sm">{body}</div>
    {action ? <div className="mt-3">{action}</div> : null}
  </div>
);

const SectionCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({
  title,
  subtitle,
  children,
}) => (
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

const OrgFeesPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();

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

  // ✅ One helper: always keep balances and statements fresh
  const invalidateFees = useCallback(
    async (learnerId?: string) => {
      if (!backendUrl || !orgId || !orgToken) return;

      await qc.invalidateQueries({
        queryKey: ['orgFeeBalances', backendUrl, orgId, orgToken],
      });

      // If we know the learner, invalidate that learner statement
      if (learnerId) {
        await qc.invalidateQueries({
          queryKey: ['orgFeeStatement', backendUrl, orgId, orgToken, learnerId],
        });
      } else {
        // Otherwise invalidate the statement prefix
        await qc.invalidateQueries({
          queryKey: ['orgFeeStatement', backendUrl, orgId, orgToken],
        });
      }
    },
    [qc, backendUrl, orgId, orgToken],
  );

  // Roster
  const rosterQuery = useQuery({
    queryKey: ['orgRoster', backendUrl, orgId, orgToken],
    enabled: Boolean(backendUrl && orgId && orgToken),
    queryFn: async () => {
      const base = stripBase(backendUrl);
      const { data } = await axios.get(`${base}/api/orgs/${orgId}/roster`, {
        headers: orgToken ? { Authorization: `Bearer ${orgToken}` } : undefined,
      });

      const learners: LearnerLite[] =
        data?.learners ||
        data?.items?.learners ||
        data?.roster?.learners ||
        data?.roster ||
        data?.items ||
        [];

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

  // Balances
  const balancesQuery = useQuery({
    queryKey: ['orgFeeBalances', backendUrl, orgId, orgToken],
    enabled: Boolean(backendUrl && orgId && orgToken && isPro),
    queryFn: () => apiGetFeeBalances(backendUrl, orgId!, orgToken),
    staleTime: 15_000,
  });

  const balances = balancesQuery.data?.balances || [];

  const mergedRows = useMemo(() => {
    const byLearner = new Map<string, { charges: number; payments: number; balance: number }>();
    for (const b of balances) byLearner.set(String(b.learner_id), b);

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

  // Search/filter
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

  // Mutations
  const createChargeMut = useMutation({
    mutationFn: async (payload: {
      learner_id: string;
      amount_cents: number;
      currency: string;
      description?: string;
      class_label?: string;
      due_date?: string;
    }) => apiCreateFeeCharge(backendUrl, orgId!, payload as any, orgToken),
    onSuccess: async (_data, vars) => {
      await invalidateFees(vars?.learner_id);
    },
  });

  const bulkChargeMut = useMutation({
    mutationFn: async (payload: {
      learner_ids: string[];
      amount_cents: number;
      currency: string;
      description?: string;
      class_label?: string;
      due_date?: string;
    }) => apiBulkFeeCharges(backendUrl, orgId!, payload as any, orgToken),
    onSuccess: async () => {
      // bulk affects many learners; invalidate balances + statement prefix
      await invalidateFees();
    },
  });

  const paymentMut = useMutation({
    mutationFn: async (payload: {
      learner_id: string;
      amount_cents: number;
      currency: string;
      method?: string;
      reference?: string;
      note?: string;
      received_at?: string;
    }) => apiRecordFeePayment(backendUrl, orgId!, payload as any, orgToken),
    onSuccess: async (_data, vars) => {
      await invalidateFees(vars?.learner_id);
    },
  });

  // Statement
  const statementQuery = useQuery({
    queryKey: ['orgFeeStatement', backendUrl, orgId, orgToken, selectedLearnerId],
    enabled: Boolean(backendUrl && orgId && orgToken && selectedLearnerId && isPro),
    queryFn: () => apiGetFeeStatement(backendUrl, orgId!, selectedLearnerId, orgToken),
    staleTime: 10_000,
  });

  const statement = statementQuery.data as any;

  // Navigation helpers
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

  // ───────────────────────── Print view ─────────────────────────
  if (mode === 'print') {
    const learner = learners.find((l) => pickLearnerId(l) === selectedLearnerId);
    const learnerName = learner ? pickLearnerName(learner) : selectedLearnerId || 'Learner';

    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <div className="flex items-center justify-between print:hidden">
          <button
            type="button"
            onClick={() =>
              navigate(
                '/org/fees' + (selectedLearnerId ? `?learnerId=${encodeURIComponent(selectedLearnerId)}` : ''),
              )
            }
            className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            Print
          </button>
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
        ) : statementQuery.isLoading ? (
          <div className="text-sm text-slate-500">Loading statement…</div>
        ) : statementQuery.isError ? (
          <EmptyState title="Could not load statement" body="Check the learner ID and try again." />
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
              <div className="text-left text-xs text-slate-500 sm:text-right">
                Generated: {new Date().toLocaleString()}
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-slate-500">Total charges</div>
                <div className="mt-1 text-base font-semibold">
                  {moneyFromCents(
                    (statement?.charges || []).reduce((a: number, c: any) => a + Number(c.amount_cents || 0), 0),
                    statement?.charges?.[0]?.currency || 'USD',
                  )}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-slate-500">Total payments</div>
                <div className="mt-1 text-base font-semibold">
                  {moneyFromCents(
                    (statement?.payments || []).reduce((a: number, p: any) => a + Number(p.amount_cents || 0), 0),
                    statement?.payments?.[0]?.currency || 'USD',
                  )}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-slate-500">Balance</div>
                <div className="mt-1 text-base font-semibold">
                  {moneyFromCents(
                    Number(statement?.balance || 0),
                    statement?.charges?.[0]?.currency || statement?.payments?.[0]?.currency || 'USD',
                  )}
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
                      {(statement?.charges || []).map((c: any) => (
                        <tr key={`c-${c.id}`} className="border-t border-slate-200 dark:border-slate-800">
                          <td className="px-3 py-2">{c.created_at ? new Date(c.created_at).toLocaleDateString() : '-'}</td>
                          <td className="px-3 py-2">{c.description || 'Fee'}</td>
                          <td className="px-3 py-2 text-right">{moneyFromCents(Number(c.amount_cents || 0), c.currency)}</td>
                        </tr>
                      ))}
                      {(!statement?.charges || statement.charges.length === 0) && (
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
                      {(statement?.payments || []).map((p: any) => (
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
                      {(!statement?.payments || statement.payments.length === 0) && (
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

            <div className="mt-6 text-xs text-slate-500">
              Note: This statement is generated from recorded charges and payments in the system.
            </div>
          </div>
        )}
      </div>
    );
  }

  // ───────────────────────── Main dashboard (/org/fees) ─────────────────────────
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:py-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-blue-500">Org tools</p>
          <h1 className="text-2xl font-semibold">Fees & balances</h1>
          <p className="text-sm text-slate-500 dark:text-slate-300">
            Create charges, record payments, and generate printable statements.
          </p>
        </div>

        <span className="w-fit rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-slate-800 dark:text-slate-200">
          Pro / Enterprise
        </span>
      </div>

      {!isPro && upgradeCta ? (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20">
          <div className="font-semibold">{upgradeCta.headline}</div>
          <p className="text-sm">{upgradeCta.body}</p>
          <Link className="text-blue-600 underline" to="/org/profile">
            Upgrade {org?.name || 'org'}
          </Link>
        </div>
      ) : !orgId ? (
        <EmptyState title="Org not ready" body="We could not resolve orgId yet. Try refreshing." />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <SectionCard title="New charge" subtitle="Single learner or whole class.">
              <button
                type="button"
                onClick={() => openCharge()}
                className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:scale-[0.99]"
              >
                Create charge
              </button>
            </SectionCard>

            <SectionCard title="Record payment" subtitle="Cash, POS, transfer, M-Pesa.">
              <button
                type="button"
                onClick={() => openPayment()}
                className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600 active:scale-[0.99]"
              >
                Add payment
              </button>
            </SectionCard>

            <SectionCard title="Statements" subtitle="Select a learner then print.">
              <button
                type="button"
                onClick={() => {
                  if (selectedLearnerId) openStatement(selectedLearnerId);
                  else alert('Select a learner below first.');
                }}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 active:scale-[0.99]"
              >
                Open statement
              </button>
            </SectionCard>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 md:flex-1">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search learner / ID / class…"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900/30"
              />
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 sm:w-[200px]"
              >
                <option value="all">All classes</option>
                {classLabels.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-xs text-slate-500">
              {balancesQuery.isFetching ? 'Refreshing balances…' : 'Up to date'}
            </div>
          </div>

          {/* MOBILE + TABLET: cards */}
          <div className="grid gap-3 md:hidden">
            {filtered.map((r) => {
              const isSelected = selectedLearnerId && r.learnerId === selectedLearnerId;
              const tone = r.balance > 0 ? 'warn' : 'ok';

              return (
                <div
                  key={r.learnerId}
                  onClick={() => setSearchParams({ learnerId: r.learnerId })}
                  className={cn(
                    'rounded-2xl border p-4 shadow-sm',
                    isSelected
                      ? 'border-blue-300 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-900/10'
                      : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
                  )}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{r.name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        <span className="font-mono">{r.learnerId}</span>
                        {r.class_label ? <span> • {r.class_label}</span> : null}
                      </div>
                    </div>
                    <Badge tone={tone}>{moneyFromCents(r.balance, 'USD')}</Badge>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-200">
                    <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800">
                      <div className="text-[11px] text-slate-500">Charges</div>
                      <div className="font-semibold">{moneyFromCents(r.charges, 'USD')}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800">
                      <div className="text-[11px] text-slate-500">Payments</div>
                      <div className="font-semibold">{moneyFromCents(r.payments, 'USD')}</div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openCharge(r.learnerId);
                      }}
                      className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      Charge
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPayment(r.learnerId);
                      }}
                      className="flex-1 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600"
                    >
                      Pay
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openStatement(r.learnerId);
                      }}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Statement
                    </button>
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <EmptyState
                title={rosterQuery.isLoading ? 'Loading roster…' : 'No learners found'}
                body="Try adjusting your search or class filter."
              />
            )}
          </div>

          {/* DESKTOP: full table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:block">
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
                      className={cn(
                        'border-t border-slate-200 dark:border-slate-800',
                        isSelected && 'bg-blue-50/60 dark:bg-blue-900/10',
                      )}
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

          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            Tip: select a learner, then open <span className="font-semibold">Statement</span> to view history and print.
          </div>
        </>
      )}

      {/* ───────────────────────── Charge modal ───────────────────────── */}
      {mode === 'charge' && (
        <ResponsiveChargeModal
          title="Create fee charge"
          onClose={closeToHome}
          learners={learners}
          classLabels={classLabels}
          selectedLearnerId={selectedLearnerId}
          createChargeMut={createChargeMut}
          bulkChargeMut={bulkChargeMut}
        />
      )}

      {/* ───────────────────────── Payment modal ───────────────────────── */}
      {mode === 'payment' && (
        <ResponsivePaymentModal
          title="Record payment"
          onClose={closeToHome}
          learners={learners}
          selectedLearnerId={selectedLearnerId}
          paymentMut={paymentMut}
        />
      )}

      {/* ───────────────────────── Statement modal ───────────────────────── */}
      {mode === 'statement' && (
        <Modal title={`Statement${selectedLearnerId ? ` • ${selectedLearnerId}` : ''}`} onClose={closeToHome}>
          {!selectedLearnerId ? (
            <EmptyState title="Select a learner" body="Pick a learner from the Fees list first." />
          ) : statementQuery.isLoading ? (
            <div className="text-sm text-slate-500">Loading statement…</div>
          ) : statementQuery.isError ? (
            <EmptyState title="Could not load statement" body="Try again or verify learnerId." />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                  <div className="text-xs text-slate-500">Charges</div>
                  <div className="mt-1 text-base font-semibold">
                    {moneyFromCents(
                      (statement?.charges || []).reduce((a: number, c: any) => a + Number(c.amount_cents || 0), 0),
                      statement?.charges?.[0]?.currency || 'USD',
                    )}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                  <div className="text-xs text-slate-500">Payments</div>
                  <div className="mt-1 text-base font-semibold">
                    {moneyFromCents(
                      (statement?.payments || []).reduce((a: number, p: any) => a + Number(p.amount_cents || 0), 0),
                      statement?.payments?.[0]?.currency || 'USD',
                    )}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                  <div className="text-xs text-slate-500">Balance</div>
                  <div className="mt-1 text-base font-semibold">
                    {moneyFromCents(
                      Number(statement?.balance || 0),
                      statement?.charges?.[0]?.currency || statement?.payments?.[0]?.currency || 'USD',
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-semibold">History</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openCharge(selectedLearnerId)}
                    className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Add charge
                  </button>
                  <button
                    type="button"
                    onClick={() => openPayment(selectedLearnerId)}
                    className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600"
                  >
                    Add payment
                  </button>
                  <button
                    type="button"
                    onClick={() => openPrint(selectedLearnerId)}
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
                    {(statement?.charges || []).map((c: any) => (
                      <div key={`c-${c.id}`} className="border-b border-slate-200 p-3 text-sm dark:border-slate-800">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{c.description || 'Fee'}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {c.created_at ? new Date(c.created_at).toLocaleString() : '-'}
                              {c.class_label ? ` • ${c.class_label}` : ''}
                            </div>
                          </div>
                          <div className="shrink-0 font-semibold">
                            {moneyFromCents(Number(c.amount_cents || 0), c.currency)}
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!statement?.charges || statement.charges.length === 0) && (
                      <div className="p-3 text-sm text-slate-500">No charges yet.</div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-200">Payments</div>
                  <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    {(statement?.payments || []).map((p: any) => (
                      <div key={`p-${p.id}`} className="border-b border-slate-200 p-3 text-sm dark:border-slate-800">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{p.method || 'payment'}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {p.received_at || p.created_at ? new Date(p.received_at || p.created_at).toLocaleString() : '-'}
                              {p.reference ? ` • ${p.reference}` : ''}
                            </div>
                            {p.note ? <div className="mt-1 truncate text-xs text-slate-500">{p.note}</div> : null}
                          </div>
                          <div className="shrink-0 font-semibold">
                            {moneyFromCents(Number(p.amount_cents || 0), p.currency)}
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!statement?.payments || statement.payments.length === 0) && (
                      <div className="p-3 text-sm text-slate-500">No payments yet.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
};

export default OrgFeesPage;

/* ─────────────────────────────────────────────────────────
   Extracted responsive modals
   ───────────────────────────────────────────────────────── */

function ResponsiveChargeModal({
  title,
  onClose,
  learners,
  classLabels,
  selectedLearnerId,
  createChargeMut,
  bulkChargeMut,
}: {
  title: string;
  onClose: () => void;
  learners: LearnerLite[];
  classLabels: string[];
  selectedLearnerId: string;
  createChargeMut: any;
  bulkChargeMut: any;
}) {
  const [chargeMode, setChargeMode] = useState<'single' | 'bulk'>('single');
  const [chargeLearnerId, setChargeLearnerId] = useState('');
  const [chargeClassLabel, setChargeClassLabel] = useState('');
  const [chargeCurrency, setChargeCurrency] = useState('USD');
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeDesc, setChargeDesc] = useState('');
  const [chargeDueDate, setChargeDueDate] = useState('');
  const [bulkLearnerIds, setBulkLearnerIds] = useState<string[]>([]);

  useEffect(() => {
    if (selectedLearnerId) setChargeLearnerId(selectedLearnerId);
  }, [selectedLearnerId]);

  useEffect(() => {
    if (chargeMode !== 'bulk') return;
    if (chargeClassLabel) return;
    if (classLabels[0]) setChargeClassLabel(classLabels[0]);
  }, [chargeMode, chargeClassLabel, classLabels]);

  const bulkCandidates = useMemo(() => {
    if (!chargeClassLabel) return learners;
    return learners.filter((l) => String(l.class_label || '') === chargeClassLabel);
  }, [learners, chargeClassLabel]);

  const amount_cents = toCents(chargeAmount);

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setChargeMode('single')}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-sm font-semibold',
              chargeMode === 'single'
                ? 'bg-blue-600 text-white'
                : 'border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800',
            )}
          >
            Single
          </button>
          <button
            type="button"
            onClick={() => setChargeMode('bulk')}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-sm font-semibold',
              chargeMode === 'bulk'
                ? 'bg-blue-600 text-white'
                : 'border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800',
            )}
          >
            Whole class
          </button>
        </div>

        {chargeMode === 'single' ? (
          <div className="grid gap-3 md:grid-cols-2">
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

            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Class label (optional)</div>
              <input
                value={chargeClassLabel}
                onChange={(e) => setChargeClassLabel(e.target.value)}
                placeholder="e.g. Grade 7 Blue"
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">Class label</div>
                <select
                  value={chargeClassLabel}
                  onChange={(e) => {
                    setChargeClassLabel(e.target.value);
                    setBulkLearnerIds([]);
                  }}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  {classLabels.length === 0 ? (
                    <option value="">No classes found</option>
                  ) : (
                    classLabels.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                Select learners in this class, then create charges in one click.
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">
                Learners ({bulkLearnerIds.length}/{bulkCandidates.length})
              </div>
              <button
                type="button"
                onClick={() => {
                  const allIds = bulkCandidates
                    .map((l) => pickLearnerId(l))
                    .map((x) => String(x || '').trim())
                    .filter((x) => x && x !== 'undefined' && x !== 'null');

                  const allSelected = allIds.length > 0 && allIds.every((id) => bulkLearnerIds.includes(id));
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
                      onChange={() => {
                        setBulkLearnerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
                      }}
                    />
                    <span className="text-sm">
                      {pickLearnerName(l)} <span className="text-xs text-slate-500">({id})</span>
                    </span>
                  </label>
                );
              })}

              {bulkCandidates.length === 0 && (
                <div className="p-2 text-sm text-slate-500">No learners found for this class.</div>
              )}
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

        {(createChargeMut.isError || bulkChargeMut.isError) && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200">
            {(createChargeMut.error as any)?.message ||
              (bulkChargeMut.error as any)?.message ||
              'Failed to create charge.'}
          </div>
        )}

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
              createChargeMut.isPending ||
              bulkChargeMut.isPending
            }
            onClick={async () => {
              if (amount_cents <= 0) return;

              if (chargeMode === 'single') {
                await createChargeMut.mutateAsync({
                  learner_id: chargeLearnerId,
                  amount_cents,
                  currency: chargeCurrency,
                  description: chargeDesc || undefined,
                  class_label: chargeClassLabel || undefined,
                  due_date: chargeDueDate || undefined,
                });
              } else {
                const safeIds = bulkLearnerIds
                  .map((x) => String(x || '').trim())
                  .filter((x) => x && x !== 'undefined' && x !== 'null');

                if (safeIds.length === 0) {
                  alert('No valid learners selected.');
                  return;
                }

                const resp = await bulkChargeMut.mutateAsync({
                  learner_ids: safeIds,
                  amount_cents,
                  currency: chargeCurrency,
                  description: chargeDesc || undefined,
                  class_label: chargeClassLabel || undefined,
                  due_date: chargeDueDate || undefined,
                });

                const failedCount = (resp as any)?.failed?.length || 0;
                if (failedCount > 0) {
                  alert(`Created ${(resp as any)?.inserted?.length || 0} charges. Skipped ${failedCount} learners.`);
                } else {
                  alert(`Created ${(resp as any)?.inserted?.length || safeIds.length} charges.`);
                }
              }

              setChargeAmount('');
              setChargeDesc('');
              setChargeDueDate('');
              onClose();
            }}
            className={cn(
              'w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700',
              'disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto',
            )}
          >
            {chargeMode === 'bulk'
              ? bulkChargeMut.isPending
                ? 'Creating…'
                : `Create charges (${bulkLearnerIds.length})`
              : createChargeMut.isPending
                ? 'Creating…'
                : 'Create charge'}
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
  paymentMut,
}: {
  title: string;
  onClose: () => void;
  learners: LearnerLite[];
  selectedLearnerId: string;
  paymentMut: any;
}) {
  const [payLearnerId, setPayLearnerId] = useState('');
  const [payCurrency, setPayCurrency] = useState('USD');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payReference, setPayReference] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payReceivedAt, setPayReceivedAt] = useState('');

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

        {paymentMut.isError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200">
            {(paymentMut.error as any)?.message || 'Failed to record payment.'}
          </div>
        )}

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
            disabled={!payLearnerId || amount_cents <= 0 || paymentMut.isPending}
            onClick={async () => {
              if (amount_cents <= 0) return;

              await paymentMut.mutateAsync({
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
            }}
            className={cn(
              'w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600',
              'disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto',
            )}
          >
            {paymentMut.isPending ? 'Saving…' : 'Record payment'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
