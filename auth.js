/* auth.js - auth listener + redirect */
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { auth } from "./firebase.js";

onAuthStateChanged(auth, (user) => {
  const path = location.pathname.split('/').pop();
  if (user) {
    if (path === 'login.html' || path === 'signup.html' || path === '') {
      if (path !== 'index.html') location.href = 'index.html';
    }
  } else {
    if (path === 'index.html' || path === '') location.href = 'login.html';
  }
});

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    // Keep lastChat (WhatsApp-style) â€” do not clear it here.
    await signOut(auth);
    location.href = 'login.html';
  });
}
