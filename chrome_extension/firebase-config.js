import { initializeApp } from "./firebase/firebase-app.js";
import { getFirestore } from "./firebase/firebase-firestore.js";
// ⚠️ TODO before org mode: update this config to hate-speech-monitor-7c0ba.
// Current values are from old Firebase project and will break auth/org flows.
// Public X MVP currently uses backend-only saving, so this file is deferred.

const firebaseConfig = {
  apiKey: "YOUR_KEY",
  authDomain: "anti-hate-reporting.firebaseapp.com",
  projectId: "anti-hate-reporting",
  storageBucket: "anti-hate-reporting.appspot.com",
  messagingSenderId: "XXXX",
  appId: "XXXX"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);