// apps/mobile/src/screens/org/OrgAttendance.native.tsx
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import tw from '../../../tailwind';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';

const Card: React.FC<{ title: string; body: string; cta?: string }> = ({ title, body, cta }) => (
  <View style={[tw`rounded-2xl p-4 mb-3`, { backgroundColor: '#0b1620', borderColor: '#1f2c3a', borderWidth: 1 }]}>
    <Text style={[tw`text-base font-semibold text-white`]}>{title}</Text>
    <Text style={[tw`text-sm mt-1 text-slate-300`]}>{body}</Text>
    {cta ? (
      <TouchableOpacity style={[tw`mt-3 rounded-xl px-3 py-2`, { backgroundColor: '#2563eb' }]}> 
        <Text style={tw`text-white text-sm font-semibold`}>{cta}</Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

export default function OrgAttendanceNative() {
  const { isPro, upgradeCta } = useOrgProTools();

  return (
    <ScrollView style={[tw`flex-1`, { backgroundColor: '#020617' }]} contentContainerStyle={tw`p-4`}>
      <Text style={[tw`text-xs uppercase text-blue-300`]}>Org tools</Text>
      <Text style={[tw`text-2xl font-extrabold text-white mt-1`]}>Attendance</Text>
      <Text style={[tw`text-sm text-slate-300 mt-1`]}>Date-based sessions with bulk marking.</Text>

      {!isPro && upgradeCta ? (
        <View style={[tw`mt-4 rounded-2xl p-4`, { backgroundColor: '#2a1200', borderColor: '#f59e0b', borderWidth: 1 }]}> 
          <Text style={[tw`text-base font-semibold text-amber-200`]}>{upgradeCta.headline}</Text>
          <Text style={[tw`text-sm text-amber-100 mt-1`]}>{upgradeCta.body}</Text>
        </View>
      ) : (
        <View style={tw`mt-4`}>
          <Card title="Create session" body="Start a roll call for today and select class or period labels." cta="New session" />
          <Card title="Bulk mark learners" body="Tap a session to mark present, absent, late, or excused." cta="Open latest" />
          <Card title="Reports" body="Admins can export CSV summaries by date range." />
        </View>
      )}
    </ScrollView>
  );
}
