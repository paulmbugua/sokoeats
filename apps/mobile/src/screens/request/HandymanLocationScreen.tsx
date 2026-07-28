import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useShopContext } from '@myhandymanapp/shared/context';
import { categories } from '@myhandymanapp/shared/api/kenya-data';
import LocationPicker, { type PickedLocation } from '../../components/LocationPicker';
import Chip from '../../components/Chip';
import PrimaryButton from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { colors, spacing } from '../../theme/tokens';

const PROVIDER_FREE_SERVICE_LIMIT = 2;
const EXTRA_SERVICE_CERTIFICATE_STATUSES = new Set(['pending', 'approved']);

export default function HandymanLocationScreen({ navigation }: any) {
  const { http } = useShopContext();
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [canAddExtraServices, setCanAddExtraServices] = useState(false);

  useEffect(() => {
    let mounted = true;
    http.get('/api/handyman/profile')
      .then(({ data }) => {
        if (!mounted) return;
        const profile = data?.profile || {};
        const status = String(profile.certificate_status || profile.verification?.certificateStatus || '').toLowerCase();
        setCanAddExtraServices(Boolean(profile.certificate_url || profile.verification?.certificateUrl || EXTRA_SERVICE_CERTIFICATE_STATUSES.has(status)));
        if (Array.isArray(profile.categories) && profile.categories.length) {
          setSelectedCategories(profile.categories.map(String));
        }
      })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, [http]);

  const toggleCategory = (id: string) => {
    setSelectedCategories((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= PROVIDER_FREE_SERVICE_LIMIT && !canAddExtraServices) {
        Alert.alert(
          'Qualification needed',
          'You can provide up to 2 services right away. Upload a qualification certificate from Profile to add a third service.',
          [{ text: 'Choose 2 for now' }],
        );
        return current;
      }
      return [...current, id];
    });
  };

  const save = async () => {
    if (!location?.address) {
      Alert.alert('Choose your service location', 'Use your current location or pin the map.');
      return;
    }
    if (!selectedCategories.length) {
      Alert.alert('Choose your services', 'Select at least one category you can handle.');
      return;
    }
    setSaving(true);
    try {
      await http.put('/api/handyman/profile/location', {
        ...location,
        categories: selectedCategories,
      });
      Alert.alert('Service area saved', 'Clients can now assess your location when reviewing quotes.', [
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      Alert.alert(
        'Could not save location',
        error?.response?.data?.message || 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen backgroundColor="white">
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
        <Text style={{ fontSize: 21, fontWeight: '900' }}>Your service base</Text>
        <Text style={{ color: colors.muted, marginTop: 5, marginBottom: 14 }}>
          Pin where you normally operate. Your exact private address is not shown publicly.
        </Text>
        <LocationPicker value={location} onChange={setLocation} />

        <Text style={{ fontWeight: '900', marginTop: 18, marginBottom: 10 }}>
          Services you provide
        </Text>
        <Text style={{ color: colors.muted, marginBottom: 10, lineHeight: 20 }}>
          Choose up to 2 core services. Extra services unlock after your qualification certificate is submitted.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(categories || []).map((category: any) => (
            <Chip
              key={category.id}
              label={category.name}
              active={selectedCategories.includes(String(category.id))}
              onPress={() => toggleCategory(String(category.id))}
            />
          ))}
        </View>
        <View style={{ marginTop: 20 }}>
          <PrimaryButton
            title={saving ? 'Saving...' : 'Save Service Area'}
            onPress={() => void save()}
            disabled={saving}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
