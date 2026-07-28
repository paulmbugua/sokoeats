import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useShopContext } from '@myhandymanapp/shared/context';
import Card from '../../components/Card';
import PrimaryButton from '../../components/PrimaryButton';
import SecondaryButton from '../../components/SecondaryButton';
import { ScreenScroll } from '../../components/Screen';
import { colors, spacing } from '../../theme/tokens';

function money(value?: number | null) {
  return 'KES ' + Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

function normalizePhone(value: string) {
  const raw = String(value || '').replace(/\D/g, '');
  if (raw.startsWith('254') && raw.length === 12) return '+' + raw;
  if (raw.startsWith('0') && raw.length === 10) return '+254' + raw.slice(1);
  if ((raw.startsWith('7') || raw.startsWith('1')) && raw.length === 9) return '+254' + raw;
  return value.trim();
}

export default function ProviderCommissionPaymentScreen({ navigation }: any) {
  const { http } = useShopContext();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [due, setDue] = useState(0);
  const [threshold, setThreshold] = useState(200);
  const [cashBlocked, setCashBlocked] = useState(false);
  const [phone, setPhone] = useState('');
  const [payments, setPayments] = useState<any[]>([]);
  const [activePayment, setActivePayment] = useState<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const canPay = useMemo(() => due > 0 && phone.trim().length >= 9 && !busy, [busy, due, phone]);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await http.get('/api/provider/commission');
      setDue(Number(data?.due || 0));
      setThreshold(Number(data?.threshold || 200));
      setCashBlocked(Boolean(data?.cashBlocked));
      setPhone((current) => current || data?.defaultPhone || '');
      setPayments(data?.payments || []);
    } catch (error: any) {
      Alert.alert('Could not load balance', error?.response?.data?.message || 'Please pull to refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [http]);

  useEffect(() => {
    void load();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  const pollPayment = useCallback((paymentId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await http.get('/api/provider/commission/payments/' + paymentId);
        setActivePayment(data?.payment || null);
        setDue(Number(data?.due || 0));
        setCashBlocked(Boolean(data?.cashBlocked));
        if (data?.payment?.status === 'completed') {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          Alert.alert('Payment received', 'Your commission balance has been updated. Cash jobs unlock once your balance is below the limit.');
          await load();
        }
        if (data?.payment?.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // Safaricom callbacks can arrive a few seconds later, so keep polling quietly.
      }
    }, 3500);
  }, [http, load]);

  const startPayment = async () => {
    const normalized = normalizePhone(phone);
    setBusy(true);
    try {
      const { data } = await http.post('/api/provider/commission/pay', { phone: normalized });
      setActivePayment(data?.payment || null);
      Alert.alert('M-Pesa prompt sent', 'Check ' + normalized + ' and enter your M-Pesa PIN to pay ' + money(data?.due || due) + '.');
      if (data?.payment?.id) pollPayment(String(data.payment.id));
    } catch (error: any) {
      Alert.alert('Payment not started', error?.response?.data?.message || 'Please confirm the phone number and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <ScreenScroll refreshEnabled={false}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ marginTop: 12, color: colors.muted, fontWeight: '800' }}>Loading commission balance...</Text>
        </View>
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll refreshEnabled={false} contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}>
      <Pressable onPress={() => navigation.goBack()} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Ionicons name="arrow-back" size={22} color={colors.ink} />
        <Text style={{ color: colors.ink, fontWeight: '900', fontSize: 16 }}>Back</Text>
      </Pressable>

      <Card style={{ backgroundColor: '#071B12', borderColor: '#123524' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#A7F3D0', fontWeight: '900', textTransform: 'uppercase', fontSize: 12 }}>Ekazi commission due</Text>
            <Text style={{ color: 'white', fontWeight: '900', fontSize: 36, marginTop: 6 }}>{money(due)}</Text>
            <Text style={{ color: '#CFEBDD', fontWeight: '700', marginTop: 6, lineHeight: 21 }}>
              Cash jobs pause at {money(threshold)}. Card jobs still work because Ekazi collects first and pays you every Monday.
            </Text>
          </View>
          <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="phone-portrait" size={30} color="white" />
          </View>
        </View>
      </Card>

      {cashBlocked ? (
        <Card style={{ marginTop: 12, backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }}>
          <Text style={{ color: '#9A3412', fontWeight: '900' }}>Cash booking limit reached</Text>
          <Text style={{ color: '#9A3412', marginTop: 6, lineHeight: 21 }}>Pay your current balance to reopen cash requests. This keeps provider payments fair without adding charges to clients.</Text>
        </Card>
      ) : null}

      <Card style={{ marginTop: 12 }}>
        <Text style={{ fontWeight: '900', fontSize: 18, color: colors.ink }}>Pay with M-Pesa</Text>
        <Text style={{ color: colors.muted, marginTop: 6, lineHeight: 21 }}>Enter any Safaricom number. The amount is locked to your current balance, then Safaricom sends the STK prompt.</Text>
        <Text style={{ color: colors.ink, fontWeight: '900', marginTop: 14 }}>M-Pesa phone number</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="07xx xxx xxx"
          placeholderTextColor={colors.muted}
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14, fontSize: 18, fontWeight: '800', marginTop: 8, color: colors.ink, backgroundColor: '#FFFFFF' }}
        />
        <View style={{ marginTop: 14 }}>
          <PrimaryButton title={busy ? 'Sending prompt...' : 'Send M-Pesa prompt'} onPress={startPayment} disabled={!canPay} attention={cashBlocked ? 'urgent' : 'gentle'} />
        </View>
        {activePayment ? (
          <View style={{ marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontWeight: '900', color: colors.ink }}>Payment status: {String(activePayment.status || 'pending')}</Text>
            <Text style={{ color: colors.muted, marginTop: 4 }}>Receipt: {activePayment.mpesaReceipt || 'Waiting for Safaricom confirmation'}</Text>
          </View>
        ) : null}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={{ fontWeight: '900', fontSize: 16, color: colors.ink }}>Recent payments</Text>
        {payments.length ? payments.map((payment) => (
          <View key={payment.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontWeight: '900' }}>{money(payment.amount)}</Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>{payment.phone} - {payment.status}</Text>
            </View>
            <Text style={{ color: payment.status === 'completed' ? colors.primary : colors.muted, fontWeight: '900' }}>{payment.mpesaReceipt || 'STK'}</Text>
          </View>
        )) : (
          <Text style={{ color: colors.muted, marginTop: 8 }}>No commission payments yet.</Text>
        )}
      </Card>

      <View style={{ marginTop: 12 }}>
        <SecondaryButton title={refreshing ? 'Refreshing...' : 'Refresh balance'} onPress={load} disabled={refreshing} />
      </View>
    </ScreenScroll>
  );
}
