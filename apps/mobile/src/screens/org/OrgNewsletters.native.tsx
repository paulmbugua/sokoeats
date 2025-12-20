// apps/mobile/src/screens/org/OrgNewsletters.native.tsx
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import tw from '../../../tailwind';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';

export default function OrgNewslettersNative() {
  const { isPro, upgradeCta } = useOrgProTools();

  return (
    <ScrollView style={[tw`flex-1`, { backgroundColor: '#020617' }]} contentContainerStyle={tw`p-4`}>
      <Text style={[tw`text-xs uppercase text-blue-300`]}>Org tools</Text>
      <Text style={[tw`text-2xl font-extrabold text-white mt-1`]}>Newsletters</Text>
      <Text style={[tw`text-sm text-slate-300 mt-1`]}>Generate Markdown drafts and mark them as sent.</Text>

      {!isPro && upgradeCta ? (
        <View style={[tw`mt-4 rounded-2xl p-4`, { backgroundColor: '#2a1200', borderColor: '#f59e0b', borderWidth: 1 }]}> 
          <Text style={[tw`text-base font-semibold text-amber-200`]}>{upgradeCta.headline}</Text>
          <Text style={[tw`text-sm text-amber-100 mt-1`]}>{upgradeCta.body}</Text>
        </View>
      ) : (
        <View style={[tw`mt-4 rounded-2xl p-4`, { backgroundColor: '#0b1620', borderColor: '#1f2c3a', borderWidth: 1 }]}> 
          <Text style={tw`text-base font-semibold text-white`}>Drafts</Text>
          <Text style={tw`text-sm text-slate-300 mt-1`}>Reuse AI templates and export a print-friendly PDF.</Text>
          <TouchableOpacity style={[tw`mt-3 rounded-xl px-3 py-2`, { backgroundColor: '#2563eb' }]}> 
            <Text style={tw`text-white text-sm font-semibold`}>New draft</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[tw`mt-3 rounded-xl px-3 py-2 border`, { borderColor: '#334155' }]}> 
            <Text style={tw`text-slate-200 text-sm font-semibold`}>View archive</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}
