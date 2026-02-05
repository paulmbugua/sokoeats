// apps/web/src/pages/org/PlanPurchaseModal.web.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { trackBeginCheckout, trackAddPaymentInfo } from '@/analytics/ga4'; // adjust path
import { buildOrgPlanItem, safeNumber } from '@/analytics/ecomBuilders';
import { stashCheckout } from '@/analytics/checkoutStash';
import { clearCheckoutOnce, trackCheckoutOnce } from '@/analytics/checkoutOnce';

import type { OrgCurrency, OrgPricingTable } from '@mytutorapp/shared/api/orgApi';

type BillingCycle = 'monthly' | 'annual';
type PayMethod = 'Paystack' | 'M-Pesa';

type Props = {
  open: boolean;
  onClose: () => void;
  tier: 'pro' | 'enterprise';
  orgName?: string | null;
  orgId?: string | number | null;

  assets?: {
    visamaster?: string; // optional image url
    mpesa?: string; // optional image url
  };

  onCheckout: (opts: {
    method: PayMethod;
    cycle: BillingCycle;
    plan: 'pro' | 'enterprise';
    phone?: string;
    reference?: string;
  }) => void;
};

function getBrowserLocale(): string {
  if (typeof navigator === 'undefined') return 'en-US';
  return navigator.language || 'en-US';
}

const regionToCurrency: Record<string, string> = {
  US: 'USD',
  KE: 'KES',
  QA: 'QAR',
  GB: 'GBP',
  IE: 'EUR',
  DE: 'EUR',
  FR: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
  NG: 'NGN',
  ZA: 'ZAR',
  IN: 'INR',
  UG: 'UGX',
  TZ: 'TZS',
};

function guessCurrencyFromLocale(locale: string): string {
  const parts = locale.split(/[-_]/);
  const region = parts[1]?.toUpperCase();
  if (!region) return 'USD';
  return regionToCurrency[region] || 'USD';
}

// UI-only FX estimates from USD → local display
const USD_ESTIMATE_RATES: Record<string, number> = {
  USD: 1,
  KES: 130,
  QAR: 3.64,
  EUR: 0.93,
  GBP: 0.8,
  NGN: 1500,
  ZAR: 18,
  INR: 83,
  UGX: 3800,
  TZS: 2800,
};

function formatMoneyIntl(locale: string, currency: string, amount: number, maxFrac?: number) {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'symbol',
      maximumFractionDigits: typeof maxFrac === 'number' ? maxFrac : undefined,
    }).format(amount);
  } catch {
    if (currency === 'KES') return `KSh ${Math.round(amount).toLocaleString('en-KE')}`;
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function centsToMajor(cents: number) {
  return cents / 100;
}

function normalizeMpesaPhone(raw: string) {
  const s = (raw || '').trim().replace(/\s+/g, '');
  const digits = s.replace(/[^\d+]/g, '');

  // +2547xxxxxxxx → 2547xxxxxxxx
  if (digits.startsWith('+254')) return digits.slice(1);

  // 07xxxxxxxx → 2547xxxxxxxx
  if (/^0\d{9}$/.test(digits)) return `254${digits.slice(1)}`;

  // 7xxxxxxxx (9 digits) -> 2547xxxxxxxx (optional)
  if (/^\d{9}$/.test(digits) && digits.startsWith('7')) return `254${digits}`;

  return digits.replace(/[^\d]/g, '');
}

function isLikelyMpesaPhone(norm: string) {
  // Typical KE MSISDN in international format: 2547XXXXXXXX (12 digits)
  return /^2547\d{8}$/.test(norm);
}

const PLAN_META: Record<'pro' | 'enterprise', { features: string[] }> = {
  pro: {
    features: [
      'Exam results & Report cards',
      'Custom pass marks & timers',
      'Monthly / Termly / Yearly analytics',
      'Email reports',
    ],
  },
  enterprise: {
    features: [
      'Exam results & Report cards',
      'SSO / domain restrict',
      'CSV export',
      'Webhooks',
      'Priority support',
    ],
  },
};

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="
        inline-flex items-center px-2 py-0.5 rounded-full text-[11px]
        bg-[#e7edf4] text-slate-800 ring-1 ring-[#d1e2f4]
        dark:bg-white/10 dark:text-white dark:ring-white/20
      "
    >
      {children}
    </span>
  );
}

export default function PlanPurchaseModalWeb({
  open,
  onClose,
  tier,
  orgName,
  orgId,
  onCheckout,
  assets,
}: Props) {
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [method, setMethod] = useState<PayMethod>('Paystack');
  const [phone, setPhone] = useState('');
  const [reference, setReference] = useState('');
  const [uiError, setUiError] = useState<string | null>(null);
  const [checkoutTracked, setCheckoutTracked] = useState(false);
  const checkoutKey = useMemo(() => `org:${orgId ?? 'unknown'}:${tier}:${cycle}`, [orgId, tier, cycle]);

  const handleClose = () => {
    clearCheckoutOnce(checkoutKey);
    onClose();
  };

  // Canonical USD + explicit KES (so M-Pesa pricing is not “estimated”)
  const usd: OrgCurrency = 'USD';
  const kes: OrgCurrency = 'KES';

  const {
    orgPricingTable: pricingUSD,
    orgPricingLoading: pricingLoadingUSD,
    orgPricingError: pricingErrorUSD,
  } = useOrg({ currency: usd });

  const {
    orgPricingTable: pricingKES,
    orgPricingLoading: pricingLoadingKES,
    orgPricingError: pricingErrorKES,
  } = useOrg({ currency: kes });

  // Locale + local display currency (like PaymentWidget)
  const [userLocale, setUserLocale] = useState('en-US');
  const [userDisplayCurrency, setUserDisplayCurrency] = useState('USD');

  useEffect(() => {
    const navLocale = getBrowserLocale() || 'en-US';
    let nextLocale = navLocale;
    let nextCurrency: string | undefined;

    // timezone-based hint (Qatar)
    let tz: string | undefined;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {}

    if (tz === 'Asia/Qatar' || tz === 'Asia/Riyadh') {
      nextLocale = navLocale.startsWith('ar') ? 'ar-QA' : 'en-QA';
      nextCurrency = 'QAR';
    }

    if (!nextCurrency) nextCurrency = guessCurrencyFromLocale(navLocale);

    setUserLocale(nextLocale || 'en-US');
    setUserDisplayCurrency((nextCurrency || 'USD').toUpperCase());
  }, []);

  

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, handleClose]);

  // reset transient UI errors on key changes
  useEffect(() => setUiError(null), [cycle, method, tier, open]);

  // helpful mapping for cycle
  const billCycleKey: 'monthly' | 'yearly' = cycle === 'annual' ? 'yearly' : 'monthly';

  // Base USD price from USD pricing table (canonical)
  const usdCents: number | null =
    (pricingUSD as OrgPricingTable | null)?.tiers?.[tier]?.[billCycleKey] ?? null;

  // Actual KES price from KES pricing table (best for M-Pesa display)
  const kesCents: number | null =
    (pricingKES as OrgPricingTable | null)?.tiers?.[tier]?.[billCycleKey] ?? null;

  const seats: number | null =
    (pricingUSD as OrgPricingTable | null)?.tiers?.[tier]?.seats ??
    (pricingKES as OrgPricingTable | null)?.tiers?.[tier]?.seats ??
    null;

  const anyLoading = pricingLoadingUSD || pricingLoadingKES;
  const anyError = pricingErrorUSD || pricingErrorKES;

  // Local estimate from USD (UI only)
  const localEstimate = useMemo(() => {
    if (usdCents == null) return null;
    const usdMajor = centsToMajor(usdCents);
    const local = (userDisplayCurrency || 'USD').toUpperCase();
    const rate = USD_ESTIMATE_RATES[local];
    if (!rate || local === 'USD') return null;
    return { local, amount: usdMajor * rate, rate };
  }, [usdCents, userDisplayCurrency]);

  const headerBaseUsd = useMemo(() => {
    if (usdCents == null) return null;
    return formatMoneyIntl(userLocale, 'USD', centsToMajor(usdCents));
  }, [usdCents, userLocale]);

  const gaValue = useMemo(() => {
    const isMpesa = method === 'M-Pesa';
    const amountMajor = isMpesa ? centsToMajor(kesCents || 0) : centsToMajor(usdCents || 0);
    return {
      currency: isMpesa ? 'KES' : 'USD',
      value: safeNumber(amountMajor, 0),
    };
  }, [method, kesCents, usdCents]);

  const gaItem = useMemo(() => {
    const variant = cycle === 'annual' ? 'annual' : 'monthly';
    return [
      buildOrgPlanItem({
        tier,
        cycle: variant,
        seats: seats ?? undefined,
        amountMajor: gaValue.value,
      }),
    ];
  }, [tier, cycle, seats, gaValue.value]);

  // Decide what “primary” shown price is:
  // - Paystack: show local estimate big (if available) + base USD
  // - M-Pesa: show actual KES big (if available) + base USD
  const headerPrimary = useMemo(() => {
    if (method === 'M-Pesa') {
      if (kesCents != null) return formatMoneyIntl('en-KE', 'KES', centsToMajor(kesCents), 0);
      if (localEstimate && localEstimate.local === 'KES') {
        return formatMoneyIntl('en-KE', 'KES', localEstimate.amount, 0);
      }
      return '—';
    }

    // Paystack
    if (localEstimate)
      return formatMoneyIntl(userLocale, localEstimate.local, localEstimate.amount);
    if (usdCents != null) return formatMoneyIntl(userLocale, 'USD', centsToMajor(usdCents));
    return '—';
  }, [method, kesCents, localEstimate, usdCents, userLocale]);

  const amountLabel = `${tier.toUpperCase()} • ${cycle === 'monthly' ? 'Monthly' : 'Annual'}`;

  const normPhone = useMemo(() => normalizeMpesaPhone(phone), [phone]);

  const handleMpesaInit = () => {
    const p = normalizeMpesaPhone(phone);
    if (!isLikelyMpesaPhone(p)) {
      setUiError('Enter a valid Safaricom number (e.g. 2547XXXXXXXX or 07XXXXXXXX).');
      return;
    }
    stashOrgCheckout();
    onCheckout({ method: 'M-Pesa', cycle, plan: tier, phone: p });
  };

  const handleMpesaComplete = () => {
    const p = normalizeMpesaPhone(phone);
    if (!isLikelyMpesaPhone(p)) {
      setUiError('Enter a valid Safaricom number (e.g. 2547XXXXXXXX or 07XXXXXXXX).');
      return;
    }
    stashOrgCheckout();
    onCheckout({
      method: 'M-Pesa',
      cycle,
      plan: tier,
      phone: p,
      reference: reference.trim() || undefined,
    });
  };

  useEffect(() => {
    if (!open) return;
    if (checkoutTracked) return;
    if (!gaValue.value || gaValue.value <= 0) return;

    const checkoutKey = `org:${orgId ?? 'unknown'}:${tier}:${cycle}`;
    trackCheckoutOnce(checkoutKey, () => {
      // begin_checkout: user starts checkout
      trackBeginCheckout({
        currency: gaValue.currency,
        value: gaValue.value,
        items: gaItem,
        payment_type: method === 'M-Pesa' ? 'mpesa' : 'paystack',
        affiliation: 'DayBreak Learner',
      });
    });

    setCheckoutTracked(true);
  }, [open, checkoutTracked, gaValue.currency, gaValue.value, gaItem, method, orgId, tier, cycle]);

  useEffect(() => {
    if (!open) {
      setCheckoutTracked(false);
      clearCheckoutOnce(checkoutKey);
    }
  }, [open, checkoutKey]);

  // add_payment_info: user chooses method / before redirect
  const paymentInfoKeyRef = React.useRef<string>('');
  useEffect(() => {
    if (!open) return;
    if (!gaValue.value || gaValue.value <= 0) return;

    const k = `${method}:${cycle}:${tier}:${gaValue.currency}:${gaValue.value}`;
    if (paymentInfoKeyRef.current === k) return;
    paymentInfoKeyRef.current = k;

    trackAddPaymentInfo({
      currency: gaValue.currency,
      value: gaValue.value,
      items: gaItem,
      payment_type: method === 'M-Pesa' ? 'mpesa' : 'paystack',
      affiliation: 'DayBreak Learner',
    });
  }, [open, method, cycle, tier, gaValue.currency, gaValue.value, gaItem]);

  const stashOrgCheckout = () => {
    if (!gaValue.value || gaValue.value <= 0) return;
    const variant = cycle === 'annual' ? 'annual' : 'monthly';
    stashCheckout('checkout:org', {
      kind: 'org',
      tier,
      cycle: variant,
      seats: seats ?? undefined,
      currency: gaValue.currency,
      value: gaValue.value,
      orgId: orgId ?? undefined,
      orgName: orgName ?? undefined,
      timestamp: Date.now(),
    });
  };



  const handlePaystack = () => {
    stashOrgCheckout();
    onCheckout({ method: 'Paystack', cycle, plan: tier });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Modal shell */}
      <div className="relative z-10 flex min-h-full items-center justify-center p-2 sm:p-4">
        <div
          className="relative w-full max-w-lg sm:max-w-xl md:max-w-2xl rounded-2xl bg-white text-[#0d141c] dark:bg-[#0f1821] dark:text-white ring-1 ring-[#cedbe8] dark:ring-white/10 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-slate-200 dark:border-white/10">
            <div className="min-w-0">
              <div className="text-[11px] sm:text-xs text-slate-500 dark:text-white/60 truncate">
                Upgrade for {orgName || 'your organization'}
              </div>
              <h3 className="text-base sm:text-lg font-semibold truncate">
                {tier === 'pro' ? 'Upgrade to PRO' : 'Upgrade to ENTERPRISE'}
              </h3>
            </div>

            <button
              onClick={handleClose}
              className="shrink-0 rounded-lg px-2.5 py-1 text-xs sm:text-sm bg-slate-100 text-[#0d141c] hover:bg-slate-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
            >
              Close
            </button>
          </div>

          {/* Body */}
          <div className="max-h-[85vh] overflow-y-auto px-3 sm:px-4 py-3 sm:py-4 space-y-3 sm:space-y-4">
            {anyError ? (
              <div className="rounded-xl ring-1 ring-red-200 bg-red-50 dark:ring-red-500/20 dark:bg-red-500/10 p-3 text-sm">
                Failed to load pricing. Please refresh and try again.
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              {/* LEFT */}
              <div className="space-y-3">
                {/* Billing */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs sm:text-sm text-slate-600 dark:text-white/70">
                    Billing:
                  </span>

                  <div className="inline-flex rounded-lg overflow-hidden ring-1 ring-slate-200 dark:ring-white/10 text-xs sm:text-sm">
                    <button
                      onClick={() => setCycle('monthly')}
                      className={`px-2.5 sm:px-3 py-1.5 ${
                        cycle === 'monthly'
                          ? 'bg-slate-200 dark:bg-white/10'
                          : 'bg-transparent hover:bg-slate-100 dark:hover:bg-white/5'
                      }`}
                    >
                      Monthly
                    </button>
                    <button
                      onClick={() => setCycle('annual')}
                      className={`px-2.5 sm:px-3 py-1.5 ${
                        cycle === 'annual'
                          ? 'bg-slate-200 dark:bg-white/10'
                          : 'bg-transparent hover:bg-slate-100 dark:hover:bg-white/5'
                      }`}
                    >
                      Annual
                    </button>
                  </div>
                </div>

                {/* Method selector */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs sm:text-sm text-slate-600 dark:text-white/70">
                    Pay with:
                  </span>

                  <div className="inline-flex rounded-lg overflow-hidden ring-1 ring-slate-200 dark:ring-white/10 text-xs sm:text-sm">
                    <button
                      onClick={() => setMethod('Paystack')}
                      className={`px-2.5 sm:px-3 py-1.5 flex items-center gap-2 ${
                        method === 'Paystack'
                          ? 'bg-slate-200 dark:bg-white/10'
                          : 'bg-transparent hover:bg-slate-100 dark:hover:bg-white/5'
                      }`}
                      title="Card checkout (Paystack hosted)"
                    >
                      {assets?.visamaster ? (
                        <img src={assets.visamaster} alt="Card" className="h-6 object-contain" />
                      ) : (
                        <span className="font-semibold">Card</span>
                      )}
                    </button>

                    <button
                      onClick={() => setMethod('M-Pesa')}
                      className={`px-2.5 sm:px-3 py-1.5 flex items-center gap-2 ${
                        method === 'M-Pesa'
                          ? 'bg-slate-200 dark:bg-white/10'
                          : 'bg-transparent hover:bg-slate-100 dark:hover:bg-white/5'
                      }`}
                      title="Safaricom M-Pesa"
                    >
                      {assets?.mpesa ? (
                        <img src={assets.mpesa} alt="M-Pesa" className="h-6 object-contain" />
                      ) : (
                        <span className="font-semibold">M-Pesa</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Loading hint */}
                {anyLoading ? (
                  <div className="text-[11px] text-slate-500 dark:text-white/60">
                    Loading pricing…
                  </div>
                ) : null}

                {uiError ? (
                  <div className="rounded-lg ring-1 ring-orange-200 bg-orange-50 dark:ring-orange-500/20 dark:bg-orange-500/10 px-3 py-2 text-[12px] text-slate-800 dark:text-white/80">
                    {uiError}
                  </div>
                ) : null}

                {/* M-Pesa */}
                {method === 'M-Pesa' ? (
                  <div className="rounded-xl ring-1 ring-slate-200 bg-slate-50 dark:ring-white/10 dark:bg-white/5 p-3 sm:p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-white">M-Pesa</h4>

                    {/* confusion-killer price box */}
                    <div className="rounded-lg bg-white dark:bg-white/5 ring-1 ring-slate-200 dark:ring-white/10 p-3 text-xs">
                      <div className="text-slate-700 dark:text-white/80 space-y-1">
                        <div>
                          Charged in KES:{' '}
                          <b>
                            {kesCents != null
                              ? formatMoneyIntl('en-KE', 'KES', centsToMajor(kesCents), 0)
                              : '(KES price unavailable)'}
                          </b>
                        </div>

                        {headerBaseUsd ? (
                          <div>
                            Base (USD): <b>{headerBaseUsd}</b>
                          </div>
                        ) : null}

                        {localEstimate ? (
                          <div className="text-[11px] opacity-70">
                            (UI estimate uses rate {localEstimate.rate})
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <label className="block">
                      <span className="text-xs sm:text-sm text-slate-700 dark:text-white/80">
                        Safaricom Phone Number
                      </span>
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="2547XXXXXXXX or 07XXXXXXXX"
                        className="w-full mt-1 p-2 rounded bg-white text-[#0d141c] ring-1 ring-slate-200 outline-none focus:ring-slate-400 dark:bg-[#0f1821] dark:text-white dark:ring-white/10 dark:focus:ring-white/20 text-sm"
                      />
                      {!!phone && (
                        <div className="mt-1 text-[11px] text-slate-500 dark:text-white/60">
                          Normalized: <b>{normPhone || '—'}</b>
                        </div>
                      )}
                    </label>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        onClick={handleMpesaInit}
                        className="w-full sm:w-auto px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm"
                        title="Send STK push"
                      >
                        Initiate STK Push
                      </button>

                      <button
                        onClick={handleMpesaComplete}
                        className="w-full sm:w-auto px-3 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm"
                        title="Activate after confirming on device"
                      >
                        Complete Payment
                      </button>
                    </div>

                    <details className="group rounded-lg bg-slate-50 dark:bg-white/5 ring-1 ring-slate-200 dark:ring-white/10">
                      <summary className="cursor-pointer list-none px-3 py-2 text-xs sm:text-sm text-slate-700 dark:text-white/80 flex items-center justify-between">
                        Having issues? Enter M-Pesa reference
                        <span className="ml-2 text-slate-500 dark:text-white/60 group-open:rotate-180 transition-transform">
                          ▾
                        </span>
                      </summary>
                      <div className="px-3 pb-3 space-y-2">
                        <input
                          type="text"
                          value={reference}
                          onChange={(e) => setReference(e.target.value)}
                          placeholder="Receipt / reference number (optional)"
                          className="w-full p-2 rounded bg-white text-[#0d141c] ring-1 ring-slate-200 outline-none focus:ring-slate-400 dark:bg-[#0f1821] dark:text-white dark:ring-white/10 dark:focus:ring-white/20 text-sm"
                        />
                        <button
                          onClick={handleMpesaComplete}
                          className="w-full px-3 py-2 rounded bg-orange-600 hover:bg-orange-500 text-white text-sm"
                        >
                          Update Reference / Complete
                        </button>
                      </div>
                    </details>

                    <div className="text-[11px] text-slate-500 dark:text-white/60">
                      Tip: keep your phone nearby to approve the STK prompt.
                    </div>
                  </div>
                ) : null}

                {/* Paystack */}
                {method === 'Paystack' ? (
                  <div className="rounded-xl ring-1 ring-slate-200 dark:ring-white/10 bg-slate-50 dark:bg-white/5 p-3 sm:p-4 space-y-2">
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-white">
                      Card checkout
                    </h4>

                    <p className="text-[11px] text-slate-600 dark:text-white/70">
                      You’ll be redirected to Paystack to pay for <b>{amountLabel}</b>.
                    </p>

                    {/* confusion-killer copy */}
                    <div className="rounded-lg bg-white dark:bg-white/5 ring-1 ring-slate-200 dark:ring-white/10 p-3 text-xs">
                      <div className="text-slate-700 dark:text-white/80 space-y-1">
                        <div>
                          Base (USD): <b>{headerBaseUsd ?? '—'}</b>
                        </div>

                        <div>
                          Checkout (KES):{' '}
                          <b>
                            {kesCents != null
                              ? formatMoneyIntl('en-KE', 'KES', centsToMajor(kesCents), 0)
                              : '(KES price unavailable)'}
                          </b>
                        </div>

                        {localEstimate ? (
                          <div>
                            Local display:{' '}
                            <b>
                              {formatMoneyIntl(
                                userLocale,
                                localEstimate.local,
                                localEstimate.amount
                              )}
                            </b>{' '}
                            <span className="opacity-70">(rate: {localEstimate.rate})</span>
                          </div>
                        ) : (
                          <div className="text-[11px] opacity-70">
                            (No local estimate available for {userDisplayCurrency}.)
                          </div>
                        )}

                        <div className="mt-1 text-[11px] opacity-70">
                          Note: We show USD as the base price for consistency. Final checkout is in{' '}
                          <b>KES</b>.
                        </div>

                        <div className="mt-1 text-[11px] opacity-70">
                          Final amount is shown by Paystack at checkout.
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handlePaystack}
                      className="w-full px-3 py-2 rounded bg-slate-900 hover:bg-slate-800 text-white text-sm"
                    >
                      Continue to Paystack
                    </button>

                    <p className="text-[11px] text-slate-500 dark:text-white/60">
                      After payment, you’ll return automatically and your subscription will
                      activate.
                    </p>
                  </div>
                ) : null}
              </div>

              {/* RIGHT summary */}
              <div className="space-y-3">
                <div className="rounded-xl ring-1 ring-slate-200 dark:ring-white/10 bg-slate-50 dark:bg-white/5 p-3 sm:p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-sm sm:text-base font-semibold truncate text-slate-900 dark:text-white">
                      {tier.toUpperCase()} plan
                    </h4>

                    <div className="text-right shrink-0">
                      <div className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white">
                        {headerPrimary}
                      </div>

                      <div className="text-[11px] text-slate-500 dark:text-white/60">
                        {cycle === 'monthly' ? 'per month' : 'per year'}
                        {seats != null ? <> • {seats.toLocaleString()} seats</> : null}
                      </div>

                      {headerBaseUsd ? (
                        <div className="text-[11px] text-slate-500 dark:text-white/60">
                          Base USD: <b>{headerBaseUsd}</b>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="text-[11px] sm:text-xs text-slate-600 dark:text-white/70">
                    Selected: <b>{amountLabel}</b>
                  </div>

                  <div className="text-[11px] text-slate-500 dark:text-white/60">
                    Method: <b>{method}</b>
                  </div>
                </div>

                {/* Plan bar (pills + feature chips) */}
                <div
                  className="
                    rounded-2xl ring-1 ring-[#e7edf4] dark:ring-white/10
                    bg-white/95 dark:bg-slate-900/70
                    p-3 sm:p-4
                "
                >
                  {/* feature chips */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(PLAN_META[tier]?.features || []).map((f) => (
                      <span
                        key={f}
                        className="
                        px-2 py-0.5 rounded-full text-[11px]
                        bg-[#e7edf4] text-slate-800
                        dark:bg-white/10 dark:text-white/90
                        "
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>

                {/* small note */}
                <div className="rounded-xl ring-1 ring-slate-200 dark:ring-white/10 bg-white dark:bg-white/5 p-3 text-[11px] text-slate-600 dark:text-white/70">
                  Need a custom seat count? Enterprise supports tailored pricing—contact support
                  from your Org profile.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
