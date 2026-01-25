import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useShopContext } from '@mytutorapp/shared/context/ShopContext';
import { createPortal } from 'react-dom';
import { Eye, Loader2, RefreshCw, Search, X } from 'lucide-react';

const STATUS_OPTIONS = ['active', 'trial', 'past_due', 'canceled', 'expired'] as const;
const TIER_OPTIONS = ['starter', 'pro', 'enterprise'] as const;
const CYCLE_OPTIONS = ['monthly', 'yearly'] as const;
const CURRENCY_OPTIONS = ['USD', 'KES'] as const;

type Currency = (typeof CURRENCY_OPTIONS)[number];
type Tier = (typeof TIER_OPTIONS)[number];
type Cycle = (typeof CYCLE_OPTIONS)[number];
type Status = (typeof STATUS_OPTIONS)[number];

type OrgCurrentSub = {
  tier: string | null;
  cycle: string | null;
  currency: Currency | null;
  status: string | null;
  seats: number | null;
  endAt: string | null;
  startedAt: string | null;
};

type OrgRow = {
  orgId: string;
  name: string;
  emailDomain: string | null;
  createdAt: string;
  membersCount: number;
  currentSub: OrgCurrentSub | null;
};

type OrgSubscription = {
  id: string;
  org_id: string;
  tier: string;
  cycle: string | null;
  currency: Currency | null;
  seats: number;
  status: string | null;
  active: boolean;
  started_at: string | null;
  expires_at: string | null;
  amount_cents: number | null;
  meta: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  cancel_at?: string | null;
};

type UpgradeForm = {
  tier: Tier;
  cycle: Cycle;
  currency: Currency;
  seats: number;
  status: Status;
  endAt: string;
  note: string;
  promoAmount: string;
  promoReason: string;
};

function pickBackend(): string {
  const v =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BACKEND_URL) ||
    (typeof window !== 'undefined' && (window as any).__BACKEND_URL__) ||
    'http://localhost:4000';
  return String(v).replace(/\/+$/, '');
}

function toDateInputValue(raw: string | null | undefined) {
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function formatMoney(amountCents: number | null | undefined, currency: Currency | null) {
  if (amountCents == null || !currency) return '—';
  const amount = amountCents / 100;
  if (currency === 'KES') return `KSh ${amount.toLocaleString()}`;
  return `$ ${amount.toFixed(2)}`;
}

function formatDate(raw: string | null | undefined) {
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function getErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    return (
      (error.response?.data as { message?: string } | undefined)?.message ||
      error.message ||
      fallback
    );
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

function buildUpgradeDefaults(org: OrgRow | null): UpgradeForm {
  const current = org?.currentSub;
  const tier = (current?.tier as Tier) || 'starter';
  const cycle = (current?.cycle as Cycle) || 'monthly';
  const currency = (current?.currency as Currency) || 'USD';
  const status = (current?.status as Status) || 'active';
  return {
    tier,
    cycle,
    currency,
    seats: current?.seats || 50,
    status,
    endAt: toDateInputValue(current?.endAt),
    note: '',
    promoAmount: '',
    promoReason: '',
  };
}

export default function OrgSubscriptionsManage() {
  const { backendUrl: ctxBackendUrl, adminToken, token } = useShopContext();
  const BACKEND = useMemo(() => (ctxBackendUrl || pickBackend()).replace(/\/+$/, ''), [
    ctxBackendUrl,
  ]);
  const authToken = adminToken || token || '';

  const [list, setList] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(100);

  const [viewingOrg, setViewingOrg] = useState<OrgRow | null>(null);
  const [history, setHistory] = useState<OrgSubscription[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [upgradeOrg, setUpgradeOrg] = useState<OrgRow | null>(null);
  const [upgradeForm, setUpgradeForm] = useState<UpgradeForm>(buildUpgradeDefaults(null));

  const headers = useMemo(() => {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (authToken) h.Authorization = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  const fetchOrgs = useCallback(async () => {
    if (!BACKEND || !authToken) {
      setErr('Not signed in. Please log in as an admin.');
      return;
    }
    setLoading(true);
    setErr(null);

    try {
      const res = await axios.get<{ success: boolean; orgs: OrgRow[]; message?: string }>(
        `${BACKEND}/api/admin/orgs`,
        {
          params: { q: q.trim() || undefined, limit },
          headers,
          validateStatus: () => true,
        }
      );

      if (res.status === 401) throw new Error('Unauthorized. Please sign in as admin.');
      if (res.status === 403) throw new Error('Forbidden. Your account lacks admin access.');
      if (!res.data?.success) {
        throw new Error(res.data?.message || `HTTP ${res.status}`);
      }

      setList(res.data.orgs || []);
    } catch (error: unknown) {
      setErr(getErrorMessage(error, 'Failed to load institutions'));
    } finally {
      setLoading(false);
    }
  }, [BACKEND, authToken, headers, limit, q]);

  const fetchHistory = useCallback(
    async (org: OrgRow) => {
      if (!BACKEND || !authToken) return;
      setHistoryLoading(true);
      try {
        const res = await axios.get<{ success: boolean; subscriptions: OrgSubscription[] }>(
          `${BACKEND}/api/admin/orgs/${org.orgId}/subscriptions`,
          { headers, validateStatus: () => true }
        );
        if (!res.data?.success) {
          throw new Error(res.data?.message || 'Failed to load subscriptions');
        }
        setHistory(res.data.subscriptions || []);
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, 'Failed to load subscriptions'));
      } finally {
        setHistoryLoading(false);
      }
    },
    [BACKEND, authToken, headers]
  );

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  useEffect(() => {
    if (!upgradeOrg) return;
    setUpgradeForm(buildUpgradeDefaults(upgradeOrg));
  }, [upgradeOrg]);

  useEffect(() => {
    const isOpen = Boolean(viewingOrg || upgradeOrg);
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setViewingOrg(null);
        setUpgradeOrg(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [viewingOrg, upgradeOrg]);

  const onUpgradeSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!upgradeOrg || !BACKEND || !authToken) return;

    const promoAmountNum = upgradeForm.promoAmount.trim()
      ? Math.round(Number(upgradeForm.promoAmount) * 100)
      : null;

    if (promoAmountNum !== null && !Number.isFinite(promoAmountNum)) {
      toast.error('Promo amount must be a valid number');
      return;
    }

    try {
      await axios.post(
        `${BACKEND}/api/admin/orgs/${upgradeOrg.orgId}/upgrade`,
        {
          tier: upgradeForm.tier,
          cycle: upgradeForm.cycle,
          currency: upgradeForm.currency,
          seats: upgradeForm.seats,
          status: upgradeForm.status,
          endAt: upgradeForm.endAt ? new Date(`${upgradeForm.endAt}T00:00:00Z`).toISOString() : null,
          note: upgradeForm.note || undefined,
          amount_cents_override: promoAmountNum ?? undefined,
          promo_reason: upgradeForm.promoReason || undefined,
        },
        { headers: { ...headers, 'Content-Type': 'application/json' } }
      );
      toast.success('Subscription updated');
      setUpgradeOrg(null);
      await fetchOrgs();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Upgrade failed'));
    }
  };

  const openHistory = async (org: OrgRow) => {
    setViewingOrg(org);
    await fetchHistory(org);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="app-heading">Institutions</p>
          <p className="text-sm text-mutedGray dark:text-darkTextSecondary">
            Search institutions and manage subscription history.
          </p>
        </div>
        <button
          type="button"
          className="chip flex items-center gap-2"
          onClick={fetchOrgs}
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="panel p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="block">
          <span className="text-xs">Search</span>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mutedGray" />
            <input
              className="input pl-9"
              placeholder="Name, domain, or org ID"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </label>

        <label className="block">
          <span className="text-xs">Limit</span>
          <input
            type="number"
            min={1}
            max={200}
            className="input mt-1"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          />
        </label>

        <div className="flex items-end gap-2">
          <button type="button" className="btn" onClick={fetchOrgs}>
            Search
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              setQ('');
              setLimit(100);
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {err && <div className="panel p-3 text-sm text-red-500">{err}</div>}
      {loading && (
        <div className="panel p-4 text-sm text-mutedGray dark:text-darkTextSecondary">
          Loading institutions…
        </div>
      )}
      {!loading && !list.length && !err && (
        <div className="panel p-4 text-sm text-mutedGray dark:text-darkTextSecondary">
          No institutions found.
        </div>
      )}

      {!!list.length && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-white/10 sticky top-0 z-10">
              <tr>
                <th className="text-left p-2">Org</th>
                <th className="text-left p-2">Current Tier</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Cycle</th>
                <th className="text-left p-2">Currency</th>
                <th className="text-left p-2">Seats</th>
                <th className="text-left p-2">End date</th>
                <th className="text-right p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((org) => {
                const sub = org.currentSub;
                return (
                  <tr key={org.orgId} className="border-t">
                    <td className="p-2 align-top">
                      <div className="font-medium">{org.name}</div>
                      <div className="text-[11px] text-mutedGray dark:text-darkTextSecondary">
                        {org.emailDomain || '—'} · {org.membersCount} members
                      </div>
                      <div className="text-[11px] text-mutedGray dark:text-darkTextSecondary">
                        {org.orgId}
                      </div>
                    </td>
                    <td className="p-2 align-top">{sub?.tier || 'starter'}</td>
                    <td className="p-2 align-top">
                      <span className={`chip ${sub?.status === 'active' ? 'chip-active' : ''}`}>
                        {sub?.status || '—'}
                      </span>
                    </td>
                    <td className="p-2 align-top">{sub?.cycle || '—'}</td>
                    <td className="p-2 align-top">{sub?.currency || '—'}</td>
                    <td className="p-2 align-top">{sub?.seats ?? '—'}</td>
                    <td className="p-2 align-top">{formatDate(sub?.endAt)}</td>
                    <td className="p-2 align-top">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="chip flex items-center gap-2"
                          onClick={() => openHistory(org)}
                        >
                          <Eye className="w-4 h-4" />
                          <span className="hidden sm:inline">View</span>
                        </button>
                        <button
                          type="button"
                          className="chip flex items-center gap-2"
                          onClick={() => setUpgradeOrg(org)}
                        >
                          Upgrade
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {viewingOrg &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setViewingOrg(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="w-full sm:max-w-4xl sm:w-[92vw] max-h-[90vh] overflow-auto rounded-2xl bg-white dark:bg-neutral-900 shadow-2xl p-4 sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="app-heading">Subscription History</h3>
                  <p className="text-xs text-mutedGray dark:text-darkTextSecondary">
                    {viewingOrg.name}
                  </p>
                </div>
                <button className="chip" onClick={() => setViewingOrg(null)} aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {historyLoading && (
                <div className="panel p-4 text-sm text-mutedGray dark:text-darkTextSecondary">
                  Loading subscription history…
                </div>
              )}

              {!historyLoading && !history.length && (
                <div className="panel p-4 text-sm text-mutedGray dark:text-darkTextSecondary">
                  No subscription history yet.
                </div>
              )}

              {!!history.length && (
                <div className="overflow-auto rounded border">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 dark:bg-white/10 sticky top-0 z-10">
                      <tr>
                        <th className="text-left p-2">Tier</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Cycle</th>
                        <th className="text-left p-2">Currency</th>
                        <th className="text-left p-2">Seats</th>
                        <th className="text-left p-2">Amount</th>
                        <th className="text-left p-2">Started</th>
                        <th className="text-left p-2">End</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((row) => (
                        <tr key={row.id} className="border-t">
                          <td className="p-2 align-top">
                            <div className="font-medium capitalize">{row.tier}</div>
                            <div className="text-[11px] text-mutedGray dark:text-darkTextSecondary">
                              ID: {row.id}
                            </div>
                          </td>
                          <td className="p-2 align-top">
                            <span className={`chip ${row.status === 'active' ? 'chip-active' : ''}`}>
                              {row.status || '—'}
                            </span>
                          </td>
                          <td className="p-2 align-top">{row.cycle || '—'}</td>
                          <td className="p-2 align-top">{row.currency || '—'}</td>
                          <td className="p-2 align-top">{row.seats}</td>
                          <td className="p-2 align-top">
                            {formatMoney(row.amount_cents, row.currency)}
                          </td>
                          <td className="p-2 align-top">{formatDate(row.started_at)}</td>
                          <td className="p-2 align-top">{formatDate(row.expires_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {upgradeOrg &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setUpgradeOrg(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="w-full sm:max-w-2xl sm:w-[92vw] max-h-[90vh] overflow-auto rounded-2xl bg-white dark:bg-neutral-900 shadow-2xl p-4 sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="app-heading">Upgrade Subscription</h3>
                  <p className="text-xs text-mutedGray dark:text-darkTextSecondary">
                    {upgradeOrg.name}
                  </p>
                </div>
                <button className="chip" onClick={() => setUpgradeOrg(null)} aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={onUpgradeSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm">Tier</span>
                  <select
                    className="input mt-1"
                    value={upgradeForm.tier}
                    onChange={(e) =>
                      setUpgradeForm((prev) => ({ ...prev, tier: e.target.value as Tier }))
                    }
                  >
                    {TIER_OPTIONS.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm">Status</span>
                  <select
                    className="input mt-1"
                    value={upgradeForm.status}
                    onChange={(e) =>
                      setUpgradeForm((prev) => ({ ...prev, status: e.target.value as Status }))
                    }
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm">Cycle</span>
                  <select
                    className="input mt-1"
                    value={upgradeForm.cycle}
                    onChange={(e) =>
                      setUpgradeForm((prev) => ({ ...prev, cycle: e.target.value as Cycle }))
                    }
                  >
                    {CYCLE_OPTIONS.map((cycle) => (
                      <option key={cycle} value={cycle}>
                        {cycle}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm">Currency</span>
                  <select
                    className="input mt-1"
                    value={upgradeForm.currency}
                    onChange={(e) =>
                      setUpgradeForm((prev) => ({ ...prev, currency: e.target.value as Currency }))
                    }
                  >
                    {CURRENCY_OPTIONS.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm">Seats</span>
                  <input
                    type="number"
                    className="input mt-1"
                    min={1}
                    value={upgradeForm.seats}
                    onChange={(e) =>
                      setUpgradeForm((prev) => ({ ...prev, seats: Number(e.target.value) }))
                    }
                  />
                </label>

                <label className="block">
                  <span className="text-sm">End date</span>
                  <input
                    type="date"
                    className="input mt-1"
                    value={upgradeForm.endAt}
                    onChange={(e) => setUpgradeForm((prev) => ({ ...prev, endAt: e.target.value }))}
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="text-sm">Admin note</span>
                  <input
                    className="input mt-1"
                    value={upgradeForm.note}
                    onChange={(e) => setUpgradeForm((prev) => ({ ...prev, note: e.target.value }))}
                    placeholder="Optional note for the subscription record"
                  />
                </label>

                <label className="block">
                  <span className="text-sm">Promo price (optional)</span>
                  <input
                    className="input mt-1"
                    value={upgradeForm.promoAmount}
                    onChange={(e) =>
                      setUpgradeForm((prev) => ({ ...prev, promoAmount: e.target.value }))
                    }
                    placeholder="e.g. 99.00"
                  />
                </label>

                <label className="block">
                  <span className="text-sm">Promo reason</span>
                  <input
                    className="input mt-1"
                    value={upgradeForm.promoReason}
                    onChange={(e) =>
                      setUpgradeForm((prev) => ({ ...prev, promoReason: e.target.value }))
                    }
                    placeholder="Campaign / ad code / note"
                  />
                </label>

                <div className="flex justify-between md:col-span-2 mt-2">
                  <button type="button" className="btn-outline" onClick={() => setUpgradeOrg(null)}>
                    Cancel
                  </button>
                  <button className="btn" type="submit">
                    Save upgrade
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {loading && (
        <div className="flex items-center gap-2 text-xs text-mutedGray">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      )}
    </div>
  );
}
