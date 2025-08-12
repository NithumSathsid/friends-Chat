import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// Check if current page is an auth page
const isAuthPage = window.location.pathname.includes('login.html') || 
                  window.location.pathname.includes('signup.html');

onAuthStateChanged(auth, async (user) => {
  if (user) {
    // User is signed in
    if (isAuthPage) {
      // User is logged in and on an auth page - redirect to main app
      window.location.replace('index.html');
    }
  } else {
    // No user is signed in
    if (!isAuthPage && !window.location.pathname.includes('index.html')) {
      // Not on an auth page - redirect to login
      window.location.replace('login.html');
    }
  }
});