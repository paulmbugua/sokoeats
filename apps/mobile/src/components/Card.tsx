import React from 'react';
import { View, ViewStyle } from 'react-native';
import { colors, radius } from '../theme/tokens';

export default function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 14,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
