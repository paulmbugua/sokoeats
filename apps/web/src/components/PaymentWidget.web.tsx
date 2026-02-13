// apps/web/src/components/payment/PaymentWidget.web.tsx
import React, { useMemo, useEffect, useRef, useState } from 'react';
import { assets } from '../assets/assets';
import { FaStar, FaStarHalfAlt, FaRegStar } from 'react-icons/fa';
import debounce from 'lodash.debounce';
import Spinner from './Spinner.web';
import { usePayment, useHomePage } from '@mytutorapp/shared/hooks';
import { Link } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import { paystackCreateOrder } from '@mytutorapp/shared/api';
import { trackBeginCheckout, trackAddPaymentInfo, trackPurchase } from '@/analytics/ga4';
import { buildTokensItem, majorFromMinor, safeNumber } from '@/analytics/ecomBuilders';
import { clearCheckout, readCheckout, stashCheckout } from '@/analytics/checkoutStash';
import { clearCheckoutOnce, trackCheckoutOnce } from '@/analytics/checkoutOnce';
import type {
  PaymentPackage,
  UpdatedProfileData,
  ProfileData,
  MappedProfile,
  Profile as BareProfile,
  PayoutCurrency,
} from '@mytutorapp/shared/types';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  showTutorPreview?: boolean;
};

const TutorRating = ({ rating, totalReviews }: { rating: number; totalReviews: number }) => {
  const rounded = Math.round(rating * 2) / 2;
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    if (rounded >= i) stars.push(<FaStar key={i} className="text-yellow-500" />);
    else if (rounded + 0.5 === i) stars.push(<FaStarHalfAlt key={i} className="text-yellow-500" />);
    else stars.push(<FaRegStar key={i} className="text-yellow-500" />);
  }
  return (
    <div className="flex items-center">
      {stars}
      <span className="ml-2 text-xs text-gray-400">
        ({totalReviews} {totalReviews === 1 ? 'review' : 'reviews'})
      </span>
    </div>
  );
};

/** Safely derive payout currency from any of your known profile shapes. */
function normalizeCurrency(input?: string | null): PayoutCurrency | undefined {
  if (!input) return undefined;
  const up = input.toUpperCase();
  if (up === 'USD') return 'USD';
  if (up === 'KES' || up === 'KSH' || up === 'KSHS') return 'KES';
  return undefined;
}

function getPayoutCurrency(
  p: BareProfile | UpdatedProfileData | ProfileData | MappedProfile | undefined
): PayoutCurrency | undefined {
  if (!p) return undefined;

  // camelCase (UpdatedProfileData/ProfileData)
  const camel = (p as UpdatedProfileData | ProfileData | { payoutCurrency?: string })
    .payoutCurrency;
  const c1 = normalizeCurrency(camel);
  if (c1) return c1;

  // snake_case (MappedProfile)
  const snake = (p as MappedProfile | { payout_currency?: string }).payout_currency;
  const c2 = normalizeCurrency(snake);
  if (c2) return c2;

  // heuristic fallback: payoutMethod mpesa => KES
  const pm =
    (p as UpdatedProfileData | ProfileData | { payoutMethod?: string }).payoutMethod ??
    (p as MappedProfile | { payout_method?: string }).payout_method;
  if (typeof pm === 'string' && pm.toLowerCase() === 'mpesa') return 'KES';

  return undefined;
}

/* ───────────────────── Locale + FX helpers ───────────────────── */

// Guess browser locale (client only)
function getBrowserLocale(): string {
  if (typeof navigator === 'undefined') return 'en-US';
  return navigator.language || 'en-US';
}

// Map region codes → likely currency
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

// Approximate FX table from USD → local (for UI hints only)
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

const PaymentWidget: React.FC<Props> = ({
  isOpen,
  onClose,
  title = 'Buy Tokens',
  showTutorPreview = false,
}) => {
  // Minimal search props to satisfy useHomePage (no UI here)
  const { loading: _loadingProfiles } = useHomePage();

  // Payment logic from shared hook
  const {
    packages,
    selectedPackage,
    handlePackageSelection,
    profile,
    mainImage,
    loadingProfile,
    ratingData,
    selectedPaymentMethod,
    handlePaymentSelection,
    phoneNumber,
    setPhoneNumber,
    showMpesaModal: _showMpesaModal,
    setShowMpesaModal,
    initiatingPayment,
    handleInitiateMpesaPayment,
    handleCompletePayment,
    mpesaReference,
    setMpesaReference,
    handleUpdateMpesaReference,
    handleCheckout,
    inferredCurrency, // 'USD' | 'KES'
  } = usePayment();

  const { token, backendUrl } = useShopContext();

  /* ───────────────────────── Paystack hosted checkout state ───────────────────────── */
  const [cardProcessing, setCardProcessing] = useState(false);

  // Profile-aware locale + display currency
  const [userLocale, setUserLocale] = useState<string>('en-US');
  const [userDisplayCurrency, setUserDisplayCurrency] = useState<string>('USD');
  const checkoutEventKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const navLocale = getBrowserLocale() || 'en-US';
    let nextLocale = navLocale;
    let nextCurrency: string | undefined;

    // 1) Try time zone FIRST (current physical-ish location)
    let tz: string | undefined;
    try {
      if (typeof Intl !== 'undefined') {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      }
    } catch {
      tz = undefined;
    }

    // Qatar special-case (Chrome sometimes reports Asia/Riyadh)
    if (tz === 'Asia/Qatar' || tz === 'Asia/Riyadh') {
      nextLocale = navLocale.startsWith('ar') ? 'ar-QA' : 'en-QA';
      nextCurrency = 'QAR';
    }

    // 2) If time zone didn’t decide, look at profile country
    if (!nextCurrency) {
      const countryRaw =
        (profile as any)?.country ??
        (profile as any)?.countryCode ??
        (profile as any)?.country_code ??
        null;

      const country = typeof countryRaw === 'string' ? countryRaw.trim().toUpperCase() : undefined;

      if (country === 'QA' || country === 'QATAR') {
        nextLocale = navLocale.startsWith('ar') ? 'ar-QA' : 'en-QA';
        nextCurrency = 'QAR';
      } else if (country === 'KE' || country === 'KENYA') {
        nextLocale = 'en-KE';
        nextCurrency = 'KES';
      } else if (country === 'UG' || country === 'UGANDA') {
        nextLocale = 'en-UG';
        nextCurrency = 'UGX';
      } else if (country === 'TZ' || country === 'TANZANIA') {
        nextLocale = 'en-TZ';
        nextCurrency = 'TZS';
      }
    }

    // 3) Final fallback: guess from browser locale (en-US → USD, en-GB → GBP)
    if (!nextCurrency) {
      nextCurrency = guessCurrencyFromLocale(navLocale);
    }

    setUserLocale(nextLocale || 'en-US');
    setUserDisplayCurrency((nextCurrency || 'USD').toUpperCase());
  }, [profile]);

  /* ───────────────────── Locale-aware price formatting ───────────────────── */

  const formatPrice = (pkg: PaymentPackage) => {
    const baseCurrency = (pkg.currency || '').toUpperCase();
    const basePrice = Number(pkg.price || 0);

    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      return `${baseCurrency} ${pkg.price}`;
    }

    // Non-USD packages → format directly in that currency
    if (baseCurrency !== 'USD') {
      try {
        return new Intl.NumberFormat(userLocale, {
          style: 'currency',
          currency: baseCurrency,
          currencyDisplay: 'symbol',
        }).format(basePrice);
      } catch {
        if (baseCurrency === 'KES') return `KSh ${basePrice.toLocaleString('en-KE')}`;
        return `${baseCurrency} ${basePrice.toFixed(2)}`;
      }
    }

    // USD packages – canonical billing currency
    const localCurrency = (userDisplayCurrency || 'USD').toUpperCase();
    const rate = USD_ESTIMATE_RATES[localCurrency];

    // If local display currency is also USD or unsupported → show only USD
    if (!rate || localCurrency === 'USD') {
      return new Intl.NumberFormat(userLocale, {
        style: 'currency',
        currency: 'USD',
        currencyDisplay: 'symbol',
      }).format(basePrice);
    }

    const localAmount = basePrice * rate;
    try {
      return new Intl.NumberFormat(userLocale, {
        style: 'currency',
        currency: localCurrency,
        currencyDisplay: 'symbol',
      }).format(localAmount);
    } catch {
      return `${localCurrency} ${localAmount.toFixed(2)}`;
    }
  };

  const formatPayButtonLabel = (pkg: PaymentPackage) => {
    const baseCurrency = (pkg.currency || '').toUpperCase();
    const basePrice = Number(pkg.price || 0);

    if (!Number.isFinite(basePrice) || basePrice <= 0) return 'Pay';

    // If package itself is non-USD (e.g. KES)
    if (baseCurrency !== 'USD') {
      try {
        const label = new Intl.NumberFormat(userLocale, {
          style: 'currency',
          currency: baseCurrency,
          currencyDisplay: 'symbol',
        }).format(basePrice);
        return `Pay ${label}`;
      } catch {
        return `Pay ${baseCurrency} ${basePrice.toFixed(2)}`;
      }
    }

    // USD package → show local-only label if possible
    const localCurrency = (userDisplayCurrency || 'USD').toUpperCase();
    const rate = USD_ESTIMATE_RATES[localCurrency];

    if (!rate || localCurrency === 'USD') {
      const usdLabel = new Intl.NumberFormat(userLocale, {
        style: 'currency',
        currency: 'USD',
        currencyDisplay: 'symbol',
      }).format(basePrice);
      return `Pay ${usdLabel}`;
    }

    const localAmount = basePrice * rate;
    try {
      const localLabel = new Intl.NumberFormat(userLocale, {
        style: 'currency',
        currency: localCurrency,
        currencyDisplay: 'symbol',
      }).format(localAmount);
      return `Pay ${localLabel}`;
    } catch {
      return `Pay ${localCurrency} ${localAmount.toFixed(2)}`;
    }
  };

  /* ───────────────────── Paystack hosted checkout ───────────────────── */

  const buildTokensCheckoutPayload = (method: 'paystack' | 'mpesa') => {
    if (!selectedPackage) return null;
    const currency = String(selectedPackage.currency || 'USD').toUpperCase();
    const value = safeNumber(selectedPackage.price, 0);
    const items = [buildTokensItem(selectedPackage)];
    if (!items[0]?.item_id || !items[0]?.item_name) return null;
    return { currency, value, items, payment_type: method, affiliation: 'DayBreak Learner' };
  };

  const trackTokensCheckout = (method: 'paystack' | 'mpesa') => {
    const payload = buildTokensCheckoutPayload(method);
    if (!payload || payload.value <= 0) return;
    const itemId = payload.items[0]?.item_id || 'tokens';
    const baseKey = `${method}:${itemId}:${payload.currency}:${payload.value}`;
    const checkoutKey = selectedPackage
      ? `tokens:${safeNumber(selectedPackage.credits, 0)}:${safeNumber(selectedPackage.price, 0)}`
      : baseKey;

    if (!checkoutEventKeysRef.current.has(`begin:${baseKey}`)) {
      // begin_checkout: user starts checkout
      trackCheckoutOnce(checkoutKey, () => {
        trackBeginCheckout({ ...payload, cart_signature: checkoutKey });
      });
      checkoutEventKeysRef.current.add(`begin:${baseKey}`);
    }

    if (!checkoutEventKeysRef.current.has(`add:${baseKey}`)) {
      // add_payment_info: user chooses method / before redirect
      trackAddPaymentInfo(payload);
      checkoutEventKeysRef.current.add(`add:${baseKey}`);
    }
  };

  const stashTokensCheckout = (method: 'paystack' | 'mpesa', reference?: string) => {
    if (!selectedPackage) return;
    const payload = buildTokensCheckoutPayload(method);
    if (!payload) return;
    stashCheckout('checkout:tokens', {
      kind: 'tokens',
      credits: safeNumber(selectedPackage.credits, 0),
      currency: payload.currency,
      value: payload.value,
      reference,
      timestamp: Date.now(),
    });
  };

  const handlePaystackHosted = useMemo(
    () =>
      debounce(async () => {
        if (!selectedPackage) {
          alert('Select a package');
          return;
        }
        if ((selectedPackage.currency || '').toUpperCase() !== 'USD') {
          alert('Please select a USD package for card checkout.');
          return;
        }
        if (!backendUrl || !token) {
          alert('Sign in again');
          return;
        }

        trackTokensCheckout('paystack');
        stashTokensCheckout('paystack');

        setCardProcessing(true);
        try {
          const o = await paystackCreateOrder(backendUrl, token, {
            packageId: selectedPackage.id,
          });

          stashTokensCheckout('paystack', o.reference);

          // hosted checkout (PCI-safe)
          window.location.href = o.authorization_url;
        } catch (e: any) {
          alert(e?.response?.data?.message || e?.message || 'Unable to start Paystack checkout.');
        } finally {
          setCardProcessing(false);
        }
      }, 300),
    [backendUrl, token, selectedPackage]
  );

  /* ───────────────────────── Existing debounced actions ───────────────────── */

  const debouncedCheckout = useMemo(() => debounce(handleCheckout, 300), [handleCheckout]);
  const debouncedInitiate = useMemo(
    () => debounce(handleInitiateMpesaPayment, 300),
    [handleInitiateMpesaPayment]
  );
  const debouncedUpdateRef = useMemo(
    () => debounce(handleUpdateMpesaReference, 300),
    [handleUpdateMpesaReference]
  );

  useEffect(() => {
    return () => {
      debouncedCheckout.cancel();
      debouncedInitiate.cancel();
      debouncedUpdateRef.cancel();
      handlePaystackHosted.cancel();
    };
  }, [debouncedCheckout, debouncedInitiate, debouncedUpdateRef, handlePaystackHosted]);

  /* -------------------------------------------------------
   * Default UX based on payout currency
   * -----------------------------------------------------*/
  const payoutPref = useMemo(() => getPayoutCurrency(profile as any), [profile]);

  useEffect(() => {
    if (!isOpen) return;
    if (payoutPref === 'KES') {
      handlePaymentSelection('M-Pesa');
      setShowMpesaModal(true);
    } else {
      handlePaymentSelection('Paystack'); // treat as card / USD
      setShowMpesaModal(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, payoutPref]);

  /* -------------------------------------------------------
   * Package filtering by inferredCurrency
   * -----------------------------------------------------*/
  const displayedPackages = useMemo<PaymentPackage[]>(() => {
    if (!Array.isArray(packages)) return [];
    return (packages as PaymentPackage[]).filter(
      (p) => (p.currency || '').toUpperCase() === inferredCurrency
    );
  }, [packages, inferredCurrency]);

  // Auto-select first package when list changes or was cleared
  useEffect(() => {
    if (!selectedPackage && displayedPackages.length) {
      handlePackageSelection(displayedPackages[0] as PaymentPackage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedPackages, selectedPackage]);

  /* ───────────────────── KES-at-checkout hint values ───────────────────── */

  const paystackBaseUsdText = useMemo(() => {
    if (!selectedPackage) return null;
    if ((selectedPackage.currency || '').toUpperCase() !== 'USD') return null;

    const usd = Number(selectedPackage.price || 0);
    if (!Number.isFinite(usd) || usd <= 0) return null;

    return new Intl.NumberFormat(userLocale, {
      style: 'currency',
      currency: 'USD',
    }).format(usd);
  }, [selectedPackage, userLocale]);

  const paystackKesEstimateText = useMemo(() => {
    if (!selectedPackage) return null;
    if ((selectedPackage.currency || '').toUpperCase() !== 'USD') return null;

    const usd = Number(selectedPackage.price || 0);
    if (!Number.isFinite(usd) || usd <= 0) return null;

    const fx = USD_ESTIMATE_RATES.KES || 130;
    const kes = usd * fx;

    // show nice "KES 1,560"
    const kesPretty = new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      currencyDisplay: 'code',
      maximumFractionDigits: 0,
    }).format(kes);

    return { fx, kesPretty };
  }, [selectedPackage]);

  if (!isOpen) return null;

  const resolveTokensItems = () => {
    if (selectedPackage) return [buildTokensItem(selectedPackage)];
    const stashed = readCheckout('checkout:tokens');
    return [buildTokensItem({ credits: stashed?.credits, price: stashed?.value })];
  };
  const checkoutKey = selectedPackage
    ? `tokens:${safeNumber(selectedPackage.credits, 0)}:${safeNumber(selectedPackage.price, 0)}`
    : '';
  const handleClose = () => {
    if (checkoutKey) clearCheckoutOnce(checkoutKey);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} aria-hidden />

      {/* Slide-over panel */}
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-[480px] bg-white dark:bg-[#0f1821] shadow-2xl ring-1 ring-gray-200 dark:ring-darkCard
                   animate-[slideIn_.25s_ease-out] overflow-y-auto"
        style={{ animationName: 'slideIn' }}
      >
        <style>
          {`@keyframes slideIn { from { transform: translateX(16px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}
        </style>

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-gray-200 dark:border-darkCard bg-white/90 dark:bg-[#0f1821]/90 backdrop-blur">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={handleClose}
            className="rounded-lg px-3 py-1 text-sm bg-gray-100 dark:bg-[#172534] hover:opacity-90"
          >
            Close
          </button>
        </div>

        {/* Policy links / fine print */}
        <div className="text-[11px] leading-5 text-gray-500 dark:text-darkTextSecondary border-t pt-3 px-4">
          By paying you agree to our{' '}
          <Link to="/refunds" className="text-primary underline">
            Refund & Cancellation Policy
          </Link>{' '}
          and{' '}
          <Link to="/fulfillment" className="text-primary underline">
            Fulfillment & Delivery Policy
          </Link>
          . See{' '}
          <Link to="/payment-flow" className="text-primary underline">
            how payments work
          </Link>
          .
        </div>

        <div className="p-4 space-y-6">
          {/* Optional tutor preview for trust */}
          {showTutorPreview && (
            <div className="rounded-lg border border-gray-200 dark:border-darkCard">
              <div className="p-4">
                {loadingProfile ? (
                  <p className="text-sm text-gray-500">Loading tutor profile…</p>
                ) : profile ? (
                  <>
                    <div className="w-full aspect-[16/10] overflow-hidden rounded-lg">
                      <img
                        src={mainImage ?? undefined}
                        alt={(profile as BareProfile).name || 'Tutor'}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="mt-3">
                      <p className="font-semibold">{(profile as BareProfile).name}</p>
                      <TutorRating
                        rating={ratingData.avgRating}
                        totalReviews={ratingData.totalReviews}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">No tutor profile found.</p>
                )}
              </div>
            </div>
          )}

          {/* Packages */}
          <div>
            <div className="flex items-center justify-between">
              <h4 className="text-base font-semibold">Choose your package</h4>
              <span className="text-xs rounded px-2 py-0.5 bg-gray-100 dark:bg-[#172534]">
                Base: {inferredCurrency} · Local: {userDisplayCurrency}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {displayedPackages.length ? (
                displayedPackages.map((pkg) => (
                  <button
                    key={pkg.id}
                    onClick={() => handlePackageSelection(pkg)}
                    className={`w-full text-left p-3 rounded-lg border transition
                      ${
                        selectedPackage?.id === pkg.id
                          ? 'border-pink-500 bg-pink-50 dark:bg-[#1b1d2a]'
                          : 'border-gray-200 dark:border-darkCard hover:bg-gray-50 dark:hover:bg-[#121927]'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{pkg.credits} Tokens</p>
                        <p className="text-xs text-gray-500">{pkg.offer}</p>
                      </div>
                      <span className="text-sm font-bold text-pink-600">{formatPrice(pkg)}</span>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-sm text-gray-500">No {inferredCurrency} packages available.</p>
              )}
            </div>
          </div>

          {/* Payment Methods */}
          <div className="rounded-lg border border-gray-200 dark:border-darkCard p-4">
            <h4 className="text-base font-semibold">Payment method</h4>

            {/* Card vs M-Pesa */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                onClick={() => handlePaymentSelection('Paystack')}
                className={`w-full h-14 bg-white dark:bg-[#0f1821] border rounded-md flex items-center justify-center
                  hover:opacity-90 transition
                  ${
                    selectedPaymentMethod === 'Paystack'
                      ? 'border-pink-500'
                      : 'border-gray-200 dark:border-darkCard'
                  }`}
              >
                {assets.visamaster ? (
                  <img
                    src={assets.visamaster}
                    alt="Pay with card"
                    className="h-10 object-contain"
                  />
                ) : (
                  <span className="text-sm font-semibold">Card</span>
                )}
              </button>

              <button
                onClick={() => handlePaymentSelection('M-Pesa')}
                className={`w-full h-14 bg-white dark:bg-[#0f1821] border rounded-md flex items-center justify-center
                  hover:opacity-90 transition
                  ${
                    selectedPaymentMethod === 'M-Pesa' || selectedPaymentMethod === 'MPESA'
                      ? 'border-pink-500'
                      : 'border-gray-200 dark:border-darkCard'
                  }`}
              >
                <img src={assets.mpesa} alt="M-Pesa" className="h-10 object-contain" />
              </button>
            </div>

            {/* Generic checkout button for other methods (none active now) */}
            {selectedPaymentMethod &&
              selectedPaymentMethod !== 'MPESA' &&
              selectedPaymentMethod !== 'M-Pesa' &&
              selectedPaymentMethod !== 'Paystack' && (
                <button
                  onClick={() => debouncedCheckout()}
                  disabled={!selectedPackage}
                  className="w-full mt-4 py-2 rounded-md font-semibold text-white bg-pink-500 hover:bg-pink-600 transition disabled:opacity-50"
                >
                  {`Buy ${selectedPackage?.credits || 0} Tokens`}
                </button>
              )}

            {/* M-Pesa inline panel (KES only) */}
            {(selectedPaymentMethod === 'M-Pesa' || selectedPaymentMethod === 'MPESA') && (
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-sm">Safaricom Phone Number</span>
                  <input
                    type="text"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="2547XXXXXXXX"
                    className="w-full mt-1 p-2 border rounded outline-none focus:ring-2 focus:ring-pink-500
                      bg-white dark:bg-[#0f1821] border-gray-200 dark:border-darkCard text-sm"
                  />
                </label>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      trackTokensCheckout('mpesa');
                      stashTokensCheckout('mpesa');
                      debouncedInitiate();
                    }}
                    disabled={initiatingPayment || !selectedPackage}
                    className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm disabled:opacity-50"
                  >
                    {initiatingPayment ? <Spinner /> : 'Initiate STK Push'}
                  </button>

                  <button
                    onClick={async () => {
                      trackTokensCheckout('mpesa');
                      stashTokensCheckout('mpesa');
                      const res = await handleCompletePayment();
                      const payment = res?.payment;
                      const meta =
                        typeof payment?.meta === 'string'
                          ? (() => {
                              try {
                                return JSON.parse(payment.meta);
                              } catch {
                                return null;
                              }
                            })()
                          : payment?.meta;
                      const amountMinor = meta?.paidKesMinor ?? meta?.expectedKesMinor;
                      const amountMajor =
                        majorFromMinor(amountMinor) || safeNumber(selectedPackage?.price, 0);
                      const transactionId =
                        payment?.mpesa_reference ||
                        payment?.transaction_id ||
                        res?.transactionId ||
                        '';
                      const currency = String(payment?.currency || 'KES').toUpperCase();

                      if (res?.ok && transactionId && amountMajor > 0) {
                        // purchase: only after backend confirm success
                        trackPurchase({
                          transaction_id: transactionId,
                          currency,
                          value: amountMajor,
                          payment_type: 'mpesa',
                          affiliation: 'DayBreak Learner',
                          items: resolveTokensItems(),
                        });
                        clearCheckout('checkout:tokens');
                        if (checkoutKey) clearCheckoutOnce(checkoutKey);
                      }
                      handleClose();
                    }}
                    disabled={!selectedPackage}
                    className="px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700 text-sm disabled:opacity-50"
                  >
                    Complete Payment
                  </button>
                </div>

                <div className="pt-3 border-t border-gray-200 dark:border-darkCard">
                  <label className="block">
                    <span className="text-sm">M-Pesa Reference (if STK failed)</span>
                    <input
                      type="text"
                      value={mpesaReference}
                      onChange={(e) => setMpesaReference(e.target.value)}
                      placeholder="Enter reference"
                      className="w-full mt-1 p-2 border rounded outline-none focus:ring-2 focus:ring-pink-500
                        bg-white dark:bg-[#0f1821] border-gray-200 dark:border-darkCard text-sm"
                    />
                  </label>

                  <button
                    onClick={() => debouncedUpdateRef()}
                    className="w-full mt-2 bg-orange-600 text-white py-2 rounded hover:bg-orange-700 text-sm"
                  >
                    Update Reference
                  </button>
                </div>
              </div>
            )}

            {/* Paystack hosted checkout (USD only) */}
            {selectedPaymentMethod === 'Paystack' && (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-gray-500">
                  You’ll be redirected to Paystack to complete a secure card payment.
                </p>

                {/* ✅ Confusion-killer copy */}
                {selectedPackage && (selectedPackage.currency || '').toUpperCase() === 'USD' && (
                  <div className="rounded-md border border-gray-200 dark:border-darkCard bg-gray-50 dark:bg-[#121927] p-3">
                    <div className="text-xs leading-5 text-gray-700 dark:text-gray-200">
                      <div>
                        Base (USD): <b>{paystackBaseUsdText ?? '—'}</b>
                      </div>
                      <div>
                        You’ll be charged in KES at checkout:{' '}
                        <b>{paystackKesEstimateText?.kesPretty ?? 'KES —'}</b>{' '}
                        <span className="opacity-70">
                          (rate: {paystackKesEstimateText?.fx ?? 130})
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] opacity-70">
                        Final KES amount is shown by Paystack.
                      </div>
                    </div>
                  </div>
                )}

                {/* Keep your existing local display info if you want */}
                {selectedPackage && (
                  <div className="text-xs opacity-80">
                    Local display: <b>{formatPrice(selectedPackage)}</b>
                  </div>
                )}

                {(!selectedPackage || (selectedPackage.currency || '').toUpperCase() !== 'USD') && (
                  <div className="mt-2 text-xs text-orange-600">
                    Please select a USD package to continue with card payment.
                  </div>
                )}

                <button
                  onClick={() => handlePaystackHosted()}
                  disabled={
                    cardProcessing ||
                    !selectedPackage ||
                    (selectedPackage.currency || '').toUpperCase() !== 'USD'
                  }
                  className="mt-2 w-full py-2 rounded-md font-semibold text-white bg-pink-500 hover:bg-pink-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {cardProcessing ? (
                    <>
                      <Spinner />
                      <span>Redirecting…</span>
                    </>
                  ) : selectedPackage ? (
                    <>{formatPayButtonLabel(selectedPackage)}</>
                  ) : (
                    <>Pay</>
                  )}
                </button>

                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  We don&apos;t collect or store your card details. Payment is handled by Paystack.
                </p>
              </div>
            )}
          </div>

          {void _showMpesaModal}
        </div>
      </aside>
    </div>
  );
};

export default PaymentWidget;
