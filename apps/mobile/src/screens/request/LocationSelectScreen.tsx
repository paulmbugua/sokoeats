import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { estates } from '@myhandymanapp/shared/api/kenya-data';
import { colors, spacing, radius } from '../../theme/tokens';
import StepProgress from '../../components/StepProgress';
import PrimaryButton from '../../components/PrimaryButton';
import LocationPicker, { type PickedLocation } from '../../components/LocationPicker';
import { Screen } from '../../components/Screen';

export default function LocationSelectScreen({ route, navigation }: any) {
  const { draft } = route.params;
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const list = useMemo(
    () =>
      (estates || [])
        .filter((estate: any) => estate.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8),
    [query],
  );

  const chooseEstate = (estate: any) => {
    setQuery(estate.name);
    setLocation((current) => ({
      latitude: current?.latitude ?? -1.286389,
      longitude: current?.longitude ?? 36.817223,
      address: current?.address || estate.name,
      estate: estate.name,
      city: estate.city || 'Nairobi',
    }));
  };

  const continueFlow = () => {
    if (!location?.address || !Number.isFinite(location.latitude)) {
      Alert.alert('Pin the job location', 'Use your current location or tap the map.');
      return;
    }
    navigation.navigate('ScheduleSelect', {
      draft: {
        ...draft,
        estate: location.estate || query || 'Nairobi',
        city: location.city || 'Nairobi',
        address: location.address,
        latitude: location.latitude,
        longitude: location.longitude,
      },
    });
  };

  return (
    <Screen backgroundColor="white">
      <StepProgress step={4} total={6} label="Where is the job?" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, paddingBottom: 96 }}
      >
        <LocationPicker value={location} onChange={setLocation} />

        <Text style={{ marginTop: 16, color: colors.muted, fontWeight: '800' }}>
          Search a nearby estate
        </Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Estate or neighbourhood"
          placeholderTextColor={colors.muted}
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            paddingHorizontal: 12,
            paddingVertical: 12,
            marginTop: 8,
          }}
        />
        {query ? (
          <View style={{ marginTop: 8 }}>
            {list.map((estate: any) => (
              <Pressable
                key={estate.id}
                onPress={() => chooseEstate(estate)}
                style={{
                  paddingVertical: 11,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Text style={{ fontWeight: '800' }}>{estate.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={{ textAlign: 'center', marginTop: 12, color: colors.muted, fontSize: 12 }}>
          The exact address is shared only with the handyman whose quote you accept.
        </Text>
        <View style={{ marginTop: 16 }}>
          <PrimaryButton title="Continue" onPress={continueFlow} />
        </View>
      </ScrollView>
    </Screen>
  );
}
