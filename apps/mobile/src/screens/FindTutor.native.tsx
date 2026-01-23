
// apps/mobile/src/screens/FindTutor.native.tsx
import React, { useEffect, memo, useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, NavigationProp } from '@react-navigation/native';
import type { MainStackParamList } from '../navigation/types';
import tw from '../../tailwind';

import { useHomePage } from '@mytutorapp/shared/hooks';
import type { Profile, TutorFilters } from '@mytutorapp/shared/types';
import { DEFAULT_TUTOR_FILTERS } from '@mytutorapp/shared/types';
import { countryName } from '@mytutorapp/shared/utils/countries';
import { normalizeCountryLabel } from '@mytutorapp/shared/utils/smartSearchIntent';

/* ───────── Constants ───────── */
const FALLBACK_AVATAR = (name = 'Tutor') =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=e7edf4&color=0d141c`;

const MIN_RATING_OPTIONS = [0, 3, 4, 4.5, 5] as const;

const PER_PAGE = 20;

/* ───────── Utils ───────── */
const getRating = (p: any) => {
  const avg = p?.avgRating;
  if (avg != null) return Number(avg) || 0;

  const total = Number(p?.rating_total);
  const count = Number(p?.rating_count);

  if (Number.isFinite(total) && Number.isFinite(count) && count > 0) {
    return total / count;
  }

  const r = p?.rating;
  return Number(r) || 0;
};

const getTokens = (p: any) => {
  const x =
    p?.pricing?.tokens ??
    p?.pricing?.tokenPrice ??
    p?.pricing?.tokensPerHour ??
    p?.pricing?.hourlyTokens ??
    p?.pricing?.privateSessionTokens ??
    p?.pricing?.groupSessionTokens;

  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
};

const normalizeStatus = (s: any) => {
  const v = String(s || '')
    .trim()
    .toLowerCase();
  if (!v) return '';
  if (v === 'online') return 'Online';
  if (v === 'offline') return 'Offline';
  if (v === 'busy') return 'Busy';
  if (v === 'free' || v === 'free session' || v === 'free_session') return 'Free Session';
  if (v === 'new') return 'New';
  return String(s || '').trim();
};

const STATUS_BG: Record<string, string> = {
  Online: 'bg-green-500',
  Busy: 'bg-yellow-500',
  'Free Session': 'bg-purple-500',
  New: 'bg-sky-500',
  Offline: 'bg-gray-500',
};

const isNewTutor = (p: any) => {
  if (p?.is_new === true) return true;
  const created = p?.created_at || p?.createdAt;
  if (!created) return false;
  const t = new Date(created).getTime();
  if (!Number.isFinite(t)) return false;
  const days = (Date.now() - t) / (1000 * 60 * 60 * 24);
  return days <= 7;
};

const getDescriptionText = (p: any): string => {
  const d = p?.description;
  if (typeof d === 'string') {
    try {
      const asObj = JSON.parse(d);
      if (asObj && typeof asObj === 'object' && typeof (asObj as any).bio === 'string') {
        return (asObj as any).bio;
      }
    } catch {}
    return d;
  }
  if (d && typeof d === 'object') {
    const bio = (d as any).bio ?? (d as any).overview ?? (d as any).summary;
    if (bio) return String(bio);
  }
  return '';
};

const resolveImage = (p: any, backendUrl?: string, fallbackName?: string) => {
  const g0 = Array.isArray(p?.gallery) ? p.gallery[0] : undefined;
  if (typeof g0 === 'string' && g0.length > 0) {
    if (/^https?:\/\//i.test(g0)) return g0;
    if (g0.startsWith('/') && backendUrl) return `${backendUrl.replace(/\/+$/, '')}${g0}`;
  }
  return FALLBACK_AVATAR(fallbackName ?? p?.name ?? 'Tutor');
};

const countActiveTutorFilters = (filters: TutorFilters) => {
  let count = 0;
  if (filters.subject) count += 1;
  if (filters.gradeBand) count += 1;
  if (filters.country) count += 1;
  if (filters.minRating > 0) count += 1;
  return count;
};

/* ───────── Small UI bits ───────── */
const Chip: React.FC<{
  label: string;
  active?: boolean;
  onPress: () => void;
}> = ({ label, active, onPress }) => (
  <Pressable
    onPress={onPress}
    style={tw.style(
      'px-3 h-9 rounded-full items-center justify-center mr-2 mb-2',
      active ? 'bg-primary' : 'bg-[#e7edf4] dark:bg-[#172534]'
    )}
  >
    <Text
      style={tw.style(
        'text-sm',
        active ? 'text-white font-semibold' : 'text-[#0d141c] dark:text-white/90'
      )}
      numberOfLines={1}
    >
      {label}
    </Text>
  </Pressable>
);

const FilterModal = ({
  visible,
  filters,
  onChange,
  onReset,
  onClose,
  onApply,
}: {
  visible: boolean;
  filters: TutorFilters;
  onChange: (next: Partial<TutorFilters>) => void;
  onReset: () => void;
  onClose: () => void;
  onApply: () => void;
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable onPress={onClose} style={tw`flex-1 bg-black/40 items-center justify-center p-4`}>
      <Pressable
        onPress={() => {}}
        style={tw`w-full max-w-[520px] rounded-2xl bg-white dark:bg-[#0b1016] border border-[#e2edf5] dark:border-white/10 p-4`}
      >
        <View style={tw`flex-row items-center justify-between`}>
          <Text style={tw`text-base font-extrabold text-[#0d141c] dark:text-white`}>Filters</Text>
          <Pressable onPress={onClose} style={tw`px-3 py-2`}>
            <Text style={tw`text-sm font-bold text-[#49739c] dark:text-white/70`}>Close</Text>
          </Pressable>
        </View>

        <ScrollView style={tw`mt-2 max-h-[420px]`} keyboardShouldPersistTaps="handled">
          <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>Subject</Text>
          <View style={tw`mt-2 rounded-xl overflow-hidden`}>
            <TextInput
              placeholder="Math, English…"
              placeholderTextColor="#49739c"
              value={filters.subject}
              onChangeText={(text) => onChange({ subject: text })}
              style={tw`h-11 px-3 bg-[#e7edf4] dark:bg-[#172534] text-[#0d141c] dark:text-white`}
            />
          </View>

          <Text style={tw`mt-4 text-sm font-semibold text-[#0d141c] dark:text-white`}>Grade band</Text>
          <View style={tw`mt-2 rounded-xl overflow-hidden`}>
            <TextInput
              placeholder="Primary, Secondary…"
              placeholderTextColor="#49739c"
              value={filters.gradeBand}
              onChangeText={(text) => onChange({ gradeBand: text })}
              style={tw`h-11 px-3 bg-[#e7edf4] dark:bg-[#172534] text-[#0d141c] dark:text-white`}
            />
          </View>

          <Text style={tw`mt-4 text-sm font-semibold text-[#0d141c] dark:text-white`}>Country (ISO2)</Text>
          <View style={tw`mt-2 rounded-xl overflow-hidden`}>
            <TextInput
              placeholder="ke, qa…"
              placeholderTextColor="#49739c"
              autoCapitalize="characters"
              value={filters.country}
              onChangeText={(text) => onChange({ country: text })}
              style={tw`h-11 px-3 bg-[#e7edf4] dark:bg-[#172534] text-[#0d141c] dark:text-white`}
            />
          </View>

          <Text style={tw`mt-4 text-sm font-semibold text-[#0d141c] dark:text-white`}>Min rating</Text>
          <View style={tw`flex-row flex-wrap mt-2`}>
            {MIN_RATING_OPTIONS.map((opt) => {
              const active = Number(filters.minRating || 0) === opt;
              return (
                <Chip
                  key={String(opt)}
                  label={opt === 0 ? 'Any' : `${opt}★`}
                  active={active}
                  onPress={() => onChange({ minRating: opt })}
                />
              );
            })}
          </View>
        </ScrollView>

        <View style={tw`flex-row items-center justify-between gap-3 mt-4`}>
          <Pressable
            onPress={onReset}
            style={tw`h-10 px-4 rounded-full border border-[#e2edf5] dark:border-white/10 items-center justify-center`}
          >
            <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>Reset</Text>
          </Pressable>

          <Pressable onPress={onApply} style={tw`h-10 px-5 rounded-full bg-primary items-center justify-center`}>
            <Text style={tw`text-sm font-extrabold text-white`}>Apply</Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  </Modal>
);

const TutorCard = memo(function TutorCard({

  item,
  onPress,
  backendUrl,
}: {
  item: Profile & Record<string, any>;
  onPress: (id?: string | number) => void;
  backendUrl?: string;
}) {
  const rating = getRating(item);
  const tokens = getTokens(item);
  const img = resolveImage(item, backendUrl, item.name);
  const sub = (item as any).category ?? 'Subject';

  const status = normalizeStatus((item as any).status);
  const showNew = isNewTutor(item);
  const chipBg = STATUS_BG[status] ?? 'bg-gray-500';
  const showCertified = Boolean((item as any).certified);

  const bioRaw = getDescriptionText(item);
  const desc = bioRaw ? String(bioRaw).slice(0, 140) : '';

  const langs =
    Array.isArray((item as any).languages) && (item as any).languages.length > 0
      ? (item as any).languages.slice(0, 3).join(', ') + ((item as any).languages.length > 3 ? '…' : '')
      : '';

  const ccode = String((item as any).country ?? (item as any).country_code ?? '').trim();
  const cname = ccode ? countryName?.(ccode) || ccode : '';

  return (
    <View style={tw`mb-4`}>
      <View
        style={tw`flex-row items-stretch justify-between gap-4 rounded-2xl bg-white dark:bg-[#0b1016] p-3 border border-[#e2edf5] dark:border-white/5 shadow-sm`}
      >
        <View style={tw`flex-1`}>
          <Text style={tw`text-xs font-medium text-[#49739c] dark:text-white/70`}>{sub}</Text>

          <View style={tw`flex-row items-center gap-2 mt-0.5`}>
            {status ? <View style={tw.style('w-2 h-2 rounded-full', chipBg)} /> : null}

            <Pressable onPress={() => onPress((item as any).user_id ?? (item as any).id)}>
              <Text style={tw`text-base font-extrabold text-[#0d141c] dark:text-white`}>
                {item.name ?? 'Tutor'}
              </Text>
            </Pressable>
          </View>

          <View style={tw`flex-row flex-wrap items-center gap-x-3 gap-y-1 mt-1`}>
            <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>
              {rating ? `${rating.toFixed(1)}★` : 'No rating'}
            </Text>

            {typeof tokens === 'number' ? (
              <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>{tokens} tokens</Text>
            ) : null}

            {langs ? (
              <Text style={tw`text-sm text-[#0d141c] dark:text-white/90`}>Languages: {langs}</Text>
            ) : null}

            {cname ? <Text style={tw`text-sm text-[#0d141c] dark:text-white/90`}>{cname}</Text> : null}
          </View>

          {desc ? <Text style={tw`text-sm mt-1 text-[#0d141c] dark:text-white/90`}>{desc}</Text> : null}
        </View>

        {/* Image + overlay chips */}
        <Pressable
          onPress={() => onPress((item as any).user_id ?? (item as any).id)}
          style={tw`w-36 rounded-xl overflow-hidden`}
        >
          <View style={tw`relative`}>
            <Image source={{ uri: img }} style={tw`w-full aspect-video`} resizeMode="cover" />
            <View style={tw`absolute inset-0 bg-black/10`} />

            {showCertified ? (
              <View
                accessibilityLabel="Verified tutor"
                style={tw`absolute top-3 left-3 z-10 rounded-full px-2 py-1 border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15`}
              >
                <Text style={tw`text-[10px] font-extrabold text-emerald-800 dark:text-emerald-200`}>✓</Text>
              </View>
            ) : null}

            {status || showNew ? (
              <View style={tw`absolute top-3 right-3 z-10 items-end gap-2`}>
                {status ? (
                  <View style={tw.style('px-2.5 py-1 rounded-full', chipBg)}>
                    <Text style={tw`text-[10px] font-bold text-white`}>{status}</Text>
                  </View>
                ) : null}

                {showNew && status !== 'New' ? (
                  <View style={tw`px-2.5 py-1 rounded-full bg-sky-500`}>
                    <Text style={tw`text-[10px] font-bold text-white`}>New</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </Pressable>
      </View>
    </View>
  );
});

/* ───────── Screen ───────── */
const FindTutorScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();

  const MIN_QUERY_LEN = 4;
  const bottomPad = Math.max(insets.bottom, 16);
  const topPad = Math.max(insets.top, 12);

  // Refs: focus search + scroll to top when navbar triggers
  const searchRef = useRef<TextInput | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  // ---- Server-driven search + filters (like web) ----
  const home = useHomePage({ debounceMs: 0 }) as any;

  const filteredProfiles: Profile[] = (home?.filteredProfiles ?? []) as Profile[];
  const loading: boolean = Boolean(home?.loading);
  const handleSearch: ((q: string) => void) | undefined = home?.handleSearch;

  const uiFilters = (home?.uiFilters ?? {}) as {
    subject?: string;
    gradeBand?: string;
    country?: string; // ISO2
    minRating?: number;
  };

  const setSubjectFilter: ((v: string) => void) | undefined = home?.setSubjectFilter;
  const setGradeBandFilter: ((v: string) => void) | undefined = home?.setGradeBandFilter;
  const setCountryFilter: ((v: string) => void) | undefined = home?.setCountryFilter;
  const setMinRatingFilter: ((n: number) => void) | undefined = home?.setMinRatingFilter;

  const clearFilters: (() => void) | undefined = home?.clearFilters;
  const searchMeta = home?.searchMeta as any;

  // backendUrl optional (for relative gallery urls) — wire if you have it in context
  const backendUrl = undefined as unknown as string | undefined;

  // local-only UI state
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [draftFilters, setDraftFilters] = useState<TutorFilters>(DEFAULT_TUTOR_FILTERS);

  const activeFilterCount = useMemo(
    () =>
      countActiveTutorFilters({
        subject: uiFilters?.subject || '',
        gradeBand: uiFilters?.gradeBand || '',
        country: uiFilters?.country || '',
        minRating: Number(uiFilters?.minRating || 0),
      }),
    [uiFilters?.subject, uiFilters?.gradeBand, uiFilters?.country, uiFilters?.minRating]
  );

  /**
   * ✅ PARAM HANDLING (critical)
   * - Only apply params if they exist (prevents openSearch/openFilters from wiping query/filters)
   * - Support navbar triggers: openSearch/openFilters
   */
  useEffect(() => {
    const p: any = route?.params || {};

    // Apply explicit incoming search/filter params (only if provided)
    if (p.q != null) {
      const q = String(p.q).trim();
      setQuery(q);
      setDebouncedQuery(q);
      if (q.length >= MIN_QUERY_LEN) handleSearch?.(q);
      else handleSearch?.('');
      setPage(1);
    }

    if (p.subject != null) {
      const subject = String(p.subject).trim();
      setSubjectFilter?.(subject);
      setPage(1);
    }

    if (p.gradeBand != null) {
      const gradeBand = String(p.gradeBand).trim();
      setGradeBandFilter?.(gradeBand);
      setPage(1);
    }

    if (p.country != null) {
      const countryParam = String(p.country).trim();
      const normalized = normalizeCountryLabel(countryParam);
      if (normalized?.code) setCountryFilter?.(normalized.code);
      else setCountryFilter?.(countryParam);
      setPage(1);
    }

    if (p.minRating != null) {
      const val = Number(p.minRating);
      if (Number.isFinite(val)) {
        setMinRatingFilter?.(val);
        setPage(1);
      }
    }

    // Navbar triggers (like Resources)
    if (p.openFilters) {
      setDraftFilters({
        subject: uiFilters?.subject || '',
        gradeBand: uiFilters?.gradeBand || '',
        country: uiFilters?.country || '',
        minRating: Number(uiFilters?.minRating || 0),
      });
      setFiltersOpen(true);

      // clear trigger so it doesn't repeat on re-render
      try {
        navigation.setParams({ openFilters: false } as any);
      } catch {}
    }

    if (p.openSearch) {
      setFiltersOpen(false);
      // ensure the search row is visible
      scrollRef.current?.scrollTo?.({ y: 0, animated: true });
      // focus input shortly after scroll/layout
      setTimeout(() => searchRef.current?.focus?.(), 180);

      try {
        navigation.setParams({ openSearch: false } as any);
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    route?.params,
    handleSearch,
    setSubjectFilter,
    setGradeBandFilter,
    setCountryFilter,
    setMinRatingFilter,
    navigation,
    uiFilters?.subject,
    uiFilters?.gradeBand,
    uiFilters?.country,
    uiFilters?.minRating,
  ]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    const queryActive = trimmed.length >= MIN_QUERY_LEN;
    const effectiveQuery = queryActive ? trimmed : '';
    handleSearch?.(effectiveQuery);
  }, [debouncedQuery, handleSearch]);

  // Tutors already server-filtered; ensure role is tutor
  const tutors = useMemo<Profile[]>(
    () => (filteredProfiles || []).filter((p: any) => String(p?.role || '').toLowerCase() === 'tutor'),
    [filteredProfiles]
  );

  // Pagination (client-side paging of current server result set)
  const totalPages = Math.max(1, Math.ceil(tutors.length / PER_PAGE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = tutors.slice((pageSafe - 1) * PER_PAGE, pageSafe * PER_PAGE);

  const pageWindow = useMemo(() => {
    const max = 7;
    if (totalPages <= max) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const out: number[] = [];
    const start = Math.max(1, pageSafe - 2);
    const end = Math.min(totalPages, start + (max - 1));
    for (let n = start; n <= end; n++) out.push(n);
    if (!out.includes(1)) out.unshift(1);
    if (!out.includes(totalPages)) out.push(totalPages);
    return Array.from(new Set(out));
  }, [totalPages, pageSafe]);

  const onReset = () => {
    setDraftFilters(DEFAULT_TUTOR_FILTERS);
  };

  const onClearAll = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    clearFilters?.();
    setDraftFilters(DEFAULT_TUTOR_FILTERS);
    setPage(1);
    handleSearch?.('');
  }, [clearFilters, handleSearch]);

  const goProfile = (userId?: string | number) => {
    if (!userId) return;
    navigation.navigate('Profile', { id: String(userId) });
  };

  if (loading) {
    return (
      <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`} edges={['top', 'bottom']}>
        <View style={tw`flex-1 items-center justify-center`}>
          <ActivityIndicator />
          <Text style={tw`mt-2 text-[#49739c] dark:text-white/70`}>Loading tutors…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`} edges={['top', 'bottom']}>
      {/* Soft background orbs */}
      <View style={tw`absolute inset-0`}>
        <View style={tw`absolute -top-16 -right-10 h-36 w-36 rounded-full bg-pink-500/12 dark:bg-pink-500/10`} />
        <View style={tw`absolute -bottom-24 -left-20 h-44 w-44 rounded-full bg-sky-500/10 dark:bg-sky-500/10`} />
      </View>

      <ScrollView
        ref={(r) => {
          scrollRef.current = r;
        }}
        style={tw`flex-1`}
        contentContainerStyle={[tw`pb-6`, { paddingTop: topPad, paddingBottom: bottomPad + 80 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={tw`px-4 pt-2 pb-2`}>
          <View style={tw`flex-row items-end justify-between`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={tw`text-xs tracking-[2px] uppercase text-pink-500/80 dark:text-pink-400`}>
                DayBreak Tutors
              </Text>
              <Text style={tw`text-[28px] font-extrabold text-[#0d141c] dark:text-white mt-1`}>
                Find a tutor
              </Text>
              <Text style={tw`text-sm text-[#49739c] dark:text-white/70 mt-1`}>
                Explore expert tutors ready to help you achieve your learning goals.
              </Text>

              {searchMeta?.aiUsed != null ? (
                <Text style={tw`text-[11px] mt-1 text-[#49739c] dark:text-white/60`}>
                  Search: {searchMeta.aiUsed ? 'AI' : 'Direct'} • {searchMeta.rows ?? tutors.length} results
                </Text>
              ) : null}
            </View>

            <View style={tw`h-9`} />
          </View>

          {/* Search row + Filters + Clear */}
{/* Search bar ONLY (full width) */}
<View style={tw`mt-3`}>
  <View
    style={tw`h-12 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#172534] flex-row items-center px-3`}
  >
    <Text style={tw`text-slate-500 dark:text-white/70 text-base mr-2`}>🔎</Text>
    <TextInput
      ref={(r) => {
        searchRef.current = r;
      }}
      placeholder='Search e.g. "math tutor", "Grade 3"'
      placeholderTextColor="#49739c"
      value={query}
      onChangeText={(t) => {
        setQuery(t);
        setPage(1);
      }}
      style={tw`flex-1 h-full text-[#0d141c] dark:text-slate-100`}
      returnKeyType="search"
    />
  </View>
</View>

{/* Filters + Clear BELOW (match Resources layout) */}
<View style={tw`mt-4`}>
  <View style={tw`flex-row items-center justify-between mb-3`}>
    <Pressable
      onPress={() => {
        setDraftFilters({
          subject: uiFilters?.subject || '',
          gradeBand: uiFilters?.gradeBand || '',
          country: uiFilters?.country || '',
          minRating: Number(uiFilters?.minRating || 0),
        });
        setFiltersOpen(true);
      }}
      style={tw`flex-row items-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f1821] px-4 py-2`}
    >
      <Text style={tw`text-sm font-semibold text-slate-700 dark:text-white`}>Filters</Text>
      {activeFilterCount > 0 ? (
        <View style={tw`ml-2 h-5 min-w-[20px] px-1 rounded-full bg-blue-500 items-center justify-center`}>
          <Text style={tw`text-[11px] font-bold text-white`}>{activeFilterCount}</Text>
        </View>
      ) : null}
    </Pressable>

    <Pressable
      onPress={onClearAll}
      style={tw`rounded-full border border-slate-200 dark:border-white/10 px-4 py-2`}
    >
      <Text style={tw`text-sm font-semibold text-slate-700 dark:text-white`}>Clear</Text>
    </Pressable>
  </View>
</View>

        </View>

        {/* Results header */}
        <View style={tw`px-4 pt-3 pb-1 flex-row items-center justify-between`}>
          <Text style={tw`text-[18px] font-bold text-[#0d141c] dark:text-white`}>Tutors</Text>
          <Text style={tw`text-[11px] text-[#49739c] dark:text-white/60`}>
            {tutors.length} result{tutors.length === 1 ? '' : 's'}
          </Text>
        </View>

        {/* Results */}
        <View style={tw`px-4`}>
          {pageItems.length === 0 ? (
            <Text style={tw`text-[#49739c] dark:text-white/70`}>No tutors match your filters.</Text>
          ) : (
            pageItems.map((item: any) => (
              <TutorCard
                key={String(item?.user_id ?? item?.id ?? item?.name)}
                item={item}
                onPress={goProfile}
                backendUrl={backendUrl}
              />
            ))
          )}
        </View>

        {/* Pagination */}
        {totalPages > 1 ? (
          <View style={tw`px-4 pt-2`}>
            <View style={tw`flex-row items-center justify-center gap-2`}>
              <Pressable
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                style={tw`h-10 px-3 rounded-full bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
              >
                <Text style={tw`text-sm font-bold text-[#0d141c] dark:text-white`}>‹</Text>
              </Pressable>

              {pageWindow.map((n) => {
                const active = n === pageSafe;
                return (
                  <Pressable
                    key={String(n)}
                    onPress={() => setPage(n)}
                    style={tw.style(
                      'h-10 w-10 rounded-full items-center justify-center',
                      active ? 'bg-[#e7edf4] dark:bg-[#172534]' : 'bg-transparent'
                    )}
                  >
                    <Text
                      style={tw.style(
                        'text-sm',
                        active
                          ? 'font-extrabold text-[#0d141c] dark:text-white'
                          : 'text-[#49739c] dark:text-white/70'
                      )}
                    >
                      {n}
                    </Text>
                  </Pressable>
                );
              })}

              <Pressable
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={tw`h-10 px-3 rounded-full bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
              >
                <Text style={tw`text-sm font-bold text-[#0d141c] dark:text-white`}>›</Text>
              </Pressable>
            </View>

            <Text style={tw`text-[11px] text-center mt-2 text-[#49739c] dark:text-white/60`}>
              Page {pageSafe} of {totalPages}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <FilterModal
        visible={filtersOpen}
        filters={{
          subject: draftFilters.subject || '',
          gradeBand: draftFilters.gradeBand || '',
          country: draftFilters.country || '',
          minRating: Number(draftFilters.minRating || 0),
        }}
        onChange={(next) => setDraftFilters((prev) => ({ ...prev, ...next }))}
        onReset={onReset}
        onClose={() => setFiltersOpen(false)}
        onApply={() => {
          setSubjectFilter?.(draftFilters.subject || '');
          setGradeBandFilter?.(draftFilters.gradeBand || '');
          setCountryFilter?.(draftFilters.country || '');
          setMinRatingFilter?.(Number(draftFilters.minRating || 0));
          setPage(1);
          setFiltersOpen(false);
        }}
      />
    </SafeAreaView>
  );
};

export default FindTutorScreen;
