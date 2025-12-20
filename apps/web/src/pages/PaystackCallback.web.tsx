// apps/web/src/pages/PaystackCallback.web.tsx
import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import { paystackVerify } from '@mytutorapp/shared/api';
import { confirmOrgSubscription } from '@mytutorapp/shared/api/orgApi';

type Status = 'verifying' | 'success' | 'failed';

/* ----------------------- small helpers ----------------------- */

function safeGetSession(key: string): string {
  try {
    return sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function safeSetSession(key: string, val: string) {
  try {
    sessionStorage.setItem(key, val);
  } catch {}
}

function safeRemoveSession(keys: string[]) {
  try {
    for (const k of keys) sessionStorage.removeItem(k);
  } catch {}
}

function addOrSetQuery(path: string, params: Record<string, string>) {
  try {
    const u = new URL(path, window.location.origin);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    const hasQ = path.includes('?');
    const q = new URLSearchParams(params).toString();
    return path + (hasQ ? '&' : '?') + q;
  }
}

function looksLikeJwt(s: string) {
  const t = String(s || '').trim();
  return t.startsWith('eyJ') && t.split('.').length === 3;
}

async function fetchWalletBalance(backendUrl: string, authToken: string): Promise<number | null> {
  if (!backendUrl || !authToken) return null;
  try {
    const r = await fetch(`${backendUrl.replace(/\/+$/, '')}/api/account/balance`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!r.ok) return null;
    const j = await r.json();

    const bal = Number(j?.balance ?? j?.tokens ?? j?.data?.balance ?? j?.data?.tokens ?? NaN);
    return Number.isFinite(bal) ? bal : null;
  } catch {
    return null;
  }
}

function emitWalletUpdated(balance: number) {
  // Persist for next page load + broadcast for live listeners
  safeSetSession('wallet:lastBalance', String(balance));
  try {
    window.dispatchEvent(new CustomEvent('wallet:updated', { detail: { balance } }));
  } catch {}
}

/**
 * Decide what flow we are in WITHOUT mixing them.
 *
 * ORG flow is ONLY when we have a paymentId (query or session) OR kind=org.
 * Token flow is everything else.
 */
function resolveFlow(params: URLSearchParams) {
  const kind = (params.get('kind') || '').toLowerCase();
  const qPaymentId = params.get('paymentId') || '';

  const sPaymentId = safeGetSession('org:lastPaystackPaymentId') || '';
  const effectivePaymentId = qPaymentId || sPaymentId;

  const isOrg = Boolean(effectivePaymentId) || kind === 'org';

  return {
    isOrg,
    kind,
    qPaymentId,
    effectivePaymentId,
  };
}

/* ----------------------- Component ----------------------- */

export default function PaystackCallbackWeb() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const reference = (params.get('reference') || params.get('trxref') || '').trim();

  const { backendUrl, token, orgToken } = useShopContext();

  // ✅ STRICT separation:
  // - packages use `token`
  // - org subscriptions use `orgToken`
  const pkgToken = (token || '').trim();
  const orgAuthToken = (orgToken || '').trim();

  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState('Finishing payment…');

  const { isOrg, effectivePaymentId, kind } = resolveFlow(params);

  const retry = () => {
    setStatus('verifying');
    setMessage('Retrying confirmation…');
    window.location.reload();
    // or: navigate(0);
  };

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        if (!reference || looksLikeJwt(reference)) {
          setStatus('failed');
          setMessage('Missing Paystack reference in callback URL.');
          return;
        }

        // ==============================
        // ORG FLOW (uses orgToken ONLY)
        // ==============================
        if (isOrg) {
          if (!effectivePaymentId) {
            setStatus('failed');
            setMessage('Missing institution paymentId.');
            return;
          }
          if (!orgAuthToken) {
            setStatus('failed');
            setMessage('You must be logged in (institution) to activate your subscription.');
            return;
          }

          await confirmOrgSubscription(backendUrl, orgAuthToken, effectivePaymentId, reference);

          // ✅ keep your cleanup snippet (org upgrading plans depend on it)
          safeRemoveSession([
            'org:lastPaystackPaymentId',
            'org:lastPaystackOrgId',
            'org:lastPaystackTier',
            'org:lastPaystackCycle',
            'org:lastPaystackAt',
          ]);

          if (!alive) return;
          setStatus('success');
          setMessage('Payment verified. Subscription activated ✅');

          setTimeout(() => navigate('/org/portal', { replace: true }), 800);
          return;
        }

        // ==============================
        // TOKEN / PACKAGE FLOW (uses token ONLY)
        // ==============================
        if (!pkgToken) {
          setStatus('failed');
          setMessage('You must be logged in to verify a token purchase.');
          return;
        }

        // ✅ Correct arg order: (backendUrl, reference, token?)
        await paystackVerify(backendUrl, reference, pkgToken);

        // Refresh/broadcast wallet so Account updates instantly
        const bal = await fetchWalletBalance(backendUrl, pkgToken);
        if (bal != null) emitWalletUpdated(bal);

        if (!alive) return;
        setStatus('success');
        setMessage('Payment verified ✅ Redirecting to your account…');

        const next = addOrSetQuery('/account', { afterPaystack: '1', focus: 'tokens' });

        safeRemoveSession(['paystack:returnTo', 'paystack:returnToAt']);

        setTimeout(() => navigate(next, { replace: true }), 650);
      } catch (e: any) {
        if (!alive) return;

        setStatus('failed');

        // ✅ Keep errors unmixed (org vs token)
        if (isOrg) {
          setMessage(
            e?.response?.data?.message || e?.message || 'Failed to confirm subscription payment'
          );
        } else {
          setMessage(
            e?.response?.data?.message || e?.message || 'Token payment verification failed.'
          );
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [backendUrl, reference, isOrg, effectivePaymentId, orgAuthToken, pkgToken, navigate]);

  /* ----------------------- UI: never mix links ----------------------- */

  const primaryLink = isOrg ? (
    <Link to="/org/portal" className="px-3 py-2 rounded-xl text-sm bg-slate-900 text-white">
      Go to Institution Portal
    </Link>
  ) : (
    <Link to="/account" className="px-3 py-2 rounded-xl text-sm bg-slate-900 text-white">
      Go to Account
    </Link>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#0f1821] ring-1 ring-slate-200 dark:ring-white/10 p-5">
        <h1 className="text-lg font-semibold">
          Paystack callback
          <span className="ml-2 text-xs opacity-60">
            ({isOrg ? 'Institution plan' : 'Token top-up'})
          </span>
        </h1>

        <p className="mt-2 text-sm opacity-80">
          Status: <b>{status}</b>
        </p>

        <p className="mt-2 text-sm">{message}</p>

        <div className="mt-4 flex gap-2">
          {primaryLink}

          {status === 'failed' && (
            <button
              onClick={retry}
              className="px-3 py-2 rounded-xl text-sm bg-slate-100 dark:bg-white/10"
            >
              Retry confirmation
            </button>
          )}

          <Link to="/" className="px-3 py-2 rounded-xl text-sm bg-slate-100 dark:bg-white/10">
            Home
          </Link>
        </div>

        {!!reference && (
          <div className="mt-4 text-[11px] opacity-60">
            Ref: <span className="font-mono">{reference}</span>
            {isOrg && effectivePaymentId ? (
              <>
                {' '}
                • PaymentId: <span className="font-mono">{effectivePaymentId}</span>
                {kind ? (
                  <>
                    {' '}
                    • Kind: <span className="font-mono">{kind}</span>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
