// apps/mobile/src/screens/org/OrgLearnerNewsletters.native.tsx
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  Share,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import Markdown from 'react-native-markdown-display';
import tw from 'twrnc';
import * as FileSystem from 'expo-file-system';
import { WebView } from 'react-native-webview';

import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { apiGetLearnerNewsletter, apiListLearnerNewsletters } from '@mytutorapp/shared/api/orgProApi';
import { getAnnouncementFeed } from '@mytutorapp/shared/api/orgEngagementApi';

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
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const isDark = useColorScheme() === 'dark';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        tw`px-4 py-2 rounded-full`,
        {
          backgroundColor: active
            ? isDark
              ? 'rgba(255,255,255,0.95)'
              : 'rgba(15,23,42,0.95)'
            : isDark
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(15,23,42,0.04)',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={[
          tw`text-xs font-semibold`,
          {
            color: active
              ? isDark
                ? '#0b1220'
                : '#ffffff'
              : isDark
                ? 'rgba(255,255,255,0.80)'
                : 'rgba(15,23,42,0.80)',
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Badge({ label, tone }: { label: string; tone?: 'slate' | 'amber' | 'indigo' | 'emerald' }) {
  const isDark = useColorScheme() === 'dark';

  const colors =
    tone === 'amber'
      ? {
          bg: isDark ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.10)',
          border: isDark ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.25)',
          text: isDark ? 'rgba(253,230,138,0.95)' : 'rgba(146,64,14,0.95)',
        }
      : tone === 'indigo'
        ? {
            bg: isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.10)',
            border: isDark ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.25)',
            text: isDark ? 'rgba(224,231,255,0.95)' : 'rgba(49,46,129,0.95)',
          }
        : tone === 'emerald'
          ? {
              bg: isDark ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.10)',
              border: isDark ? 'rgba(16,185,129,0.25)' : 'rgba(16,185,129,0.25)',
              text: isDark ? 'rgba(167,243,208,0.95)' : 'rgba(6,95,70,0.95)',
            }
          : {
              bg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)',
              border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(148,163,184,0.30)',
              text: isDark ? 'rgba(255,255,255,0.80)' : 'rgba(15,23,42,0.70)',
            };

  return (
    <View style={[tw`px-2 py-0.5 rounded-full mr-1`, { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }]}>
      <Text style={{ fontSize: 10, color: colors.text, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) {
  const isDark = useColorScheme() === 'dark';
  return (
    <View
      style={[
        tw`rounded-3xl p-4`,
        {
          backgroundColor: isDark ? '#0b1220' : 'rgba(255,255,255,0.92)',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(148,163,184,0.35)',
          shadowColor: '#000',
          shadowOpacity: isDark ? 0.25 : 0.08,
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
  // Some of your routes use /api/org/... and others /api/orgs/...
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
  const isDark = useColorScheme() === 'dark';
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const routeParams = (route?.params || {}) as any;

  const { org } = (useOrg?.() ?? {}) as any;
  const { backendUrl, orgToken } = useShopContext() as any;
  const orgId = org?.id ? String(org.id) : '';

  // state (mobile-friendly)
  const [tab, setTab] = React.useState<TabKey>((routeParams?.tab as TabKey) || 'newsletters');
  const [selectedNewsletterId, setSelectedNewsletterId] = React.useState<string | number | null>(
    routeParams?.id ?? null,
  );
  const [selectedAnnouncementId, setSelectedAnnouncementId] = React.useState<string | number | null>(
    routeParams?.aid ?? null,
  );

  // detail mode (list vs reader)
  const [mode, setMode] = React.useState<'list' | 'detail'>(
    routeParams?.id || routeParams?.aid ? 'detail' : 'list',
  );

  // Newsletter viewer state
  const [viewMode, setViewMode] = React.useState<'pdf' | 'text'>('pdf');
  const [pdfUri, setPdfUri] = React.useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = React.useState(false);
  const [pdfError, setPdfError] = React.useState<string | null>(null);

  const shellBg = isDark ? '#020617' : '#f8fafc';
  const textPrimary = isDark ? 'rgba(255,255,255,0.95)' : 'rgba(15,23,42,0.95)';
  const textSecondary = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(71,85,105,0.95)';

  // ─────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────
  const listNewslettersQ = useQuery<LearnerNewsletterListResponse, Error>({
    queryKey: ['learner-newsletters', orgId],
    enabled: !!backendUrl && !!orgToken && !!orgId,
    queryFn: async () =>
      (await apiListLearnerNewsletters(backendUrl, String(orgId), orgToken)) as LearnerNewsletterListResponse,
  });

  const newsletters = React.useMemo(() => listNewslettersQ.data?.items || [], [listNewslettersQ.data]);

  const annFeedQ = useQuery<AnnouncementFeedResponse, Error>({
    queryKey: ['learner-announcements-feed', orgId],
    enabled: !!orgToken && !!orgId,
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

  const mappedAnnouncements = React.useMemo(
    () => (annFeedQ.data?.items || []).map(mapAnnouncement),
    [annFeedQ.data],
  );

  const newsletterDetailQ = useQuery<LearnerNewsletter, Error>({
    queryKey: ['learner-newsletter', orgId, selectedNewsletterId],
    enabled: tab === 'newsletters' && !!backendUrl && !!orgToken && !!orgId && selectedNewsletterId != null,
    queryFn: async () =>
      (await apiGetLearnerNewsletter(
        backendUrl,
        String(orgId),
        String(selectedNewsletterId),
        orgToken,
      )) as LearnerNewsletter,
  });

  const selectedNewsletter = newsletterDetailQ.data || null;

  const selectedAnnouncement = React.useMemo(() => {
    if (selectedAnnouncementId == null) return null;
    return mappedAnnouncements.find((a: any) => String(a.id) === String(selectedAnnouncementId)) || null;
  }, [mappedAnnouncements, selectedAnnouncementId]);

  // If a newsletter has no pdf, auto-switch to text
  React.useEffect(() => {
    if (tab !== 'newsletters') return;
    if (!selectedNewsletter) return;
    if (!selectedNewsletter.has_pdf && viewMode === 'pdf') setViewMode('text');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedNewsletter?.id, selectedNewsletter?.has_pdf]);

  // Fetch PDF when needed (download with auth header to local cache)
  React.useEffect(() => {
    let alive = true;

    async function loadPdf() {
      if (tab !== 'newsletters') return;
      if (!backendUrl || !orgToken || !orgId) return;
      if (!selectedNewsletter?.id) return;

      setPdfError(null);

      if (!selectedNewsletter?.has_pdf || viewMode !== 'pdf') {
        setPdfLoading(false);
        setPdfError(null);
        return;
      }

      setPdfLoading(true);
      setPdfError(null);

      try {
        const safeId = String(selectedNewsletter.id).replace(/[^\w\d-_]+/g, '_');
        const dest = `${FileSystem.cacheDirectory}newsletter_${orgId}_${safeId}.pdf`;

        const r = await tryDownloadPdf({
          backendUrl,
          orgId,
          newsletterId: selectedNewsletter.id,
          token: orgToken,
          destUri: dest,
        });

        if (!alive) return;

        setPdfUri(r.uri);
      } catch (e: any) {
        if (!alive) return;
        setPdfUri(null);
        setPdfError(e?.message || 'Failed to load PDF');
      } finally {
        if (alive) setPdfLoading(false);
      }
    }

    loadPdf();
    return () => {
      alive = false;
    };
  }, [tab, backendUrl, orgToken, orgId, selectedNewsletter?.id, selectedNewsletter?.has_pdf, viewMode]);

  // ─────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────
  const goBackHeader = () => {
    if (mode === 'detail') {
      setMode('list');
      return;
    }
    navigation.goBack?.();
  };

  const refresh = () => {
    listNewslettersQ.refetch?.();
    annFeedQ.refetch?.();
    newsletterDetailQ.refetch?.();
  };

  const shareText = async (title: string, md: string) => {
    const body = stripThemeFromContent(md || '');
    const msg = `${title}\n\n${body}`.trim();
    try {
      await Share.share({ message: msg });
    } catch {
      // ignore
    }
  };

  const headerTitle = tab === 'newsletters' ? 'Newsletters' : 'Announcements';

  // ─────────────────────────────────────────────
  // UI bits
  // ─────────────────────────────────────────────
  const renderListItem = ({ item }: { item: any }) => {
    if (tab === 'newsletters') {
      const n = item as LearnerNewsletter;
      return (
        <Pressable
          onPress={() => {
            setSelectedNewsletterId(n.id);
            setMode('detail');
            setViewMode(n.has_pdf ? 'pdf' : 'text');
          }}
          style={({ pressed }) => [
            tw`rounded-2xl p-3 mb-2`,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(148,163,184,0.35)',
              opacity: pressed ? 0.88 : 1,
            },
          ]}
        >
          <View style={tw`flex-row items-start justify-between`}>
            <Text style={[tw`text-sm font-semibold flex-1 pr-2`, { color: textPrimary }]} numberOfLines={2}>
              {n.title || 'Untitled'}
            </Text>
            {n.has_pdf ? <Badge label="PDF" tone="slate" /> : null}
          </View>

          <Text style={[tw`text-xs mt-1`, { color: textSecondary }]}>
            {pickString(n.term_label) ? `${n.term_label} • ` : ''}
            {n.sent_at ? fmtDateOnly(n.sent_at) : ''}
          </Text>
        </Pressable>
      );
    }

    // announcements
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
          tw`rounded-2xl p-3 mb-2`,
          {
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(148,163,184,0.35)',
            opacity: pressed ? 0.88 : 1,
          },
        ]}
      >
        <View style={tw`flex-row items-start justify-between`}>
          <Text style={[tw`text-sm font-semibold flex-1 pr-2`, { color: textPrimary }]} numberOfLines={2}>
            {a.title}
          </Text>

          <View style={tw`flex-row flex-wrap justify-end`}>
            {a.pinned ? <Badge label="PINNED" tone="amber" /> : null}
            {showStatus ? <Badge label={st} tone="indigo" /> : null}
            {showCat ? <Badge label={cat} tone="slate" /> : null}
            {a.hasMeeting ? <Badge label="MEETING" tone="emerald" /> : null}
          </View>
        </View>

        <Text style={[tw`text-xs mt-1`, { color: textSecondary }]}>
          {a.classLabel ? `${a.classLabel} • ` : ''}
          {a.whenRaw ? fmtDateOnly(a.whenRaw) : ''}
          {a.audience && a.audience !== 'all' ? ` • ${String(a.audience).toUpperCase()}` : ''}
        </Text>

        {preview ? <Text style={[tw`text-xs mt-1`, { color: isDark ? 'rgba(255,255,255,0.75)' : 'rgba(15,23,42,0.75)' }]} numberOfLines={2}>{preview}</Text> : null}
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

  const canShowPdf = tab === 'newsletters' && !!selectedNewsletter?.has_pdf;

  // markdown theme
  const mdStyles = {
    body: { color: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.85)', fontSize: 14, lineHeight: 21 },
    heading1: { color: textPrimary },
    heading2: { color: textPrimary },
    heading3: { color: textPrimary },
    link: { color: isDark ? 'rgba(199,210,254,0.95)' : 'rgba(67,56,202,0.95)' },
    blockquote: {
      borderLeftColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(148,163,184,0.45)',
      borderLeftWidth: 4,
      paddingLeft: 12,
      opacity: 0.95,
    },
    code_inline: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
  } as any;

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <SafeAreaView style={[tw`flex-1`, { backgroundColor: shellBg }]}>
      <View style={tw`px-3 pt-2`}>
        <Card>
          <View style={tw`flex-row items-center justify-between`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={[tw`text-[11px] tracking-widest`, { color: textSecondary }]}>LEARNER PORTAL</Text>
              <Text style={[tw`mt-1 text-xl font-bold`, { color: textPrimary }]} numberOfLines={1}>
                News &amp; announcements
              </Text>
              <Text style={[tw`mt-1 text-xs`, { color: textSecondary }]}>
                Read newsletters and school announcements. Share anytime.
              </Text>
            </View>

            <Pressable
              onPress={goBackHeader}
              style={({ pressed }) => [
                tw`px-3 py-2 rounded-full`,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)',
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(148,163,184,0.35)',
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.85)' }}>
                ← Back
              </Text>
            </Pressable>
          </View>
        </Card>

        {/* Tabs */}
        <Card style={tw`mt-3`}>
          <View style={tw`flex-row items-center justify-between`}>
            <View
              style={[
                tw`flex-row p-1 rounded-full`,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)',
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(148,163,184,0.30)',
                },
              ]}
            >
              <Pill
                label="Newsletters"
                active={tab === 'newsletters'}
                onPress={() => {
                  setTab('newsletters');
                  setMode('list');
                }}
              />
              <View style={tw`w-2`} />
              <Pill
                label="Announcements"
                active={tab === 'announcements'}
                onPress={() => {
                  setTab('announcements');
                  setMode('list');
                }}
              />
            </View>

            <Pressable
              onPress={refresh}
              style={({ pressed }) => [
                tw`px-3 py-2 rounded-full`,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)',
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(148,163,184,0.35)',
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.85)' }}>
                Refresh
              </Text>
            </Pressable>
          </View>

          <Text style={[tw`mt-2 text-sm`, { color: textSecondary }]}>
            {tab === 'newsletters'
              ? 'Newsletters are longer school updates (often with PDF).'
              : 'Announcements are quick notices (urgent or time-sensitive).'}
          </Text>
        </Card>
      </View>

      {/* LIST or DETAIL */}
      {mode === 'list' ? (
        <View style={tw`flex-1 px-3 pt-3`}>
          <View style={tw`flex-row items-center justify-between mb-2`}>
            <Text style={[tw`text-sm font-semibold`, { color: textPrimary }]}>{headerTitle}</Text>
            {(tab === 'newsletters' ? listNewslettersQ.isLoading : annFeedQ.isLoading) ? (
              <Text style={[tw`text-xs`, { color: textSecondary }]}>Loading…</Text>
            ) : null}
          </View>

          {(tab === 'newsletters' && listNewslettersQ.isError) || (tab === 'announcements' && annFeedQ.isError) ? (
            <Card>
              <Text style={[tw`text-sm`, { color: isDark ? 'rgba(254,205,211,0.95)' : 'rgba(136,19,55,0.95)' }]}>
                Could not load {tab}.{' '}
                <Text style={{ color: textSecondary }}>{String(detailError?.message || detailError || '')}</Text>
              </Text>
            </Card>
          ) : listData.length === 0 ? (
            <Card>
              <Text style={[tw`text-sm`, { color: textSecondary }]}>
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
              contentContainerStyle={{ paddingBottom: 16 }}
            />
          )}
        </View>
      ) : (
        <View style={tw`flex-1 px-3 pt-3`}>
          <Card>
            <View style={tw`flex-row items-start justify-between`}>
              <View style={tw`flex-1 pr-3`}>
                <Text style={[tw`text-lg font-bold`, { color: textPrimary }]} numberOfLines={2}>
                  {detailTitle}
                </Text>
                {detailWhen ? (
                  <Text style={[tw`mt-1 text-xs`, { color: textSecondary }]}>{fmtWhen(detailWhen)}</Text>
                ) : null}
              </View>

              <View style={tw`items-end`}>
                {canShowPdf ? (
                  <View
                    style={[
                      tw`flex-row p-1 rounded-full`,
                      {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)',
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(148,163,184,0.30)',
                      },
                    ]}
                  >
                    <Pill label="PDF" active={viewMode === 'pdf'} onPress={() => setViewMode('pdf')} />
                    <View style={tw`w-2`} />
                    <Pill label="Text" active={viewMode === 'text'} onPress={() => setViewMode('text')} />
                  </View>
                ) : null}

                <Pressable
                  onPress={() => shareText(detailTitle, detailMd)}
                  style={({ pressed }) => [
                    tw`mt-2 px-3 py-2 rounded-full`,
                    {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)',
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(148,163,184,0.35)',
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.85)' }}>
                    Share
                  </Text>
                </Pressable>
              </View>
            </View>
          </Card>

          <Card style={tw`mt-3 flex-1`}>
            {detailLoading ? (
              <View style={tw`py-6`}>
                <Text style={[tw`text-sm`, { color: textSecondary }]}>Loading…</Text>
                <ActivityIndicator style={tw`mt-3`} />
              </View>
            ) : detailError ? (
              <View style={tw`py-4`}>
                <Text style={[tw`text-sm`, { color: isDark ? 'rgba(254,205,211,0.95)' : 'rgba(136,19,55,0.95)' }]}>
                  Could not load. <Text style={{ color: textSecondary }}>{String(detailError?.message || detailError)}</Text>
                </Text>
              </View>
            ) : tab === 'newsletters' && !selectedNewsletter ? (
              <Text style={[tw`text-sm`, { color: textSecondary }]}>That newsletter is no longer available.</Text>
            ) : tab === 'announcements' && !selectedAnnouncement ? (
              <Text style={[tw`text-sm`, { color: textSecondary }]}>That announcement is no longer available.</Text>
            ) : canShowPdf && viewMode === 'pdf' ? (
              pdfLoading ? (
                <View style={tw`py-6`}>
                  <Text style={[tw`text-sm`, { color: textSecondary }]}>Loading PDF…</Text>
                  <ActivityIndicator style={tw`mt-3`} />
                </View>
              ) : pdfError ? (
                <View style={tw`py-4`}>
                  <Text style={[tw`text-sm`, { color: isDark ? 'rgba(254,205,211,0.95)' : 'rgba(136,19,55,0.95)' }]}>
                    {pdfError}
                  </Text>

                  <View style={tw`mt-3 flex-row`}>
                    <Pressable
                      onPress={() => {
                        setPdfError(null);
                        setViewMode('pdf'); // trigger effect again
                      }}
                      style={({ pressed }) => [
                        tw`px-3 py-2 rounded-full mr-2`,
                        {
                          backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)',
                          borderWidth: 1,
                          borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(148,163,184,0.35)',
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.85)' }}>
                        Retry
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => setViewMode('text')}
                      style={({ pressed }) => [
                        tw`px-3 py-2 rounded-full`,
                        {
                          backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)',
                          borderWidth: 1,
                          borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(148,163,184,0.35)',
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.85)' }}>
                        Open as text
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : pdfUri ? (
                <View style={tw`flex-1 rounded-2xl overflow-hidden`}>
                  <WebView
                    source={{ uri: pdfUri }}
                    originWhitelist={['*']}
                    style={tw`flex-1`}
                    // Android needs this for file://
                    allowFileAccess={true}
                    allowFileAccessFromFileURLs={true}
                    allowUniversalAccessFromFileURLs={true}
                    // small safety
                    javaScriptEnabled={true}
                    // If your Android WebView still can’t render PDF, you’ll still have the Text tab as fallback.
                  />
                </View>
              ) : (
                <Text style={[tw`text-sm`, { color: textSecondary }]}>PDF not available.</Text>
              )
            ) : (
              <View style={tw`flex-1`}>
                <Markdown style={mdStyles}>{stripThemeFromContent(detailMd || '')}</Markdown>
              </View>
            )}
          </Card>
        </View>
      )}
    </SafeAreaView>
  );
}
