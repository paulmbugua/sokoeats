import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker, type MapPressEvent, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from './AppIcon';

export type DeliveryLocation = {
  address: string;
  latitude: number;
  longitude: number;
};

const NAIROBI = { latitude: -1.286389, longitude: 36.817223 };

async function addressFor(latitude: number, longitude: number) {
  const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
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
  const initialPoint = initialCoordinates || NAIROBI;
  const [point, setPoint] = useState(initialPoint);
  const [address, setAddress] = useState(initialAddress || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Move the pin to the exact entrance where the rider should arrive.');
  const region = useMemo<Region>(() => ({ ...point, latitudeDelta: 0.012, longitudeDelta: 0.012 }), [point]);

  useEffect(() => {
    if (!visible) return;
    setPoint(initialCoordinates || NAIROBI);
    setAddress(initialAddress || '');
    setMessage('Move the pin to the exact entrance where the rider should arrive.');
  }, [visible, initialAddress, initialCoordinates?.latitude, initialCoordinates?.longitude]);

  const choosePoint = async (latitude: number, longitude: number) => {
    setPoint({ latitude, longitude });
    setBusy(true);
    try {
      setAddress(await addressFor(latitude, longitude));
      setMessage('Pin selected. Add an apartment, floor, gate, or landmark if needed.');
    } catch {
      setMessage('Pin selected. Enter a clear address or nearby landmark below.');
    } finally {
      setBusy(false);
    }
  };

  const useCurrentLocation = async () => {
    setBusy(true);
    setMessage('Finding your precise location...');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setMessage('Location permission is required. Enable it in device settings or move the pin manually.');
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await choosePoint(current.coords.latitude, current.coords.longitude);
    } catch {
      setMessage('Your location could not be read. Check GPS and try again, or move the pin manually.');
    } finally {
      setBusy(false);
    }
  };

  const handleMapPress = (event: MapPressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    void choosePoint(latitude, longitude);
  };

  const confirm = () => {
    if (!address.trim()) {
      setMessage('Add a delivery address or landmark before continuing.');
      return;
    }
    onConfirm({ address: address.trim(), ...point });
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

        <View style={styles.mapWrap}>
          <MapView style={StyleSheet.absoluteFill} region={region} onPress={handleMapPress} showsUserLocation showsMyLocationButton={false}>
            <Marker coordinate={point} draggable onDragEnd={(event) => void choosePoint(event.nativeEvent.coordinate.latitude, event.nativeEvent.coordinate.longitude)} />
          </MapView>
          <TouchableOpacity style={styles.locationButton} onPress={() => void useCurrentLocation()} disabled={busy}>
            {busy ? <ActivityIndicator size="small" color="#ffffff" /> : <AppIcon name="pin" size={18} color="#ffffff" />}
            <Text style={styles.locationButtonText}>{busy ? 'Locating...' : 'Use your location'}</Text>
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
            <Text style={styles.coordinateText}>{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</Text>
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
