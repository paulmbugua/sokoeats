import React, { useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { useShopContext } from '@myhandymanapp/shared/context';
import { ScreenScroll } from '../../components/Screen';
import Input from '../../components/Input';
import PrimaryButton from '../../components/PrimaryButton';
import CustomGoogleLoginButton from '../CustomGoogleLoginButton.native';
import { logGoogleAuthFlow, summarizeGoogleIdToken } from '../../utils/googleAuthDebug';
import { colors, typography } from '../../theme/tokens';

const POLICY_LINKS: Array<[string, string]> = [
  ['Privacy Policy', 'https://ekazi.co.ke/privacy-policy'],
  ['Terms', 'https://ekazi.co.ke/terms'],
  ['Anti-Spam', 'https://ekazi.co.ke/anti-spam-policy'],
  ['Feedback', 'https://ekazi.co.ke/complaints-feedback'],
  ['Refunds', 'https://ekazi.co.ke/refunds'],
  ['Fulfillment', 'https://ekazi.co.ke/fulfillment'],
  ['Payments', 'https://ekazi.co.ke/payment-flow'],
];

export default function LoginScreen({ navigation }: any) {
  const { http, loginConsumer } = useShopContext();
  const [phone, setPhone] = useState('+254700000001');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const finishAuth = async (data: any) => {
    await loginConsumer(data.token, {
      userId: String(data.user?.id || ''),
      email: data.user?.email,
      name: data.user?.name,
      phone: data.user?.phone,
      role: data.user?.role,
      profileComplete: typeof data.user?.profileComplete === 'boolean' ? data.user.profileComplete : data.profileComplete,
    });
  };

  const signIn = async () => {
    setLoading(true);
    try {
      const { data } = await http.post('/api/auth/login', { phone: phone.trim(), password });
      if (data?.requiresTwoFactor) {
        Alert.alert('OTP paused', 'SMS and Email OTP are temporarily disabled. Please restart the backend and sign in again.');
        return;
      }
      await finishAuth(data);
    } catch (e: any) {
      Alert.alert(
        'Sign in failed',
        e?.response?.data?.message || 'Check your phone number and try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const continueWithGoogle = async (idToken: string) => {
    const requestStartedAt = Date.now();
    logGoogleAuthFlow('login:backend_request:start', {
      role: 'client',
      idToken: summarizeGoogleIdToken(idToken),
    });
    setGoogleLoading(true);
    try {
      const { data } = await http.post('/api/auth/google', { idToken, role: 'client' });
      logGoogleAuthFlow('login:backend_request:ok', {
        elapsedMs: Date.now() - requestStartedAt,
        requestId: data?.requestId,
        userId: data?.user?.id,
        role: data?.user?.role,
        hasSessionToken: Boolean(data?.token),
      });
      if (data?.requiresTwoFactor) {
        Alert.alert('OTP paused', 'SMS and Email OTP are temporarily disabled. Please restart the backend and sign in again.');
        return;
      }
      await finishAuth(data);
    } catch (e: any) {
      logGoogleAuthFlow('login:backend_request:error', {
        elapsedMs: Date.now() - requestStartedAt,
        requestId: e?.response?.headers?.['x-ekazi-google-auth-request-id'] || e?.response?.data?.requestId,
        status: e?.response?.status,
        backendMessage: e?.response?.data?.message,
        backendCode: e?.response?.data?.code,
        message: e?.message,
      });
      Alert.alert(
        'Google sign-in failed',
        e?.response?.data?.message || 'Please try again with your Google account.',
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <ScreenScroll backgroundColor={colors.bg} contentContainerStyle={{ justifyContent: 'center' }}>
      <Text style={{ fontSize: typography.h1, fontWeight: '900', marginBottom: 8, color: colors.ink }}>
        Welcome back
      </Text>
      <Text style={{ color: colors.mutedDark, marginBottom: 22, fontSize: typography.body, lineHeight: 24 }}>
        Sign in to manage Ekazi jobs, quotes and bookings.
      </Text>

      <Input label="Phone or Email" value={phone} onChangeText={setPhone} placeholder="+254 7xx xxx xxx" />
      <Input
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="Your password"
        secureTextEntry
      />

      <PrimaryButton title={loading ? 'Signing in...' : 'Sign In'} onPress={signIn} disabled={loading} />

      <Text style={{ textAlign: 'right', marginTop: 10, marginBottom: 4, color: colors.primary, fontWeight: '900' }} onPress={() => Alert.alert('Password reset paused', 'SMS and Email OTP password reset is temporarily disabled. Contact Ekazi support for password help.')}>Forgot password?</Text>

      <View style={{ height: 14 }} />
      <CustomGoogleLoginButton
        onSuccess={continueWithGoogle}
        onFailure={(error) =>
          Alert.alert('Google sign-in failed', error?.message || 'Could not start Google sign-in.')
        }
      />
      {googleLoading ? (
        <Text style={{ textAlign: 'center', marginTop: 8, color: colors.muted }}>Connecting Google...</Text>
      ) : null}

      <Text style={{ textAlign: 'center', marginTop: 16, color: colors.muted }}>
        Don't have an account?{' '}
        <Text
          style={{ color: colors.primary, fontWeight: '800' }}
          onPress={() => navigation.navigate('SignUp')}
        >
          Create Account
        </Text>
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 22 }}>
        {POLICY_LINKS.map(([label, url]) => (
          <Text
            key={url}
            onPress={() => void Linking.openURL(url)}
            style={{ color: colors.muted, fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' }}
          >
            {label}
          </Text>
        ))}
      </View>
    </ScreenScroll>
  );
}


