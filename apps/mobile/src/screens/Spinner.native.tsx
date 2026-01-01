// apps/mobile/src/screens/Spinner.native.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
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

  React.useEffect(() => {
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
    return { transform: [{ scale: s }], opacity: 0.75 + pulse.value * 0.25 };
  });

  const dot = Math.max(8, Math.round(size * 0.16));
  const bw = Math.max(2, Math.round(size * 0.07));
  const radius = Math.round(size / 2);

  const Content = (
    <View style={styles.center}>
      <View style={[styles.ringWrap, { width: size, height: size }]}>
        {/* faint ring */}
        <View
          style={{
            width: size,
            height: size,
            borderRadius: radius,
            borderWidth: bw,
            borderColor: faint,
          }}
        />

        {/* orbiting dot */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { alignItems: 'center', justifyContent: 'flex-start' },
            rotateStyle,
          ]}
        >
          <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: fg }} />
        </Animated.View>

        {/* pulsing core */}
        <Animated.View
          style={[
            styles.core,
            pulseStyle,
            {
              width: Math.max(10, Math.round(size * 0.22)),
              height: Math.max(10, Math.round(size * 0.22)),
              borderRadius: Math.max(10, Math.round(size * 0.22)) / 2,
              backgroundColor: fg,
            },
          ]}
        />
      </View>

      {!!label && (
        <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </View>
  );

  if (inline) return Content;

  return <View style={styles.full}>{Content}</View>;
}

const styles = StyleSheet.create({
  full: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: {
    position: 'absolute',
  },
  label: {
    marginTop: 12,
    fontSize: 14,
    letterSpacing: 0.2,
  },
});
