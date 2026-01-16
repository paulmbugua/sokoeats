// apps/mobile/src/pages/Results.native.tsx
/* eslint-disable no-console */
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  Linking,
  Alert,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemePref } from '../theme/ThemeContext';


import type { MainStackParamList } from '../navigation/types';
import { useShopContext } from '@mytutorapp/shared/context';
import PaymentWidget from '../screens/PaymentWidget.native';
import { useAICertificates, useAiCourseEntitlements } from '@mytutorapp/shared/hooks';
// ⛔️ keep shared api imports if you want elsewhere, but we won’t use them for native downloads
// import { downloadCertificateFile, downloadTranscriptFile } from '@mytutorapp/shared/api';

import tw from '../../tailwind';

type GradeLike = {
  scorePct: number;
  passMark: number;
  passed: boolean;
};

type Nav = StackNavigationProp<MainStackParamList>;
type ResultsRoute = RouteProp<MainStackParamList, 'Results'>;

/* -------------------------- DEBUG HELPERS -------------------------- */
const DEBUG_RESULTS = true;

function mkRid(prefix = 'results') {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}
function safeJson(x: any) {
  try {
    return JSON.parse(JSON.stringify(x));
  } catch {
    return String(x);
  }
}
function logR(tag: string, payload?: any) {
  if (!DEBUG_RESULTS) return;
  console.log(tag, payload ?? '');
}
function warnR(tag: string, payload?: any) {
  if (!DEBUG_RESULTS) return;
  console.warn(tag, payload ?? '');
}
function errR(tag: string, payload?: any) {
  if (!DEBUG_RESULTS) return;
  console.error(tag, payload ?? '');
}

/* -------------------------- SKU helpers -------------------------- */
function normStr(v: any) {
  return typeof v === 'string' ? v.trim() : '';
}
function lower(v: any) {
  return normStr(v).toLowerCase();
}
function skuCodeOf(sku: any) {
  return (
    normStr(sku?.code) ||
    normStr(sku?.skuCode) ||
    normStr(sku?.sku_code) ||
    normStr(sku?.product_code) ||
    normStr(sku?.sku) ||
    ''
  );
}
function priceTokensOf(sku: any) {
  return Number(sku?.price_tokens ?? sku?.priceTokens ?? sku?.price ?? sku?.tokens ?? 0) || 0;
}
function looksExtendedSku(sku: any) {
  const title = lower(sku?.title);
  const code = lower(sku?.code ?? sku?.skuCode ?? sku?.sku_code);
  const tier = lower(sku?.tier || sku?.plan || sku?.level || sku?.kind);
  const tags = Array.isArray(sku?.tags) ? sku.tags.map(lower) : [];
  return (
    tier.includes('extended') ||
    title.includes('extended') ||
    title.includes('transcript') ||
    /\b(ext|extended|xtra|plus)\b/.test(code) ||
    tags.includes('extended') ||
    tags.includes('transcript')
  );
}
function looksExtendedMeta(meta: any) {
  const title = lower(meta?.title || meta?.course_title || meta?.name);
  const code = lower(meta?.code || meta?.sku_code || meta?.tier_code);
  const tier = lower(meta?.tier || meta?.plan || meta?.level || meta?.kind);
  const tags = Array.isArray(meta?.tags) ? meta.tags.map(lower) : [];
  return (
    tier.includes('extended') ||
    title.includes('extended') ||
    title.includes('transcript') ||
    /\b(ext|extended|xtra|plus)\b/.test(code) ||
    tags.includes('extended') ||
    tags.includes('transcript')
  );
}

type DocLite =
  | { id: string; url: string; download_url?: string; meta?: any }
  | null;

type LibraryTab = 'certs' | 'transcripts' | 'all';

/* -------------------------- Preview helpers -------------------------- */
function buildDocPreviewUrl({
  docType,
  docId,
  pdfUrl,
  backendUrl,
}: {
  docType: 'certificates' | 'transcripts';
  docId?: string | null;
  pdfUrl?: string | null;
  backendUrl?: string | null;
}) {
  if (docId && backendUrl) {
    const base = backendUrl.replace(/\/+$/, '');
    return `${base}/api/${docType}/${encodeURIComponent(docId)}/og`;
  }

  if (!pdfUrl) return null;
  try {
    const u = new URL(pdfUrl);
    const parts = u.pathname.split('/upload/');
    if (parts.length < 2) return null;
    const left = parts[0];
    const right = parts.slice(1).join('/upload/');
    return `${u.origin}${left}/upload/pg_1/${right.replace(/\.pdf$/i, '.jpg')}`;
  } catch {
    return null;
  }
}

/* -------------------------- UI blocks (ProfileCard-like) -------------------------- */
function makePalette(isDark: boolean) {
  return {
    pageBg: isDark ? '#0b1220' : '#f3f4f6',
    cardBg: isDark ? '#0f1821' : '#ffffff',
    cardSoft: isDark ? '#0b1620' : '#f6f9fc',
    border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
    text: isDark ? '#ffffff' : '#0d141c',
    sub: isDark ? 'rgba(255,255,255,0.75)' : '#49739c',
    muted: isDark ? 'rgba(255,255,255,0.55)' : '#7a93ad',
    accent: '#3d99f5',
    good: '#10b981',
    warn: '#f59e0b',
    danger: '#ef4444',
  };
}

const Card: React.FC<{
  children: React.ReactNode;
  palette: ReturnType<typeof makePalette>;
  soft?: boolean;
  style?: any;
}> = ({ children, palette, soft, style }) => {
  return (
    <View
      style={[
        tw`rounded-2xl overflow-hidden`,
        {
          backgroundColor: soft ? palette.cardSoft : palette.cardBg,
          borderColor: palette.border,
          borderWidth: 1,
        },
        tw`shadow-lg`,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const Btn: React.FC<{
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  palette: ReturnType<typeof makePalette>;
  variant?: 'primary' | 'soft' | 'ghost';
  style?: any;
}> = ({ label, onPress, disabled, palette, variant = 'soft', style }) => {
  const bg =
    variant === 'primary'
      ? palette.accent
      : variant === 'ghost'
      ? 'transparent'
      : palette.cardSoft;

  const borderW = variant === 'ghost' ? 1 : 0;
  const textColor = variant === 'primary' ? '#fff' : palette.text;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
      style={({ pressed }) => [
        tw`h-10 px-4 rounded-xl items-center justify-center`,
        {
          backgroundColor: bg,
          borderWidth: borderW,
          borderColor: palette.border,
          opacity: disabled ? 0.55 : 1,
        },
        pressed && !disabled ? { transform: [{ scale: 0.98 }] } : null,
        style,
      ]}
    >
      <Text style={[tw`text-sm font-semibold`, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
};

const Pill: React.FC<{
  label: string;
  palette: ReturnType<typeof makePalette>;
  tone?: 'neutral' | 'good' | 'warn';
}> = ({ label, palette, tone = 'neutral' }) => {
  let bg = palette.cardSoft;
  let br = palette.border;
  let tx = palette.text;

  if (tone === 'good') {
    bg = 'rgba(16,185,129,0.12)';
    br = 'rgba(16,185,129,0.30)';
    tx = palette.text;
  } else if (tone === 'warn') {
    bg = 'rgba(245,158,11,0.14)';
    br = 'rgba(245,158,11,0.35)';
    tx = palette.text;
  }

  return (
    <View style={[tw`px-2 py-1 rounded-full`, { backgroundColor: bg, borderColor: br, borderWidth: 1 }]}>
      <Text style={[tw`text-[11px] font-semibold`, { color: tx }]}>{label}</Text>
    </View>
  );
};

function WatermarkPreview({
  title,
  pdfUrl,
  docId,
  backendUrl,
  docType,
  palette,
}: {
  title: string;
  pdfUrl?: string | null;
  docId?: string | null;
  backendUrl?: string;
  docType: 'certificates' | 'transcripts';
  palette: ReturnType<typeof makePalette>;
}) {
  const previewUrl = useMemo(
    () =>
      buildDocPreviewUrl({
        docType,
        docId: docId || null,
        pdfUrl: pdfUrl || null,
        backendUrl: backendUrl || null,
      }),
    [docId, backendUrl, docType, pdfUrl]
  );

  return (
    <Card palette={palette} style={tw`mb-3`}>
      <View style={tw`px-4 pt-4`}>
        <Text style={[tw`text-lg font-semibold`, { color: palette.text }]}>{title}</Text>
        <Text style={[tw`text-xs mt-1`, { color: palette.sub }]}>Preview (watermarked)</Text>
      </View>

      <View style={tw`mt-3 relative`}>
        <View
          style={[
            tw`aspect-[4/3] items-center justify-center`,
            { backgroundColor: palette.cardSoft, borderTopWidth: 1, borderColor: palette.border },
          ]}
        >
          {previewUrl ? (
            <Image
              source={{ uri: previewUrl }}
              accessibilityLabel={`${title} preview`}
              style={tw`w-full h-full`}
              resizeMode="contain"
            />
          ) : (
            <Text style={[tw`text-sm`, { color: palette.sub }]}>No preview available</Text>
          )}
        </View>

        <View pointerEvents="none" style={tw`absolute inset-0 items-center justify-center`}>
          <Text
            style={[
              tw`text-4xl font-black tracking-widest`,
              { color: palette.text, opacity: 0.12, transform: [{ rotate: '12deg' }] },
            ]}
          >
            PREVIEW
          </Text>
        </View>
      </View>

      <View style={tw`px-4 py-3`}>
        <Text style={[tw`text-xs`, { color: palette.sub }]}>
          Downloads are clean (no watermark) after certificate payment.
        </Text>
      </View>
    </Card>
  );
}

/* -------------------------- Native download helpers -------------------------- */
const DOCS_DIR = `${FileSystem.documentDirectory || ''}daybreak-docs/`;

function sanitizeFileName(name: string) {
  const base = String(name || 'document')
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base || 'document';
}

async function ensureDocsDir() {
  if (!FileSystem.documentDirectory) return null;
  try {
    const info = await FileSystem.getInfoAsync(DOCS_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(DOCS_DIR, { intermediates: true });
    }
    return DOCS_DIR;
  } catch {
    return null;
  }
}

const ResultsPage: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<ResultsRoute>();
    const insets = useSafeAreaInsets();
  const { resolvedScheme } = useThemePref();

  const isDark = resolvedScheme === 'dark';
  const palette = useMemo(() => makePalette(isDark), [isDark]);

  // Match HomePage behavior so content never hides behind footer/tab bar
  const FOOTER_OVERLAY_PX = 84;
  const bottomPad = Math.max(FOOTER_OVERLAY_PX, FOOTER_OVERLAY_PX + insets.bottom);


  const { backendUrl, token, refreshUserDetails } = useShopContext() as any;

  const ridRef = useRef<string>(mkRid());
  const rid = ridRef.current;

  const courseId: string | undefined = route.params?.courseId;
  const courseTitle: string | undefined = route.params?.courseTitle;
  const grade: GradeLike | undefined = route.params?.grade;

  const libraryView = !courseId;

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentOk, setPaymentOk] = useState(false);

  const [cert, setCert] = useState<DocLite>(null);
  const [trans, setTrans] = useState<DocLite>(null);

  const [allCerts, setAllCerts] = useState<any[]>([]);
  const [allTrans, setAllTrans] = useState<any[]>([]);

  const [docsLoading, setDocsLoading] = useState(false);
  const [certErr, setCertErr] = useState<any>(null);
  const [transErr, setTransErr] = useState<any>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(0);

  const [tab, setTab] = useState<LibraryTab>('certs');
  const [q, setQ] = useState('');

  const [genTransState, setGenTransState] = useState<{
    courseId?: string;
    loading: boolean;
    error?: any;
    last?: any;
  }>({ loading: false });

  const genOnceRef = useRef<Record<string, boolean>>({});

  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

const slugify = (s: string) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);

async function ensureDirAsync(dirUri: string) {
  if (!dirUri) return;
  const info = await FileSystem.getInfoAsync(dirUri);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
  }
}

const downloadAndSharePdf = useCallback(
  async ({
    kind,
    id,
    courseTitle,
    openPaymentOn402,
  }: {
    kind: 'cert' | 'trans';
    id: string;
    courseTitle?: string;
    openPaymentOn402: boolean;
  }) => {
    if (!backendUrl || !token) {
      Alert.alert('Sign in required', 'Please sign in again to download.');
      return;
    }
    if (!id) return;

    const base = String(backendUrl).replace(/\/+$/, '');
    const url =
      kind === 'cert'
        ? `${base}/api/certificates/${encodeURIComponent(id)}/download`
        : `${base}/api/transcripts/${encodeURIComponent(id)}/download`;

   const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
if (!baseDir) {
  Alert.alert('Storage unavailable', 'Could not access device storage.');
  return;
}
const dir = `${baseDir}daybreak-docs/`;

    await ensureDirAsync(dir);

    const niceTitle = slugify(courseTitle || (kind === 'cert' ? 'certificate' : 'transcript'));
    const fileUri = `${dir}${niceTitle}-${id.slice(0, 8)}.pdf`;

    const key = `${kind}:${id}`;
    setDownloadingKey(key);

    try {
      const res = await FileSystem.downloadAsync(url, fileUri, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // downloadAsync can still write a file for non-2xx; check status
      if (res.status < 200 || res.status >= 300) {
        let serverMsg = '';
        try {
          // error responses are usually small json/text; safe to read here
          const text = await FileSystem.readAsStringAsync(res.uri);
          try {
            const j = JSON.parse(text);
            serverMsg = j?.message || j?.error || '';
          } catch {
            serverMsg = text?.slice(0, 180) || '';
          }
        } catch {}

        // Clean up the bad file
        try {
          await FileSystem.deleteAsync(res.uri, { idempotent: true });
        } catch {}

        // ✅ Only open payment for CERTIFICATE when it's truly locked
        if (res.status === 402 && openPaymentOn402) {
          setPaymentOpen(true);
          return;
        }

        // Transcript is “free” in your UX → never force payment UI here
        Alert.alert(
          'Download unavailable',
          serverMsg || `Could not download (${res.status}).`
        );
        return;
      }

      // ✅ Share sheet = smooth UX on both iOS/Android
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(res.uri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: kind === 'cert' ? 'Share Certificate' : 'Share Transcript',
        });
      } else {
        // fallback: try open locally
        Linking.openURL(res.uri).catch(() => {});
      }
    } catch (e: any) {
      Alert.alert('Download failed', e?.message || 'Please try again.');
    } finally {
      setDownloadingKey((k) => (k === key ? null : k));
    }
  },
  [backendUrl, token]
);


  // downloads
  const [dl, setDl] = useState<{ kind: 'cert' | 'trans'; id: string } | null>(null);
  const isDownloading = useCallback(
    (kind: 'cert' | 'trans', id: string) => Boolean(dl && dl.kind === kind && dl.id === id),
    [dl]
  );

  useEffect(() => {
    logR('[Results][mount]', {
      rid,
      backendUrl,
      hasToken: Boolean(token),
      courseId,
      courseTitle,
      grade: grade ? { scorePct: grade.scorePct, passMark: grade.passMark, passed: grade.passed } : null,
      libraryView,
      isDark,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const api = useCallback(
    async function <T = any>(path: string, init?: RequestInit): Promise<T> {
      const base = String(backendUrl || '').replace(/\/+$/, '');
      const url = `${base}${path}`;
      const method = init?.method || 'GET';
      const started = Date.now();

      logR('[Results][api] ->', { rid, method, path, hasToken: Boolean(token) });

      const r = await fetch(url, {
        ...init,
        headers: {
          ...(init?.headers || {}),
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const ms = Date.now() - started;

      if (r.status === 204) {
        logR('[Results][api] <-', { rid, path, status: r.status, ok: r.ok, ms, note: '204 no content' });
        return null as any;
      }

      const raw = await r.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { __parseError: true, raw: raw?.slice(0, 500) };
      }

      logR('[Results][api] <-', {
        rid,
        path,
        status: r.status,
        ok: r.ok,
        ms,
        shape: Array.isArray(data) ? `array(len=${data.length})` : typeof data,
        sample: Array.isArray(data) ? data.slice(0, 1) : data,
      });

      if (!r.ok) {
        const e: any = new Error((data as any)?.error || (data as any)?.message || `Request failed: ${r.status}`);
        e.status = r.status;
        e.data = data;
        throw e;
      }
      return data as T;
    },
    [backendUrl, token, rid]
  );

  const openExternal = useCallback((url?: string | null) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  }, []);

  // ✅ Native: download + share (no auto-payment popup)
  const downloadPdfNative = useCallback(
    async ({
      kind,
      id,
      title,
      explicitUrl,
      onFailOfferUnlock,
    }: {
      kind: 'cert' | 'trans';
      id: string;
      title?: string;
      explicitUrl?: string | null;
      onFailOfferUnlock?: () => void;
    }) => {
      if (!backendUrl) {
        Alert.alert('Missing backend', 'Backend URL is not set.');
        return;
      }
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to download documents.');
        return;
      }
      if (!id) return;

      const base = String(backendUrl || '').replace(/\/+$/, '');
      const url =
        explicitUrl ||
        `${base}/api/${kind === 'cert' ? 'certificates' : 'transcripts'}/${encodeURIComponent(id)}/download`;

      const dir = await ensureDocsDir();
      const safeTitle = sanitizeFileName(title || (kind === 'cert' ? 'certificate' : 'transcript'));
      const fileName = `${safeTitle}-${id.slice(0, 8)}.pdf`;
      const fileUri = `${dir || FileSystem.cacheDirectory || FileSystem.documentDirectory}${fileName}`;

      setDl({ kind, id });

      try {
        logR('[Results][download] start', { rid, kind, id, url, fileUri });

        // Download into app storage with auth header (works with protected endpoints)
        const res = await FileSystem.downloadAsync(url, fileUri, {
          headers: token ? { Authorization: `Bearer ${token}`, Accept: 'application/pdf' } : undefined,
        });

        logR('[Results][download] ok', { rid, kind, id, status: (res as any)?.status, uri: res.uri });

        // Share sheet / open
        const canShare = await Sharing.isAvailableAsync().catch(() => false);
        if (canShare) {
          await Sharing.shareAsync(res.uri, {
            mimeType: 'application/pdf',
            dialogTitle: kind === 'cert' ? 'Share Certificate' : 'Share Transcript',
          });
        } else {
          // fallback: open file uri (some Android builds won’t open file:// reliably)
          if (Platform.OS === 'android') {
            Alert.alert(
              'Saved',
              `Saved to app storage as "${fileName}". Sharing is not available on this device.`,
            );
          } else {
            await Linking.openURL(res.uri).catch(() => {});
          }
        }
      } catch (e: any) {
        warnR('[Results][download] fail', { rid, kind, id, msg: e?.message, e: safeJson(e) });

        Alert.alert(
          'Download failed',
          'We could not download this PDF right now. If you have not unlocked downloads yet, use the “Pay certificate fee” button.',
          onFailOfferUnlock
            ? [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Unlock', onPress: onFailOfferUnlock },
              ]
            : [{ text: 'OK' }]
        );
      } finally {
        setDl(null);
      }
    },
    [backendUrl, token, rid]
  );

  const transByCourse = useMemo(() => {
    const m = new Map<string, any>();
    for (const t of allTrans || []) m.set(String(t.course_id), t);
    return m;
  }, [allTrans]);

  const fetchDocs = useCallback(
    async (source: string) => {
      if (!token) {
        warnR('[Results][docs] skip: no token', { rid, source });
        setAllCerts([]);
        setAllTrans([]);
        return;
      }

      setCertErr(null);
      setTransErr(null);

      logR('[Results][docs] fetch start', { rid, source });
      const t0 = Date.now();

      try {
        const cs = await api<any>(`/api/certificates/me`);
        const arr = Array.isArray(cs) ? cs : [];
        setAllCerts(arr);
      } catch (e: any) {
        setAllCerts([]);
        setCertErr({ status: e?.status, msg: e?.message, data: e?.data });
      }

      try {
        const ts = await api<any>(`/api/transcripts/me`);
        const arr = Array.isArray(ts) ? ts : [];
        setAllTrans(arr);
      } catch (e: any) {
        setAllTrans([]);
        setTransErr({ status: e?.status, msg: e?.message, data: e?.data });
      }

      setLastUpdatedAt(t0);
      logR('[Results][docs] fetch done', { rid, source, ms: Date.now() - t0 });
    },
    [api, rid, token]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchDocs('pull_to_refresh');
    } finally {
      setRefreshing(false);
    }
  }, [fetchDocs]);

  const generateTranscriptForCourse = useCallback(
    async (cid: string, source: string) => {
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to generate transcripts.');
        return;
      }
      if (!cid) return;

      const op = mkRid('genTrans');
      setGenTransState({ courseId: cid, loading: true, error: null, last: null });
      logR('[Results][genTrans] enter', { rid, op, cid, source });

      try {
        const resp = await api<any>(`/api/transcripts/generate`, {
          method: 'POST',
          body: JSON.stringify({ courseId: cid }),
        });

        await fetchDocs('gen_transcript_refresh');

        if (resp?.id && String(cid) === String(courseId)) {
          const base = String(backendUrl || '').replace(/\/+$/, '');
          setTrans({
            id: String(resp.id),
            url: resp.url,
            download_url: resp.download_url || `${base}/api/transcripts/${resp.id}/download`,
            meta: resp,
          });
        }

        setGenTransState({ courseId: cid, loading: false, error: null, last: resp });

        // ✅ don’t force-open payment or browser; user can click Download and get a nice file flow
        // if (resp?.download_url) openExternal(resp.download_url);
      } catch (e: any) {
        const payload = { status: e?.status, msg: e?.message, data: safeJson(e?.data) };
        errR('[Results][genTrans] fail', { rid, op, cid, source, ...payload });

        if (e?.status === 402 && e?.data?.error === 'EXTENDED_REQUIRED') {
          Alert.alert('Extended required', e?.data?.message || 'Transcript requires Extended certificate.');
        } else if (e?.status === 402) {
          Alert.alert('Payment required', e?.data?.message || e?.message || 'Payment required.');
          // keep this: generation can legitimately require unlock
          setPaymentOpen(true);
        } else {
          Alert.alert('Transcript', e?.data?.message || e?.message || 'Could not generate transcript.');
        }

        setGenTransState({ courseId: cid, loading: false, error: payload, last: null });
      }
    },
    [api, rid, token, backendUrl, courseId, fetchDocs]
  );

  // Fetch docs on mount when signed in
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!token) return;
      setDocsLoading(true);
      try {
        await fetchDocs('mount');
      } finally {
        if (alive) setDocsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchDocs, token]);

  // Pick selected course docs from lists
  useEffect(() => {
    if (!courseId) {
      setCert(null);
      setTrans(null);
      return;
    }

    const base = String(backendUrl || '').replace(/\/+$/, '');
    const cRaw = (allCerts || []).find((x) => String(x.course_id) === String(courseId));
    const tRaw = (allTrans || []).find((x) => String(x.course_id) === String(courseId));

    const certDl = cRaw?.id ? `${base}/api/certificates/${cRaw.id}/download` : undefined;
    const transDl = tRaw?.id ? `${base}/api/transcripts/${tRaw.id}/download` : undefined;

    setCert(cRaw ? { id: String(cRaw.id), url: cRaw.url, download_url: cRaw.download_url || certDl, meta: cRaw } : null);
    setTrans(tRaw ? { id: String(tRaw.id), url: tRaw.url, download_url: tRaw.download_url || transDl, meta: tRaw } : null);
  }, [courseId, allCerts, allTrans, backendUrl]);

  // Auto-generate transcript if cert looks extended
  useEffect(() => {
    if (!courseId) return;
    if (trans?.id) return;
    if (!cert?.id) return;

    const likelyExtended = looksExtendedMeta(cert?.meta || cert);
    if (!likelyExtended) return;

    if (genOnceRef.current[String(courseId)]) return;
    genOnceRef.current[String(courseId)] = true;

    generateTranscriptForCourse(String(courseId), 'auto_course_view');
  }, [courseId, cert?.id, trans?.id, generateTranscriptForCourse, cert]);

  const passed = Boolean(grade?.passed || cert?.id || trans?.id);

  // ✅ Payment status check (prevents “I already paid” confusion)
  const checkPaymentStatus = useCallback(async () => {
    if (!token || !backendUrl) {
      setPaymentOk(false);
      return;
    }

    if (!courseId) {
      // in library view, we don’t need to force “paid” globally
      setPaymentOk(false);
      return;
    }

    try {
      const s = await api<any>(`/api/certificates/status?courseId=${encodeURIComponent(courseId)}`).catch(() => null);
      if (s && typeof s.paid === 'boolean') {
        setPaymentOk(Boolean(s.paid));
        return;
      }
    } catch {}

    // fallback heuristic: if we have a download_url on selected docs, assume unlocked
    setPaymentOk(Boolean(cert?.download_url || trans?.download_url));
  }, [api, token, backendUrl, courseId, cert?.download_url, trans?.download_url]);

  useEffect(() => {
    checkPaymentStatus();
  }, [checkPaymentStatus]);

  const { skus, loading: aiCertLoading, error: aiCertError, message: aiCertMsg, claim, generate } =
    useAICertificates({ backendUrl, token: token || '', courseId });

  const { items: aiCourses = [] } = useAiCourseEntitlements({ backendUrl, token: token || '' });

  const query = q.trim().toLowerCase();
  const filteredCerts = useMemo(() => {
    const arr = Array.isArray(allCerts) ? allCerts : [];
    if (!query) return arr;
    return arr.filter((c) => {
      const t = String(c?.course_title || c?.title || '').toLowerCase();
      const id = String(c?.course_id || '').toLowerCase();
      return t.includes(query) || id.includes(query);
    });
  }, [allCerts, query]);

  const filteredTrans = useMemo(() => {
    const arr = Array.isArray(allTrans) ? allTrans : [];
    if (!query) return arr;
    return arr.filter((t) => {
      const title = String(t?.course_title || t?.title || '').toLowerCase();
      const id = String(t?.course_id || '').toLowerCase();
      return title.includes(query) || id.includes(query);
    });
  }, [allTrans, query]);

  const fmtUpdated = useMemo(() => {
    if (!lastUpdatedAt) return '—';
    const d = new Date(lastUpdatedAt);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  }, [lastUpdatedAt]);

  return (
     <SafeAreaView
    edges={['top', 'left', 'right']}
    style={[tw`flex-1`, { backgroundColor: palette.pageBg }]}
  >
    <ScrollView
      style={tw`flex-1 px-3 py-4`}
      contentContainerStyle={{ paddingBottom: bottomPad }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={isDark ? '#ffffff' : '#0d141c'} // iOS
          colors={[isDark ? '#ffffff' : '#0d141c']}   // Android
        />
      }
    >
        <View style={[tw`w-full self-center`, { maxWidth: 1100 }]}>
          {/* Header (ProfileCard-like gradient bar) */}
          <Card palette={palette} style={tw`mb-4`}>
            <LinearGradient
              colors={isDark ? ['rgba(0,0,0,0.55)', 'transparent'] : ['rgba(0,0,0,0.10)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={tw`px-4 py-4`}
            >
              <View style={tw`flex-row items-start justify-between`}>
                <View style={tw`flex-1 pr-2`}>
                  <Text style={[tw`text-xl font-semibold`, { color: palette.text }]}>
                    {libraryView ? 'My Documents' : 'Results & Documents'}
                  </Text>
                  <Text style={[tw`text-sm mt-1`, { color: palette.sub }]}>
                    {libraryView
                      ? 'Your AI certificates & transcripts'
                      : `${courseTitle ? courseTitle : 'Course'} • Your quiz results & downloads`}
                  </Text>
                </View>

                <Btn
                  palette={palette}
                  variant="ghost"
                  label={libraryView ? 'Back' : 'All docs'}
                  onPress={() => {
                    if (libraryView) navigation.goBack();
                    else navigation.navigate('Results' as any, {} as any);
                  }}
                  style={tw`px-3`}
                />
              </View>
            </LinearGradient>
          </Card>

          {/* ---------------------- LIBRARY VIEW ---------------------- */}
          {libraryView ? (
            <>
              {!token ? (
                <Card palette={palette} style={tw`p-4`}>
                  <Text style={[tw`text-base font-semibold`, { color: palette.text }]}>Sign in required</Text>
                  <Text style={[tw`text-sm mt-1`, { color: palette.sub }]}>
                    Please sign in to view your certificates and transcripts.
                  </Text>
                  <Btn
                    palette={palette}
                    variant="primary"
                    label="Sign in"
                    onPress={() => navigation.navigate('Login' as any, { reason: 'docs' } as any)}
                    style={tw`mt-3`}
                  />
                </Card>
              ) : (
                <>
                  {/* Overview */}
                  <Card palette={palette} soft style={tw`p-4`}>
                    <View style={tw`flex-row items-center justify-between`}>
                      <View style={tw`flex-1 pr-2`}>
                        <Text style={[tw`text-base font-semibold`, { color: palette.text }]}>Documents overview</Text>
                        <Text style={[tw`text-xs mt-1`, { color: palette.muted }]}>Updated: {fmtUpdated}</Text>
                      </View>

                      <Btn
                        palette={palette}
                        variant="soft"
                        label="Refresh"
                        onPress={async () => {
                          setDocsLoading(true);
                          try {
                            await fetchDocs('refresh_button');
                          } finally {
                            setDocsLoading(false);
                          }
                        }}
                        style={tw`px-3`}
                      />
                    </View>

                    <View style={tw`flex-row flex-wrap mt-3`}>
                      <View style={tw`mr-2 mb-2`}>
                        <Pill palette={palette} label={`Certificates: ${allCerts.length}`} />
                      </View>
                      <View style={tw`mr-2 mb-2`}>
                        <Pill palette={palette} label={`Transcripts: ${allTrans.length}`} />
                      </View>
                      {docsLoading ? (
                        <View style={tw`mr-2 mb-2`}>
                          <Pill palette={palette} label="Loading…" />
                        </View>
                      ) : null}
                      {certErr ? (
                        <View style={tw`mr-2 mb-2`}>
                          <Pill palette={palette} label={`Cert error ${certErr?.status || ''}`} tone="warn" />
                        </View>
                      ) : null}
                      {transErr ? (
                        <View style={tw`mr-2 mb-2`}>
                          <Pill palette={palette} label={`Trans error ${transErr?.status || ''}`} tone="warn" />
                        </View>
                      ) : null}
                    </View>

                    {/* Search */}
                    <View style={tw`mt-2`}>
                      <TextInput
                        value={q}
                        onChangeText={setQ}
                        placeholder="Search by course title…"
                        placeholderTextColor={palette.muted}
                        style={[
                          tw`h-12 rounded-xl px-3`,
                          { color: palette.text, backgroundColor: palette.cardBg, borderColor: palette.border, borderWidth: 1 },
                        ]}
                      />
                      <Text style={[tw`text-[11px] mt-1`, { color: palette.muted }]}>Tip: Search also matches courseId.</Text>
                    </View>

                    {/* Tabs */}
                    <View style={tw`flex-row mt-3`}>
                      {(['certs', 'transcripts', 'all'] as LibraryTab[]).map((t) => {
                        const active = tab === t;
                        const label = t === 'certs' ? 'Certificates' : t === 'transcripts' ? 'Transcripts' : 'All';
                        return (
                          <Pressable
                            key={t}
                            onPress={() => setTab(t)}
                            style={[
                              tw`flex-1 h-10 rounded-xl items-center justify-center mr-2`,
                              {
                                backgroundColor: active ? palette.cardBg : 'transparent',
                                borderColor: palette.border,
                                borderWidth: 1,
                              },
                              t === 'all' ? tw`mr-0` : null,
                            ]}
                          >
                            <Text style={[tw`text-sm font-semibold`, { color: palette.text }]}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Card>

                  {/* Certificates */}
                  {(tab === 'certs' || tab === 'all') && (
                    <View style={tw`mt-4`}>
                      <Text style={[tw`text-lg font-semibold`, { color: palette.text }]}>My Certificates</Text>

                      {filteredCerts.length === 0 ? (
                        <Card palette={palette} style={tw`p-4 mt-2`}>
                          <Text style={[tw`text-sm`, { color: palette.sub }]}>No certificates yet.</Text>
                        </Card>
                      ) : (
                        <View style={tw`mt-2`}>
                          {filteredCerts.map((c: any) => {
                            const cid = String(c.course_id);
                            const title = c.course_title || c.title || cid || 'Course';

                            const tRow = transByCourse.get(String(c.course_id));
                            const transcriptReady = Boolean(tRow && String(tRow.url || '').trim().length > 0);
                            const extended = looksExtendedMeta(c);

                            const previewUrl = buildDocPreviewUrl({
                              docType: 'certificates',
                              docId: c?.id ? String(c.id) : null,
                              pdfUrl: c?.url ? String(c.url) : null,
                              backendUrl: backendUrl || null,
                            });

                            const busy = genTransState.loading && String(genTransState.courseId) === cid;
                            const downloading = downloadingKey === `cert:${String(c.id)}`;

                            const transcriptLabel = transcriptReady
                              ? 'Download Transcript'
                              : busy
                              ? 'Generating…'
                              : 'Generate Transcript';

                            return (
                              <Card key={String(c.id)} palette={palette} style={tw`p-3 mt-3`}>
                                <View style={tw`flex-row`}>
                                  <View
                                    style={[
                                      tw`w-16 h-16 rounded-xl overflow-hidden items-center justify-center mr-3`,
                                      { backgroundColor: palette.cardSoft, borderColor: palette.border, borderWidth: 1 },
                                    ]}
                                  >
                                    {previewUrl ? (
                                      <Image source={{ uri: previewUrl }} style={tw`w-full h-full`} resizeMode="cover" />
                                    ) : (
                                      <Text style={[tw`text-[10px]`, { color: palette.muted }]}>Preview</Text>
                                    )}
                                  </View>

                                  <View style={tw`flex-1`}>
                                    <Text numberOfLines={1} style={[tw`font-semibold`, { color: palette.text }]}>
                                      {title}
                                    </Text>

                                    <View style={tw`flex-row flex-wrap mt-2`}>
                                      <View style={tw`mr-2 mb-2`}>
                                        <Pill palette={palette} label="Certificate" />
                                      </View>
                                      {extended ? (
                                        <View style={tw`mr-2 mb-2`}>
                                          <Pill palette={palette} label="Extended" tone="warn" />
                                        </View>
                                      ) : null}
                                      {transcriptReady ? (
                                        <View style={tw`mr-2 mb-2`}>
                                          <Pill palette={palette} label="Transcript ready" tone="good" />
                                        </View>
                                      ) : null}
                                    </View>
                                  </View>
                                </View>

                                <View style={tw`flex-row flex-wrap mt-3`}>
                                  <Btn
                                    palette={palette}
                                    variant="soft"
                                    label="Open"
                                    onPress={() =>
                                      navigation.navigate('Results' as any, { courseId: cid, courseTitle: title } as any)
                                    }
                                    style={tw`mr-2 mb-2`}
                                  />

                                  <Btn
                                    palette={palette}
                                    variant="soft"
                                    disabled={downloading}
                                    label={downloading ? 'Downloading…' : 'Download'}
                                    onPress={() =>
                                    downloadAndSharePdf({
                                      kind: 'cert',
                                      id: String(c.id),
                                      courseTitle: title,
                                      openPaymentOn402: false, // ✅ better UX: don’t pop payment here
                                    })
                                  }
                                                                      style={tw`mr-2 mb-2`}
                                  />

                                  <Btn
                                    palette={palette}
                                    variant={transcriptReady ? 'primary' : 'soft'}
                                    disabled={busy}
                                    label={transcriptLabel}
                                    onPress={async () => {
                                      if (transcriptReady && tRow?.id) {
                                        await downloadPdfNative({
                                          kind: 'trans',
                                          id: String(tRow.id),
                                          title: `${title}-transcript`,
                                          explicitUrl: tRow?.download_url || null,
                                          onFailOfferUnlock: () =>
                                            navigation.navigate('Results' as any, {
                                              courseId: cid,
                                              courseTitle: title,
                                            } as any),
                                        });
                                        return;
                                      }
                                      await generateTranscriptForCourse(cid, 'library_button');
                                    }}
                                    style={tw`mb-2`}
                                  />
                                </View>
                              </Card>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  )}

                  {/* Transcripts */}
                  {(tab === 'transcripts' || tab === 'all') && (
                    <View style={tw`mt-5`}>
                      <Text style={[tw`text-lg font-semibold`, { color: palette.text }]}>My Transcripts</Text>

                      {filteredTrans.length === 0 ? (
                        <Card palette={palette} style={tw`p-4 mt-2`}>
                          <Text style={[tw`text-sm`, { color: palette.sub }]}>No transcripts yet.</Text>
                        </Card>
                      ) : (
                        <View style={tw`mt-2`}>
                          {filteredTrans.map((t: any) => {
                            const cid = String(t.course_id);
                            const title = t.course_title || t.title || cid || 'Course';
                            const downloading = downloadingKey === `trans:${String(t.id)}`;

                            return (
                              <Card key={String(t.id)} palette={palette} style={tw`p-3 mt-3`}>
                                <Text numberOfLines={1} style={[tw`font-semibold`, { color: palette.text }]}>
                                  {title}
                                </Text>
                                <Text style={[tw`text-xs mt-1`, { color: palette.sub }]}>Transcript</Text>

                                <View style={tw`flex-row flex-wrap mt-3`}>
                                  <Btn
                                    palette={palette}
                                    variant="soft"
                                    label="Open"
                                    onPress={() =>
                                      navigation.navigate('Results' as any, { courseId: cid, courseTitle: title } as any)
                                    }
                                    style={tw`mr-2 mb-2`}
                                  />
                                  <Btn
                                    palette={palette}
                                    variant="primary"
                                    disabled={downloading}
                                    label={downloading ? 'Downloading…' : 'Download'}
                                    onPress={() =>
                                    downloadAndSharePdf({
                                      kind: 'trans',
                                      id: String(t.id),
                                      courseTitle: title,
                                      openPaymentOn402: false,
                                    })
                                  }
                                    style={tw`mb-2`}
                                  />
                                </View>
                              </Card>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  )}

                 
                </>
              )}
            </>
          ) : null}

          {/* ---------------------- COURSE VIEW ---------------------- */}
          {!libraryView ? (
            <>
              {/* Score */}
              <Card palette={palette} style={tw`p-4`}>
                <Text style={[tw`text-sm`, { color: palette.sub }]}>Score</Text>

                <View style={tw`mt-2`}>
                  <Text style={[tw`text-3xl font-semibold`, { color: palette.text }]}>
                    {grade ? `${grade.scorePct}%` : '—'}
                  </Text>

                  <View style={tw`mt-1 flex-row items-center`}>
                    <View style={tw`mr-2`}>
                      <Pill palette={palette} label="Pass Mark" />
                    </View>
                    <Text style={[tw`text-sm font-semibold`, { color: palette.text }]}>
                      {grade?.passMark ?? 70}%
                    </Text>

                    <View style={tw`ml-auto`}>
                      <Pill palette={palette} label={paymentOk ? 'Unlocked' : 'Locked'} tone={paymentOk ? 'good' : 'neutral'} />
                    </View>
                  </View>
                </View>

                <Text style={[tw`mt-3`, { color: palette.sub }]}>
                  {passed
                    ? 'You have documents available. You can download them anytime.'
                    : 'Review the lesson and try again to pass.'}
                </Text>
              </Card>

              {/* Previews */}
              <View style={tw`mt-4`}>
                <WatermarkPreview
                  title="Certificate"
                  pdfUrl={cert?.url || null}
                  docId={cert?.id || null}
                  backendUrl={backendUrl}
                  docType="certificates"
                  palette={palette}
                />
                <WatermarkPreview
                  title="Transcript"
                  pdfUrl={trans?.url || null}
                  docId={trans?.id || null}
                  backendUrl={backendUrl}
                  docType="transcripts"
                  palette={palette}
                />
              </View>

              {/* Purchased AI courses */}
              {aiCourses.length > 0 ? (
                <Card palette={palette} style={tw`p-4`}>
                  <Text style={[tw`text-lg font-semibold`, { color: palette.text }]}>Purchased AI courses</Text>
                  <Text style={[tw`text-sm mt-1`, { color: palette.sub }]}>
                    Certificate purchases unlock up to 60 lessons
                  </Text>

                  <View style={tw`mt-3`}>
                    {aiCourses.map((item: any) => {
                      const statusText = item.completion?.passed
                        ? 'Completed'
                        : item.completion?.attempted
                        ? 'In progress'
                        : 'Not started';

                      const cid = String(item.courseId || item.course_id);

                      return (
                        <Card key={String(item.course_id || cid)} palette={palette} soft style={tw`p-3 mt-3`}>
                          <View style={tw`flex-row items-center justify-between`}>
                            <View style={tw`flex-1 pr-2`}>
                              <Text numberOfLines={1} style={[tw`font-semibold`, { color: palette.text }]}>
                                {item.title}
                              </Text>
                              <Text style={[tw`text-xs mt-1`, { color: palette.sub }]}>
                                Lessons used {item.lessons_used}/{item.max_lessons || item.lesson_cap}
                              </Text>
                            </View>
                            <Pill palette={palette} label={statusText} />
                          </View>

                          <View style={tw`flex-row flex-wrap mt-3`}>
                            {!item.completion?.passed ? (
                              <Btn
                                palette={palette}
                                variant="soft"
                                label="Continue course"
                                onPress={() => navigation.navigate('CourseDetails' as any, { courseId: cid } as any)}
                                style={tw`mb-2`}
                              />
                            ) : (
                              <Btn
                                palette={palette}
                                variant="primary"
                                label="View certificate"
                                onPress={() =>
                                  navigation.navigate('Results' as any, {
                                    courseId: cid,
                                    courseTitle: item.title,
                                    grade: item.completion,
                                  } as any)
                                }
                                style={tw`mb-2`}
                              />
                            )}
                          </View>
                        </Card>
                      );
                    })}
                  </View>
                </Card>
              ) : null}

              {/* Downloads */}
              <Card palette={palette} style={tw`p-4 mt-4`}>
                <Text style={[tw`text-lg font-semibold`, { color: palette.text }]}>Downloads</Text>
                <Text style={[tw`text-sm mt-1`, { color: palette.sub }]}>
                  Pay the certificate fee once to download both the Certificate and Transcript without watermark.
                </Text>

                {/* Tokens-first */}
                <Card palette={palette} soft style={tw`p-3 mt-4`}>
                  <Text style={[tw`text-sm font-semibold`, { color: palette.text }]}>Claim with Tokens</Text>
                  <Text style={[tw`text-xs mt-1`, { color: palette.sub }]}>No processor fees for AI certificates.</Text>

                  {aiCertLoading ? <Text style={[tw`text-xs mt-2`, { color: palette.sub }]}>Loading…</Text> : null}
                  {aiCertError ? <Text style={[tw`text-xs mt-2`, { color: palette.danger }]}>{aiCertError}</Text> : null}
                  {aiCertMsg ? <Text style={[tw`text-xs mt-2`, { color: palette.good }]}>{aiCertMsg}</Text> : null}

                  <View style={tw`mt-3`}>
                    {(Array.isArray(skus) ? skus : []).map((sku: any) => {
                      const code = skuCodeOf(sku);
                      const price = priceTokensOf(sku);

                      return (
                        <Card key={code || sku?.title || String(Math.random())} palette={palette} soft style={tw`p-2 mt-2`}>
                          <View style={tw`flex-row items-center justify-between`}>
                            <View style={tw`flex-1 pr-2`}>
                              <Text numberOfLines={1} style={[tw`text-sm font-semibold`, { color: palette.text }]}>
                                {sku?.title || 'Certificate'}
                              </Text>
                              <Text numberOfLines={1} style={[tw`text-[11px] mt-0.5`, { color: palette.muted }]}>
                                {code || '—'}
                              </Text>
                            </View>

                            <View style={tw`flex-row items-center`}>
                              <View style={tw`mr-2`}>
                                <Pill palette={palette} label={`${price} Tokens`} />
                              </View>
                              <Btn
                                palette={palette}
                                variant="primary"
                                disabled={!passed}
                                label="Claim & Generate"
                                onPress={async () => {
                                  if (!token || !courseId) {
                                    Alert.alert('Sign in required', 'Please sign in to claim certificates.');
                                    return;
                                  }

                                  try {
                                    await claim(code);
                                    const doc: any = await generate();

                                    if (doc?.id) {
                                      const base = String(backendUrl || '').replace(/\/+$/, '');
                                      setCert({
                                        id: String(doc.id),
                                        url: doc.url,
                                        download_url: doc.download_url || `${base}/api/certificates/${doc.id}/download`,
                                        meta: doc,
                                      });

                                      await fetchDocs('post_claim_refresh');
                                      await checkPaymentStatus();

                                      if (looksExtendedSku(sku)) {
                                        try {
                                          const t: any = await api(`/api/transcripts/generate`, {
                                            method: 'POST',
                                            body: JSON.stringify({ courseId }),
                                          });

                                          if (t?.id) {
                                            setTrans({
                                              id: String(t.id),
                                              url: t.url,
                                              download_url: t.download_url || `${base}/api/transcripts/${t.id}/download`,
                                              meta: t,
                                            });
                                          }

                                          await fetchDocs('post_extended_trans_refresh');
                                        } catch (e: any) {
                                          if (e?.status === 402 && e?.data?.error === 'EXTENDED_REQUIRED') {
                                            Alert.alert(
                                              'Extended required',
                                              e?.data?.message || 'Transcript requires Extended certificate.'
                                            );
                                          }
                                        }
                                      }
                                    }
                                  } catch (e: any) {
                                    const msg = e?.data?.message || e?.message || 'Could not claim/generate.';
                                    Alert.alert('Claim failed', msg);
                                    if (e?.status === 402) setPaymentOpen(true);
                                  }
                                }}
                              />
                            </View>
                          </View>
                        </Card>
                      );
                    })}
                  </View>
                </Card>

                <View style={tw`mt-4`}>
                  <Btn
                    palette={palette}
                    variant="primary"
                    disabled={!passed}
                    label={paymentOk ? 'Certificate unlocked' : 'Pay certificate fee'}
                    onPress={() => setPaymentOpen(true)}
                    style={tw`mb-2`}
                  />

                                <Btn
                palette={palette}
                variant="soft"
                disabled={!cert?.id || downloadingKey === `cert:${cert?.id}`}
                label={downloadingKey === `cert:${cert?.id}` ? 'Downloading…' : 'Download Certificate (PDF)'}
                onPress={() => {
                  if (!cert?.id) return;
                  downloadAndSharePdf({
                    kind: 'cert',
                    id: cert.id,
                    courseTitle: courseTitle,
                    openPaymentOn402: true, // ✅ only here
                  });
                }}
                style={tw`mb-2`}
              />

              <Btn
                palette={palette}
                variant="soft"
                disabled={!trans?.id || downloadingKey === `trans:${trans?.id}`}
                label={downloadingKey === `trans:${trans?.id}` ? 'Downloading…' : 'Download Transcript (PDF)'}
                onPress={() => {
                  if (!trans?.id) {
                    Alert.alert('Transcript not ready', 'Generate it first (if available).');
                    return;
                  }
                  downloadAndSharePdf({
                    kind: 'trans',
                    id: trans.id,
                    courseTitle: courseTitle,
                    openPaymentOn402: false, // ✅ NEVER open payment for transcript download
                  });
                }}
              />
                  {!passed ? (
                    <Text style={[tw`text-[12px] mt-2`, { color: palette.sub }]}>
                      Tip: Revisit the lesson and retry the quiz to reach the pass mark.
                    </Text>
                  ) : null}
                </View>
              </Card>
            </>
          ) : null}
        </View>
      </ScrollView>

      <PaymentWidget
        isOpen={paymentOpen}
        title="Unlock Certificate"
        showTutorPreview={false}
        onClose={async () => {
          setPaymentOpen(false);

          try {
            await refreshUserDetails?.();
          } catch {}

          try {
            setDocsLoading(true);
            await fetchDocs('payment_close');
          } finally {
            setDocsLoading(false);
          }

          await checkPaymentStatus();
        }}
      />
      </SafeAreaView>
  );
};

export default ResultsPage;
