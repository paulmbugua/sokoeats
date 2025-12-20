// apps/mobile/src/pages/org/PlanPurchaseModal.native.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
} from 'react-native';

import tw from '../../../tailwind';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import type { OrgCurrency, OrgPricingTable } from '@mytutorapp/shared/api/orgApi';

type BillingCycle = 'monthly' | 'annual';
type PayMethod = 'Paystack' | 'M-Pesa';
type ImgSrc = string | ImageSourcePropType;
type Props = {
  open: boolean;
  onClose: () => void;
  tier: 'pro' | 'enterprise';
  orgName?: string | null;

  assets?: {
    visamaster?: ImgSrc; // url OR require()
    mpesa?: ImgSrc; // url OR require()
  };

  onCheckout: (opts: {
    method: PayMethod;
    cycle: BillingCycle;
    plan: 'pro' | 'enterprise';
    phone?: string;
    reference?: string;
  }) => void;
};

function asImg(src?: ImgSrc): ImageSourcePropType | undefined {
  if (!src) return undefined;
  return typeof src === 'string' ? { uri: src } : src;
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
  const parts = (locale || 'en-US').split(/[-_]/);
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

function formatMoneyIntl(locale: string, currency: string, amount: number, maxFrac?: number) {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'symbol',
      maximumFractionDigits: typeof maxFrac === 'number' ? maxFrac : undefined,
    }).format(amount);
  } catch {
    // RN fallback (Intl sometimes limited depending on build)
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

  if (digits.startsWith('+254')) return digits.slice(1);
  if (/^0\d{9}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^\d{9}$/.test(digits) && digits.startsWith('7')) return `254${digits}`;

  return digits.replace(/[^\d]/g, '');
}

function isLikelyMpesaPhone(norm: string) {
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

export default function PlanPurchaseModalNative({
  open,
  onClose,
  tier,
  orgName,
  onCheckout,
  assets,
}: Props) {
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [method, setMethod] = useState<PayMethod>('Paystack');
  const [phone, setPhone] = useState('');
  const [reference, setReference] = useState('');
  const [uiError, setUiError] = useState<string | null>(null);
  const [showRefBox, setShowRefBox] = useState(false);

  // Canonical USD + explicit KES (so M-Pesa isn't “estimated”)
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

  // Locale + display currency guess (RN-safe)
  const [userLocale, setUserLocale] = useState('en-US');
  const [userDisplayCurrency, setUserDisplayCurrency] = useState('USD');

  useEffect(() => {
    let nextLocale = 'en-US';
    let nextCurrency: string | undefined;

    try {
      nextLocale = Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
    } catch {}

    let tz: string | undefined;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {}

    // timezone hint (Qatar / Riyadh)
    if (tz === 'Asia/Qatar' || tz === 'Asia/Riyadh') {
      nextLocale = nextLocale.startsWith('ar') ? 'ar-QA' : 'en-QA';
      nextCurrency = 'QAR';
    }

    if (!nextCurrency) nextCurrency = guessCurrencyFromLocale(nextLocale);

    setUserLocale(nextLocale || 'en-US');
    setUserDisplayCurrency((nextCurrency || 'USD').toUpperCase());
  }, []);

  useEffect(() => setUiError(null), [cycle, method, tier, open]);

  const billCycleKey: 'monthly' | 'yearly' = cycle === 'annual' ? 'yearly' : 'monthly';

  const usdCents: number | null =
    (pricingUSD as OrgPricingTable | null)?.tiers?.[tier]?.[billCycleKey] ?? null;

  const kesCents: number | null =
    (pricingKES as OrgPricingTable | null)?.tiers?.[tier]?.[billCycleKey] ?? null;

  const seats: number | null =
    (pricingUSD as OrgPricingTable | null)?.tiers?.[tier]?.seats ??
    (pricingKES as OrgPricingTable | null)?.tiers?.[tier]?.seats ??
    null;

  const anyLoading = pricingLoadingUSD || pricingLoadingKES;
  const anyError = pricingErrorUSD || pricingErrorKES;
  const visaMasterSrc = useMemo(() => asImg(assets?.visamaster), [assets?.visamaster]);
  const mpesaSrc = useMemo(() => asImg(assets?.mpesa), [assets?.mpesa]);

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
    onCheckout({ method: 'M-Pesa', cycle, plan: tier, phone: p });
  };

  const handleMpesaComplete = () => {
    const p = normalizeMpesaPhone(phone);
    if (!isLikelyMpesaPhone(p)) {
      setUiError('Enter a valid Safaricom number (e.g. 2547XXXXXXXX or 07XXXXXXXX).');
      return;
    }
    onCheckout({
      method: 'M-Pesa',
      cycle,
      plan: tier,
      phone: p,
      reference: reference.trim() || undefined,
    });
  };

  const handlePaystack = () => onCheckout({ method: 'Paystack', cycle, plan: tier });

  if (!open) return null;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={tw`flex-1`}
      >
        {/* Backdrop */}
        <Pressable style={tw`flex-1 bg-black/60`} onPress={onClose}>
          {/* Stop propagation */}
          <Pressable onPress={() => {}} style={tw`flex-1 justify-center px-3 py-4`}>
            <View
              style={tw`w-full max-w-2xl self-center rounded-2xl bg-white dark:bg-[#0f1821] overflow-hidden border border-slate-200 dark:border-white/10`}
            >
              {/* Header */}
              <View
                style={tw`flex-row items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/10`}
              >
                <View style={tw`flex-1 pr-2`}>
                  <Text style={tw`text-xs text-slate-500 dark:text-white/60`} numberOfLines={1}>
                    Upgrade for {orgName || 'your organization'}
                  </Text>
                  <Text
                    style={tw`text-base font-semibold text-[#0d141c] dark:text-white`}
                    numberOfLines={1}
                  >
                    {tier === 'pro' ? 'Upgrade to PRO' : 'Upgrade to ENTERPRISE'}
                  </Text>
                </View>

                <Pressable
                  onPress={onClose}
                  style={tw`px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/10`}
                >
                  <Text style={tw`text-sm text-[#0d141c] dark:text-white`}>Close</Text>
                </Pressable>
              </View>

              {/* Body */}
              <ScrollView style={tw`max-h-[80vh]`} contentContainerStyle={tw`p-4 pb-6`}>
                {anyError ? (
                  <View
                    style={tw`rounded-xl p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20`}
                  >
                    <Text style={tw`text-sm text-red-700 dark:text-red-200`}>
                      Failed to load pricing. Please refresh and try again.
                    </Text>
                  </View>
                ) : null}

                {/* Billing cycle */}
                <View style={tw`mt-3`}>
                  <Text style={tw`text-sm text-slate-600 dark:text-white/70 mb-2`}>Billing</Text>

                  <View
                    style={tw`flex-row rounded-xl overflow-hidden border border-slate-200 dark:border-white/10`}
                  >
                    <Pressable
                      onPress={() => setCycle('monthly')}
                      style={tw.style(
                        `flex-1 px-3 py-2`,
                        cycle === 'monthly' ? `bg-slate-200 dark:bg-white/10` : `bg-transparent`
                      )}
                    >
                      <Text style={tw`text-sm text-[#0d141c] dark:text-white text-center`}>
                        Monthly
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => setCycle('annual')}
                      style={tw.style(
                        `flex-1 px-3 py-2`,
                        cycle === 'annual' ? `bg-slate-200 dark:bg-white/10` : `bg-transparent`
                      )}
                    >
                      <Text style={tw`text-sm text-[#0d141c] dark:text-white text-center`}>
                        Annual
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {/* Method */}
                <View style={tw`mt-4`}>
                  <Text style={tw`text-sm text-slate-600 dark:text-white/70 mb-2`}>Pay with</Text>

                  <View
                    style={tw`flex-row rounded-xl overflow-hidden border border-slate-200 dark:border-white/10`}
                  >
                    <Pressable
                      onPress={() => setMethod('Paystack')}
                      style={tw.style(
                        `flex-1 px-3 py-2 flex-row items-center justify-center gap-2`,
                        method === 'Paystack' ? `bg-slate-200 dark:bg-white/10` : `bg-transparent`
                      )}
                    >
                      {visaMasterSrc ? (
                        <Image source={visaMasterSrc} style={tw`h-6 w-18`} resizeMode="contain" />
                      ) : (
                        <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>
                          Card
                        </Text>
                      )}
                    </Pressable>

                    <Pressable
                      onPress={() => setMethod('M-Pesa')}
                      style={tw.style(
                        `flex-1 px-3 py-2 flex-row items-center justify-center gap-2`,
                        method === 'M-Pesa' ? `bg-slate-200 dark:bg-white/10` : `bg-transparent`
                      )}
                    >
                      {mpesaSrc ? (
                        <Image source={mpesaSrc} style={tw`h-6 w-18`} resizeMode="contain" />
                      ) : (
                        <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>
                          M-Pesa
                        </Text>
                      )}
                    </Pressable>
                  </View>

                  {anyLoading ? (
                    <View style={tw`mt-2 flex-row items-center gap-2`}>
                      <ActivityIndicator />
                      <Text style={tw`text-xs text-slate-500 dark:text-white/60`}>
                        Loading pricing…
                      </Text>
                    </View>
                  ) : null}

                  {uiError ? (
                    <View
                      style={tw`mt-3 rounded-xl p-3 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20`}
                    >
                      <Text style={tw`text-xs text-slate-800 dark:text-white/80`}>{uiError}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Summary box */}
                <View
                  style={tw`mt-4 rounded-2xl p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10`}
                >
                  <View style={tw`flex-row items-start justify-between gap-3`}>
                    <View style={tw`flex-1`}>
                      <Text
                        style={tw`text-base font-semibold text-slate-900 dark:text-white`}
                        numberOfLines={1}
                      >
                        {tier.toUpperCase()} plan
                      </Text>
                      <Text
                        style={tw`text-xs text-slate-500 dark:text-white/60 mt-1`}
                        numberOfLines={1}
                      >
                        Selected: <Text style={tw`font-semibold`}>{amountLabel}</Text>
                      </Text>
                      <Text style={tw`text-xs text-slate-500 dark:text-white/60 mt-1`}>
                        Method: <Text style={tw`font-semibold`}>{method}</Text>
                      </Text>
                    </View>

                    <View style={tw`items-end`}>
                      <Text style={tw`text-xl font-semibold text-slate-900 dark:text-white`}>
                        {headerPrimary}
                      </Text>
                      <Text style={tw`text-[11px] text-slate-500 dark:text-white/60`}>
                        {cycle === 'monthly' ? 'per month' : 'per year'}
                        {seats != null ? ` • ${seats.toLocaleString()} seats` : ''}
                      </Text>

                      {headerBaseUsd ? (
                        <Text style={tw`text-[11px] text-slate-500 dark:text-white/60 mt-1`}>
                          Base USD: <Text style={tw`font-semibold`}>{headerBaseUsd}</Text>
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  {/* Feature chips */}
                  <View style={tw`mt-3 flex-row flex-wrap gap-2`}>
                    {(PLAN_META[tier]?.features || []).map((f) => (
                      <View
                        key={f}
                        style={tw`px-2 py-1 rounded-full bg-[#e7edf4] dark:bg-white/10`}
                      >
                        <Text style={tw`text-[11px] text-slate-800 dark:text-white/90`}>{f}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Method-specific UI */}
                {method === 'M-Pesa' ? (
                  <View
                    style={tw`mt-4 rounded-2xl p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10`}
                  >
                    <View style={tw`flex-row items-center justify-between`}>
                      <View style={tw`flex-row items-center gap-2`}>
                        {mpesaSrc ? (
                          <Image source={mpesaSrc} style={tw`h-6 w-16`} resizeMode="contain" />
                        ) : null}
                        <Text style={tw`text-sm font-semibold text-slate-800 dark:text-white`}>
                          M-Pesa
                        </Text>
                      </View>
                    </View>

                    <View
                      style={tw`mt-3 rounded-xl p-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10`}
                    >
                      <Text style={tw`text-xs text-slate-700 dark:text-white/80`}>
                        Charged in KES:{' '}
                        <Text style={tw`font-semibold`}>
                          {kesCents != null
                            ? formatMoneyIntl('en-KE', 'KES', centsToMajor(kesCents), 0)
                            : '(KES price unavailable)'}
                        </Text>
                      </Text>

                      {headerBaseUsd ? (
                        <Text style={tw`text-xs text-slate-700 dark:text-white/80 mt-1`}>
                          Base (USD): <Text style={tw`font-semibold`}>{headerBaseUsd}</Text>
                        </Text>
                      ) : null}

                      {localEstimate ? (
                        <Text style={tw`text-[11px] text-slate-500 dark:text-white/60 mt-2`}>
                          (UI estimate uses rate {localEstimate.rate})
                        </Text>
                      ) : null}
                    </View>

                    <Text style={tw`mt-3 text-xs text-slate-700 dark:text-white/80`}>
                      Safaricom Phone Number
                    </Text>

                    <TextInput
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="2547XXXXXXXX or 07XXXXXXXX"
                      placeholderTextColor={Platform.OS === 'ios' ? '#94a3b8' : undefined}
                      style={tw`mt-2 px-3 py-2 rounded-xl bg-white dark:bg-[#0f1821] text-[#0d141c] dark:text-white border border-slate-200 dark:border-white/10`}
                      keyboardType="phone-pad"
                    />

                    {phone ? (
                      <Text style={tw`mt-2 text-[11px] text-slate-500 dark:text-white/60`}>
                        Normalized: <Text style={tw`font-semibold`}>{normPhone || '—'}</Text>
                      </Text>
                    ) : null}

                    <View style={tw`mt-3 flex-row gap-2`}>
                      <Pressable
                        onPress={handleMpesaInit}
                        style={tw`flex-1 px-3 py-3 rounded-xl bg-blue-600`}
                      >
                        <Text style={tw`text-white text-sm font-semibold text-center`}>
                          Initiate STK Push
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={handleMpesaComplete}
                        style={tw`flex-1 px-3 py-3 rounded-xl bg-green-600`}
                      >
                        <Text style={tw`text-white text-sm font-semibold text-center`}>
                          Complete Payment
                        </Text>
                      </Pressable>
                    </View>

                    <Pressable
                      onPress={() => setShowRefBox((v) => !v)}
                      style={tw`mt-3 px-3 py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10`}
                    >
                      <Text style={tw`text-xs text-slate-700 dark:text-white/80`}>
                        Having issues? {showRefBox ? 'Hide' : 'Enter'} M-Pesa reference
                      </Text>
                    </Pressable>

                    {showRefBox ? (
                      <View style={tw`mt-2`}>
                        <TextInput
                          value={reference}
                          onChangeText={setReference}
                          placeholder="Receipt / reference number (optional)"
                          placeholderTextColor={Platform.OS === 'ios' ? '#94a3b8' : undefined}
                          style={tw`mt-2 px-3 py-2 rounded-xl bg-white dark:bg-[#0f1821] text-[#0d141c] dark:text-white border border-slate-200 dark:border-white/10`}
                        />

                        <Pressable
                          onPress={handleMpesaComplete}
                          style={tw`mt-2 px-3 py-3 rounded-xl bg-orange-600`}
                        >
                          <Text style={tw`text-white text-sm font-semibold text-center`}>
                            Update Reference / Complete
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}

                    <Text style={tw`mt-3 text-[11px] text-slate-500 dark:text-white/60`}>
                      Tip: keep your phone nearby to approve the STK prompt.
                    </Text>
                  </View>
                ) : null}

                {method === 'Paystack' ? (
                  <View
                    style={tw`mt-4 rounded-2xl p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10`}
                  >
                    <View style={tw`flex-row items-center justify-between`}>
                      <View>
                        <Text style={tw`text-sm font-semibold text-slate-800 dark:text-white`}>
                          Card checkout
                        </Text>
                        <Text style={tw`mt-1 text-[11px] text-slate-600 dark:text-white/70`}>
                          You’ll be redirected to Paystack to pay for{' '}
                          <Text style={tw`font-semibold`}>{amountLabel}</Text>.
                        </Text>
                      </View>
                    </View>

                    <View
                      style={tw`mt-3 rounded-xl p-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10`}
                    >
                      <Text style={tw`text-xs text-slate-700 dark:text-white/80`}>
                        Base (USD): <Text style={tw`font-semibold`}>{headerBaseUsd ?? '—'}</Text>
                      </Text>

                      <Text style={tw`text-xs text-slate-700 dark:text-white/80 mt-1`}>
                        Checkout (KES):{' '}
                        <Text style={tw`font-semibold`}>
                          {kesCents != null
                            ? formatMoneyIntl('en-KE', 'KES', centsToMajor(kesCents), 0)
                            : '(KES price unavailable)'}
                        </Text>
                      </Text>

                      {localEstimate ? (
                        <Text style={tw`text-xs text-slate-700 dark:text-white/80 mt-1`}>
                          Local display:{' '}
                          <Text style={tw`font-semibold`}>
                            {formatMoneyIntl(userLocale, localEstimate.local, localEstimate.amount)}
                          </Text>{' '}
                          <Text style={tw`text-[11px] text-slate-500 dark:text-white/60`}>
                            (rate: {localEstimate.rate})
                          </Text>
                        </Text>
                      ) : (
                        <Text style={tw`text-[11px] text-slate-500 dark:text-white/60 mt-1`}>
                          (No local estimate available for {userDisplayCurrency}.)
                        </Text>
                      )}

                      <Text style={tw`mt-2 text-[11px] text-slate-500 dark:text-white/60`}>
                        Note: We show USD as the base price for consistency. Final checkout is in{' '}
                        <Text style={tw`font-semibold`}>KES</Text>.
                      </Text>
                    </View>

                    <Pressable
                      onPress={handlePaystack}
                      style={tw`mt-3 px-3 py-3 rounded-xl bg-slate-900`}
                    >
                      <Text style={tw`text-white text-sm font-semibold text-center`}>
                        Continue to Paystack
                      </Text>
                    </Pressable>

                    <Text style={tw`mt-2 text-[11px] text-slate-500 dark:text-white/60`}>
                      After payment, you’ll return automatically and your subscription will
                      activate.
                    </Text>
                  </View>
                ) : null}

                <View
                  style={tw`mt-4 rounded-2xl p-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10`}
                >
                  <Text style={tw`text-[11px] text-slate-600 dark:text-white/70`}>
                    Need a custom seat count? Enterprise supports tailored pricing—contact support
                    from your Org profile.
                  </Text>
                </View>
              </ScrollView>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
