// Firebase + app logic (using v12 modular SDK)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-analytics.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, limit, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// === Your Firebase config (from you earlier) ===
const firebaseConfig = {
  apiKey: "AIzaSyCBeMA39E2tltkqlC0p0DUQ_ldYJ_m7XIw",
  authDomain: "friend-chat-4c4ff.firebaseapp.com",
  projectId: "friend-chat-4c4ff",
  storageBucket: "friend-chat-4c4ff.firebasestorage.app",
  messagingSenderId: "963032618050",
  appId: "1:963032618050:web:7320656faeae6ebeef09db",
  measurementId: "G-4L6KM4Q8QE"
};
const app = initializeApp(firebaseConfig);
try{ getAnalytics(app); }catch(e){ /* analytics optional */ }
const auth = getAuth(app);
const db = getFirestore(app);

// UI refs
const emailEl = document.getElementById('email');
const passEl = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userName = document.getElementById('userName');
const messagesEl = document.getElementById('messages');
const form = document.getElementById('sendForm');
const txt = document.getElementById('txt');
const usersList = document.getElementById('usersList');
const chatTitle = document.getElementById('chatTitle');

// device detection (simple)
function isMobile(){
  return /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent) || window.innerWidth < 801;
}
function applyLayout(){
  if(isMobile()){
    document.querySelector('.sidebar').style.display = 'none';
  } else {
    document.querySelector('.sidebar').style.display = 'flex';
  }
}
applyLayout();
window.addEventListener('resize', applyLayout);

// Auth handlers
signupBtn.addEventListener('click', async ()=>{
  try{
    await createUserWithEmailAndPassword(auth, emailEl.value, passEl.value);
    alert('Account created');
  }catch(e){ alert('Sign-up error: '+e.message); }
});
loginBtn.addEventListener('click', async ()=>{
  try{ await signInWithEmailAndPassword(auth, emailEl.value, passEl.value); }
  catch(e){ alert('Login error: '+e.message); }
});
logoutBtn.addEventListener('click', async ()=>{ await signOut(auth); });

onAuthStateChanged(auth, user=>{
  if(user){
    userName.textContent = user.email;
    document.getElementById('authBox').style.display='none';
    chatTitle.textContent = 'Friends Chat';
  } else {
    userName.textContent='';
    document.getElementById('authBox').style.display='flex';
  }
});

// Firestore realtime messages
const messagesCol = collection(db, 'messages');
const q = query(messagesCol, orderBy('createdAt'), limit(500));
onSnapshot(q, snap=>{
  messagesEl.innerHTML='';
  snap.forEach(doc=>{
    const m = doc.data();
    const div = document.createElement('div');
    div.className = 'msg ' + (m.uid === (auth.currentUser && auth.currentUser.uid) ? 'me' : 'other');
    const time = (m.createdAt && m.createdAt.toDate) ? timeAgo(m.createdAt.toDate()) : '';
    div.innerHTML = `<div class="text"><strong>${escapeHtml(m.name||'Anon')}</strong><div>${escapeHtml(m.text||'')}</div></div><div class="meta">${time}</div>`;
    messagesEl.appendChild(div);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
});

form.addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  const user = auth.currentUser;
  if(!user){ alert('Please log in'); return; }
  const text = txt.value.trim();
  if(!text) return;
  await addDoc(messagesCol, { uid: user.uid, name: user.email, text, createdAt: serverTimestamp() });
  txt.value='';
});

// simple user list: show last 10 unique senders from messages
function populateUsersFromSnapshot(snap){
  const users = new Map();
  snap.forEach(doc=>{ const d=doc.data(); if(d && d.uid) users.set(d.uid, d.name||d.email) });
  usersList.innerHTML='';
  users.forEach((name, uid)=>{
    const el = document.createElement('div');
    el.className='user-item';
    el.innerHTML = `<div class="u-name">${escapeHtml(name)}</div><div class="u-email">${escapeHtml(name)}</div>`;
    usersList.appendChild(el);
  });
}
// also subscribe for users in messages to fill list
onSnapshot(q, snap=> populateUsersFromSnapshot(snap));

function timeAgo(d){
  const s = Math.floor((Date.now()-d.getTime())/1000);
  if(s<60) return `${s}s`;
  const m = Math.floor(s/60); if(m<60) return `${m}m`;
  const h = Math.floor(m/60); if(h<24) return `${h}h`;
  const days = Math.floor(h/24); return `${days}d`;
}
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
