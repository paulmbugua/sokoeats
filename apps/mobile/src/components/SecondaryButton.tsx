import React from 'react';
import { Pressable, Text, type ViewStyle } from 'react-native';
import { colors, radius, typography } from '../theme/tokens';

export default function SecondaryButton({
  title,
  onPress,
  style,
}: {
  title: string;
  onPress: () => void;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 56,
          backgroundColor: 'white',
          borderRadius: radius.lg,
          paddingVertical: 16,
          paddingHorizontal: 18,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: 'rgba(15, 23, 42, 0.1)',
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
        style,
      ]}
    >
      <Text style={{ color: colors.ink, fontWeight: '900', fontSize: typography.body }}>{title}</Text>
    </Pressable>
  );
}
