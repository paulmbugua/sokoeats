/* eslint-disable prettier/prettier */
import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute, NavigationProp, RouteProp } from '@react-navigation/native';
import { useShopContext } from '@mytutorapp/shared/context';
import type { MainStackParamList } from '../navigation/types';
import tw from '../../tailwind';

/* ----------------------------------------------------------------------------
 * Types & utils
 * --------------------------------------------------------------------------*/
type OerItem = {
  id?: string | number;
  slug?: string;
  title?: string;
  web_url?: string | null;
  html_url?: string | null;
  file_url?: string | null;
  pdf_url?: string | null;
  source_url?: string | null;
  url?: string | null;
  provider?: string | null;
  cover_url?: string | null;
};

const sanitizeId = (routeId?: string) => {
  let s = routeId ?? '';
  try {
    s = decodeURIComponent(s);
  } catch {}
  if (s.startsWith(':id')) s = s.slice(3);
  if (s.startsWith(':')) s = s.slice(1);
  return s;
};

const isProbablyPdfUrl = (u?: string | null) => !!u && /\.pdf($|\?)/i.test(u || '');

async function tryJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function firstHtmlishFromPayload(payload: any, slugOrId: string): OerItem | null {
  const directHtml = payload?.web_url || payload?.html_url;
  if (directHtml) {
    return {
      id: payload?.id ?? slugOrId,
      slug: payload?.slug ?? slugOrId,
      title: payload?.title || payload?.name || 'Open Resource',
      web_url: payload?.web_url || payload?.html_url,
      provider: payload?.provider || payload?.origin || 'OER',
      cover_url: payload?.cover_url || null,
    };
  }

  const items = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data?.items)
        ? payload.data.items
        : [];

  for (const it of items) {
    const web = it?.web_url || it?.html_url;
    if (web) return { ...it, web_url: web };
  }
  for (const it of items) {
    const anyUrl = it?.file_url || it?.pdf_url || it?.source_url || it?.url;
    if (anyUrl) return { ...it, web_url: anyUrl };
  }

  const anyUrl = payload?.file_url || payload?.pdf_url || payload?.source_url || payload?.url;
  if (anyUrl) {
    return {
      id: payload?.id ?? slugOrId,
      slug: payload?.slug ?? slugOrId,
      title: payload?.title || payload?.name || 'Open Resource',
      web_url: anyUrl,
      provider: payload?.provider || payload?.origin || 'OER',
      cover_url: payload?.cover_url || null,
    };
  }
  return null;
}

/* Absolute URL helper: mirrors toAbsUrl logic used on HomePageNative */
const toWebBase = (base?: string) => (base || '').replace(/\/+$/, '').replace(/\/api$/i, '');

function toAbsUrl(backendUrl?: string, src?: string | null): string {
  const raw = String(src ?? '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!backendUrl) return raw;

  const webBase = toWebBase(backendUrl);
  const root = webBase.replace(/\/+$/, '');
  if (raw.startsWith('/')) return `${root}${raw}`;
  return `${root}/${raw}`;
}

/* ----------------------------------------------------------------------------
 * Screen
 * --------------------------------------------------------------------------*/
const OerReaderFullNative: React.FC = () => {
  // Keep navigation typing permissive to avoid route-key constraint errors
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<Record<string, { id?: string }>, string>>();
  const id = sanitizeId(String(route.params?.id ?? ''));

  const { backendUrl, token } = useShopContext();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [item, setItem] = useState<OerItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!backendUrl || !id) return;
      setLoading(true);
      setError('');
      try {
        const base = backendUrl.replace(/\/+$/, '');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const candidates = [
          `${base}/api/oer/books/${encodeURIComponent(id)}`,
          `${base}/api/oer/books/by-slug/${encodeURIComponent(id)}`,
          `${base}/api/oer/collections/${encodeURIComponent(id)}/items`,
          `${base}/api/oer/collections/by-slug/${encodeURIComponent(id)}/items`,
          `${base}/api/oer/items?collection=${encodeURIComponent(id)}`,
          `${base}/oer/collections/${encodeURIComponent(id)}/items`,
        ];

        let found: OerItem | null = null;
        for (const url of candidates) {
          try {
            const payload = await tryJson(url, headers);
            const o = firstHtmlishFromPayload(payload, id);
            if (o?.web_url) {
              found = o;
              break;
            }
          } catch {
            /* continue */
          }
        }

        if (!cancelled) {
          if (!found) {
            setItem(null);
            setError('No readable content found for this resource.');
          } else {
            setItem(found);
          }
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load resource.');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backendUrl, id, token]);

  // Choose the URL to render (resolve relative → absolute using backendUrl)
  const rawSrc = item?.web_url || '';

  const resolvedSrc = useMemo(() => {
    if (!rawSrc) return '';
    return toAbsUrl(backendUrl, rawSrc);
  }, [backendUrl, rawSrc]);

  // Android PDF workaround via Google Docs viewer, otherwise open directly
  const finalSrc = useMemo(() => {
    if (!resolvedSrc) return '';
    if (
      Platform.OS === 'android' &&
      isProbablyPdfUrl(resolvedSrc) &&
      !resolvedSrc.startsWith('file://')
    ) {
      const enc = encodeURIComponent(resolvedSrc);
      return `https://drive.google.com/viewerng/viewer?embedded=true&url=${enc}`;
    }
    // For HTML/PDF/iOS just load directly; append a viewer hint for PDF toolbar if desired
    return isProbablyPdfUrl(resolvedSrc) ? `${resolvedSrc}#toolbar=1` : resolvedSrc;
  }, [resolvedSrc]);

  const openExternally = async (url?: string | null) => {
    if (!url) return;
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) await Linking.openURL(url);
      else Alert.alert('Cannot open link', url);
    } catch {
      Alert.alert('Cannot open link', url);
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
      {/* Header */}
      <View style={tw`px-4 pt-3 pb-2 border-b border-[#e7edf4] dark:border-darkCard`}>
        <View style={tw`flex-row items-center justify-between`}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={tw`rounded-xl h-9 px-3 bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
          >
            <Text style={tw`text-sm text-[#0d141c] dark:text-white`}>Back</Text>
          </Pressable>

          <View style={tw`flex-1 px-3`}>
            <Text
              style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}
              numberOfLines={1}
            >
              {item?.title || 'Open Resource'}
            </Text>
            <Text style={tw`text-[11px] text-[#49739c] dark:text-white/70`} numberOfLines={1}>
              {item?.provider || 'OER'}
            </Text>
          </View>

          {finalSrc ? (
            <Pressable
              onPress={() => openExternally(finalSrc || resolvedSrc || rawSrc)}
              style={tw`rounded-xl h-9 px-3 bg-white dark:bg-[#0f1821] items-center justify-center border border-[#cedbe8] dark:border-darkCard`}
            >
              <Text style={tw`text-xs font-semibold text-[#0d141c] dark:text-white`}>Open</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Canvas */}
      <View style={tw`flex-1`}>
        {loading ? (
          <View style={tw`flex-1 items-center justify-center`}>
            <ActivityIndicator />
            <Text style={tw`mt-2 text-[#49739c] dark:text-white/70`}>Loading resource…</Text>
          </View>
        ) : error ? (
          <View style={tw`flex-1 items-center justify-center px-6`}>
            <Text style={tw`text-red-600 text-center`}>{error}</Text>
          </View>
        ) : finalSrc ? (
          <WebView
            key={finalSrc}
            style={tw`flex-1`}
            source={{
              uri: finalSrc,
              ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
            }}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            allowsFullscreenVideo
            allowsInlineMediaPlayback
          />
        ) : (
          <View style={tw`flex-1 items-center justify-center px-6`}>
            <Text style={tw`text-[#49739c] dark:text-white/70 text-center`}>
              No URL available for this resource.
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

export default OerReaderFullNative;
