// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Additional SDKs used on this page (Auth + Firestore)
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, query, where, orderBy, getDocs, limit, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDBRvD87vNdWMS1wvufAd_RNZhuCf2CN4g",
  authDomain: "the-innovative-explorer-club.firebaseapp.com",
  projectId: "the-innovative-explorer-club",
  storageBucket: "the-innovative-explorer-club.firebasestorage.app",
  messagingSenderId: "421600505981",
  appId: "1:421600505981:web:6a633ef8b98b4a6f990114"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* =========================================================
   Assumed Firestore schema this page reads / writes:

   (see js/admin/resources.js for the full resources + resourceSubmissions schema)

   resources/{autoId}   — club-wide, admin-managed, same data
                           for every student (no per-user copy)
     title, description, category ('pdf' | 'assignment' |
     'video' | 'other'), fileURL, uploadDate (Timestamp)
   ========================================================= */

let allResources = [];
let currentFilter = 'all';
let currentSearch = '';

/* ---------- theme (persisted) ---------- */
const themeToggle = document.getElementById('themeToggle');
function paintThemeIcon(){
  const light = document.documentElement.classList.contains('light-mode');
  themeToggle.innerHTML = light ? '<i class="bx bx-sun"></i>' : '<i class="bx bx-moon"></i>';
}
paintThemeIcon();
themeToggle.addEventListener('click', () => {
  document.documentElement.classList.toggle('light-mode');
  const light = document.documentElement.classList.contains('light-mode');
  try { localStorage.setItem('iec-theme', light ? 'light' : 'dark'); } catch (e) {}
  paintThemeIcon();
});

/* ---------- sidebar (mobile off-canvas) ---------- */
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('sidebarBackdrop');
const hamburger = document.getElementById('hamburger');
function openSidebar(){ sidebar.classList.add('open'); backdrop.classList.add('show'); }
function closeSidebar(){ sidebar.classList.remove('open'); backdrop.classList.remove('show'); }
hamburger.addEventListener('click', () => {
  sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});
backdrop.addEventListener('click', closeSidebar);

/* ---------- dropdowns (bell + avatar) ---------- */
function wireDropdown(btnId, panelId){
  const btn = document.getElementById(btnId);
  const panel = document.getElementById(panelId);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = !panel.classList.contains('open');
    document.querySelectorAll('.dropdown-panel.open').forEach(p => p.classList.remove('open'));
    if (willOpen) panel.classList.add('open');
  });
}
wireDropdown('bellBtn', 'bellDropdown');
wireDropdown('avatarBtn', 'avatarDropdown');
document.addEventListener('click', () => {
  document.querySelectorAll('.dropdown-panel.open').forEach(p => p.classList.remove('open'));
});

/* ---------- logout ---------- */
async function logout(){
  try { await signOut(auth); } finally { window.location.href = 'student-login.html'; }
}
document.getElementById('logoutBtnSide').addEventListener('click', logout);
document.getElementById('logoutBtnTop').addEventListener('click', logout);

/* ---------- notifications bell preview ---------- */
async function loadNotificationsPreview(studentUid){
  try{
    const q = query(collection(db, 'students', studentUid, 'notifications'), orderBy('createdAt', 'desc'), limit(4));
    const snap = await getDocs(q);
    const list = document.getElementById('bellList');
    let unread = 0;
    if (snap.empty){
      list.innerHTML = '<p class="dropdown-empty">No notifications yet.</p>';
      document.getElementById('bellBadge').hidden = true;
      return;
    }
    list.innerHTML = snap.docs.map(d => {
      const n = d.data();
      if (!n.read) unread++;
      return `<div class="notif-row"><i class="bx bx-bell"></i><div><div class="notif-title">${n.title || 'Notification'}</div><div class="notif-time">${n.read ? '' : 'New'}</div></div></div>`;
    }).join('');
    document.getElementById('bellBadge').hidden = unread === 0;
  } catch (err){
    console.error('Notifications preview failed:', err);
  }
}

/* ---------- helpers ---------- */
function getInitials(name){
  if (!name) return '--';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '--';
}
function toDate(value){
  if (!value) return null;
  return value.toDate ? value.toDate() : new Date(value);
}
function formatDate(d){
  if (!d) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
let studentLevel = 'All';
function paintIdentity(data){
  const name = data.fullName || 'Explorer';
  studentLevel = data.membershipLevel || 'All';
  const initials = getInitials(name);
  document.getElementById('topAvatar').textContent = initials;
  document.getElementById('ddAvatar').textContent = initials;
  document.getElementById('ddName').textContent = name;
  document.getElementById('ddLevel').textContent = data.membershipLevel || 'Member';
}

/* =========================================================
   RESOURCES + SUBMISSIONS
   ========================================================= */
// Same Cloudinary account the admin Resources page uploads to (unsigned preset).
const CLOUDINARY_CLOUD_NAME = 'dejkcjvw';
const CLOUDINARY_UPLOAD_PRESET = 'tiec uploads';

const typeMeta = {
  assignment: { icon: 'bx bx-task',        label: 'Assignment',       group: 'tasks',   cls: 'tasks',   action: 'Open',     actionIcon: 'bx bx-link-external' },
  homework:   { icon: 'bx bx-pencil',      label: 'Homework',         group: 'tasks',   cls: 'tasks',   action: 'Open',     actionIcon: 'bx bx-link-external' },
  exercise:   { icon: 'bx bx-edit',        label: 'Exercise',         group: 'tasks',   cls: 'tasks',   action: 'Open',     actionIcon: 'bx bx-link-external' },
  practical:  { icon: 'bx bx-wrench',      label: 'Practical Task',   group: 'tasks',   cls: 'tasks',   action: 'Open',     actionIcon: 'bx bx-link-external' },
  project:    { icon: 'bx bx-rocket',      label: 'Project',          group: 'tasks',   cls: 'tasks',   action: 'Open',     actionIcon: 'bx bx-link-external' },
  worksheet:  { icon: 'bx bx-clipboard',   label: 'Worksheet',        group: 'tasks',   cls: 'tasks',   action: 'Open',     actionIcon: 'bx bx-link-external' },
  reading:    { icon: 'bx bx-book-open',   label: 'Reading Material', group: 'reading', cls: 'reading', action: 'Open',     actionIcon: 'bx bx-link-external' },
  notes:      { icon: 'bx bx-notepad',     label: 'Notes',            group: 'reading', cls: 'reading', action: 'Open',     actionIcon: 'bx bx-link-external' },
  pdf:        { icon: 'bx bxs-file-pdf',   label: 'PDF Notes',        group: 'reading', cls: 'pdf',     action: 'Download', actionIcon: 'bx bx-download' },
  pastq:      { icon: 'bx bx-history',     label: 'Past Questions',   group: 'reading', cls: 'reading', action: 'Open',     actionIcon: 'bx bx-link-external' },
  video:      { icon: 'bx bxs-video',      label: 'Video',            group: 'video',   cls: 'video',   action: 'Watch',    actionIcon: 'bx bx-play-circle' },
  other:      { icon: 'bx bx-folder',      label: 'Resource',         group: 'other',   cls: 'other',   action: 'Open',     actionIcon: 'bx bx-link-external' }
};
function metaFor(cat){ return typeMeta[cat] || typeMeta.other; }

function escapeHtml(str){ const d = document.createElement('div'); d.textContent = str == null ? '' : String(str); return d.innerHTML; }
function numFmt(n){ return Number.isInteger(n) ? String(n) : String(Math.round(n*100)/100); }
function todayStr(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function parseDay(str){ const [y,m,d] = str.split('-').map(Number); return new Date(y, m-1, d); }
function fmtDay(str){ return str ? parseDay(str).toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' }) : ''; }
function daysLeft(str){ return Math.round((parseDay(str) - parseDay(todayStr())) / 86400000); }

let toastTimer;
function showToast(msg){
  const el = document.getElementById('subToast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

let studentUid = null;
let studentName = '';
let mySubs = new Map();     // resourceId -> my submission doc

/* What state is this resource in, for THIS student?
   todo      — needs work, deadline still open
   missed    — never submitted and the deadline has passed
   pending   — submitted, waiting for review
   approved  — graded
   declined  — sent back; `open` says whether the redo deadline is still running */
function stateOf(r){
  if (r.requiresSubmission !== true) return null;
  const sub = mySubs.get(r.id);
  const today = todayStr();
  if (!sub){
    const open = !r.deadline || today <= r.deadline;
    return { kind: open ? 'todo' : 'missed', deadline: r.deadline, open };
  }
  if (sub.status === 'approved') return { kind: 'approved', sub };
  if (sub.status === 'declined'){
    const open = !!sub.newDeadline && today <= sub.newDeadline;
    return { kind: 'declined', sub, open, deadline: sub.newDeadline };
  }
  const due = sub.dueDate || r.deadline;
  return { kind: 'pending', sub, open: !due || today <= due, deadline: due };
}
const needsAction = (st) => st && (st.kind === 'todo' || (st.kind === 'declined' && st.open));

function stripFor(r, st){
  if (!st) return '';
  const max = numFmt(r.maxScore || 100);
  let chip = '', extra = '', btn = '';
  if (st.kind === 'todo'){
    const left = daysLeft(st.deadline);
    const urgent = left <= 1;
    chip = `<span class="sub-chip ${urgent ? 'urgent' : 'todo'}"><i class="bx bx-time-five"></i> ${left === 0 ? 'Due today' : left === 1 ? 'Due tomorrow' : `Due ${escapeHtml(fmtDay(st.deadline))}`}</span>`;
    btn = `<button class="sub-btn primary" data-open="${r.id}"><i class="bx bx-upload"></i> Submit work</button>`;
  } else if (st.kind === 'missed'){
    chip = `<span class="sub-chip missed"><i class="bx bx-x-circle"></i> Deadline passed (${escapeHtml(fmtDay(st.deadline))})</span>`;
  } else if (st.kind === 'pending'){
    chip = `<span class="sub-chip pending"><i class="bx bx-hourglass"></i> Submitted — awaiting review</span>`;
    btn = `<button class="sub-btn ghost" data-open="${r.id}"><i class="bx bx-show"></i> View${st.open ? ' / replace' : ''}</button>`;
  } else if (st.kind === 'approved'){
    chip = `<span class="sub-chip approved"><i class="bx bx-check-circle"></i> Approved · ${escapeHtml(numFmt(st.sub.score))}/${escapeHtml(numFmt(st.sub.maxScore || r.maxScore || 100))}</span>`;
    btn = `<button class="sub-btn ghost" data-open="${r.id}"><i class="bx bx-show"></i> View</button>`;
  } else if (st.kind === 'declined'){
    chip = st.open
      ? `<span class="sub-chip declined"><i class="bx bx-revision"></i> Redo by ${escapeHtml(fmtDay(st.deadline))}</span>`
      : `<span class="sub-chip declined"><i class="bx bx-x-circle"></i> Declined — redo deadline passed</span>`;
    extra = st.sub.declineReason ? `<div class="sub-reason">${escapeHtml(st.sub.declineReason)}</div>` : '';
    btn = st.open
      ? `<button class="sub-btn primary" data-open="${r.id}"><i class="bx bx-upload"></i> Redo &amp; resubmit</button>`
      : `<button class="sub-btn ghost" data-open="${r.id}"><i class="bx bx-show"></i> View</button>`;
  }
  return `<div class="sub-strip">${chip}${extra}${btn}<span style="font-size:.66rem;color:var(--gray);">Marked out of ${escapeHtml(max)}</span></div>`;
}

function renderResources(){
  const grid = document.getElementById('resourceGrid');
  const emptyState = document.getElementById('emptyState');

  const todoN = allResources.filter(r => needsAction(stateOf(r))).length;
  const tc = document.getElementById('todoCount');
  tc.textContent = todoN; tc.hidden = todoN === 0;

  const filtered = allResources.filter(r => {
    const meta = metaFor(r.category);
    let matchesCat = true;
    if (currentFilter === 'todo') matchesCat = needsAction(stateOf(r));
    else if (currentFilter !== 'all') matchesCat = meta.group === currentFilter;
    const matchesSearch = !currentSearch ||
      (r.title || '').toLowerCase().includes(currentSearch) ||
      (r.description || '').toLowerCase().includes(currentSearch);
    return matchesCat && matchesSearch;
  });

  if (!filtered.length){
    grid.innerHTML = '';
    emptyState.innerHTML = currentFilter === 'todo'
      ? '<i class="bx bx-check-circle"></i> Nothing to submit right now — you\'re all caught up.'
      : '<i class="bx bx-folder-open"></i> No resources found. Try a different filter or search term.';
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  grid.innerHTML = filtered.map(r => {
    const meta = metaFor(r.category);
    const st = stateOf(r);
    return `
      <div class="resource-card">
        <div class="resource-icon type-${meta.cls}"><i class="${meta.icon}"></i></div>
        <div class="resource-body">
          <div class="resource-title">${escapeHtml(r.title || 'Untitled resource')}</div>
          <div class="resource-desc">${escapeHtml(r.description || '')}</div>
          <div class="resource-meta">
            <span class="resource-date"><i class="bx bx-calendar"></i> ${escapeHtml(meta.label)} · ${formatDate(r._date)}</span>
            <a class="resource-action" href="${escapeHtml(r.fileURL || '#')}" target="_blank" rel="noopener" title="${meta.action}">
              <i class="${meta.actionIcon}"></i> ${meta.action}
            </a>
          </div>
          ${stripFor(r, st)}
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openSheet(b.dataset.open)));
}

async function loadResources(){
  try{
    const q = query(collection(db, 'resources'), orderBy('uploadDate', 'desc'));
    const snap = await getDocs(q);
    allResources = snap.docs
      .map(d => {
        const r = d.data();
        return { id: d.id, ...r, _date: toDate(r.uploadDate) };
      })
      // A resource with no level set is treated as club-wide ('All'),
      // same as resources explicitly marked 'All'.
      .filter(r => !r.level || r.level === 'All' || r.level === studentLevel);
    renderResources();
  } catch (err){
    console.error('Resources load failed:', err);
    allResources = [];
    renderResources();
  }
}

/* live feed of MY submissions — approvals / declines show up instantly */
function watchMySubmissions(uid){
  onSnapshot(query(collection(db, 'resourceSubmissions'), where('studentId', '==', uid)), (snap) => {
    const map = new Map();
    snap.docs.forEach(d => { const s = { id: d.id, ...d.data() }; map.set(s.resourceId, s); });
    mySubs = map;
    renderResources();
    if (sheetResId) renderSheet();
  }, (err) => console.error('Submission listener failed:', err));
}

/* ---------- filter tabs ---------- */
document.getElementById('filterTabs').querySelectorAll('.filter-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.cat;
    renderResources();
  });
});

/* ---------- search ---------- */
document.getElementById('searchInput').addEventListener('input', (e) => {
  currentSearch = e.target.value.trim().toLowerCase();
  renderResources();
});

/* =========================================================
   SUBMIT-WORK SHEET (snap / scan / choose files)
   ========================================================= */
const MAX_FILES = 12;
const MAX_DOC_BYTES = 10 * 1024 * 1024;
const overlay = document.getElementById('subOverlay');
let sheetResId = null;
let staged = [];            // [{ file, url (object URL), isImage, name }]
let uploading = false;

function closeSheet(){
  if (uploading) return;
  staged.forEach(s => URL.revokeObjectURL(s.url));
  staged = []; sheetResId = null;
  overlay.classList.remove('open');
}
document.getElementById('subSheetClose').addEventListener('click', closeSheet);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(); });

function openSheet(resId){
  sheetResId = resId;
  staged.forEach(s => URL.revokeObjectURL(s.url));
  staged = [];
  overlay.classList.add('open');
  renderSheet();
}

function canWork(st){ return st && ((st.kind === 'todo') || (st.kind === 'declined' && st.open) || (st.kind === 'pending' && st.open)); }

function filesView(files){
  return `<div class="page-grid">${files.map((f,i) => {
    const isImg = (f.type || '').startsWith('image') || /\.(jpe?g|png|gif|webp|heic)(\?|$)/i.test(f.url || '');
    return `<a class="page-tile" href="${escapeHtml(f.url)}" target="_blank" rel="noopener"><span class="no">${i+1}</span>${isImg ? `<img src="${escapeHtml(f.url)}" alt="Page ${i+1}" loading="lazy">` : `<i class="bx bxs-file ft"></i><span class="nm">${escapeHtml(f.name || 'File')}</span>`}</a>`;
  }).join('')}</div>`;
}

function renderSheet(){
  const r = allResources.find(x => x.id === sheetResId);
  if (!r){ closeSheet(); return; }
  const st = stateOf(r);
  if (!st){ closeSheet(); return; }
  const max = numFmt(r.maxScore || 100);
  document.getElementById('subSheetTitle').textContent = r.title || 'Submit work';
  const dl = st.kind === 'declined' ? st.deadline : (st.kind === 'pending' ? st.deadline : r.deadline);
  document.getElementById('subSheetMeta').innerHTML =
    `<span><i class="bx bx-time-five"></i> ${st.kind === 'declined' ? 'Redo by' : 'Due'} ${escapeHtml(fmtDay(dl))}</span><span><i class="bx bx-star"></i> Out of ${escapeHtml(max)}</span>`;

  const body = document.getElementById('subSheetBody');
  let html = '';
  const sub = st.sub;

  if (st.kind === 'approved'){
    html += `<div class="sheet-box good"><div class="big">${escapeHtml(numFmt(sub.score))}<span style="font-size:.85rem;color:var(--gray);font-weight:600;"> / ${escapeHtml(numFmt(sub.maxScore || r.maxScore || 100))}</span></div>
      Approved${sub.gradedBy ? ` by <b>${escapeHtml(sub.gradedBy)}</b>` : ''}.${sub.feedback ? `<br>“${escapeHtml(sub.feedback)}”` : ''}</div>`;
  } else if (st.kind === 'declined'){
    html += `<div class="sheet-box bad"><b>Sent back for a redo.</b><br>${escapeHtml(sub.declineReason || '')}<br>
      ${st.open ? `Resubmit by <b>${escapeHtml(fmtDay(st.deadline))}</b> — you can still submit on that day.` : `The redo deadline (<b>${escapeHtml(fmtDay(st.deadline))}</b>) has passed, so submitting is closed.`}</div>`;
  } else if (st.kind === 'pending'){
    html += `<div class="sheet-box info"><b>Waiting for review.</b> ${st.open ? 'You can replace your work until the deadline.' : 'The deadline has passed, so this can no longer be changed.'}</div>`;
  } else if (st.kind === 'missed'){
    html += `<div class="sheet-box bad"><b>The deadline has passed</b> (${escapeHtml(fmtDay(st.deadline))}), so submitting is closed. Speak to your teacher if there's a problem.</div>`;
  }

  if (sub && Array.isArray(sub.files) && sub.files.length){
    html += `<div><div class="sheet-label">${st.kind === 'declined' ? 'Your earlier submission' : 'What you submitted'}</div>${filesView(sub.files)}</div>`;
    if (sub.note) html += `<div><div class="sheet-label">Your note</div><div class="sheet-box info" style="color:var(--white);">${escapeHtml(sub.note)}</div></div>`;
  }

  if (canWork(st)){
    const replacing = st.kind === 'pending';
    html += `
      <div>
        <div class="sheet-label">${replacing ? 'Replace with new pages' : 'Add your pages'}</div>
        <div class="cap-row">
          <label class="cap-btn"><i class="bx bx-camera"></i>Snap / scan<small>Open the camera</small>
            <input type="file" id="capCamera" accept="image/*" capture="environment"></label>
          <label class="cap-btn"><i class="bx bx-image-add"></i>Choose files<small>Photos, PDF, Word</small>
            <input type="file" id="capFiles" accept="image/*,application/pdf,.doc,.docx,.ppt,.pptx,.txt" multiple></label>
        </div>
        <div style="font-size:.7rem;color:var(--gray);margin-top:8px;">Tip: photograph each page flat, in good light, so it's easy to read. Up to ${MAX_FILES} pages.</div>
      </div>
      <div id="stagedWrap" ${staged.length ? '' : 'hidden'}>
        <div class="sheet-label">Your pages (<span id="stagedCount">${staged.length}</span>)</div>
        <div class="page-grid" id="stagedGrid"></div>
      </div>
      <div>
        <div class="sheet-label">Note for your teacher (optional)</div>
        <textarea class="note-in" id="subNote" rows="2" placeholder="Anything you'd like them to know…"></textarea>
      </div>
      <div class="progress-bar" id="progBar"><div id="progFill"></div></div>
      <div class="sheet-err" id="sheetErr" hidden></div>
      <button class="sub-btn primary full" id="doSubmit"><i class="bx bx-send"></i> ${replacing ? 'Replace submission' : st.kind === 'declined' ? 'Resubmit' : 'Submit'}</button>`;
  }

  body.innerHTML = html;

  if (canWork(st)){
    paintStaged();
    const addFrom = (input) => input.addEventListener('change', () => { addFiles(Array.from(input.files)); input.value = ''; });
    addFrom(document.getElementById('capCamera'));
    addFrom(document.getElementById('capFiles'));
    document.getElementById('doSubmit').addEventListener('click', () => doSubmit(r));
  }
}

function showSheetErr(msg){
  const el = document.getElementById('sheetErr');
  if (!el) return;
  el.textContent = msg; el.hidden = !msg;
}

function addFiles(files){
  showSheetErr('');
  for (const f of files){
    if (staged.length >= MAX_FILES){ showSheetErr(`You can add up to ${MAX_FILES} pages.`); break; }
    const isImage = (f.type || '').startsWith('image');
    if (!isImage && f.size > MAX_DOC_BYTES){ showSheetErr(`“${f.name}” is over 10 MB — please choose a smaller file.`); continue; }
    staged.push({ file: f, url: URL.createObjectURL(f), isImage, name: f.name });
  }
  paintStaged();
}

function paintStaged(){
  const wrap = document.getElementById('stagedWrap');
  const grid = document.getElementById('stagedGrid');
  if (!wrap || !grid) return;
  wrap.hidden = staged.length === 0;
  document.getElementById('stagedCount').textContent = staged.length;
  grid.innerHTML = staged.map((s, i) => `
    <div class="page-tile"><span class="no">${i+1}</span>
      ${s.isImage ? `<img src="${s.url}" alt="Page ${i+1}">` : `<i class="bx bxs-file ft"></i><span class="nm">${escapeHtml(s.name)}</span>`}
      <button class="rm" data-rm="${i}" aria-label="Remove"><i class="bx bx-x"></i></button>
    </div>`).join('');
  grid.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
    const i = parseInt(b.dataset.rm, 10);
    URL.revokeObjectURL(staged[i].url);
    staged.splice(i, 1);
    paintStaged();
  }));
}

/* shrink big phone photos before upload — keeps uploads fast on mobile data */
async function compressImage(file, maxDim = 1800, quality = 0.82){
  try{
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob) return file;
    return blob.size < file.size ? new File([blob], (file.name || 'page').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  }catch(e){
    return file;   // couldn't decode (e.g. unusual format) — upload the original
  }
}

async function uploadToCloudinary(file){
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error('upload-failed');
  const data = await res.json();
  return data.secure_url;
}

async function doSubmit(r){
  if (uploading) return;
  showSheetErr('');
  const st = stateOf(r);
  if (!canWork(st)){ showSheetErr('Submitting is closed for this one.'); return; }
  // Re-check the clock at the moment of sending — the sheet may have been open since yesterday.
  const due = st.kind === 'todo' ? r.deadline : st.deadline;
  if (due && todayStr() > due){ showSheetErr('The deadline has just passed, so submitting is closed.'); renderResources(); return; }
  if (!staged.length){ showSheetErr('Add at least one page first — snap a photo or choose a file.'); return; }

  uploading = true;
  const btn = document.getElementById('doSubmit');
  const bar = document.getElementById('progBar'), fill = document.getElementById('progFill');
  btn.disabled = true; bar.classList.add('show');
  try{
    const uploaded = [];
    for (let i = 0; i < staged.length; i++){
      btn.innerHTML = `<i class="bx bx-loader-alt bx-spin"></i> Uploading ${i+1} of ${staged.length}…`;
      const s = staged[i];
      const toSend = s.isImage ? await compressImage(s.file) : s.file;
      const url = await uploadToCloudinary(toSend);
      uploaded.push({ url, name: s.name, type: toSend.type || s.file.type || '' });
      fill.style.width = `${Math.round(((i+1) / staged.length) * 100)}%`;
    }

    const prev = mySubs.get(r.id);
    const history = Array.isArray(prev && prev.history) ? [...prev.history] : [];
    let attempt = 1, dueDate = r.deadline || '';
    if (prev){
      if (prev.status === 'declined'){
        history.push({ reason: prev.declineReason || '', by: prev.declinedBy || '', at: toDate(prev.declinedAt) ? toDate(prev.declinedAt).getTime() : Date.now() });
        attempt = (prev.attempt || 1) + 1;
        dueDate = prev.newDeadline || dueDate;
      } else {
        attempt = prev.attempt || 1;
        dueDate = prev.dueDate || dueDate;
      }
    }
    const noteEl = document.getElementById('subNote');
    await setDoc(doc(db, 'resourceSubmissions', `${r.id}_${studentUid}`), {
      resourceId: r.id,
      resourceTitle: r.title || '',
      category: r.category || 'other',
      studentId: studentUid,
      studentName,
      studentLevel,
      files: uploaded,
      note: noteEl ? noteEl.value.trim() : '',
      attempt,
      dueDate,
      maxScore: r.maxScore || 100,
      history,
      status: 'pending',
      submittedAt: serverTimestamp()
    });
    uploading = false;
    showToast('Submitted — your teacher will review it.');
    closeSheet();
  }catch(err){
    console.error('Submit failed:', err);
    uploading = false;
    btn.disabled = false;
    btn.innerHTML = '<i class="bx bx-send"></i> Try again';
    bar.classList.remove('show'); fill.style.width = '0';
    showSheetErr("Couldn't upload — check your connection and try again.");
  }
}

/* =========================================================
   AUTH GUARD + DATA LOAD
   ========================================================= */
onAuthStateChanged(auth, async (user) => {
  if (!user){
    window.location.href = 'student-login.html';
    return;
  }
  studentUid = user.uid;

  // Live guard: force sign-out if this account gets blocked or deleted while active.
  onSnapshot(doc(db, 'students', user.uid), (guardSnap) => {
    if (!guardSnap.exists() || guardSnap.data().blocked === true){
      signOut(auth).finally(() => { window.location.href = 'student-login.html?blocked=1'; });
    }
  });

  try{
    const studentSnap = await getDoc(doc(db, 'students', user.uid));
    const data = studentSnap.exists() ? studentSnap.data() : { fullName: user.displayName };
    studentName = data.fullName || user.displayName || 'Student';
    paintIdentity(data);

    loadResources();
    watchMySubmissions(user.uid);
    loadNotificationsPreview(user.uid);
  } catch (err){
    console.error('Resources page load failed:', err);
  }
});
