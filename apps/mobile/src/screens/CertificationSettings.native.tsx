// apps/mobile/src/screens/CertificationSettings.native.tsx
import React, { FC, useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ExpoFS from 'expo-file-system';
import { useShopContext } from '@mytutorapp/shared/context';
import Spinner from './Spinner.native';
import useCertificationSettings, {
  Base64File,
} from '@mytutorapp/shared/hooks/useCertificationSettings';
import tw from '../../tailwind';

import type { ExpoFileSystem } from '@mytutorapp/shared/types';
import { readAsBase64WithFallback, resolveCacheDir } from '@mytutorapp/shared/utils/fs';

const FileSystem = ExpoFS as unknown as ExpoFileSystem; // ← typed, no `any`

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const ALLOWED_EXTS = ['.pdf', '.jpg', '.jpeg', '.png'];

const extOf = (name?: string) => {
  if (!name) return '';
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
};

const CertificationSettingsNative: FC = () => {
  const { token, backendUrl, profile } = useShopContext();
  const profileId = profile?.id;
  const { uploading, certificationData, handleSubmit } = useCertificationSettings(
    backendUrl,
    token,
    profileId
  );

  const [assets, setAssets] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const isTutor = (profile?.role || '').toLowerCase() === 'tutor';

  if (!isTutor) {
    return (
      <View style={tw`p-6 bg-gray-900 rounded-lg`}>
        <Text style={tw`text-3xl text-pink-400 mb-4`}>Tutor Certification</Text>
        <Text style={tw`text-gray-400`}>Certification upload is available only for tutors.</Text>
      </View>
    );
  }

  if (uploading) {
    return (
      <View style={tw`flex-1 items-center justify-center`}>
        <Spinner />
      </View>
    );
  }

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (!result.canceled && Array.isArray(result.assets)) {
        const valid = result.assets.filter((asset) => {
          if ((asset.size ?? 0) > MAX_FILE_SIZE) {
            Alert.alert('Error', `"${asset.name}" exceeds 5MB.`);
            return false;
          }
          const mime = asset.mimeType || '';
          const ext = extOf(asset.name);
          const typeOk = mime ? ALLOWED_TYPES.includes(mime) : ALLOWED_EXTS.includes(ext);
          const looseImage = mime.startsWith('image/') && ALLOWED_EXTS.includes(ext);
          if (!typeOk && !looseImage) {
            Alert.alert('Error', `"${asset.name}" must be PDF, JPEG, or PNG.`);
            return false;
          }
          return true;
        });

        setAssets((prev) => [...prev, ...valid]);
      }
    } catch (err) {
      console.error('Picker error:', err);
      Alert.alert('Error', 'Failed to pick documents.');
    }
  };

  const onSubmit = async () => {
    if (!isTutor) return;
    if (assets.length === 0) {
      Alert.alert('Missing files', 'Please select at least one file.');
      return;
    }
    try {
      const cacheDir = resolveCacheDir(FileSystem);
      const base64Files: Base64File[] = await Promise.all(
        assets.map(async (a) => {
          const base64 = await readAsBase64WithFallback(FileSystem, a.uri, cacheDir);
          return {
            name: a.name,
            type: a.mimeType || 'application/octet-stream',
            base64,
          };
        })
      );
      await handleSubmit(base64Files);
    } catch (err) {
      console.error('Error submitting certification:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Upload Error', message);
    }
  };

  const showSubmitBlock = !certificationData || certificationData.status === 'Pending';
  const ctaLabel = certificationData ? 'Update Certification' : 'Submit Certification';

  return (
    <View style={tw`p-6 bg-gray-900 rounded-lg`}>
      <Text style={tw`text-3xl text-pink-400 mb-4`}>Tutor Certification</Text>
      <Text style={tw`text-gray-400 mb-6`}>
        (Optional) Enhance your profile’s credibility by submitting your qualification documents.
        You can upload multiple files (each max 5MB, PDF/JPEG/PNG).
      </Text>

      <TouchableOpacity onPress={pickDocument} style={tw`bg-gray-800 p-2 rounded mb-3`}>
        <Text style={tw`text-white text-center`}>Choose Certification Files</Text>
      </TouchableOpacity>

      {assets.length > 0 && (
        <View style={tw`mb-2`}>
          {assets.map((a, idx) => (
            <Text key={`${a.name}-${idx}`} style={tw`text-gray-200 mb-1`}>
              {a.name}
            </Text>
          ))}
        </View>
      )}

      {showSubmitBlock ? (
        <TouchableOpacity
          onPress={onSubmit}
          disabled={uploading}
          style={tw`mt-2 bg-pink-500 p-3 rounded ${uploading ? 'opacity-70' : ''}`}
        >
          {uploading ? <Spinner /> : <Text style={tw`text-white text-center`}>{ctaLabel}</Text>}
        </TouchableOpacity>
      ) : (
        <View style={tw`mt-4 p-3 rounded bg-green-600`}>
          <Text style={tw`text-white`}>
            Certification status: <Text style={tw`font-bold`}>{certificationData?.status}</Text>
          </Text>
        </View>
      )}
    </View>
  );
};

export default CertificationSettingsNative;
