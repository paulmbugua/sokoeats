import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useShopContext } from '@myhandymanapp/shared/context';
import { Screen, ScreenScroll } from '../../components/Screen';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import PrimaryButton from '../../components/PrimaryButton';
import SecondaryButton from '../../components/SecondaryButton';
import { colors, spacing } from '../../theme/tokens';

export default function QuoteDetailScreen({ route, navigation }: any) {
  const { http } = useShopContext();
  const quoteId = route.params?.quoteId;
  const [quote, setQuote] = useState<any>(null);

  useEffect(() => {
    void http
      .get(`/api/quotes/${quoteId}`)
      .then(({ data }) => setQuote(data.quote))
      .catch(() => undefined);
  }, [http, quoteId]);

  const accept = async () => {
    try {
      const { data } = await http.post(`/api/quotes/${quoteId}/accept`);
      navigation.navigate('BookingConfirmed', {
        bookingId: data.booking.id,
        jobId: data.jobId,
        quoteId,
      });
    } catch (error: any) {
      Alert.alert(
        'Could not accept quote',
        error?.response?.data?.message || 'Please try again.',
      );
    }
  };

  if (!quote) {
    return (
      <ScreenScroll backgroundColor="white" contentContainerStyle={{ justifyContent: 'center' }}>
        <Text style={{ color: colors.muted }}>Loading quote...</Text>
      </ScreenScroll>
    );
  }

  return (
    <Screen backgroundColor="white">
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 110 }}>
        <Card>
          <Text style={{ fontWeight: '900', fontSize: 18 }}>{quote.pro?.name}</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>
            Rating {quote.pro?.ratingAvg || 'New'} ({quote.pro?.ratingCount || 0} reviews)
          </Text>
          <View style={{ flexDirection: 'row', marginTop: 10, flexWrap: 'wrap' }}>
            {quote.pro?.verifiedId ? <Badge label="ID Verified" tone="green" /> : null}
          </View>
          <Text style={{ color: colors.muted, marginTop: 10 }}>
            {quote.pro?.jobsCompleted || 0} jobs completed
          </Text>
        </Card>

        <Text style={{ textAlign: 'center', marginTop: 16, fontSize: 34, fontWeight: '900' }}>
          KES {quote.total.toLocaleString()}
        </Text>
        <Text style={{ textAlign: 'center', color: colors.muted, marginTop: 4 }}>
          Amount payable after discount
        </Text>

        <Card style={{ marginTop: 14 }}>
          <Text>Labour: KES {quote.labor.toLocaleString()}</Text>
          <Text style={{ marginTop: 8 }}>Materials: KES {quote.materials.toLocaleString()}</Text>
          <Text style={{ marginTop: 8 }}>Transport: KES {quote.transport.toLocaleString()}</Text>
          <Text style={{ marginTop: 10, fontWeight: '900' }}>
            Subtotal: KES {quote.subtotal.toLocaleString()}
          </Text>
          {quote.discountAmount > 0 ? (
            <Text style={{ color: colors.green, fontWeight: '900', marginTop: 7 }}>
              FIRST10: -KES {quote.discountAmount.toLocaleString()}
            </Text>
          ) : null}
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={{ fontWeight: '900' }}>Message from handyman</Text>
          <Text style={{ color: colors.muted, marginTop: 8 }}>{quote.message}</Text>
          <Text style={{ color: colors.muted, marginTop: 8 }}>
            Arrival: about {quote.etaMinutes || '?'} minutes - duration:{' '}
            {quote.durationHours || '?'} hours
          </Text>
        </Card>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <SecondaryButton title="Back" onPress={() => navigation.goBack()} style={{ flex: 1 }} />
          <PrimaryButton
            title="Accept Quote"
            onPress={() => void accept()}
            style={{ flex: 1, backgroundColor: colors.green }}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
