import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useShopContext } from '@myhandymanapp/shared/context';
import { uploadAsset } from '@myhandymanapp/shared/api/uploadAsset';
import { colors, spacing } from '../../theme/tokens';
import Card from '../../components/Card';
import StepProgress from '../../components/StepProgress';
import PrimaryButton from '../../components/PrimaryButton';
import SecondaryButton from '../../components/SecondaryButton';
import { Screen } from '../../components/Screen';

const MAX_PHOTOS = 6;

function resolvePhotoUrl(backendUrl: string, url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  const base = backendUrl.replace(/\/$/, '');
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
}

export default function PhotoUploadScreen({ route, navigation }: any) {
  const { backendUrl, token } = useShopContext();
  const initialUrls = Array.isArray(route.params?.draft?.photoUrls)
    ? route.params.draft.photoUrls
    : [];
  const [photoUrls, setPhotoUrls] = useState<string[]>(initialUrls);
  const [uploading, setUploading] = useState(false);
  const draft = { ...route.params.draft, photoUrls };

  const uploadPickedAssets = async (assets: ImagePicker.ImagePickerAsset[]) => {
    const available = MAX_PHOTOS - photoUrls.length;
    const selected = assets.slice(0, available);
    if (!selected.length) {
      Alert.alert('Photo limit reached', `You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }

    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const asset of selected) {
        const url = await uploadAsset(
          backendUrl,
          token,
          {
            uri: asset.uri,
            name: asset.fileName || `job-photo-${Date.now()}.jpg`,
            type: asset.mimeType || 'image/jpeg',
          } as any,
          'image',
        );
        uploaded.push(url);
      }
      setPhotoUrls((current) => [...current, ...uploaded].slice(0, MAX_PHOTOS));
    } catch (error: any) {
      Alert.alert(
        'Photo upload failed',
        error?.message || 'Check your connection and try again.',
      );
    } finally {
      setUploading(false);
    }
  };

  const openCamera = async () => {
    if (uploading) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Camera permission required',
        'Allow Ekazi to use the camera from your device settings.',
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled) await uploadPickedAssets(result.assets);
  };

  const openGallery = async () => {
    if (uploading) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Gallery permission required',
        'Allow Ekazi to access photos from your device settings.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, MAX_PHOTOS - photoUrls.length),
      quality: 0.8,
    });
    if (!result.canceled) await uploadPickedAssets(result.assets);
  };

  const continueToLocation = () => {
    navigation.navigate('LocationSelect', { draft: { ...route.params.draft, photoUrls } });
  };

  return (
    <Screen backgroundColor="white">
      <StepProgress step={3} total={6} label="Upload photos (optional)" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, paddingBottom: 96 }}
      >
        <Text style={{ color: colors.muted }}>
          Photos help providers understand the job and give more accurate quotes.
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add job photo from gallery"
          onPress={() => void openGallery()}
          disabled={uploading || photoUrls.length >= MAX_PHOTOS}
        >
          <Card style={{ marginTop: 14, alignItems: 'center', paddingVertical: 24 }}>
            {uploading ? (
              <>
                <ActivityIndicator color={colors.primary} />
                <Text style={{ fontWeight: '800', marginTop: 8 }}>Uploading photo...</Text>
              </>
            ) : (
              <Text style={{ fontWeight: '900' }}>
                Add Photo ({photoUrls.length}/{MAX_PHOTOS})
              </Text>
            )}
          </Card>
        </Pressable>

        {photoUrls.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
            {photoUrls.map((url, index) => (
              <View key={url} style={{ width: '31%', aspectRatio: 1 }}>
                <Image
                  source={{ uri: resolvePhotoUrl(backendUrl, url) }}
                  style={{ width: '100%', height: '100%', borderRadius: 8 }}
                  resizeMode="cover"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${index + 1}`}
                  onPress={() => setPhotoUrls((items) => items.filter((_, i) => i !== index))}
                  style={{
                    position: 'absolute',
                    right: 4,
                    top: 4,
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: 'rgba(0,0,0,0.72)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: '900' }}>X</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <SecondaryButton title="Camera" onPress={() => void openCamera()} style={{ flex: 1 }} />
          <SecondaryButton title="Gallery" onPress={() => void openGallery()} style={{ flex: 1 }} />
        </View>

        <Card style={{ marginTop: 14 }}>
          <Text style={{ fontWeight: '900' }}>Photo tips</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>Capture the problem clearly.</Text>
          <Text style={{ color: colors.muted }}>Include close-up and wide shots.</Text>
          <Text style={{ color: colors.muted }}>Use good lighting.</Text>
        </Card>

        <View style={{ marginTop: 18 }}>
          <PrimaryButton
            title={uploading ? 'Uploading...' : 'Continue'}
            onPress={continueToLocation}
            disabled={uploading}
          />
          <Text
            style={{
              textAlign: 'center',
              marginTop: 14,
              color: colors.muted,
              fontWeight: '800',
            }}
            onPress={uploading ? undefined : continueToLocation}
          >
            Skip for now
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
