// apps/mobile/src/screens/Resources.native.tsx
/* eslint-disable no-console */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  SectionList,
  Dimensions,
  Platform,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Image } from 'expo-image';
import AutoPreviewVideo from './AutoPreviewVideo.native';

import { useResourcesExplore, useClassVault } from '@mytutorapp/shared/hooks';
import { useShopContext } from '@mytutorapp/shared/context';

import type { Course, RecordedVideo } from '@mytutorapp/shared/types';
import type { OerBookItem } from '@mytutorapp/shared/api/resourcesApi';
import type { MainStackParamList } from '../navigation/types';
import tw from '../../tailwind';
import Skeleton from '../components/Skeleton.native';

// Optional WebView for PDF preview (graceful fallback if not installed)
let WebView: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebView = require('react-native-webview').WebView;
} catch {
  WebView = null;
}

type Nav = StackNavigationProp<MainStackParamList, 'Resources'>;

type OerCollection = {
  id: string | number;
  slug?: string | number;
  title: string;
  description?: string | null;
  thumbnail_url?: string | null;
  items_count?: number | null;
  content_kind?: string | null; // 'video'
  provider?: string | null;
  [k: string]: any;
};

// ✅ NEW: “grid row” item (since SectionList doesn’t support numColumns)
type GridRowItem = {
  kind: 'gridRow';
  rowKind: 'course' | 'oerBook';
  rowId: string;
  items: Array<Course | OerBookItem>;
};

type SectionItem =
  | ({ kind: 'classvault' } & RecordedVideo)
  | ({ kind: 'course' } & Course)
  | ({ kind: 'oerCollection' } & OerCollection)
  | ({ kind: 'oerBook' } & OerBookItem)
  | GridRowItem;

type ExploreSection = {
  key: string;
  title: string;
  subtitle: string;
  data: SectionItem[];
  loading: boolean;
  error: string | null;
  emptyMessage: string;
  hasMore: boolean;
  loadMore: () => void;
};

const { width: SCREEN_W } = Dimensions.get('window');
const H_PADDING = 16; // px-4
const CARD_W = SCREEN_W - H_PADDING * 2;
const PREVIEW_H = Math.round((CARD_W * 9) / 16);

type ResourceFilters = {
  subject: string;
  gradeBand: string;
  country: string;
  sourceKind: '' | 'oer' | 'tutor';
  scope: '' | 'free' | 'purchased';
  minRating: number;
  maxPrice: number;
};

const DEFAULT_FILTERS: ResourceFilters = {
  subject: '',
  gradeBand: '',
  country: '',
  sourceKind: '',
  scope: '',
  minRating: 0,
  maxPrice: 0,
};

function countActiveFilters(f: ResourceFilters) {
  let n = 0;
  if (f.subject.trim()) n += 1;
  if (f.gradeBand.trim()) n += 1;
  if (f.country.trim()) n += 1;
  if (f.sourceKind) n += 1;
  if (f.scope) n += 1;
  if (f.minRating > 0) n += 1;
  if (f.maxPrice > 0) n += 1;
  return n;
}

function toPdfPreviewUrl(pdfUrl: string) {
  const clean = pdfUrl.trim();
  if (!clean) return '';

  // Android WebView usually can't render PDFs directly -> gview
  if (Platform.OS === 'android') {
    return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(clean)}`;
  }
  return clean;
}

const withBust = (u?: string, bust?: string) => {
  if (!u) return '';
  const b = bust || String(Date.now());
  return `${u}${u.includes('?') ? '&' : '?'}v=${encodeURIComponent(b)}`;
};

// ✅ helper: chunk array for 2-per-row grid
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ------------------------------ Filters --------------------------------- */
const FilterChip: React.FC<{
  label: string;
  active?: boolean;
  onPress: () => void;
}> = ({ label, active, onPress }) => (
  <Pressable
    onPress={onPress}
    style={tw.style(
      'px-3 py-2 rounded-full border',
      active
        ? 'bg-blue-500 border-blue-500'
        : 'bg-white dark:bg-[#0f1821] border-slate-200 dark:border-white/10'
    )}
  >
    <Text
      style={tw.style(
        'text-xs font-semibold',
        active ? 'text-white' : 'text-slate-700 dark:text-white/80'
      )}
    >
      {label}
    </Text>
  </Pressable>
);

const FilterModal: React.FC<{
  open: boolean;
  value: ResourceFilters;
  onChange: (next: ResourceFilters) => void;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
}> = ({ open, value, onChange, onClose, onApply, onReset }) => {
  const set = (patch: Partial<ResourceFilters>) => onChange({ ...value, ...patch });

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      {/* Tap outside closes */}
      <Pressable onPress={onClose} style={tw`flex-1 bg-black/40 items-center justify-center p-4`}>
        {/* Card (tap inside should NOT close) */}
        <Pressable
          onPress={() => {}}
          style={tw`w-full max-w-[520px] rounded-2xl bg-white dark:bg-[#0f1821] border border-slate-200 dark:border-white/10 overflow-hidden`}
        >
          {/* Header */}
          <View
            style={tw`flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-slate-200 dark:border-white/10`}
          >
            <View>
              <Text style={tw`text-base font-extrabold text-slate-900 dark:text-white`}>Filters</Text>
              <Text style={tw`text-xs text-slate-500 dark:text-white/60 mt-1`}>
                Narrow results without overthinking it.
              </Text>
            </View>

            <Pressable
              onPress={onClose}
              style={tw`h-9 w-9 rounded-full bg-slate-100 dark:bg-white/10 items-center justify-center`}
            >
              <Text style={tw`text-base text-slate-700 dark:text-white`}>✕</Text>
            </Pressable>
          </View>

          {/* Body */}
          <ScrollView
            style={tw`max-h-[420px]`}
            contentContainerStyle={tw`px-4 py-4`}
            keyboardShouldPersistTaps="handled"
          >
            <View style={tw`mb-5`}>
              <Text style={tw`text-xs font-bold text-slate-500 dark:text-white/60 mb-2`}>Source</Text>
              <View style={tw`flex-row flex-wrap gap-2`}>
                <FilterChip
                  label="All"
                  active={value.sourceKind === ''}
                  onPress={() => set({ sourceKind: '' })}
                />
                <FilterChip
                  label="OER"
                  active={value.sourceKind === 'oer'}
                  onPress={() => set({ sourceKind: 'oer' })}
                />
                <FilterChip
                  label="Tutors"
                  active={value.sourceKind === 'tutor'}
                  onPress={() => set({ sourceKind: 'tutor' })}
                />
              </View>
            </View>

            <View style={tw`mb-5`}>
              <Text style={tw`text-xs font-bold text-slate-500 dark:text-white/60 mb-2`}>Scope</Text>
              <View style={tw`flex-row flex-wrap gap-2`}>
                <FilterChip label="All" active={value.scope === ''} onPress={() => set({ scope: '' })} />
                <FilterChip label="Free" active={value.scope === 'free'} onPress={() => set({ scope: 'free' })} />
                <FilterChip
                  label="Purchased"
                  active={value.scope === 'purchased'}
                  onPress={() => set({ scope: 'purchased' })}
                />
              </View>
            </View>

            <View style={tw`flex-row flex-wrap gap-3 mb-5`}>
              <View style={tw`flex-1 min-w-[120px]`}>
                <Text style={tw`text-xs font-bold text-slate-500 dark:text-white/60 mb-2`}>Subject</Text>
                <TextInput
                  value={value.subject}
                  onChangeText={(text) => set({ subject: text })}
                  placeholder="Math, English…"
                  placeholderTextColor="#94a3b8"
                  style={tw`h-10 rounded-xl px-3 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white`}
                />
              </View>

              <View style={tw`flex-1 min-w-[120px]`}>
                <Text style={tw`text-xs font-bold text-slate-500 dark:text-white/60 mb-2`}>Grade band</Text>
                <TextInput
                  value={value.gradeBand}
                  onChangeText={(text) => set({ gradeBand: text })}
                  placeholder="Primary, JHS…"
                  placeholderTextColor="#94a3b8"
                  style={tw`h-10 rounded-xl px-3 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white`}
                />
              </View>

              <View style={tw`flex-1 min-w-[120px]`}>
                <Text style={tw`text-xs font-bold text-slate-500 dark:text-white/60 mb-2`}>Country</Text>
                <TextInput
                  value={value.country}
                  onChangeText={(text) => set({ country: text })}
                  placeholder="ke, qa…"
                  placeholderTextColor="#94a3b8"
                  style={tw`h-10 rounded-xl px-3 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white`}
                />
              </View>
            </View>

            <View style={tw`flex-row flex-wrap gap-3`}>
              <View style={tw`flex-1 min-w-[140px]`}>
                <Text style={tw`text-xs font-bold text-slate-500 dark:text-white/60 mb-2`}>Min rating</Text>
                <TextInput
                  value={String(value.minRating || '')}
                  onChangeText={(text) => set({ minRating: Number(text) || 0 })}
                  placeholder="0 - 5"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  style={tw`h-10 rounded-xl px-3 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white`}
                />
              </View>

              <View style={tw`flex-1 min-w-[140px]`}>
                <Text style={tw`text-xs font-bold text-slate-500 dark:text-white/60 mb-2`}>
                  Max price (tokens)
                </Text>
                <TextInput
                  value={String(value.maxPrice || '')}
                  onChangeText={(text) => set({ maxPrice: Number(text) || 0 })}
                  placeholder="No cap"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  style={tw`h-10 rounded-xl px-3 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white`}
                />
              </View>
            </View>
          </ScrollView>

          {/* Footer actions */}
          <View
            style={tw`flex-row items-center justify-between px-4 pb-4 pt-3 border-t border-slate-200 dark:border-white/10`}
          >
            <Pressable onPress={onReset} style={tw`px-4 py-2 rounded-full border border-slate-200 dark:border-white/10`}>
              <Text style={tw`text-sm font-semibold text-slate-900 dark:text-white`}>Reset</Text>
            </Pressable>

            <Pressable onPress={onApply} style={tw`px-5 py-2 rounded-full bg-blue-500`}>
              <Text style={tw`text-sm font-extrabold text-white`}>Apply</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

/* ------------------------------- Tabs ----------------------------------- */
const TabBar: React.FC<{
  value: 'videos' | 'courses';
  onChange: (next: 'videos' | 'courses') => void;
}> = ({ value, onChange }) => (
  <View
    style={tw`flex-row bg-white dark:bg-[#0f1821] rounded-full border border-slate-200 dark:border-white/10 p-1`}
  >
    {([
      { key: 'videos', label: 'Explore Videos & Notes' },
      { key: 'courses', label: 'Explore Courses' },
    ] as const).map((tab) => (
      <Pressable
        key={tab.key}
        onPress={() => onChange(tab.key)}
        style={tw`flex-1 px-3 py-2 rounded-full ${value === tab.key ? 'bg-blue-500' : 'bg-transparent'}`}
      >
        <Text
          style={tw`text-xs text-center font-semibold ${
            value === tab.key ? 'text-white' : 'text-slate-500 dark:text-white/70'
          }`}
        >
          {tab.label}
        </Text>
      </Pressable>
    ))}
  </View>
);

const MiniMediaTabs: React.FC<{
  value: 'all' | 'videos' | 'notes';
  onChange: (v: 'all' | 'videos' | 'notes') => void;
}> = ({ value, onChange }) => {
  const Tab = ({
    k,
    label,
    emoji,
  }: {
    k: 'all' | 'videos' | 'notes';
    label: string;
    emoji: string;
  }) => {
    const active = value === k;
    return (
      <Pressable
        onPress={() => onChange(k)}
        style={tw.style(
          'px-3 py-2 rounded-full border flex-row items-center',
          active
            ? 'bg-slate-900 dark:bg-white border-slate-900 dark:border-white'
            : 'bg-white dark:bg-[#0f1821] border-slate-200 dark:border-white/10'
        )}
      >
        <Text style={tw.style('text-xs font-extrabold mr-1', active ? 'text-white dark:text-slate-900' : 'text-slate-700 dark:text-white/80')}>
          {emoji}
        </Text>
        <Text
          style={tw.style(
            'text-xs font-semibold',
            active ? 'text-white dark:text-slate-900' : 'text-slate-600 dark:text-white/70'
          )}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={tw`mt-3 flex-row items-center gap-2`}>
      <Tab k="all" label="All" emoji="✨" />
      <Tab k="videos" label="Videos" emoji="🎬" />
      <Tab k="notes" label="Notes" emoji="📄" />
    </View>
  );
};


/* --------------------------- Section Shell UI ---------------------------- */
const SectionHeader: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <View style={tw`px-4 pt-4 pb-2`}>
    <Text style={tw`text-lg font-semibold text-slate-900 dark:text-white`}>{title}</Text>
    <Text style={tw`text-xs text-slate-500 dark:text-white/60 mt-1`}>{subtitle}</Text>
  </View>
);

const SectionFooter: React.FC<{
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyMessage: string;
  hasMore: boolean;
  onLoadMore: () => void;
}> = ({ loading, error, empty, emptyMessage, hasMore, onLoadMore }) => (
  <View style={tw`px-4 pb-4`}>
    {loading && !error && empty ? (
      <View style={tw`mt-2`}>
        <Skeleton rows={3} height={80} radius={14} gap={12} />
      </View>
    ) : null}

    {error ? <Text style={tw`text-sm text-red-500`}>{error}</Text> : null}

    {!loading && !error && empty ? (
      <Text style={tw`text-sm text-slate-500 dark:text-white/60`}>{emptyMessage}</Text>
    ) : null}

    {hasMore ? (
      <Pressable onPress={onLoadMore} style={tw`mt-3 self-start rounded-full bg-blue-500 px-4 py-2`}>
        <Text style={tw`text-sm font-semibold text-white`}>Load more</Text>
      </Pressable>
    ) : null}
  </View>
);

/* ---------------------- Native: OER video collections -------------------- */
function useOerVideoCollections(backendUrl?: string, q?: string) {
  const [items, setItems] = useState<OerCollection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!backendUrl) return;

    const base = backendUrl.replace(/\/+$/, '');
    const ac = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `${base}/api/oer/collections?kind=video&limit=48${
          q?.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''
        }`;
        const res = await fetch(url, { signal: ac.signal as any });
        const data = res.ok ? await res.json().catch(() => []) : [];
        setItems(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        setError(e?.message || 'Failed to load OER collections');
      } finally {
        setLoading(false);
      }
    };

    void load();
    return () => ac.abort();
  }, [backendUrl, q]);

  return { items, loading, error };
}

/* ---------------------- Cards: ClassVault (preview) ---------------------- */
const ClassVaultMarketCard: React.FC<{
  item: RecordedVideo;
  onPress: () => void;
  isVisible: boolean;
}> = ({ item, onPress, isVisible }) => {
  const bust = String(
    (item as any)?.updated_at || (item as any)?.updatedAt || item.created_at || Date.now()
  );

  const pdfUrlRaw = withBust((item as any)?.pdf_url || '', bust);
  const pdfPreviewUrl = pdfUrlRaw ? toPdfPreviewUrl(pdfUrlRaw) : '';

  const previewUrl = withBust(
  (item as any)?.preview_url ||
    (item as any)?.previewUrl ||
    (item as any)?.video_url ||
    (item as any)?.videoUrl ||
    '',
  bust
);

  const thumbUrl = withBust((item as any)?.thumbnail_url || '', bust);

  const isPdfOnly = (() => {
  const it: any = item as any;
  const hasPdf = Boolean(it?.has_pdf) || Boolean(it?.pdf_url) || Boolean(it?.pdfUrl);
  const hasVideo =
    Boolean(it?.has_video) ||
    Boolean(it?.video_url) ||
    Boolean(it?.videoUrl) ||
    Boolean(it?.preview_url) ||
    Boolean(it?.previewUrl);
  return hasPdf && !hasVideo;
})();

  const [pdfBlocked, setPdfBlocked] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      style={tw`mb-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111b25] overflow-hidden`}
    >
      <View style={[tw`bg-[#0b1220] overflow-hidden`, { height: PREVIEW_H }]}>
        {isPdfOnly && WebView && pdfPreviewUrl && !pdfBlocked ? (
          <WebView
            source={{ uri: pdfPreviewUrl }}
            style={{ flex: 1, backgroundColor: 'transparent' }}
            onError={() => setPdfBlocked(true)}
            javaScriptEnabled={false}
            domStorageEnabled={false}
          />
        ) : null}

        {thumbUrl && (!isPdfOnly || pdfBlocked || !pdfPreviewUrl || !WebView) ? (
          <Image source={{ uri: thumbUrl }} style={tw`w-full h-full`} contentFit="cover" />
        ) : null}

        {!isPdfOnly && previewUrl && isVisible ? (
          <AutoPreviewVideo
        uri={previewUrl}
        shouldPlay={isVisible}
        allowTapToToggleMute
        style={tw`absolute inset-0`}
      />

        ) : null}

        <View style={tw`absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5`}>
          <Text style={tw`text-[11px] text-white font-semibold`}>{isPdfOnly ? 'Notes' : 'Preview'}</Text>
        </View>

        {isPdfOnly && (pdfBlocked || !WebView || !pdfPreviewUrl) ? (
          <View style={tw`absolute inset-0 items-center justify-center bg-black/35 px-3`}>
            <Text style={tw`text-xs text-white font-semibold`}>Notes preview unavailable</Text>
            <Text style={tw`text-[11px] text-white/80 mt-1 text-center`}>
              Tap to open and view the PDF.
            </Text>
          </View>
        ) : null}
      </View>

      <View style={tw`p-3`}>
        <Text style={tw`text-sm font-semibold text-slate-900 dark:text-white`} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={tw`text-xs text-slate-500 dark:text-white/60 mt-1`} numberOfLines={1}>
          {item.subject || (item as any)?.grade_level || 'ClassVault'}
        </Text>
      </View>
    </Pressable>
  );
};

/* ---------------------- Cards: OER collection ---------------------------- */
const OerCollectionCard: React.FC<{
  col: OerCollection;
  onPress: () => void;
}> = ({ col, onPress }) => {
  const title = col?.title ?? 'Collection';
  const thumb = col?.thumbnail_url || '';
  const count = Number(col?.items_count ?? 0) || 0;

  return (
    <Pressable
      onPress={onPress}
      style={tw`mb-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111b25] overflow-hidden`}
    >
      <View style={[tw`bg-slate-200 dark:bg-white/10 overflow-hidden`, { height: PREVIEW_H }]}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={tw`w-full h-full`} contentFit="cover" />
        ) : (
          <View style={tw`w-full h-full bg-[#0b1220]`} />
        )}
        <View style={tw`absolute inset-0 bg-black/20`} />
        <View style={tw`absolute bottom-2 left-2 flex-row items-center`}>
          <View style={tw`rounded-full bg-black/60 px-2 py-0.5 mr-2`}>
            <Text style={tw`text-[11px] text-white font-semibold`}>Free Collection</Text>
          </View>
          <View style={tw`rounded-full bg-white/15 px-2 py-0.5`}>
            <Text style={tw`text-[11px] text-white font-semibold`}>
              {count} item{count === 1 ? '' : 's'}
            </Text>
          </View>
        </View>
      </View>

      <View style={tw`p-3`}>
        <Text style={tw`text-sm font-semibold text-slate-900 dark:text-white`} numberOfLines={2}>
          {title}
        </Text>
        <Text style={tw`text-xs text-slate-500 dark:text-white/60 mt-1`} numberOfLines={1}>
          Open in Collection Reader
        </Text>
        <View style={tw`mt-3 self-start rounded-full bg-blue-500 px-4 py-2`}>
          <Text style={tw`text-sm font-semibold text-white`}>View Collection</Text>
        </View>
      </View>
    </Pressable>
  );
};

/* ----------------------- Cards: Course + OER book ------------------------ */
// ✅ Updated: No bottom margin here (grid row controls spacing)
const SimpleCard: React.FC<{
  title: string;
  subtitle: string;
  imageUrl?: string | null;
  onPress: () => void;
  badge?: string;
}> = ({ title, subtitle, imageUrl, onPress, badge }) => (
  <Pressable
    onPress={onPress}
    style={tw`rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111b25] overflow-hidden`}
  >
    <View style={tw`h-32 bg-slate-200 dark:bg-white/10`}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={tw`w-full h-full`} contentFit="cover" />
      ) : null}
    </View>
    <View style={tw`p-3`}>
      <Text style={tw`text-sm font-semibold text-slate-900 dark:text-white`} numberOfLines={2}>
        {title}
      </Text>
      <Text style={tw`text-xs text-slate-500 dark:text-white/60 mt-1`} numberOfLines={1}>
        {subtitle}
      </Text>
      {badge ? (
        <View style={tw`mt-2 self-start rounded-full bg-blue-50 px-2 py-0.5`}>
          <Text style={tw`text-[11px] text-blue-600 font-semibold`}>{badge}</Text>
        </View>
      ) : null}
    </View>
  </Pressable>
);

/* -------------------------------- Screen -------------------------------- */
const ResourcesPage: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<MainStackParamList, 'Resources'>>();
  const insets = useSafeAreaInsets();

  const MIN_QUERY_LEN = 4;

  const initialTab = route.params?.tab === 'courses' ? 'courses' : 'videos';
  const initialQuery = String(route.params?.q ?? '');

  const FOOTER_H = 76;
  const bottomPad = Math.max(insets.bottom, 10) + FOOTER_H;
  const [mediaTab, setMediaTab] = useState<'all' | 'videos' | 'notes'>('all');

const isNotesOnly = useCallback((it: any) => {
  const hasPdf =
    Boolean(it?.has_pdf) ||
    Boolean(it?.pdf_url) ||
    Boolean(it?.pdfUrl);

  const hasVideo =
    Boolean(it?.has_video) ||
    Boolean(it?.video_url) ||
    Boolean(it?.videoUrl) ||
    Boolean(it?.preview_url) ||
    Boolean(it?.previewUrl);

  return hasPdf && !hasVideo;
}, []);


  // ClassVault purchase support
  const { purchasedIds, purchase } = useClassVault('', '');

  const shop: any = useShopContext() as any;
  const tokenBalance =
    Number(shop?.tokens ?? shop?.tokenBalance ?? shop?.balanceTokens ?? shop?.token_count ?? 0) || 0;

  const [payOpen, setPayOpen] = useState(false);
  const [payItem, setPayItem] = useState<RecordedVideo | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const openPay = (item: RecordedVideo) => {
    setPayError(null);
    setPayItem(item);
    setPayOpen(true);
  };

  const closePay = () => {
    setPayOpen(false);
    setPayItem(null);
    setPayBusy(false);
    setPayError(null);
  };

  const doPurchase = async () => {
    if (!payItem || payBusy) return;
    setPayBusy(true);
    setPayError(null);

    try {
      await purchase(payItem);
      const id = Number((payItem as any).id);
      closePay();
      navigation.navigate('ClassVaultDetail', { id });
    } catch (err: any) {
      const msg =
        (typeof err?.message === 'string' && err.message) || 'Purchase failed. Please try again.';
      setPayError(msg);
    } finally {
      setPayBusy(false);
    }
  };

  const [tab, setTab] = useState<'videos' | 'courses'>(initialTab);
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

  const [appliedFilters, setAppliedFilters] = useState<ResourceFilters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<ResourceFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeFilterCount = useMemo(() => countActiveFilters(appliedFilters), [appliedFilters]);

  // ✅ allow navbar icon to focus search input
  const searchRef = useRef<TextInput | null>(null);

  useEffect(() => {
  if (tab !== 'videos') setMediaTab('all');
}, [tab]);


  // ✅ handle navbar-trigger params: openSearch/openFilters
  useEffect(() => {
    const p: any = (route as any)?.params || {};
    const openSearch = Boolean(p?.openSearch);
    const openFilters = Boolean(p?.openFilters);

    if (typeof p?.tab === 'string') {
      if (p.tab === 'courses') setTab('courses');
      if (p.tab === 'videos') setTab('videos');
    }
    if (typeof p?.q === 'string') {
      setQuery(p.q);
      setDebouncedQuery(p.q);
    }

    if (openFilters) {
      setDraftFilters(appliedFilters);
      setFiltersOpen(true);
      try {
        navigation.setParams({ openFilters: false } as any);
      } catch {}
    }

    if (openSearch) {
      // close filters if open
      setFiltersOpen(false);
      // focus input shortly after render
      setTimeout(() => searchRef.current?.focus?.(), 150);
      try {
        navigation.setParams({ openSearch: false } as any);
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  const trimmedQuery = query.trim();
  const queryActive = trimmedQuery.length >= MIN_QUERY_LEN;
  const effectiveQuery = queryActive ? debouncedQuery.trim() : '';

  const explore = useResourcesExplore(effectiveQuery, tab, appliedFilters);

  const { backendUrl } = useShopContext() as any;
  const oerCollections = useOerVideoCollections(backendUrl, effectiveQuery);

  // Visible tracking so only on-screen cards autoplay video previews
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 55 }), []);
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    const next = new Set<string>();
    for (const v of viewableItems || []) {
      const it = v?.item;
      if (!it) continue;
      if (it.kind === 'classvault') next.add(`classvault:${String(it.id)}`);
    }
    setVisibleIds(next);
  }).current;

  const headerCopy = useMemo(
    () =>
      tab === 'videos'
        ? 'Discover ClassVault marketplace items and free OER video collections.'
        : 'Browse tutor-led courses and free OER books.',
    [tab]
  );

  const isPurchasedCoursesScope = appliedFilters.scope === 'purchased' && tab === 'courses';

  const clearAll = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setAppliedFilters(DEFAULT_FILTERS);
    setDraftFilters(DEFAULT_FILTERS);
  }, []);

  // ✅ NEW: grid rows for courses + books
const sections: ExploreSection[] = useMemo(() => {
  // ✅ put it HERE (top of the useMemo)
  const classVaultRaw = (explore.classVault.items || []).map((item: any) => ({
    ...item,
    kind: 'classvault',
  }));

  const classVaultFiltered =
    tab !== 'videos'
      ? classVaultRaw
      : mediaTab === 'all'
      ? classVaultRaw
      : mediaTab === 'notes'
      ? classVaultRaw.filter((x: any) => isNotesOnly(x))
      : classVaultRaw.filter((x: any) => !isNotesOnly(x));

  // ✅ now use classVaultFiltered below
  if (tab === 'videos') {
    return [
      {
        key: 'classvault',
        title: 'ClassVault marketplace',
        subtitle:
          mediaTab === 'notes'
            ? 'Notes only (PDFs) from tutors.'
            : mediaTab === 'videos'
            ? 'Video lessons only from tutors (with previews).'
            : 'Discover videos and notes from tutors (with previews).',
        data: classVaultFiltered,
        loading: explore.classVault.loading,
        error: explore.classVault.error,
        emptyMessage:
          mediaTab === 'notes'
            ? 'No notes found yet.'
            : mediaTab === 'videos'
            ? 'No videos found yet.'
            : 'No ClassVault results yet.',
        hasMore: explore.classVault.hasMore,
        loadMore: explore.classVault.loadMore,
      },
      {
  key: 'oerCollections',
  title: 'Free OER video collections',
  subtitle: 'Curated playlists you can open in the Collection Reader.',
  data: (oerCollections.items || []).slice(0, 12).map((c: any) => ({ ...c, kind: 'oerCollection' })),
  loading: oerCollections.loading,
  error: oerCollections.error,
  emptyMessage: 'No OER video collections match that search.',
  hasMore: false,
  loadMore: () => {},
},

    ];
  }

  // existing courses tab logic stays the same...
  const courseRows: GridRowItem[] = chunk(explore.normalCourses.items || [], 2).map((pair, idx) => ({
    kind: 'gridRow',
    rowKind: 'course',
    rowId: `course-row-${idx}`,
    items: pair as any,
  }));

  const bookRows: GridRowItem[] = chunk(explore.oerBooks.items || [], 2).map((pair, idx) => ({
    kind: 'gridRow',
    rowKind: 'oerBook',
    rowId: `book-row-${idx}`,
    items: pair as any,
  }));

  return [
    {
      key: 'courses',
      title: 'Courses',
      subtitle: 'Explore tutor-led courses available to enroll.',
      data: courseRows as any,
      loading: explore.normalCourses.loading,
      error: explore.normalCourses.error,
      emptyMessage: isPurchasedCoursesScope ? 'Purchased scope applies to videos only.' : 'No courses found yet.',
      hasMore: explore.normalCourses.hasMore,
      loadMore: explore.normalCourses.loadMore,
    },
    {
      key: 'oerBooks',
      title: 'Free OER books',
      subtitle: 'OpenStax and other openly licensed books.',
      data: bookRows as any,
      loading: explore.oerBooks.loading,
      error: explore.oerBooks.error,
      emptyMessage: isPurchasedCoursesScope ? 'Purchased scope applies to videos only.' : 'No OER books match that search.',
      hasMore: explore.oerBooks.hasMore,
      loadMore: explore.oerBooks.loadMore,
    },
  ];
}, [
  tab,
  mediaTab,          // ✅ add this
  explore,
  oerCollections,
  isPurchasedCoursesScope,
  isNotesOnly,       // ✅ add this (because you call it)
]);


  const renderItem = useCallback(
    ({ item }: { item: SectionItem }) => {
      if (item.kind === 'classvault') {
        const key = `classvault:${String((item as any).id)}`;
        const isVisible = visibleIds.has(key);

        return (
          <View style={tw`px-4`}>
            <ClassVaultMarketCard
              item={item as any}
              isVisible={isVisible}
              onPress={() => {
                const id = Number((item as any).id);
                const price = Number((item as any).price ?? 0) || 0;

                if (price <= 0 || purchasedIds?.has?.(id)) {
                  navigation.navigate('ClassVaultDetail', { id });
                  return;
                }
                openPay(item as any);
              }}
            />
          </View>
        );
      }

      if (item.kind === 'oerCollection') {
        const col = item as any;
        const id = String(col?.slug ?? col?.id ?? '');
        return (
          <View style={tw`px-4`}>
            <OerCollectionCard col={col} onPress={() => navigation.navigate('OerCollectionReader', { id })} />
          </View>
        );
      }

      // ✅ NEW: grid row renderer (2 per row)
      if (item.kind === 'gridRow') {
        const row = item as GridRowItem;
        const first = row.items[0] as any;
        const second = row.items[1] as any;

        return (
          <View style={tw`px-4 mb-3 flex-row`}>
            <View style={tw`flex-1`}>
              {row.rowKind === 'course' ? (
                <SimpleCard
                  title={String(first?.title ?? 'Course')}
                  subtitle={String(first?.subject ?? 'Course')}
                  imageUrl={first?.thumbnail_url ?? null}
                  onPress={() => navigation.navigate('CourseDetails', { courseId: String(first?.id) })}
                />
              ) : (
                <SimpleCard
                  title={String(first?.title ?? 'Book')}
                  subtitle="Open resources"
                  imageUrl={first?.cover_url ?? null}
                  onPress={() => navigation.navigate('OerReaderFull', { id: first?.slug || first?.id })}
                  badge="Free"
                />
              )}
            </View>

            <View style={tw`w-3`} />

            <View style={tw`flex-1`}>
              {second ? (
                row.rowKind === 'course' ? (
                  <SimpleCard
                    title={String(second?.title ?? 'Course')}
                    subtitle={String(second?.subject ?? 'Course')}
                    imageUrl={second?.thumbnail_url ?? null}
                    onPress={() => navigation.navigate('CourseDetails', { courseId: String(second?.id) })}
                  />
                ) : (
                  <SimpleCard
                    title={String(second?.title ?? 'Book')}
                    subtitle="Open resources"
                    imageUrl={second?.cover_url ?? null}
                    onPress={() => navigation.navigate('OerReaderFull', { id: second?.slug || second?.id })}
                    badge="Free"
                  />
                )
              ) : (
                // spacer to keep row width consistent when odd count
                <View style={tw`flex-1`} />
              )}
            </View>
          </View>
        );
      }

      // (kept for compatibility / other types; normally gridRow handles these in courses tab)
      if (item.kind === 'oerBook') {
        const id = (item as any).slug || (item as any).id;
        return (
          <View style={tw`px-4 mb-3`}>
            <SimpleCard
              title={(item as any).title}
              subtitle="Open resources"
              imageUrl={(item as any).cover_url}
              onPress={() => navigation.navigate('OerReaderFull', { id })}
              badge="Free"
            />
          </View>
        );
      }

      return (
        <View style={tw`px-4 mb-3`}>
          <SimpleCard
            title={(item as any).title}
            subtitle={(item as any).subject || 'Course'}
            imageUrl={(item as any).thumbnail_url}
            onPress={() => navigation.navigate('CourseDetails', { courseId: String((item as any).id) })}
          />
        </View>
      );
    },
    [navigation, openPay, purchasedIds, visibleIds]
  );

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`} edges={['top', 'left', 'right']}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => {
          const k = (item as any)?.kind;
          if (k === 'gridRow') return `gridRow:${(item as any).rowId}`;
          if (k === 'classvault') return `classvault:${String((item as any).id)}`;
          if (k === 'oerCollection') return `oerCollection:${String((item as any).slug ?? (item as any).id)}`;
          if (k === 'oerBook') return `oerBook:${String((item as any).slug ?? (item as any).id)}`;
          if (k === 'course') return `course:${String((item as any).id)}`;
          return `item:${String((item as any).id ?? (item as any).slug ?? 'unknown')}`;
        }}

        renderItem={renderItem}
        renderSectionHeader={({ section }) => <SectionHeader title={section.title} subtitle={section.subtitle} />}
        renderSectionFooter={({ section }) => (
          <SectionFooter
            loading={section.loading}
            error={section.error}
            empty={section.data.length === 0}
            emptyMessage={section.emptyMessage}
            hasMore={section.hasMore}
            onLoadMore={section.loadMore}
          />
        )}
        ListHeaderComponent={
          <View style={tw`px-4 pt-6 pb-2`}>
            <Text style={tw`text-2xl font-bold text-slate-900 dark:text-white`}>Explore</Text>
            <View style={tw`flex-row flex-wrap items-center mt-1`}>
              <Text style={tw`text-sm text-slate-500 dark:text-white/60`}>{headerCopy}</Text>
              <Text style={tw`text-sm text-slate-400 dark:text-white/50 mx-1`}>•</Text>
              <Pressable
                onPress={() => navigation.navigate('VerifyCertificate')}
                accessibilityRole="link"
                accessibilityLabel="Verify a course certificate"
                hitSlop={6}
              >
                <Text style={tw`text-xs font-semibold text-slate-500 dark:text-white/60`}>
                  Verify a certificate
                </Text>
              </Pressable>
            </View>

            <View style={tw`mt-4`}>
              <View
                style={tw`h-12 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#172534] flex-row items-center px-3`}
              >
                <Text style={tw`text-slate-500 dark:text-white/70 text-base mr-2`}>🔍</Text>
                <TextInput
                  ref={(r) => {
                    searchRef.current = r;
                  }}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search videos, notes, collections, or courses"
                  placeholderTextColor="#7a8aa0"
                  style={tw`flex-1 h-full text-slate-900 dark:text-slate-100`}
                  returnKeyType="search"
                />
              </View>
            </View>

            <View style={tw`mt-4`}>
              <View style={tw`flex-row items-center justify-between mb-3`}>
                <Pressable
                  onPress={() => {
                    setDraftFilters(appliedFilters);
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
                  onPress={clearAll}
                  style={tw`rounded-full border border-slate-200 dark:border-white/10 px-4 py-2`}
                >
                  <Text style={tw`text-sm font-semibold text-slate-700 dark:text-white`}>Reset</Text>
                </Pressable>
              </View>

              <TabBar value={tab} onChange={setTab} />
              {tab === 'videos' ? (
  <MiniMediaTabs value={mediaTab} onChange={setMediaTab} />
) : null}

            </View>

            {!WebView && tab === 'videos' ? (
              <Text style={tw`text-[11px] text-slate-500 dark:text-white/50 mt-3`}>
                Tip: install react-native-webview to preview PDFs inline.
              </Text>
            ) : null}
          </View>
        }
        contentContainerStyle={[tw`bg-slate-50 dark:bg-[#0b1016]`, { paddingBottom: bottomPad }]}
        ListFooterComponent={<View style={{ height: bottomPad }} />}
        stickySectionHeadersEnabled={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      <FilterModal
        open={filtersOpen}
        value={draftFilters}
        onChange={setDraftFilters}
        onClose={() => setFiltersOpen(false)}
        onApply={() => {
          setAppliedFilters(draftFilters);
          setFiltersOpen(false);
        }}
        onReset={() => setDraftFilters(DEFAULT_FILTERS)}
      />

      <Modal visible={payOpen} transparent animationType="fade" onRequestClose={closePay}>
        <View style={tw`flex-1 bg-black/50 items-center justify-center px-5`}>
          <View
            style={tw`w-full rounded-2xl bg-white dark:bg-[#0f1821] border border-slate-200 dark:border-white/10 overflow-hidden`}
          >
            <View style={tw`px-4 pt-4 pb-3 border-b border-slate-200 dark:border-white/10`}>
              <Text style={tw`text-base font-extrabold text-slate-900 dark:text-white`}>
                Confirm purchase
              </Text>
              <Text style={tw`text-xs text-slate-500 dark:text-white/60 mt-1`}>
                You’re about to unlock this item using tokens.
              </Text>
            </View>

            <View style={tw`px-4 py-4`}>
              <Text style={tw`text-sm font-semibold text-slate-900 dark:text-white`} numberOfLines={2}>
                {payItem?.title ?? 'Item'}
              </Text>

              <View style={tw`mt-2`}>
                <Text style={tw`text-xs text-slate-500 dark:text-white/60`}>
                  Type:{' '}
                  {payItem && isNotesOnly(payItem as any) ? 'Notes' : 'Video'}

                </Text>
                <Text style={tw`text-xs text-slate-500 dark:text-white/60 mt-1`}>
                  Subject: {(payItem as any)?.subject || 'ClassVault'}
                  {payItem && (payItem as any)?.grade_level != null ? ` • Grade ${(payItem as any).grade_level}` : ''}
                </Text>
              </View>

              <View
                style={tw`mt-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-3`}
              >
                <View style={tw`flex-row items-center justify-between`}>
                  <Text style={tw`text-xs text-slate-500 dark:text-white/60`}>Cost</Text>
                  <Text style={tw`text-sm font-extrabold text-slate-900 dark:text-white`}>
                    {Number((payItem as any)?.price ?? 0) || 0} tokens
                  </Text>
                </View>
                <View style={tw`flex-row items-center justify-between mt-2`}>
                  <Text style={tw`text-xs text-slate-500 dark:text-white/60`}>Your balance</Text>
                  <Text style={tw`text-sm font-semibold text-slate-900 dark:text-white`}>
                    {tokenBalance} tokens
                  </Text>
                </View>

                {payItem ? (
                  <Text style={tw`text-[11px] text-slate-500 dark:text-white/60 mt-3`}>
                    After purchase, this item will be available in **Purchased Videos & Notes**.
                  </Text>
                ) : null}
              </View>

              {payError ? <Text style={tw`text-xs text-red-600 dark:text-red-400 mt-3`}>{payError}</Text> : null}
            </View>

            <View style={tw`px-4 pb-4 flex-row items-center justify-between`}>
              <TouchableOpacity
                onPress={closePay}
                disabled={payBusy}
                style={tw.style(
                  `px-4 py-2 rounded-full border border-slate-200 dark:border-white/10`,
                  payBusy && 'opacity-60'
                )}
              >
                <Text style={tw`text-sm font-semibold text-slate-900 dark:text-white`}>Cancel</Text>
              </TouchableOpacity>

              <View style={tw`flex-row items-center`}>
                {payError && String(payError).toLowerCase().includes('insufficient') ? (
                  <TouchableOpacity
                    onPress={() => {
                      closePay();
                      navigation.navigate('BuyTokens');
                    }}
                    style={tw`mr-2 px-4 py-2 rounded-full bg-slate-900 dark:bg-white`}
                  >
                    <Text style={tw`text-sm font-semibold text-white dark:text-slate-900`}>Buy tokens</Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  onPress={doPurchase}
                  disabled={payBusy || !payItem}
                  style={tw.style(`px-4 py-2 rounded-full bg-blue-500`, (payBusy || !payItem) && 'opacity-60')}
                >
                  <Text style={tw`text-sm font-extrabold text-white`}>
                    {payBusy ? 'Purchasing…' : 'Purchase'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default ResourcesPage;
