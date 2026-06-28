import React, { useEffect, useMemo, useState } from 'react';
import { Screen } from '../../components/Screen';

import { Alert, View, Text, ScrollView, RefreshControl } from 'react-native';

import { useShopContext } from '@myhandymanapp/shared/context';

import { colors, spacing } from '../../theme/tokens';

import Chip from '../../components/Chip';

import Card from '../../components/Card';

import PrimaryButton from '../../components/PrimaryButton';

import SecondaryButton from '../../components/SecondaryButton';

type Quote = { id: string; jobId: string; pro: any; total: number; labor: number; materials: number; transport: number; distanceKm?: number; etaMinutes?: number; badge?: string | null };

export default function QuotesInboxScreen({ route, navigation }: any) {

  const { http } = useShopContext();

  const jobId = route.params?.jobId;

  const [filter, setFilter] = useState<'Price' | 'Rating' | 'Soonest'>('Price');

  const [quotes, setQuotes] = useState<Quote[]>([]);

  const [loading, setLoading] = useState(false);

  const load = async () => { setLoading(true); try { const { data } = await http.get(`/api/jobs/${jobId}/quotes`); setQuotes(data.quotes || []); } finally { setLoading(false); } };

  useEffect(() => { void load(); }, [jobId]);

  const sorted = useMemo(() => [...quotes].sort((a, b) => filter === 'Rating' ? (b.pro?.ratingAvg || 0) - (a.pro?.ratingAvg || 0) : filter === 'Soonest' ? (a.etaMinutes || 999) - (b.etaMinutes || 999) : a.total - b.total), [quotes, filter]);

  const accept = async (quoteId: string) => { try { const { data } = await http.post(`/api/quotes/${quoteId}/accept`); navigation.navigate('BookingConfirmed', { bookingId: data.booking.id, jobId: data.jobId, quoteId }); } catch (e: any) { Alert.alert('Could not accept quote', e?.response?.data?.message || 'Please try again.'); } };

  return <Screen backgroundColor="white"><View style={{ padding: spacing.xl, paddingBottom: 10 }}><Text style={{ fontWeight: '900', fontSize: 16 }}>Quotes Received</Text><Text style={{ color: colors.muted, marginTop: 4 }}>{quotes.length} providers responded</Text><View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}><Chip label="Price" active={filter === 'Price'} onPress={() => setFilter('Price')} /><Chip label="Rating" active={filter === 'Rating'} onPress={() => setFilter('Rating')} /><Chip label="Soonest" active={filter === 'Soonest'} onPress={() => setFilter('Soonest')} /></View></View>

    <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, paddingBottom: 110 }}>

      {sorted.map((q) => <Card key={q.id} style={{ marginTop: 12 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View style={{ flex: 1, paddingRight: 10 }}><Text style={{ fontWeight: '900', fontSize: 16 }}>{q.pro?.name}</Text><Text style={{ color: colors.muted, marginTop: 6 }}>? {q.pro?.ratingAvg} ({q.pro?.ratingCount}) - {q.distanceKm} km - Under {q.etaMinutes} min</Text></View><View><Text style={{ fontWeight: '900', fontSize: 16 }}>KES {q.total.toLocaleString()}</Text><Text style={{ color: colors.muted, textAlign: 'right' }}>Total</Text></View></View>{q.badge ? <View style={{ alignSelf: 'flex-end', marginTop: 8, backgroundColor: colors.greenSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}><Text style={{ color: colors.green, fontWeight: '900', fontSize: 12 }}>? {q.badge}</Text></View> : null}<View style={{ marginTop: 10 }}><Text style={{ color: colors.muted }}>Labor: KES {q.labor.toLocaleString()}</Text><Text style={{ color: colors.muted }}>Materials: KES {q.materials.toLocaleString()}</Text><Text style={{ color: colors.muted }}>Transport: KES {q.transport.toLocaleString()}</Text></View><View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}><SecondaryButton title="View Details" onPress={() => navigation.navigate('QuoteDetail', { quoteId: q.id })} style={{ flex: 1 }} /><PrimaryButton title="Accept Quote" onPress={() => accept(q.id)} style={{ flex: 1 }} /></View></Card>)}

      {!sorted.length ? <Card><Text style={{ color: colors.muted }}>No quotes yet. Pull to refresh.</Text></Card> : null}

    </ScrollView></Screen>;

}

