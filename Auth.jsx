import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

const COLORS = {
  bg: '#0D1117',
  panel: '#171D26',
  accent: '#37E6C4',
  text: '#EAEDF1',
  muted: '#7C8798',
  danger: '#E8607A',
  border: '#2A3340',
};

export default function Auth({ onAuthed }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (mode === 'register' && password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'register') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await setDoc(doc(db, 'users', cred.user.uid), {
          email: email.trim(),
          nicVerified: false,
          profileCompletedAt: null,
          createdAt: serverTimestamp(),
        });
        onAuthed(cred.user);
      } else {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        onAuthed(cred.user);
      }
    } catch (err) {
      setError(friendlyAuthError(err.code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="w-full max-w-md mx-auto rounded-2xl overflow-hidden px-6 py-8"
      style={{ background: COLORS.bg, color: COLORS.text, fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <p
        className="text-xs tracking-[0.2em] uppercase"
        style={{ color: COLORS.accent, fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
      >
        Verido
      </p>
      <h1 className="text-xl font-semibold mt-1">
        {mode === 'login' ? 'Welcome back' : 'Create your account'}
      </h1>
      <p className="text-sm mt-1 mb-6" style={{ color: COLORS.muted }}>
        {mode === 'login'
          ? 'Sign in to continue.'
          : "You'll verify your NIC and build your profile right after this."}
      </p>

      <form onSubmit={handleSubmit}>
        <label className="block mb-3">
          <span className="text-xs" style={{ color: COLORS.muted }}>Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mt-1 px-3 py-2.5 rounded-lg text-sm bg-transparent outline-none"
            style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
          />
        </label>

        <label className="block mb-3">
          <span className="text-xs" style={{ color: COLORS.muted }}>Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mt-1 px-3 py-2.5 rounded-lg text-sm bg-transparent outline-none"
            style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
          />
        </label>

        {mode === 'register' && (
          <label className="block mb-3">
            <span className="text-xs" style={{ color: COLORS.muted }}>Confirm password</span>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full mt-1 px-3 py-2.5 rounded-lg text-sm bg-transparent outline-none"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
            />
          </label>
        )}

        {error && <p className="text-xs mb-3" style={{ color: COLORS.danger }}>{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full py-2.5 rounded-full text-sm font-medium disabled:opacity-50 mt-2"
          style={{ background: COLORS.accent, color: '#06110E' }}
        >
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button
        onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
        className="w-full text-center text-xs mt-5 underline"
        style={{ color: COLORS.muted }}
      >
        {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
      </button>
    </div>
  );
}

function friendlyAuthError(code) {
  switch (code) {
    case 'auth/email-already-in-use': return 'An account with this email already exists.';
    case 'auth/invalid-email': return 'That email address looks invalid.';
    case 'auth/weak-password': return 'Password is too weak.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Incorrect email or password.';
    case 'auth/too-many-requests': return 'Too many attempts. Please wait and try again.';
    default: return 'Something went wrong. Please try again.';
  }
}
