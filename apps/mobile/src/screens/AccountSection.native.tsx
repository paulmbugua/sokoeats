/// <reference path="../declarations.d.ts" />
import { useFocusEffect } from '@react-navigation/native';
import React, { useMemo, useEffect, useRef, useState,useCallback } from 'react';
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
import {
  useNavigation,
  useRoute,
  NavigationProp,
  RouteProp,
} from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Spinner from './Spinner.native';
import useAccountSection from '@mytutorapp/shared/hooks/useAccountSection';
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
import { Picker } from '@react-native-picker/picker';
import DateTimePicker, { Event } from '@react-native-community/datetimepicker';
import type { MainStackParamList, ActiveTab } from '../navigation/types';
import { useShopContext } from '@mytutorapp/shared/context';
import { notifyNow } from '../../utils/notifications';

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

  // pricing comes in as JSON -> coerce to Record<string, string>
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
    } catch {
      // ignore malformed pricing
    }
  }

  const rawTab = p.get('tab');
  const tab: ActiveTab | undefined = isActiveTab(rawTab) ? rawTab : undefined;

  return {
    action: (p.get('action') as 'createSession') || undefined,
    tutorId: p.get('tutorId') || undefined,
    tutorName: p.get('tutorName') || undefined,
    subject: p.get('subject') || undefined,
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

  // review modal data
  showRatingModal: boolean;
  setShowRatingModal: (b: boolean) => void;
  ratingData: { rating: string; comment: string };
  setRatingData: (v: { rating: string; comment: string }) => void;
};

// --- Session form validation types (web parity) -----------------------------

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
  const { backendUrl } = useShopContext();
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'Account'>>();

  // Track which session IDs have missing-reason errors (for red borders)
  const [cancelError, setCancelError] = useState<Record<string, boolean>>({});

  // 🔴 Session form validation state (web parity)
  const [sessionFormErrors, setSessionFormErrors] = useState<SessionFormErrors>({});
  const [sessionBanner, setSessionBanner] = useState<string>('');

  // Strongly-typed params alias (includes optional tab)
  const params: MainStackParamList['Account'] = route.params ?? {};

  // Build hook queryParams (web parity)
  const queryParams = useMemo(() => {
    const qp = new URLSearchParams();
    if (params.action) qp.set('action', params.action);
    if (params.tutorId) qp.set('tutorId', params.tutorId);
    if (params.tutorName) qp.set('tutorName', params.tutorName);
    if (params.subject) qp.set('subject', params.subject);
    if (params.pricing) qp.set('pricing', JSON.stringify(params.pricing));
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

  // Hook
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
    handleCancelSession,
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

  // Derive a safe role string without `any`
  const rawRole = (user as unknown as { role?: string } | undefined)?.role;
  const role: 'student' | 'tutor' | 'unknown' =
    rawRole === 'student' || rawRole === 'tutor' ? rawRole : 'unknown';

  // Withdrawal hook (web parity)
  const { withdraw, isSubmitting: isWithdrawing } = useWithdrawal({
    notify: (m, t) => {
      if (t === 'error') console.error(m);
      else console.log(m);
    },
  });

  // Totals by currency (derived from transactions)
  const { lifetimeByCurrency, pendingWithdrawalsByCurrency, completedEarnings } =
    useMemo(() => {
      const sums: Record<string, number> = {};
      const pending: Record<string, number> = {};
      const earningsTx: Transaction[] = [];

      for (const tx of transactions) {
        const curr = String(tx.currency ?? 'USD').toUpperCase();
        if (tx.type?.toLowerCase().includes('earning')) {
          sums[curr] = (sums[curr] || 0) + Math.max(0, Number(tx.amount) || 0);
          earningsTx.push(tx);
        }
        if (
          tx.type === 'Withdrawal Request' &&
          (tx.status || 'Pending') === 'Pending'
        ) {
          pending[curr] =
            (pending[curr] || 0) + Math.max(0, Number(tx.amount) || 0);
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
    (lifetimeByCurrency[payoutCurrency] || 0) -
      (pendingWithdrawalsByCurrency[payoutCurrency] || 0)
  );

  // 🔔 Track earnings increases → "New earnings" notification
  const earningsLastSeenRef = useRef<number | null>(null);
  useEffect(() => {
    const current = earnings?.available ?? approxAvailable;
    const prev = earningsLastSeenRef.current;

    if (prev != null && current > prev + 0.009) {
      void notifyNow(
        'New earnings available',
        `Your available earnings are now ${currencyFmt(
          current,
          String(payoutCurrency)
        )}.`,
        {
          screen: 'Account',
          params: { tab: 'earnings' },
        }
      );
    }

    earningsLastSeenRef.current = current;
  }, [earnings?.available, approxAvailable, payoutCurrency]);

  // Withdrawal form
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const minAmount = MIN_WITHDRAW[payoutCurrency];

  // Sync tab from params (web-style ?tab=)
  useEffect(() => {
    const desired = params.tab;
    if (desired && desired !== activeTab) {
      setActiveTab(desired);
    }
  }, [params.tab, activeTab, setActiveTab]);

  // Debounce review submission
  const debouncedReviewSubmission = useMemo(
    () => debounce(handleReviewSubmission, 300),
    [handleReviewSubmission]
  );
  useEffect(
    () => () => debouncedReviewSubmission.cancel(),
    [debouncedReviewSubmission]
  );

  
  useFocusEffect(
  useCallback(() => {
    if (activeTab === 'earnings') {
      refetchTransactions();
      refetchAccount();
      refetchEarnings();
    }
  }, [activeTab, refetchTransactions, refetchAccount, refetchEarnings])
);

  // Sort sessions by date
  const sortedSessions = useMemo(
    () =>
      [...sessions].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      ),
    [sessions]
  );

  // 🔔 Track session status transitions → notify tutor when lesson becomes completed
  const previousSessionStatusRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    if (!Array.isArray(sessions)) return;

    const prevMap = previousSessionStatusRef.current;
    const nextMap = new Map<string, string>();

    for (const s of sessions) {
      const id = String(s.id);
      const prevStatus = prevMap.get(id);
      const currentStatus = s.status;

      if (
        role === 'tutor' &&
        prevStatus &&
        prevStatus !== 'completed' &&
        currentStatus === 'completed'
      ) {
        const counterpartName = s.student_name || 'your student';

        void notifyNow(
          'Lesson completed',
          `Your lesson with ${counterpartName} is now marked as completed.`,
          {
            screen: 'Account',
            params: { tab: 'sessions' },
          }
        );
      }

      nextMap.set(id, currentStatus);
    }

    previousSessionStatusRef.current = nextMap;
  }, [sessions, role]);

  // Scroll-to-new-session logic
  const sessionsScrollRef = useRef<ScrollView>(null);
  const [justCreated, setJustCreated] = useState(false);

  useEffect(() => {
    if (!justCreated) return;
    if (activeTab !== 'sessions') {
      setActiveTab('sessions');
      return;
    }
    const t = setTimeout(() => {
      sessionsScrollRef.current?.scrollToEnd({ animated: true });
      setJustCreated(false);
    }, 50);
    return () => clearTimeout(t);
  }, [justCreated, activeTab, setActiveTab]);

  // 🔒 Date picker state must be above any early returns
  const [showDatePicker, setShowDatePicker] = useState(false);
  const dateValue = formData.date ? new Date(String(formData.date)) : new Date();

  // ✅ Theme-responsive loading state
  if (loading) {
    return (
      <SafeAreaView
        style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}
        edges={['top', 'bottom']}
      >
        <View style={tw`flex-1 justify-center items-center`}>
          <Spinner />
        </View>
      </SafeAreaView>
    );
  }

  // Tabs to show for the current role
  const availableTabs: ActiveTab[] = [
    'overview',
    'transactions',
    ...(role === 'student' || role === 'tutor' ? (['sessions'] as const) : []),
    ...(role === 'student' ? (['reviews'] as const) : []),
    ...(role === 'tutor' ? (['earnings'] as const) : []),
  ];

  // --- Session form validate (native version of web's validateSessionForm) ----
  const validateSessionForm = (): boolean => {
    const errs: SessionFormErrors = {};

    if (!formData.tutorId) {
      errs.tutorId =
        'Choose a tutor by visiting their profile and tapping "Create Session".';
    }
    if (!formData.subject?.trim()) {
      errs.subject = 'Enter the subject or topic for this session.';
    }
    if (!formData.sessionType) {
      errs.sessionType = 'Select a session type.';
    }
    if (!formData.date) {
      errs.date = 'Pick a preferred date for the session.';
    }

    setSessionFormErrors(errs);
    setSessionBanner(buildSessionBannerFromErrors(errs));

    return Object.keys(errs).length === 0;
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView
      style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}
      edges={['top', 'bottom']}
    >
      <View style={tw`flex-1 px-4 pb-6`}>
        {/* Header */}
        <View
          style={tw`mt-4 rounded-2xl p-4 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 flex-row items-center`}
        >
          {role !== 'student' && (
            <Image
              source={{
                uri: user?.profileImage
                  ? user.profileImage.startsWith('http')
                    ? user.profileImage
                    : `${backendUrl}${user.profileImage}`
                  : 'https://ui-avatars.com/api/?name=Tutor&background=e7edf4&color=0d141c',
              }}
              style={tw`w-16 h-16 rounded-full mr-4 bg-[#e7edf4] dark:bg:white/5`}
            />
          )}
          <View style={tw`flex-1`}>
            <Text style={tw`text-[20px] font-extrabold text-slate-900 dark:text-white`}>
              {user?.name || 'User Name'}
            </Text>
            <Text style={tw`text-xs text-[#49739c] dark:text:white/70 mt-0.5`}>
              {user?.email ?? ''}
            </Text>
            {role === 'student' && (
              <Text style={tw`text-xs text-[#49739c] dark:text:white/70 mt-1`}>
                Tokens:{' '}
                <Text style={tw`font-semibold text-slate-900 dark:text:white`}>
                  {user.tokens ?? 0}
                </Text>
              </Text>
            )}
          </View>
        </View>

        {/* Tabs */}
        <View
          style={tw`flex-row flex-wrap gap-2 mt-4 border-b border-[#cedbe8] dark:border-white/10 pb-2`}
          accessibilityRole="tablist"
        >
          {availableTabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                onPress={() => setActiveTab(tab)}
                style={tw.style(
                  'px-3 py-2 rounded-xl',
                  isActive ? 'bg-[#3d99f5]' : 'bg-[#e7edf4] dark:bg-[#172534]'
                )}
              >
                <Text
                  style={tw.style(
                    'text-xs font-semibold',
                    isActive ? 'text-white' : 'text-[#0d141c] dark:text:white/80'
                  )}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Content */}
        <ScrollView
          style={tw`mt-4 flex-1`}
          contentContainerStyle={tw`pb-12`}
          showsVerticalScrollIndicator={false}
        >
          {/* Overview */}
          {activeTab === 'overview' && (
            <View
              style={tw`rounded-2xl p-4 bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
            >
              <Text
                style={tw`text-base text-[#49739c] dark:text:white/70 text-center`}
              >
                Welcome to your account overview.
              </Text>
            </View>
          )}

          {/* Transactions */}
          {activeTab === 'transactions' && (
            <View>
              <Text
                style={tw`text-xl font-bold text-slate-900 dark:text:white mb-3`}
              >
                Transaction History
              </Text>
              {transactions.length > 0 ? (
                transactions.map((tx) => (
                  <View
                    key={String(tx.id)}
                    style={tw`p-4 rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 mb-3`}
                  >
                    <View style={tw`flex-row flex-wrap`}>
                      <View style={tw`w-full mb-1`}>
                        <Text
                          style={tw`text-xs text-[#49739c] dark:text:white/70`}
                        >
                          <Text
                            style={tw`font-semibold text-slate-900 dark:text:white`}
                          >
                            Type:{' '}
                          </Text>
                          {tx.type}
                        </Text>
                      </View>
                      <View style={tw`w-full mb-1`}>
                        <Text
                          style={tw`text-xs text-[#49739c] dark:text:white/70`}
                        >
                          <Text
                            style={tw`font-semibold text-slate-900 dark:text:white`}
                          >
                            Amount:{' '}
                          </Text>
                          {currencyFmt(
                            Math.abs(Number(tx.amount)),
                            String(tx.currency ?? 'USD').toUpperCase()
                          )}
                        </Text>
                      </View>
                      <View style={tw`w-full mb-1`}>
                        <Text
                          style={tw`text-xs text-[#49739c] dark:text:white/70`}
                        >
                          <Text
                            style={tw`font-semibold text-slate-900 dark:text:white`}
                          >
                            Kind:{' '}
                          </Text>
                          {Number(tx.amount) > 0 ? 'Earning' : 'Deduction'}
                        </Text>
                      </View>
                      <View style={tw`w-full mb-1`}>
                        <Text
                          style={tw`text-xs text-[#49739c] dark:text:white/70`}
                        >
                          <Text
                            style={tw`font-semibold text-slate-900 dark:text:white`}
                          >
                            Status:{' '}
                          </Text>
                          {tx.status || 'N/A'}
                        </Text>
                      </View>
                      <View style={tw`w-full mb-1`}>
                        <Text
                          style={tw`text-xs text-[#49739c] dark:text:white/70`}
                        >
                          <Text
                            style={tw`font-semibold text-slate-900 dark:text:white`}
                          >
                            Description:{' '}
                          </Text>
                          {tx.description || 'N/A'}
                        </Text>
                      </View>
                      <View style={tw`w-full mb-1`}>
                        <Text
                          style={tw`text-xs text-[#49739c] dark:text:white/70`}
                        >
                          <Text
                            style={tw`font-semibold text-slate-900 dark:text:white`}
                          >
                            Date:{' '}
                          </Text>
                          {new Date(tx.date).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={tw`text-xs text-[#49739c] dark:text:white/70`}>
                  No transactions found.
                </Text>
              )}
            </View>
          )}

          {/* Student Sessions */}
          {activeTab === 'sessions' && role === 'student' && (
            <>
              {/* Create Session Form */}
              <View
                style={tw`max-w-[680px] self-center w-full p-4 rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 mb-4`}
              >
                {/* Top error banner (web parity) */}
                {!!sessionBanner && (
                  <View
                    style={tw`mb-3 rounded-lg border border-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-2`}
                  >
                    <Text style={tw`text-xs text-red-800 dark:text-red-100`}>
                      {sessionBanner}
                    </Text>
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
                    <Text
                      style={tw`text-xs text-amber-800 dark:text-amber-100`}
                    >
                      To create a session, visit a tutor’s profile and tap
                      “Create Session.”
                    </Text>
                    {sessionFormErrors.tutorId && (
                      <Text
                        style={tw`mt-1 text-[11px] text-red-700 dark:text-red-200`}
                      >
                        {sessionFormErrors.tutorId}
                      </Text>
                    )}
                  </View>
                )}
                <Text
                  style={tw`text-lg font-bold text-slate-900 dark:text:white mb-3`}
                >
                  {formData.tutorName
                    ? `Session with ${formData.tutorName}`
                    : 'Create a Session'}
                </Text>

                {/* Subject */}
                <TextInput
                  placeholder="Subject"
                  placeholderTextColor="#93a3b0"
                  value={formData.subject}
                  onChangeText={(t) => {
                    setFormData({ ...formData, subject: t });
                    if (sessionFormErrors.subject) {
                      const { subject, ...rest } = sessionFormErrors;
                      setSessionFormErrors(rest);
                    }
                  }}
                  style={tw.style(
                    'w-full p-3 rounded-xl text-slate-900 dark:text:white bg-[#e7edf4] dark:bg-[#172534] border mb-1',
                    sessionFormErrors.subject
                      ? 'border-red-500'
                      : 'border-[#cedbe8] dark:border-white/10'
                  )}
                />
                {sessionFormErrors.subject && (
                  <Text
                    style={tw`mb-2 text-[11px] text-red-600 dark:text-red-400`}
                  >
                    {sessionFormErrors.subject}
                  </Text>
                )}

                {/* Session Type (from pricing map) */}
                <View
                  style={tw.style(
                    'bg-[#e7edf4] dark:bg-[#172534] border rounded-xl mb-1 overflow-hidden',
                    sessionFormErrors.sessionType
                      ? 'border-red-500'
                      : 'border-[#cedbe8] dark:border-white/10'
                  )}
                >
                  <Picker
                    selectedValue={formData.sessionType || ''}
                    onValueChange={(sessionType: string) => {
                      const sessionCost = String(
                        (formData.pricing as Record<string, number | string>)?.[
                          sessionType
                        ] ?? 0
                      );
                      setFormData({ ...formData, sessionType, sessionCost });
                      if (sessionFormErrors.sessionType) {
                        const { sessionType: _st, ...rest } = sessionFormErrors;
                        setSessionFormErrors(rest);
                      }
                    }}
                    dropdownIconColor="#64748b"
                    style={tw`text-slate-900 dark:text:white`}
                  >
                    <Picker.Item label="Select Session Type" value="" />
                    {formData.pricing &&
                      Object.entries(formData.pricing).map(([type, price]) => (
                        <Picker.Item
                          key={type}
                          label={`${type.charAt(0).toUpperCase() + type.slice(1)} – ${price} Tokens`}
                          value={type}
                        />
                      ))}
                  </Picker>
                </View>
                {sessionFormErrors.sessionType && (
                  <Text
                    style={tw`mb-2 text-[11px] text-red-600 dark:text-red-400`}
                  >
                    {sessionFormErrors.sessionType}
                  </Text>
                )}

                {/* Date */}
                <TouchableOpacity
                  onPress={() => setShowDatePicker(true)}
                  style={tw.style(
                    'bg-[#e7edf4] dark:bg-[#172534] border rounded-xl p-3',
                    sessionFormErrors.date
                      ? 'border-red-500'
                      : 'border-[#cedbe8] dark:border-white/10'
                  )}
                >
                  <Text style={tw`text-sm text-slate-900 dark:text:white`}>
                    {formData.date || 'Select date'}
                  </Text>
                </TouchableOpacity>
                {sessionFormErrors.date && (
                  <Text
                    style={tw`mt-1 mb-2 text-[11px] text-red-600 dark:text-red-400`}
                  >
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
                        setFormData({
                          ...formData,
                          date: d.toISOString().slice(0, 10),
                        });
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
                    // reset previous errors/banner
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
                      {
                        screen: 'Account',
                        params: { tab: 'sessions' },
                      }
                    );
                  }}
                  style={tw`mt-4 py-3 rounded-xl bg-[#3d99f5] items-center justify-center`}
                >
                  <Text style={tw`text-white text-sm font-semibold`}>
                    Create Session
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Sessions list */}
              <ScrollView
                ref={sessionsScrollRef}
                style={tw`max-w-[880px] self-center w-full`}
                contentContainerStyle={tw`p-0`}
              >
                <View
                  style={tw`p-4 rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
                >
                  <Text
                    style={tw`text-xl font-bold text-slate-900 dark:text:white mb-2`}
                  >
                    Your Sessions
                  </Text>
                  {sortedSessions.length > 0 ? (
                    sortedSessions.map((session) => (
                      <View
                        key={String(session.id)}
                        style={tw`p-4 rounded-xl bg-[#e7edf4] dark:bg-[#0b1620] border border-[#cedbe8] dark:border-white/10 mb-3`}
                      >
                        <View style={tw`flex-row flex-wrap`}>
                          <View style={tw`w-full mb-1`}>
                            <Text
                              style={tw`text-xs text-[#49739c] dark:text:white/70`}
                            >
                              <Text
                                style={tw`font-semibold text-slate-900 dark:text:white`}
                              >
                                Tutor:{' '}
                              </Text>
                              {session.tutor_name || 'N/A'}
                            </Text>
                          </View>
                          <View style={tw`w-full mb-1`}>
                            <Text
                              style={tw`text-xs text-[#49739c] dark:text:white/70`}
                            >
                              <Text
                                style={tw`font-semibold text-slate-900 dark:text:white`}
                              >
                                Type:{' '}
                              </Text>
                              {session.sessionType || 'N/A'}
                            </Text>
                          </View>
                          <View style={tw`w-full mb-1`}>
                            <Text
                              style={tw`text-xs text-[#49739c] dark:text:white/70`}
                            >
                              <Text
                                style={tw`font-semibold text-slate-900 dark:text:white`}
                              >
                                Subject:{' '}
                              </Text>
                              {session.subject || 'N/A'}
                            </Text>
                          </View>
                          <View style={tw`w-full mb-1`}>
                            <Text
                              style={tw`text-xs text-[#49739c] dark:text:white/70`}
                            >
                              <Text
                                style={tw`font-semibold text-slate-900 dark:text:white`}
                              >
                                Cost:{' '}
                              </Text>
                              {session.amount} tokens
                            </Text>
                          </View>
                          <View style={tw`w-full mb-1`}>
                            <Text
                              style={tw`text-xs text-[#49739c] dark:text:white/70`}
                            >
                              <Text
                                style={tw`font-semibold text-slate-900 dark:text:white`}
                              >
                                Date:{' '}
                              </Text>
                              {new Date(session.date).toLocaleDateString()}
                            </Text>
                          </View>
                          <View style={tw`w-full mb-1`}>
                            <Text
                              style={tw`text-xs text-[#49739c] dark:text:white/70`}
                            >
                              <Text
                                style={tw`font-semibold text-slate-900 dark:text:white`}
                              >
                                Status:{' '}
                              </Text>
                              {session.status.charAt(0).toUpperCase() +
                                session.status.slice(1)}
                            </Text>
                          </View>
                        </View>

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
                                style={tw`mt-3 text-xs text-[#49739c] dark:text:white/70 italic`}
                              >
                                Please wait for the tutor to create Zoom links.
                              </Text>
                            )}

                            {/* Reason + Cancel */}
                            <TextInput
                              placeholder="Reason for cancellation"
                              placeholderTextColor="#93a3b0"
                              value={cancelReasons[String(session.id)] || ''}
                              onChangeText={(t) => {
                                setCancelError((prev) => ({
                                  ...prev,
                                  [String(session.id)]: false,
                                }));
                                handleCancelReasonChange(String(session.id), t);
                              }}
                              style={tw.style(
                                'mt-3 w-full p-3 rounded-xl text-slate-900 dark:text:white bg-white dark:bg-[#0f1821] border',
                                cancelError[String(session.id)]
                                  ? 'border-red-500'
                                  : 'border-[#cedbe8] dark:border-white/10'
                              )}
                              multiline
                            />
                            <TouchableOpacity
                              style={tw`mt-3 px-4 py-2 rounded-lg bg-rose-600 items-center justify-center`}
                              onPress={() => {
                                const reason =
                                  (cancelReasons[String(session.id)] || '').trim();
                                if (!reason) {
                                  setCancelError((prev) => ({
                                    ...prev,
                                    [String(session.id)]: true,
                                  }));
                                  return;
                                }
                                // role is 'student' here
                                confirmCancelSession(
                                  String(session.id),
                                  role,
                                  session.status
                                );
                              }}
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
                                `You confirmed your lesson with ${
                                  session.tutor_name || 'your tutor'
                                } as completed.`,
                                {
                                  screen: 'Account',
                                  params: { tab: 'sessions' },
                                }
                              );
                            }}
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
                          <Text
                            style={tw`mt-3 text-xs text-rose-500 dark:text-rose-300`}
                          >
                            Session Cancelled
                          </Text>
                        )}
                      </View>
                    ))
                  ) : (
                    <Text
                      style={tw`text-xs text-[#49739c] dark:text:white/70 text-center`}
                    >
                      No sessions yet.
                    </Text>
                  )}
                </View>
              </ScrollView>
            </>
          )}

          {/* Tutor Sessions */}
          {activeTab === 'sessions' && role === 'tutor' && (
            <ScrollView
              ref={sessionsScrollRef}
              style={tw`max-w-[880px] self-center w-full`}
              contentContainerStyle={tw`p-0`}
            >
              <View
                style={tw`p-4 rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
              >
                <Text
                  style={tw`text-xl font-bold text-slate-900 dark:text:white mb-2`}
                >
                  Your Upcoming Sessions
                </Text>
                {sortedSessions.length > 0 ? (
                  sortedSessions.map((session) => (
                    <View
                      key={String(session.id)}
                      style={tw`p-4 rounded-xl bg-[#e7edf4] dark:bg-[#0b1620] border border-[#cedbe8] dark:border-white/10 mb-3`}
                    >
                      <View style={tw`flex-row flex-wrap`}>
                        <View style={tw`w-full mb-1`}>
                          <Text
                            style={tw`text-xs text-[#49739c] dark:text:white/70`}
                          >
                            <Text
                              style={tw`font-semibold text-slate-900 dark:text:white`}
                            >
                              Student:{' '}
                            </Text>
                            {session.student_name || 'N/A'}
                          </Text>
                        </View>
                        <View style={tw`w-full mb-1`}>
                          <Text
                            style={tw`text-xs text-[#49739c] dark:text:white/70`}
                          >
                            <Text
                              style={tw`font-semibold text-slate-900 dark:text:white`}
                            >
                              Type:{' '}
                            </Text>
                            {session.sessionType || 'N/A'}
                          </Text>
                        </View>
                        <View style={tw`w-full mb-1`}>
                          <Text
                            style={tw`text-xs text-[#49739c] dark:text:white/70`}
                          >
                            <Text
                              style={tw`font-semibold text-slate-900 dark:text:white`}
                            >
                              Date:{' '}
                            </Text>
                            {new Date(session.date).toLocaleDateString()}
                          </Text>
                        </View>
                      </View>

                      {session.status === 'upcoming' && (
                        <View style={tw`mt-3`}>
                          <TouchableOpacity
                            style={tw`px-4 py-2 rounded-lg bg-emerald-600 items-center justify-center mb-2`}
                            onPress={async () => {
                              await handleAcceptSession(String(session.id));
                              await notifyNow(
                                'Lesson accepted',
                                `You accepted a lesson with ${
                                  session.student_name || 'the student'
                                }.`,
                                {
                                  screen: 'Account',
                                  params: { tab: 'sessions' },
                                }
                              );
                            }}
                          >
                            <Text style={tw`text-white text-sm font-semibold`}>
                              Accept
                            </Text>
                          </TouchableOpacity>

                          <TextInput
                            placeholder="Reason for cancellation"
                            placeholderTextColor="#93a3b0"
                            value={cancelReasons[String(session.id)] || ''}
                            onChangeText={(t) => {
                              setCancelError((prev) => ({
                                ...prev,
                                [String(session.id)]: false,
                              }));
                              handleCancelReasonChange(String(session.id), t);
                            }}
                            style={tw.style(
                              'min-h-[42px] p-3 rounded-xl text-slate-900 dark:text:white bg-white dark:bg-[#0f1821] border',
                              cancelError[String(session.id)]
                                ? 'border-red-500'
                                : 'border-[#cedbe8] dark:border-white/10'
                            )}
                            multiline
                          />

                          <TouchableOpacity
                            style={tw`mt-2 px-4 py-2 rounded-lg bg-rose-600 items-center justify-center`}
                            onPress={() => {
                              const reason =
                                (cancelReasons[String(session.id)] || '').trim();
                              if (!reason) {
                                setCancelError((prev) => ({
                                  ...prev,
                                  [String(session.id)]: true,
                                }));
                                return;
                              }
                              confirmCancelSession(
                                String(session.id),
                                role,
                                session.status
                              );
                            }}
                          >
                            <Text style={tw`text-white text-sm font-semibold`}>
                              Cancel
                            </Text>
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
                                `You marked the lesson with ${
                                  session.student_name || 'the student'
                                } as complete (awaiting confirmation).`,
                                {
                                  screen: 'Account',
                                  params: { tab: 'sessions' },
                                }
                              );
                            }}
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
                        <Text
                          style={tw`mt-3 text-xs text-rose-500 dark:text-rose-300`}
                        >
                          Session Cancelled
                        </Text>
                      )}
                    </View>
                  ))
                ) : (
                  <Text
                    style={tw`text-xs text-[#49739c] dark:text:white/70 text-center`}
                  >
                    No upcoming sessions.
                  </Text>
                )}
              </View>
            </ScrollView>
          )}

          {/* Reviews (student) */}
          {activeTab === 'reviews' && role === 'student' && (
            <View
              style={tw`p-4 rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
            >
              <Text
                style={tw`text-xl font-bold text-slate-900 dark:text:white mb-3`}
              >
                Post a Review
              </Text>

              <TextInput
                placeholder="Tutor ID"
                placeholderTextColor="#93a3b0"
                value={formData.tutorId}
                onChangeText={(t) => setFormData({ ...formData, tutorId: t })}
                style={tw`w-full p-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] border border-[#cedbe8] dark:border-white/10 text-slate-900 dark:text:white mb-3`}
              />

              <TextInput
                placeholder="Comment"
                placeholderTextColor="#93a3b0"
                value={formData.comment}
                onChangeText={(t) => setFormData({ ...formData, comment: t })}
                style={tw`w-full p-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] border border-[#cedbe8] dark:border-white/10 text-slate-900 dark:text:white mb-3`}
                multiline
              />

              <TextInput
                placeholder="Rating (1-5)"
                placeholderTextColor="#93a3b0"
                keyboardType="numeric"
                value={String(formData.rating ?? '')}
                onChangeText={(t) => setFormData({ ...formData, rating: t })}
                style={tw`w-full p-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] border border-[#cedbe8] dark:border-white/10 text-slate-900 dark:text:white mb-3`}
              />

              <TouchableOpacity
                onPress={() => debouncedReviewSubmission()}
                style={tw`w-full py-3 rounded-xl bg-rose-600 items-center justify-center`}
              >
                <Text style={tw`text-white text-sm font-semibold`}>
                  Submit Review
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Earnings (tutor) */}
          {activeTab === 'earnings' && role === 'tutor' && (
            <View style={tw`space-y-4`}>
              {/* Summary Card */}
              <View style={tw`p-5 rounded-2xl bg-[#3d99f5]`}>
                <Text style={tw`text-xs text-white/90`}>Payout Currency</Text>
                <Text style={tw`mt-1 text-2xl font-extrabold text-white`}>
                  {payoutCurrency}
                </Text>
                <View style={tw`mt-4 flex-row gap-3`}>
                  <View style={tw`flex-1`}>
                    <Text style={tw`text-[11px] text-white/90`}>Lifetime</Text>
                    <Text style={tw`text-lg font-bold text-white`}>
                      {currencyFmt(
                        earnings?.total ??
                          lifetimeByCurrency[payoutCurrency] ??
                          0,
                        String(payoutCurrency)
                      )}
                    </Text>
                  </View>
                  <View style={tw`flex-1`}>
                    <Text style={tw`text-[11px] text-white/90`}>Pending</Text>
                    <Text style={tw`text-lg font-bold text-white`}>
                      {currencyFmt(
                        earnings?.pending ??
                          pendingWithdrawalsByCurrency[payoutCurrency] ??
                          0,
                        String(payoutCurrency)
                      )}
                    </Text>
                  </View>
                </View>
                <Text style={tw`mt-3 text-[11px] text-white/90`}>
                  Available:{' '}
                  <Text style={tw`font-semibold`}>
                    {currencyFmt(
                      earnings?.available ?? approxAvailable,
                      String(payoutCurrency)
                    )}
                  </Text>
                </Text>
              </View>

              {/* Withdrawal Form */}
              <View
                style={tw`p-5 rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
              >
                <Text
                  style={tw`text-lg font-bold text-slate-900 dark:text:white`}
                >
                  Withdraw Earnings
                </Text>
                <Text
                  style={tw`mt-1 text-[11px] text-[#49739c] dark:text:white/70`}
                >
                  Minimum:{' '}
                  {currencyFmt(minAmount, String(payoutCurrency))} • Balance
                  shown is an approximation based on your transactions.
                </Text>

                <View style={tw`mt-4`}>
                  <View style={tw`flex-row gap-3`}>
                    <View style={tw`flex-1`}>
                      <Text
                        style={tw`text-[11px] text-[#49739c] dark:text:white/70 mb-1`}
                      >
                        Currency
                      </Text>
                      <TextInput
                        editable={false}
                        value={String(payoutCurrency)}
                        style={tw`w-full p-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] border border-[#cedbe8] dark:border-white/10 text-slate-900 dark:text:white`}
                      />
                    </View>
                    <View style={tw`flex-1`}>
                      <Text
                        style={tw`text-[11px] text-[#49739c] dark:text:white/70 mb-1`}
                      >
                        Amount
                      </Text>
                      <TextInput
                        keyboardType="decimal-pad"
                        placeholder={String(minAmount)}
                        placeholderTextColor="#93a3b0"
                        value={withdrawAmount}
                        onChangeText={setWithdrawAmount}
                        style={tw`w-full p-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] border border-[#cedbe8] dark:border-white/10 text-slate-900 dark:text:white`}
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    disabled={
                      isWithdrawing ||
                      !withdrawAmount ||
                      Number(withdrawAmount) < minAmount
                    }
                    onPress={async () => {
                      const amt = Number(withdrawAmount);
                      if (!Number.isFinite(amt) || amt < minAmount) return;
                      await withdraw({
                        currency: payoutCurrency,
                        amount: amt,
                      });
                      setWithdrawAmount('');
                      await refetchTransactions();
                      await refetchAccount();
                      await refetchEarnings();
                      await notifyNow(
                        'Withdrawal requested',
                        `Your withdrawal request of ${currencyFmt(
                          amt,
                          String(payoutCurrency)
                        )} has been submitted.`,
                        {
                          screen: 'Account',
                          params: { tab: 'earnings' },
                        }
                      );
                    }}
                    style={tw.style(
                      'mt-3 w-full py-3 rounded-xl items-center justify-center',
                      Number(withdrawAmount) >= minAmount && !isWithdrawing
                        ? 'bg-[#3d99f5]'
                        : 'bg-[#3d99f5] opacity-60'
                    )}
                  >
                    <Text style={tw`text-white text-sm font-semibold`}>
                      {isWithdrawing ? 'Submitting…' : 'Request Withdrawal'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Recent Earnings */}
              <View>
                <Text
                  style={tw`text-xl font-bold text-slate-900 dark:text:white mb-3`}
                >
                  Recent Earnings
                </Text>
                {completedEarnings.length > 0 ? (
                  completedEarnings.slice(0, 10).map((tx) => (
                    <View
                      key={String(tx.id)}
                      style={tw`p-4 rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 mb-3`}
                    >
                      <View style={tw`flex-row flex-wrap`}>
                        <View style={tw`w-full mb-1`}>
                          <Text
                            style={tw`text-xs text-[#49739c] dark:text:white/70`}
                          >
                            <Text
                              style={tw`font-semibold text-slate-900 dark:text:white`}
                            >
                              Amount:{' '}
                            </Text>
                            {currencyFmt(
                              Number(tx.amount) || 0,
                              String(tx.currency ?? payoutCurrency)
                            )}
                          </Text>
                        </View>
                        <View style={tw`w-full mb-1`}>
                          <Text
                            style={tw`text-xs text-[#49739c] dark:text:white/70`}
                          >
                            <Text
                              style={tw`font-semibold text-slate-900 dark:text:white`}
                            >
                              Date:{' '}
                            </Text>
                            {new Date(tx.date).toLocaleDateString()}
                          </Text>
                        </View>
                        <View style={tw`w-full mb-1`}>
                          <Text
                            style={tw`text-xs text-[#49739c] dark:text:white/70`}
                          >
                            <Text
                              style={tw`font-semibold text-slate-900 dark:text:white`}
                            >
                              Description:{' '}
                            </Text>
                            {tx.description}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={tw`text-xs text-[#49739c] dark:text:white/70`}>
                    No earnings found.
                  </Text>
                )}
              </View>

              {/* Withdrawal Activity */}
              <View>
                <Text
                  style={tw`text-xl font-bold text-slate-900 dark:text:white mb-3`}
                >
                  Withdrawal Activity
                </Text>
                {transactions.filter((t) => t.type?.startsWith('Withdrawal'))
                  .length > 0 ? (
                  transactions
                    .filter((t) => t.type?.startsWith('Withdrawal'))
                    .slice(0, 10)
                    .map((tx) => (
                      <View
                        key={String(tx.id)}
                        style={tw`p-4 rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 mb-3`}
                      >
                        <View style={tw`flex-row flex-wrap`}>
                          <View style={tw`w-full mb-1`}>
                            <Text
                              style={tw`text-xs text-[#49739c] dark:text:white/70`}
                            >
                              <Text
                                style={tw`font-semibold text-slate-900 dark:text:white`}
                              >
                                Type:{' '}
                              </Text>
                              {tx.type}
                            </Text>
                          </View>
                          <View style={tw`w-full mb-1`}>
                            <Text
                              style={tw`text-xs text-[#49739c] dark:text:white/70`}
                            >
                              <Text
                                style={tw`font-semibold text-slate-900 dark:text:white`}
                              >
                                Amount:{' '}
                              </Text>
                              {currencyFmt(
                                Math.abs(Number(tx.amount)),
                                String(
                                  tx.currency ?? payoutCurrency
                                ).toUpperCase()
                              )}
                            </Text>
                          </View>
                          <View style={tw`w-full mb-1`}>
                            <Text
                              style={tw`text-xs text-[#49739c] dark:text:white/70`}
                            >
                              <Text
                                style={tw`font-semibold text-slate-900 dark:text:white`}
                              >
                                Status:{' '}
                              </Text>
                              {tx.status || 'Pending'}
                            </Text>
                          </View>
                          <View style={tw`w-full mb-1`}>
                            <Text
                              style={tw`text-xs text-[#49739c] dark:text:white/70`}
                            >
                              <Text
                                style={tw`font-semibold text-slate-900 dark:text:white`}
                              >
                                Date:{' '}
                              </Text>
                              {new Date(tx.date).toLocaleDateString()}
                            </Text>
                          </View>
                        </View>
                        {tx.description ? (
                          <Text
                            style={tw`mt-1 text-xs text-[#49739c] dark:text:white/70`}
                          >
                            {tx.description}
                          </Text>
                        ) : null}
                      </View>
                    ))
                ) : (
                  <Text style={tw`text-xs text-[#49739c] dark:text:white/70`}>
                    No withdrawal activity yet.
                  </Text>
                )}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Rating Modal */}
        <Modal
          visible={showRatingModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRatingModal(false)}
        >
          <View
            style={tw`absolute inset-0 bg-black/60 justify-center items-center`}
          >
            <View
              style={tw`w-11/12 max-w-md p-6 rounded-2xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`}
            >
              <Text
                style={tw`text-xl font-bold text-slate-900 dark:text:white mb-4`}
              >
                Rate Your Tutor
              </Text>

              <View style={tw`mb-4`}>
                <Text
                  style={tw`text-xs text-[#49739c] dark:text:white/70 mb-1`}
                >
                  Rating (1–5)
                </Text>
                <TextInput
                  keyboardType="numeric"
                  value={ratingData.rating}
                  onChangeText={(v) =>
                    setRatingData({ ...ratingData, rating: v })
                  }
                  style={tw`w-full p-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] border border-[#cedbe8] dark:border-white/10 text-slate-900 dark:text:white`}
                />
              </View>

              <View style={tw`mb-4`}>
                <Text
                  style={tw`text-xs text-[#49739c] dark:text:white/70 mb-1`}
                >
                  Comment
                </Text>
                <TextInput
                  multiline
                  value={ratingData.comment}
                  onChangeText={(t) =>
                    setRatingData({ ...ratingData, comment: t })
                  }
                  placeholder="Leave a comment (optional)…"
                  placeholderTextColor="#93a3b0"
                  style={tw`h-24 w-full p-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] border border-[#cedbe8] dark:border-white/10 text-slate-900 dark:text:white`}
                />
              </View>

              <View style={tw`flex-row justify-end`}>
                <TouchableOpacity
                  onPress={() => setShowRatingModal(false)}
                  style={tw`px-4 py-2 rounded-lg bg-[#e7edf4] dark:bg-[#172534] mr-2`}
                >
                  <Text style={tw`text-sm text-[#0d141c] dark:text:white`}>
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleReviewSubmission}
                  style={tw`px-4 py-2 rounded-lg bg-rose-600`}
                >
                  <Text style={tw`text-sm text-white font-semibold`}>
                    Submit Rating
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
};

export default AccountSectionNative;
