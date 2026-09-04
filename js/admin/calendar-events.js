import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, onSnapshot,
  collection, query, where, orderBy, getDocs, serverTimestamp
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
   SCHEMA (fresh — replaces the old calendarEvents collection)

   activities/{activityId}
     type, level, attendanceRequired (default), title, description,
     dateMode ('specific'|'range'), date, startDate, endDate,
     repeatDays ([0-6]), timeEnabled, times ({start,end} for specific,
     or {<weekday>: {start,end}} for range), createdBy, createdAt,
     updatedBy, updatedAt

   occurrences/{occurrenceId}
     activityId, type, title, description, level, date ('YYYY-MM-DD'),
     startTime, endTime, attendanceRequired, attendanceOverridden,
     updatedBy, updatedAt
   ========================================================= */

const operatorRaw = sessionStorage.getItem('iec_operator');
if (!operatorRaw) window.location.href = 'admin-login.html';
const operator = operatorRaw ? JSON.parse(operatorRaw) : null;

onAuthStateChanged(auth, (user) => {
  if (!user) { sessionStorage.removeItem('iec_operator'); window.location.href = 'admin-login.html'; }
});
onSnapshot(doc(db, 'system', 'activeSession'), (snap) => {
  if (!snap.exists()) return;
  const data = snap.data();
  if (operator && data.username && data.username !== operator.username) {
    sessionStorage.removeItem('iec_operator');
    signOut(auth).finally(() => { window.location.href = 'admin-login.html?kicked=1'; });
  }
});

/* ---------- helpers ---------- */
function initials(name){ return (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase(); }
function escapeHtml(str){ const d = document.createElement('div'); d.textContent = str == null ? '' : String(str); return d.innerHTML; }
function dateKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmtTime12(t){
  if (!t) return '';
  const [h,m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${period}`;
}
let toastTimer;
function showToast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- operator chrome ---------- */
if (operator){
  const name = operator.fullName || operator.username;
  document.getElementById('topAvatar').textContent = initials(name);
  document.getElementById('ddAvatar').textContent = initials(name);
  document.getElementById('ddName').textContent = name;
  document.getElementById('ddRole').textContent = operator.role || 'teacher';
}
const themeToggle = document.getElementById('themeToggle');
themeToggle.innerHTML = document.documentElement.classList.contains('light-mode') ? "<i class='bx bx-sun'></i>" : "<i class='bx bx-moon'></i>";
themeToggle.addEventListener('click', () => {
  document.documentElement.classList.toggle('light-mode');
  const light = document.documentElement.classList.contains('light-mode');
  themeToggle.innerHTML = light ? "<i class='bx bx-sun'></i>" : "<i class='bx bx-moon'></i>";
  try{ localStorage.setItem('iec-theme', light ? 'light' : 'dark'); }catch(e){}
});
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('sidebarBackdrop');
document.getElementById('hamburger').addEventListener('click', () => {
  sidebar.classList.contains('open') ? (sidebar.classList.remove('open'), backdrop.classList.remove('show')) : (sidebar.classList.add('open'), backdrop.classList.add('show'));
});
backdrop.addEventListener('click', () => { sidebar.classList.remove('open'); backdrop.classList.remove('show'); });
function wireDropdown(btnId, panelId){
  const btn = document.getElementById(btnId); const panel = document.getElementById(panelId);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = !panel.classList.contains('open');
    document.querySelectorAll('.dropdown-panel.open').forEach(p => p.classList.remove('open'));
    if (willOpen) panel.classList.add('open');
  });
}
wireDropdown('bellBtn', 'bellDropdown');
wireDropdown('avatarBtn', 'avatarDropdown');
document.addEventListener('click', () => document.querySelectorAll('.dropdown-panel.open').forEach(p => p.classList.remove('open')));

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
   CALENDAR STATE + RENDER
   ========================================================= */
const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const dowLabels = ['Su','Mo','Tu','We','Th','Fr','Sa'];
let viewYear, viewMonth;
let allOccurrences = [];
let currentTypeFilter = 'all';

function filteredOccurrences(){
  return currentTypeFilter === 'all' ? allOccurrences : allOccurrences.filter(o => o.type === currentTypeFilter);
}

document.querySelectorAll('#typeTabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#typeTabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTypeFilter = btn.dataset.type;
    renderCalendar();
    clearDayDetail();
  });
});

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

  const occs = filteredOccurrences();
  const byDay = new Map();
  occs.forEach(o => {
    if (!byDay.has(o.date)) byDay.set(o.date, []);
    byDay.get(o.date).push(o);
  });

  const today = new Date();
  const todayKey = dateKey(today);
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
    const dayOccs = byDay.get(key) || [];

    const cell = document.createElement('div');
    cell.className = 'cal-day';
    if (key === todayKey) cell.classList.add('today');

    const num = document.createElement('span');
    num.textContent = d;
    cell.appendChild(num);

    if (dayOccs.length){
      cell.classList.add('has-events');
      const dotsWrap = document.createElement('div');
      dotsWrap.className = 'cal-day-dots';
      [...new Set(dayOccs.map(o => o.type))].slice(0,4).forEach(t => {
        const dot = document.createElement('span');
        dot.className = `type-dot type-${t}`;
        dotsWrap.appendChild(dot);
      });
      cell.appendChild(dotsWrap);
      cell.addEventListener('click', () => selectDay(cell, dayDate, dayOccs));
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

function selectDay(cell, dayDate, dayOccs){
  document.querySelectorAll('.cal-day.selected').forEach(c => c.classList.remove('selected'));
  cell.classList.add('selected');
  document.getElementById('dayDetailTitle').textContent = dayDate.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' });
  document.getElementById('dayDetailEmpty').hidden = true;

  document.getElementById('dayEventList').innerHTML = dayOccs.map(o => `
    <div class="day-event-item">
      <div class="day-event-top">
        <span class="type-dot type-${o.type}"></span>
        <span class="day-event-title">${escapeHtml(o.title || 'Untitled')}</span>
      </div>
      ${o.startTime ? `<div class="day-event-time"><i class="bx bx-time-five"></i> ${fmtTime12(o.startTime)}${o.endTime ? ' – ' + fmtTime12(o.endTime) : ''}</div>` : ''}
      <div class="day-event-level"><i class="bx bx-group"></i> ${escapeHtml(o.level || 'All')}</div>
      ${o.description ? `<div class="day-event-desc">${escapeHtml(o.description)}</div>` : ''}
      <span class="attendance-flag ${o.attendanceRequired ? '' : 'off'}"><i class="bx ${o.attendanceRequired ? 'bx-check' : 'bx-minus'}"></i> ${o.attendanceRequired ? 'Attendance' : 'No Attendance'}</span>
      <div class="day-event-actions">
        <button class="edit-occ" data-activity-id="${o.activityId}"><i class="bx bx-edit-alt"></i> Edit</button>
        <button class="del-occ" data-activity-id="${o.activityId}"><i class="bx bx-trash"></i> Delete</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.edit-occ').forEach(btn => btn.addEventListener('click', () => openEditForm(btn.dataset.activityId)));
  document.querySelectorAll('.del-occ').forEach(btn => btn.addEventListener('click', () => openDeleteConfirm(btn.dataset.activityId)));
}

document.getElementById('calPrev').addEventListener('click', () => { viewMonth--; if (viewMonth<0){viewMonth=11;viewYear--;} renderCalendar(); clearDayDetail(); });
document.getElementById('calNext').addEventListener('click', () => { viewMonth++; if (viewMonth>11){viewMonth=0;viewYear++;} renderCalendar(); clearDayDetail(); });
document.getElementById('calToday').addEventListener('click', () => { const t = new Date(); viewYear = t.getFullYear(); viewMonth = t.getMonth(); renderCalendar(); clearDayDetail(); });

/* =========================================================
   NOTIFICATIONS — writes into students/{uid}/notifications
   ========================================================= */
async function notifyEligibleStudents(level, { title, message, type, link }){
  try{
    const snap = level === 'All'
      ? await getDocs(collection(db, 'students'))
      : await getDocs(query(collection(db, 'students'), where('membershipLevel', '==', level)));
    await Promise.all(snap.docs.map(d => setDoc(doc(collection(db, 'students', d.id, 'notifications')), {
      title, message: message || '', type, link: link || '',
      read: false,
      createdAt: serverTimestamp()
    })));
  }catch(err){
    console.error('Notification write failed:', err);
  }
}

async function loadOccurrences(){
  try{
    const snap = await getDocs(query(collection(db, 'occurrences'), orderBy('date', 'asc')));
    allOccurrences = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }catch(e){
    console.error(e);
    allOccurrences = [];
  }
  renderCalendar();
}

/* =========================================================
   ACTIVITY FORM
   ========================================================= */
const formModal = document.getElementById('formModal');
const activityForm = document.getElementById('activityForm');
let editingActivityId = null;

function openNewForm(){
  editingActivityId = null;
  document.getElementById('formTitle').textContent = 'New Activity';
  document.getElementById('formDeleteBtn').classList.add('hidden');
  activityForm.reset();
  document.querySelectorAll('#repeatDaysRow input').forEach(cb => cb.checked = false);
  document.getElementById('specificDateGroup').classList.remove('hidden');
  document.getElementById('rangeDateGroup').classList.add('hidden');
  document.getElementById('repeatDaysGroup').classList.add('hidden');
  document.getElementById('specificTimeGroup').classList.add('hidden');
  document.getElementById('rangeTimeGroup').classList.add('hidden');
  document.getElementById('fTitleErr').classList.add('hidden');
  document.getElementById('fDate').value = dateKey(new Date());
  formModal.classList.add('open');
}
document.getElementById('fabAdd').addEventListener('click', openNewForm);
document.getElementById('formClose').addEventListener('click', () => formModal.classList.remove('open'));

async function openEditForm(activityId){
  try{
    const snap = await getDoc(doc(db, 'activities', activityId));
    if (!snap.exists()){ showToast('Activity not found.'); return; }
    const a = snap.data();
    editingActivityId = activityId;

    document.getElementById('formTitle').textContent = 'Edit Activity';
    document.getElementById('formDeleteBtn').classList.remove('hidden');
    document.getElementById('fTitleErr').classList.add('hidden');

    document.getElementById('fType').value = a.type || 'class';
    document.getElementById('fLevel').value = a.level || 'All';
    document.querySelector(`input[name="fAttendance"][value="${a.attendanceRequired ? 'yes' : 'no'}"]`).checked = true;
    document.querySelector(`input[name="fDateMode"][value="${a.dateMode || 'specific'}"]`).checked = true;
    document.getElementById('fTitleInput').value = a.title || '';
    document.getElementById('fDescription').value = a.description || '';
    document.getElementById('fTimeToggle').checked = !!a.timeEnabled;

    if (a.dateMode === 'range'){
      document.getElementById('fStartDate').value = a.startDate || '';
      document.getElementById('fEndDate').value = a.endDate || '';
      document.querySelectorAll('#repeatDaysRow input').forEach(cb => {
        cb.checked = (a.repeatDays || []).includes(Number(cb.value));
      });
    } else {
      document.getElementById('fDate').value = a.date || dateKey(new Date());
    }

    syncDateModeUI();
    syncTimeUI();

    if (a.timeEnabled){
      if (a.dateMode === 'specific' && a.times){
        document.getElementById('fStartTime').value = a.times.start || '';
        document.getElementById('fEndTime').value = a.times.end || '';
      } else if (a.dateMode === 'range' && a.times){
        buildRangeTimeRows();
        Object.entries(a.times).forEach(([wd, t]) => {
          const row = document.querySelector(`.range-time-row[data-wd="${wd}"]`);
          if (row){
            row.querySelector('.t-start').value = t.start || '';
            row.querySelector('.t-end').value = t.end || '';
          }
        });
      }
    }

    formModal.classList.add('open');
  }catch(err){
    console.error(err);
    showToast("Couldn't load that activity.");
  }
}

function syncDateModeUI(){
  const mode = document.querySelector('input[name="fDateMode"]:checked').value;
  document.getElementById('specificDateGroup').classList.toggle('hidden', mode !== 'specific');
  document.getElementById('rangeDateGroup').classList.toggle('hidden', mode !== 'range');
  document.getElementById('repeatDaysGroup').classList.toggle('hidden', mode !== 'range');
  syncTimeUI();
}
document.querySelectorAll('input[name="fDateMode"]').forEach(r => r.addEventListener('change', syncDateModeUI));

function syncTimeUI(){
  const mode = document.querySelector('input[name="fDateMode"]:checked').value;
  const on = document.getElementById('fTimeToggle').checked;
  document.getElementById('specificTimeGroup').classList.toggle('hidden', !(on && mode === 'specific'));
  document.getElementById('rangeTimeGroup').classList.toggle('hidden', !(on && mode === 'range'));
  if (on && mode === 'range') buildRangeTimeRows();
}
document.getElementById('fTimeToggle').addEventListener('change', syncTimeUI);
document.querySelectorAll('#repeatDaysRow input').forEach(cb => cb.addEventListener('change', () => { if (document.getElementById('fTimeToggle').checked) buildRangeTimeRows(); }));

const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function buildRangeTimeRows(){
  const checked = [...document.querySelectorAll('#repeatDaysRow input:checked')].map(cb => Number(cb.value));
  const wrap = document.getElementById('rangeTimeRows');
  const existing = {};
  wrap.querySelectorAll('.range-time-row').forEach(row => {
    existing[row.dataset.wd] = { start: row.querySelector('.t-start').value, end: row.querySelector('.t-end').value };
  });
  wrap.innerHTML = checked.map(wd => `
    <div class="range-time-row" data-wd="${wd}">
      <span class="day-label">${dayNames[wd]}</span>
      <input type="time" class="t-start" value="${existing[wd]?.start || ''}">
      <input type="time" class="t-end" value="${existing[wd]?.end || ''}">
    </div>
  `).join('') || '<p class="day-detail-empty">Pick repeat days above first.</p>';
}

/* ---------- occurrence date generation ---------- */
function generateDates(f){
  if (f.dateMode === 'specific') return [f.date];
  const dates = [];
  const cur = new Date(f.startDate + 'T00:00:00');
  const end = new Date(f.endDate + 'T00:00:00');
  while (cur <= end){
    if (f.repeatDays.includes(cur.getDay())) dates.push(dateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}
function timesForDate(f, dateStr){
  if (!f.timeEnabled) return { startTime: null, endTime: null };
  if (f.dateMode === 'specific') return { startTime: f.times.start || null, endTime: f.times.end || null };
  const wd = new Date(dateStr + 'T00:00:00').getDay();
  const t = f.times[wd];
  return { startTime: t?.start || null, endTime: t?.end || null };
}

/* ---------- save (create or edit) ---------- */
activityForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('fTitleInput').value.trim();
  if (!title){ document.getElementById('fTitleErr').classList.remove('hidden'); return; }
  document.getElementById('fTitleErr').classList.add('hidden');

  const dateMode = document.querySelector('input[name="fDateMode"]:checked').value;
  const f = {
    type: document.getElementById('fType').value,
    level: document.getElementById('fLevel').value,
    attendanceRequired: document.querySelector('input[name="fAttendance"]:checked').value === 'yes',
    dateMode,
    title,
    description: document.getElementById('fDescription').value.trim(),
    timeEnabled: document.getElementById('fTimeToggle').checked
  };

  if (dateMode === 'specific'){
    f.date = document.getElementById('fDate').value;
    if (!f.date){ showToast('Pick a date.'); return; }
    f.times = { start: document.getElementById('fStartTime').value, end: document.getElementById('fEndTime').value };
  } else {
    f.startDate = document.getElementById('fStartDate').value;
    f.endDate = document.getElementById('fEndDate').value;
    f.repeatDays = [...document.querySelectorAll('#repeatDaysRow input:checked')].map(cb => Number(cb.value));
    if (!f.startDate || !f.endDate){ showToast('Pick a start and end date.'); return; }
    if (f.repeatDays.length === 0){ showToast('Pick at least one repeat day.'); return; }
    f.times = {};
    document.querySelectorAll('.range-time-row').forEach(row => {
      const start = row.querySelector('.t-start').value;
      const end = row.querySelector('.t-end').value;
      if (start || end) f.times[row.dataset.wd] = { start, end };
    });
  }

  const btn = document.getElementById('formSaveBtn');
  btn.classList.add('loading'); btn.disabled = true;

  try{
    const newDates = generateDates(f);
    if (newDates.length === 0){ showToast('No dates match that range/repeat selection.'); btn.classList.remove('loading'); btn.disabled = false; return; }

    let activityId = editingActivityId;
    const payload = { ...f, updatedBy: operator.username, updatedAt: serverTimestamp() };

    if (!activityId){
      const ref = doc(collection(db, 'activities'));
      activityId = ref.id;
      await setDoc(ref, { ...payload, createdBy: operator.username, createdAt: serverTimestamp() });
    } else {
      await updateDoc(doc(db, 'activities', activityId), payload);
    }

    // reconcile occurrences
    const existingSnap = await getDocs(query(collection(db, 'occurrences'), where('activityId', '==', activityId)));
    const existingByDate = new Map();
    existingSnap.forEach(d => existingByDate.set(d.data().date, { id: d.id, ...d.data() }));

    for (const dateStr of newDates){
      const times = timesForDate(f, dateStr);
      const occPayload = {
        activityId, type: f.type, title: f.title, description: f.description, level: f.level,
        date: dateStr, startTime: times.startTime, endTime: times.endTime,
        updatedBy: operator.username, updatedAt: serverTimestamp()
      };
      const existing = existingByDate.get(dateStr);
      if (existing){
        // respect a per-occurrence attendance override set from the Admin Attendance page
        if (!existing.attendanceOverridden) occPayload.attendanceRequired = f.attendanceRequired;
        await updateDoc(doc(db, 'occurrences', existing.id), occPayload);
        existingByDate.delete(dateStr);
      } else {
        await setDoc(doc(collection(db, 'occurrences')), { ...occPayload, attendanceRequired: f.attendanceRequired, attendanceOverridden: false });
      }
    }

    // remaining existing occurrences are no longer in the date set — remove
    // them only if nothing has been recorded against them yet, to protect history.
    for (const [, occ] of existingByDate){
      const recSnap = await getDocs(query(collection(db, 'attendanceRecords'), where('occurrenceId', '==', occ.id)));
      if (recSnap.empty){
        await deleteDoc(doc(db, 'occurrences', occ.id));
      }
    }

    showToast(editingActivityId ? 'Activity updated' : 'Activity created');
    if (!editingActivityId){
      notifyEligibleStudents(f.level, {
        title: `New ${f.type}: ${f.title}`,
        message: `"${f.title}" was just added to the calendar.`,
        type: 'event',
        link: 'calendar.html'
      });
    }
    formModal.classList.remove('open');
    clearDayDetail();
    loadOccurrences();
  }catch(err){
    console.error(err);
    showToast("Couldn't save — try again");
  }
  btn.classList.remove('loading'); btn.disabled = false;
});

/* ---------- delete (cascades occurrences + their attendance records) ---------- */
const deleteModal = document.getElementById('deleteModal');
let pendingDeleteId = null;
function openDeleteConfirm(activityId){
  pendingDeleteId = activityId;
  deleteModal.classList.add('open');
}
document.getElementById('formDeleteBtn').addEventListener('click', () => {
  if (editingActivityId) openDeleteConfirm(editingActivityId);
});
document.getElementById('deleteCancel').addEventListener('click', () => deleteModal.classList.remove('open'));
document.getElementById('deleteConfirm').addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  const btn = document.getElementById('deleteConfirm');
  btn.disabled = true;
  try{
    const occSnap = await getDocs(query(collection(db, 'occurrences'), where('activityId', '==', pendingDeleteId)));
    for (const occDoc of occSnap.docs){
      const recSnap = await getDocs(query(collection(db, 'attendanceRecords'), where('occurrenceId', '==', occDoc.id)));
      for (const r of recSnap.docs) await deleteDoc(doc(db, 'attendanceRecords', r.id));
      await deleteDoc(doc(db, 'occurrences', occDoc.id));
    }
    await deleteDoc(doc(db, 'activities', pendingDeleteId));
    showToast('Activity deleted');
  }catch(err){
    console.error(err);
    showToast("Couldn't delete — try again");
  }
  btn.disabled = false;
  pendingDeleteId = null;
  deleteModal.classList.remove('open');
  formModal.classList.remove('open');
  clearDayDetail();
  loadOccurrences();
});

/* ---------- init ---------- */
const today = new Date();
viewYear = today.getFullYear();
viewMonth = today.getMonth();
loadOccurrences();
