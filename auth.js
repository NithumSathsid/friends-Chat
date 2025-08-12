// auth.js - safe auth listener & redirect
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { auth } from "./firebase.js";

onAuthStateChanged(auth, (user) => {
  const path = location.pathname.split('/').pop() || 'index.html';
  console.log('onAuthStateChanged:', user?.uid, 'path:', path);

  if (user) {
    // if on login/signup send to index
    if (path === 'login.html' || path === 'signup.html' || path === '') {
      location.href = 'index.html';
    }
  } else {
    // if unauthenticated and on index, force login
    if (path === 'index.html' || path === '') {
      // only redirect if explicitly on index — don't hijack other pages during debugging
      location.href = 'login.html';
    }
  }
});
