# Verido — Web

Firebase-backed messenger with mandatory NIC identity verification.
Everything built so far: email/password auth, live NIC capture + OCR,
profile setup, real-time chat engine with typing indicators and read
receipts, and the "show NIC to unknown senders" anti-scam display.

## 1. Install

```bash
npm install
cd functions && npm install && cd ..
```

## 2. Enable required Firebase/GCP services

In the [Firebase console](https://console.firebase.google.com/project/src-competion-web):

- **Authentication** → Sign-in method → enable **Email/Password**
- **Firestore Database** → create database (production mode)
- **Storage** → get started (used for profile photos)
- **Cloud Functions** → requires the Blaze (pay-as-you-go) plan
- In [Google Cloud Console](https://console.cloud.google.com/apis/library/vision.googleapis.com)
  for the same project, enable the **Cloud Vision API** (used for NIC OCR)

## 3. Deploy rules and functions

```bash
npx firebase-tools login
npx firebase-tools use src-competion-web
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage,functions
```

## 4. Run the app locally

```bash
npm run dev
```

Opens at `http://localhost:5173`. Note: `getUserMedia` (camera access for
NIC capture) requires HTTPS or `localhost` — it will not work over plain
HTTP on a LAN IP, so test on `localhost` or deploy to Hosting for device
testing.

## 5. Deploy the frontend (optional, once you're ready)

```bash
npm run build
npx firebase-tools deploy --only hosting
```

## What's wired up

| Screen | File | Flow position |
|---|---|---|
| Sign up / sign in | `src/Auth.jsx` | 1st |
| NIC capture + OCR | `src/NicVerificationCapture.jsx` | 2nd (new users) |
| Profile setup | `src/ProfileSetup.jsx` | 3rd (new users) |
| Chat list | `src/ChatList.jsx` | Home screen |
| Conversation | `src/ChatWindow.jsx` + `src/ChatIdentityHeader.jsx` | Opened from chat list |

`src/App.jsx` is the router — it checks `users/{uid}.nicVerified` and
`.profileCompletedAt` on every sign-in to send returning users straight to
the chat list instead of repeating onboarding.

## Still to build

- Bilingual (Sinhala/English) voice typing
- Voice note recording/sending
- Polls
- Live location sharing
- Real contacts sync (the app currently uses an empty `contactsMap`
  placeholder in `App.jsx` — wire this to your phone-number contact
  matching logic so the NIC-vs-profile display actually reflects real
  saved contacts)

## Before this goes live

1. **NIC retention policy** — you're storing government ID numbers and
   legal names. Decide and document what happens to `nicVerifications/{uid}`
   when an account is deleted.
2. **Rate limiting** — `extractNicFields` calls a billed Google API with no
   per-user cap right now. Add a Firestore-based attempt counter before
   opening this up publicly.
3. **One-NIC-per-account** — currently enforced (a NIC can't verify a
   second account). Confirm that's the policy you want.
