import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import tw from '../../../tailwind';
import { COUNTRIES } from '@mytutorapp/shared/utils/countries';

export type ExploreFilters = {
  subject?: string;
  grade?: string;
  level?: string;
  country?: string;
  minRating?: number;
  maxPrice?: number;
  duration?: string;
  provider?: string;
  scope?: 'all' | 'purchased' | 'free';
};

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  filters: ExploreFilters;
  onFiltersChange: (next: Partial<ExploreFilters>) => void;
  onClearAll: () => void;
  variant: 'courses' | 'library';
  placeholder?: string;
  isDark?: boolean;
};

type CountryOpt = { code: string; name: string };

const COUNTRY_LIST: CountryOpt[] = Array.isArray(COUNTRIES)
  ? (COUNTRIES as any[])
      .map((c) => {
        if (!c) return null;
        if (typeof c === 'string') return { code: c, name: c };
        const code = String((c as any).code ?? (c as any).value ?? (c as any).iso2 ?? '').trim();
        const name = String((c as any).name ?? (c as any).label ?? code).trim();
        if (!code && !name) return null;
        return { code: code || name, name: name || code };
      })
      .filter(Boolean)
  : [];

const Chip: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
  <Pressable
    onPress={onPress}
    style={tw`px-3 h-8 rounded-full items-center justify-center bg-white/90 dark:bg-[#0b1420]/80 border border-[#cedbe8] dark:border-white/10`}
  >
    <Text style={tw`text-[11px] font-semibold text-[#0d141c] dark:text-white`}>{label}</Text>
  </Pressable>
);

export default function ExploreSearchFiltersBar({
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  onClearAll,
  variant,
  placeholder,
  isDark,
}: Props) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [countryModal, setCountryModal] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  const countryFilteredList = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return COUNTRY_LIST.slice(0, 220);
    return COUNTRY_LIST.filter((c) => `${c.code} ${c.name}`.toLowerCase().includes(q)).slice(0, 250);
  }, [countrySearch]);

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (filters.subject)
      chips.push({
        key: 'subject',
        label: `Subject: ${filters.subject}`,
        onClear: () => onFiltersChange({ subject: '' }),
      });
    if (filters.grade)
      chips.push({
        key: 'grade',
        label: `Grade: ${filters.grade}`,
        onClear: () => onFiltersChange({ grade: '' }),
      });
    if (filters.level)
      chips.push({
        key: 'level',
        label: `Level: ${filters.level}`,
        onClear: () => onFiltersChange({ level: '' }),
      });
    if (filters.country)
      chips.push({
        key: 'country',
        label: `Country: ${filters.country}`,
        onClear: () => onFiltersChange({ country: '' }),
      });
    if (filters.minRating)
      chips.push({
        key: 'rating',
        label: `Min★ ${filters.minRating}`,
        onClear: () => onFiltersChange({ minRating: 0 }),
      });
    if (filters.maxPrice)
      chips.push({
        key: 'price',
        label: `Max $${filters.maxPrice}`,
        onClear: () => onFiltersChange({ maxPrice: 0 }),
      });
    if (filters.duration)
      chips.push({
        key: 'duration',
        label: `Duration: ${filters.duration}`,
        onClear: () => onFiltersChange({ duration: '' }),
      });
    if (filters.provider)
      chips.push({
        key: 'provider',
        label: `Provider: ${filters.provider}`,
        onClear: () => onFiltersChange({ provider: '' }),
      });
    if (filters.scope && filters.scope !== 'all')
      chips.push({
        key: 'scope',
        label: filters.scope === 'free' ? 'Free only' : 'Purchased only',
        onClear: () => onFiltersChange({ scope: 'all' }),
      });
    return chips;
  }, [filters, onFiltersChange]);

  return (
    <View style={tw`mt-3`}>
      <View style={tw`flex-row items-center`}>
        <View style={tw`flex-1 rounded-xl overflow-hidden`}>
          <View style={tw`flex-row items-center bg-[#e7edf4] dark:bg-[#172534] h-11 px-3 rounded-xl`}>
            <Text style={tw`text-base mr-2 text-[#0d141c] dark:text-white`}>🔎</Text>
            <TextInput
              value={query}
              onChangeText={onQueryChange}
              placeholder={placeholder ?? 'Search by subject, grade, country…'}
              placeholderTextColor={isDark ? '#9fb3d1' : '#49739c'}
              style={tw`flex-1 text-[#0d141c] dark:text-white`}
              autoCapitalize="none"
            />
          </View>
        </View>

        <Pressable
          onPress={() => setPanelOpen(true)}
          style={tw`ml-2 h-11 px-4 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
        >
          <Text style={tw`text-xs font-semibold text-[#0d141c] dark:text-white`}>Filters</Text>
        </Pressable>

        <Pressable
          onPress={onClearAll}
          style={tw`ml-2 h-11 px-4 rounded-xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 items-center justify-center`}
        >
          <Text style={tw`text-xs font-semibold text-[#0d141c] dark:text-white`}>Clear</Text>
        </Pressable>
      </View>

      {activeChips.length > 0 && (
        <View style={tw`mt-3 flex-row flex-wrap gap-2`}>
          {activeChips.map((chip) => (
            <Chip key={chip.key} label={`${chip.label} ✕`} onPress={chip.onClear} />
          ))}
        </View>
      )}

      <Modal
        visible={panelOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setPanelOpen(false)}
      >
        <View style={tw`flex-1 bg-black/40 items-center justify-center p-4`}>
          <View
            style={tw`w-full max-w-md rounded-2xl bg-white dark:bg-[#0f1821] p-4 border border-[#cedbe8] dark:border-white/10`}
          >
            <Text style={tw`text-lg font-bold text-slate-900 dark:text-white`}>Filters</Text>
            <Text style={tw`text-xs text-[#49739c] dark:text-white/70 mt-1 mb-3`}>
              {variant === 'courses'
                ? 'Refine courses by country, level, rating, and price.'
                : 'Filter your library across purchased and free resources.'}
            </Text>

            <ScrollView style={tw`max-h-[420px]`} showsVerticalScrollIndicator={false}>
              {[
                {
                  label: 'Subject',
                  value: filters.subject ?? '',
                  key: 'subject',
                  placeholder: 'e.g., Math',
                },
                {
                  label: 'Grade / age band',
                  value: filters.grade ?? '',
                  key: 'grade',
                  placeholder: 'e.g., K-5',
                },
              ].map((field) => (
                <View key={field.key} style={tw`mb-3`}>
                  <Text style={tw`text-xs font-semibold text-[#0d141c] dark:text-white mb-1`}>
                    {field.label}
                  </Text>
                  <TextInput
                    value={field.value}
                    onChangeText={(val) => onFiltersChange({ [field.key]: val } as any)}
                    placeholder={field.placeholder}
                    placeholderTextColor={isDark ? '#9fb3d1' : '#7a8aa0'}
                    style={tw`w-full text-sm rounded-lg p-2 bg-[#e7edf4] dark:bg-[#172534] text-slate-900 dark:text-white`}
                  />
                </View>
              ))}

              <View style={tw`mb-3`}>
                <Text style={tw`text-xs font-semibold text-[#0d141c] dark:text-white mb-1`}>Country</Text>
                <Pressable
                  onPress={() => setCountryModal(true)}
                  style={tw`w-full text-sm rounded-lg p-2 bg-[#e7edf4] dark:bg-[#172534]`}
                >
                  <Text style={tw`text-slate-900 dark:text-white`}>
                    {filters.country ? filters.country : 'Select country'}
                  </Text>
                </Pressable>
              </View>

              {variant === 'courses' && (
                <View style={tw`mb-3`}>
                  <Text style={tw`text-xs font-semibold text-[#0d141c] dark:text-white mb-1`}>
                    Level
                  </Text>
                  <TextInput
                    value={filters.level ?? ''}
                    onChangeText={(val) => onFiltersChange({ level: val })}
                    placeholder="Beginner / Intermediate"
                    placeholderTextColor={isDark ? '#9fb3d1' : '#7a8aa0'}
                    style={tw`w-full text-sm rounded-lg p-2 bg-[#e7edf4] dark:bg-[#172534] text-slate-900 dark:text-white`}
                  />
                </View>
              )}

              {variant === 'courses' && (
                <View style={tw`mb-3`}>
                  <Text style={tw`text-xs font-semibold text-[#0d141c] dark:text-white mb-1`}>
                    Min rating (1-5)
                  </Text>
                  <TextInput
                    value={filters.minRating ? String(filters.minRating) : ''}
                    onChangeText={(val) => onFiltersChange({ minRating: Number(val || 0) })}
                    placeholder="e.g., 4"
                    keyboardType="numeric"
                    placeholderTextColor={isDark ? '#9fb3d1' : '#7a8aa0'}
                    style={tw`w-full text-sm rounded-lg p-2 bg-[#e7edf4] dark:bg-[#172534] text-slate-900 dark:text-white`}
                  />
                </View>
              )}

              {variant === 'courses' && (
                <View style={tw`mb-3`}>
                  <Text style={tw`text-xs font-semibold text-[#0d141c] dark:text-white mb-1`}>
                    Max price
                  </Text>
                  <TextInput
                    value={filters.maxPrice ? String(filters.maxPrice) : ''}
                    onChangeText={(val) => onFiltersChange({ maxPrice: Number(val || 0) })}
                    placeholder="e.g., 50"
                    keyboardType="numeric"
                    placeholderTextColor={isDark ? '#9fb3d1' : '#7a8aa0'}
                    style={tw`w-full text-sm rounded-lg p-2 bg-[#e7edf4] dark:bg-[#172534] text-slate-900 dark:text-white`}
                  />
                </View>
              )}

              {variant === 'courses' && (
                <View style={tw`mb-3`}>
                  <Text style={tw`text-xs font-semibold text-[#0d141c] dark:text-white mb-1`}>
                    Duration contains
                  </Text>
                  <TextInput
                    value={filters.duration ?? ''}
                    onChangeText={(val) => onFiltersChange({ duration: val })}
                    placeholder="e.g., 10 weeks"
                    placeholderTextColor={isDark ? '#9fb3d1' : '#7a8aa0'}
                    style={tw`w-full text-sm rounded-lg p-2 bg-[#e7edf4] dark:bg-[#172534] text-slate-900 dark:text-white`}
                  />
                </View>
              )}

              {variant === 'library' && (
                <View style={tw`mb-3`}>
                  <Text style={tw`text-xs font-semibold text-[#0d141c] dark:text-white mb-1`}>
                    Provider
                  </Text>
                  <TextInput
                    value={filters.provider ?? ''}
                    onChangeText={(val) => onFiltersChange({ provider: val })}
                    placeholder="e.g., Khan Academy"
                    placeholderTextColor={isDark ? '#9fb3d1' : '#7a8aa0'}
                    style={tw`w-full text-sm rounded-lg p-2 bg-[#e7edf4] dark:bg-[#172534] text-slate-900 dark:text-white`}
                  />
                </View>
              )}

              {variant === 'library' && (
                <View style={tw`mb-3`}>
                  <Text style={tw`text-xs font-semibold text-[#0d141c] dark:text-white mb-1`}>
                    Content type
                  </Text>
                  <View style={tw`flex-row gap-2`}>
                    {['all', 'purchased', 'free'].map((key) => {
                      const active = (filters.scope ?? 'all') === key;
                      return (
                        <Pressable
                          key={key}
                          onPress={() => onFiltersChange({ scope: key as ExploreFilters['scope'] })}
                          style={tw.style(
                            'flex-1 h-10 rounded-xl items-center justify-center',
                            active ? 'bg-[#3d99f5]' : 'bg-[#e7edf4] dark:bg-[#172534]'
                          )}
                        >
                          <Text style={tw.style('text-xs font-semibold', active ? 'text-white' : 'text-[#0d141c] dark:text-white')}>
                            {key === 'all' ? 'All' : key === 'purchased' ? 'Purchased' : 'Free'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={tw`flex-row justify-end gap-2 mt-2`}>
              <Pressable
                onPress={() => setPanelOpen(false)}
                style={tw`h-10 px-4 rounded-xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 items-center justify-center`}
              >
                <Text style={tw`text-sm text-slate-900 dark:text-white`}>Done</Text>
              </Pressable>
              <Pressable
                onPress={onClearAll}
                style={tw`h-10 px-4 rounded-xl bg-[#3d99f5] items-center justify-center`}
              >
                <Text style={tw`text-sm text-white font-semibold`}>Clear all</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={countryModal}
        animationType="slide"
        transparent
        onRequestClose={() => setCountryModal(false)}
      >
        <Pressable
          style={tw`flex-1 bg-black/50 justify-end`}
          onPress={() => setCountryModal(false)}
        >
          <Pressable style={tw`bg-white dark:bg-[#0f1821] rounded-t-2xl p-4`}>
            <View style={tw`flex-row items-center justify-between mb-2`}>
              <Text style={tw`text-base font-bold text-slate-900 dark:text-white`}>Select country</Text>
              <Pressable onPress={() => setCountryModal(false)} style={tw`px-3 py-2`}>
                <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>Close</Text>
              </Pressable>
            </View>

            <View style={tw`flex-row items-center bg-[#e7edf4] dark:bg-[#172534] rounded-xl px-3 h-10 mb-3`}>
              <Text style={tw`text-sm mr-2`}>🔎</Text>
              <TextInput
                placeholder="Search country…"
                placeholderTextColor={isDark ? '#9fb3d1' : '#7a8aa0'}
                value={countrySearch}
                onChangeText={setCountrySearch}
                style={tw`flex-1 text-sm text-slate-900 dark:text-white`}
              />
            </View>

            <Pressable
              onPress={() => {
                onFiltersChange({ country: '' });
                setCountrySearch('');
                setCountryModal(false);
              }}
              style={tw`py-2`}
            >
              <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>Any country</Text>
            </Pressable>

            <ScrollView style={tw`max-h-[320px]`} showsVerticalScrollIndicator={false}>
              {countryFilteredList.map((c) => {
                const active = String(filters.country || '').toLowerCase() === c.name.toLowerCase();
                return (
                  <Pressable
                    key={c.code}
                    onPress={() => {
                      onFiltersChange({ country: c.name });
                      setCountrySearch('');
                      setCountryModal(false);
                    }}
                    style={tw`py-2`}
                  >
                    <Text
                      style={tw.style(
                        'text-sm',
                        active
                          ? 'text-slate-900 dark:text-white font-semibold'
                          : 'text-[#0d141c] dark:text-white/80'
                      )}
                    >
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
