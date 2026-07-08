import React, { useRef, useState } from 'react';
import { Alert, Platform, Pressable, Text, TextInput, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type MapPressEvent, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { colors, radius } from '../theme/tokens';

export type PickedLocation = {
  latitude: number;
  longitude: number;
  address: string;
  estate?: string;
  city: string;
};

type Props = {
  value?: PickedLocation | null;
  onChange: (location: PickedLocation) => void;
};

const NAIROBI: Region = {
  latitude: -1.286389,
  longitude: 36.817223,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

export default function LocationPicker({ value, onChange }: Props) {
  const mapRef = useRef<MapView>(null);
  const [locating, setLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [address, setAddress] = useState(value?.address || '');

  const resolveAddress = async (latitude: number, longitude: number) => {
    try {
      const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
      const parts = [
        place?.name,
        place?.street,
        place?.district,
        place?.subregion,
        place?.city,
      ].filter(Boolean);
      const resolved = [...new Set(parts)].join(', ') || address || 'Pinned location';
      setAddress(resolved);
      onChange({
        latitude,
        longitude,
        address: resolved,
        estate: place?.district || place?.subregion || undefined,
        city: place?.city || 'Nairobi',
      });
    } catch {
      const resolved = address || 'Pinned location';
      onChange({ latitude, longitude, address: resolved, city: 'Nairobi' });
    }
  };

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Location permission required',
          'Allow Ekazi to use your location, or pin the address manually on the map.',
        );
        return;
      }
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coordinate = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      };
      mapRef.current?.animateToRegion({ ...coordinate, latitudeDelta: 0.02, longitudeDelta: 0.02 });
      await resolveAddress(coordinate.latitude, coordinate.longitude);
    } catch {
      Alert.alert('Location unavailable', 'Pin your location manually on the map.');
    } finally {
      setLocating(false);
    }
  };

  const pinLocation = (event: MapPressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    void resolveAddress(latitude, longitude);
  };

  const coordinate = value
    ? { latitude: value.latitude, longitude: value.longitude }
    : null;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        onPress={() => void useCurrentLocation()}
        style={{
          borderWidth: 1,
          borderColor: colors.primary,
          borderRadius: radius.md,
          paddingVertical: 12,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Text style={{ color: colors.primary, fontWeight: '900' }}>
          {locating ? 'Finding your location...' : 'Use Current Location'}
        </Text>
      </Pressable>

      <View style={{ height: 280, borderRadius: radius.md, overflow: 'hidden' }}>
        <MapView
          ref={mapRef}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          style={{ flex: 1 }}
          loadingEnabled
          loadingIndicatorColor={colors.primary}
          loadingBackgroundColor="#F3F4F6"
          onMapReady={() => {
            setMapReady(true);
            if (__DEV__) console.log('[location-map] ready');
          }}
          initialRegion={
            coordinate
              ? { ...coordinate, latitudeDelta: 0.02, longitudeDelta: 0.02 }
              : NAIROBI
          }
          onPress={pinLocation}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {coordinate ? <Marker coordinate={coordinate} title="Selected location" /> : null}
        </MapView>
        {!mapReady ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#F3F4F6',
            }}
          >
            <Text style={{ color: colors.muted, fontWeight: '800' }}>Loading map...</Text>
          </View>
        ) : null}
      </View>

      <Text style={{ color: colors.muted, marginTop: 8, fontSize: 12 }}>
        Tap the map to place the pin precisely.
      </Text>
      <TextInput
        value={address}
        onChangeText={setAddress}
        onEndEditing={() => {
          if (value && address.trim()) onChange({ ...value, address: address.trim() });
        }}
        placeholder="Building, road, estate or landmark"
        placeholderTextColor={colors.muted}
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          paddingHorizontal: 12,
          paddingVertical: 12,
          marginTop: 10,
          color: colors.text,
          backgroundColor: 'white',
        }}
      />
    </View>
  );
}
