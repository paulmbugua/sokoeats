import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from './AppIcon';

type Api = <T>(path: string, options?: RequestInit) => Promise<T>;
type Order = { id: string; code: string; status: string; financeState: string; vendorName: string; riderUserId: string | null; total: number };
type Point = { latitude: number; longitude: number };
type Tracking = {
  id: string; code: string; vendorName: string; status: string; financeState: string;
  deliveryAddress: string; recipientName: string; recipientPhone: string | null; notes: string;
  pickup: Point | null; destination: Point | null;
  rider: { name: string; phone: string | null; location: (Point & { capturedAt: string; stale: boolean; accuracy: number }) | null } | null;
  timeline: { key: string; label: string; at: string | null }[];
  estimate: { expectedAt: string; minutes: number; overdue: boolean; basis: string } | null;
  serverTime: string;
};

function usePolling(run: () => Promise<void>, interval = 15000) {
  useEffect(() => {
    let busy = false, disposed = false;
    const tick = async () => {
      if (busy || disposed || AppState.currentState !== 'active') return;
      busy = true;
      try { await run(); } finally { busy = false; }
    };
    void tick();
    const timer = setInterval(() => void tick(), interval);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void tick(); });
    return () => { disposed = true; clearInterval(timer); subscription.remove(); };
  }, [run, interval]);
}

export function DeliveryTracker({ api, role, userId }: { api: Api; role: string; userId: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const rider = ['rider', 'courier'].includes(role);
  const refresh = useCallback(async () => {
    try { const result = await api<{ orders: Order[] }>('/api/deliveries'); setOrders(result.orders); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Orders could not be refreshed'); }
    finally { setLoading(false); }
  }, [api, userId]);
  usePolling(refresh);
  const claim = async (order: Order) => {
    try { await api(`/api/deliveries/${order.id}/actions`, { method: 'POST', body: JSON.stringify({ action: 'claim' }) }); await refresh(); setSelected(order.id); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to accept delivery'); }
  };
  return <View style={s.list}>
    <Text style={s.heading}>{rider ? 'Your deliveries' : 'Order tracking'}</Text>
    {loading && <ActivityIndicator color="#007b50" />}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!loading && !orders.length && <Text style={s.muted}>{rider ? 'No deliveries are available in your approved area yet.' : 'Your paid orders will appear here.'}</Text>}
    {orders.map(order => <TouchableOpacity key={order.id} style={s.order} disabled={rider && !order.riderUserId} onPress={() => setSelected(order.id)}>
      <View style={s.row}><View style={s.grow}><Text style={s.title}>{order.vendorName}</Text><Text style={s.muted}>{order.code}</Text></View><AppIcon name="chevron" size={20} color="#007b50" /></View>
      <Text style={s.status}>{order.status.replace(/_/g, ' ')}</Text>
      {rider && !order.riderUserId && <TouchableOpacity style={s.button} onPress={() => void claim(order)}><Text style={s.buttonText}>Accept delivery</Text></TouchableOpacity>}
    </TouchableOpacity>)}
    {selected && <TrackingSheet key={selected} api={api} orderId={selected} riderMode={rider} onClose={() => { setSelected(null); void refresh(); }} />}
  </View>;
}

function TrackingSheet({ api, orderId, riderMode, onClose }: { api: Api; orderId: string; riderMode: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Tracking | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState('');
  const [sharing, setSharing] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const refresh = useCallback(async () => {
    try {
      const result = await api<{ tracking: Tracking }>(`/api/deliveries/${orderId}`);
      if (alive.current) { setData(result.tracking); setUpdatedAt(new Date()); setError(''); }
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Tracking is temporarily unavailable'); }
  }, [api, orderId]);
  usePolling(refresh);
  const terminal = data?.status === 'delivered' || data?.status === 'cancelled';
  useEffect(() => {
    if (!sharing || !riderMode || terminal) return;
    let disposed = false, uploading = false, lastSent = 0;
    let watch: Location.LocationSubscription | undefined;
    const start = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) throw new Error('Allow location access to share your position.');
        if (disposed) return;
        watch = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 10 }, async fix => {
          if (disposed || uploading || Date.now() - lastSent < 10000) return;
          if (fix.coords.accuracy == null || fix.coords.accuracy > 100) { setLocationMessage('Waiting for a more accurate GPS reading...'); return; }
          uploading = true;
          try {
            await api(`/api/deliveries/${orderId}/location`, { method: 'POST', body: JSON.stringify({ latitude: fix.coords.latitude, longitude: fix.coords.longitude, accuracy: fix.coords.accuracy, capturedAt: new Date(fix.timestamp).toISOString() }) });
            lastSent = Date.now();
            if (!disposed) setLocationMessage('Position shared. Keep this screen open during delivery.');
          } catch (e) { if (!disposed) setLocationMessage(e instanceof Error ? e.message : 'Location upload failed'); }
          finally { uploading = false; }
        }, reason => { if (!disposed) setLocationMessage(reason); });
        if (disposed) watch.remove();
      } catch (e) { if (!disposed) { setSharing(false); setLocationMessage(e instanceof Error ? e.message : 'Unable to share location'); } }
    };
    void start();
    return () => { disposed = true; watch?.remove(); };
  }, [sharing, riderMode, terminal, api, orderId]);
  const action = async (name: string) => {
    setBusy(true); setError('');
    try { await api(`/api/deliveries/${orderId}/actions`, { method: 'POST', body: JSON.stringify({ action: name, ...(name === 'deliver' ? { otp } : {}) }) }); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Delivery update failed'); }
    finally { setBusy(false); }
  };
  const phone = riderMode ? data?.recipientPhone : data?.rider?.phone;
  const coordinate = data?.destination || data?.pickup;
  return <Modal visible animationType="slide" onRequestClose={onClose}>
    <View style={[s.screen, { paddingTop: Math.max(insets.top, 12) }]}>
      <View style={s.header}><TouchableOpacity onPress={onClose} accessibilityLabel="Close tracking" style={s.icon}><AppIcon name="back" size={24} color="#172822" /></TouchableOpacity><Text style={s.heading}>Delivery progress</Text></View>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom + 28, 48) }]}>
        {!data && !error && <ActivityIndicator color="#007b50" />}
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        {data && <>
          <Text style={s.heading}>{data.vendorName}</Text><Text style={s.muted}>{data.code}</Text>
          <Text style={s.hero}>{terminal ? (data.status === 'delivered' ? 'Delivered. Enjoy!' : 'Order cancelled') : data.status === 'arrived' ? 'Your rider has arrived' : data.estimate ? (data.estimate.overdue ? 'Taking longer than estimated' : `About ${data.estimate.minutes} min away`) : data.rider ? 'Your rider is collecting your order' : 'Waiting for dispatch'}</Text>
          {data.estimate && <Text style={s.muted}>{data.estimate.basis}</Text>}
          {coordinate && <MapView style={s.map} provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined} initialRegion={{ ...coordinate, latitudeDelta: 0.03, longitudeDelta: 0.03 }} loadingEnabled={false}>
            {data.destination && <Marker coordinate={data.destination} title="Delivery entrance" pinColor="#007b50" />}
            {data.pickup && <Marker coordinate={data.pickup} title={data.vendorName} pinColor="#ff8c00" />}
            {data.rider?.location && <Marker coordinate={data.rider.location} title={data.rider.location.stale ? 'Last known rider position' : data.rider.name} pinColor="#326ad3" />}
          </MapView>}
          <Text style={s.title}>{data.recipientName}</Text><Text style={s.muted}>{data.deliveryAddress}</Text>
          {!!data.notes && <Text style={s.muted}>{data.notes}</Text>}
          {data.rider && <Text style={s.title}>Rider: {data.rider.name}</Text>}
          {data.rider?.location && <Text style={s.muted}>{data.rider.location.stale ? 'Rider location is out of date' : 'Rider location updated'} at {new Date(data.rider.location.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>}
          {phone && <TouchableOpacity style={s.secondary} onPress={() => void Linking.openURL(`tel:${phone}`).catch(() => setError('Unable to open the phone dialler'))}><Text style={s.title}>{riderMode ? 'Call recipient' : 'Call rider'}</Text></TouchableOpacity>}
          <View style={s.timeline}>{data.timeline.map(step => <View key={step.key} style={s.step}><View style={[s.dot, step.at && s.done]}>{step.at && <AppIcon name="check" size={13} color="white" />}</View><View style={s.grow}><Text style={[s.title, !step.at && s.muted]}>{step.label}</Text><Text style={s.muted}>{step.at ? new Date(step.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : data.status === 'cancelled' ? 'Not completed' : 'Not yet recorded'}</Text></View></View>)}</View>
          <Text style={s.muted}>{updatedAt ? `Checked at ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</Text>
          {riderMode && !terminal && <>
            <TouchableOpacity style={s.secondary} onPress={() => setSharing(!sharing)}><Text style={s.title}>{sharing ? 'Stop sharing location' : 'Share live location'}</Text></TouchableOpacity>
            <Text style={s.muted}>{locationMessage || 'Location sharing runs while this delivery screen is open in the foreground.'}</Text>
            {data.destination && <TouchableOpacity style={s.secondary} onPress={() => {
              const destination = data.status === 'picked_up' || data.status === 'arrived' ? data.destination : data.pickup;
              if (destination) void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}&travelmode=driving`).catch(() => setError('Unable to open navigation'));
            }}><Text style={s.title}>Open navigation</Text></TouchableOpacity>}
            {data.status === 'ready' && <TouchableOpacity style={s.button} disabled={busy} onPress={() => void action('pickup')}><Text style={s.buttonText}>Confirm pickup</Text></TouchableOpacity>}
            {data.status === 'picked_up' && <TouchableOpacity style={s.button} disabled={busy} onPress={() => void action('arrive')}><Text style={s.buttonText}>I have arrived</Text></TouchableOpacity>}
            {data.status === 'arrived' && <><TextInput accessibilityLabel="Delivery OTP" style={s.input} value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} placeholder="Recipient's 6-digit delivery OTP" /><TouchableOpacity style={s.button} disabled={busy || !/^\d{6}$/.test(otp)} onPress={() => void action('deliver')}><Text style={s.buttonText}>Confirm handover</Text></TouchableOpacity></>}
          </>}
        </>}
      </ScrollView>
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4fafd' }, header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }, icon: { padding: 10 },
  content: { padding: 20, gap: 12 }, list: { gap: 12 }, heading: { fontSize: 22, fontWeight: '800', color: '#172822' }, hero: { fontSize: 24, fontWeight: '800', color: '#007b50', marginVertical: 6 },
  order: { padding: 16, borderWidth: 1, borderColor: '#dae3df', borderRadius: 8, backgroundColor: 'white', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, grow: { flex: 1 }, title: { fontSize: 16, fontWeight: '700', color: '#172822' }, muted: { fontSize: 13, lineHeight: 19, color: '#62716a' }, status: { color: '#007b50', fontWeight: '700', textTransform: 'capitalize' },
  error: { color: '#b42318', fontSize: 14 }, button: { backgroundColor: '#ff8c00', padding: 16, borderRadius: 8, alignItems: 'center' }, buttonText: { color: '#241b0b', fontSize: 16, fontWeight: '800' }, secondary: { padding: 14, borderWidth: 1, borderColor: '#ccd9d3', borderRadius: 8, alignItems: 'center' },
  map: { width: '100%', height: 260 }, timeline: { gap: 18, paddingVertical: 16 }, step: { flexDirection: 'row', gap: 12, alignItems: 'center' }, dot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#dce5e0', alignItems: 'center', justifyContent: 'center' }, done: { backgroundColor: '#007b50' }, input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#ccd9d3', padding: 14, borderRadius: 8, color: '#172822' },
});
