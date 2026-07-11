import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useShopContext } from '@myhandymanapp/shared/context';
import { ScreenScroll } from '../../components/Screen';
import Input from '../../components/Input';
import PrimaryButton from '../../components/PrimaryButton';
import CustomGoogleLoginButton from '../CustomGoogleLoginButton.native';
import { logGoogleAuthFlow, summarizeGoogleIdToken } from '../../utils/googleAuthDebug';
import { colors, radius, shadow, typography } from '../../theme/tokens';

type AccountType = 'client' | 'handyman';

export default function SignUpScreen({ navigation }: any) {
  const { http, loginConsumer } = useShopContext();
  const [role, setRole] = useState<AccountType>('client');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const finishAuth = async (data: any) => {
    await loginConsumer(data.token, {
      userId: String(data.user?.id || ''),
      email: data.user?.email,
    });
  };

  const createAccount = async () => {
    if (!name.trim() || !phone.trim() || !password) {
      Alert.alert('Missing details', 'Enter your name, Kenyan phone number and password.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Enter the same password in both fields.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await http.post('/api/auth/register', {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        role,
      });
      await finishAuth(data);
      if (email.trim() && data?.emailConfirmation?.sent) {
        Alert.alert(
          'Confirm your email',
          `We sent a confirmation link to ${email.trim()}. Open it to verify your Ekazi account.`,
        );
      }
    } catch (error: any) {
      Alert.alert(
        'Account setup failed',
        error?.response?.data?.message || 'Please check your details and try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const continueWithGoogle = async (idToken: string) => {
    const requestStartedAt = Date.now();
    logGoogleAuthFlow('sign_up:backend_request:start', {
      role,
      phoneSupplied: Boolean(phone.trim()),
      idToken: summarizeGoogleIdToken(idToken),
    });
    setGoogleLoading(true);
    try {
      const { data } = await http.post('/api/auth/google', {
        idToken,
        role,
        phone: phone.trim() || undefined,
      });
      logGoogleAuthFlow('sign_up:backend_request:ok', {
        elapsedMs: Date.now() - requestStartedAt,
        requestId: data?.requestId,
        userId: data?.user?.id,
        role: data?.user?.role,
        hasSessionToken: Boolean(data?.token),
      });
      await finishAuth(data);
    } catch (error: any) {
      logGoogleAuthFlow('sign_up:backend_request:error', {
        elapsedMs: Date.now() - requestStartedAt,
        requestId: error?.response?.headers?.['x-ekazi-google-auth-request-id'] || error?.response?.data?.requestId,
        status: error?.response?.status,
        backendMessage: error?.response?.data?.message,
        backendCode: error?.response?.data?.code,
        message: error?.message,
      });
      Alert.alert(
        'Google account setup failed',
        error?.response?.data?.message || 'Please try again with your Google account.',
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <ScreenScroll backgroundColor={colors.bg}>
      <Text style={{ fontSize: typography.h1, fontWeight: '900', color: colors.ink, lineHeight: 38 }}>How will you use Ekazi?</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, marginBottom: 18 }}>
        {([
          ['client', 'I need a handyman', 'Search, request and compare quotes', 'person-outline'],
          ['handyman', 'I am a handyman', 'Find jobs and send quotes', 'hammer-outline'],
        ] as const).map(([value, title, subtitle, icon]) => {
          const selected = role === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setRole(value)}
              style={{
                flex: 1,
                minHeight: 126,
                borderWidth: 2,
                borderColor: selected ? colors.primary : colors.border,
                borderRadius: radius.md,
                padding: 12,
                backgroundColor: selected ? colors.primarySoft : colors.card,
                ...shadow.card,
              }}
            >
              <Ionicons name={icon} size={24} color={selected ? colors.primary : colors.muted} />
              <Text style={{ fontWeight: '900', marginTop: 10, fontSize: typography.body, color: colors.ink }}>{title}</Text>
              <Text style={{ color: colors.mutedDark, fontSize: typography.small, marginTop: 6, lineHeight: 19 }}>{subtitle}</Text>
            </Pressable>
          );
        })}
      </View>

      <CustomGoogleLoginButton
        onSuccess={continueWithGoogle}
        onFailure={(error) =>
          Alert.alert('Google sign-up failed', error?.message || 'Could not start Google sign-up.')
        }
      />
      {googleLoading ? (
        <Text style={{ textAlign: 'center', marginTop: 8, color: colors.muted }}>Creating with Google...</Text>
      ) : null}

      <View style={{ marginVertical: 18, height: 1, backgroundColor: colors.border }} />

      <Input label="Full Name" value={name} onChangeText={setName} placeholder="Your full name" />
      <Input
        label="Email Address (optional)"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
      />
      <Input
        label="Phone Number"
        value={phone}
        onChangeText={setPhone}
        placeholder="+254 7xx xxx xxx"
      />
      <Input
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="At least 8 characters"
        secureTextEntry
      />
      <Input
        label="Confirm Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Repeat your password"
        secureTextEntry
      />

      <Text style={{ color: colors.muted, marginBottom: 12 }}>
        By continuing you agree to Ekazi's Terms of Service and Privacy Policy.
      </Text>
      <PrimaryButton
        title={loading ? 'Creating Account...' : 'Create Account'}
        onPress={() => void createAccount()}
        disabled={loading}
      />
      <Text style={{ textAlign: 'center', marginTop: 16, color: colors.muted }}>
        Already have an account?{' '}
        <Text
          style={{ color: colors.primary, fontWeight: '800' }}
          onPress={() => navigation.navigate('Login')}
        >
          Sign In
        </Text>
      </Text>
    </ScreenScroll>
  );
}
