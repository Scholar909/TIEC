import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, query, where, orderBy, limit, getDocs, Timestamp, onSnapshot
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
   Assumed Firestore schema (adjust names to match the admin
   portal once it's built — this is what the dashboard reads):

   students/{uid}
     fullName, username, email, phone, membershipLevel,
     dateJoined, totalClasses (number, optional — set by admin)

   students/{uid}/attendanceLog/{autoId}
     date (Timestamp), status ('present' | 'absent'), classTitle

   students/{uid}/notifications/{autoId}
     title, message, type, read (bool), createdAt (Timestamp)

   events/{autoId}          — club-wide, admin-managed
     title, date (Timestamp), location, type

   announcements/{autoId}   — club-wide, admin-managed
     title, message, createdAt (Timestamp)
   ========================================================= */

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

/* ---------- small helpers ---------- */
function getInitials(name){
  if (!name) return '--';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '--';
}
function toDate(value){
  if (!value) return null;
  return value instanceof Timestamp ? value.toDate() : (value.toDate ? value.toDate() : new Date(value));
}
function formatDate(d){
  if (!d) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function timeAgo(d){
  if (!d) return '';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}
function renderRows(containerId, rows, emptyText){
  const el = document.getElementById(containerId);
  if (!rows.length){
    el.innerHTML = `<p class="list-empty">${emptyText}</p>`;
    return;
  }
  el.innerHTML = rows.map(r => `
    <div class="list-row">
      <div class="list-row-icon"><i class="${r.icon}"></i></div>
      <div class="list-row-body">
        <div class="list-row-title">${r.title}</div>
        <div class="list-row-meta">${r.meta}</div>
      </div>
    </div>
  `).join('');
}

/* ---------- profile ---------- */
function paintProfile(data){
  const name = data.fullName || 'Explorer';
  const level = data.membershipLevel || 'Member';
  const initials = getInitials(name);
  const firstName = name.split(' ')[0];

  document.getElementById('welcomeName').textContent = `Welcome back, ${firstName}`;
  document.getElementById('welcomeSub').textContent = "Here's what's happening in your club today.";
  document.getElementById('topAvatar').textContent = initials;
  document.getElementById('ddAvatar').textContent = initials;
  document.getElementById('ddName').textContent = name;
  document.getElementById('ddLevel').textContent = level;
  document.getElementById('profileAvatar').textContent = initials;
  document.getElementById('profileName').textContent = name;
  document.getElementById('profileLevel').textContent = level;
}

/* ---------- attendance: week strip + ratio + streak ---------- */
function startOfWeek(d){
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function buildWeekStrip(logByDateKey){
  const dowLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const monday = startOfWeek(new Date());
  const today = new Date(); today.setHours(0,0,0,0);
  const strip = document.getElementById('weekStrip');
  strip.innerHTML = '';

  for (let i = 0; i < 7; i++){
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const key = day.toDateString();
    const status = logByDateKey.get(key);
    const isToday = day.getTime() === today.getTime();
    const isFuture = day.getTime() > today.getTime();

    let stateClass = 'future';
    let icon = '';
    if (!isFuture){
      if (status === 'present'){ stateClass = 'present'; icon = '<i class="bx bx-check"></i>'; }
      else if (status === 'absent'){ stateClass = 'absent'; icon = '<i class="bx bx-x"></i>'; }
      else { stateClass = ''; }
    }

    const dot = document.createElement('div');
    dot.className = `day-dot ${stateClass}${isToday ? ' today' : ''}${isFuture ? ' future' : ''}`;
    dot.innerHTML = `<span class="dow">${dowLabels[i]}</span><span class="circle">${icon}</span>`;
    strip.appendChild(dot);
  }
}
function computeStreak(sortedDescLogs){
  let streak = 0;
  for (const entry of sortedDescLogs){
    if (entry.status === 'present') streak++;
    else break;
  }
  return streak;
}

async function loadAttendance(uid){
  try{
    const snap = await getDocs(collection(db, 'students', uid, 'attendanceLog'));
    const logs = snap.docs
      .map(d => ({ ...d.data(), _date: toDate(d.data().date) }))
      .filter(l => l._date)
      .sort((a, b) => b._date - a._date);

    const logByDateKey = new Map(logs.map(l => [l._date.toDateString(), l.status]));
    buildWeekStrip(logByDateKey);

    const presentCount = logs.filter(l => l.status === 'present').length;
    document.getElementById('streakCount').textContent = computeStreak(logs);

    return presentCount;
  } catch (err){
    console.error('Attendance load failed:', err);
    buildWeekStrip(new Map());
    return 0;
  }
}

/* ---------- events ---------- */
async function loadEvents(){
  try{
    const q = query(
      collection(db, 'events'),
      where('date', '>=', Timestamp.fromDate(new Date())),
      orderBy('date', 'asc'),
      limit(3)
    );
    const snap = await getDocs(q);
    const rows = snap.docs.map(d => {
      const ev = d.data();
      const date = toDate(ev.date);
      return { icon: 'bx bx-calendar-event', title: ev.title || 'Untitled event', meta: `${formatDate(date)}${ev.location ? ' · ' + ev.location : ''}` };
    });
    renderRows('eventsList', rows, 'No upcoming events right now — check back soon.');
  } catch (err){
    console.error('Events load failed:', err);
    renderRows('eventsList', [], 'Couldn\u2019t load events right now.');
  }
}

/* ---------- announcements ---------- */
async function loadAnnouncements(){
  try{
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(3));
    const snap = await getDocs(q);
    const rows = snap.docs.map(d => {
      const a = d.data();
      return { icon: 'bx bx-megaphone', title: a.title || 'Announcement', meta: timeAgo(toDate(a.createdAt)) };
    });
    renderRows('announcementsList', rows, 'No announcements yet.');
  } catch (err){
    console.error('Announcements load failed:', err);
    renderRows('announcementsList', [], 'Couldn\u2019t load announcements right now.');
  }
}

/* ---------- notifications ---------- */
const notifIcons = {
  event: 'bx bx-calendar-event',
  resource: 'bx bx-folder-open',
  announcement: 'bx bx-megaphone',
  badge: 'bx bxs-medal',
  attendance: 'bx bx-calendar-check'
};
async function loadNotifications(uid){
  try{
    const q = query(collection(db, 'students', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(4));
    const snap = await getDocs(q);
    const rows = [];
    let unread = 0;
    snap.docs.forEach(d => {
      const n = d.data();
      if (!n.read) unread++;
      rows.push({ icon: notifIcons[n.type] || 'bx bx-bell', title: n.title || 'Notification', meta: timeAgo(toDate(n.createdAt)) });
    });

    renderRows('notificationsList', rows, 'You\u2019re all caught up.');
    renderRows('bellList', rows, 'No notifications yet.');
    document.getElementById('bellBadge').hidden = unread === 0;
  } catch (err){
    console.error('Notifications load failed:', err);
    renderRows('notificationsList', [], 'Couldn\u2019t load notifications right now.');
    renderRows('bellList', [], 'No notifications yet.');
  }
}

/* ---------- attendance ratio / percentage ---------- */
function paintAttendanceSummary(presentCount, totalClasses){
  const ratioEl = document.getElementById('attendanceRatio');
  const pctEl = document.getElementById('attendancePct');
  if (typeof totalClasses === 'number' && totalClasses > 0){
    ratioEl.textContent = `${presentCount}/${totalClasses}`;
    pctEl.textContent = `${Math.round((presentCount / totalClasses) * 100)}%`;
  } else {
    ratioEl.textContent = `${presentCount}/–`;
    pctEl.textContent = '–%';
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

  // Live guard: force sign-out if this account gets blocked or deleted while active.
  onSnapshot(doc(db, 'students', user.uid), (guardSnap) => {
    if (!guardSnap.exists() || guardSnap.data().blocked === true){
      signOut(auth).finally(() => { window.location.href = 'student-login.html?blocked=1'; });
    }
  });

  try{
    const studentSnap = await getDoc(doc(db, 'students', user.uid));
    const data = studentSnap.exists() ? studentSnap.data() : { fullName: user.displayName };
    paintProfile(data);

    const [presentCount] = await Promise.all([
      loadAttendance(user.uid),
      loadEvents(),
      loadAnnouncements(),
      loadNotifications(user.uid)
    ]);

    paintAttendanceSummary(presentCount, data.totalClasses);
  } catch (err){
    console.error('Dashboard load failed:', err);
  }
});
