import React, { useEffect, useState } from 'react';
import { Alert, Linking, Share, Text, View } from 'react-native';
import { useShopContext } from '@myhandymanapp/shared/context';
import Card from '../../components/Card';
import PrimaryButton from '../../components/PrimaryButton';
import SecondaryButton from '../../components/SecondaryButton';
import { ScreenScroll } from '../../components/Screen';
import { colors } from '../../theme/tokens';

export default function BookingConfirmedScreen({ route, navigation }: any) {
  const { http } = useShopContext();
  const bookingId = route.params?.bookingId;
  const [booking, setBooking] = useState<any>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    void http
      .get(`/api/bookings/${bookingId}`)
      .then(({ data }) => setBooking(data.booking))
      .catch(() => Alert.alert('Could not load booking', 'Return to Requests and try again.'));
  }, [bookingId, http]);

  const callHandyman = async () => {
    if (!booking?.handyman?.phone) {
      Alert.alert('Phone unavailable', 'This handyman has not provided a phone number.');
      return;
    }
    await Linking.openURL(`tel:${booking.handyman.phone}`);
  };

  const shareBooking = async () => {
    if (!booking) return;
    await Share.share({
      message: [
        `Ekazi booking #${booking.id}`,
        `Handyman: ${booking.handyman.name}`,
        `Service: ${booking.job.serviceName}`,
        `Location: ${booking.job.address || `${booking.job.estate}, ${booking.job.city}`}`,
        `Total: KES ${booking.total.toLocaleString()}`,
      ].join('\n'),
    });
  };

  const cancel = () => {
    Alert.alert('Cancel booking?', 'The job will reopen for quotes.', [
      { text: 'Keep Booking', style: 'cancel' },
      {
        text: 'Cancel Booking',
        style: 'destructive',
        onPress: () => {
          setCancelling(true);
          void http
            .post(`/api/bookings/${bookingId}/cancel`)
            .then(() => navigation.navigate('Tabs', { screen: 'Requests' }))
            .catch((error: any) =>
              Alert.alert(
                'Could not cancel',
                error?.response?.data?.message || 'Please contact support.',
              ),
            )
            .finally(() => setCancelling(false));
        },
      },
    ]);
  };

  if (!booking) {
    return (
      <ScreenScroll backgroundColor="white" contentContainerStyle={{ justifyContent: 'center' }}>
        <Text style={{ color: colors.muted }}>Loading confirmed booking...</Text>
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll backgroundColor="white">
      <Card
        style={{
          backgroundColor: colors.greenSoft,
          borderColor: '#BBF7D0',
          alignItems: 'center',
        }}
      >
        <Text style={{ fontWeight: '900', fontSize: 20 }}>Booking Confirmed</Text>
        <Text style={{ color: colors.muted, marginTop: 8 }}>
          {booking.handyman.name} accepted through your selected quote.
        </Text>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <Text style={{ fontWeight: '900', fontSize: 17 }}>{booking.handyman.name}</Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>{booking.job.serviceName}</Text>
        <View style={{ marginTop: 12 }}>
          <SecondaryButton title="Call Handyman" onPress={() => void callHandyman()} />
        </View>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <Text style={{ fontWeight: '900' }}>Job Details</Text>
        <Text style={{ color: colors.muted, marginTop: 8 }}>
          {booking.job.scheduledFor
            ? new Date(booking.job.scheduledFor).toLocaleString('en-KE')
            : booking.job.scheduleType}
        </Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>
          Estimated duration: {booking.durationHours || '?'} hours
        </Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>
          {booking.job.address || `${booking.job.estate}, ${booking.job.city}`}
        </Text>
        <Text style={{ marginTop: 12, fontWeight: '900' }}>
          KES {booking.total.toLocaleString()}
        </Text>
        {booking.discountAmount > 0 ? (
          <Text style={{ color: colors.green, marginTop: 4 }}>
            FIRST10 saved KES {booking.discountAmount.toLocaleString()}
          </Text>
        ) : null}
        <Text style={{ color: colors.muted, marginTop: 4 }}>Pay on completion</Text>
      </Card>

      <Card style={{ marginTop: 14, backgroundColor: colors.blueSoft }}>
        <Text style={{ fontWeight: '900' }}>What happens next?</Text>
        <Text style={{ color: colors.muted, marginTop: 8 }}>
          1. The handyman confirms travel and arrival with you.
        </Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>
          2. Verify the work before releasing payment.
        </Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>
          3. Use M-Pesa and keep your transaction reference.
        </Text>
      </Card>

      <View style={{ marginTop: 16 }}>
        <PrimaryButton title="Share Booking" onPress={() => void shareBooking()} />
        <SecondaryButton
          title={cancelling ? 'Cancelling...' : 'Cancel Booking'}
          onPress={cancel}
          style={{ marginTop: 12 }}
        />
      </View>
    </ScreenScroll>
  );
}
