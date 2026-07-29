import React, { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, Text, View } from 'react-native';
import { useShopContext } from '@myhandymanapp/shared/context';
import { Screen, ScreenScroll } from '../../components/Screen';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import PrimaryButton from '../../components/PrimaryButton';
import SecondaryButton from '../../components/SecondaryButton';
import { colors, spacing } from '../../theme/tokens';

function ProviderReputation({ pro }: { pro: any }) {
  const reviews = Array.isArray(pro?.reviews)
    ? pro.reviews.filter((item: any) => item?.comment).slice(0, 3)
    : [];
  const ratingCount = Number(pro?.ratingCount || 0);
  const ratingAvg = Number(pro?.ratingAvg || 0);
  return (
    <Card style={{ marginTop: 14, backgroundColor: '#F8FAFC' }}>
      <Text style={{ fontWeight: '900' }}>Provider reputation</Text>
      <Text style={{ color: colors.muted, marginTop: 6 }}>
        {ratingCount > 0
          ? `${ratingAvg.toFixed(1)}/5 from ${ratingCount} completed review${ratingCount === 1 ? '' : 's'}`
          : 'New provider - no completed client ratings yet'}
      </Text>
      {reviews.map((review: any, index: number) => (
        <View key={`${review.reviewedAt || index}`} style={{ marginTop: 10 }}>
          <Text style={{ color: colors.ink, lineHeight: 21 }}>"{review.comment}"</Text>
          <Text style={{ color: colors.muted, marginTop: 3 }}>{review.rating}/5 client rating</Text>
        </View>
      ))}
    </Card>
  );
}

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

  const decline = async () => {
    Alert.alert(
      'Decline this quote?',
      'Ekazi will forward your request to the next available nearby provider.',
      [
        { text: 'Keep Quote', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            try {
              await http.post(`/api/quotes/${quoteId}/decline`, {
                reason: 'Price or fit did not work for me',
                reasonCode: 'price_or_fit',
              });
              Alert.alert('Quote declined', 'We are alerting the next nearby provider.');
              navigation.goBack();
            } catch (error: any) {
              Alert.alert('Could not decline quote', error?.response?.data?.message || 'Please try again.');
            }
          },
        },
      ],
    );
  };

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
          {quote.pro?.profileImageUrl ? (
            <Image source={{ uri: quote.pro.profileImageUrl }} style={{ width: 86, height: 86, borderRadius: 43, marginBottom: 10 }} />
          ) : null}
          <Text style={{ fontWeight: '900', fontSize: 18 }}>{quote.pro?.name}</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>
            Rating {quote.pro?.ratingAvg || 'New'} ({quote.pro?.ratingCount || 0} reviews)
          </Text>
          <View style={{ flexDirection: 'row', marginTop: 10, flexWrap: 'wrap' }}>
            {quote.pro?.verifiedId ? <Badge label="ID Verified" tone="green" /> : null}
            {quote.pro?.profileImageStatus === 'approved' ? <Badge label="Photo Verified" tone="blue" /> : null}
            {quote.pro?.certificateStatus === 'approved' ? <Badge label="Certificate" tone="purple" /> : null}
            {quote.pro?.goodConductStatus === 'approved' ? <Badge label="Good Conduct" tone="green" /> : null}
            {quote.pro?.fullyVerified ? <Badge label="Fully Verified" tone="green" /> : null}
          </View>
          <Text style={{ color: colors.muted, marginTop: 10 }}>
            {quote.pro?.jobsCompleted || 0} jobs completed
          </Text>
        </Card>

        <ProviderReputation pro={quote.pro} />

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
              FIRST5: -KES {quote.discountAmount.toLocaleString()}
            </Text>
          ) : null}
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={{ fontWeight: '900' }}>Message from provider</Text>
          <Text style={{ color: colors.muted, marginTop: 8 }}>{quote.message}</Text>
          <Text style={{ color: colors.muted, marginTop: 8 }}>
            Arrival: about {quote.etaMinutes || '?'} minutes - duration:{' '}
            {quote.durationHours || '?'} hours
          </Text>
        </Card>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <SecondaryButton title="Decline" onPress={() => void decline()} style={{ flex: 1 }} />
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
