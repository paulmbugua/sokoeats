import React, { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane, faSmile, faBars, faTimes, faHome } from '@fortawesome/free-solid-svg-icons';
import { useMessages } from '@mytutorapp/shared/hooks';
import type { ChatMessage } from '@mytutorapp/shared/types/ShopContextTypes';
import chatPlaceholder from '../assets/chat.png';

const Messages: React.FC = () => {
  const location = useLocation();
  const {
    activeChat,
    setActiveChat,
    newMessage,
    setNewMessage,
    isSidebarOpen,
    setSidebarOpen,
    openChat,
    handleSendMessage,
    handleScroll, // keep only the scroll handler
    chats,
    myProfile,
    messageContainerRef,
  } = useMessages();

  // Only send; socket will append + scroll via hook
  const sendAndRefresh = () => {
    handleSendMessage();
  };

  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-open chat if ?studentId=...
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const studentId = params.get('studentId');
    if (studentId && !activeChat && chats.length > 0) {
      const chatToOpen = chats.find((c) => String(c.recipientId) === studentId);
      if (chatToOpen) openChat(chatToOpen);
    }
  }, [location.search, chats, activeChat, openChat]);

  // Auto-focus on input
  useEffect(() => {
    if (activeChat && messageInputRef.current) {
      messageInputRef.current.focus();
    }
  }, [activeChat]);

  if (!myProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-softGray dark:bg-darkBg text-darkText dark:text-darkTextPrimary">
        <p>Loading…</p>
      </div>
    );
  }

  // Map messages & normalize timestamp
  // Now assuming ChatMessage has both `timestamp?: string` and `created_at?: string`
  const convertedMessages: Array<ChatMessage & { timestamp: string }> =
    activeChat?.messages.map((msg) => ({
      ...msg,
      timestamp: msg.timestamp ?? new Date().toISOString(),
    })) || [];

  return (
    <div
      className="
        relative
        flex
        flex-col
        min-h-screen
        bg-softGray
        text-darkText
        dark:bg-darkBg
        dark:text-darkTextPrimary
        font-sans
        pt-20    /* top gap for navbar */
        pb-20    /* bottom gap for footer */
      "
    >
      {/* Home Link (theme-aware) */}
      <Link
        to="/"
        className="absolute top-6 left-1/2 -translate-x-1/2 text-mutedGray hover:text-primary transition-colors"
        aria-label="Go home"
      >
        <FontAwesomeIcon icon={faHome} className="text-2xl md:text-3xl" />
      </Link>

      <div className="flex flex-grow">
        {/* Sidebar */}
        <div
          className={`
            fixed inset-y-0 left-0 transform transition-transform duration-300
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            md:relative md:translate-x-0
            w-72 max-w-xs
            bg-white dark:bg-darkCard
            text-darkText dark:text-darkTextPrimary
            p-4
            overflow-y-auto
            border-r border-[#e5e7eb] dark:border-darkBg
            shadow-sm md:shadow-none
            z-20
            rounded-none md:rounded-xl md:ml-4
          `}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-secondary">Chats</h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-mutedGray hover:text-darkText dark:hover:text-darkTextPrimary md:hidden transition-colors"
              aria-label="Close sidebar"
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>

          <ul className="space-y-3">
            {chats.length > 0 ? (
              chats.map((chatItem, idx) => {
                const hasUnread = chatItem.messages.some(
                  (m) => m.unread && String(m.sender) !== String(myProfile.id)
                );
                return (
                  <li
                    key={`${chatItem.recipientId}-${idx}`}
                    onClick={() => openChat(chatItem)}
                    className={`
                      p-3 rounded-lg cursor-pointer transition
                      ${
                        hasUnread
                          ? 'bg-softPink/10 ring-1 ring-softPink/30'
                          : 'bg-white dark:bg-darkBg hover:bg-softGray/70 dark:hover:bg-darkCard/70'
                      }
                      border border-[#f1f5f9] dark:border-darkBg
                    `}
                  >
                    <div className="flex items-center space-x-3">
                      <img
                        src={
                          myProfile.role === 'tutor'
                            ? chatPlaceholder
                            : chatItem.avatar || chatPlaceholder
                        }
                        alt="Avatar"
                        className="w-10 h-10 rounded-full border-2 border-primary object-cover"
                      />
                      <div className="flex-grow">
                        <span className="font-semibold text-primary">
                          {chatItem.name || chatItem.recipientId}
                        </span>
                        <p className="text-sm text-mutedGray dark:text-darkTextSecondary truncate">
                          {chatItem.lastMessage || 'Start a conversation'}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })
            ) : (
              <p className="text-center text-mutedGray dark:text-darkTextSecondary">
                No chats available
              </p>
            )}
          </ul>
        </div>

        {/* Chat Area */}
        <div className="flex-grow flex flex-col md:ml-72 md:mr-4">
          {/* Header */}
          <div
            className="
              flex items-center justify-between
              px-4 py-3
              bg-white dark:bg-darkCard
              border-b border-[#e5e7eb] dark:border-darkBg
              rounded-t-xl md:rounded-xl
              shadow-sm
            "
          >
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-mutedGray hover:text-secondary md:hidden transition-colors"
              aria-label="Open sidebar"
            >
              <FontAwesomeIcon icon={faBars} />
            </button>
            {activeChat ? (
              <div className="absolute left-16 md:left-20 flex items-center space-x-3">
                <img
                  src={
                    myProfile.role === 'tutor'
                      ? chatPlaceholder
                      : activeChat.avatar || chatPlaceholder
                  }
                  alt="Avatar"
                  className="w-8 h-8 rounded-full object-cover"
                />
                <h3 className="text-lg font-semibold text-secondary">
                  {activeChat.name || activeChat.recipientId}
                </h3>
              </div>
            ) : (
              <h3 className="text-lg font-semibold text-mutedGray dark:text-darkTextSecondary">
                Your Messages
              </h3>
            )}
            {activeChat && (
              <button
                onClick={() => setActiveChat(null)}
                className="text-mutedGray hover:text-darkText dark:hover:text-darkTextPrimary transition-colors"
                aria-label="Close chat"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            )}
          </div>

          {/* Messages List with wrapped onScroll */}
          <div
            ref={messageContainerRef as React.RefObject<HTMLDivElement>}
            onScroll={(e) =>
              handleScroll({
                nativeEvent: {
                  contentOffset: { y: (e.target as HTMLDivElement).scrollTop },
                },
              })
            }
            className="
              flex-grow
              p-4
              overflow-y-auto
              bg-white dark:bg-darkBg
              space-y-3
              border-x border-[#e5e7eb] dark:border-darkBg
              md:border-x
            "
          >
            {activeChat ? (
              <div className="space-y-3">
                {convertedMessages
                  .slice()
                  .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                  .map((msg) => {
                    const isSender = String(msg.sender) === String(myProfile.id);
                    const displayName = isSender ? 'You' : msg.sender_name;
                    return (
                      <div
                        key={msg.id} // use msg.id as the React key
                        className={`flex ${isSender ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`
                            px-4 py-2 rounded-2xl max-w-xs shadow
                            ${
                              isSender
                                ? 'bg-primary text-white'
                                : 'bg-softGray text-darkText dark:bg-darkCard dark:text-darkTextPrimary'
                            }
                          `}
                        >
                          {!isSender && displayName && (
                            <span className="block text-[11px] font-semibold text-mutedGray dark:text-darkTextSecondary mb-0.5">
                              {displayName}
                            </span>
                          )}
                          <p className="text-sm leading-relaxed">{msg.content}</p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="flex-grow flex items-center justify-center text-mutedGray dark:text-darkTextSecondary">
                <p>Select a chat to view messages.</p>
              </div>
            )}
          </div>

          {/* Composer */}
          {activeChat && (
            <div
              className="
                px-4 py-3
                bg-white dark:bg-darkCard
                flex items-center gap-3
                border-t border-[#e5e7eb] dark:border-darkBg
                rounded-b-xl md:rounded-xl
                shadow-sm
              "
            >
              <textarea
                ref={messageInputRef}
                placeholder="Type a message…"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendAndRefresh();
                  }
                }}
                className="
                  flex-grow p-2 rounded-lg
                  bg-softGray dark:bg-darkBg
                  border border-[#e5e7eb] dark:border-darkBg
                  text-darkText dark:text-darkTextPrimary
                  placeholder-darkTextSecondary dark:placeholder-darkTextSecondary
                  focus:outline-none focus:ring-2 focus:ring-secondary
                  resize-none
                "
              />
              <button
                className="
                  text-mutedGray hover:text-secondary
                  transition-colors
                "
                aria-label="Emoji"
              >
                <FontAwesomeIcon icon={faSmile} />
              </button>
              <button
                onClick={sendAndRefresh}
                className="
                  bg-secondary text-white px-4 py-2 rounded-lg
                  flex items-center gap-2
                  hover:opacity-90 active:opacity-80
                  transition
                "
                aria-label="Send"
              >
                <FontAwesomeIcon icon={faPaperPlane} />
                <span className="hidden sm:inline text-sm font-semibold">Send</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Messages;
