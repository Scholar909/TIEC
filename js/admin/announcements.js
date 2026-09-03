import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDBRvD87vNdWMS1wvufAd_RNZhuCf2CN4g",
  authDomain: "the-innovative-explorer-club.firebaseapp.com",
  projectId: "the-innovative-explorer-club",
  storageBucket: "the-innovative-explorer-club.firebasestorage.app",
  messagingSenderId: "421600505981",
  appId: "1:421600505981:web:6a633ef8b98b4a6f990114"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* =========================================================
   SCHEMA — only one announcement exists at a time, as a
   singleton doc so posting a new one replaces the old outright:

   announcements/current
     postId   — changes only when a NEW announcement is posted
                (not on edits); students compare this against
                their own students/{uid}.lastSeenAnnouncementId
                to decide whether to glow
     title, message
     postedBy, postedAt (Timestamp, set when postId changes)
     updatedBy, updatedAt (Timestamp, set on in-place edits)
   ========================================================= */
const ANNOUNCE_REF_PATH = ['announcements', 'current'];

const operatorRaw = sessionStorage.getItem('iec_operator');
if (!operatorRaw) window.location.href = 'admin-login.html';
const operator = operatorRaw ? JSON.parse(operatorRaw) : null;

onAuthStateChanged(auth, (user) => {
  if (!user) { sessionStorage.removeItem('iec_operator'); window.location.href = 'admin-login.html'; }
});
onSnapshot(doc(db, 'system', 'activeSession'), (snap) => {
  if (!snap.exists()) return;
  const data = snap.data();
  if (operator && data.username && data.username !== operator.username) {
    sessionStorage.removeItem('iec_operator');
    signOut(auth).finally(() => { window.location.href = 'admin-login.html?kicked=1'; });
  }
});

/* ---------- helpers ---------- */
function initials(name){ return (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase(); }
function escapeHtml(str){ const d = document.createElement('div'); d.textContent = str == null ? '' : String(str); return d.innerHTML; }
function toDate(ts){ return ts && ts.toDate ? ts.toDate() : null; }
function formatDateTime(d){
  if (!d) return '';
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) + ' · ' +
    d.toLocaleTimeString('en-GB', { hour:'numeric', minute:'2-digit' });
}
let toastTimer;
function showToast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- operator chrome ---------- */
if (operator){
  const name = operator.fullName || operator.username;
  document.getElementById('topAvatar').textContent = initials(name);
  document.getElementById('ddAvatar').textContent = initials(name);
  document.getElementById('ddName').textContent = name;
  document.getElementById('ddRole').textContent = operator.role || 'teacher';
}
const themeToggle = document.getElementById('themeToggle');
themeToggle.innerHTML = document.documentElement.classList.contains('light-mode') ? "<i class='bx bx-sun'></i>" : "<i class='bx bx-moon'></i>";
themeToggle.addEventListener('click', () => {
  document.documentElement.classList.toggle('light-mode');
  const light = document.documentElement.classList.contains('light-mode');
  themeToggle.innerHTML = light ? "<i class='bx bx-sun'></i>" : "<i class='bx bx-moon'></i>";
  try{ localStorage.setItem('iec-theme', light ? 'light' : 'dark'); }catch(e){}
});
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('sidebarBackdrop');
document.getElementById('hamburger').addEventListener('click', () => {
  sidebar.classList.contains('open') ? (sidebar.classList.remove('open'), backdrop.classList.remove('show')) : (sidebar.classList.add('open'), backdrop.classList.add('show'));
});
backdrop.addEventListener('click', () => { sidebar.classList.remove('open'); backdrop.classList.remove('show'); });
function wireDropdown(btnId, panelId){
  const btn = document.getElementById(btnId); const panel = document.getElementById(panelId);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = !panel.classList.contains('open');
    document.querySelectorAll('.dropdown-panel.open').forEach(p => p.classList.remove('open'));
    if (willOpen) panel.classList.add('open');
  });
}
wireDropdown('bellBtn', 'bellDropdown');
wireDropdown('avatarBtn', 'avatarDropdown');
document.addEventListener('click', () => document.querySelectorAll('.dropdown-panel.open').forEach(p => p.classList.remove('open')));

async function doSignOut(){
  try{
    if (operator){
      const sessionRef = doc(db, 'system', 'activeSession');
      const snap = await getDoc(sessionRef);
      if (snap.exists() && snap.data().username === operator.username){
        await setDoc(sessionRef, { username: deleteField(), fullName: deleteField(), role: deleteField() }, { merge: true });
      }
    }
  }catch(e){ console.error(e); }
  sessionStorage.removeItem('iec_operator');
  await signOut(auth);
  window.location.href = 'admin-login.html';
}
document.getElementById('logoutBtnSide').addEventListener('click', doSignOut);
document.getElementById('logoutBtnTop').addEventListener('click', doSignOut);

/* =========================================================
   CURRENT ANNOUNCEMENT
   ========================================================= */
let current = null; // null when nothing is posted
const sectionEl = document.getElementById('currentSection');

function render(){
  if (!current){
    sectionEl.innerHTML = `
      <div class="card glass empty-announce">
        <i class="bx bx-megaphone"></i>
        <h3>Nothing posted right now</h3>
        <p>Tap the + button to let students and parents know something.</p>
      </div>`;
    return;
  }

  const postedDate = toDate(current.postedAt);
  const updatedDate = toDate(current.updatedAt);

  sectionEl.innerHTML = `
    <div class="card glass announce-card">
      <div class="announce-head">
        <span class="announce-icon"><i class="bx bxs-megaphone"></i></span>
        <div>
          <div class="announce-title">${escapeHtml(current.title || 'Untitled')}</div>
          <div class="announce-meta">
            Posted ${formatDateTime(postedDate)}${current.postedBy ? ' by ' + escapeHtml(current.postedBy) : ''}
            ${updatedDate ? `<br>Edited ${formatDateTime(updatedDate)}${current.updatedBy ? ' by ' + escapeHtml(current.updatedBy) : ''}` : ''}
          </div>
        </div>
      </div>
      <div class="announce-message">${escapeHtml(current.message || '')}</div>
      <div class="announce-actions">
        <button class="btn btn-ghost" id="editBtn"><i class="bx bx-edit-alt"></i> Edit</button>
        <button class="btn btn-outline-danger" id="deleteTriggerBtn"><i class="bx bx-trash"></i> Delete</button>
      </div>
    </div>`;

  document.getElementById('editBtn').addEventListener('click', openEditForm);
  document.getElementById('deleteTriggerBtn').addEventListener('click', () => document.getElementById('deleteModal').classList.add('open'));
}

onSnapshot(doc(db, ...ANNOUNCE_REF_PATH), (snap) => {
  current = snap.exists() ? snap.data() : null;
  render();
}, (err) => {
  console.error(err);
  sectionEl.innerHTML = '<div class="card glass empty-announce"><p>Couldn\'t load the announcement.</p></div>';
});

/* =========================================================
   FORM (post new / edit in place)
   ========================================================= */
const formModal = document.getElementById('formModal');
const announceForm = document.getElementById('announceForm');
let formMode = 'post'; // 'post' | 'edit'

function openNewForm(){
  formMode = 'post';
  document.getElementById('formTitle').textContent = 'Post Announcement';
  document.getElementById('formSaveLabel').textContent = 'Post Announcement';
  announceForm.reset();
  clearFormErrors();
  formModal.classList.add('open');
}
function openEditForm(){
  if (!current) return;
  formMode = 'edit';
  document.getElementById('formTitle').textContent = 'Edit Announcement';
  document.getElementById('formSaveLabel').textContent = 'Save Changes';
  document.getElementById('fTitle').value = current.title || '';
  document.getElementById('fMessage').value = current.message || '';
  clearFormErrors();
  formModal.classList.add('open');
}
function clearFormErrors(){
  document.getElementById('fTitleErr').classList.add('hidden');
  document.getElementById('fMessageErr').classList.add('hidden');
}

document.getElementById('fabAdd').addEventListener('click', openNewForm);
document.getElementById('formClose').addEventListener('click', () => formModal.classList.remove('open'));

announceForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = document.getElementById('fTitle').value.trim();
  const message = document.getElementById('fMessage').value.trim();
  let valid = true;
  if (!title){ document.getElementById('fTitleErr').classList.remove('hidden'); valid = false; }
  if (!message){ document.getElementById('fMessageErr').classList.remove('hidden'); valid = false; }
  if (!valid) return;

  if (formMode === 'post' && current){
    // Something is already live — confirm the replace before overwriting it.
    document.getElementById('replaceModal').classList.add('open');
    return;
  }
  submitAnnouncement(title, message);
});

document.getElementById('replaceCancel').addEventListener('click', () => document.getElementById('replaceModal').classList.remove('open'));
document.getElementById('replaceConfirm').addEventListener('click', () => {
  document.getElementById('replaceModal').classList.remove('open');
  const title = document.getElementById('fTitle').value.trim();
  const message = document.getElementById('fMessage').value.trim();
  submitAnnouncement(title, message);
});

async function submitAnnouncement(title, message){
  const btn = document.getElementById('formSaveBtn');
  btn.classList.add('loading'); btn.disabled = true;
  try{
    if (formMode === 'edit' && current){
      await updateDoc(doc(db, ...ANNOUNCE_REF_PATH), {
        title, message,
        updatedBy: operator.username,
        updatedAt: serverTimestamp()
      });
      showToast('Announcement updated');
    } else {
      await setDoc(doc(db, ...ANNOUNCE_REF_PATH), {
        postId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title, message,
        postedBy: operator.username,
        postedAt: serverTimestamp()
      });
      showToast('Announcement posted');
    }
    formModal.classList.remove('open');
  }catch(err){
    console.error(err);
    showToast("Couldn't save — try again");
  }
  btn.classList.remove('loading'); btn.disabled = false;
}

/* ---------- delete ---------- */
document.getElementById('deleteCancel').addEventListener('click', () => document.getElementById('deleteModal').classList.remove('open'));
document.getElementById('deleteConfirm').addEventListener('click', async () => {
  const btn = document.getElementById('deleteConfirm');
  btn.disabled = true;
  try{
    await deleteDoc(doc(db, ...ANNOUNCE_REF_PATH));
    showToast('Announcement deleted');
  }catch(err){
    console.error(err);
    showToast("Couldn't delete — try again");
  }
  btn.disabled = false;
  document.getElementById('deleteModal').classList.remove('open');
});
