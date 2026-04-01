import { initializeApp } from "./firebase/firebase-app.js";
import { getFirestore } from "./firebase/firebase-firestore.js";

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