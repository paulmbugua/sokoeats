/* eslint-disable prettier/prettier */
// apps/mobile/src/screens/FindTutor.native.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  Pressable,
  ActivityIndicator,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Modal,
  Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, NavigationProp } from '@react-navigation/native';
import type { MainStackParamList } from '../navigation/types';
import tw from '../../tailwind';

import { useHomePage } from '@mytutorapp/shared/hooks';
import type { Profile } from '@mytutorapp/shared/types';
import { COUNTRIES, countryName } from '@mytutorapp/shared/utils/countries';
import { normalizeCountryLabel } from '@mytutorapp/shared/utils/smartSearchIntent';

/* ───────── Constants ───────── */
const FALLBACK_AVATAR = (name = 'Tutor') =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=e7edf4&color=0d141c`;

const SUBJECTS = [
  'Math',
  'Science',
  'Programming',
  'Art',
  'Wellness',
  'Languages',
  'English',
  'History',
] as const;

const RATINGS = [5, 4.5, 4, 3.5, 3] as const;

// Web parity
const AVAILABILITY = ['Online', 'Offline', 'Busy', 'Free Session', 'New'] as const;
const LANGS_COMMON = ['English', 'Spanish', 'French', 'Arabic', 'Chinese', 'German'] as const;

const TOKENS_OPTIONS = [
  { label: 'Tokens', value: 0 },
  { label: '≤ 10', value: 10 },
  { label: '≤ 20', value: 20 },
  { label: '≤ 40', value: 40 },
  { label: '≤ 60', value: 60 },
  { label: '60+', value: 999999 },
] as const;

const PER_PAGE = 20;

/* ───────── Utils ───────── */
const normalizeStr = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v.toLowerCase().trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).toLowerCase().trim();
  if (Array.isArray(v)) return v.map(normalizeStr).join(' ').trim();
  if (typeof v === 'object')
    return Object.values(v as any)
      .map(normalizeStr)
      .join(' ')
      .trim();
  return '';
};

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

const hasAvailability = (p: any, option: string) => {
  if (!option) return true;
  const opt = normalizeStatus(option);

  if (opt === 'New') return isNewTutor(p);

  const s = normalizeStatus(p?.status);
  if (s && s === opt) return true;

  const s2 = normalizeStatus(p?.availability);
  if (s2 && s2 === opt) return true;

  return false;
};

const hasLanguage = (p: any, lang: string) => {
  if (!lang) return true;
  const list = p?.languages;
  if (Array.isArray(list)) {
    return list.map((x: any) => normalizeStr(String(x))).includes(normalizeStr(lang));
  }
  return true;
};

const resolveImage = (p: any, backendUrl?: string, fallbackName?: string) => {
  const g0 = Array.isArray(p?.gallery) ? p.gallery[0] : undefined;
  if (typeof g0 === 'string' && g0.length > 0) {
    if (/^https?:\/\//i.test(g0)) return g0;
    if (g0.startsWith('/') && backendUrl) return `${backendUrl.replace(/\/+$/, '')}${g0}`;
  }
  return FALLBACK_AVATAR(fallbackName ?? p?.name ?? 'Tutor');
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

const TutorCard = React.memo(function TutorCard({
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
      ? (item as any).languages.slice(0, 3).join(', ') +
        ((item as any).languages.length > 3 ? '…' : '')
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
            <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>
              {tokens} tokens
            </Text>
          ) : null}

          {langs ? (
            <Text style={tw`text-sm text-[#0d141c] dark:text-white/90`}>Languages: {langs}</Text>
          ) : null}

          {cname ? (
            <Text style={tw`text-sm text-[#0d141c] dark:text-white/90`}>{cname}</Text>
          ) : null}
        </View>

        {desc ? (
          <Text style={tw`text-sm mt-1 text-[#0d141c] dark:text-white/90`}>{desc}</Text>
        ) : null}
      </View>

      {/* Image + overlay chips */}
      <Pressable
        onPress={() => onPress((item as any).user_id ?? (item as any).id)}
        style={tw`w-36 rounded-xl overflow-hidden`}
      >
        <View style={tw`relative`}>
          <Image source={{ uri: img }} style={tw`w-full aspect-video`} resizeMode="cover" />

          {/* subtle overlay for readability */}
          <View style={tw`absolute inset-0 bg-black/10`} />

          {/* ✅ overlays: checkmark-only (no "Certified" text), status, new */}
          {showCertified ? (
            <View
              accessibilityLabel="Verified tutor"
              style={tw`absolute top-3 left-3 z-10 rounded-full px-2 py-1 border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15`}
            >
              <Text style={tw`text-[10px] font-extrabold text-emerald-800 dark:text-emerald-200`}>
                ✓
              </Text>
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

/* ───────── Countries normalized for modal ───────── */
type CountryOpt = { code: string; name: string };
const COUNTRY_LIST: CountryOpt[] = Array.isArray(COUNTRIES)
  ? ((COUNTRIES as any[])
      .map((c) => {
        if (!c) return null;
        if (typeof c === 'string') return { code: c, name: c };
        const code = String((c as any).code ?? (c as any).value ?? (c as any).iso2 ?? '').trim();
        const name = String((c as any).name ?? (c as any).label ?? code).trim();
        if (!code && !name) return null;
        return { code: code || name, name: name || code };
      })
      .filter(Boolean) as CountryOpt[])
  : [];

/* ───────── Screen ───────── */
const FindTutorScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 16);
  const topPad = Math.max(insets.top, 12);

  // ---- Server-driven search + filters (like web) ----
  const home = useHomePage() as any;

  const filteredProfiles: Profile[] = (home?.filteredProfiles ?? []) as Profile[];
  const loading: boolean = Boolean(home?.loading);
  const handleSearch: ((q: string) => void) | undefined = home?.handleSearch;

  const uiFilters = (home?.uiFilters ?? {}) as {
    subject?: string;
    country?: string; // ISO2
    minRating?: number;
    maxTokens?: number;
  };

  const setSubjectFilter: ((v: string) => void) | undefined = home?.setSubjectFilter;
  const setCountryFilter: ((v: string) => void) | undefined = home?.setCountryFilter;
  const setMinRatingFilter: ((n: number) => void) | undefined = home?.setMinRatingFilter;
  const setMaxTokensFilter: ((n: number) => void) | undefined = home?.setMaxTokensFilter;

  const clearFilters: (() => void) | undefined = home?.clearFilters;
  const searchMeta = home?.searchMeta as any;

  // backendUrl optional (for relative gallery urls) — if you store it in context you can wire it here
  const backendUrl = undefined as unknown as string | undefined;

  // local-only UI state (NOT sent to server)
  const [query, setQuery] = useState('');
  const [availability, setAvailability] = useState<string>(''); // local-only
  const [language, setLanguage] = useState<string>(''); // local-only
  const [page, setPage] = useState(1);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const q = String(route?.params?.q ?? '').trim();
    const subject = String(route?.params?.subject ?? '').trim();
    const countryParam = String(route?.params?.country ?? '').trim();
    const minRatingParam = route?.params?.minRating;

    if (q) {
      setQuery(q);
      handleSearch?.(q);
    }
    if (subject) setSubjectFilter?.(subject);
    if (countryParam) {
      const normalized = normalizeCountryLabel(countryParam);
      if (normalized?.code) setCountryFilter?.(normalized.code);
    }
    if (minRatingParam != null) {
      const val = Number(minRatingParam);
      if (Number.isFinite(val)) setMinRatingFilter?.(val);
    }
  }, [route?.params, handleSearch, setCountryFilter, setMinRatingFilter, setSubjectFilter]);

  // Country modal (server filter writes ISO2 to setCountryFilter)
  const [countryModal, setCountryModal] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  // Live mode debounce
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!live) return;

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      const trimmed = query.trim();
      if (/^\d$/.test(trimmed)) return;
      if (trimmed.length < 2 && trimmed.length !== 0) return;
      handleSearch?.(query);
    }, 250);

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [query, live, handleSearch]);

  // Tutors already server-filtered; we just ensure role is tutor
  const tutors = useMemo<Profile[]>(
    () =>
      (filteredProfiles || []).filter((p: any) => String(p?.role || '').toLowerCase() === 'tutor'),
    [filteredProfiles]
  );

  // languages from current result set (plus common)
  const languagesSet = useMemo(() => {
    const set = new Set<string>();
    LANGS_COMMON.forEach((l) => set.add(l));
    tutors.forEach((t: any) => {
      if (Array.isArray(t?.languages)) {
        t.languages.forEach((l: any) => {
          const s = String(l).trim();
          if (s) set.add(s);
        });
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tutors]);

  // local-only filtering (availability/language only)
  const locallyFiltered = useMemo(() => {
    return tutors.filter((p: any) => {
      if (availability && !hasAvailability(p, availability)) return false;
      if (language && !hasLanguage(p, language)) return false;
      return true;
    });
  }, [tutors, availability, language]);

  // Pagination (client-side paging of current server result set)
  const totalPages = Math.max(1, Math.ceil(locallyFiltered.length / PER_PAGE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = locallyFiltered.slice((pageSafe - 1) * PER_PAGE, pageSafe * PER_PAGE);

  // for page dots (don’t render 50 buttons)
  const pageWindow = useMemo(() => {
    const max = 7;
    if (totalPages <= max) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const out: number[] = [];
    const start = Math.max(1, pageSafe - 2);
    const end = Math.min(totalPages, start + (max - 1));
    for (let n = start; n <= end; n++) out.push(n);
    if (!out.includes(1)) out.unshift(1);
    if (!out.includes(totalPages)) out.push(totalPages);
    // de-dupe
    return Array.from(new Set(out));
  }, [totalPages, pageSafe]);

  const onReset = () => {
    setQuery('');
    setAvailability('');
    setLanguage('');
    setPage(1);
    setCountrySearch('');
    clearFilters?.();
    handleSearch?.('');
  };

  const goProfile = (userId?: string | number) => {
    if (!userId) return;
    navigation.navigate('Profile', { id: String(userId) });
  };

  const currentCountryLabel = useMemo(() => {
    const code = String(uiFilters?.country || '').trim();
    if (!code) return '';
    const found = COUNTRY_LIST.find((c) => String(c.code).toUpperCase() === code.toUpperCase());
    return found?.name || countryName?.(code) || code;
  }, [uiFilters?.country]);

  const countryFilteredList = useMemo(() => {
    const q = normalizeStr(countrySearch);
    if (!q) return COUNTRY_LIST.slice(0, 220); // keep modal snappy
    return COUNTRY_LIST.filter((c) => {
      const hay = `${c.code} ${c.name}`.toLowerCase();
      return hay.includes(q);
    }).slice(0, 250);
  }, [countrySearch]);

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
        <View
          style={tw`absolute -top-16 -right-10 h-36 w-36 rounded-full bg-pink-500/12 dark:bg-pink-500/10`}
        />
        <View
          style={tw`absolute -bottom-24 -left-20 h-44 w-44 rounded-full bg-sky-500/10 dark:bg-sky-500/10`}
        />
      </View>

      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={[tw`pb-6`, { paddingTop: topPad, paddingBottom: bottomPad + 80 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={tw`px-4 pt-2 pb-2`}>
          <View style={tw`flex-row items-end justify-between`}>
            <View style={tw`flex-1 pr-3`}>
              <Text
                style={tw`text-xs tracking-[2px] uppercase text-pink-500/80 dark:text-pink-400`}
              >
                DayBreak Tutors
              </Text>
              <Text style={tw`text-[28px] font-extrabold text-[#0d141c] dark:text-white mt-1`}>
                Find a tutor
              </Text>
              <Text style={tw`text-sm text-[#49739c] dark:text-white/70 mt-1`}>
                Explore expert tutors ready to help you achieve your learning goals.
              </Text>

              {/* Optional meta (like web debug chip) */}
              {searchMeta?.aiUsed != null ? (
                <Text style={tw`text-[11px] mt-1 text-[#49739c] dark:text-white/60`}>
                  Search: {searchMeta.aiUsed ? 'AI' : 'Direct'} • {searchMeta.rows ?? tutors.length}{' '}
                  results
                </Text>
              ) : null}
            </View>

            <Pressable
              onPress={onReset}
              style={tw`rounded-full h-9 px-4 bg-[#e7edf4] dark:bg-[#172534] justify-center`}
            >
              <Text style={tw`text-xs font-semibold text-[#0d141c] dark:text-white`}>Reset</Text>
            </Pressable>
          </View>

          {/* Search (server-driven) */}
          <View style={tw`mt-3 rounded-xl overflow-hidden`}>
            <View style={tw`flex-row items-center bg-[#e7edf4] dark:bg-[#172534] h-12 px-3`}>
              <Text style={tw`text-base mr-2`}>🔎</Text>
              <TextInput
                placeholder='Search e.g. "Kenya math tutor", "Grade 3", "certified english"'
                placeholderTextColor="#49739c"
                value={query}
                onChangeText={(t) => {
                  setQuery(t);
                  setPage(1);
                }}
                onSubmitEditing={() => {
                  setPage(1);
                  handleSearch?.(query);
                }}
                style={tw`flex-1 text-[#0d141c] dark:text-white`}
                returnKeyType="search"
              />
            </View>
          </View>

          {/* Live toggle */}
          <View style={tw`mt-2 flex-row items-center justify-between`}>
            <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
              Live search (auto-search while typing)
            </Text>
            <Switch value={live} onValueChange={setLive} />
          </View>
        </View>

        {/* Filters */}
        <View style={tw`px-4`}>
          <Text style={tw`text-[18px] font-bold text-[#0d141c] dark:text-white`}>Filters</Text>

          {/* Subject (server) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={tw`py-2 pr-2`}
          >
            <Chip
              label={uiFilters?.subject ? `Subject: ${uiFilters.subject}` : 'Subject'}
              active={!!uiFilters?.subject}
              onPress={() => {
                setSubjectFilter?.('');
                setPage(1);
              }}
            />
            {SUBJECTS.map((s) => (
              <Chip
                key={s}
                label={s}
                active={uiFilters?.subject === s}
                onPress={() => {
                  setSubjectFilter?.(s);
                  setPage(1);
                }}
              />
            ))}
          </ScrollView>

          {/* Availability (local) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={tw`py-1 pr-2`}
          >
            <Chip
              label={availability ? `Availability: ${availability}` : 'Availability'}
              active={!!availability}
              onPress={() => {
                setAvailability('');
                setPage(1);
              }}
            />
            {AVAILABILITY.map((a) => (
              <Chip
                key={a}
                label={a}
                active={availability === a}
                onPress={() => {
                  setAvailability(a);
                  setPage(1);
                }}
              />
            ))}
          </ScrollView>

          {/* Tokens (server) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={tw`py-1 pr-2`}
          >
            {TOKENS_OPTIONS.map((o) => {
              const active = Number(uiFilters?.maxTokens || 0) === o.value;
              return (
                <Chip
                  key={String(o.value)}
                  label={o.label}
                  active={active}
                  onPress={() => {
                    setMaxTokensFilter?.(o.value);
                    setPage(1);
                  }}
                />
              );
            })}
          </ScrollView>

          {/* Language (local) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={tw`py-1 pr-2`}
          >
            <Chip
              label={language ? `Language: ${language}` : 'Language'}
              active={!!language}
              onPress={() => {
                setLanguage('');
                setPage(1);
              }}
            />
            {languagesSet.map((l) => (
              <Chip
                key={l}
                label={l}
                active={language === l}
                onPress={() => {
                  setLanguage(l);
                  setPage(1);
                }}
              />
            ))}
          </ScrollView>

          {/* Rating (server) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={tw`py-1 pr-2`}
          >
            <Chip
              label={uiFilters?.minRating ? `Rating: ≥ ${uiFilters.minRating}★` : 'Rating'}
              active={!!uiFilters?.minRating}
              onPress={() => {
                setMinRatingFilter?.(0);
                setPage(1);
              }}
            />
            {RATINGS.map((r) => (
              <Chip
                key={String(r)}
                label={`${r}★ & up`}
                active={Number(uiFilters?.minRating || 0) === r}
                onPress={() => {
                  setMinRatingFilter?.(r);
                  setPage(1);
                }}
              />
            ))}
          </ScrollView>

          {/* Country (server, ISO2) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={tw`py-1 pr-2`}
          >
            <Chip
              label={uiFilters?.country ? `Country: ${currentCountryLabel}` : 'Country'}
              active={!!uiFilters?.country}
              onPress={() => {
                // open modal to select, like web select dropdown
                setCountryModal(true);
              }}
            />
            {uiFilters?.country ? (
              <Chip
                label="Clear country"
                active={false}
                onPress={() => {
                  setCountryFilter?.('');
                  setPage(1);
                }}
              />
            ) : null}
          </ScrollView>
        </View>

        {/* Results header */}
        <View style={tw`px-4 pt-3 pb-1 flex-row items-center justify-between`}>
          <Text style={tw`text-[18px] font-bold text-[#0d141c] dark:text-white`}>Tutors</Text>
          <Text style={tw`text-[11px] text-[#49739c] dark:text-white/60`}>
            {locallyFiltered.length} result{locallyFiltered.length === 1 ? '' : 's'}
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

        {/* Pagination (like web) */}
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

      {/* Country modal */}
      <Modal
        visible={countryModal}
        transparent
        animationType="fade"
        onRequestClose={() => setCountryModal(false)}
      >
        <Pressable
          onPress={() => setCountryModal(false)}
          style={tw`flex-1 bg-black/40 items-center justify-center p-4`}
        >
          <Pressable
            onPress={() => {}}
            style={tw`w-full max-w-[520px] rounded-2xl bg-white dark:bg-[#0b1016] border border-[#e2edf5] dark:border-white/10 p-3`}
          >
            <View style={tw`flex-row items-center justify-between`}>
              <Text style={tw`text-base font-extrabold text-[#0d141c] dark:text-white`}>
                Select country
              </Text>
              <Pressable onPress={() => setCountryModal(false)} style={tw`px-3 py-2`}>
                <Text style={tw`text-sm font-bold text-[#49739c] dark:text-white/70`}>Close</Text>
              </Pressable>
            </View>

            <View style={tw`mt-2 rounded-xl overflow-hidden`}>
              <View style={tw`flex-row items-center bg-[#e7edf4] dark:bg-[#172534] h-11 px-3`}>
                <Text style={tw`text-base mr-2`}>🔎</Text>
                <TextInput
                  placeholder="Search country…"
                  placeholderTextColor="#49739c"
                  value={countrySearch}
                  onChangeText={setCountrySearch}
                  style={tw`flex-1 text-[#0d141c] dark:text-white`}
                />
              </View>
            </View>

            <ScrollView style={tw`mt-2 max-h-[380px]`} keyboardShouldPersistTaps="handled">
              {/* Clear */}
              <Pressable
                onPress={() => {
                  setCountryFilter?.('');
                  setPage(1);
                  setCountryModal(false);
                }}
                style={tw`px-3 py-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534]`}
              >
                <Text style={tw`text-sm font-bold text-[#0d141c] dark:text-white`}>
                  Any country
                </Text>
              </Pressable>

              <View style={tw`h-2`} />

              {countryFilteredList.map((c) => {
                const active =
                  String(uiFilters?.country || '').toUpperCase() ===
                  String(c.code || '').toUpperCase();
                return (
                  <Pressable
                    key={c.code}
                    onPress={() => {
                      setCountryFilter?.(c.code);
                      setPage(1);
                      setCountryModal(false);
                    }}
                    style={tw.style(
                      'px-3 py-3 rounded-xl mb-2',
                      active ? 'bg-primary' : 'bg-white dark:bg-[#0f1821]',
                      'border border-[#e2edf5] dark:border-white/10'
                    )}
                  >
                    <Text
                      style={tw.style(
                        'text-sm font-bold',
                        active ? 'text-white' : 'text-[#0d141c] dark:text-white'
                      )}
                    >
                      {c.name}{' '}
                      <Text
                        style={tw.style(
                          active ? 'text-white/90' : 'text-[#49739c] dark:text-white/60'
                        )}
                      >
                        ({c.code})
                      </Text>
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

export default FindTutorScreen;
