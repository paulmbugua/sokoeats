import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker, PROVIDER_GOOGLE, type MapPressEvent, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from './AppIcon';
import { useMapDiagnostics } from './useMapDiagnostics';
import { waitForLocationFix } from './waitForLocationFix';

export type DeliveryLocation = {
  address: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  source?: 'gps' | 'pin';
};

const NAIROBI = { latitude: -1.286389, longitude: 36.817223 };

async function addressFor(latitude: number, longitude: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const places = await Promise.race([
    Location.reverseGeocodeAsync({ latitude, longitude }),
    new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Address lookup timed out')), 8000); }),
  ]).finally(() => clearTimeout(timer));
  const [place] = places;
  if (!place) return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  return [place.name, place.street, place.district, place.city, place.region]
    .filter((part, index, values) => part && values.indexOf(part) === index)
    .join(', ');
}

export function DeliveryLocationSheet({
  visible,
  initialAddress,
  initialCoordinates,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  initialAddress?: string | null;
  initialCoordinates?: { latitude: number; longitude: number } | null;
  onClose: () => void;
  onConfirm: (location: DeliveryLocation) => void;
}) {
  const insets = useSafeAreaInsets();
  const diagnostics = useMapDiagnostics('delivery-picker', visible);
  const initialPoint = initialCoordinates || NAIROBI;
  const [point, setPoint] = useState<{ latitude: number; longitude: number } | null>(initialCoordinates || null);
  const mapRef = useRef<MapView>(null);
  const request = useRef(0);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [source, setSource] = useState<'gps' | 'pin'>('pin');
  const [address, setAddress] = useState(initialAddress || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Move the pin to the exact entrance where the rider should arrive.');

  useEffect(() => {
    if (!visible) return;
    setPoint(initialCoordinates || null);
    setAccuracy(null);
    setBusy(false);
    setAddress(initialAddress || '');
    setMessage('Move the pin to the exact entrance where the rider should arrive.');
    return () => { request.current += 1; };
  }, [visible, initialAddress, initialCoordinates?.latitude, initialCoordinates?.longitude]);

  const choosePoint = async (latitude: number, longitude: number, precision: number | null = null) => {
    const id = ++request.current;
    setPoint({ latitude, longitude });
    setAccuracy(precision);
    setSource(precision == null ? 'pin' : 'gps');
    setAddress('');
    setBusy(true);
    try {
      const resolved = await addressFor(latitude, longitude);
      if (id !== request.current) return;
      setAddress(resolved);
      setMessage(precision != null && precision > 50 ? 'GPS is approximate. Adjust the pin to your entrance before confirming.' : 'Pin selected. Add an apartment, floor, gate, or landmark if needed.');
    } catch {
      if (id !== request.current) return;
      setMessage('Pin selected. Enter a clear address or nearby landmark below.');
    } finally {
      if (id === request.current) setBusy(false);
    }
  };

  const useCurrentLocation = async () => {
    const id = ++request.current;
    setBusy(true);
    setMessage('Finding your precise location...');
    try {
      if (!(await Location.hasServicesEnabledAsync())) {
        console.info('[SokoEats][Location] device-services-disabled');
        setMessage('Turn on Location or GPS in your device settings, then tap Use your location again. You can also move the map pin manually.');
        return;
      }
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        console.info('[SokoEats][Location] foreground-permission-denied', { canAskAgain: permission.canAskAgain });
        setMessage('Location permission is required. Enable it in device settings or move the pin manually.');
        return;
      }
      const current = await waitForLocationFix((onPosition, onError) => Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 }, onPosition, onError), 15000);
      if (id !== request.current) return;
      if (Date.now() - current.timestamp > 30000) throw new Error('The GPS reading is out of date');
      console.info('[SokoEats][Location] current-position-ready', { accuracy: current.coords.accuracy });
      mapRef.current?.animateToRegion({ latitude: current.coords.latitude, longitude: current.coords.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 350);
      await choosePoint(current.coords.latitude, current.coords.longitude, current.coords.accuracy);
    } catch (error) {
      console.warn('[SokoEats][Location] current-position-failed', { message: error instanceof Error ? error.message : String(error) });
      if (id === request.current) setMessage('Your location could not be read. Check GPS and try again, or move the pin manually.');
    } finally {
      if (id === request.current) setBusy(false);
    }
  };

  const handleMapPress = (event: MapPressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    void choosePoint(latitude, longitude);
  };

  const confirm = () => {
    if (!point) { setMessage('Select your current location or tap the map to place your delivery pin.'); return; }
    if (!address.trim()) {
      setMessage('Add a delivery address or landmark before continuing.');
      return;
    }
    onConfirm({ address: address.trim(), ...point, accuracy, source });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={[styles.screen, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconButton} onPress={onClose} accessibilityLabel="Close location picker">
            <AppIcon name="back" size={21} color="#904d00" />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Choose delivery location</Text>
            <Text style={styles.subtitle}>Accurate pins help riders arrive without calling repeatedly.</Text>
          </View>
        </View>

        <View style={styles.mapWrap} onLayout={diagnostics.onLayout}>
          <MapView ref={mapRef} provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined} style={StyleSheet.absoluteFill} initialRegion={{ ...initialPoint, latitudeDelta: 0.012, longitudeDelta: 0.012 }} onPress={handleMapPress} showsUserLocation showsMyLocationButton={false} loadingEnabled={false} onMapReady={diagnostics.onMapReady} onMapLoaded={diagnostics.onMapLoaded}>
            {point && <Marker coordinate={point} draggable onDragEnd={(event) => void choosePoint(event.nativeEvent.coordinate.latitude, event.nativeEvent.coordinate.longitude)} />}
          </MapView>
          <TouchableOpacity style={styles.locationButton} onPress={() => void useCurrentLocation()} disabled={busy}>
            {busy ? <ActivityIndicator size="small" color="#ffffff" /> : <AppIcon name="pin" size={18} color="#ffffff" />}
            <Text style={styles.locationButtonText}>{busy ? 'Locating...' : 'Your current location'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.details}>
          <Text style={styles.label}>DELIVERY ADDRESS OR LANDMARK</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="Building, estate, street, gate or landmark"
            placeholderTextColor="#897362"
            style={styles.input}
            multiline
          />
          <Text style={styles.message}>{message}</Text>
          <View style={styles.coordinates}>
            <AppIcon name="pin" size={15} color="#006d37" />
            <Text style={styles.coordinateText}>{point ? `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}${accuracy != null ? ` - GPS accuracy ${Math.round(accuracy)} m` : ''}` : 'No delivery pin selected'}</Text>
          </View>
          <TouchableOpacity style={styles.confirmButton} onPress={confirm} disabled={busy}>
            <AppIcon name="check" size={18} color="#2f1500" />
            <Text style={styles.confirmText}>Use this delivery location</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4fafd' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef5f7' },
  headerCopy: { flex: 1 },
  title: { color: '#161d1f', fontSize: 20, lineHeight: 26, fontWeight: '900' },
  subtitle: { color: '#564334', fontSize: 12, lineHeight: 17, marginTop: 2 },
  mapWrap: { flex: 1, minHeight: 330, overflow: 'hidden', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#ddc1ae' },
  locationButton: { position: 'absolute', right: 16, bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#904d00', paddingHorizontal: 15, paddingVertical: 12, borderRadius: 12 },
  locationButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '900' },
  details: { paddingHorizontal: 18, paddingTop: 18 },
  label: { color: '#564334', fontSize: 11, fontWeight: '900' },
  input: { marginTop: 8, minHeight: 64, borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#ddc1ae', color: '#161d1f', fontSize: 15, lineHeight: 21, padding: 14, textAlignVertical: 'top' },
  message: { color: '#564334', fontSize: 12, lineHeight: 18, marginTop: 10 },
  coordinates: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  coordinateText: { color: '#006d37', fontSize: 11, fontWeight: '800' },
  confirmButton: { marginTop: 16, borderRadius: 14, backgroundColor: '#ff8c00', paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  confirmText: { color: '#2f1500', fontSize: 16, fontWeight: '900' },
});
