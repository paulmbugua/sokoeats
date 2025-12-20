// apps/mobile/src/screens/OerAutoPreviewScreen.native.tsx
/* eslint-disable prettier/prettier */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { InView } from 'react-native-intersection-observer';
import { WebView } from 'react-native-webview';
import { Image } from 'expo-image';
import tw from '../../tailwind';

/* ───────────────────────────────────────────────────────────
   buildAutoplayEmbed
   - Normalizes a YouTube watch/embed/short URL to an
     autoplaying, muted, inline embed (parity with web util).
   ─────────────────────────────────────────────────────────── */
function buildAutoplayEmbed(raw?: string | null): string {
  const url = (raw || '').trim();
  if (!url) return '';

  // Extract ID from common formats
  const watch = url.match(/[?&]v=([^&]+)/);
  const embed = url.match(/\/embed\/([a-zA-Z0-9_-]{6,})/);
  const short = url.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
  const id = watch?.[1] || embed?.[1] || short?.[1];

  if (!id) {
    // If it already looks like an embed URL, append our params
    try {
      const u = new URL(url);
      u.searchParams.set('autoplay', '1');
      u.searchParams.set('mute', '1');
      u.searchParams.set('controls', '0');
      u.searchParams.set('playsinline', '1');
      u.searchParams.set('modestbranding', '1');
      u.searchParams.set('rel', '0');
      u.searchParams.set('loop', '1');
      u.searchParams.set('enablejsapi', '1');
      return u.toString();
    } catch {
      return '';
    }
  }

  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    controls: '0',
    playsinline: '1',
    modestbranding: '1',
    rel: '0',
    loop: '1',
    playlist: id, // loop requires playlist=id
    enablejsapi: '1',
  }).toString();

  return `https://www.youtube.com/embed/${id}?${params}`;
}

/* ───────────────────────────────────────────────────────────
   useReducedMotion (native)
   - Respect OS setting to disable motion/autoplay.
   ─────────────────────────────────────────────────────────── */
const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => mounted && setReduced(!!v))
      .catch(() => {});

    // RN >= 0.65: 'reduceMotionChanged'
    const sub: any = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) =>
      setReduced(!!v)
    );

    return () => {
      sub?.remove?.();
    };
  }, []);

  return reduced;
};

/* ───────────────────────────────────────────────────────────
   Reusable preview component (tailwind-only styling)
   - Autoplays when ~35% visible and motion isn't reduced
   - Falls back to thumbnail
   - Optional badge
   - Tap to play on demand (mobile "hover" parity)
   ─────────────────────────────────────────────────────────── */
type PreviewProps = {
  title: string;
  embedUrl?: string | null;
  thumbnailUrl?: string | null;
  badge?: string;
  onPress?: () => void;
};

export const OerAutoPreviewNative: React.FC<PreviewProps> = ({
  title,
  embedUrl,
  thumbnailUrl,
  badge,
  onPress,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [pressedToPlay, setPressedToPlay] = useState(false);
  const [inView, setInView] = useState(false);

  const src = useMemo(() => buildAutoplayEmbed(embedUrl), [embedUrl]);
  const showWebView = !!src && !prefersReducedMotion && (inView || pressedToPlay);

  const handleTap = useCallback(() => {
    setPressedToPlay(true);
    onPress?.();
  }, [onPress]);

  return (
    <InView onChange={setInView} threshold={0.35} style={tw`w-full`}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handleTap}
        accessibilityRole={onPress ? 'button' : 'image'}
        accessibilityLabel={title}
        style={[tw`w-full`, { aspectRatio: 16 / 9 }]} // tailwind-only (no StyleSheet): use inline aspectRatio
      >
        <View style={tw`flex-1 bg-black rounded-xl overflow-hidden relative`}>
          {showWebView ? (
            <WebView
              source={{ uri: src }}
              style={tw`absolute inset-0`}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
              automaticallyAdjustContentInsets={false}
              originWhitelist={['*']}
              bounces={false}
              // Android perf hint
              {...(Platform.OS === 'android' ? { androidLayerType: 'hardware' as const } : {})}
            />
          ) : thumbnailUrl ? (
            <Image
              source={{ uri: thumbnailUrl }}
              contentFit="cover"
              transition={150}
              style={tw`absolute inset-0`}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={tw`absolute inset-0 bg-black`} />
          )}

          {/* Badge (top-left) */}
          {!!badge && (
            <View style={tw`absolute top-2 left-2 rounded px-2 py-1 bg-white/90 dark:bg-black/70`}>
              <Text style={tw`text-[11px] font-semibold text-[#0d141c] dark:text-white`}>
                {badge}
              </Text>
            </View>
          )}

          {/* Tap veil / play hint (when not auto-playing) */}
          {!showWebView && (
            <View style={tw`absolute inset-0 items-center justify-center bg-black/5`}>
              <View style={tw`flex-row items-center rounded-full px-4 py-2 bg-black/60`}>
                <Text style={tw`text-white text-sm mr-1`}>▶</Text>
                <Text style={tw`text-white text-xs font-semibold`}>Tap to play</Text>
              </View>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </InView>
  );
};

/* ───────────────────────────────────────────────────────────
   Screen wrapper
   - Pass params via navigation or rely on demo defaults.
   ─────────────────────────────────────────────────────────── */
type ScreenProps = {
  route?: {
    params?: {
      title?: string;
      embedUrl?: string | null;
      thumbnailUrl?: string | null;
      badge?: string;
    };
  };
};

const OerAutoPreviewScreen: React.FC<ScreenProps> = ({ route }) => {
  const p = route?.params || {};
  const title = p.title || 'OER Preview';
  const embedUrl = p.embedUrl || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // demo
  const thumbnailUrl = p.thumbnailUrl || 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
  const badge = p.badge || 'Preview';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={tw`flex-1 bg-slate-900`}>
      <View style={tw`p-4`}>
        <Text style={tw`text-white text-lg font-semibold mb-3`} numberOfLines={1}>
          {title}
        </Text>

        <OerAutoPreviewNative
          title={title}
          embedUrl={embedUrl}
          thumbnailUrl={thumbnailUrl}
          badge={badge}
          onPress={undefined} // e.g., navigate to a detail screen
        />

        <Text style={tw`text-slate-300 text-xs mt-4`}>
          Autoplays when ~35% visible and motion is not reduced. Tap to play anytime.
        </Text>
      </View>
    </SafeAreaView>
  );
};

export default OerAutoPreviewScreen;
