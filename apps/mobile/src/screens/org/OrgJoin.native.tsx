/* eslint-disable prettier/prettier */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import tw from '../../../tailwind';

import { useShopContext } from '@mytutorapp/shared/context';
import { resolveOrgInvite, acceptOrgInvite } from '@mytutorapp/shared/api/orgApi';

type RootStackParamList = {
  OrgJoin: { code?: string } | undefined;
  InstitutionLogin: { next?: string } | undefined;
  OrgProfile: undefined;
};

const RETURN_TO_KEY = 'auth:returnTo';

const OrgJoinNative: React.FC = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'OrgJoin'>>();
  const navigation = useNavigation<any>();
  const code = route.params?.code ?? ''; // expected from deep link/route params

  const { backendUrl, token } = useShopContext() as any;

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  // If not logged in, remember returnTo and go to Institution login
  useEffect(() => {
    (async () => {
      if (!token) {
        try {
          const returnTo = `/org/join/${code}`;
          await AsyncStorage.setItem(RETURN_TO_KEY, returnTo);
        } catch {}
        navigation.replace('InstitutionLogin', { next: `/org/join/${code}` });
      }
    })();
  }, [token, code, navigation]);

  // Resolve invite
  useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        const info = await resolveOrgInvite(backendUrl, code);
        if (!stopped) setInvite(info);
      } catch (e: any) {
        if (!stopped) {
          Alert.alert('Invite error', e?.message || 'Failed to load invite.');
        }
      } finally {
        if (!stopped) setLoading(false);
      }
    })();
    return () => {
      stopped = true;
    };
  }, [backendUrl, code]);

  const onAccept = useCallback(async () => {
    if (!token) {
      // just in case: bounce to login
      try {
        await AsyncStorage.setItem(RETURN_TO_KEY, `/org/join/${code}`);
      } catch {}
      navigation.replace('InstitutionLogin', { next: `/org/join/${code}` });
      return;
    }

    try {
      setBusy(true);
      const res = await acceptOrgInvite(backendUrl, token, code);

      // Mark org-mode for invited users too (native storage)
      try {
        await AsyncStorage.setItem('auth:mode', 'org');
        const orgId = res?.enrollment?.orgId;
        if (orgId) {
          await AsyncStorage.setItem('auth:orgId', String(orgId));
        }
        await AsyncStorage.removeItem(RETURN_TO_KEY);
      } catch {}

      navigation.replace('OrgProfile'); // ← adjust to your org profile screen key
    } catch (e: any) {
      Alert.alert(
        'Join failed',
        e?.response?.data?.message || e?.message || 'Could not accept invite.'
      );
    } finally {
      setBusy(false);
    }
  }, [backendUrl, token, code, navigation]);

  if (loading) {
    return (
      <View style={tw`flex-1 items-center justify-center bg-[#0f1821]`}>
        <ActivityIndicator />
        <Text style={tw`text-white mt-3`}>Loading invite…</Text>
      </View>
    );
  }

  return (
    <View style={tw`flex-1 bg-[#0f1821] p-6`}>
      <Text style={tw`text-white text-xl font-bold`}>
        Join {invite?.org?.name ?? 'Institution'}
      </Text>
      <Text style={tw`text-white/80 text-sm mt-2`}>
        You’ve been invited to access assignments/analytics for this institution.
      </Text>

      <TouchableOpacity
        onPress={onAccept}
        disabled={busy}
        style={[
          tw`mt-5 h-12 px-4 rounded-xl items-center justify-center`,
          busy ? tw`bg-emerald-600/70` : tw`bg-emerald-600`,
        ]}
      >
        <Text style={tw`text-white font-semibold`}>{busy ? 'Joining…' : 'Accept & Continue'}</Text>
      </TouchableOpacity>
    </View>
  );
};

export default OrgJoinNative;
