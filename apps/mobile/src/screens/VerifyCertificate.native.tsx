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

// If you use a typed navigator, replace "RootStackParamList" with your own.
type RootStackParamList = {
  VerifyCertificate: { id: string };
  VerifyCertificatePrint: { id: string };
  Home: undefined;
};

type RouteP = RouteProp<RootStackParamList, 'VerifyCertificate'>;

const VerifyCertificateScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteP>();
  const { backendUrl } = useShopContext();

  const id = route.params?.id ?? '';

  // Public, no-auth verify call
  const { data, loading, error } = useVerifyCertificate({
    backendUrl,
    certificateId: id,
  });

  const isValid = Boolean(data?.valid && data?.certificate);

  const issuedAt = useMemo(() => {
    try {
      return data?.certificate?.issued_at
        ? new Date(data.certificate.issued_at).toLocaleString()
        : '-';
    } catch {
      return '-';
    }
  }, [data?.certificate?.issued_at]);

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50`}>
      <ScrollView contentContainerStyle={tw`px-4 py-6`}>
        {/* Header */}
        <View style={tw`flex-row items-center gap-3 mb-6`}>
          <View style={tw`w-6 h-6`}>
            <Text style={tw`text-[#0d141c] font-bold`}>◉</Text>
          </View>
          <Text style={tw`text-2xl font-bold text-[#0d141c]`}>Verify Certificate</Text>
        </View>

        {/* Loading */}
        {loading && (
          <View
            style={tw`rounded-2xl border border-[#cedbe8] bg-white p-6 flex-row items-center gap-3`}
          >
            <ActivityIndicator />
            <Text style={tw`text-[#0d141c]`}>Verifying…</Text>
          </View>
        )}

        {/* Error */}
        {!loading && !!error && (
          <View style={tw`rounded-2xl border border-red-200 bg-white p-6`}>
            <Text style={tw`text-red-600 font-semibold`}>Verification Error</Text>
            <Text style={tw`text-sm text-[#49739c] mt-2`}>{String(error)}</Text>
          </View>
        )}

        {/* Result */}
        {!loading &&
          !error &&
          !!data &&
          (isValid ? (
            <View style={tw`rounded-2xl border border-[#cedbe8] bg-white p-6`}>
              <View style={tw`flex-row items-center gap-2 mb-3`}>
                <View style={tw`w-6 h-6 rounded-full bg-green-100 items-center justify-center`}>
                  <Text style={tw`text-green-700 font-bold`}>✓</Text>
                </View>
                <Text style={tw`text-green-700 font-semibold`}>Valid Certificate</Text>
              </View>

              <View style={tw`gap-2`}>
                <DetailRow label="Certificate ID" value={data.certificate?.id} />
                <DetailRow label="Student" value={data.certificate?.student_name} />
                <DetailRow label="Course" value={data.certificate?.course_title} />
                <DetailRow label="Issued At" value={issuedAt} />
              </View>

              <View style={tw`pt-3 flex-row flex-wrap gap-3`}>
                {!!data.certificate?.url && (
                  <Pressable
                    onPress={() => Linking.openURL(String(data.certificate?.url))}
                    style={tw`h-10 px-4 rounded-xl bg-blue-600 items-center justify-center`}
                  >
                    <Text style={tw`text-white font-semibold`}>View / Download PDF</Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={() => navigation.navigate('VerifyCertificatePrint', { id })}
                  style={tw`h-10 px-4 rounded-xl bg-white items-center justify-center border border-[#cedbe8]`}
                >
                  <Text style={tw`font-semibold text-[#0d141c]`}>Print View</Text>
                </Pressable>

                <Pressable
                  onPress={() => navigation.navigate('Home')}
                  style={tw`h-10 px-4 rounded-xl bg-[#e7edf4] items-center justify-center`}
                >
                  <Text style={tw`font-semibold text-[#0d141c]`}>Back Home</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={tw`rounded-2xl border border-red-200 bg-white p-6`}>
              <Text style={tw`text-red-600 font-semibold`}>Invalid Certificate</Text>
              <Text style={tw`text-sm text-[#49739c] mt-2`}>
                {data.error || 'No matching certificate found.'}
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
