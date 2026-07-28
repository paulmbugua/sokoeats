import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, type ViewStyle } from 'react-native';
import { colors, radius, shadow, typography } from '../theme/tokens';

type Attention = boolean | 'gentle' | 'urgent';

export default function PrimaryButton({
  title,
  onPress,
  style,
  disabled,
  attention = true,
}: {
  title: string;
  onPress: () => void;
  style?: ViewStyle;
  disabled?: boolean;
  attention?: Attention;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (disabled || !attention) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return undefined;
    }
    const duration = attention === 'urgent' ? 1300 : 2300;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [attention, disabled, pulse]);

  const haloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, attention === 'urgent' ? 1.055 : 1.025],
  });
  const haloOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.14, attention === 'urgent' ? 0.28 : 0.2],
  });

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
      {!disabled && attention ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            bottom: -3,
            left: -3,
            borderRadius: radius.lg + 4,
            backgroundColor: colors.primary,
            opacity: haloOpacity,
            transform: [{ scale: haloScale }],
          }}
        />
      ) : null}
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onPressIn={() => animatePress(0.975)}
        onPressOut={() => animatePress(1)}
        style={({ pressed }) => [
          {
            minHeight: 60,
            backgroundColor: disabled ? '#9CA3AF' : colors.primary,
            borderRadius: radius.lg,
            paddingVertical: 17,
            paddingHorizontal: 18,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.92 : 1,
            ...(disabled ? {} : shadow.lift),
          },
        ]}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={{ color: 'white', fontWeight: '900', fontSize: typography.body, lineHeight: 23, textAlign: 'center' }}>{title}</Text>
      </Pressable>
    </Animated.View>
  );
}
