// auth.js - handles signup.html and login.html
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-analytics.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getStorage, ref as sref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";

// Firebase config (same as provided)
const firebaseConfig = {
  apiKey: "AIzaSyCBeMA39E2tltkqlC0p0DUQ_ldYJ_m7XIw",
  authDomain: "friend-chat-4c4ff.firebaseapp.com",
  projectId: "friend-chat-4c4ff",
  storageBucket: "friend-chat-4c4ff.firebasestorage.app",
  messagingSenderId: "963032618050",
  appId: "1:963032618050:web:7320656faeae6ebeef09db",
  measurementId: "G-4L6KM4Q8QE"
};
const app = initializeApp(firebaseConfig); try{ getAnalytics(app); }catch(e){};
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Determine page
const isSignup = location.pathname.endsWith('signup.html');
if(isSignup){
  const displayNameEl = document.getElementById('displayName');
  const emailEl = document.getElementById('email');
  const passEl = document.getElementById('password');
  const avatarFile = document.getElementById('avatarFile');
  const signupBtn = document.getElementById('signupBtn');

  signupBtn.addEventListener('click', async ()=>{
    try{
      signupBtn.disabled = true; signupBtn.textContent='Creating...';
      const cred = await createUserWithEmailAndPassword(auth, emailEl.value, passEl.value);
      let photoURL = '';
      if(avatarFile.files && avatarFile.files[0]){
        const f = avatarFile.files[0];
        const storageRef = sref(storage, `avatars/${cred.user.uid}_${Date.now()}_${f.name}`);
        await uploadBytes(storageRef, f);
        photoURL = await getDownloadURL(storageRef);
      }
      await updateProfile(cred.user, { displayName: displayNameEl.value || emailEl.value, photoURL: photoURL || null });
      // create user doc
      await setDoc(doc(db,'users',cred.user.uid), { displayName: displayNameEl.value||'', email: emailEl.value, photoURL: photoURL||'', isBanned:false });
      alert('Account created! Redirecting to chat...');
      location.href = 'index.html';
    }catch(e){ console.error(e); alert('Signup error: '+(e.message||e.code)); }
    finally{ signupBtn.disabled = false; signupBtn.textContent='Sign Up'; }
  });
} else {
  const emailEl = document.getElementById('email');
  const passEl = document.getElementById('password');
  const loginBtn = document.getElementById('loginBtn');
  loginBtn.addEventListener('click', async ()=>{
    try{ await signInWithEmailAndPassword(auth, emailEl.value, passEl.value); location.href='index.html'; }
    catch(e){ console.error(e); alert('Login error: '+(e.message||e.code)); }
  });
}
