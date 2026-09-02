// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Additional SDKs used on this page (Auth + Firestore)
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, updateDoc, writeBatch, onSnapshot, collection, query, orderBy
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
   Assumed Firestore schema:

   students/{uid}/notifications/{autoId}
     title, message,
     type ('event' | 'resource' | 'announcement' | 'badge' |
           'attendance' | 'test' | 'other'),
     link (string, optional — a specific page to open, e.g.
           "test.html?id=xyz"; falls back to a type-based
           default below if not set),
     read (bool), createdAt (Timestamp)
   ========================================================= */

let uid = null;
let allNotifications = []; // [{ id, ...data, _date: Date }]
let currentFilter = 'all';

/* Where each notification type sends the student by default */
const defaultLinks = {
  event: 'calendar.html',
  resource: 'resources.html',
  announcement: 'dashboard.html#announcementsList',
  badge: 'attendance.html#badgeGrid',
  attendance: 'attendance.html#calGrid',
  test: 'lms.html',
  other: 'dashboard.html'
};
const typeIcons = {
  event: 'bx bx-calendar-star',
  resource: 'bx bx-folder-open',
  announcement: 'bx bx-megaphone',
  badge: 'bx bxs-medal',
  attendance: 'bx bx-calendar-check',
  test: 'bx bx-edit-alt',
  other: 'bx bx-bell'
};

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
function timeAgo(d){
  if (!d) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
   RENDER
   ========================================================= */
function renderBellPreview(){
  const list = document.getElementById('bellList');
  const preview = allNotifications.slice(0, 4);
  const unread = allNotifications.filter(n => !n.read).length;

  if (!preview.length){
    list.innerHTML = '<p class="dropdown-empty">No notifications yet.</p>';
  } else {
    list.innerHTML = preview.map(n => `
      <div class="notif-row"><i class="${typeIcons[n.type] || 'bx bx-bell'}"></i>
        <div><div class="notif-title">${n.title || 'Notification'}</div><div class="notif-time">${n.read ? timeAgo(n._date) : 'New'}</div></div>
      </div>
    `).join('');
  }
  document.getElementById('bellBadge').hidden = unread === 0;
}

function renderFilterCount(){
  const unread = allNotifications.filter(n => !n.read).length;
  const badge = document.getElementById('unreadCount');
  badge.hidden = unread === 0;
  badge.textContent = unread;
}

function renderList(){
  const container = document.getElementById('notifList');
  const empty = document.getElementById('emptyState');

  const items = currentFilter === 'unread' ? allNotifications.filter(n => !n.read) : allNotifications;

  if (!items.length){
    container.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  container.innerHTML = items.map(n => `
    <button class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
      <div class="notif-item-icon"><i class="${typeIcons[n.type] || 'bx bx-bell'}"></i></div>
      <div class="notif-item-body">
        <div class="notif-item-top">
          <span class="notif-item-title">${n.title || 'Notification'}</span>
          <span class="notif-item-time">${timeAgo(n._date)}</span>
        </div>
        ${n.message ? `<div class="notif-item-message">${n.message}</div>` : ''}
      </div>
      ${n.read ? '' : '<span class="notif-dot"></span>'}
    </button>
  `).join('');

  container.querySelectorAll('.notif-item').forEach(el => {
    el.addEventListener('click', () => handleNotifClick(el.dataset.id));
  });
}

/* =========================================================
   ACTIONS
   ========================================================= */
async function handleNotifClick(notifId){
  const notif = allNotifications.find(n => n.id === notifId);
  if (!notif) return;

  const destination = notif.link || defaultLinks[notif.type] || 'dashboard.html';

  if (!notif.read){
    try{
      await updateDoc(doc(db, 'students', uid, 'notifications', notifId), { read: true });
    } catch (err){
      console.error('Mark as read failed:', err);
    }
  }

  window.location.href = destination;
}

document.getElementById('markAllBtn').addEventListener('click', async () => {
  const unread = allNotifications.filter(n => !n.read);
  if (!unread.length) return;

  try{
    const batch = writeBatch(db);
    unread.forEach(n => batch.update(doc(db, 'students', uid, 'notifications', n.id), { read: true }));
    await batch.commit();
  } catch (err){
    console.error('Mark all as read failed:', err);
  }
});

document.getElementById('filterTabs').querySelectorAll('.filter-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderList();
  });
});

/* =========================================================
   AUTH GUARD + LIVE DATA
   ========================================================= */
onAuthStateChanged(auth, async (user) => {
  if (!user){
    window.location.href = 'student-login.html';
    return;
  }
  uid = user.uid;

  // Live guard: force sign-out if this account gets blocked or deleted while active.
  onSnapshot(doc(db, 'students', uid), (guardSnap) => {
    if (!guardSnap.exists() || guardSnap.data().blocked === true){
      signOut(auth).finally(() => { window.location.href = 'student-login.html?blocked=1'; });
    }
  });

  try{
    const studentSnap = await getDoc(doc(db, 'students', uid));
    const data = studentSnap.exists() ? studentSnap.data() : { fullName: user.displayName };
    paintIdentity(data);
  } catch (err){
    console.error('Profile load failed:', err);
  }

  // Live feed — updates instantly if the admin pushes a new notification.
  const q = query(collection(db, 'students', uid, 'notifications'), orderBy('createdAt', 'desc'));
  onSnapshot(q, (snap) => {
    allNotifications = snap.docs.map(d => ({ id: d.id, ...d.data(), _date: toDate(d.data().createdAt) }));
    renderBellPreview();
    renderFilterCount();
    renderList();
  }, (err) => {
    console.error('Notifications feed failed:', err);
    document.getElementById('notifList').innerHTML = '';
    document.getElementById('emptyState').hidden = false;
  });
});
