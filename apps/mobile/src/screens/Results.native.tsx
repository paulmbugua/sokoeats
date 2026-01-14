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
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { MainStackParamList } from '../navigation/types';

import { useShopContext } from '@mytutorapp/shared/context';
import PaymentWidget from '../screens/PaymentWidget.native';
import { useAICertificates, useAiCourseEntitlements } from '@mytutorapp/shared/hooks';
import { downloadCertificateFile, downloadTranscriptFile } from '@mytutorapp/shared/api';

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

/* -------------------------- Preview card -------------------------- */
function WatermarkPreview({
  title,
  pdfUrl,
  docId,
  backendUrl,
  docType,
}: {
  title: string;
  pdfUrl?: string | null;
  docId?: string | null;
  backendUrl?: string;
  docType: 'certificates' | 'transcripts';
}) {
  const previewUrl = useMemo(() => {
    // Prefer backend OG preview if we have an id (brand-aware if your backend supports it)
    if (docId && backendUrl) {
      const base = backendUrl.replace(/\/+$/, '');
      return `${base}/api/${docType}/${encodeURIComponent(docId)}/og`;
    }

    // Fallback: if PDF is Cloudinary, convert page 1 to JPG
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
  }, [docId, backendUrl, docType, pdfUrl]);

  return (
    <View className="relative rounded-2xl overflow-hidden bg-white/5 border border-white/10">
      <View className="px-3 pt-3">
        <Text className="text-white font-semibold">{title}</Text>
        <Text className="text-white/60 text-xs mb-2">Preview (watermarked)</Text>
      </View>

      <View className="relative">
        <View className="aspect-[4/3] bg-black/30 items-center justify-center">
          {previewUrl ? (
            <Image
              source={{ uri: previewUrl }}
              accessibilityLabel={`${title} preview`}
              className="w-full h-full"
              resizeMode="contain"
            />
          ) : (
            <Text className="text-white/60 text-sm">No preview available</Text>
          )}
        </View>

        {/* Watermark overlay */}
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <Text
            className="text-white/15 font-black tracking-widest text-4xl"
            style={{ transform: [{ rotate: '12deg' }] }}
          >
            PREVIEW
          </Text>
        </View>
      </View>

      <View className="px-3 pb-3">
        <Text className="text-white/60 text-xs">
          Downloads are clean (no watermark) after certificate payment.
        </Text>
      </View>
    </View>
  );
}

type DocLite = { id: string; url: string; download_url?: string; meta?: any } | null;

const ResultsPage: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<ResultsRoute>();

  const { backendUrl, token, refreshUserDetails } = useShopContext() as any;

  // Correlation id for this page instance
  const ridRef = useRef<string>(mkRid());
  const rid = ridRef.current;

  // Route params (mobile)
  const courseId: string | undefined = route.params?.courseId;
  const courseTitle: string | undefined = route.params?.courseTitle;
  const grade: GradeLike | undefined = route.params?.grade;

  // ✅ Library view when no courseId
  const libraryView = !courseId;

  const [paymentOpen, setPaymentOpen] = useState(false);

  const [cert, setCert] = useState<DocLite>(null);
  const [trans, setTrans] = useState<DocLite>(null);

  // ✅ New: all docs (always fetched when token exists)
  const [allCerts, setAllCerts] = useState<any[]>([]);
  const [allTrans, setAllTrans] = useState<any[]>([]);

  // ✅ Debugging fetch status
  const [docsLoading, setDocsLoading] = useState(false);
  const [certErr, setCertErr] = useState<any>(null);
  const [transErr, setTransErr] = useState<any>(null);

  // Transcript generation state (library button)
  const [genTransState, setGenTransState] = useState<{
    courseId?: string;
    loading: boolean;
    error?: any;
    last?: any;
  }>({ loading: false });

  const genOnceRef = useRef<Record<string, boolean>>({});

  // Mount log
  useEffect(() => {
    logR('[Results][mount]', {
      rid,
      backendUrl,
      hasToken: Boolean(token),
      tokenLen: token ? String(token).length : 0,
      courseId,
      courseTitle,
      grade: grade
        ? { scorePct: grade.scorePct, passMark: grade.passMark, passed: grade.passed }
        : null,
      libraryView,
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
    if (!url) {
      setPaymentOpen(true);
      return;
    }
    Linking.openURL(url).catch(() => {});
  }, []);

  const transByCourse = useMemo(() => {
    const m = new Map<string, any>();
    for (const t of allTrans || []) m.set(String(t.course_id), t);
    return m;
  }, [allTrans]);

  const generateTranscriptForCourse = useCallback(
    async (cid: string, source: string) => {
      if (!token) {
        warnR('[Results][genTrans] no token', { rid, cid, source });
        Alert.alert('Sign in required', 'Please sign in to generate transcripts.');
        return;
      }
      if (!cid) {
        warnR('[Results][genTrans] missing courseId', { rid, cid, source });
        return;
      }

      const op = mkRid('genTrans');
      setGenTransState({ courseId: cid, loading: true, error: null, last: null });
      logR('[Results][genTrans] enter', { rid, op, cid, source });

      try {
        const resp = await api<any>(`/api/transcripts/generate`, {
          method: 'POST',
          body: JSON.stringify({ courseId: cid }),
        });

        logR('[Results][genTrans] ok', { rid, op, resp: safeJson(resp) });

        // refresh transcript list
        const ts = await api<any>(`/api/transcripts/me`);
        const arr = Array.isArray(ts) ? ts : [];
        setAllTrans(arr);

        // if viewing this course, set the selected transcript
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

        // If server returned direct download_url, open it (native equivalent of web redirect)
        if (resp?.download_url) {
          openExternal(resp.download_url);
        }
      } catch (e: any) {
        const payload = { status: e?.status, msg: e?.message, data: safeJson(e?.data) };
        errR('[Results][genTrans] fail', { rid, op, cid, source, ...payload });

        if (e?.status === 402 && e?.data?.error === 'EXTENDED_REQUIRED') {
          Alert.alert(
            'Extended required',
            e?.data?.message || 'Transcript requires Extended certificate.'
          );
        } else if (e?.status === 402) {
          Alert.alert('Payment required', e?.data?.message || e?.message || 'Payment required.');
          setPaymentOpen(true);
        } else {
          Alert.alert('Transcript', e?.data?.message || e?.message || 'Could not generate transcript.');
        }

        setGenTransState({ courseId: cid, loading: false, error: payload, last: null });
      }
    },
    [api, rid, token, backendUrl, courseId, openExternal]
  );

  // ✅ Fetch all certificates + transcripts (always available on this page)
  useEffect(() => {
    let abort = false;

    (async () => {
      if (!token) {
        warnR('[Results][docs] skip: no token', { rid });
        setAllCerts([]);
        setAllTrans([]);
        return;
      }

      setDocsLoading(true);
      setCertErr(null);
      setTransErr(null);
      logR('[Results][docs] fetch start', { rid });

      try {
        const cs = await api<any>(`/api/certificates/me`);
        const arr = Array.isArray(cs) ? cs : [];
        if (!abort) setAllCerts(arr);
        logR('[Results][docs] certs ok', {
          rid,
          count: arr.length,
          ids: arr.slice(0, 5).map((x: any) => x?.id),
          sample: arr.slice(0, 1),
        });
      } catch (e: any) {
        if (!abort) setAllCerts([]);
        if (!abort) setCertErr({ status: e?.status, msg: e?.message, data: e?.data });
        warnR('[Results][docs] certs fail', { rid, status: e?.status, msg: e?.message, data: safeJson(e?.data) });
      }

      try {
        const ts = await api<any>(`/api/transcripts/me`);
        const arr = Array.isArray(ts) ? ts : [];
        if (!abort) setAllTrans(arr);
        logR('[Results][docs] transcripts ok', {
          rid,
          count: arr.length,
          ids: arr.slice(0, 5).map((x: any) => x?.id),
          sample: arr.slice(0, 1),
        });
      } catch (e: any) {
        if (!abort) setAllTrans([]);
        if (!abort) setTransErr({ status: e?.status, msg: e?.message, data: e?.data });
        warnR('[Results][docs] transcripts fail', { rid, status: e?.status, msg: e?.message, data: safeJson(e?.data) });
      }

      if (!abort) {
        setDocsLoading(false);
        logR('[Results][docs] fetch done', { rid });
      }
    })();

    return () => {
      abort = true;
      logR('[Results][docs] abort', { rid });
    };
  }, [api, token, rid]);

  // ✅ When courseId changes, pick matching cert/trans from the "all docs" lists
  useEffect(() => {
    logR('[Results][pick] start', {
      rid,
      courseId,
      allCertsLen: allCerts.length,
      allTransLen: allTrans.length,
    });

    if (!courseId) {
      setCert(null);
      setTrans(null);
      logR('[Results][pick] no courseId -> reset', { rid });
      return;
    }

    const base = String(backendUrl || '').replace(/\/+$/, '');
    const cRaw = (allCerts || []).find((x) => String(x.course_id) === String(courseId));
    const tRaw = (allTrans || []).find((x) => String(x.course_id) === String(courseId));

    const certDl = cRaw?.id ? `${base}/api/certificates/${cRaw.id}/download` : undefined;
    const transDl = tRaw?.id ? `${base}/api/transcripts/${tRaw.id}/download` : undefined;

    const nextCert = cRaw
      ? { id: String(cRaw.id), url: cRaw.url, download_url: cRaw.download_url || certDl, meta: cRaw }
      : null;

    const nextTrans = tRaw
      ? { id: String(tRaw.id), url: tRaw.url, download_url: tRaw.download_url || transDl, meta: tRaw }
      : null;

    setCert(nextCert);
    setTrans(nextTrans);

    logR('[Results][pick] chosen', {
      rid,
      courseId,
      certFound: Boolean(nextCert?.id),
      transFound: Boolean(nextTrans?.id),
      certId: nextCert?.id,
      transId: nextTrans?.id,
    });
  }, [courseId, allCerts, allTrans, backendUrl, rid]);

  // ✅ Auto-attempt transcript generation if cert looks Extended (once per course)
  useEffect(() => {
    if (!courseId) return;
    if (trans?.id) return;
    if (!cert?.id) {
      logR('[Results][autoGen] skip: no cert selected', { rid, courseId });
      return;
    }

    const likelyExtended = looksExtendedMeta(cert?.meta || cert);
    logR('[Results][autoGen] check', {
      rid,
      courseId,
      certId: cert.id,
      likelyExtended,
    });

    if (!likelyExtended) return;
    if (genOnceRef.current[String(courseId)]) {
      logR('[Results][autoGen] already attempted', { rid, courseId });
      return;
    }

    genOnceRef.current[String(courseId)] = true;
    generateTranscriptForCourse(String(courseId), 'auto_course_view');
  }, [courseId, cert?.id, trans?.id, rid, generateTranscriptForCourse, cert]);

  // ✅ If user already has docs, treat as passed so UI doesn’t lock when opened via library
  const passed = Boolean(grade?.passed || cert?.id || trans?.id);

  // 🔗 Tokens-first hook
  const {
    skus,
    loading: aiCertLoading,
    error: aiCertError,
    message: aiCertMsg,
    claim,
    generate,
  } = useAICertificates({ backendUrl, token: token || '', courseId });

  const { items: aiCourses = [] } = useAiCourseEntitlements({
    backendUrl,
    token: token || '',
  });

  // Log exact reason for "No transcripts yet" (library view)
  useEffect(() => {
    if (!libraryView) return;

    const reason =
      !token
        ? 'no_token'
        : docsLoading
        ? 'loading'
        : transErr
        ? `error:${transErr?.status || 'unknown'}`
        : Array.isArray(allTrans) && allTrans.length === 0
        ? 'empty_array'
        : 'has_items';

    logR('[Results][library] transcripts_state', {
      rid,
      token: Boolean(token),
      docsLoading,
      transErr,
      allTransLen: allTrans?.length,
      reason,
      sample: (allTrans || []).slice(0, 1),
    });
  }, [libraryView, token, docsLoading, transErr, allTrans, rid]);

  return (
    <View className="flex-1 bg-[#0b1220]">
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} className="px-3 py-4">
        <View className="max-w-[1100px] w-full self-center space-y-4">
          {/* Header */}
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="text-white font-bold text-xl">
                {libraryView ? 'My Documents' : 'Results & Documents'}
              </Text>
              <Text className="text-white/70 text-sm">
                {libraryView
                  ? 'Your AI certificates & transcripts'
                  : `${courseTitle ? courseTitle : 'Course'} • Your quiz results & downloads`}
              </Text>
            </View>

            <Pressable
              onPress={() => {
                if (libraryView) navigation.goBack();
                else navigation.navigate('Results' as any, {} as any);
              }}
              className="rounded-xl px-3 py-2 bg-white/10"
            >
              <Text className="text-white text-sm">{libraryView ? 'Back' : 'All documents'}</Text>
            </Pressable>
          </View>

          {/* ✅ Library view */}
          {libraryView ? (
            <View className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
              {!token ? (
                <View className="rounded-xl bg-black/20 ring-1 ring-white/10 p-3">
                  <Text className="text-white font-semibold">Sign in required</Text>
                  <Text className="text-white/70 text-sm mt-1">
                    Please sign in to view your certificates and transcripts.
                  </Text>
                  <View className="mt-3 flex-row gap-2">
                    <Pressable
                      onPress={() => navigation.navigate('Login' as any, { reason: 'docs' } as any)}
                      className="h-10 px-4 rounded-lg justify-center bg-indigo-600"
                    >
                      <Text className="text-white text-sm font-semibold">Sign in</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <>
                  {docsLoading ? (
                    <View className="flex-row items-center gap-2">
                      <ActivityIndicator />
                      <Text className="text-white/70 text-sm">Loading documents…</Text>
                    </View>
                  ) : null}

                  {/* Certificates */}
                  <View className="space-y-2">
                    <Text className="text-white font-semibold">My Certificates</Text>
                    {allCerts.length === 0 ? (
                      <Text className="text-white/60 text-sm">No certificates yet.</Text>
                    ) : (
                      <View className="space-y-2">
                        {(allCerts || []).map((c: any) => {
                          const hasTranscript = Boolean(transByCourse.get(String(c.course_id)));
                          const cid = String(c.course_id);
                          const title = c.course_title || c.title || cid || 'Course';

                          return (
                            <View
                              key={String(c.id)}
                              className="rounded-xl bg-black/20 ring-1 ring-white/10 p-3 space-y-2"
                            >
                              <Text className="text-white font-semibold" numberOfLines={1}>
                                {title}
                              </Text>
                              <Text className="text-white/60 text-xs">Certificate</Text>

                              <View className="flex-row flex-wrap gap-2">
                                <Pressable
                                  onPress={() =>
                                    navigation.navigate('Results' as any, {
                                      courseId: cid,
                                      courseTitle: title,
                                    } as any)
                                  }
                                  className="px-3 py-2 rounded-lg bg-white/10"
                                >
                                  <Text className="text-white text-sm">Open</Text>
                                </Pressable>

                                <Pressable
                                  onPress={async () => {
                                    try {
                                      await downloadCertificateFile(backendUrl, token || '', String(c.id));
                                    } catch (e: any) {
                                      warnR('[Results][lib][download cert] fail', { rid, msg: e?.message });
                                      setPaymentOpen(true);
                                    }
                                  }}
                                  className="px-3 py-2 rounded-lg bg-white/10"
                                >
                                  <Text className="text-white text-sm">Download</Text>
                                </Pressable>

                                <Pressable
                                  onPress={() => generateTranscriptForCourse(cid, 'library_button')}
                                  disabled={hasTranscript || genTransState.loading}
                                  className={`px-3 py-2 rounded-lg ${
                                    hasTranscript
                                      ? 'bg-white/5 ring-1 ring-white/10'
                                      : 'bg-white/10'
                                  }`}
                                >
                                  <Text className="text-white text-sm">
                                    {hasTranscript
                                      ? 'Transcript Ready'
                                      : genTransState.loading
                                      ? 'Generating…'
                                      : 'Generate Transcript'}
                                  </Text>
                                </Pressable>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>

                  {/* Transcripts */}
                  <View className="space-y-2">
                    <Text className="text-white font-semibold">My Transcripts</Text>
                    {allTrans.length === 0 ? (
                      <Text className="text-white/60 text-sm">No transcripts yet.</Text>
                    ) : (
                      <View className="space-y-2">
                        {(allTrans || []).map((t: any) => {
                          const cid = String(t.course_id);
                          const title = t.course_title || t.title || cid || 'Course';
                          return (
                            <View
                              key={String(t.id)}
                              className="rounded-xl bg-black/20 ring-1 ring-white/10 p-3 space-y-2"
                            >
                              <Text className="text-white font-semibold" numberOfLines={1}>
                                {title}
                              </Text>
                              <Text className="text-white/60 text-xs">Transcript</Text>

                              <View className="flex-row flex-wrap gap-2">
                                <Pressable
                                  onPress={() =>
                                    navigation.navigate('Results' as any, {
                                      courseId: cid,
                                      courseTitle: title,
                                    } as any)
                                  }
                                  className="px-3 py-2 rounded-lg bg-white/10"
                                >
                                  <Text className="text-white text-sm">Open</Text>
                                </Pressable>

                                <Pressable
                                  onPress={async () => {
                                    try {
                                      await downloadTranscriptFile(backendUrl, token || '', String(t.id));
                                    } catch (e: any) {
                                      warnR('[Results][lib][download trans] fail', { rid, msg: e?.message });
                                      setPaymentOpen(true);
                                    }
                                  }}
                                  className="px-3 py-2 rounded-lg bg-white/10"
                                >
                                  <Text className="text-white text-sm">Download</Text>
                                </Pressable>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>

                  {DEBUG_RESULTS ? (
                    <View className="pt-2 border-t border-white/10">
                      <Text className="text-[11px] text-white/40">
                        debug rid={rid} loading={String(docsLoading)} certErr={certErr?.status || '—'} transErr={transErr?.status || '—'}
                      </Text>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          ) : null}

          {/* ✅ Course-specific view */}
          {!libraryView ? (
            <>
              {/* Score card */}
              <View
                className={`rounded-2xl p-4 ${
                  passed ? 'bg-emerald-500/10' : 'bg-red-500/10'
                } ${passed ? 'ring-emerald-500/40' : 'ring-red-500/40'} ring-1`}
              >
                <Text className="text-white/80 text-sm">Score</Text>
                <Text className="text-2xl font-semibold text-white">
                  {grade ? `${grade.scorePct}%` : '—'}
                  <Text className="text-white/60 text-sm"> (Pass mark {grade?.passMark ?? 70}%)</Text>
                </Text>
                <Text className="mt-1 text-white/70">
                  {passed
                    ? 'You have documents available. You can download them anytime.'
                    : 'Review the lesson and try again to pass.'}
                </Text>
              </View>

              {/* Previews */}
              <View className="gap-4">
                <WatermarkPreview
                  title="Certificate"
                  pdfUrl={cert?.url || null}
                  docId={cert?.id || null}
                  backendUrl={backendUrl}
                  docType="certificates"
                />
                <WatermarkPreview
                  title="Transcript"
                  pdfUrl={trans?.url || null}
                  docId={trans?.id || null}
                  backendUrl={backendUrl}
                  docType="transcripts"
                />
              </View>

              {/* Purchased AI courses (same idea as web) */}
              {aiCourses.length > 0 ? (
                <View className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                  <View>
                    <Text className="text-white font-semibold">Purchased AI courses</Text>
                    <Text className="text-white/60 text-sm">
                      Certificate purchases unlock up to 60 lessons
                    </Text>
                  </View>

                  <View className="gap-3">
                    {aiCourses.map((item: any) => {
                      const statusText = item.completion?.passed
                        ? 'Completed'
                        : item.completion?.attempted
                        ? 'In progress'
                        : 'Not started';

                      const cid = String(item.courseId || item.course_id);
                      return (
                        <View
                          key={String(item.course_id || cid)}
                          className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2"
                        >
                          <View className="flex-row items-center justify-between gap-2">
                            <View className="flex-1 mr-2">
                              <Text className="text-white font-semibold" numberOfLines={1}>
                                {item.title}
                              </Text>
                              <Text className="text-white/60 text-xs">
                                Lessons used {item.lessons_used}/{item.max_lessons || item.lesson_cap}
                              </Text>
                            </View>
                            <View className="px-2 py-1 rounded-full bg-white/10">
                              <Text className="text-white/80 text-xs">{statusText}</Text>
                            </View>
                          </View>

                          <View className="flex-row flex-wrap gap-2">
                            {!item.completion?.passed ? (
                              <Pressable
                                onPress={() =>
                                  navigation.navigate('CourseDetails' as any, { courseId: cid } as any)
                                }
                                className="px-3 py-2 rounded-lg bg-white/10"
                              >
                                <Text className="text-white text-sm">Continue course</Text>
                              </Pressable>
                            ) : (
                              <Pressable
                                onPress={() =>
                                  navigation.navigate('Results' as any, {
                                    courseId: cid,
                                    courseTitle: item.title,
                                    grade: item.completion,
                                  } as any)
                                }
                                className="px-3 py-2 rounded-lg bg-emerald-500/20"
                              >
                                <Text className="text-emerald-100 text-sm">View certificate</Text>
                              </Pressable>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {/* Actions */}
              <View className="rounded-2xl p-4 ring-1 ring-white/10 bg-white/5">
                <Text className="text-white font-semibold mb-2">Downloads</Text>
                <Text className="text-white/70 text-sm mb-3">
                  Pay the certificate fee once to download both the{' '}
                  <Text className="font-medium">Certificate</Text> and{' '}
                  <Text className="font-medium">Transcript</Text> without watermark.
                </Text>

                {/* Tokens-first block */}
                <View className="mb-4 p-3 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
                  <Text className="text-white font-medium text-sm">Claim with Tokens</Text>
                  <Text className="text-white/70 text-xs mb-2">
                    No processor fees for AI certificates.
                  </Text>

                  {aiCertLoading ? <Text className="text-xs text-white/60">Loading…</Text> : null}
                  {aiCertError ? <Text className="text-xs text-red-300">{aiCertError}</Text> : null}
                  {aiCertMsg ? <Text className="text-xs text-emerald-300">{aiCertMsg}</Text> : null}

                  <View className="gap-2">
                    {(Array.isArray(skus) ? skus : []).map((sku: any) => {
                      const code = skuCodeOf(sku);
                      const price = priceTokensOf(sku);
                      return (
                        <View
                          key={code || sku?.title || String(Math.random())}
                          className="flex-row items-center justify-between rounded-lg ring-1 ring-white/15 p-2 bg-white/5"
                        >
                          <View className="flex-1 mr-2">
                            <Text className="text-sm font-medium text-white" numberOfLines={1}>
                              {sku?.title || 'Certificate'}
                            </Text>
                            <Text className="text-[11px] text-white/60" numberOfLines={1}>
                              {code || '—'}
                            </Text>
                          </View>

                          <View className="flex-row items-center gap-2">
                            <Text className="text-sm font-semibold text-white">{price} Tokens</Text>

                            <Pressable
                              disabled={!passed}
                              onPress={async () => {
                                if (!token || !courseId) {
                                  warnR('[Results][claim] missing token/courseId', {
                                    rid,
                                    hasToken: !!token,
                                    courseId,
                                  });
                                  Alert.alert('Sign in required', 'Please sign in to claim certificates.');
                                  return;
                                }

                                logR('[Results][claim] click', { rid, courseId, sku: { code, title: sku?.title }, passed });

                                try {
                                  logR('[Results][claim] claim start', { rid, code, courseId });

                                  // Prefer single-arg claim (hook already has courseId)
                                  await claim(code);

                                  logR('[Results][claim] claim ok', { rid, code, courseId });

                                  logR('[Results][claim] generate cert start', { rid, courseId });
                                  const doc: any = await generate();
                                  logR('[Results][claim] generate cert ok', { rid, doc: safeJson(doc) });

                                  if (doc?.id) {
                                    const base = String(backendUrl || '').replace(/\/+$/, '');
                                    const nextCert = {
                                      id: String(doc.id),
                                      url: doc.url,
                                      download_url: doc.download_url || `${base}/api/certificates/${doc.id}/download`,
                                      meta: doc,
                                    };
                                    setCert(nextCert);
                                    logR('[Results][claim] setCert', { rid, certId: nextCert.id });

                                    // refresh all-certs list so library reflects latest
                                    try {
                                      logR('[Results][claim] refresh cert list start', { rid });
                                      const cs = await api<any>(`/api/certificates/me`);
                                      const arr = Array.isArray(cs) ? cs : [];
                                      setAllCerts(arr);
                                      logR('[Results][claim] refresh cert list ok', { rid, count: arr.length });
                                    } catch (e: any) {
                                      warnR('[Results][claim] refresh cert list fail', { rid, status: e?.status, msg: e?.message });
                                    }

                                    // If extended SKU, also generate transcript and refresh list
                                    if (looksExtendedSku(sku)) {
                                      try {
                                        logR('[Results][transcript.generate] start', { rid, courseId, sku: code });

                                        const t: any = await api(`/api/transcripts/generate`, {
                                          method: 'POST',
                                          body: JSON.stringify({ courseId }),
                                        });

                                        logR('[Results][transcript.generate] ok', { rid, t: safeJson(t) });

                                        if (t?.id) {
                                          const base = String(backendUrl || '').replace(/\/+$/, '');
                                          setTrans({
                                            id: String(t.id),
                                            url: t.url,
                                            download_url: t.download_url || `${base}/api/transcripts/${t.id}/download`,
                                            meta: t,
                                          });
                                          logR('[Results][transcript.generate] setTrans', { rid, transId: String(t.id) });
                                        }

                                        try {
                                          logR('[Results][transcript.generate] refresh list start', { rid });
                                          const ts = await api<any>(`/api/transcripts/me`);
                                          const arr = Array.isArray(ts) ? ts : [];
                                          setAllTrans(arr);
                                          logR('[Results][transcript.generate] refresh list ok', { rid, count: arr.length });
                                        } catch (e: any) {
                                          warnR('[Results][transcript.generate] refresh list fail', { rid, status: e?.status, msg: e?.message });
                                        }

                                        if (t?.download_url) {
                                          logR('[Results][transcript.generate] open download_url', { rid });
                                          openExternal(t.download_url);
                                        }
                                      } catch (e: any) {
                                        errR('[Results][transcript.generate] fail', {
                                          rid,
                                          status: e?.status,
                                          msg: e?.message,
                                          data: safeJson(e?.data),
                                        });

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
                                  errR('[Results][claim] token claim/generate failed', {
                                    rid,
                                    status: e?.status,
                                    msg: e?.message,
                                    data: safeJson(e?.data),
                                  });

                                  const msg = e?.data?.message || e?.message || 'Could not claim/generate.';
                                  Alert.alert('Claim failed', msg);

                                  if (e?.status === 402) setPaymentOpen(true);
                                }
                              }}
                              className={`px-3 py-1.5 rounded ${
                                passed ? 'bg-emerald-600' : 'bg-emerald-600/50'
                              }`}
                            >
                              <Text className="text-white text-sm font-semibold">Claim &amp; Generate</Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* Buttons */}
                <View className="flex-row flex-wrap gap-2">
                  <Pressable
                    onPress={() => {
                      logR('[Results][pay] open widget', { rid, passed });
                      setPaymentOpen(true);
                    }}
                    disabled={!passed}
                    className={`h-10 px-4 rounded-lg justify-center ${
                      passed ? 'bg-indigo-600' : 'bg-indigo-600/40'
                    }`}
                  >
                    <Text className="text-white text-sm font-semibold">Pay certificate fee</Text>
                  </Pressable>

                  <Pressable
                    onPress={async () => {
                      if (!cert?.id) {
                        logR('[Results][download cert] missing cert -> open payment', { rid });
                        setPaymentOpen(true);
                        return;
                      }
                      try {
                        logR('[Results][download cert] start', { rid, certId: cert.id });
                        await downloadCertificateFile(backendUrl, token || '', cert.id);
                        logR('[Results][download cert] ok', { rid, certId: cert.id });
                      } catch (e: any) {
                        warnR('[Results][download cert] fail -> open payment', { rid, msg: e?.message });
                        setPaymentOpen(true);
                      }
                    }}
                    className={`h-10 px-4 rounded-lg justify-center ${
                      cert?.id ? 'bg-white/10' : 'bg-white/5'
                    } ring-1 ${cert?.id ? 'ring-white/20' : 'ring-white/10'}`}
                  >
                    <Text className="text-white text-sm font-semibold">Download Certificate (PDF)</Text>
                  </Pressable>

                  <Pressable
                    onPress={async () => {
                      if (!trans?.id) {
                        logR('[Results][download transcript] missing trans -> open payment', { rid });
                        setPaymentOpen(true);
                        return;
                      }
                      try {
                        logR('[Results][download transcript] start', { rid, transId: trans.id });
                        await downloadTranscriptFile(backendUrl, token || '', trans.id);
                        logR('[Results][download transcript] ok', { rid, transId: trans.id });
                      } catch (e: any) {
                        warnR('[Results][download transcript] fail -> open payment', { rid, msg: e?.message });
                        setPaymentOpen(true);
                      }
                    }}
                    className={`h-10 px-4 rounded-lg justify-center ${
                      trans?.id ? 'bg-white/10' : 'bg-white/5'
                    } ring-1 ${trans?.id ? 'ring-white/20' : 'ring-white/10'}`}
                  >
                    <Text className="text-white text-sm font-semibold">Download Transcript (PDF)</Text>
                  </Pressable>
                </View>

                {!passed ? (
                  <Text className="mt-3 text-[12px] text-white/60">
                    Tip: Revisit the lesson and retry the quiz to reach the pass mark.
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>

      {/* Payment slide-over (native) */}
      <PaymentWidget
        isOpen={paymentOpen}
        title="Unlock Certificate"
        showTutorPreview={false}
        onClose={async () => {
          logR('[Results][PaymentWidget] onClose', { rid });
          setPaymentOpen(false);

          // refresh wallet (if your widget changes balances) + refresh lists so library stays accurate
          try {
            await refreshUserDetails?.();
          } catch {}

          try {
            logR('[Results][PaymentWidget] refresh cert list start', { rid });
            const cs = await api<any>(`/api/certificates/me`);
            const arr = Array.isArray(cs) ? cs : [];
            setAllCerts(arr);
            logR('[Results][PaymentWidget] refresh cert list ok', { rid, count: arr.length });
          } catch (e: any) {
            warnR('[Results][PaymentWidget] refresh cert list fail', { rid, status: e?.status, msg: e?.message });
          }

          try {
            logR('[Results][PaymentWidget] refresh transcript list start', { rid });
            const ts = await api<any>(`/api/transcripts/me`);
            const arr = Array.isArray(ts) ? ts : [];
            setAllTrans(arr);
            logR('[Results][PaymentWidget] refresh transcript list ok', { rid, count: arr.length });
          } catch (e: any) {
            warnR('[Results][PaymentWidget] refresh transcript list fail', { rid, status: e?.status, msg: e?.message });
          }
        }}
      />
    </View>
  );
};

export default ResultsPage;
