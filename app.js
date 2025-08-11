// app.js - main chat app
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-analytics.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, limit, serverTimestamp, onSnapshot, where, doc, setDoc, updateDoc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getStorage, ref as sref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";

// Firebase config (from user)
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

// UI refs
const roomsListEl = document.getElementById('roomsList');
const usersListEl = document.getElementById('usersList');
const createRoomBtn = document.getElementById('createRoomBtn');
const newRoomName = document.getElementById('newRoomName');
const chatTitle = document.getElementById('chatTitle');
const messagesEl = document.getElementById('messages');
const sendForm = document.getElementById('sendForm');
const txt = document.getElementById('txt');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const signOutBtn = document.getElementById('signOutBtn');
const userNameEl = document.getElementById('userName');
const authNotice = document.getElementById('authNotice');

let currentRoomId = null;
let currentUser = null;
let roomUnsub = null;
let messagesUnsub = null;

// Device layout
function isMobile(){ return /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent) || window.innerWidth < 801; }
function applyLayout(){ document.querySelector('.sidebar').style.display = isMobile()? 'none':'flex'; }
applyLayout(); window.addEventListener('resize', applyLayout);

// rooms
createRoomBtn.addEventListener('click', async ()=>{
  const name = (newRoomName.value || '').trim();
  if(!name) return alert('Room name required');
  const docRef = await addDoc(collection(db,'rooms'), { name, createdAt: serverTimestamp() });
  newRoomName.value='';
});

// listen rooms list
onSnapshot(query(collection(db,'rooms'), orderBy('createdAt')), snap=>{
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

// join room
async function joinRoom(roomId, roomName){
  if(messagesUnsub) messagesUnsub();
  currentRoomId = roomId;
  chatTitle.textContent = roomName || 'Room';
  messagesEl.innerHTML='';
  // subscribe messages for this room
  const q = query(collection(db,'messages'), where('roomId','==',roomId), orderBy('createdAt'), limit(1000));
  messagesUnsub = onSnapshot(q, snap=>{
    messagesEl.innerHTML='';
    snap.forEach(docSnap=> renderMessage(docSnap.id, docSnap.data()));
    messagesEl.scrollTop = messagesEl.scrollHeight;
    // update read receipts for visible messages
    snap.forEach(async docSnap=>{
      const m = docSnap.data();
      if(!m.readBy || !m.readBy.includes(currentUser?.uid)){
        try{ await updateDoc(doc(db,'messages',docSnap.id), { readBy: Array.from(new Set([...(m.readBy||[]), currentUser?.uid])) }); }catch(e){}
      }
    });
  });
  // show send form if logged in
  if(currentUser){
    sendForm.style.display = 'flex';
    authNotice.style.display = 'none';
  } else {
    sendForm.style.display = 'none';
    authNotice.style.display = 'block';
  }
}

// render message
function renderMessage(id, m){
  const row = document.createElement('div');
  row.className = 'message-row ' + (m.uid === currentUser?.uid? 'me-row':'other-row');
  const msg = document.createElement('div');
  msg.className = 'msg ' + (m.uid === currentUser?.uid? 'me':'other');
  const header = document.createElement('div');
  header.className = 'msg-header';
  const avatar = document.createElement('div');
  avatar.className='user-avatar';
  avatar.textContent = (m.name && m.name[0])? m.name[0].toUpperCase() : '?';
  header.appendChild(avatar);
  const nameEl = document.createElement('div'); nameEl.textContent = m.name || 'Anon'; nameEl.style.fontWeight='600';
  header.appendChild(nameEl);
  // actions (edit/delete/react)
  const actions = document.createElement('div'); actions.className='msg-actions';
  if(currentUser){
    // reactions
    const reactBtn = document.createElement('button'); reactBtn.className='react-btn'; reactBtn.textContent='😊';
    reactBtn.addEventListener('click', ()=> toggleReaction(id, '😊'));
    actions.appendChild(reactBtn);
    // edit/delete if own or admin
    if(m.uid === currentUser.uid || (currentUser.isAdmin)){
      const editBtn = document.createElement('button'); editBtn.className='msg-action'; editBtn.textContent='Edit';
      editBtn.addEventListener('click', ()=> editMessage(id, m));
      const delBtn = document.createElement('button'); delBtn.className='msg-action'; delBtn.textContent='Delete';
      delBtn.addEventListener('click', ()=> deleteMessage(id, m));
      actions.appendChild(editBtn); actions.appendChild(delBtn);
      if(currentUser.isAdmin && m.uid !== currentUser.uid){
        const banBtn = document.createElement('button'); banBtn.className='msg-action'; banBtn.textContent='Ban';
        banBtn.addEventListener('click', ()=> banUser(m.uid));
        actions.appendChild(banBtn);
      }
    }
  }
  header.appendChild(actions);
  msg.appendChild(header);
  // text
  const textDiv = document.createElement('div'); textDiv.innerHTML = escapeHtml(m.text || '');
  msg.appendChild(textDiv);
  // attachment
  if(m.attachmentUrl){ const img = document.createElement('img'); img.src = m.attachmentUrl; img.className='msg-attachment'; msg.appendChild(img); }
  // reactions display (simple counts)
  if(m.reactions){
    const rdiv = document.createElement('div'); rdiv.className='reactions';
    Object.entries(m.reactions).forEach(([emoji, uids])=>{
      const b = document.createElement('button'); b.className='react-btn'; b.textContent = `${emoji} ${uids.length||0}`;
      rdiv.appendChild(b);
    });
    msg.appendChild(rdiv);
  }
  // meta line: timestamp + read receipts
  const meta = document.createElement('div'); meta.className='meta';
  const t = (m.createdAt && m.createdAt.toDate)? timeAgo(m.createdAt.toDate()) : '';
  const reads = (m.readBy? m.readBy.length : 0);
  meta.textContent = t + ' • ' + reads + ' read';
  msg.appendChild(meta);

  row.appendChild(msg);
  messagesEl.appendChild(row);
}

// send message (with optional attachment)
attachBtn.addEventListener('click', ()=> fileInput.click());
fileInput.addEventListener('change', ()=>{
  // file chosen — do nothing until send
});

sendForm.addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  if(!currentUser) return alert('Please log in');
  if(!currentRoomId) return alert('Select a room');
  const text = txt.value.trim();
  const file = fileInput.files && fileInput.files[0];
  let attachmentUrl = '';
  if(file){
    const storageRef = sref(storage, `attachments/${currentRoomId}/${Date.now()}_${file.name}`);
    await uploadBytes(storageRef, file);
    attachmentUrl = await getDownloadURL(storageRef);
  }
  await addDoc(collection(db,'messages'), {
    uid: currentUser.uid,
    name: currentUser.displayName || currentUser.email || 'Anon',
    text: text||'',
    roomId: currentRoomId,
    createdAt: serverTimestamp(),
    readBy: [currentUser.uid],
    reactions: {},
    attachmentUrl: attachmentUrl||''
  });
  // clear type bar and attached file
  txt.value = '';
  fileInput.value = '';
});

# edit message
async def_placeholder = None
