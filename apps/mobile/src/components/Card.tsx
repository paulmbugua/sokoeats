import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { colors, radius, shadow, spacing } from '../theme/tokens';

export default function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: 'rgba(15, 23, 42, 0.06)',
          padding: spacing.lg,
          ...shadow.card,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
