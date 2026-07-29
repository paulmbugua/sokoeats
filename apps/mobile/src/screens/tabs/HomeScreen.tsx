import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useShopContext } from '@myhandymanapp/shared/context';
import { categories as seedCategories } from '@myhandymanapp/shared/api/kenya-data';
import { colors, radius, shadow, spacing, typography } from '../../theme/tokens';
import Card from '../../components/Card';
import PrimaryButton from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { CategoryTileIllustration, QuoteIllustration } from '../../components/Illustrations';

type Job = {
  id: string;
  description: string;
  quoteCount: number;
  status: string;
  estate: string;
};

const categoryAccents = ['#E8F8EE', '#FFF2C7', '#EAF2FF', '#F4E8FF'];

export default function HomeScreen({ navigation }: any) {
  const { http, userName, profile } = useShopContext();
  const firstName = (profile?.name || userName || 'there').trim().split(/\s+/)[0];
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [promotion, setPromotion] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [jobsResult, promoResult] = await Promise.all([
        http.get('/api/jobs', { params: { status: 'active' } }),
        http.get('/api/promotions/first-job'),
      ]);
      setJobs((jobsResult.data?.jobs || []).slice(0, 3));
      setPromotion(promoResult.data);
    } finally {
      setRefreshing(false);
    }
  }, [http]);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (seedCategories || [])
      .filter((item: any) => !q || item.name.toLowerCase().includes(q))
      .slice(0, 12);
  }, [query]);

  const deleteRequest = (job: Job) => {
    Alert.alert(
      'Delete request?',
      'This removes the request from active jobs and closes open quotes. Booked jobs must be cancelled from the booking screen.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingJobId(job.id);
            try {
              await http.delete(`/api/jobs/${job.id}`);
              setJobs((current) => current.filter((item) => item.id !== job.id));
            } catch (error: any) {
              Alert.alert('Could not delete request', error?.response?.data?.message || 'Please try again.');
            } finally {
              setDeletingJobId(null);
            }
          },
        },
      ],
    );
  };

  const continueRequest = () => {
    if (selectedCategory) {
      navigation.navigate('TaskSelect', {
        categoryId: selectedCategory.id,
        categoryName: selectedCategory.name,
      });
    } else {
      navigation.navigate('CategorySelect');
    }
  };

  return (
    <Screen backgroundColor={colors.bg}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 126 }}
      >
        <LinearGradient
          colors={['#0B5F4E', '#16A34A']}
          style={{ paddingTop: 22, paddingHorizontal: spacing.xl, paddingBottom: spacing.xl }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: typography.small, fontWeight: '800' }}>
                Ekazi marketplace
              </Text>
              <Text style={{ color: 'white', fontSize: typography.h1, fontWeight: '900', lineHeight: 38, marginTop: 4 }}>
                Hello, {firstName}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.9)', marginTop: 8, fontSize: typography.body, lineHeight: 24 }}>
                Compare quotes from reliable local providers.
              </Text>
            </View>
            <View
              style={{
                width: 54,
                height: 54,
                borderRadius: radius.lg,
                backgroundColor: 'rgba(255,255,255,0.18)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="hammer-outline" size={28} color="white" />
            </View>
          </View>

          <View
            style={{
              minHeight: 58,
              backgroundColor: 'white',
              borderRadius: radius.lg,
              paddingHorizontal: 14,
              marginTop: spacing.lg,
              flexDirection: 'row',
              alignItems: 'center',
              ...shadow.card,
            }}
          >
            <Ionicons name="search-outline" size={22} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search plumbing, painting, repair..."
              placeholderTextColor={colors.muted}
              style={{ flex: 1, paddingVertical: 14, paddingLeft: 10, fontSize: typography.body, color: colors.text }}
            />
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: spacing.xl, marginTop: -12 }}>
          {promotion?.eligible ? (
            <LinearGradient
              colors={['#FFB000', '#F97316']}
              style={{
                borderRadius: radius.lg,
                padding: spacing.lg,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                ...shadow.lift,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontWeight: '900', fontSize: typography.h3 }}>
                  5% off first job
                </Text>
                <Text style={{ color: 'rgba(15,23,42,0.78)', marginTop: 5, fontSize: typography.small, lineHeight: 20 }}>
                  FIRST5 applies 5% off labour on the quote you accept. The discount is funded by Ekazi.
                </Text>
              </View>
              <QuoteIllustration width={96} height={78} />
            </LinearGradient>
          ) : null}

          <View style={{ marginTop: spacing.xl, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontWeight: '900', fontSize: typography.h2 }}>What do you need?</Text>
              <Text style={{ color: colors.muted, marginTop: 4, fontSize: typography.small }}>
                Pick a service to start with the right quote flow.
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: spacing.md }}>
            {categories.map((category: any, index: number) => {
              const selected = selectedCategory?.id === category.id;
              return (
                <Pressable
                  key={category.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedCategory(selected ? null : category)}
                  style={({ pressed }) => [
                    {
                      width: '31%',
                      minHeight: 134,
                      borderWidth: 2,
                      borderColor: selected ? colors.primary : 'rgba(15, 23, 42, 0.06)',
                      borderRadius: radius.lg,
                      backgroundColor: selected ? colors.primarySoft : categoryAccents[index % categoryAccents.length],
                      padding: 10,
                      justifyContent: 'space-between',
                      opacity: pressed ? 0.9 : 1,
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                      ...shadow.card,
                    },
                  ]}
                >
                  <CategoryTileIllustration width={58} height={50} />
                  <Text style={{ fontSize: 13, fontWeight: '900', color: colors.ink, lineHeight: 17 }}>
                    {category.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ marginTop: spacing.lg }}>
            <PrimaryButton
              title={selectedCategory ? `Continue with ${selectedCategory.name}` : 'Request a Quote'}
              onPress={continueRequest}
            />
          </View>

          <Text style={{ marginTop: spacing.xl, fontWeight: '900', fontSize: typography.h2, color: colors.ink }}>
            Recent requests
          </Text>
          <View style={{ marginTop: spacing.md }}>
            {jobs.length ? (
              jobs.map((job) => (
                <Pressable
                  key={job.id}
                  onPress={() => navigation.navigate('QuotesInbox', { jobId: job.id })}
                  style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
                >
                  <Card style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                      <View
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: radius.lg,
                          backgroundColor: colors.primarySoft,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name="receipt-outline" size={24} color={colors.primaryDark} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '900', color: colors.ink, fontSize: typography.body }}>
                          {job.description}
                        </Text>
                        <Text style={{ color: colors.muted, marginTop: 4, fontSize: typography.small }}>
                          {job.estate} - {job.status}
                        </Text>
                        <Text style={{ color: colors.green, fontWeight: '900', marginTop: 6 }}>
                          {job.quoteCount || 0} quotes received
                        </Text>
                      </View>
                      {['active', 'quoted'].includes(String(job.status || '').toLowerCase()) ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Delete request"
                          disabled={deletingJobId === job.id}
                          onPress={(event: any) => {
                            event?.stopPropagation?.();
                            deleteRequest(job);
                          }}
                          style={({ pressed }) => ({
                            width: 44,
                            height: 44,
                            borderRadius: radius.lg,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#FEF2F2',
                            opacity: deletingJobId === job.id ? 0.45 : pressed ? 0.82 : 1,
                          })}
                        >
                          <Ionicons name="trash-outline" size={20} color={colors.danger} />
                        </Pressable>
                      ) : null}
                    </View>
                  </Card>
                </Pressable>
              ))
            ) : (
              <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
                <QuoteIllustration />
                <Text style={{ color: colors.ink, fontWeight: '900', fontSize: typography.h3, marginTop: 6 }}>
                  No requests yet
                </Text>
                <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 4, lineHeight: 20 }}>
                  Your submitted job requests and provider quotes will appear here.
                </Text>
              </Card>
            )}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
