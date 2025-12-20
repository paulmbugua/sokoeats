import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from '../../../tailwind';

type Props = {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  loading?: boolean;
  error?: string | null;
};

export default function VoiceSelectNative({ value, onChange, options, loading, error }: Props) {
  const [open, setOpen] = useState(false);

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
        style={tw`px-3 py-1 rounded-full bg-white/10 flex-row items-center`}
      >
        <Text style={tw`text-white text-[11px]`} numberOfLines={1} ellipsizeMode="tail">
          {label}
        </Text>
        <Text style={tw`text-white/80 text-[11px] ml-1`}>▾</Text>
      </TouchableOpacity>

      {/* Bottom-sheet style modal with list of voices */}
      <Modal visible={open} animationType="slide" transparent>
        <SafeAreaView style={[tw`flex-1`, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          {/* Tap outside to close */}
          <Pressable style={tw`flex-1`} onPress={() => setOpen(false)} />

          <View style={[tw`bg-slate-900 rounded-t-2xl px-4 pt-3 pb-6`, { maxHeight: '60%' }]}>
            <Text style={tw`text-white text-base font-semibold mb-2`}>Select a voice</Text>

            {loading && <Text style={tw`text-white/80 mb-2`}>Loading voices…</Text>}

            {error && !loading && <Text style={tw`text-red-300 mb-2`}>{error}</Text>}

            <ScrollView>
              {options.length === 0 && !loading && !error && (
                <Text style={tw`text-white/70 text-xs`}>No voices available.</Text>
              )}

              {options.map((opt) => {
                const selected = opt === value;
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => handleSelect(opt)}
                    style={tw`px-3 py-2 rounded-lg mb-1 ${selected ? 'bg-white' : 'bg-white/5'}`}
                  >
                    <Text style={tw`text-xs ${selected ? 'text-black' : 'text-white'}`}>{opt}</Text>
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
