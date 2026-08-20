/**
 * functions/verifyNic.js
 *
 * Two callable functions:
 *   1. extractNicFields   - runs OCR on a captured frame, returns parsed
 *                            fields to the client for confirmation. The
 *                            image buffer is only ever held in memory for
 *                            the duration of this request and is never
 *                            written to disk or Storage.
 *   2. confirmNicVerification - the client calls this AFTER the user
 *                            confirms the extracted fields are correct.
 *                            Only this step writes to Firestore.
 *
 * Requires: firebase-admin, @google-cloud/vision
 *   npm install @google-cloud/vision
 *
 * Deploy with a service account that has Cloud Vision API access.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const vision = require('@google-cloud/vision');
const { parseNicText } = require('./nicParser');

if (!admin.apps.length) admin.initializeApp();

const visionClient = new vision.ImageAnnotatorClient();
const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6MB safety cap

exports.extractNicFields = functions
  .runWith({ timeoutSeconds: 30, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be signed in to verify your NIC.'
      );
    }

    const { imageBase64 } = data;
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'imageBase64 is required.'
      );
    }

    const buffer = Buffer.from(
      imageBase64.replace(/^data:image\/\w+;base64,/, ''),
      'base64'
    );

    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Image is too large.'
      );
    }

    let ocrResult;
    try {
      // buffer lives only in this function's memory — nothing is written
      // to Cloud Storage or Firestore at this stage.
      [ocrResult] = await visionClient.textDetection({ image: { content: buffer } });
    } catch (err) {
      console.error('Vision API error', err);
      throw new functions.https.HttpsError(
        'internal',
        'OCR provider failed. Please try again.'
      );
    }

    const rawText = ocrResult.fullTextAnnotation?.text || '';
    const parsed = parseNicText(rawText);

    if (!parsed) {
      throw new functions.https.HttpsError(
        'not-found',
        'Could not detect a valid NIC number. Make sure the whole card is visible, well lit, and glare-free, then try again.'
      );
    }

    // Nothing persisted yet — return to client for user confirmation.
    return parsed;
  });

exports.confirmNicVerification = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }

  const uid = context.auth.uid;
  const { nicNumber, fullName, dob, sex } = data;

  if (!nicNumber || !/^(\d{9}[VXvx]|\d{12})$/.test(nicNumber)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid NIC number format.');
  }
  if (!fullName || fullName.trim().length < 2) {
    throw new functions.https.HttpsError('invalid-argument', 'A confirmed full name is required.');
  }

  const db = admin.firestore();

  // Reject duplicate NIC numbers tied to a different account.
  const dupeCheck = await db
    .collection('nicVerifications')
    .where('nicNumber', '==', nicNumber)
    .limit(1)
    .get();

  if (!dupeCheck.empty && dupeCheck.docs[0].id !== uid) {
    throw new functions.https.HttpsError(
      'already-exists',
      'This NIC is already registered to another account.'
    );
  }

  const record = {
    nicNumber,
    fullName: fullName.trim(),
    dob: dob || null,
    sex: sex || null,
    verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // nicVerifications/{uid} — the doc read by other users when they message
  // someone not yet in their contacts (see firestore.rules).
  await db.collection('nicVerifications').doc(uid).set(record, { merge: true });

  // Mirror a flag onto the user's profile doc for quick reads in the app.
  await db.collection('users').doc(uid).set(
    { nicVerified: true, nicVerifiedAt: record.verifiedAt },
    { merge: true }
  );

  return { success: true };
});
