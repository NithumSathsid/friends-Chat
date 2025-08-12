/* firebase.js - Firebase config + Firestore long-poll optimization */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";

// Fill with your Firebase project settings
const firebaseConfig = {
  apiKey: "AIzaSyCBeMA39E2tltkqlC0p0DUQ_ldYJ_m7XIw",
  authDomain: "friend-chat-4c4ff.firebaseapp.com",
  projectId: "friend-chat-4c4ff",
  storageBucket: "friend-chat-4c4ff.firebasestorage.app",
  messagingSenderId: "963032618050",
  appId: "1:963032618050:web:7320656faeae6ebeef09db",
  measurementId: "G-4L6KM4Q8QE"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Reduce latency on some networks
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false
});

export const storage = getStorage(app);