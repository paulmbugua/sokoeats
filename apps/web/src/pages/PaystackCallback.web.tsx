import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import { paystackVerify } from '@mytutorapp/shared/api';
import { confirmOrgSubscription } from '@mytutorapp/shared/api/orgApi';

export default function PaystackCallbackWeb() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const reference = params.get('reference') || params.get('trxref') || '';
  const paymentId = params.get('paymentId') || ''; // 👈 org payments include this
  const kind = params.get('kind') || ''; // 'org' (optional)

  const { backendUrl, token, orgToken } = useShopContext();
  const authToken = orgToken || token;

  const [status, setStatus] = useState<'verifying' | 'success' | 'failed'>('verifying');
  const [message, setMessage] = useState('Finishing payment…');

  const retry = () => {
  // re-run this same callback URL fresh
  setStatus('verifying');
  setMessage('Retrying confirmation…');

  // simplest: reload (works, but heavier)
  window.location.reload();

  // better alternative (no full reload):
  // navigate(0);
};


  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        if (!reference) {
          setStatus('failed');
          setMessage('Missing Paystack reference.');
          return;
        }

        // ───────────────────────── ORG FLOW ─────────────────────────
        let effectivePaymentId = paymentId;

        if (!effectivePaymentId) {
        try {
            effectivePaymentId = sessionStorage.getItem('org:lastPaystackPaymentId') || '';
        } catch {}
        }

        if (effectivePaymentId) {
        if (!authToken) {
            setStatus('failed');
            setMessage('You must be logged in to activate your institution subscription.');
            return;
        }

        await confirmOrgSubscription(backendUrl, authToken, effectivePaymentId, reference);

        try {
            sessionStorage.removeItem('org:lastPaystackPaymentId');
            sessionStorage.removeItem('org:lastPaystackOrgId');
            sessionStorage.removeItem('org:lastPaystackTier');
            sessionStorage.removeItem('org:lastPaystackCycle');
            sessionStorage.removeItem('org:lastPaystackAt');
        } catch {}

        if (!alive) return;
        setStatus('success');
        setMessage('Payment verified. Subscription activated ✅');

        setTimeout(() => navigate('/org/portal', { replace: true }), 800);
        return;
        }


        // ───────────────────────── TOKEN FLOW ───────────────────────
        // Your existing verify endpoint (used elsewhere)
        await paystackVerify(backendUrl, authToken || '', reference);

        if (!alive) return;
        setStatus('success');
        setMessage('Payment verified ✅ You can return to the app.');

      } catch (e: any) {
        if (!alive) return;
        setStatus('failed');
        setMessage(e?.response?.data?.message || e?.message || 'Verification failed.');
      }
    })();

    return () => {
      alive = false;
    };
  }, [backendUrl, authToken, reference, paymentId, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#0f1821] ring-1 ring-slate-200 dark:ring-white/10 p-5">
        <h1 className="text-lg font-semibold">
          Paystack callback
        </h1>

        <p className="mt-2 text-sm opacity-80">
          Status: <b>{status}</b>
        </p>

        <p className="mt-2 text-sm">
          {message}
        </p>

        <div className="mt-4 flex gap-2">
        <Link
            to="/org/portal"
            className="px-3 py-2 rounded-xl text-sm bg-slate-900 text-white"
        >
            Go to Institution Portal
        </Link>

        {(status === 'failed') && (
            <button
            onClick={retry}
            className="px-3 py-2 rounded-xl text-sm bg-slate-100 dark:bg-white/10"
            >
            Retry confirmation
            </button>
        )}

        <Link
            to="/"
            className="px-3 py-2 rounded-xl text-sm bg-slate-100 dark:bg-white/10"
        >
            Home
        </Link>
        </div>

        {!!reference && (
          <div className="mt-4 text-[11px] opacity-60">
            Ref: <span className="font-mono">{reference}</span>
            {paymentId ? (
              <>
                {' '}• PaymentId: <span className="font-mono">{paymentId}</span>
                {kind ? <> • Kind: <span className="font-mono">{kind}</span></> : null}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
