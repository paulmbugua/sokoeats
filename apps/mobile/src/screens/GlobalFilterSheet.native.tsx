// apps/mobile/src/components/search/GlobalFilterSheet.native.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import tw from '../../tailwind';

import type { ResourceFilters } from '@mytutorapp/shared/hooks/useResourcesExplore';
import { DEFAULT_FILTERS } from '@mytutorapp/shared/hooks/useResourcesExplore';

type Props = {
  visible: boolean;
  onClose: () => void;

  value: ResourceFilters;

  /**
   * The parent can implement this as:
   *   onChange={(next) => setFilters((prev) => ({ ...prev, ...next }))}
   * or if you prefer, treat it as "full value" and just setFilters(next as ResourceFilters).
   */
  onChange: (patch: Partial<ResourceFilters>) => void;
  onReset: () => void;
};

type Option<T extends string> = { label: string; value: T };

const SOURCE_OPTIONS: Option<'' | 'oer' | 'tutor'>[] = [
  { label: 'Any source', value: '' },
  { label: 'OER only', value: 'oer' },
  { label: 'Tutor only', value: 'tutor' },
];

const SCOPE_OPTIONS: Option<'' | 'free' | 'purchased'>[] = [
  { label: 'Any access', value: '' },
  { label: 'Free only', value: 'free' },
  { label: 'Purchased only', value: 'purchased' },
];

const MIN_RATING_OPTIONS: Option<string>[] = [
  { label: 'Any rating', value: '0' },
  { label: '★ 3+', value: '3' },
  { label: '★ 4+', value: '4' },
  { label: '★ 4.5+', value: '4.5' },
];

const MAX_PRICE_OPTIONS: Option<string>[] = [
  { label: 'Any price', value: '0' },
  { label: '≤ 20 tokens', value: '20' },
  { label: '≤ 50 tokens', value: '50' },
  { label: '≤ 100 tokens', value: '100' },
];

const Pill: React.FC<{
  label: string;
  selected?: boolean;
  onPress?: () => void;
}> = ({ label, selected, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      tw`px-3 py-2 rounded-full border mr-2 mb-2`,
      selected
        ? tw`border-sky-300/70 dark:border-sky-500/40 bg-sky-50 dark:bg-sky-500/10`
        : tw`border-gray-200/90 dark:border-gray-700 bg-white/70 dark:bg-slate-800/40`,
      pressed && tw`opacity-80`,
    ]}
  >
    <Text
      style={[
        tw`text-[12px] font-medium`,
        selected ? tw`text-sky-700 dark:text-sky-200` : tw`text-gray-700 dark:text-gray-200`,
      ]}
    >
      {label}
    </Text>
  </Pressable>
);

function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function GlobalFilterSheetNative({
  visible,
  onClose,
  value,
  onChange,
  onReset,
}: Props) {
  // Local draft so user can cancel without changing global state
  const [draft, setDraft] = useState<ResourceFilters>(() => ({ ...DEFAULT_FILTERS, ...value }));

  // keep draft in sync when opening or when value changes externally
  useEffect(() => {
    if (visible) setDraft({ ...DEFAULT_FILTERS, ...value });
  }, [visible, value]);

  const sectionTitle = useCallback(
    (t: string) => (
      <Text style={tw`text-[13px] font-semibold text-gray-900 dark:text-gray-100 mb-2`}>
        {t}
      </Text>
    ),
    []
  );

  const apply = useCallback(() => {
    // emit full patch (simple + reliable)
    onChange({ ...draft });
    onClose();
  }, [draft, onChange, onClose]);

  const reset = useCallback(() => {
    const cleared = { ...DEFAULT_FILTERS };
    setDraft(cleared);
    onReset(); // parent resets its state too
  }, [onReset]);

  const sheetMaxH = useMemo(() => tw`max-h-[72vh]`, []);
  const fieldWrap = useMemo(
    () =>
      tw`flex-row items-center px-3 py-2 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-800/40`,
    []
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={tw`flex-1`}
      >
        {/* Backdrop */}
        <Pressable onPress={onClose} style={tw`flex-1 bg-black/35`} />

        {/* Sheet */}
        <View style={tw`bg-white dark:bg-[#0b121a] rounded-t-3xl overflow-hidden`}>
          {/* Header */}
          <View style={tw`px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800`}>
            <View style={tw`flex-row items-center justify-between`}>
              <Text style={tw`text-[16px] font-semibold text-gray-900 dark:text-gray-100`}>
                Filters
              </Text>

              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  tw`p-2 rounded-full`,
                  pressed && tw`bg-gray-100 dark:bg-slate-800/50`,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Close filters"
              >
                <MaterialIcons
                  name="close"
                  size={20}
                  color={tw.color('text-gray-600') || '#475569'}
                />
              </Pressable>
            </View>

            <Text style={tw`mt-1 text-[12px] text-gray-500 dark:text-gray-400`}>
              Works with “filters-only” search (no query needed).
            </Text>
          </View>

          <ScrollView style={sheetMaxH} contentContainerStyle={tw`pb-5`}>
            {/* Subject */}
            <View style={[tw`px-4`, tw`mt-4`]}>
              {sectionTitle('Subject')}
              <View style={fieldWrap}>
                <MaterialIcons
                  name="menu-book"
                  size={16}
                  color={tw.color('text-gray-500') || '#64748b'}
                />
                <TextInput
                  value={draft.subject}
                  onChangeText={(t) => setDraft((p) => ({ ...p, subject: t }))}
                  placeholder="e.g. Math, English…"
                  placeholderTextColor={tw.color('text-gray-400') || '#94a3b8'}
                  style={tw`flex-1 ml-2 text-[13px] text-gray-900 dark:text-gray-100`}
                />
              </View>
            </View>

            {/* Grade band */}
            <View style={[tw`px-4`, tw`mt-4`]}>
              {sectionTitle('Grade band')}
              <View style={fieldWrap}>
                <MaterialIcons
                  name="school"
                  size={16}
                  color={tw.color('text-gray-500') || '#64748b'}
                />
                <TextInput
                  value={draft.gradeBand}
                  onChangeText={(t) => setDraft((p) => ({ ...p, gradeBand: t }))}
                  placeholder="e.g. Primary, High school…"
                  placeholderTextColor={tw.color('text-gray-400') || '#94a3b8'}
                  style={tw`flex-1 ml-2 text-[13px] text-gray-900 dark:text-gray-100`}
                />
              </View>
            </View>

            {/* Country */}
            <View style={[tw`px-4`, tw`mt-4`]}>
              {sectionTitle('Country')}
              <View style={fieldWrap}>
                <MaterialIcons
                  name="public"
                  size={16}
                  color={tw.color('text-gray-500') || '#64748b'}
                />
                <TextInput
                  value={draft.country}
                  onChangeText={(t) => setDraft((p) => ({ ...p, country: t }))}
                  placeholder="e.g. KE, QA…"
                  placeholderTextColor={tw.color('text-gray-400') || '#94a3b8'}
                  style={tw`flex-1 ml-2 text-[13px] text-gray-900 dark:text-gray-100`}
                  autoCapitalize="characters"
                />
              </View>
            </View>

            {/* Source kind */}
            <View style={[tw`px-4`, tw`mt-4`]}>
              {sectionTitle('Source')}
              <View style={tw`flex-row flex-wrap`}>
                {SOURCE_OPTIONS.map((o) => (
                  <Pill
                    key={o.value}
                    label={o.label}
                    selected={draft.sourceKind === o.value}
                    onPress={() => setDraft((p) => ({ ...p, sourceKind: o.value }))}
                  />
                ))}
              </View>
            </View>

            {/* Scope */}
            <View style={[tw`px-4`, tw`mt-2`]}>
              {sectionTitle('Scope')}
              <View style={tw`flex-row flex-wrap`}>
                {SCOPE_OPTIONS.map((o) => (
                  <Pill
                    key={o.value}
                    label={o.label}
                    selected={draft.scope === o.value}
                    onPress={() => setDraft((p) => ({ ...p, scope: o.value }))}
                  />
                ))}
              </View>
            </View>

            {/* Min rating */}
            <View style={[tw`px-4`, tw`mt-2`]}>
              {sectionTitle('Minimum rating')}
              <View style={tw`flex-row flex-wrap`}>
                {MIN_RATING_OPTIONS.map((o) => {
                  const v = num(o.value);
                  const selected = (draft.minRating || 0) === v;
                  return (
                    <Pill
                      key={o.value}
                      label={o.label}
                      selected={selected}
                      onPress={() => setDraft((p) => ({ ...p, minRating: v }))}
                    />
                  );
                })}
              </View>
            </View>

            {/* Max price */}
            <View style={[tw`px-4`, tw`mt-2`]}>
              {sectionTitle('Max price (tokens)')}
              <View style={tw`flex-row flex-wrap`}>
                {MAX_PRICE_OPTIONS.map((o) => {
                  const v = num(o.value);
                  const selected = (draft.maxPrice || 0) === v;
                  return (
                    <Pill
                      key={o.value}
                      label={o.label}
                      selected={selected}
                      onPress={() => setDraft((p) => ({ ...p, maxPrice: v }))}
                    />
                  );
                })}
              </View>
            </View>
          </ScrollView>

          {/* Footer actions */}
          <View style={tw`px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex-row gap-3`}>
            <Pressable
              onPress={reset}
              style={({ pressed }) => [
                tw`flex-1 h-11 rounded-2xl border border-gray-200 dark:border-gray-700 items-center justify-center bg-white dark:bg-slate-800/40`,
                pressed && tw`opacity-80`,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Reset filters"
            >
              <Text style={tw`text-[13px] font-semibold text-gray-700 dark:text-gray-200`}>
                Reset
              </Text>
            </Pressable>

            <Pressable
              onPress={apply}
              style={({ pressed }) => [tw`flex-1 h-11 rounded-2xl items-center justify-center bg-sky-600`, pressed && tw`opacity-80`]}
              accessibilityRole="button"
              accessibilityLabel="Apply filters"
            >
              <Text style={tw`text-[13px] font-semibold text-white`}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
