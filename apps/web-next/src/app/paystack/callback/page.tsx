'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { paystackVerify } from '@mytutorapp/shared/api';
import { confirmOrgSubscription } from '@mytutorapp/shared/api/orgApi';
import { useShopContext } from '@mytutorapp/shared/context';

import { trackPurchase } from '@/analytics/ga4';
import { appUrl } from '@/lib/appOrigin';

type Status = 'verifying' | 'success' | 'failed';

type TokensCheckoutStash = {
  kind: 'tokens';
  credits?: number;
  currency?: string;
  value?: number;
  reference?: string;
  checkout_key?: string;
};

type OrgCheckoutStash = {
  kind: 'org';
  tier?: string;
  cycle?: string;
  currency?: string;
  value?: number;
  reference?: string;
  orgId?: string | number;
  orgName?: string;
  checkout_key?: string;
};

const TOKENS_CHECKOUT_STASH_KEY = 'checkout:tokens';
const ORG_CHECKOUT_STASH_KEY = 'checkout:org';

const safeNumber = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const majorFromMinor = (minor: unknown, decimals = 2) => {
  const n = safeNumber(minor, NaN);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimals;
  return n / factor;
};

const readStash = <T,>(key: string): T | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const clearStash = (key: string) => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    // no-op
  }
};

const clearOrgSessionMarkers = () => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem('org:lastPaystackPaymentId');
    sessionStorage.removeItem('org:lastPaystackOrgId');
    sessionStorage.removeItem('org:lastPaystackTier');
    sessionStorage.removeItem('org:lastPaystackCycle');
    sessionStorage.removeItem('org:lastPaystackAt');
  } catch {
    // no-op
  }
};

export default function PaystackCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { backendUrl, token, orgToken } = useShopContext() as any;

  const reference = useMemo(
    () => (searchParams?.get('reference') || searchParams?.get('trxref') || '').trim(),
    [searchParams]
  );
  const paymentId = useMemo(() => (searchParams?.get('paymentId') || '').trim(), [searchParams]);
  const kind = useMemo(() => (searchParams?.get('kind') || '').trim().toLowerCase(), [searchParams]);

  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState('Finishing payment…');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!reference || !backendUrl) {
      setStatus('failed');
      setMessage('Missing payment callback details. Please retry payment.');
      return;
    }

    let active = true;

    (async () => {
      try {
        const isOrgFlow = kind === 'org' || Boolean(paymentId);

        if (isOrgFlow) {
          if (!orgToken) {
            // Fallback kept for cases where org auth context has not hydrated yet.
            const qs = searchParams?.toString();
            router.replace(appUrl(`/paystack/callback${qs ? `?${qs}` : ''}`));
            return;
          }

          const orgStash = readStash<OrgCheckoutStash>(ORG_CHECKOUT_STASH_KEY);
          const effectivePaymentId =
            paymentId ||
            (typeof window !== 'undefined' ? sessionStorage.getItem('org:lastPaystackPaymentId') || '' : '') ||
            reference;

          await confirmOrgSubscription(backendUrl, orgToken, effectivePaymentId, reference);

          const orgValue = safeNumber(orgStash?.value, 0);
          const orgCurrency = String(orgStash?.currency || 'KES').toUpperCase();
          trackPurchase({
            transaction_id: reference,
            currency: orgCurrency,
            value: orgValue,
            payment_type: 'paystack',
            affiliation: 'DayBreak Learner',
            org_id: orgStash?.orgId,
            org_name: orgStash?.orgName,
            items: [
              {
                item_id: `org_${String(orgStash?.tier || 'pro')}_${String(orgStash?.cycle || 'monthly')}`,
                item_name: `Org ${String(orgStash?.tier || 'pro').toUpperCase()} (${String(orgStash?.cycle || 'monthly')})`,
                item_category: 'subscription',
                item_variant: String(orgStash?.cycle || 'monthly'),
                price: orgValue > 0 ? orgValue : undefined,
                quantity: 1,
              },
            ],
          });

          clearStash(ORG_CHECKOUT_STASH_KEY);
          clearOrgSessionMarkers();

          if (!active) return;
          setStatus('success');
          setMessage('Subscription activated ✅ Redirecting…');
          setTimeout(() => router.replace(appUrl('/org/portal')), 700);
          return;
        }

        if (!token) {
          setStatus('failed');
          setMessage('You must be logged in to verify this purchase.');
          return;
        }

        const verify = await paystackVerify(backendUrl, reference, token);
        if (!active) return;

        const stash = readStash<TokensCheckoutStash>(TOKENS_CHECKOUT_STASH_KEY);
        const amountMinor =
          safeNumber((verify as any)?.amount, NaN) || safeNumber((verify as any)?.raw?.data?.amount, NaN);
        const amountMajor = amountMinor ? majorFromMinor(amountMinor) : safeNumber(stash?.value, 0);
        const currency = String(
          (verify as any)?.currency || (verify as any)?.raw?.data?.currency || stash?.currency || 'USD'
        ).toUpperCase();
        const credits = safeNumber((verify as any)?.creditsPurchased, safeNumber(stash?.credits, 0));

        if (verify?.ok) {
          trackPurchase({
            transaction_id: reference,
            currency,
            value: amountMajor,
            payment_type: 'paystack',
            affiliation: 'DayBreak Learner',
            items: [
              {
                item_id: `tokens_${credits}`,
                item_name: `${credits} Tokens`,
                item_category: 'tokens',
                price: amountMajor,
                quantity: 1,
              },
            ],
          });
          clearStash(TOKENS_CHECKOUT_STASH_KEY);

          setStatus('success');
          setMessage('Payment verified ✅ Redirecting…');
          setTimeout(() => router.replace('/account?afterPaystack=1&focus=tokens'), 600);
          return;
        }

        setStatus('failed');
        setMessage(verify?.message || 'Unable to verify payment.');
      } catch (error: any) {
        if (!active) return;
        setStatus('failed');
        setMessage(error?.message || 'Unable to verify payment.');
      }
    })();

    return () => {
      active = false;
    };
  }, [backendUrl, kind, orgToken, paymentId, reference, router, searchParams, token]);

  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Payment Callback</h1>
      <p className="mt-3 text-sm opacity-80">{message}</p>
      {status === 'failed' ? (
        <button
          type="button"
          className="mt-5 rounded bg-pink-600 px-4 py-2 text-white"
          onClick={() => router.replace('/pricing')}
        >
          Back to pricing
        </button>
      ) : null}
    </main>
  );
}
