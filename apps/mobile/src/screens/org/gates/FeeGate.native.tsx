import React, { ReactNode } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import tw from '../../../../tailwind';

import { useShopContext } from '@mytutorapp/shared/context';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { useOrgInstructorFeeAccess } from '@mytutorapp/shared/hooks/useOrgInstructorFeeAccess';

type Props = { children: ReactNode };

export default function FeeGate({ children }: Props) {
  const navigation = useNavigation();
  const shop = useShopContext() as any;
  const { org, activeOrgId, loading } = useOrgProTools() as any;

  const feeAccess = useOrgInstructorFeeAccess({
    backendUrl: shop?.backendUrl,
    token: shop?.orgToken ?? shop?.token,
    orgId: activeOrgId || org?.id,
  });

  const checking = loading || (feeAccess.ready && feeAccess.isLoading);

  if (checking) {
    return (
      <View style={tw`flex-1 items-center justify-center bg-white dark:bg-slate-900 p-6`}>
        <View style={tw`w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 p-6 shadow`}>
          <View style={tw`flex-row items-center gap-3`}>
            <ActivityIndicator />
            <Text style={tw`text-base font-semibold text-slate-900 dark:text-slate-100`}>
              Checking fee access…
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (!feeAccess.eligible || feeAccess.isDenied || !feeAccess.hasAccess) {
    return (
      <View style={tw`flex-1 items-center justify-center bg-white dark:bg-slate-900 p-6`}>
        <View style={tw`w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 p-6 shadow items-center gap-3`}>
          <Text style={tw`text-xl font-bold text-slate-900 dark:text-slate-100`}>
            {feeAccess.eligible ? 'Fees locked' : 'Not authorized'}
          </Text>
          <Text style={tw`text-sm text-slate-600 dark:text-slate-300 text-center`}>
            Fees are only accessible to the designated instructor on Pro/Enterprise.
          </Text>
          <TouchableOpacity
            style={tw`mt-2 px-4 py-2 rounded-xl bg-emerald-600`}
            onPress={() => navigation.goBack?.()}
          >
            <Text style={tw`text-white font-semibold`}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return <>{children}</>;
}
