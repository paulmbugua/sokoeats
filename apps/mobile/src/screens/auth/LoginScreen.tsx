import React, { useState } from 'react';
import { ScreenScroll } from '../../components/Screen';

import { Alert, View, Text } from 'react-native';

import { useShopContext } from '@myhandymanapp/shared/context';

import { colors, spacing } from '../../theme/tokens';

import Input from '../../components/Input';

import PrimaryButton from '../../components/PrimaryButton';

import SecondaryButton from '../../components/SecondaryButton';

export default function LoginScreen({ navigation }: any) {

  const { http, loginConsumer } = useShopContext();

  const [phone, setPhone] = useState('+254700000001');

  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);

  const signIn = async () => {

    setLoading(true);

    try {

      const { data } = await http.post('/api/auth/login', { phone: phone.trim(), password });

      await loginConsumer(data.token, { userId: data.user?.id, email: data.user?.email });

    } catch (e: any) {

      Alert.alert('Sign in failed', e?.response?.data?.message || 'Check your phone number and try again.');

    } finally { setLoading(false); }

  };

  return <ScreenScroll backgroundColor="white" contentContainerStyle={{ justifyContent: 'center' }}>

    <Input label="Phone" value={phone} onChangeText={setPhone} placeholder="+254 7xx xxx xxx" />

    <Input label="Password" value={password} onChangeText={setPassword} placeholder="Your password" secureTextEntry />

    <PrimaryButton title={loading ? 'Signing in...' : 'Sign In'} onPress={signIn} />

    <View style={{ height: 12 }} />

    <SecondaryButton title="Continue with Google" onPress={() => Alert.alert('Google Sign-In', 'Use the configured Firebase/Google client in a dev build.')} />

    <Text style={{ textAlign: 'center', marginTop: 16, color: colors.muted }}>Don't have an account? <Text style={{ color: colors.primary, fontWeight: '800' }} onPress={() => navigation.navigate('SignUp')}>Create Account</Text></Text>

    <Text style={{ textAlign: 'center', marginTop: 10, color: colors.muted }}>Or verify by OTP <Text style={{ color: colors.primary, fontWeight: '800' }} onPress={() => navigation.navigate('OtpVerify', { phone })}>Send OTP</Text></Text>

  </ScreenScroll>;

}

