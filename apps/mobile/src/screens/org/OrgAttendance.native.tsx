// apps/mobile/src/screens/org/OrgAttendance.native.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import tw from '../../../tailwind';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { useOrgAttendance } from '@mytutorapp/shared/hooks/useOrgAttendance';
import type { OrgAttendanceSession } from '@mytutorapp/shared/types';
import { format } from 'date-fns';

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

const SessionCard = ({ session, onMark }: { session: OrgAttendanceSession; onMark?: () => void }) => (
  <View style={[tw`rounded-2xl p-3 mb-3`, { backgroundColor: '#0b1620', borderColor: '#1f2c3a', borderWidth: 1 }]}> 
    <Text style={tw`text-white font-semibold`}>
      {session.session_date ? format(new Date(session.session_date), 'PPP') : 'Session'}
    </Text>
    <Text style={tw`text-xs text-slate-400 mt-1`}>
      {(session.class_label || 'General') + (session.period_label ? ` • ${session.period_label}` : '')}
    </Text>
    {session.entries?.length ? (
      <Text style={tw`text-xs text-slate-300 mt-1`}>{session.entries.length} entries</Text>
    ) : (
      <Text style={tw`text-xs text-slate-500 mt-1`}>No marks yet</Text>
    )}
    {onMark ? (
      <TouchableOpacity
        onPress={onMark}
        style={[tw`mt-3 rounded-xl px-3 py-2`, { backgroundColor: '#2563eb' }]}
      >
        <Text style={tw`text-white text-sm font-semibold`}>Mark everyone present</Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

export default function OrgAttendanceNative() {
  const { isPro, upgradeCta } = useOrgProTools();
  const { sessions, loading, saving, fetchSessions, saveSession, saveEntries } = useOrgAttendance();

  const [form, setForm] = useState({ session_date: '', class_label: '', period_label: '' });

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const canSubmit = useMemo(() => Boolean(form.session_date), [form.session_date]);

  const handleCreate = async () => {
    if (!canSubmit) return;
    try {
      await saveSession({
        session_date: form.session_date,
        class_label: form.class_label || undefined,
        period_label: form.period_label || undefined,
      });
      setForm({ session_date: '', class_label: '', period_label: '' });
    } catch (err) {
      Alert.alert('Could not create session', (err as Error)?.message ?? 'Please try again.');
    }
  };

  const bulkPresent = async (sessionId: number) => {
    try {
      await saveEntries(sessionId, []);
      Alert.alert('Marked', 'Entries refreshed for this session.');
    } catch (err) {
      Alert.alert('Unable to save entries', (err as Error)?.message ?? 'Try again later');
    }
  };

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
          <View style={[tw`rounded-2xl p-4 mb-3`, { backgroundColor: '#0b1620', borderColor: '#1f2c3a', borderWidth: 1 }]}> 
            <Text style={tw`text-white font-semibold`}>Create session</Text>
            <Text style={tw`text-xs text-slate-400 mt-1`}>Select a date and optional labels.</Text>
            <Field
              label="Session date (YYYY-MM-DD)"
              value={form.session_date}
              placeholder="2025-02-14"
              onChangeText={(session_date: string) => setForm((prev) => ({ ...prev, session_date }))}
            />
            <Field
              label="Class label"
              value={form.class_label}
              placeholder="Grade 9"
              onChangeText={(class_label: string) => setForm((prev) => ({ ...prev, class_label }))}
            />
            <Field
              label="Period label"
              value={form.period_label}
              placeholder="Morning"
              onChangeText={(period_label: string) => setForm((prev) => ({ ...prev, period_label }))}
            />
            <TouchableOpacity
              disabled={!canSubmit || saving}
              onPress={handleCreate}
              style={[tw`rounded-xl px-3 py-2`, { backgroundColor: canSubmit ? '#2563eb' : '#1e293b' }]}
            >
              <Text style={tw`text-white text-sm font-semibold`}>{saving ? 'Saving…' : 'Save session'}</Text>
            </TouchableOpacity>
          </View>

          <View style={[tw`rounded-2xl p-4`, { backgroundColor: '#0b1620', borderColor: '#1f2c3a', borderWidth: 1 }]}> 
            <View style={tw`flex-row justify-between items-center mb-2`}>
              <Text style={tw`text-white font-semibold`}>Recent sessions</Text>
              <TouchableOpacity onPress={() => fetchSessions()}>
                <Text style={tw`text-xs text-blue-300`}>Refresh</Text>
              </TouchableOpacity>
            </View>
            {loading ? <ActivityIndicator color="#bfdbfe" /> : null}
            {!loading && !sessions.length ? (
              <Text style={tw`text-xs text-slate-500`}>No sessions yet.</Text>
            ) : (
              sessions.map((session) => (
                <SessionCard key={session.id} session={session} onMark={() => bulkPresent(session.id)} />
              ))
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
