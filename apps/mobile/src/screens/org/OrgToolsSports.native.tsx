// apps/mobile/src/screens/org/OrgToolsSports.native.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import tw from '../../../tailwind';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { useOrgSports } from '@mytutorapp/shared/hooks/useOrgSports';

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

export default function OrgToolsSportsNative() {
  const { isPro, upgradeCta } = useOrgProTools();
  const { events, loading, saving, fetchEvents, saveEvent, editEvent } = useOrgSports();

  const [form, setForm] = useState({ title: '', start_at: '', end_at: '', location: '' });

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const canSave = useMemo(() => Boolean(form.title), [form.title]);

  const handleSave = async () => {
    if (!canSave) return;
    try {
      await saveEvent({
        title: form.title,
        start_at: form.start_at || undefined,
        end_at: form.end_at || undefined,
        location: form.location || undefined,
      });
      setForm({ title: '', start_at: '', end_at: '', location: '' });
    } catch (err) {
      Alert.alert('Cannot save event', (err as Error)?.message ?? 'Try again later');
    }
  };

  return (
    <ScrollView style={[tw`flex-1`, { backgroundColor: '#020617' }]} contentContainerStyle={tw`p-4`}>
      <Text style={[tw`text-xs uppercase text-blue-300`]}>Org tools</Text>
      <Text style={[tw`text-2xl font-extrabold text-white mt-1`]}>Sports calendar</Text>
      <Text style={[tw`text-sm text-slate-300 mt-1`]}>Manage fixtures and practice sessions.</Text>

      {!isPro && upgradeCta ? (
        <View style={[tw`mt-4 rounded-2xl p-4`, { backgroundColor: '#2a1200', borderColor: '#f59e0b', borderWidth: 1 }]}> 
          <Text style={[tw`text-base font-semibold text-amber-200`]}>{upgradeCta.headline}</Text>
          <Text style={[tw`text-sm text-amber-100 mt-1`]}>{upgradeCta.body}</Text>
        </View>
      ) : (
        <View style={tw`mt-4`}>
          <View style={[tw`rounded-2xl p-4 mb-3`, { backgroundColor: '#0b1620', borderColor: '#1f2c3a', borderWidth: 1 }]}> 
            <Text style={tw`text-white font-semibold`}>Add event</Text>
            <Field label="Title" value={form.title} placeholder="Inter-school meet" onChangeText={(title: string) => setForm((p) => ({ ...p, title }))} />
            <Field
              label="Start at (ISO)"
              value={form.start_at}
              placeholder="2025-03-01T09:00:00Z"
              onChangeText={(start_at: string) => setForm((p) => ({ ...p, start_at }))}
            />
            <Field
              label="End at (ISO)"
              value={form.end_at}
              placeholder="2025-03-01T11:00:00Z"
              onChangeText={(end_at: string) => setForm((p) => ({ ...p, end_at }))}
            />
            <Field
              label="Location"
              value={form.location}
              placeholder="Stadium"
              onChangeText={(location: string) => setForm((p) => ({ ...p, location }))}
            />
            <TouchableOpacity
              disabled={!canSave || saving}
              onPress={handleSave}
              style={[tw`rounded-xl px-3 py-2`, { backgroundColor: canSave ? '#2563eb' : '#1e293b' }]}
            >
              <Text style={tw`text-white text-sm font-semibold`}>{saving ? 'Saving…' : 'Save event'}</Text>
            </TouchableOpacity>
          </View>

          <View style={[tw`rounded-2xl p-4`, { backgroundColor: '#0b1620', borderColor: '#1f2c3a', borderWidth: 1 }]}> 
            <View style={tw`flex-row justify-between items-center mb-2`}>
              <Text style={tw`text-white font-semibold`}>Upcoming events</Text>
              <TouchableOpacity onPress={() => fetchEvents()}>
                <Text style={tw`text-xs text-blue-300`}>Refresh</Text>
              </TouchableOpacity>
            </View>
            {loading ? <ActivityIndicator color="#bfdbfe" /> : null}
            {!loading && !events.length ? (
              <Text style={tw`text-xs text-slate-500`}>No events yet.</Text>
            ) : (
              events.map((evt) => (
                <View
                  key={evt.id}
                  style={[tw`rounded-xl p-3 mb-2`, { backgroundColor: '#0f172a', borderColor: '#1f2c3a', borderWidth: 1 }]}
                >
                  <Text style={tw`text-white font-semibold`}>{evt.title}</Text>
                  <Text style={tw`text-xs text-slate-400 mt-1`}>
                    {evt.start_at || 'TBC'} {evt.location ? `• ${evt.location}` : ''}
                  </Text>
                  {evt.status !== 'completed' && (
                    <TouchableOpacity
                      onPress={() => editEvent(evt.id, { status: 'completed' })}
                      style={[tw`mt-2 self-start rounded-lg px-3 py-1`, { backgroundColor: '#2563eb' }]}
                    >
                      <Text style={tw`text-white text-xs font-semibold`}>Mark complete</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
