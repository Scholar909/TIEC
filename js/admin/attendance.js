import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteField, onSnapshot,
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
const typeIcons = { class:'bx bx-chalkboard', event:'bx bx-calendar-star', competition:'bx bxs-trophy', workshop:'bx bx-wrench', holiday:'bx bx-sun' };
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
   DATE NAV
   ========================================================= */
let selectedDate = new Date();
function refreshDateLabel(){
  const todayStr = dateKey(new Date());
  const selStr = dateKey(selectedDate);
  document.getElementById('dateLabel').textContent = selStr === todayStr
    ? 'Today'
    : selectedDate.toLocaleDateString(undefined, { weekday: 'long' });
  document.getElementById('dateSub').textContent = selectedDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  document.getElementById('activityListSection').querySelector('h3').innerHTML =
    `<i class="bx bx-list-ul"></i> ${selStr === todayStr ? "Today's" : "That Day's"} Attendance`;
}
document.getElementById('datePrev').addEventListener('click', () => { selectedDate.setDate(selectedDate.getDate() - 1); refreshDateLabel(); loadActivityList(); backToList(); });
document.getElementById('dateNext').addEventListener('click', () => { selectedDate.setDate(selectedDate.getDate() + 1); refreshDateLabel(); loadActivityList(); backToList(); });
document.getElementById('dateTodayBtn').addEventListener('click', () => { selectedDate = new Date(); refreshDateLabel(); loadActivityList(); backToList(); });

/* =========================================================
   ACTIVITY LIST (attendance-required occurrences for selectedDate)
   ========================================================= */
let dayOccurrences = [];
async function loadActivityList(){
  const listEl = document.getElementById('activityList');
  listEl.innerHTML = '<div class="list-skeleton"></div><div class="list-skeleton"></div>';
  try{
    const dStr = dateKey(selectedDate);
    const snap = await getDocs(query(
      collection(db, 'occurrences'),
      where('date', '==', dStr),
      where('attendanceRequired', '==', true)
    ));
    dayOccurrences = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (a.startTime || '').localeCompare(b.startTime || ''));

    if (dayOccurrences.length === 0){
      listEl.innerHTML = '<p class="list-empty">No attendance-required activities on this date.</p>';
      return;
    }
    listEl.innerHTML = dayOccurrences.map(o => `
      <div class="activity-item" data-id="${o.id}">
        <span class="type-icon" style="background:color-mix(in srgb, var(--type-${o.type}) 18%, transparent);color:var(--type-${o.type});"><i class="${typeIcons[o.type] || 'bx bx-calendar'}"></i></span>
        <div class="act-info">
          <div class="act-title">${escapeHtml(o.title || 'Untitled')}</div>
          <div class="act-meta">${o.startTime ? fmtTime12(o.startTime) + (o.endTime ? ' – ' + fmtTime12(o.endTime) : '') + ' · ' : ''}${escapeHtml(o.level || 'All')}</div>
        </div>
        <i class="bx bx-chevron-right chevron"></i>
      </div>
    `).join('');

    listEl.querySelectorAll('.activity-item').forEach(el => {
      el.addEventListener('click', () => openMarkingView(el.dataset.id));
    });
  }catch(err){
    console.error(err);
    listEl.innerHTML = '<p class="list-empty">Couldn\'t load activities — check that the Firestore composite index for this query has been created.</p>';
  }
}

/* =========================================================
   MARKING VIEW
   ========================================================= */
let activeOccurrence = null;
let allStudents = [];
let recordsMap = new Map(); // studentId -> {status, ...}
let activeLevelTab = 'all';

document.getElementById('backToList').addEventListener('click', backToList);
function backToList(){
  document.getElementById('markingSection').classList.add('hidden');
  document.getElementById('activityListSection').classList.remove('hidden');
  activeOccurrence = null;
}

async function openMarkingView(occId){
  activeOccurrence = dayOccurrences.find(o => o.id === occId);
  if (!activeOccurrence) return;

  document.getElementById('activityListSection').classList.add('hidden');
  document.getElementById('markingSection').classList.remove('hidden');

  document.getElementById('markType').className = `type-dot type-${activeOccurrence.type}`;
  document.getElementById('markTitle').textContent = activeOccurrence.title || 'Untitled';
  document.getElementById('markTime').textContent = activeOccurrence.startTime
    ? fmtTime12(activeOccurrence.startTime) + (activeOccurrence.endTime ? ' – ' + fmtTime12(activeOccurrence.endTime) : '')
    : '';

  document.getElementById('attendanceToggle').checked = true;
  document.getElementById('markingBody').classList.remove('hidden');
  document.getElementById('noAttendanceNote').classList.add('hidden');
  activeLevelTab = 'all';
  document.querySelectorAll('#markLevelTabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.level === 'all'));

  document.getElementById('studentMarkGrid').innerHTML = '<div class="list-skeleton"></div><div class="list-skeleton"></div>';

  try{
    if (allStudents.length === 0){
      const snap = await getDocs(query(collection(db, 'students'), orderBy('fullName', 'asc')));
      allStudents = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.blocked !== true);
    }
    const recSnap = await getDocs(query(collection(db, 'attendanceRecords'), where('occurrenceId', '==', occId)));
    recordsMap = new Map();
    recSnap.forEach(d => recordsMap.set(d.data().studentId, d.data()));

    renderMarkGrid();
  }catch(err){
    console.error(err);
    document.getElementById('studentMarkGrid').innerHTML = '<p class="list-empty">Couldn\'t load students.</p>';
  }
}

function eligibleStudents(){
  const lvl = activeOccurrence.level;
  let list = allStudents.filter(s => lvl === 'All' || s.membershipLevel === lvl);
  if (activeLevelTab !== 'all') list = list.filter(s => s.membershipLevel === activeLevelTab);
  return list;
}

function renderMarkGrid(){
  const grid = document.getElementById('studentMarkGrid');
  const students = eligibleStudents();
  if (students.length === 0){
    grid.innerHTML = '<p class="list-empty">No students in this group.</p>';
    return;
  }
  // unmarked first, marked pushed to the bottom
  const sorted = [...students].sort((a, b) => {
    const am = recordsMap.has(a.id) ? 1 : 0;
    const bm = recordsMap.has(b.id) ? 1 : 0;
    return am - bm;
  });

  grid.innerHTML = sorted.map(s => {
    const rec = recordsMap.get(s.id);
    const photo = s.photoURL ? `<img src="${escapeHtml(s.photoURL)}" alt="">` : escapeHtml(initials(s.fullName));
    return `
      <div class="mark-card ${rec ? 'is-marked' : ''}" data-uid="${s.id}">
        <span class="mark-photo">${photo}</span>
        <span class="mark-name">${escapeHtml(s.fullName || 'Student')}</span>
        <span class="mark-username">@${escapeHtml(s.username || '—')}</span>
        ${rec
          ? `<span class="mark-status ${rec.status}" data-role="relabel">${rec.status === 'present' ? 'PRESENT' : 'ABSENT'}</span>`
          : `<span class="mark-actions">
               <button class="mark-btn present" data-role="mark" data-status="present"><i class="bx bx-check"></i></button>
               <button class="mark-btn absent" data-role="mark" data-status="absent"><i class="bx bx-x"></i></button>
             </span>`
        }
      </div>`;
  }).join('');

  grid.querySelectorAll('[data-role="mark"]').forEach(btn => {
    btn.addEventListener('click', () => markStudent(btn.closest('.mark-card').dataset.uid, btn.dataset.status));
  });
  grid.querySelectorAll('[data-role="relabel"]').forEach(label => {
    label.addEventListener('click', () => {
      recordsMap.delete(label.closest('.mark-card').dataset.uid);
      renderMarkGrid();
    });
  });
}

/* =========================================================
   NOTIFICATIONS — writes into students/{uid}/notifications
   ========================================================= */
async function notifyStudent(studentId, { title, message, type, link }){
  try{
    await setDoc(doc(collection(db, 'students', studentId, 'notifications')), {
      title, message: message || '', type, link: link || '',
      read: false,
      createdAt: serverTimestamp()
    });
  }catch(err){
    console.error('Notification write failed:', err);
  }
}
async function notifyEligibleStudents(level, payload){
  const targets = level === 'All' ? allStudents : allStudents.filter(s => s.membershipLevel === level);
  await Promise.all(targets.map(s => notifyStudent(s.id, payload)));
}

async function markStudent(studentId, status){
  if (!activeOccurrence || !operator) return;
  try{
    const recId = `${activeOccurrence.id}_${studentId}`;
    await setDoc(doc(db, 'attendanceRecords', recId), {
      occurrenceId: activeOccurrence.id,
      studentId,
      date: activeOccurrence.date,
      status,
      markedAt: serverTimestamp(),
      markedBy: operator.username
    });
    recordsMap.set(studentId, { status, occurrenceId: activeOccurrence.id, studentId, date: activeOccurrence.date, markedBy: operator.username });
    renderMarkGrid();
    notifyStudent(studentId, {
      title: `Marked ${status === 'present' ? 'Present' : 'Absent'}: ${activeOccurrence.title || 'Activity'}`,
      message: `You were marked ${status} for "${activeOccurrence.title || 'this activity'}" on ${activeOccurrence.date}.`,
      type: 'attendance',
      link: 'attendance.html#calGrid'
    });
  }catch(err){
    console.error(err);
    showToast("Couldn't save that mark — try again");
  }
}

document.querySelectorAll('#markLevelTabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#markLevelTabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeLevelTab = btn.dataset.level;
    renderMarkGrid();
  });
});

/* =========================================================
   ATTENDANCE ON/OFF TOGGLE (per-occurrence override)
   ========================================================= */
const offModal = document.getElementById('offModal');
const attendanceToggle = document.getElementById('attendanceToggle');
attendanceToggle.addEventListener('change', () => {
  if (!attendanceToggle.checked){
    offModal.classList.add('open');
  } else {
    turnAttendanceOn();
  }
});
document.getElementById('offCancel').addEventListener('click', () => {
  attendanceToggle.checked = true;
  offModal.classList.remove('open');
});
document.getElementById('offConfirm').addEventListener('click', async () => {
  offModal.classList.remove('open');
  if (!activeOccurrence || !operator) return;
  try{
    await updateDoc(doc(db, 'occurrences', activeOccurrence.id), {
      attendanceRequired: false,
      attendanceOverridden: true,
      updatedBy: operator.username,
      updatedAt: serverTimestamp()
    });
    activeOccurrence.attendanceRequired = false;
    document.getElementById('markingBody').classList.add('hidden');
    document.getElementById('noAttendanceNote').classList.remove('hidden');
    showToast('Attendance turned off for this activity');
    notifyEligibleStudents(activeOccurrence.level, {
      title: `No Attendance: ${activeOccurrence.title || 'Activity'}`,
      message: `Attendance was turned off for "${activeOccurrence.title || 'this activity'}" on ${activeOccurrence.date} — it won't count toward Present/Absent.`,
      type: 'attendance',
      link: 'attendance.html#calGrid'
    });
  }catch(err){
    console.error(err);
    attendanceToggle.checked = true;
    showToast("Couldn't update — try again");
  }
});
async function turnAttendanceOn(){
  if (!activeOccurrence || !operator) return;
  try{
    await updateDoc(doc(db, 'occurrences', activeOccurrence.id), {
      attendanceRequired: true,
      updatedBy: operator.username,
      updatedAt: serverTimestamp()
    });
    activeOccurrence.attendanceRequired = true;
    document.getElementById('markingBody').classList.remove('hidden');
    document.getElementById('noAttendanceNote').classList.add('hidden');
    showToast('Attendance turned back on');
  }catch(err){
    console.error(err);
    attendanceToggle.checked = false;
    showToast("Couldn't update — try again");
  }
}

/* ---------- init ---------- */
refreshDateLabel();
loadActivityList();
