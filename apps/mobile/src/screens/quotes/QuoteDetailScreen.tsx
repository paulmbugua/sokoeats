import React, { useEffect, useState } from 'react';

import { Alert, View, Text, ScrollView } from 'react-native';

import { useShopContext } from '@myhandymanapp/shared/context';

import { colors, spacing } from '../../theme/tokens';

import Card from '../../components/Card';

import Badge from '../../components/Badge';

import PrimaryButton from '../../components/PrimaryButton';

import SecondaryButton from '../../components/SecondaryButton';

export default function QuoteDetailScreen({ route, navigation }: any) {

  const { http } = useShopContext();

  const quoteId = route.params?.quoteId;

  const [quote, setQuote] = useState<any>(null);

  useEffect(() => { void http.get(`/api/quotes/${quoteId}`).then(({ data }) => setQuote(data.quote)).catch(() => undefined); }, [http, quoteId]);

  const accept = async () => { try { const { data } = await http.post(`/api/quotes/${quoteId}/accept`); navigation.navigate('BookingConfirmed', { bookingId: data.booking.id, jobId: data.jobId, quoteId }); } catch (e: any) { Alert.alert('Could not accept quote', e?.response?.data?.message || 'Please try again.'); } };

  if (!quote) return <View style={{ flex: 1, backgroundColor: 'white', padding: spacing.xl }}><Text style={{ color: colors.muted }}>Loading quote...</Text></View>;

  return <View style={{ flex: 1, backgroundColor: 'white' }}><ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 24 }}>

    <Card><Text style={{ fontWeight: '900', fontSize: 18 }}>{quote.pro?.name}</Text><Text style={{ color: colors.muted, marginTop: 6 }}>? {quote.pro?.ratingAvg} ({quote.pro?.ratingCount} reviews) - {quote.pro?.distanceKm} km - Under {quote.pro?.etaMinutes} min</Text><View style={{ flexDirection: 'row', marginTop: 10, flexWrap: 'wrap' }}>{quote.pro?.verifiedId ? <Badge label="ID Verified" tone="green" /> : null}{quote.pro?.backgroundChecked ? <Badge label="Background Checked" tone="blue" /> : null}{quote.pro?.topRated ? <Badge label="Top Rated Pro" tone="purple" /> : null}</View><Text style={{ color: colors.muted, marginTop: 12 }}>{quote.pro?.jobsCompleted} jobs completed</Text></Card>

    <Text style={{ textAlign: 'center', marginTop: 16, fontSize: 34, fontWeight: '900' }}>KES {quote.total.toLocaleString()}</Text><Text style={{ textAlign: 'center', color: colors.muted, marginTop: 4 }}>Total Quote</Text>

    <Card style={{ marginTop: 14 }}><Text>Labor: KES {quote.labor.toLocaleString()}</Text><Text style={{ marginTop: 8 }}>Materials: KES {quote.materials.toLocaleString()}</Text><Text style={{ marginTop: 8 }}>Transport: KES {quote.transport.toLocaleString()}</Text></Card>

    <Card style={{ marginTop: 14 }}><Text style={{ fontWeight: '900' }}>Message from Provider</Text><Text style={{ color: colors.muted, marginTop: 8 }}>{quote.message}</Text></Card>

    <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}><SecondaryButton title="Back" onPress={() => navigation.goBack()} style={{ flex: 1 }} /><PrimaryButton title="Accept Quote" onPress={accept} style={{ flex: 1, backgroundColor: colors.green } as any} /></View>

  </ScrollView></View>;

}

