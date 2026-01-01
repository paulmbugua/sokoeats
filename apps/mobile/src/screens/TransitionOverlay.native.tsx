// apps/mobile/src/screens/TransitionOverlay.native.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Portal } from '@gorhom/portal';
import { useThemePref } from '../theme/ThemeContext';
import Spinner from './Spinner.native';

export default function TransitionOverlay({
  visible,
  label = 'Opening…',
}: {
  visible: boolean;
  label?: string;
}) {
  const { resolvedScheme } = useThemePref();
  if (!visible) return null;

  const isDark = resolvedScheme === 'dark';

  return (
    <Portal hostName="classroom-host">
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.overlay,
          { backgroundColor: isDark ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.22)' },
        ]}
        pointerEvents="auto"
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? 'rgba(18,18,18,0.92)' : 'rgba(255,255,255,0.92)',
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            },
          ]}
        >
          <Spinner inline label={label} />
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
    paddingVertical: 18,
    paddingHorizontal: 22,
    borderRadius: 22,
    borderWidth: 1,
    // subtle shadow without hardcoding colors
    elevation: 8,
  },
});
