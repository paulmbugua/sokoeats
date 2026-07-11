import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useShopContext } from '@myhandymanapp/shared/context';
import { uploadAsset } from '@myhandymanapp/shared/api/uploadAsset';
import { categories } from '@myhandymanapp/shared/api/kenya-data';
import Card from '../../components/Card';
import Chip from '../../components/Chip';
import Input from '../../components/Input';
import { colors, radius, spacing } from '../../theme/tokens';
import PrimaryButton from '../../components/PrimaryButton';
import SecondaryButton from '../../components/SecondaryButton';
import { Screen } from '../../components/Screen';

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export default function ProfileScreen() {
  const {
    http,
    backendUrl,
    token,
    logout,
    profile,
    userEmail,
    userName,
    userPhone,
    tokens,
    role,
    refreshUserDetails,
    refreshProfile,
  } = useShopContext();
  const isHandyman = role === 'tutor';
  const [loggingOut, setLoggingOut] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({
    completed: 0,
    active: 0,
    quotes: 0,
    conversations: 0,
    cancellations: 0,
    reliability: 100,
  });
  const [handymanProfile, setHandymanProfile] = useState<any>(null);
  const [name, setName] = useState(userName || '');
  const [phone, setPhone] = useState(userPhone || '');
  const [estate, setEstate] = useState('');
  const [city, setCity] = useState('Nairobi');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [contactPreference, setContactPreference] = useState<'phone' | 'whatsapp' | 'sms'>('phone');
  const [businessName, setBusinessName] = useState('');
  const [bio, setBio] = useState('');
  const [serviceRadiusKm, setServiceRadiusKm] = useState('20');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [uploadingVerification, setUploadingVerification] = useState<string | null>(null);

  const displayName = profile?.name?.trim() || userName?.trim() || 'Ekazi customer';
  const verification = handymanProfile?.verification || {
    profileImageUrl: handymanProfile?.profile_image_url,
    profileImageStatus: handymanProfile?.profile_image_status || 'missing',
    idDocumentStatus: handymanProfile?.id_document_status || 'missing',
    certificateStatus: handymanProfile?.certificate_status || 'missing',
    goodConductStatus: handymanProfile?.good_conduct_status || 'missing',
    verified: Boolean(handymanProfile?.verified),
    fullyVerified: Boolean(handymanProfile?.verified && handymanProfile?.certificate_status === 'approved' && handymanProfile?.good_conduct_status === 'approved'),
  };

  const load = useCallback(async () => {
    try {
      const baseRequests = [
        http.get('/api/conversations').catch(() => ({ data: { conversations: [] } })),
      ];
      if (isHandyman) {
        const [conversations, hProfile, quotes] = await Promise.all([
          ...baseRequests,
          http.get('/api/handyman/profile').catch(() => ({ data: { profile: null } })),
          http.get('/api/handyman/quotes').catch(() => ({ data: { quotes: [] } })),
        ]);
        const hp = hProfile.data?.profile || null;
        setHandymanProfile(hp);
        setBusinessName(hp?.business_name || displayName + ' Services');
        setBio(hp?.bio || '');
        setEstate(hp?.estate || '');
        setCity(hp?.city || 'Nairobi');
        setServiceRadiusKm(String(hp?.service_radius_km || 20));
        setSelectedCategories(Array.isArray(hp?.categories) ? hp.categories.map(String) : []);
        const quoteList = Array.isArray(quotes?.data?.quotes) ? quotes.data.quotes : [];
        setStats({
          completed: Number(hp?.jobs_completed || 0),
          active: quoteList.filter((q: any) => ['open', 'accepted'].includes(q.status)).length,
          quotes: quoteList.length,
          conversations: conversations?.data?.conversations?.length || 0,
          cancellations: Number(hp?.cancellation_count || 0),
          reliability: Number(hp?.cancellation_score || 100),
        });
      } else {
        const [conversations, completed, active] = await Promise.all([
          ...baseRequests,
          http.get('/api/jobs', { params: { status: 'completed' } }).catch(() => ({ data: { jobs: [] } })),
          http.get('/api/jobs', { params: { status: 'active' } }).catch(() => ({ data: { jobs: [] } })),
        ]);
        setStats((current) => ({
          ...current,
          completed: completed?.data?.jobs?.length ?? 0,
          active: active?.data?.jobs?.length ?? 0,
          conversations: conversations.data?.conversations?.length || 0,
        }));
      }
    } catch {
      // Non-blocking dashboard data.
    }
  }, [displayName, http, isHandyman]);

  useEffect(() => {
    setName(userName || '');
    setPhone(userPhone || '');
  }, [userName, userPhone]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedCategoryNames = useMemo(
    () =>
      categories
        .filter((category) => selectedCategories.includes(category.id))
        .map((category) => category.name)
        .join(', ') || 'No services selected',
    [selectedCategories],
  );


  const statusTone = (status?: string) => {
    if (status === 'approved') return { bg: '#DCFCE7', fg: '#166534', label: 'Approved' };
    if (status === 'pending') return { bg: '#FEF3C7', fg: '#92400E', label: 'Pending review' };
    if (status === 'rejected') return { bg: '#FEE2E2', fg: '#991B1B', label: 'Rejected' };
    return { bg: '#F1F5F9', fg: '#475569', label: 'Missing' };
  };

  const uploadVerification = async (documentType: 'profile_image' | 'id_document' | 'certificate' | 'good_conduct') => {
    if (!backendUrl || !token) {
      Alert.alert('Session missing', 'Please sign in again before uploading documents.');
      return;
    }
    setUploadingVerification(documentType);
    try {
      let file: { uri?: string; name?: string; type?: string } | null = null;
      let uploadKind: 'image' | 'doc' = 'doc';
      if (documentType === 'profile_image') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Gallery permission required', 'Allow Ekazi to access photos from your device settings.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.85,
        });
        if (result.canceled) return;
        const asset = result.assets?.[0];
        if (!asset) return;
        file = { uri: asset.uri, name: asset.fileName || 'ekazi-profile-photo.jpg', type: asset.mimeType || 'image/jpeg' };
        uploadKind = 'image';
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['application/pdf', 'image/*'],
          copyToCacheDirectory: true,
          multiple: false,
        });
        if (result.canceled) return;
        const asset = result.assets?.[0];
        if (!asset) return;
        file = { uri: asset.uri, name: asset.name || documentType + '.pdf', type: asset.mimeType || 'application/pdf' };
      }
      if (!file?.uri) return;
      const url = await uploadAsset(backendUrl, token, file as any, uploadKind);
      const { data } = await http.put('/api/handyman/profile/verification', { documentType, url });
      setHandymanProfile(data.profile || null);
      Alert.alert('Submitted for review', 'Ekazi admin will review this document before it becomes visible as approved.');
    } catch (error: any) {
      Alert.alert('Upload failed', error?.response?.data?.message || error?.message || 'Please try again.');
    } finally {
      setUploadingVerification(null);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await http.patch('/api/auth/profile/complete', {
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
      await Promise.all([refreshUserDetails(), refreshProfile().catch(() => undefined), load()]);
      Alert.alert('Profile saved', 'Your Ekazi profile is up to date.');
    } catch (error: any) {
      Alert.alert('Could not save profile', error?.response?.data?.message || 'Please check your details.');
    } finally {
      setSaving(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert('Log out of Ekazi?', 'You will need to sign in again to access your jobs.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () => {
          setLoggingOut(true);
          void logout().catch(() => {
            setLoggingOut(false);
            Alert.alert('Could not log out', 'Please try again.');
          });
        },
      },
    ]);
  };

  return (
    <Screen backgroundColor="white">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}>
        <Card style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
          <Text style={{ color: 'white', fontWeight: '900', fontSize: 22 }}>{displayName}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.9)', marginTop: 6 }}>{userEmail || 'Email not provided'}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.9)', marginTop: 2 }}>{userPhone || 'Phone not provided'}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.86)', marginTop: 10, fontWeight: '800' }}>
            {isHandyman ? 'Handyman account' : 'Client account'}
          </Text>
        </Card>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontWeight: '900', fontSize: 20 }}>{stats.completed}</Text>
            <Text style={{ color: colors.muted, textAlign: 'center' }}>Completed</Text>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontWeight: '900', fontSize: 20 }}>{stats.active}</Text>
            <Text style={{ color: colors.muted, textAlign: 'center' }}>{isHandyman ? 'Active Quotes' : 'Active Jobs'}</Text>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontWeight: '900', fontSize: 20 }}>{tokens}</Text>
            <Text style={{ color: colors.muted, textAlign: 'center' }}>Credits</Text>
          </Card>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontWeight: '900', fontSize: 20 }}>{stats.conversations}</Text>
            <Text style={{ color: colors.muted, textAlign: 'center' }}>Messages</Text>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontWeight: '900', fontSize: 20 }}>{isHandyman ? Math.round(stats.reliability) + '%' : stats.quotes}</Text>
            <Text style={{ color: colors.muted, textAlign: 'center' }}>{isHandyman ? 'Reliability' : 'Quotes'}</Text>
          </Card>
        </View>

        <Text style={{ marginTop: 18, color: colors.muted, fontWeight: '800' }}>ACCOUNT DETAILS</Text>
        <Card style={{ marginTop: 10 }}>
          <Input label="Display name" value={name} onChangeText={setName} placeholder="Your full name" />
          <Input label="Mobile number" value={phone} onChangeText={setPhone} placeholder="+254 7xx xxx xxx" keyboardType="phone-pad" />
          <Input label="Nearest estate" value={estate} onChangeText={setEstate} placeholder="Kilimani, Ruaka, Rongai..." />
          <Input label="City" value={city} onChangeText={setCity} placeholder="Nairobi" />
          <Input label="Backup contact" value={emergencyContact} onChangeText={setEmergencyContact} placeholder="+254 7xx xxx xxx" keyboardType="phone-pad" />
          <Text style={{ fontWeight: '800', marginBottom: 8 }}>Preferred contact method</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['phone', 'whatsapp', 'sms'] as const).map((mode) => (
              <Chip key={mode} label={mode === 'phone' ? 'Phone calls' : mode === 'whatsapp' ? 'WhatsApp first' : 'SMS updates'} active={contactPreference === mode} onPress={() => setContactPreference(mode)} />
            ))}
          </View>
        </Card>

        {isHandyman ? (
          <>
            <Text style={{ marginTop: 18, color: colors.muted, fontWeight: '800' }}>HANDYMAN PROFILE</Text>
            <Card style={{ marginTop: 10 }}>
              <Input label="Business or trade name" value={businessName} onChangeText={setBusinessName} placeholder="e.g. Ekazi Plumbing Works" />
              <Input label="Service radius in km" value={serviceRadiusKm} onChangeText={setServiceRadiusKm} placeholder="20" keyboardType="numeric" />
              <Text style={{ color: colors.muted, marginBottom: 8 }}>Current services: {selectedCategoryNames}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {categories.map((category) => (
                  <Chip key={category.id} label={category.name} active={selectedCategories.includes(category.id)} onPress={() => setSelectedCategories((current) => toggle(current, category.id))} />
                ))}
              </View>
              <Text style={{ fontWeight: '800', marginBottom: 8 }}>Work bio</Text>
              <TextInput
                value={bio}
                onChangeText={setBio}
                multiline
                maxLength={600}
                placeholder="Mention experience, tools, common jobs, availability and areas served."
                placeholderTextColor={colors.muted}
                style={{ minHeight: 112, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14, textAlignVertical: 'top', color: colors.text, backgroundColor: colors.surface }}
              />
              <Text style={{ color: colors.muted, marginTop: 6 }}>{bio.length}/600</Text>
              {handymanProfile?.suspended_until ? (
                <Text style={{ color: colors.danger, marginTop: 10, fontWeight: '800' }}>
                  Suspended until {new Date(handymanProfile.suspended_until).toLocaleString('en-KE')}
                </Text>
              ) : null}
            </Card>

            <Text style={{ marginTop: 18, color: colors.muted, fontWeight: '800' }}>SECURITY VERIFICATION</Text>
            <Card style={{ marginTop: 10 }}>
              <Text style={{ fontWeight: '900', fontSize: 16 }}>Trust documents</Text>
              <Text style={{ color: colors.muted, marginTop: 6 }}>
                Profile photo and national ID must be approved before you receive nearby jobs or send quotes.
              </Text>
              {verification.profileImageUrl ? (
                <Image source={{ uri: verification.profileImageUrl }} style={{ width: 86, height: 86, borderRadius: 43, marginTop: 12 }} />
              ) : null}
              {[
                ['profile_image', 'Profile photo', verification.profileImageStatus, true],
                ['id_document', 'National ID', verification.idDocumentStatus, true],
                ['certificate', 'Qualification certificate', verification.certificateStatus, false],
                ['good_conduct', 'Good conduct', verification.goodConductStatus, false],
              ].map(([docType, label, status, required]: any) => {
                const tone = statusTone(status);
                const busy = uploadingVerification === docType;
                return (
                  <View key={docType} style={{ marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '900' }}>{label}{required ? ' *' : ''}</Text>
                        <Text style={{ color: colors.muted, marginTop: 3 }}>{required ? 'Required for active handyman status' : 'Optional, improves client trust'}</Text>
                      </View>
                      <View style={{ backgroundColor: tone.bg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}>
                        <Text style={{ color: tone.fg, fontWeight: '900', fontSize: 12 }}>{tone.label}</Text>
                      </View>
                    </View>
                    <View style={{ marginTop: 10 }}>
                      <SecondaryButton
                        title={busy ? 'Uploading...' : status === 'missing' ? 'Upload' : 'Replace'}
                        onPress={uploadingVerification ? () => undefined : () => void uploadVerification(docType)}
                      />
                    </View>
                    {busy ? <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} /> : null}
                  </View>
                );
              })}
              <Text style={{ color: verification.verified ? colors.green : colors.danger, marginTop: 12, fontWeight: '900' }}>
                {verification.verified ? 'Account active for nearby jobs and quotes.' : 'Account not active for jobs until profile photo and ID are approved.'}
              </Text>
              {verification.fullyVerified ? (
                <Text style={{ color: colors.green, marginTop: 6, fontWeight: '900' }}>Fully verified: ID, profile, certificate and good conduct approved.</Text>
              ) : null}
            </Card>

          </>
        ) : null}

        <View style={{ marginTop: 18, gap: 12 }}>
          <PrimaryButton title={saving ? 'Saving...' : 'Save Profile'} onPress={() => void saveProfile()} disabled={saving} />
          <SecondaryButton title="Refresh Activity" onPress={() => void load()} />
          <PrimaryButton title={loggingOut ? 'Logging Out...' : 'Log Out'} onPress={confirmLogout} disabled={loggingOut} style={{ backgroundColor: loggingOut ? '#FCA5A5' : '#DC2626' }} />
        </View>

        <Text style={{ textAlign: 'center', marginTop: 18, color: colors.muted }}>Ekazi Kenya v1.0.0</Text>
      </ScrollView>
    </Screen>
  );
}
