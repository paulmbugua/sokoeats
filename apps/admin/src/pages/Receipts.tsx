// apps/admin/src/pages/Receipts.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useShopContext } from '@myhandymanapp/shared/context';
import {
  FileDown,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  ChevronDown,
  Eye,
  Download,
} from 'lucide-react';

type Method = 'All' | 'PayPal' | 'M-Pesa';
type Status = 'All' | 'Completed' | 'Pending' | 'Failed';

type Tx = {
  id: string;
  userEmail: string;
  userName?: string;
  method: 'PayPal' | 'M-Pesa' | 'Wise';
  amount: number;
  currency: 'USD' | 'KES';
  status: 'Pending' | 'Completed' | 'Failed';
  date: string; // ISO
  captureId?: string;
  orderId?: string; // PayPal order / M-Pesa CheckoutRequestID
  mpesaRef?: string; // M-Pesa receipt
};

function pickBackend(): string {
  const v =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BACKEND_URL) ||
    (typeof window !== 'undefined' && (window as any).__BACKEND_URL__) ||
    'http://localhost:4005';
  return String(v).replace(/\/+$/, '');
}

function normalizeStatus(s: string | undefined | null): Tx['status'] {
  const v = String(s ?? '').toLowerCase();
  if (['completed', 'success', 'succeeded', 'captured', 'approved'].includes(v)) return 'Completed';
  if (['pending', 'processing', 'in_progress', 'authorized', 'queued'].includes(v))
    return 'Pending';
  return 'Failed';
}
function guessMethod(raw: any): Tx['method'] {
  const m = String(raw?.method ?? raw?.paymentMethod ?? raw?.payment_method ?? '').toLowerCase();
  if (m.includes('mpesa') || raw?.mpesa_reference) return 'M-Pesa';
  if (m.includes('wise')) return 'Wise';
  return 'PayPal';
}
function coerceTx(raw: any): Tx {
  const method = guessMethod(raw);
  const currency =
    (String(raw?.currency ?? raw?.currencyCode ?? '').toUpperCase() as 'USD' | 'KES') ||
    (raw?.amountKES ? 'KES' : 'USD');
  const amountNum = Number(
    raw?.amount ??
      raw?.amountUsd ??
      raw?.amountUSD ??
      raw?.amountKES ??
      raw?.total ??
      raw?.value ??
      0
  );
  const created =
    raw?.created_at ?? raw?.createdAt ?? raw?.date ?? raw?.timestamp ?? new Date().toISOString();

  const id = String(
    raw?.id ??
      raw?.payment_id ??
      raw?.txId ??
      raw?.transactionId ??
      raw?.transaction_id ??
      raw?.captureId ??
      raw?.capture_id ??
      raw?.orderId ??
      raw?.order_id ??
      raw?.mpesa_reference ??
      `${Date.now()}`
  );

  return {
    id,
    userEmail: raw?.user_email ?? raw?.email ?? raw?.payer?.email_address ?? '—',
    userName: raw?.user_name ?? undefined,
    method,
    amount: Number.isFinite(amountNum) ? amountNum : 0,
    currency: currency === 'KES' ? 'KES' : 'USD',
    status: normalizeStatus(raw?.status ?? raw?.state ?? raw?.payment_status),
    date: new Date(created).toISOString(),
    captureId: raw?.capture_id ?? undefined,
    orderId: raw?.order_id ?? raw?.transaction_id ?? undefined,
    mpesaRef: raw?.mpesa_reference ?? undefined,
  };
}

function fmtAmount(t: Tx) {
  return t.currency === 'USD' ? `$ ${t.amount.toFixed(2)}` : `KSh ${t.amount.toLocaleString()}`;
}
function toISOStart(d: string) {
  return new Date(`${d}T00:00:00Z`).toISOString();
}
function toISOEndExclusive(d: string) {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString();
}

export default function Receipts() {
  const { backendUrl: ctxBackendUrl, adminToken, token } = useShopContext();
  const BACKEND = useMemo(() => (ctxBackendUrl || pickBackend()).replace(/\/+$/, ''), [ctxBackendUrl]);
  const authToken = adminToken || token || '';
  const [list, setList] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Filters
  const [method, setMethod] = useState<Method>('All');
  const [status, setStatus] = useState<Status>('All');
  const [email, setEmail] = useState('');
  const [q, setQ] = useState('');
  const [since, setSince] = useState(''); // yyyy-mm-dd
  const [until, setUntil] = useState(''); // yyyy-mm-dd
  const [limit, setLimit] = useState(100);

  // Selection for bulk open/print
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const allSelected = list.length > 0 && list.every((t) => selected[t.id]);
  const toggleAll = () => {
    if (allSelected) setSelected({});
    else setSelected(Object.fromEntries(list.map((t) => [t.id, true])));
  };

  // Auto refresh
  const [auto, setAuto] = useState(false);
  const timerRef = useRef<number | null>(null);

  const fetchReceipts = useCallback(async () => {
    if (!BACKEND || !authToken) {
      setErr('Not signed in. Please log in as an admin.');
      return;
    }
    setLoading(true);
    setErr(null);

    const params: Record<string, string> = { limit: String(limit) };
    if (method !== 'All') params.method = method.toLowerCase() === 'm-pesa' ? 'mpesa' : 'paypal';
    if (status !== 'All') params.status = status;
    if (email.trim()) params.email = email.trim();
    if (q.trim()) params.q = q.trim();
    if (since) params.since = toISOStart(since);
    if (until) params.until = toISOEndExclusive(until);

    try {
      const url = `${BACKEND}/api/admin/transactions`;
      const res = await axios.get(url, {
        params,
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
        validateStatus: () => true,
      });

      if (res.status === 401) throw new Error('Unauthorized. Please sign in as admin.');
      if (res.status === 403) throw new Error('Forbidden. Your account lacks admin access.');
      if (!res.data?.success) {
        throw new Error(
          typeof res.data?.message === 'string' ? res.data.message : `HTTP ${res.status}`
        );
      }

      const rows = Array.isArray(res.data?.transactions) ? res.data.transactions : [];
      const mapped: Tx[] = rows.map(coerceTx);
      mapped.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setList(mapped);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load receipts');
    } finally {
      setLoading(false);
    }
  }, [BACKEND, authToken, method, status, email, q, since, until, limit]);

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  // Auto-refresh interval
  useEffect(() => {
    if (!auto) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = window.setInterval(() => {
      fetchReceipts();
    }, 30000) as unknown as number;
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [auto, fetchReceipts]);

  const quickRange = (days: number) => {
    const now = new Date();
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); // today UTC start
    const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - (days - 1));
    const toStr = (d: Date) => d.toISOString().slice(0, 10);
    setSince(toStr(start));
    setUntil(toStr(end));
  };

  const openOrDownloadPdf = async (t: Tx, mode: 'view' | 'download') => {
    try {
      const params: Record<string, string> = { format: 'pdf' };
      if (t.userEmail) params.email = t.userEmail;
      if (t.captureId) params.captureId = t.captureId;
      else if (t.orderId) params.orderId = t.orderId;
      else if (t.mpesaRef) params.mpesaRef = t.mpesaRef;
      else params.id = t.id;

      const res = await axios.get(`${BACKEND}/api/admin/proof`, {
        params,
        headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/pdf' },
        responseType: 'blob',
        validateStatus: () => true,
      });

      if (res.status === 401) throw new Error('Unauthorized. Please sign in as admin.');

      if (String(res.headers['content-type'] || '').includes('application/pdf')) {
        const blob = new Blob([res.data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const refName =
          params.captureId || params.orderId || params.mpesaRef || params.id || 'receipt';
        if (mode === 'download') {
          const a = document.createElement('a');
          a.href = url;
          a.download = `DayBreak_Receipt_${refName}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        } else {
          window.open(url, '_blank', 'noopener,noreferrer');
          // no revoke — let the browser manage lifecycle while tab is open
        }
        return;
      }

      // JSON error body
      let text = '';
      try {
        text = await (res.data as Blob).text();
      } catch {
        text = String(res.data || '');
      }
      try {
        const j = JSON.parse(text);
        throw new Error(
          j?.message || j?.error || `Failed to generate receipt (HTTP ${res.status})`
        );
      } catch {
        throw new Error(text || `Failed to generate receipt (HTTP ${res.status})`);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Could not generate receipt');
    }
  };

  const bulkOpen = async () => {
    const items = list.filter((t) => selected[t.id]);
    if (!items.length) {
      toast.info('Select at least one receipt');
      return;
    }
    // Try to open up to 6 at once to reduce popup blocking
    for (let i = 0; i < items.length; i++) {
      await openOrDownloadPdf(items[i], 'view');
      await new Promise((r) => setTimeout(r, 150)); // tiny delay helps some browsers
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="app-heading">Receipts</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchReceipts}
            className="chip flex items-center gap-2"
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <label className="chip flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mr-1"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
            Auto-refresh
          </label>
        </div>
      </div>

      {/* Filters */}
      <div className="panel p-4 space-y-3">
        <div className="grid lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] gap-3">
          <div>
            <span className="text-xs block mb-1">Method</span>
            <div className="relative">
              <select
                className="input pr-8"
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
              >
                <option>All</option>
                <option>PayPal</option>
                <option>M-Pesa</option>
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div>
            <span className="text-xs block mb-1">Status</span>
            <div className="relative">
              <select
                className="input pr-8"
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
              >
                <option>All</option>
                <option>Completed</option>
                <option>Pending</option>
                <option>Failed</option>
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <label className="block">
            <span className="text-xs">Buyer Email</span>
            <input
              className="input mt-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@example.com"
            />
          </label>

          <label className="block">
            <span className="text-xs">Search (Order/Capture/M-Pesa/Email)</span>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-mutedGray" />
              <input
                className="input pl-8 mt-1"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="e.g. 7A2469... or QDT3..."
              />
            </div>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs">From</span>
              <input
                className="input mt-1"
                type="date"
                value={since}
                onChange={(e) => setSince(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs">To</span>
              <input
                className="input mt-1"
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2 items-end">
            <div>
              <span className="text-xs">Rows</span>
              <input
                className="input mt-1"
                type="number"
                min={10}
                max={500}
                step={10}
                value={limit}
                onChange={(e) =>
                  setLimit(Math.max(10, Math.min(500, Number(e.target.value) || 100)))
                }
              />
            </div>
            <button className="btn" onClick={fetchReceipts} disabled={loading}>
              Apply
            </button>
          </div>
        </div>

        {/* Quick ranges */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs self-center text-mutedGray dark:text-darkTextSecondary">
            Quick range:
          </span>
          {[
            { d: 1, label: 'Today' },
            { d: 3, label: 'Last 3 days' },
            { d: 7, label: 'Last 7 days' },
            { d: 30, label: 'Last 30 days' },
          ].map((r) => (
            <button key={r.d} className="chip" onClick={() => quickRange(r.d)}>
              {r.label}
            </button>
          ))}
          <button
            className="chip"
            onClick={() => {
              setSince('');
              setUntil('');
            }}
          >
            Clear dates
          </button>
        </div>
      </div>

      {err && <div className="panel p-3 text-sm text-red-500">{err}</div>}
      {loading && (
        <div className="panel p-4 text-sm text-mutedGray dark:text-darkTextSecondary">
          Loading receipts…
        </div>
      )}
      {!loading && !list.length && !err && (
        <div className="panel p-4 text-sm text-mutedGray dark:text-darkTextSecondary">
          No receipts found.
        </div>
      )}

      {/* Bulk bar */}
      {!!list.length && (
        <div className="panel p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              <span className="text-sm">Select all</span>
            </label>
            <span className="text-xs text-mutedGray dark:text-darkTextSecondary">
              {Object.values(selected).filter(Boolean).length} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button className="chip flex items-center gap-2" onClick={bulkOpen}>
              <Printer className="w-4 h-4" />
              Open PDFs
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {!!list.length && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-white/10 sticky top-0 z-10">
              <tr>
                <th className="text-left p-2 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Buyer</th>
                <th className="text-left p-2">Method</th>
                <th className="text-left p-2">Amount</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Refs</th>
                <th className="text-right p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="p-2 align-top">
                    <input
                      type="checkbox"
                      checked={!!selected[t.id]}
                      onChange={(e) => setSelected((s) => ({ ...s, [t.id]: e.target.checked }))}
                    />
                  </td>
                  <td className="p-2 align-top">
                    <div>{new Date(t.date).toLocaleString()}</div>
                    <div className="text-[11px] text-mutedGray dark:text-darkTextSecondary">
                      ID: {t.id}
                    </div>
                  </td>
                  <td className="p-2 align-top">
                    <div className="font-medium">{t.userEmail || '—'}</div>
                    <div className="text-[11px] text-mutedGray dark:text-darkTextSecondary">
                      {t.userName || '—'}
                    </div>
                  </td>
                  <td className="p-2 align-top">{t.method}</td>
                  <td className="p-2 align-top">{fmtAmount(t)}</td>
                  <td className="p-2 align-top">
                    <span className={`chip ${t.status === 'Completed' ? 'chip-active' : ''}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="p-2 align-top">
                    <div className="text-[12px]">
                      {t.orderId ? (
                        <>
                          Order: <span className="font-mono">{t.orderId}</span>
                          <br />
                        </>
                      ) : null}
                      {t.captureId ? (
                        <>
                          Capture: <span className="font-mono">{t.captureId}</span>
                          <br />
                        </>
                      ) : null}
                      {t.mpesaRef ? (
                        <>
                          M-Pesa: <span className="font-mono">{t.mpesaRef}</span>
                        </>
                      ) : null}
                      {!t.orderId && !t.captureId && !t.mpesaRef ? (
                        <span className="text-mutedGray">—</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="p-2 align-top">
                    <div className="flex justify-end gap-2">
                      <button
                        className="chip flex items-center gap-2"
                        title="View PDF (print in browser)"
                        onClick={() => openOrDownloadPdf(t, 'view')}
                      >
                        <Eye className="w-4 h-4" />
                        <span className="hidden sm:inline">View</span>
                      </button>
                      <button
                        className="chip flex items-center gap-2"
                        title="Download PDF"
                        onClick={() => openOrDownloadPdf(t, 'download')}
                      >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Download</span>
                      </button>
                      <button
                        className="chip flex items-center gap-2"
                        title="Quick print (opens PDF)"
                        onClick={() => openOrDownloadPdf(t, 'view')}
                      >
                        <Printer className="w-4 h-4" />
                        <span className="hidden sm:inline">Print</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-mutedGray dark:text-darkTextSecondary">
        Tip: Use “View” to open the PDF in a new tab, then press <b>Ctrl/Cmd + P</b>. “Open PDFs”
        will open all selected receipts.
      </p>
    </div>
  );
}
