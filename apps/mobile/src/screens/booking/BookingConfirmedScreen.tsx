import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, Share, Text, TextInput, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type LatLng } from 'react-native-maps';
import * as Location from 'expo-location';
import { useShopContext } from '@myhandymanapp/shared/context';
import Card from '../../components/Card';
import PrimaryButton from '../../components/PrimaryButton';
import SecondaryButton from '../../components/SecondaryButton';
import { ScreenScroll } from '../../components/Screen';
import { colors, radius, spacing } from '../../theme/tokens';

type RoutePoint = LatLng & { label?: string; updatedAt?: string | null; accuracy?: number | null };
type BookingRoute = {
  available?: boolean;
  live?: boolean;
  status?: string;
  source?: string;
  distanceKm?: number | null;
  etaMinutes?: number | null;
  quotedEtaMinutes?: number | null;
  handymanLocation?: RoutePoint | null;
  destination?: RoutePoint | null;
  polyline?: RoutePoint[];
};

function minutesLabel(value?: number | null) {
  if (!value || !Number.isFinite(Number(value))) return 'Waiting';
  const minutes = Math.max(1, Math.round(Number(value)));
  if (minutes < 60) return minutes + ' min';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? hours + ' hr ' + rest + ' min' : hours + ' hr';
}

function recencyLabel(value?: string | null) {
  if (!value) return 'No live update yet';
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'Updated just now';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'Updated just now';
  if (minutes === 1) return 'Updated 1 min ago';
  return 'Updated ' + minutes + ' min ago';
}

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
const clientIssueReasons: Array<[string, string]> = [['client_unreachable', 'Client unreachable'], ['scope_changed', 'Scope changed'], ['payment_pressure', 'Bypass pressure'], ['unsafe_site', 'Unsafe site'], ['disrespectful', 'Disrespectful'], ['harassment', 'Harassment'], ['fraud', 'Fraud/gross issue']];


export default function BookingConfirmedScreen({ route, navigation }: any) {
  const { http, role } = useShopContext();
  const bookingId = route.params?.bookingId;
  const normalizedRole = String(role || '').toLowerCase();
  const isHandyman = ['tutor', 'handyman', 'provider'].includes(normalizedRole);
  const mapRef = useRef<MapView>(null);
  const [booking, setBooking] = useState<any>(null);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [routeNotice, setRouteNotice] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [reasonCode, setReasonCode] = useState('');
  const [notes, setNotes] = useState('');
  const [statusBusy, setStatusBusy] = useState<'arrived' | 'complete' | ''>('');
  const [rating, setRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [issueReasonCode, setIssueReasonCode] = useState('');
  const [issueNotes, setIssueNotes] = useState('');
  const [issueSubmitting, setIssueSubmitting] = useState(false);

  const loadBooking = useCallback(async () => {
    const { data } = await http.get('/api/bookings/' + bookingId);
    setBooking(data.booking);
    return data.booking;
  }, [bookingId, http]);

  useEffect(() => {
    void loadBooking().catch(() => Alert.alert('Could not load booking', 'Return to Requests and try again.'));
  }, [loadBooking]);

  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', () => {
      void loadBooking().catch(() => undefined);
    });
    return unsubscribe;
  }, [loadBooking, navigation]);

  const otherParty = isHandyman ? booking?.client : booking?.handyman;
  const reasonOptions = isHandyman ? handymanReasons : clientReasons;
  const selectedReason = useMemo(
    () => reasonOptions.find(([code]) => code === reasonCode)?.[1] || '',
    [reasonCode, reasonOptions],
  );

  const routeInfo = booking?.route as BookingRoute | undefined;
  const routePoints = useMemo(() => {
    const points = Array.isArray(routeInfo?.polyline) ? routeInfo?.polyline || [] : [];
    if (points.length >= 2) return points.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
    const fallback = [routeInfo?.handymanLocation, routeInfo?.destination].filter(Boolean) as RoutePoint[];
    return fallback.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  }, [routeInfo]);

  useEffect(() => {
    if (routePoints.length < 2) return;
    requestAnimationFrame(() => {
      mapRef.current?.fitToCoordinates(routePoints, {
        edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
        animated: true,
      });
    });
  }, [routePoints]);

  const callOtherParty = async () => {
    if (!otherParty?.phone) {
      Alert.alert('Phone unavailable', 'The other party has not provided a phone number.');
      return;
    }
    await Linking.openURL('tel:' + otherParty.phone);
  };

  const openMap = async () => {
    if (!booking?.job) return;
    const destination = routeInfo?.destination;
    const origin = routeInfo?.handymanLocation;
    if (origin && destination) {
      await Linking.openURL(
        'https://www.google.com/maps/dir/?api=1&origin=' +
          encodeURIComponent(String(origin.latitude) + ',' + String(origin.longitude)) +
          '&destination=' +
          encodeURIComponent(String(destination.latitude) + ',' + String(destination.longitude)) +
          '&travelmode=driving',
      );
      return;
    }
    const query = booking.job.latitude && booking.job.longitude
      ? String(booking.job.latitude) + ',' + String(booking.job.longitude)
      : encodeURIComponent(booking.job.address || booking.job.estate + ', ' + booking.job.city);
    await Linking.openURL('https://www.google.com/maps/search/?api=1&query=' + query);
  };

  const shareHandymanLocation = useCallback(async () => {
    if (!isHandyman || !bookingId) return;
    try {
      setRouteNotice('');
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setRouteNotice('Allow location access so Ekazi can show your arrival time to the client.');
        return;
      }
      setSharingLocation(true);
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await http.put('/api/bookings/' + bookingId + '/location', {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
      await loadBooking();
    } catch (error: any) {
      setRouteNotice(error?.response?.data?.message || error?.message || 'Could not update live route.');
    } finally {
      setSharingLocation(false);
    }
  }, [bookingId, http, isHandyman, loadBooking]);

  useEffect(() => {
    const pollStatus = String(booking?.status || '').toLowerCase();
    if (!bookingId || ['completed', 'complete', 'done', 'cancelled', 'canceled'].includes(pollStatus)) return undefined;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (isHandyman) await shareHandymanLocation();
      else await loadBooking().catch(() => undefined);
    };
    void tick();
    const id = setInterval(() => void tick(), isHandyman ? 25000 : 18000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [booking?.status, bookingId, isHandyman, loadBooking, shareHandymanLocation]);

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
        name: otherParty?.name || (isHandyman ? 'Client' : 'Provider'),
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
        'Provider: ' + booking.handyman.name,
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

  const markArrived = async () => {
    setStatusBusy('arrived');
    try {
      await http.post('/api/bookings/' + bookingId + '/arrived');
      await loadBooking();
      setRouteNotice('You marked yourself as arrived. The client can see that service is starting.');
    } catch (error: any) {
      Alert.alert('Arrival not saved', error?.response?.data?.message || 'Please try again.');
    } finally {
      setStatusBusy('');
    }
  };

  const markComplete = async () => {
    setStatusBusy('complete');
    try {
      await http.post('/api/bookings/' + bookingId + '/complete');
      await loadBooking();
      Alert.alert('Job completed', 'The client can now rate your service.');
    } catch (error: any) {
      Alert.alert('Completion not saved', error?.response?.data?.message || 'Please try again.');
    } finally {
      setStatusBusy('');
    }
  };

  const submitClientIssue = async () => {
    if (!issueReasonCode) {
      Alert.alert('Choose an issue', 'Select the closest client issue before submitting to Ekazi.');
      return;
    }
    setIssueSubmitting(true);
    try {
      await http.post('/api/bookings/' + bookingId + '/client-feedback', {
        reasonCode: issueReasonCode,
        notes: issueNotes.trim() || undefined,
      });
      setIssueReasonCode('');
      setIssueNotes('');
      Alert.alert('Feedback submitted', 'Ekazi will review this client issue and update trust controls where needed.');
    } catch (error: any) {
      Alert.alert('Could not submit feedback', error?.response?.data?.message || 'Please try again.');
    } finally {
      setIssueSubmitting(false);
    }
  };

  const submitRating = async () => {
    if (!rating) {
      Alert.alert('Choose a rating', 'Tap 1 to 5 stars before submitting.');
      return;
    }
    setRatingSubmitting(true);
    try {
      await http.post('/api/bookings/' + bookingId + '/rating', {
        rating,
        comment: reviewComment.trim() || undefined,
      });
      await loadBooking();
      Alert.alert('Rating saved', 'Thank you for helping keep Ekazi providers accountable.');
    } catch (error: any) {
      Alert.alert('Could not save rating', error?.response?.data?.message || 'Please try again.');
    } finally {
      setRatingSubmitting(false);
    }
  };

  const bookingStatus = String(booking?.status || '').toLowerCase();
  const isCompleted = ['completed', 'complete', 'done'].includes(bookingStatus);
  const isInProgress = ['in_progress', 'arrived', 'on_site'].includes(bookingStatus);
  const isCancelled = ['cancelled', 'canceled'].includes(bookingStatus);
  const canRateProvider = Boolean(!isHandyman && isCompleted && !booking?.review?.rating);
  const statusText = isCompleted
    ? 'Completed'
    : isInProgress
      ? 'Provider arrived'
      : isCancelled
        ? 'Cancelled'
        : 'Provider on the way';
  const canCancel = bookingStatus === 'confirmed';

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
          <SecondaryButton title={isHandyman ? 'Call Client' : 'Call Provider'} onPress={() => void callOtherParty()} style={{ flex: 1 }} />
          <SecondaryButton title="Message" onPress={() => void openConversation()} style={{ flex: 1 }} />
        </View>
      </Card>

      <Card style={{ marginTop: 14, padding: 0, overflow: 'hidden' }}>
        <View style={{ padding: spacing.lg }}>
          <Text style={{ fontWeight: '900', fontSize: 17 }}>{isHandyman ? 'Your route to the client' : 'Provider route to you'}</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>
            {routeInfo?.live ? 'Live route is active from the provider phone.' : routeInfo?.status === 'stale' ? 'Last provider location is old. Waiting for a fresh update.' : 'Waiting for provider live location. Showing quoted arrival where available.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <View style={{ flex: 1, backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: 12 }}>
              <Text style={{ color: colors.muted, fontWeight: '800' }}>Time remaining</Text>
              <Text style={{ color: colors.ink, fontWeight: '900', fontSize: 24, marginTop: 4 }}>{minutesLabel(routeInfo?.etaMinutes)}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.blueSoft, borderRadius: radius.lg, padding: 12 }}>
              <Text style={{ color: colors.muted, fontWeight: '800' }}>Distance</Text>
              <Text style={{ color: colors.ink, fontWeight: '900', fontSize: 24, marginTop: 4 }}>{routeInfo?.distanceKm != null ? routeInfo.distanceKm.toFixed(1) + ' km' : '--'}</Text>
            </View>
          </View>
          <Text style={{ color: colors.muted, marginTop: 10 }}>{recencyLabel(routeInfo?.handymanLocation?.updatedAt)}</Text>
          {routeNotice ? <Text style={{ color: colors.danger, marginTop: 8, fontWeight: '800' }}>{routeNotice}</Text> : null}
        </View>
        {routeInfo?.destination && routePoints.length ? (
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={{ height: 250, width: '100%' }}
            initialRegion={{
              latitude: routeInfo.destination.latitude,
              longitude: routeInfo.destination.longitude,
              latitudeDelta: 0.08,
              longitudeDelta: 0.08,
            }}
          >
            {routeInfo.handymanLocation ? <Marker coordinate={routeInfo.handymanLocation} title="Provider" description={routeInfo.live ? 'Live location' : 'Last shared location'} pinColor={colors.primary} /> : null}
            <Marker coordinate={routeInfo.destination} title="Job destination" description={routeInfo.destination.label || 'Client location'} pinColor={colors.danger} />
            {routePoints.length >= 2 ? <Polyline coordinates={routePoints} strokeColor={colors.primary} strokeWidth={5} /> : null}
          </MapView>
        ) : (
          <View style={{ minHeight: 190, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
            <Text style={{ color: colors.muted, textAlign: 'center', fontWeight: '800' }}>Map route will appear after the job destination and provider location are available.</Text>
          </View>
        )}
        <View style={{ padding: spacing.lg, paddingTop: 12 }}>
          {isHandyman ? <SecondaryButton title={sharingLocation ? 'Updating route...' : 'Update My Route Now'} onPress={() => { if (!sharingLocation) void shareHandymanLocation(); }} /> : null}
          <SecondaryButton title="Open in Google Maps" onPress={() => void openMap()} style={{ marginTop: isHandyman ? 10 : 0 }} />
        </View>
      </Card>


      <Card style={{ marginTop: 14, backgroundColor: isCompleted ? colors.greenSoft : '#FFF7ED', borderColor: isCompleted ? '#BBF7D0' : '#FED7AA' }}>
        <Text style={{ fontWeight: '900', fontSize: 17 }}>Service progress</Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>
          {isHandyman
            ? 'Use these controls to keep the client updated. Arrival is allowed even when traffic or the map still shows minutes remaining.'
            : 'Track the provider status here. Once the provider completes the job, you can rate the service.'}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {['Provider on the way', 'Provider arrived', 'Completed'].map((label, index) => {
            const activeIndex = isCompleted ? 2 : isInProgress ? 1 : 0;
            const active = index <= activeIndex;
            return (
              <View key={label} style={{ paddingHorizontal: 11, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: active ? colors.primary : colors.surface, borderWidth: 1, borderColor: active ? colors.primary : colors.border }}>
                <Text style={{ color: active ? 'white' : colors.muted, fontWeight: '900', fontSize: 12 }}>{label}</Text>
              </View>
            );
          })}
        </View>
        <Text style={{ color: colors.ink, fontWeight: '900', fontSize: 22, marginTop: 14 }}>{statusText}</Text>
        {isHandyman && bookingStatus === 'confirmed' ? (
          <PrimaryButton title={statusBusy === 'arrived' ? 'Saving arrival...' : 'Arrived'} onPress={() => void markArrived()} disabled={Boolean(statusBusy)} attention="urgent" style={{ marginTop: 14 }} />
        ) : null}
        {isHandyman && isInProgress ? (
          <PrimaryButton title={statusBusy === 'complete' ? 'Completing...' : 'Mark Complete'} onPress={() => void markComplete()} disabled={Boolean(statusBusy)} attention="urgent" style={{ marginTop: 14 }} />
        ) : null}
        {isHandyman && isCompleted ? (
          <Text style={{ color: colors.primary, fontWeight: '900', marginTop: 12 }}>Completed. The client rating will update your provider profile once submitted.</Text>
        ) : null}
        {!isHandyman && booking.review?.rating ? (
          <Text style={{ color: colors.primary, fontWeight: '900', marginTop: 12 }}>You rated this provider {booking.review.rating}/5. Thank you.</Text>
        ) : null}
      </Card>



      {canRateProvider ? (
        <Card style={{ marginTop: 14, backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }}>
          <Text style={{ fontWeight: '900', fontSize: 18 }}>Rate your provider</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>
            The job is marked complete. Your rating helps Ekazi keep reliable providers visible to clients.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Pressable key={value} onPress={() => setRating(value)} style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: value <= rating ? '#F59E0B' : 'white', borderWidth: 1, borderColor: value <= rating ? '#F59E0B' : colors.border }}>
                <Text style={{ color: value <= rating ? 'white' : colors.muted, fontWeight: '900', fontSize: 18 }}>{value}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={reviewComment}
            onChangeText={setReviewComment}
            multiline
            placeholder="Optional comment for Ekazi and the provider"
            placeholderTextColor={colors.muted}
            style={{ minHeight: 92, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginTop: 12, textAlignVertical: 'top', backgroundColor: 'white' }}
          />
          <PrimaryButton title={ratingSubmitting ? 'Saving rating...' : 'Submit provider rating'} onPress={() => void submitRating()} disabled={ratingSubmitting} style={{ marginTop: 12 }} attention="urgent" />
        </Card>
      ) : null}

      {isHandyman ? (
        <Card style={{ marginTop: 14, backgroundColor: '#F8FAFC' }}>
          <Text style={{ fontWeight: '900', fontSize: 17 }}>Client feedback to Ekazi</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>Report client conduct that affected safety, payment, scope, or communication. Serious reports affect client trust score and may trigger suspension or ban.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {clientIssueReasons.map(([code, label]) => {
              const active = issueReasonCode === code;
              return (
                <Pressable key={code} onPress={() => setIssueReasonCode(code)} style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: active ? colors.primary : 'white', borderWidth: 1, borderColor: active ? colors.primary : colors.border }}>
                  <Text style={{ color: active ? 'white' : colors.ink, fontWeight: '900', fontSize: 12 }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput value={issueNotes} onChangeText={setIssueNotes} multiline placeholder="Optional details for Ekazi support review" placeholderTextColor={colors.muted} style={{ minHeight: 86, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginTop: 12, textAlignVertical: 'top', backgroundColor: 'white' }} />
          <PrimaryButton title={issueSubmitting ? 'Submitting...' : 'Submit Client Feedback'} onPress={() => void submitClientIssue()} disabled={issueSubmitting} style={{ marginTop: 12 }} />
        </Card>
      ) : null}

      <Card style={{ marginTop: 14 }}>
        <Text style={{ fontWeight: '900' }}>Job Details</Text>
        <Text style={{ color: colors.muted, marginTop: 8 }}>
          {booking.job.scheduledFor ? new Date(booking.job.scheduledFor).toLocaleString('en-KE') : booking.job.scheduleType}
        </Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>Estimated duration: {booking.durationHours || '?'} hours</Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>{booking.job.address || booking.job.estate + ', ' + booking.job.city}</Text>
        <Text style={{ marginTop: 12, fontWeight: '900' }}>KES {booking.total.toLocaleString()}</Text>
      </Card>

      <Card style={{ marginTop: 14, backgroundColor: colors.blueSoft }}>
        <Text style={{ fontWeight: '900' }}>Trust and cancellation policy</Text>
        <Text style={{ color: colors.muted, marginTop: 8 }}>
          Provider repeated cancellations reduce reliability score. Below 75%, the account is suspended for 1 day.
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
        {canCancel ? <SecondaryButton title="Cancel Booking" onPress={() => setShowCancelForm(true)} style={{ marginTop: 12 }} /> : null}
      </View>
    </ScreenScroll>
  );
}
