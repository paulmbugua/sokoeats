import React, { useState } from 'react';
import { ScreenScroll } from '../../components/Screen';

import { Alert, View, Text } from 'react-native';

import { useShopContext } from '@myhandymanapp/shared/context';

import { colors, spacing } from '../../theme/tokens';

import Input from '../../components/Input';

import PrimaryButton from '../../components/PrimaryButton';

export default function SignUpScreen({ navigation }: any) {

  const { http, loginConsumer } = useShopContext();

  const [name, setName] = useState('');

  const [email, setEmail] = useState('');

  const [phone, setPhone] = useState('');

  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);

  const createAccount = async () => {

    setLoading(true);

    try {

      const { data } = await http.post('/api/auth/register', { name, email, phone, password });

      await loginConsumer(data.token, { userId: data.user?.id, email: data.user?.email });

    } catch (e: any) {

      Alert.alert('Account setup failed', e?.response?.data?.message || 'Please check your details and try again.');

    } finally { setLoading(false); }

  };

  return <ScreenScroll backgroundColor="white" contentContainerStyle={{ justifyContent: 'center' }}>

    <Input label="Full Name" value={name} onChangeText={setName} placeholder="John Mwangi" />

    <Input label="Email Address" value={email} onChangeText={setEmail} placeholder="john@example.com" />

    <Input label="Phone Number" value={phone} onChangeText={setPhone} placeholder="+254 7xx xxx xxx" />

    <Input label="Password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry />

    <Text style={{ color: colors.muted, marginBottom: 12 }}>By continuing you agree to the <Text style={{ color: colors.primary, fontWeight: '800' }}>Terms of Service</Text> and <Text style={{ color: colors.primary, fontWeight: '800' }}>Privacy Policy</Text>.</Text>

    <PrimaryButton title={loading ? 'Creating...' : 'Create Account'} onPress={createAccount} disabled={loading} />

    <Text style={{ textAlign: 'center', marginTop: 16, color: colors.muted }}>Already have an account? <Text style={{ color: colors.primary, fontWeight: '800' }} onPress={() => navigation.navigate('Login')}>Sign In</Text></Text>

  </ScreenScroll>;

}

