import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useShopContext } from '@myhandymanapp/shared/context';
import { categories as seedCategories } from '@myhandymanapp/shared/api/kenya-data';
import { colors, radius } from '../../theme/tokens';
import Card from '../../components/Card';
import PrimaryButton from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';

type Job = {
  id: string;
  description: string;
  quoteCount: number;
  status: string;
  estate: string;
};

export default function HomeScreen({ navigation }: any) {
  const { http, userName, profile } = useShopContext();
  const firstName = (profile?.name || userName || 'there').trim().split(/\s+/)[0];
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [promotion, setPromotion] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

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
    <Screen backgroundColor="white">
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          style={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 18 }}
        >
          <Text style={{ color: 'white', fontSize: 28, fontWeight: '900' }}>
            Hello, {firstName}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.9)', marginTop: 4 }}>
            What needs fixing today?
          </Text>
          <View
            style={{
              backgroundColor: 'white',
              borderRadius: radius.md,
              paddingHorizontal: 12,
              marginTop: 12,
            }}
          >
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search plumbing, electrical, painting..."
              placeholderTextColor={colors.muted}
              style={{ paddingVertical: 12, fontSize: 15 }}
            />
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 18, marginTop: 12 }}>
          {promotion?.eligible ? (
            <Card style={{ backgroundColor: '#C2410C', borderColor: '#C2410C', padding: 16 }}>
              <Text style={{ color: 'white', fontWeight: '900', fontSize: 16 }}>
                10% Off Your First Job
              </Text>
              <Text style={{ color: 'white', marginTop: 4 }}>
                FIRST10 is applied to the quote you accept. The saving is shown before booking.
              </Text>
            </Card>
          ) : null}

          <Text style={{ marginTop: 16, fontWeight: '900', fontSize: 16 }}>Categories</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>
            Select one now, then request your quote.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
            {categories.map((category: any) => {
              const selected = selectedCategory?.id === category.id;
              return (
                <Pressable
                  key={category.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedCategory(selected ? null : category)}
                  style={{
                    width: '31%',
                    minHeight: 76,
                    borderWidth: 2,
                    borderColor: selected ? colors.primary : colors.border,
                    borderRadius: radius.md,
                    backgroundColor: selected ? '#ECFDF5' : 'white',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 8,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '800', textAlign: 'center' }}>
                    {category.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ marginTop: 16 }}>
            <PrimaryButton
              title={selectedCategory ? `Continue with ${selectedCategory.name}` : 'Request a Quote'}
              onPress={continueRequest}
            />
          </View>

          <Text style={{ marginTop: 18, fontWeight: '900', fontSize: 16 }}>Recent Requests</Text>
          <View style={{ marginTop: 10 }}>
            {jobs.length ? (
              jobs.map((job) => (
                <Pressable
                  key={job.id}
                  onPress={() => navigation.navigate('QuotesInbox', { jobId: job.id })}
                >
                  <Card style={{ marginBottom: 10 }}>
                    <Text style={{ fontWeight: '900' }}>{job.description}</Text>
                    <Text style={{ color: colors.muted, marginTop: 5 }}>
                      {job.estate} - {job.status}
                    </Text>
                    <Text style={{ color: colors.green, fontWeight: '800', marginTop: 6 }}>
                      {job.quoteCount || 0} quotes received
                    </Text>
                  </Card>
                </Pressable>
              ))
            ) : (
              <Card>
                <Text style={{ color: colors.muted }}>
                  Your submitted job requests will appear here.
                </Text>
              </Card>
            )}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
