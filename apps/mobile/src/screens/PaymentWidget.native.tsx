/* eslint-disable no-console */
// apps/mobile/src/screens/PaymentWidget.native.tsx

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  Linking as RNLinking,
  Platform,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import debounce from 'lodash.debounce';
import tw from '../../tailwind';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { useShopContext } from '@mytutorapp/shared/context';
import { usePayment } from '@mytutorapp/shared/hooks';
import { paystackCardCharge, paystackSubmitOtp } from '@mytutorapp/shared/api';

import type {
  PaymentPackage,
  UpdatedProfileData,
  ProfileData,
  MappedProfile,
  Profile as BareProfile,
  PayoutCurrency,
} from '@mytutorapp/shared/types';

import type { MainStackParamList } from '../navigation/types';
import type { ImageSourcePropType } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

type Props = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  showTutorPreview?: boolean;

  /** ✅ Render inside screen, not full-screen modal */
  variant?: 'modal' | 'inline';
  /** ✅ Optional max height for inline ScrollView */
  maxInlineHeight?: number;

  /** Optional: plug in real assets */
  icons?: {
    /** e.g. require('../../assets/visamaster.png') */
    visamaster?: ImageSourcePropType;
    /** e.g. require('../../assets/mpesa.png') */
    mpesa?: ImageSourcePropType;
  };
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
  p: BareProfile | UpdatedProfileData | ProfileData | MappedProfile | undefined,
): PayoutCurrency | undefined {
  if (!p) return undefined;

  const camel = (p as any)?.payoutCurrency;
  const c1 = normalizeCurrency(camel);
  if (c1) return c1;

  const snake = (p as any)?.payout_currency;
  const c2 = normalizeCurrency(snake);
  if (c2) return c2;

  const pm = (p as any)?.payoutMethod ?? (p as any)?.payout_method;
  if (typeof pm === 'string' && pm.toLowerCase() === 'mpesa') return 'KES';

  return undefined;
}

const defaultIcons = {
  visamaster: require('../../assets/visamaster.png'),
  mpesa: require('../../assets/mpesa.png'),
} as const;

/* ───────────────────── Locale + FX helpers ───────────────────── */

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
  const parts = String(locale || '').split(/[-_]/);
  const region = parts[1]?.toUpperCase();
  if (!region) return 'USD';
  return regionToCurrency[region] || 'USD';
}

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

function safeLocale(): string {
  try {
    const opt = Intl.DateTimeFormat().resolvedOptions() as any;
    return opt?.locale || 'en-US';
  } catch {
    return 'en-US';
  }
}

function safeTimeZone(): string | undefined {
  try {
    const opt = Intl.DateTimeFormat().resolvedOptions() as any;
    return opt?.timeZone;
  } catch {
    return undefined;
  }
}

/* ───────────────────── Card helpers ───────────────────── */

const formatCardNumber = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 19);
  const groups = digits.match(/.{1,4}/g) || [];
  return groups.join(' ');
};

const formatExpiry = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
};

const onlyDigitsMax = (value: string, max: number) =>
  value.replace(/\D/g, '').slice(0, max);

/* ───────────────────── Stars (native) ───────────────────── */

const TutorRating = ({
  rating,
  totalReviews,
}: {
  rating: number;
  totalReviews: number;
}) => {
  const rounded = Math.round((Number(rating || 0) as number) * 2) / 2;
  const stars = Array.from({ length: 5 }).map((_, i) => {
    const idx = i + 1;
    const name =
      rounded >= idx
        ? 'star'
        : rounded + 0.5 === idx
          ? 'star-half'
          : 'star-outline';
    return (
      <Ionicons
        key={idx}
        name={name as any}
        size={14}
        style={tw`text-yellow-500`}
      />
    );
  });

  return (
    <View style={tw`flex-row items-center`}>
      <View style={tw`flex-row`}>{stars}</View>
      <Text style={tw`ml-2 text-[11px] text-[#49739c] dark:text-white/60`}>
        ({totalReviews} {totalReviews === 1 ? 'review' : 'reviews'})
      </Text>
    </View>
  );
};

const PaymentWidget: React.FC<Props> = ({
  isOpen,
  onClose,
  title = 'Buy Tokens',
  showTutorPreview = false,
  icons,
  variant = 'modal',
  maxInlineHeight,
}) => {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const brandIcons = {
    visamaster: icons?.visamaster ?? defaultIcons.visamaster,
    mpesa: icons?.mpesa ?? defaultIcons.mpesa,
  };

  const {
    token,
    backendUrl,
    refreshWallet,
    refreshProfile,
    refetchDetails,
    reftechDetails,
    setTokens: setCtxTokens,
  } = useShopContext() as any;

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

  /* ───────────────────────── Slide-over animation (modal mode only) ───────────────────────── */

  const PANEL_MAX_W = 520;
  const panelW = Math.min(PANEL_MAX_W, screenW);
  const translateX = useRef(new Animated.Value(panelW)).current;
  const [mounted, setMounted] = useState<boolean>(isOpen);

  const animateIn = useCallback(() => {
    translateX.setValue(panelW);
    Animated.timing(translateX, {
      toValue: 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [panelW, translateX]);

  const animateOut = useCallback(
    (done?: () => void) => {
      Animated.timing(translateX, {
        toValue: panelW,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) done?.();
      });
    },
    [panelW, translateX],
  );

  // ✅ unified close behavior
  const requestClose = useCallback(() => {
    if (variant === 'inline') {
      onClose();
      return;
    }
    animateOut(() => {
      setMounted(false);
      onClose();
    });
  }, [animateOut, onClose, variant]);

  useEffect(() => {
    // Only relevant for modal mode
    if (variant !== 'modal') return;

    if (isOpen) {
      setMounted(true);
      setTimeout(() => animateIn(), 0);
    } else if (mounted) {
      animateOut(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, variant]);

  /* ───────────────────────── Refresh wallet/profile after payment ───────────────────────── */

  const refreshAfterPayment = useCallback(async () => {
    try {
      if (typeof refetchDetails === 'function') await refetchDetails();
      else if (typeof reftechDetails === 'function') await reftechDetails();

      if (typeof refreshWallet === 'function') await refreshWallet();
      if (typeof refreshProfile === 'function') await refreshProfile();

      if (backendUrl && token && typeof setCtxTokens === 'function') {
        const base = String(backendUrl).replace(/\/+$/, '');
        try {
          const r = await fetch(`${base}/api/account/balance`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (r.ok) {
            const j = await r.json();
            const bal = Number(
              j?.balance ??
                j?.tokens ??
                j?.data?.balance ??
                j?.data?.tokens ??
                NaN,
            );
            if (Number.isFinite(bal)) setCtxTokens(bal);
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }, [
    refetchDetails,
    reftechDetails,
    refreshWallet,
    refreshProfile,
    backendUrl,
    token,
    setCtxTokens,
  ]);

  /* ───────────────────────── Paystack redirect return handling ───────────────────────── */

  const [awaitingPaystackReturn, setAwaitingPaystackReturn] = useState(false);

  const handlePaystackReturn = useCallback(async () => {
    if (!awaitingPaystackReturn) return;
    setAwaitingPaystackReturn(false);
    await refreshAfterPayment();
    requestClose();
  }, [awaitingPaystackReturn, refreshAfterPayment, requestClose]);

  useEffect(() => {
    const sub = RNLinking.addEventListener('url', () => {
      handlePaystackReturn().catch(() => {});
    });
    return () => sub.remove();
  }, [handlePaystackReturn]);

  const openPaystackAuth = useCallback(
    async (redirectUrl: string) => {
      const returnUrl = Linking.createURL('paystack-return');

      try {
        setAwaitingPaystackReturn(true);
        const res = await WebBrowser.openAuthSessionAsync(
          String(redirectUrl),
          String(returnUrl),
        );

        if (res?.type === 'success') {
          await handlePaystackReturn();
          return;
        }

        if (res?.type === 'dismiss' || res?.type === 'cancel') {
          setAwaitingPaystackReturn(false);
          return;
        }
      } catch (e: any) {
        setAwaitingPaystackReturn(false);
        Alert.alert('Payment', e?.message || 'Unable to open verification page.');
      }
    },
    [handlePaystackReturn],
  );

  /* ───────────────────────── Profile-aware locale + display currency ───────────────────────── */

  const [userLocale, setUserLocale] = useState<string>('en-US');
  const [userDisplayCurrency, setUserDisplayCurrency] = useState<string>('USD');

  useEffect(() => {
    const navLocale = safeLocale() || 'en-US';
    let nextLocale = navLocale;
    let nextCurrency: string | undefined;

    const tz = safeTimeZone();
    if (tz === 'Asia/Qatar' || tz === 'Asia/Riyadh') {
      nextLocale = navLocale.startsWith('ar') ? 'ar-QA' : 'en-QA';
      nextCurrency = 'QAR';
    }

    if (!nextCurrency) {
      const countryRaw =
        (profile as any)?.country ??
        (profile as any)?.countryCode ??
        (profile as any)?.country_code ??
        null;

      const country =
        typeof countryRaw === 'string'
          ? countryRaw.trim().toUpperCase()
          : undefined;

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

    if (!nextCurrency) nextCurrency = guessCurrencyFromLocale(navLocale);

    setUserLocale(nextLocale || 'en-US');
    setUserDisplayCurrency((nextCurrency || 'USD').toUpperCase());
  }, [profile]);

  /* ───────────────────────── Card form state (Paystack) ───────────────────────── */

  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState(''); // MM/YY
  const [cardCvc, setCardCvc] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardProcessing, setCardProcessing] = useState(false);

  // OTP step
  const [needsOtp, setNeedsOtp] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpReference, setOtpReference] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);

  const payoutPref = useMemo(() => getPayoutCurrency(profile as any), [profile]);

  // Default selection when opened (KES -> M-Pesa, else Paystack)
  useEffect(() => {
    // inline has no "mounted" notion; so base it on isOpen
    const active = variant === 'modal' ? mounted : isOpen;
    if (!active) return;

    if (payoutPref === 'KES') {
      handlePaymentSelection('M-Pesa');
      setShowMpesaModal(true);
    } else {
      handlePaymentSelection('Paystack');
      setShowMpesaModal(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, isOpen, payoutPref, variant]);

  // Clear transient state on close / method change
  useEffect(() => {
    const active = variant === 'modal' ? mounted : isOpen;

    if (!active) {
      setNeedsOtp(false);
      setOtp('');
      setOtpReference(null);
      setOtpError(null);
      setCardError(null);
      setCardProcessing(false);
      setAwaitingPaystackReturn(false);
    }
  }, [mounted, isOpen, variant]);

  useEffect(() => {
    setNeedsOtp(false);
    setOtp('');
    setOtpReference(null);
    setOtpError(null);
  }, [selectedPaymentMethod]);

  const validateCardForm = (): boolean => {
    const numberDigits = cardNumber.replace(/\s+/g, '');
    if (numberDigits.length < 13 || numberDigits.length > 19) {
      setCardError('Please enter a valid card number.');
      return false;
    }

    const [mmStr = '', yyStr = ''] = cardExpiry.split('/');
    if (!/^\d{2}$/.test(mmStr) || !/^\d{2}$/.test(yyStr)) {
      setCardError('Please enter expiry as MM/YY.');
      return false;
    }
    const mm = Number(mmStr);
    const yy2 = Number(yyStr);

    if (!mm || !yy2 || mm < 1 || mm > 12) {
      setCardError('Please enter a valid expiry date.');
      return false;
    }

    const now = new Date();
    const currentYear2 = Number(String(now.getFullYear()).slice(-2));
    const currentMonth = now.getMonth() + 1;

    if (yy2 < currentYear2 || (yy2 === currentYear2 && mm < currentMonth)) {
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

  const formatLocalPriceOnly = (pkg: PaymentPackage) => {
    const baseCurrency = String(pkg.currency || '').toUpperCase();
    const basePrice = Number(pkg.price || 0);

    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      return `${baseCurrency} ${pkg.price}`;
    }

    // Non-USD packages → show as-is
    if (baseCurrency !== 'USD') {
      try {
        return new Intl.NumberFormat(userLocale, {
          style: 'currency',
          currency: baseCurrency,
          maximumFractionDigits: 2,
        }).format(basePrice);
      } catch {
        return `${baseCurrency} ${basePrice.toFixed(2)}`;
      }
    }

    // USD packages → show local estimate only
    const localCurrency = String(userDisplayCurrency || 'USD').toUpperCase();
    const rate = USD_ESTIMATE_RATES[localCurrency];

    if (!rate || localCurrency === 'USD') {
      try {
        return new Intl.NumberFormat(userLocale, {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 2,
        }).format(basePrice);
      } catch {
        return `USD ${basePrice.toFixed(2)}`;
      }
    }

    const localAmount = basePrice * rate;
    try {
      return new Intl.NumberFormat(userLocale, {
        style: 'currency',
        currency: localCurrency,
        maximumFractionDigits: 2,
      }).format(localAmount);
    } catch {
      return `${localCurrency} ${localAmount.toFixed(2)}`;
    }
  };

  const payButtonLabel = (pkg?: PaymentPackage | null) => {
    if (!pkg) return 'Pay';
    const label = formatLocalPriceOnly(pkg);
    return `Pay ${label}`;
  };

  /* ───────────────────── Debounced actions ───────────────────── */

  const debouncedCheckout = useMemo(() => debounce(handleCheckout, 300), [handleCheckout]);
  const debouncedInitiate = useMemo(
    () => debounce(handleInitiateMpesaPayment, 300),
    [handleInitiateMpesaPayment],
  );
  const debouncedUpdateRef = useMemo(
    () => debounce(handleUpdateMpesaReference, 300),
    [handleUpdateMpesaReference],
  );

  const handleCardPay = useMemo(
    () =>
      debounce(async () => {
        if (!selectedPackage) {
          setCardError('Please select a package first.');
          return;
        }
        if (String(selectedPackage.currency || '').toUpperCase() !== 'USD') {
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
          const expiry = String(cardExpiry || '').trim();
          const parts = expiry.split('/');
          const mm = String(parts[0] || '').padStart(2, '0');
          const yyRaw = String(parts[1] || '').trim();

          const expYear = yyRaw.length === 2 ? `20${yyRaw}` : yyRaw;

          if (mm.length !== 2 || !/^\d{2}$/.test(mm)) {
            setCardError('Please enter a valid expiry month.');
            setCardProcessing(false);
            return;
          }
          if (!/^\d{4}$/.test(expYear)) {
            setCardError('Please enter a valid expiry year.');
            setCardProcessing(false);
            return;
          }

          const payload = {
            packageId: String(selectedPackage.id),
            card: {
              number: numberDigits,
              exp_month: mm,
              exp_year: expYear,
              cvc: cardCvc,
              name: cardName.trim(),
            },
          };

          const data = await paystackCardCharge(backendUrl, token, payload);
          const anyData = data as any;

          // 1) Immediate success
          if (anyData.ok || anyData.status === 'success') {
            Alert.alert('Payment successful', 'Your tokens will update shortly.');
            await refreshAfterPayment();
            requestClose();
            return;
          }

          // 2) Redirect-based auth
          const redirectUrl = anyData.authUrl || anyData?.raw?.data?.url;
          if (anyData.paystackStatus === 'open_url' && redirectUrl) {
            Alert.alert(
              'Continue in browser',
              'We’ll open your bank verification page. When you return, we’ll refresh your wallet.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Open',
                  onPress: async () => {
                    await openPaystackAuth(String(redirectUrl));
                  },
                },
              ],
            );
            return;
          }

          // 3) OTP / extra verification (best-effort)
          const ref =
            anyData.otpReference ||
            anyData.reference ||
            anyData?.raw?.data?.reference ||
            null;

          if (anyData.requiresOtp || anyData.requires_otp || anyData.nextStep === 'otp') {
            setNeedsOtp(true);
            setOtpReference(ref);
            setCardError(
              anyData.message ||
                anyData.gatewayResponse ||
                'Your bank requires an OTP to complete this payment.',
            );
            return;
          }

          if (anyData.requiresAction) {
            setCardError(
              anyData.message ||
                anyData.gatewayResponse ||
                anyData.displayText ||
                'Additional verification required. Please complete verification to finish payment.',
            );
            return;
          }

          setCardError(
            anyData.message ||
              anyData.gatewayResponse ||
              anyData.displayText ||
              'Payment failed. Please check your card details or try another method.',
          );
        } catch (err: any) {
          console.error('[paystack][card-charge] error', err);
          setCardError(
            err?.response?.data?.message || err?.message || 'Unable to process payment at the moment.',
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
      refreshAfterPayment,
      requestClose,
      openPaystackAuth,
    ],
  );

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

          const anyData = data as any;
          if (anyData.ok || anyData.status === 'success') {
            Alert.alert('Payment successful', 'Your tokens will update shortly.');
            await refreshAfterPayment();
            requestClose();
          } else if (anyData.requiresAction) {
            setOtpError(anyData.message || 'We could not confirm your OTP. Please try again.');
          } else {
            setOtpError(anyData.message || 'Payment failed after OTP. Please try another method.');
          }
        } catch (err: any) {
          console.error('[paystack][submit-otp] error', err);
          setOtpError(
            err?.response?.data?.message || err?.message || 'Unable to verify OTP at the moment.',
          );
        } finally {
          setCardProcessing(false);
        }
      }, 300),
    [otpReference, otp, backendUrl, token, refreshAfterPayment, requestClose],
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

  /* ───────────────────────── Packages filtering by inferredCurrency ───────────────────────── */

  const displayedPackages = useMemo<PaymentPackage[]>(() => {
    if (!Array.isArray(packages)) return [];
    return (packages as PaymentPackage[]).filter(
      p =>
        String(p.currency || '').toUpperCase() ===
        String(inferredCurrency || '').toUpperCase(),
    );
  }, [packages, inferredCurrency]);

  useEffect(() => {
    const active = variant === 'modal' ? mounted : isOpen;
    if (active && !selectedPackage && displayedPackages.length) {
      handlePackageSelection(displayedPackages[0] as PaymentPackage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, isOpen, variant, displayedPackages, selectedPackage]);

  /* ───────────────────────── Policy navigation (native screens) ───────────────────────── */

  const openPolicy = (
    route: 'RefundsAndCancellations' | 'FulfillmentPolicy' | 'PaymentFlow',
  ) => {
    try {
      navigation.navigate(route as any);
    } catch {
      // ignore
    }
  };

  /* ───────────────────────── Shared content renderer (inline + modal) ───────────────────────── */

  const renderContent = () => (
    <>
      {/* Fine print */}
      <Text style={tw`text-[11px] leading-5 text-[#49739c] dark:text-white/60`}>
        By paying you agree to our{' '}
        <Text
          onPress={() => openPolicy('RefundsAndCancellations')}
          style={tw`text-[#3d99f5] font-semibold`}
        >
          Refund & Cancellation Policy
        </Text>{' '}
        and{' '}
        <Text
          onPress={() => openPolicy('FulfillmentPolicy')}
          style={tw`text-[#3d99f5] font-semibold`}
        >
          Fulfillment & Delivery Policy
        </Text>
        . See{' '}
        <Text
          onPress={() => openPolicy('PaymentFlow')}
          style={tw`text-[#3d99f5] font-semibold`}
        >
          how payments work
        </Text>
        .
      </Text>

      {/* Optional tutor preview */}
      {showTutorPreview && (
        <View
          style={tw`mt-4 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] overflow-hidden`}
        >
          <View style={tw`p-4`}>
            {loadingProfile ? (
              <Text style={tw`text-sm text-[#49739c] dark:text-white/60`}>
                Loading tutor profile…
              </Text>
            ) : profile ? (
              <>
                <View
                  style={tw`w-full aspect-[16/10] rounded-2xl overflow-hidden bg-slate-100 dark:bg-[#0b1620]`}
                >
                  {!!mainImage ? (
                    <Image
                      source={{ uri: String(mainImage) }}
                      style={tw`w-full h-full`}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={tw`flex-1 items-center justify-center`}>
                      <Text style={tw`text-[#49739c] dark:text-white/60 text-sm`}>
                        No image
                      </Text>
                    </View>
                  )}
                </View>

                <View style={tw`mt-3`}>
                  <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
                    {(profile as BareProfile).name || 'Tutor'}
                  </Text>
                  <TutorRating
                    rating={Number((ratingData as any)?.avgRating || 0)}
                    totalReviews={Number((ratingData as any)?.totalReviews || 0)}
                  />
                </View>
              </>
            ) : (
              <Text style={tw`text-sm text-[#49739c] dark:text-white/60`}>
                No tutor profile found.
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Packages */}
      <View style={tw`mt-5`}>
        <View style={tw`flex-row items-center justify-between`}>
          <Text style={tw`text-base font-semibold text-[#0d141c] dark:text-white`}>
            Choose your package
          </Text>

          <View style={tw`px-2 py-1 rounded-lg bg-[#e7edf4] dark:bg-[#172534]`}>
            <Text style={tw`text-[11px] font-semibold text-[#0d141c] dark:text-white`}>
              Base: {String(inferredCurrency || '').toUpperCase()} · Local: {userDisplayCurrency}
            </Text>
          </View>
        </View>

        <View style={tw`mt-3 gap-2`}>
          {displayedPackages.length ? (
            displayedPackages.map(pkg => {
              const active = String(selectedPackage?.id) === String(pkg.id);
              return (
                <Pressable
                  key={String(pkg.id)}
                  onPress={() => handlePackageSelection(pkg)}
                  style={tw`rounded-2xl border ${
                    active
                      ? 'border-[#3d99f5] bg-[#eaf3ff] dark:bg-[#121927]'
                      : 'border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821]'
                  } px-4 py-3`}
                >
                  <View style={tw`flex-row items-center justify-between`}>
                    <View style={tw`flex-1 pr-3`}>
                      <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
                        {pkg.credits} Tokens
                      </Text>
                      {!!pkg.offer && (
                        <Text style={tw`text-[12px] text-[#49739c] dark:text-white/60 mt-0.5`}>
                          {String(pkg.offer)}
                        </Text>
                      )}
                    </View>

                    <Text style={tw`text-sm font-extrabold text-[#3d99f5]`}>
                      {formatLocalPriceOnly(pkg)}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          ) : (
            <Text style={tw`text-sm text-[#49739c] dark:text-white/60 mt-2`}>
              No {String(inferredCurrency || '').toUpperCase()} packages available.
            </Text>
          )}
        </View>
      </View>

      {/* Payment Methods */}
      <View
        style={tw`mt-5 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`}
      >
        <Text style={tw`text-base font-semibold text-[#0d141c] dark:text-white`}>
          Payment method
        </Text>

        <View style={tw`mt-3 flex-row gap-3`}>
          <Pressable
            onPress={() => handlePaymentSelection('Paystack')}
            style={tw`flex-1 h-14 rounded-2xl border items-center justify-center ${
              selectedPaymentMethod === 'Paystack'
                ? 'border-[#3d99f5] bg-[#eaf3ff] dark:bg-[#121927]'
                : 'border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821]'
            }`}
          >
            <View style={tw`flex-row items-center gap-2`}>
              {brandIcons.visamaster ? (
                <Image
                  source={brandIcons.visamaster}
                  style={tw`h-6 w-10`}
                  resizeMode="contain"
                />
              ) : (
                <Ionicons name="card-outline" size={18} style={tw`text-[#0d141c] dark:text-white`} />
              )}
              <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>
                Card
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => handlePaymentSelection('M-Pesa')}
            style={tw`flex-1 h-14 rounded-2xl border items-center justify-center ${
              selectedPaymentMethod === 'M-Pesa' || selectedPaymentMethod === 'MPESA'
                ? 'border-[#3d99f5] bg-[#eaf3ff] dark:bg-[#121927]'
                : 'border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821]'
            }`}
          >
            <View style={tw`flex-row items-center gap-2`}>
              {brandIcons.mpesa ? (
                <Image source={brandIcons.mpesa} style={tw`h-6 w-10`} resizeMode="contain" />
              ) : (
                <Ionicons
                  name="phone-portrait-outline"
                  size={18}
                  style={tw`text-[#0d141c] dark:text-white`}
                />
              )}

              <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>
                M-Pesa
              </Text>
            </View>
          </Pressable>
        </View>

        {/* M-Pesa panel */}
        {(selectedPaymentMethod === 'M-Pesa' || selectedPaymentMethod === 'MPESA') && (
          <View style={tw`mt-4`}>
            <Text style={tw`text-[12px] text-[#49739c] dark:text-white/60`}>
              Safaricom Phone Number
            </Text>
            <TextInput
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="2547XXXXXXXX"
              keyboardType="phone-pad"
              placeholderTextColor={tw.color('text-white/50') || '#94a3b8'}
              style={tw`mt-1 h-12 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 text-[#0d141c] dark:text-white`}
            />

            <View style={tw`flex-row gap-2 mt-3`}>
              <Pressable
                onPress={() => debouncedInitiate()}
                disabled={initiatingPayment || !selectedPackage}
                style={tw`flex-1 h-11 rounded-2xl items-center justify-center ${
                  initiatingPayment || !selectedPackage
                    ? 'bg-gray-300 dark:bg-gray-700'
                    : 'bg-[#3d99f5]'
                }`}
              >
                {initiatingPayment ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={tw`text-white font-extrabold text-sm`}>Initiate STK Push</Text>
                )}
              </Pressable>

              <Pressable
                onPress={async () => {
                  try {
                    await handleCompletePayment();
                    await refreshAfterPayment();
                    requestClose();
                  } catch (e: any) {
                    Alert.alert('Payment', e?.message || 'Unable to complete payment.');
                  }
                }}
                disabled={!selectedPackage}
                style={tw`flex-1 h-11 rounded-2xl items-center justify-center ${
                  selectedPackage ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-700'
                }`}
              >
                <Text style={tw`text-white font-extrabold text-sm`}>Complete Payment</Text>
              </Pressable>
            </View>

            <View style={tw`mt-4 pt-4 border-t border-[#cedbe8] dark:border-white/10`}>
              <Text style={tw`text-[12px] text-[#49739c] dark:text-white/60`}>
                M-Pesa Reference (if STK failed)
              </Text>
              <TextInput
                value={mpesaReference}
                onChangeText={setMpesaReference}
                placeholder="Enter reference"
                placeholderTextColor={tw.color('text-white/50') || '#94a3b8'}
                style={tw`mt-1 h-12 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 text-[#0d141c] dark:text-white`}
              />

              <Pressable
                onPress={() => debouncedUpdateRef()}
                style={tw`mt-3 h-11 rounded-2xl items-center justify-center bg-orange-600`}
              >
                <Text style={tw`text-white font-extrabold text-sm`}>Update Reference</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Card panel */}
        {selectedPaymentMethod === 'Paystack' && (
          <View style={tw`mt-4`}>
            <View style={tw`flex-row items-center justify-between`}>
              <Text style={tw`text-sm text-[#49739c] dark:text-white/60`}>
                Pay securely with your card
              </Text>

              {awaitingPaystackReturn && (
                <View style={tw`px-2 py-1 rounded-lg bg-[#eaf3ff] dark:bg-[#121927]`}>
                  <Text style={tw`text-[11px] font-semibold text-[#3d99f5]`}>
                    Waiting for return…
                  </Text>
                </View>
              )}
            </View>

            {(!selectedPackage || String(selectedPackage.currency || '').toUpperCase() !== 'USD') && (
              <Text style={tw`mt-2 text-[12px] text-orange-600`}>
                Please select a USD package to continue with card payment.
              </Text>
            )}

            {selectedPackage && String(selectedPackage.currency || '').toUpperCase() === 'USD' && (
              <>
                <View style={tw`mt-3 gap-3`}>
                  <View>
                    <Text style={tw`text-[12px] font-semibold text-[#49739c] dark:text-white/60`}>
                      Card number
                    </Text>
                    <TextInput
                      value={cardNumber}
                      onChangeText={v => setCardNumber(formatCardNumber(v))}
                      placeholder="1234 5678 9012 3456"
                      keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                      placeholderTextColor={tw.color('text-white/50') || '#94a3b8'}
                      style={tw`mt-1 h-12 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 text-[#0d141c] dark:text-white`}
                    />
                  </View>

                  <View style={tw`flex-row gap-3`}>
                    <View style={tw`flex-1`}>
                      <Text style={tw`text-[12px] font-semibold text-[#49739c] dark:text-white/60`}>
                        Expiry (MM/YY)
                      </Text>
                      <TextInput
                        value={cardExpiry}
                        onChangeText={v => setCardExpiry(formatExpiry(v))}
                        placeholder="08/28"
                        keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                        placeholderTextColor={tw.color('text-white/50') || '#94a3b8'}
                        style={tw`mt-1 h-12 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 text-[#0d141c] dark:text-white`}
                      />
                    </View>

                    <View style={tw`flex-1`}>
                      <Text style={tw`text-[12px] font-semibold text-[#49739c] dark:text-white/60`}>
                        CVV
                      </Text>
                      <TextInput
                        value={cardCvc}
                        onChangeText={v => setCardCvc(onlyDigitsMax(v, 4))}
                        placeholder="123"
                        secureTextEntry
                        keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                        placeholderTextColor={tw.color('text-white/50') || '#94a3b8'}
                        style={tw`mt-1 h-12 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 text-[#0d141c] dark:text-white`}
                      />
                    </View>
                  </View>

                  <View>
                    <Text style={tw`text-[12px] font-semibold text-[#49739c] dark:text-white/60`}>
                      Name on card
                    </Text>
                    <TextInput
                      value={cardName}
                      onChangeText={setCardName}
                      placeholder="As shown on card"
                      placeholderTextColor={tw.color('text-white/50') || '#94a3b8'}
                      style={tw`mt-1 h-12 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 text-[#0d141c] dark:text-white`}
                    />
                  </View>
                </View>

                {!!cardError && <Text style={tw`mt-2 text-[12px] text-red-600`}>{cardError}</Text>}

                <Pressable
                  onPress={() => handleCardPay()}
                  disabled={cardProcessing}
                  style={tw`mt-3 h-12 rounded-2xl items-center justify-center ${
                    cardProcessing ? 'bg-gray-300 dark:bg-gray-700' : 'bg-[#3d99f5]'
                  }`}
                >
                  {cardProcessing ? (
                    <View style={tw`flex-row items-center gap-2`}>
                      <ActivityIndicator />
                      <Text style={tw`text-white font-extrabold`}>Processing…</Text>
                    </View>
                  ) : (
                    <Text style={tw`text-white font-extrabold`}>{payButtonLabel(selectedPackage)}</Text>
                  )}
                </Pressable>

                {needsOtp && (
                  <View
                    style={tw`mt-4 rounded-2xl border border-[#3d99f5]/50 bg-[#eaf3ff] dark:bg-[#121927] p-3`}
                  >
                    <Text style={tw`text-[11px] text-[#0b3a70] dark:text-white/80`}>
                      Your bank requires a one-time password (OTP). Enter the code you received.
                    </Text>

                    <View style={tw`mt-2 flex-row gap-2`}>
                      <TextInput
                        value={otp}
                        onChangeText={v => setOtp(v.replace(/\s+/g, ''))}
                        placeholder="Enter OTP"
                        keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                        placeholderTextColor={tw.color('text-white/50') || '#94a3b8'}
                        style={tw`flex-1 h-12 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0b1620] px-3 text-[#0d141c] dark:text-white`}
                      />
                      <Pressable
                        onPress={() => handleOtpSubmit()}
                        disabled={cardProcessing || !otp.trim()}
                        style={tw`h-12 px-4 rounded-2xl items-center justify-center ${
                          cardProcessing || !otp.trim()
                            ? 'bg-gray-300 dark:bg-gray-700'
                            : 'bg-[#3d99f5]'
                        }`}
                      >
                        {cardProcessing ? (
                          <ActivityIndicator />
                        ) : (
                          <Text style={tw`text-white font-extrabold text-sm`}>Submit</Text>
                        )}
                      </Pressable>
                    </View>

                    {!!otpError && <Text style={tw`mt-1 text-[11px] text-red-600`}>{otpError}</Text>}
                  </View>
                )}

                <Text style={tw`mt-2 text-[11px] text-[#49739c] dark:text-white/50`}>
                  Card details are processed securely via our payment provider. We don’t store your full
                  card number or CVV.
                </Text>
              </>
            )}
          </View>
        )}
      </View>
    </>
  );
/* ───────────────────────── INLINE MODE (no Modal) ───────────────────────── */

if (variant === 'inline') {
  if (!isOpen) return null;

  const INLINE_MAX_H = maxInlineHeight ?? Math.min(720, screenH * 0.85);

  return (
    <View
      style={tw`mt-3 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] overflow-hidden`}
    >
      {/* Header */}
      <View
        style={tw`flex-row items-center justify-between px-4 py-3 border-b border-[#cedbe8] dark:border-white/10`}
      >
        <Text style={tw`text-base font-semibold text-[#0d141c] dark:text-white`}>
          {title}
        </Text>

        <Pressable
          onPress={requestClose}
          style={tw`rounded-lg px-3 py-2 bg-[#e7edf4] dark:bg-[#172534]`}
        >
          <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>
            Close
          </Text>
        </Pressable>
      </View>

      <ScrollView
        nestedScrollEnabled // ✅ Android nested scroll
        style={{ maxHeight: INLINE_MAX_H }}
        contentContainerStyle={tw`px-4 pt-3 pb-6`}
        keyboardShouldPersistTaps="handled"
      >
        {renderContent()}
      </ScrollView>
    </View>
  );
}


  /* ───────────────────────── MODAL MODE (existing) ───────────────────────── */

  if (!mounted) return null;

  return (
    <Modal
    visible={mounted}
    transparent
    animationType="none"
    onRequestClose={requestClose}
    presentationStyle="overFullScreen"   // ✅ iOS overlay behavior
    statusBarTranslucent                // ✅ Android: cover status bar area
    hardwareAccelerated                 // ✅ Android perf
  >
      <View style={tw`flex-1`}>
        {/* Backdrop */}
        <Pressable onPress={requestClose} style={tw`absolute inset-0 bg-black/50`} />

        {/* Animated slide-over */}
        <Animated.View
          style={[
            tw`absolute right-0 top-0 h-full w-full bg-white dark:bg-[#0f1821] border-l border-[#cedbe8] dark:border-white/10`,
            { maxWidth: PANEL_MAX_W, transform: [{ translateX }] },
          ]}
        >
          {/* Header */}
          <View
            style={tw`flex-row items-center justify-between px-4 py-3 border-b border-[#cedbe8] dark:border-white/10 bg-white/90 dark:bg-[#0f1821]/90`}
          >
            <Text style={tw`text-lg font-semibold text-[#0d141c] dark:text-white`}>{title}</Text>

            <Pressable
              onPress={requestClose}
              style={tw`rounded-lg px-3 py-2 bg-[#e7edf4] dark:bg-[#172534]`}
            >
              <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>Close</Text>
            </Pressable>
          </View>

          <ScrollView
          nestedScrollEnabled
          contentContainerStyle={tw`px-4 pt-3 pb-6`}
          keyboardShouldPersistTaps="handled"
        >
          {renderContent()}
        </ScrollView>

        </Animated.View>
      </View>
    </Modal>
  );
};

export default PaymentWidget;
