import React, { useState, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, storage, functionsInstance } from './firebase';

/**
 * ProfileSetup
 *
 * Runs immediately after NIC verification. This is the identity the
 * user's contacts will actually see once they've saved the number —
 * separate from the legal name/NIC pulled from the ID card.
 *
 * Note: this screen's photo upload is a normal file/camera picker
 * (NOT the live-only capture used for NIC/selfie steps) since a
 * profile photo isn't an anti-fraud checkpoint.
 */

const COLORS = {
  bg: '#10141B',
  panel: '#171D26',
  accent: '#37E6C4',
  text: '#EAEDF1',
  muted: '#7C8798',
  danger: '#E8607A',
  border: '#2A3340',
};

const MAX_BIO_LEN = 140;

export default function ProfileSetup({ verifiedName, onComplete }) {
  const [displayName, setDisplayName] = useState(verifiedName || '');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [usernameStatus, setUsernameStatus] = useState('idle'); // idle | checking | available | taken
  const fileInputRef = useRef(null);
  const debounceRef = useRef(null);

  const handlePhotoPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Photo must be under 8MB.');
      return;
    }
    setError('');
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const checkUsername = (value) => {
    setUsername(value);
    setUsernameStatus('idle');
    clearTimeout(debounceRef.current);
    if (!value || value.length < 3) return;

    debounceRef.current = setTimeout(async () => {
      setUsernameStatus('checking');
      try {
        const checkUsernameAvailability = httpsCallable(functionsInstance, 'checkUsernameAvailability');
        const { data } = await checkUsernameAvailability({ username: value });
        setUsernameStatus(data.available ? 'available' : 'taken');
      } catch {
        setUsernameStatus('idle');
      }
    }, 400);
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      setError('Display name is required.');
      return;
    }
    if (username && usernameStatus === 'taken') {
      setError('That username is already taken.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const uid = auth.currentUser.uid;

      let photoURL = null;
      if (photoFile) {
        const photoRef = ref(storage, `profilePhotos/${uid}/${Date.now()}_${photoFile.name}`);
        await uploadBytes(photoRef, photoFile);
        photoURL = await getDownloadURL(photoRef);
      }

      await setDoc(
        doc(db, 'users', uid),
        {
          displayName: displayName.trim(),
          username: username.trim() || null,
          bio: bio.trim(),
          photoURL,
          profileCompletedAt: serverTimestamp(),
        },
        { merge: true }
      );

      onComplete?.({ displayName, username, bio, photoURL });
    } catch (err) {
      setError(err.message || 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="w-full max-w-md mx-auto rounded-2xl overflow-hidden px-5 py-5"
      style={{ background: COLORS.bg, color: COLORS.text, fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <p
        className="text-xs tracking-[0.2em] uppercase"
        style={{ color: COLORS.accent, fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
      >
        Set up your profile
      </p>
      <h2 className="text-lg font-semibold mt-1">This is what your contacts see</h2>
      <p className="text-sm mt-1" style={{ color: COLORS.muted }}>
        Separate from your verified legal name — this is your public identity once
        someone saves your number.
      </p>

      {/* Photo picker */}
      <div className="flex justify-center my-5">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden"
          style={{ background: COLORS.panel, border: `2px dashed ${COLORS.border}` }}
        >
          {photoPreview ? (
            <img src={photoPreview} alt="Profile preview" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs text-center px-2" style={{ color: COLORS.muted }}>
              Add photo
            </span>
          )}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoPick} className="hidden" />
      </div>

      <label className="block mb-3">
        <span className="text-xs" style={{ color: COLORS.muted }}>Display name</span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={40}
          className="w-full mt-1 px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
          style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
        />
      </label>

      <label className="block mb-3">
        <span className="text-xs" style={{ color: COLORS.muted }}>Username (optional)</span>
        <div className="relative">
          <input
            value={username}
            onChange={(e) => checkUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            maxLength={20}
            placeholder="e.g. dilanp"
            className="w-full mt-1 px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
            style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
          />
          {usernameStatus !== 'idle' && (
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
              style={{
                color:
                  usernameStatus === 'available' ? COLORS.accent :
                  usernameStatus === 'taken' ? COLORS.danger : COLORS.muted,
              }}
            >
              {usernameStatus === 'checking' && 'checking…'}
              {usernameStatus === 'available' && 'available'}
              {usernameStatus === 'taken' && 'taken'}
            </span>
          )}
        </div>
      </label>

      <label className="block mb-4">
        <span className="text-xs" style={{ color: COLORS.muted }}>
          Bio ({bio.length}/{MAX_BIO_LEN})
        </span>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO_LEN))}
          rows={3}
          className="w-full mt-1 px-3 py-2 rounded-lg text-sm bg-transparent outline-none resize-none"
          style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
        />
      </label>

      {error && (
        <p className="text-xs mb-3" style={{ color: COLORS.danger }}>{error}</p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2.5 rounded-full text-sm font-medium disabled:opacity-50"
        style={{ background: COLORS.accent, color: '#06110E' }}
      >
        {saving ? 'Saving…' : 'Finish setup'}
      </button>
    </div>
  );
}
