import React, { useRef } from 'react';
import { Animated, Pressable, Text, type ViewStyle } from 'react-native';
import { colors, radius, typography } from '../theme/tokens';

export default function SecondaryButton({
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
  const pressScale = useRef(new Animated.Value(1)).current;
  const animatePress = (toValue: number) => {
    Animated.spring(pressScale, {
      toValue,
      friction: 7,
      tension: 160,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale: pressScale }] }, style]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onPressIn={() => animatePress(0.975)}
        onPressOut={() => animatePress(1)}
        style={({ pressed }) => [
          {
            minHeight: 60,
            backgroundColor: 'white',
            borderRadius: radius.lg,
            paddingVertical: 17,
            paddingHorizontal: 18,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: 'rgba(15, 23, 42, 0.1)',
            opacity: disabled ? 0.55 : pressed ? 0.92 : 1,
          },
        ]}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={{ color: colors.ink, fontWeight: '900', fontSize: typography.body, lineHeight: 23, textAlign: 'center' }}>{title}</Text>
      </Pressable>
    </Animated.View>
  );
}
