// apps/mobile/src/screens/org/OrgLearnerNewsletters.native.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  Share,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import MarkdownDisplay from 'react-native-markdown-display';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import tw from '../../../tailwind';

import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import {
  apiGetLearnerNewsletter,
  apiListLearnerNewsletters,
} from '@mytutorapp/shared/api/orgProApi';
import { getAnnouncementFeed } from '@mytutorapp/shared/api/orgEngagementApi';

import { useThemePref } from '../../theme/ThemeContext';

type TabKey = 'newsletters' | 'announcements';

type LearnerNewsletter = {
  id: string | number;
  title?: string;
  term_label?: string;
  sent_at?: string;
  has_pdf?: boolean;
  content_md?: string;
};

type LearnerNewsletterListResponse = { items: LearnerNewsletter[] };

type AnnouncementFeedResponse = {
  items: any[];
  page?: number;
  limit?: number;
  audiences?: string[];
  class_label?: string | null;
  scope?: string;
  diag?: any;
};

const FOOTER_OVERLAY_PX = 84;
const NAV_SPACER_PX = 12;

function pickString(...xs: any[]) {
  for (const x of xs) {
    const s = typeof x === 'string' ? x : x == null ? '' : String(x);
    if (s.trim()) return s.trim();
  }
  return '';
}

function fmtWhen(v?: any) {
  const s = pickString(v);
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

function fmtDateOnly(v?: any) {
  const s = pickString(v);
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString();
}

function firstLine(s: string, max = 120) {
  const t =
    String(s || '')
      .replace(/\r/g, '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)[0] || '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function stripThemeFromContent(md: string) {
  return String(md || '').replace(/^\s*<!--THEME[\s\S]*?-->\s*/i, '');
}

function ensureTrailingSlash(p: string) {
  return p.endsWith('/') ? p : `${p}/`;
}

/**
 * ✅ expo-file-system compatibility:
 * - Old API: documentDirectory / cacheDirectory (string)
 * - New API: Paths.document / Paths.cache (Directory object with .uri)
 * Even though we import legacy here, keeping this helper makes it robust.
 */
function pickFsUri(v: any): string | null {
  if (typeof v === 'string' && v.length) return v;
  if (v && typeof v.uri === 'string' && v.uri.length) return v.uri;
  return null;
}

function getWritableBaseDirUri(): string | null {
  const fs: any = FileSystem as any;

  const docNew = pickFsUri(fs?.Paths?.document);
  const cacheNew = pickFsUri(fs?.Paths?.cache);

  const docOld = pickFsUri(fs?.documentDirectory);
  const cacheOld = pickFsUri(fs?.cacheDirectory);

  const docAlt = pickFsUri(fs?.Paths?.documentDirectory);
  const cacheAlt = pickFsUri(fs?.Paths?.cacheDirectory);

  const out = docNew || docOld || docAlt || cacheNew || cacheOld || cacheAlt || null;
  return out ? ensureTrailingSlash(out) : null;
}

function resolveIsDark(themePref: any, systemIsDark: boolean) {
  if (!themePref) return systemIsDark;

  const prefStr =
    typeof themePref === 'string'
      ? themePref
      : pickString(themePref?.pref, themePref?.mode, themePref?.theme, themePref?.appearance);

  const normalized = String(prefStr || '').toLowerCase().trim();
  if (normalized === 'system' || normalized === 'auto') return systemIsDark;
  if (normalized === 'dark') return true;
  if (normalized === 'light') return false;

  const boolCandidates = [themePref?.isDark, themePref?.dark, themePref?.is_dark];
  for (const c of boolCandidates) if (typeof c === 'boolean') return c;

  return systemIsDark;
}

function makeTheme(isDark: boolean) {
  const bg = isDark ? '#020617' : '#f8fafc';
  const card = isDark ? '#0b1220' : '#ffffff';
  const text = isDark ? 'rgba(255,255,255,0.95)' : 'rgba(15,23,42,0.95)';
  const subtext = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(71,85,105,0.95)';
  const muted = isDark ? 'rgba(148,163,184,0.85)' : 'rgba(100,116,139,0.95)';

  const border = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(148,163,184,0.35)';
  const soft = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)';
  const btn = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.92)';

  const danger = isDark ? 'rgba(254,205,211,0.95)' : 'rgba(136,19,55,0.95)';

  return { dark: isDark, bg, card, text, subtext, muted, border, soft, btn, danger };
}

/** Learner announcement UI mapping (stable + forgiving) */
function mapAnnouncement(a: any) {
  const title = pickString(a?.title, a?.subject, 'Announcement');
  const whenRaw = pickString(a?.created_at, a?.start_at, a?.published_at, a?.sent_at, '');
  const bodyMd = pickString(a?.body, a?.agenda_md, a?.body_md, a?.content_md, a?.content, '');

  const pinned = Boolean(a?.pinned ?? a?.is_pinned);
  const category = pickString(a?.category, a?.kind, '').toLowerCase();
  const audience = pickString(a?.audience, 'all').toLowerCase();
  const classLabel = pickString(a?.class_label, a?.classLabel, a?.class, '');
  const status = pickString(a?.status, '').toLowerCase(); // live | scheduled | expired

  const meetingAt = pickString(a?.meeting_at, '');
  const meetingLoc = pickString(a?.meeting_location, '');
  const meetingUrl = pickString(a?.meeting_url, '');

  const hasMeeting = Boolean(meetingAt || meetingLoc || meetingUrl);

  return {
    raw: a,
    id: a?.id,
    title,
    whenRaw,
    bodyMd,
    pinned,
    category,
    audience,
    classLabel,
    status,
    meetingAt,
    meetingLoc,
    meetingUrl,
    hasMeeting,
  };
}

function Pill({
  theme,
  label,
  active,
  onPress,
}: {
  theme: any;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        tw`px-4 py-2 rounded-full`,
        {
          backgroundColor: active
            ? theme.dark
              ? 'rgba(255,255,255,0.95)'
              : 'rgba(15,23,42,0.95)'
            : theme.soft,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={[
          tw`text-xs font-semibold`,
          { color: active ? (theme.dark ? '#0b1220' : '#ffffff') : theme.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Badge({
  theme,
  label,
  tone,
  onPress,
}: {
  theme: any;
  label: string;
  tone?: 'slate' | 'amber' | 'indigo' | 'emerald';
  onPress?: () => void;
}) {
  const colors =
    tone === 'amber'
      ? {
          bg: theme.dark ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.10)',
          border: 'rgba(245,158,11,0.25)',
          text: theme.dark ? 'rgba(253,230,138,0.95)' : 'rgba(146,64,14,0.95)',
        }
      : tone === 'indigo'
        ? {
            bg: theme.dark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.10)',
            border: 'rgba(99,102,241,0.25)',
            text: theme.dark ? 'rgba(224,231,255,0.95)' : 'rgba(49,46,129,0.95)',
          }
        : tone === 'emerald'
          ? {
              bg: theme.dark ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.10)',
              border: 'rgba(16,185,129,0.25)',
              text: theme.dark ? 'rgba(167,243,208,0.95)' : 'rgba(6,95,70,0.95)',
            }
          : {
              bg: theme.soft,
              border: theme.border,
              text: theme.dark ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.75)',
            };

  const inner = (
    <View
      style={[
        tw`px-2 py-0.5 rounded-full mr-1`,
        { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
      ]}
    >
      <Text style={{ fontSize: 10, color: colors.text, fontWeight: '700' }}>{label}</Text>
    </View>
  );

  if (!onPress) return inner;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]} hitSlop={10}>
      {inner}
    </Pressable>
  );
}

function Card({
  theme,
  children,
  style,
}: {
  theme: any;
  children: React.ReactNode;
  style?: any;
}) {
  return (
    <View
      style={[
        tw`rounded-3xl p-4 border`,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          shadowColor: '#000',
          shadowOpacity: theme.dark ? 0.25 : 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

async function tryDownloadPdf({
  backendUrl,
  orgId,
  newsletterId,
  token,
  destUri,
}: {
  backendUrl: string;
  orgId: string;
  newsletterId: string | number;
  token: string;
  destUri: string;
}) {
  const candidates = [
    `${backendUrl}/api/org/${orgId}/learner/newsletters/${newsletterId}/pdf`,
    `${backendUrl}/api/orgs/${orgId}/learner/newsletters/${newsletterId}/pdf`,
  ];

  let lastErr: any = null;

  for (const url of candidates) {
    try {
      const r = await FileSystem.downloadAsync(url, destUri, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r?.status && r.status >= 200 && r.status < 300) return { ok: true, url, uri: r.uri };
      lastErr = new Error(`HTTP ${r?.status || '??'}`);
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('Failed to download PDF');
}

export default function OrgLearnerNewslettersNative() {
  const systemScheme = useColorScheme();
  const themePref = useThemePref();
  const isDark = resolveIsDark(themePref, systemScheme === 'dark');
  const theme = useMemo(() => makeTheme(isDark), [isDark]);

  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(FOOTER_OVERLAY_PX, FOOTER_OVERLAY_PX + (insets.bottom || 0));

  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const routeParams = (route?.params || {}) as any;

  const { org } = (useOrg?.() ?? {}) as any;
  const { backendUrl, orgToken } = (useShopContext?.() ?? {}) as any;
  const orgId = org?.id ? String(org.id) : '';

  const [tab, setTab] = useState<TabKey>((routeParams?.tab as TabKey) || 'newsletters');
  const [selectedNewsletterId, setSelectedNewsletterId] = useState<string | number | null>(
    routeParams?.id ?? null,
  );
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string | number | null>(
    routeParams?.aid ?? null,
  );

  const [mode, setMode] = useState<'list' | 'detail'>(
    routeParams?.id || routeParams?.aid ? 'detail' : 'list',
  );

  const [downloadingPdfId, setDownloadingPdfId] = useState<string | number | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const listNewslettersQ = useQuery<LearnerNewsletterListResponse, Error>({
    queryKey: ['learner-newsletters', orgId],
    enabled: !!backendUrl && !!orgToken && !!orgId,
    queryFn: async () =>
      (await apiListLearnerNewsletters(
        backendUrl,
        String(orgId),
        orgToken,
      )) as LearnerNewsletterListResponse,
  });

  const newsletters = useMemo(() => listNewslettersQ.data?.items || [], [listNewslettersQ.data]);

  const annFeedQ = useQuery<AnnouncementFeedResponse, Error>({
    queryKey: ['learner-announcements-feed', orgId],
    enabled: !!backendUrl && !!orgToken && !!orgId,
    placeholderData: { items: [], page: 1, limit: 50, scope: 'live_upcoming', class_label: null },
    queryFn: async () => {
      const raw: any = await getAnnouncementFeed(backendUrl, orgToken, String(orgId), {
        page: 1,
        limit: 50,
        scope: 'live_upcoming',
        debug: 0,
      });

      if (Array.isArray(raw)) return { items: raw, page: 1, limit: 50, scope: 'live_upcoming' };
      if (raw && Array.isArray(raw.items)) return raw as AnnouncementFeedResponse;
      return { items: [], page: 1, limit: 50, scope: 'live_upcoming' };
    },
  });

  const mappedAnnouncements = useMemo(
    () => (annFeedQ.data?.items || []).map(mapAnnouncement),
    [annFeedQ.data],
  );

  const newsletterDetailQ = useQuery<LearnerNewsletter, Error>({
    queryKey: ['learner-newsletter', orgId, selectedNewsletterId],
    enabled:
      tab === 'newsletters' && !!backendUrl && !!orgToken && !!orgId && selectedNewsletterId != null,
    queryFn: async () =>
      (await apiGetLearnerNewsletter(
        backendUrl,
        String(orgId),
        String(selectedNewsletterId),
        orgToken,
      )) as LearnerNewsletter,
  });

  const selectedNewsletter = newsletterDetailQ.data || null;

  const selectedAnnouncement = useMemo(() => {
    if (selectedAnnouncementId == null) return null;
    return (
      mappedAnnouncements.find((a: any) => String(a.id) === String(selectedAnnouncementId)) || null
    );
  }, [mappedAnnouncements, selectedAnnouncementId]);

  useEffect(() => {
    const nextTab = (routeParams?.tab as TabKey) || 'newsletters';
    setTab(nextTab);

    if (routeParams?.id != null) {
      setSelectedNewsletterId(routeParams.id);
      setMode('detail');
      return;
    }
    if (routeParams?.aid != null) {
      setSelectedAnnouncementId(routeParams.aid);
      setMode('detail');
      return;
    }

    setMode('list');
  }, [routeParams?.tab, routeParams?.id, routeParams?.aid]);

  const goBackHeader = () => {
    if (mode === 'detail') {
      setMode('list');
      return;
    }
    navigation.goBack?.();
  };

  const refresh = () => {
    setPdfError(null);
    listNewslettersQ.refetch?.();
    annFeedQ.refetch?.();
    newsletterDetailQ.refetch?.();
  };

  const shareAnnouncementText = async (title: string, md: string) => {
    const body = stripThemeFromContent(md || '');
    const msg = `${title}\n\n${body}`.trim();
    try {
      await Share.share({ message: msg });
    } catch {
      // ignore
    }
  };

  const downloadNewsletterPdf = async (n: LearnerNewsletter) => {
    if (!n?.has_pdf) return;
    if (!backendUrl || !orgToken || !orgId) return;

    setPdfError(null);
    setDownloadingPdfId(n.id);

    try {
      const baseDir = getWritableBaseDirUri();

      if (!baseDir) {
        try {
          console.log('[OrgLearnerNewsletters] No writable base dir', {
            platform: Platform.OS,
            doc: (FileSystem as any)?.documentDirectory,
            cache: (FileSystem as any)?.cacheDirectory,
            keys: Object.keys(FileSystem as any),
          });
        } catch {}
        throw new Error('PDF storage is not available on this device/session.');
      }

      const safeId = String(n.id).replace(/[^\w\d-_]+/g, '_');
      const dest = `${baseDir}newsletter_${orgId}_${safeId}.pdf`;

      const existing = await FileSystem.getInfoAsync(dest);
      let localUri =
        existing.exists && typeof existing.size === 'number' && existing.size > 0
          ? existing.uri
          : null;

      if (!localUri) {
        const r = await tryDownloadPdf({
          backendUrl,
          orgId,
          newsletterId: n.id,
          token: orgToken,
          destUri: dest,
        });
        localUri = r.uri;
      }

      if (!localUri) throw new Error('Failed to save PDF locally.');

      let shareUri = localUri;
      if (Platform.OS === 'android') {
        try {
          shareUri = await FileSystem.getContentUriAsync(localUri);
        } catch {
          // keep file://
        }
      }

      const title = pickString(n.title, 'Newsletter');

      const canShare = await Sharing.isAvailableAsync().catch(() => false);
      if (canShare) {
        await Sharing.shareAsync(shareUri as any, {
          mimeType: 'application/pdf',
          dialogTitle: title,
          UTI: 'com.adobe.pdf',
        });
        return;
      }

      await Share.share({ message: title, url: shareUri as any });
    } catch (e: any) {
      const msg = e?.message || 'Failed to download PDF';
      setPdfError(msg);
      Alert.alert('Download failed', msg);
    } finally {
      setDownloadingPdfId(null);
    }
  };

  const headerTitle = tab === 'newsletters' ? 'Newsletters' : 'Announcements';

  const renderListItem = ({ item }: { item: any }) => {
    if (tab === 'newsletters') {
      const n = item as LearnerNewsletter;

      return (
        <Pressable
          onPress={() => {
            setSelectedNewsletterId(n.id);
            setMode('detail');
            setPdfError(null);
          }}
          style={({ pressed }) => [
            tw`rounded-2xl p-3 mb-2 border`,
            {
              backgroundColor: theme.dark ? 'rgba(255,255,255,0.03)' : '#fff',
              borderColor: theme.border,
              opacity: pressed ? 0.88 : 1,
            },
          ]}
        >
          <View style={tw`flex-row items-start justify-between`}>
            <Text
              style={[tw`text-sm font-semibold flex-1 pr-2`, { color: theme.text }]}
              numberOfLines={2}
            >
              {n.title || 'Untitled'}
            </Text>

            {n.has_pdf ? (
              <Badge
                theme={theme}
                label={downloadingPdfId === n.id ? 'DOWNLOADING…' : 'PDF'}
                tone="slate"
                onPress={() => downloadNewsletterPdf(n)}
              />
            ) : null}
          </View>

          <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]}>
            {pickString(n.term_label) ? `${n.term_label} • ` : ''}
            {n.sent_at ? fmtDateOnly(n.sent_at) : ''}
          </Text>

          {pdfError && downloadingPdfId == null ? (
            <Text style={[tw`text-[11px] mt-2`, { color: theme.danger }]} numberOfLines={2}>
              {pdfError}
            </Text>
          ) : null}
        </Pressable>
      );
    }

    const a = item;
    const cat = (a.category || '').toUpperCase();
    const showCat = Boolean(cat && cat !== 'GENERAL');
    const st = (a.status || '').toUpperCase();
    const showStatus = Boolean(st && st !== 'LIVE');
    const preview = firstLine(a.bodyMd || '');

    return (
      <Pressable
        onPress={() => {
          setSelectedAnnouncementId(a.id);
          setMode('detail');
        }}
        style={({ pressed }) => [
          tw`rounded-2xl p-3 mb-2 border`,
          {
            backgroundColor: theme.dark ? 'rgba(255,255,255,0.03)' : '#fff',
            borderColor: theme.border,
            opacity: pressed ? 0.88 : 1,
          },
        ]}
      >
        <View style={tw`flex-row items-start justify-between`}>
          <Text
            style={[tw`text-sm font-semibold flex-1 pr-2`, { color: theme.text }]}
            numberOfLines={2}
          >
            {a.title}
          </Text>

          <View style={tw`flex-row flex-wrap justify-end`}>
            {a.pinned ? <Badge theme={theme} label="PINNED" tone="amber" /> : null}
            {showStatus ? <Badge theme={theme} label={st} tone="indigo" /> : null}
            {showCat ? <Badge theme={theme} label={cat} tone="slate" /> : null}
            {a.hasMeeting ? <Badge theme={theme} label="MEETING" tone="emerald" /> : null}
          </View>
        </View>

        <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]}>
          {a.classLabel ? `${a.classLabel} • ` : ''}
          {a.whenRaw ? fmtDateOnly(a.whenRaw) : ''}
          {a.audience && a.audience !== 'all' ? ` • ${String(a.audience).toUpperCase()}` : ''}
        </Text>

        {preview ? (
          <Text
            style={[
              tw`text-xs mt-1`,
              { color: theme.dark ? 'rgba(255,255,255,0.78)' : 'rgba(15,23,42,0.78)' },
            ]}
            numberOfLines={2}
          >
            {preview}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  const listData = tab === 'newsletters' ? newsletters : mappedAnnouncements;

  const detailTitle =
    tab === 'newsletters'
      ? pickString(selectedNewsletter?.title, 'Newsletter')
      : pickString(selectedAnnouncement?.title, 'Announcement');

  const detailWhen =
    tab === 'newsletters'
      ? pickString(selectedNewsletter?.sent_at, '')
      : pickString(selectedAnnouncement?.whenRaw, '');

  const detailMd =
    tab === 'newsletters'
      ? pickString(selectedNewsletter?.content_md, '')
      : pickString(selectedAnnouncement?.bodyMd, '');

  const detailLoading = tab === 'newsletters' ? newsletterDetailQ.isLoading : annFeedQ.isLoading;
  const detailError = tab === 'newsletters' ? (newsletterDetailQ.error as any) : (annFeedQ.error as any);

  const canDownloadPdf = tab === 'newsletters' && Boolean(selectedNewsletter?.has_pdf);

  const mdStyles = useMemo(
    () =>
      ({
        body: {
          color: theme.dark ? 'rgba(255,255,255,0.88)' : 'rgba(15,23,42,0.88)',
          fontSize: 14,
          lineHeight: 21,
        },
        heading1: { color: theme.text },
        heading2: { color: theme.text },
        heading3: { color: theme.text },
        link: { color: theme.dark ? 'rgba(199,210,254,0.95)' : 'rgba(67,56,202,0.95)' },
        blockquote: {
          borderLeftColor: theme.dark ? 'rgba(255,255,255,0.14)' : 'rgba(148,163,184,0.45)',
          borderLeftWidth: 4,
          paddingLeft: 12,
          opacity: 0.95,
        },
        code_inline: {
          backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
          borderRadius: 8,
          paddingHorizontal: 6,
          paddingVertical: 2,
        },
      }) as any,
    [theme],
  );

  return (
    <SafeAreaView style={[tw`flex-1`, { backgroundColor: theme.bg }]}>
      <View style={[tw`px-3`, { paddingTop: (insets.top || 0) + NAV_SPACER_PX }]}>
        <Card theme={theme}>
          <View style={tw`flex-row items-center justify-between`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={[tw`text-[11px] tracking-widest font-semibold`, { color: theme.subtext }]}>
                LEARNER PORTAL
              </Text>
              <Text style={[tw`mt-1 text-xl font-bold`, { color: theme.text }]} numberOfLines={1}>
                News &amp; announcements
              </Text>
              <Text style={[tw`mt-1 text-xs`, { color: theme.subtext }]}>
                Tap <Text style={{ color: theme.text, fontWeight: '800' }}>PDF</Text> to download newsletters.
              </Text>
            </View>

            <Pressable
              onPress={goBackHeader}
              style={({ pressed }) => [
                tw`px-3 py-2 rounded-full border`,
                {
                  backgroundColor: theme.btn,
                  borderColor: theme.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[tw`text-xs font-semibold`, { color: theme.text }]}>← Back</Text>
            </Pressable>
          </View>
        </Card>

        <Card theme={theme} style={tw`mt-3`}>
          <View style={tw`flex-row items-center justify-between`}>
            <View
              style={[
                tw`flex-row p-1 rounded-full border`,
                { backgroundColor: theme.soft, borderColor: theme.border },
              ]}
            >
              <Pill
                theme={theme}
                label="Newsletters"
                active={tab === 'newsletters'}
                onPress={() => {
                  setTab('newsletters');
                  setMode('list');
                  setPdfError(null);
                }}
              />
              <View style={tw`w-2`} />
              <Pill
                theme={theme}
                label="Announcements"
                active={tab === 'announcements'}
                onPress={() => {
                  setTab('announcements');
                  setMode('list');
                  setPdfError(null);
                }}
              />
            </View>

            <Pressable
              onPress={refresh}
              style={({ pressed }) => [
                tw`px-3 py-2 rounded-full border`,
                {
                  backgroundColor: theme.btn,
                  borderColor: theme.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[tw`text-xs font-semibold`, { color: theme.text }]}>Refresh</Text>
            </Pressable>
          </View>

          <Text style={[tw`mt-2 text-sm`, { color: theme.subtext }]}>
            {tab === 'newsletters'
              ? 'Tap the PDF badge to download. Open in your PDF app or save to Files/Downloads.'
              : 'Announcements are quick notices. You can share them as text.'}
          </Text>
        </Card>
      </View>

      {mode === 'list' ? (
        <View style={[tw`flex-1 px-3 pt-3`, { paddingBottom: bottomPad }]}>
          <View style={tw`flex-row items-center justify-between mb-2`}>
            <Text style={[tw`text-sm font-semibold`, { color: theme.text }]}>{headerTitle}</Text>
            {(tab === 'newsletters' ? listNewslettersQ.isLoading : annFeedQ.isLoading) ? (
              <Text style={[tw`text-xs`, { color: theme.subtext }]}>Loading…</Text>
            ) : null}
          </View>

          {(tab === 'newsletters' && listNewslettersQ.isError) || (tab === 'announcements' && annFeedQ.isError) ? (
            <Card theme={theme}>
              <Text style={[tw`text-sm`, { color: theme.danger }]}>
                Could not load {tab}.{' '}
                <Text style={{ color: theme.subtext }}>{String(detailError?.message || detailError || '')}</Text>
              </Text>
            </Card>
          ) : listData.length === 0 ? (
            <Card theme={theme}>
              <Text style={[tw`text-sm`, { color: theme.subtext }]}>
                {tab === 'newsletters'
                  ? listNewslettersQ.isLoading
                    ? 'Loading newsletters…'
                    : 'No newsletters shared with you yet.'
                  : annFeedQ.isLoading
                    ? 'Loading announcements…'
                    : 'No announcements yet.'}
              </Text>
            </Card>
          ) : (
            <FlatList
              data={listData}
              keyExtractor={(it: any, idx) => String(it?.id ?? idx)}
              renderItem={renderListItem}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: bottomPad }}
            />
          )}
        </View>
      ) : (
        <View style={[tw`flex-1 px-3 pt-3`, { paddingBottom: bottomPad }]}>
          <Card theme={theme}>
            <View style={tw`flex-row items-start justify-between`}>
              <View style={tw`flex-1 pr-3`}>
                <Text style={[tw`text-lg font-bold`, { color: theme.text }]} numberOfLines={2}>
                  {detailTitle}
                </Text>
                {detailWhen ? (
                  <Text style={[tw`mt-1 text-xs`, { color: theme.subtext }]}>{fmtWhen(detailWhen)}</Text>
                ) : null}
              </View>

              <View style={tw`items-end`}>
                {canDownloadPdf ? (
                  <Pressable
                    onPress={() => selectedNewsletter && downloadNewsletterPdf(selectedNewsletter)}
                    disabled={downloadingPdfId === selectedNewsletter?.id}
                    style={({ pressed }) => [
                      tw`px-4 py-2 rounded-full border`,
                      {
                        backgroundColor: theme.btn,
                        borderColor: theme.border,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text style={[tw`text-xs font-semibold`, { color: theme.text }]}>
                      {downloadingPdfId === selectedNewsletter?.id ? 'Downloading…' : 'Download PDF'}
                    </Text>
                  </Pressable>
                ) : null}

                {tab === 'announcements' ? (
                  <Pressable
                    onPress={() => shareAnnouncementText(detailTitle, detailMd)}
                    style={({ pressed }) => [
                      tw`mt-2 px-3 py-2 rounded-full border`,
                      {
                        backgroundColor: theme.btn,
                        borderColor: theme.border,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text style={[tw`text-xs font-semibold`, { color: theme.text }]}>Share</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {pdfError && tab === 'newsletters' ? (
              <Text style={[tw`text-[11px] mt-3`, { color: theme.danger }]}>{pdfError}</Text>
            ) : null}
          </Card>

          <Card theme={theme} style={tw`mt-3 flex-1`}>
            {detailLoading ? (
              <View style={tw`py-6`}>
                <Text style={[tw`text-sm`, { color: theme.subtext }]}>Loading…</Text>
                <ActivityIndicator style={tw`mt-3`} color={theme.text} />
              </View>
            ) : detailError ? (
              <View style={tw`py-4`}>
                <Text style={[tw`text-sm`, { color: theme.danger }]}>
                  Could not load.{' '}
                  <Text style={{ color: theme.subtext }}>
                    {String(detailError?.message || detailError)}
                  </Text>
                </Text>
              </View>
            ) : tab === 'newsletters' && !selectedNewsletter ? (
              <Text style={[tw`text-sm`, { color: theme.subtext }]}>That newsletter is no longer available.</Text>
            ) : tab === 'announcements' && !selectedAnnouncement ? (
              <Text style={[tw`text-sm`, { color: theme.subtext }]}>That announcement is no longer available.</Text>
            ) : tab === 'newsletters' && canDownloadPdf ? (
              stripThemeFromContent(detailMd || '').trim() ? (
                <FlatList
                  data={[{ key: 'md' }]}
                  keyExtractor={(it) => it.key}
                  renderItem={() => (
                    <View>
                      <MarkdownDisplay style={mdStyles}>
                        {stripThemeFromContent(detailMd || '')}
                      </MarkdownDisplay>
                    </View>
                  )}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: bottomPad }}
                />
              ) : (
                <View style={tw`py-5`}>
                  <Text style={[tw`text-sm`, { color: theme.subtext }]}>
                    This newsletter is provided as a PDF. Tap{' '}
                    <Text style={{ color: theme.text, fontWeight: '800' }}>Download PDF</Text>.
                  </Text>
                </View>
              )
            ) : (
              <FlatList
                data={[{ key: 'md' }]}
                keyExtractor={(it) => it.key}
                renderItem={() => (
                  <View>
                    <MarkdownDisplay style={mdStyles}>
                      {stripThemeFromContent(detailMd || '')}
                    </MarkdownDisplay>
                  </View>
                )}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: bottomPad }}
              />
            )}
          </Card>
        </View>
      )}
    </SafeAreaView>
  );
}
