// apps/mobile/src/screens/GlobalAuthRedirect.tsx
import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import {
  useNavigation,
  useRoute,
  RouteProp,
  StackActions, // ← use action creator instead of replace(...)
} from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import tw from '../../tailwind';
import type { MainStackParamList } from '../navigation/types';

type GlobalAuthRedirectParams = {
  GlobalAuthRedirect:
    | {
        redirectTo?: keyof MainStackParamList; // optional target
        msg?: string;
        errorMsg?: string;
      }
    | undefined;
};

type Nav = StackNavigationProp<MainStackParamList>;
type Route = RouteProp<GlobalAuthRedirectParams, 'GlobalAuthRedirect'>;

export default function GlobalAuthRedirect() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();

  useEffect(() => {
    const redirectTarget: keyof MainStackParamList = route.params?.redirectTo ?? 'Home';

    if (route.params?.errorMsg) {
      const err = new Error(route.params.errorMsg);
      // send to your error handler/toast if you have one
      // setGlobalError?.(err);
    }

    if (route.params?.msg) {
      const infoAsError = new Error(route.params.msg);
      // setGlobalError?.(infoAsError);
    }

    // ✅ Fix: avoid tuple overloads by dispatching the action
    navigation.dispatch(StackActions.replace(redirectTarget as string));
  }, [navigation, route.params]);

  return (
    <View style={tw`flex-1 items-center justify-center bg-gray-900`}>
      <ActivityIndicator color="#fff" />
      <Text style={tw`text-white mt-3`}>Redirecting…</Text>
    </View>
  );
}
