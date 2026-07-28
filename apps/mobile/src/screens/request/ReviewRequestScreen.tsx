import React, { useState } from 'react';
import { ScreenScroll } from '../../components/Screen';

import { Alert, View, Text, ScrollView } from 'react-native';

import { useShopContext } from '@myhandymanapp/shared/context';

import { colors, spacing } from '../../theme/tokens';

import Card from '../../components/Card';

import PrimaryButton from '../../components/PrimaryButton';

export default function ReviewRequestScreen({ route, navigation }: any) {

  const { draft } = route.params;

  const { http } = useShopContext();

  const [loading, setLoading] = useState(false);

  const budget = draft.budgetMin || draft.budgetMax ? `KES ${draft.budgetMin ?? ''} - ${draft.budgetMax ?? ''}` : 'Not set';

  const submit = async () => {

    setLoading(true);

    try {

      const { data } = await http.post('/api/jobs', { ...draft, discountCode: 'FIRST5' });

      navigation.replace('RequestSubmitted', { jobId: data.job.id });

    } catch (e: any) {

      Alert.alert('Could not submit request', e?.response?.data?.message || 'Please check the job details and try again.');

    } finally { setLoading(false); }

  };

  return <ScreenScroll backgroundColor="white">

    <Card style={{ marginBottom: 12 }}><Text style={{ fontWeight: '900' }}>Job Type</Text><Text style={{ color: colors.muted, marginTop: 6 }}>{draft.categoryName} - {draft.serviceName}</Text></Card>

    <Card style={{ marginBottom: 12 }}><Text style={{ fontWeight: '900' }}>Description</Text><Text style={{ color: colors.muted, marginTop: 6 }}>{draft.description}</Text></Card>

    <Card style={{ marginBottom: 12 }}><Text style={{ fontWeight: '900' }}>Photos</Text><Text style={{ color: colors.muted, marginTop: 6 }}>{(draft.photoUrls?.length ?? 0)} photos uploaded</Text></Card>

    <Card style={{ marginBottom: 12 }}><Text style={{ fontWeight: '900' }}>Location</Text><Text style={{ color: colors.muted, marginTop: 6 }}>{draft.estate}, {draft.city}</Text></Card>

    <Card style={{ marginBottom: 12 }}><Text style={{ fontWeight: '900' }}>Schedule</Text><Text style={{ color: colors.muted, marginTop: 6 }}>{draft.scheduleType}</Text></Card>

    <Card style={{ marginBottom: 12 }}><Text style={{ fontWeight: '900' }}>Budget Range</Text><Text style={{ color: colors.muted, marginTop: 6 }}>{budget}</Text></Card>

    <Card style={{ marginBottom: 12 }}><Text style={{ fontWeight: '900' }}>Materials</Text><Text style={{ color: colors.muted, marginTop: 6 }}>{draft.providerBringsMaterials ? 'Provider brings materials' : 'Customer provides materials'}</Text></Card>

    <Card style={{ backgroundColor: '#ECFDF3', borderColor: '#BBF7D0' }}><Text style={{ fontWeight: '900' }}>What happens next?</Text><Text style={{ color: colors.muted, marginTop: 6 }}>Verified providers near you will review your request and send quotes within minutes.</Text></Card>

    <View style={{ marginTop: 18 }}><PrimaryButton title={loading ? 'Submitting...' : 'Submit Request'} onPress={submit} /></View>

  </ScreenScroll>;

}

