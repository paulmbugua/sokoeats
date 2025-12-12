// apps/web/src/components/payment/PaymentWidget.web.tsx
import React, { useMemo, useEffect, useState } from 'react';
import { assets } from '../assets/assets';
import { FaStar, FaStarHalfAlt, FaRegStar } from 'react-icons/fa';
import debounce from 'lodash.debounce';
import Spinner from './Spinner.web';
import { usePayment, useHomePage } from '@mytutorapp/shared/hooks';
import { Link } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import { paystackCardCharge, paystackSubmitOtp } from '@mytutorapp/shared/api';

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
  const camel = (p as UpdatedProfileData | ProfileData | { payoutCurrency?: string }).payoutCurrency;
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
  UG: 'UGX', // Uganda
  TZ: 'TZS', // Tanzania
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
  KES: 130,   // example for Kenya
  QAR: 3.64,  // Qatar
  EUR: 0.93,
  GBP: 0.8,
  NGN: 1500,
  ZAR: 18,
  INR: 83,
  UGX: 3800,  // Uganda (approx)
  TZS: 2800,  // Tanzania (approx)
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

  /* ───────────────────────── Card form state (Paystack) ───────────────────────── */

  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState(''); // MM/YY
  const [cardCvc, setCardCvc] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardProcessing, setCardProcessing] = useState(false);

  // OTP step state
  const [needsOtp, setNeedsOtp] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpReference, setOtpReference] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Profile-aware locale + display currency
  const [userLocale, setUserLocale] = useState<string>('en-US');
  const [userDisplayCurrency, setUserDisplayCurrency] = useState<string>('USD');

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

    // Your special case: Chrome reporting Asia/Riyadh even though you're in Qatar.
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

      const country =
        typeof countryRaw === 'string' ? countryRaw.trim().toUpperCase() : undefined;

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

  // Clear OTP state when closing widget or changing payment method
  useEffect(() => {
    if (!isOpen) {
      setNeedsOtp(false);
      setOtp('');
      setOtpReference(null);
      setOtpError(null);
      setCardError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    setNeedsOtp(false);
    setOtp('');
    setOtpReference(null);
    setOtpError(null);
  }, [selectedPaymentMethod]);

  // Format card number as "XXXX XXXX XXXX XXXX"
  const handleCardNumberChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 19);
    const groups = digits.match(/.{1,4}/g) || [];
    setCardNumber(groups.join(' '));
  };

  // Format expiry as "MM/YY"
  const handleCardExpiryChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    let formatted = digits;
    if (digits.length >= 3) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    setCardExpiry(formatted);
  };

  const handleCardCvcChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    setCardCvc(digits);
  };

  // Very light client-side validation
  const validateCardForm = (): boolean => {
    const numberDigits = cardNumber.replace(/\s+/g, '');
    if (numberDigits.length < 13 || numberDigits.length > 19) {
      setCardError('Please enter a valid card number.');
      return false;
    }

    const [mmStr, yyStr] = cardExpiry.split('/');
    const mm = Number(mmStr);
    const yy = Number(yyStr);

    if (!mm || !yy || mm < 1 || mm > 12) {
      setCardError('Please enter a valid expiry date.');
      return false;
    }

    const now = new Date();
    const currentYear2 = Number(String(now.getFullYear()).slice(-2));
    const currentMonth = now.getMonth() + 1;

    if (yy < currentYear2 || (yy === currentYear2 && mm < currentMonth)) {
      setCardError('This card appears to be expired.');
      return false;
    }

    if (cardCvc.length < 3 || cardCvc.length > 4) {
      setCardError('Please enter a valid CVV.');
      return false;
    }

    if (!cardName.trim()) {
      setCardError('Please enter the name on the card.');
      return false;
    }

    setCardError(null);
    return true;
  };

  /* ───────────────────── Locale-aware price formatting ───────────────────── */

  // Pretty price label with locale-aware estimate
  const formatPrice = (pkg: PaymentPackage) => {
    const baseCurrency = (pkg.currency || '').toUpperCase();
    const basePrice = Number(pkg.price || 0);

    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      return `${baseCurrency} ${pkg.price}`;
    }

    // Non-USD packages (e.g. KES for M-Pesa) → format directly in that currency
    if (baseCurrency !== 'USD') {
      try {
        return new Intl.NumberFormat(userLocale, {
          style: 'currency',
          currency: baseCurrency,
          currencyDisplay: 'symbol',
        }).format(basePrice);
      } catch {
        if (baseCurrency === 'KES') {
          return `KSh ${basePrice.toLocaleString('en-KE')}`;
        }
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

  // Shorter label specifically for the Pay button
  const formatPayButtonLabel = (pkg: PaymentPackage) => {
    const baseCurrency = (pkg.currency || '').toUpperCase();
    const basePrice = Number(pkg.price || 0);

    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      return 'Pay';
    }

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

  /* ───────────────────── Debounced Paystack card submit ───────────────────── */

  const handleCardPay = useMemo(
    () =>
      debounce(async () => {
        if (!selectedPackage) {
          setCardError('Please select a package first.');
          return;
        }
        if ((selectedPackage.currency || '').toUpperCase() !== 'USD') {
          setCardError('Please select a USD package to pay with card.');
          return;
        }
        if (!backendUrl || !token) {
          setCardError('Missing backend URL or login. Please sign in again.');
          return;
        }
        if (!validateCardForm()) return;

        try {
          setCardProcessing(true);
          setCardError(null);
          setNeedsOtp(false);
          setOtp('');
          setOtpReference(null);
          setOtpError(null);

          const numberDigits = cardNumber.replace(/\s+/g, '');
          const [mmStr, yyStrRaw] = cardExpiry.split('/');
          const yyStr = yyStrRaw?.length === 2 ? `20${yyStrRaw}` : yyStrRaw;

          const payload = {
            packageId: String(selectedPackage.id),
            card: {
              number: numberDigits,
              exp_month: mmStr,
              exp_year: yyStr,
              cvc: cardCvc,
              name: cardName.trim(),
            },
          };

          const data = await paystackCardCharge(backendUrl, token, payload);
          const anyData = data as any;

          // 1) Immediate success (webhook and DB already updated)
          if (anyData.ok || anyData.status === 'success') {
            alert('Payment successful! Your tokens will be updated shortly.');
            onClose();
            return;
          }

          // 2) Redirect-based auth (status === "open_url")
          if (
            anyData.paystackStatus === 'open_url' &&
            (anyData.authUrl || anyData.raw?.data?.url)
          ) {
            const redirectUrl = anyData.authUrl || anyData.raw.data.url;
            alert('Redirecting you to your bank to verify this payment…');
            window.location.href = redirectUrl;
            return;
          }

          // 3) Other “requiresAction” flows (OTP etc.)
          if (anyData.requiresAction) {
            setCardError(
              anyData.message ||
                anyData.gatewayResponse ||
                anyData.displayText ||
                'Additional verification required. Please complete verification to finish payment.'
            );
            return;
          }

          // 4) Generic failure
          setCardError(
            anyData.message ||
              anyData.gatewayResponse ||
              anyData.displayText ||
              'Payment failed. Please check your card details or try another method.'
          );
        } catch (err: any) {
          console.error('[paystack][card-charge] error', err);
          setCardError(
            err?.response?.data?.message ||
              err?.message ||
              'Unable to process payment at the moment.'
          );
        } finally {
          setCardProcessing(false);
        }
      }, 300),
    [
      selectedPackage,
      backendUrl,
      token,
      cardNumber,
      cardExpiry,
      cardCvc,
      cardName,
      onClose,
      // validateCardForm closed over
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  );

  /* ───────────────────── Debounced OTP submit ───────────────────── */

  const handleOtpSubmit = useMemo(
    () =>
      debounce(async () => {
        if (!otpReference) {
          setOtpError('Missing payment reference. Please try the card payment again.');
          return;
        }
        if (!otp.trim()) {
          setOtpError('Please enter the OTP sent by your bank.');
          return;
        }
        if (!backendUrl || !token) {
          setOtpError('Missing backend URL or login. Please sign in again.');
          return;
        }

        try {
          setCardProcessing(true);
          setOtpError(null);

          const data = await paystackSubmitOtp(backendUrl, token, {
            reference: otpReference,
            otp: otp.trim(),
          });

          if ((data as any).ok || (data as any).status === 'success') {
            alert('Payment successful! Your tokens will be updated shortly.');
            onClose();
          } else if ((data as any).requiresAction) {
            setOtpError(
              (data as any).message ||
                'We could not confirm your OTP. Please double-check and try again.'
            );
          } else {
            setOtpError(
              (data as any).message ||
                'Payment failed after OTP. Please try another card or payment method.'
            );
          }
        } catch (err: any) {
          console.error('[paystack][submit-otp] error', err);
          setOtpError(
            err?.response?.data?.message ||
              err?.message ||
              'Unable to verify OTP at the moment.'
          );
        } finally {
          setCardProcessing(false);
        }
      }, 300),
    [otpReference, otp, backendUrl, token, onClose]
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
      handleCardPay.cancel();
      handleOtpSubmit.cancel();
    };
  }, [debouncedCheckout, debouncedInitiate, debouncedUpdateRef, handleCardPay, handleOtpSubmit]);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />

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
            onClick={onClose}
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
                      <span className="text-sm font-bold text-pink-600">
                        {formatPrice(pkg)}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-sm text-gray-500">
                  No {inferredCurrency} packages available.
                </p>
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
                              selectedPaymentMethod === 'M-Pesa' ||
                              selectedPaymentMethod === 'MPESA'
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
                    onClick={() => debouncedInitiate()}
                    disabled={initiatingPayment || !selectedPackage}
                    className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm disabled:opacity-50"
                  >
                    {initiatingPayment ? <Spinner /> : 'Initiate STK Push'}
                  </button>
                  <button
                    onClick={async () => {
                      await handleCompletePayment();
                      onClose();
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

            {/* Card form (Paystack-backed), USD only */}
            {selectedPaymentMethod === 'Paystack' && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">Pay securely with your card</p>
                  {selectedPackage && (
                    <span className="text-xs font-semibold px-2 py-1 rounded bg-pink-100 text-pink-700 dark:bg-[#1b1d2a]">
                      {selectedPackage.credits} Tokens ·{' '}
                      {selectedPackage.currency.toUpperCase() === 'USD'
                        ? formatPrice(selectedPackage)
                        : 'USD only'}
                    </span>
                  )}
                </div>

                {(!selectedPackage || selectedPackage.currency.toUpperCase() !== 'USD') && (
                  <div className="mt-2 text-xs text-orange-600">
                    Please select a USD package to continue with card payment.
                  </div>
                )}

                {selectedPackage && selectedPackage.currency.toUpperCase() === 'USD' && (
                  <>
                    <div className="grid gap-3 mt-2">
                      <label className="block text-xs font-medium text-gray-500">
                        Card number
                        <div className="mt-1 flex items-center rounded-md border border-gray-200 dark:border-darkCard bg-white dark:bg-[#0f1821] px-3 py-2 focus-within:ring-2 focus-within:ring-pink-500">
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="cc-number"
                            value={cardNumber}
                            onChange={(e) => handleCardNumberChange(e.target.value)}
                            placeholder="1234 5678 9012 3456"
                            className="flex-1 bg-transparent outline-none text-sm"
                          />
                          {assets.visamaster && (
                            <img
                              src={assets.visamaster}
                              alt="Cards"
                              className="h-5 ml-2 opacity-70"
                            />
                          )}
                        </div>
                      </label>

                      <div className="grid grid-cols-2 gap-3">
                        <label className="block text-xs font-medium text-gray-500">
                          Expiry (MM/YY)
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="cc-exp"
                            value={cardExpiry}
                            onChange={(e) => handleCardExpiryChange(e.target.value)}
                            placeholder="08/28"
                            className="mt-1 w-full rounded-md border border-gray-200 dark:border-darkCard bg-white dark:bg-[#0f1821] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-500"
                          />
                        </label>

                        <label className="block text-xs font-medium text-gray-500">
                          CVV
                          <input
                            type="password"
                            inputMode="numeric"
                            autoComplete="cc-csc"
                            value={cardCvc}
                            onChange={(e) => handleCardCvcChange(e.target.value)}
                            placeholder="123"
                            className="mt-1 w-full rounded-md border border-gray-200 dark:border-darkCard bg-white dark:bg-[#0f1821] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-500"
                          />
                        </label>
                      </div>

                      <label className="block text-xs font-medium text-gray-500">
                        Name on card
                        <input
                          type="text"
                          autoComplete="cc-name"
                          value={cardName}
                          onChange={(e) => setCardName(e.target.value)}
                          placeholder="As shown on card"
                          className="mt-1 w-full rounded-md border border-gray-200 dark:border-darkCard bg-white dark:bg-[#0f1821] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-500"
                        />
                      </label>
                    </div>

                    {cardError && (
                      <div className="mt-2 text-xs text-red-500">{cardError}</div>
                    )}

                    <button
                      onClick={() => handleCardPay()}
                      disabled={cardProcessing}
                      className="mt-3 w-full py-2 rounded-md font-semibold text-white bg-pink-500 hover:bg-pink-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {cardProcessing ? (
                        <>
                          <Spinner />
                          <span>Processing…</span>
                        </>
                      ) : selectedPackage ? (
                        <>{formatPayButtonLabel(selectedPackage)}</>
                      ) : (
                        <>Pay</>
                      )}
                    </button>

                    {/* OTP block */}
                    {needsOtp && (
                      <div className="mt-4 p-3 rounded-md bg-gray-50 dark:bg-[#121927] border border-dashed border-pink-400/60">
                        <p className="text-[11px] text-gray-600 dark:text-gray-300">
                          Your bank requires a one-time password (OTP) to complete this card
                          payment. Enter the code you received via SMS, email, or your banking app.
                        </p>
                        <div className="mt-2 flex gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value.replace(/\s+/g, ''))}
                            placeholder="Enter OTP"
                            className="flex-1 rounded-md border border-gray-200 dark:border-darkCard bg-white dark:bg-[#0f1821] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-500"
                          />
                          <button
                            onClick={() => handleOtpSubmit()}
                            disabled={cardProcessing || !otp.trim()}
                            className="px-3 py-2 rounded-md bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
                          >
                            {cardProcessing ? <Spinner /> : 'Submit OTP'}
                          </button>
                        </div>
                        {otpError && (
                          <div className="mt-1 text-[11px] text-red-500">{otpError}</div>
                        )}
                      </div>
                    )}

                    <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
                      Your card details are processed securely via our payment provider. We don&apos;t
                      store your full card number or CVV.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
};

export default PaymentWidget;
