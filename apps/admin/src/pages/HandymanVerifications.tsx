import { useCallback, useEffect, useMemo, useState } from 'react';
import axios, { AxiosError } from 'axios';
import { toast } from 'react-toastify';
import { useShopContext } from '@myhandymanapp/shared/context/ShopContext';
import { BadgeCheck, Eye, RefreshCw, XCircle } from 'lucide-react';

type Review = {
  id: number;
  handyman_user_id: number;
  document_type: string;
  document_url: string;
  status: 'pending' | 'approved' | 'rejected';
  notes?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  business_name?: string | null;
  verification_status?: string | null;
  profile_image_status?: string | null;
  id_document_status?: string | null;
  certificate_status?: string | null;
  good_conduct_status?: string | null;
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

function label(type: string) {
  if (type === 'profile_image') return 'Profile photo';
  if (type === 'id_document') return 'National ID';
  if (type === 'certificate') return 'Qualification certificate';
  if (type === 'good_conduct') return 'Good conduct';
  return type;
}

function statusClass(status: string) {
  if (status === 'approved') return 'bg-green-50 text-green-700 ring-green-200';
  if (status === 'rejected') return 'bg-red-50 text-red-700 ring-red-200';
  return 'bg-amber-50 text-amber-700 ring-amber-200';
}

export default function HandymanVerifications() {
  const { backendUrl, adminToken, token } = useShopContext();
  const base = useMemo(() => (backendUrl || '').replace(/\/+$/, ''), [backendUrl]);
  const authToken = adminToken || token || '';
  const authHeaders = useMemo(() => (authToken ? { Authorization: 'Bearer ' + authToken } : {}), [authToken]);
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!base || !authToken) return;
    setLoading(true);
    try {
      const { data } = await axios.get(base + '/api/admin/handyman-verifications', {
        headers: authHeaders,
        params: { status },
      });
      setReviews(data?.reviews || []);
    } catch (e) {
      toast.error(getAxiosMessage(e, 'Could not load provider verification reviews'));
    } finally {
      setLoading(false);
    }
  }, [base, authHeaders, authToken, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = (item: Review, nextStatus: 'approved' | 'rejected') => async () => {
    const promptFn = (globalThis as any).prompt as undefined | ((message?: string, defaultValue?: string) => string | null);
    const notes = nextStatus === 'rejected' ? promptFn?.('Rejection note for provider:', item.notes || '') : item.notes || '';
    if (nextStatus === 'rejected' && notes == null) return;
    setBusyId(item.id);
    try {
      await axios.patch(
        base + '/api/admin/handyman-verifications/' + item.id,
        { status: nextStatus, notes },
        { headers: { ...authHeaders, 'Content-Type': 'application/json' } },
      );
      toast.success(label(item.document_type) + ' ' + nextStatus);
      await load();
    } catch (e) {
      toast.error(getAxiosMessage(e, 'Could not update verification review'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="app-heading">Provider Verification</h3>
          <p className="text-sm text-mutedGray dark:text-darkTextSecondary mt-1">
            Approve profile photos, national IDs, optional certificates and good conduct documents.
          </p>
        </div>
        <button className="btn-outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={'w-4 h-4 ' + (loading ? 'animate-spin' : '')} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
          <button key={s} className={'chip ' + (status === s ? 'chip-active' : '')} onClick={() => setStatus(s)}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {reviews.map((item) => (
          <div key={item.id} className="panel p-4">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold text-darkText dark:text-darkTextPrimary">{label(item.document_type)}</h4>
                  <span className={'text-xs px-2 py-1 rounded-full ring-1 ' + statusClass(item.status)}>{item.status}</span>
                  {item.document_type === 'id_document' || item.document_type === 'profile_image' ? (
                    <span className="text-xs px-2 py-1 rounded-full ring-1 bg-blue-50 text-blue-700 ring-blue-200">Required</span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-full ring-1 bg-slate-50 text-slate-600 ring-slate-200">Optional trust badge</span>
                  )}
                </div>
                <p className="text-sm mt-2">{item.business_name || item.name || 'Ekazi provider'}</p>
                <p className="text-xs text-mutedGray mt-1">{item.email} {item.phone ? '- ' + item.phone : ''}</p>
                <p className="text-xs text-mutedGray mt-2">
                  Account: {item.verification_status || 'incomplete'} | Photo: {item.profile_image_status || 'missing'} | ID: {item.id_document_status || 'missing'} | Cert: {item.certificate_status || 'missing'} | Good conduct: {item.good_conduct_status || 'missing'}
                </p>
                {item.notes ? <p className="text-sm text-red-600 mt-2">Note: {item.notes}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <a className="btn-outline" href={item.document_url} target="_blank" rel="noreferrer">
                  <Eye className="w-4 h-4" />
                  Open document
                </a>
                <button className="btn bg-green-600 hover:bg-green-700" onClick={review(item, 'approved')} disabled={busyId === item.id}>
                  <BadgeCheck className="w-4 h-4" />
                  Approve
                </button>
                <button className="btn bg-red-600 hover:bg-red-700" onClick={review(item, 'rejected')} disabled={busyId === item.id}>
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
        {!reviews.length ? (
          <div className="panel p-6 text-sm text-mutedGray">No {status === 'all' ? '' : status} provider verification documents found.</div>
        ) : null}
      </div>
    </div>
  );
}
