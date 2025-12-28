// apps/mobile/src/pages/Results.native.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Image, Pressable, Linking, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { MainStackParamList } from '../navigation/types';

import { useShopContext } from '@mytutorapp/shared/context';
import { useAICertificates, useAiCourseEntitlements } from '@mytutorapp/shared/hooks';

// Native payment slide-over/panel
import PaymentWidget from '../screens/PaymentWidget.native';

type GradeLike = {
  scorePct: number;
  passMark: number;
  passed: boolean;
};

type Nav = StackNavigationProp<MainStackParamList>;

const CERT_COST_TOKENS = 20;

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
function looksCertificateSku(sku: any) {
  const title = lower(sku?.title);
  const kind = lower(sku?.kind ?? sku?.type ?? sku?.purpose ?? sku?.meta?.purpose);
  return kind.includes('certificate') || title.includes('certificate') || title.includes('cert');
}
function pickStandardCertSku(skusList: any[] | undefined | null) {
  const list = Array.isArray(skusList) ? skusList : [];
  if (!list.length) return null;

  const certs = list.filter(looksCertificateSku);
  const pool0 = certs.length ? certs : list;

  const standard = pool0.filter((s) => !looksExtendedSku(s));
  const pool = standard.length ? standard : pool0;

  const withCode = pool.filter((s) => skuCodeOf(s));
  if (!withCode.length) return null;

  const exact = withCode.filter((s) => priceTokensOf(s) === CERT_COST_TOKENS);
  const base = exact.length ? exact : withCode;

  return base.sort((a, b) => priceTokensOf(a) - priceTokensOf(b))[0] || null;
}

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
    // Prefer backend OG preview if we have an id
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
          <Text className="text-white/15 font-black tracking-widest text-4xl">PREVIEW</Text>
        </View>
      </View>

      <View className="px-3 pb-3">
        <Text className="text-white/60 text-xs">
          Clean downloads unlock after you purchase the course certificate (20 tokens ≈ USD 20).
        </Text>
      </View>
    </View>
  );
}

const ResultsPage: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<any>();

  const { backendUrl, token, tokens, refreshUserDetails } = useShopContext() as any;

  // Prior screen should pass these via route.params
  const courseId: string | undefined = route.params?.courseId;
  const courseTitle: string | undefined = route.params?.courseTitle;
  const grade: GradeLike | undefined = route.params?.grade;

  const passed = Boolean(grade?.passed);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const pendingAutoBuyRef = useRef(false);

  const [status, setStatus] = useState<{
    paid?: boolean;
    tier?: 'standard' | 'extended' | string | null;
    extended?: boolean;
    canCertificate?: boolean;
    canTranscript?: boolean;
    hasCertificate?: boolean;
    message?: string | null;
  } | null>(null);

  const [cert, setCert] = useState<{ id: string; url: string; download_url?: string } | null>(null);
  const [trans, setTrans] = useState<{ id: string; url: string; download_url?: string } | null>(
    null
  );

  const api = useCallback(
    async function <T = any>(path: string, init?: RequestInit): Promise<T> {
      const base = String(backendUrl || '').replace(/\/+$/, '');
      const r = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          ...(init?.headers || {}),
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (r.status === 204) return null as any;
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const e: any = new Error((data as any)?.error || (data as any)?.message || `Request failed: ${r.status}`);
        e.status = r.status;
        e.data = data;
        throw e;
      }
      return data as T;
    },
    [backendUrl, token]
  );

  const reloadStatus = useCallback(async () => {
    if (!courseId) return;
    try {
      const s = await api<any>(`/api/certificates/status?courseId=${encodeURIComponent(courseId)}`);
      setStatus(s || null);
    } catch {
      setStatus(null);
    }
  }, [api, courseId]);

  const hasPaid = useMemo(() => {
    const tier = typeof status?.tier === 'string' ? status?.tier.toLowerCase() : '';
    const extended =
      status?.extended === true || status?.canTranscript === true || tier === 'extended';
    const anyPaid =
      extended ||
      status?.paid === true ||
      status?.hasCertificate === true ||
      status?.canCertificate === true ||
      tier === 'standard';
    return Boolean(anyPaid);
  }, [status]);

  // Tokens-first hook (SKUs + claim debit + optional generate)
  const {
    skus,
    loading: aiCertLoading,
    error: aiCertError,
    message: aiCertMsg,
    claim,
    generate,
  } = useAICertificates({ backendUrl, token: token || '', courseId });

  const skusReady = useMemo(
    () => Array.isArray(skus) && skus.length > 0 && !aiCertLoading && !aiCertError,
    [skus, aiCertLoading, aiCertError]
  );

  const buyStandard = useCallback(async () => {
    if (!token) {
      navigation.navigate('Login' as any, {
        reason: 'buy_certificate',
        message: 'Please sign in to buy your certificate.',
      } as any);
      return;
    }

    // If wallet is short → open PaymentWidget and auto-debit once topped up
    const bal = Number(tokens) || 0;
    if (bal < CERT_COST_TOKENS) {
      pendingAutoBuyRef.current = true;
      setPaymentOpen(true);
      return;
    }

    if (!skusReady) {
      Alert.alert('Loading', 'Loading certificate options. Please try again in a moment.');
      return;
    }

    const sku = pickStandardCertSku(skus);
    const code = sku ? skuCodeOf(sku) : '';
    if (!code) {
      Alert.alert('Certificate', 'Certificate SKU not available. Please refresh and try again.');
      return;
    }

    try {
      await claim(code); // debits tokens + grants entitlement
      try {
        await refreshUserDetails?.();
      } catch {}
      await reloadStatus();

      Alert.alert(
        'Unlocked',
        '✅ Course unlocked (20 tokens ≈ USD 20). Narration is unlocked. Pass the quiz (≥ 70%) to generate/download your certificate.'
      );
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (e?.status === 402 || /insufficient|not enough|tokens/i.test(msg)) {
        pendingAutoBuyRef.current = true;
        setPaymentOpen(true);
        return;
      }
      Alert.alert('Certificate', msg || 'Could not complete purchase.');
    }
  }, [
    token,
    tokens,
    skusReady,
    skus,
    claim,
    refreshUserDetails,
    reloadStatus,
    navigation,
  ]);

  // Auto-debit after top-up (PaymentWidget closed + wallet sufficient)
  const tryAutoBuyIfNeeded = useCallback(async () => {
    if (!pendingAutoBuyRef.current) return;
    const bal = Number(tokens) || 0;
    if (bal < CERT_COST_TOKENS) return;
    if (!skusReady) return;

    pendingAutoBuyRef.current = false;
    await buyStandard();
  }, [tokens, skusReady, buyStandard]);

  const tryFetchDocs = useCallback(async () => {
    if (!courseId) return;
    if (!passed) return;

    // Generate endpoints may return existing docs if already generated.
    try {
      const c = await api<any>(`/api/certificates/generate`, {
        method: 'POST',
        body: JSON.stringify({ courseId }),
      }).catch((e) => {
        // 402 = needs purchase/unlock in some flows
        // 409/403 PASS_REQUIRED = not passed (shouldn’t happen if passed)
        if (e?.status === 402 || e?.status === 409 || e?.status === 403) return null;
        return null;
      });
      if (c?.id) setCert(c);
    } catch {}

    try {
      const t = await api<any>(`/api/transcripts/generate`, {
        method: 'POST',
        body: JSON.stringify({ courseId }),
      }).catch((e) => {
        if (e?.status === 402) return null;
        return null;
      });
      if (t?.id) setTrans(t);
    } catch {}
  }, [api, courseId, passed]);

  // Initial load: status + (if passed) docs
  useEffect(() => {
    (async () => {
      if (!courseId) return;
      await reloadStatus();
      await tryFetchDocs();
    })();
  }, [courseId, reloadStatus, tryFetchDocs]);

  const openExternal = useCallback((url?: string | null) => {
    if (!url) {
      setPaymentOpen(true);
      return;
    }
    Linking.openURL(url).catch(() => {});
  }, []);

  // ✅ safer default to avoid crashes if items is undefined
  const { items: aiCourses = [] } = useAiCourseEntitlements({
    backendUrl,
    token: token || '',
  });

  return (
    <View className="flex-1 bg-[#0b1220]">
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} className="px-3 py-4">
        <View className="max-w-[1100px] w-full self-center space-y-4">
          <View className="flex-row items-start justify-between">
            <View>
              <Text className="text-white font-bold text-xl">Results & Documents</Text>
              <Text className="text-white/70 text-sm">
                {courseTitle ? <Text className="font-medium">{courseTitle}</Text> : 'Course'} • Your
                quiz results & downloads
              </Text>
            </View>
            <Pressable
              onPress={() => navigation.goBack()}
              className="rounded-xl px-3 py-2 bg-white/10"
            >
              <Text className="text-white text-sm">Back</Text>
            </Pressable>
          </View>

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
                ? 'Nice! You passed. You can generate your certificate now.'
                : 'You didn’t pass yet. You can still unlock the course (20 tokens) to keep learning, then retry the quiz.'}
            </Text>
          </View>

          {/* Purchase / Unlock (tokens-first) */}
          {!hasPaid ? (
            <View className="rounded-2xl p-4 border border-amber-500/30 bg-amber-500/10">
              <Text className="text-amber-100 font-semibold">Unlock course</Text>
              <Text className="text-white/80 text-sm mt-1">
                Buy the course certificate for <Text className="font-semibold">20 tokens</Text> (≈
                USD 20). Tokens are deducted from your balance. If you don’t have enough, you’ll be
                prompted to buy tokens.
              </Text>

              <View className="mt-3 flex-row flex-wrap gap-2 items-center">
                <Pressable
                  onPress={buyStandard}
                  className={`h-10 px-4 rounded-lg justify-center ${
                    aiCertLoading ? 'bg-indigo-600/60' : 'bg-indigo-600'
                  }`}
                >
                  <Text className="text-white text-sm font-semibold">
                    {aiCertLoading ? 'Loading…' : 'Buy certificate (20 tokens)'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={async () => {
                    await reloadStatus();
                    await tryFetchDocs();
                  }}
                  className="h-10 px-4 rounded-lg justify-center bg-white/10 ring-1 ring-white/15"
                >
                  <Text className="text-white text-sm font-semibold">Refresh</Text>
                </Pressable>
              </View>

              {aiCertError ? <Text className="text-red-300 text-xs mt-2">{aiCertError}</Text> : null}
              {aiCertMsg ? <Text className="text-emerald-300 text-xs mt-1">{aiCertMsg}</Text> : null}

              {/* Optional SKU list (debug-friendly, safe) */}
              {skusReady ? (
                <View className="mt-3 gap-2">
                  {(skus || [])
                    .filter(looksCertificateSku)
                    .slice(0, 3)
                    .map((sku: any) => (
                      <View
                        key={skuCodeOf(sku) || sku?.title}
                        className="flex-row items-center justify-between rounded-lg p-2 bg-white/5 ring-1 ring-white/10"
                      >
                        <View className="flex-1 mr-2">
                          <Text className="text-white font-medium" numberOfLines={1}>
                            {sku?.title || 'Certificate'}
                          </Text>
                          <Text className="text-white/60 text-[11px]" numberOfLines={1}>
                            {skuCodeOf(sku)}
                          </Text>
                        </View>
                        <Text className="text-white font-semibold text-sm">
                          {priceTokensOf(sku)} Tokens
                        </Text>
                      </View>
                    ))}
                </View>
              ) : null}
            </View>
          ) : (
            <View className="rounded-2xl p-4 border border-emerald-500/30 bg-emerald-500/10">
              <Text className="text-emerald-100 font-semibold">Unlocked</Text>
              <Text className="text-white/80 text-sm mt-1">
                ✅ Course unlocked. {passed ? 'You can generate/download your certificate now.' : 'Go back and continue learning, then retry the quiz.'}
              </Text>

              <View className="mt-3 flex-row flex-wrap gap-2">
                <Pressable
                  onPress={async () => {
                    await reloadStatus();
                    await tryFetchDocs();
                  }}
                  className="h-10 px-4 rounded-lg justify-center bg-white/10 ring-1 ring-white/15"
                >
                  <Text className="text-white text-sm font-semibold">Refresh documents</Text>
                </Pressable>
              </View>
            </View>
          )}

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

          {/* Purchased AI courses */}
          {aiCourses.length > 0 && (
            <View className="gap-3">
              <Text className="text-white font-semibold text-lg">Purchased AI courses</Text>
              {aiCourses.map((item: any) => {
                const courseIdForNav = item.courseId || item.course_id;
                const statusText = item.completion?.passed
                  ? 'Completed'
                  : item.completion?.attempted
                  ? 'In progress'
                  : 'Not started';

                return (
                  <View
                    key={String(item.course_id || courseIdForNav)}
                    className="border border-white/10 bg-white/5 rounded-xl p-3 space-y-2"
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 mr-2">
                        <Text className="text-white font-semibold" numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text className="text-white/60 text-xs">
                          Lessons used {item.lessons_used}/{item.lesson_cap || item.max_lessons}
                        </Text>
                        {item.tier ? (
                          <Text className="text-white/60 text-[11px]">Tier: {item.tier}</Text>
                        ) : null}
                      </View>
                      <Text className="text-white/70 text-xs">{statusText}</Text>
                    </View>

                    <View className="flex-row gap-2">
                      {!item.completion?.passed ? (
                        <Pressable
                          onPress={() => navigation.navigate('CourseDetails', { courseId: courseIdForNav } as any)}
                          className="px-3 py-2 rounded-lg bg-white/10"
                        >
                          <Text className="text-white text-sm">Continue course</Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          onPress={() =>
                            navigation.navigate('Results', {
                              courseId: courseIdForNav,
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
          )}

          {/* Downloads */}
          <View className="rounded-2xl p-4 border border-white/10 bg-white/5">
            <Text className="text-white font-semibold mb-2">Downloads</Text>
            <Text className="text-white/70 text-sm mb-3">
              {passed ? (
                <>
                  Generate your certificate now. If your course is unlocked, downloads are clean (no watermark).
                </>
              ) : (
                <>
                  Pass the quiz (≥ {grade?.passMark ?? 70}%) to generate your certificate. You can still unlock the course
                  now (20 tokens) to continue learning with narration.
                </>
              )}
            </Text>

            <View className="flex-row flex-wrap gap-2">
              <Pressable
                onPress={async () => {
                  if (!passed) {
                    Alert.alert('Certificate', 'Pass the quiz (≥ 70%) to generate your certificate.');
                    return;
                  }
                  try {
                    // If the hook generate uses new routes internally, prefer it.
                    const doc = await generate?.().catch(() => null);
                    if (doc?.id) {
                      setCert({ id: doc.id, url: doc.url, download_url: (doc as any).download_url });
                      return;
                    }
                  } catch {}
                  // Fallback to server generate
                  await tryFetchDocs();
                }}
                className={`h-10 px-4 rounded-lg justify-center ${
                  passed ? 'bg-emerald-600' : 'bg-emerald-600/40'
                }`}
              >
                <Text className="text-white text-sm font-semibold">Generate certificate</Text>
              </Pressable>

              <Pressable
                onPress={() => openExternal(cert?.download_url)}
                className={`h-10 px-4 rounded-lg justify-center ${
                  cert?.download_url ? 'bg-white/10' : 'bg-white/5'
                } ring-1 ${cert?.download_url ? 'ring-white/20' : 'ring-white/10'}`}
              >
                <Text className="text-white text-sm font-semibold">Download Certificate (PDF)</Text>
              </Pressable>

              <Pressable
                onPress={() => openExternal(trans?.download_url)}
                className={`h-10 px-4 rounded-lg justify-center ${
                  trans?.download_url ? 'bg-white/10' : 'bg-white/5'
                } ring-1 ${trans?.download_url ? 'ring-white/20' : 'ring-white/10'}`}
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
        </View>
      </ScrollView>

      {/* Payment slide-over (native) */}
      <PaymentWidget
        isOpen={paymentOpen}
        title="Buy tokens"
        showTutorPreview={false}
        onClose={async () => {
          setPaymentOpen(false);

          // refresh wallet + status + documents
          try {
            await refreshUserDetails?.();
          } catch {}

          await reloadStatus();
          await tryFetchDocs();

          // if user came here because they were short and wanted auto-buy, try it now
          await tryAutoBuyIfNeeded();
        }}
      />
    </View>
  );
};

export default ResultsPage;
