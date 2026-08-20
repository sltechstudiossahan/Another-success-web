import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

/**
 * ChatIdentityHeader
 *
 * Sits at the top of a conversation. If the other person is in the
 * signed-in user's contacts, it shows their chosen profile (photo,
 * display name, bio). If not, it shows their verified NIC identity
 * instead — this is the core anti-scam mechanism: a stranger can't
 * hide behind a fake profile photo and display name.
 *
 * `isContact` should come from your existing contacts lookup (phone
 * number matched against the user's saved contacts). This component
 * doesn't decide that — it just renders based on it.
 */

const COLORS = {
  bg: '#171D26',
  accent: '#37E6C4',
  warn: '#F2A94E',
  text: '#EAEDF1',
  muted: '#7C8798',
  border: '#2A3340',
};

export default function ChatIdentityHeader({ peerUid, isContact }) {
  const [profile, setProfile] = useState(null);
  const [nicInfo, setNicInfo] = useState(null);

  useEffect(() => {
    const unsubProfile = onSnapshot(doc(db, 'users', peerUid), (snap) => {
      if (snap.exists()) setProfile(snap.data());
    });

    // Only fetch NIC details when needed — no point reading it for
    // saved contacts, keeps reads (and the data's visibility) minimal.
    let unsubNic = () => {};
    if (!isContact) {
      unsubNic = onSnapshot(doc(db, 'nicVerifications', peerUid), (snap) => {
        if (snap.exists()) setNicInfo(snap.data());
      });
    }

    return () => {
      unsubProfile();
      unsubNic();
    };
  }, [peerUid, isContact]);

  if (isContact) {
    return (
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ background: COLORS.bg, borderBottom: `1px solid ${COLORS.border}` }}
      >
        <Avatar url={profile?.photoURL} name={profile?.displayName} />
        <div>
          <p className="text-sm font-medium" style={{ color: COLORS.text }}>
            {profile?.displayName || 'Loading…'}
          </p>
          {profile?.bio && (
            <p className="text-xs" style={{ color: COLORS.muted }}>{profile.bio}</p>
          )}
        </div>
      </div>
    );
  }

  // Not a saved contact — this is the anti-scam view.
  return (
    <div style={{ background: COLORS.bg, borderBottom: `1px solid ${COLORS.border}` }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar url={null} name={nicInfo?.fullName} />
        <div className="flex-1 min-w-0">
          {nicInfo ? (
            <>
              <p className="text-sm font-medium" style={{ color: COLORS.text }}>
                {nicInfo.fullName}
              </p>
              <p
                className="text-xs"
                style={{ color: COLORS.accent, fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
              >
                NIC {nicInfo.nicNumber}
              </p>
            </>
          ) : (
            <p className="text-sm" style={{ color: COLORS.warn }}>
              Unverified sender — no confirmed identity on file
            </p>
          )}
        </div>
      </div>

      <div
        className="mx-4 mb-3 px-3 py-2 rounded-lg text-xs flex items-start gap-2"
        style={{ background: 'rgba(242,169,78,0.1)', color: COLORS.warn }}
      >
        <span>⚠</span>
        <span>
          {nicInfo
            ? "This person isn't in your contacts. We're showing their verified NIC identity instead of a profile photo or name they chose."
            : 'This account has not completed identity verification. Be cautious.'}
        </span>
      </div>
    </div>
  );
}

function Avatar({ url, name }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-sm font-medium"
      style={{ background: '#2A3340', color: COLORS.text }}
    >
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : initial}
    </div>
  );
}
