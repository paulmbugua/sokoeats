import React from 'react';
import { View, Text } from 'react-native';
import { colors, typography } from '../theme/tokens';

export default function Badge({ label, tone }: { label: string; tone?: 'green' | 'blue' | 'purple' }) {
  const bg = tone === 'green' ? colors.greenSoft : tone === 'purple' ? '#F3E8FF' : colors.blueSoft;
  const fg = tone === 'green' ? colors.green : tone === 'purple' ? colors.purple : colors.primary;
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, marginRight: 8 }}>
      <Text style={{ color: fg, fontWeight: '800', fontSize: typography.tiny, lineHeight: 17 }}>{label}</Text>
    </View>
  );
}
