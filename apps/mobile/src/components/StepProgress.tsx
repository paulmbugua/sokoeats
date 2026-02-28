import React from 'react';
import { View, Text } from 'react-native';
import { colors } from '../theme/tokens';

export default function StepProgress({ step, total, label }: { step: number; total: number; label: string }) {
  const pct = Math.max(0, Math.min(1, step / total));
  return (
    <View style={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: 10 }}>
      <Text style={{ color: colors.muted, fontWeight: '600', marginBottom: 8 }}>{`Step ${step} of ${total}  ·  ${label}`}</Text>
      <View style={{ height: 6, backgroundColor: '#E5E7EB', borderRadius: 999, overflow: 'hidden' }}>
        <View style={{ height: 6, width: `${pct * 100}%`, backgroundColor: colors.primary }} />
      </View>
    </View>
  );
}
