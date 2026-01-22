// apps/web/src/components/AccountSection.web.tsx
import React, { useMemo, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Spinner from './Spinner.web';
import useAccountSection from '@mytutorapp/shared/hooks/useAccountSection';
import debounce from 'lodash.debounce';
import type { SessionType, Transaction, EarningsSummary } from '@mytutorapp/shared/types';
import { useWithdrawal } from '@mytutorapp/shared/hooks';

// Safe currency formatter
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

const safeUpper = (v?: string, fb: 'USD' | 'KES' = 'USD'): 'USD' | 'KES' =>
  String(v ?? fb).toUpperCase() === 'KES' ? 'KES' : 'USD';

const MIN_WITHDRAW: Record<'USD' | 'KES', number> = { USD: 20, KES: 200 };

const AccountSection: React.FC = () => {
  // Track which session IDs have missing-reason errors
  const [cancelError, setCancelError] = useState<Record<string, boolean>>({});

  // Track validation errors for "Create Session" form (student)
  type SessionFormErrors = Record<string, string>;

  const [sessionFormErrors, setSessionFormErrors] = useState<SessionFormErrors>({});
  const [sessionBanner, setSessionBanner] = useState<string>('');

  const createSessionFormRef = useRef<HTMLFormElement | null>(null);

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

  const scrollToSessionField = (name: string) => {
    const form = createSessionFormRef.current;
    if (!form) return;
    const el = form.querySelector(`[name="${name}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (el as any)?.focus?.();
  };

  const validateSessionForm = (): boolean => {
    const errs: SessionFormErrors = {};

    // Tutor must be chosen (via profile)
    if (!formData.tutorId) {
      errs.tutorId = 'Choose a tutor by visiting their profile and clicking "Create Session".';
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

    const keys = Object.keys(errs);
    if (keys.length) {
      // Scroll to first error field if there is an actual form control
      const firstKey = keys[0];
      if (firstKey !== 'tutorId') {
        scrollToSessionField(firstKey);
      }
      return false;
    }

    return true;
  };

  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const {
    loading,
    user,
    transactions,
    sessions,
    earnings, // EarningsSummary object

    // from hook
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
    alertFn: (msg) => window.alert(msg),
    confirmFn: async (msg) => window.confirm(msg),
    navigateFn: (dest) => navigate(dest),
    queryParams,
  });

  const role = user.role;

  // Withdrawal hook
  const { withdraw, isSubmitting: isWithdrawing } = useWithdrawal({
    notify: (m, t) => {
      if (t === 'error') console.error(m);
      else console.log(m);
    },
  });

  // === Earnings helpers ======================================================

  // Totals by currency (based on transactions list you already have)
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

  // Simple available approximation for UI (if you don’t have a dedicated balance endpoint):
  // available ≈ lifetimeEarnings - pendingWithdrawalRequests
  const approxAvailable = Math.max(
    0,
    (lifetimeByCurrency[payoutCurrency] || 0) - (pendingWithdrawalsByCurrency[payoutCurrency] || 0)
  );

  // Withdrawal form state
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const minAmount = MIN_WITHDRAW[payoutCurrency];

  // Sync tab from query (?tab=sessions) + backwards compat for (?sessions)
  useEffect(() => {
    const tabQP = queryParams.get('tab');
    const legacySessionsFlag = queryParams.has('sessions'); // supports /account?sessions
    const desired = tabQP ?? (legacySessionsFlag ? 'sessions' : null);
    if (desired && desired !== activeTab) {
      setActiveTab(desired as typeof activeTab);
    }
  }, [queryParams, activeTab, setActiveTab]);

  // Debounce review submission
  const debouncedReviewSubmission = useMemo(
    () => debounce(handleReviewSubmission, 300),
    [handleReviewSubmission]
  );
  useEffect(() => () => debouncedReviewSubmission.cancel(), [debouncedReviewSubmission]);

  // Sort sessions by date
  const sortedSessions = useMemo(
    () =>
      [...sessions].sort(
        (a, b) =>
          new Date(a.date as unknown as string).getTime() -
          new Date(b.date as unknown as string).getTime()
      ),
    [sessions]
  );

  // Scroll-to-new-session logic
  const [justCreated, setJustCreated] = useState(false);
  const sessionsRef = useRef<HTMLDivElement>(null);
  const lastSessionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!justCreated) return;
    if (activeTab !== 'sessions') {
      setActiveTab('sessions');
      return;
    }
    requestAnimationFrame(() => {
      lastSessionRef.current?.scrollIntoView({ behavior: 'smooth' });
      setJustCreated(false);
    });
  }, [justCreated, activeTab, setActiveTab]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-[#0b1118]">
        <Spinner />
      </div>
    );
  }

  return (
    <div
      className="account-section min-h-screen pb-16
                 bg-slate-50 text-[#0d141c]
                 dark:bg-[#0b1118] dark:text-slate-100
                 px-3 sm:px-6 md:px-10"
      style={{ fontFamily: `Manrope, "Noto Sans", sans-serif` }}
    >
      {/* Header */}
      <div
        className="mt-4 rounded-2xl p-6 sm:p-7 md:p-8 shadow-lg
                   bg-white/80 backdrop-blur border border-slate-200
                   dark:bg-[#0f1821]/80 dark:border-[#182430]
                   flex flex-col sm:flex-row items-center gap-6"
      >
        {role !== 'student' && (
          <img
            src={user.profileImage || '/default-avatar.jpg'}
            alt="Profile"
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover shadow-md ring-2 ring-slate-200 dark:ring-[#1b2a38]"
          />
        )}
        <div className="text-center sm:text-left">
          <h2
            className="text-2xl font-extrabold tracking-tight
                         bg-clip-text text-transparent
                         bg-gradient-to-r from-primary to-secondary"
          >
            {user.name || 'User Name'}
          </h2>
          <p className="text-slate-500 dark:text-slate-300">{user.email ?? ''}</p>
          {role === 'student' && (
            <p className="text-slate-600 dark:text-slate-300 mt-1">
              Tokens: <span className="font-semibold">{user.tokens}</span>
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex flex-wrap justify-center sm:justify-start gap-2 sm:gap-3 mt-6
                   border-b border-slate-200 dark:border-[#182430] pb-2"
        role="tablist"
      >
        {(['overview', 'transactions', 'sessions', 'reviews', 'earnings'] as const).map((tab) => {
          if (tab === 'reviews' && role !== 'student') return null;
          if (tab === 'earnings' && role !== 'tutor') return null;
          if (tab === 'sessions' && !['student', 'tutor'].includes(role)) return null;
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={isActive}
              className={`px-3 sm:px-4 py-2 rounded-xl text-sm font-semibold transition
                          ring-1 ring-inset
                          ${
                            isActive
                              ? 'bg-primary text-white ring-primary'
                              : 'bg-white dark:bg-[#0f1821] text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-[#182430] hover:bg-slate-100/70 dark:hover:bg-[#122234]'
                          }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="mt-6 pb-40">
        {/* Overview */}
        {activeTab === 'overview' && (
          <p className="text-slate-600 dark:text-slate-300 text-base sm:text-lg text-center">
            Welcome to your account overview.
          </p>
        )}

        {/* Transactions */}
        {activeTab === 'transactions' && (
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-primary">Transaction History</h3>
            {transactions.length > 0 ? (
              transactions.map((tx: Transaction) => (
                <div
                  key={String(tx.id)}
                  className="p-4 rounded-xl shadow-sm
                             bg-white border border-slate-200
                             dark:bg-[#0f1821] dark:border-[#182430]"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm">
                    <p className="text-slate-700 dark:text-slate-200">
                      <span className="font-semibold">Type:</span> {tx.type}
                    </p>
                    <p className="text-slate-700 dark:text-slate-200">
                      <span className="font-semibold">Amount:</span>{' '}
                      {currencyFmt(
                        Math.abs(Number(tx.amount)),
                        String(tx.currency ?? 'USD').toUpperCase()
                      )}
                    </p>
                    <p className="text-slate-700 dark:text-slate-200">
                      <span className="font-semibold">Kind:</span>{' '}
                      {Number(tx.amount) > 0 ? 'Earning' : 'Deduction'}
                    </p>
                    <p className="text-slate-700 dark:text-slate-200">
                      <span className="font-semibold">Status:</span> {tx.status || 'N/A'}
                    </p>
                    <p className="text-slate-700 dark:text-slate-200 sm:col-span-2">
                      <span className="font-semibold">Description:</span> {tx.description || 'N/A'}
                    </p>
                    <p className="text-slate-700 dark:text-slate-200">
                      <span className="font-semibold">Date:</span>{' '}
                      {new Date(tx.date as unknown as string).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-500 dark:text-slate-400">No transactions found.</p>
            )}
          </div>
        )}

        {/* Student Sessions */}
        {activeTab === 'sessions' && role === 'student' && (
          <>
            <form
              ref={createSessionFormRef}
              className="max-w-2xl mx-auto space-y-4
                          p-6 rounded-2xl shadow-sm
                          bg-white border border-slate-200
                          dark:bg-[#0f1821] dark:border-[#182430]"
              onSubmit={async (e) => {
                e.preventDefault();
                setSessionFormErrors({});
                setSessionBanner('');

                const ok = validateSessionForm();
                if (!ok) return;

                await handleSessionCreation();
                setJustCreated(true);
              }}
            >
              {/* Top error banner for Create Session */}
              {sessionBanner && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 p-2 text-sm"
                >
                  {sessionBanner}
                </div>
              )}

              {!formData.tutorId && (
                <div
                  className={`p-2 border-l-4 rounded text-sm
                                ${
                                  sessionFormErrors.tutorId
                                    ? 'bg-red-50 border-red-500 text-red-700 dark:bg-[#3b1111] dark:text-red-200 dark:border-red-600'
                                    : 'bg-amber-50 border-amber-400 text-amber-800 dark:bg-[#231b10] dark:text-amber-200 dark:border-amber-500'
                                }`}
                >
                  <p>To create a session, visit a tutor’s profile and click “Create Session.”</p>
                  {sessionFormErrors.tutorId && (
                    <p className="mt-1 text-xs">{sessionFormErrors.tutorId}</p>
                  )}
                </div>
              )}

              <h3 className="text-lg font-bold text-primary">
                {formData.tutorName ? `Session with ${formData.tutorName}` : 'Create a Session'}
              </h3>

              <div className="space-y-3">
                {/* Subject */}
                <div>
                  <input
                    name="subject"
                    type="text"
                    placeholder="Subject"
                    className={`block w-full p-3 rounded-xl text-sm
                                  bg-slate-50 border text-slate-900
                                  focus:outline-none focus:ring-2 focus:ring-primary
                                  dark:bg-[#0b1620] dark:border-[#182430] dark:text-slate-100
                                  ${
                                    sessionFormErrors.subject
                                      ? 'border-red-500 ring-1 ring-red-500 focus:ring-red-500'
                                      : 'border-slate-200'
                                  }`}
                    value={formData.subject}
                    onChange={(e) => {
                      setFormData({ ...formData, subject: e.target.value });
                      if (sessionFormErrors.subject) {
                        setSessionFormErrors((prev) => {
                          const { subject, ...rest } = prev;
                          return rest;
                        });
                      }
                    }}
                    aria-invalid={!!sessionFormErrors.subject}
                    aria-describedby={sessionFormErrors.subject ? 'err-session-subject' : undefined}
                  />
                  {sessionFormErrors.subject && (
                    <p
                      id="err-session-subject"
                      className="mt-1 text-xs text-red-600 dark:text-red-400"
                    >
                      {sessionFormErrors.subject}
                    </p>
                  )}
                </div>

                {/* Note */}
                <div>
                  <textarea
                    name="note"
                    placeholder="Note (optional)"
                    className="block w-full p-3 rounded-xl text-sm bg-slate-50 border text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary dark:bg-[#0b1620] dark:border-[#182430] dark:text-slate-100 border-slate-200"
                    value={formData.note || ''}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                    rows={3}
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Share any quick question or availability details for the tutor.
                  </p>
                </div>

                {/* Session Type */}
                <div>
                  <select
                    name="sessionType"
                    className={`block w-full p-3 rounded-xl text-sm
                                  bg-slate-50 border text-slate-900
                                  focus:outline-none focus:ring-2 focus:ring-primary
                                  dark:bg-[#0b1620] dark:border-[#182430] dark:text-slate-100
                                  ${
                                    sessionFormErrors.sessionType
                                      ? 'border-red-500 ring-1 ring-red-500 focus:ring-red-500'
                                      : 'border-slate-200'
                                  }`}
                    value={formData.sessionType || ''}
                    onChange={(e) => {
                      const sessionType = e.target.value;
                      const sessionCost = String(
                        formData.pricing?.[sessionType as keyof typeof formData.pricing] || 0
                      );
                      setFormData({ ...formData, sessionType, sessionCost });
                      if (sessionFormErrors.sessionType) {
                        setSessionFormErrors((prev) => {
                          const { sessionType, ...rest } = prev;
                          return rest;
                        });
                      }
                    }}
                    aria-invalid={!!sessionFormErrors.sessionType}
                    aria-describedby={
                      sessionFormErrors.sessionType ? 'err-session-type' : undefined
                    }
                  >
                    <option value="" disabled>
                      Select Session Type
                    </option>
                    {formData.pricing &&
                      Object.entries(formData.pricing).map(([type, price]) => (
                        <option key={type} value={type}>
                          {`${type.charAt(0).toUpperCase() + type.slice(1)} – ${price} Tokens`}
                        </option>
                      ))}
                  </select>
                  {sessionFormErrors.sessionType && (
                    <p
                      id="err-session-type"
                      className="mt-1 text-xs text-red-600 dark:text-red-400"
                    >
                      {sessionFormErrors.sessionType}
                    </p>
                  )}
                </div>

                {/* Date */}
                <div>
                  <input
                    name="date"
                    type="date"
                    className={`block w-full p-3 rounded-xl text-sm
                                  bg-slate-50 border text-slate-900
                                  focus:outline-none focus:ring-2 focus:ring-primary
                                  dark:bg-[#0b1620] dark:border-[#182430] dark:text-slate-100
                                  ${
                                    sessionFormErrors.date
                                      ? 'border-red-500 ring-1 ring-red-500 focus:ring-red-500'
                                      : 'border-slate-200'
                                  }`}
                    value={formData.date}
                    onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                    onChange={(e) => {
                      setFormData({ ...formData, date: e.target.value });
                      if (sessionFormErrors.date) {
                        setSessionFormErrors((prev) => {
                          const { date, ...rest } = prev;
                          return rest;
                        });
                      }
                    }}
                    aria-invalid={!!sessionFormErrors.date}
                    aria-describedby={sessionFormErrors.date ? 'err-session-date' : undefined}
                  />
                  {sessionFormErrors.date && (
                    <p
                      id="err-session-date"
                      className="mt-1 text-xs text-red-600 dark:text-red-400"
                    >
                      {sessionFormErrors.date}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl text-sm font-semibold
                            bg-primary text-white hover:brightness-110 transition"
              >
                Create Session
              </button>
            </form>

            <div
              ref={sessionsRef}
              className="mt-6 max-w-4xl mx-auto w-full space-y-4
                         p-6 rounded-2xl shadow-inner
                         bg-white border border-slate-200
                         dark:bg-[#0f1821] dark:border-[#182430]"
            >
              <h3 className="text-xl font-bold text-primary mb-2">Your Sessions</h3>
              {sortedSessions.length > 0 ? (
                sortedSessions.map((session, idx) => {
                  const isLast = idx === sortedSessions.length - 1;
                  return (
                    <div
                      key={String(session.id)}
                      ref={isLast ? lastSessionRef : undefined}
                      className="p-4 rounded-xl shadow-sm text-sm w-full
                                 bg-slate-50 border border-slate-200
                                 dark:bg-[#0b1620] dark:border-[#182430]"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4">
                        <p>
                          <span className="font-semibold">Tutor:</span>{' '}
                          {session.tutor_name || 'N/A'}
                        </p>
                        <p>
                          <span className="font-semibold">Type:</span>{' '}
                          {session.sessionType || 'N/A'}
                        </p>
                        <p>
                          <span className="font-semibold">Subject:</span> {session.subject || 'N/A'}
                        </p>
                        <p>
                          <span className="font-semibold">Cost:</span> {session.amount} tokens
                        </p>
                        <p>
                          <span className="font-semibold">Date:</span>{' '}
                          {new Date(session.date as unknown as string).toLocaleDateString()}
                        </p>
                        <p>
                          <span className="font-semibold">Status:</span>{' '}
                          {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                        </p>
                      </div>

                      {session.status === 'accepted' && (
                        <>
                          {session.zoom_links?.length ? (
                            <div className="mt-3 space-y-1">
                              <p className="text-emerald-400 font-semibold">Zoom Links:</p>
                              {session.zoom_links.map((link, i) => (
                                <a
                                  key={String(i)}
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary underline text-sm"
                                >
                                  Join Meeting Part {i + 1}
                                </a>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-3 text-slate-400 italic">
                              Please wait for the tutor to create Zoom links.
                            </p>
                          )}

                          <textarea
                            className={`mt-3 block w-full p-3 rounded-xl text-sm
                                        bg-slate-100 border
                                        dark:bg-[#0f1821]
                                        ${
                                          cancelError[String(session.id)]
                                            ? 'border-red-500'
                                            : 'border-slate-300 dark:border-[#182430]'
                                        }`}
                            placeholder="Reason for cancellation"
                            value={cancelReasons[String(session.id)] || ''}
                            onChange={(e) => {
                              setCancelError((prev) => ({
                                ...prev,
                                [String(session.id)]: false,
                              }));
                              handleCancelReasonChange(String(session.id), e.target.value);
                            }}
                          />

                          <button
                            className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold
                                       bg-rose-600 text-white hover:bg-rose-700"
                            onClick={() => {
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
                          >
                            Cancel Session
                          </button>
                        </>
                      )}

                      {session.status === 'completed_pending' && (
                        <button
                          className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold
                                     bg-emerald-600 text-white hover:bg-emerald-700"
                          onClick={() => handleConfirmComplete(String(session.id))}
                        >
                          Confirm Completion
                        </button>
                      )}
                      {session.status === 'completed' && (
                        <p className="mt-3 text-emerald-300 font-semibold text-sm">
                          Session Completed
                        </p>
                      )}
                      {session.status === 'cancelled' && (
                        <p className="mt-3 text-rose-300 text-sm">Session Cancelled</p>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-slate-500 dark:text-slate-400 text-center">No sessions yet.</p>
              )}
            </div>
          </>
        )}

        {/* Tutor Sessions */}
        {activeTab === 'sessions' && role === 'tutor' && (
          <div
            ref={sessionsRef}
            className="mt-6 max-w-4xl mx-auto w-full space-y-4
                       p-6 rounded-2xl shadow-inner
                       bg-white border border-slate-200
                       dark:bg-[#0f1821] dark:border-[#182430]"
          >
            <h3 className="text-xl font-bold text-primary mb-2">Your Upcoming Sessions</h3>
            {sortedSessions.length > 0 ? (
              sortedSessions.map((session) => (
                <div
                  key={String(session.id)}
                  className="p-4 rounded-xl shadow-sm text-sm w-full
                             bg-slate-50 border border-slate-200
                             dark:bg-[#0b1620] dark:border-[#182430]"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-1 gap-x-4">
                    <p>
                      <span className="font-semibold">Student:</span>{' '}
                      {session.student_name || 'N/A'}
                    </p>
                    <p>
                      <span className="font-semibold">Type:</span> {session.sessionType || 'N/A'}
                    </p>
                    <p>
                      <span className="font-semibold">Date:</span>{' '}
                      {new Date(session.date as unknown as string).toLocaleDateString()}
                    </p>
                  </div>

                  {session.status === 'upcoming' && (
                    <div className="mt-3 flex flex-col sm:flex-row gap-2">
                      <button
                        className="px-4 py-2 rounded-lg text-sm font-semibold
                                   bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() => handleAcceptSession(String(session.id))}
                      >
                        Accept
                      </button>

                      <textarea
                        className={`flex-1 min-h-[42px] p-3 rounded-xl text-sm
                                    bg-slate-100 border
                                    dark:bg-[#0f1821]
                                    ${
                                      cancelError[String(session.id)]
                                        ? 'border-red-500'
                                        : 'border-slate-300 dark:border-[#182430]'
                                    }`}
                        placeholder="Reason for cancellation"
                        value={cancelReasons[String(session.id)] || ''}
                        onChange={(e) => {
                          setCancelError((prev) => ({
                            ...prev,
                            [String(session.id)]: false,
                          }));
                          handleCancelReasonChange(String(session.id), e.target.value);
                        }}
                      />

                      <button
                        className="px-4 py-2 rounded-lg text-sm font-semibold
                                   bg-rose-600 text-white hover:bg-rose-700"
                        onClick={() => {
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
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {session.status === 'accepted' && (
                    <>
                      <button
                        className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold
                                   bg-primary text-white hover:brightness-110"
                        onClick={() =>
                          navigate(`/messages?studentId=${String(session.student_id)}`)
                        }
                      >
                        Chat with Student
                      </button>

                      {!session.zoom_links?.length ? (
                        <button
                          className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold
                                     bg-amber-500 text-white hover:bg-amber-600"
                          onClick={() =>
                            handleCreateZoomLink(
                              String(session.id),
                              session.subject || 'General',
                              session.date,
                              120,
                              session.tutor_name || ''
                            )
                          }
                        >
                          Create Zoom Links
                        </button>
                      ) : (
                        <div className="mt-3 space-y-1">
                          <p className="text-emerald-400 font-semibold">Zoom Links:</p>
                          {session.zoom_links.map((link, i) => (
                            <a
                              key={String(i)}
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary underline text-sm"
                            >
                              Join Meeting Part {i + 1}
                            </a>
                          ))}
                        </div>
                      )}

                      <button
                        className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold
                                   bg-fuchsia-600 text-white hover:bg-fuchsia-700"
                        onClick={() => handleCompletePending(String(session.id))}
                      >
                        Mark as Complete-Pending
                      </button>
                    </>
                  )}

                  {session.status === 'completed_pending' && (
                    <p className="mt-3 text-fuchsia-300 font-semibold text-sm">Complete-Pending</p>
                  )}
                  {session.status === 'completed' && (
                    <p className="mt-3 text-emerald-300 font-semibold text-sm">Session Completed</p>
                  )}
                  {session.status === 'cancelled' && (
                    <p className="mt-3 text-rose-300 text-sm">Session Cancelled</p>
                  )}
                </div>
              ))
            ) : (
              <p className="text-slate-500 dark:text-slate-400 text-center">
                No upcoming sessions.
              </p>
            )}
          </div>
        )}

        {/* Reviews */}
        {activeTab === 'reviews' && role === 'student' && (
          <form
            className="p-6 rounded-2xl shadow-sm space-y-4
                       bg-white border border-slate-200
                       dark:bg-[#0f1821] dark:border-[#182430]"
            onSubmit={(e) => {
              e.preventDefault();
              debouncedReviewSubmission();
            }}
          >
            <h3 className="text-xl font-bold text-primary">Post a Review</h3>
            <input
              type="text"
              placeholder="Tutor ID"
              className="block w-full p-3 rounded-xl
                         bg-slate-50 border border-slate-200 text-slate-900
                         dark:bg-[#0b1620] dark:border-[#182430] dark:text-slate-100"
              value={formData.tutorId}
              onChange={(e) => setFormData({ ...formData, tutorId: e.target.value })}
            />
            <textarea
              placeholder="Comment"
              className="block w-full p-3 rounded-xl
                         bg-slate-50 border border-slate-200 text-slate-900
                         dark:bg-[#0b1620] dark:border-[#182430] dark:text-slate-100"
              value={formData.comment}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
            />
            <input
              type="number"
              min={1}
              max={5}
              placeholder="Rating (1-5)"
              className="block w-full p-3 rounded-xl
                         bg-slate-50 border border-slate-200 text-slate-900
                         dark:bg-[#0b1620] dark:border-[#182430] dark:text-slate-100"
              value={formData.rating ?? ''}
              onChange={(e) => setFormData({ ...formData, rating: e.target.value })}
            />
            <button
              type="submit"
              className="w-full py-3 rounded-xl text-sm font-semibold
                         bg-rose-600 text-white hover:bg-rose-700"
            >
              Submit Review
            </button>
          </form>
        )}

        {/* Earnings (Tutor) */}
        {activeTab === 'earnings' && role === 'tutor' && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              {/* Summary Card */}
              <div className="p-5 rounded-2xl shadow-lg bg-gradient-to-br from-primary/90 to-secondary/90 text-white">
                <p className="text-sm opacity-90">Payout Currency</p>
                <p className="mt-1 text-2xl font-extrabold tracking-tight">{payoutCurrency}</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs opacity-90">Lifetime</p>
                    <p className="text-lg font-bold">
                      {currencyFmt(
                        earnings?.total ?? lifetimeByCurrency[payoutCurrency] ?? 0,
                        payoutCurrency
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs opacity-90">Pending</p>
                    <p className="text-lg font-bold">
                      {currencyFmt(
                        earnings?.pending ?? pendingWithdrawalsByCurrency[payoutCurrency] ?? 0,
                        payoutCurrency
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-3 text-xs opacity-90">
                  Available:
                  <span className="ml-1 font-semibold">
                    {currencyFmt(earnings?.available ?? approxAvailable, payoutCurrency)}
                  </span>
                </div>
              </div>

              {/* Withdrawal Form */}
              <div className="p-5 rounded-2xl shadow-sm bg-white border border-slate-200 dark:bg-[#0f1821] dark:border-[#182430]">
                <h4 className="text-lg font-bold text-primary">Withdraw Earnings</h4>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Minimum: {currencyFmt(minAmount, payoutCurrency)} • Balance shown is an
                  approximation based on your transactions.
                </p>
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                        Currency
                      </label>
                      <input
                        value={payoutCurrency}
                        disabled
                        className="w-full p-3 rounded-xl bg-slate-100 dark:bg-[#0b1620] border border-slate-200 dark:border-[#182430] text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                        Amount
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={minAmount}
                        step="0.01"
                        placeholder={String(minAmount)}
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        className="w-full p-3 rounded-xl bg-white dark:bg-[#0b1620] border border-slate-200 dark:border-[#182430] text-slate-800 dark:text-slate-100"
                      />
                    </div>
                  </div>
                  <button
                    className="w-full py-3 rounded-xl text-sm font-semibold bg-primary text-white hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={
                      isWithdrawing || !withdrawAmount || Number(withdrawAmount) < minAmount
                    }
                    onClick={async () => {
                      const amt = Number(withdrawAmount);
                      if (!Number.isFinite(amt) || amt < minAmount) return;
                      await withdraw({ currency: payoutCurrency, amount: amt });
                      // Clear field optimistically
                      setWithdrawAmount('');
                      // refresh view so pending withdrawal shows up instantly
                      await refetchTransactions();
                      await refetchAccount();
                      await refetchEarnings();
                    }}
                  >
                    {isWithdrawing ? 'Submitting…' : 'Request Withdrawal'}
                  </button>
                </div>
              </div>

              {/* Quick Tips */}
              <div className="p-5 rounded-2xl shadow-sm bg-white border border-slate-200 dark:bg-[#0f1821] dark:border-[#182430]">
                <h4 className="text-lg font-bold text-primary">Payout Tips</h4>
                <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  <li>
                    • Your withdrawal method & currency follow your profile’s payout settings.
                  </li>
                  <li>• USD withdrawals use Stripe or PayPal; KES uses M-Pesa B2C.</li>
                  <li>• Requests move to a processing queue; you’ll get an email update.</li>
                </ul>
              </div>
            </div>

            {/* Recent Earnings list (derived from transactions) */}
            <div className="space-y-3">
              <h3 className="text-xl font-bold text-primary">Recent Earnings</h3>
              {completedEarnings.length > 0 ? (
                completedEarnings.slice(0, 10).map((tx) => (
                  <div
                    key={String(tx.id)}
                    className="p-4 rounded-2xl shadow-sm
                               bg-white border border-slate-200
                               dark:bg-[#0f1821] dark:border-[#182430]"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-1 gap-x-4">
                      <p className="text-slate-700 dark:text-slate-200">
                        <span className="font-semibold">Amount:</span>{' '}
                        {currencyFmt(Number(tx.amount) || 0, tx.currency ?? payoutCurrency)}
                      </p>
                      <p className="text-slate-700 dark:text-slate-200">
                        <span className="font-semibold">Date:</span>{' '}
                        {new Date(tx.date).toLocaleDateString()}
                      </p>
                      <p className="text-slate-700 dark:text-slate-200 sm:col-span-3">
                        <span className="font-semibold">Description:</span> {tx.description}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-slate-500 dark:text-slate-400">No earnings found.</p>
              )}
            </div>

            {/* Recent Withdrawals (derived from transactions) */}
            <div className="space-y-3">
              <h3 className="text-xl font-bold text-primary">Withdrawal Activity</h3>
              {transactions.filter((t) => t.type?.startsWith('Withdrawal')).length > 0 ? (
                transactions
                  .filter((t) => t.type?.startsWith('Withdrawal'))
                  .slice(0, 10)
                  .map((tx) => (
                    <div
                      key={String(tx.id)}
                      className="p-4 rounded-2xl shadow-sm
                                 bg-white border border-slate-200
                                 dark:bg-[#0f1821] dark:border-[#182430]"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-y-1 gap-x-4 text-sm">
                        <p className="text-slate-700 dark:text-slate-200">
                          <span className="font-semibold">Type:</span> {tx.type}
                        </p>
                        <p className="text-slate-700 dark:text-slate-200">
                          <span className="font-semibold">Amount:</span>{' '}
                          {currencyFmt(
                            Math.abs(Number(tx.amount)),
                            String(tx.currency ?? payoutCurrency).toUpperCase()
                          )}
                        </p>
                        <p className="text-slate-700 dark:text-slate-200">
                          <span className="font-semibold">Status:</span> {tx.status || 'Pending'}
                        </p>
                        <p className="text-slate-700 dark:text-slate-200">
                          <span className="font-semibold">Date:</span>{' '}
                          {new Date(tx.date as unknown as string).toLocaleDateString()}
                        </p>
                      </div>
                      {tx.description && (
                        <p className="mt-1 text-slate-600 dark:text-slate-300 text-sm">
                          {tx.description}
                        </p>
                      )}
                    </div>
                  ))
              ) : (
                <p className="text-slate-500 dark:text-slate-400">No withdrawal activity yet.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Rating Modal */}
      {showRatingModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50">
          <div
            className="w-full max-w-md p-6 rounded-2xl shadow-xl
                          bg-white border border-slate-200
                          dark:bg-[#0f1821] dark:border-[#182430]"
          >
            <h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-slate-100">
              Rate Your Tutor
            </h2>
            <div className="mb-4">
              <label className="block mb-1 text-slate-700 dark:text-slate-300">Rating (1-5):</label>
              <input
                type="number"
                min={1}
                max={5}
                value={ratingData.rating}
                onChange={(e) => setRatingData({ ...ratingData, rating: e.target.value })}
                className="w-full p-3 rounded-xl
                           bg-slate-50 border border-slate-200 text-slate-900
                           dark:bg-[#0b1620] dark:border-[#182430] dark:text-slate-100"
              />
            </div>
            <div className="mb-4">
              <label className="block mb-1 text-slate-700 dark:text-slate-300">Comment:</label>
              <textarea
                value={ratingData.comment}
                onChange={(e) => setRatingData({ ...ratingData, comment: e.target.value })}
                className="w-full p-3 rounded-xl
                           bg-slate-50 border border-slate-200 text-slate-900
                           dark:bg-[#0b1620] dark:border-[#182430] dark:text-slate-100"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg font-semibold
                           bg-slate-200 text-slate-800 hover:bg-slate-300
                           dark:bg-[#122234] dark:text-slate-100 dark:hover:bg-[#16283a]"
                onClick={() => setShowRatingModal(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg font-semibold
                           bg-rose-600 text-white hover:bg-rose-700"
                onClick={handleReviewSubmission}
              >
                Submit Rating
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountSection;
