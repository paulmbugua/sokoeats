// apps/mobile/src/pages/VerifyCertificatePrint.native.tsx
import React, { useMemo } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  Pressable,
  Linking,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import tw from '../../tailwind';

import { useVerifyCertificate } from '@mytutorapp/shared/hooks/useVerifyCertificate';
import { useShopContext } from '@mytutorapp/shared/context';
import type { MainStackParamList } from '../navigation/types'; // <- use your centralized routes

type RouteP = RouteProp<MainStackParamList, 'VerifyCertificatePrint'>;

const VerifyCertificatePrintScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteP>();
  const { backendUrl } = useShopContext();

  const id = route.params?.id ?? '';

  const { data, loading, error } = useVerifyCertificate({
    backendUrl,
    certificateId: id,
  });

  const cert = data?.certificate;
  const isValid = Boolean(data?.valid && cert);

  const issuedOn = useMemo(() => {
    try {
      return cert?.issued_at ? new Date(cert.issued_at).toDateString() : '-';
    } catch {
      return '-';
    }
  }, [cert?.issued_at]);

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50`}>
      <ScrollView contentContainerStyle={tw`px-4 py-6`}>
        {/* Toolbar (mobile header) */}
        <View style={tw`flex-row items-center justify-between mb-4`}>
          <View style={tw`flex-row items-center gap-3`}>
            <Text style={tw`text-[#0d141c] text-xl font-bold`}>Verify Certificate (Print)</Text>
          </View>
          <View style={tw`flex-row gap-2`}>
            {!!cert?.url && (
              <Pressable
                onPress={() => Linking.openURL(String(cert.url))}
                style={tw`h-10 px-4 rounded-xl bg-blue-600 items-center justify-center`}
              >
                <Text style={tw`text-white font-semibold`}>Download PDF</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => navigation.navigate('VerifyCertificate', { id })}
              style={tw`h-10 px-4 rounded-xl bg-white border border-[#cedbe8] items-center justify-center`}
            >
              <Text style={tw`font-semibold text-[#0d141c]`}>Back</Text>
            </Pressable>
          </View>
        </View>

        {/* “Paper” container */}
        <View style={tw`items-center`}>
          <View style={tw`w-full rounded-2xl bg-white border border-[#e5e7eb] shadow`}>
            <View style={tw`p-5`}>
              {loading && (
                <View style={tw`flex-row items-center gap-3`}>
                  <ActivityIndicator />
                  <Text style={tw`text-[#0d141c]`}>Verifying…</Text>
                </View>
              )}

              {!loading && !!error && (
                <View style={tw`rounded-xl border border-red-200 bg-white p-4`}>
                  <Text style={tw`text-red-600 font-semibold`}>Verification Error</Text>
                  <Text style={tw`text-sm text-[#49739c] mt-2`}>{String(error)}</Text>
                </View>
              )}

              {!loading &&
                !!data &&
                (isValid ? (
                  <PrintableContent
                    certId={id}
                    issuedAt={issuedOn}
                    student={cert!.student_name ?? '-'}
                    course={cert!.course_title ?? '-'}
                    pdfUrl={cert!.url ?? ''}
                  />
                ) : (
                  <View style={tw`rounded-xl border border-red-200 bg-white p-4`}>
                    <Text style={tw`text-red-600 font-semibold`}>Invalid Certificate</Text>
                    <Text style={tw`text-sm text-[#49739c] mt-2`}>
                      {data.error || 'No matching certificate found.'}
                    </Text>
                  </View>
                ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const PrintableContent: React.FC<{
  certId: string;
  issuedAt: string;
  student: string;
  course: string;
  pdfUrl: string;
}> = ({ certId, issuedAt, student, course, pdfUrl }) => {
  return (
    <>
      {/* Header */}
      <View style={tw`flex-row items-center justify-between pb-4 border-b border-[#e5e7eb]`}>
        <View style={tw`flex-row items-center gap-3`}>
          <View style={tw`w-8 h-8 items-center justify-center`}>
            <Text style={tw`text-[#0d141c] text-lg font-bold`}>◎</Text>
          </View>
          <View>
            <Text style={tw`text-xs text-[#64748b]`}>EduConnect</Text>
            <Text style={tw`text-lg font-bold`}>Certificate Verification</Text>
          </View>
        </View>
        <View style={tw`items-end`}>
          <Text style={tw`text-xs text-[#64748b]`}>Certificate ID:</Text>
          <Text style={tw`font-mono text-[#0f172a]`}>{certId}</Text>
        </View>
      </View>

      {/* Body */}
      <View style={tw`py-8`}>
        <Text style={tw`text-2xl font-extrabold text-center`}>Valid Certificate</Text>
        <Text style={tw`text-center text-[#64748b] mt-1`}>
          This page confirms the authenticity of the certificate below.
        </Text>

        <View style={tw`mt-8 gap-4`}>
          <View style={tw`rounded-xl border border-[#e5e7eb] p-4`}>
            <Detail label="Student" value={student} />
            <Detail label="Course" value={course} />
            <Detail label="Issued On" value={issuedAt} />
            <Detail label="Certificate ID" value={certId} mono />
          </View>

          <View style={tw`rounded-xl border border-[#e5e7eb] p-4`}>
            <Text style={tw`text-sm text-[#64748b]`}>Certificate PDF</Text>
            <Pressable
              onPress={() => pdfUrl && Linking.openURL(pdfUrl)}
              style={tw`mt-2 rounded-lg border border-[#cedbe8] p-3`}
            >
              <Text style={tw`text-sm font-semibold text-blue-700`}>Open / Download PDF</Text>
            </Pressable>
            <Text style={tw`text-xs text-[#94a3b8] mt-2`}>
              The PDF contains branding, an instructor signature, and a QR verification link.
            </Text>
          </View>
        </View>

        <Text style={tw`mt-8 text-center text-xs text-[#94a3b8]`}>
          To verify offline, scan the QR on the certificate or visit yourdomain.example/verify/
          {certId}
        </Text>
      </View>

      {/* Footer */}
      <View style={tw`pt-4 border-t border-[#e5e7eb] items-center`}>
        <Text style={tw`text-xs text-[#94a3b8]`}>
          © {new Date().getFullYear()} EduConnect • https://yourdomain.example
        </Text>
      </View>
    </>
  );
};

const Detail: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <View style={tw`py-2`}>
    <Text style={tw`text-xs text-[#64748b]`}>{label}</Text>
    <Text style={[tw`text-sm font-semibold`, mono ? tw`font-mono` : null]}>{value}</Text>
  </View>
);

export default VerifyCertificatePrintScreen;
