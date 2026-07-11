import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useShopContext } from '@myhandymanapp/shared/context';
import Card from '../../components/Card';
import PrimaryButton from '../../components/PrimaryButton';
import SecondaryButton from '../../components/SecondaryButton';
import { Screen } from '../../components/Screen';
import { colors, spacing } from '../../theme/tokens';

type Job = {
  id: string;
  categoryName?: string;
  serviceName?: string;
  description: string;
  estate: string;
  city: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  scheduleType: string;
  scheduledFor?: string;
  budgetMin?: number | null;
  budgetMax?: number | null;
  photoUrls?: string[];
  distanceKm?: number | null;
  client?: { name?: string; phone?: string };
};

function openMap(job: Job) {
  const query = job.latitude && job.longitude
    ? String(job.latitude) + ',' + String(job.longitude)
    : encodeURIComponent(job.address || job.estate + ', ' + job.city);
  return Linking.openURL('https://www.google.com/maps/search/?api=1&query=' + query);
}

export default function HandymanHomeScreen({ navigation }: any) {
  const { http, userName } = useShopContext();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [jobsResult, profileResult] = await Promise.all([
        http.get('/api/handyman/jobs'),
        http.get('/api/handyman/profile'),
      ]);
      setJobs(jobsResult.data?.jobs || []);
      setProfile(profileResult.data?.profile || null);
    } finally {
      setRefreshing(false);
    }
  }, [http]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen backgroundColor={colors.bg}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 110 }}
      >
        <Text style={{ fontSize: 25, fontWeight: '900', color: colors.ink }}>
          Jobs for {userName?.split(' ')[0] || 'you'}
        </Text>
        <Text style={{ color: colors.muted, marginTop: 5 }}>
          Quote only for jobs you can deliver professionally.
        </Text>

        <Card
          style={{
            marginTop: 14,
            backgroundColor: profile?.address ? '#ECFDF5' : '#FEF3C7',
            borderColor: profile?.address ? '#A7F3D0' : '#FDE68A',
          }}
        >
          <Text style={{ fontWeight: '900' }}>
            {profile?.address ? 'Service location active' : 'Set your service location'}
          </Text>
          <Text style={{ color: colors.muted, marginTop: 5 }}>
            {profile?.address || 'Add your map location so clients can assess proximity.'}
          </Text>
          <View style={{ marginTop: 12 }}>
            <PrimaryButton
              title={profile?.address ? 'Update Location' : 'Add Location'}
              onPress={() => navigation.navigate('HandymanLocation')}
            />
          </View>
        </Card>

        {jobs.length === 0 && profile && !profile.verified ? (
          <Card style={{ marginTop: 14, backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }}>
            <Text style={{ fontWeight: '900' }}>Verification blocked</Text>
            <Text style={{ color: colors.muted, marginTop: 6 }}>
              Upload your profile photo and national ID in Profile. Ekazi admin must approve them before nearby jobs appear.
            </Text>
          </Card>
        ) : null}

        <Text style={{ fontSize: 17, fontWeight: '900', marginTop: 18 }}>Nearest open jobs</Text>
        {jobs.length ? (
          jobs.map((job) => (
            <Pressable key={job.id} onPress={() => navigation.navigate('SubmitQuote', { job })}>
              <Card style={{ marginTop: 10 }}>
                <Text style={{ fontWeight: '900', fontSize: 16 }}>
                  {job.serviceName || job.categoryName || 'Handyman job'}
                </Text>
                <Text style={{ color: colors.muted, marginTop: 6 }} numberOfLines={3}>
                  {job.description}
                </Text>
                <Text style={{ marginTop: 8, fontWeight: '800' }}>
                  {job.address || job.estate + ', ' + job.city} - {job.scheduleType}
                </Text>
                {job.distanceKm != null ? (
                  <Text style={{ color: colors.green, marginTop: 5, fontWeight: '900' }}>
                    Distance: {job.distanceKm.toFixed(1)} km from your service base
                  </Text>
                ) : null}
                {job.client?.phone ? (
                  <Text style={{ color: colors.primary, fontWeight: '900', marginTop: 8 }}>
                    Client contact: {job.client.phone}
                  </Text>
                ) : null}
                {job.budgetMin || job.budgetMax ? (
                  <Text style={{ color: colors.green, marginTop: 6, fontWeight: '900' }}>
                    Client budget: KES {job.budgetMin || 0} - {job.budgetMax || 'Open'}
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <SecondaryButton title="Map" onPress={() => void openMap(job)} style={{ flex: 1 }} />
                  <PrimaryButton title="Review and quote" onPress={() => navigation.navigate('SubmitQuote', { job })} style={{ flex: 1 }} />
                </View>
              </Card>
            </Pressable>
          ))
        ) : (
          <Card style={{ marginTop: 10 }}>
            <Text style={{ color: colors.muted }}>
              No unquoted jobs currently match this account. Pull to refresh.
            </Text>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
