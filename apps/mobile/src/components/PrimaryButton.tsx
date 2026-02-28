import React from 'react';
import { Pressable, Text, ViewStyle } from 'react-native';
import { colors, radius } from '../theme/tokens';

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
          backgroundColor: disabled ? '#9BB6FF' : colors.primary,
          borderRadius: radius.lg,
          paddingVertical: 14,
          alignItems: 'center',
          opacity: pressed ? 0.9 : 1,
        },
        style,
      ]}
    >
      <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>{title}</Text>
    </Pressable>
  );
}
