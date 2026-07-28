import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
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


const MAP_LOG_PREFIX = '[location-map]';

function mapLog(step: string, details: Record<string, unknown> = {}) {
  if (!__DEV__) return;
  console.log(MAP_LOG_PREFIX, step, details);
}

function constantsExtra() {
  const constants = Constants as unknown as {
    expoConfig?: { extra?: Record<string, unknown> };
    manifest?: { extra?: Record<string, unknown> };
    manifest2?: { extra?: Record<string, unknown> };
  };
  return {
    ...(constants.manifest?.extra || {}),
    ...(constants.manifest2?.extra || {}),
    ...(constants.expoConfig?.extra || {}),
  };
}

function runtimeMapsKey() {
  const extra = constantsExtra();
  return String(
    extra.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
      (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env
        ?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
      '',
  );
}

function summarizeMapsKey(key: string) {
  return {
    hasKey: Boolean(key),
    length: key.length,
    prefix: key ? key.slice(0, 6) : undefined,
    suffix: key ? key.slice(-4) : undefined,
  };
}

function summarizeRegion(region: Region | null) {
  if (!region) return null;
  return {
    latitude: Number(region.latitude.toFixed(6)),
    longitude: Number(region.longitude.toFixed(6)),
    latitudeDelta: Number(region.latitudeDelta.toFixed(6)),
    longitudeDelta: Number(region.longitudeDelta.toFixed(6)),
  };
}

export default function LocationPicker({ value, onChange }: Props) {
  const mapRef = useRef<MapView>(null);
  const [locating, setLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [address, setAddress] = useState(value?.address || '');
  const mapProvider = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;

  const resolveAddress = async (latitude: number, longitude: number) => {
    mapLog('reverse_geocode:start', { latitude, longitude });
    try {
      const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
      mapLog('reverse_geocode:ok', {
        hasPlace: Boolean(place),
        city: place?.city,
        district: place?.district,
        subregion: place?.subregion,
      });
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
    } catch (error) {
      mapLog('reverse_geocode:error', {
        message: error instanceof Error ? error.message : String(error),
      });
      const resolved = address || 'Pinned location';
      onChange({ latitude, longitude, address: resolved, city: 'Nairobi' });
    }
  };

  const useCurrentLocation = async () => {
    mapLog('current_location:press');
    setLocating(true);
    try {
      mapLog('permission:request');
      const permission = await Location.requestForegroundPermissionsAsync();
      mapLog('permission:result', {
        granted: permission.granted,
        status: permission.status,
        canAskAgain: permission.canAskAgain,
      });
      if (!permission.granted) {
        Alert.alert(
          'Location permission required',
          'Allow Ekazi to use your location, or pin the address manually on the map.',
        );
        return;
      }
      mapLog('current_position:start', { accuracy: 'Balanced' });
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      mapLog('current_position:ok', {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        accuracy: current.coords.accuracy,
      });
      const coordinate = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      };
      mapRef.current?.animateToRegion({ ...coordinate, latitudeDelta: 0.02, longitudeDelta: 0.02 });
      await resolveAddress(coordinate.latitude, coordinate.longitude);
    } catch (error) {
      mapLog('current_location:error', {
        message: error instanceof Error ? error.message : String(error),
      });
      Alert.alert('Location unavailable', 'Pin your location manually on the map.');
    } finally {
      setLocating(false);
    }
  };

  const pinLocation = (event: MapPressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    mapLog('pin:press', { latitude, longitude });
    void resolveAddress(latitude, longitude);
  };

  const coordinate = value
    ? { latitude: value.latitude, longitude: value.longitude }
    : null;
  const initialRegion = coordinate
    ? { ...coordinate, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : NAIROBI;

  useEffect(() => {
    const key = runtimeMapsKey();
    const constants = Constants as unknown as {
      appOwnership?: string | null;
      executionEnvironment?: string | null;
    };
    mapLog('mount', {
      platform: Platform.OS,
      provider: mapProvider || 'default',
      key: summarizeMapsKey(key),
      initialRegion: summarizeRegion(initialRegion),
      hasCoordinate: Boolean(coordinate),
      appOwnership: constants.appOwnership,
      executionEnvironment: constants.executionEnvironment,
    });
  }, []);

  useEffect(() => {
    mapLog('state', {
      mapReady,
      mapLoaded,
      coordinate,
      addressLength: address.length,
    });
  }, [address.length, coordinate?.latitude, coordinate?.longitude, mapLoaded, mapReady]);

  useEffect(() => {
    if (!mapReady || mapLoaded) return undefined;
    const timer = setTimeout(() => {
      mapLog('tiles_timeout', {
        reason: 'MapView became ready but Google tiles did not finish loading.',
        likelyCauses: [
          'installed dev build does not contain the native Android Maps API key',
          'Google Cloud key is not allowed for package com.paulmbugua2.ekazi and the EAS keystore SHA-1',
          'Maps SDK for Android is not enabled for this Google Cloud project',
          'billing is not enabled or the key is blocked',
        ],
        nextAction: 'Rebuild and reinstall the development client after confirming Google Cloud Android key restrictions.',
        key: summarizeMapsKey(runtimeMapsKey()),
      });
    }, 8000);
    return () => clearTimeout(timer);
  }, [mapLoaded, mapReady]);

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

      <View
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          mapLog('container:layout', { width, height });
        }}
        style={{ height: 280, borderRadius: radius.md, overflow: 'hidden' }}
      >
        <MapView
          ref={mapRef}
          provider={mapProvider}
          style={{ flex: 1 }}
          loadingEnabled
          loadingIndicatorColor={colors.primary}
          loadingBackgroundColor="#F3F4F6"
          onMapReady={() => {
            setMapReady(true);
            mapLog('ready', {
              provider: mapProvider || 'default',
              key: summarizeMapsKey(runtimeMapsKey()),
            });
          }}
          onMapLoaded={() => {
            setMapLoaded(true);
            mapLog('loaded');
          }}
          onRegionChangeComplete={(region) => {
            mapLog('region_change_complete', summarizeRegion(region) || undefined);
          }}
          initialRegion={initialRegion}
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
