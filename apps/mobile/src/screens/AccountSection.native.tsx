/// <reference path="../declarations.d.ts" />
/* eslint-disable prettier/prettier */
import axios, { AxiosError } from 'axios';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  NavigationProp,
  RouteProp,
} from '@react-navigation/native';
import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  TextInput,
  TouchableOpacity,
  Alert,
  Linking,
  ScrollView,
} from 'react-native';

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTutorProfile } from '@mytutorapp/shared/api/profileDetailApi';

import Spinner from './Spinner.native';
import useAccountSection from '@mytutorapp/shared/hooks/useAccountSection';
import { Coachmark, useCoachmark } from '../components/hints/Coachmark.native';
import { useWithdrawal } from '@mytutorapp/shared/hooks';
import debounce from 'lodash.debounce';

import type {
  SessionType,
  Transaction,
  EarningsSummary,
  User,
  PayoutCurrency,
} from '@mytutorapp/shared/types';

import tw from '../../tailwind';
import DateTimePicker, { Event } from '@react-native-community/datetimepicker';
import type { MainStackParamList, ActiveTab } from '../navigation/types';
import { useShopContext } from '@mytutorapp/shared/context';
import { notifyNow } from '../../utils/notifications';
import SelectField, { type Option as SelectOption } from './SelectField.native';
import { useThemePref } from '../theme/ThemeContext';

// ✅ Same global pull-to-refresh wrappers as ProfileScreen
import { RefreshableScrollView } from '../refresh/Refreshable';
import { useRegisterScreenRefresh } from '../refresh/GlobalRefreshProvider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const currencyFmt = (amt: number, currency: string) => {
  const code = String(currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(amt);
  } catch {
    const clean = Number.isFinite(amt) ? Number(amt).toFixed(2) : '0.00';
    return `${code} ${clean}`;
  }
};

const MIN_WITHDRAW: Record<'USD' | 'KES', number> = { USD: 20, KES: 200 };

const isActiveTab = (v: string | null): v is ActiveTab =>
  v === 'overview' ||
  v === 'transactions' ||
  v === 'sessions' ||
  v === 'reviews' ||
  v === 'earnings';

// Parse web-style deep link paths (for navigateFn parity)
function parseAccountPath(path: string): MainStackParamList['Account'] {
  const [, q = ''] = path.split('?');
  const p = new URLSearchParams(q);

  const pricingString = p.get('pricing');
  let pricing: Record<string, string> | undefined;
  if (pricingString) {
    try {
      const parsed = JSON.parse(pricingString) as unknown;
      if (parsed && typeof parsed === 'object') {
        const entries = Object.entries(parsed as Record<string, unknown>).map(
          ([k, v]) => [k, String(v)] as const
        );
        pricing = Object.fromEntries(entries);
      }
    } catch {}
  }

  const rawTab = p.get('tab');
  const tab: ActiveTab | undefined = isActiveTab(rawTab) ? rawTab : undefined;

  return {
    action: (p.get('action') as 'createSession') || undefined,
    tutorId: p.get('tutorId') || undefined,
    tutorName: p.get('tutorName') || undefined,
    subject: p.get('subject') || undefined,
    comment: p.get('comment') || undefined,
    description: p.get('description') || undefined,
    note: p.get('note') || undefined,
    pricing,
    tab,
  };
}

// ---------------------------------------------------------------------------

type HookResult = ReturnType<typeof useAccountSection> & {
  user: User;
  sessions: SessionType[];
  transactions: Transaction[];
  earnings?: EarningsSummary | null;
  payoutCurrency: PayoutCurrency;

  refetchTransactions: () => Promise<void>;
  refetchAccount: () => Promise<void>;
  refetchEarnings: () => Promise<void>;

  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

  showRatingModal: boolean;
  setShowRatingModal: (b: boolean) => void;
  ratingData: { rating: string; comment: string };
  setRatingData: (v: { rating: string; comment: string }) => void;
};

type SessionFormErrors = {
  tutorId?: string;
  subject?: string;
  sessionType?: string;
  date?: string;
};

const sessionLabelFor: Record<string, string> = {
  tutorId: 'Tutor',
  subject: 'Subject',
  sessionType: 'Session type',
  date: 'Session date',
};

const buildSessionBannerFromErrors = (errs: SessionFormErrors) => {
  const keys = Object.keys(errs);
  if (!keys.length) return '';
  const items = keys.map((k) => sessionLabelFor[k] || k);
  return `Please complete: ${items.join(' • ')}.`;
};

const AccountSectionNative: React.FC = () => {
  const insets = useSafeAreaInsets();
 const { backendUrl, token } = useShopContext();
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'Account'>>();
  const { resolvedScheme } = useThemePref();

  // theme colors
  const placeholderColor = resolvedScheme === 'dark' ? '#64748B' : '#94A3B8';
  const selectedTextColor = resolvedScheme === 'dark' ? '#E5E7EB' : '#0F172A';

  // shared styles (theme-aware)
  const sectionBase = tw`rounded-2xl p-4 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`;
  const cardAlt = tw`p-4 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10`;
  const helperText = tw`text-xs text-slate-600 dark:text-slate-400`;
  const inputBase = tw`w-full px-3 py-3 rounded-xl bg-slate-100 dark:bg-slate-900/60 text-[#0d141c] dark:text-white border border-slate-200 dark:border-white/10`;
  const tabOn = tw`px-3 py-2 rounded-xl bg-[#3d99f5]`;
  const tabOff = tw`px-3 py-2 rounded-xl bg-slate-200 dark:bg-white/5`;

  const [cancelError, setCancelError] = useState<Record<string, boolean>>({});
  const [sessionFormErrors, setSessionFormErrors] = useState<SessionFormErrors>({});
  const [sessionBanner, setSessionBanner] = useState<string>('');

  const params: MainStackParamList['Account'] = route.params ?? {};

  const queryParams = useMemo(() => {
    const qp = new URLSearchParams();
    if (params.action) qp.set('action', params.action);
    if (params.tutorId) qp.set('tutorId', params.tutorId);
    if (params.tutorName) qp.set('tutorName', params.tutorName);
    if (params.subject) qp.set('subject', params.subject);
    if (params.comment) qp.set('comment', params.comment);
    if (params.description) qp.set('description', params.description);
    if (params.note) qp.set('note', params.note);
    if (params.pricing) {
        const p =
          typeof (params as any).pricing === 'string'
            ? String((params as any).pricing)
            : JSON.stringify((params as any).pricing);
        qp.set('pricing', p);
      }

    if (params.tab) qp.set('tab', params.tab);
    return qp;
  }, [params]);

  const alertFn = (msg: string) => Alert.alert('Alert', msg);
  const confirmFn = (msg: string): Promise<boolean> =>
    new Promise((res) =>
      Alert.alert('Confirm', msg, [
        { text: 'Cancel', onPress: () => res(false), style: 'cancel' },
        { text: 'OK', onPress: () => res(true) },
      ])
    );

  const navigateFn = (dest: string) => {
    if (dest.startsWith('/account')) {
      navigation.navigate('Account', parseAccountPath(dest));
    } else if (dest.startsWith('/messages')) {
      const qs = new URLSearchParams(dest.split('?')[1] || '');
      const studentId = qs.get('studentId') || '';
      navigation.navigate('Messages', { studentId });
    } else if (dest === '/buy-tokens') {
      navigation.navigate('BuyTokens');
    }
  };

  const {
    loading,
    user,
    transactions,
    sessions,
    earnings,

    payoutCurrency,
    refetchTransactions,
    refetchAccount,

    activeTab,
    setActiveTab,
    formData,
    setFormData,
    cancelReasons,
    handleAcceptSession,
    handleSessionCreation,
    handleCompletePending,
    handleConfirmComplete,
    handleReviewSubmission,
    setShowRatingModal,
    showRatingModal,
    refetchEarnings,
    ratingData,
    setRatingData,
    handleCreateZoomLink,
    handleCancelReasonChange,
    confirmCancelSession,
  } = useAccountSection({
    alertFn,
    confirmFn,
    navigateFn,
    queryParams,
  }) as HookResult;

  const rawRole = (user as unknown as { role?: string } | undefined)?.role;
  const role: 'student' | 'tutor' | 'unknown' =
    rawRole === 'student' || rawRole === 'tutor' ? rawRole : 'unknown';

  const { withdraw, isSubmitting: isWithdrawing } = useWithdrawal({
    notify: (m, t) => {
      if (t === 'error') console.error(m);
      else console.log(m);
    },
  });

  const pricingObj = useMemo(() => {
  // ✅ prefer params.pricing (what navigation passed)
  const fromParams: any = (params as any)?.pricing;

  // fallback to hook state
  const fromForm: any = (formData as any)?.pricing;

  const candidate = fromParams && Object.keys(fromParams).length ? fromParams : fromForm;

  if (!candidate) return {};

  if (typeof candidate === 'string') {
    try {
      const parsed = JSON.parse(candidate);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  return typeof candidate === 'object' ? candidate : {};
}, [params, (formData as any)?.pricing]);


const pricingEntries = useMemo(
  () => Object.entries(pricingObj).filter(([k]) => !!k),
  [pricingObj]
);

const sessionTypeOptions: SelectOption[] = useMemo(() => {
  return pricingEntries.map(([type, price]) => ({
    value: type,
    label: `${type.charAt(0).toUpperCase() + type.slice(1)} – ${String(price)} Tokens`,
  }));
}, [pricingEntries]);

const hasSessionTypes = sessionTypeOptions.length > 0;


  useEffect(() => {
  console.log('[Account] params.pricing =', params?.pricing);
  console.log('[Account] formData.pricing =', (formData as any)?.pricing);
  console.log('[Account] pricingObj =', pricingObj);
  console.log('[Account] sessionTypeOptions =', sessionTypeOptions);
}, [params?.pricing, (formData as any)?.pricing, pricingObj, sessionTypeOptions]);


  const { lifetimeByCurrency, pendingWithdrawalsByCurrency, completedEarnings } = useMemo(() => {
    const sums: Record<string, number> = {};
    const pending: Record<string, number> = {};
    const earningsTx: Transaction[] = [];

    for (const tx of transactions) {
      const curr = String(tx.currency ?? 'USD').toUpperCase();
      if (tx.type?.toLowerCase().includes('earning')) {
        sums[curr] = (sums[curr] || 0) + Math.max(0, Number(tx.amount) || 0);
        earningsTx.push(tx);
      }
      if (tx.type === 'Withdrawal Request' && (tx.status || 'Pending') === 'Pending') {
        pending[curr] = (pending[curr] || 0) + Math.max(0, Number(tx.amount) || 0);
      }
    }

    return {
      lifetimeByCurrency: sums,
      pendingWithdrawalsByCurrency: pending,
      completedEarnings: earningsTx.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    };
  }, [transactions]);

  const approxAvailable = Math.max(
    0,
    (lifetimeByCurrency[payoutCurrency] || 0) - (pendingWithdrawalsByCurrency[payoutCurrency] || 0)
  );

  const earningsLastSeenRef = useRef<number | null>(null);
  const isEmptyObj = (o: any) => !o || typeof o !== 'object' || Object.keys(o).length === 0;

useEffect(() => {
  const tutorId = String(params.tutorId || formData.tutorId || '');
  if (!tutorId) return;

  const wantsSession = params.action === 'createSession';
  if (!wantsSession) return;

  // already have pricing? stop.
  if (!isEmptyObj(pricingObj)) return;

  let cancelled = false;

  (async () => {
  try {
    const base = backendUrl.replace(/\/$/, '');

    let data: any = null;

    try {
      // 1) try user endpoint
      data = await getTutorProfile(base, token || '', tutorId);
    } catch (e) {
      const ae = e as AxiosError;

      // 2) fallback to /api/profile/:id if 404
      if (ae.response?.status === 404) {
        const resp = await axios.get(`${base}/api/profile/${encodeURIComponent(tutorId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          timeout: 10000,
        });
        data = resp.data;
      } else {
        throw e;
      }
    }

    const p = data?.pricing || data?.profile?.pricing || data?.tutorProfile?.pricing || null;
    if (!p || typeof p !== 'object') return;

    const pricing = Object.fromEntries(
      Object.entries(p).map(([k, v]) => [k, String(v ?? '0')])
    );

    setFormData((prev: any) => ({ ...prev, tutorId, pricing }));

    setFormData((prev: any) => {
      if (prev.sessionType) return prev;
      const [firstKey] = Object.keys(pricing);
      if (!firstKey) return prev;
      return {
        ...prev,
        sessionType: firstKey,
        sessionCost: String(pricing[firstKey] ?? '0'),
        pricing,
      };
    });
  } catch (e) {
      console.log('[AccountSectionNative] pricing fetch failed', e);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [params.action, params.tutorId, formData.tutorId, backendUrl, token, pricingObj, setFormData]);

  useEffect(() => {
  const p: any = (params as any)?.pricing;
  const hasP = p && typeof p === 'object' && Object.keys(p).length > 0;

  const fp: any = (formData as any)?.pricing;
  const hasFP = fp && typeof fp === 'object' && Object.keys(fp).length > 0;

  if (hasP && !hasFP) {
    setFormData({ ...formData, pricing: p });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [(params as any)?.pricing]);

// ✅ Ensure navigation params hydrate the session form (especially when Account is already mounted)
useEffect(() => {
  if (params?.action !== 'createSession') return;

  setFormData((prev: any) => ({
    ...prev,
    tutorId: params.tutorId ?? prev.tutorId ?? '',
    tutorName: params.tutorName ?? prev.tutorName ?? '',
    subject: params.subject ?? prev.subject ?? '',

    // keep your unlock context if present
    comment: params.comment ?? prev.comment,
    description: params.description ?? prev.description,
    note: params.note ?? prev.note,

    // pricing may arrive from Messages
    pricing: (params as any)?.pricing ?? prev.pricing,
  }));

  // optional: clear old validation errors when arriving with prefilled values
  setSessionFormErrors((prev) => ({ ...prev, subject: undefined, tutorId: undefined }));
  setSessionBanner('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [
  params?.action,
  params?.tutorId,
  params?.tutorName,
  params?.subject,
  params?.comment,
  params?.description,
  params?.note,
  (params as any)?.pricing,
  setFormData,
]);


  useEffect(() => {
    const current = earnings?.available ?? approxAvailable;
    const prev = earningsLastSeenRef.current;
    if (prev != null && current > prev + 0.009) {
      void notifyNow(
        'New earnings available',
        `Your available earnings are now ${currencyFmt(current, String(payoutCurrency))}.`,
        { screen: 'Account', params: { tab: 'earnings' } }
      );
    }
    earningsLastSeenRef.current = current;
  }, [earnings?.available, approxAvailable, payoutCurrency]);

  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const minAmount = MIN_WITHDRAW[payoutCurrency];

  useEffect(() => {
    const desired = params.tab;
    if (desired && desired !== activeTab) setActiveTab(desired);
  }, [params.tab, activeTab, setActiveTab]);

  const debouncedReviewSubmission = useMemo(
    () => debounce(handleReviewSubmission, 300),
    [handleReviewSubmission]
  );
  useEffect(() => () => debouncedReviewSubmission.cancel(), [debouncedReviewSubmission]);

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'earnings') {
        refetchTransactions();
        refetchAccount();
        refetchEarnings();
      }
    }, [activeTab, refetchTransactions, refetchAccount, refetchEarnings])
  );

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [sessions]
  );

  // ✅ Use ONE scroll view ref (like Profile) so “scrollToEnd” works with the main scroll
  const scrollRef = useRef<ScrollView | null>(null);
  const [justCreated, setJustCreated] = useState(false);

  useEffect(() => {
    if (!justCreated) return;
    if (activeTab !== 'sessions') {
      setActiveTab('sessions');
      return;
    }
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
      setJustCreated(false);
    }, 50);
    return () => clearTimeout(t);
  }, [justCreated, activeTab, setActiveTab]);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const dateValue = formData.date ? new Date(String(formData.date)) : new Date();
  const transactionsHint = useCoachmark('account_transactions_v1', activeTab === 'transactions');
  const sessionsHint = useCoachmark('account_sessions_v1', activeTab === 'sessions');

  const availableTabs: ActiveTab[] = [
    'overview',
    'transactions',
    ...(role === 'student' || role === 'tutor' ? (['sessions'] as const) : []),
    ...(role === 'student' ? (['reviews'] as const) : []),
    ...(role === 'tutor' ? (['earnings'] as const) : []),
  ];

  const validateSessionForm = (): boolean => {
    const errs: SessionFormErrors = {};
    if (!formData.tutorId) {
      errs.tutorId = 'Choose a tutor by visiting their profile and tapping "Create Session".';
    }
    if (!formData.subject?.trim()) errs.subject = 'Enter the subject or topic for this session.';
    if (!formData.sessionType) errs.sessionType = 'Select a session type.';
    if (!formData.date) errs.date = 'Pick a preferred date for the session.';

    setSessionFormErrors(errs);
    setSessionBanner(buildSessionBannerFromErrors(errs));
    return Object.keys(errs).length === 0;
  };

  // ✅ Pull-to-refresh action (same idea as Profile’s refreshAccountState)
  const refreshAccountState = useCallback(async () => {
    try {
      await Promise.allSettled([refetchAccount(), refetchTransactions(), refetchEarnings()]);
    } catch {
      // ignore
    }
  }, [refetchAccount, refetchTransactions, refetchEarnings]);

  // ✅ Register this screen with GlobalRefreshProvider
  useRegisterScreenRefresh(refreshAccountState);

  if (loading) {
    return (
      <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`} edges={['top', 'bottom']}>
        <View style={tw`flex-1 justify-center items-center`}>
          <Spinner />
        </View>
      </SafeAreaView>
    );
  }

  const topPad = Math.max(12, insets.top + 12);

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`} edges={['top', 'bottom']}>
      <RefreshableScrollView
        ref={scrollRef}
        style={tw`flex-1`}
        contentContainerStyle={[
          tw`px-4 pb-12`,
          { paddingTop: topPad, paddingBottom: Math.max(24, insets.bottom + 24) },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={[tw`flex-row items-center`, sectionBase]}>
          {role !== 'student' && (
            <Image
              source={{
                uri: user?.profileImage
                  ? user.profileImage.startsWith('http')
                    ? user.profileImage
                    : `${backendUrl}${user.profileImage}`
                  : 'https://ui-avatars.com/api/?name=Tutor&background=e7edf4&color=0d141c',
              }}
              style={tw`w-16 h-16 rounded-full mr-4 bg-slate-200 dark:bg-white/5`}
            />
          )}

          <View style={tw`flex-1`}>
            <Text style={tw`text-[20px] font-extrabold text-[#0d141c] dark:text-white`}>
              {user?.name || 'User Name'}
            </Text>

            <Text style={tw`text-xs text-slate-600 dark:text-slate-400 mt-0.5`}>
              {user?.email ?? ''}
            </Text>

            {role === 'student' && (
              <Text style={tw`text-xs text-slate-600 dark:text-slate-400 mt-1`}>
                Tokens:{' '}
                <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
                  {user?.tokens ?? 0}
                </Text>
              </Text>
            )}
          </View>
        </View>

        {/* Tabs */}
        <View
          style={tw`flex-row flex-wrap gap-2 mt-4 border-b border-slate-200 dark:border-white/10 pb-2 relative`}
          accessibilityRole="tablist"
        >
          <Coachmark
            id="account_transactions_v1"
            title="Track your balance"
            text="Transactions show token purchases, earnings, and deductions."
            visible={transactionsHint.visible}
            onDismiss={transactionsHint.dismiss}
            placement="bottom"
          />
          <Coachmark
            id="account_sessions_v1"
            title="Manage sessions"
            text="Create sessions, review upcoming lessons, and see status updates here."
            visible={sessionsHint.visible}
            onDismiss={sessionsHint.dismiss}
            placement="bottom"
          />
          {availableTabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                onPress={() => setActiveTab(tab)}
                style={isActive ? tabOn : tabOff}
                activeOpacity={0.9}
              >
                <Text
                  style={tw.style(
                    'text-xs font-semibold',
                    isActive ? 'text-white' : 'text-[#0d141c] dark:text-slate-200'
                  )}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Content */}
        <View style={tw`mt-4`}>
          {/* Overview */}
          {activeTab === 'overview' && (
            <View style={sectionBase}>
              <Text style={tw`text-base text-slate-600 dark:text-slate-400 text-center`}>
                Welcome to your account overview.
              </Text>
            </View>
          )}

          {/* Transactions */}
          {activeTab === 'transactions' && (
            <View>
              <Text style={tw`text-xl font-bold text-[#0d141c] dark:text-white mb-3`}>
                Transaction History
              </Text>

              {transactions.length > 0 ? (
                transactions.map((tx) => (
                  <View
                    key={String(tx.id)}
                    style={tw`p-4 rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 mb-3`}
                  >
                    <Text style={helperText}>
                      <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>Type: </Text>
                      {tx.type}
                    </Text>
                    <Text style={helperText}>
                      <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>Amount: </Text>
                      {currencyFmt(
                        Math.abs(Number(tx.amount)),
                        String(tx.currency ?? 'USD').toUpperCase()
                      )}
                    </Text>
                    <Text style={helperText}>
                      <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>Kind: </Text>
                      {Number(tx.amount) > 0 ? 'Earning' : 'Deduction'}
                    </Text>
                    <Text style={helperText}>
                      <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>Status: </Text>
                      {tx.status || 'N/A'}
                    </Text>
                    <Text style={helperText}>
                      <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
                        Description:{' '}
                      </Text>
                      {tx.description || 'N/A'}
                    </Text>
                    <Text style={helperText}>
                      <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>Date: </Text>
                      {new Date(tx.date).toLocaleDateString()}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={helperText}>No transactions found.</Text>
              )}
            </View>
          )}

          {/* Student Sessions */}
          {activeTab === 'sessions' && role === 'student' && (
            <>
              {/* Create Session Form */}
              <View style={[sectionBase, tw`max-w-[680px] self-center w-full mb-4`]}>
                {!!sessionBanner && (
                  <View
                    style={tw`mb-3 rounded-lg border border-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-2`}
                  >
                    <Text style={tw`text-xs text-red-800 dark:text-red-100`}>{sessionBanner}</Text>
                  </View>
                )}

                {!formData.tutorId && (
                  <View
                    style={tw.style(
                      'p-2 border-l-4 rounded mb-3',
                      sessionFormErrors.tutorId
                        ? 'bg-red-50 border-red-500'
                        : 'bg-amber-50 border-amber-500 dark:bg-amber-900/20'
                    )}
                  >
                    <Text style={tw`text-xs text-amber-800 dark:text-amber-100`}>
                      To create a session, visit a tutor’s profile and tap “Create Session.”
                    </Text>
                    {sessionFormErrors.tutorId && (
                      <Text style={tw`mt-1 text-[11px] text-red-700 dark:text-red-200`}>
                        {sessionFormErrors.tutorId}
                      </Text>
                    )}
                  </View>
                )}

                <Text style={tw`text-lg font-bold text-[#0d141c] dark:text-white mb-3`}>
                  {formData.tutorName ? `Session with ${formData.tutorName}` : 'Create a Session'}
                </Text>

                {/* Subject */}
                <TextInput
                  placeholder="Subject"
                  placeholderTextColor={placeholderColor}
                  value={formData.subject}
                  onChangeText={(t) => {
                    setFormData({ ...formData, subject: t });
                    if (sessionFormErrors.subject) {
                      const { subject, ...rest } = sessionFormErrors;
                      setSessionFormErrors(rest);
                    }
                  }}
                  style={tw.style(inputBase, sessionFormErrors.subject ? 'border-red-500' : '')}
                />
                {sessionFormErrors.subject && (
                  <Text style={tw`mb-2 text-[11px] text-red-600 dark:text-red-400`}>
                    {sessionFormErrors.subject}
                  </Text>
                )}

                {/* Note */}
                <TextInput
                  placeholder="Note (optional)"
                  placeholderTextColor={placeholderColor}
                  value={formData.note || ''}
                  onChangeText={(t) => {
                    setFormData({ ...formData, note: t });
                  }}
                  style={tw.style(inputBase, 'mt-2', 'h-20')}
                  multiline
                  textAlignVertical="top"
                />
                <Text style={tw`mt-1 text-[11px] text-slate-500 dark:text-slate-400`}>
                  Share any quick question or availability details for the tutor.
                </Text>

                {/* Session Type */}
                <View style={tw`mt-1`}>
                  <SelectField
                    value={formData.sessionType || ''}
                   onChange={(sessionType) => {
                    const sessionCost = String((pricingObj as any)?.[sessionType] ?? 0);

                    // ✅ keep pricing object in state (same as web)
                    setFormData({ ...formData, sessionType, sessionCost, pricing: pricingObj });

                    if (sessionFormErrors.sessionType) {
                      const { sessionType: _st, ...rest } = sessionFormErrors;
                      setSessionFormErrors(rest);
                    }
                  }}


                    options={sessionTypeOptions}
                    placeholder={
                      hasSessionTypes ? 'Select Session Type' : 'No session types configured'
                    }
                    modalTitle="Select session type"
                    error={sessionFormErrors.sessionType}
                    placeholderColor={placeholderColor}
                    selectedTextColor={selectedTextColor}
                  />
                  
                </View>
                

                {/* Date */}
                <TouchableOpacity
                  onPress={() => setShowDatePicker(true)}
                  style={tw.style(
                    inputBase,
                    tw`mt-2`,
                    sessionFormErrors.date ? 'border-red-500' : ''
                  )}
                  activeOpacity={0.9}
                >
                  <Text style={tw`text-sm text-[#0d141c] dark:text-white`}>
                    {formData.date || 'Select date'}
                  </Text>
                </TouchableOpacity>

                {sessionFormErrors.date && (
                  <Text style={tw`mt-1 mb-2 text-[11px] text-red-600 dark:text-red-400`}>
                    {sessionFormErrors.date}
                  </Text>
                )}

                {showDatePicker && (
                  <DateTimePicker
                    value={dateValue}
                    mode="date"
                    display="default"
                    onChange={(_e: Event, d?: Date) => {
                      setShowDatePicker(false);
                      if (d) {
                        setFormData({ ...formData, date: d.toISOString().slice(0, 10) });
                        if (sessionFormErrors.date) {
                          const { date, ...rest } = sessionFormErrors;
                          setSessionFormErrors(rest);
                        }
                      }
                    }}
                  />
                )}

                {/* Submit */}
                <TouchableOpacity
                  onPress={async () => {
                    setSessionFormErrors({});
                    setSessionBanner('');

                    const ok = validateSessionForm();
                    if (!ok) return;

                    await handleSessionCreation();
                    setJustCreated(true);

                    await notifyNow(
                      'Lesson requested',
                      formData.tutorName
                        ? `Your lesson request with ${formData.tutorName} has been sent.`
                        : 'Your lesson request has been sent to the tutor.',
                      { screen: 'Account', params: { tab: 'sessions' } }
                    );
                  }}
                  style={tw`mt-4 py-3 rounded-xl bg-[#3d99f5] items-center justify-center`}
                  activeOpacity={0.9}
                >
                  <Text style={tw`text-white text-sm font-semibold`}>Create Session</Text>
                </TouchableOpacity>
              </View>

              {/* Sessions list (no nested ScrollView) */}
              <View style={tw`max-w-[880px] self-center w-full`}>
                <View
                  style={tw`p-4 rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
                >
                  <Text style={tw`text-xl font-bold text-[#0d141c] dark:text-white mb-2`}>
                    Your Sessions
                  </Text>

                  {sortedSessions.length > 0 ? (
                    sortedSessions.map((session) => (
                      <View key={String(session.id)} style={[cardAlt, tw`mb-3`]}>
                        <Text style={helperText}>
                          <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
                            Tutor:{' '}
                          </Text>
                          {session.tutor_name || 'N/A'}
                        </Text>
                        <Text style={helperText}>
                          <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
                            Type:{' '}
                          </Text>
                          {session.sessionType || 'N/A'}
                        </Text>
                        <Text style={helperText}>
                          <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
                            Subject:{' '}
                          </Text>
                          {session.subject || 'N/A'}
                        </Text>
                        <Text style={helperText}>
                          <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
                            Cost:{' '}
                          </Text>
                          {session.amount} tokens
                        </Text>
                        <Text style={helperText}>
                          <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
                            Date:{' '}
                          </Text>
                          {new Date(session.date).toLocaleDateString()}
                        </Text>
                        <Text style={helperText}>
                          <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
                            Status:{' '}
                          </Text>
                          {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                        </Text>

                        {session.status === 'accepted' && (
                          <>
                            {session.zoom_links?.length ? (
                              <View style={tw`mt-3`}>
                                <Text
                                  style={tw`text-xs font-semibold text-emerald-600 dark:text-emerald-300 mb-1`}
                                >
                                  Zoom Links:
                                </Text>
                                {session.zoom_links.map((link, i) => (
                                  <TouchableOpacity
                                    key={String(i)}
                                    onPress={() => Linking.openURL(link)}
                                  >
                                    <Text
                                      style={tw`text-xs text-[#3d99f5] dark:text-[#7fb5ff] underline`}
                                    >
                                      Join Meeting Part {i + 1}
                                    </Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            ) : (
                              <Text
                                style={tw`mt-3 text-xs text-slate-600 dark:text-slate-400 italic`}
                              >
                                Please wait for the tutor to create Zoom links.
                              </Text>
                            )}

                            <TextInput
                              placeholder="Reason for cancellation"
                              placeholderTextColor={placeholderColor}
                              value={cancelReasons[String(session.id)] || ''}
                              onChangeText={(t) => {
                                setCancelError((prev) => ({
                                  ...prev,
                                  [String(session.id)]: false,
                                }));
                                handleCancelReasonChange(String(session.id), t);
                              }}
                              style={tw.style(
                                inputBase,
                                tw`mt-3`,
                                cancelError[String(session.id)] ? 'border-red-500' : ''
                              )}
                              multiline
                            />

                            <TouchableOpacity
                              style={tw`mt-3 px-4 py-2 rounded-lg bg-rose-600 items-center justify-center`}
                              onPress={() => {
                                const reason = (cancelReasons[String(session.id)] || '').trim();
                                if (!reason) {
                                  setCancelError((prev) => ({
                                    ...prev,
                                    [String(session.id)]: true,
                                  }));
                                  return;
                                }
                                confirmCancelSession(String(session.id), role, session.status);
                              }}
                              activeOpacity={0.9}
                            >
                              <Text style={tw`text-white text-sm font-semibold`}>
                                Cancel Session
                              </Text>
                            </TouchableOpacity>
                          </>
                        )}

                        {session.status === 'completed_pending' && (
                          <TouchableOpacity
                            style={tw`mt-3 px-4 py-2 rounded-lg bg-emerald-600 items-center justify-center`}
                            onPress={async () => {
                              await handleConfirmComplete(String(session.id));
                              await notifyNow(
                                'Lesson confirmed completed',
                                `You confirmed your lesson with ${session.tutor_name || 'your tutor'} as completed.`,
                                { screen: 'Account', params: { tab: 'sessions' } }
                              );
                            }}
                            activeOpacity={0.9}
                          >
                            <Text style={tw`text-white text-sm font-semibold`}>
                              Confirm Completion
                            </Text>
                          </TouchableOpacity>
                        )}

                        {session.status === 'completed' && (
                          <Text
                            style={tw`mt-3 text-xs font-semibold text-emerald-600 dark:text-emerald-300`}
                          >
                            Session Completed
                          </Text>
                        )}
                        {session.status === 'cancelled' && (
                          <Text style={tw`mt-3 text-xs text-rose-500 dark:text-rose-300`}>
                            Session Cancelled
                          </Text>
                        )}
                      </View>
                    ))
                  ) : (
                    <Text style={tw`text-xs text-slate-600 dark:text-slate-400 text-center`}>
                      No sessions yet.
                    </Text>
                  )}
                </View>
              </View>
            </>
          )}

          {/* Tutor Sessions (no nested ScrollView) */}
          {activeTab === 'sessions' && role === 'tutor' && (
            <View style={tw`max-w-[880px] self-center w-full`}>
              <View
                style={tw`p-4 rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
              >
                <Text style={tw`text-xl font-bold text-[#0d141c] dark:text-white mb-2`}>
                  Your Upcoming Sessions
                </Text>

                {sortedSessions.length > 0 ? (
                  sortedSessions.map((session) => (
                    <View key={String(session.id)} style={[cardAlt, tw`mb-3`]}>
                      <Text style={helperText}>
                        <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
                          Student:{' '}
                        </Text>
                        {session.student_name || 'N/A'}
                      </Text>
                      <Text style={helperText}>
                        <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>Type: </Text>
                        {session.sessionType || 'N/A'}
                      </Text>
                      <Text style={helperText}>
                        <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>Date: </Text>
                        {new Date(session.date).toLocaleDateString()}
                      </Text>

                      {session.status === 'upcoming' && (
                        <View style={tw`mt-3`}>
                          <TouchableOpacity
                            style={tw`px-4 py-2 rounded-lg bg-emerald-600 items-center justify-center mb-2`}
                            onPress={async () => {
                              await handleAcceptSession(String(session.id));
                              await notifyNow(
                                'Lesson accepted',
                                `You accepted a lesson with ${session.student_name || 'the student'}.`,
                                { screen: 'Account', params: { tab: 'sessions' } }
                              );
                            }}
                            activeOpacity={0.9}
                          >
                            <Text style={tw`text-white text-sm font-semibold`}>Accept</Text>
                          </TouchableOpacity>

                          <TextInput
                            placeholder="Reason for cancellation"
                            placeholderTextColor={placeholderColor}
                            value={cancelReasons[String(session.id)] || ''}
                            onChangeText={(t) => {
                              setCancelError((prev) => ({ ...prev, [String(session.id)]: false }));
                              handleCancelReasonChange(String(session.id), t);
                            }}
                            style={tw.style(
                              inputBase,
                              cancelError[String(session.id)] ? 'border-red-500' : ''
                            )}
                            multiline
                          />

                          <TouchableOpacity
                            style={tw`mt-2 px-4 py-2 rounded-lg bg-rose-600 items-center justify-center`}
                            onPress={() => {
                              const reason = (cancelReasons[String(session.id)] || '').trim();
                              if (!reason) {
                                setCancelError((prev) => ({ ...prev, [String(session.id)]: true }));
                                return;
                              }
                              confirmCancelSession(String(session.id), role, session.status);
                            }}
                            activeOpacity={0.9}
                          >
                            <Text style={tw`text-white text-sm font-semibold`}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {session.status === 'accepted' && (
                        <>
                          <TouchableOpacity
                            style={tw`mt-3 px-4 py-2 rounded-lg bg-[#3d99f5] items-center justify-center`}
                            onPress={() =>
                              navigation.navigate('Messages', {
                                studentId: String(session.student_id),
                              })
                            }
                            activeOpacity={0.9}
                          >
                            <Text style={tw`text-white text-sm font-semibold`}>
                              Chat with Student
                            </Text>
                          </TouchableOpacity>

                          {!session.zoom_links?.length ? (
                            <TouchableOpacity
                              style={tw`mt-3 px-4 py-2 rounded-lg bg-amber-500 items-center justify-center`}
                              onPress={() =>
                                handleCreateZoomLink(
                                  String(session.id),
                                  session.subject || 'General',
                                  session.date,
                                  120,
                                  session.tutor_name || ''
                                )
                              }
                              activeOpacity={0.9}
                            >
                              <Text style={tw`text-white text-sm font-semibold`}>
                                Create Zoom Links
                              </Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={tw`mt-3`}>
                              <Text
                                style={tw`text-xs font-semibold text-emerald-600 dark:text-emerald-300 mb-1`}
                              >
                                Zoom Links:
                              </Text>
                              {session.zoom_links.map((link, i) => (
                                <TouchableOpacity
                                  key={String(i)}
                                  onPress={() => Linking.openURL(link)}
                                >
                                  <Text
                                    style={tw`text-xs text-[#3d99f5] dark:text-[#7fb5ff] underline`}
                                  >
                                    Join Meeting Part {i + 1}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}

                          <TouchableOpacity
                            style={tw`mt-3 px-4 py-2 rounded-lg bg-fuchsia-600 items-center justify-center`}
                            onPress={async () => {
                              await handleCompletePending(String(session.id));
                              await notifyNow(
                                'Lesson marked complete',
                                `You marked the lesson with ${session.student_name || 'the student'} as complete (awaiting confirmation).`,
                                { screen: 'Account', params: { tab: 'sessions' } }
                              );
                            }}
                            activeOpacity={0.9}
                          >
                            <Text style={tw`text-white text-sm font-semibold`}>
                              Mark as Complete-Pending
                            </Text>
                          </TouchableOpacity>
                        </>
                      )}

                      {session.status === 'completed_pending' && (
                        <Text
                          style={tw`mt-3 text-xs font-semibold text-fuchsia-500 dark:text-fuchsia-300`}
                        >
                          Complete-Pending
                        </Text>
                      )}
                      {session.status === 'completed' && (
                        <Text
                          style={tw`mt-3 text-xs font-semibold text-emerald-600 dark:text-emerald-300`}
                        >
                          Session Completed
                        </Text>
                      )}
                      {session.status === 'cancelled' && (
                        <Text style={tw`mt-3 text-xs text-rose-500 dark:text-rose-300`}>
                          Session Cancelled
                        </Text>
                      )}
                    </View>
                  ))
                ) : (
                  <Text style={tw`text-xs text-slate-600 dark:text-slate-400 text-center`}>
                    No upcoming sessions.
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Reviews (student) */}
          {activeTab === 'reviews' && role === 'student' && (
            <View style={sectionBase}>
              <Text style={tw`text-xl font-bold text-[#0d141c] dark:text-white mb-3`}>
                Post a Review
              </Text>

              <TextInput
                placeholder="Tutor ID"
                placeholderTextColor={placeholderColor}
                value={formData.tutorId}
                onChangeText={(t) => setFormData({ ...formData, tutorId: t })}
                style={tw.style(inputBase, tw`mb-3`)}
              />

              <TextInput
                placeholder="Comment"
                placeholderTextColor={placeholderColor}
                value={formData.comment}
                onChangeText={(t) => setFormData({ ...formData, comment: t })}
                style={tw.style(inputBase, tw`mb-3`)}
                multiline
              />

              <TextInput
                placeholder="Rating (1-5)"
                placeholderTextColor={placeholderColor}
                keyboardType="numeric"
                value={String(formData.rating ?? '')}
                onChangeText={(t) => setFormData({ ...formData, rating: t })}
                style={tw.style(inputBase, tw`mb-3`)}
              />

              <TouchableOpacity
                onPress={() => debouncedReviewSubmission()}
                style={tw`w-full py-3 rounded-xl bg-rose-600 items-center justify-center`}
                activeOpacity={0.9}
              >
                <Text style={tw`text-white text-sm font-semibold`}>Submit Review</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Earnings (tutor) */}
          {activeTab === 'earnings' && role === 'tutor' && (
            <View style={tw`space-y-4`}>
              {/* Summary Card */}
              <View style={tw`p-5 rounded-2xl bg-[#3d99f5]`}>
                <Text style={tw`text-xs text-white/90`}>Payout Currency</Text>
                <Text style={tw`mt-1 text-2xl font-extrabold text-white`}>{payoutCurrency}</Text>

                <View style={tw`mt-4 flex-row gap-3`}>
                  <View style={tw`flex-1`}>
                    <Text style={tw`text-[11px] text-white/90`}>Lifetime</Text>
                    <Text style={tw`text-lg font-bold text-white`}>
                      {currencyFmt(
                        earnings?.total ?? lifetimeByCurrency[payoutCurrency] ?? 0,
                        String(payoutCurrency)
                      )}
                    </Text>
                  </View>
                  <View style={tw`flex-1`}>
                    <Text style={tw`text-[11px] text-white/90`}>Pending</Text>
                    <Text style={tw`text-lg font-bold text-white`}>
                      {currencyFmt(
                        earnings?.pending ?? pendingWithdrawalsByCurrency[payoutCurrency] ?? 0,
                        String(payoutCurrency)
                      )}
                    </Text>
                  </View>
                </View>

                <Text style={tw`mt-3 text-[11px] text-white/90`}>
                  Available:{' '}
                  <Text style={tw`font-semibold`}>
                    {currencyFmt(earnings?.available ?? approxAvailable, String(payoutCurrency))}
                  </Text>
                </Text>
              </View>

              {/* Withdrawal Form */}
              <View style={sectionBase}>
                <Text style={tw`text-lg font-bold text-[#0d141c] dark:text-white`}>
                  Withdraw Earnings
                </Text>
                <Text style={helperText}>
                  Minimum: {currencyFmt(minAmount, String(payoutCurrency))} • Balance shown is an
                  approximation based on your transactions.
                </Text>

                <View style={tw`mt-4`}>
                  <View style={tw`flex-row gap-3`}>
                    <View style={tw`flex-1`}>
                      <Text style={helperText}>Currency</Text>
                      <TextInput
                        editable={false}
                        value={String(payoutCurrency)}
                        style={inputBase}
                      />
                    </View>
                    <View style={tw`flex-1`}>
                      <Text style={helperText}>Amount</Text>
                      <TextInput
                        keyboardType="decimal-pad"
                        placeholder={String(minAmount)}
                        placeholderTextColor={placeholderColor}
                        value={withdrawAmount}
                        onChangeText={setWithdrawAmount}
                        style={inputBase}
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    disabled={
                      isWithdrawing || !withdrawAmount || Number(withdrawAmount) < minAmount
                    }
                    onPress={async () => {
                      const amt = Number(withdrawAmount);
                      if (!Number.isFinite(amt) || amt < minAmount) return;

                      await withdraw({ currency: payoutCurrency, amount: amt });
                      setWithdrawAmount('');

                      await refetchTransactions();
                      await refetchAccount();
                      await refetchEarnings();

                      await notifyNow(
                        'Withdrawal requested',
                        `Your withdrawal request of ${currencyFmt(amt, String(payoutCurrency))} has been submitted.`,
                        { screen: 'Account', params: { tab: 'earnings' } }
                      );
                    }}
                    style={tw.style(
                      'mt-3 w-full py-3 rounded-xl items-center justify-center',
                      Number(withdrawAmount) >= minAmount && !isWithdrawing
                        ? 'bg-[#3d99f5]'
                        : 'bg-[#3d99f5] opacity-60'
                    )}
                    activeOpacity={0.9}
                  >
                    <Text style={tw`text-white text-sm font-semibold`}>
                      {isWithdrawing ? 'Submitting…' : 'Request Withdrawal'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Recent Earnings */}
              <View>
                <Text style={tw`text-xl font-bold text-[#0d141c] dark:text-white mb-3`}>
                  Recent Earnings
                </Text>

                {completedEarnings.length > 0 ? (
                  completedEarnings.slice(0, 10).map((tx) => (
                    <View
                      key={String(tx.id)}
                      style={tw`p-4 rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 mb-3`}
                    >
                      <Text style={helperText}>
                        <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
                          Amount:{' '}
                        </Text>
                        {currencyFmt(Number(tx.amount) || 0, String(tx.currency ?? payoutCurrency))}
                      </Text>
                      <Text style={helperText}>
                        <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>Date: </Text>
                        {new Date(tx.date).toLocaleDateString()}
                      </Text>
                      <Text style={helperText}>
                        <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
                          Description:{' '}
                        </Text>
                        {tx.description}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={helperText}>No earnings found.</Text>
                )}
              </View>

              {/* Withdrawal Activity */}
              <View>
                <Text style={tw`text-xl font-bold text-[#0d141c] dark:text-white mb-3`}>
                  Withdrawal Activity
                </Text>

                {transactions.filter((t) => t.type?.startsWith('Withdrawal')).length > 0 ? (
                  transactions
                    .filter((t) => t.type?.startsWith('Withdrawal'))
                    .slice(0, 10)
                    .map((tx) => (
                      <View
                        key={String(tx.id)}
                        style={tw`p-4 rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 mb-3`}
                      >
                        <Text style={helperText}>
                          <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
                            Type:{' '}
                          </Text>
                          {tx.type}
                        </Text>
                        <Text style={helperText}>
                          <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
                            Amount:{' '}
                          </Text>
                          {currencyFmt(
                            Math.abs(Number(tx.amount)),
                            String(tx.currency ?? payoutCurrency).toUpperCase()
                          )}
                        </Text>
                        <Text style={helperText}>
                          <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
                            Status:{' '}
                          </Text>
                          {tx.status || 'Pending'}
                        </Text>
                        <Text style={helperText}>
                          <Text style={tw`font-semibold text-[#0d141c] dark:text-white`}>
                            Date:{' '}
                          </Text>
                          {new Date(tx.date).toLocaleDateString()}
                        </Text>
                        {!!tx.description && <Text style={helperText}>{tx.description}</Text>}
                      </View>
                    ))
                ) : (
                  <Text style={helperText}>No withdrawal activity yet.</Text>
                )}
              </View>
            </View>
          )}
        </View>

        {/* Rating Modal */}
        <Modal
          visible={showRatingModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRatingModal(false)}
        >
          <View style={tw`absolute inset-0 bg-black/60 justify-center items-center`}>
            <View
              style={tw`w-11/12 max-w-md p-6 rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
            >
              <Text style={tw`text-xl font-bold text-[#0d141c] dark:text-white mb-4`}>
                Rate Your Tutor
              </Text>

              <View style={tw`mb-4`}>
                <Text style={helperText}>Rating (1–5)</Text>
                <TextInput
                  keyboardType="numeric"
                  value={ratingData.rating}
                  onChangeText={(v) => setRatingData({ ...ratingData, rating: v })}
                  placeholderTextColor={placeholderColor}
                  style={inputBase}
                />
              </View>

              <View style={tw`mb-4`}>
                <Text style={helperText}>Comment</Text>
                <TextInput
                  multiline
                  value={ratingData.comment}
                  onChangeText={(t) => setRatingData({ ...ratingData, comment: t })}
                  placeholder="Leave a comment (optional)…"
                  placeholderTextColor={placeholderColor}
                  style={tw.style(inputBase, tw`h-24`)}
                />
              </View>

              <View style={tw`flex-row justify-end`}>
                <TouchableOpacity
                  onPress={() => setShowRatingModal(false)}
                  style={tw`px-4 py-2 rounded-lg bg-slate-200 dark:bg-white/5 mr-2`}
                  activeOpacity={0.9}
                >
                  <Text style={tw`text-sm text-[#0d141c] dark:text-white`}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleReviewSubmission}
                  style={tw`px-4 py-2 rounded-lg bg-rose-600`}
                  activeOpacity={0.9}
                >
                  <Text style={tw`text-sm text-white font-semibold`}>Submit Rating</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </RefreshableScrollView>
    </SafeAreaView>
  );
};

export default AccountSectionNative;
