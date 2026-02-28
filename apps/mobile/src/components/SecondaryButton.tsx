import React from 'react';
import { Pressable, Text, ViewStyle } from 'react-native';
import { colors, radius } from '../theme/tokens';

export default function SecondaryButton({ title, onPress, style }: { title: string; onPress: () => void; style?: ViewStyle }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: 'white',
          borderRadius: radius.lg,
          paddingVertical: 14,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          opacity: pressed ? 0.9 : 1,
        },
        style,
      ]}
    >
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>{title}</Text>
    </Pressable>
  );
}
