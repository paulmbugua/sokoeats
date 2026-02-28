import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useShopContext } from '@myhandymanapp/shared/context/ShopContext';
import { createPortal } from 'react-dom';
import { Loader2, Pencil, RefreshCw, X } from 'lucide-react';

const CURRENCY_OPTIONS = ['USD', 'KES'] as const;

type Currency = (typeof CURRENCY_OPTIONS)[number];

type PricingTier = {
  seats: number;
  monthly: number | null;
  yearly: number | null;
};

type PricingTable = {
  currency: Currency;
  tiers: {
    starter: PricingTier;
    pro: PricingTier;
    enterprise: PricingTier;
  };
};

type PricingOverride = {
  id: number;
  currency: Currency;
  tier: 'pro' | 'enterprise';
  cycle: 'monthly' | 'yearly';
  amount_cents: number;
  active: boolean;
  note: string | null;
  updated_at: string | null;
};

type EditTarget = {
  tier: 'pro' | 'enterprise';
  cycle: 'monthly' | 'yearly';
  currency: Currency;
  amount: string;
  note: string;
  active: boolean;
};

function pickBackend(): string {
  const v =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BACKEND_URL) ||
    (typeof window !== 'undefined' && (window as any).__BACKEND_URL__) ||
    'http://localhost:4000';
  return String(v).replace(/\/+$/, '');
}

function formatAmount(currency: Currency, cents: number | null) {
  if (cents == null) return '—';
  const amount = cents / 100;
  if (currency === 'KES') return `KSh ${amount.toLocaleString()}`;
  return `$ ${amount.toFixed(2)}`;
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

export default function OrgPricingManage() {
  const { backendUrl: ctxBackendUrl, adminToken, token } = useShopContext();
  const BACKEND = useMemo(() => (ctxBackendUrl || pickBackend()).replace(/\/+$/, ''), [
    ctxBackendUrl,
  ]);
  const authToken = adminToken || token || '';

  const [currency, setCurrency] = useState<Currency>('USD');
  const [table, setTable] = useState<PricingTable | null>(null);
  const [overrides, setOverrides] = useState<PricingOverride[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const headers = useMemo(() => {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (authToken) h.Authorization = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  const overrideMap = useMemo(() => {
    const map = new Map<string, PricingOverride>();
    overrides.forEach((row) => {
      map.set(`${row.tier}:${row.cycle}`, row);
    });
    return map;
  }, [overrides]);

  const fetchPricing = useCallback(async () => {
    if (!BACKEND || !authToken) return;
    setLoading(true);
    try {
      const res = await axios.get<{
        success: boolean;
        table: PricingTable;
        overrides: PricingOverride[];
        message?: string;
      }>(`${BACKEND}/api/admin/org-pricing`, {
        params: { currency },
        headers,
        validateStatus: () => true,
      });

      if (!res.data?.success) {
        throw new Error(res.data?.message || 'Failed to load pricing');
      }

      setTable(res.data.table);
      setOverrides(res.data.overrides || []);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Failed to load pricing'));
    } finally {
      setLoading(false);
    }
  }, [BACKEND, authToken, currency, headers]);

  useEffect(() => {
    fetchPricing();
  }, [fetchPricing]);

  useEffect(() => {
    if (!editing) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditing(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [editing]);

  const openEditor = (tier: 'pro' | 'enterprise', cycle: 'monthly' | 'yearly') => {
    const override = overrideMap.get(`${tier}:${cycle}`);
    const amountCents = table?.tiers?.[tier]?.[cycle] ?? null;
    const fallbackAmount = amountCents != null ? String(amountCents / 100) : '';
    setEditing({
      tier,
      cycle,
      currency,
      amount: override ? String(override.amount_cents / 100) : fallbackAmount,
      note: override?.note || '',
      active: override?.active ?? true,
    });
  };

  const onSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing || !BACKEND || !authToken) return;

    const amountNum = Number(editing.amount);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      toast.error('Amount must be a non-negative number');
      return;
    }

    const amountCents = Math.round(amountNum * 100);

    try {
      await axios.post(
        `${BACKEND}/api/admin/org-pricing`,
        {
          currency: editing.currency,
          tier: editing.tier,
          cycle: editing.cycle,
          amount_cents: amountCents,
          note: editing.note || null,
          active: editing.active,
        },
        { headers: { ...headers, 'Content-Type': 'application/json' } }
      );
      toast.success('Pricing override saved');
      setEditing(null);
      await fetchPricing();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Save failed'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="app-heading">Org Pricing Overrides</p>
          <p className="text-sm text-mutedGray dark:text-darkTextSecondary">
            Override Pro/Enterprise prices for campaigns or special discounts.
          </p>
        </div>
        <button className="chip flex items-center gap-2" type="button" onClick={fetchPricing}>
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="panel p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <label className="block">
          <span className="text-xs">Currency</span>
          <select
            className="input mt-1"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
          >
            {CURRENCY_OPTIONS.map((curr) => (
              <option key={curr} value={curr}>
                {curr}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && (
        <div className="panel p-4 text-sm text-mutedGray dark:text-darkTextSecondary">
          <Loader2 className="w-4 h-4 inline-block mr-2 animate-spin" />
          Loading pricing…
        </div>
      )}

      {table && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-white/10 sticky top-0 z-10">
              <tr>
                <th className="text-left p-2">Tier</th>
                <th className="text-left p-2">Monthly</th>
                <th className="text-left p-2">Yearly</th>
                <th className="text-left p-2">Seats</th>
              </tr>
            </thead>
            <tbody>
              {(['pro', 'enterprise'] as const).map((tier) => (
                <tr key={tier} className="border-t">
                  <td className="p-2 font-medium capitalize">{tier}</td>
                  {(['monthly', 'yearly'] as const).map((cycle) => {
                    const override = overrideMap.get(`${tier}:${cycle}`);
                    const amount = table.tiers[tier][cycle];
                    return (
                      <td key={cycle} className="p-2 align-top">
                        <div className="flex flex-col gap-2">
                          <span>{formatAmount(table.currency, amount)}</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="chip flex items-center gap-1"
                              onClick={() => openEditor(tier, cycle)}
                            >
                              <Pencil className="w-3 h-3" />
                              Edit
                            </button>
                            {override && (
                              <span
                                className={`text-[11px] px-2 py-0.5 rounded-full border ${
                                  override.active
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-gray-200 bg-gray-100 text-gray-500'
                                }`}
                              >
                                {override.active ? 'Override' : 'Inactive'}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                  <td className="p-2 align-top">{table.tiers[tier].seats}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Overrides ({currency})</p>
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-white/10 sticky top-0 z-10">
              <tr>
                <th className="text-left p-2">Tier</th>
                <th className="text-left p-2">Cycle</th>
                <th className="text-left p-2">Amount</th>
                <th className="text-left p-2">Active</th>
                <th className="text-left p-2">Note</th>
                <th className="text-right p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!overrides.length && (
                <tr>
                  <td colSpan={6} className="p-3 text-mutedGray">
                    No overrides yet.
                  </td>
                </tr>
              )}
              {overrides.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="p-2 capitalize">{row.tier}</td>
                  <td className="p-2 capitalize">{row.cycle}</td>
                  <td className="p-2">{formatAmount(row.currency, row.amount_cents)}</td>
                  <td className="p-2">{row.active ? 'Yes' : 'No'}</td>
                  <td className="p-2 max-w-[240px] truncate">{row.note || '—'}</td>
                  <td className="p-2 text-right">
                    <button
                      type="button"
                      className="chip"
                      onClick={() => openEditor(row.tier, row.cycle)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setEditing(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="w-full sm:max-w-lg sm:w-[92vw] max-h-[90vh] overflow-auto rounded-2xl bg-white dark:bg-neutral-900 shadow-2xl p-4 sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="app-heading">Edit Pricing Override</h3>
                  <p className="text-xs text-mutedGray dark:text-darkTextSecondary">
                    {editing.tier} · {editing.cycle} · {editing.currency}
                  </p>
                </div>
                <button className="chip" onClick={() => setEditing(null)} aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={onSave} className="grid grid-cols-1 gap-3">
                <label className="block">
                  <span className="text-sm">Amount ({editing.currency})</span>
                  <input
                    className="input mt-1"
                    value={editing.amount}
                    onChange={(e) => setEditing((prev) => (prev ? { ...prev, amount: e.target.value } : prev))}
                    placeholder="e.g. 99.00"
                  />
                </label>

                <label className="block">
                  <span className="text-sm">Note</span>
                  <input
                    className="input mt-1"
                    value={editing.note}
                    onChange={(e) => setEditing((prev) => (prev ? { ...prev, note: e.target.value } : prev))}
                    placeholder="Campaign code / promo note"
                  />
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.active}
                    onChange={(e) => setEditing((prev) => (prev ? { ...prev, active: e.target.checked } : prev))}
                  />
                  Active override
                </label>

                <div className="flex justify-between mt-2">
                  <button type="button" className="btn-outline" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                  <button className="btn" type="submit">
                    Save override
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
