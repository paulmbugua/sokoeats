import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { CreditCard, Receipt, RefreshCw } from 'lucide-react';
import { useShopContext } from '@myhandymanapp/shared/context';

type Tx = {
  id: string;
  userEmail: string;
  method: 'PayPal' | 'M-Pesa' | 'Wise';
  amount: number;
  currency: 'USD' | 'KES';
  status: 'Pending' | 'Completed' | 'Failed';
  date: string; // ISO

  // common references
  captureId?: string; // PayPal
  orderId?: string; // PayPal order/transaction or M-Pesa CheckoutRequestID
  mpesaRef?: string; // M-Pesa receipt code
  source?: 'payment' | 'withdrawal';

  // extra details for the expander
  userName?: string;
  provider?: string;
  providerOrderId?: string;
  intent?: string;
  payerEmail?: string;
  phone?: string;
  packageId?: number;
  credits?: number;
  offer?: string | null;
  createdAt?: string;
  updatedAt?: string;
  rawMeta?: Record<string, any> | null;
};

type Props = {
  token?: string; // optional override; defaults to context token(s)
  backendUrl?: string; // optional override; defaults to context backendUrl
};

function normalizeStatus(s: string | undefined | null): Tx['status'] {
  const v = String(s ?? '').toLowerCase();
  if (['completed', 'success', 'succeeded', 'captured', 'approved'].includes(v)) return 'Completed';
  if (['pending', 'processing', 'in_progress', 'authorized', 'queued'].includes(v))
    return 'Pending';
  return 'Failed';
}

function guessMethod(raw: any): Tx['method'] {
  const m = String(
    raw?.method ?? raw?.paymentMethod ?? raw?.payment_method ?? raw?.payout_method ?? ''
  ).toLowerCase();

  if (m.includes('wise')) return 'Wise';
  if (
    m.includes('mpesa') ||
    m.includes('m-pesa') ||
    raw?.mpesaReceiptNumber ||
    raw?.mpesa_reference
  ) {
    return 'M-Pesa';
  }
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

  const status = normalizeStatus(raw?.status ?? raw?.state ?? raw?.payment_status);

  const created = raw?.created_at ?? raw?.createdAt ?? raw?.date ?? raw?.timestamp;
  const updated = raw?.updated_at ?? raw?.updatedAt ?? created;

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
      raw?.mpesaReceiptNumber ??
      raw?.mpesa_reference ??
      `${Date.now()}`
  );

  const rawMeta =
    typeof raw?.meta === 'object' && raw?.meta !== null
      ? raw.meta
      : (() => {
          try {
            if (typeof raw?.meta === 'string' && raw.meta.trim().length) {
              return JSON.parse(raw.meta);
            }
          } catch {}
          return null;
        })();

  return {
    id,
    userEmail: raw?.user_email ?? raw?.userEmail ?? raw?.email ?? raw?.payer?.email_address ?? '—',
    userName: raw?.user_name ?? raw?.userName ?? undefined,
    method,
    amount: Number.isFinite(amountNum) ? amountNum : 0,
    currency: currency === 'KES' ? 'KES' : 'USD',
    status,
    date: new Date(created || Date.now()).toISOString(),
    createdAt: created ? new Date(created).toISOString() : undefined,
    updatedAt: updated ? new Date(updated).toISOString() : undefined,

    captureId: raw?.capture_id ?? raw?.captureId ?? undefined,
    orderId: raw?.order_id ?? raw?.orderId ?? raw?.transaction_id ?? undefined,
    mpesaRef: raw?.mpesa_reference ?? raw?.mpesaRef ?? undefined,

    provider: raw?.provider ?? undefined,
    providerOrderId: raw?.provider_order_id ?? undefined,
    intent: raw?.intent ?? undefined,
    payerEmail: raw?.payer_email ?? undefined,
    phone: raw?.phone ?? undefined,

    packageId: raw?.package_id ?? undefined,
    credits: raw?.credits ?? undefined,
    offer: raw?.offer ?? undefined,

    rawMeta,
    source: raw?.source === 'withdrawal' || raw?.source === 'payment' ? raw.source : undefined,
  };
}

function fmtAmount(t: Tx) {
  return t.currency === 'USD' ? `$ ${t.amount.toFixed(2)}` : `KSh ${t.amount.toLocaleString()}`;
}

export default function Transactions({ token, backendUrl: backendUrlOverride }: Props) {
  // ⬇️ Prefer adminToken; then fall back to normal token; props.override wins if passed.
  const { backendUrl: ctxBackend, token: ctxToken, adminToken: ctxAdminToken } = useShopContext();
  const base = useMemo(
    () => (backendUrlOverride || ctxBackend || '').replace(/\/+$/, ''),
    [backendUrlOverride, ctxBackend]
  );
  const authToken = token || ctxAdminToken || ctxToken || '';

  const [tx, setTx] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setOpen((s) => ({ ...s, [id]: !s[id] }));

  const fetchTx = useCallback(async () => {
    if (!base) return;
    if (!authToken) {
      setErr('Not signed in. Please log in as an admin.');
      return;
    }

    setLoading(true);
    setErr(null);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
    };

    const tryUrls = [
      `${base}/api/admin/financials?kind=all&limit=100`, // unified feed (payments + withdrawals)
      `${base}/api/admin/transactions?limit=100`, // payments-only fallback
    ];

    let lastError: any = null;
    for (const url of tryUrls) {
      try {
        const res = await fetch(url, { headers });
        if (res.status === 404) continue;

        if (res.status === 401) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.message || 'Unauthorized. Please log in as an admin.');
        }
        if (res.status === 403) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.message || 'Forbidden. Your account lacks admin access.');
        }
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`);
        }

        const data = await res.json();
        const list = Array.isArray(data?.transactions)
          ? data.transactions
          : Array.isArray(data)
            ? data
            : [];

        const mapped: Tx[] = list.map(coerceTx);
        mapped.sort((a: Tx, b: Tx) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setTx(mapped);
        setLoading(false);
        return;
      } catch (e) {
        lastError = e;
        const msg = String((e as any).message || '').toLowerCase();
        if (msg.includes('unauthorized') || msg.includes('forbidden')) break; // no point trying more
      }
    }

    setLoading(false);
    setErr(
      `Failed to load transactions${lastError ? `: ${String((lastError as any).message || lastError)}` : ''}`
    );
  }, [base, authToken]);

  useEffect(() => {
    fetchTx();
  }, [fetchTx]);

  const openReceipt = async (t: Tx) => {
    if (!base || !authToken) {
      alert('Not signed in. Please log in as an admin.');
      return;
    }

    const qs = new URLSearchParams();
    qs.set('format', 'pdf');
    if (t.captureId) qs.set('captureId', t.captureId);
    else if (t.orderId) qs.set('orderId', t.orderId);
    else if (t.mpesaRef) qs.set('mpesaRef', t.mpesaRef);
    else qs.set('id', t.id); // fallback: DB row id

    if (t.userEmail) qs.set('email', t.userEmail);
    const url = `${base}/api/admin/proof?${qs.toString()}`;

    try {
      // Fetch the PDF with Authorization, then open the blob in a new tab.
      const res = await fetch(url, {
        headers: {
          Accept: 'application/pdf',
          Authorization: `Bearer ${authToken}`,
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      // optional: revoke later (some browsers revoke when tab closes)
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (e: any) {
      console.error('Failed to open receipt', e);
      alert(`Failed to open receipt: ${e?.message || e}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="app-heading">Transactions</h3>
        <button
          onClick={fetchTx}
          className="chip flex items-center gap-2"
          disabled={loading || !base || !authToken}
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {err && <div className="panel p-3 text-sm text-red-500">{err}</div>}

      {loading && (
        <div className="panel p-4 text-sm text-mutedGray dark:text-darkTextSecondary">
          Loading transactions…
        </div>
      )}

      {!loading && tx.length === 0 && !err && (
        <div className="panel p-4 text-sm text-mutedGray dark:text-darkTextSecondary">
          No transactions yet.
        </div>
      )}

      <div className="grid gap-3">
        {tx.map((t) => (
          <div key={t.id} className="panel p-4 space-y-3">
            {/* Summary row */}
            <div className="grid md:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 items-center">
              <div className="text-sm">
                <p className="font-medium">{t.userEmail || '—'}</p>
                <p className="text-xs text-mutedGray dark:text-darkTextSecondary">
                  {t.orderId ? `Order: ${t.orderId}` : '—'}
                  {t.captureId ? ` · Capture: ${t.captureId}` : ''}
                  {t.mpesaRef ? ` · M-Pesa: ${t.mpesaRef}` : ''}
                </p>
                <p className="text-[11px] text-mutedGray dark:text-darkTextSecondary">
                  {new Date(t.date).toLocaleString()}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                <span className="text-sm">{t.method}</span>
                {t.source === 'withdrawal' && (
                  <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-gray-200 dark:bg-darkCard">
                    Withdrawal
                  </span>
                )}
              </div>

              <div className="text-sm">{fmtAmount(t)}</div>

              <div>
                <span className={`chip ${t.status === 'Completed' ? 'chip-active' : ''}`}>
                  {t.status}
                </span>
              </div>

              <div className="flex justify-end gap-2">
                <button className="chip" onClick={() => toggle(t.id)}>
                  {open[t.id] ? 'Hide' : 'Details'}
                </button>
                <button
                  className="chip flex items-center gap-2"
                  title="Open PDF receipt"
                  onClick={() => openReceipt(t)}
                  disabled={!authToken}
                >
                  <Receipt className="w-4 h-4" />
                  <span className="hidden sm:inline">Receipt</span>
                </button>
              </div>
            </div>

            {/* Details expander */}
            {open[t.id] && (
              <div className="rounded-lg bg-gray-50 dark:bg-white/5 p-3 text-[13px] grid sm:grid-cols-2 gap-3">
                <div>
                  <div>
                    <b>Payment ID:</b> {t.id}
                  </div>
                  <div>
                    <b>Status:</b> {t.status}
                  </div>
                  <div>
                    <b>Method:</b> {t.method}
                    {t.provider ? ` • ${t.provider}` : ''}
                  </div>
                  <div>
                    <b>Intent:</b> {t.intent || '—'}
                  </div>
                  <div>
                    <b>Order / Tx Ref:</b> {t.orderId || '—'}
                  </div>
                  <div>
                    <b>Capture ID:</b> {t.captureId || '—'}
                  </div>
                  <div>
                    <b>M-Pesa Ref:</b> {t.mpesaRef || '—'}
                  </div>
                  {t.providerOrderId && (
                    <div>
                      <b>Provider Order:</b> {t.providerOrderId}
                    </div>
                  )}
                </div>
                <div>
                  <div>
                    <b>Buyer:</b> {t.userName || '—'} ({t.userEmail || '—'})
                  </div>
                  <div>
                    <b>Payer Email / Phone:</b> {t.payerEmail || t.phone || '—'}
                  </div>
                  <div>
                    <b>Package:</b> {t.packageId ?? '—'}
                    {t.credits ? ` • ${t.credits} credits` : ''}
                    {t.offer ? ` • ${t.offer}` : ''}
                  </div>
                  <div>
                    <b>Created:</b> {t.createdAt ? new Date(t.createdAt).toLocaleString() : '—'}
                  </div>
                  <div>
                    <b>Updated:</b> {t.updatedAt ? new Date(t.updatedAt).toLocaleString() : '—'}
                  </div>
                </div>
                {t.rawMeta && (
                  <div className="sm:col-span-2">
                    <b>Gateway Meta</b>
                    <pre className="whitespace-pre-wrap break-words mt-1">
                      {JSON.stringify(t.rawMeta, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
