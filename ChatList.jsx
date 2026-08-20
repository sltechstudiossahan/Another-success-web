import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { listenToChatList } from './chatEngine';

const COLORS = {
  bg: '#0D1117',
  row: '#10141B',
  accent: '#37E6C4',
  warn: '#F2A94E',
  text: '#EAEDF1',
  muted: '#7C8798',
  border: '#1B222C',
};

/**
 * ChatList
 *
 * `contactsMap` should be a { [uid]: true } lookup built from the
 * user's saved contacts (matched by phone number in your existing
 * contacts sync). Rows for non-contacts show the NIC name instead of
 * a chosen display name/photo, same rule as ChatIdentityHeader.
 */
export default function ChatList({ myUid, contactsMap = {}, onOpenChat }) {
  const [chats, setChats] = useState([]);
  const [peerCache, setPeerCache] = useState({});

  useEffect(() => {
    const unsub = listenToChatList(myUid, setChats);
    return unsub;
  }, [myUid]);

  useEffect(() => {
    chats.forEach(async (chat) => {
      if (peerCache[chat.peerUid]) return;
      const isContact = !!contactsMap[chat.peerUid];
      const collectionName = isContact ? 'users' : 'nicVerifications';
      const snap = await getDoc(doc(db, collectionName, chat.peerUid));
      if (snap.exists()) {
        setPeerCache((prev) => ({ ...prev, [chat.peerUid]: { isContact, ...snap.data() } }));
      }
    });
  }, [chats, contactsMap]);

  return (
    <div style={{ background: COLORS.bg, minHeight: '100%' }}>
      {chats.length === 0 && (
        <p className="text-sm text-center py-10" style={{ color: COLORS.muted }}>
          No conversations yet
        </p>
      )}

      {chats.map((chat) => {
        const peer = peerCache[chat.peerUid];
        const name = peer?.isContact ? peer?.displayName : peer?.fullName;
        const unread = chat.myUnread > 0;

        return (
          <button
            key={chat.id}
            onClick={() => onOpenChat(chat.peerUid)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left"
            style={{ background: COLORS.row, borderBottom: `1px solid ${COLORS.border}` }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-sm font-medium"
              style={{ background: '#232C38', color: COLORS.text }}
            >
              {peer?.isContact && peer?.photoURL ? (
                <img src={peer.photoURL} alt="" className="w-full h-full object-cover" />
              ) : (
                (name || '?').charAt(0).toUpperCase()
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p
                  className="text-sm truncate"
                  style={{ color: COLORS.text, fontWeight: unread ? 600 : 400 }}
                >
                  {name || 'Loading…'}
                </p>
                {peer && !peer.isContact && (
                  <span className="text-[10px]" style={{ color: COLORS.warn }} title="Not in your contacts — NIC verified">
                    ⚠
                  </span>
                )}
              </div>
              <p
                className="text-xs truncate"
                style={{ color: unread ? COLORS.text : COLORS.muted }}
              >
                {chat.lastMessage || ''}
              </p>
            </div>

            {unread && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{ background: COLORS.accent, color: '#06110E', minWidth: 18, textAlign: 'center' }}
              >
                {chat.myUnread}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
