import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useShopContext } from '@myhandymanapp/shared/context';
import { ScreenScroll } from '../../components/Screen';
import Input from '../../components/Input';
import PrimaryButton from '../../components/PrimaryButton';
import CustomGoogleLoginButton from '../CustomGoogleLoginButton.native';
import { colors } from '../../theme/tokens';

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
    });
  };

  const signIn = async () => {
    setLoading(true);
    try {
      const { data } = await http.post('/api/auth/login', { phone: phone.trim(), password });
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
    setGoogleLoading(true);
    try {
      const { data } = await http.post('/api/auth/google', { idToken, role: 'client' });
      await finishAuth(data);
    } catch (e: any) {
      Alert.alert(
        'Google sign-in failed',
        e?.response?.data?.message || 'Please try again with your Google account.',
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <ScreenScroll backgroundColor="white" contentContainerStyle={{ justifyContent: 'center' }}>
      <Text style={{ fontSize: 24, fontWeight: '900', marginBottom: 8 }}>Welcome back</Text>
      <Text style={{ color: colors.muted, marginBottom: 18 }}>
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
      <Text style={{ textAlign: 'center', marginTop: 10, color: colors.muted }}>
        Or verify by OTP{' '}
        <Text
          style={{ color: colors.primary, fontWeight: '800' }}
          onPress={() => navigation.navigate('OtpVerify', { phone })}
        >
          Send OTP
        </Text>
      </Text>
    </ScreenScroll>
  );
}
