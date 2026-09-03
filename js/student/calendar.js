// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, onSnapshot, collection, query, orderBy, getDocs, limit
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
   NEW SCHEMA (replaces the old calendarEvents model)

   occurrences/{occurrenceId}
     activityId, type ('class'|'event'|'competition'|'workshop'|'holiday'),
     title, description, level ('Young Explorers'|'Junior Innovators'|
     'Teen Innovators'|'All'), date ('YYYY-MM-DD'), startTime, endTime
     (optional 'HH:MM'), attendanceRequired, attendanceOverridden

   This is the EVERYTHING calendar — it shows every occurrence the
   student is eligible for by level, regardless of attendanceRequired.
   No Present/Absent information appears here at all (that's the
   separate Attendance page).
   ========================================================= */

let allEvents = []; // [{ ...data, _start: Date, _end: Date }]
let currentFilter = 'all';
let studentLevel = 'All';
const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const dowLabels = ['Su','Mo','Tu','We','Th','Fr','Sa'];
let viewYear, viewMonth;

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
function formatDate(d){
  if (!d) return '';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function formatTime(d){
  if (!d) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function paintIdentity(data){
  const name = data.fullName || 'Explorer';
  studentLevel = data.membershipLevel || 'All';
  const initials = getInitials(name);
  document.getElementById('topAvatar').textContent = initials;
  document.getElementById('ddAvatar').textContent = initials;
  document.getElementById('ddName').textContent = name;
  document.getElementById('ddLevel').textContent = data.membershipLevel || 'Member';
}

/* ---------- turn an occurrence's date+time strings into Date objects ---------- */
function occDateTime(occ, timeStr){
  const [y,m,d] = occ.date.split('-').map(Number);
  if (!timeStr) return new Date(y, m-1, d);
  const [h,min] = timeStr.split(':').map(Number);
  return new Date(y, m-1, d, h, min);
}

/* ---------- Google Calendar link ---------- */
function toGCalStamp(date){
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}
function googleCalendarLink(ev){
  const start = ev._start;
  const end = ev._end || new Date(start.getTime() + 60 * 60 * 1000);
  const dates = ev.allDay
    ? `${start.toISOString().slice(0,10).replace(/-/g,'')}/${end.toISOString().slice(0,10).replace(/-/g,'')}`
    : `${toGCalStamp(start)}/${toGCalStamp(end)}`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title || 'Club Event',
    dates,
    details: ev.description || '',
    location: ev.location || ''
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/* ---------- type icon (for Next Up list) ---------- */
const typeIcons = {
  class: 'bx bx-chalkboard',
  event: 'bx bx-calendar-star',
  competition: 'bx bxs-trophy',
  workshop: 'bx bx-wrench',
  holiday: 'bx bx-sun'
};

/* =========================================================
   FILTER TABS
   ========================================================= */
document.getElementById('filterTabs').querySelectorAll('.filter-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.type;
    renderCalendar();
    clearDayDetail();
  });
});

function filteredEvents(){
  return currentFilter === 'all' ? allEvents : allEvents.filter(ev => ev.type === currentFilter);
}

/* =========================================================
   NEXT UP
   ========================================================= */
function renderNextUp(){
  const list = document.getElementById('nextUpList');
  const empty = document.getElementById('nextUpEmpty');
  const now = new Date();

  const upcoming = filteredEvents()
    .filter(ev => ev._start >= now)
    .sort((a, b) => a._start - b._start)
    .slice(0, 4);

  if (!upcoming.length){
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  list.innerHTML = upcoming.map(ev => `
    <div class="list-row">
      <div class="list-row-icon" style="background:color-mix(in srgb, var(--type-${ev.type || 'event'}) 18%, transparent);color:var(--type-${ev.type || 'event'});">
        <i class="${typeIcons[ev.type] || 'bx bx-calendar'}"></i>
      </div>
      <div class="list-row-body">
        <div class="list-row-title">${ev.title || 'Untitled'}</div>
        <div class="list-row-meta">${formatDate(ev._start)}${ev.allDay ? '' : ' · ' + formatTime(ev._start)}</div>
      </div>
    </div>
  `).join('');
}

/* =========================================================
   CALENDAR
   ========================================================= */
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

  const events = filteredEvents();
  const eventsByDay = new Map();
  events.forEach(ev => {
    const key = ev._start.toDateString();
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key).push(ev);
  });

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
    const dayEvents = eventsByDay.get(key) || [];
    const isToday = dayDate.getTime() === today.getTime();

    const cell = document.createElement('div');
    cell.className = 'cal-day';
    if (isToday) cell.classList.add('today');

    const num = document.createElement('span');
    num.textContent = d;
    cell.appendChild(num);

    if (dayEvents.length){
      cell.classList.add('has-events');
      const dotsWrap = document.createElement('div');
      dotsWrap.className = 'cal-day-dots';
      const uniqueTypes = [...new Set(dayEvents.map(e => e.type || 'event'))].slice(0, 4);
      uniqueTypes.forEach(t => {
        const dot = document.createElement('span');
        dot.className = `type-dot type-${t}`;
        dotsWrap.appendChild(dot);
      });
      cell.appendChild(dotsWrap);
      cell.addEventListener('click', () => selectDay(cell, dayDate, dayEvents));
    }
    grid.appendChild(cell);
  }
}

function clearDayDetail(){
  document.querySelectorAll('.cal-day.selected').forEach(c => c.classList.remove('selected'));
  document.getElementById('dayDetailTitle').textContent = 'Select a date';
  document.getElementById('dayDetailEmpty').hidden = false;
  document.getElementById('dayEventList').innerHTML = '';
}

function selectDay(cell, dayDate, dayEvents){
  document.querySelectorAll('.cal-day.selected').forEach(c => c.classList.remove('selected'));
  cell.classList.add('selected');

  document.getElementById('dayDetailTitle').textContent = formatDate(dayDate);
  document.getElementById('dayDetailEmpty').hidden = true;

  document.getElementById('dayEventList').innerHTML = dayEvents.map(ev => `
    <div class="day-event-item">
      <div class="day-event-top">
        <span class="type-dot type-${ev.type || 'event'}"></span>
        <span class="day-event-title">${ev.title || 'Untitled'}</span>
      </div>
      ${!ev.allDay ? `<div class="day-event-time"><i class="bx bx-time-five"></i> ${formatTime(ev._start)}${ev._end ? ' – ' + formatTime(ev._end) : ''}</div>` : ''}
      ${ev.level && ev.level !== 'All' ? `<div class="day-event-location"><i class="bx bx-group"></i> ${ev.level}</div>` : ''}
      ${ev.description ? `<div class="day-event-desc">${ev.description}</div>` : ''}
      <a class="gcal-link" href="${googleCalendarLink(ev)}" target="_blank" rel="noopener">
        <i class="bx bxl-google"></i> Add to Google Calendar
      </a>
    </div>
  `).join('');
}

document.getElementById('calPrev').addEventListener('click', () => {
  viewMonth--; if (viewMonth < 0){ viewMonth = 11; viewYear--; }
  renderCalendar(); clearDayDetail();
});
document.getElementById('calNext').addEventListener('click', () => {
  viewMonth++; if (viewMonth > 11){ viewMonth = 0; viewYear++; }
  renderCalendar(); clearDayDetail();
});
document.getElementById('calToday').addEventListener('click', () => {
  const today = new Date();
  viewYear = today.getFullYear();
  viewMonth = today.getMonth();
  renderCalendar(); clearDayDetail();
});

/* =========================================================
   LOAD EVENTS — every occurrence this student is eligible for
   by level, regardless of attendance requirement.
   ========================================================= */
async function loadEvents(){
  try{
    const snap = await getDocs(query(collection(db, 'occurrences'), orderBy('date', 'asc')));
    allEvents = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(ev => ev.level === 'All' || ev.level === studentLevel)
      .map(ev => ({
        ...ev,
        allDay: !ev.startTime,
        _start: occDateTime(ev, ev.startTime),
        _end: ev.endTime ? occDateTime(ev, ev.endTime) : null
      }));
  } catch (err){
    console.error('Occurrences load failed:', err);
    allEvents = [];
  }
  renderNextUp();
  renderCalendar();
}

/* =========================================================
   AUTH GUARD + DATA LOAD
   ========================================================= */
onAuthStateChanged(auth, async (user) => {
  if (!user){
    window.location.href = 'student-login.html';
    return;
  }
  const uid = user.uid;

  // Live guard: force sign-out if this account gets blocked or deleted while active.
  onSnapshot(doc(db, 'students', uid), (guardSnap) => {
    if (!guardSnap.exists() || guardSnap.data().blocked === true){
      signOut(auth).finally(() => { window.location.href = 'student-login.html?blocked=1'; });
    }
  });

  const today = new Date();
  viewYear = today.getFullYear();
  viewMonth = today.getMonth();

  try{
    const studentSnap = await getDoc(doc(db, 'students', uid));
    const data = studentSnap.exists() ? studentSnap.data() : { fullName: user.displayName };
    paintIdentity(data);

    loadEvents();
    loadNotificationsPreview(uid);
  } catch (err){
    console.error('Calendar page load failed:', err);
  }
});
