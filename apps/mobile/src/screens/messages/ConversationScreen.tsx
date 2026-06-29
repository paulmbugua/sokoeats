import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useShopContext } from '@myhandymanapp/shared/context';
import { Screen } from '../../components/Screen';
import { colors, radius, spacing } from '../../theme/tokens';

type Message = {
  id: string;
  sender: 'user' | 'pro';
  body: string;
  createdAt?: string;
};

export default function ConversationScreen({ route }: any) {
  const { http } = useShopContext();
  const { conversationId, name } = route.params;
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const { data } = await http.get(`/api/conversations/${conversationId}/messages`);
    setMessages(Array.isArray(data?.messages) ? data.messages : []);
  }, [conversationId, http]);

  useEffect(() => {
    void load().catch(() => Alert.alert('Could not load messages', 'Please try again.'));
  }, [load]);

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const { data } = await http.post(`/api/conversations/${conversationId}/messages`, {
        body: text,
      });
      setMessages((current) => [...current, data.message]);
      setBody('');
    } catch {
      Alert.alert('Message not sent', 'Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen backgroundColor="white">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ paddingHorizontal: spacing.xl, paddingBottom: 10 }}>
          <Text style={{ fontSize: 18, fontWeight: '900' }}>{name || 'Provider'}</Text>
        </View>
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: 8,
            paddingBottom: 18,
            flexGrow: 1,
            justifyContent: messages.length ? 'flex-end' : 'center',
          }}
          renderItem={({ item }) => {
            const mine = item.sender === 'user';
            return (
              <View
                style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  maxWidth: '82%',
                  backgroundColor: mine ? colors.primary : '#F3F4F6',
                  borderRadius: radius.lg,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  marginTop: 8,
                }}
              >
                <Text style={{ color: mine ? 'white' : colors.text }}>{item.body}</Text>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={{ color: colors.muted, textAlign: 'center' }}>
              Send a message to start the conversation.
            </Text>
          }
        />
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            alignItems: 'flex-end',
            paddingHorizontal: spacing.xl,
            paddingTop: 10,
            paddingBottom: 12,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Type a message"
            multiline
            style={{
              flex: 1,
              maxHeight: 110,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.lg,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: colors.text,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            disabled={!body.trim() || sending}
            onPress={() => void send()}
            style={{
              backgroundColor: !body.trim() || sending ? '#9BB6FF' : colors.primary,
              borderRadius: radius.lg,
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            <Text style={{ color: 'white', fontWeight: '900' }}>{sending ? '...' : 'Send'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
