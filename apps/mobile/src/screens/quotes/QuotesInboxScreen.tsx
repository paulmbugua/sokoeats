import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useShopContext } from '@myhandymanapp/shared/context';
import { paystackCreateBookingOrder } from '@myhandymanapp/shared/api/paymentApi';
import { Screen } from '../../components/Screen';
import Chip from '../../components/Chip';
import Card from '../../components/Card';
import PrimaryButton from '../../components/PrimaryButton';
import SecondaryButton from '../../components/SecondaryButton';
import { colors, spacing } from '../../theme/tokens';

type Quote = {
  id: string;
  total: number;
  subtotal: number;
  discountAmount: number;
  labor: number;
  materials: number;
  transport: number;
  etaMinutes?: number;
  durationHours?: number;
  message?: string;
  pro: any;
};

export default function QuotesInboxScreen({ route, navigation }: any) {
  const { http, backendUrl, token } = useShopContext() as any;
  const jobId = route.params?.jobId;
  const [filter, setFilter] = useState<'Price' | 'Rating' | 'Soonest'>('Price');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await http.get(`/api/jobs/${jobId}/quotes`);
      setQuotes(data.quotes || []);
    } finally {
      setLoading(false);
    }
  }, [http, jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(
    () =>
      [...quotes].sort((a, b) =>
        filter === 'Rating'
          ? (b.pro?.ratingAvg || 0) - (a.pro?.ratingAvg || 0)
          : filter === 'Soonest'
            ? (a.etaMinutes || 99999) - (b.etaMinutes || 99999)
            : a.total - b.total,
      ),
    [filter, quotes],
  );

  const decline = async (quoteId: string) => {
    Alert.alert(
      'Decline this quote?',
      'Ekazi will immediately alert the next available nearby provider.',
      [
        { text: 'Keep Quote', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data } = await http.post(`/api/quotes/${quoteId}/decline`, {
                reason: 'Price or fit did not work for me',
                reasonCode: 'price_or_fit',
              });
              Alert.alert('Quote declined', data?.forwardedTo ? 'We have alerted the next nearby provider.' : 'We will keep looking for another verified provider.');
              await load();
            } catch (error: any) {
              Alert.alert('Could not decline quote', error?.response?.data?.message || 'Please try again.');
            }
          },
        },
      ],
    );
  };

  const accept = async (quoteId: string) => {
    try {
      const { data } = await http.post(`/api/quotes/${quoteId}/accept`, { paymentMethod });
      if (paymentMethod === 'card') {
        const order = await paystackCreateBookingOrder(backendUrl, token, { bookingId: data.booking.id });
        navigation.navigate('PaystackCheckout', {
          authorizationUrl: order.authorization_url,
          reference: order.reference,
          kind: 'booking',
          paymentId: order.paymentId,
          bookingId: order.bookingId,
          jobId: order.jobId,
          quoteId: order.quoteId,
        });
        return;
      }
      navigation.navigate('BookingConfirmed', {
        bookingId: data.booking.id,
        jobId: data.jobId,
        quoteId,
      });
    } catch (error: any) {
      const backend = error?.response?.data;
      if (backend?.code === 'PROVIDER_CASH_BLOCKED') {
        Alert.alert(
          'Cash booking paused',
          'This provider is currently unavailable for cash bookings. You can still accept this quote using card payment.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Use Card', onPress: () => setPaymentMethod('card') },
          ],
        );
        return;
      }
      Alert.alert(
        'Could not accept quote',
        backend?.message || 'Please try again.',
      );
    }
  };

  return (
    <Screen backgroundColor="white">
      <View style={{ padding: spacing.xl, paddingBottom: 10 }}>
        <Text style={{ fontWeight: '900', fontSize: 18 }}>Quotes Received</Text>
        <Text style={{ color: colors.muted, marginTop: 4 }}>
          {quotes.length} real provider response{quotes.length === 1 ? '' : 's'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {(['Price', 'Rating', 'Soonest'] as const).map((value) => (
            <Chip
              key={value}
              label={value}
              active={filter === value}
              onPress={() => setFilter(value)}
            />
          ))}
        </View>
        <Card style={{ marginTop: 12, backgroundColor: '#F8FAFC' }}>
          <Text style={{ fontWeight: '900' }}>How will you pay?</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>
            Cash is paid directly to the provider. Card lets you pay securely in the app before the booking is confirmed.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Chip label="Cash" active={paymentMethod === 'cash'} onPress={() => setPaymentMethod('cash')} />
            <Chip label="Card" active={paymentMethod === 'card'} onPress={() => setPaymentMethod('card')} />
          </View>
        </Card>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, paddingBottom: 110 }}
      >
        {sorted.map((quote) => (
          <Card key={quote.id} style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '900', fontSize: 16 }}>{quote.pro?.name}</Text>
                <Text style={{ color: colors.muted, marginTop: 5 }}>
                  Rating {quote.pro?.ratingAvg || 'New'} - arrival in about{' '}
                  {quote.etaMinutes || '?'} min
                </Text>
              </View>
              <View>
                <Text style={{ fontWeight: '900', fontSize: 18 }}>
                  KES {quote.total.toLocaleString()}
                </Text>
                <Text style={{ color: colors.muted, textAlign: 'right' }}>Client total</Text>
              </View>
            </View>

            <View style={{ marginTop: 10 }}>
              <Text style={{ color: colors.muted }}>
                Labour {quote.labor.toLocaleString()} + materials{' '}
                {quote.materials.toLocaleString()} + transport{' '}
                {quote.transport.toLocaleString()}
              </Text>
              {quote.discountAmount > 0 ? (
                <Text style={{ color: colors.green, fontWeight: '900', marginTop: 6 }}>
                  FIRST5 saving: KES {quote.discountAmount.toLocaleString()}
                </Text>
              ) : null}
              {quote.message ? (
                <Text style={{ marginTop: 8 }} numberOfLines={2}>
                  {quote.message}
                </Text>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <SecondaryButton
                title="Details"
                onPress={() => navigation.navigate('QuoteDetail', { quoteId: quote.id })}
                style={{ flex: 0.95 }}
              />
              <SecondaryButton
                title="Decline"
                onPress={() => void decline(quote.id)}
                style={{ flex: 1.05 }}
              />
              <PrimaryButton
                title={paymentMethod === 'card' ? 'Accept - Card' : 'Accept - Cash'}
                onPress={() => void accept(quote.id)}
                style={{ flex: 1.25 }}
              />
            </View>
          </Card>
        ))}
        {!sorted.length ? (
          <Card>
            <Text style={{ color: colors.muted }}>
              No provider has quoted yet. Pull down to refresh.
            </Text>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
