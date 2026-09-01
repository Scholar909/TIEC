import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteField, onSnapshot,
  collection, query, where, orderBy, limit, getDocs, getCountFromServer, Timestamp
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
   AUTH GUARD (same block every admin page must repeat)
   ========================================================= */
const operatorRaw = sessionStorage.getItem('iec_operator');
if (!operatorRaw) {
  window.location.href = 'admin-login.html';
}
const operator = operatorRaw ? JSON.parse(operatorRaw) : null;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    sessionStorage.removeItem('iec_operator');
    window.location.href = 'admin-login.html';
  }
});

onSnapshot(doc(db, 'system', 'activeSession'), (snap) => {
  if (!snap.exists()) return;
  const data = snap.data();
  if (operator && data.username && data.username !== operator.username) {
    sessionStorage.removeItem('iec_operator');
    signOut(auth).finally(() => {
      window.location.href = 'admin-login.html?kicked=1';
    });
  }
});

/* =========================================================
   HELPERS
   ========================================================= */
function initials(name){
  return (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase();
}
function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}
function timeAgo(date){
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

/* =========================================================
   OPERATOR CHROME
   ========================================================= */
if (operator){
  const name = operator.fullName || operator.username;
  const role = operator.role || 'teacher';
  document.getElementById('topAvatar').textContent = initials(name);
  document.getElementById('ddAvatar').textContent = initials(name);
  document.getElementById('ddName').textContent = name;
  document.getElementById('ddRole').textContent = role;
  document.getElementById('profileAvatar').textContent = initials(name);
  document.getElementById('profileName').textContent = name;
  document.getElementById('profileRole').textContent = role;
  document.getElementById('welcomeName').textContent = `Welcome back, ${name.split(' ')[0]}`;
}

/* =========================================================
   THEME (persisted)
   ========================================================= */
const themeToggle = document.getElementById('themeToggle');
themeToggle.innerHTML = document.documentElement.classList.contains('light-mode') ? "<i class='bx bx-sun'></i>" : "<i class='bx bx-moon'></i>";
themeToggle.addEventListener('click', () => {
  document.documentElement.classList.toggle('light-mode');
  const light = document.documentElement.classList.contains('light-mode');
  themeToggle.innerHTML = light ? "<i class='bx bx-sun'></i>" : "<i class='bx bx-moon'></i>";
  try{ localStorage.setItem('iec-theme', light ? 'light' : 'dark'); }catch(e){}
});

/* =========================================================
   SIDEBAR (mobile off-canvas)
   ========================================================= */
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('sidebarBackdrop');
function openSidebar(){ sidebar.classList.add('open'); backdrop.classList.add('show'); }
function closeSidebar(){ sidebar.classList.remove('open'); backdrop.classList.remove('show'); }
document.getElementById('hamburger').addEventListener('click', openSidebar);
backdrop.addEventListener('click', closeSidebar);

/* =========================================================
   DROPDOWNS (bell + avatar)
   ========================================================= */
function setupDropdown(btnId, panelId){
  const btn = document.getElementById(btnId);
  const panel = document.getElementById(panelId);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = panel.classList.contains('open');
    document.querySelectorAll('.dropdown-panel.open').forEach(p => p.classList.remove('open'));
    if (!isOpen) panel.classList.add('open');
  });
}
setupDropdown('bellBtn', 'bellDropdown');
setupDropdown('avatarBtn', 'avatarDropdown');
document.addEventListener('click', () => {
  document.querySelectorAll('.dropdown-panel.open').forEach(p => p.classList.remove('open'));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.dropdown-panel.open').forEach(p => p.classList.remove('open'));
});

/* =========================================================
   SIGN OUT
   ========================================================= */
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
   DASHBOARD DATA
   Implementation assumptions (flag if these don't match your schema):
   - students/{uid}                    → count = Total Students
   - applications/{id}.status          → 'pending' | 'approved' | 'rejected'
   - attendanceRecords/{id}: { date: 'YYYY-MM-DD', status: 'present'|'absent' }
   - events/{id}: { title, date: Timestamp }
   - notifications/{id}: { title, type, createdAt: Timestamp, readBy?: [usernames] }
   ========================================================= */
async function loadStudentsCount(){
  try{
    const snap = await getCountFromServer(collection(db, 'students'));
    document.getElementById('statStudents').textContent = snap.data().count;
  }catch(e){ console.error(e); document.getElementById('statStudents').textContent = '—'; }
}

async function loadAttendanceToday(){
  try{
    const todayStr = new Date().toISOString().slice(0,10);
    const q = query(collection(db, 'attendanceRecords'), where('date', '==', todayStr));
    const snap = await getDocs(q);
    if (snap.empty){ document.getElementById('statAttendance').textContent = '—'; return; }
    let present = 0;
    snap.forEach(d => { if (d.data().status === 'present') present++; });
    document.getElementById('statAttendance').textContent = `${present}/${snap.size}`;
  }catch(e){ console.error(e); document.getElementById('statAttendance').textContent = '—'; }
}

async function loadUpcomingEvents(){
  const listEl = document.getElementById('eventsList');
  try{
    const now = Timestamp.fromDate(new Date());
    const q = query(collection(db, 'events'), where('date', '>=', now), orderBy('date', 'asc'), limit(5));
    const snap = await getDocs(q);
    document.getElementById('statEvents').textContent = snap.size;

    if (snap.empty){
      listEl.innerHTML = '<p class="list-empty">No upcoming events yet.</p>';
      return;
    }
    listEl.innerHTML = '';
    snap.forEach(d => {
      const ev = d.data();
      const when = ev.date && ev.date.toDate ? ev.date.toDate().toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }) : '';
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<span class="list-row-icon"><i class="bx bx-calendar-event"></i></span>
        <span class="list-row-body"><span class="list-row-title">${escapeHtml(ev.title || 'Untitled event')}</span>
        <span class="list-row-meta">${when}</span></span>`;
      listEl.appendChild(row);
    });
  }catch(e){
    console.error(e);
    document.getElementById('statEvents').textContent = '—';
    listEl.innerHTML = '<p class="list-empty">Couldn\'t load events.</p>';
  }
}

async function loadApplications(){
  const listEl = document.getElementById('applicationsList');
  try{
    const snap = await getDocs(query(collection(db, 'applications'), orderBy('submittedAt', 'desc'), limit(50)));
    const counts = { pending:0, approved:0, rejected:0 };
    snap.forEach(d => { const s = d.data().status; if (counts[s] !== undefined) counts[s]++; });

    document.getElementById('countPending').textContent = counts.pending;
    document.getElementById('countApproved').textContent = counts.approved;
    document.getElementById('countRejected').textContent = counts.rejected;

    const total = counts.pending + counts.approved + counts.rejected || 1;
    document.getElementById('segPending').style.flex = counts.pending / total;
    document.getElementById('segApproved').style.flex = counts.approved / total;
    document.getElementById('segRejected').style.flex = counts.rejected / total;

    if (counts.pending > 0){
      const badge = document.getElementById('navBadgeApplications');
      badge.textContent = counts.pending; badge.hidden = false;
    }

    const recent = snap.docs.slice(0, 5);
    if (recent.length === 0){
      listEl.innerHTML = '<p class="list-empty">No applications yet.</p>';
      return;
    }
    listEl.innerHTML = '';
    recent.forEach(d => {
      const a = d.data();
      const when = a.submittedAt && a.submittedAt.toDate ? timeAgo(a.submittedAt.toDate()) : '';
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<span class="list-row-icon"><i class="bx bx-user-plus"></i></span>
        <span class="list-row-body"><span class="list-row-title">${escapeHtml(a.studentName || 'Unnamed applicant')}</span>
        <span class="list-row-meta">${when}</span></span>
        <span class="list-row-pill pill-${a.status || 'pending'}">${escapeHtml(a.status || 'pending')}</span>`;
      listEl.appendChild(row);
    });
  }catch(e){
    console.error(e);
    listEl.innerHTML = '<p class="list-empty">Couldn\'t load applications.</p>';
  }
}

async function loadNotifications(){
  const listEl = document.getElementById('notificationsList');
  const bellListEl = document.getElementById('bellList');
  try{
    const snap = await getDocs(query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(5)));
    if (snap.empty){
      listEl.innerHTML = '<p class="list-empty">No notifications yet.</p>';
      bellListEl.innerHTML = '<p class="dropdown-empty">No notifications yet.</p>';
      return;
    }

    let unread = 0;
    listEl.innerHTML = '';
    bellListEl.innerHTML = '';
    snap.forEach(d => {
      const n = d.data();
      if (!n.readBy || !operator || !n.readBy.includes(operator.username)) unread++;
      const when = n.createdAt && n.createdAt.toDate ? timeAgo(n.createdAt.toDate()) : '';

      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<span class="list-row-icon"><i class="${iconForType(n.type)}"></i></span>
        <span class="list-row-body"><span class="list-row-title">${escapeHtml(n.title || 'Notification')}</span>
        <span class="list-row-meta">${when}</span></span>`;
      listEl.appendChild(row);

      const bellRow = document.createElement('div');
      bellRow.className = 'notif-row';
      bellRow.innerHTML = `<i class="${iconForType(n.type)}"></i>
        <div><div class="notif-title">${escapeHtml(n.title || 'Notification')}</div>
        <div class="notif-time">${when}</div></div>`;
      bellListEl.appendChild(bellRow);
    });

    if (unread > 0){
      document.getElementById('bellBadge').hidden = false;
      const navBadge = document.getElementById('navBadgeNotifications');
      navBadge.textContent = unread; navBadge.hidden = false;
    }
  }catch(e){
    console.error(e);
    listEl.innerHTML = '<p class="list-empty">Couldn\'t load notifications.</p>';
    bellListEl.innerHTML = '<p class="dropdown-empty">Couldn\'t load notifications.</p>';
  }
}
function iconForType(type){
  switch(type){
    case 'application': return 'bx bx-clipboard';
    case 'quiz': return 'bx bx-edit-alt';
    case 'message': return 'bx bx-envelope';
    default: return 'bx bx-bell';
  }
}

loadStudentsCount();
loadAttendanceToday();
loadUpcomingEvents();
loadApplications();
loadNotifications();
