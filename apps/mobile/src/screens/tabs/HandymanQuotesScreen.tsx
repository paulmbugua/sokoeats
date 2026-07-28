import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useShopContext } from '@myhandymanapp/shared/context';
import Card from '../../components/Card';
import PrimaryButton from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { colors, spacing } from '../../theme/tokens';

export default function HandymanQuotesScreen({ navigation }: any) {
  const { http } = useShopContext();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await http.get('/api/handyman/quotes');
      setQuotes(data?.quotes || []);
    } finally {
      setRefreshing(false);
    }
  }, [http]);

  useEffect(() => {
    void load();
  }, [load]);

  const editQuote = (quote: any) => {
    if (quote.status !== 'open' || quote.booking?.id) {
      Alert.alert('Quote locked', 'This quote can no longer be edited because the client has already acted on it.');
      return;
    }
    navigation.navigate('SubmitQuote', {
      quote,
      job: {
        id: quote.jobId,
        description: quote.job?.description,
        estate: quote.job?.estate,
        city: quote.job?.city,
        discountPercent: quote.discountPercent || 0,
      },
    });
  };

  const openBooking = (quote: any) => {
    if (!quote.booking?.id) {
      Alert.alert('Waiting for client', 'The client has not accepted this quote yet.');
      return;
    }
    navigation.navigate('BookingConfirmed', {
      bookingId: quote.booking.id,
      jobId: quote.jobId,
      quoteId: quote.id,
    });
  };

  return (
    <Screen backgroundColor={colors.bg}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 110 }}
      >
        <Text style={{ fontSize: 20, fontWeight: '900', color: colors.ink }}>My Quotes</Text>
        {quotes.length ? (
          quotes.map((quote) => (
            <Card key={quote.id} style={{ marginTop: 12 }}>
              <Text style={{ fontWeight: '900' }}>{quote.job?.description || 'Job quote'}</Text>
              <Text style={{ color: colors.muted, marginTop: 5 }}>{quote.job?.estate}, {quote.job?.city}</Text>
              <Text style={{ fontSize: 18, fontWeight: '900', marginTop: 10 }}>KES {quote.total.toLocaleString()}</Text>
              <Text style={{ color: colors.danger, marginTop: 4 }}>Ekazi commission: KES {(quote.commission?.amount ?? Math.round((quote.labor || 0) * 0.10)).toLocaleString()}</Text>
              <Text style={{ color: colors.primary, fontWeight: '900', marginTop: 4 }}>Take-home: KES {(quote.commission?.handymanPayout ?? Math.max(0, quote.total - Math.round((quote.labor || 0) * 0.10))).toLocaleString()}</Text>
              <Text style={{ color: colors.primary, fontWeight: '900', marginTop: 5 }}>{quote.status}</Text>
              <View style={{ marginTop: 12 }}>
                <PrimaryButton title={quote.booking?.id ? 'View Job Contact' : 'Waiting for Client'} onPress={() => openBooking(quote)} />
              </View>
            </Card>
          ))
        ) : (
          <Card style={{ marginTop: 12 }}>
            <Text style={{ color: colors.muted }}>Quotes you submit to clients will appear here.</Text>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
