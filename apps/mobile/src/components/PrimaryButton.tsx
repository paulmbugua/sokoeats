import React from 'react';
import { Pressable, Text, type ViewStyle } from 'react-native';
import { colors, radius, shadow, typography } from '../theme/tokens';

export default function PrimaryButton({
  title,
  onPress,
  style,
  disabled,
}: {
  title: string;
  onPress: () => void;
  style?: ViewStyle;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          minHeight: 56,
          backgroundColor: disabled ? '#9CA3AF' : colors.primary,
          borderRadius: radius.lg,
          paddingVertical: 16,
          paddingHorizontal: 18,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
          ...(disabled ? {} : shadow.lift),
        },
        style,
      ]}
    >
      <Text style={{ color: 'white', fontWeight: '900', fontSize: typography.body }}>{title}</Text>
    </Pressable>
  );
}
