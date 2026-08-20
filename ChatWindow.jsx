import React, { useEffect, useRef, useState } from 'react';
import {
  sendMessage, listenToMessages, markChatRead, setTypingStatus, listenToTyping, getChatId,
} from './chatEngine';
import ChatIdentityHeader from './ChatIdentityHeader';

const COLORS = {
  bg: '#0D1117',
  bubbleMine: '#1F7A68',
  bubbleTheirs: '#171D26',
  accent: '#37E6C4',
  text: '#EAEDF1',
  muted: '#7C8798',
  border: '#2A3340',
};

let typingDebounce = null;

export default function ChatWindow({ myUid, peerUid, isContact }) {
  const chatId = getChatId(myUid, peerUid);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    const unsub = listenToMessages(chatId, (msgs) => {
      setMessages(msgs);
      markChatRead(chatId, myUid);
    });
    const unsubTyping = listenToTyping(chatId, peerUid, setPeerTyping);
    return () => {
      unsub();
      unsubTyping();
    };
  }, [chatId, myUid, peerUid]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, peerTyping]);

  const handleDraftChange = (value) => {
    setDraft(value);
    setTypingStatus(chatId, myUid, true);
    clearTimeout(typingDebounce);
    typingDebounce = setTimeout(() => setTypingStatus(chatId, myUid, false), 2000);
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setTypingStatus(chatId, myUid, false);
    await sendMessage({ fromUid: myUid, toUid: peerUid, type: 'text', text });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: COLORS.bg }}>
      <ChatIdentityHeader peerUid={peerUid} isContact={isContact} />

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} isMine={msg.senderId === myUid} />
        ))}
        {peerTyping && <TypingBubble />}
      </div>

      <div className="flex items-end gap-2 px-3 py-3" style={{ borderTop: `1px solid ${COLORS.border}` }}>
        <textarea
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Message"
          className="flex-1 px-4 py-2.5 rounded-2xl text-sm bg-transparent outline-none resize-none"
          style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text, maxHeight: 120 }}
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim()}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40"
          style={{ background: COLORS.accent, color: '#06110E' }}
          aria-label="Send"
        >
          ➤
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ message, isMine }) {
  const time = message.createdAt?.toDate
    ? message.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[75%] px-3.5 py-2 rounded-2xl text-sm"
        style={{
          background: isMine ? COLORS.bubbleMine : COLORS.bubbleTheirs,
          color: COLORS.text,
          borderBottomRightRadius: isMine ? 4 : undefined,
          borderBottomLeftRadius: !isMine ? 4 : undefined,
        }}
      >
        {message.type === 'text' && <p className="whitespace-pre-wrap break-words">{message.text}</p>}
        {/* Other message types (voice/poll/location/image) render via their
            own components — see VoiceNoteBubble, PollBubble, LocationBubble
            once those modules are added. */}
        <div className="flex items-center justify-end gap-1 mt-1">
          <span className="text-[10px]" style={{ color: 'rgba(234,237,241,0.55)' }}>{time}</span>
          {isMine && <ReadReceipt status={message.status} />}
        </div>
      </div>
    </div>
  );
}

function ReadReceipt({ status }) {
  const color = status === 'read' ? COLORS.accent : 'rgba(234,237,241,0.55)';
  return <span style={{ color, fontSize: 10 }}>{status === 'sent' ? '✓' : '✓✓'}</span>;
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div
        className="px-4 py-2.5 rounded-2xl flex gap-1 items-center"
        style={{ background: COLORS.bubbleTheirs, borderBottomLeftRadius: 4 }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{ background: COLORS.muted, animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
