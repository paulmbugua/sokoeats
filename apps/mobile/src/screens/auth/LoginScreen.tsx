import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { colors, spacing } from '../../theme/tokens';
import Input from '../../components/Input';
import PrimaryButton from '../../components/PrimaryButton';
import SecondaryButton from '../../components/SecondaryButton';

export default function LoginScreen({ navigation, auth }: any) {
  const [phone, setPhone] = useState('+254');
  const [password, setPassword] = useState('');

  return (
    <View style={{ flex: 1, backgroundColor: 'white', padding: spacing.xl }}>
      <Input label="Phone" value={phone} onChangeText={setPhone} placeholder="+254 7xx xxx xxx" />
      <Input label="Password" value={password} onChangeText={setPassword} placeholder="Your password" secureTextEntry />
      <PrimaryButton
        title="Sign In"
        onPress={async () => {
          // For this starter zip, skip server auth and just set a demo token
          await auth.setToken('demo-token');
          navigation.replace('Tabs');
        }}
      />

      <View style={{ height: 12 }} />
      <SecondaryButton title="Continue with Google" onPress={() => {}} />

      <Text style={{ textAlign: 'center', marginTop: 16, color: colors.muted }}>
        Don't have an account?{' '}
        <Text style={{ color: colors.primary, fontWeight: '800' }} onPress={() => navigation.navigate('SignUp')}>
          Create Account
        </Text>
      </Text>

      <Text style={{ textAlign: 'center', marginTop: 10, color: colors.muted }}>
        Or verify by OTP{' '}
        <Text style={{ color: colors.primary, fontWeight: '800' }} onPress={() => navigation.navigate('OtpVerify', { phone })}>
          Send OTP
        </Text>
      </Text>
    </View>
  );
}
