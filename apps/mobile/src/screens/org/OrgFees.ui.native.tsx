/* eslint-disable prettier/prettier */
/* eslint-disable react-hooks/exhaustive-deps */

// apps/mobile/src/screens/org/OrgFees.ui.native.tsx
import React, { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal as RNModal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import tw from '../../../tailwind';
import { moneyFromCents } from './OrgFees.shared.native';

export type FeeTheme = {
  dark: boolean;
  bg: string;
  card: string;
  border: string;
  text: string;
  subtext: string;
  muted: string;

  primary: string;
  primarySoft: string;

  okBg: string;
  okBorder: string;
  okText: string;

  warnBg: string;
  warnBorder: string;
  warnText: string;

  badBg: string;
  badBorder: string;
  badText: string;
};

function defaultTheme(dark: boolean): FeeTheme {
  return {
    dark,
    bg: dark ? '#0b1220' : '#f8fafc',
    card: dark ? '#0f172a' : '#ffffff',
    border: dark ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.12)',
    text: dark ? '#e2e8f0' : '#0f172a',
    subtext: dark ? 'rgba(226,232,240,0.78)' : 'rgba(15,23,42,0.65)',
    muted: dark ? 'rgba(226,232,240,0.55)' : 'rgba(15,23,42,0.45)',

    primary: '#2563eb',
    primarySoft: dark ? 'rgba(37,99,235,0.18)' : 'rgba(37,99,235,0.10)',

    okBg: dark ? 'rgba(16,185,129,0.16)' : 'rgba(16,185,129,0.12)',
    okBorder: dark ? 'rgba(16,185,129,0.35)' : 'rgba(16,185,129,0.25)',
    okText: dark ? '#d1fae5' : '#064e3b',

    warnBg: dark ? 'rgba(245,158,11,0.16)' : 'rgba(245,158,11,0.12)',
    warnBorder: dark ? 'rgba(245,158,11,0.40)' : 'rgba(245,158,11,0.28)',
    warnText: dark ? '#fde68a' : '#7c2d12',

    badBg: dark ? 'rgba(244,63,94,0.14)' : 'rgba(244,63,94,0.10)',
    badBorder: dark ? 'rgba(244,63,94,0.38)' : 'rgba(244,63,94,0.22)',
    badText: dark ? '#fecdd3' : '#9f1239',
  };
}

/** ✅ Exported + safe */
export function useFeeTheme(explicitTheme?: Partial<FeeTheme> | FeeTheme): FeeTheme {
  const scheme = useColorScheme();
  return useMemo(() => {
    const base = defaultTheme(scheme === 'dark');
    if (!explicitTheme) return base;
    return { ...base, ...(explicitTheme as any) };
  }, [scheme, explicitTheme]);
}

/* ─────────────────────────────
 * SheetModal (snap-point bottom sheet)
 * - real slide up/down via translateY (native driver)
 * - snaps are HEIGHTS; translateY = maxSnap - height
 * ───────────────────────────── */

type NonEmptyArray<T> = [T, ...T[]];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toNonEmpty(arr: number[], fallback: number): NonEmptyArray<number> {
  return (arr.length ? arr : [fallback]) as NonEmptyArray<number>;
}

function nearestSnap(current: number, snaps: NonEmptyArray<number>) {
  let best = snaps[0] ?? current;
  for (const s of snaps) {
    if (Math.abs(s - current) < Math.abs(best - current)) best = s;
  }
  return best;
}

function lowerOrEqualSnap(current: number, snaps: NonEmptyArray<number>) {
  let best = snaps[0] ?? current;
  for (const s of snaps) {
    if (s <= current) best = Math.max(best, s);
  }
  return best;
}

function upperOrEqualSnap(current: number, snaps: NonEmptyArray<number>) {
  let best = snaps[snaps.length - 1] ?? current;
  for (const s of snaps) {
    if (s >= current) best = Math.min(best, s);
  }
  return best;
}

export function Modal({
  title,
  onClose,
  children,
  theme: explicitTheme,
  snapPoints = [0.58, 0.84],
  initialSnap = 1,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  theme?: Partial<FeeTheme> | FeeTheme;
  snapPoints?: number[];
  initialSnap?: number;
}) {
  const theme = useFeeTheme(explicitTheme);
  const insets = useSafeAreaInsets();
  const winH = Dimensions.get('window').height;

  const safeMax = Math.max(320, Math.round(winH - (insets.top || 0) - 10));
  const fallbackH = clamp(Math.round(winH * 0.8), 280, safeMax);

  const snapKey = (snapPoints && snapPoints.length ? snapPoints : [0.58, 0.84]).join('|');

  // snaps in px (heights), guaranteed non-empty
  const sps = useMemo<NonEmptyArray<number>>(() => {
    const raw = (snapPoints && snapPoints.length ? snapPoints : [0.58, 0.84])
      .map((p) => clamp(Math.round(winH * p), 280, safeMax))
      .sort((a, b) => a - b);
    return toNonEmpty(raw, fallbackH);
  }, [winH, safeMax, fallbackH, snapKey]);

  const minSnap = sps[0] ?? fallbackH;
  const maxSnap = sps[sps.length - 1] ?? fallbackH;

  const initIdx = clamp(initialSnap ?? 1, 0, sps.length - 1);
  const initH = sps[initIdx] ?? maxSnap;

  // translateY: 0 = fully open (height=maxSnap), maxSnap = closed (offscreen)
  const sheetY = useRef(new Animated.Value(maxSnap)).current;

  const [mounted, setMounted] = useState(true);
  const closingRef = useRef(false);
  const startY = useRef(0);

  const openToHeight = (h: number, cb?: () => void) => {
    const y = clamp(maxSnap - h, 0, maxSnap);
    Animated.spring(sheetY, {
      toValue: y,
      useNativeDriver: true,
      damping: 20,
      stiffness: 220,
      mass: 0.85,
    }).start(() => cb?.());
  };

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.timing(sheetY, {
      toValue: maxSnap,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setMounted(false);
      onClose?.();
    });
  };

  useEffect(() => {
    // ensure consistent closed baseline then open to initial snap
    sheetY.setValue(maxSnap);
    requestAnimationFrame(() => openToHeight(initH));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapTravel = Math.max(1, maxSnap - minSnap);

  const backdropOpacity = sheetY.interpolate({
    inputRange: [maxSnap - snapTravel, maxSnap],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          sheetY.stopAnimation((v: number) => {
            startY.current = Number(v || 0);
          });
        },
        onPanResponderMove: (_, g) => {
          const next = clamp(startY.current + g.dy, 0, maxSnap);
          sheetY.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          const vy = g.vy || 0;

          sheetY.stopAnimation((v: number) => {
            const currentY = Number(v || 0);
            const currentH = clamp(maxSnap - currentY, 0, maxSnap);

            // quick close
            if (currentH < 140 || vy > 1.1) return close();

            const targetH =
              vy > 0.6
                ? lowerOrEqualSnap(currentH, sps)
                : vy < -0.6
                ? upperOrEqualSnap(currentH, sps)
                : nearestSnap(currentH, sps);

            openToHeight(targetH);
          });
        },
      }),
    [maxSnap, sps.join('|')],
  );

  if (!mounted) return null;

  return (
    <RNModal transparent visible onRequestClose={close} animationType="none">
      <View style={tw`flex-1`}>
        {/* backdrop */}
        <Pressable onPress={close} style={tw`absolute inset-0`}>
          <Animated.View
            style={[
              tw`absolute inset-0`,
              {
                backgroundColor: 'rgba(0,0,0,0.55)',
                opacity: backdropOpacity,
              },
            ]}
          />
        </Pressable>

        {/* sheet */}
        <View style={tw`flex-1 justify-end`}>
          <Animated.View
            style={[
              tw`w-full border-t`,
              {
                height: maxSnap,
                transform: [{ translateY: sheetY }],
                backgroundColor: theme.bg,
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                borderColor: theme.border,
                overflow: 'hidden',

                // subtle depth
                ...(Platform.OS === 'android'
                  ? { elevation: 10 }
                  : {
                      shadowColor: '#000',
                      shadowOpacity: theme.dark ? 0.35 : 0.18,
                      shadowRadius: 18,
                      shadowOffset: { width: 0, height: -10 },
                    }),
              },
            ]}
          >
            {/* drag handle */}
            <View
              {...pan.panHandlers}
              style={[
                tw`pt-2 pb-1 items-center`,
                { backgroundColor: theme.bg },
              ]}
            >
              <View style={[tw`w-12 h-1.5 rounded-full`, { backgroundColor: theme.border }]} />
            </View>

            {/* header */}
            <View
              style={[
                tw`px-4 py-3 flex-row items-center justify-between border-b`,
                { borderBottomColor: theme.border, backgroundColor: theme.bg },
              ]}
            >
              <Text style={[tw`text-base font-bold`, { color: theme.text }]} numberOfLines={1}>
                {title}
              </Text>

              <TouchableOpacity
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={[tw`px-3 py-2 rounded-2xl`, { backgroundColor: theme.primarySoft }]}
              >
                <Text style={[tw`text-sm font-bold`, { color: theme.text }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[
                tw`p-4`,
                { paddingBottom: (insets.bottom || 0) + (Platform.OS === 'ios' ? 18 : 12) },
              ]}
            >
              {children}
            </ScrollView>
          </Animated.View>
        </View>
      </View>
    </RNModal>
  );
}

/* ─────────────────────────────
 * Cards / helpers
 * ───────────────────────────── */

export function SectionCard({
  children,
  theme: explicitTheme,
}: {
  children: ReactNode;
  theme?: Partial<FeeTheme> | FeeTheme;
}) {
  const theme = useFeeTheme(explicitTheme);
  return (
    <View style={[tw`rounded-3xl border p-4`, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {children}
    </View>
  );
}

export function EmptyState({
  title,
  body,
  action,
  theme: explicitTheme,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  theme?: Partial<FeeTheme> | FeeTheme;
}) {
  const theme = useFeeTheme(explicitTheme);
  return (
    <View style={[tw`rounded-3xl border p-4`, { borderColor: theme.border, backgroundColor: theme.primarySoft }]}>
      <Text style={[tw`text-base font-bold`, { color: theme.text }]}>{title}</Text>
      <Text style={[tw`text-sm mt-1`, { color: theme.subtext }]}>{body}</Text>
      {action ? <View style={tw`mt-3`}>{action}</View> : null}
    </View>
  );
}

export function Badge({
  tone = 'neutral',
  label,
  children,
  theme: explicitTheme,
}: {
  tone?: 'warn' | 'ok' | 'neutral';
  label?: string;
  children?: ReactNode;
  theme?: Partial<FeeTheme> | FeeTheme;
}) {
  const theme = useFeeTheme(explicitTheme);

  const styles =
    tone === 'ok'
      ? { bg: theme.okBg, border: theme.okBorder, text: theme.okText }
      : tone === 'warn'
      ? { bg: theme.warnBg, border: theme.warnBorder, text: theme.warnText }
      : { bg: theme.primarySoft, border: theme.border, text: theme.text };

  return (
    <View style={[tw`px-3 py-1 rounded-full border`, { backgroundColor: styles.bg, borderColor: styles.border }]}>
      <Text style={[tw`text-[11px] font-bold`, { color: styles.text }]}>{label ?? children}</Text>
    </View>
  );
}

export function CircleCheckbox({
  checked,
  onChange,
  label,
  disabled,
  theme: explicitTheme,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  theme?: Partial<FeeTheme> | FeeTheme;
}) {
  const theme = useFeeTheme(explicitTheme);

  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={[tw`flex-row items-center`, { opacity: disabled ? 0.55 : 1 }]}
    >
      <View
        style={[
          tw`w-5 h-5 rounded-full border mr-2 items-center justify-center`,
          {
            borderColor: checked ? theme.primary : theme.border,
            backgroundColor: checked ? theme.primarySoft : 'transparent',
          },
        ]}
      >
        {checked ? <View style={[tw`w-2.5 h-2.5 rounded-full`, { backgroundColor: theme.primary }]} /> : null}
      </View>

      {typeof label === 'string' ? <Text style={[tw`text-sm`, { color: theme.text }]}>{label}</Text> : label}
    </TouchableOpacity>
  );
}

export function MoneyStack({
  rows,
  theme: explicitTheme,
}: {
  rows: Array<{ currency: string; value: number }>;
  theme?: Partial<FeeTheme> | FeeTheme;
}) {
  const theme = useFeeTheme(explicitTheme);

  const safe = Array.isArray(rows) ? rows : [];
  if (!safe.length) return <Text style={[tw`text-xs`, { color: theme.muted }]}>—</Text>;

  return (
    <View style={tw`mt-1`}>
      {safe.map((r) => (
        <View key={`${r.currency}`} style={tw`flex-row items-center justify-between`}>
          <Text style={[tw`text-[11px]`, { color: theme.muted }]}>{String(r.currency).toUpperCase()}</Text>
          <Text style={[tw`text-[11px] font-bold`, { color: theme.text }]}>
            {moneyFromCents(Number(r.value || 0), String(r.currency || 'USD').toUpperCase())}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function CopyRow({
  label,
  value,
  theme: explicitTheme,
}: {
  label: string;
  value: string;
  theme?: Partial<FeeTheme> | FeeTheme;
}) {
  const theme = useFeeTheme(explicitTheme);
  return (
    <View style={[tw`rounded-2xl border p-3`, { borderColor: theme.border, backgroundColor: theme.card }]}>
      <Text style={[tw`text-xs uppercase tracking-wider`, { color: theme.muted }]}>{label}</Text>
      <Text style={[tw`text-xs mt-1`, { color: theme.text }]} selectable>
        {value}
      </Text>
    </View>
  );
}
