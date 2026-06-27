import React, { useEffect, useState } from 'react';

import { View, Text, ScrollView, RefreshControl } from 'react-native';

import { useShopContext } from '@myhandymanapp/shared/context';

import { colors, spacing } from '../../theme/tokens';

import Chip from '../../components/Chip';

import Card from '../../components/Card';

type Job = { id: string; description: string; estate: string; city: string; scheduleType: string; status: string; quoteCount?: number; createdAt?: string };

export default function RequestsScreen({ navigation }: any) {

  const { http } = useShopContext();

  const [tab, setTab] = useState<'active' | 'completed' | 'cancelled'>('active');

  const [jobs, setJobs] = useState<Job[]>([]);

  const [loading, setLoading] = useState(false);

  const load = async () => {

    setLoading(true);

    try { const { data } = await http.get('/api/jobs', { params: { status: tab } }); setJobs(data.jobs || []); }

    finally { setLoading(false); }

  };

  useEffect(() => { void load(); }, [tab]);

  return <View style={{ flex: 1, backgroundColor: 'white' }}>

    <View style={{ padding: spacing.xl, paddingBottom: 10 }}><Text style={{ fontSize: 18, fontWeight: '900' }}>My Requests</Text><View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}><Chip label="Active" active={tab === 'active'} onPress={() => setTab('active')} /><Chip label="Completed" active={tab === 'completed'} onPress={() => setTab('completed')} /><Chip label="Cancelled" active={tab === 'cancelled'} onPress={() => setTab('cancelled')} /></View></View>

    <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} contentContainerStyle={{ padding: spacing.xl, paddingTop: 0 }}>

      {jobs.length ? jobs.map((job) => <Card key={job.id} style={{ marginBottom: 12 }}><Text style={{ fontWeight: '900', fontSize: 16 }}>{job.description}</Text><Text style={{ color: colors.muted, marginTop: 6 }}>{job.estate}, {job.city} - {job.scheduleType}</Text><Text style={{ color: colors.green, fontWeight: '900', marginTop: 10 }} onPress={() => navigation.navigate('QuotesInbox', { jobId: job.id })}>View {job.quoteCount ?? 0} quotes ?</Text></Card>) : <Card><Text style={{ color: colors.muted }}>No {tab} requests yet.</Text></Card>}

    </ScrollView>

  </View>;

}

