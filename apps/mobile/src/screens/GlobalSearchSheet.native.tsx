// apps/mobile/src/components/search/GlobalSearchSheet.native.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import tw from '../../tailwind';

import type { MainStackParamList } from '../navigation/types';
import useUnifiedSearch from '@mytutorapp/shared/hooks/useUnifiedSearch';
import type { UnifiedSearchResult } from '@mytutorapp/shared/types';

import type { ResourceFilters } from '@mytutorapp/shared/hooks/useResourcesExplore';
import { DEFAULT_FILTERS } from '@mytutorapp/shared/hooks/useResourcesExplore';

type Nav = StackNavigationProp<MainStackParamList>;

export type GlobalSearchScope = 'tutors' | 'resources' | 'all';

type Props = {
  visible: boolean;
  onClose: () => void;

  scope?: GlobalSearchScope;

  /** ✅ Single source of truth: screen-owned query + setter */
  query?: string;
  onChangeQuery?: (next: string) => void;

  /** ✅ Single source of truth: screen-owned filters */
  filters?: ResourceFilters;

  /** Optional: open the filter sheet from inside search sheet */
  onPressFilters?: () => void;
};

function safeStr(v: any) {
  return String(v ?? '').trim();
}

function toTitle(s: string) {
  const x = s.trim();
  // ✅ TS2532 fix: charAt is always a string (never undefined)
  return x ? x.charAt(0).toUpperCase() + x.slice(1) : '';
}

function kindLabel(kind?: string) {
  switch (kind) {
    case 'tutor':
      return 'Tutor';
    case 'course':
      return 'Course';
    case 'oer_course':
      return 'OER Book';
    case 'oer_video':
      return 'OER Video';
    case 'classvault_market':
      return 'ClassVault';
    case 'created_course':
      return 'Created Course';
    case 'created_video':
      return 'Created Video';
    case 'purchased_video':
      return 'Purchased Video';
    default:
      return kind ? toTitle(kind.replace(/_/g, ' ')) : 'Result';
  }
}

function getScopeKinds(scope: GlobalSearchScope): string[] {
  if (scope === 'tutors') return ['tutor'];
  if (scope === 'resources') {
    return [
      'oer_course',
      'oer_video',
      'course',
      'classvault_market',
      'created_course',
      'created_video',
      'purchased_video',
    ];
  }
  return []; // "all" => empty means no kinds restriction
}

function routeFromUnifiedItem(
  item: UnifiedSearchResult
): { name?: keyof MainStackParamList; params?: any } {
  const kind = safeStr((item as any).kind);
  const idRaw = (item as any).id;

  if (kind === 'tutor') {
    const id = Number(idRaw) || undefined;
    return { name: 'Profile', params: { id } };
  }

  if (kind === 'course' || kind === 'oer_course' || kind === 'created_course') {
    const courseId = safeStr(idRaw);
    return { name: 'CourseDetails', params: { courseId } };
  }

  if (
    kind === 'classvault_market' ||
    kind === 'created_video' ||
    kind === 'purchased_video' ||
    kind === 'oer_video'
  ) {
    const id = Number(idRaw) || 0;
    return { name: 'ClassVaultDetail', params: { id } };
  }

  return { name: 'Resources', params: { openSearch: true } };
}

const Chip: React.FC<{
  label: string;
  value?: string;
  onPress?: () => void;
  tone?: 'neutral' | 'accent';
}> = ({ label, value, onPress, tone = 'neutral' }) => {
  const hasValue = Boolean(value && value.trim());
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        tw`mr-2 mb-2 px-3 py-2 rounded-full border`,
        tone === 'accent'
          ? tw`border-sky-300/70 dark:border-sky-500/40 bg-sky-50 dark:bg-sky-500/10`
          : tw`border-gray-200/90 dark:border-gray-700 bg-white/70 dark:bg-slate-800/40`,
        pressed && tw`opacity-80`,
      ]}
    >
      <Text style={tw`text-[12px] text-gray-700 dark:text-gray-200`}>
        {label}
        {hasValue ? (
          <Text style={tw`text-[12px] text-gray-500 dark:text-gray-400`}> • {value}</Text>
        ) : null}
      </Text>
    </Pressable>
  );
};

function mapResourceFiltersToUnified(f: ResourceFilters, scope: GlobalSearchScope) {
  const kinds = getScopeKinds(scope);

  // include blanks so patchFilters clears prior values inside the hook
  return {
    kinds, // [] means no restriction
    subject: safeStr(f.subject),
    gradeBand: safeStr(f.gradeBand),
    country: safeStr(f.country),
    sourceKind: safeStr(f.sourceKind),
    scope: safeStr(f.scope),
    minRating: Number.isFinite(f.minRating) ? f.minRating : 0,
    maxPrice: Number.isFinite(f.maxPrice) ? f.maxPrice : 0,
  };
}

export default function GlobalSearchSheetNative({
  visible,
  onClose,
  scope = 'all',
  query,
  onChangeQuery,
  filters,
  onPressFilters,
}: Props) {
  const navigation = useNavigation<Nav>();

  // If screen doesn't control query, keep an internal one
  const [localQ, setLocalQ] = useState('');
  const effectiveQ = typeof query === 'string' ? query : localQ;

  const screenFilters = useMemo<ResourceFilters>(() => {
    return { ...DEFAULT_FILTERS, ...(filters ?? {}) };
  }, [filters]);

  const initialUnified = useMemo(
    () => mapResourceFiltersToUnified(screenFilters, scope),
    [screenFilters, scope]
  );

  const { items, loading, handleSearch, patchFilters, clearFilters, meta } = useUnifiedSearch({
    initialFilters: initialUnified,
  });

  // Sync screen query -> hook query
  useEffect(() => {
    if (!visible) return;
    handleSearch(effectiveQ ?? '');
  }, [visible, effectiveQ, handleSearch]);

  // Sync screen filters -> hook filters
  useEffect(() => {
    if (!visible) return;

    const unified = mapResourceFiltersToUnified(screenFilters, scope);

    patchFilters({
      kinds: unified.kinds,
      subject: unified.subject,
      gradeBand: unified.gradeBand,
      country: unified.country,
      sourceKind: unified.sourceKind,
      scope: unified.scope,
      minRating: unified.minRating,
      maxPrice: unified.maxPrice,
    });
  }, [visible, screenFilters, scope, patchFilters]);

  const onChange = useCallback(
    (t: string) => {
      if (onChangeQuery) onChangeQuery(t);
      else setLocalQ(t);
      handleSearch(t);
    },
    [handleSearch, onChangeQuery]
  );

  const activeFiltersSummary = useMemo(() => {
    const f = screenFilters;
    const parts: string[] = [];
    if (safeStr(f.subject)) parts.push(`Subject: ${f.subject}`);
    if (safeStr(f.gradeBand)) parts.push(`Grade: ${f.gradeBand}`);
    if (safeStr(f.country)) parts.push(`Country: ${f.country}`);
    if (safeStr(f.sourceKind)) parts.push(`Source: ${f.sourceKind}`);
    if (safeStr(f.scope)) parts.push(`Scope: ${f.scope}`);
    if (f.minRating > 0) parts.push(`★ ${f.minRating}+`);
    if (f.maxPrice > 0) parts.push(`≤ ${f.maxPrice} tokens`);
    return parts.join(' • ');
  }, [screenFilters]);

  const headerTitle = useMemo(() => {
    if (scope === 'tutors') return 'Search Tutors';
    if (scope === 'resources') return 'Search Resources';
    return 'Search Everything';
  }, [scope]);

  const close = useCallback(() => onClose(), [onClose]);

  const onPressItem = useCallback(
    (item: UnifiedSearchResult) => {
      const next = routeFromUnifiedItem(item);
      close();
      if (next.name) {
        // @ts-ignore
        navigation.navigate(next.name as never, next.params as never);
      }
    },
    [close, navigation]
  );

  const renderItem = useCallback(
    ({ item }: { item: UnifiedSearchResult }) => {
      const kind = safeStr((item as any).kind);
      const title = safeStr((item as any).title);
      const subject = safeStr((item as any).subject);
      const provider = safeStr((item as any).provider);
      const subtitle = [subject, provider].filter(Boolean).join(' • ');

      return (
        <Pressable
          onPress={() => onPressItem(item)}
          style={({ pressed }) => [
            tw`px-4 py-3 border-b border-gray-100 dark:border-gray-800`,
            pressed && tw`bg-gray-50 dark:bg-slate-800/40`,
          ]}
        >
          <View style={tw`flex-row items-start justify-between gap-3`}>
            <View style={tw`flex-1`}>
              <Text
                numberOfLines={2}
                style={tw`text-[14px] font-semibold text-gray-900 dark:text-gray-100`}
              >
                {title || 'Untitled'}
              </Text>
              {subtitle ? (
                <Text
                  numberOfLines={1}
                  style={tw`text-[12px] text-gray-500 dark:text-gray-400 mt-0.5`}
                >
                  {subtitle}
                </Text>
              ) : null}
            </View>

            <View style={tw`px-2 py-1 rounded-full bg-sky-50 dark:bg-sky-500/10 border border-sky-200/70 dark:border-sky-500/25`}>
              <Text style={tw`text-[11px] text-sky-700 dark:text-sky-200 font-medium`}>
                {kindLabel(kind)}
              </Text>
            </View>
          </View>
        </Pressable>
      );
    },
    [onPressItem]
  );

  const keyExtractor = useCallback((item: UnifiedSearchResult, idx: number) => {
    const kind = safeStr((item as any).kind);
    const id = safeStr((item as any).id);
    return `${kind}:${id || idx}`;
  }, []);

  const resetHookFiltersOnly = useCallback(() => {
    clearFilters();
  }, [clearFilters]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={tw`flex-1`}
      >
        <Pressable onPress={close} style={tw`flex-1 bg-black/35`} />

        <View style={tw`bg-white dark:bg-[#0b121a] rounded-t-3xl overflow-hidden`}>
          <View style={tw`px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800`}>
            <View style={tw`flex-row items-center justify-between`}>
              <Text style={tw`text-[16px] font-semibold text-gray-900 dark:text-gray-100`}>
                {headerTitle}
              </Text>

              <Pressable
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel="Close search"
                style={({ pressed }) => [tw`p-2 rounded-full`, pressed && tw`bg-gray-100 dark:bg-slate-800/50`]}
              >
                <MaterialIcons
                  name="close"
                  size={20}
                  color={tw.color('text-gray-600') || '#475569'}
                />
              </Pressable>
            </View>

            <View style={tw`mt-3 flex-row items-center gap-2`}>
              <View style={tw`flex-1 flex-row items-center px-3 py-2 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-800/40`}>
                <MaterialIcons
                  name="search"
                  size={18}
                  color={tw.color('text-gray-500') || '#64748b'}
                />
                <TextInput
                  value={effectiveQ}
                  onChangeText={onChange}
                  placeholder="Search… (filters-only works too)"
                  placeholderTextColor={tw.color('text-gray-400') || '#94a3b8'}
                  style={tw`flex-1 ml-2 text-[13px] text-gray-900 dark:text-gray-100`}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {safeStr(effectiveQ) ? (
                  <Pressable
                    onPress={() => onChange('')}
                    style={({ pressed }) => [tw`p-1 rounded-full`, pressed && tw`bg-gray-200/60 dark:bg-slate-700/50`]}
                  >
                    <MaterialIcons
                      name="close"
                      size={16}
                      color={tw.color('text-gray-500') || '#64748b'}
                    />
                  </Pressable>
                ) : null}
              </View>

              <Pressable
                onPress={onPressFilters}
                disabled={!onPressFilters}
                style={({ pressed }) => [
                  tw`w-11 h-11 rounded-2xl items-center justify-center border`,
                  tw`border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800/40`,
                  !onPressFilters && tw`opacity-50`,
                  pressed && tw`opacity-80`,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Open filters"
              >
                <MaterialIcons name="tune" size={18} color="#7c3aed" />
              </Pressable>
            </View>

            <View style={tw`mt-3 flex-row flex-wrap`}>
              <Chip
                label="Filters"
                value={activeFiltersSummary || 'None'}
                onPress={onPressFilters}
                tone="accent"
              />
              <Chip label="Reset" onPress={resetHookFiltersOnly} />
              {meta?.aiUsed ? <Chip label="AI" value="on" /> : null}
            </View>
          </View>

          <View style={tw`max-h-[72vh]`}>
            {loading ? (
              <View style={tw`py-10 items-center justify-center`}>
                <ActivityIndicator />
                <Text style={tw`mt-2 text-[12px] text-gray-500 dark:text-gray-400`}>
                  Searching…
                </Text>
              </View>
            ) : items.length === 0 ? (
              <View style={tw`py-10 px-6 items-center justify-center`}>
                <MaterialIcons
                  name="search-off"
                  size={28}
                  color={tw.color('text-gray-400') || '#94a3b8'}
                />
                <Text style={tw`mt-3 text-[13px] text-gray-600 dark:text-gray-300 text-center`}>
                  No results yet.
                </Text>
                <Text style={tw`mt-1 text-[12px] text-gray-500 dark:text-gray-400 text-center`}>
                  Tip: open filters and search with no query.
                </Text>
              </View>
            ) : (
              <FlatList
                data={items}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                keyboardShouldPersistTaps="handled"
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
