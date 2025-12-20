// apps/mobile/src/pages/Results.native.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Image, Pressable, Linking } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { MainStackParamList } from '../navigation/types';

import { useShopContext } from '@mytutorapp/shared/context';
import { useAICertificates } from '@mytutorapp/shared/hooks';

// Native payment slide-over/panel (implement this in your native screens folder)
import PaymentWidget from './PaymentWidget.native';

type GradeLike = {
  scorePct: number;
  passMark: number;
  passed: boolean;
};

type Nav = StackNavigationProp<MainStackParamList>;

function WatermarkPreview({
  title,
  pdfUrl,
  certId,
  backendUrl,
  folderHint = 'certificates',
}: {
  title: string;
  pdfUrl?: string | null;
  certId?: string | null;
  backendUrl?: string;
  folderHint?: 'certificates' | 'transcripts';
}) {
  const previewUrl = useMemo(() => {
    if (certId && backendUrl) {
      return `${backendUrl.replace(/\/+$/, '')}/api/certificates/${certId}/og`;
    }
    if (!pdfUrl) return null;
    try {
      const u = new URL(pdfUrl);
      const [left, right] = u.pathname.split('/upload/');
      if (!right) return null;
      return `${u.origin}${left}/upload/pg_1/${right.replace(/\.pdf$/i, '.jpg')}`;
    } catch {
      return null;
    }
  }, [certId, backendUrl, pdfUrl]);

  return (
    <View className="relative rounded-2xl overflow-hidden bg-white/5 border border-white">
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
        <View
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center"
          style={{ mixBlendMode: 'multiply' } as any}
        >
          <Text className="text-white/20 font-black tracking-widest text-4xl">PREVIEW</Text>
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

const ResultsPage: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<any>(); // expect params from previous screen
  const { backendUrl, token } = useShopContext();

  // Prior screen should pass these via route.params
  const courseId: string | undefined = route.params?.courseId;
  const courseTitle: string | undefined = route.params?.courseTitle;
  const grade: GradeLike | undefined = route.params?.grade;

  const [paymentOpen, setPaymentOpen] = useState(false);

  const [cert, setCert] = useState<{ id: string; url: string; download_url?: string } | null>(null);
  const [trans, setTrans] = useState<{ id: string; url: string; download_url?: string } | null>(
    null
  );

  // Helper to call API
  async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
    const r = await fetch(`${backendUrl}${path}`, {
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
      const e: any = new Error(data?.error || `Request failed: ${r.status}`);
      e.status = r.status;
      e.data = data;
      throw e;
    }
    return data;
  }

  // Attempt to fetch existing cert/transcript (backend may return existing on "generate" POST)
  useEffect(() => {
    let abort = false;

    (async () => {
      if (!courseId) return;

      try {
        const c = await api(`/api/certificates/generate`, {
          method: 'POST',
          body: JSON.stringify({ courseId }),
        }).catch((e) => {
          if (e?.status === 402) return null; // payment required
          throw e;
        });
        if (!abort && c?.id) setCert(c);
      } catch {}

      try {
        const t = await api(`/api/transcripts/generate`, {
          method: 'POST',
          body: JSON.stringify({ courseId }),
        }).catch((e) => {
          if (e?.status === 402) return null;
          throw e;
        });
        if (!abort && t?.id) setTrans(t);
      } catch {}
    })();

    return () => {
      abort = true;
    };
  }, [backendUrl, token, courseId]);

  const passed = Boolean(grade?.passed);

  // Tokens-first hook (AI certificates)
  const {
    skus,
    loading: aiCertLoading,
    error: aiCertError,
    message: aiCertMsg,
    claim,
    generate,
  } = useAICertificates({ backendUrl, token: token || '', courseId });

  const openExternal = (url?: string) => {
    if (!url) {
      setPaymentOpen(true);
      return;
    }
    Linking.openURL(url).catch(() => {});
  };

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
            className={`rounded-2xl p-4 ${passed ? 'bg-emerald-500/10' : 'bg-red-500/10'} ${passed ? 'ring-emerald-500/40' : 'ring-red-500/40'} ring-1`}
          >
            <Text className="text-white/80 text-sm">Score</Text>
            <Text className="text-2xl font-semibold text-white">
              {grade ? `${grade.scorePct}%` : '—'}
              <Text className="text-white/60 text-sm"> (Pass mark {grade?.passMark ?? 70}%)</Text>
            </Text>
            <Text className="mt-1 text-white/70">
              {passed
                ? 'Nice! You passed. You can unlock clean downloads.'
                : 'Review the lesson and try again to pass.'}
            </Text>
          </View>

          {/* Previews */}
          <View className="gap-4">
            <WatermarkPreview
              title="Certificate"
              pdfUrl={cert?.url || null}
              certId={cert?.id || null}
              backendUrl={backendUrl}
              folderHint="certificates"
            />
            <WatermarkPreview
              title="Transcript"
              pdfUrl={trans?.url || null}
              folderHint="transcripts"
            />
          </View>

          {/* Actions */}
          <View className="rounded-2xl p-4 border border-white bg-white/5">
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

              {aiCertLoading ? (
                <Text className="text-xs text-white/60">Loading certificate options…</Text>
              ) : null}
              {aiCertError ? <Text className="text-xs text-red-300">{aiCertError}</Text> : null}
              {aiCertMsg ? <Text className="text-xs text-emerald-300">{aiCertMsg}</Text> : null}

              <View className="gap-2 mt-2">
                {(skus || []).map((sku) => (
                  <View
                    key={sku.code}
                    className="flex-row items-center justify-between rounded-lg p-2 bg-white/5 ring-1 ring-white/15"
                  >
                    <View>
                      <Text className="text-sm font-medium text-white">{sku.title}</Text>
                      <Text className="text-[11px] text-white/60">{sku.code}</Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <Text className="text-sm font-semibold text-white">
                        {sku.price_tokens} Tokens
                      </Text>
                      <Pressable
                        disabled={!passed}
                        onPress={async () => {
                          if (!token) return;
                          try {
                            await claim(sku.code);
                            const doc = await generate();
                            if (doc?.id)
                              setCert({
                                id: doc.id,
                                url: doc.url,
                                download_url: (doc as any).download_url,
                              });
                          } catch (e) {
                            console.error('[Results] token claim/generate failed', e);
                          }
                        }}
                        className={`px-3 py-1.5 rounded ${passed ? 'bg-emerald-600' : 'bg-emerald-600/50'}`}
                      >
                        <Text className="text-white text-sm">Claim & Generate</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <View className="flex-row flex-wrap gap-2">
              <Pressable
                onPress={() => setPaymentOpen(true)}
                disabled={!passed}
                className={`h-10 px-4 rounded-lg justify-center ${passed ? 'bg-indigo-600' : 'bg-indigo-600/40'}`}
              >
                <Text className="text-white text-sm font-semibold">Pay certificate fee</Text>
              </Pressable>

              <Pressable
                onPress={() => openExternal(cert?.download_url)}
                className={`h-10 px-4 rounded-lg justify-center ${cert?.download_url ? 'bg-white/10' : 'bg-white/5'} ring-1 ${cert?.download_url ? 'ring-white/20' : 'ring-white/10'}`}
              >
                <Text className="text-white text-sm font-semibold">Download Certificate (PDF)</Text>
              </Pressable>

              <Pressable
                onPress={() => openExternal(trans?.download_url)}
                className={`h-10 px-4 rounded-lg justify-center ${trans?.download_url ? 'bg-white/10' : 'bg-white/5'} ring-1 ${trans?.download_url ? 'ring-white/20' : 'ring-white/10'}`}
              >
                <Text className="text-white text-sm font-semibold">Download Transcript (PDF)</Text>
              </Pressable>
            </View>

            {!passed && (
              <Text className="mt-3 text-[12px] text-white/60">
                Tip: Revisit the lesson and retry the quiz to reach the pass mark.
              </Text>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Payment slide-over (native) */}
      <PaymentWidget
        isOpen={paymentOpen}
        onClose={async () => {
          setPaymentOpen(false);
          if (!courseId) return;

          try {
            const c = await fetch(`${backendUrl}/api/certificates/generate`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ courseId }),
            }).then((r) => (r.ok ? r.json() : null));
            if (c?.id) setCert(c);
          } catch {}

          try {
            const t = await fetch(`${backendUrl}/api/transcripts/generate`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ courseId }),
            }).then((r) => (r.ok ? r.json() : null));
            if (t?.id) setTrans(t);
          } catch {}
        }}
        title="Unlock Certificate"
        showTutorPreview={false}
      />
    </View>
  );
};

export default ResultsPage;
