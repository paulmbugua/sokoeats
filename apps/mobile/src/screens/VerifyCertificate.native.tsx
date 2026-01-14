// apps/mobile/src/pages/VerifyCertificate.native.tsx
import React, { useMemo } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Linking,
} from 'react-native';
import { useNavigation, useRoute, RouteProp, NavigationProp } from '@react-navigation/native';
import tw from '../../tailwind';

import { useVerifyCertificate } from '@mytutorapp/shared/hooks/useVerifyCertificate';
import { useShopContext } from '@mytutorapp/shared/context';

// Update this to match your real navigator types if different.
// ✅ Now supports BOTH "id" (UUID) and "certNo" (certificate number) like web routes:
//   - /verify/:id        => { id }
//   - /verify/no/:certNo => { certNo }
type RootStackParamList = {
  VerifyCertificate: { id?: string; certNo?: string } | undefined;
  VerifyCertificatePrint: { id: string };
  Home: undefined;
};

type RouteP = RouteProp<RootStackParamList, 'VerifyCertificate'>;

const VerifyCertificateScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteP>();
  const { backendUrl } = useShopContext();

  const certificateId = String(route.params?.id ?? '').trim();
  const certNo = String(route.params?.certNo ?? '').trim();

  // Public, no-auth verify call (parity with web)
  const { data, loading, error } = useVerifyCertificate({
    backendUrl,
    certificateId: certificateId || undefined,
    certNo: certNo || undefined,
  });

  const isValid = Boolean(data?.valid && data?.certificate);

  const certIdFromData = useMemo(() => {
    if (!data?.valid) return '';
    return String(data?.certificate?.id ?? '').trim();
  }, [data?.valid, data?.certificate?.id]);

  const certNoFromData = useMemo(() => {
    if (!data?.valid) return '';
    return String((data as any)?.certificate?.certificate_number ?? '').trim();
  }, [data?.valid, (data as any)?.certificate?.certificate_number]);

  // print expects UUID (same as web)
  const printId = certIdFromData || certificateId;

  const issuedAt = useMemo(() => {
    try {
      const raw = (data as any)?.certificate?.issued_at;
      return raw ? new Date(raw).toLocaleString() : '-';
    } catch {
      return '-';
    }
  }, [(data as any)?.certificate?.issued_at]);

  const onOpenPdf = async () => {
    const url = String((data as any)?.certificate?.url ?? '').trim();
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      // no-op
    }
  };

  const onPrint = () => {
    if (!printId) return;
    navigation.navigate('VerifyCertificatePrint', { id: printId });
  };

  const onBackHome = () => navigation.navigate('Home');

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50`}>
      <ScrollView contentContainerStyle={tw`px-4 py-8`}>
        {/* Header (match web layout intent) */}
        <View style={tw`flex-row items-center gap-3 mb-8`}>
          <View style={tw`w-6 h-6 items-center justify-center`}>
            <Text style={tw`text-[#0d141c] text-lg`}>◉</Text>
          </View>
          <Text style={tw`text-2xl font-bold text-[#0d141c]`}>Verify Certificate</Text>
        </View>

        {/* Loading (match copy) */}
        {loading && (
          <View style={tw`rounded-xl border border-[#cedbe8] bg-white p-6`}>
            <View style={tw`flex-row items-center gap-3`}>
              <ActivityIndicator />
              <Text style={tw`text-[#0d141c]`}>Verifying…</Text>
            </View>
          </View>
        )}

        {/* Error */}
        {!loading && !!error && (
          <View style={tw`rounded-xl border border-red-200 bg-white p-6`}>
            <Text style={tw`text-red-600 font-semibold`}>Verification Error</Text>
            <Text style={tw`text-sm text-[#49739c] mt-2`}>{String(error)}</Text>
          </View>
        )}

        {/* Result */}
        {!loading &&
          !error &&
          data &&
          (isValid ? (
            <View style={tw`rounded-2xl border border-[#cedbe8] bg-white p-6`}>
              <View style={tw`flex-row items-center gap-2 mb-4`}>
                <View style={tw`w-6 h-6 rounded-full bg-green-100 items-center justify-center`}>
                  <Text style={tw`text-green-700 font-bold`}>✓</Text>
                </View>
                <Text style={tw`text-green-700 font-semibold`}>Valid Certificate</Text>
              </View>

              <View style={tw`gap-2`}>
                {/* ✅ parity: show Certificate Number row */}
                <DetailRow
                  label="Certificate Number"
                  value={certNoFromData || (certNo || '-')}
                />
                <DetailRow label="Certificate ID" value={(data as any)?.certificate?.id} />
                <DetailRow label="Student" value={(data as any)?.certificate?.student_name} />
                <DetailRow label="Course" value={(data as any)?.certificate?.course_title} />
                <DetailRow label="Issued At" value={issuedAt} />
              </View>

              <View style={tw`pt-4 flex-row flex-wrap gap-3`}>
                {!!(data as any)?.certificate?.url && (
                  <Pressable
                    onPress={onOpenPdf}
                    style={tw`h-10 px-4 rounded-xl bg-blue-600 items-center justify-center`}
                  >
                    <Text style={tw`text-white font-semibold`}>View / Download PDF</Text>
                  </Pressable>
                )}

                {/* ✅ parity: only show Print if we have a UUID */}
                {!!printId && (
                  <Pressable
                    onPress={onPrint}
                    style={tw`h-10 px-4 rounded-xl bg-white items-center justify-center border border-[#cedbe8]`}
                  >
                    <Text style={tw`font-semibold text-[#0d141c]`}>Print View</Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={onBackHome}
                  style={tw`h-10 px-4 rounded-xl bg-[#e7edf4] items-center justify-center`}
                >
                  <Text style={tw`font-semibold text-[#0d141c]`}>Back Home</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={tw`rounded-xl border border-red-200 bg-white p-6`}>
              <Text style={tw`text-red-600 font-semibold`}>Invalid Certificate</Text>
              <Text style={tw`text-sm text-[#49739c] mt-2`}>
                {(data as any)?.error || 'No matching certificate found.'}
              </Text>
            </View>
          ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const DetailRow: React.FC<{ label: string; value?: string | number | null }> = ({
  label,
  value,
}) => (
  <View style={tw`flex-row items-center justify-between`}>
    <Text style={tw`text-sm text-[#49739c]`}>{label}</Text>
    <Text style={tw`text-sm font-medium text-[#0d141c]`}>{value ?? '-'}</Text>
  </View>
);

export default VerifyCertificateScreen;
