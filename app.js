import { auth, db, storage } from "./firebase.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, limit, setDoc, doc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { ref as sref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";

// UI refs
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

// Helper: escape
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function timeAgo(d){ const s=Math.floor((Date.now()-d.getTime())/1000); if(s<60) return `${s}s`; const m=Math.floor(s/60); if(m<60) return `${m}m`; const h=Math.floor(m/60); if(h<24) return `${h}h`; const days=Math.floor(h/24); return `${days}d` }

// Listen rooms (top-level 'rooms' collection)
const roomsQ = query(collection(db,'rooms'), orderBy('createdAt'));
onSnapshot(roomsQ, snap=>{
  roomsListEl.innerHTML='';
  snap.forEach(rdoc=>{
    const r = rdoc.data();
    const el = document.createElement('div');
    el.className='room-item';
    el.textContent = r.name || 'Room';
    el.dataset.roomId = rdoc.id;
    el.addEventListener('click', ()=> joinRoom(rdoc.id, r.name));
    roomsListEl.appendChild(el);
  });
});

createRoomBtn.addEventListener('click', async ()=>{
  const name = (newRoomName.value||'').trim();
  if(!name) return alert('Room name required');
  try{
    await addDoc(collection(db,'rooms'), { name, createdAt: serverTimestamp() });
    newRoomName.value='';
  }catch(e){ console.error('Create room failed', e); alert('Failed to create room'); }
});

// join a room: unsubscribe previous listener, subscribe to messages for this room
function joinRoom(roomId, roomName){
  if(messagesUnsub) messagesUnsub();
  currentRoomId = roomId;
  chatTitle.textContent = roomName || 'Room';
  messagesEl.innerHTML = '';
  messagesUnsub = onSnapshot(query(collection(db,'messages'), where('roomId','==',roomId), orderBy('createdAt')), snap=>{
    messagesEl.innerHTML='';
    snap.forEach(docSnap=>{
      const m = docSnap.data();
      const row = document.createElement('div');
      row.className = 'message-row';
      const bubble = document.createElement('div');
      bubble.className = 'msg ' + (m.uid === currentUser?.uid ? 'me' : 'other');
      const nameLine = document.createElement('div');
      nameLine.style.fontWeight='600';
      nameLine.textContent = m.name || 'Anon';
      const textLine = document.createElement('div');
      textLine.innerHTML = escapeHtml(m.text || '');
      const meta = document.createElement('div');
      meta.className='meta';
      meta.textContent = (m.createdAt && m.createdAt.toDate) ? timeAgo(m.createdAt.toDate()) : '';
      bubble.appendChild(nameLine);
      bubble.appendChild(textLine);
      if(m.attachmentUrl){
        const img = document.createElement('img');
        img.src = m.attachmentUrl;
        img.className = 'msg-attachment';
        bubble.appendChild(img);
      }
      bubble.appendChild(meta);
      row.appendChild(bubble);
      messagesEl.appendChild(row);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }, err=>{ console.error('Messages onSnapshot error', err); });
  // update UI
  if(currentUser){ sendForm.style.display='flex'; authNotice.style.display='none'; } else { sendForm.style.display='none'; authNotice.style.display='block'; }
}

// attachment handling
attachBtn.addEventListener('click', ()=> fileInput.click());
fileInput.addEventListener('change', ()=>{});

// send message - IMPORTANT: ensure roomId field and createdAt are set correctly
sendForm.addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  if(!currentUser) return alert('Please log in');
  if(!currentRoomId) return alert('Select a room');
  const text = txt.value.trim();
  const file = fileInput.files && fileInput.files[0];
  let attachmentUrl = '';
  try{
    if(file){
      const ref = sref(storage, `attachments/${currentRoomId}/${Date.now()}_${file.name}`);
      await uploadBytes(ref, file);
      attachmentUrl = await getDownloadURL(ref);
    }
    await addDoc(collection(db,'messages'), {
      uid: currentUser.uid,
      name: currentUser.displayName || currentUser.email || 'Anon',
      text: text || '',
      roomId: currentRoomId,
      createdAt: serverTimestamp(),
      attachmentUrl: attachmentUrl || ''
    });
    // clear input and file after send (this ensures UI clears immediately)
    txt.value = '';
    fileInput.value = '';
  }catch(e){ console.error('Send message failed', e); alert('Failed to send message'); }
});

// auth state handling
onAuthStateChanged(auth, async user=>{
  currentUser = user;
  if(user){
    userNameEl.textContent = user.displayName || user.email;
    logoutBtn.style.display = 'inline-block';
    try{
      await setDoc(doc(db,'users',user.uid), { displayName: user.displayName||'', email: user.email||'', lastSeen: serverTimestamp() }, { merge:true });
    }catch(e){ console.error('set user doc failed', e); }
  } else {
    userNameEl.textContent = '';
    logoutBtn.style.display = 'none';
  }
});

logoutBtn.addEventListener('click', async ()=>{ await signOut(auth); location.href='login.html'; });
