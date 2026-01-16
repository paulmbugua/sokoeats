import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from '../../../tailwind';
import { useThemePref } from '../../theme/ThemeContext';

// Modified for Language Learning UX upgrade (theme-aware voice picker).
type Props = {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  loading?: boolean;
  error?: string | null;
};

export default function VoiceSelectNative({ value, onChange, options, loading, error }: Props) {
  const [open, setOpen] = useState(false);
  const themePref = useThemePref();
  const isDark = themePref.resolvedScheme === 'dark';

  const sheetTheme = useMemo(
    () => ({
      bg: isDark ? '#0f172a' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)',
      text: isDark ? '#f8fafc' : '#0f172a',
      subtext: isDark ? 'rgba(248,250,252,0.7)' : 'rgba(15,23,42,0.6)',
      pill: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
    }),
    [isDark]
  );

  const label = loading
    ? 'Loading voices…'
    : error
      ? 'Voices unavailable'
      : value || 'Select a voice';

  const handleSelect = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <>
      {/* Small pill button used in the top bar */}
      <TouchableOpacity
        onPress={() => setOpen(true)}
        disabled={loading}
        style={[tw`px-3 py-1 rounded-full flex-row items-center`, { backgroundColor: sheetTheme.pill }]}
      >
        <Text style={[tw`text-[11px]`, { color: sheetTheme.text }]} numberOfLines={1} ellipsizeMode="tail">
          {label}
        </Text>
        <Text style={[tw`text-[11px] ml-1`, { color: sheetTheme.subtext }]}>▾</Text>
      </TouchableOpacity>

      {/* Bottom-sheet style modal with list of voices */}
      <Modal visible={open} animationType="slide" transparent>
        <SafeAreaView style={[tw`flex-1`, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          {/* Tap outside to close */}
          <Pressable style={tw`flex-1`} onPress={() => setOpen(false)} />

          <View
            style={[
              tw`rounded-t-2xl px-4 pt-3 pb-6 border`,
              { maxHeight: '60%', backgroundColor: sheetTheme.bg, borderColor: sheetTheme.border },
            ]}
          >
            <Text style={[tw`text-base font-semibold mb-2`, { color: sheetTheme.text }]}>
              Select a voice
            </Text>

            {loading && <Text style={[tw`mb-2`, { color: sheetTheme.subtext }]}>Loading voices…</Text>}

            {error && !loading && <Text style={tw`text-red-400 mb-2`}>{error}</Text>}

            <ScrollView>
              {options.length === 0 && !loading && !error && (
                <Text style={[tw`text-xs`, { color: sheetTheme.subtext }]}>No voices available.</Text>
              )}

              {options.map((opt) => {
                const selected = opt === value;
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => handleSelect(opt)}
                    style={[
                      tw`px-3 py-2 rounded-lg mb-1`,
                      { backgroundColor: selected ? '#e2e8f0' : sheetTheme.pill },
                    ]}
                  >
                    <Text style={[tw`text-xs`, { color: selected ? '#0f172a' : sheetTheme.text }]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}
