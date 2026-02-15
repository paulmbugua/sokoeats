'use client';

// apps/web-next/src/legacy-pages/LoginPage.web.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate, useLocation } from '@/lib/react-router-dom';
import useAuth from '@mytutorapp/shared/hooks/useAuth';
import { useShopContext } from '@mytutorapp/shared/context';
import CustomGoogleButtonLogin from '@/legacy-pages/CustomGoogleButtonLogin.web';
import { trackLogin, trackSignUp } from '../analytics/ga4';
import { COUNTRIES } from '@mytutorapp/shared/utils/countries';
import CountrySelect from '@/components/CountrySelect';
import { signOutCurrentUser } from '@mytutorapp/shared/utils/firebaseAuthWeb';
import GlobalAuthRedirect from '@/legacy-pages/GlobalAuthRedirect';

type AuthMode = 'Login' | 'Sign Up';
type ResetMode = 'idle' | 'requesting' | 'verifying';

const LOGIN_BG =
  'https://images.unsplash.com/photo-1513258496099-48168024aec0?q=80&w=2000&auto=format&fit=crop';

const NEED_ROLE_FLAG = 'auth:needsRole';
const GOOGLE_NAME_KEY = 'auth:googleName';
const RETURN_TO_SS_KEY = 'auth:returnTo';

const DEFAULT_RETURN_TO = '/profile/me';

const emailHash = (email: string) => {
  try {
    return btoa(email.trim().toLowerCase());
  } catch {
    return email.trim().toLowerCase();
  }
};

const safeSessionGet = (k: string) => {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSessionSet = (k: string, v: string) => {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(k, v);
  } catch {}
};
const safeSessionRemove = (k: string) => {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(k);
  } catch {}
};
const safeLocalGet = (k: string) => {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeLocalRemove = (k: string) => {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(k);
  } catch {}
};

/**
 * Avoid open redirects.
 * - Allow only internal paths like "/home", "/profile/me"
 * - Disallow "https://evil.com", "//evil.com", "javascript:..."
 */
const sanitizeInternalPath = (raw?: string | null) => {
  const s = (raw || '').trim();
  if (!s) return DEFAULT_RETURN_TO;

  // block scheme-based or protocol-relative URLs
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return DEFAULT_RETURN_TO; // "http:", "https:", "javascript:" etc
  if (s.startsWith('//')) return DEFAULT_RETURN_TO;

  // must be internal
  if (!s.startsWith('/')) return DEFAULT_RETURN_TO;

  // normalize
  return s.replace(/\/{2,}/g, '/');
};

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation() as any;

  // ---- computeNextFromLocation is SSR-safe (no window/localStorage usage)
  const computeNextFromLocation = (loc: any) => {
    const stateNext: string | undefined = loc?.state?.next;
    if (stateNext && typeof stateNext === 'string') return sanitizeInternalPath(stateNext);

    const from = loc?.state?.from;
    if (from && typeof from?.pathname === 'string') {
      const p = from.pathname ?? '';
      const s = from.search ?? '';
      const h = from.hash ?? '';
      return sanitizeInternalPath(`${p}${s}${h}`);
    }

    const qs = new URLSearchParams(loc?.search || '');
    const qNext = qs.get('next');
    if (qNext) return sanitizeInternalPath(qNext);

    return DEFAULT_RETURN_TO;
  };

  // ✅ store returnTo only after mount (client only)
  const initialReturnTo = useMemo(() => computeNextFromLocation(location), [location]);

  useEffect(() => {
    if (initialReturnTo) safeSessionSet(RETURN_TO_SS_KEY, initialReturnTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getReturnTo = useCallback(() => sanitizeInternalPath(safeSessionGet(RETURN_TO_SS_KEY)) || DEFAULT_RETURN_TO, []);
  const clearReturnTo = useCallback(() => safeSessionRemove(RETURN_TO_SS_KEY), []);

  const resolveConsumerTarget = useCallback((dest?: string | null) => {
    const raw = (dest || '').trim();
    if (!raw || raw === '/home') return DEFAULT_RETURN_TO;
    return sanitizeInternalPath(raw);
  }, []);

  const { token, role: userRole } = useShopContext();

  const {
    handleGoogleLoginSuccess,
    handleGoogleLoginFailure,
    loginWithEmail,
    registerWithEmail,
    sendResetOTP,
    resetPasswordWithOTP,
    isRoleModalNeeded,
    completeRole,
    clearAuthFlags,
  } = useAuth({
    alertFn: (msg) => console.log('[auth]', msg),
    navigateFn: (dest) => {
      const target = resolveConsumerTarget(dest || getReturnTo());
      clearReturnTo();
      navigate(target, { replace: true });
    },
  });

  // ─────────────────────────────────────────────────────────
  // Local UI state
  // ─────────────────────────────────────────────────────────
  const [authMode, setAuthMode] = useState<AuthMode>('Login');
  const [resetMode, setResetMode] = useState<ResetMode>('idle');
  const [otpSent, setOtpSent] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [name, setName] = useState('');
  const [role, setRole] = useState<'' | 'student' | 'tutor'>('');
  const [languages, setLanguages] = useState<string[]>([]);
  const [country, setCountry] = useState<string>('');

  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clearErrors = () => setError(null);

  // ─────────────────────────────────────────────────────────
  // FAST MODAL OPEN (SSR-safe)
  // ─────────────────────────────────────────────────────────
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const switchToIndividual = query.get('switch') === '1';
  const roleFlowParam = query.get('roleFlow');

  // ✅ SSR-stable initial state: URL only (no storage/hook)
  const [showRoleModal, setShowRoleModal] = useState<boolean>(() => roleFlowParam === '1');

  // ✅ After mount, sync from hook + localStorage flag
  useEffect(() => {
    const neededByHook = isRoleModalNeeded();
    const neededByLS = safeLocalGet(NEED_ROLE_FLAG) === '1';
    if (neededByHook || neededByLS) setShowRoleModal(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ After mount, also open if NEED_ROLE_FLAG in localStorage
  useEffect(() => {
    const needed = safeLocalGet(NEED_ROLE_FLAG) === '1';
    if (needed) setShowRoleModal(true);
  }, []);

  // Prefill name/language defaults on first mount
  useEffect(() => {
    const gName = safeSessionGet(GOOGLE_NAME_KEY);
    if (gName && !name) setName(gName);

    if (!languages.length) setLanguages(['English']);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to NEED_ROLE_FLAG changes (client-only)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== window.localStorage) return;
      if (e.key !== NEED_ROLE_FLAG) return;
      setShowRoleModal(safeLocalGet(NEED_ROLE_FLAG) === '1');
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (switchToIndividual) return;
    if (token && userRole) {
      const target = resolveConsumerTarget(getReturnTo());
      clearReturnTo();
      navigate(target, { replace: true });
    }
  }, [token, userRole, navigate, switchToIndividual, getReturnTo, clearReturnTo, resolveConsumerTarget]);

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLanguages([e.target.value]);
  };

  // ─────────────────────────────────────────────────────────
  // Email login / signup submit
  // ─────────────────────────────────────────────────────────
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();

    try {
      setBusy(true);

      if (authMode === 'Login') {
        if (!email || !password) {
          setError('Please enter email and password.');
          return;
        }
        await loginWithEmail({ email: email.trim(), password });
        trackLogin('email', { mode: 'consumer' });

        const target = resolveConsumerTarget(getReturnTo());
        clearReturnTo();
        navigate(target, { replace: true });
        return;
      }

      if (authMode === 'Sign Up') {
        const needsCountry = role === 'student';
        if (!name || !email || !password || !role || (needsCountry && !country)) {
          setError('Please fill all required fields.');
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          return;
        }

        await registerWithEmail({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          country: role === 'student' ? country : (undefined as any),
          languages: role === 'student' ? languages : (undefined as any),
        });

        trackSignUp('email', { mode: 'consumer', role, email_hash: emailHash(email) });

        const target = resolveConsumerTarget(getReturnTo());
        clearReturnTo();
        navigate(target, { replace: true });
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  // ─────────────────────────────────────────────────────────
  // Password reset flow
  // ─────────────────────────────────────────────────────────
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();

    if (!email) {
      setError('Please enter your account email.');
      return;
    }
    try {
      setBusy(true);
      await sendResetOTP(email.trim());
      setOtpSent(true);
      setResetMode('verifying');
    } catch (err: any) {
      setError(err?.message || 'Failed to send OTP');
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();

    if (!email || !otp || !newPassword) {
      setError('Please fill all fields.');
      return;
    }
    try {
      setBusy(true);
      await resetPasswordWithOTP(email.trim(), otp.trim(), newPassword);
      setResetMode('idle');
      setOtpSent(false);
      setAuthMode('Login');
      setPassword('');
      setOtp('');
      setNewPassword('');
    } catch (err: any) {
      setError(err?.message || 'Failed to reset password');
    } finally {
      setBusy(false);
    }
  };

  // ─────────────────────────────────────────────────────────
  // Role modal logic
  // ─────────────────────────────────────────────────────────
  const isStudent = role === 'student';
  const trimmedName = (name || '').trim();

  const isStudentValid =
    isStudent &&
    trimmedName.length >= 2 &&
    trimmedName.length <= 80 &&
    Array.isArray(languages) &&
    (languages[0] || '').trim().length > 0 &&
    country !== '';

  const canContinue = role === 'tutor' ? true : isStudentValid;
  const ctaText = role === 'tutor' ? 'Create account' : 'Create profile';

  const closeRoleFlowInstant = () => {
    setShowRoleModal(false);
    safeLocalRemove(NEED_ROLE_FLAG);
    safeSessionRemove(GOOGLE_NAME_KEY);
    safeSessionRemove('auth:busy');

    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('roleFlow');
      window.history.replaceState({}, '', url.toString());
    } catch {}
  };

  const submitRoleFromModal = async () => {
    clearErrors();

    if (!role) {
      setError('Please select a role.');
      return;
    }

    try {
      setBusy(true);
      if (role === 'tutor') {
        await completeRole({ role: 'tutor' } as any);
      } else if (isStudentValid) {
        await completeRole({
          role: 'student',
          name: trimmedName,
          languages,
          country,
        } as any);
      } else {
        setError('Please complete all required student fields.');
        return;
      }

      trackLogin('google', { mode: 'consumer', role });

      closeRoleFlowInstant();

      const target = resolveConsumerTarget(getReturnTo());
      clearReturnTo();
      navigate(target, { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Failed to update role');
    } finally {
      setBusy(false);
    }
  };

  const handleCancelRole = async () => {
    try {
      setBusy(false);
      closeRoleFlowInstant();
      clearAuthFlags();
      await signOutCurrentUser();
    } catch {
      // ignore
    } finally {
      navigate('/login', { replace: true });
    }
  };

  const primaryBtn =
    'inline-flex items-center justify-center rounded-xl h-11 px-5 bg-primary text-white font-semibold shadow-sm hover:shadow transition active:translate-y-[1px]';

  const emailFormTitle = useMemo(
    () => (authMode === 'Login' ? 'Login to DayBreak' : 'Create your DayBreak account'),
    [authMode]
  );

  // ─────────────────────────────────────────────────────────
  // UI (UNCHANGED BELOW)
  // ─────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen overflow-x-hidden text-darkText dark:text-darkTextPrimary">
      <GlobalAuthRedirect mode="consumer" />
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `linear-gradient(rgba(16,26,35,0.35), rgba(16,26,35,0.65)), url("${LOGIN_BG}")`,
        }}
      />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/25 blur-3xl dark:bg-secondary/25" />
        <div className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-softPink/20 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-stretch">
          {/* Brand / Benefits panel */}
          <aside className="hidden md:flex md:col-span-6">
            <div className="w-full rounded-2xl p-8 lg:p-10 bg-white/70 ring-1 ring-gray-200 shadow-sm backdrop-blur-sm dark:bg-[#0f1821]/70 dark:ring-darkCard">
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 text-primary dark:text-darkTextPrimary">
                  <svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true" className="h-full w-full">
                    <path d="M36.7273 44C33.9891 44 31.6043 39.8386 30.3636 33.69C29.123 39.8386 26.7382 44 24 44C21.2618 44 18.877 39.8386 17.6364 33.69C16.3957 39.8386 14.0109 44 11.2727 44C7.25611 44 4 35.0457 4 24C4 12.9543 7.25611 4 11.2727 4C14.0109 4 16.3957 8.16144 17.6364 14.31C18.877 8.16144 21.2618 4 24 4C26.7382 4 29.123 8.16144 30.3636 14.31C31.6043 8.16144 33.9891 4 36.7273 4C40.7439 4 44 12.9543 44 24C44 35.0457 40.7439 44 36.7273 44Z" />
                  </svg>
                </span>
                <h1 className="text-2xl font-display font-bold">Welcome back</h1>
              </div>

              <p className="mt-4 max-w-prose text-mutedGray dark:text-darkTextSecondary">
                Sign in to continue learning with top-rated tutors. Personalized sessions, flexible schedules, and real
                results—right at your fingertips.
              </p>

              <ul className="mt-6 space-y-4">
                {[
                  'Live, interactive lessons with experts',
                  'Tailored recommendations across subjects',
                  'Secure payments and transparent pricing',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary font-bold">
                      ✓
                    </span>
                    <span className="text-sm">{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 rounded-xl bg-gradient-to-br from-primary/15 to-secondary/20 p-4 ring-1 ring-primary/20 dark:ring-secondary/30">
                <p className="text-sm">
                  “I improved my grades within weeks. The sessions are fun and super effective!” —{' '}
                  <span className="font-semibold">Aisha, Student</span>
                </p>
              </div>

              <div className="mt-8">
                <Link to="/find-tutor" className={primaryBtn}>
                  Explore Tutors
                </Link>
              </div>
            </div>
          </aside>

          {/* Auth Card */}
          <section className="md:col-span-6 flex">
            <div className="w-full rounded-2xl bg-white ring-1 ring-gray-200 shadow-sm p-6 sm:p-8 lg:p-10 backdrop-blur-sm dark:bg-[#0f1821] dark:ring-darkCard">
              {error && (
                <div className="mb-4 rounded-lg bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200 px-3 py-2 text-sm">
                  {error}
                </div>
              )}

              {resetMode !== 'idle' ? (
                otpSent ? (
                  <form onSubmit={handleResetPassword} className="space-y-5">
                    <h2 className="text-xl font-display font-semibold text-center">Enter OTP</h2>
                    <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)} className="input" placeholder="Enter OTP" required />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="input"
                      placeholder="New Password (min. 8 characters)"
                      required
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="h-11 px-4 rounded-xl border border-black/10 dark:border-white/10"
                        onClick={() => {
                          setResetMode('idle');
                          setOtpSent(false);
                          setError(null);
                        }}
                      >
                        Back
                      </button>
                      <button type="submit" className={`${primaryBtn} flex-1`}>
                        Reset Password
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleSendOtp} className="space-y-5">
                    <h2 className="text-xl font-display font-semibold text-center">Reset Password</h2>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="Enter your email" required />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="h-11 px-4 rounded-xl border border-black/10 dark:border-white/10"
                        onClick={() => {
                          setResetMode('idle');
                          setError(null);
                        }}
                      >
                        Back
                      </button>
                      <button type="submit" className={`${primaryBtn} flex-1`}>
                        Send OTP
                      </button>
                    </div>
                  </form>
                )
              ) : (
                <form onSubmit={onSubmit} className="space-y-5">
                  <h2 className="text-xl font-display font-semibold text-center">{emailFormTitle}</h2>

                  {authMode === 'Sign Up' && (
                    <>
                      <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Full name" required />
                      <select value={role} onChange={(e) => setRole(e.target.value as 'student' | 'tutor')} className="input" required>
                        <option value="">Select role</option>
                        <option value="student">Student</option>
                        <option value="tutor">Tutor</option>
                      </select>

                      {role === 'student' && (
                        <CountrySelect value={country} onChange={setCountry} options={COUNTRIES} className="input" placeholder="Select your country" />
                      )}

                      {role === 'student' && (
                        <select value={languages[0] || ''} onChange={handleLanguageChange} className="input" required>
                          <option value="" disabled>
                            Select your language
                          </option>
                          <option value="English">English</option>
                          <option value="Swahili">Swahili</option>
                          <option value="French">French</option>
                          <option value="Spanish">Spanish</option>
                          <option value="German">German</option>
                        </select>
                      )}
                    </>
                  )}

                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="Email" required />
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="Password" required />

                  {authMode === 'Sign Up' && (
                    <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input" placeholder="Confirm password" required />
                  )}

                  <button type="submit" disabled={busy} className={`${primaryBtn} w-full ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}>
                    {authMode === 'Login' ? 'Login' : 'Sign Up'}
                  </button>

                  <div className="flex justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        clearErrors();
                        setResetMode('requesting');
                      }}
                      className="link"
                    >
                      Forgot password?
                    </button>
                    {authMode === 'Login' ? (
                      <button
                        type="button"
                        onClick={() => {
                          clearErrors();
                          setAuthMode('Sign Up');
                        }}
                        className="link"
                      >
                        Create account
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          clearErrors();
                          setAuthMode('Login');
                        }}
                        className="link"
                      >
                        Already have an account?
                      </button>
                    )}
                  </div>
                </form>
              )}

              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200 dark:bg-darkCard" />
                <span className="text-xs text-mutedGray dark:text-darkTextSecondary">OR</span>
                <div className="h-px flex-1 bg-gray-200 dark:bg-darkCard" />
              </div>

              <div className="flex justify-center">
                <CustomGoogleButtonLogin
                  onSuccess={handleGoogleLoginSuccess}
                  onFailure={handleGoogleLoginFailure}
                  mode="consumer"
                  returnTo={getReturnTo()}
                />
              </div>

              <p className="mt-6 text-center text-xs text-mutedGray dark:text-darkTextSecondary">
                By continuing, you agree to our{' '}
                <Link to="/terms" className="underline hover:text-primary">
                  Terms
                </Link>{' '}
                and{' '}
                <Link to="/privacy-policy" className="underline hover:text-primary">
                  Privacy Policy
                </Link>{' '}
                and{' '}
                <Link to="/refunds" className="underline hover:text-primary">
                  Refunds
                </Link>
                .
              </p>
              <p className="mt-2 text-center text-[11px] text-gray-500 dark:text-darkTextSecondary">
                Official DayBreak Learner page · support@daybreaklearner.com
              </p>
            </div>
          </section>
        </div>
      </div>

      {showRoleModal && (
        <div className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0f1821] p-6 shadow-xl ring-1 ring-black/5">
            <h2 className="text-xl font-display font-semibold text-center mb-4">
              {role === 'tutor' ? 'Finish creating your account' : 'Create your student profile'}
            </h2>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200 px-3 py-2 text-sm">
                {error}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitRoleFromModal();
              }}
              className="space-y-4"
            >
              <select
                value={role}
                onChange={(e) => {
                  const next = e.target.value as 'student' | 'tutor';
                  setRole(next);
                  if (next === 'student') {
                    if (!languages.length) setLanguages(['English']);
                    if (!(name || '').trim()) {
                      const gName = safeSessionGet(GOOGLE_NAME_KEY) || '';
                      if (gName) setName(gName);
                    }
                  } else {
                    setName('');
                    setLanguages([]);
                  }
                }}
                className="input"
                required
              >
                <option value="">Select role</option>
                <option value="student">Student</option>
                <option value="tutor">Tutor</option>
              </select>

              {role === 'student' && (
                <CountrySelect value={country} onChange={setCountry} options={COUNTRIES} className="input" placeholder="Select your country" />
              )}

              {role === 'student' && (
                <>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Full name" required />
                  <select value={languages[0] || ''} onChange={(e) => setLanguages([e.target.value])} className="input" required>
                    <option value="" disabled>
                      Select your language
                    </option>
                    <option value="English">English</option>
                    <option value="Swahili">Swahili</option>
                    <option value="French">French</option>
                    <option value="Spanish">Spanish</option>
                    <option value="German">German</option>
                  </select>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCancelRole}
                  className="inline-flex items-center justify-center rounded-xl h-11 px-5 w-1/2
                             border border-gray-300 text-gray-700 bg-white
                             hover:bg-gray-50 active:translate-y-[1px]
                             dark:bg-transparent dark:text-darkTextPrimary dark:border-darkCard"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={busy || !canContinue}
                  className={`inline-flex items-center justify-center rounded-xl h-11 px-5 w-1/2
                              bg-primary text-white font-semibold shadow-sm hover:shadow transition
                              active:translate-y-[1px] ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {busy ? 'Saving…' : ctaText}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;