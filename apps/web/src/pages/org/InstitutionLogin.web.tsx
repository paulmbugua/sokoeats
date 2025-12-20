// apps/web/src/pages/org/InstitutionLogin.web.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import useInstitutionAuth from '@mytutorapp/shared/hooks/useInstitutionAuth';
import CustomGoogleLoginButton from '../../components/CustomGoogleLoginButton';
import { useShopContext } from '@mytutorapp/shared/context';

const LOGIN_BG =
  'https://images.unsplash.com/photo-1513258496099-48168024aec0?q=80&w=2000&auto=format&fit=crop';

type AuthMode = 'Login' | 'Sign Up';
type ResetMode = 'idle' | 'requesting' | 'verifying';
type AccountKind = 'institution' | 'instructor' | 'learner';

const InstitutionLogin: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const { orgToken } = useShopContext() as any;

  // If already authenticated as an institution member, go via /org router
  useEffect(() => {
    if (orgToken) navigate('/org', { replace: true });
  }, [orgToken, navigate]);

  // —— Local state —— //
  const [authMode, setAuthMode] = useState<AuthMode>('Login');
  const [resetMode, setResetMode] = useState<ResetMode>('idle');
  const [otpSent, setOtpSent] = useState(false);

  const [accountKind, setAccountKind] = useState<AccountKind>('institution'); // Institution | Instructor | Student

  const [name, setName] = useState(''); // sign-up only
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clearErrors = () => setError(null);
  const canSignUp = accountKind === 'institution';

  // make sure we never stay in "Sign Up" for non-institution
  useEffect(() => {
    if (!canSignUp && authMode === 'Sign Up') {
      setAuthMode('Login');
    }
  }, [canSignUp, authMode]);

  // —— Auth hook —— //
  const navigateAfterAuth = useCallback(() => {
    // 1) Prefer an explicit returnTo from the invite flow
    try {
      const saved = sessionStorage.getItem('auth:returnTo');
      if (saved) {
        sessionStorage.removeItem('auth:returnTo');
        navigate(saved, { replace: true });
        return;
      }
    } catch {
      // ignore storage errors and fall through
    }

    // 2) If there’s an invite code in the URL, go back to that invite
    const search = new URLSearchParams(location.search);
    const inviteCode = search.get('code');
    if (inviteCode) {
      navigate(`/org/join/${inviteCode}`, { replace: true });
      return;
    }

    // 3) Default: normal institution flow
    navigate('/org', { replace: true });
  }, [navigate, location.search]);

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
        await loginWithEmail({ email: email.trim(), password });
        // navigateFn in hook will route to /org
      } else {
        if (!name || !email || !password || !confirmPassword) {
          setError('Please fill all required fields.');
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          return;
        }

        // Map selected tab → org role hint (your backend can use this)
        const roleHint: string =
          accountKind === 'institution'
            ? 'owner'
            : accountKind === 'instructor'
              ? 'instructor'
              : 'learner'; // student

        await registerWithEmail({
          name: name.trim(),
          email: email.trim(),
          password,
          role: roleHint,
        } as any);
        // navigateFn in hook will route to /org
      }
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
      // (If needed later, you can also let the backend infer role from this selection)
      await handleGoogleLoginSuccess(idToken, name || undefined);
      // navigateFn in hook will route to /org
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
    const base = labelForKind(accountKind);
    return authMode === 'Login' ? `${base} Login` : `Create your ${base} account`;
  }, [authMode, accountKind]);

  const accountOptions: { key: AccountKind; label: string; helper: string }[] = [
    {
      key: 'institution',
      label: 'Institution',
      helper: 'Admins & coordinators',
    },
    {
      key: 'instructor',
      label: 'Instructor',
      helper: 'Teachers & trainers',
    },
    {
      key: 'learner', // ✅ lowercase to match AccountKind
      label: 'Learner', // ✅ display text can stay capitalized
      helper: 'Learners in this institution',
    },
  ];

  const switchAccountKind = (kind: AccountKind) => {
    setAccountKind(kind);
    clearErrors();
    setResetMode('idle');
  };

  return (
    <div className="relative min-h-screen overflow-hidden text-darkText dark:text-darkTextPrimary">
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
          {/* Left: copy for institutions (desktop only) */}
          <aside className="hidden md:flex md:col-span-6">
            <div className="w-full rounded-2xl p-8 lg:p-10 bg-white/70 ring-1 ring-gray-200 shadow-sm backdrop-blur-sm dark:bg-[#0f1821]/70 dark:ring-darkCard">
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 text-indigo-600">
                  <svg
                    viewBox="0 0 48 48"
                    fill="currentColor"
                    className="h-full w-full"
                    aria-hidden
                  >
                    <path d="M36.7273 44C33.9891 44 31.6043 39.8386 30.3636 33.69C29.123 39.8386 26.7382 44 24 44C21.2618 44 18.877 39.8386 17.6364 33.69C16.3957 39.8386 14.0109 44 11.2727 44C7.25611 44 4 35.0457 4 24C4 12.9543 7.25611 4 11.2727 4C14.0109 4 16.3957 8.16144 17.6364 14.31C18.877 8.16144 21.2618 4 24 4C26.7382 4 29.123 8.16144 30.3636 14.31C31.6043 8.16144 33.9891 4 36.7273 4C40.7439 4 44 12.9543 44 24C44 35.0457 40.7439 44 36.7273 44Z" />
                  </svg>
                </span>
                <h1 className="text-2xl font-display font-bold">Institution Portal</h1>
              </div>

              <p className="mt-4 text-sm text-gray-700 dark:text-darkTextSecondary">
                This login is for institutions, instructors, and students using your
                organization&apos;s DayBreak portal.
              </p>

              <ul className="mt-6 space-y-3 text-sm">
                <li>• Exam Results &amp; Reports cards</li>
                <li>• Custom certificates &amp; branding</li>
                <li>• Timed assignments &amp; pass marks</li>
                <li>• Termly &amp; yearly analytics</li>
              </ul>

              <div className="mt-8 text-sm">
                Need a regular DayBreak account?{' '}
                <Link to="/login?switch=1" className="underline hover:text-indigo-600">
                  Sign in as Learner/Tutor
                </Link>
              </div>
            </div>
          </aside>

          {/* Right: auth card */}
          <section className="md:col-span-6 flex">
            <div className="w-full rounded-2xl bg-white ring-1 ring-gray-200 shadow-sm p-6 sm:p-8 lg:p-10 backdrop-blur-sm dark:bg-[#0f1821] dark:ring-darkCard">
              {/* Account type toggle: Institution | Instructor | Student */}
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

              {error && (
                <div className="mb-4 rounded-lg bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200 px-3 py-2 text-sm">
                  {error}
                </div>
              )}

              {/* Forms */}
              {resetMode !== 'idle' ? (
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
                    <h2 className="text-xl font-display font-semibold text-center">
                      Reset Password
                    </h2>
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
                  <h2 className="text-xl font-display font-semibold text-center">
                    {emailFormTitle}
                  </h2>

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
                    placeholder="Email"
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
                  {accountKind !== 'institution' && (
                    <p className="mt-3 text-[11px] text-gray-500 dark:text-darkTextSecondary text-center">
                      Instructors and learners: please log in using the email/ID and password shared
                      by your school or the invite link.
                    </p>
                  )}
                </form>
              )}

              {accountKind === 'institution' && (
                <>
                  {/* Divider / Google */}
                  <div className="my-6 flex items-center gap-3">
                    <div className="h-px flex-1 bg-gray-200 dark:bg-darkCard" />
                    <span className="text-xs text-gray-500 dark:text-darkTextSecondary">OR</span>
                    <div className="h-px flex-1 bg-gray-200 dark:bg-darkCard" />
                  </div>
                  <div className="flex justify-center">
                    <CustomGoogleLoginButton
                      onSuccess={onGoogleSuccess}
                      onFailure={onGoogleFailure}
                    />
                  </div>
                </>
              )}

              {/* Mobile-only helper link */}
              <div className="mt-6 text-center text-sm md:hidden">
                Need a normal DayBreak account?{' '}
                <Link to="/login?switch=1" className="underline hover:text-indigo-600">
                  Sign in as Learner/Tutor
                </Link>
              </div>

              <p className="mt-6 text-center text-xs text-gray-500 dark:text-darkTextSecondary">
                By continuing, you agree to our{' '}
                <Link to="/terms" className="underline hover:text-indigo-600">
                  Terms
                </Link>{' '}
                and{' '}
                <Link to="/privacy-policy" className="underline hover:text-indigo-600">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default InstitutionLogin;
