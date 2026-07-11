import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, Share, Text, TextInput, View } from 'react-native';
import { useShopContext } from '@myhandymanapp/shared/context';
import Card from '../../components/Card';
import PrimaryButton from '../../components/PrimaryButton';
import SecondaryButton from '../../components/SecondaryButton';
import { ScreenScroll } from '../../components/Screen';
import { colors, radius } from '../../theme/tokens';

const clientReasons: Array<[string, string]> = [
  ['schedule_changed', 'My schedule changed'],
  ['budget_changed', 'My budget changed'],
  ['no_longer_needed', 'I no longer need the service'],
  ['unsafe', 'I feel unsafe or uncomfortable'],
  ['poor_handling', 'Poor handling or communication'],
  ['fraud', 'Fraud or gross misconduct'],
];

const handymanReasons: Array<[string, string]> = [
  ['emergency', 'Emergency or illness'],
  ['materials_unavailable', 'Materials are unavailable'],
  ['client_unreachable', 'Client is unreachable'],
  ['unsafe_site', 'Unsafe work site'],
  ['scope_changed', 'Job scope changed'],
  ['other_booking', 'Schedule conflict'],
];

export default function BookingConfirmedScreen({ route, navigation }: any) {
  const { http, role } = useShopContext();
  const bookingId = route.params?.bookingId;
  const isHandyman = role === 'tutor';
  const [booking, setBooking] = useState<any>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [reasonCode, setReasonCode] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    void http
      .get('/api/bookings/' + bookingId)
      .then(({ data }) => setBooking(data.booking))
      .catch(() => Alert.alert('Could not load booking', 'Return to Requests and try again.'));
  }, [bookingId, http]);

  const otherParty = isHandyman ? booking?.client : booking?.handyman;
  const reasonOptions = isHandyman ? handymanReasons : clientReasons;
  const selectedReason = useMemo(
    () => reasonOptions.find(([code]) => code === reasonCode)?.[1] || '',
    [reasonCode, reasonOptions],
  );

  const callOtherParty = async () => {
    if (!otherParty?.phone) {
      Alert.alert('Phone unavailable', 'The other party has not provided a phone number.');
      return;
    }
    await Linking.openURL('tel:' + otherParty.phone);
  };

  const openMap = async () => {
    if (!booking?.job) return;
    const query = booking.job.latitude && booking.job.longitude
      ? String(booking.job.latitude) + ',' + String(booking.job.longitude)
      : encodeURIComponent(booking.job.address || booking.job.estate + ', ' + booking.job.city);
    await Linking.openURL('https://www.google.com/maps/search/?api=1&query=' + query);
  };

  const openConversation = async () => {
    try {
      let conversationId = booking?.conversationId;
      if (!conversationId) {
        const { data } = await http.post('/api/bookings/' + bookingId + '/conversation');
        conversationId = data?.conversationId;
      }
      if (!conversationId) {
        Alert.alert('Messages unavailable', 'Could not open this booking conversation.');
        return;
      }
      navigation.navigate('Conversation', {
        conversationId: String(conversationId),
        name: otherParty?.name || (isHandyman ? 'Client' : 'Handyman'),
      });
    } catch (error: any) {
      Alert.alert('Messages unavailable', error?.response?.data?.message || 'Please try again.');
    }
  };

  const shareBooking = async () => {
    if (!booking) return;
    await Share.share({
      message: [
        'Ekazi booking #' + booking.id,
        'Handyman: ' + booking.handyman.name,
        'Client: ' + (booking.client?.name || 'Client'),
        'Service: ' + booking.job.serviceName,
        'Location: ' + (booking.job.address || booking.job.estate + ', ' + booking.job.city),
        'Total: KES ' + booking.total.toLocaleString(),
      ].join('\n'),
    });
  };

  const submitCancellation = async () => {
    if (!reasonCode) {
      Alert.alert('Choose a reason', 'Select the closest cancellation reason before continuing.');
      return;
    }
    setCancelling(true);
    try {
      await http.post('/api/bookings/' + bookingId + '/cancel', {
        reasonCode,
        reason: selectedReason,
        notes: notes.trim() || undefined,
      });
      navigation.navigate('Tabs', { screen: isHandyman ? 'Requests' : 'Requests' });
    } catch (error: any) {
      Alert.alert('Could not cancel', error?.response?.data?.message || 'Please contact support.');
    } finally {
      setCancelling(false);
    }
  };

  if (!booking) {
    return (
      <ScreenScroll backgroundColor={colors.bg} contentContainerStyle={{ justifyContent: 'center' }}>
        <Text style={{ color: colors.muted }}>Loading confirmed booking...</Text>
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll backgroundColor={colors.bg}>
      <Card style={{ backgroundColor: colors.greenSoft, borderColor: '#BBF7D0', alignItems: 'center' }}>
        <Text style={{ fontWeight: '900', fontSize: 20 }}>Booking Confirmed</Text>
        <Text style={{ color: colors.muted, marginTop: 8, textAlign: 'center' }}>
          {isHandyman ? 'You are connected with the client for this job.' : booking.handyman.name + ' accepted through your selected quote.'}
        </Text>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <Text style={{ fontWeight: '900', fontSize: 17 }}>{otherParty?.name || 'Contact'}</Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>{isHandyman ? 'Client contact' : booking.job.serviceName}</Text>
        <Text style={{ color: colors.primary, fontWeight: '900', marginTop: 8 }}>{otherParty?.phone || 'Phone not available'}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <SecondaryButton title={isHandyman ? 'Call Client' : 'Call Handyman'} onPress={() => void callOtherParty()} style={{ flex: 1 }} />
          <SecondaryButton title="Message" onPress={() => void openConversation()} style={{ flex: 1 }} />
        </View>
        <SecondaryButton title="Open Map" onPress={() => void openMap()} style={{ marginTop: 10 }} />
      </Card>

      <Card style={{ marginTop: 14 }}>
        <Text style={{ fontWeight: '900' }}>Job Details</Text>
        <Text style={{ color: colors.muted, marginTop: 8 }}>
          {booking.job.scheduledFor ? new Date(booking.job.scheduledFor).toLocaleString('en-KE') : booking.job.scheduleType}
        </Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>Estimated duration: {booking.durationHours || '?'} hours</Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>{booking.job.address || booking.job.estate + ', ' + booking.job.city}</Text>
        <Text style={{ marginTop: 12, fontWeight: '900' }}>KES {booking.total.toLocaleString()}</Text>
        <Text style={{ color: colors.danger, marginTop: 4 }}>
          Ekazi commission ({booking.commission?.percent || 15}%): KES {(booking.commission?.amount || 0).toLocaleString()}
        </Text>
        <Text style={{ color: colors.primary, marginTop: 4, fontWeight: '900' }}>
          Handyman payout: KES {(booking.commission?.handymanPayout || 0).toLocaleString()}
        </Text>
      </Card>

      <Card style={{ marginTop: 14, backgroundColor: colors.blueSoft }}>
        <Text style={{ fontWeight: '900' }}>Trust and cancellation policy</Text>
        <Text style={{ color: colors.muted, marginTop: 8 }}>
          Handyman repeated cancellations reduce reliability score. Below 75%, the account is suspended for 1 day.
        </Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>
          Clients may receive warnings, suspension, or ban for abuse, fraud, unsafe conduct, or repeated unfair cancellations.
        </Text>
      </Card>

      {showCancelForm ? (
        <Card style={{ marginTop: 14 }}>
          <Text style={{ fontWeight: '900' }}>Why are you cancelling?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {reasonOptions.map(([code, label]) => {
              const active = reasonCode === code;
              return (
                <Pressable
                  key={code}
                  onPress={() => setReasonCode(code)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: radius.lg,
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                  }}
                >
                  <Text style={{ color: active ? 'white' : colors.ink, fontWeight: '800' }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Optional notes for Ekazi support"
            placeholderTextColor={colors.muted}
            style={{ minHeight: 86, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginTop: 12, textAlignVertical: 'top' }}
          />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <SecondaryButton title="Keep Booking" onPress={() => setShowCancelForm(false)} style={{ flex: 1 }} />
            <PrimaryButton title={cancelling ? 'Cancelling...' : 'Submit Cancel'} onPress={() => void submitCancellation()} disabled={cancelling} style={{ flex: 1, backgroundColor: colors.danger }} />
          </View>
        </Card>
      ) : null}

      <View style={{ marginTop: 16 }}>
        <PrimaryButton title="Share Booking" onPress={() => void shareBooking()} />
        <SecondaryButton title="Cancel Booking" onPress={() => setShowCancelForm(true)} style={{ marginTop: 12 }} />
      </View>
    </ScreenScroll>
  );
}
