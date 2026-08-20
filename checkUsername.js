/**
 * functions/checkUsername.js
 * Simple uniqueness check backing the debounced username field in
 * ProfileSetup.jsx. Reads only — actual reservation happens as part of
 * the profile write in ProfileSetup (add a Firestore transaction there
 * if you want to fully prevent race-condition double-claims at scale).
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();

exports.checkUsernameAvailability = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }

  const { username } = data;
  if (!username || !/^[a-z0-9_]{3,20}$/.test(username)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid username format.');
  }

  const db = admin.firestore();
  const existing = await db.collection('users').where('username', '==', username).limit(1).get();

  const takenByOther = !existing.empty && existing.docs[0].id !== context.auth.uid;
  return { available: !takenByOther };
});
