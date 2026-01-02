// apps/mobile/src/screens/Spinner.native.tsx
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useThemePref } from '../theme/ThemeContext';

type Props = {
  label?: string;
  inline?: boolean; // if true, won't full-screen fill
  size?: number; // px
};

export default function Spinner({ label = 'Loading…', inline = false, size = 56 }: Props) {
  const { resolvedScheme } = useThemePref();

  const ring = useSharedValue(0);
  const pulse = useSharedValue(0);

  // ✅ no React.useEffect (fixes import/no-named-as-default-member)
  useEffect(() => {
    ring.value = withRepeat(
      withTiming(1, { duration: 850, easing: Easing.linear }),
      -1,
      false
    );
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDark = resolvedScheme === 'dark';
  const fg = isDark ? 'rgba(255,255,255,0.92)' : 'rgba(10,10,10,0.88)';
  const faint = isDark ? 'rgba(255,255,255,0.20)' : 'rgba(10,10,10,0.14)';

  const rotateStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${ring.value * 360}deg` }],
  }));

  const pulseStyle = useAnimatedStyle(() => {
    const s = 0.92 + pulse.value * 0.12; // 0.92 → 1.04
    return { opacity: 0.75 + pulse.value * 0.25, transform: [{ scale: s }] };
  });

  const dot = Math.max(8, Math.round(size * 0.16));
  const bw = Math.max(2, Math.round(size * 0.07));
  const radius = Math.round(size / 2);
  const coreSize = Math.max(10, Math.round(size * 0.22));

  const content = (
    <View style={styles.center}>
      <View style={[styles.ringWrap, { height: size, width: size }]}>
        {/* faint ring */}
        <View
          style={{
            borderColor: faint,
            borderRadius: radius,
            borderWidth: bw,
            height: size,
            width: size,
          }}
        />

        {/* orbiting dot */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.orbit, rotateStyle]}>
          <View
            style={{
              backgroundColor: fg,
              borderRadius: dot / 2,
              height: dot,
              width: dot,
            }}
          />
        </Animated.View>

        {/* pulsing core */}
        <Animated.View
          style={[
            styles.core,
            pulseStyle,
            {
              backgroundColor: fg,
              borderRadius: coreSize / 2,
              height: coreSize,
              width: coreSize,
            },
          ]}
        />
      </View>

      {!!label && (
        <Text numberOfLines={1} style={[styles.label, { color: fg }]}>
          {label}
        </Text>
      )}
    </View>
  );

  if (inline) return content;
  return <View style={styles.full}>{content}</View>;
}

const styles = StyleSheet.create({
  // ✅ style keys sorted: center before full
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: {
    position: 'absolute',
  },
  // ✅ alignItems before flex (your lint rule wants that)
  full: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  // ✅ fontSize before marginTop (your lint rule wants that)
  label: {
    fontSize: 14,
    letterSpacing: 0.2,
    marginTop: 12,
  },
  orbit: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
