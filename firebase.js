import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCaMdPoVqGflbBhWhsuV4L2duqiASIbP64",
  authDomain: "src-competion-web.firebaseapp.com",
  projectId: "src-competion-web",
  storageBucket: "src-competion-web.firebasestorage.app",
  messagingSenderId: "568183938397",
  appId: "1:568183938397:web:02d16665d7bd393d505cb4",
  measurementId: "G-C0YQX47SR5"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functionsInstance = getFunctions(app);
