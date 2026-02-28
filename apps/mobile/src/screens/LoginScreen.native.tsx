// apps/mobile/src/screens/LoginScreen.native.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, StackActions, useRoute, type RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { FontAwesome } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import tw from '../../tailwind';
import { assets } from '../../assets/assets';
import useAuth from '@myhandymanapp/shared/hooks/useAuth';
import CustomGoogleLoginButtonNative from './CustomGoogleLoginButton.native';
import { useShopContext } from '@myhandymanapp/shared/context';
import type { MainStackParamList } from '../navigation/types';
import { COUNTRIES } from '@myhandymanapp/shared/utils/countries';
import SelectField, { type Option } from './SelectField.native';

// 🔹 parity with web (Cancel role flow)
import { signOut } from 'firebase/auth';
import { getAuthOrThrow } from '@myhandymanapp/shared/utils/firebaseConfig';
import { useThemePref } from '../theme/ThemeContext';

type LoginNavProp = StackNavigationProp<MainStackParamList>;
type LoginRoute = RouteProp<MainStackParamList, 'Login'>;

type AuthMode = 'Login' | 'Sign Up';
type ResetMode = 'idle' | 'requesting' | 'verifying';
type Role = '' | 'student' | 'tutor';

const LoginScreenNative: React.FC = () => {
  const navigation = useNavigation<LoginNavProp>();
  const route = useRoute<LoginRoute>();
  const { token, role: userRole, logout } = useShopContext() as any;

  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useThemePref();

  const FOOTER_OFFSET = 80; // extra padding so nothing is hidden behind global footer
  const bottomPad = Math.max(insets.bottom, 16);
  const topPad = Math.max(insets.top, 12);

  // 🚦 Switching flag (from InstitutionLogin link)
  const switching = route?.params?.switch === true || route?.params?.force === true;

  // ── Local UI state ────────────────────────────────────────
  const [authMode, setAuthMode] = useState<AuthMode>('Login');
  const [resetMode, setResetMode] = useState<ResetMode>('idle');
  const [otpSent, setOtpSent] = useState<boolean>(false);

  // Basic fields
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  // Sign-up & Role modal fields
  const [name, setName] = useState<string>('');
  const [role, setRole] = useState<Role>('');
  const [languages, setLanguages] = useState<string[]>([]);
  const [country, setCountry] = useState<string>(''); // students only

  // OTP/reset fields
  const [otp, setOtp] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');

  // UX
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);

  // Google-first role completion modal
  const [showRoleModal, setShowRoleModal] = useState<boolean>(false);

  /* ──────────────────────────────────────────────
     Theme-aware text colours (parity with ManageProfileForm)
  ─────────────────────────────────────────────── */

  const placeholderColor = resolvedScheme === 'dark' ? '#64748B' : '#94A3B8';
  const selectedTextColor = resolvedScheme === 'dark' ? '#E5E7EB' : '#0F172A';

  // Normalize countries that might be {code,name}, {value,label}, or [code,name]
  const normCountry = (c: any) => {
    const code = c?.code ?? c?.value ?? c?.[0] ?? '';
    const name = c?.name ?? c?.label ?? c?.[1] ?? '';
    return { code: String(code), name: String(name) };
  };

  const languageOptions = useMemo(
    () =>
      ['English', 'Swahili', 'French', 'Spanish', 'German'].map((lang) => ({
        label: lang,
        value: lang,
      })),
    []
  );

  const countryOptions = useMemo(
    () =>
      COUNTRIES.map((c) => {
        const { code, name } = normCountry(c);
        return {
          label: name || '—',
          value: code || name,
        };
      }),
    []
  );

  // ── Auth hook ─────────────────────────────────────────────
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
    alertFn: (msg: string) => Alert.alert('Alert', msg),
    navigateFn: (dest?: string) => {
      try {
        if (dest) {
          navigation.dispatch(StackActions.replace(dest as keyof MainStackParamList));
          return;
        }
      } catch {
        /* ignore */
      }
      navigation.dispatch(StackActions.replace('Home'));
    },
  });

  // Fast open role modal if needed (Google) + prefill name/language for student parity with web
  useEffect(() => {
    if (isRoleModalNeeded()) {
      setShowRoleModal(true);
      if (!languages.length) setLanguages(['English']); // default language
      const gName = auth?.currentUser?.displayName || '';
      if (gName && !name) setName(gName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If already authenticated and someone opens /login, bounce home — EXCEPT when switching
  useEffect(() => {
    if (token && userRole && !showRoleModal && !switching) {
      navigation.dispatch(StackActions.replace('Home'));
    }
  }, [token, userRole, showRoleModal, navigation, switching]);

  const isLogin = authMode === 'Login';
  const clearErrors = () => setError(null);

  // ── Email login / signup submit ───────────────────────────
  const onSubmit = async () => {
    clearErrors();
    try {
      setBusy(true);

      if (authMode === 'Login') {
        if (!email || !password) {
          setError('Please enter email and password.');
          return;
        }
        await loginWithEmail({ email: email.trim(), password });
        navigation.dispatch(StackActions.replace('Home'));
        return;
      }

      // Sign Up
      const needsCountry = role === 'student';
      if (!name || !email || !password || !role || (needsCountry && !country)) {
        setError('Please fill all required fields.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      if (role === 'student') {
        if (!languages.length || !(languages[0] || '').trim()) {
          setError('Please select your language.');
          return;
        }
      }

      await registerWithEmail({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        country: role === 'student' ? country : (undefined as any),
        // age removed
        languages: role === 'student' ? languages : (undefined as any),
      });

      navigation.dispatch(StackActions.replace('Home'));
    } catch (err) {
      const msg =
        typeof err === 'object' && err && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Authentication failed';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  // ── Password reset flow (OTP) ─────────────────────────────
  const handleSendOtp = async () => {
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
    } catch (err) {
      const msg =
        typeof err === 'object' && err && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Failed to send OTP';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async () => {
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
    } catch (err) {
      const msg =
        typeof err === 'object' && err && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Failed to reset password';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  // ── Role modal logic (Google-first) ───────────────────────
  const isStudent = role === 'student';
  const trimmedName = (name || '').trim();
  const isStudentValid =
    isStudent &&
    trimmedName.length >= 2 &&
    trimmedName.length <= 80 &&
    Array.isArray(languages) &&
    languages.length > 0 &&
    (languages[0] || '').trim().length > 0 &&
    country !== '';

  const canContinue = role === 'tutor' ? true : isStudentValid;
  const ctaText = role === 'tutor' ? 'Create account' : 'Create profile';

  const safeFirebaseSignOut = async () => {
  try {
    const auth = await getAuthOrThrow();
    await signOut(auth);
  } catch {
    // ignore
  }
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
          // age removed
          languages,
          country,
        } as any);
      } else {
        setError('Please complete all required student fields.');
        return;
      }
      setShowRoleModal(false);
      navigation.dispatch(StackActions.replace('Home'));
    } catch (err) {
      const msg =
        typeof err === 'object' && err && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Failed to update role';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  // Cancel role modal: clear pending auth + fully sign out (parity with web)
  const handleCancelRole = async () => {
  try {
    setBusy(false);
    setShowRoleModal(false);
    clearAuthFlags();
    await safeFirebaseSignOut();
  } catch {
    // ignore
  }
};

const handleSwitchSignOut = async () => {
  try {
    await logout?.();
  } catch {}
  await safeFirebaseSignOut();
};


  const emailFormTitle = useMemo(
    () => (authMode === 'Login' ? 'Welcome back 👋' : 'Create your DayBreak account'),
    [authMode]
  );

  // ⬇️ UI
  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#050913]`} edges={['top', 'bottom']}>
      {/* Soft background orbs for a modern look */}
      <View style={tw`absolute inset-0`}>
        <View
          style={tw`absolute -top-16 -right-10 h-40 w-40 rounded-full bg-pink-500/15 dark:bg-pink-500/10`}
        />
        <View
          style={tw`absolute -bottom-24 -left-16 h-48 w-48 rounded-full bg-sky-500/10 dark:bg-sky-500/10`}
        />
      </View>

      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={[
          tw`flex-grow`,
          {
            paddingTop: topPad,
            paddingHorizontal: 20,
            paddingBottom: bottomPad + FOOTER_OFFSET, // ✅ keeps last items above footer
          },
        ]}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={tw`flex-1 items-center justify-center`}>
          <View style={{ width: '100%', maxWidth: 520 }}>
            {/* Logo + app name */}
            <View style={tw`items-center mb-6`}>
              <TouchableOpacity onPress={() => navigation.dispatch(StackActions.replace('Home'))}>
                <Image source={assets.logo} style={tw`h-16 w-16 mb-2`} resizeMode="contain" />
              </TouchableOpacity>
              <Text
                style={tw`text-xs tracking-[2px] uppercase text-pink-500/80 dark:text-pink-400`}
              >
                DayBreak Learner
              </Text>
            </View>

            {/* Hero copy */}
            <View style={tw`mb-5 items-center`}>
              <Text style={tw`text-2xl font-extrabold text-[#0d141c] dark:text-white`}>
                {emailFormTitle}
              </Text>
              <Text style={tw`mt-1 text-sm text-slate-500 dark:text-slate-400 text-center`}>
                {authMode === 'Login'
                  ? 'Continue your learning journey in a few taps.'
                  : 'Just a few details to get you learning.'}
              </Text>
            </View>

            {/* Error banner */}
            {error && (
              <View style={tw`mb-4 rounded-xl bg-red-600/10 px-3 py-2 border border-red-600/30`}>
                <Text style={tw`text-red-400 text-sm`}>{error}</Text>
              </View>
            )}

            {/* Switch account notice */}
            {switching && token && (
              <View
                style={tw`mb-4 rounded-xl bg-amber-500/10 px-3 py-2 border border-amber-500/30`}
              >
                <Text style={tw`text-amber-300 text-xs`}>
                  You’re currently signed in. Continue to switch account or{' '}
                  <Text onPress={handleSwitchSignOut} style={tw`underline font-semibold`}>
                    sign out
                  </Text>
                  .
                </Text>
              </View>
            )}

            {/* Auth mode toggle pill (only when not in reset flow) */}
            {resetMode === 'idle' && (
              <View style={tw`mb-4 flex-row bg-slate-100 dark:bg-[#0b1016] rounded-full p-1`}>
                <TouchableOpacity
                  onPress={() => {
                    clearErrors();
                    setAuthMode('Login');
                  }}
                  style={tw.style(
                    'flex-1 h-9 rounded-full items-center justify-center',
                    authMode === 'Login' ? 'bg-white dark:bg-slate-900 shadow' : ''
                  )}
                >
                  <Text
                    style={tw.style(
                      'text-xs font-semibold',
                      authMode === 'Login'
                        ? 'text-pink-600 dark:text-pink-400'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    Login
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    clearErrors();
                    setAuthMode('Sign Up');
                  }}
                  style={tw.style(
                    'flex-1 h-9 rounded-full items-center justify-center',
                    authMode === 'Sign Up' ? 'bg-white dark:bg-slate-900 shadow' : ''
                  )}
                >
                  <Text
                    style={tw.style(
                      'text-xs font-semibold',
                      authMode === 'Sign Up'
                        ? 'text-pink-600 dark:text-pink-400'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    Sign Up
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Forms card */}
            {resetMode !== 'idle' ? (
              otpSent ? (
                // === Enter OTP ===
                <View
                  style={tw`bg-white/95 dark:bg-[#0f1821]/95 p-6 rounded-2xl border border-[#cedbe8] dark:border-white/10 shadow-lg`}
                >
                  <Text style={tw`text-2xl font-bold text-[#0d141c] dark:text-white mb-4`}>
                    Enter OTP
                  </Text>
                  <TextInput
                    value={otp}
                    onChangeText={setOtp}
                    placeholder="Enter OTP"
                    placeholderTextColor={placeholderColor}
                    style={tw`bg-slate-100 dark:bg-[#0b1016] border border-[#cedbe8] dark:border-white/10 px-3 py-3 rounded-xl text-[#0d141c] dark:text-white mb-4`}
                    keyboardType="numeric"
                  />
                  <TextInput
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="New Password (min. 8 characters)"
                    placeholderTextColor={placeholderColor}
                    secureTextEntry
                    style={tw`bg-slate-100 dark:bg-[#0b1016] border border-[#cedbe8] dark:border-white/10 px-3 py-3 rounded-xl text-[#0d141c] dark:text-white mb-4`}
                  />

                  <View style={tw`flex-row gap-2`}>
                    <TouchableOpacity
                      onPress={() => {
                        setResetMode('idle');
                        setOtpSent(false);
                        setError(null);
                      }}
                      style={tw`flex-1 h-11 rounded-xl bg-slate-100 dark:bg-[#0b1016] border border-[#cedbe8] dark:border-white/10 items-center justify-center`}
                    >
                      <Text style={tw`text-[#0d141c] dark:text-white`}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleResetPassword}
                      disabled={busy}
                      style={tw`flex-1 h-11 rounded-xl bg-pink-600 items-center justify-center ${
                        busy ? 'opacity-60' : ''
                      }`}
                    >
                      <View style={tw`flex-row items-center justify-center`}>
                        {busy ? (
                          <ActivityIndicator size="small" color="#fff" style={tw`mr-2`} />
                        ) : null}
                        <Text style={tw`text-white font-semibold`}>Reset Password</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                // === Request OTP ===
                <View
                  style={tw`bg-white/95 dark:bg-[#0f1821]/95 p-6 rounded-2xl border border-[#cedbe8] dark:border-white/10 shadow-lg`}
                >
                  <Text style={tw`text-2xl font-bold text-[#0d141c] dark:text-white mb-2`}>
                    Reset Password
                  </Text>
                  <Text style={tw`text-xs text-slate-500 dark:text-slate-400 mb-4`}>
                    We’ll send a one-time code to your email.
                  </Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Enter your email"
                    placeholderTextColor={placeholderColor}
                    keyboardType="email-address"
                    style={tw`bg-slate-100 dark:bg-[#0b1016] border border-[#cedbe8] dark:border-white/10 px-3 py-3 rounded-xl text-[#0d141c] dark:text-white mb-4`}
                  />

                  <View style={tw`flex-row gap-2`}>
                    <TouchableOpacity
                      onPress={() => {
                        setResetMode('idle');
                        setError(null);
                      }}
                      style={tw`flex-1 h-11 rounded-xl bg-slate-100 dark:bg-[#0b1016] border border-[#cedbe8] dark:border-white/10 items-center justify-center`}
                    >
                      <Text style={tw`text-[#0d141c] dark:text-white`}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSendOtp}
                      disabled={busy}
                      style={tw`flex-1 h-11 rounded-xl bg-pink-600 items-center justify-center ${
                        busy ? 'opacity-60' : ''
                      }`}
                    >
                      <View style={tw`flex-row items-center justify-center`}>
                        {busy ? (
                          <ActivityIndicator size="small" color="#fff" style={tw`mr-2`} />
                        ) : null}
                        <Text style={tw`text-white font-semibold`}>Send OTP</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              )
            ) : (
              // === Login / Sign-Up ===
              <View
                style={tw`bg-white/95 dark:bg-[#0f1821]/95 p-6 rounded-2xl border border-[#cedbe8] dark:border-white/10 shadow-lg overflow-visible`}
              >
                {/* Form title inside card for context on scroll */}
                <Text style={tw`text-lg font-semibold text-[#0d141c] dark:text-white mb-4`}>
                  {authMode === 'Login' ? 'Login to DayBreak' : 'Create your DayBreak account'}
                </Text>

                {authMode === 'Sign Up' && (
                  <>
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      placeholder="Full name"
                      placeholderTextColor={placeholderColor}
                      style={tw`bg-slate-100 dark:bg-[#0b1016] border border-[#cedbe8] dark:border-white/10 px-3 py-3 rounded-xl text-[#0d141c] dark:text-white mb-4`}
                    />

                    {/* Role – chips instead of native Picker */}
                    <View style={tw`flex-row mb-4 gap-2`}>
                      {(['student', 'tutor'] as Role[]).map((r) => {
                        const active = role === r;
                        return (
                          <TouchableOpacity
                            key={r}
                            onPress={() => {
                              const next = r;
                              setRole(next);
                              if (next === 'student') {
                                if (!languages.length) {
                                  setLanguages(['English']);
                                }
                              } else {
                                setName('');
                                setLanguages([]);
                                setCountry('');
                              }
                            }}
                            style={tw.style(
                              'flex-1 h-11 rounded-xl border items-center justify-center',
                              active
                                ? 'bg-pink-600 border-pink-600'
                                : 'bg-slate-100 dark:bg-[#0b1016] border-[#cedbe8] dark:border-white/10'
                            )}
                          >
                            <Text
                              style={tw.style(
                                'text-sm font-semibold',
                                active ? 'text-white' : 'text-slate-700 dark:text-slate-100'
                              )}
                            >
                              {r === 'student' ? 'Student' : 'Tutor'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {role === 'student' && (
                      <>
                        {/* Language */}
                        <SelectField
                          value={languages[0] || ''}
                          onChange={(val) => setLanguages(val ? [String(val)] : [])}
                          options={languageOptions}
                          placeholder="Select your language"
                          placeholderColor={placeholderColor}
                          selectedTextColor={selectedTextColor}
                        />

                        {/* Country */}
                        <SelectField
                          value={country}
                          onChange={(val) => setCountry(String(val))}
                          options={countryOptions}
                          placeholder="Select your country"
                          placeholderColor={placeholderColor}
                          selectedTextColor={selectedTextColor}
                        />
                      </>
                    )}
                  </>
                )}

                {/* Email */}
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  placeholderTextColor={placeholderColor}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={tw`bg-slate-100 dark:bg-[#0b1016] border border-[#cedbe8] dark:border-white/10 px-3 py-3 rounded-xl text-[#0d141c] dark:text-white mb-4`}
                />

                {/* Password + toggle */}
                <View style={tw`relative mb-4`}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    placeholderTextColor={placeholderColor}
                    secureTextEntry={!showPassword}
                    style={tw`bg-slate-100 dark:bg-[#0b1016] border border-[#cedbe8] dark:border-white/10 px-3 py-3 rounded-xl text-[#0d141c] dark:text-white pr-10`}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((v) => !v)}
                    style={tw`absolute right-4 top-3`}
                  >
                    <FontAwesome
                      name={showPassword ? 'eye' : 'eye-slash'}
                      size={20}
                      color={placeholderColor}
                    />
                  </TouchableOpacity>
                </View>

                {/* Confirm Password (Sign Up) */}
                {authMode === 'Sign Up' && (
                  <View style={tw`relative mb-4`}>
                    <TextInput
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Confirm password"
                      placeholderTextColor={placeholderColor}
                      secureTextEntry={!showConfirmPassword}
                      style={tw`bg-slate-100 dark:bg-[#0b1016] border border-[#cedbe8] dark:border-white/10 px-3 py-3 rounded-xl text-[#0d141c] dark:text-white pr-10`}
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirmPassword((v) => !v)}
                      style={tw`absolute right-4 top-3`}
                    >
                      <FontAwesome
                        name={showConfirmPassword ? 'eye' : 'eye-slash'}
                        size={20}
                        color={placeholderColor}
                      />
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity
                  onPress={onSubmit}
                  disabled={busy}
                  style={tw`bg-pink-600 py-3 rounded-xl mb-4 ${busy ? 'opacity-60' : ''}`}
                >
                  <View style={tw`flex-row items-center justify-center`}>
                    {busy ? (
                      <ActivityIndicator size="small" color="#fff" style={tw`mr-2`} />
                    ) : null}
                    <Text style={tw`text-center text-white font-bold`}>
                      {authMode === 'Login' ? 'Login' : 'Sign Up'}
                    </Text>
                  </View>
                </TouchableOpacity>

                <View style={tw`flex-row justify-between mb-4`}>
                  <TouchableOpacity
                    onPress={() => {
                      clearErrors();
                      setResetMode('requesting');
                    }}
                  >
                    <Text style={tw`text-pink-600 dark:text-pink-400 underline`}>
                      Forgot password?
                    </Text>
                  </TouchableOpacity>

                  {authMode === 'Login' ? (
                    <TouchableOpacity
                      onPress={() => {
                        clearErrors();
                        setAuthMode('Sign Up');
                      }}
                    >
                      <Text style={tw`text-pink-600 dark:text-pink-400 underline`}>
                        Create account
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => {
                        clearErrors();
                        setAuthMode('Login');
                      }}
                    >
                      <Text style={tw`text-pink-600 dark:text-pink-400 underline`}>
                        Already have an account?
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Divider */}
                <View style={tw`flex-row items-center mb-3`}>
                  <View style={tw`flex-1 h-px bg-slate-200 dark:bg-white/10`} />
                  <Text style={tw`mx-2 text-xs text-slate-500 dark:text-slate-400`}>OR</Text>
                  <View style={tw`flex-1 h-px bg-slate-200 dark:bg-white/10`} />
                </View>

                {/* Google Login */}
                <View style={tw`mt-1`}>
                  <Text
                    style={tw`text-sm font-semibold text-center text-[#0d141c] dark:text-white mb-2`}
                  >
                    {isLogin ? 'Sign in using' : 'Sign up using'}
                  </Text>
                  <CustomGoogleLoginButtonNative
                    onSuccess={async (idToken) => {
                      await handleGoogleLoginSuccess(idToken);
                      if (isRoleModalNeeded()) {
                        if (!languages.length) setLanguages(['English']);
                        const gName = auth?.currentUser?.displayName || '';
                        if (gName && !name) setName(gName);
                        setShowRoleModal(true);
                      }
                    }}
                    onFailure={handleGoogleLoginFailure}
                  />
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Role Picker Modal (Google-first) */}
        <Modal visible={showRoleModal} transparent animationType="fade" onRequestClose={() => {}}>
          <View style={tw`flex-1 bg-black/40 justify-center p-6`}>
            <View
              style={tw`bg-white dark:bg-[#0f1821] p-6 rounded-2xl border border-[#cedbe8] dark:border-white/10 overflow-visible`}
            >
              <Text style={tw`text-2xl font-bold text-[#0d141c] dark:text-white mb-4`}>
                {role === 'tutor' ? 'Finish creating your account' : 'Create your student profile'}
              </Text>

              {error && (
                <View style={tw`mb-4 rounded-xl bg-red-600/10 px-3 py-2 border border-red-600/30`}>
                  <Text style={tw`text-red-400 text-sm`}>{error}</Text>
                </View>
              )}

              {/* Role (modal) – chips */}
              <View style={tw`flex-row mb-4 gap-2`}>
                {(['student', 'tutor'] as Role[]).map((r) => {
                  const active = role === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      onPress={() => {
                        const next = r;
                        setRole(next);
                        if (next === 'student') {
                          if (!languages.length) setLanguages(['English']);
                          if (!name.trim() && auth?.currentUser?.displayName) {
                            setName(auth.currentUser.displayName);
                          }
                        } else {
                          setName('');
                          setLanguages([]);
                          setCountry('');
                        }
                      }}
                      style={tw.style(
                        'flex-1 h-11 rounded-xl border items-center justify-center',
                        active
                          ? 'bg-pink-600 border-pink-600'
                          : 'bg-slate-100 dark:bg-[#0b1016] border-[#cedbe8] dark:border-white/10'
                      )}
                    >
                      <Text
                        style={tw.style(
                          'text-sm font-semibold',
                          active ? 'text-white' : 'text-slate-700 dark:text-slate-100'
                        )}
                      >
                        {r === 'student' ? 'Student' : 'Tutor'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Student-only fields in modal */}
              {role === 'student' && (
                <>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Full name"
                    placeholderTextColor={placeholderColor}
                    style={tw`bg-slate-100 dark:bg-[#0b1016] border border-[#cedbe8] dark:border-white/10 px-3 py-3 rounded-xl text-[#0d141c] dark:text-white mb-4`}
                  />

                  {/* Language */}
                  <SelectField
                    value={languages[0] || ''}
                    onChange={(val) => setLanguages(val ? [String(val)] : [])}
                    options={languageOptions}
                    placeholder="Select your language…"
                    placeholderColor={placeholderColor}
                    selectedTextColor={selectedTextColor}
                  />

                  {/* Country */}
                  <SelectField
                    value={country}
                    onChange={(val) => setCountry(String(val))}
                    options={countryOptions}
                    placeholder="Select your country…"
                    placeholderColor={placeholderColor}
                    selectedTextColor={selectedTextColor}
                  />
                </>
              )}

              <View style={tw`flex-row gap-3 pt-2`}>
                <TouchableOpacity
                  onPress={handleCancelRole}
                  disabled={busy}
                  style={tw`flex-1 h-11 rounded-xl bg-slate-100 dark:bg-[#0b1016] border border-[#cedbe8] dark:border-white/10 items-center justify-center ${
                    busy ? 'opacity-60' : ''
                  }`}
                >
                  <Text style={tw`text-[#0d141c] dark:text-white`}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={submitRoleFromModal}
                  disabled={busy || !canContinue}
                  style={tw`flex-1 h-11 rounded-xl bg-pink-600 items-center justify-center ${
                    busy || !canContinue ? 'opacity-60' : ''
                  }`}
                >
                  <View style={tw`flex-row items-center justify-center`}>
                    {busy ? (
                      <ActivityIndicator size="small" color="#fff" style={tw`mr-2`} />
                    ) : null}
                    <Text style={tw`text-white font-semibold`}>{busy ? 'Saving…' : ctaText}</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
};

export default LoginScreenNative;
