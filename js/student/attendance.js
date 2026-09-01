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

   students/{uid}
     fullName, membershipLevel, totalClasses (number, optional
     — set by admin; percentage shows as "X/–" until it exists)

   students/{uid}/attendanceLog/{autoId}
     date (Timestamp), status ('present' | 'absent'), classTitle

   students/{uid}/badges/{autoId}
     name, icon (a Boxicons class string, e.g. "bx bxs-trophy"),
     description, awardedAt (Timestamp)

   students/{uid}/achievements/{autoId}
     title, description, icon, date (Timestamp)
   ========================================================= */

let uid = null;
let attendanceLogs = []; // [{ _date: Date, status, classTitle }]

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
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function timeAgo(d){
  if (!d) return '';
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return formatDate(d);
}

/* ---------- header identity (topbar / avatar) ---------- */
function paintIdentity(data){
  const name = data.fullName || 'Explorer';
  const level = data.membershipLevel || 'Member';
  const initials = getInitials(name);
  document.getElementById('topAvatar').textContent = initials;
  document.getElementById('ddAvatar').textContent = initials;
  document.getElementById('ddName').textContent = name;
  document.getElementById('ddLevel').textContent = level;
  document.getElementById('currentLevel').textContent = level;
}

/* =========================================================
   STATS
   ========================================================= */
function computeStreak(sortedDescLogs){
  let streak = 0;
  for (const entry of sortedDescLogs){
    if (entry.status === 'present') streak++;
    else break;
  }
  return streak;
}
function paintStats(totalClasses){
  const present = attendanceLogs.filter(l => l.status === 'present').length;
  const absent = attendanceLogs.filter(l => l.status === 'absent').length;
  const sortedDesc = [...attendanceLogs].sort((a, b) => b._date - a._date);

  document.getElementById('statPresent').textContent = present;
  document.getElementById('statAbsent').textContent = absent;
  document.getElementById('statStreak').textContent = computeStreak(sortedDesc);

  if (typeof totalClasses === 'number' && totalClasses > 0){
    document.getElementById('statRate').textContent = `${Math.round((present / totalClasses) * 100)}%`;
    document.getElementById('totalRatio').textContent = `${present}/${totalClasses}`;
  } else {
    document.getElementById('statRate').textContent = '–%';
    document.getElementById('totalRatio').textContent = `${present}/–`;
  }
}

/* =========================================================
   CALENDAR
   ========================================================= */
const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const dowLabels = ['Su','Mo','Tu','We','Th','Fr','Sa'];
let viewYear, viewMonth;

function renderCalendar(){
  const monthLabel = document.getElementById('calMonthLabel');
  const grid = document.getElementById('calGrid');
  monthLabel.textContent = `${monthNames[viewMonth]} ${viewYear}`;
  grid.innerHTML = '';

  dowLabels.forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-dow';
    el.textContent = d;
    grid.appendChild(el);
  });

  const logByDateKey = new Map(attendanceLogs.map(l => [l._date.toDateString(), l]));
  const today = new Date(); today.setHours(0,0,0,0);
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++){
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    grid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++){
    const dayDate = new Date(viewYear, viewMonth, d); dayDate.setHours(0,0,0,0);
    const key = dayDate.toDateString();
    const log = logByDateKey.get(key);
    const isToday = dayDate.getTime() === today.getTime();
    const isFuture = dayDate.getTime() > today.getTime();

    const cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.textContent = d;
    if (isToday) cell.classList.add('today');
    if (isFuture) cell.classList.add('future');
    if (log){
      cell.classList.add(log.status === 'present' ? 'present' : 'absent');
      cell.addEventListener('click', () => selectDay(cell, dayDate, log));
    }
    grid.appendChild(cell);
  }
}

function selectDay(cell, dayDate, log){
  document.querySelectorAll('.cal-day.selected').forEach(c => c.classList.remove('selected'));
  cell.classList.add('selected');

  const detail = document.getElementById('dayDetail');
  detail.innerHTML = `
    <h4>${formatDate(dayDate)}</h4>
    <span class="day-detail-status ${log.status}">
      <i class="bx ${log.status === 'present' ? 'bx-check-circle' : 'bx-x-circle'}"></i>
      ${log.status === 'present' ? 'Present' : 'Absent'}
    </span>
    <div class="day-detail-class">${log.classTitle || 'Class session'}</div>
  `;
}

document.getElementById('calPrev').addEventListener('click', () => {
  viewMonth--; if (viewMonth < 0){ viewMonth = 11; viewYear--; }
  renderCalendar();
});
document.getElementById('calNext').addEventListener('click', () => {
  viewMonth++; if (viewMonth > 11){ viewMonth = 0; viewYear++; }
  renderCalendar();
});

/* =========================================================
   BADGES
   ========================================================= */
async function loadBadges(studentUid){
  const el = document.getElementById('badgeGrid');
  try{
    const q = query(collection(db, 'students', studentUid, 'badges'), orderBy('awardedAt', 'desc'));
    const snap = await getDocs(q);
    if (snap.empty){
      el.innerHTML = '<p class="list-empty">No badges yet — keep showing up and building to earn your first one!</p>';
      return;
    }
    el.innerHTML = snap.docs.map(d => {
      const b = d.data();
      return `
        <div class="badge-item">
          <div class="badge-icon"><i class="${b.icon || 'bx bxs-medal'}"></i></div>
          <span class="badge-name">${b.name || 'Badge'}</span>
          <span class="badge-date">${formatDate(toDate(b.awardedAt))}</span>
        </div>
      `;
    }).join('');
  } catch (err){
    console.error('Badges load failed:', err);
    el.innerHTML = '<p class="list-empty">Couldn\u2019t load badges right now.</p>';
  }
}

/* =========================================================
   ACHIEVEMENT TIMELINE
   ========================================================= */
async function loadTimeline(studentUid){
  const el = document.getElementById('timelineList');
  try{
    const q = query(collection(db, 'students', studentUid, 'achievements'), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    if (snap.empty){
      el.innerHTML = '<p class="list-empty">Your achievements will show up here as you progress.</p>';
      return;
    }
    el.innerHTML = snap.docs.map(d => {
      const a = d.data();
      const date = toDate(a.date);
      return `
        <div class="timeline-item">
          <div class="timeline-dot"><i class="${a.icon || 'bx bx-star'}"></i></div>
          <div class="timeline-body">
            <div class="timeline-title">${a.title || 'Milestone'}</div>
            ${a.description ? `<div class="timeline-desc">${a.description}</div>` : ''}
            <span class="timeline-date">${timeAgo(date)}</span>
          </div>
        </div>
      `;
    }).join('');
  } catch (err){
    console.error('Timeline load failed:', err);
    el.innerHTML = '<p class="list-empty">Couldn\u2019t load your timeline right now.</p>';
  }
}

/* =========================================================
   ATTENDANCE LOG (drives calendar + stats)
   ========================================================= */
async function loadAttendanceLog(studentUid){
  try{
    const snap = await getDocs(collection(db, 'students', studentUid, 'attendanceLog'));
    attendanceLogs = snap.docs
      .map(d => ({ ...d.data(), _date: toDate(d.data().date) }))
      .filter(l => l._date);
  } catch (err){
    console.error('Attendance log load failed:', err);
    attendanceLogs = [];
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
  uid = user.uid;

  const today = new Date();
  viewYear = today.getFullYear();
  viewMonth = today.getMonth();

  try{
    const studentSnap = await getDoc(doc(db, 'students', uid));
    const data = studentSnap.exists() ? studentSnap.data() : { fullName: user.displayName };
    paintIdentity(data);

    await loadAttendanceLog(uid);
    renderCalendar();
    paintStats(data.totalClasses);

    loadBadges(uid);
    loadTimeline(uid);
    loadNotificationsPreview(uid);
  } catch (err){
    console.error('Attendance page load failed:', err);
  }
});
