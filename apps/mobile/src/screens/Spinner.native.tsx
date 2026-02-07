// apps/mobile/src/screens/Spinner.native.tsx
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, View } from 'react-native';
import { useThemePref } from '../theme/ThemeContext';

type Props = {
  inline?: boolean;
  size?: number; // px
};

export default function Spinner({ inline = false, size = 56 }: Props) {
  const { resolvedScheme } = useThemePref();
  const isDark = resolvedScheme === 'dark';
  const fg = isDark ? 'rgba(255,255,255,0.92)' : 'rgba(10,10,10,0.88)';

  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: 650, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [a]);

  const indicatorSize = Math.max(18, Math.round(size * 0.55));

  const spinnerStyle = {
    transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.03] }) }],
  } as const;

  const content = (
    <View style={styles.center}>
      <Animated.View style={spinnerStyle}>
        <ActivityIndicator size={indicatorSize} color={fg} />
      </Animated.View>
    </View>
  );

  if (inline) return content;
  return <View style={styles.full}>{content}</View>;
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  full: { alignItems: 'center', flex: 1, justifyContent: 'center' },
});
