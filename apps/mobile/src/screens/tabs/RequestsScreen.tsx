import React, { useEffect, useState } from 'react';
import { Screen } from '../../components/Screen';
import { Alert, View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
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
  booking?: {
    id: string;
    quoteId?: string | null;
    status?: string | null;
    providerName?: string | null;
    review?: { rating: number; comment?: string; reviewedAt?: string | null } | null;
  } | null;
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
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const deleteRequest = (job: Job) => {
    Alert.alert(
      'Delete request?',
      'This request will leave Active requests and any open provider quotes will be closed.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(job.id);
            try {
              await http.delete(`/api/jobs/${job.id}`);
              setJobs((current) => current.filter((item) => item.id !== job.id));
            } catch (error: any) {
              Alert.alert('Could not delete request', error?.response?.data?.message || 'Please try again.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

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
            const bookingStatus = String(job.booking?.status || job.status || '').toLowerCase();
            const completed = ['completed', 'complete', 'done'].includes(bookingStatus);
            const openBooking = () => {
              if (job.booking?.id) {
                navigation.navigate('BookingConfirmed', {
                  bookingId: String(job.booking.id),
                  jobId: String(job.id),
                  quoteId: String(job.booking.quoteId || ''),
                });
                return;
              }
              navigation.navigate('QuotesInbox', { jobId: job.id });
            };
            return (
              <Card key={job.id} style={{ marginBottom: 12 }}>
                <Text style={{ fontWeight: '900', fontSize: typography.body, color: colors.ink }}>
                  {job.description}
                </Text>
                <Text style={{ color: colors.muted, marginTop: 6 }}>
                  {job.estate}, {job.city} - {job.scheduleType}
                </Text>
                {job.booking?.providerName ? (
                  <Text style={{ color: colors.ink, fontWeight: '800', marginTop: 8 }}>
                    Provider: {job.booking.providerName}
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 }}>
                  <Pressable onPress={openBooking} style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: completed && !job.booking?.review?.rating ? colors.primary : count > 0 ? colors.green : colors.muted,
                        fontWeight: '900',
                      }}
                    >
                      {completed
                        ? job.booking?.review?.rating
                          ? 'Rated ' + job.booking.review.rating + '/5'
                          : 'Rate completed service'
                        : job.booking?.id
                          ? 'View booking'
                          : quoteLabel(count)}
                    </Text>
                  </Pressable>
                  {tab === 'active' && !job.booking?.id && ['active', 'quoted'].includes(String(job.status || '').toLowerCase()) ? (
                    <Pressable
                      disabled={deletingId === job.id}
                      onPress={() => deleteRequest(job)}
                      style={({ pressed }) => ({
                        paddingVertical: 9,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        backgroundColor: '#FEF2F2',
                        opacity: deletingId === job.id ? 0.45 : pressed ? 0.82 : 1,
                      })}
                    >
                      <Text style={{ color: colors.danger, fontWeight: '900' }}>
                        {deletingId === job.id ? 'Deleting...' : 'Delete'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
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
