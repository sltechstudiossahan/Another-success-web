import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

import Auth from './Auth';
import NicVerificationCapture from './NicVerificationCapture';
import ProfileSetup from './ProfileSetup';
import ChatList from './ChatList';
import ChatWindow from './ChatWindow';

const COLORS = { bg: '#0D1117', text: '#EAEDF1', muted: '#7C8798' };

/**
 * Screen flow:
 *   auth -> nicVerify -> profileSetup -> chatList <-> chatWindow
 *
 * On every load, once a user is signed in we check their `users/{uid}`
 * doc to figure out which step they've already completed, so returning
 * users skip straight to the chat list instead of re-doing onboarding.
 */
export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking, null = signed out
  const [userDoc, setUserDoc] = useState(null);
  const [screen, setScreen] = useState('auth');
  const [activePeerUid, setActivePeerUid] = useState(null);

  // TODO: replace with your real contacts sync (phone-number match).
  // Placeholder so ChatList/ChatWindow have something to key off of.
  const [contactsMap] = useState({});

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (!fbUser) {
        setScreen('auth');
        return;
      }

      const snap = await getDoc(doc(db, 'users', fbUser.uid));
      const data = snap.exists() ? snap.data() : {};
      setUserDoc(data);

      if (!data.nicVerified) setScreen('nicVerify');
      else if (!data.profileCompletedAt) setScreen('profileSetup');
      else setScreen('chatList');
    });
    return unsub;
  }, []);

  if (user === undefined) {
    return (
      <Centered>
        <p style={{ color: COLORS.muted }}>Loading…</p>
      </Centered>
    );
  }

  if (screen === 'auth') {
    return (
      <Centered>
        <Auth onAuthed={() => { /* onAuthStateChanged picks this up */ }} />
      </Centered>
    );
  }

  if (screen === 'nicVerify') {
    return (
      <Centered>
        <NicVerificationCapture onVerified={() => setScreen('profileSetup')} />
      </Centered>
    );
  }

  if (screen === 'profileSetup') {
    return (
      <Centered>
        <ProfileSetup
          verifiedName={userDoc?.fullName}
          onComplete={() => setScreen('chatList')}
        />
      </Centered>
    );
  }

  if (screen === 'chatWindow' && activePeerUid) {
    return (
      <div style={{ height: '100dvh' }}>
        <div className="flex items-center gap-2 px-3 py-2" style={{ background: '#171D26' }}>
          <button
            onClick={() => { setScreen('chatList'); setActivePeerUid(null); }}
            className="text-sm"
            style={{ color: COLORS.text }}
          >
            ← Back
          </button>
        </div>
        <div style={{ height: 'calc(100dvh - 40px)' }}>
          <ChatWindow
            myUid={user.uid}
            peerUid={activePeerUid}
            isContact={!!contactsMap[activePeerUid]}
          />
        </div>
      </div>
    );
  }

  // chatList (default authenticated screen)
  return (
    <div style={{ height: '100dvh' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ background: '#171D26' }}>
        <p className="text-sm font-semibold" style={{ color: COLORS.text }}>Verido</p>
        <button onClick={() => signOut(auth)} className="text-xs" style={{ color: COLORS.muted }}>
          Sign out
        </button>
      </div>
      <ChatList
        myUid={user.uid}
        contactsMap={contactsMap}
        onOpenChat={(peerUid) => { setActivePeerUid(peerUid); setScreen('chatWindow'); }}
      />
    </div>
  );
}

function Centered({ children }) {
  return (
    <div
      className="flex items-center justify-center px-4"
      style={{ minHeight: '100dvh', background: COLORS.bg }}
    >
      {children}
    </div>
  );
}
