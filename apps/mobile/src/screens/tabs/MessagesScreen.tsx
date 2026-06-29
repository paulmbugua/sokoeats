import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useShopContext } from '@myhandymanapp/shared/context';
import Card from '../../components/Card';
import { colors, spacing } from '../../theme/tokens';
import { Screen } from '../../components/Screen';

type Conversation = {
  id: string;
  pro: { id: string; name: string };
  lastMessage: string;
  lastAt?: string;
  unreadCount?: number;
};

export default function MessagesScreen({ navigation }: any) {
  const { http } = useShopContext();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await http.get('/api/conversations');
      setConversations(Array.isArray(data?.conversations) ? data.conversations : []);
    } finally {
      setLoading(false);
    }
  }, [http]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen backgroundColor="white">
      <View style={{ padding: spacing.xl, paddingBottom: 10 }}>
        <Text style={{ fontSize: 18, fontWeight: '900' }}>Messages</Text>
      </View>
      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, paddingBottom: 110 }}
      >
        {conversations.length ? (
          conversations.map((conversation) => (
            <Pressable
              key={conversation.id}
              onPress={() =>
                navigation.navigate('Conversation', {
                  conversationId: conversation.id,
                  name: conversation.pro?.name || 'Provider',
                })
              }
            >
              <Card style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <Text style={{ fontWeight: '900', flex: 1 }}>
                    {conversation.pro?.name || 'Provider'}
                  </Text>
                  {conversation.unreadCount ? (
                    <Text style={{ color: colors.primary, fontWeight: '900' }}>
                      {conversation.unreadCount}
                    </Text>
                  ) : null}
                </View>
                <Text style={{ color: colors.muted, marginTop: 6 }} numberOfLines={2}>
                  {conversation.lastMessage || 'Start the conversation'}
                </Text>
              </Card>
            </Pressable>
          ))
        ) : (
          <Card>
            <Text style={{ fontWeight: '800' }}>No conversations yet</Text>
            <Text style={{ color: colors.muted, marginTop: 6 }}>
              Messages with providers will appear here after you request or accept a quote.
            </Text>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
