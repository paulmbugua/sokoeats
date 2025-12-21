// apps/mobile/src/screens/org/OrgToolsClubs.native.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import tw from '../../../tailwind';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { useOrgClubs } from '@mytutorapp/shared/hooks/useOrgClubs';

const Field = ({ label, value, onChangeText, placeholder }: any) => (
  <View style={tw`mb-3`}>
    <Text style={tw`text-xs text-slate-400`}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#94a3b8"
      style={tw`mt-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white`}
    />
  </View>
);

export default function OrgToolsClubsNative() {
  const { isPro, upgradeCta } = useOrgProTools();
  const { clubs, members, myClubs, loading, saving, fetchClubs, fetchMyClubs, fetchMembers, saveClub, enrollMember } = useOrgClubs();

  const [form, setForm] = useState({ name: '', description: '' });
  const [enrollForm, setEnrollForm] = useState({ clubId: '', member_id: '', role: '' });

  useEffect(() => {
    fetchClubs();
    fetchMyClubs();
  }, [fetchClubs, fetchMyClubs]);

  const canCreate = useMemo(() => Boolean(form.name), [form.name]);
  const canEnroll = useMemo(() => Boolean(enrollForm.clubId && enrollForm.member_id), [enrollForm.clubId, enrollForm.member_id]);

  const handleSave = async () => {
    if (!canCreate) return;
    try {
      await saveClub({ name: form.name, description: form.description || undefined });
      setForm({ name: '', description: '' });
    } catch (err) {
      Alert.alert('Cannot create club', (err as Error)?.message ?? 'Try again later');
    }
  };

  const handleEnroll = async () => {
    if (!canEnroll) return;
    try {
      await enrollMember(Number(enrollForm.clubId), {
        member_id: enrollForm.member_id,
        role: enrollForm.role || undefined,
      });
      fetchMembers(Number(enrollForm.clubId));
    } catch (err) {
      Alert.alert('Cannot enroll', (err as Error)?.message ?? 'Try again later');
    }
  };

  return (
    <ScrollView style={[tw`flex-1`, { backgroundColor: '#020617' }]} contentContainerStyle={tw`p-4`}>
      <Text style={[tw`text-xs uppercase text-blue-300`]}>Org tools</Text>
      <Text style={[tw`text-2xl font-extrabold text-white mt-1`]}>Clubs & societies</Text>
      <Text style={[tw`text-sm text-slate-300 mt-1`]}>Create clubs and enroll members.</Text>

      {!isPro && upgradeCta ? (
        <View style={[tw`mt-4 rounded-2xl p-4`, { backgroundColor: '#2a1200', borderColor: '#f59e0b', borderWidth: 1 }]}> 
          <Text style={[tw`text-base font-semibold text-amber-200`]}>{upgradeCta.headline}</Text>
          <Text style={[tw`text-sm text-amber-100 mt-1`]}>{upgradeCta.body}</Text>
        </View>
      ) : (
        <View style={tw`mt-4`}>
          <View style={[tw`rounded-2xl p-4 mb-3`, { backgroundColor: '#0b1620', borderColor: '#1f2c3a', borderWidth: 1 }]}> 
            <Text style={tw`text-white font-semibold`}>Create club</Text>
            <Field label="Name" value={form.name} placeholder="STEM Club" onChangeText={(name: string) => setForm((p) => ({ ...p, name }))} />
            <Field
              label="Description"
              value={form.description}
              placeholder="Weekly labs and robotics"
              onChangeText={(description: string) => setForm((p) => ({ ...p, description }))}
            />
            <TouchableOpacity
              disabled={!canCreate || saving}
              onPress={handleSave}
              style={[tw`rounded-xl px-3 py-2`, { backgroundColor: canCreate ? '#2563eb' : '#1e293b' }]}
            >
              <Text style={tw`text-white text-sm font-semibold`}>{saving ? 'Saving…' : 'Save club'}</Text>
            </TouchableOpacity>
          </View>

          <View style={[tw`rounded-2xl p-4 mb-3`, { backgroundColor: '#0b1620', borderColor: '#1f2c3a', borderWidth: 1 }]}> 
            <Text style={tw`text-white font-semibold`}>Enroll member</Text>
            <Field
              label="Club ID"
              value={enrollForm.clubId}
              placeholder="1"
              onChangeText={(clubId: string) => setEnrollForm((p) => ({ ...p, clubId }))}
            />
            <Field
              label="Learner ID"
              value={enrollForm.member_id}
              placeholder="learner-123"
              onChangeText={(member_id: string) => setEnrollForm((p) => ({ ...p, member_id }))}
            />
            <Field
              label="Role (optional)"
              value={enrollForm.role}
              placeholder="captain"
              onChangeText={(role: string) => setEnrollForm((p) => ({ ...p, role }))}
            />
            <TouchableOpacity
              disabled={!canEnroll || saving}
              onPress={handleEnroll}
              style={[tw`rounded-xl px-3 py-2`, { backgroundColor: canEnroll ? '#2563eb' : '#1e293b' }]}
            >
              <Text style={tw`text-white text-sm font-semibold`}>{saving ? 'Enrolling…' : 'Enroll member'}</Text>
            </TouchableOpacity>
          </View>

          <View style={[tw`rounded-2xl p-4`, { backgroundColor: '#0b1620', borderColor: '#1f2c3a', borderWidth: 1 }]}> 
            <View style={tw`flex-row justify-between items-center mb-2`}>
              <Text style={tw`text-white font-semibold`}>Clubs</Text>
              <TouchableOpacity onPress={() => fetchClubs()}>
                <Text style={tw`text-xs text-blue-300`}>Refresh</Text>
              </TouchableOpacity>
            </View>
            {loading ? <ActivityIndicator color="#bfdbfe" /> : null}
            {!loading && !clubs.length ? (
              <Text style={tw`text-xs text-slate-500`}>No clubs yet.</Text>
            ) : (
              clubs.map((club) => (
                <TouchableOpacity
                  key={club.id}
                  onPress={() => fetchMembers(club.id)}
                  style={[tw`rounded-xl p-3 mb-2`, { backgroundColor: '#0f172a', borderColor: '#1f2c3a', borderWidth: 1 }]}
                >
                  <Text style={tw`text-white font-semibold`}>{club.name}</Text>
                  <Text style={tw`text-xs text-slate-400 mt-1`}>{club.description || 'No description'}</Text>
                  {members.length && members[0]?.club_id === club.id ? (
                    <Text style={tw`text-[11px] text-slate-400 mt-1`}>{members.length} members</Text>
                  ) : null}
                </TouchableOpacity>
              ))
            )}
            {myClubs.length ? (
              <View style={tw`mt-3`}>
                <Text style={tw`text-xs text-slate-400 mb-1`}>My clubs</Text>
                {myClubs.map((club) => (
                  <Text key={club.id} style={tw`text-xs text-slate-300`}>
                    • {club.name}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
