import { useCallback, useEffect, useMemo, useState } from 'react';
import axios, { AxiosError } from 'axios';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import { useShopContext } from '@myhandymanapp/shared/context/ShopContext';
import {
  AlertTriangle,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarX2,
  FileCheck2,
  RefreshCw,
  ShieldCheck,
  Users,
  WalletCards,
} from 'lucide-react';

type Counts = Record<string, number>;
type Overview = {
  success: boolean;
  counts: {
    verifications?: Counts;
    jobs?: Counts;
    quotes?: Counts;
    bookings?: Counts;
    users?: Record<string, number>;
  };
  queues: {
    pendingVerifications?: Array<{
      id: number;
      document_type: string;
      document_url: string;
      status: string;
      updated_at?: string;
      name?: string | null;
      email?: string | null;
      phone?: string | null;
      business_name?: string | null;
    }>;
    recentCancellations?: Array<{
      id: number;
      status: string;
      cancelled_by?: string | null;
      cancellation_reason?: string | null;
      cancellation_reason_code?: string | null;
      cancellation_notes?: string | null;
      cancelled_at?: string | null;
      description?: string | null;
      client_name?: string | null;
      handyman_name?: string | null;
    }>;
  };
};

type ApiErrorBody = { message?: string; error?: string };

function getAxiosMessage(e: unknown, fallback: string) {
  if (axios.isAxiosError(e)) {
    const ax = e as AxiosError<ApiErrorBody>;
    return ax.response?.data?.message || ax.response?.data?.error || ax.message || fallback;
  }
  if (e instanceof Error) return e.message || fallback;
  return fallback;
}

function docLabel(type: string) {
  if (type === 'profile_image') return 'Profile photo';
  if (type === 'id_document') return 'National ID';
  if (type === 'certificate') return 'Qualification certificate';
  if (type === 'good_conduct') return 'Good conduct';
  return type;
}

function count(map: Counts | undefined, key: string) {
  return Number(map?.[key] || 0);
}

function StatCard({
  icon,
  label,
  value,
  tone = 'slate',
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone?: 'green' | 'amber' | 'red' | 'blue' | 'slate';
}) {
  const toneClass =
    tone === 'green'
      ? 'bg-green-50 text-green-700 ring-green-200'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : tone === 'red'
          ? 'bg-red-50 text-red-700 ring-red-200'
          : tone === 'blue'
            ? 'bg-blue-50 text-blue-700 ring-blue-200'
            : 'bg-slate-50 text-slate-700 ring-slate-200';
  return (
    <div className={'rounded-lg ring-1 p-4 ' + toneClass}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide font-semibold opacity-80">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className="opacity-80">{icon}</div>
      </div>
    </div>
  );
}

export default function ApprovalsDashboard() {
  const { backendUrl, adminToken, token } = useShopContext();
  const base = useMemo(() => (backendUrl || '').replace(/\/+$/, ''), [backendUrl]);
  const authToken = adminToken || token || '';
  const headers = useMemo(() => (authToken ? { Authorization: 'Bearer ' + authToken } : {}), [authToken]);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!base || !authToken) return;
    setLoading(true);
    try {
      const res = await axios.get<Overview>(base + '/api/admin/approvals/overview', { headers });
      setData(res.data);
    } catch (e) {
      toast.error(getAxiosMessage(e, 'Could not load approvals dashboard'));
    } finally {
      setLoading(false);
    }
  }, [base, authToken, headers]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingDocs = data?.queues?.pendingVerifications || [];
  const cancellations = data?.queues?.recentCancellations || [];
  const users = data?.counts?.users || {};

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="app-heading">Ekazi Approvals</h3>
          <p className="text-sm text-mutedGray dark:text-darkTextSecondary mt-1">
            Live operational queue for client requests, provider trust documents, bookings, and account risk.
          </p>
        </div>
        <button className="btn-outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={'w-4 h-4 ' + (loading ? 'animate-spin' : '')} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard icon={<ShieldCheck className="w-7 h-7" />} label="Pending documents" value={count(data?.counts?.verifications, 'pending')} tone="amber" />
        <StatCard icon={<BriefcaseBusiness className="w-7 h-7" />} label="Active client requests" value={count(data?.counts?.jobs, 'active') + count(data?.counts?.jobs, 'quoted')} tone="blue" />
        <StatCard icon={<WalletCards className="w-7 h-7" />} label="Open quotes" value={count(data?.counts?.quotes, 'open')} tone="green" />
        <StatCard icon={<CalendarX2 className="w-7 h-7" />} label="Cancelled bookings" value={count(data?.counts?.bookings, 'cancelled')} tone="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <StatCard icon={<Users className="w-7 h-7" />} label="Total users" value={users.total_users || 0} tone="slate" />
        <StatCard icon={<Users className="w-7 h-7" />} label="Clients / Providers" value={(users.clients || 0) + ' / ' + (users.handymen || 0)} tone="blue" />
        <StatCard icon={<AlertTriangle className="w-7 h-7" />} label="Suspended / banned" value={(users.suspended || 0) + ' / ' + (users.banned || 0)} tone="red" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="panel p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h4 className="font-semibold text-darkText dark:text-darkTextPrimary">Pending provider documents</h4>
              <p className="text-xs text-mutedGray dark:text-darkTextSecondary">Submitted from apps/mobile or apps/web.</p>
            </div>
            <Link className="btn-outline" to="/handyman-verifications">Review all</Link>
          </div>
          <div className="grid gap-2">
            {pendingDocs.map((item) => (
              <div key={item.id} className="rounded border border-gray-200 dark:border-white/10 p-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="font-semibold">{docLabel(item.document_type)}</p>
                    <p className="text-xs text-mutedGray">{item.business_name || item.name || item.email}</p>
                  </div>
                  <a className="chip" href={item.document_url} target="_blank" rel="noreferrer">
                    <FileCheck2 className="w-4 h-4" />
                    Open
                  </a>
                </div>
              </div>
            ))}
            {!pendingDocs.length ? <div className="text-sm text-mutedGray">No pending documents.</div> : null}
          </div>
        </section>

        <section className="panel p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h4 className="font-semibold text-darkText dark:text-darkTextPrimary">Recent cancellations</h4>
              <p className="text-xs text-mutedGray dark:text-darkTextSecondary">Watch cancellation reasons tied to account trust.</p>
            </div>
            <Link className="btn-outline" to="/marketplace-bookings">Bookings</Link>
          </div>
          <div className="grid gap-2">
            {cancellations.map((item) => (
              <div key={item.id} className="rounded border border-gray-200 dark:border-white/10 p-3">
                <p className="font-semibold">{item.description || 'Booking #' + item.id}</p>
                <p className="text-xs text-mutedGray mt-1">
                  {item.client_name || 'Client'} / {item.handyman_name || 'Provider'} | cancelled by {item.cancelled_by || 'unknown'}
                </p>
                <p className="text-sm mt-2">{item.cancellation_reason || item.cancellation_reason_code || 'No reason captured'}</p>
                {item.cancellation_notes ? <p className="text-xs text-mutedGray mt-1">{item.cancellation_notes}</p> : null}
              </div>
            ))}
            {!cancellations.length ? <div className="text-sm text-mutedGray">No recent cancellations.</div> : null}
          </div>
        </section>
      </div>

      <section className="panel p-4">
        <h4 className="font-semibold text-darkText dark:text-darkTextPrimary mb-2">Admin actions now covered</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
          <Link className="chip justify-center" to="/handyman-verifications"><BadgeCheck className="w-4 h-4" /> Approve documents</Link>
          <Link className="chip justify-center" to="/marketplace-jobs"><BriefcaseBusiness className="w-4 h-4" /> Review client requests</Link>
          <Link className="chip justify-center" to="/marketplace-bookings"><CalendarX2 className="w-4 h-4" /> Review bookings</Link>
        </div>
      </section>
    </div>
  );
}
