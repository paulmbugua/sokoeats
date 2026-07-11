import React, { useEffect, useState } from 'react';
import { Screen } from '../../components/Screen';
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { useShopContext } from '@myhandymanapp/shared/context';
import { colors, spacing, typography } from '../../theme/tokens';
import Chip from '../../components/Chip';
import Card from '../../components/Card';

type Job = {
  id: string;
  description: string;
  estate: string;
  city: string;
  scheduleType: string;
  status: string;
  quoteCount?: number;
  createdAt?: string;
};

function quoteLabel(count: number) {
  if (count <= 0) return 'No quotes yet';
  return `View ${count} quote${count === 1 ? '' : 's'}`;
}

export default function RequestsScreen({ navigation }: any) {
  const { http } = useShopContext();
  const [tab, setTab] = useState<'active' | 'completed' | 'cancelled'>('active');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await http.get('/api/jobs', { params: { status: tab } });
      setJobs(data.jobs || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [tab]);

  return (
    <Screen backgroundColor={colors.bg}>
      <View style={{ padding: spacing.xl, paddingBottom: 10 }}>
        <Text style={{ fontSize: typography.h2, fontWeight: '900', color: colors.ink }}>My Requests</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Chip label="Active" active={tab === 'active'} onPress={() => setTab('active')} />
          <Chip label="Completed" active={tab === 'completed'} onPress={() => setTab('completed')} />
          <Chip label="Cancelled" active={tab === 'cancelled'} onPress={() => setTab('cancelled')} />
        </View>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, paddingBottom: 110 }}
      >
        {jobs.length ? (
          jobs.map((job) => {
            const count = Number(job.quoteCount || 0);
            return (
              <Card key={job.id} style={{ marginBottom: 12 }}>
                <Text style={{ fontWeight: '900', fontSize: typography.body, color: colors.ink }}>
                  {job.description}
                </Text>
                <Text style={{ color: colors.muted, marginTop: 6 }}>
                  {job.estate}, {job.city} - {job.scheduleType}
                </Text>
                <Pressable onPress={() => navigation.navigate('QuotesInbox', { jobId: job.id })}>
                  <Text
                    style={{
                      color: count > 0 ? colors.green : colors.muted,
                      fontWeight: '900',
                      marginTop: 10,
                    }}
                  >
                    {quoteLabel(count)}
                  </Text>
                </Pressable>
              </Card>
            );
          })
        ) : (
          <Card>
            <Text style={{ color: colors.muted }}>No {tab} requests yet.</Text>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
