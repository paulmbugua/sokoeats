// apps/mobile/src/screens/org/OrgAnnouncements.native.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Switch, ActivityIndicator, Alert, Share } from 'react-native';
import tw from '../../../tailwind';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { useOrgAnnouncements } from '@mytutorapp/shared/hooks/useOrgAnnouncements';
import type { OrgAnnouncement } from '@mytutorapp/shared/types';

const Field = ({ label, value, onChangeText, placeholder, multiline = false }: any) => (
  <View style={tw`mb-3`}>
    <Text style={tw`text-xs text-slate-400`}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#94a3b8"
      multiline={multiline}
      numberOfLines={multiline ? 3 : 1}
      style={tw`mt-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white ${
        multiline ? 'h-24 text-sm' : ''
      }`}
    />
  </View>
);

const AnnouncementCard = ({
  item,
  onShare,
}: {
  item: OrgAnnouncement;
  onShare: (id: number) => Promise<void>;
}) => (
  <View style={[tw`rounded-2xl p-3 mb-3`, { backgroundColor: '#0b1620', borderColor: '#1f2c3a', borderWidth: 1 }]}> 
    <Text style={tw`text-white font-semibold`}>{item.title}</Text>
    <Text style={tw`text-xs text-slate-400 mt-1`}>{item.kind === 'agm' ? 'AGM' : 'General'}</Text>
    <Text style={tw`text-sm text-slate-200 mt-2`}>{item.body}</Text>
    <View style={tw`flex-row mt-3 justify-between items-center`}>
      <Text style={tw`text-xs text-slate-500`}>
        {item.is_pinned ? 'Pinned • ' : ''}
        {item.visible_from ? `From ${item.visible_from}` : 'Live'}
      </Text>
      {item.kind === 'agm' && (
        <TouchableOpacity onPress={() => onShare(item.id)}>
          <Text style={tw`text-xs text-blue-300`}>Share AGM PDF</Text>
        </TouchableOpacity>
      )}
    </View>
  </View>
);

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function OrgAnnouncementsNative() {
  const { isPro, upgradeCta } = useOrgProTools();
  const { announcements, loading, saving, fetchAnnouncements, saveAnnouncement, downloadAgmPdf, backendUrl } =
    useOrgAnnouncements();

  const [form, setForm] = useState({ title: '', body: '', is_pinned: false, visible_from: '', visible_to: '', kind: 'general' });

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const canPost = useMemo(() => Boolean(form.title && form.body), [form.title, form.body]);

  const handleSave = async () => {
    if (!canPost) return;
    try {
      await saveAnnouncement({
        title: form.title,
        body: form.body,
        is_pinned: form.is_pinned,
        visible_from: form.visible_from || undefined,
        visible_to: form.visible_to || undefined,
        kind: form.kind as any,
      });
      setForm({ title: '', body: '', is_pinned: false, visible_from: '', visible_to: '', kind: 'general' });
    } catch (err) {
      Alert.alert('Unable to post', (err as Error)?.message ?? 'Try again later');
    }
  };

  const shareAgm = async (id: number) => {
    try {
      const blob = await downloadAgmPdf(id);
      if (!blob) return;
      const uri = await blobToDataUrl(blob as any);
      await Share.share({ url: uri, message: `${backendUrl}/org/announcements/${id}/agm.pdf` });
    } catch (err) {
      Alert.alert('Cannot share PDF', (err as Error)?.message ?? 'Try again later');
    }
  };

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
        <View style={tw`mt-4`}>
          <View style={[tw`rounded-2xl p-4 mb-3`, { backgroundColor: '#0b1620', borderColor: '#1f2c3a', borderWidth: 1 }]}> 
            <Text style={tw`text-white font-semibold`}>Post announcement</Text>
            <Field label="Title" value={form.title} placeholder="Weekly update" onChangeText={(title: string) => setForm((p) => ({ ...p, title }))} />
            <Field
              label="Body"
              value={form.body}
              multiline
              placeholder="Share key dates and reminders"
              onChangeText={(body: string) => setForm((p) => ({ ...p, body }))}
            />
            <View style={tw`flex-row items-center justify-between mb-2`}>
              <Text style={tw`text-xs text-slate-300`}>Pin announcement</Text>
              <Switch value={form.is_pinned} onValueChange={(is_pinned) => setForm((p) => ({ ...p, is_pinned }))} />
            </View>
            <Field
              label="Visible from (optional)"
              value={form.visible_from}
              placeholder="2025-02-14"
              onChangeText={(visible_from: string) => setForm((p) => ({ ...p, visible_from }))}
            />
            <Field
              label="Visible to (optional)"
              value={form.visible_to}
              placeholder="2025-02-20"
              onChangeText={(visible_to: string) => setForm((p) => ({ ...p, visible_to }))}
            />
            <View style={tw`flex-row items-center justify-between mb-3`}>
              <Text style={tw`text-xs text-slate-300`}>AGM announcement</Text>
              <Switch
                value={form.kind === 'agm'}
                onValueChange={(isAgm) => setForm((p) => ({ ...p, kind: isAgm ? 'agm' : 'general' }))}
              />
            </View>
            <TouchableOpacity
              disabled={!canPost || saving}
              onPress={handleSave}
              style={[tw`rounded-xl px-3 py-2`, { backgroundColor: canPost ? '#2563eb' : '#1e293b' }]}
            >
              <Text style={tw`text-white text-sm font-semibold`}>{saving ? 'Posting…' : 'Publish'}</Text>
            </TouchableOpacity>
          </View>

          <View style={[tw`rounded-2xl p-4`, { backgroundColor: '#0b1620', borderColor: '#1f2c3a', borderWidth: 1 }]}> 
            <View style={tw`flex-row justify-between items-center mb-2`}>
              <Text style={tw`text-white font-semibold`}>Recent posts</Text>
              <TouchableOpacity onPress={() => fetchAnnouncements()}>
                <Text style={tw`text-xs text-blue-300`}>Refresh</Text>
              </TouchableOpacity>
            </View>
            {loading ? <ActivityIndicator color="#bfdbfe" /> : null}
            {!loading && !announcements.length ? (
              <Text style={tw`text-xs text-slate-500`}>No announcements yet.</Text>
            ) : (
              announcements.map((a) => <AnnouncementCard key={a.id} item={a} onShare={shareAgm} />)
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
