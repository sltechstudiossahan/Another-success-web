/**
 * chatEngine.js
 *
 * Firestore-backed real-time messaging core. Framework-agnostic — used
 * by ChatWindow.jsx and ChatList.jsx, but plain functions so you can
 * call them from anywhere (push notification handlers, etc).
 *
 * Schema:
 *   chats/{chatId}
 *     participants: [uidA, uidB]          (sorted, joined with '_' as id)
 *     lastMessage: string
 *     lastMessageType: 'text'|'voice'|'poll'|'location'|'image'
 *     lastMessageAt: Timestamp
 *     unreadCount: { [uid]: number }
 *
 *   chats/{chatId}/messages/{messageId}
 *     senderId: string
 *     type: 'text'|'voice'|'poll'|'location'|'image'
 *     text: string | null
 *     mediaURL: string | null            (voice notes, images)
 *     mediaDurationSec: number | null    (voice notes)
 *     poll: { question, options: [{id, text, votes: [uid]}] } | null
 *     location: { lat, lng, isLive, expiresAt } | null
 *     status: 'sent' | 'delivered' | 'read'
 *     createdAt: Timestamp
 *
 *   typingStatus/{chatId}
 *     [uid]: Timestamp   -- presence of a recent timestamp = "typing now"
 */

import {
  collection, doc, addDoc, setDoc, updateDoc, deleteField,
  query, orderBy, limit, onSnapshot, serverTimestamp, increment,
  where, getDocs, writeBatch,
} from 'firebase/firestore';
import { db as dbInstance } from './firebase';

const TYPING_TTL_MS = 5000; // a typing timestamp older than this is treated as "stopped"

function db() {
  return dbInstance;
}

/** Deterministic chat id for a 1:1 conversation — no lookup needed. */
export function getChatId(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

/** Ensures the chat document exists before the first message is sent. */
async function ensureChatDoc(chatId, uidA, uidB) {
  await setDoc(
    doc(db(), 'chats', chatId),
    {
      participants: [uidA, uidB].sort(),
      unreadCount: { [uidA]: 0, [uidB]: 0 },
    },
    { merge: true }
  );
}

/**
 * Sends a message of any type. For voice/image messages, upload the
 * media first (see voiceNotes.js) and pass the resulting mediaURL here.
 */
export async function sendMessage({ fromUid, toUid, type = 'text', text = null, mediaURL = null, mediaDurationSec = null, poll = null, location = null }) {
  const chatId = getChatId(fromUid, toUid);
  await ensureChatDoc(chatId, fromUid, toUid);

  const messagesRef = collection(db(), 'chats', chatId, 'messages');
  await addDoc(messagesRef, {
    senderId: fromUid,
    type,
    text,
    mediaURL,
    mediaDurationSec,
    poll,
    location,
    status: 'sent',
    createdAt: serverTimestamp(),
  });

  const previewText =
    type === 'text' ? text :
    type === 'voice' ? '🎤 Voice message' :
    type === 'poll' ? `📊 ${poll?.question || 'Poll'}` :
    type === 'location' ? '📍 Location' :
    type === 'image' ? '📷 Photo' : 'Message';

  await updateDoc(doc(db(), 'chats', chatId), {
    lastMessage: previewText,
    lastMessageType: type,
    lastMessageAt: serverTimestamp(),
    [`unreadCount.${toUid}`]: increment(1),
  });

  return chatId;
}

/** Real-time listener for a conversation's messages, newest last. */
export function listenToMessages(chatId, callback, messageLimit = 50) {
  const q = query(
    collection(db(), 'chats', chatId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(messageLimit)
  );

  return onSnapshot(q, (snap) => {
    const messages = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .reverse(); // oldest first for rendering
    callback(messages);
  });
}

/** Real-time listener for a user's chat list, most recent first. */
export function listenToChatList(uid, callback) {
  const q = query(
    collection(db(), 'chats'),
    where('participants', 'array-contains', uid),
    orderBy('lastMessageAt', 'desc')
  );

  return onSnapshot(q, (snap) => {
    const chats = snap.docs.map((d) => {
      const data = d.data();
      const peerUid = data.participants.find((p) => p !== uid);
      return { id: d.id, peerUid, ...data, myUnread: data.unreadCount?.[uid] || 0 };
    });
    callback(chats);
  });
}

/** Marks all unread messages in a chat as read and zeroes the badge. */
export async function markChatRead(chatId, uid) {
  await updateDoc(doc(db(), 'chats', chatId), {
    [`unreadCount.${uid}`]: 0,
  });

  // Best-effort: flip recent unread messages from this peer to 'read'.
  const messagesRef = collection(db(), 'chats', chatId, 'messages');
  const q = query(messagesRef, where('status', '!=', 'read'), limit(50));
  const snap = await getDocs(q);

  const batch = writeBatch(db());
  snap.docs.forEach((d) => {
    if (d.data().senderId !== uid) {
      batch.update(d.ref, { status: 'read' });
    }
  });
  await batch.commit();
}

/** Call on every keystroke (debounce ~300ms in the UI layer). */
export async function setTypingStatus(chatId, uid, isTyping) {
  const ref = doc(db(), 'typingStatus', chatId);
  await setDoc(
    ref,
    { [uid]: isTyping ? serverTimestamp() : deleteField() },
    { merge: true }
  );
}

/** Listener for whether the peer is currently typing. */
export function listenToTyping(chatId, peerUid, callback) {
  return onSnapshot(doc(db(), 'typingStatus', chatId), (snap) => {
    const data = snap.data();
    const ts = data?.[peerUid];
    if (!ts) return callback(false);
    const isRecent = Date.now() - ts.toMillis() < TYPING_TTL_MS;
    callback(isRecent);
  });
}
