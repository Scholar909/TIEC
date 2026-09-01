// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Additional SDKs used on this page (Auth + Firestore)
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, query, orderBy, getDocs, limit
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
   Assumed Firestore schema this page reads:

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
function paintIdentity(data){
  const name = data.fullName || 'Explorer';
  const initials = getInitials(name);
  document.getElementById('topAvatar').textContent = initials;
  document.getElementById('ddAvatar').textContent = initials;
  document.getElementById('ddName').textContent = name;
  document.getElementById('ddLevel').textContent = data.membershipLevel || 'Member';
}

/* =========================================================
   RESOURCES
   ========================================================= */
const typeMeta = {
  pdf:        { icon: 'bx bxs-file-pdf',   label: 'PDF Notes',  action: 'Download', actionIcon: 'bx bx-download' },
  assignment: { icon: 'bx bx-task',        label: 'Assignment', action: 'Open',     actionIcon: 'bx bx-link-external' },
  video:      { icon: 'bx bxs-video',      label: 'Video',      action: 'Watch',    actionIcon: 'bx bx-play-circle' },
  other:      { icon: 'bx bx-folder',      label: 'Resource',   action: 'Open',     actionIcon: 'bx bx-link-external' }
};

function renderResources(){
  const grid = document.getElementById('resourceGrid');
  const emptyState = document.getElementById('emptyState');

  const filtered = allResources.filter(r => {
    const matchesCat = currentFilter === 'all' || r.category === currentFilter;
    const matchesSearch = !currentSearch ||
      (r.title || '').toLowerCase().includes(currentSearch) ||
      (r.description || '').toLowerCase().includes(currentSearch);
    return matchesCat && matchesSearch;
  });

  if (!filtered.length){
    grid.innerHTML = '';
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  grid.innerHTML = filtered.map(r => {
    const meta = typeMeta[r.category] || typeMeta.other;
    return `
      <div class="resource-card">
        <div class="resource-icon type-${r.category || 'other'}"><i class="${meta.icon}"></i></div>
        <div class="resource-body">
          <div class="resource-title">${r.title || 'Untitled resource'}</div>
          <div class="resource-desc">${r.description || ''}</div>
          <div class="resource-meta">
            <span class="resource-date"><i class="bx bx-calendar"></i> ${formatDate(r._date)}</span>
            <a class="resource-action" href="${r.fileURL || '#'}" target="_blank" rel="noopener">
              <i class="${meta.actionIcon}"></i> ${meta.action}
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function loadResources(){
  try{
    const q = query(collection(db, 'resources'), orderBy('uploadDate', 'desc'));
    const snap = await getDocs(q);
    allResources = snap.docs.map(d => {
      const r = d.data();
      return { ...r, _date: toDate(r.uploadDate) };
    });
    renderResources();
  } catch (err){
    console.error('Resources load failed:', err);
    allResources = [];
    renderResources();
  }
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
   AUTH GUARD + DATA LOAD
   ========================================================= */
onAuthStateChanged(auth, async (user) => {
  if (!user){
    window.location.href = 'student-login.html';
    return;
  }

  try{
    const studentSnap = await getDoc(doc(db, 'students', user.uid));
    const data = studentSnap.exists() ? studentSnap.data() : { fullName: user.displayName };
    paintIdentity(data);

    loadResources();
    loadNotificationsPreview(user.uid);
  } catch (err){
    console.error('Resources page load failed:', err);
  }
});
