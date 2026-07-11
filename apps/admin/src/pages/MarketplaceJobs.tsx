import { useCallback, useEffect, useMemo, useState } from 'react';
import axios, { AxiosError } from 'axios';
import { toast } from 'react-toastify';
import { useShopContext } from '@myhandymanapp/shared/context/ShopContext';
import { BriefcaseBusiness, MapPin, RefreshCw } from 'lucide-react';

type Job = {
  id: number;
  description: string;
  category_name?: string | null;
  service_name?: string | null;
  estate?: string | null;
  city?: string | null;
  address?: string | null;
  status: string;
  budget_min?: number | null;
  budget_max?: number | null;
  quote_count?: number;
  client_name?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  created_at?: string;
  photo_urls?: string[];
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
const money = (v?: number | null) => 'KES ' + Number(v || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 });

export default function MarketplaceJobs() {
  const { backendUrl, adminToken, token } = useShopContext();
  const base = useMemo(() => (backendUrl || '').replace(/\/+$/, ''), [backendUrl]);
  const authToken = adminToken || token || '';
  const headers = useMemo(() => (authToken ? { Authorization: 'Bearer ' + authToken } : {}), [authToken]);
  const [status, setStatus] = useState<'all' | 'active' | 'quoted' | 'booked' | 'cancelled'>('all');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!base || !authToken) return;
    setLoading(true);
    try {
      const { data } = await axios.get(base + '/api/admin/marketplace/jobs', { headers, params: { status } });
      setJobs(data?.jobs || []);
    } catch (e) {
      toast.error(getAxiosMessage(e, 'Could not load client requests'));
    } finally {
      setLoading(false);
    }
  }, [base, authToken, headers, status]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="app-heading">Client Requests</h3>
          <p className="text-sm text-mutedGray dark:text-darkTextSecondary mt-1">Requests submitted from apps/web and apps/mobile.</p>
        </div>
        <button className="btn-outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={'w-4 h-4 ' + (loading ? 'animate-spin' : '')} />
          Refresh
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {(['all', 'active', 'quoted', 'booked', 'cancelled'] as const).map((s) => (
          <button key={s} className={'chip ' + (status === s ? 'chip-active' : '')} onClick={() => setStatus(s)}>{s}</button>
        ))}
      </div>
      <div className="grid gap-3">
        {jobs.map((job) => (
          <div key={job.id} className="panel p-4">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <BriefcaseBusiness className="w-5 h-5 text-indigo-600" />
                  <h4 className="font-semibold text-darkText dark:text-darkTextPrimary">{job.category_name || job.service_name || 'Ekazi request'}</h4>
                  <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">{job.status}</span>
                  <span className="text-xs px-2 py-1 rounded-full bg-green-50 text-green-700">{job.quote_count || 0} quotes</span>
                </div>
                <p className="mt-2">{job.description}</p>
                <p className="text-sm text-mutedGray mt-2 flex items-center gap-1"><MapPin className="w-4 h-4" /> {job.estate || 'Estate not set'}, {job.city || 'Nairobi'} {job.address ? '- ' + job.address : ''}</p>
                <p className="text-xs text-mutedGray mt-2">Client: {job.client_name || job.client_email || 'Unknown'} {job.client_phone ? '| ' + job.client_phone : ''}</p>
                <p className="text-xs text-mutedGray mt-1">Budget: {money(job.budget_min)} - {money(job.budget_max)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(job.photo_urls || []).slice(0, 4).map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt="Request attachment" className="w-16 h-16 rounded object-cover border" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        ))}
        {!jobs.length ? <div className="panel p-6 text-sm text-mutedGray">No {status === 'all' ? '' : status} client requests found.</div> : null}
      </div>
    </div>
  );
}
