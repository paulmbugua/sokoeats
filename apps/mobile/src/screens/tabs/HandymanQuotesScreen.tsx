import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text } from 'react-native';
import { useShopContext } from '@myhandymanapp/shared/context';
import Card from '../../components/Card';
import { Screen } from '../../components/Screen';
import { colors, spacing } from '../../theme/tokens';

export default function HandymanQuotesScreen() {
  const { http } = useShopContext();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await http.get('/api/handyman/quotes');
      setQuotes(data?.quotes || []);
    } finally {
      setRefreshing(false);
    }
  }, [http]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen backgroundColor="white">
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 110 }}
      >
        <Text style={{ fontSize: 20, fontWeight: '900' }}>My Quotes</Text>
        {quotes.length ? (
          quotes.map((quote) => (
            <Card key={quote.id} style={{ marginTop: 12 }}>
              <Text style={{ fontWeight: '900' }}>
                {quote.job?.description || 'Job quote'}
              </Text>
              <Text style={{ color: colors.muted, marginTop: 5 }}>
                {quote.job?.estate}, {quote.job?.city}
              </Text>
              <Text style={{ fontSize: 18, fontWeight: '900', marginTop: 10 }}>
                KES {quote.total.toLocaleString()}
              </Text>
              <Text style={{ color: colors.primary, fontWeight: '900', marginTop: 5 }}>
                {quote.status}
              </Text>
            </Card>
          ))
        ) : (
          <Card style={{ marginTop: 12 }}>
            <Text style={{ color: colors.muted }}>
              Quotes you submit to clients will appear here.
            </Text>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
