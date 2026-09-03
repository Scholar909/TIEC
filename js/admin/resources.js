import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, onSnapshot,
  collection, query, orderBy, getDocs, serverTimestamp
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
   ▓▓▓ CLOUDINARY — FILL THIS IN WHEN IT'S SET UP ▓▓▓
   1. Create a free Cloudinary account (cloudinary.com).
   2. Copy your "Cloud name" from the dashboard home page.
   3. Settings → Upload → Upload presets → Add upload preset →
      set Signing Mode to "Unsigned" → save, and copy its name.
   4. Paste both values below. Nothing else in this file needs
      to change — the upload call is already wired up to them.
   ========================================================= */
const CLOUDINARY_CLOUD_NAME = 'dejkcjvw';   // TODO: e.g. 'iec-club'
const CLOUDINARY_UPLOAD_PRESET = 'tiec uploads'; // TODO: e.g. 'iec_resources_unsigned'

async function uploadToCloudinary(file){
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET){
    throw new Error('cloudinary-not-configured');
  }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  // resource_type "auto" lets Cloudinary accept any file kind — PDFs,
  // videos, images, docs, zips, whatever admins upload here.
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error('cloudinary-upload-failed');
  const data = await res.json();
  return data.secure_url;
}
/* ▓▓▓ END CLOUDINARY SECTION ▓▓▓ */

/* =========================================================
   SCHEMA — matches pages/student/resources.js exactly, club-wide
   (no per-student copies):

   resources/{autoId}
     title, description, category ('pdf'|'assignment'|'video'|'other'),
     fileURL, uploadDate (Timestamp), uploadedBy (operator username)
   ========================================================= */

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
function formatDate(d){ return d ? d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : ''; }
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
   RESOURCE LIST
   ========================================================= */
const typeMeta = {
  pdf:        { icon: 'bx bxs-file-pdf',   label: 'PDF Notes' },
  assignment: { icon: 'bx bx-task',        label: 'Assignment' },
  video:      { icon: 'bx bxs-video',      label: 'Video' },
  other:      { icon: 'bx bx-folder',      label: 'Other' }
};

let allResources = [];
let currentFilter = 'all';
let currentSearch = '';
const gridEl = document.getElementById('resourceGrid');

function render(){
  const filtered = allResources.filter(r => {
    const matchesCat = currentFilter === 'all' || r.category === currentFilter;
    const matchesSearch = !currentSearch ||
      (r.title || '').toLowerCase().includes(currentSearch) ||
      (r.description || '').toLowerCase().includes(currentSearch);
    return matchesCat && matchesSearch;
  });

  if (!filtered.length){
    gridEl.innerHTML = `<p class="list-empty">No resources${currentFilter !== 'all' ? ' in this category' : ''}${currentSearch ? ' match your search' : ''} yet.</p>`;
    return;
  }

  gridEl.innerHTML = filtered.map(r => {
    const meta = typeMeta[r.category] || typeMeta.other;
    return `
      <div class="resource-card" data-id="${r.id}">
        <div class="resource-icon type-${r.category || 'other'}"><i class="${meta.icon}"></i></div>
        <div class="resource-body">
          <div class="resource-title">${escapeHtml(r.title || 'Untitled resource')}</div>
          ${r.description ? `<div class="resource-desc">${escapeHtml(r.description)}</div>` : ''}
          <div class="resource-meta">
            <div>
              <span class="resource-date"><i class="bx bx-calendar"></i> ${formatDate(r._date)}</span>
              ${r.uploadedBy ? `<div class="resource-uploader">by ${escapeHtml(r.uploadedBy)}</div>` : ''}
            </div>
            <div class="resource-actions">
              <a class="resource-open" href="${escapeHtml(r.fileURL || '#')}" target="_blank" rel="noopener" title="Open"><i class="bx bx-link-external"></i></a>
              <button class="edit-res" data-id="${r.id}" title="Edit"><i class="bx bx-edit-alt"></i></button>
              <button class="del-res" data-id="${r.id}" title="Delete"><i class="bx bx-trash"></i></button>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  gridEl.querySelectorAll('.edit-res').forEach(btn => btn.addEventListener('click', () => openEditForm(btn.dataset.id)));
  gridEl.querySelectorAll('.del-res').forEach(btn => btn.addEventListener('click', () => openDeleteConfirm(btn.dataset.id)));
}

document.querySelectorAll('#filterTabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#filterTabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.cat;
    render();
  });
});
document.getElementById('searchInput').addEventListener('input', (e) => {
  currentSearch = e.target.value.trim().toLowerCase();
  render();
});

async function loadResources(){
  gridEl.innerHTML = '<div class="list-skeleton"></div><div class="list-skeleton"></div><div class="list-skeleton"></div>';
  try{
    const snap = await getDocs(query(collection(db, 'resources'), orderBy('uploadDate', 'desc')));
    allResources = snap.docs.map(d => {
      const r = d.data();
      return { id: d.id, ...r, _date: toDate(r.uploadDate) };
    });
    render();
  }catch(err){
    console.error(err);
    gridEl.innerHTML = '<p class="list-empty">Couldn\'t load resources.</p>';
  }
}

/* =========================================================
   FORM (create / edit)
   ========================================================= */
const formModal = document.getElementById('formModal');
const resourceForm = document.getElementById('resourceForm');
let editingId = null;
let chosenFile = null;

function setSourceMode(mode){
  document.getElementById('fileSourceGroup').classList.toggle('hidden', mode !== 'file');
  document.getElementById('linkSourceGroup').classList.toggle('hidden', mode !== 'link');
}
document.querySelectorAll('input[name="fSourceMode"]').forEach(r => {
  r.addEventListener('change', () => setSourceMode(r.value));
});

function resetFileDrop(){
  chosenFile = null;
  document.getElementById('fFile').value = '';
  document.getElementById('fileDropEmpty').classList.remove('hidden');
  document.getElementById('fileDropChosen').classList.add('hidden');
}
document.getElementById('fFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  chosenFile = file;
  document.getElementById('fileDropEmpty').classList.add('hidden');
  document.getElementById('fileDropChosen').classList.remove('hidden');
  document.getElementById('fileChosenName').textContent = file.name;
});
document.getElementById('fileClear').addEventListener('click', resetFileDrop);

function openNewForm(){
  editingId = null;
  document.getElementById('formTitle').textContent = 'Add Resource';
  document.getElementById('formDeleteBtn').classList.add('hidden');
  resourceForm.reset();
  resetFileDrop();
  setSourceMode('file');
  document.getElementById('fTitleErr').classList.add('hidden');
  document.getElementById('fLinkErr').classList.add('hidden');
  formModal.classList.add('open');
}
document.getElementById('fabAdd').addEventListener('click', openNewForm);
document.getElementById('formClose').addEventListener('click', () => formModal.classList.remove('open'));

function openEditForm(id){
  const r = allResources.find(x => x.id === id);
  if (!r) return;
  editingId = id;
  document.getElementById('formTitle').textContent = 'Edit Resource';
  document.getElementById('formDeleteBtn').classList.remove('hidden');
  document.getElementById('fTitleErr').classList.add('hidden');
  document.getElementById('fLinkErr').classList.add('hidden');

  document.getElementById('fCategory').value = r.category || 'other';
  document.getElementById('fTitle').value = r.title || '';
  document.getElementById('fDescription').value = r.description || '';
  resetFileDrop();

  // Editing keeps the existing link/file as-is unless a new one is provided —
  // default to "link" mode prefilled with the current URL so admins can see
  // and tweak it without being forced to re-upload a file.
  document.querySelector('input[name="fSourceMode"][value="link"]').checked = true;
  setSourceMode('link');
  document.getElementById('fLink').value = r.fileURL || '';

  formModal.classList.add('open');
}

resourceForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('fTitle').value.trim();
  if (!title){ document.getElementById('fTitleErr').classList.remove('hidden'); return; }
  document.getElementById('fTitleErr').classList.add('hidden');

  const mode = document.querySelector('input[name="fSourceMode"]:checked').value;
  const category = document.getElementById('fCategory').value;
  const description = document.getElementById('fDescription').value.trim();

  let fileURL = null;
  if (mode === 'link'){
    fileURL = document.getElementById('fLink').value.trim();
    if (!fileURL){ document.getElementById('fLinkErr').classList.remove('hidden'); return; }
    document.getElementById('fLinkErr').classList.add('hidden');
  } else if (mode === 'file' && !chosenFile && !editingId){
    showToast('Choose a file, or switch to "Paste a link".');
    return;
  }

  const btn = document.getElementById('formSaveBtn');
  btn.classList.add('loading'); btn.disabled = true;

  try{
    if (mode === 'file' && chosenFile){
      try{
        fileURL = await uploadToCloudinary(chosenFile);
      }catch(err){
        if (err.message === 'cloudinary-not-configured'){
          showToast("Cloudinary isn't set up yet — switch to \"Paste a link\" for now.");
        } else {
          showToast('The file upload failed — try again.');
        }
        btn.classList.remove('loading'); btn.disabled = false;
        return;
      }
    }

    if (editingId){
      const payload = { category, title, description, updatedBy: operator.username, updatedAt: serverTimestamp() };
      if (fileURL) payload.fileURL = fileURL;
      await updateDoc(doc(db, 'resources', editingId), payload);
      showToast('Resource updated');
    } else {
      await setDoc(doc(collection(db, 'resources')), {
        category, title, description, fileURL,
        uploadDate: serverTimestamp(),
        uploadedBy: operator.username
      });
      showToast('Resource added');
    }

    formModal.classList.remove('open');
    loadResources();
  }catch(err){
    console.error(err);
    showToast("Couldn't save — try again");
  }
  btn.classList.remove('loading'); btn.disabled = false;
});

/* ---------- delete ---------- */
const deleteModal = document.getElementById('deleteModal');
let pendingDeleteId = null;
function openDeleteConfirm(id){
  pendingDeleteId = id;
  deleteModal.classList.add('open');
}
document.getElementById('formDeleteBtn').addEventListener('click', () => {
  if (editingId) openDeleteConfirm(editingId);
});
document.getElementById('deleteCancel').addEventListener('click', () => deleteModal.classList.remove('open'));
document.getElementById('deleteConfirm').addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  const btn = document.getElementById('deleteConfirm');
  btn.disabled = true;
  try{
    await deleteDoc(doc(db, 'resources', pendingDeleteId));
    showToast('Resource deleted');
  }catch(err){
    console.error(err);
    showToast("Couldn't delete — try again");
  }
  btn.disabled = false;
  pendingDeleteId = null;
  deleteModal.classList.remove('open');
  formModal.classList.remove('open');
  loadResources();
});

/* ---------- init ---------- */
loadResources();
