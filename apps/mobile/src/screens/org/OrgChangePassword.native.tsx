/* eslint-disable prettier/prettier */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {
  useNavigation,
  useRoute,
  type RouteProp,
  type NavigationProp,
} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from '../../../tailwind';
import { useShopContext } from '@mytutorapp/shared/context';
import { institutionChangePassword } from '@mytutorapp/shared/api/institutionAuth';
import { useThemePref } from '../../theme/ThemeContext';
import type { MainStackParamList } from '../../navigation/types';

const MUST_CHANGE_KEY = 'org:mustChangePassword';

type ChangePwdRoute = RouteProp<MainStackParamList, 'OrgChangePassword'>;

/* ───────────────────────────────────────────────────────────
   Palette (adapts to theme) – same spirit as InstitutionLogin
   ─────────────────────────────────────────────────────────── */
function usePalette() {
  const { resolvedScheme } = useThemePref();
  const isDark = resolvedScheme === 'dark';

  return {
    isDark,
    pageBg: isDark ? '#0b1016' : '#f8fafc',
    card: isDark ? '#0f1821' : '#ffffff',
    border: isDark ? 'rgba(255,255,255,0.10)' : '#cedbe8',
    text: isDark ? '#ffffff' : '#0d141c',
    textSoft: isDark ? 'rgba(255,255,255,0.75)' : '#3d5873',
    textSubtle: isDark ? 'rgba(255,255,255,0.60)' : 'rgba(61,88,115,0.75)',
    inputBg: isDark ? 'rgba(10,16,23,0.6)' : 'rgba(255,255,255,0.92)',
    inputBorder: isDark ? 'rgba(255,255,255,0.15)' : '#cedbe8',
    inputPlaceholder: isDark
      ? 'rgba(255,255,255,0.65)'
      : 'rgba(13,20,28,0.55)',

    surface(style?: any) {
      return [
        tw`w-full max-w-md self-center rounded-2xl p-6`,
        { backgroundColor: this.card, borderColor: this.border, borderWidth: 1 },
        style,
      ];
    },

    input() {
      return [
        tw`w-full px-3 py-3 rounded-xl`,
        {
          backgroundColor: this.inputBg,
          borderColor: this.inputBorder,
          borderWidth: 1,
          color: this.text,
        },
      ];
    },

    primaryBtn: tw`mt-2 w-full items-center justify-center rounded-xl h-11 px-5 bg-indigo-600 shadow-sm`,

    ghostBtn() {
      return [
        tw`mt-3 px-4 py-2 rounded-xl items-center justify-center`,
        { borderColor: this.inputBorder, borderWidth: 1 },
      ];
    },
  };
}

const OrgChangePasswordNative: React.FC = () => {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const route = useRoute<ChangePwdRoute>();
  const { backendUrl, orgToken, orgLogout } = useShopContext();
  const palette = usePalette();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const returnTo = useMemo(() => route.params?.returnTo || '/org', [route.params]);

  // If org session is gone, ask them to log in again
  if (!orgToken) {
    return (
      <SafeAreaView
        style={[tw`flex-1 items-center justify-center px-6`, { backgroundColor: palette.pageBg }]}
        edges={['top', 'right', 'left', 'bottom']}
      >
        <View style={palette.surface({ maxWidth: 520 })}>
          <Text style={[tw`text-sm text-center`, { color: palette.textSoft }]}>
            Session expired. Please log in again.
          </Text>

          <TouchableOpacity
            onPress={async () => {
              try {
                await orgLogout?.();
              } catch {}
              navigation.reset({
                  index: 0,
                  routes: [{ name: 'InstitutionLogin', params: { logoutOrg: true } }],
                });

            }}
            style={[tw`mt-4 h-11 rounded-xl items-center justify-center bg-indigo-600`]}
          >
            <Text style={tw`text-white font-semibold`}>Go to login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleSubmit = async () => {
    setError(null);

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }

    try {
      setBusy(true);

      await institutionChangePassword(backendUrl, orgToken, currentPassword, newPassword);

      // clear must-change flag (native uses AsyncStorage)
      try {
        await AsyncStorage.removeItem(MUST_CHANGE_KEY);
      } catch {}

      setSuccess(true);

      setTimeout(() => {
        navigation.reset({
          index: 0,
          routes: [{ name: 'OrgHome', params: { next: returnTo } }],
        });
      }, 800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to change password';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView
      style={[tw`flex-1`, { backgroundColor: palette.pageBg }]}
      edges={['top', 'right', 'left', 'bottom']}
    >
      <View style={tw`flex-1 px-4 py-8 justify-center`}>
        <View style={palette.surface()}>
          <Text style={[tw`text-xl font-semibold text-center mb-2`, { color: palette.text }]}>
            Update your password
          </Text>

          <Text style={[tw`text-xs text-center mb-4`, { color: palette.textSubtle }]}>
            For security, your institution asked you to change the temporary password
            before using the portal.
          </Text>

          {!!error && (
            <View
              style={[
                tw`mb-4 rounded-lg px-3 py-2`,
                {
                  backgroundColor: palette.isDark ? 'rgba(127,29,29,0.35)' : 'rgba(254,226,226,0.9)',
                  borderColor: palette.isDark ? 'rgba(239,68,68,0.35)' : 'rgba(239,68,68,0.35)',
                  borderWidth: 1,
                },
              ]}
            >
              <Text style={[tw`text-sm`, { color: palette.isDark ? '#fecaca' : '#991b1b' }]}>
                {error}
              </Text>
            </View>
          )}

          {success && (
            <View
              style={[
                tw`mb-4 rounded-lg px-3 py-2`,
                {
                  backgroundColor: palette.isDark ? 'rgba(6,78,59,0.35)' : 'rgba(209,250,229,0.9)',
                  borderColor: palette.isDark ? 'rgba(16,185,129,0.35)' : 'rgba(16,185,129,0.35)',
                  borderWidth: 1,
                },
              ]}
            >
              <Text style={[tw`text-sm`, { color: palette.isDark ? '#a7f3d0' : '#065f46' }]}>
                Password updated. Redirecting…
              </Text>
            </View>
          )}

          <View style={tw`gap-4`}>
            <TextInput
              secureTextEntry
              style={palette.input()}
              placeholder="Current password"
              placeholderTextColor={palette.inputPlaceholder}
              value={currentPassword}
              onChangeText={setCurrentPassword}
            />

            <TextInput
              secureTextEntry
              style={palette.input()}
              placeholder="New password (min. 8 characters)"
              placeholderTextColor={palette.inputPlaceholder}
              value={newPassword}
              onChangeText={setNewPassword}
            />

            <TextInput
              secureTextEntry
              style={palette.input()}
              placeholder="Confirm new password"
              placeholderTextColor={palette.inputPlaceholder}
              value={confirmNewPassword}
              onChangeText={setConfirmNewPassword}
            />

            <TouchableOpacity
              disabled={busy}
              onPress={handleSubmit}
              style={tw.style(palette.primaryBtn, busy && 'opacity-60')}
            >
              {busy ? (
                <View style={tw`flex-row items-center`}>
                  <ActivityIndicator color="#fff" />
                  <Text style={tw`ml-2 text-white font-semibold`}>Updating…</Text>
                </View>
              ) : (
                <Text style={tw`text-white font-semibold`}>Change password</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default OrgChangePasswordNative;
