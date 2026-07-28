import React from 'react';
import { Pressable, Text, ViewStyle } from 'react-native';
import { colors, radius, typography } from '../theme/tokens';

export default function Chip({
  label,
  active,
  onPress,
  style,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingHorizontal: 14,
          paddingVertical: 9,
          borderRadius: 999,
          backgroundColor: active ? colors.primary : colors.chip,
          opacity: pressed ? 0.9 : 1,
        },
        style,
      ]}
    >
      <Text style={{ color: active ? 'white' : colors.text, fontWeight: '800', fontSize: typography.small, lineHeight: 19 }}>{label}</Text>
    </Pressable>
  );
}
