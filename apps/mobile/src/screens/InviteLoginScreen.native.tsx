import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, Image } from 'react-native';
import { useNavigation, useRoute, StackActions } from '@react-navigation/native';
import tw from '../../tailwind';
import useAuth from '@mytutorapp/shared/hooks/useAuth';
import { useOrgInvite } from '@mytutorapp/shared/hooks';
import CustomGoogleLoginButtonNative from './CustomGoogleLoginButton.native';

const InviteLoginScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const code: string = route.params?.code ?? '';

  // Load org/invite branding for header
  const { data: invite, loading } = useOrgInvite(code) as any;
  const orgName: string =
    invite?.org?.name || invite?.org_name || invite?.name || 'Your Institution';
  const orgLogo: string | null = invite?.org?.logo_url || invite?.logo_url || null;

  // Normal user auth (force role=student on sign-up / pending Google role)
  const {
    handleGoogleLoginSuccess,
    handleGoogleLoginFailure,
    loginWithEmail,
    registerWithEmail,
    isRoleModalNeeded,
    completeRole,
  } = useAuth({
    alertFn: (msg) => console.log('[invite-login]', msg),
    // Always go back to the invite landing after success
    navigateFn: () => navigation.dispatch(StackActions.replace('OrgInviteLanding', { code })),
  });

  // UI state
  const [authMode, setAuthMode] = useState<'Login' | 'Sign Up'>('Login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState(''); // sign up only
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const clearError = () => setError(null);
  const title = useMemo(
    () => (authMode === 'Login' ? `Sign in to ${orgName}` : `Join ${orgName}`),
    [authMode, orgName]
  );

  const submit = useCallback(async () => {
    clearError();
    try {
      setBusy(true);
      if (authMode === 'Login') {
        if (!email || !password) {
          setError('Please enter email and password.');
          return;
        }
        await loginWithEmail({ email: email.trim(), password });
        return; // navigateFn will fire
      }

      // Sign Up — force role=student
      if (!name || !email || !password || !confirm) {
        setError('Please fill all required fields.');
        return;
      }
      if (password !== confirm) {
        setError('Passwords do not match.');
        return;
      }
      await registerWithEmail({
        name: name.trim(),
        email: email.trim(),
        password,
        role: 'student',
      } as any);
      // navigateFn will fire
    } catch (e: any) {
      setError(e?.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }, [authMode, email, password, confirm, name, loginWithEmail, registerWithEmail]);

  const onGoogleSuccess = useCallback(
    async (idToken: string) => {
      try {
        setBusy(true);
        await handleGoogleLoginSuccess(idToken);
        // If backend returned "pending role", finalize as student
        if (isRoleModalNeeded()) {
          await completeRole({ role: 'student' } as any);
        }
      } catch (err) {
        handleGoogleLoginFailure(err instanceof Error ? err : new Error('Google sign-in failed'));
        setError((err as any)?.message || 'Google sign-in failed');
      } finally {
        setBusy(false);
      }
    },
    [handleGoogleLoginSuccess, handleGoogleLoginFailure, isRoleModalNeeded, completeRole]
  );

  return (
    <ScrollView
      style={tw`flex-1 bg-gray-900`}
      contentContainerStyle={tw`flex-grow justify-center bg-gray-900 px-4 py-8`}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ width: '100%', maxWidth: 480, alignSelf: 'center' }}>
        {/* Header */}
        <View style={tw`items-center mb-6`}>
          {orgLogo ? (
            <Image source={{ uri: orgLogo }} style={tw`h-14 w-14 rounded-xl bg-white mb-2`} />
          ) : (
            <View style={tw`h-14 w-14 rounded-xl bg-white/80 items-center justify-center mb-2`}>
              <Text style={tw`text-gray-900 font-bold text-lg`}>
                {orgName.slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={tw`text-white text-xl font-bold`}>{loading ? 'Loading…' : orgName}</Text>
          <Text style={tw`text-indigo-200 mt-1`}>{title}</Text>
        </View>

        {/* Error */}
        {error && (
          <View style={tw`mb-4 rounded-lg bg-red-700/20 px-3 py-2`}>
            <Text style={tw`text-red-300 text-sm`}>{error}</Text>
          </View>
        )}

        {/* Tabs */}
        <View style={tw`flex-row bg-white/10 rounded-xl p-1 mb-3`}>
          {(['Login', 'Sign Up'] as const).map((m) => {
            const active = authMode === m;
            return (
              <TouchableOpacity
                key={m}
                onPress={() => {
                  clearError();
                  setAuthMode(m);
                }}
                style={tw.style(
                  `flex-1 h-10 rounded-lg items-center justify-center`,
                  active ? 'bg-white/15' : ''
                )}
              >
                <Text style={tw.style(`font-semibold`, active ? 'text-white' : 'text-indigo-200')}>
                  {m}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Card */}
        <View style={tw`bg-white/5 border border-white/10 rounded-2xl p-4`}>
          {authMode === 'Sign Up' && (
            <TextInput
              placeholder="Full name"
              placeholderTextColor="#9aa4af"
              value={name}
              onChangeText={setName}
              style={tw`bg-white/10 text-white rounded-lg h-12 px-3 mb-3`}
              autoCapitalize="words"
            />
          )}

          <TextInput
            placeholder="Email"
            placeholderTextColor="#9aa4af"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={tw`bg-white/10 text-white rounded-lg h-12 px-3 mb-3`}
          />

          <TextInput
            placeholder={authMode === 'Login' ? 'Password' : 'Create a password'}
            placeholderTextColor="#9aa4af"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={tw`bg-white/10 text-white rounded-lg h-12 px-3 mb-3`}
          />

          {authMode === 'Sign Up' && (
            <TextInput
              placeholder="Confirm password"
              placeholderTextColor="#9aa4af"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              style={tw`bg-white/10 text-white rounded-lg h-12 px-3 mb-3`}
            />
          )}

          <TouchableOpacity
            onPress={submit}
            disabled={busy}
            style={tw.style(
              `h-12 rounded-xl items-center justify-center mt-1`,
              busy ? 'bg-pink-500/70' : 'bg-pink-500'
            )}
          >
            <Text style={tw`text-white font-semibold`}>
              {authMode === 'Login' ? 'Login' : 'Create account'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={tw`flex-row items-center my-5`}>
          <View style={tw`h-px flex-1 bg-white/15`} />
          <Text style={tw`mx-3 text-xs text-white/60`}>OR</Text>
          <View style={tw`h-px flex-1 bg-white/15`} />
        </View>

        {/* Google */}
        <CustomGoogleLoginButtonNative
          onSuccess={onGoogleSuccess}
          onFailure={(err) => {
            handleGoogleLoginFailure(err);
            setError(err?.message || 'Google sign-in failed');
          }}
        />

        {/* Footnote */}
        <Text style={tw`text-center text-xs text-white/60 mt-5`}>
          By continuing, you agree to our Terms and Privacy Policy.
        </Text>
      </View>
    </ScrollView>
  );
};

export default InviteLoginScreen;
