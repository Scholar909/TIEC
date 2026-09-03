// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, query, where, orderBy, getDocs, limit, onSnapshot
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
   NEW SCHEMA (replaces the old students/{uid}/attendanceLog model)

   occurrences/{occurrenceId}
     activityId, type ('class'|'event'|'competition'|'workshop'|'holiday'),
     title, description, level ('Young Explorers'|'Junior Innovators'|
     'Teen Innovators'|'All'), date ('YYYY-MM-DD'), startTime, endTime
     (optional 'HH:MM'), attendanceRequired (bool — current effective
     flag), attendanceOverridden (bool — true once an admin has toggled
     it via the Admin Attendance page)

   attendanceRecords/{occurrenceId_studentUid}
     occurrenceId, studentId, date ('YYYY-MM-DD'), status
     ('present'|'absent'), markedAt, markedBy

   A student is "eligible" for an occurrence when
   occurrence.level === 'All' OR occurrence.level === student.membershipLevel.

   Status shown for an occurrence (see computeStatus()):
     - attendanceRequired === false            -> 'no-attendance'
     - a record exists                          -> record.status
     - date is in the future                    -> 'future'
     - date is today and endTime hasn't passed   -> 'future'
     - otherwise (date has passed, unmarked)     -> 'absent'
   No real "auto-absent" write happens here (no serverless scheduler
   is set up) — this is a live computed display only. Percentage and
   streak below use the same computed status, so they stay accurate
   regardless.
   ========================================================= */

let uid = null;
let studentLevel = 'All';
let occurrences = [];       // this student's eligible, attendance-required-or-was occurrences
let recordsByOccId = new Map();
let todayStr = '';

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
function toDateFromKey(key){
  const [y,m,d] = key.split('-').map(Number);
  return new Date(y, m-1, d);
}
function dateKey(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatDate(d){
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatTimeRange(occ){
  if (!occ.startTime) return '';
  return occ.endTime ? `${occ.startTime} – ${occ.endTime}` : occ.startTime;
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
  studentLevel = level;
  const initials = getInitials(name);
  document.getElementById('topAvatar').textContent = initials;
  document.getElementById('ddAvatar').textContent = initials;
  document.getElementById('ddName').textContent = name;
  document.getElementById('ddLevel').textContent = level;
  document.getElementById('currentLevel').textContent = level;
}

/* =========================================================
   STATUS COMPUTATION
   ========================================================= */
function computeStatus(occ){
  if (occ.attendanceRequired === false) return 'no-attendance';
  const record = recordsByOccId.get(occ.id);
  if (record) return record.status;
  if (occ.date > todayStr) return 'future';
  // Attendance can still be taken any time before the day itself ends, so
  // today's occurrences stay "not yet held" all day regardless of their
  // scheduled end time — only once the calendar date has actually passed
  // does an unmarked occurrence read as absent.
  if (occ.date === todayStr) return 'future';
  return 'absent';
}

/* =========================================================
   STATS (percentage, classes attended, streak)
   ========================================================= */
function paintStats(){
  // Only occurrences currently requiring attendance count toward these numbers —
  // "No Attendance" ones are excluded from the denominator entirely.
  const required = occurrences.filter(o => o.attendanceRequired !== false);
  const withStatus = required.map(o => ({ occ: o, status: computeStatus(o) }));
  const decided = withStatus.filter(x => x.status === 'present' || x.status === 'absent');

  const present = decided.filter(x => x.status === 'present').length;
  const absent = decided.filter(x => x.status === 'absent').length;

  document.getElementById('statPresent').textContent = present;
  document.getElementById('statAbsent').textContent = absent;

  if (decided.length > 0){
    document.getElementById('statRate').textContent = `${Math.round((present / decided.length) * 100)}%`;
    document.getElementById('totalRatio').textContent = `${present}/${decided.length}`;
  } else {
    document.getElementById('statRate').textContent = '–%';
    document.getElementById('totalRatio').textContent = `${present}/–`;
  }

  // Streak: walk decided occurrences most-recent-first; present continues,
  // absent breaks, future/no-attendance are excluded from this list already.
  const sortedDesc = [...decided].sort((a,b) => b.occ.date.localeCompare(a.occ.date));
  let streak = 0;
  for (const x of sortedDesc){
    if (x.status === 'present') streak++;
    else break;
  }
  document.getElementById('statStreak').textContent = streak;
}

/* =========================================================
   CALENDAR
   ========================================================= */
const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const dowLabels = ['Su','Mo','Tu','We','Th','Fr','Sa'];
let viewYear, viewMonth;

function occurrencesForDate(key){
  return occurrences.filter(o => o.date === key);
}

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

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++){
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    grid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++){
    const dayDate = new Date(viewYear, viewMonth, d);
    const key = dateKey(dayDate);
    const dayOccs = occurrencesForDate(key);
    const isToday = key === todayStr;

    const cell = document.createElement('div');
    cell.className = 'cal-day';
    if (isToday) cell.classList.add('today');

    const num = document.createElement('span');
    num.textContent = d;
    cell.appendChild(num);

    if (dayOccs.length){
      cell.classList.add('has-marks');
      const statuses = [...new Set(dayOccs.map(computeStatus))];
      // present and absent both get their own dot (e.g. a day with one present
      // and one absent activity shows a green dot AND a red dot); no-attendance
      // and future occurrences don't add a dot — the day just looks normal.
      const dotStatuses = statuses.filter(s => s === 'present' || s === 'absent');
      if (dotStatuses.length){
        const dotsWrap = document.createElement('div');
        dotsWrap.className = 'cal-day-dots';
        dotStatuses.forEach(s => {
          const dot = document.createElement('span');
          dot.className = `status-dot ${s}`;
          dotsWrap.appendChild(dot);
        });
        cell.appendChild(dotsWrap);
      }
      cell.addEventListener('click', () => selectDay(cell, dayDate, dayOccs));
    }
    grid.appendChild(cell);
  }
}

function statusLabel(status){
  switch(status){
    case 'present': return 'Present';
    case 'absent': return 'Absent';
    case 'no-attendance': return 'No Attendance';
    default: return 'Not yet held';
  }
}
function statusIcon(status){
  switch(status){
    case 'present': return 'bx-check-circle';
    case 'absent': return 'bx-x-circle';
    case 'no-attendance': return 'bx-minus-circle';
    default: return 'bx-time-five';
  }
}

function selectDay(cell, dayDate, dayOccs){
  document.querySelectorAll('.cal-day.selected').forEach(c => c.classList.remove('selected'));
  cell.classList.add('selected');

  const detail = document.getElementById('dayDetail');
  detail.innerHTML = `
    <h4>${formatDate(dayDate)}</h4>
    ${dayOccs.map(o => {
      const status = computeStatus(o);
      return `
        <span class="day-detail-status ${status}">
          <i class="bx ${statusIcon(status)}"></i> ${statusLabel(status)}
        </span>
        <div class="day-detail-class">${o.title || 'Session'}${formatTimeRange(o) ? ' · ' + formatTimeRange(o) : ''}</div>
      `;
    }).join('<div style="height:10px"></div>')}
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
          <span class="badge-date">${formatDate(b.awardedAt && b.awardedAt.toDate ? b.awardedAt.toDate() : null)}</span>
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
      const date = a.date && a.date.toDate ? a.date.toDate() : null;
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
   OCCURRENCES + RECORDS (drives calendar + stats)
   ========================================================= */
async function loadOccurrencesAndRecords(studentUid, level){
  try{
    // All occurrences that are (or were) attendance-eligible.
    // Firestore can't OR two field filters in one query, so run both and merge.
    const [reqSnap, overriddenSnap] = await Promise.all([
      getDocs(query(collection(db, 'occurrences'), where('attendanceRequired', '==', true))),
      getDocs(query(collection(db, 'occurrences'), where('attendanceOverridden', '==', true)))
    ]);
    const byId = new Map();
    [...reqSnap.docs, ...overriddenSnap.docs].forEach(d => byId.set(d.id, { id: d.id, ...d.data() }));

    occurrences = [...byId.values()].filter(o => o.level === 'All' || o.level === level);

    if (occurrences.length === 0){
      recordsByOccId = new Map();
      return;
    }

    const recSnap = await getDocs(query(collection(db, 'attendanceRecords'), where('studentId', '==', studentUid)));
    recordsByOccId = new Map();
    recSnap.forEach(d => {
      const r = d.data();
      recordsByOccId.set(r.occurrenceId, r);
    });
  } catch (err){
    console.error('Occurrences/records load failed:', err);
    occurrences = [];
    recordsByOccId = new Map();
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

  // Live guard: force sign-out if this account gets blocked or deleted while active.
  onSnapshot(doc(db, 'students', uid), (guardSnap) => {
    if (!guardSnap.exists() || guardSnap.data().blocked === true){
      signOut(auth).finally(() => { window.location.href = 'student-login.html?blocked=1'; });
    }
  });

  const today = new Date();
  viewYear = today.getFullYear();
  viewMonth = today.getMonth();
  todayStr = dateKey(today);

  try{
    const studentSnap = await getDoc(doc(db, 'students', uid));
    const data = studentSnap.exists() ? studentSnap.data() : { fullName: user.displayName };
    paintIdentity(data);

    await loadOccurrencesAndRecords(uid, data.membershipLevel || 'All');
    renderCalendar();
    paintStats();

    loadBadges(uid);
    loadTimeline(uid);
    loadNotificationsPreview(uid);
  } catch (err){
    console.error('Attendance page load failed:', err);
  }
});
