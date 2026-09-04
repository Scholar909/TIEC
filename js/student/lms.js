// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Additional SDKs used on this page (Auth + Firestore)
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, query, where, orderBy, getDocs, limit, onSnapshot
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

   tests/{testId}        — club-wide, admin-managed
     title, description, published (bool), type ('test'|'exam'),
     questions (array — every question is single/multi choice,
       so every attempt is auto-scored, no "pending review" state),
     totalMarks (number), attemptsAllowed (number, default 1),
     openFrom / openUntil (Timestamp), showScoreToStudent (bool)

   students/{uid}/testAttempts/{testId}/attempts/{autoId}
     score (0-100 percentage), earned, totalMarks, testId,
     submittedAt (Timestamp), totalQuestions (number)
   ========================================================= */

let uid = null;

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
  if (!d) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function paintIdentity(data){
  const name = data.fullName || 'Explorer';
  const initials = getInitials(name);
  document.getElementById('topAvatar').textContent = initials;
  document.getElementById('ddAvatar').textContent = initials;
  document.getElementById('ddName').textContent = name;
  document.getElementById('ddLevel').textContent = data.membershipLevel || 'Member';
}

/* ---------- tabs ---------- */
document.getElementById('lmsTabs').querySelectorAll('.lms-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lms-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  });
});

/* =========================================================
   LOAD TESTS + ATTEMPTS (supports multiple attempts per test)
   ========================================================= */
async function loadLms(studentUid){
  const availableList = document.getElementById('availableList');
  const completedList = document.getElementById('completedList');

  try{
    const now = new Date();
    const testsSnap = await getDocs(query(collection(db, 'tests'), where('published', '==', true)));
    const tests = testsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // one attempts-history fetch per test — fine at this club's scale
    const attemptSnaps = await Promise.all(
      tests.map(t => getDocs(query(collection(db, 'students', studentUid, 'testAttempts', t.id, 'attempts'), orderBy('submittedAt', 'desc'))))
    );

    const available = [];
    const completed = [];

    tests.forEach((test, i) => {
      const attempts = attemptSnaps[i].docs.map(d => d.data());
      const attemptsUsed = attempts.length;
      const attemptsAllowed = test.attemptsAllowed || 1;
      const attemptsRemaining = Math.max(0, attemptsAllowed - attemptsUsed);

      const openFrom = toDate(test.openFrom);
      const openUntil = toDate(test.openUntil);
      const isOpen = (!openFrom || openFrom <= now) && (!openUntil || openUntil >= now);

      if (isOpen && attemptsRemaining > 0){
        available.push({ test, attemptsRemaining, attemptsAllowed });
      }
      if (attemptsUsed > 0){
        completed.push({ test, latest: attempts[0], attemptsUsed, attemptsAllowed, canRetake: isOpen && attemptsRemaining > 0 });
      }
    });

    renderAvailable(available);
    renderCompleted(completed);
    paintStats(available.length, completed);
  } catch (err){
    console.error('LMS load failed:', err);
    availableList.innerHTML = '';
    completedList.innerHTML = '';
    document.getElementById('availableEmpty').hidden = false;
    document.getElementById('completedEmpty').hidden = false;
  }
}

function renderAvailable(items){
  const list = document.getElementById('availableList');
  const empty = document.getElementById('availableEmpty');
  if (!items.length){
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  list.innerHTML = items.map(({ test: t, attemptsRemaining, attemptsAllowed }) => {
    const questionCount = Array.isArray(t.questions) ? t.questions.length : 0;
    const until = toDate(t.openUntil);
    return `
      <div class="test-card">
        <div class="test-icon"><i class="bx ${t.type === 'exam' ? 'bx-file-blank' : 'bx-edit-alt'}"></i></div>
        <div class="test-body-info">
          <div class="test-title">${t.title || 'Untitled test'}</div>
          <div class="test-desc-line">${t.description || ''}</div>
          <div class="test-meta-row">
            <span><i class="bx bx-list-ul"></i> ${questionCount} question${questionCount === 1 ? '' : 's'}</span>
            ${until ? `<span><i class="bx bx-calendar-x"></i> Open until ${formatDate(until)}</span>` : ''}
            <span><i class="bx bx-repeat"></i> ${attemptsRemaining}/${attemptsAllowed} attempt${attemptsAllowed === 1 ? '' : 's'} left</span>
          </div>
        </div>
        <a class="btn btn-lime btn-sm test-action" href="test.html?id=${t.id}">Start Test</a>
      </div>
    `;
  }).join('');
}

function renderCompleted(items){
  const list = document.getElementById('completedList');
  const empty = document.getElementById('completedEmpty');
  if (!items.length){
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  list.innerHTML = items.map(({ test, latest, attemptsUsed, attemptsAllowed, canRetake }) => {
    const hasScore = test.showScoreToStudent && typeof latest.score === 'number';
    return `
      <div class="test-card">
        <div class="test-icon done"><i class="bx bx-check"></i></div>
        <div class="test-body-info">
          <div class="test-title">${test.title || 'Untitled test'}</div>
          <div class="test-meta-row">
            <span><i class="bx bx-calendar-check"></i> Last submitted ${formatDate(toDate(latest.submittedAt))}</span>
            <span><i class="bx bx-repeat"></i> ${attemptsUsed}/${attemptsAllowed} attempt${attemptsAllowed === 1 ? '' : 's'} used</span>
          </div>
          ${canRetake ? `<a class="card-link" href="test.html?id=${test.id}">Retake <i class="bx bx-right-arrow-alt"></i></a>` : ''}
        </div>
        <span class="test-score-badge ${hasScore ? '' : 'pending'}">
          ${hasScore ? Math.round(latest.score) + '%' : 'Score hidden'}
        </span>
      </div>
    `;
  }).join('');
}

function paintStats(availableCount, completedItems){
  document.getElementById('statAvailable').textContent = availableCount;
  document.getElementById('statCompleted').textContent = completedItems.length;

  const scored = completedItems.filter(({ test, latest }) => test.showScoreToStudent && typeof latest.score === 'number');
  if (scored.length){
    const avg = scored.reduce((sum, { latest }) => sum + latest.score, 0) / scored.length;
    document.getElementById('statAverage').textContent = `${Math.round(avg)}%`;
  } else {
    document.getElementById('statAverage').textContent = '–%';
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

  try{
    const studentSnap = await getDoc(doc(db, 'students', uid));
    const data = studentSnap.exists() ? studentSnap.data() : { fullName: user.displayName };
    paintIdentity(data);

    loadLms(uid);
    loadNotificationsPreview(uid);
  } catch (err){
    console.error('LMS page load failed:', err);
  }
});
