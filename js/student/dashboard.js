import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, updateDoc, collection, query, where, orderBy, limit, getDocs, Timestamp, onSnapshot
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
   Firestore schema this dashboard reads (matches the admin
   Calendar & Attendance system — replaces the old
   students/{uid}/attendanceLog + top-level events model):

   occurrences/{occurrenceId}
     activityId, type ('class'|'event'|'competition'|'workshop'|
     'holiday'), title, description, level ('Young Explorers'|
     'Junior Innovators'|'Teen Innovators'|'All'), date
     ('YYYY-MM-DD'), startTime, endTime, attendanceRequired,
     attendanceOverridden

   attendanceRecords/{occurrenceId_studentUid}
     occurrenceId, studentId, date, status ('present'|'absent'),
     markedAt, markedBy

   "Upcoming Events" on this dashboard = occurrences whose
   type is exactly 'event' (not class/competition/workshop/
   holiday), per the club's own definition.

   students/{uid}/notifications/{autoId}
     title, message, type, read (bool), createdAt (Timestamp)

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
/* ---------- per-occurrence status (mirrors attendance.js exactly) ---------- */
function computeOccStatus(occ, recordsByOccId, todayStr){
  if (occ.attendanceRequired === false) return 'no-attendance';
  const record = recordsByOccId.get(occ.id);
  if (record) return record.status;
  if (occ.date > todayStr) return 'future';
  // Attendance can still be taken any time before the day itself ends —
  // today's occurrences stay "not yet held" regardless of scheduled end time.
  if (occ.date === todayStr) return 'future';
  return 'absent';
}

async function loadAttendance(uid, level){
  const todayStr = dateKeyStr(new Date());
  try{
    // Occurrences that are (or were) attendance-eligible for this student's level.
    const [reqSnap, overriddenSnap] = await Promise.all([
      getDocs(query(collection(db, 'occurrences'), where('attendanceRequired', '==', true))),
      getDocs(query(collection(db, 'occurrences'), where('attendanceOverridden', '==', true)))
    ]);
    const byId = new Map();
    [...reqSnap.docs, ...overriddenSnap.docs].forEach(d => byId.set(d.id, { id: d.id, ...d.data() }));
    const occurrences = [...byId.values()].filter(o => o.level === 'All' || o.level === level);

    let recordsByOccId = new Map();
    if (occurrences.length){
      const recSnap = await getDocs(query(collection(db, 'attendanceRecords'), where('studentId', '==', uid)));
      recSnap.forEach(d => { const r = d.data(); recordsByOccId.set(r.occurrenceId, r); });
    }

    const required = occurrences.filter(o => o.attendanceRequired !== false);
    const withStatus = required.map(o => ({ occ: o, status: computeOccStatus(o, recordsByOccId, todayStr) }));
    const decided = withStatus.filter(x => x.status === 'present' || x.status === 'absent');
    const presentCount = decided.filter(x => x.status === 'present').length;

    // week strip: one status per day, priority absent > present > neutral
    const byDate = new Map();
    withStatus.forEach(x => {
      const arr = byDate.get(x.occ.date) || [];
      arr.push(x.status);
      byDate.set(x.occ.date, arr);
    });
    const logByDateKey = new Map();
    byDate.forEach((statuses, dateStr) => {
      const jsDate = new Date(dateStr + 'T00:00:00');
      let s = null;
      if (statuses.includes('absent')) s = 'absent';
      else if (statuses.includes('present')) s = 'present';
      logByDateKey.set(jsDate.toDateString(), s);
    });
    buildWeekStrip(logByDateKey);

    // streak: walk most-recent-first through decided occurrences
    const sortedDesc = [...decided].sort((a, b) => b.occ.date.localeCompare(a.occ.date));
    let streak = 0;
    for (const x of sortedDesc){
      if (x.status === 'present') streak++;
      else break;
    }
    document.getElementById('streakCount').textContent = streak;

    return { presentCount, decidedCount: decided.length };
  } catch (err){
    console.error('Attendance load failed:', err);
    buildWeekStrip(new Map());
    return { presentCount: 0, decidedCount: 0 };
  }
}

/* ---------- events (activities whose type is exactly 'event') ---------- */
function dateKeyStr(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
async function loadEvents(level){
  try{
    const todayStr = dateKeyStr(new Date());
    const q = query(
      collection(db, 'occurrences'),
      where('type', '==', 'event'),
      where('date', '>=', todayStr),
      orderBy('date', 'asc'),
      limit(6)
    );
    const snap = await getDocs(q);
    const rows = snap.docs
      .map(d => d.data())
      .filter(ev => ev.level === 'All' || ev.level === level)
      .slice(0, 3)
      .map(ev => {
        const date = new Date(ev.date + 'T00:00:00');
        return { icon: 'bx bx-calendar-star', title: ev.title || 'Untitled event', meta: `${formatDate(date)}${ev.level && ev.level !== 'All' ? ' · ' + ev.level : ''}` };
      });
    renderRows('eventsList', rows, 'No upcoming events right now — check back soon.');
  } catch (err){
    console.error('Events load failed:', err);
    renderRows('eventsList', [], 'Couldn\u2019t load events right now.');
  }
}

/* ---------- announcement (single, club-wide — glows until seen) ---------- */
function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}
async function loadAnnouncement(uid){
  const el = document.getElementById('announcementsList');
  try{
    const snap = await getDoc(doc(db, 'announcements', 'current'));
    if (!snap.exists()){
      el.innerHTML = '<p class="list-empty">No announcements yet.</p>';
      return;
    }
    const a = snap.data();
    const studentSnap = await getDoc(doc(db, 'students', uid));
    const lastSeen = studentSnap.exists() ? studentSnap.data().lastSeenAnnouncementId : null;
    const isNew = a.postId && a.postId !== lastSeen;

    el.innerHTML = `
      <div class="announcement-card ${isNew ? 'is-new' : ''}" id="announcementCard">
        <div class="announcement-icon"><i class="bx bxs-megaphone"></i></div>
        <div class="announcement-body">
          <div class="announcement-title">${escapeHtml(a.title || 'Announcement')}</div>
          <div class="announcement-message">${escapeHtml(a.message || '')}</div>
          <div class="announcement-time">${timeAgo(toDate(a.postedAt))}</div>
        </div>
        ${isNew ? `<button class="announcement-seen-btn" id="announcementSeenBtn" title="Mark as seen"><i class="bx bx-check"></i></button>` : ''}
      </div>
    `;

    if (isNew){
      document.getElementById('announcementSeenBtn').addEventListener('click', async () => {
        const card = document.getElementById('announcementCard');
        card.classList.remove('is-new');
        card.querySelector('.announcement-seen-btn')?.remove();
        try{
          await updateDoc(doc(db, 'students', uid), { lastSeenAnnouncementId: a.postId });
        } catch (err){
          console.error('Marking announcement seen failed:', err);
        }
      });
    }
  } catch (err){
    console.error('Announcement load failed:', err);
    el.innerHTML = '<p class="list-empty">Couldn\u2019t load the announcement right now.</p>';
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

/* ---------- attendance ratio / percentage ----------
   Denominator excludes "No Attendance" occurrences and future
   ones entirely — only present+absent ("decided") occurrences count. */
function paintAttendanceSummary(presentCount, decidedCount){
  const ratioEl = document.getElementById('attendanceRatio');
  const pctEl = document.getElementById('attendancePct');
  if (decidedCount > 0){
    ratioEl.textContent = `${presentCount}/${decidedCount}`;
    pctEl.textContent = `${Math.round((presentCount / decidedCount) * 100)}%`;
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

    const level = data.membershipLevel || 'All';
    const [attendance] = await Promise.all([
      loadAttendance(user.uid, level),
      loadEvents(level),
      loadAnnouncement(user.uid),
      loadNotifications(user.uid)
    ]);

    paintAttendanceSummary(attendance.presentCount, attendance.decidedCount);
  } catch (err){
    console.error('Dashboard load failed:', err);
  }
});
