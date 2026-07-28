import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useShopContext } from '@myhandymanapp/shared/context';
import Card from '../../components/Card';
import PrimaryButton from '../../components/PrimaryButton';
import SecondaryButton from '../../components/SecondaryButton';
import { Screen } from '../../components/Screen';
import { colors, spacing } from '../../theme/tokens';

type EarningsPoint = { label: string; amount: number; jobs: number };
type EarningsData = {
  summary?: { netTotal: number; platformTotal: number; grossTotal: number; completedCount: number; latestAt?: string | null };
  latest?: Array<{ bookingId: string; serviceName: string; location: string; payout: number; gross: number; platformFee: number; earnedAt?: string }>;
  history?: { daily: EarningsPoint[]; weekly: EarningsPoint[]; monthly: EarningsPoint[] };
};

type CommissionData = { due: number; threshold: number; cashBlocked: boolean };

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

function money(value?: number | null) {
  return 'KES ' + Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

const providerDeclineReasons: Array<[string, string]> = [['schedule_conflict', 'Unavailable'], ['too_far', 'Too far'], ['not_my_skill', 'Not my skill'], ['scope_unclear', 'Unclear scope'], ['budget_too_low', 'Budget low'], ['materials_issue', 'Materials issue'], ['unsafe_or_uncomfortable', 'Unsafe'], ['emergency', 'Emergency'], ['not_interested', 'Not interested']];

function openMap(job: Job) {
  const query = job.latitude && job.longitude
    ? String(job.latitude) + ',' + String(job.longitude)
    : encodeURIComponent(job.address || job.estate + ', ' + job.city);
  return Linking.openURL('https://www.google.com/maps/search/?api=1&query=' + query);
}


function CommissionDueCard({ commission, navigation }: { commission: CommissionData | null; navigation: any }) {
  if (!commission || commission.due <= 0) return null;
  const blocked = commission.cashBlocked;
  return (
    <Card style={{ marginTop: 12, backgroundColor: blocked ? '#FFF7ED' : '#F0FDF4', borderColor: blocked ? '#FED7AA' : '#BBF7D0' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: blocked ? '#9A3412' : colors.primary, fontWeight: '900', fontSize: 12, textTransform: 'uppercase' }}>
            {blocked ? 'Cash jobs paused' : 'Commission balance'}
          </Text>
          <Text style={{ color: colors.ink, fontWeight: '900', fontSize: 26, marginTop: 4 }}>{money(commission.due)}</Text>
          <Text style={{ color: colors.muted, marginTop: 4, lineHeight: 20 }}>
            Pay before or at {money(commission.threshold)} to keep cash requests open.
          </Text>
        </View>
        <PrimaryButton title="Pay" onPress={() => navigation.navigate('ProviderCommissionPayment')} style={{ width: 96 }} attention={blocked ? 'urgent' : 'gentle'} />
      </View>
    </Card>
  );
}

function EarningsPreview({
  earnings,
  open,
  setOpen,
  period,
  setPeriod,
}: {
  earnings: EarningsData | null;
  open: boolean;
  setOpen: (value: boolean) => void;
  period: 'daily' | 'weekly' | 'monthly';
  setPeriod: (value: 'daily' | 'weekly' | 'monthly') => void;
}) {
  const latest = earnings?.latest?.[0];
  const points = earnings?.history?.[period] || [];
  const maxAmount = useMemo(() => Math.max(1, ...points.map((point) => point.amount)), [points]);
  return (
    <Card style={{ marginTop: 12, backgroundColor: '#071B12', borderColor: '#123524' }}>
      <Pressable onPress={() => setOpen(!open)}>
        <Text style={{ color: '#A7F3D0', fontWeight: '900', fontSize: 12, textTransform: 'uppercase' }}>Provider earnings</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8, gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: 'white', fontWeight: '900', fontSize: 28 }}>
              {money(latest?.payout || earnings?.summary?.netTotal || 0)}
            </Text>
            <Text style={{ color: '#CFEBDD', marginTop: 4, fontWeight: '700' }}>
              {latest ? 'Latest payout - ' + latest.serviceName : 'No completed payouts yet'}
            </Text>
          </View>
          <Text style={{ color: '#A7F3D0', fontWeight: '900' }}>{open ? 'Hide' : 'Expand'}</Text>
        </View>
      </Pressable>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 10 }}>
          <Text style={{ color: '#A7F3D0', fontWeight: '800', fontSize: 12 }}>Total net</Text>
          <Text style={{ color: 'white', fontWeight: '900', marginTop: 3 }}>{money(earnings?.summary?.netTotal)}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 10 }}>
          <Text style={{ color: '#A7F3D0', fontWeight: '800', fontSize: 12 }}>Jobs done</Text>
          <Text style={{ color: 'white', fontWeight: '900', marginTop: 3 }}>{earnings?.summary?.completedCount || 0}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 10 }}>
          <Text style={{ color: '#A7F3D0', fontWeight: '800', fontSize: 12 }}>Ekazi fees</Text>
          <Text style={{ color: 'white', fontWeight: '900', marginTop: 3 }}>{money(earnings?.summary?.platformTotal)}</Text>
        </View>
      </View>

      {open ? (
        <View style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['daily', 'weekly', 'monthly'] as const).map((item) => (
              <Pressable
                key={item}
                onPress={() => setPeriod(item)}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: period === item ? '#22C55E' : 'rgba(255,255,255,0.1)' }}
              >
                <Text style={{ color: 'white', fontWeight: '900', textTransform: 'capitalize' }}>{item}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ height: 132, flexDirection: 'row', alignItems: 'flex-end', gap: 5, marginTop: 16 }}>
            {points.length ? points.slice(-14).map((point) => (
              <View key={point.label} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                <View style={{ width: '100%', minHeight: 5, height: Math.max(6, (point.amount / maxAmount) * 108), borderRadius: 8, backgroundColor: point.amount ? '#22C55E' : 'rgba(255,255,255,0.12)' }} />
                <Text style={{ color: '#A7F3D0', fontSize: 9, fontWeight: '800' }} numberOfLines={1}>{point.label}</Text>
              </View>
            )) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#CFEBDD', fontWeight: '800', textAlign: 'center' }}>Complete jobs to build your earnings chart.</Text>
              </View>
            )}
          </View>

          {earnings?.latest?.length ? (
            <View style={{ marginTop: 14, gap: 8 }}>
              {earnings.latest.map((item) => (
                <View key={item.bookingId} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: 'white', fontWeight: '900' }}>{item.serviceName}</Text>
                    <Text style={{ color: '#A7F3D0', marginTop: 2 }} numberOfLines={1}>{item.location || 'Client job'}</Text>
                  </View>
                  <Text style={{ color: 'white', fontWeight: '900' }}>{money(item.payout)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}


export default function HandymanHomeScreen({ navigation }: any) {
  const { http, userName } = useShopContext();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [commission, setCommission] = useState<CommissionData | null>(null);
  const [earningsOpen, setEarningsOpen] = useState(false);
  const [earningsPeriod, setEarningsPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [refreshing, setRefreshing] = useState(false);
  const [declineJobId, setDeclineJobId] = useState<string | null>(null);
  const [declineReasonCode, setDeclineReasonCode] = useState('');
  const [declineNotes, setDeclineNotes] = useState('');
  const [declineBusy, setDeclineBusy] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [jobsResult, profileResult, earningsResult, commissionResult] = await Promise.all([
        http.get('/api/handyman/jobs'),
        http.get('/api/handyman/profile'),
        http.get('/api/handyman/earnings').catch(() => ({ data: null })),
        http.get('/api/provider/commission').catch(() => ({ data: null })),
      ]);
      setJobs(jobsResult.data?.jobs || []);
      setProfile(profileResult.data?.profile || null);
      setEarnings(earningsResult.data || null);
      setCommission(commissionResult.data ? {
        due: Number(commissionResult.data.due || 0),
        threshold: Number(commissionResult.data.threshold || 200),
        cashBlocked: Boolean(commissionResult.data.cashBlocked),
      } : null);
    } finally {
      setRefreshing(false);
    }
  }, [http]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitDecline = async (job: Job) => {
    if (!declineReasonCode) {
      Alert.alert('Choose a reason', 'Select the closest reason so Ekazi can keep dispatch fair.');
      return;
    }
    setDeclineBusy(true);
    try {
      const { data } = await http.post('/api/handyman/jobs/' + job.id + '/decline', { reasonCode: declineReasonCode, notes: declineNotes.trim() || undefined });
      setDeclineJobId(null);
      setDeclineReasonCode('');
      setDeclineNotes('');
      Alert.alert('Job declined', data?.forwardedTo ? 'Ekazi has alerted the next nearby provider.' : 'The job has been removed from your feed.');
      await load();
    } catch (error: any) {
      Alert.alert('Could not decline job', error?.response?.data?.message || 'Please try again.');
    } finally {
      setDeclineBusy(false);
    }
  };

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
        <CommissionDueCard commission={commission} navigation={navigation} />
        <EarningsPreview
          earnings={earnings}
          open={earningsOpen}
          setOpen={setEarningsOpen}
          period={earningsPeriod}
          setPeriod={setEarningsPeriod}
        />
        {jobs.length ? (
          jobs.map((job) => (
            <View key={job.id}>
              <Card style={{ marginTop: 10 }}>
                <Text style={{ fontWeight: '900', fontSize: 16 }}>
                  {job.serviceName || job.categoryName || 'Provider job'}
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
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <SecondaryButton title="Map" onPress={() => void openMap(job)} style={{ flex: 0.8 }} />
                  <SecondaryButton title="Decline" onPress={() => { setDeclineJobId(declineJobId === job.id ? null : job.id); setDeclineReasonCode(''); setDeclineNotes(''); }} style={{ flex: 0.95 }} />
                  <PrimaryButton title="Review and quote" onPress={() => navigation.navigate('SubmitQuote', { job })} style={{ flex: 1.35 }} />
                </View>
                {declineJobId === job.id ? (
                  <View style={{ marginTop: 12, padding: 12, borderRadius: 16, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' }}>
                    <Text style={{ fontWeight: '900', color: colors.ink }}>Why are you declining?</Text>
                    <Text style={{ color: colors.muted, marginTop: 4 }}>Repeated avoidable declines reduce provider reliability. Safety and scope mismatch do not punish you.</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      {providerDeclineReasons.map(([code, shortLabel]) => {
                        const active = declineReasonCode === code;
                        return (
                          <Pressable key={code} onPress={() => setDeclineReasonCode(code)} style={{ paddingHorizontal: 11, paddingVertical: 9, borderRadius: 999, backgroundColor: active ? colors.primary : 'white', borderWidth: 1, borderColor: active ? colors.primary : colors.border }}>
                            <Text style={{ color: active ? 'white' : colors.ink, fontWeight: '900', fontSize: 12 }}>{shortLabel}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <TextInput value={declineNotes} onChangeText={setDeclineNotes} multiline placeholder="Optional note for Ekazi dispatch quality" placeholderTextColor={colors.muted} style={{ minHeight: 74, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 11, marginTop: 10, textAlignVertical: 'top', backgroundColor: 'white' }} />
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <SecondaryButton title="Keep" onPress={() => setDeclineJobId(null)} style={{ flex: 1 }} />
                      <PrimaryButton title={declineBusy ? 'Submitting...' : 'Submit Decline'} onPress={() => void submitDecline(job)} disabled={declineBusy} style={{ flex: 1.35, backgroundColor: colors.danger }} />
                    </View>
                  </View>
                ) : null}
              </Card>
            </View>
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
