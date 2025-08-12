// auth.js - ensure user profile doc + auth listener (no redirects)
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";

// Ensure users/{uid} exists with displayName/email/sortKey
async function ensureUserDoc(user){
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const displayName = user.displayName || user.email || "User";
  const email = user.email || "";
  const sortKey = (displayName || "").toLowerCase();
  if (!snap.exists()) {
    await setDoc(ref, { displayName, email, sortKey, createdAt: serverTimestamp() });
  } else {
    const data = snap.data() || {};
    const patch = {};
    if (!data.displayName && displayName) patch.displayName = displayName;
    if (!data.email && email) patch.email = email;
    if (!data.sortKey) patch.sortKey = sortKey;
    if (Object.keys(patch).length) await updateDoc(ref, patch);
  }
}

onAuthStateChanged(auth, async (user) => {
  // Only handle login page UI here; index UI is handled by app.js
  const signedInBox = document.getElementById('signedInBox');
  const loginForm = document.getElementById('loginForm');
  const loggedInAs = document.getElementById('loggedInAs');

  if (user) {
    try { await ensureUserDoc(user); } catch {}
    if (loggedInAs) loggedInAs.textContent = user.displayName || user.email || 'User';
    if (signedInBox) signedInBox.style.display = '';
    if (loginForm) loginForm.style.display = 'none';
  } else {
    if (signedInBox) signedInBox.style.display = 'none';
    if (loginForm) loginForm.style.display = '';
  }
});

// Sign out button on login page (optional)
document.getElementById('logoutHereBtn')?.addEventListener('click', async (e)=>{
  e.preventDefault();
  try { await signOut(auth); } catch {}
});