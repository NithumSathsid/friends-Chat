/* app.js - groups + DMs, paginated messages, search, attachments with previews */

import { auth, db, storage } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  collection, query, where, orderBy, onSnapshot, addDoc, doc,
  getDocs, getDoc, limitToLast, endBefore, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { ref as sRef, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";

// UI refs
const groupsList = document.getElementById('groupsList');
const usersList = document.getElementById('usersList');
const messagesEl = document.getElementById('messages');
const chatTitle = document.getElementById('chatTitle');
const sendForm = document.getElementById('sendForm');
const txt = document.getElementById('txt');
const logoutBtn = document.getElementById('logoutBtn');
const userName = document.getElementById('userName');
const newGroupBtn = document.getElementById('newGroupBtn');
const authNotice = document.getElementById('authNotice');
const loginLink = document.getElementById('loginLink');
const searchInput = document.getElementById('searchInput');
// Attachments UI
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const attachPreview = document.getElementById('attachPreview');

let currentUser = null;
let currentChat = { type: null, id: null, title: null };
let messagesUnsub = null;

// Pagination state
let oldestDoc = null;
let newestDoc = null;
let initialLoaded = false;
let isLoadingOlder = false;
let renderedIds = new Set();

// Attachment selection
let selectedFiles = [];

// Utils
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function timeAgo(d){ const s=Math.floor((Date.now()-d.getTime())/1000); if(s<60) return s+'s'; const m=Math.floor(s/60); if(m<60) return m+'m'; const h=Math.floor(m/60); if(h<24) return h+'h'; return Math.floor(h/24)+'d'; }
function isAtBottom(){ return Math.abs(messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight) < 8; }
function clearMessagesListener(){ if(messagesUnsub){ messagesUnsub(); messagesUnsub=null; } messagesEl.onscroll = null; }
function formatSize(bytes){ if(bytes<1024) return bytes+' B'; const kb=bytes/1024; if(kb<1024) return kb.toFixed(1)+' KB'; const mb=kb/1024; return mb.toFixed(1)+' MB'; }
function detectAttachmentType(mime){
  if (!mime) return 'file';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

// --- AUTH STATE -> UPDATE UI (index page) ---
onAuthStateChanged(auth, async (user) => {
  currentUser = null;
  if (user) {
    let displayName = user.displayName, email = user.email;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists() && !displayName) displayName = snap.data().displayName || displayName;
    } catch {}
    currentUser = { uid: user.uid, displayName, email };
    userName.textContent = displayName || email || 'User';
    logoutBtn.style.display = 'inline-block';
    if (loginLink) loginLink.style.display = 'none';
    sendForm.style.display = 'flex';
    if (authNotice) authNotice.style.display = 'none';

    const selfEl = usersList?.querySelector(`[data-uid="${user.uid}"]`);
    if (selfEl) selfEl.remove();

    setTimeout(()=> restoreLastChat(), 100);
  } else {
    userName.textContent = '';
    logoutBtn.style.display = 'none';
    if (loginLink) loginLink.style.display = '';
    sendForm.style.display = 'none';
    if (authNotice) authNotice.style.display = 'block';
    clearMessagesListener();
    messagesEl.innerHTML = '';
    chatTitle.textContent = 'Select a group or user';
  }
});

// Sign out from main header
logoutBtn?.addEventListener('click', async (e)=>{
  e.preventDefault();
  try { await signOut(auth); } catch (err) { console.error('signOut failed', err); }
});

// Groups list
onSnapshot(
  query(collection(db,'groups'), orderBy('createdAt')),
  snap=>{
    groupsList.innerHTML='';
    snap.forEach(gdoc=>{
      const g = gdoc.data();
      const el = document.createElement('div');
      el.className='room-item';
      const name = g.name || 'Group';
      el.dataset.name = name.toLowerCase();
      el.textContent = name;
      el.addEventListener('click', ()=> openGroup(gdoc.id, name));
      groupsList.appendChild(el);
    });
    applySearchFilter();
  },
  err => console.error('Groups listener error:', err)
);

// Users list (DM) — skip current user
onSnapshot(
  query(collection(db,'users'), orderBy('sortKey')),
  snap=>{
    usersList.innerHTML='';
    const seen = new Set();
    const me = currentUser?.uid || null;
    snap.forEach(udoc=>{
      if (me && udoc.id === me) return;
      if (seen.has(udoc.id)) return;
      seen.add(udoc.id);

      const u = udoc.data();
      const label = escapeHtml(u.displayName || u.email || 'User');
      const el = document.createElement('div');
      el.className='user-item';
      el.dataset.uid = udoc.id;
      el.dataset.name = (u.sortKey || (u.displayName||u.email||'').toLowerCase());
      el.textContent = label;
      el.title = `DM ${label}`;
      el.addEventListener('click', ()=> openDM(udoc.id, label));
      usersList.appendChild(el);
    });
    applySearchFilter();
  },
  err => console.error('Users listener error:', err)
);

// Create group
newGroupBtn.addEventListener('click', async ()=>{
  if(!currentUser){ alert('Log in first'); return; }
  const name = prompt('Group name');
  if(!name) return;
  await addDoc(collection(db,'groups'), {
    name: name.trim(),
    createdAt: serverTimestamp(),
    members: [currentUser.uid]
  });
});

// Search filter
searchInput.addEventListener('input', applySearchFilter);
function applySearchFilter(){
  const q = (searchInput.value || '').toLowerCase().trim();
  [groupsList, usersList].forEach(list=>{
    if(!list) return;
    Array.from(list.children).forEach(item=>{
      const n = item.dataset.name || '';
      item.style.display = n.includes(q) ? '' : 'none';
    });
  });
}

// Message rendering (supports attachments)
function renderMessageEl(m){
  const row = document.createElement('div');
  row.className='message-row';
  const b = document.createElement('div');
  b.className = 'msg ' + (m.uid===currentUser?.uid? 'me':'other');

  const name = escapeHtml(m.name||m.senderName||'Anon');
  const text = escapeHtml(m.text||'');
  const t = m.createdAt && m.createdAt.toDate ? timeAgo(m.createdAt.toDate()) : '';

  let media = '';
  if (m.attachment && m.attachment.url) {
    const a = m.attachment;
    const kind = a.type || detectAttachmentType(a.contentType||'');
    if (kind === 'image') {
      media = `<div class="msg-media"><img src="${a.url}" alt="${escapeHtml(a.name||'image')}" loading="lazy"/></div>`;
    } else if (kind === 'video') {
      media = `<div class="msg-media"><video src="${a.url}" controls playsinline></video></div>`;
    } else if (kind === 'audio') {
      media = `<div class="msg-media"><audio controls src="${a.url}"></audio></div>`;
    } else {
      const size = a.size ? ` • ${formatSize(a.size)}` : '';
      media = `<div class="msg-media"><a class="file-link" href="${a.url}" target="_blank" rel="noopener">📎 ${escapeHtml(a.name||'file')}${size}</a></div>`;
    }
  }

  const textHtml = text ? `<div>${text}</div>` : '';
  b.innerHTML = `<div style="font-weight:600">${name}</div>${textHtml}${media}<div class="small">${t}</div>`;
  row.appendChild(b);
  return row;
}

function renderBatch(docs, { prepend=false } = {}){
  const frag = document.createDocumentFragment();
  docs.forEach(d => {
    if (renderedIds.has(d.id)) return;
    renderedIds.add(d.id);
    frag.appendChild(renderMessageEl(d.data()));
  });
  if (prepend) messagesEl.insertBefore(frag, messagesEl.firstChild);
  else messagesEl.appendChild(frag);
}

async function loadOlderMessages(collectionName, filterField, filterValue){
  if (isLoadingOlder || !oldestDoc) return;
  isLoadingOlder = true;
  const prevHeight = messagesEl.scrollHeight;
  const qOlder = query(
    collection(db, collectionName),
    where(filterField, '==', filterValue),
    orderBy('createdAt', 'asc'),
    endBefore(oldestDoc),
    limitToLast(50)
  );
  try{
    const snap = await getDocs(qOlder);
    if (!snap.empty) {
      renderBatch(snap.docs, { prepend: true });
      oldestDoc = snap.docs[0];
      const delta = messagesEl.scrollHeight - prevHeight;
      messagesEl.scrollTop += delta;
    }
  }catch(e){ console.error('Load older error:', e); }
  isLoadingOlder = false;
}

function setupInfiniteScroll(collectionName, filterField, filterValue){
  messagesEl.onscroll = () => {
    if (messagesEl.scrollTop < 80) {
      loadOlderMessages(collectionName, filterField, filterValue).catch(()=>{});
    }
  };
}

function subscribeMessages(collectionName, filterField, filterValue){
  clearMessagesListener();
  messagesEl.innerHTML = '';
  oldestDoc = newestDoc = null;
  initialLoaded = false;
  isLoadingOlder = false;
  renderedIds.clear();

  const qBase = query(
    collection(db, collectionName),
    where(filterField, '==', filterValue),
    orderBy('createdAt', 'asc'),
    limitToLast(50)
  );

  messagesUnsub = onSnapshot(qBase, (snap) => {
    if (!initialLoaded) {
      renderBatch(snap.docs);
      if (snap.docs.length) {
        oldestDoc = snap.docs[0];
        newestDoc = snap.docs[snap.docs.length - 1];
      }
      initialLoaded = true;
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return;
    }
    const atBottom = isAtBottom();
    snap.docChanges().forEach(ch => {
      if (ch.type === 'added' && !renderedIds.has(ch.doc.id)) {
        renderedIds.add(ch.doc.id);
        messagesEl.appendChild(renderMessageEl(ch.doc.data()));
        newestDoc = ch.doc;
      }
    });
    if (atBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
  }, (err) => {
    console.error('Messages listener error:', err);
  });

  setupInfiniteScroll(collectionName, filterField, filterValue);
}

// Open group
function openGroup(groupId, name){
  currentChat = { type:'group', id:groupId, title:name };
  chatTitle.textContent = name || 'Group';
  subscribeMessages('messages', 'groupId', groupId);
  sendForm.style.display = currentUser? 'flex':'none';
  if (!currentUser && authNotice) authNotice.style.display = 'block';
  localStorage.setItem('lastChat', JSON.stringify({ type:'group', id: groupId }));
}

// DMs
function dmId(a,b){ return [a,b].sort().join('_'); }
async function getUserDisplayName(uid){ try{ const ud = await getDoc(doc(db,'users',uid)); if(ud.exists()) return ud.data().displayName || ud.data().email || uid;}catch(e){} return uid; }

// Open DM — prevents self-DM
async function openDM(otherUid, otherName){
  if(!currentUser){ alert('Log in first'); return; }
  if (otherUid === currentUser.uid) return;

  const id = dmId(currentUser.uid, otherUid);
  const displayName = otherName || (await getUserDisplayName(otherUid));
  currentChat = { type:'dm', id, title: displayName };
  chatTitle.textContent = 'DM: ' + displayName;
  subscribeMessages('privateMessages', 'chatId', id);
  sendForm.style.display = 'flex';
  if (authNotice) authNotice.style.display = 'none';
  localStorage.setItem('lastChat', JSON.stringify({ type:'dm', id: otherUid }));
}

// Attachment preview UI
attachBtn?.addEventListener('click', ()=> fileInput?.click());

fileInput?.addEventListener('change', ()=>{
  if (!fileInput.files?.length) return;
  for (const f of fileInput.files) {
    if (selectedFiles.length >= 10) break;
    const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    selectedFiles.push({ id, file: f, url: URL.createObjectURL(f) });
  }
  fileInput.value = '';
  renderAttachPreview();
});

attachPreview?.addEventListener('click', (e)=>{
  const btn = e.target.closest('.preview-remove');
  if (!btn) return;
  const id = btn.dataset.id;
  selectedFiles = selectedFiles.filter(x => x.id !== id);
  renderAttachPreview();
});

function renderAttachPreview(){
  if (!attachPreview) return;
  if (!selectedFiles.length){
    attachPreview.style.display = 'none';
    attachPreview.innerHTML = '';
    return;
  }
  attachPreview.style.display = 'flex';
  attachPreview.innerHTML = selectedFiles.map(x=>{
    const kind = detectAttachmentType(x.file.type);
    if (kind === 'image') {
      return `<div class="preview-item" data-id="${x.id}">
        <img src="${x.url}" alt="${escapeHtml(x.file.name)}"/>
        <button class="preview-remove" data-id="${x.id}" title="Remove">×</button>
        <div class="preview-progress" id="p_${x.id}"></div>
      </div>`;
    } else if (kind === 'video') {
      return `<div class="preview-item" data-id="${x.id}">
        <video src="${x.url}" muted></video>
        <button class="preview-remove" data-id="${x.id}" title="Remove">×</button>
        <div class="preview-progress" id="p_${x.id}"></div>
      </div>`;
    } else {
      return `<div class="preview-item" data-id="${x.id}">
        <div class="file-pill">📎 ${escapeHtml(x.file.name)}</div>
        <button class="preview-remove" data-id="${x.id}" title="Remove">×</button>
        <div class="preview-progress" id="p_${x.id}"></div>
      </div>`;
    }
  }).join('');
}

// Upload and send one attachment (optionally with text)
async function uploadAndSendAttachment(sel, textForThisOne){
  const f = sel.file;
  const kind = detectAttachmentType(f.type);
  const pathBase = currentChat.type === 'group' ? 'groups' : 'dms';
  const safeName = f.name.replace(/[^\w.\-]+/g,'_');
  const path = `${pathBase}/${currentChat.id}/${currentUser.uid}/${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`;
  const r = sRef(storage, path);
  const task = uploadBytesResumable(r, f, { contentType: f.type || undefined });

  return new Promise((resolve, reject)=>{
    task.on('state_changed', (snap)=>{
      const pct = snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
      const bar = document.getElementById(`p_${sel.id}`);
      if (bar) bar.style.width = `${pct}%`;
    }, reject, async ()=>{
      try{
        const url = await getDownloadURL(task.snapshot.ref);
        const attachment = { url, name: f.name, size: f.size, contentType: f.type || '', type: kind };
        const common = { uid: currentUser.uid, createdAt: serverTimestamp() };
        if (currentChat.type === 'group') {
          await addDoc(collection(db,'messages'), {
            ...common,
            name: currentUser.displayName||currentUser.email,
            text: textForThisOne || '',
            groupId: currentChat.id,
            attachment
          });
        } else {
          await addDoc(collection(db,'privateMessages'), {
            ...common,
            senderName: currentUser.displayName||currentUser.email,
            text: textForThisOne || '',
            chatId: currentChat.id,
            attachment
          });
        }
        resolve();
      }catch(e){ reject(e); }
    });
  });
}

// Send (supports attachments)
sendForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!currentUser){ alert('Log in first'); return; }
  if(!currentChat?.type){ alert('Select a group or DM'); return; }

  const text = txt.value.trim();

  // If files selected, upload and send them (text goes with first)
  if (selectedFiles.length){
    try{
      let first = true;
      for (const sel of selectedFiles){
        await uploadAndSendAttachment(sel, first ? text : '');
        first = false;
      }
      // Clear previews and input
      selectedFiles.forEach(s => URL.revokeObjectURL(s.url));
      selectedFiles = [];
      renderAttachPreview();
      txt.value = '';
      if (isAtBottom()) messagesEl.scrollTop = messagesEl.scrollHeight;
    }catch(err){
      console.error('Attachment send failed', err);
      alert('Failed to upload attachment');
    }
    return;
  }

  // Text-only
  if(!text) return;
  try{
    if(currentChat.type==='group'){
      await addDoc(collection(db,'messages'), {
        uid: currentUser.uid,
        name: currentUser.displayName||currentUser.email,
        text,
        groupId: currentChat.id,
        createdAt: serverTimestamp()
      });
    } else if(currentChat.type==='dm'){
      await addDoc(collection(db,'privateMessages'), {
        chatId: currentChat.id,
        uid: currentUser.uid,
        senderName: currentUser.displayName||currentUser.email,
        text,
        createdAt: serverTimestamp()
      });
    }
    txt.value='';
    if (isAtBottom()) messagesEl.scrollTop = messagesEl.scrollHeight;
  }catch(e){ console.error('Send failed', e); alert('Failed to send'); }
});

// Restore last chat
async function restoreLastChat(){
  const raw = localStorage.getItem('lastChat');
  if(!raw) return;
  try{
    const last = JSON.parse(raw);
    if(last.type === 'group'){
      const gRef = doc(db,'groups', last.id);
      const gSnap = await getDoc(gRef);
      if(gSnap.exists()) openGroup(last.id, gSnap.data().name || 'Group');
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