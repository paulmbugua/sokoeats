import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  Pressable,
  Text,
  View,
  type AlertButton,
  type AlertOptions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, spacing, typography } from '../theme/tokens';

type AlertRequest = {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
};

type ModernAlertProviderProps = {
  children: React.ReactNode;
};

const defaultButton: AlertButton = { text: 'OK' };

function normalizeButtons(buttons?: AlertButton[]): AlertButton[] {
  if (!buttons?.length) return [defaultButton];
  return buttons.map((button) => ({
    ...button,
    text: button.text?.trim() || 'OK',
  }));
}

function getTone(title: string, buttons: AlertButton[]) {
  const lowerTitle = title.toLowerCase();
  if (buttons.some((button) => button.style === 'destructive') || lowerTitle.includes('delete')) {
    return { icon: 'warning-outline' as const, iconBg: '#FEE2E2', iconColor: colors.danger, primary: colors.danger };
  }
  if (lowerTitle.includes('failed') || lowerTitle.includes('error') || lowerTitle.includes('could not')) {
    return { icon: 'alert-circle-outline' as const, iconBg: '#FEF3C7', iconColor: colors.accentDark, primary: colors.primary };
  }
  return { icon: 'checkmark-circle-outline' as const, iconBg: colors.primarySoft, iconColor: colors.primary, primary: colors.primary };
}

export function ModernAlertProvider({ children }: ModernAlertProviderProps) {
  const [current, setCurrent] = useState<AlertRequest | null>(null);
  const queueRef = useRef<AlertRequest[]>([]);
  const originalAlertRef = useRef(Alert.alert);
  const nextIdRef = useRef(1);
  const scale = useRef(new Animated.Value(0.96)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const showNext = useCallback(() => {
    setCurrent((existing) => {
      if (existing) return existing;
      return queueRef.current.shift() || null;
    });
  }, []);

  useEffect(() => {
    if (!current) return;
    scale.setValue(0.96);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 18, stiffness: 240, mass: 0.7, useNativeDriver: true }),
    ]).start();
  }, [current, opacity, scale]);

  const dismiss = useCallback(
    (button?: AlertButton, fromBackdrop = false) => {
      const active = current;
      if (!active) return;
      if (fromBackdrop && active.options?.cancelable === false) return;

      Animated.timing(opacity, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
        setCurrent(null);
        button?.onPress?.();
        if (fromBackdrop) active.options?.onDismiss?.();
        requestAnimationFrame(showNext);
      });
    },
    [current, opacity, showNext],
  );

  useEffect(() => {
    Alert.alert = (title, message, buttons, options) => {
      const request: AlertRequest = {
        id: nextIdRef.current,
        title: String(title || 'Ekazi'),
        message: message ? String(message) : undefined,
        buttons: normalizeButtons(buttons),
        options,
      };
      nextIdRef.current += 1;
      queueRef.current.push(request);
      showNext();
    };

    return () => {
      Alert.alert = originalAlertRef.current;
    };
  }, [showNext]);

  const tone = useMemo(() => (current ? getTone(current.title, current.buttons) : getTone('', [])), [current]);
  const orderedButtons = useMemo(() => {
    if (!current) return [];
    return [...current.buttons].sort((a, b) => {
      const weight = (button: AlertButton) => (button.style === 'cancel' ? 0 : button.style === 'destructive' ? 2 : 1);
      return weight(a) - weight(b);
    });
  }, [current]);

  return (
    <>
      {children}
      <Modal visible={Boolean(current)} transparent animationType="none" statusBarTranslucent onRequestClose={() => dismiss(undefined, true)}>
        <Pressable
          style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: 'rgba(15, 23, 42, 0.48)' }}
          onPress={() => dismiss(undefined, true)}
        >
          <Animated.View style={{ opacity, transform: [{ scale }] }}>
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 420,
                alignSelf: 'center',
                backgroundColor: colors.card,
                borderRadius: radius.lg,
                padding: spacing.xl,
                borderWidth: 1,
                borderColor: 'rgba(15, 23, 42, 0.08)',
                ...shadow.lift,
              }}
            >
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: radius.lg,
                  backgroundColor: tone.iconBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: spacing.md,
                }}
              >
                <Ionicons name={tone.icon} size={28} color={tone.iconColor} />
              </View>

              <Text style={{ color: colors.ink, fontSize: typography.h2, lineHeight: 30, fontWeight: '900' }}>{current?.title}</Text>
              {current?.message ? (
                <Text style={{ color: colors.mutedDark, fontSize: typography.body, lineHeight: 25, marginTop: spacing.sm }}>{current.message}</Text>
              ) : null}

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xl }}>
                {orderedButtons.map((button, index) => {
                  const isCancel = button.style === 'cancel';
                  const isDestructive = button.style === 'destructive';
                  const filled = !isCancel;
                  const bg = filled ? (isDestructive ? colors.danger : tone.primary) : colors.surface;
                  const fg = filled ? 'white' : colors.ink;
                  const key = String(current?.id || 0) + '-' + String(button.text || 'OK') + '-' + String(index);

                  return (
                    <Pressable
                      key={key}
                      onPress={() => dismiss(button)}
                      style={({ pressed }) => ({
                        minHeight: 48,
                        minWidth: orderedButtons.length > 2 ? 86 : 112,
                        flexShrink: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: radius.lg,
                        paddingHorizontal: spacing.lg,
                        backgroundColor: bg,
                        borderWidth: filled ? 0 : 1,
                        borderColor: 'rgba(15, 23, 42, 0.08)',
                        opacity: pressed ? 0.86 : 1,
                        transform: [{ scale: pressed ? 0.98 : 1 }],
                      })}
                    >
                      <Text style={{ color: fg, fontWeight: '900', fontSize: typography.small }}>{button.text}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}
