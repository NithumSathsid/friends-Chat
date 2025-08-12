/* app.js - WhatsApp-style auto-restore for rooms and DMs, room rename/delete with message deletion */
import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { collection, query, orderBy, onSnapshot, addDoc, where, deleteDoc, doc, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// UI refs
const roomsList = document.getElementById('roomsList');
const usersList = document.getElementById('usersList');
const messagesEl = document.getElementById('messages');
const chatTitle = document.getElementById('chatTitle');
const sendForm = document.getElementById('sendForm');
const txt = document.getElementById('txt');
const logoutBtn = document.getElementById('logoutBtn');
const userName = document.getElementById('userName');
const newRoomBtn = document.getElementById('newRoomBtn');

let currentUser = null;
let currentChat = { type: null, id: null, title: null };
let messagesUnsub = null;

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])); }
function timeAgo(d){ const s=Math.floor((Date.now()-d.getTime())/1000); if(s<60) return s+'s'; const m=Math.floor(s/60); if(m<60) return m+'m'; const h=Math.floor(m/60); if(h<24) return h+'h'; return Math.floor(h/24)+'d'; }

// Rooms list
const roomsQ = query(collection(db,'rooms'), orderBy('createdAt'));
onSnapshot(roomsQ, snap=>{
  roomsList.innerHTML='';
  snap.forEach(rdoc=>{
    const r = rdoc.data();
    const el = document.createElement('div');
    el.className='room-item';
    el.innerHTML = `<div>${escapeHtml(r.name||'Room')}</div><div class="actions"><button data-id="${rdoc.id}" class="rename">âœï¸</button><button data-id="${rdoc.id}" class="delete">ðŸ—‘ï¸</button></div>`;
    el.querySelector('div').addEventListener('click', ()=> openRoom(rdoc.id, r.name));
    el.querySelector('.rename').addEventListener('click', (e)=>{ e.stopPropagation(); renameRoom(rdoc.id, r.name); });
    el.querySelector('.delete').addEventListener('click', (e)=>{ e.stopPropagation(); deleteRoomAndMessages(rdoc.id); });
    roomsList.appendChild(el);
  });
});

// Users list (for DMs)
const usersQ = query(collection(db,'users'), orderBy('displayName'));
onSnapshot(usersQ, snap=>{
  usersList.innerHTML='';
  snap.forEach(udoc=>{
    const u = udoc.data();
    const el = document.createElement('div');
    el.className='user-item';
    el.innerHTML = `<div>${escapeHtml(u.displayName||u.email||'Anon')}</div><div><button data-id="${udoc.id}" class="dm">DM</button></div>`;
    el.querySelector('div').addEventListener('click', ()=> openDM(udoc.id, u.displayName||u.email));
    el.querySelector('.dm').addEventListener('click', (e)=>{ e.stopPropagation(); openDM(udoc.id, u.displayName||u.email); });
    usersList.appendChild(el);
  });
});

newRoomBtn.addEventListener('click', async ()=>{
  const name = prompt('Room name');
  if(!name) return;
  await addDoc(collection(db,'rooms'), { name, createdAt: new Date() });
});

async function renameRoom(roomId, currentName){
  const name = prompt('New room name', currentName||'');
  if(!name) return;
  try{
    await (async ()=>{ const r = doc(db,'rooms',roomId); return r.update?.({name}) })();
  }catch(e){
    try{ await doc(db,'rooms',roomId).set({ name }, { merge:true }); }catch(e){ console.error('rename failed', e); }
  }
}

async function deleteRoomAndMessages(roomId){
  if(!confirm('Delete room and ALL its messages?')) return;
  try{
    await deleteDoc(doc(db,'rooms',roomId));
    const q = query(collection(db,'messages'), where('roomId','==',roomId));
    const snap = await getDocs(q);
    const deletes = [];
    snap.forEach(d=> deletes.push(deleteDoc(doc(db,'messages',d.id))));
    await Promise.all(deletes);
    if(currentChat.type==='room' && currentChat.id===roomId){
      messagesEl.innerHTML=''; chatTitle.textContent='Select a room or user'; sendForm.style.display='none';
      localStorage.removeItem('lastChat');
    }
  }catch(e){ console.error('delete room failed', e); alert('Failed to delete room'); }
}

// helper render
function renderMessage(m){
  const row = document.createElement('div');
  row.className='message-row';
  const b = document.createElement('div');
  b.className = 'msg ' + (m.uid===currentUser?.uid? 'me':'other');
  b.innerHTML = `<div style="font-weight:600">${escapeHtml(m.name||m.senderName||'Anon')}</div><div>${escapeHtml(m.text||'')}</div><div class="small">${m.createdAt && m.createdAt.toDate? timeAgo(m.createdAt.toDate()):''}</div>`;
  row.appendChild(b);
  messagesEl.appendChild(row);
}

// manage listener
function clearMessagesListener(){ if(messagesUnsub){ messagesUnsub(); messagesUnsub=null; } }

// open room (save lastChat as WhatsApp-style)
function openRoom(roomId, name){
  clearMessagesListener();
  currentChat = { type:'room', id:roomId, title:name };
  chatTitle.textContent = name;
  messagesEl.innerHTML='Loading...';
  sendForm.style.display = currentUser? 'flex':'none';
  localStorage.setItem('lastChat', JSON.stringify({ type:'room', id: roomId }));
  const mq = query(collection(db,'messages'), where('roomId','==',roomId), orderBy('createdAt'));
  messagesUnsub = onSnapshot(mq, snap=>{ messagesEl.innerHTML=''; snap.forEach(d=> renderMessage(d.data())); messagesEl.scrollTop = messagesEl.scrollHeight; });
}

// DM helpers
function dmId(a,b){ return [a,b].sort().join('_'); }
async function getUserDisplayName(uid){ try{ const ud = await getDoc(doc(db,'users',uid)); if(ud.exists()) return ud.data().displayName || ud.data().email || uid;}catch(e){} return uid; }

async function openDM(otherUid, otherName){
  clearMessagesListener();
  const id = dmId(currentUser.uid, otherUid);
  const displayName = otherName || (await getUserDisplayName(otherUid));
  currentChat = { type:'dm', id, title: displayName };
  chatTitle.textContent = 'DM: ' + displayName;
  messagesEl.innerHTML='Loading...';
  sendForm.style.display = 'flex';
  localStorage.setItem('lastChat', JSON.stringify({ type:'dm', id: otherUid }));
  const mq = query(collection(db,'privateMessages'), where('chatId','==',id), orderBy('createdAt'));
  messagesUnsub = onSnapshot(mq, snap=>{ messagesEl.innerHTML=''; snap.forEach(d=> renderMessage(d.data())); messagesEl.scrollTop = messagesEl.scrollHeight; });
}

// send messages (room or dm)
sendForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!currentUser) return alert('Log in first');
  const text = txt.value.trim();
  if(!text) return;
  try{
    if(currentChat.type==='room'){
      await addDoc(collection(db,'messages'), { uid: currentUser.uid, name: currentUser.displayName||currentUser.email, text, roomId: currentChat.id, createdAt: new Date() });
    } else if(currentChat.type==='dm'){
      await addDoc(collection(db,'privateMessages'), { chatId: currentChat.id, uid: currentUser.uid, senderName: currentUser.displayName||currentUser.email, text, createdAt: new Date() });
    }
    txt.value='';
  }catch(e){ console.error('send failed', e); alert('Failed to send'); }
});

// restore last chat on load (after auth known)
import { getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
async function restoreLastChat(){
  const raw = localStorage.getItem('lastChat');
  if(!raw) return;
  try{
    const last = JSON.parse(raw);
    if(last.type === 'room'){
      const roomRef = doc(db,'rooms', last.id);
      const roomSnap = await getDoc(roomRef);
      if(roomSnap.exists()) openRoom(last.id, roomSnap.data().name || 'Room');
      else localStorage.removeItem('lastChat');
    } else if(last.type === 'dm'){
      const otherUid = last.id;
      const otherRef = doc(db,'users',otherUid);
      const otherSnap = await getDoc(otherRef);
      if(otherSnap.exists()) openDM(otherUid, otherSnap.data().displayName || otherSnap.data().email);
      else localStorage.removeItem('lastChat');
    }
  }catch(e){ console.error('restore error', e); }
}

// auth state
import { onAuthStateChanged as onAuthState } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
onAuthState(auth, user=>{
  currentUser = user;
  if(user){
    userName.textContent = user.displayName || user.email;
    logoutBtn.style.display = 'inline-block';
    setTimeout(()=> restoreLastChat(), 150);
  } else {
    userName.textContent = '';
    logoutBtn.style.display = 'none';
  }
});

logoutBtn.addEventListener('click', async ()=>{ await signOut(auth); location.href='login.html'; });
