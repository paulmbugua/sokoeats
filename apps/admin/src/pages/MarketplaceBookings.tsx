import { useCallback, useEffect, useMemo, useState } from 'react';
import axios, { AxiosError } from 'axios';
import { toast } from 'react-toastify';
import { useShopContext } from '@myhandymanapp/shared/context/ShopContext';
import { CalendarCheck2, CalendarX2, RefreshCw } from 'lucide-react';

type Booking = {
  id: number;
  description?: string | null;
  estate?: string | null;
  city?: string | null;
  status: string;
  total?: number | null;
  organization_commission_amount?: number | null;
  handyman_payout_amount?: number | null;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
  cancellation_reason_code?: string | null;
  cancellation_notes?: string | null;
  cancelled_at?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  handyman_name?: string | null;
  handyman_phone?: string | null;
  business_name?: string | null;
  cancellation_score?: number | null;
  suspended_until?: string | null;
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

export default function MarketplaceBookings() {
  const { backendUrl, adminToken, token } = useShopContext();
  const base = useMemo(() => (backendUrl || '').replace(/\/+$/, ''), [backendUrl]);
  const authToken = adminToken || token || '';
  const headers = useMemo(() => (authToken ? { Authorization: 'Bearer ' + authToken } : {}), [authToken]);
  const [status, setStatus] = useState<'all' | 'confirmed' | 'cancelled' | 'completed'>('all');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!base || !authToken) return;
    setLoading(true);
    try {
      const { data } = await axios.get(base + '/api/admin/marketplace/bookings', { headers, params: { status } });
      setBookings(data?.bookings || []);
    } catch (e) {
      toast.error(getAxiosMessage(e, 'Could not load bookings'));
    } finally {
      setLoading(false);
    }
  }, [base, authToken, headers, status]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="app-heading">Bookings & Cancellations</h3>
          <p className="text-sm text-mutedGray dark:text-darkTextSecondary mt-1">Track accepted quotes, commission, payout, and cancellation reasons.</p>
        </div>
        <button className="btn-outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={'w-4 h-4 ' + (loading ? 'animate-spin' : '')} />
          Refresh
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {(['all', 'confirmed', 'cancelled', 'completed'] as const).map((s) => (
          <button key={s} className={'chip ' + (status === s ? 'chip-active' : '')} onClick={() => setStatus(s)}>{s}</button>
        ))}
      </div>
      <div className="grid gap-3">
        {bookings.map((booking) => (
          <div key={booking.id} className="panel p-4">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {booking.status === 'cancelled' ? <CalendarX2 className="w-5 h-5 text-red-600" /> : <CalendarCheck2 className="w-5 h-5 text-green-600" />}
                  <h4 className="font-semibold text-darkText dark:text-darkTextPrimary">{booking.description || 'Booking #' + booking.id}</h4>
                  <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">{booking.status}</span>
                </div>
                <p className="text-sm text-mutedGray mt-2">{booking.estate || 'Estate not set'}, {booking.city || 'Nairobi'}</p>
                <p className="text-xs text-mutedGray mt-2">Client: {booking.client_name || 'Unknown'} {booking.client_phone ? '| ' + booking.client_phone : ''}</p>
                <p className="text-xs text-mutedGray mt-1">Handyman: {booking.business_name || booking.handyman_name || 'Unknown'} {booking.handyman_phone ? '| ' + booking.handyman_phone : ''}</p>
                {booking.status === 'cancelled' ? (
                  <div className="mt-3 rounded bg-red-50 text-red-700 p-3 text-sm">
                    <p className="font-semibold">Cancelled by {booking.cancelled_by || 'unknown'}</p>
                    <p>{booking.cancellation_reason || booking.cancellation_reason_code || 'No reason captured'}</p>
                    {booking.cancellation_notes ? <p className="text-xs mt-1">{booking.cancellation_notes}</p> : null}
                  </div>
                ) : null}
              </div>
              <div className="rounded bg-slate-50 p-3 text-sm min-w-[220px]">
                <p>Total: <strong>{money(booking.total)}</strong></p>
                <p>Ekazi commission: <strong>{money(booking.organization_commission_amount)}</strong></p>
                <p>Handyman payout: <strong>{money(booking.handyman_payout_amount)}</strong></p>
                <p>Cancel score: <strong>{Number(booking.cancellation_score || 100).toFixed(0)}%</strong></p>
              </div>
            </div>
          </div>
        ))}
        {!bookings.length ? <div className="panel p-6 text-sm text-mutedGray">No {status === 'all' ? '' : status} bookings found.</div> : null}
      </div>
    </div>
  );
}
