import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useShopContext } from '@myhandymanapp/shared/context';
import Card from '../../components/Card';
import { colors, spacing } from '../../theme/tokens';
import PrimaryButton from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';

export default function ProfileScreen() {
  const {
    http,
    logout,
    profile,
    userEmail,
    userName,
    userPhone,
    tokens,
  } = useShopContext();
  const [loggingOut, setLoggingOut] = useState(false);
  const [jobs, setJobs] = useState({ completed: 0, active: 0 });

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      http.get('/api/jobs', { params: { status: 'completed' } }),
      http.get('/api/jobs', { params: { status: 'active' } }),
    ])
      .then(([completed, active]) => {
        if (!mounted) return;
        setJobs({
          completed: completed.data?.jobs?.length ?? 0,
          active: active.data?.jobs?.length ?? 0,
        });
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [http]);

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

  const displayName = profile?.name?.trim() || userName?.trim() || 'Ekazi customer';

  return (
    <Screen backgroundColor="white">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 110 }}
      >
        <Card style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
          <Text style={{ color: 'white', fontWeight: '900', fontSize: 22 }}>{displayName}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.9)', marginTop: 6 }}>
            {userEmail || 'Email not provided'}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.9)', marginTop: 2 }}>
            {userPhone || 'Phone not provided'}
          </Text>
        </Card>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontWeight: '900', fontSize: 20 }}>{jobs.completed}</Text>
            <Text style={{ color: colors.muted }}>Completed</Text>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontWeight: '900', fontSize: 20 }}>{jobs.active}</Text>
            <Text style={{ color: colors.muted }}>Active</Text>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontWeight: '900', fontSize: 20 }}>{tokens}</Text>
            <Text style={{ color: colors.muted }}>Credits</Text>
          </Card>
        </View>

        <Text style={{ marginTop: 18, color: colors.muted, fontWeight: '800' }}>ACCOUNT</Text>
        <Card style={{ marginTop: 10 }}>
          <Text style={{ fontWeight: '800' }}>Personal details are synced with your Ekazi account.</Text>
        </Card>

        <Text style={{ marginTop: 18, color: colors.muted, fontWeight: '800' }}>SUPPORT & SAFETY</Text>
        <Card style={{ marginTop: 10 }}>
          <Text style={{ fontWeight: '800' }}>Support: support@ekazi.co.ke</Text>
        </Card>

        <View style={{ marginTop: 18 }}>
          <PrimaryButton
            title={loggingOut ? 'Logging Out...' : 'Log Out'}
            onPress={confirmLogout}
            disabled={loggingOut}
            style={{ backgroundColor: loggingOut ? '#FCA5A5' : '#DC2626' }}
          />
        </View>

        <Text style={{ textAlign: 'center', marginTop: 18, color: colors.muted }}>
          Ekazi Kenya v1.0.0
        </Text>
      </ScrollView>
    </Screen>
  );
}
