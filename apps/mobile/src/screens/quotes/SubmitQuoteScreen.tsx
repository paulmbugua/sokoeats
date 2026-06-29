import React, { useMemo, useState } from 'react';
import { Alert, Image, ScrollView, Text, TextInput, View } from 'react-native';
import { useShopContext } from '@myhandymanapp/shared/context';
import Card from '../../components/Card';
import Input from '../../components/Input';
import PrimaryButton from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { colors, radius, spacing } from '../../theme/tokens';

function amount(value: string) {
  const number = Number(value.replace(/,/g, ''));
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export default function SubmitQuoteScreen({ route, navigation }: any) {
  const { http, backendUrl } = useShopContext();
  const job = route.params.job;
  const [labor, setLabor] = useState('');
  const [materials, setMaterials] = useState('');
  const [transport, setTransport] = useState('');
  const [etaMinutes, setEtaMinutes] = useState('60');
  const [durationHours, setDurationHours] = useState('2');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const subtotal = useMemo(
    () => amount(labor) + amount(materials) + amount(transport),
    [labor, materials, transport],
  );
  const discount = Math.round((subtotal * Number(job.discountPercent || 0)) / 100);

  const submit = async () => {
    if (subtotal <= 0) {
      Alert.alert('Add quote amounts', 'Your quote total must be greater than zero.');
      return;
    }
    if (!message.trim()) {
      Alert.alert('Add a short message', 'Tell the client what your quote covers.');
      return;
    }
    setSubmitting(true);
    try {
      await http.post(`/api/handyman/jobs/${job.id}/quotes`, {
        labor: amount(labor),
        materials: amount(materials),
        transport: amount(transport),
        etaMinutes: amount(etaMinutes),
        durationHours: amount(durationHours),
        message: message.trim(),
      });
      Alert.alert('Quote sent', 'The client can now review your real quote.', [
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      Alert.alert(
        'Quote not sent',
        error?.response?.data?.message || 'Please check the details and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const resolvePhoto = (url: string) =>
    url.startsWith('http') ? url : `${backendUrl.replace(/\/$/, '')}${url}`;

  return (
    <Screen backgroundColor="white">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 110 }}
      >
        <Card>
          <Text style={{ fontWeight: '900', fontSize: 18 }}>
            {job.serviceName || job.categoryName}
          </Text>
          <Text style={{ color: colors.muted, marginTop: 7 }}>{job.description}</Text>
          <Text style={{ fontWeight: '800', marginTop: 9 }}>
            {job.address || `${job.estate}, ${job.city}`}
          </Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>
            {job.scheduleType}
            {job.scheduledFor
              ? ` - ${new Date(job.scheduledFor).toLocaleString('en-KE')}`
              : ''}
          </Text>
        </Card>

        {job.photoUrls?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
            {job.photoUrls.map((url: string) => (
              <Image
                key={url}
                source={{ uri: resolvePhoto(url) }}
                style={{ width: 120, height: 100, borderRadius: radius.md, marginRight: 10 }}
              />
            ))}
          </ScrollView>
        ) : null}

        <Text style={{ fontWeight: '900', fontSize: 17, marginTop: 18 }}>Price breakdown</Text>
        <Input label="Labour (KES)" value={labor} onChangeText={setLabor} placeholder="2500" />
        <Input
          label="Materials (KES)"
          value={materials}
          onChangeText={setMaterials}
          placeholder="0"
        />
        <Input
          label="Transport (KES)"
          value={transport}
          onChangeText={setTransport}
          placeholder="300"
        />
        <Input
          label="Arrival time (minutes)"
          value={etaMinutes}
          onChangeText={setEtaMinutes}
          placeholder="60"
        />
        <Input
          label="Estimated duration (hours)"
          value={durationHours}
          onChangeText={setDurationHours}
          placeholder="2"
        />
        <Text style={{ fontWeight: '800', marginBottom: 7 }}>Message to client</Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          multiline
          placeholder="Explain what is included and when you can start."
          placeholderTextColor={colors.muted}
          style={{
            minHeight: 100,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            padding: 12,
            textAlignVertical: 'top',
          }}
        />

        <Card style={{ marginTop: 14, backgroundColor: '#F9FAFB' }}>
          <Text style={{ fontWeight: '900' }}>
            Subtotal: KES {subtotal.toLocaleString()}
          </Text>
          {discount > 0 ? (
            <Text style={{ color: colors.green, marginTop: 5 }}>
              Client FIRST10 saving: -KES {discount.toLocaleString()}
            </Text>
          ) : null}
          <Text style={{ fontSize: 19, fontWeight: '900', marginTop: 7 }}>
            Client pays: KES {(subtotal - discount).toLocaleString()}
          </Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>
            The promotional saving is funded by Ekazi and does not change your submitted subtotal.
          </Text>
        </Card>

        <View style={{ marginTop: 18 }}>
          <PrimaryButton
            title={submitting ? 'Sending Quote...' : 'Send Quote'}
            onPress={() => void submit()}
            disabled={submitting}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
