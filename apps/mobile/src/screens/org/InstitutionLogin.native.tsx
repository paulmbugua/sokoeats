/* eslint-disable prettier/prettier */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ImageBackground,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';
import {
  useNavigation,
  useRoute,
  CommonActions,
  type RouteProp,
  type NavigationProp,
} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from '../../../tailwind';
import CustomGoogleLoginButtonNative from '../CustomGoogleLoginButton.native';
import { useThemePref } from '../../theme/ThemeContext';

import useInstitutionAuth from '@mytutorapp/shared/hooks/useInstitutionAuth';
import { useShopContext } from '@mytutorapp/shared/context';
import type { MainStackParamList } from '../../navigation/types';

/* ─────────────────────────────────────────────────────────── */
const LOGIN_BG =
  'https://images.unsplash.com/photo-1513258496099-48168024aec0?q=80&w=2000&auto=format&fit=crop';

const WEB_BASE = (process.env.EXPO_PUBLIC_WEB_ORIGIN as string) || 'https://daybreaklearner.com';

type AuthMode = 'Login' | 'Sign Up';
type ResetMode = 'idle' | 'requesting' | 'verifying';
type AccountKind = 'institution' | 'instructor' | 'learner';

/* ───────────────────────────────────────────────────────────
   Return-to handling (org-only; defaults to /org/profile)
   ─────────────────────────────────────────────────────────── */
const RETURN_TO_PRIMARY = 'auth:returnTo';
const RETURN_TO_ALIASES = [RETURN_TO_PRIMARY, 'auth:returnTo:org'];
const MUST_CHANGE_KEY = 'org:mustChangePassword';

const setMustChangeFlagNative = async (value: boolean) => {
  try {
    if (value) await AsyncStorage.setItem(MUST_CHANGE_KEY, '1');
    else await AsyncStorage.removeItem(MUST_CHANGE_KEY);
  } catch {}
};

const normalizeOrgNext = (v?: string) => {
  if (!v) return v;
  if (/^\/org\/join\/[^/]+/.test(v) || /[?&]assignmentId=/.test(v)) return v;
  return /^\/org\/?$/.test(v) ? '/org/profile' : v;
};

const computeNextFromRoute = (params?: { next?: string }) =>
  normalizeOrgNext(params?.next) || '/org/profile';

const writeReturnTo = async (v: string) => {
  try {
    await AsyncStorage.setItem(RETURN_TO_PRIMARY, v);
  } catch {}
};

const readReturnTo = async (): Promise<string> => {
  for (const k of RETURN_TO_ALIASES) {
    try {
      const v = await AsyncStorage.getItem(k);
      const n = normalizeOrgNext(v || undefined);
      if (n) return n;
    } catch {}
  }
  return '/org/profile';
};

const clearReturnTo = async () => {
  await Promise.all(RETURN_TO_ALIASES.map((k) => AsyncStorage.removeItem(k)));
};

/* ───────────────────────────────────────────────────────────
   Palette (adapts to theme)
   ─────────────────────────────────────────────────────────── */
function usePalette() {
  const { resolvedScheme } = useThemePref(); // 'light' | 'dark'
  const isDark = resolvedScheme === 'dark';
  return {
    isDark,
    pageBg: isDark ? '#0b1016' : '#f8fafc',
    card: isDark ? '#0f1821' : '#ffffff',
    border: isDark ? 'rgba(255,255,255,0.10)' : '#cedbe8',
    overlayTint: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.20)',
    text: isDark ? '#ffffff' : '#0d141c',
    textSoft: isDark ? 'rgba(255,255,255,0.75)' : '#3d5873',
    textSubtle: isDark ? 'rgba(255,255,255,0.60)' : 'rgba(61,88,115,0.75)',
    inputBg: isDark ? 'rgba(10,16,23,0.6)' : 'rgba(255,255,255,0.85)',
    inputBorder: isDark ? 'rgba(255,255,255,0.15)' : '#cedbe8',
    inputPlaceholder: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(13,20,28,0.55)',
    surface(style?: any) {
      return [
        tw`rounded-2xl p-6`,
        { backgroundColor: this.card, borderColor: this.border, borderWidth: 1 },
        style,
      ];
    },
    input() {
      return [
        tw`px-4 py-3 rounded-xl`,
        {
          backgroundColor: this.inputBg,
          borderColor: this.inputBorder,
          borderWidth: 1,
          color: this.text,
        },
      ];
    },
    primaryBtn: tw`items-center justify-center rounded-xl h-12 px-5 bg-indigo-600`,
    ghostBtn() {
      return [
        tw`h-12 px-4 rounded-xl items-center justify-center`,
        { borderColor: this.inputBorder, borderWidth: 1 },
      ];
    },
    linkText() {
      return [tw`underline`, { color: this.isDark ? '#93c5fd' : '#3b82f6' }];
    },
  };
}

/* ───────────────────────────────────────────────────────────
   Screen
   ─────────────────────────────────────────────────────────── */
const InstitutionLoginNative: React.FC = () => {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'InstitutionLogin'>>();
  const { orgToken, orgLogout } = useShopContext() as any;
  const palette = usePalette();

  // orgMode is still read but not strictly required for new features
  const [orgMode, setOrgMode] = useState(false);

  const [authMode, setAuthMode] = useState<AuthMode>('Login');
  const [resetMode, setResetMode] = useState<ResetMode>('idle');
  const [otpSent, setOtpSent] = useState(false);

  // NEW: institution | instructor | learner selector
  const [accountKind, setAccountKind] = useState<AccountKind>('institution');
  const canSignUp = accountKind === 'institution';
  const showSignUpTab = canSignUp;

  const [name, setName] = useState(''); // sign-up only
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clearErrors = () => setError(null);

  // ❗️Clear existing org-session when asked
  useEffect(() => {
    const shouldLogoutOrg =
      (route.params as any)?.logoutOrg === true || (route.params as any)?.force === 'logout';
    if (shouldLogoutOrg) {
      (async () => {
        await orgLogout();
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: 'InstitutionLogin' }],
          })
        );
      })();
    }
  }, [route.params, orgLogout, navigation]);

  // Seed intended target (default /org/profile) on mount
  useEffect(() => {
    const seed = computeNextFromRoute(route.params as any);
    void writeReturnTo(seed);
  }, []);

  // Read auth:mode once (used to gate auto-forward to OrgProfile)
  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem('auth:mode');
        setOrgMode(v === 'org');
      } catch {}
    })();
  }, []);

  // Keep Sign Up disabled for non-institution accounts
  useEffect(() => {
    if (!canSignUp && authMode === 'Sign Up') {
      setAuthMode('Login');
    }
  }, [canSignUp, authMode]);

  const labelForKind = (kind: AccountKind) =>
    kind === 'institution' ? 'Institution' : kind === 'instructor' ? 'Instructor' : 'Learner';

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
      key: 'learner',
      label: 'Learner',
      helper: 'Learners in this institution',
    },
  ];

  const switchAccountKind = (kind: AccountKind) => {
    setAccountKind(kind);
    clearErrors();
    setResetMode('idle');
  };

  const emailFormTitle = useMemo(() => {
    const base = labelForKind(accountKind);
    return authMode === 'Login' ? `${base} Login` : `Create your ${base} account`;
  }, [authMode, accountKind]);

  const {
    handleGoogleLoginSuccess,
    handleGoogleLoginFailure,
    loginWithEmail,
    registerWithEmail,
    sendResetOTP,
    resetPasswordWithOTP,
  } = useInstitutionAuth({
    alertFn: (msg) => console.log('[institution-auth]', msg),

    // ✅ native persists the flag here (before navigation)
    onAuthMeta: async ({ mustChangePassword }) => {
      await setMustChangeFlagNative(mustChangePassword);
    },

    // ✅ IMPORTANT: accept `dest` and route properly
    navigateFn: async (dest?: string) => {
      const saved = await readReturnTo(); // deep links / invites
      await clearReturnTo();

      if (dest === '/org/change-password') {
        navigation.reset({
          index: 0,
          routes: [
            {
              name: 'OrgChangePassword',
              params: { returnTo: saved },
            },
          ],
        });
        return;
      }

      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'OrgHome',
            params: saved ? { next: saved } : undefined,
          },
        ],
      });
    },
  });

  // ── Handlers ──────────────────────────────────────────────
  const onSubmit = async () => {
    clearErrors();
    try {
      setBusy(true);
      const trimmedEmail = email.trim();
      if (authMode === 'Login') {
        if (!trimmedEmail || !password) {
          setError('Please enter email and password.');
          return;
        }
        await loginWithEmail({ email: trimmedEmail, password });
      } else {
        // Sign Up (institution only, but effect also guards)
        if (!name || !trimmedEmail || !password || !confirmPassword) {
          setError('Please fill all required fields.');
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          return;
        }

        const roleHint: string =
          accountKind === 'institution'
            ? 'owner'
            : accountKind === 'instructor'
              ? 'instructor'
              : 'learner';

        await registerWithEmail({
          name: name.trim(),
          email: trimmedEmail,
          password,
          role: roleHint,
        } as any);
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSendOtp = async () => {
    clearErrors();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your account email.');
      return;
    }
    try {
      setBusy(true);
      await sendResetOTP(trimmedEmail);
      setOtpSent(true);
      setResetMode('verifying');
    } catch (err: any) {
      setError(err?.message || 'Failed to send OTP');
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async () => {
    clearErrors();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !otp || !newPassword) {
      setError('Please fill all fields.');
      return;
    }
    try {
      setBusy(true);
      await resetPasswordWithOTP(trimmedEmail, otp.trim(), newPassword);
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

  /* ───────────────────────────────────────────────────────────
     Render
     ─────────────────────────────────────────────────────────── */
  return (
    <SafeAreaView
      style={[tw`flex-1`, { backgroundColor: palette.pageBg }]}
      edges={['top', 'right', 'left', 'bottom']}
    >
      <ImageBackground
        source={{ uri: LOGIN_BG }}
        resizeMode="cover"
        style={tw`flex-1`}
        imageStyle={{ opacity: palette.isDark ? 0.35 : 0.25 }}
      >
        {/* theme-aware veil for legibility */}
        <View style={[tw`absolute inset-0`, { backgroundColor: palette.overlayTint }]} />

        {/* Removed theme toggle top bar */}

        <ScrollView contentContainerStyle={tw`px-5 pb-12 pt-6`} keyboardShouldPersistTaps="handled">
          <View style={tw`w-full max-w-[520px] self-center`}>
            {/* Card */}
            <View style={palette.surface()}>
              {/* NEW: Account type toggle (always fits inside card) */}
              <View style={tw`mb-4`}>
                <Text
                  style={[
                    tw`text-xs font-semibold text-center mb-2`,
                    { color: palette.textSubtle },
                  ]}
                >
                  Who is logging in?
                </Text>

                <View
                  style={{
                    borderRadius: 16,
                    overflow: 'hidden', // keeps children clipped inside
                    backgroundColor: palette.isDark
                      ? 'rgba(15,24,33,0.9)'
                      : 'rgba(255,255,255,0.95)',
                  }}
                >
                  {accountOptions.map((opt, idx) => {
                    const selected = accountKind === opt.key;
                    const isLast = idx === accountOptions.length - 1;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        onPress={() => switchAccountKind(opt.key)}
                        style={[
                          tw`flex-row items-center px-3 py-2`,
                          selected && {
                            backgroundColor: palette.isDark ? '#1b2430' : '#eef2ff',
                          },
                          !isLast && {
                            borderBottomWidth: 0.5,
                            borderBottomColor: palette.isDark
                              ? 'rgba(148,163,184,0.5)'
                              : 'rgba(148,163,184,0.6)',
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                      >
                        <View
                          style={[
                            tw`mr-3 h-4 w-4 rounded-full items-center justify-center`,
                            {
                              borderWidth: 1,
                              borderColor: selected ? '#4f46e5' : '#9ca3af',
                              backgroundColor: selected ? '#4f46e5' : 'transparent',
                            },
                          ]}
                        >
                          {selected && <Text style={tw`text-[10px] text-white`}>✓</Text>}
                        </View>

                        <View style={tw`flex-1`}>
                          <Text
                            style={[
                              tw`text-xs font-semibold`,
                              {
                                color: selected ? '#4f46e5' : palette.textSoft,
                              },
                            ]}
                          >
                            {opt.label}
                          </Text>
                          <Text style={[tw`text-[10px] mt-0.5`, { color: palette.textSubtle }]}>
                            {opt.helper}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Title */}
              <Text
                style={[tw`text-2xl font-bold text-center mb-1`, { color: palette.text }]}
                accessibilityRole="header"
              >
                {emailFormTitle}
              </Text>
              <Text style={[tw`text-center mb-5`, { color: palette.textSoft }]}>
                Branding • Assignments • Analytics
              </Text>

              {/* Error */}
              {!!error && (
                <View style={tw`mb-4 rounded-lg bg-red-950/40 border border-red-700/40 px-3 py-2`}>
                  <Text style={tw`text-red-200 text-sm`}>{error}</Text>
                </View>
              )}

              {/* Auth mode switch */}
              <View style={tw`flex-row bg-white/10 rounded-xl p-1 mb-4`}>
                {/* Login tab (always visible) */}
                <TouchableOpacity
                  onPress={() => {
                    clearErrors();
                    setAuthMode('Login');
                  }}
                  style={tw.style(
                    'flex-1 h-10 rounded-lg items-center justify-center',
                    authMode === 'Login' ? 'bg-white/15' : ''
                  )}
                  accessibilityRole="button"
                  accessibilityState={{ selected: authMode === 'Login' }}
                >
                  <Text
                    style={[
                      tw`font-semibold`,
                      { color: authMode === 'Login' ? palette.text : palette.textSoft },
                    ]}
                  >
                    Login
                  </Text>
                </TouchableOpacity>

                {/* Sign Up tab (ONLY when Institution selected) */}
                {showSignUpTab && (
                  <TouchableOpacity
                    onPress={() => {
                      clearErrors();
                      setAuthMode('Sign Up');
                    }}
                    style={tw.style(
                      'flex-1 h-10 rounded-lg items-center justify-center',
                      authMode === 'Sign Up' ? 'bg-white/15' : ''
                    )}
                    accessibilityRole="button"
                    accessibilityState={{ selected: authMode === 'Sign Up' }}
                  >
                    <Text
                      style={[
                        tw`font-semibold`,
                        { color: authMode === 'Sign Up' ? palette.text : palette.textSoft },
                      ]}
                    >
                      Sign Up
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Forms */}
              {resetMode !== 'idle' ? (
                otpSent ? (
                  <View style={tw`gap-4`}>
                    <TextInput
                      placeholder="Enter OTP"
                      placeholderTextColor={palette.inputPlaceholder}
                      value={otp}
                      onChangeText={setOtp}
                      style={palette.input()}
                      autoCapitalize="none"
                      keyboardType="number-pad"
                    />
                    <TextInput
                      placeholder="New Password (min. 8 characters)"
                      placeholderTextColor={palette.inputPlaceholder}
                      secureTextEntry
                      value={newPassword}
                      onChangeText={setNewPassword}
                      style={palette.input()}
                    />
                    <View style={tw`flex-row gap-2`}>
                      <TouchableOpacity
                        onPress={() => {
                          setResetMode('idle');
                          setOtpSent(false);
                          setError(null);
                        }}
                        style={palette.ghostBtn()}
                      >
                        <Text style={{ color: palette.text }}>Back</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleResetPassword}
                        style={[palette.primaryBtn, tw`flex-1`, busy && tw`opacity-60`]}
                        disabled={busy}
                      >
                        <Text style={tw`text-white font-semibold`}>Reset Password</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={tw`gap-4`}>
                    <TextInput
                      placeholder="Enter your email"
                      placeholderTextColor={palette.inputPlaceholder}
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      style={palette.input()}
                    />
                    <View style={tw`flex-row gap-2`}>
                      <TouchableOpacity
                        onPress={() => {
                          setResetMode('idle');
                          setError(null);
                        }}
                        style={palette.ghostBtn()}
                      >
                        <Text style={{ color: palette.text }}>Back</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleSendOtp}
                        style={[palette.primaryBtn, tw`flex-1`, busy && tw`opacity-60`]}
                        disabled={busy}
                      >
                        <Text style={tw`text-white font-semibold`}>Send OTP</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )
              ) : (
                <View style={tw`gap-4`}>
                  {authMode === 'Sign Up' && canSignUp && (
                    <TextInput
                      placeholder="Full name"
                      placeholderTextColor={palette.inputPlaceholder}
                      value={name}
                      onChangeText={setName}
                      style={palette.input()}
                    />
                  )}

                  <TextInput
                    placeholder="Email"
                    placeholderTextColor={palette.inputPlaceholder}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={palette.input()}
                  />

                  <TextInput
                    placeholder="Password"
                    placeholderTextColor={palette.inputPlaceholder}
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                    style={palette.input()}
                  />

                  {authMode === 'Sign Up' && canSignUp && (
                    <TextInput
                      placeholder="Confirm password"
                      placeholderTextColor={palette.inputPlaceholder}
                      secureTextEntry
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      style={palette.input()}
                    />
                  )}

                  <TouchableOpacity
                    onPress={onSubmit}
                    disabled={busy}
                    style={[palette.primaryBtn, tw`w-full`, busy && tw`opacity-60`]}
                    accessibilityRole="button"
                  >
                    <Text style={tw`text-white font-semibold`}>
                      {authMode === 'Login' ? 'Login' : 'Sign Up'}
                    </Text>
                  </TouchableOpacity>

                  <View style={tw`flex-row justify-between`}>
                    <TouchableOpacity
                      onPress={() => {
                        clearErrors();
                        setResetMode('requesting');
                      }}
                    >
                      <Text style={palette.linkText() as any}>Forgot password?</Text>
                    </TouchableOpacity>

                    {canSignUp &&
                      (authMode === 'Login' ? (
                        <TouchableOpacity
                          onPress={() => {
                            clearErrors();
                            setAuthMode('Sign Up');
                          }}
                        >
                          <Text style={palette.linkText() as any}>Create account</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          onPress={() => {
                            clearErrors();
                            setAuthMode('Login');
                          }}
                        >
                          <Text style={palette.linkText() as any}>Already have an account?</Text>
                        </TouchableOpacity>
                      ))}
                  </View>

                  {accountKind !== 'institution' && (
                    <Text style={[tw`mt-2 text-[11px] text-center`, { color: palette.textSubtle }]}>
                      Instructors and learners: please log in using the email/ID and password shared
                      by your school or the invite link.
                    </Text>
                  )}
                </View>
              )}

              {/* Divider + Google (institution only) */}
              {accountKind === 'institution' && (
                <>
                  <View style={tw`my-6 flex-row items-center`}>
                    <View style={tw`flex-1 h-px bg-white/10`} />
                    <Text style={[tw`mx-3 text-[10px]`, { color: palette.textSubtle }]}>OR</Text>
                    <View style={tw`flex-1 h-px bg-white/10`} />
                  </View>

                  <View style={tw`items-center`}>
                    <CustomGoogleLoginButtonNative
                      onSuccess={async (idToken: string) => {
                        try {
                          await handleGoogleLoginSuccess(idToken, name || undefined);
                        } catch (e: any) {
                          Alert.alert('Google sign-in failed', e?.message || 'Please try again.');
                        }
                        // Navigation handled by navigateFn after token.
                      }}
                      onFailure={(err?: Error) => handleGoogleLoginFailure(err)}
                    />
                  </View>
                </>
              )}

              {/* Helper: switch to regular DayBreak login */}
              <View style={tw`mt-6 items-center`}>
                <Text style={[tw`text-xs`, { color: palette.textSubtle }]}>
                  Not an institution?{' '}
                  <Text
                    style={palette.linkText() as any}
                    onPress={async () => {
                      try {
                        await AsyncStorage.setItem('auth:mode', 'user');
                        await clearReturnTo();
                      } catch {}
                      // 👇 pass a "switch" flag so mobile Login won't bounce away
                      navigation.navigate('Login', { switch: true });
                    }}
                  >
                    Sign in as Student/Tutor
                  </Text>
                </Text>
              </View>

              {/* Policies */}
              <Text style={[tw`mt-6 text-center text-[10px]`, { color: palette.textSubtle }]}>
                By continuing, you agree to our{' '}
                <Text style={tw`underline`} onPress={() => Linking.openURL(`${WEB_BASE}/terms`)}>
                  Terms
                </Text>{' '}
                and{' '}
                <Text
                  style={tw`underline`}
                  onPress={() => Linking.openURL(`${WEB_BASE}/privacy-policy`)}
                >
                  Privacy Policy
                </Text>
                .
              </Text>
            </View>
          </View>
        </ScrollView>
      </ImageBackground>
    </SafeAreaView>
  );
};

export default InstitutionLoginNative;
