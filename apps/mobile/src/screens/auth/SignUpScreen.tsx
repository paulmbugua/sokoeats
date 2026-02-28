import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { colors, spacing } from '../../theme/tokens';
import Input from '../../components/Input';
import PrimaryButton from '../../components/PrimaryButton';

export default function SignUpScreen({ navigation }: any) {
  const [name, setName] = useState('John Doe');
  const [email, setEmail] = useState('john@example.com');
  const [phone, setPhone] = useState('+254');
  const [password, setPassword] = useState('');

  return (
    <View style={{ flex: 1, backgroundColor: 'white', padding: spacing.xl }}>
      <Input label="Full Name" value={name} onChangeText={setName} placeholder="John Doe" />
      <Input label="Email Address" value={email} onChangeText={setEmail} placeholder="john@example.com" />
      <Input label="Phone Number" value={phone} onChangeText={setPhone} placeholder="+254 7xx xxx xxx" />
      <Input label="Password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry />

      <Text style={{ color: colors.muted, marginBottom: 12 }}>
        By continuing you agree to the{' '}
        <Text style={{ color: colors.primary, fontWeight: '800' }}>Terms of Service</Text> and{' '}
        <Text style={{ color: colors.primary, fontWeight: '800' }}>Privacy Policy</Text>.
      </Text>

      <PrimaryButton title="Continue" onPress={() => navigation.navigate('OtpVerify', { phone })} />

      <Text style={{ textAlign: 'center', marginTop: 16, color: colors.muted }}>
        Already have an account?{' '}
        <Text style={{ color: colors.primary, fontWeight: '800' }} onPress={() => navigation.navigate('Login')}>
          Sign In
        </Text>
      </Text>
    </View>
  );
}
