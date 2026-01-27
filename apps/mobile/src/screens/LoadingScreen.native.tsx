// apps/mobile/src/screens/LoadingScreen.native.tsx
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Image, View, StyleSheet } from 'react-native';

// ✅ no-require-imports: import the asset instead of require()
import brandMark from '../../assets/brand-mark.png';

type Props = {
  /**
   * 0..1 value controlled by parent (cross-fade out)
   */
  opacity?: Animated.AnimatedInterpolation<string | number> | Animated.Value;
};

export default function LoadingScreenNative({ opacity }: Props) {
  const fadeIn = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  const containerOpacity = useMemo(() => opacity ?? fadeIn, [opacity, fadeIn]);

  useEffect(() => {
    // Subtle “wake up” motion (Meta-style)
    Animated.parallel([
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeIn, scale]);

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Image source={brandMark} style={styles.logo} resizeMode="contain" />
      </Animated.View>

      {/* Footer intentionally omitted here — it only belongs on native splash */}
      <View style={styles.footerSpace} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: '#000000',
    justifyContent: 'center',
  },

  // ✅ react-native/sort-styles: class name order (footerSpace before logo)
  footerSpace: {
    bottom: 0,
    height: 64,
    position: 'absolute',
    width: '100%',
  },

  logo: {
    height: 180,
    width: 180,
  },
});
