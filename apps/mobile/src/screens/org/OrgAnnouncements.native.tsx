// apps/mobile/src/screens/org/OrgAnnouncements.native.tsx
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import tw from '../../../tailwind';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';

export default function OrgAnnouncementsNative() {
  const { isPro, upgradeCta } = useOrgProTools();

  return (
    <ScrollView style={[tw`flex-1`, { backgroundColor: '#020617' }]} contentContainerStyle={tw`p-4`}>
      <Text style={[tw`text-xs uppercase text-blue-300`]}>Org tools</Text>
      <Text style={[tw`text-2xl font-extrabold text-white mt-1`]}>Announcements</Text>
      <Text style={[tw`text-sm text-slate-300 mt-1`]}>Post pinned updates for learners and instructors.</Text>

      {!isPro && upgradeCta ? (
        <View style={[tw`mt-4 rounded-2xl p-4`, { backgroundColor: '#2a1200', borderColor: '#f59e0b', borderWidth: 1 }]}> 
          <Text style={[tw`text-base font-semibold text-amber-200`]}>{upgradeCta.headline}</Text>
          <Text style={[tw`text-sm text-amber-100 mt-1`]}>{upgradeCta.body}</Text>
        </View>
      ) : (
        <View style={[tw`mt-4 rounded-2xl p-4`, { backgroundColor: '#0b1620', borderColor: '#1f2c3a', borderWidth: 1 }]}> 
          <View style={tw`flex-row justify-between items-center`}>
            <View>
              <Text style={tw`text-base font-semibold text-white`}>Post announcement</Text>
              <Text style={tw`text-xs text-slate-400`}>Supports pinned posts and scheduling windows</Text>
            </View>
            <TouchableOpacity style={[tw`rounded-xl px-3 py-2`, { backgroundColor: '#2563eb' }]}> 
              <Text style={tw`text-white text-sm font-semibold`}>New post</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[tw`mt-3 rounded-xl px-3 py-2 border`, { borderColor: '#334155' }]}> 
            <Text style={tw`text-slate-200 text-sm font-semibold`}>Refresh feed</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}
