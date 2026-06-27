import React, { useEffect, useState } from 'react';

import { Alert, View, Text, TextInput } from 'react-native';

import { useShopContext } from '@myhandymanapp/shared/context';

import { colors, spacing, radius } from '../../theme/tokens';

import PrimaryButton from '../../components/PrimaryButton';

export default function OtpVerifyScreen({ route }: any) {

  const { http, loginConsumer } = useShopContext();

  const phone = route.params?.phone ?? '+254700000001';

  const [code, setCode] = useState('');

  const [loading, setLoading] = useState(false);

  useEffect(() => { void http.post('/api/auth/otp/request', { phone }).catch(() => undefined); }, [http, phone]);

  const verify = async () => {

    setLoading(true);

    try {

      const { data } = await http.post('/api/auth/otp/verify', { phone, code });

      await loginConsumer(data.token, { userId: data.user?.id, email: data.user?.email });

    } catch (e: any) { Alert.alert('Verification failed', e?.response?.data?.message || 'Use the 6-digit code sent to your phone.'); }

    finally { setLoading(false); }

  };

  return <View style={{ flex: 1, backgroundColor: 'white', padding: spacing.xl }}>

    <Text style={{ textAlign: 'center', color: colors.muted, marginTop: 12 }}>We've sent a 6-digit code to</Text>

    <Text style={{ textAlign: 'center', fontWeight: '900', fontSize: 16, marginTop: 4 }}>{phone}</Text>

    <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24 }}><TextInput value={code} onChangeText={setCode} maxLength={6} keyboardType="number-pad" placeholder="123456" placeholderTextColor={colors.border} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 18, paddingVertical: 14, fontSize: 22, letterSpacing: 8, textAlign: 'center', width: 220 }} /></View>

    <View style={{ marginTop: 18 }}><PrimaryButton title={loading ? 'Verifying...' : 'Verify & Continue'} onPress={verify} /></View>

    <Text style={{ textAlign: 'center', marginTop: 16, color: colors.muted }}>Development OTP: 123456</Text>

  </View>;

}

