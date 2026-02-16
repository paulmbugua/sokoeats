'use client';

// apps/web-next/src/legacy-pages/InstitutionLogin.web.tsx
import React, { useEffect, useMemo, useState, useCallback, useLayoutEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import useInstitutionAuth from '@mytutorapp/shared/hooks/useInstitutionAuth';
import CustomGoogleButtonLogin from '@/legacy-pages/CustomGoogleButtonLogin.web';
import { useShopContext } from '@mytutorapp/shared/context';
import { trackEvent, trackLogin, trackSignUp } from '../analytics/ga4';
import GlobalAuthRedirect from '@/legacy-pages/GlobalAuthRedirect';
import { siteUrl } from '@/lib/appOrigin';

const LOGIN_BG =
  'https://images.unsplash.com/photo-1513258496099-48168024aec0?q=80&w=2000&auto=format&fit=crop';

type AuthMode = 'Login' | 'Sign Up';
type ResetMode = 'idle' | 'requesting' | 'verifying';
type AccountKind = 'institution' | 'instructor' | 'learner';

const emailHash = (email: string) => {
  try {
    return btoa(email.trim().toLowerCase());
  } catch {
    return email.trim().toLowerCase();
  }
};

const InstitutionLogin: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { orgToken, hydrated } = useShopContext() as any;

  // ✅ Hydration safety: Next SSR + client storage tokens
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ✅ Query params (Next)
  const reauth = (searchParams?.get('reauth') || '').trim(); // e.g. "fees"
  const isFeesReauth = reauth === 'fees';
  const orgIdParam = (searchParams?.get('orgId') || searchParams?.get('org_id') || '').trim();
  const returnToParam = (searchParams?.get('returnTo') || searchParams?.get('return_to') || '').trim();

  const forcedKindRaw = (searchParams?.get('kind') || '').toLowerCase().trim();
  const forcedKind: AccountKind | null =
    forcedKindRaw === 'institution' || forcedKindRaw === 'instructor' || forcedKindRaw === 'learner'
      ? (forcedKindRaw as AccountKind)
      : null;

  const searchStr = useMemo(() => {
    const s = searchParams?.toString() || '';
    return s ? `?${s}` : '';
  }, [searchParams]);

  // ✅ If already authenticated, only redirect for normal login (NOT reauth)
  useLayoutEffect(() => {
    if (!mounted) return;
    if (!hydrated) return;
    if (orgToken && !reauth) router.replace('/org/profile');
  }, [orgToken, router, reauth, hydrated, mounted]);

  // —— Local state —— //
  const [authMode, setAuthMode] = useState<AuthMode>('Login');
  const [resetMode, setResetMode] = useState<ResetMode>('idle');
  const [otpSent, setOtpSent] = useState(false);

  // ✅ initialize accountKind from ?kind=... (or default institution)
  const [accountKind, setAccountKind] = useState<AccountKind>(forcedKind || 'institution');

  const [name, setName] = useState(''); // sign-up only
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clearErrors = () => setError(null);

  // ✅ When forcedKind changes (nav), sync state
  useEffect(() => {
    if (forcedKind && accountKind !== forcedKind) setAccountKind(forcedKind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcedKindRaw]);

  // ✅ Step-up mode: force Instructor + Login (no sign up, no reset screens)
  useEffect(() => {
    if (!isFeesReauth) return;
    setAccountKind('instructor');
    setAuthMode('Login');
    setResetMode('idle');
    setOtpSent(false);
    setName('');
    clearErrors();
  }, [isFeesReauth]);

  const canSignUp = accountKind === 'institution' && !isFeesReauth;

  // make sure we never stay in "Sign Up" for non-institution
  useEffect(() => {
    if (!canSignUp && authMode === 'Sign Up') setAuthMode('Login');
  }, [canSignUp, authMode]);

  const normalizeInternalDest = (d: string) => {
    // ✅ critical: kill legacy basename redirects
    if (d.startsWith('/app/')) return d.replace(/^\/app\//, '/');
    return d;
  };

  // —— Auth hook —— //
  const navigateAfterAuth = useCallback(
    (dest?: string) => {
      const clearReturnTo = () => {
        try {
          sessionStorage.removeItem('auth:returnTo');
          sessionStorage.removeItem('auth:returnTo:org');
        } catch {}
      };

      // must-change always wins
      try {
        if (sessionStorage.getItem('org:mustChangePassword') === '1') {
          clearReturnTo();
          router.replace('/org/change-password');
          return;
        }
      } catch {}

      const reauthQ = (searchParams?.get('reauth') || '').trim();
      const orgIdQ = (searchParams?.get('orgId') || searchParams?.get('org_id') || '').trim();
      const returnToQ = (searchParams?.get('returnTo') || searchParams?.get('return_to') || '').trim();

      // fees reauth unlock marker
      if (reauthQ === 'fees' && orgIdQ) {
        try {
          sessionStorage.setItem(`org:feesUnlock:${orgIdQ}`, String(Date.now()));
        } catch {}
      }

      // query returnTo first
      if (returnToQ) {
        clearReturnTo();
        router.replace(normalizeInternalDest(returnToQ));
        return;
      }

      // saved deep link
      try {
        const saved = sessionStorage.getItem('auth:returnTo');
        const savedOrg = sessionStorage.getItem('auth:returnTo:org');
        const finalSaved = saved || savedOrg || '';
        if (finalSaved) {
          clearReturnTo();
          router.replace(normalizeInternalDest(finalSaved));
          return;
        }
      } catch {}

      // invite code
      const inviteCode = searchParams?.get('code');
      if (inviteCode) {
        clearReturnTo();
        router.replace(`/org/join/${inviteCode}`);
        return;
      }

      // dest fallback
      if (dest) {
        clearReturnTo();
        router.replace(normalizeInternalDest(dest));
        return;
      }

      clearReturnTo();
      router.replace('/org/profile');
    },
    [router, searchParams]
  );

  const {
    handleGoogleLoginSuccess,
    handleGoogleLoginFailure,
    loginWithEmail,
    registerWithEmail,
    sendResetOTP,
    resetPasswordWithOTP,
  } = useInstitutionAuth({
    alertFn: (msg) => console.log('[org-auth]', msg),
    navigateFn: navigateAfterAuth,
  });

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
        trackEvent('org_login_start', {
          kind: accountKind,
          reauth: reauth || undefined,
          org_id: orgIdParam || undefined,
        });

        const extra =
          reauth && orgIdParam
            ? ({ reauth, orgId: orgIdParam } as any)
            : reauth
              ? ({ reauth } as any)
              : ({} as any);

        await loginWithEmail({ email: email.trim(), password, ...extra } as any);
        trackLogin('email', { mode: 'org', kind: accountKind, reauth: reauth || undefined });
        return;
      }

      if (!canSignUp) {
        setError('Sign up is only available for Institution accounts.');
        return;
      }

      if (!name || !email || !password || !confirmPassword) {
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
        role: 'owner',
      } as any);
      trackSignUp('institution', {
        mode: 'org',
        kind: 'institution',
        role: 'owner',
        email_hash: emailHash(email),
      });
    } catch (err: any) {
      setError(err?.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

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

  const onGoogleSuccess = useCallback(
    async (idToken: string) => {
      await handleGoogleLoginSuccess(idToken, name || undefined);
      trackLogin('google', { mode: 'org', kind: 'institution' });
    },
    [handleGoogleLoginSuccess, name]
  );

  const onGoogleFailure = useCallback(
    (err?: Error) => {
      handleGoogleLoginFailure(err);
    },
    [handleGoogleLoginFailure]
  );

  const primaryBtn =
    'inline-flex items-center justify-center rounded-xl h-11 px-5 bg-indigo-600 text-white font-semibold shadow-sm hover:shadow transition active:translate-y-[1px]';

  const labelForKind = (kind: AccountKind) =>
    kind === 'institution' ? 'Institution' : kind === 'instructor' ? 'Instructor' : 'Learner';

  const emailFormTitle = useMemo(() => {
    if (isFeesReauth) return 'Unlock Fees & balances';
    const base = labelForKind(accountKind);
    return authMode === 'Login' ? `${base} Login` : `Create your ${base} account`;
  }, [authMode, accountKind, isFeesReauth]);

  const accountOptions: { key: AccountKind; label: string; helper: string }[] = [
    { key: 'institution', label: 'Institution', helper: 'Admins & coordinators' },
    { key: 'instructor', label: 'Instructor', helper: 'Teachers & trainers' },
    { key: 'learner', label: 'Learner', helper: 'Learners in this institution' },
  ];

  const switchAccountKind = (kind: AccountKind) => {
    if (isFeesReauth) return;
    setAccountKind(kind);
    clearErrors();
    setResetMode('idle');
  };

  const effectiveResetMode: ResetMode = isFeesReauth ? 'idle' : resetMode;

  return (
    <div className="relative min-h-screen overflow-hidden text-darkText dark:text-darkTextPrimary">
      <GlobalAuthRedirect mode="institution" />

      {/* BG */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `linear-gradient(rgba(16,26,35,0.35), rgba(16,26,35,0.65)), url("${LOGIN_BG}")`,
        }}
      />

      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-indigo-400/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl" />

      {/* Content */}
      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-stretch">
          {/* Left */}
          <aside className="hidden md:flex md:col-span-6">
            <div className="w-full rounded-2xl p-8 lg:p-10 bg-white/70 ring-1 ring-gray-200 shadow-sm backdrop-blur-sm dark:bg-[#0f1821]/70 dark:ring-darkCard">
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 text-indigo-600">
                  <svg viewBox="0 0 48 48" fill="currentColor" className="h-full w-full" aria-hidden>
                    <path d="M36.7273 44C33.9891 44 31.6043 39.8386 30.3636 33.69C29.123 39.8386 26.7382 44 24 44C21.2618 44 18.877 39.8386 17.6364 33.69C16.3957 39.8386 14.0109 44 11.2727 44C7.25611 44 4 35.0457 4 24C4 12.9543 7.25611 4 11.2727 4C14.0109 4 16.3957 8.16144 17.6364 14.31C18.877 8.16144 21.2618 4 24 4C26.7382 4 29.123 8.16144 30.3636 14.31C31.6043 8.16144 33.9891 4 36.7273 4C40.7439 4 44 12.9543 44 24C44 35.0457 40.7439 44 36.7273 44Z" />
                  </svg>
                </span>
                <h1 className="text-2xl font-display font-bold">Institution Portal</h1>
              </div>

              <p className="mt-4 text-sm text-gray-700 dark:text-darkTextSecondary">
                This login is for institutions, instructors, and students using your organization&apos;s DayBreak portal.
              </p>

              <ul className="mt-6 space-y-3 text-sm">
                <li>• Exam Results &amp; Reports cards</li>
                <li>• Custom certificates &amp; branding</li>
                <li>• Timed assignments &amp; pass marks</li>
                <li>• Termly &amp; yearly analytics</li>
              </ul>

              <div className="mt-8 text-sm">
                Need a regular DayBreak account?{' '}
                <Link href="/login?switch=1" className="underline hover:text-indigo-600">
                  Sign in as Learner/Tutor
                </Link>
              </div>
            </div>
          </aside>

          {/* Right */}
          <section className="md:col-span-6 flex">
            <div className="w-full rounded-2xl bg-white ring-1 ring-gray-200 shadow-sm p-6 sm:p-8 lg:p-10 backdrop-blur-sm dark:bg-[#0f1821] dark:ring-darkCard">
              {isFeesReauth && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 px-3 py-2 text-xs">
                  🔒 Fees &amp; balances is protected. Please re-enter the <b>Instructor</b> login to continue.
                  {!!returnToParam && (
                    <div className="mt-1 opacity-80">You will be returned to your fees page after login.</div>
                  )}
                </div>
              )}

              {!isFeesReauth && (
                <div className="mb-5">
                  <p className="text-xs font-medium text-gray-500 dark:text-darkTextSecondary mb-2 text-center">
                    Who is logging in?
                  </p>
                  <div className="flex justify-center">
                    <div className="inline-flex rounded-full bg-gray-100 dark:bg-[#101826] p-1 gap-1">
                      {accountOptions.map((opt) => {
                        const selected = accountKind === opt.key;
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => switchAccountKind(opt.key)}
                            className={`flex items-center px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition ${
                              selected
                                ? 'bg-white text-indigo-600 shadow-sm dark:bg-[#1b2430]'
                                : 'text-gray-600 hover:bg-white/60 dark:text-darkTextSecondary dark:hover:bg-[#151c26]'
                            }`}
                          >
                            <span
                              className={`mr-2 inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${
                                selected
                                  ? 'border-indigo-500 bg-indigo-500 text-white'
                                  : 'border-gray-400 bg-transparent text-transparent'
                              }`}
                            >
                              {selected ? '✓' : '•'}
                            </span>
                            <span>{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="mb-4 rounded-lg bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200 px-3 py-2 text-sm">
                  {error}
                </div>
              )}

              {effectiveResetMode !== 'idle' ? (
                otpSent ? (
                  <form onSubmit={handleResetPassword} className="space-y-5">
                    <h2 className="text-xl font-display font-semibold text-center">Enter OTP</h2>
                    <input
                      className="input"
                      placeholder="Enter OTP"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      required
                    />
                    <input
                      className="input"
                      placeholder="New Password (min. 8 characters)"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
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
                    <input
                      className="input"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
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
                    <input
                      className="input"
                      placeholder="Full name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  )}

                  <input
                    className="input"
                    type="email"
                    placeholder={isFeesReauth ? 'Instructor email' : 'Email'}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <input
                    className="input"
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />

                  {authMode === 'Sign Up' && (
                    <input
                      className="input"
                      type="password"
                      placeholder="Confirm password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  )}

                  <button
                    type="submit"
                    disabled={busy}
                    className={`${primaryBtn} w-full ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {authMode === 'Login' ? (isFeesReauth ? 'Unlock fees' : 'Login') : 'Sign Up'}
                  </button>

                  {!isFeesReauth && (
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

                      {canSignUp &&
                        (authMode === 'Login' ? (
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
                        ))}
                    </div>
                  )}

                  {!isFeesReauth && accountKind !== 'institution' && (
                    <p className="mt-3 text-[11px] text-gray-500 dark:text-darkTextSecondary text-center">
                      Instructors and learners: please log in using the email/ID and password shared by your school or the invite link.
                    </p>
                  )}

                  {isFeesReauth && (
                    <p className="mt-3 text-[11px] text-gray-600 dark:text-darkTextSecondary text-center">
                      Tip: this is a quick security check for sensitive fee actions.
                    </p>
                  )}
                </form>
              )}

              {/* Google login only for Institution (not in fees reauth) */}
              {accountKind === 'institution' && !isFeesReauth && (
                <>
                  <div className="my-6 flex items-center gap-3">
                    <div className="h-px flex-1 bg-gray-200 dark:bg-darkCard" />
                    <span className="text-xs text-gray-500 dark:text-darkTextSecondary">OR</span>
                    <div className="h-px flex-1 bg-gray-200 dark:bg-darkCard" />
                  </div>
                  <div className="flex justify-center">
                    <CustomGoogleButtonLogin
                      onSuccess={onGoogleSuccess}
                      onFailure={onGoogleFailure}
                      mode="institution"
                      returnTo={pathname ? `${pathname}${searchStr}` : `/institutions/login${searchStr}`}
                    />
                  </div>
                </>
              )}

              {/* Mobile-only helper link */}
              <div className="mt-6 text-center text-sm md:hidden">
                Need a normal DayBreak account?{' '}
                <Link href="/login?switch=1" className="underline hover:text-indigo-600">
                  Sign in as Learner/Tutor
                </Link>
              </div>

              <p className="mt-6 text-center text-xs text-gray-500 dark:text-darkTextSecondary">
                By continuing, you agree to our{' '}
                <Link href="/terms" className="underline hover:text-indigo-600">
                  Terms
                </Link>{' '}
                and{' '}
                <Link href="/privacy-policy" className="underline hover:text-indigo-600">
                  Privacy Policy
                </Link>{' '}
                and{' '}
                <Link href="/refunds" className="underline hover:text-primary">
                  Refunds
                </Link>
                .
              </p>
              <p className="mt-2 text-center text-[11px] text-gray-500 dark:text-darkTextSecondary">
                Official DayBreak Learner page · support@daybreaklearner.com
              </p>

              {/* Optional: explicit canonical login escape hatch */}
              {!mounted ? null : !hydrated ? null : null}
            </div>
          </section>
        </div>
      </div>

      {/* If someone hits this page without any Next routing (rare), force canonical */}
      {!mounted ? null : (
        <noscript>
          <meta httpEquiv="refresh" content={`0;url=${siteUrl('/institutions/login')}`} />
        </noscript>
      )}
    </div>
  );
};

export default InstitutionLogin;