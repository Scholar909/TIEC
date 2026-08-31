import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteField, onSnapshot,
  collection, getCountFromServer, query, where, orderBy, limit, getDocs,
  Timestamp
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
   AUTH GUARD — every admin page should start with this block
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

/* Live watch: if another operator takes over the shared session, kick this tab out. */
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
   OPERATOR CHROME
   ========================================================= */
function initials(name){
  return (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase();
}
if (operator){
  document.getElementById('opAvatar').textContent = initials(operator.fullName);
  document.getElementById('opName').textContent = operator.fullName || operator.username;
  document.getElementById('opRole').textContent = operator.role || 'teacher';
  document.getElementById('welcomeName').textContent = (operator.fullName || operator.username).split(' ')[0]
    ? `Welcome back, ${(operator.fullName || operator.username)}` : 'Welcome back';
}

document.getElementById('todayDate').textContent = new Date().toLocaleDateString('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
});

/* =========================================================
   THEME (persisted)
   ========================================================= */
const themeToggle = document.getElementById('themeToggle');
themeToggle.innerHTML = document.documentElement.classList.contains('light-mode') ? '<i class="fi-lightbulb"></i>' : '<i class="fi-contrast"></i>';
themeToggle.addEventListener('click', () => {
  document.documentElement.classList.toggle('light-mode');
  const light = document.documentElement.classList.contains('light-mode');
  themeToggle.innerHTML = light ? '<i class="fi-lightbulb"></i>' : '<i class="fi-contrast"></i>';
  try{ localStorage.setItem('iec-theme', light ? 'light' : 'dark'); }catch(e){}
});

/* =========================================================
   SIDEBAR (mobile drawer)
   ========================================================= */
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');
function openSidebar(){ sidebar.classList.add('open'); overlay.classList.add('show'); }
function closeSidebar(){ sidebar.classList.remove('open'); overlay.classList.remove('show'); }
document.getElementById('sbOpen').addEventListener('click', openSidebar);
document.getElementById('sbClose').addEventListener('click', closeSidebar);
overlay.addEventListener('click', closeSidebar);

/* =========================================================
   SIGN OUT
   ========================================================= */
const signOutModal = document.getElementById('signOutModal');
document.getElementById('signOutBtn').addEventListener('click', () => signOutModal.classList.add('show'));
document.getElementById('cancelSignOut').addEventListener('click', () => signOutModal.classList.remove('show'));
document.getElementById('confirmSignOut').addEventListener('click', async () => {
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
});

/* =========================================================
   DASHBOARD DATA
   Implementation assumptions (flag if these don't match your schema):
   - students/{uid}                    → count = Total Students
   - applications/{id}.status          → 'pending' | 'approved' | 'rejected'
   - attendanceRecords/{id}: { date: 'YYYY-MM-DD', status: 'present'|'absent' }
   - events/{id}: { title, date: Timestamp, type }
   - notifications/{id}: { title, type, createdAt: Timestamp }, newest first
   ========================================================= */
async function loadStudentsCount(){
  try{
    const snap = await getCountFromServer(collection(db, 'students'));
    document.getElementById('statStudents').textContent = snap.data().count;
  }catch(e){ console.error(e); document.getElementById('statStudents').textContent = '—'; }
}

async function loadPendingApplications(){
  try{
    const q = query(collection(db, 'applications'), where('status', '==', 'pending'));
    const snap = await getCountFromServer(q);
    const count = snap.data().count;
    document.getElementById('statApplications').textContent = count;
    const badge = document.getElementById('badgeApplications');
    if (count > 0){ badge.textContent = count; badge.classList.add('show'); }
  }catch(e){ console.error(e); document.getElementById('statApplications').textContent = '—'; }
}

async function loadAttendanceToday(){
  try{
    const todayStr = new Date().toISOString().slice(0,10);
    const q = query(collection(db, 'attendanceRecords'), where('date', '==', todayStr));
    const snap = await getDocs(q);
    if (snap.empty){
      document.getElementById('statAttendance').textContent = '—';
      return;
    }
    let present = 0;
    snap.forEach(d => { if (d.data().status === 'present') present++; });
    document.getElementById('statAttendance').textContent = `${present}/${snap.size}`;
  }catch(e){ console.error(e); document.getElementById('statAttendance').textContent = '—'; }
}

async function loadUpcomingEvents(){
  try{
    const now = Timestamp.fromDate(new Date());
    const q = query(collection(db, 'events'), where('date', '>=', now), orderBy('date', 'asc'), limit(5));
    const snap = await getDocs(q);
    document.getElementById('statEvents').textContent = snap.size;

    const listEl = document.getElementById('eventList');
    if (snap.empty){
      document.getElementById('statEventsSub').textContent = 'None scheduled';
      listEl.innerHTML = '<li class="notif-empty">No upcoming events yet.</li>';
      return;
    }
    const first = snap.docs[0].data();
    document.getElementById('statEventsSub').textContent = first.title || 'Untitled event';

    listEl.innerHTML = '';
    snap.forEach(d => {
      const ev = d.data();
      const when = ev.date && ev.date.toDate ? ev.date.toDate().toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : '';
      const li = document.createElement('li');
      li.innerHTML = `<span class="item-icon"><i class="fi-calendar"></i></span>
        <span class="item-body"><span class="item-title">${escapeHtml(ev.title || 'Untitled event')}</span>
        <span class="item-meta">${when}</span></span>`;
      listEl.appendChild(li);
    });
  }catch(e){
    console.error(e);
    document.getElementById('statEvents').textContent = '—';
    document.getElementById('eventList').innerHTML = '<li class="notif-empty">Couldn\'t load events.</li>';
  }
}

async function loadRecentNotifications(){
  try{
    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(5));
    const snap = await getDocs(q);
    const listEl = document.getElementById('notifList');
    if (snap.empty){
      listEl.innerHTML = '<li class="notif-empty">No notifications yet.</li>';
      return;
    }
    let unread = 0;
    listEl.innerHTML = '';
    snap.forEach(d => {
      const n = d.data();
      if (!n.readBy || !operator || !n.readBy.includes(operator.username)) unread++;
      const when = n.createdAt && n.createdAt.toDate ? timeAgo(n.createdAt.toDate()) : '';
      const li = document.createElement('li');
      li.innerHTML = `<span class="item-icon"><i class="${iconForType(n.type)}"></i></span>
        <span class="item-body"><span class="item-title">${escapeHtml(n.title || 'Notification')}</span>
        <span class="item-meta">${when}</span></span>`;
      listEl.appendChild(li);
    });
    if (unread > 0){
      const badge = document.getElementById('badgeNotifications');
      badge.textContent = unread; badge.classList.add('show');
      document.getElementById('bellDot').hidden = false;
    }
  }catch(e){
    console.error(e);
    document.getElementById('notifList').innerHTML = '<li class="notif-empty">Couldn\'t load notifications.</li>';
  }
}

function iconForType(type){
  switch(type){
    case 'application': return 'fi-clipboard-notes';
    case 'quiz': return 'fi-book-bookmark';
    case 'message': return 'fi-mail';
    default: return 'fi-alert';
  }
}
function timeAgo(date){
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}
function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

loadStudentsCount();
loadPendingApplications();
loadAttendanceToday();
loadUpcomingEvents();
loadRecentNotifications();
