import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, onSnapshot,
  collection, query, where, orderBy, getDocs, writeBatch, serverTimestamp
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
   SCHEMA — club-wide resources + per-student submissions

   resources/{autoId}
     title, description,
     category ('assignment'|'homework'|'exercise'|'practical'|'project'|'worksheet'|
               'reading'|'notes'|'pdf'|'pastq'|'video'|'other'),
     level ('All'|'Young Explorers'|'Junior Innovators'|'Teen Innovators'),
     fileURL, uploadDate (Timestamp), uploadedBy,
     requiresSubmission (bool — missing/false on older resources = no submission),
     deadline ('YYYY-MM-DD', inclusive: students may still submit ON that day),
     maxScore (number — the "out of" the admin grades against)

   resourceSubmissions/{resourceId_studentUid}   (one live doc per student per resource)
     resourceId, resourceTitle, category, studentId, studentName, studentLevel,
     files: [{url, name, type}], note, attempt, submittedAt,
     status ('pending'|'approved'|'declined'),
     approved → score, maxScore, feedback?, gradedAt, gradedBy
     declined → declineReason, newDeadline ('YYYY-MM-DD'), declinedAt, declinedBy
     history: [{reason, by, at}]  (earlier declines, appended when the student resubmits)
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
   TYPES
   group: tasks | reading | video | other   (drives the filter tabs)
   cls:   css class for the icon colour
   submit: whether "needs a submission" defaults to YES for this type
   ========================================================= */
const typeMeta = {
  assignment: { icon: 'bx bx-task',        label: 'Assignment',      group: 'tasks',   cls: 'tasks',   submit: true  },
  homework:   { icon: 'bx bx-pencil',      label: 'Homework',        group: 'tasks',   cls: 'tasks',   submit: true  },
  exercise:   { icon: 'bx bx-edit',        label: 'Exercise',        group: 'tasks',   cls: 'tasks',   submit: true  },
  practical:  { icon: 'bx bx-wrench',      label: 'Practical Task',  group: 'tasks',   cls: 'tasks',   submit: true  },
  project:    { icon: 'bx bx-rocket',      label: 'Project',         group: 'tasks',   cls: 'tasks',   submit: true  },
  worksheet:  { icon: 'bx bx-clipboard',   label: 'Worksheet',       group: 'tasks',   cls: 'tasks',   submit: true  },
  reading:    { icon: 'bx bx-book-open',   label: 'Reading Material',group: 'reading', cls: 'reading', submit: false },
  notes:      { icon: 'bx bx-notepad',     label: 'Notes',           group: 'reading', cls: 'reading', submit: false },
  pdf:        { icon: 'bx bxs-file-pdf',   label: 'PDF Notes',       group: 'reading', cls: 'pdf',     submit: false },
  pastq:      { icon: 'bx bx-history',     label: 'Past Questions',  group: 'reading', cls: 'reading', submit: false },
  video:      { icon: 'bx bxs-video',      label: 'Video',           group: 'video',   cls: 'video',   submit: false },
  other:      { icon: 'bx bx-folder',      label: 'Other',           group: 'other',   cls: 'other',   submit: false }
};
function metaFor(cat){ return typeMeta[cat] || typeMeta.other; }

function levelBadgeClass(level){
  if (level === 'Young Explorers') return 'level-young';
  if (level === 'Junior Innovators') return 'level-junior';
  if (level === 'Teen Innovators') return 'level-teen';
  return 'level-all';
}

/* ---------- date helpers (deadlines are plain 'YYYY-MM-DD' strings, inclusive) ---------- */
function todayStr(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtDay(str){
  if (!str) return '';
  const [y,m,d] = str.split('-').map(Number);
  return new Date(y, m-1, d).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}
function fmtStamp(ts){
  const d = toDate(ts);
  return d ? d.toLocaleString('en-GB', { day:'numeric', month:'short', hour:'numeric', minute:'2-digit' }) : '';
}
function numFmt(n){ return Number.isInteger(n) ? String(n) : String(Math.round(n*100)/100); }

/* =========================================================
   STATE
   ========================================================= */
let allResources = [];
let allStudents = [];                 // approved, non-blocked students (for the "not submitted" list)
let subsByResource = new Map();       // resourceId -> [submission docs]
let currentFilter = 'all';
let currentSearch = '';
const gridEl = document.getElementById('resourceGrid');

function subsOf(resId){ return subsByResource.get(resId) || []; }
function pendingOf(resId){ return subsOf(resId).filter(s => s.status === 'pending').length; }
function totalPending(){ let n = 0; subsByResource.forEach(list => list.forEach(s => { if (s.status === 'pending') n++; })); return n; }

function render(){
  const pendingTotal = totalPending();
  const rc = document.getElementById('reviewCount');
  rc.textContent = pendingTotal; rc.hidden = pendingTotal === 0;

  const filtered = allResources.filter(r => {
    const meta = metaFor(r.category);
    let matchesCat = true;
    if (currentFilter === 'submit') matchesCat = r.requiresSubmission === true;
    else if (currentFilter === 'review') matchesCat = pendingOf(r.id) > 0;
    else if (currentFilter !== 'all') matchesCat = meta.group === currentFilter;
    const matchesSearch = !currentSearch ||
      (r.title || '').toLowerCase().includes(currentSearch) ||
      (r.description || '').toLowerCase().includes(currentSearch);
    return matchesCat && matchesSearch;
  });

  if (!filtered.length){
    const what = currentFilter === 'review' ? 'Nothing is waiting for review — all caught up.' :
      `No resources${currentFilter !== 'all' ? ' in this view' : ''}${currentSearch ? ' match your search' : ''} yet.`;
    gridEl.innerHTML = `<p class="list-empty">${what}</p>`;
    return;
  }

  const today = todayStr();
  gridEl.innerHTML = filtered.map(r => {
    const meta = metaFor(r.category);
    const level = r.level || 'All';
    let chips = '';
    let subsBtn = '';
    if (r.requiresSubmission){
      const closed = r.deadline && r.deadline < today;
      const pend = pendingOf(r.id);
      const list = subsOf(r.id);
      const approved = list.filter(s => s.status === 'approved').length;
      chips = `<div class="res-chips">
        <span class="res-chip ${closed ? 'closed' : 'due'}"><i class="bx bx-time-five"></i> ${closed ? 'Closed' : 'Due'} ${escapeHtml(fmtDay(r.deadline))}</span>
        <span class="res-chip"><i class="bx bx-star"></i> /${escapeHtml(numFmt(r.maxScore || 100))}</span>
        ${pend ? `<span class="res-chip pend"><i class="bx bx-hourglass"></i> ${pend} to review</span>` : ''}
        ${approved ? `<span class="res-chip ok"><i class="bx bx-check"></i> ${approved} graded</span>` : ''}
      </div>`;
      subsBtn = `<button class="subs-btn" data-id="${r.id}" title="Submissions">
        <i class="bx bx-inbox"></i>${pend ? `<span class="pip">${pend}</span>` : ''}</button>`;
    }
    return `
      <div class="resource-card" data-id="${r.id}">
        <div class="resource-icon type-${meta.cls}"><i class="${meta.icon}"></i></div>
        <div class="resource-body">
          <div class="resource-title">${escapeHtml(r.title || 'Untitled resource')}</div>
          ${r.description ? `<div class="resource-desc">${escapeHtml(r.description)}</div>` : ''}
          <span class="level-badge ${levelBadgeClass(level)}">${escapeHtml(level)}</span>
          ${chips}
          <div class="resource-meta">
            <div>
              <span class="resource-date"><i class="bx ${meta.icon.replace(/^bx /,'')}"></i> ${escapeHtml(meta.label)} · ${formatDate(r._date)}</span>
              ${r.uploadedBy ? `<div class="resource-uploader">by ${escapeHtml(r.uploadedBy)}</div>` : ''}
            </div>
            <div class="resource-actions">
              ${subsBtn}
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
  gridEl.querySelectorAll('.subs-btn').forEach(btn => btn.addEventListener('click', () => openSubs(btn.dataset.id)));
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

/* =========================================================
   NOTIFICATIONS — writes into students/{uid}/notifications
   ========================================================= */
async function notifyEligibleStudents(level, { title, message, type, link }){
  try{
    const snap = level === 'All'
      ? await getDocs(collection(db, 'students'))
      : await getDocs(query(collection(db, 'students'), where('membershipLevel', '==', level)));
    await Promise.all(snap.docs.map(d => setDoc(doc(collection(db, 'students', d.id, 'notifications')), {
      title, message: message || '', type, link: link || '',
      read: false,
      createdAt: serverTimestamp()
    })));
  }catch(err){
    console.error('Notification write failed:', err);
  }
}
async function notifyStudent(uid, { title, message, type, link }){
  try{
    await setDoc(doc(collection(db, 'students', uid, 'notifications')), {
      title, message: message || '', type: type || 'resource', link: link || 'resources.html',
      read: false, createdAt: serverTimestamp()
    });
  }catch(err){ console.error('Notification write failed:', err); }
}

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

async function loadStudents(){
  try{
    const snap = await getDocs(collection(db, 'students'));
    allStudents = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(s => s.blocked !== true)
      .sort((a,b) => (a.fullName || '').localeCompare(b.fullName || ''));
    if (subResId) renderSubs();
  }catch(err){ console.error('Could not load students:', err); }
}

/* live feed of every submission — drives pending badges + the review sheet */
let subsErrorShown = false;
onSnapshot(collection(db, 'resourceSubmissions'), (snap) => {
  const map = new Map();
  snap.docs.forEach(d => {
    const s = { id: d.id, ...d.data() };
    if (!s.resourceId) return;
    if (!map.has(s.resourceId)) map.set(s.resourceId, []);
    map.get(s.resourceId).push(s);
  });
  subsByResource = map;
  render();
  if (subResId) renderSubs();
}, (err) => {
  console.error('Submissions listener failed:', err);
  if (!subsErrorShown){ subsErrorShown = true; showToast("Couldn't load submissions — check the Firestore rules for resourceSubmissions."); }
});

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

function wantsSubmission(){ return document.querySelector('input[name="fSubmit"]:checked').value === 'yes'; }
function setSubmitChoice(yes){
  document.querySelector(`input[name="fSubmit"][value="${yes ? 'yes' : 'no'}"]`).checked = true;
  document.getElementById('submitBox').classList.toggle('hidden', !yes);
}
document.querySelectorAll('input[name="fSubmit"]').forEach(r => {
  r.addEventListener('change', () => document.getElementById('submitBox').classList.toggle('hidden', !wantsSubmission()));
});
// picking a type pre-selects the sensible answer (assignment → yes, notes → no); admin can still flip it
document.getElementById('fCategory').addEventListener('change', (e) => {
  if (editingId) return;
  setSubmitChoice(metaFor(e.target.value).submit);
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

function clearFormErrors(){
  ['fTitleErr','fLinkErr','fDeadlineErr','fMaxScoreErr'].forEach(id => document.getElementById(id).classList.add('hidden'));
}

function openNewForm(){
  editingId = null;
  document.getElementById('formTitle').textContent = 'Add Resource';
  document.getElementById('formDeleteBtn').classList.add('hidden');
  resourceForm.reset();
  resetFileDrop();
  setSourceMode('file');
  clearFormErrors();
  document.getElementById('fCategory').value = 'assignment';
  setSubmitChoice(metaFor('assignment').submit);
  document.getElementById('fDeadline').min = todayStr();
  document.getElementById('fDeadline').value = '';
  document.getElementById('fMaxScore').value = 100;
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
  clearFormErrors();

  document.getElementById('fLevel').value = r.level || 'All';
  document.getElementById('fCategory').value = typeMeta[r.category] ? r.category : 'other';
  document.getElementById('fTitle').value = r.title || '';
  document.getElementById('fDescription').value = r.description || '';
  resetFileDrop();

  setSubmitChoice(r.requiresSubmission === true);
  document.getElementById('fDeadline').removeAttribute('min');   // old deadlines may already be past
  document.getElementById('fDeadline').value = r.deadline || '';
  document.getElementById('fMaxScore').value = r.maxScore || 100;

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
  clearFormErrors();
  const title = document.getElementById('fTitle').value.trim();
  if (!title){ document.getElementById('fTitleErr').classList.remove('hidden'); return; }

  const mode = document.querySelector('input[name="fSourceMode"]:checked').value;
  const level = document.getElementById('fLevel').value;
  const category = document.getElementById('fCategory').value;
  const description = document.getElementById('fDescription').value.trim();
  const needsSub = wantsSubmission();

  let deadline = '', maxScore = 100;
  if (needsSub){
    deadline = document.getElementById('fDeadline').value;
    maxScore = parseFloat(document.getElementById('fMaxScore').value);
    if (!deadline){ document.getElementById('fDeadlineErr').classList.remove('hidden'); return; }
    if (!editingId && deadline < todayStr()){
      document.getElementById('fDeadlineErr').textContent = "The deadline can't be in the past.";
      document.getElementById('fDeadlineErr').classList.remove('hidden'); return;
    }
    if (!(maxScore > 0)){ document.getElementById('fMaxScoreErr').classList.remove('hidden'); return; }
  }

  let fileURL = null;
  if (mode === 'link'){
    fileURL = document.getElementById('fLink').value.trim();
    if (!fileURL){ document.getElementById('fLinkErr').classList.remove('hidden'); return; }
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
      const payload = {
        level, category, title, description,
        requiresSubmission: needsSub,
        deadline: needsSub ? deadline : deleteField(),
        maxScore: needsSub ? maxScore : deleteField(),
        updatedBy: operator.username, updatedAt: serverTimestamp()
      };
      if (fileURL) payload.fileURL = fileURL;
      await updateDoc(doc(db, 'resources', editingId), payload);
      showToast('Resource updated');
    } else {
      const data = {
        level, category, title, description, fileURL,
        requiresSubmission: needsSub,
        uploadDate: serverTimestamp(),
        uploadedBy: operator.username
      };
      if (needsSub){ data.deadline = deadline; data.maxScore = maxScore; }
      await setDoc(doc(collection(db, 'resources')), data);
      showToast('Resource added');
      notifyEligibleStudents(level, {
        title: needsSub ? `New ${metaFor(category).label.toLowerCase()}: ${title}` : `New resource: ${title}`,
        message: needsSub
          ? `"${title}" needs your submission — due ${fmtDay(deadline)}. Open it in Resources to submit.`
          : `A new ${metaFor(category).label.toLowerCase()} was just uploaded — "${title}".`,
        type: 'resource',
        link: 'resources.html'
      });
    }

    formModal.classList.remove('open');
    loadResources();
  }catch(err){
    console.error(err);
    showToast("Couldn't save — try again");
  }
  btn.classList.remove('loading'); btn.disabled = false;
});

/* =========================================================
   SUBMISSIONS — review sheet
   ========================================================= */
const subModal = document.getElementById('subModal');
let subResId = null;
let subTab = 'pending';
let openKey = null;           // student uid whose row is expanded
let openForm = null;          // 'approve' | 'decline' for the expanded row

function resById(id){ return allResources.find(r => r.id === id); }
function eligibleStudents(r){
  const lvl = r.level || 'All';
  return allStudents.filter(s => lvl === 'All' || s.membershipLevel === lvl);
}

function openSubs(id){
  subResId = id;
  const r = resById(id);
  subTab = pendingOf(id) > 0 ? 'pending' : (subsOf(id).length ? 'approved' : 'missing');
  openKey = null; openForm = null;
  document.getElementById('subTitle').textContent = r ? r.title : 'Submissions';
  subModal.classList.add('open');
  renderSubs();
}
document.getElementById('subClose').addEventListener('click', () => { subModal.classList.remove('open'); subResId = null; });
document.getElementById('subTabs').querySelectorAll('.sub-tab').forEach(b => b.addEventListener('click', () => {
  subTab = b.dataset.st; openKey = null; openForm = null; renderSubs();
}));

function fileTile(f, i){
  const isImg = (f.type || '').startsWith('image') || /\.(jpe?g|png|gif|webp|heic)(\?|$)/i.test(f.url || '');
  const inner = isImg
    ? `<img src="${escapeHtml(f.url)}" alt="Page ${i+1}" loading="lazy">`
    : `<i class="bx bxs-file"></i><span>${escapeHtml(f.name || 'File')}</span>`;
  return `<a class="file-tile" href="${escapeHtml(f.url)}" target="_blank" rel="noopener"><span class="page-no">${i+1}</span>${inner}</a>`;
}

function renderSubs(){
  if (!subResId) return;
  const r = resById(subResId);
  if (!r) return;
  const list = subsOf(subResId);
  const eligible = eligibleStudents(r);
  const submittedIds = new Set(list.map(s => s.studentId));
  const missing = eligible.filter(s => !submittedIds.has(s.id));
  const max = r.maxScore || 100;
  const today = todayStr();

  document.getElementById('subMeta').innerHTML = `
    <span><i class="bx bx-layer"></i> ${escapeHtml(r.level || 'All')}</span>
    <span><i class="bx bx-time-five"></i> Due ${escapeHtml(fmtDay(r.deadline))}${r.deadline && r.deadline < today ? ' (closed)' : ''}</span>
    <span><i class="bx bx-star"></i> Out of ${escapeHtml(numFmt(max))}</span>`;

  const by = (st) => list.filter(s => s.status === st);
  document.getElementById('stPending').textContent = by('pending').length;
  document.getElementById('stApproved').textContent = by('approved').length;
  document.getElementById('stDeclined').textContent = by('declined').length;
  document.getElementById('stMissing').textContent = missing.length;
  document.querySelectorAll('#subTabs .sub-tab').forEach(b => b.classList.toggle('active', b.dataset.st === subTab));

  const body = document.getElementById('subBody');
  if (subTab === 'missing'){
    if (!missing.length){ body.innerHTML = '<p class="sub-empty">Everyone eligible has submitted.</p>'; return; }
    const closed = r.deadline && r.deadline < today;
    body.innerHTML = missing.map(s => `
      <div class="sub-row"><div class="sub-row-head" style="cursor:default;">
        <span class="sub-avatar">${escapeHtml(initials(s.fullName))}</span>
        <div class="sub-who"><div class="sub-name">${escapeHtml(s.fullName || 'Student')}</div><div class="sub-when">${escapeHtml(s.membershipLevel || '')}</div></div>
        <span class="sub-pill ${closed ? 'late' : 'missing'}">${closed ? 'Missed' : 'Not yet'}</span>
      </div></div>`).join('');
    return;
  }

  const rows = by(subTab).sort((a,b) => (toDate(a.submittedAt)?.getTime() || 0) - (toDate(b.submittedAt)?.getTime() || 0));
  if (!rows.length){
    body.innerHTML = `<p class="sub-empty">${subTab === 'pending' ? 'Nothing waiting for review.' : `No ${subTab} submissions.`}</p>`;
    return;
  }

  body.innerHTML = rows.map(s => {
    const isOpen = openKey === s.studentId;
    const files = Array.isArray(s.files) ? s.files : [];
    const history = Array.isArray(s.history) ? s.history : [];
    let pill = `<span class="sub-pill ${s.status}">${s.status === 'approved' ? `${escapeHtml(numFmt(s.score))}/${escapeHtml(numFmt(s.maxScore || max))}` : s.status === 'pending' ? 'Pending' : 'Declined'}</span>`;

    let statusBlock = '';
    if (s.status === 'approved'){
      statusBlock = `
        <div class="sub-grade-box">
          <div class="big">${escapeHtml(numFmt(s.score))}<span style="font-size:.8rem;color:var(--gray);font-weight:600;"> / ${escapeHtml(numFmt(s.maxScore || max))}</span></div>
          <div class="txt">Approved${s.gradedBy ? ` by ${escapeHtml(s.gradedBy)}` : ''}${s.gradedAt ? ` · ${escapeHtml(fmtStamp(s.gradedAt))}` : ''}${s.feedback ? `<br>“${escapeHtml(s.feedback)}”` : ''}</div>
          <button class="btn btn-ghost" data-act="edit-grade" data-uid="${s.studentId}"><i class="bx bx-edit-alt"></i> Edit grade</button>
        </div>`;
    } else if (s.status === 'declined'){
      statusBlock = `
        <div class="sub-decline-box">
          <b>Declined${s.declinedBy ? ` by ${escapeHtml(s.declinedBy)}` : ''}</b> — ${escapeHtml(s.declineReason || '')}<br>
          Redo deadline: <b>${escapeHtml(fmtDay(s.newDeadline))}</b>${s.newDeadline && s.newDeadline < today ? ' (passed)' : ''}. Waiting for the student to resubmit.
        </div>
        <div class="review-actions"><button class="btn btn-ghost" data-act="show-approve" data-uid="${s.studentId}"><i class="bx bx-check"></i> Approve anyway</button></div>`;
    } else {
      statusBlock = `
        <div class="review-actions">
          <button class="btn btn-success" data-act="show-approve" data-uid="${s.studentId}"><i class="bx bx-check"></i> Approve</button>
          <button class="btn btn-outline-danger" data-act="show-decline" data-uid="${s.studentId}"><i class="bx bx-x"></i> Decline</button>
        </div>`;
    }

    const approveForm = `
      <div class="review-form ${isOpen && openForm === 'approve' ? 'show' : ''}" id="approveForm_${s.studentId}">
        <div class="form-group"><label>Score</label>
          <div class="score-line"><input type="number" step="any" min="0" inputmode="decimal" id="scoreIn_${s.studentId}" value="${s.status === 'approved' ? escapeHtml(s.score) : ''}" placeholder="0"><span>/ ${escapeHtml(numFmt(s.maxScore || max))}</span></div>
          <span class="field-err hidden" id="scoreErr_${s.studentId}"></span></div>
        <div class="form-group"><label>Comment for the student (optional)</label>
          <textarea rows="2" id="fbIn_${s.studentId}" placeholder="Well done…">${escapeHtml(s.feedback || '')}</textarea></div>
        <button class="btn btn-success" data-act="approve" data-uid="${s.studentId}"><i class="bx bx-check-circle"></i> ${s.status === 'approved' ? 'Save grade' : 'Approve &amp; record score'}</button>
      </div>`;
    const declineForm = `
      <div class="review-form ${isOpen && openForm === 'decline' ? 'show' : ''}" id="declineForm_${s.studentId}">
        <div class="form-group"><label>Reason (the student will see this)</label>
          <textarea rows="3" id="reasonIn_${s.studentId}" placeholder="e.g. The photo is blurry — please scan again."></textarea>
          <span class="field-err hidden" id="reasonErr_${s.studentId}">Please give a reason.</span></div>
        <div class="form-group"><label>New deadline to redo it</label>
          <input type="date" id="newDlIn_${s.studentId}" min="${today}">
          <span class="field-err hidden" id="newDlErr_${s.studentId}">Pick a new deadline (today or later).</span></div>
        <button class="btn btn-danger" data-act="decline" data-uid="${s.studentId}"><i class="bx bx-x-circle"></i> Decline &amp; ask to redo</button>
      </div>`;

    return `
      <div class="sub-row ${isOpen ? 'open' : ''}" data-uid="${s.studentId}">
        <button class="sub-row-head" data-toggle="${s.studentId}">
          <span class="sub-avatar">${escapeHtml(initials(s.studentName))}</span>
          <div class="sub-who">
            <div class="sub-name">${escapeHtml(s.studentName || 'Student')}</div>
            <div class="sub-when">${s.submittedAt ? escapeHtml(fmtStamp(s.submittedAt)) : ''}${(s.attempt || 1) > 1 ? ` · attempt ${s.attempt}` : ''} · ${files.length} file${files.length === 1 ? '' : 's'}</div>
          </div>
          ${pill}
          <i class="bx bx-chevron-down sub-chev"></i>
        </button>
        <div class="sub-panel">
          <div class="sub-label">Submitted work</div>
          <div class="file-grid">${files.map(fileTile).join('') || '<span class="sub-when">No files attached.</span>'}</div>
          ${s.note ? `<div class="sub-label">Note from the student</div><div class="sub-note">${escapeHtml(s.note)}</div>` : ''}
          ${history.length ? `<div class="sub-label">Earlier attempts</div><div class="sub-history">${history.map(h => `<div>Declined${h.by ? ` by ${escapeHtml(h.by)}` : ''}: ${escapeHtml(h.reason || '')}</div>`).join('')}</div>` : ''}
          ${statusBlock}
          ${approveForm}
          ${s.status !== 'approved' ? declineForm : ''}
        </div>
      </div>`;
  }).join('');

  body.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
    const uid = b.dataset.toggle;
    openKey = openKey === uid ? null : uid; openForm = null;
    renderSubs();
  }));
  body.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => handleReviewAction(b.dataset.act, b.dataset.uid)));
}

async function handleReviewAction(act, uid){
  const r = resById(subResId);
  if (!r) return;
  const sub = subsOf(subResId).find(s => s.studentId === uid);
  if (!sub) return;
  const subRef = doc(db, 'resourceSubmissions', sub.id);
  const max = sub.maxScore || r.maxScore || 100;

  if (act === 'show-approve' || act === 'edit-grade'){ openKey = uid; openForm = 'approve'; renderSubs(); return; }
  if (act === 'show-decline'){ openKey = uid; openForm = 'decline'; renderSubs(); return; }

  if (act === 'approve'){
    const raw = document.getElementById(`scoreIn_${uid}`).value.trim();
    const err = document.getElementById(`scoreErr_${uid}`);
    const score = parseFloat(raw);
    if (raw === '' || isNaN(score) || score < 0){ err.textContent = 'Enter a score (0 or more).'; err.classList.remove('hidden'); return; }
    if (score > max){ err.textContent = `The score can't be more than ${numFmt(max)}.`; err.classList.remove('hidden'); return; }
    err.classList.add('hidden');
    const feedback = document.getElementById(`fbIn_${uid}`).value.trim();
    const wasApproved = sub.status === 'approved';
    try{
      await updateDoc(subRef, {
        status: 'approved', score, maxScore: max,
        feedback: feedback || deleteField(),
        gradedAt: serverTimestamp(), gradedBy: operator.username,
        declineReason: deleteField(), declinedAt: deleteField(), declinedBy: deleteField(), newDeadline: deleteField()
      });
      showToast(wasApproved ? 'Grade updated' : 'Approved — score recorded');
      notifyStudent(uid, {
        title: wasApproved ? `Grade updated: ${r.title}` : `Approved: ${r.title}`,
        message: `You scored ${numFmt(score)}/${numFmt(max)}.${feedback ? ` “${feedback}”` : ''}`,
        type: 'resource', link: 'resources.html'
      });
      openKey = null; openForm = null;
    }catch(e){ console.error(e); showToast("Couldn't save — try again"); }
    return;
  }

  if (act === 'decline'){
    const reason = document.getElementById(`reasonIn_${uid}`).value.trim();
    const newDl = document.getElementById(`newDlIn_${uid}`).value;
    const reasonErr = document.getElementById(`reasonErr_${uid}`);
    const dlErr = document.getElementById(`newDlErr_${uid}`);
    let bad = false;
    if (!reason){ reasonErr.classList.remove('hidden'); bad = true; } else reasonErr.classList.add('hidden');
    if (!newDl || newDl < todayStr()){ dlErr.classList.remove('hidden'); bad = true; } else dlErr.classList.add('hidden');
    if (bad) return;
    try{
      await updateDoc(subRef, {
        status: 'declined', declineReason: reason, newDeadline: newDl,
        declinedAt: serverTimestamp(), declinedBy: operator.username,
        score: deleteField(), gradedAt: deleteField(), gradedBy: deleteField(), feedback: deleteField()
      });
      showToast('Declined — the student can redo it');
      notifyStudent(uid, {
        title: `Please redo: ${r.title}`,
        message: `${reason} — resubmit by ${fmtDay(newDl)}.`,
        type: 'resource', link: 'resources.html'
      });
      openKey = null; openForm = null;
    }catch(e){ console.error(e); showToast("Couldn't save — try again"); }
  }
}

/* =========================================================
   DELETE (cascades to the resource's submissions)
   ========================================================= */
const deleteModal = document.getElementById('deleteModal');
let pendingDeleteId = null;
function openDeleteConfirm(id){
  pendingDeleteId = id;
  const n = subsOf(id).length;
  document.getElementById('deleteMsg').textContent = n
    ? `Students will no longer see it, and its ${n} submission${n === 1 ? '' : 's'} and grades will be deleted too. This can't be undone.`
    : "Students will no longer see it in their Resources tab. This can't be undone.";
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
    const subSnap = await getDocs(query(collection(db, 'resourceSubmissions'), where('resourceId', '==', pendingDeleteId)));
    if (!subSnap.empty){
      const batch = writeBatch(db);
      subSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
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
loadStudents();
