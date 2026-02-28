import React, { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { colors, spacing, radius } from '../../theme/tokens';
import PrimaryButton from '../../components/PrimaryButton';

export default function OtpVerifyScreen({ route, navigation, auth }: any) {
  const phone = route.params?.phone ?? '+254';
  const [code, setCode] = useState('');

  return (
    <View style={{ flex: 1, backgroundColor: 'white', padding: spacing.xl }}>
      <Text style={{ textAlign: 'center', color: colors.muted, marginTop: 12 }}>We've sent a 6-digit code to</Text>
      <Text style={{ textAlign: 'center', fontWeight: '900', fontSize: 16, marginTop: 4 }}>{phone}</Text>

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24 }}>
        <TextInput
          value={code}
          onChangeText={setCode}
          maxLength={6}
          keyboardType="number-pad"
          placeholder="______"
          placeholderTextColor={colors.border}
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.lg,
            paddingHorizontal: 18,
            paddingVertical: 14,
            fontSize: 22,
            letterSpacing: 8,
            textAlign: 'center',
            width: 220,
          }}
        />
      </View>

      <View style={{ marginTop: 18 }}>
        <PrimaryButton
          title="Verify & Continue"
          onPress={async () => {
            await auth.setToken('demo-token');
            navigation.replace('Tabs');
          }}
        />
      </View>

      <Text style={{ textAlign: 'center', marginTop: 16, color: colors.muted }}>Resend code in 58s</Text>
    </View>
  );
}
