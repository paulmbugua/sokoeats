import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useShopContext } from '@mytutorapp/shared/context';
import useAppQuery from './useAppQuery';
import { useMutation } from '@tanstack/react-query';
import * as accountApi from '@mytutorapp/shared/api';
import axios from 'axios';
import type {
  SessionFormData,
  RatingFormData,
  SessionType,
  Transaction,
  EarningsSummary,
} from '@mytutorapp/shared/types';

export interface UseAccountSectionResult {
  user: {
    userId?: string;
    email: string | null;
    name?: string;
    profileImage: string;
    tokens: number;
    role: 'student' | 'tutor';
  };
  transactions: Transaction[];
  sessions: SessionType[];
  earnings: EarningsSummary | null;
  loading: boolean;

  payoutCurrency: 'USD' | 'KES';
  refetchAccount: () => Promise<unknown>;
  refetchTransactions: () => Promise<unknown>;
  refetchEarnings: () => Promise<unknown>;

  activeTab: 'overview' | 'transactions' | 'sessions' | 'reviews' | 'earnings';
  formData: SessionFormData;
  ratingData: RatingFormData;
  cancelReasons: Record<string, string>;
  showRatingModal: boolean;

  setActiveTab: (tab: UseAccountSectionResult['activeTab']) => void;
  setFormData: Dispatch<SetStateAction<SessionFormData>>;
  setRatingData: (rd: RatingFormData) => void;
  setCancelReasons: (r: Record<string, string>) => void;
  setShowRatingModal: (v: boolean) => void;

  handleCancelReasonChange: (sessionId: string, reason: string) => void;
  confirmCancelSession: (sessionId: string, role: string, status: string) => void;
  handleCancelSession: (sessionId: string) => void;
  handleAcceptSession: (sessionId: string) => void;
  handleSessionCreation: () => void;
  handleCompletePending: (sessionId: string) => void;
  handleConfirmComplete: (sessionId: string) => void;
  handleReviewSubmission: () => void;
  handleCreateZoomLink: (
    sessionId: string,
    topic: string,
    startTime: string,
    duration: number,
    tutorName: string
  ) => void;
}

export const useAccountSection = (
  options?: {
    alertFn?: (message: string) => void;
    confirmFn?: (message: string) => Promise<boolean>;
    navigateFn?: (destination: string) => void;
    queryParams?: URLSearchParams;
  }
): UseAccountSectionResult => {
  const { alertFn, confirmFn, navigateFn, queryParams } = options ?? {};
  const { token, backendUrl, setTokens } = useShopContext();

  // ✅ Active tab
  const [activeTab, setActiveTab] = useState<
    'overview' | 'transactions' | 'sessions' | 'reviews' | 'earnings'
  >('overview');

  /* 1) Account details ------------------------------------------------------ */
  const {
    data: acctResp,
    isLoading: loadingDetails,
    refetch: refetchAccount,
  } = useAppQuery(
    ['accountDetails', token],
    () => accountApi.fetchAccountDetails(backendUrl, token!),
    { enabled: Boolean(token), refetchOnWindowFocus: false }
  );

  const user = {
    userId: acctResp?.user?.userId,
    email: acctResp?.user?.email ?? null,
    name: acctResp?.profile?.profileExists ? acctResp.profile.profile.name : undefined,
    profileImage: acctResp?.profile?.profileExists
      ? (acctResp.profile.profile.gallery?.[0] ?? '/default-avatar.jpg')
      : '/default-avatar.jpg',
    tokens: acctResp?.user?.tokens ?? 0,
    role: (acctResp?.profile?.profile?.role ?? 'student') as 'student' | 'tutor',
  };

  const acctReady = Boolean(acctResp);
  const isTutor = user.role === 'tutor';

  // Payout currency (tolerate snake/camel)
  const payoutCurrency: 'USD' | 'KES' = (() => {
    const raw =
      acctResp?.profile?.profile?.payoutCurrency ??
      acctResp?.profile?.profile?.payout_currency ??
      'USD';
    return String(raw).toUpperCase() === 'KES' ? 'KES' : 'USD';
  })();

  console.log('[useAccountSection] user role', user.role);
  console.log('[useAccountSection] payoutCurrency (from profile)', payoutCurrency);

  // sync tokens → context
 const prevTokens = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (user.tokens !== prevTokens.current) {
      prevTokens.current = user.tokens;
      setTokens(user.tokens);
    }
  }, [user.tokens, setTokens]);

  /* 2) Transactions --------------------------------------------------------- */
  const {
    data: transactions = [],
    refetch: refetchTransactions,
  } = useAppQuery<Transaction[], Error>(
    ['transactions', token],
    () => accountApi.fetchTransactions(backendUrl, token!),
    { enabled: Boolean(token), refetchOnWindowFocus: false }
  );

  /* 3) Sessions ------------------------------------------------------------- */
  const {
    data: sessions = [],
    refetch: refetchSessions,
  } = useAppQuery<SessionType[], Error>(
    ['sessions', token],
    () => accountApi.fetchSessionsByType(backendUrl, token!, 'session'),
    { enabled: Boolean(token), refetchOnWindowFocus: false }
  );

    /* 4) Earnings summary (tutor only) ---------------------------------------- */
  // ✅ Always available for tutors (not tab-gated)
  const earningsEnabled = Boolean(token && acctReady && isTutor);
  const {
    data: earningsRaw = null,
    refetch: refetchEarnings,
  } = useAppQuery<EarningsSummary, Error>(
    ['earningsSummary', token, isTutor],
    () => accountApi.fetchEarningsSummary(backendUrl, token!),
    {
      enabled: earningsEnabled,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: (count, err: any) => {
        const status = err?.response?.status ?? 0;
        if ([401, 403, 404].includes(status)) return false;
        return count < 1;
      },
    }
  );

  // 🔍 Derive fallback math directly from transactions
  const lifetimeByCurrency: Record<string, number> = {};
  const pendingByCurrency: Record<string, number> = {};

  for (const tx of transactions) {
    const curr = String(tx.currency ?? 'USD').toUpperCase();
    const amt = Math.max(0, Number(tx.amount) || 0);

    if (tx.type?.toLowerCase().includes('earning')) {
      lifetimeByCurrency[curr] = (lifetimeByCurrency[curr] || 0) + amt;
    }

    if (tx.type === 'Withdrawal Request' && (tx.status || 'Pending') === 'Pending') {
      pendingByCurrency[curr] = (pendingByCurrency[curr] || 0) + amt;
    }
  }

  const approxLifetime = lifetimeByCurrency[payoutCurrency] ?? 0;
  const approxPending  = pendingByCurrency[payoutCurrency] ?? 0;
  const approxAvailable = Math.max(0, approxLifetime - approxPending);

  // ✅ Normalize earnings we expose to the UI:
  // - Prefer backend values when they are > 0
  // - Fall back to derived values from transactions
  const earnings: EarningsSummary | null = isTutor
    ? {
        currency: payoutCurrency, // align with profile’s payout currency
        total:
          (earningsRaw && earningsRaw.total > 0
            ? earningsRaw.total
            : approxLifetime),
        pending:
          (earningsRaw && earningsRaw.pending > 0
            ? earningsRaw.pending
            : approxPending),
        available:
          (earningsRaw && earningsRaw.available > 0
            ? earningsRaw.available
            : approxAvailable),
      }
    : null;

  console.log('[useAccountSection] earningsEnabled', earningsEnabled);
  console.log('[useAccountSection] earningsRaw from query', earningsRaw);
  console.log('[useAccountSection] lifetimeByCurrency (from tx)', lifetimeByCurrency);
  console.log('[useAccountSection] pendingByCurrency (from tx)', pendingByCurrency);
  console.log('[useAccountSection] normalized earnings passed to UI', earnings);

  /* 5) Local UI state ------------------------------------------------------- */
  const [formData, setFormData] = useState<SessionFormData>({
    tutorId: '',
    tutorName: '',
    subject: '',
    pricing: {},
    date: new Date().toISOString().slice(0, 10),
  });

  const [ratingData, setRatingData] = useState<RatingFormData>({
    id: '',
    tutorId: '',
    sessionId: '',
    rating: '',
    comment: '',
    studentName: '',
    createdAt: '',
  });

  const [cancelReasons, setCancelReasons] = useState<Record<string, string>>({});
  const [showRatingModal, setShowRatingModal] = useState(false);

  /* 6) Mutations ------------------------------------------------------------ */
  const cancelSessionM = useMutation<void, Error, { sessionId: string; reason: string }>({
    mutationFn: ({ sessionId, reason }) =>
      accountApi.cancelSession(backendUrl, token!, sessionId, reason),
    onSuccess: () => {
      alertFn?.('Session cancelled successfully.');
      refetchSessions();
    },
    onError: () => alertFn?.('Failed to cancel session.'),
  });

  const acceptSessionM = useMutation<void, Error, string>({
    mutationFn: (sessionId) => accountApi.acceptSession(backendUrl, token!, sessionId),
    onSuccess: () => {
      alertFn?.('Session accepted successfully.');
      refetchSessions();
    },
    onError: () => alertFn?.('Failed to accept session.'),
  });

  const createSessionM = useMutation<void, Error, SessionFormData>({
    mutationFn: (payload) => accountApi.createSession(backendUrl, token!, payload),
    onSuccess: () => {
      alertFn?.('Session created successfully.');
      refetchSessions();
    },
    onError: (err) => {
      if (axios.isAxiosError(err) && err.response?.data?.message?.includes('Insufficient tokens')) {
        alertFn?.('Insufficient tokens. Please buy more tokens.');
        navigateFn?.('/buy-tokens');
      } else {
        alertFn?.('Failed to create session.');
      }
    },
  });

  const completePendingM = useMutation<void, Error, string>({
    mutationFn: (sessionId) =>
      accountApi.completePendingSession(backendUrl, token!, sessionId),
    onSuccess: () => {
      alertFn?.('Session marked as complete-pending.');
      refetchSessions();
    },
    onError: () => alertFn?.('Failed to mark complete-pending.'),
  });

  const confirmCompleteM = useMutation<void, Error, string>({
    mutationFn: (sessionId) =>
      accountApi.confirmSessionCompletion(backendUrl, token!, sessionId),
    onSuccess: (_data, sessionId) => {
      alertFn?.('Session confirmed complete.');
      refetchSessions();
      refetchTransactions();
      refetchAccount();
      const done = sessions.find((s) => String(s.id) === sessionId);
      if (done) {
        const tutorIdForRating =
          (done as any).tutor_id != null ? String((done as any).tutor_id) : '';
        setRatingData({
          id: '',
          tutorId: tutorIdForRating,
          sessionId,
          rating: '',
          comment: '',
          studentName: '',
          createdAt: '',
        });
        setShowRatingModal(true);
      }
    },
    onError: () => alertFn?.('Failed to confirm completion.'),
  });

  const submitReviewM = useMutation<
    void,
    Error,
    { tutorId: string; sessionId: string; rating: number; comment: string }
  >({
    mutationFn: (body) => accountApi.submitReview(backendUrl, token!, body),
    onSuccess: () => {
      alertFn?.('Review submitted.');
      setShowRatingModal(false);
      refetchSessions();
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        alertFn?.(err.response?.data?.message ?? 'Failed to submit review.');
      } else {
        alertFn?.('Failed to submit review.');
      }
    },
  });

  const zoomLinkM = useMutation<
    void,
    Error,
    { sessionId: string; topic: string; startTime: string; duration: number; tutorName: string }
  >({
    mutationFn: ({ sessionId, topic, startTime, duration, tutorName }) =>
      accountApi.createZoomLink(backendUrl, token!, sessionId, topic, startTime, duration, tutorName),
    onSuccess: () => {
      alertFn?.('Zoom link created.');
      refetchSessions();
    },
    onError: () => alertFn?.('Failed to create Zoom link.'),
  });

  /* 7) URL-driven tab logic ------------------------------------------------- */
 useEffect(() => {
  if (queryParams?.get('action') === 'createSession') {
    setActiveTab('sessions');
    setFormData((fd) => ({
      ...fd,
      tutorId: queryParams.get('tutorId') ?? '',
      tutorName: queryParams.get('tutorName') ?? '',
      subject: queryParams.get('subject') ?? '',
      pricing: queryParams.get('pricing')
        ? JSON.parse(queryParams.get('pricing')!)
        : {},
    }));
  }
}, [queryParams, setActiveTab, setFormData]);


  /* 8) When Earnings tab is open, refresh related data on focus ------------ */
 useEffect(() => {
  if (activeTab !== 'earnings') return;

  // Always refresh once when Earnings tab is opened
  refetchTransactions();
  refetchAccount();
  refetchEarnings();

  // ✅ Only attach window focus listener on web
  if (
    typeof window === 'undefined' ||
    typeof window.addEventListener !== 'function'
  ) {
    return;
  }

  const onFocus = () => {
    refetchTransactions();
    refetchAccount();
    refetchEarnings();
  };

  window.addEventListener('focus', onFocus);
  return () => window.removeEventListener('focus', onFocus);
}, [activeTab, refetchTransactions, refetchAccount, refetchEarnings]);


  /* 9) Handlers ------------------------------------------------------------- */
  const confirmCancelSession = useCallback(
    async (sessionId: string, role: string, status: string) => {
      if (role === 'tutor' && status === 'pending') {
        alertFn?.('Tutors cannot cancel a pending session.');
        return;
      }
      const ok = await (confirmFn
        ? confirmFn('Are you sure you want to cancel this session?')
        : Promise.resolve(false));
      if (ok) {
        cancelSessionM.mutate({ sessionId, reason: cancelReasons[sessionId] ?? '' });
      }
    },
    [confirmFn, cancelReasons, cancelSessionM, alertFn]
  );

  const handleAcceptSession = useCallback(
    (sessionId: string) => acceptSessionM.mutate(sessionId),
    [acceptSessionM]
  );

  const handleCancelSession = useCallback(
    (sessionId: string) => confirmCancelSession(sessionId, user.role, ''),
    [confirmCancelSession, user.role]
  );

  const handleSessionCreation = useCallback(
    () => createSessionM.mutate(formData),
    [createSessionM, formData]
  );

  const handleCompletePending = useCallback(
    (sessionId: string) => completePendingM.mutate(sessionId),
    [completePendingM]
  );

  const handleConfirmComplete = useCallback(
    (sessionId: string) => confirmCompleteM.mutate(sessionId),
    [confirmCompleteM]
  );

  const handleCancelReasonChange = useCallback(
    (sessionId: string, reason: string) =>
      setCancelReasons((p) => ({ ...p, [sessionId]: reason })),
    []
  );

  const handleReviewSubmission = useCallback(
    () =>
      submitReviewM.mutate({
        tutorId: ratingData.tutorId!,
        sessionId: ratingData.sessionId!,
        rating: Number(ratingData.rating),
        comment: ratingData.comment!,
      }),
    [ratingData, submitReviewM]
  );

  const handleCreateZoomLink = useCallback(
    (sessionId: string, topic: string, startTime: string, duration: number, tutorName: string) =>
      zoomLinkM.mutate({ sessionId, topic, startTime, duration, tutorName }),
    [zoomLinkM]
  );

  /* 10) Return -------------------------------------------------------------- */
  return {
    user,
    transactions,
    sessions,
    earnings,
    loading: loadingDetails,

    payoutCurrency,
    refetchAccount,
    refetchTransactions,
    refetchEarnings,

    activeTab,
    formData,
    ratingData,
    cancelReasons,
    showRatingModal,

    setActiveTab,
    setFormData,
    setRatingData,
    setCancelReasons,
    setShowRatingModal,

    handleCancelReasonChange,
    confirmCancelSession,
    handleCancelSession,
    handleAcceptSession,
    handleSessionCreation,
    handleCompletePending,
    handleConfirmComplete,
    handleReviewSubmission,
    handleCreateZoomLink,
  };
};

export default useAccountSection;
