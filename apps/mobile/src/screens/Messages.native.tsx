// apps/mobile/src/screens/Messages.native.tsx
/* eslint-disable prettier/prettier */
import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  TextInput,
  NativeSyntheticEvent,
  NativeScrollEvent,
  AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useIsFocused } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { FontAwesome } from '@expo/vector-icons';
import { useMessages } from '@mytutorapp/shared/hooks';
import {
    notifyNow,
} from '../../utils/notifications';
import tw from '../../tailwind';
import chat from '../../assets/chat.png';
import type { ChatMessage as SharedChatMessage } from '@mytutorapp/shared/types/ShopContextTypes';

type RootStackParamList = { Home: undefined };
type LoginNav = StackNavigationProp<RootStackParamList, 'Home'>;

interface RouteParams {
  studentId?: string;
}
type RouteT = RouteProp<{ params: RouteParams }, 'params'>;

/** Shape we render for items in the chat list (loose, based on usage) */
type ChatListItem = {
  conversationId: string | number;
  name: string;
  avatar?: string;
  lastMessage?: string;
  unreadCount?: number;
  recipientId?: string | number;
  messages?: Array<
    SharedChatMessage & {
      timestamp?: string;
      created_at?: string;
      sender_id?: string | number;
      sender?: string | number;
      sender_name?: string;
    }
  >;
};

const MessagesNative: React.FC = () => {
  const navigation = useNavigation<LoginNav>();
  const route = useRoute<RouteT>();
  const insets = useSafeAreaInsets();

  const {
    activeChat,
    setActiveChat,
    newMessage,
    setNewMessage,
    isSidebarOpen,
    setSidebarOpen,
    openChat,
    handleSendMessage,
    handleScroll, // might be provided by hook; prefer this
    loadMoreMessages, // legacy fallback
    chats,
    myProfile,
    messageContainerRef,
  } = useMessages();

  const isFocused = useIsFocused();
  const appStateRef = useRef(AppState.currentState);
  const seenMsgIdsRef = useRef<Set<string>>(new Set());

  // Track app state
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      appStateRef.current = s;
    });
    return () => sub.remove();
  }, []);

  // Coerce our local list item to the stricter Conversation type that openChat expects.
  type OpenChatArg = Parameters<typeof openChat>[0];
  const toOpenChatArg = (i: ChatListItem): OpenChatArg => ({
    ...(i as unknown as OpenChatArg),
    conversationId: String(i.conversationId),
    ...(i.recipientId != null ? { recipientId: String(i.recipientId) } : {}),
  });

  const chatsArr: ChatListItem[] = Array.isArray(chats) ? (chats as ChatListItem[]) : [];

  const sendAndRefresh = () => {
    handleSendMessage();
  };

  const myId = String(myProfile?.id ?? '');
  const isFromMe = (m: any) => {
    const rawSenderId = String(m?.sender_id ?? m?.sender ?? '');
    return rawSenderId === myId;
  };

  // Make a stable “message id” (falls back to timestamp if no id)
  const msgKey = (m: any) =>
    String(m?.id ?? m?.timestamp ?? `${m?.sender_id ?? ''}:${m?.created_at ?? ''}`);

  
  // Auto-open via route param (like web’s ?studentId)
  useEffect(() => {
    const { studentId } = route.params ?? {};
    if (studentId && !activeChat && chatsArr.length > 0) {
      const chatToOpen = chatsArr.find((c) => String(c.recipientId) === String(studentId));
      if (chatToOpen) openChat(toOpenChatArg(chatToOpen));
    }
  }, [route.params, chatsArr, activeChat, openChat]);

  // Focus input on open
  const messageInputRef = useRef<TextInput>(null);
  useEffect(() => {
    if (activeChat) messageInputRef.current?.focus();
  }, [activeChat]);

  // Scroll handler that mirrors web
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (typeof handleScroll === 'function') {
      handleScroll({
        nativeEvent: {
          contentOffset: { y: e.nativeEvent.contentOffset.y },
        },
      } as unknown as NativeSyntheticEvent<NativeScrollEvent>);
      return;
    }
    if (typeof loadMoreMessages === 'function') {
      if (e.nativeEvent.contentOffset.y < 100) loadMoreMessages();
    }
  };

  // Smooth bottom scroll when content grows
  const scrollToBottom = () => {
    (messageContainerRef as React.RefObject<ScrollView>)?.current?.scrollToEnd({ animated: false });
  };

  // Normalize + sort messages by timestamp asc
  const sortedMessages = useMemo(() => {
    const list = (activeChat?.messages || []) as ChatListItem['messages'];
    const withTs =
      list?.map((m) => ({
        ...m,
        timestamp: m?.timestamp ?? m?.created_at ?? new Date().toISOString(),
      })) ?? [];
    return withTs
      .slice()
      .sort((a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime());
  }, [activeChat?.messages]);

  useEffect(() => {
    scrollToBottom();
  }, [sortedMessages.length]);

  // Local notification for *incoming* messages when not actively viewing this chat
  useEffect(() => {
    if (!Array.isArray(sortedMessages)) return;

    // Find unseen
    const newlyArrived = sortedMessages.filter((m) => {
      const key = msgKey(m);
      if (!key || seenMsgIdsRef.current.has(key)) return false;
      return true;
    });

    if (newlyArrived.length === 0) return;

    // Mark seen
    for (const m of newlyArrived) {
      const key = msgKey(m);
      if (key) seenMsgIdsRef.current.add(key);
    }

    // Only others' messages notify
    const incoming = newlyArrived.filter((m) => !isFromMe(m));
    if (incoming.length === 0) return;

    const shouldNotify = () => {
      const appActive = appStateRef.current === 'active';
      const inThisChat = Boolean(activeChat?.conversationId);
      return !isFocused || !appActive || !inThisChat;
    };

    if (!shouldNotify()) return;

    const latest = incoming[incoming.length - 1];
    if (!latest) return;

    const senderName =
      (latest as any).sender_name ||
      (activeChat && activeChat.name) ||
      'New message';

    const body = String((latest as any).content ?? 'You have a new message');

    const payload: Record<string, any> = { screen: 'Messages' };
    const studentId =
      (latest as any).sender_id || (latest as any).sender || activeChat?.recipientId;
    if (studentId) payload.params = { studentId: String(studentId) };

    void notifyNow(senderName, body, payload);
  }, [sortedMessages, activeChat, isFocused]);

  // Reset seen set when switching conversations
  useEffect(() => {
    seenMsgIdsRef.current = new Set();
  }, [activeChat?.conversationId]);

  // Seed seen with current messages when a chat opens
  useEffect(() => {
    for (const m of sortedMessages) {
      const key = msgKey(m);
      if (key) seenMsgIdsRef.current.add(key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat?.conversationId]);

  if (!myProfile) {
    return (
      <View style={tw`flex-1 justify-center items-center bg-slate-50 dark:bg-[#0b1016]`}>
        <Text style={tw`text-[#0d141c] dark:text-white/90`}>Loading…</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`,
        { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 8) },
      ]}
    >
      {/* Top bar */}
      <View style={tw`flex-row items-center justify-between px-4 py-3 bg-white dark:bg-[#0f1821] border-b border-[#cedbe8] dark:border-white/10`}>
        <TouchableOpacity
          onPress={() => setSidebarOpen(true)}
          accessibilityLabel="Open chats"
          accessibilityHint="Open the chats sidebar"
          style={tw`p-2 -ml-2`}
        >
          <FontAwesome
            name="bars"
            size={22}
            color={tw.color(`text-slate-600 dark:text-slate-300`) as string}
          />
        </TouchableOpacity>

        {activeChat ? (
          <View style={tw`flex-row items-center`}>
            <Image
              source={
                myProfile.role === 'tutor'
                  ? chat
                  : activeChat.avatar
                  ? { uri: activeChat.avatar }
                  : chat
              }
              style={tw`w-8 h-8 rounded-full mr-3`}
            />
            <Text style={tw`text-base font-semibold text-[#0d141c] dark:text-white`}>
              {activeChat.name}
            </Text>
          </View>
        ) : (
          <Text style={tw`text-base font-semibold text-[#0d141c] dark:text-white`}>
            Your Messages
          </Text>
        )}

        {/* Right actions: Home */}
        <View style={tw`flex-row items-center -mr-2`}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Home')}
            accessibilityLabel="Go Home"
            accessibilityHint="Navigate to the home screen"
            style={tw`p-2`}
          >
            <FontAwesome
              name="home"
              size={22}
              color={tw.color(`text-slate-600 dark:text-slate-300`) as string}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sidebar */}
      {isSidebarOpen && (
        <View style={tw`absolute top-0 bottom-0 left-0 right-0 z-20`}>
          {/* backdrop */}
          <TouchableOpacity
            accessibilityLabel="Close chats"
            accessibilityHint="Close the chats sidebar"
            onPress={() => setSidebarOpen(false)}
            activeOpacity={1}
            style={tw`absolute inset-0 bg-black/40`}
          />
          {/* panel */}
          <View style={tw`absolute top-0 bottom-0 left-0 w-72 bg-white dark:bg-[#0f1821] p-4 border-r border-[#cedbe8] dark:border-white/10`}>
            <View style={tw`flex-row items-center justify-between mb-4`}>
              <Text style={tw`text-xl font-bold text-pink-600 dark:text-pink-400`}>
                Chats
              </Text>
              <TouchableOpacity
                onPress={() => setSidebarOpen(false)}
                accessibilityLabel="Close chats"
              >
                <FontAwesome
                  name="times"
                  size={20}
                  color={tw.color(`text-slate-600 dark:text-slate-300`) as string}
                />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {chatsArr.length > 0 ? (
                chatsArr.map((chatItem) => {
                  const isActive =
                    activeChat?.conversationId === String(chatItem.conversationId);
                  return (
                    <TouchableOpacity
                      key={String(chatItem.conversationId)}
                      onPress={() => {
                        openChat(toOpenChatArg(chatItem));
                        setSidebarOpen(false);
                      }}
                      accessibilityLabel={`Open chat with ${chatItem.name}`}
                      style={tw`mb-2`}
                    >
                      <View
                        style={[
                          tw`flex-row items-center p-2 rounded-xl border`,
                          isActive
                            ? tw`bg-slate-100 dark:bg-white/5 border-[#cedbe8] dark:border-white/10`
                            : tw`bg-white dark:bg-[#0f1821] border-[#cedbe8] dark:border-white/10`,
                        ]}
                      >
                        <Image
                          source={
                            myProfile.role === 'tutor'
                              ? chat
                              : chatItem.avatar
                              ? { uri: chatItem.avatar }
                              : chat
                          }
                          style={tw`w-10 h-10 rounded-full mr-3`}
                        />
                        <View style={tw`flex-1`}>
                          <Text
                            style={tw`font-semibold text-[#0d141c] dark:text-white`}
                            numberOfLines={1}
                          >
                            {chatItem.name}
                          </Text>
                          <Text
                            style={tw`text-xs text-slate-600 dark:text-slate-400`}
                            numberOfLines={1}
                          >
                            {chatItem.lastMessage || 'Start a conversation'}
                          </Text>
                        </View>
                        {(chatItem.unreadCount ?? 0) > 0 && (
                          <View style={tw`bg-red-600 rounded-full px-2 py-0.5 ml-2`}>
                            <Text style={tw`text-white text-[10px]`}>
                              {chatItem.unreadCount}
                            </Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <Text style={tw`text-center text-slate-600 dark:text-slate-400 mt-4`}>
                  No chats available
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Messages body */}
      <View style={tw`flex-1`}>
        <ScrollView
          ref={messageContainerRef as React.RefObject<ScrollView>}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onContentSizeChange={scrollToBottom}
          style={tw`flex-1 px-4 py-3`}
          contentContainerStyle={tw`pb-2`}
          keyboardShouldPersistTaps="handled"
        >
          {activeChat ? (
            sortedMessages.map((msg) => {
              const rawSenderId = String(
                (msg as { sender_id?: string | number; sender?: string | number }).sender_id ??
                  msg.sender
              );
              const isSender = rawSenderId === String(myProfile.id);
              const displayName =
                isSender ? 'You' : (msg as { sender_name?: string }).sender_name ?? '';

              return (
                <View
                  key={String((msg as { id?: string | number }).id ?? msg.timestamp)}
                  accessible
                  accessibilityLabel={msg.content}
                  style={[tw`mb-3 max-w-[80%]`, isSender ? tw`self-end` : tw`self-start`]}
                >
                  <View
                    style={[
                      tw`p-3 rounded-2xl`,
                      isSender
                        ? tw`bg-pink-600`
                        : tw`bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10`,
                    ]}
                  >
                    {!isSender && !!displayName && (
                      <Text style={tw`text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5`}>
                        {displayName}
                      </Text>
                    )}
                    <Text
                      style={[
                        tw`text-sm`,
                        isSender ? tw`text-white` : tw`text-[#0d141c] dark:text-white`,
                      ]}
                    >
                      {msg.content}
                    </Text>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={tw`flex-1 items-center justify-center mt-12`}>
              <Text style={tw`text-slate-600 dark:text-slate-400`}>
                Select a chat to view messages.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Composer */}
        {activeChat && (
          <View style={tw`flex-row items-center px-3 py-3 bg-white dark:bg-[#0f1821] border-t border-[#cedbe8] dark:border-white/10`}>
            <TextInput
              ref={messageInputRef}
              accessibilityLabel="Message input"
              accessibilityHint="Type your message here"
              placeholder="Type a message..."
              value={newMessage}
              onChangeText={setNewMessage}
              onSubmitEditing={sendAndRefresh}
              blurOnSubmit={false}
              returnKeyType="send"
              style={tw`flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0b1016] border border-[#cedbe8] dark:border-white/10 text-[#0d141c] dark:text-white`}
              multiline={false}
              placeholderTextColor={tw.color('text-slate-500') as string}
            />
            <TouchableOpacity
              accessibilityLabel="Insert emoji"
              accessibilityHint="Open emoji picker"
              style={tw`px-3 py-2`}
            >
              <FontAwesome
                name="smile-o"
                size={22}
                color={tw.color(`text-slate-600 dark:text-slate-300`) as string}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={sendAndRefresh}
              accessibilityLabel="Send message"
              accessibilityHint="Send the message you typed"
              style={tw`bg-pink-600 px-4 py-2 rounded-xl ml-1`}
            >
              <FontAwesome name="paper-plane" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

export default MessagesNative;
