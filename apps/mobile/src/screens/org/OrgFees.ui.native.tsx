// apps/mobile/src/screens/org/OrgFees.ui.native.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal as RNModal,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
  ScrollView,
} from 'react-native';
import tw from '../../../tailwind'; // ✅ adjust if your tw import lives elsewhere

import { moneyFromCents } from './OrgFees.shared.native';

// If you don't have this yet: npx expo install expo-clipboard
import * as Clipboard from 'expo-clipboard';

/* ─────────────────────────────────────────────────────────
 * Theme
 * ───────────────────────────────────────────────────────── */

function useTheme() {
  const scheme = useColorScheme();
  return useMemo(() => {
    const dark = scheme === 'dark';
    return {
      dark,
      card: dark ? '#0f172a' : '#ffffff',
      border: dark ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.12)',
      text: dark ? '#e2e8f0' : '#0f172a',
      subtext: dark ? 'rgba(226,232,240,0.78)' : 'rgba(15,23,42,0.65)',
      muted: dark ? 'rgba(226,232,240,0.55)' : 'rgba(15,23,42,0.45)',
      soft: dark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.06)',
      primary: '#2563eb',

      okBg: dark ? 'rgba(16,185,129,0.16)' : 'rgba(16,185,129,0.12)',
      okBorder: dark ? 'rgba(16,185,129,0.35)' : 'rgba(16,185,129,0.25)',
      okText: dark ? '#d1fae5' : '#064e3b',

      warnBg: dark ? 'rgba(245,158,11,0.16)' : 'rgba(245,158,11,0.12)',
      warnBorder: dark ? 'rgba(245,158,11,0.40)' : 'rgba(245,158,11,0.28)',
      warnText: dark ? '#fde68a' : '#7c2d12',

      neutralBg: dark ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.08)',
      neutralText: dark ? '#e2e8f0' : '#0f172a',
    };
  }, [scheme]);
}

function toneColors(theme: any, tone: 'warn' | 'ok' | 'neutral') {
  if (tone === 'ok') return { bg: theme.okBg, border: theme.okBorder, text: theme.okText };
  if (tone === 'warn') return { bg: theme.warnBg, border: theme.warnBorder, text: theme.warnText };
  return { bg: theme.neutralBg, border: theme.border, text: theme.neutralText };
}

/* ─────────────────────────────────────────────────────────
 * CircleCheckbox
 * ───────────────────────────────────────────────────────── */

export function CircleCheckbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: React.ReactNode;
  disabled?: boolean;
}) {
  const theme = useTheme();

  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={[tw`flex-row items-center`, { opacity: disabled ? 0.6 : 1 }]}
    >
      <View
        style={[
          tw`w-5 h-5 rounded-full border items-center justify-center`,
          { borderColor: checked ? theme.primary : theme.border },
        ]}
      >
        {checked ? <View style={[tw`w-3 h-3 rounded-full`, { backgroundColor: theme.primary }]} /> : null}
      </View>

      <Text style={[tw`ml-2 text-xs`, { color: theme.subtext }]}>{label as any}</Text>
    </TouchableOpacity>
  );
}

/* ─────────────────────────────────────────────────────────
 * CopyRow (native clipboard)
 * ───────────────────────────────────────────────────────── */

export function CopyRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await Clipboard.setStringAsync(String(value || ''));
      setCopied(true);
    } catch {
      // no-op
    }
  };

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <View style={[tw`rounded-3xl border p-3`, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[tw`text-xs font-semibold`, { color: theme.subtext }]}>{label}</Text>

      <View style={tw`mt-2 flex-row items-center justify-between`}>
        <View style={[tw`flex-1 rounded-2xl px-3 py-2 border mr-3`, { borderColor: theme.border, backgroundColor: theme.soft }]}>
          <Text style={[tw`text-xs`, { color: theme.text }]} selectable numberOfLines={4}>
            {value}
          </Text>
        </View>

        <TouchableOpacity
          onPress={onCopy}
          style={[tw`px-3 py-2 rounded-2xl border`, { borderColor: theme.border }]}
        >
          <Text style={[tw`text-xs font-semibold`, { color: theme.text }]}>{copied ? 'Copied' : 'Copy'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────
 * MoneyStack
 * ───────────────────────────────────────────────────────── */

export function MoneyStack({ rows }: { rows: Array<{ currency: string; value: number }> }) {
  const theme = useTheme();

  const cleaned =
    (rows || [])
      .filter((r) => r && r.currency && Number.isFinite(Number(r.value)))
      .map((r) => ({ currency: String(r.currency).toUpperCase(), value: Number(r.value) }))
      .filter((r) => r.value !== 0);

  if (!cleaned.length) return <Text style={[tw`text-xs`, { color: theme.muted }]}>—</Text>;

  return (
    <View style={tw`flex-row flex-wrap justify-end`}>
      {cleaned.map((r) => (
        <View
          key={r.currency}
          style={[
            tw`px-2 py-1 rounded-full border mr-1 mb-1`,
            { backgroundColor: theme.soft, borderColor: theme.border },
          ]}
        >
          <Text style={[tw`text-xs`, { color: theme.text }]}>{moneyFromCents(r.value, r.currency)}</Text>
        </View>
      ))}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────
 * EmptyState / Badge
 * ───────────────────────────────────────────────────────── */

export const EmptyState: React.FC<{ title: string; body: string; action?: React.ReactNode }> = ({
  title,
  body,
  action,
}) => {
  const theme = useTheme();
  return (
    <View
      style={[
        tw`rounded-3xl p-4 border`,
        { borderColor: theme.border, backgroundColor: theme.soft, borderStyle: 'dashed' as any },
      ]}
    >
      <Text style={[tw`text-sm font-bold`, { color: theme.text }]}>{title}</Text>
      <Text style={[tw`text-sm mt-1`, { color: theme.subtext }]}>{body}</Text>
      {action ? <View style={tw`mt-3`}>{action}</View> : null}
    </View>
  );
};

export const Badge: React.FC<{ children: React.ReactNode; tone?: 'warn' | 'ok' | 'neutral' }> = ({
  children,
  tone = 'neutral',
}) => {
  const theme = useTheme();
  const c = toneColors(theme, tone);

  return (
    <View style={[tw`px-2 py-1 rounded-full border`, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[tw`text-xs font-semibold`, { color: c.text }]}>{children as any}</Text>
    </View>
  );
};

/* ─────────────────────────────────────────────────────────
 * Modal (native sheet style)
 * ───────────────────────────────────────────────────────── */

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({
  title,
  onClose,
  children,
}) => {
  const theme = useTheme();

  return (
    <RNModal transparent animationType="slide" onRequestClose={onClose} visible>
      <View style={[tw`flex-1 justify-end`, { backgroundColor: 'rgba(0,0,0,0.40)' }]}>
        <View style={[tw`rounded-t-3xl border`, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[tw`p-4 flex-row items-center justify-between border-b`, { borderColor: theme.border }]}>
            <Text style={[tw`text-base font-bold`, { color: theme.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={[tw`px-3 py-2 rounded-2xl border`, { borderColor: theme.border }]}>
              <Text style={[tw`text-sm font-semibold`, { color: theme.text }]}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={tw`max-h-[520px]`} contentContainerStyle={tw`p-4`}>
            {children}
          </ScrollView>
        </View>
      </View>
    </RNModal>
  );
};

/* ─────────────────────────────────────────────────────────
 * SectionCard
 * ───────────────────────────────────────────────────────── */

export const SectionCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({
  title,
  subtitle,
  children,
}) => {
  const theme = useTheme();

  return (
    <View style={[tw`rounded-3xl border p-4`, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View>
        <Text style={[tw`text-sm font-bold`, { color: theme.text }]}>{title}</Text>
        {subtitle ? <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]}>{subtitle}</Text> : null}
      </View>
      <View style={tw`mt-3`}>{children}</View>
    </View>
  );
};
