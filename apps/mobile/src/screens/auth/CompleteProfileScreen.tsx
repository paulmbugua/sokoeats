import React, { useMemo, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { useShopContext } from '@myhandymanapp/shared/context';
import { categories } from '@myhandymanapp/shared/api/kenya-data';
import Card from '../../components/Card';
import Chip from '../../components/Chip';
import Input from '../../components/Input';
import PrimaryButton from '../../components/PrimaryButton';
import { ScreenScroll } from '../../components/Screen';
import { colors, radius, spacing, typography } from '../../theme/tokens';

const contactModes = [
  ['phone', 'Phone calls'],
  ['whatsapp', 'WhatsApp first'],
  ['sms', 'SMS updates'],
] as const;

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

const PROVIDER_FREE_SERVICE_LIMIT = 2;

function showQualificationPrompt() {
  Alert.alert(
    'Qualification needed',
    'You can start with up to 2 services. To add a third service, first upload a qualification certificate from your Profile after setup.',
    [{ text: 'Choose 2 for now' }],
  );
}

function toggleProviderService(list: string[], value: string) {
  if (list.includes(value)) return toggle(list, value);
  if (list.length >= PROVIDER_FREE_SERVICE_LIMIT) {
    showQualificationPrompt();
    return list;
  }
  return [...list, value];
}

export default function CompleteProfileScreen({ navigation }: any) {
  const {
    http,
    role,
    userName,
    userPhone,
    userEmail,
    refreshUserDetails,
    refreshProfile,
    logout,
  } = useShopContext();
  const isHandyman = role === 'tutor';
  const [name, setName] = useState(userName || '');
  const [phone, setPhone] = useState(userPhone || '');
  const [estate, setEstate] = useState('');
  const [city, setCity] = useState('Nairobi');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [contactPreference, setContactPreference] = useState<'phone' | 'whatsapp' | 'sms'>('phone');
  const [businessName, setBusinessName] = useState(userName ? userName + ' Services' : '');
  const [bio, setBio] = useState('');
  const [serviceRadiusKm, setServiceRadiusKm] = useState('20');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const completionItems = useMemo(
    () =>
      isHandyman
        ? ['Contact clients safely', 'Receive quote decisions', 'Show your service categories', 'Build reliability history']
        : ['Receive quote updates', 'Let providers contact you', 'Reuse job location details', 'Keep bookings traceable'],
    [isHandyman],
  );

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter the name people should see on Ekazi.');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Phone required', 'Add your Kenyan mobile number before continuing.');
      return;
    }
    if (isHandyman && !selectedCategories.length) {
      Alert.alert('Choose services', 'Select at least one service category you can handle.');
      return;
    }
    setSaving(true);
    try {
      const { data } = await http.patch('/api/auth/profile/complete', {
        name: name.trim(),
        phone: phone.trim(),
        city: city.trim() || 'Nairobi',
        estate: estate.trim() || undefined,
        emergencyContact: emergencyContact.trim() || undefined,
        contactPreference,
        businessName: businessName.trim() || name.trim(),
        bio: bio.trim() || undefined,
        serviceRadiusKm: Number(serviceRadiusKm) || 20,
        categories: selectedCategories,
      });
      await Promise.all([refreshUserDetails(), refreshProfile().catch(() => undefined)]);
      Alert.alert('Profile completed', 'Your Ekazi account is ready.');
    } catch (error: any) {
      Alert.alert('Could not save profile', error?.response?.data?.message || 'Check your details and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenScroll backgroundColor={colors.bg}>
      <Card style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
        <Text style={{ color: 'white', fontSize: typography.h1, fontWeight: '900', lineHeight: 38 }}>
          Complete your Ekazi profile
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.88)', marginTop: 8, lineHeight: 22 }}>
          {isHandyman
            ? 'Clients need your contact, service focus and business basics before they can trust your quotes.'
            : 'Providers need a reliable contact and area context before they can quote or arrive.'}
        </Text>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <Text style={{ fontWeight: '900', fontSize: 16 }}>Why this is required</Text>
        {completionItems.map((item) => (
          <Text key={item} style={{ color: colors.mutedDark, marginTop: 8 }}>
            - {item}
          </Text>
        ))}
      </Card>

      <Card style={{ marginTop: 14 }}>
        <Text style={{ fontWeight: '900', fontSize: 16, marginBottom: 12 }}>Contact details</Text>
        <Input label="Display name" value={name} onChangeText={setName} placeholder="Your full name" />
        <Input label="Mobile number" value={phone} onChangeText={setPhone} placeholder="+254 7xx xxx xxx" keyboardType="phone-pad" />
        <Text style={{ color: colors.muted, marginTop: -6, marginBottom: 12 }}>
          Google account: {userEmail || 'not provided'}
        </Text>
        <Input label="Nearest estate or neighbourhood" value={estate} onChangeText={setEstate} placeholder="Kilimani, Rongai, Ruaka..." />
        <Input label="City" value={city} onChangeText={setCity} placeholder="Nairobi" />
        <Input label="Backup contact (optional)" value={emergencyContact} onChangeText={setEmergencyContact} placeholder="+254 7xx xxx xxx" keyboardType="phone-pad" />
        <Text style={{ fontWeight: '800', marginBottom: 8 }}>Preferred contact method</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {contactModes.map(([value, label]) => (
            <Chip
              key={value}
              label={label}
              active={contactPreference === value}
              onPress={() => setContactPreference(value)}
            />
          ))}
        </View>
      </Card>

      {isHandyman ? (
        <Card style={{ marginTop: 14 }}>
          <Text style={{ fontWeight: '900', fontSize: 16, marginBottom: 12 }}>Provider profile</Text>
          <Input label="Business or trade name" value={businessName} onChangeText={setBusinessName} placeholder="e.g. Mwangi Plumbing Works" />
          <Input label="Service radius in km" value={serviceRadiusKm} onChangeText={setServiceRadiusKm} placeholder="20" keyboardType="numeric" />
          <Text style={{ fontWeight: '800', marginBottom: 8 }}>Services you handle</Text>
          <Text style={{ color: colors.muted, marginBottom: 10, lineHeight: 20 }}>
            Start with 1 or 2 core services. Adding a third service requires a qualification certificate review.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {categories.map((category) => (
              <Chip
                key={category.id}
                label={category.name}
                active={selectedCategories.includes(category.id)}
                onPress={() => setSelectedCategories((current) => toggleProviderService(current, category.id))}
              />
            ))}
          </View>
          <Text style={{ fontWeight: '800', marginBottom: 8 }}>Short work bio</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            multiline
            maxLength={600}
            placeholder="Mention experience, common jobs, tools, availability and areas served."
            placeholderTextColor={colors.muted}
            style={{
              minHeight: 112,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.lg,
              padding: 14,
              textAlignVertical: 'top',
              color: colors.text,
              backgroundColor: colors.surface,
            }}
          />
          <Text style={{ color: colors.muted, marginTop: 6 }}>{bio.length}/600</Text>
        </Card>
      ) : null}

      <View style={{ marginTop: 18, gap: 12 }}>
        <PrimaryButton title={saving ? 'Saving profile...' : 'Save and continue'} onPress={() => void save()} disabled={saving} />
        <Text
          onPress={() => void logout()}
          style={{ textAlign: 'center', color: colors.muted, fontWeight: '800', paddingVertical: spacing.sm }}
        >
          Use a different account
        </Text>
      </View>
    </ScreenScroll>
  );
}
