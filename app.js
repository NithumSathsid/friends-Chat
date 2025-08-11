import { auth, db, storage } from "./firebase.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, limit, setDoc, doc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { ref as sref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";

const createRoomBtn = document.getElementById('createRoomBtn');
const newRoomName = document.getElementById('newRoomName');
const roomsListEl = document.getElementById('roomsList');
const usersListEl = document.getElementById('usersList');
const chatTitle = document.getElementById('chatTitle');
const messagesEl = document.getElementById('messages');
const sendForm = document.getElementById('sendForm');
const txt = document.getElementById('txt');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const logoutBtn = document.getElementById('logoutBtn');
const userNameEl = document.getElementById('userName');
const authNotice = document.getElementById('authNotice');

let currentRoomId = null;
let currentUser = null;
let messagesUnsub = null;

const coll = (dbRef, name) => collection(dbRef, name);

// rooms listener
const roomsQuery = query(collection(db,'rooms'), orderBy('createdAt'));
onSnapshot(roomsQuery, snap=>{
  roomsListEl.innerHTML='';
  snap.forEach(docSnap=>{
    const r = docSnap.data();
    const el = document.createElement('div');
    el.className='room-item';
    el.textContent = r.name || 'Room';
    el.dataset.roomId = docSnap.id;
    el.addEventListener('click', ()=> joinRoom(docSnap.id, r.name));
    roomsListEl.appendChild(el);
  });
});

createRoomBtn.addEventListener('click', async ()=>{
  const name = (newRoomName.value||'').trim();
  if(!name) return alert('Room name required');
  await addDoc(collection(db,'rooms'), { name, createdAt: serverTimestamp() });
  newRoomName.value = '';
});

function joinRoom(id, name){
  if(messagesUnsub) messagesUnsub();
  currentRoomId = id;
  chatTitle.textContent = name;
  messagesEl.innerHTML = '';
  const mq = query(collection(db,'messages'), where('roomId','==',id), orderBy('createdAt'), limit(500));
  messagesUnsub = onSnapshot(mq, snap=>{
    messagesEl.innerHTML='';
    snap.forEach(d=>{
      const m = d.data();
      const div = document.createElement('div');
      div.className = 'message-row';
      const b = document.createElement('div');
      b.className = 'msg ' + (m.uid === currentUser?.uid? 'me':'other');
      b.innerHTML = `<div style="font-weight:600">${escapeHtml(m.name||'Anon')}</div><div>${escapeHtml(m.text||'')}</div><div class="meta">${(m.createdAt && m.createdAt.toDate)? timeAgo(m.createdAt.toDate()):''}</div>`;
      div.appendChild(b);
      messagesEl.appendChild(div);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
  if(currentUser){ sendForm.style.display='flex'; authNotice.style.display='none'; } else { sendForm.style.display='none'; authNotice.style.display='block'; }
}

attachBtn.addEventListener('click', ()=> fileInput.click());
fileInput.addEventListener('change', ()=>{});

sendForm.addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  if(!currentUser) return alert('Please log in');
  if(!currentRoomId) return alert('Select a room');
  const text = txt.value.trim();
  const file = fileInput.files && fileInput.files[0];
  let attachmentUrl = '';
  if(file){
    const ref = sref(storage, `attachments/${currentRoomId}/${Date.now()}_${file.name}`);
    await uploadBytes(ref, file);
    attachmentUrl = await getDownloadURL(ref);
  }
  await addDoc(collection(db,'messages'), { uid: currentUser.uid, name: currentUser.displayName||currentUser.email||'Anon', text:text||'', roomId: currentRoomId, createdAt: serverTimestamp(), attachmentUrl: attachmentUrl||'' });
  txt.value = '';
  fileInput.value = '';
});

onAuthStateChanged(auth, async user=>{
  currentUser = user;
  if(user){
    userNameEl.textContent = user.displayName || user.email;
    logoutBtn.style.display = 'inline-block';
    await setDoc(doc(db,'users',user.uid), { displayName: user.displayName||'', email: user.email||'', lastSeen: serverTimestamp() }, { merge:true });
  } else {
    userNameEl.textContent = '';
    logoutBtn.style.display = 'none';
  }
});

logoutBtn.addEventListener('click', async ()=>{ await signOut(auth); location.href='login.html'; });

function timeAgo(d){ const s=Math.floor((Date.now()-d.getTime())/1000); if(s<60) return `${s}s`; const m=Math.floor(s/60); if(m<60) return `${m}m`; const h=Math.floor(m/60); if(h<24) return `${h}h`; const days=Math.floor(h/24); return `${days}d` }
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
