// apps/mobile/src/screens/CertificateButton.native.tsx
import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  useColorScheme,
  Linking,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { useShopContext } from '@mytutorapp/shared/context';
import { useCertificate } from '@mytutorapp/shared/hooks';
import { getCertificateDownloadUrl } from '@mytutorapp/shared/api';
import tw from '../../tailwind';

type Props = {
  courseId: string;
  justPassed?: boolean;
};

// TS-safe alias so we can access documentDirectory/cacheDirectory
const FS: any = FileSystem;

/**
 * STRICTLY NATIVE CertificateButton
 * - Prefers certificate.download_url / certificate.url (Cloudinary).
 * - Downloads via expo-file-system when possible.
 * - Gracefully falls back to Linking.openURL(url) if anything fails.
 * - No document/window/localStorage usage here.
 */
const CertificateButton: React.FC<Props> = ({ courseId, justPassed }) => {
  const { backendUrl, token } = useShopContext();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { eligible, eligibilityReason, certificate, loading, error, generate } = useCertificate({
    backendUrl,
    token,
    courseId,
    justPassed,
  });

  const [downloading, setDownloading] = useState(false);

  const filename = useMemo(() => {
    const anyCert = certificate as any;
    const raw =
      anyCert?.filename ||
      anyCert?.course_title ||
      anyCert?.course?.title ||
      `certificate-${anyCert?.id ?? courseId}`;
    const clean = String(raw)
      .replace(/[^\w\s.-]+/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase();
    return `${clean}.pdf`;
  }, [certificate, courseId]);

  const resolveDownloadUrl = useCallback(() => {
    if (!certificate) return null;
    const anyCert = certificate as any;

    // 1) Prefer server-provided download_url
    if (anyCert?.download_url && typeof anyCert.download_url === 'string') {
      return anyCert.download_url as string;
    }

    // 2) Then Cloudinary file URL saved on the row
    if (anyCert?.url && typeof anyCert.url === 'string') {
      return anyCert.url as string;
    }

    // 3) Fallback: secure /api/.../download route
    const id = anyCert?.id as string | undefined;
    if (id) {
      return getCertificateDownloadUrl(backendUrl, id);
    }

    return null;
  }, [certificate, backendUrl]);

  const openExternal = useCallback(async (url: string | null) => {
    if (!url) return;
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) {
        Alert.alert('Cannot open link', url);
        return;
      }
      await Linking.openURL(url);
    } catch (e: any) {
      Alert.alert('Cannot open link', e?.message || 'Unknown error');
    }
  }, []);

  /** Native download using expo-file-system, with robust fallback */
  const onDownload = useCallback(async () => {
    if (!certificate || downloading) return;

    const url = resolveDownloadUrl();

    if (!url) {
      Alert.alert(
        'Download unavailable',
        'No download link is configured for this certificate yet.'
      );
      return;
    }

    try {
      setDownloading(true);

      // Use FS alias so TS doesn't complain about these properties
      const docDir = (FS.documentDirectory as string | null | undefined) ?? null;
      const cacheDir = (FS.cacheDirectory as string | null | undefined) ?? null;
      const baseDir = docDir ?? cacheDir;

      // If Expo doesn't give us a writable directory, just open the URL.
      if (!baseDir) {
        // eslint-disable-next-line no-console
        console.warn(
          '[cert-btn(native)] No writable directory from FileSystem; opening in external viewer instead.'
        );
        await openExternal(url);
        return;
      }

      const targetUri = baseDir + filename;

      const anyCert = certificate as any;
      const usingApiRoute = url.includes('/api/certificates/') && url.includes('/download');

      const options =
        usingApiRoute && token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;

      const result = await FS.downloadAsync(url, targetUri, options);

      if (result.status && result.status !== 200 && result.status !== 201) {
        // eslint-disable-next-line no-console
        console.error('[cert-btn(native)] HTTP status', result.status);
        // Last-chance fallback: try to open the URL directly
        await openExternal(url);
        return;
      }

      Alert.alert(
        'Certificate saved',
        'Your certificate PDF has been downloaded. Open it from your Files / Documents app.'
      );
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[cert-btn(native)] download error', e);

      // Try to at least open the URL so the user sees something
      try {
        await openExternal(resolveDownloadUrl());
      } catch {
        Alert.alert(
          'Download failed',
          e?.message || 'Failed to download certificate. Please try again.'
        );
      }
    } finally {
      setDownloading(false);
    }
  }, [certificate, downloading, filename, token, resolveDownloadUrl, openExternal]);

  /* -------------------- Certificate already issued -------------------- */
  if (certificate) {
    const certId = (certificate as any).id;

    return (
      <View style={tw`flex-row flex-wrap items-center gap-2 mt-2`}>
        {/* Download */}
        <TouchableOpacity
          accessibilityRole="button"
          onPress={onDownload}
          disabled={downloading}
          style={tw.style(
            `rounded-xl h-10 px-4 justify-center`,
            `bg-emerald-600`,
            downloading && `opacity-70`
          )}
        >
          {downloading ? (
            <View style={tw`flex-row items-center gap-2`}>
              <ActivityIndicator color="#ffffff" />
              <Text style={tw`text-xs font-semibold text-white`}>Downloading…</Text>
            </View>
          ) : (
            <Text style={tw`text-sm font-semibold text-white`}>Download Certificate</Text>
          )}
        </TouchableOpacity>

        {/* Verify – opens public verify page in browser */}
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() =>
            openExternal(
              `${backendUrl.replace(/\/+$/, '')}/verify/${encodeURIComponent(certId as string)}`
            )
          }
          style={tw.style(`rounded-xl h-10 px-4 justify-center`, `bg-[#e7edf4] dark:bg-[#172534]`)}
        >
          <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white`}>Verify</Text>
        </TouchableOpacity>
      </View>
    );
  }

  /* -------------------- No certificate yet → Generate flow -------------------- */
  const disabled = !eligible || loading;

  return (
    <View style={tw`mt-2 gap-2`}>
      <TouchableOpacity
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => generate().catch(() => {})}
        style={tw.style(
          `rounded-xl h-10 px-4 justify-center`,
          eligible ? `bg-[#2563eb] dark:bg-[#2563eb]` : `bg-[#e5e7eb] dark:bg-[#1f2933]`,
          disabled && `opacity-60`
        )}
      >
        {loading ? (
          <View style={tw`flex-row items-center gap-2`}>
            <ActivityIndicator color={eligible ? '#ffffff' : isDark ? '#9ca3af' : '#6b7280'} />
            <Text
              style={tw.style(
                `text-xs font-semibold`,
                eligible ? `text-white` : `text-[#6b7280] dark:text-[#9ca3af]`
              )}
            >
              Generating…
            </Text>
          </View>
        ) : (
          <Text
            style={tw.style(
              `text-sm font-semibold`,
              eligible ? `text-white` : `text-[#6b7280] dark:text-[#9ca5af]`
            )}
          >
            Generate Certificate
          </Text>
        )}
      </TouchableOpacity>

      {!eligible && !!eligibilityReason && (
        <Text style={tw`text-xs text-[#49739c] dark:text-[#8fb4e5]`}>{eligibilityReason}</Text>
      )}

      {!!error && <Text style={tw`text-xs text-[#ef4444] dark:text-[#fca5a5]`}>{error}</Text>}
    </View>
  );
};

export default CertificateButton;
