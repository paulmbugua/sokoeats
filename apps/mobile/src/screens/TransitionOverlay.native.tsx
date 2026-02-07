// apps/mobile/src/screens/TransitionOverlay.native.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Portal } from '@gorhom/portal';
import { useThemePref } from '../theme/ThemeContext';
import Spinner from './Spinner.native';

export default function TransitionOverlay({ visible }: { visible: boolean }) {
  const { resolvedScheme } = useThemePref();
  if (!visible) return null;

  const isDark = resolvedScheme === 'dark';

  return (
    <Portal hostName="classroom-host">
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.overlay,
          { backgroundColor: isDark ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.14)' },
        ]}
        pointerEvents="auto"
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? 'rgba(18,18,18,0.78)' : 'rgba(255,255,255,0.78)',
              borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            },
          ]}
        >
          <Spinner inline />
        </View>
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999999,
  },
  card: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    elevation: 6,
  },
});
