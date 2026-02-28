import React from 'react';
import { View, Text } from 'react-native';
import { colors } from '../theme/tokens';

export default function Badge({ label, tone }: { label: string; tone?: 'green' | 'blue' | 'purple' }) {
  const bg = tone === 'green' ? colors.greenSoft : tone === 'purple' ? '#F3E8FF' : colors.blueSoft;
  const fg = tone === 'green' ? colors.green : tone === 'purple' ? colors.purple : colors.primary;
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginRight: 8 }}>
      <Text style={{ color: fg, fontWeight: '700', fontSize: 12 }}>{label}</Text>
    </View>
  );
}
