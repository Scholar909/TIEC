import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, onSnapshot,
  collection, collectionGroup, query, where, orderBy, getDocs, addDoc, writeBatch,
  Timestamp, serverTimestamp
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
   AUTH GUARD
   ========================================================= */
const operatorRaw = sessionStorage.getItem('iec_operator');
if (!operatorRaw) { window.location.href = 'admin-login.html'; }
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
    signOut(auth).finally(() => { window.location.href = 'admin-login.html?kicked=1'; });
  }
});

/* =========================================================
   HELPERS
   ========================================================= */
function initials(name){ return (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase(); }
function escapeHtml(str){ const d = document.createElement('div'); d.textContent = str == null ? '' : String(str); return d.innerHTML; }
function fmtDate(d){ return d ? d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—'; }
function fmtClock(d){ return d ? d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) : '—'; }
function levelClass(level){
  if (level === 'Young Explorers') return 'level-young';
  if (level === 'Junior Innovators') return 'level-junior';
  if (level === 'Teen Innovators') return 'level-teen';
  return 'level-all';
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
   TOAST
   ========================================================= */
let toastTimer;
function showToast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* =========================================================
   PAGE TABS (Files / Submissions / Settings)
   ========================================================= */
document.querySelectorAll('#pageTabs .page-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#pageTabs .page-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.target).classList.add('active');
  });
});

/* =========================================================
   NOTIFY STUDENTS
   ========================================================= */
let allStudents = [];
async function loadStudents(){
  try{
    const snap = await getDocs(query(collection(db, 'students'), orderBy('fullName', 'asc')));
    allStudents = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.blocked !== true);
  }catch(err){
    console.error('Could not load students:', err);
  }
}
loadStudents();

async function notifyEligibleStudents(level, payload){
  const targets = level === 'All' ? allStudents : allStudents.filter(s => s.membershipLevel === level);
  await Promise.all(targets.map(s =>
    setDoc(doc(collection(db, 'students', s.id, 'notifications')), {
      ...payload,
      read: false,
      createdAt: serverTimestamp()
    }).catch(err => console.error('Notify failed for', s.id, err))
  ));
}

/* =========================================================
   DATA: TESTS & LIST RENDERING
   ========================================================= */
let allTests = [];
let levelFilter = 'all';
let selectedId = null;

const lmsList = document.getElementById('lmsList');
const lmsEmpty = document.getElementById('lmsEmpty');

document.querySelectorAll('#levelTabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#levelTabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    levelFilter = btn.dataset.level;
    renderList();
  });
});

function renderList(){
  const visible = levelFilter === 'all' ? allTests : allTests.filter(t => t.level === levelFilter);

  if (!visible.length){
    lmsList.innerHTML = '';
    lmsEmpty.classList.remove('hidden');
    return;
  }
  lmsEmpty.classList.add('hidden');

  lmsList.innerHTML = visible.map(t => {
    const start = t.openFrom?.toDate ? t.openFrom.toDate() : null;
    const end = t.openUntil?.toDate ? t.openUntil.toDate() : null;
    const isChecked = selectedId === t.id;
    const isExam = t.type === 'exam';

    return `
      <div class="lms-card" data-id="${t.id}">
        <!-- ROW 1: Checkbox, Title, Type tag, Level badge -->
        <div class="lms-card-top-bar">
          <div class="lms-card-title-wrap">
            <span class="lms-checkbox-wrap"><input type="checkbox" class="lms-select" data-id="${t.id}" ${isChecked ? 'checked' : ''}></span>
            <span class="lms-card-title">${escapeHtml(t.title || 'Untitled')}</span>
          </div>
          <div class="lms-card-tags-wrap">
            <span class="type-tag ${isExam ? 'exam' : ''}">${isExam ? 'Exam' : 'Test'}</span>
            <span class="level-badge ${levelClass(t.level)}">${escapeHtml(t.level || 'All')}</span>
          </div>
        </div>

        <!-- ROW 2: Calendar and Time window under title -->
        <div class="lms-card-middle-bar">
          <span><i class="bx bx-calendar"></i> ${fmtDate(start)}</span>
          <span><i class="bx bx-time-five"></i> ${fmtClock(start)} – ${fmtClock(end)}</span>
        </div>

        <!-- ROW 3: Attempts, Duration & Question count + Edit / Delete / Open buttons -->
        <div class="lms-card-bottom-bar">
          <div class="lms-card-bottom-info">
            <span><i class="bx bx-repeat"></i> ${t.attemptsAllowed || 1} attempt${(t.attemptsAllowed || 1) === 1 ? '' : 's'}</span>
            <span><i class="bx bx-timer"></i> ${t.durationSeconds ? t.durationSeconds + 's' : '—'}</span>
            <span><i class="bx bx-list-ul"></i> ${(t.questions || []).length} question${(t.questions || []).length === 1 ? '' : 's'}</span>
          </div>
          <div class="lms-card-actions">
            <button class="edit-lms-btn" data-id="${t.id}" aria-label="Edit"><i class="bx bx-edit-alt"></i></button>
            <button class="delete-lms-btn" data-id="${t.id}" aria-label="Delete"><i class="bx bx-trash"></i></button>
            <button class="open-lms-btn" data-id="${t.id}" aria-label="Open questions"><i class="bx bx-chevron-right"></i></button>
          </div>
        </div>
      </div>`;
  }).join('');

  
  lmsList.querySelectorAll('.open-lms-btn').forEach(btn => {
    btn.addEventListener('click', () => { window.location.href = `lms-questions.html?id=${btn.dataset.id}`; });
  });
  lmsList.querySelectorAll('.lms-select').forEach(cb => {
    cb.addEventListener('change', () => {
      selectedId = cb.checked ? cb.dataset.id : null;
      lmsList.querySelectorAll('.lms-select').forEach(other => { if (other !== cb) other.checked = false; });
      paintSettingsPanel();
      paintSubmissionsPanel();
    });
  });
  lmsList.querySelectorAll('.edit-lms-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditForm(btn.dataset.id));
  });
  lmsList.querySelectorAll('.delete-lms-btn').forEach(btn => {
    btn.addEventListener('click', () => openDeleteConfirm(btn.dataset.id));
  });
}

onSnapshot(query(collection(db, 'tests'), orderBy('createdAt', 'desc')), (snap) => {
  allTests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderList();
  paintSettingsPanel();
  paintSubmissionsPanel();
}, (err) => {
  console.error(err);
  lmsList.innerHTML = '';
  lmsEmpty.classList.remove('hidden');
  lmsEmpty.textContent = "Couldn't load tests/exams.";
});

/* =========================================================
   SUBMISSIONS PANEL
   ========================================================= */
let currentSubmissions = [];

async function paintSubmissionsPanel(){
  const noSubCard = document.getElementById('noSubSelectionCard');
  const subCard = document.getElementById('submissionsCard');
  const subList = document.getElementById('submissionsList');
  const t = allTests.find(x => x.id === selectedId);

  if (!t){
    noSubCard.classList.remove('hidden');
    subCard.classList.add('hidden');
    return;
  }
  noSubCard.classList.add('hidden');
  subCard.classList.remove('hidden');

  document.getElementById('submissionsFileTitle').innerHTML = `<i class="bx bx-file-blank"></i> ${escapeHtml(t.title || 'Untitled')}`;
  document.getElementById('submissionsFileType').textContent = t.type === 'exam' ? 'Exam' : 'Test';

  subList.innerHTML = `<p class="dropdown-empty">Loading submissions...</p>`;

  try {
    const attemptsSnap = await getDocs(query(collectionGroup(db, 'attempts'), where('testId', '==', selectedId)));
    currentSubmissions = attemptsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!currentSubmissions.length){
      subList.innerHTML = `<p class="dropdown-empty">No student submissions yet for this ${t.type || 'test'}.</p>`;
      return;
    }

    subList.innerHTML = currentSubmissions.map((sub, idx) => {
      const student = allStudents.find(s => s.id === sub.studentId) || {};
      const name = student.fullName || sub.studentName || 'Student';
      const level = student.membershipLevel || sub.studentLevel || 'Member';
      const pct = Math.round((sub.score / (sub.totalMarks || t.totalMarks || 1)) * 100) || 0;

      return `
        <div class="sub-student-card" data-sub-idx="${idx}">
          <div class="sub-student-left">
            <div class="sub-student-avatar">${initials(name)}</div>
            <div class="sub-student-info">
              <span class="sub-student-name">${escapeHtml(name)}</span>
              <span class="sub-student-level">${escapeHtml(level)}</span>
            </div>
          </div>
          <div class="sub-score-badge" data-score="${sub.score || 0}" data-total="${sub.totalMarks || t.totalMarks || 10}" data-pct="${pct}">
            ${pct}%
          </div>
        </div>`;
    }).join('');

    // Toggle score fraction on tap
    subList.querySelectorAll('.sub-score-badge').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        if (badge.dataset.active === 'true') return;
        badge.dataset.active = 'true';
        const score = badge.dataset.score;
        const total = badge.dataset.total;
        const pct = badge.dataset.pct;
        badge.textContent = `${score}/${total}`;
        setTimeout(() => {
          badge.textContent = `${pct}%`;
          badge.dataset.active = 'false';
        }, 2500);
      });
    });

    // Open preview modal on card click
    subList.querySelectorAll('.sub-student-card').forEach(card => {
      card.addEventListener('click', () => {
        const sub = currentSubmissions[card.dataset.subIdx];
        openSubmissionPreview(sub, t);
      });
    });

  } catch(err) {
    console.error('Error fetching submissions:', err);
    subList.innerHTML = `<p class="dropdown-empty">Could not load submissions.</p>`;
  }
}

/* =========================================================
   SUBMISSION PREVIEW MODAL
   ========================================================= */
const submissionModal = document.getElementById('submissionModal');
document.getElementById('previewClose').addEventListener('click', () => submissionModal.classList.remove('open'));

function openSubmissionPreview(sub, test){
  const student = allStudents.find(s => s.id === sub.studentId) || {};
  const name = student.fullName || sub.studentName || 'Student';
  document.getElementById('previewStudentName').textContent = `${name}'s Submission`;
  document.getElementById('previewSubMeta').textContent = `Score: ${sub.score || 0} / ${sub.totalMarks || test.totalMarks || 0} · Completed`;

  const body = document.getElementById('previewModalBody');
  body.innerHTML = '';

  const questions = test.questions || [];
  const userAnswers = sub.answers || {};

  questions.forEach((q, qIndex) => {
    const card = document.createElement('div');
    card.className = 'preview-q-card';

    const qTitle = document.createElement('div');
    qTitle.className = 'preview-q-title';
    qTitle.textContent = `${qIndex + 1}. ${q.question}`;
    card.appendChild(qTitle);

    const optsList = document.createElement('div');
    optsList.className = 'preview-opts';

    const isMulti = q.type === 'multi';
    const chosen = userAnswers[qIndex]; // single index OR array of indexes

    (q.options || []).forEach((optText, optIdx) => {
      const optRow = document.createElement('div');
      optRow.className = 'preview-opt';

      let isPicked = false;
      if (isMulti && Array.isArray(chosen)){
        isPicked = chosen.includes(optIdx);
      } else if (!isMulti && chosen !== undefined && chosen !== null){
        isPicked = Number(chosen) === optIdx;
      }

      let isCorrectTarget = false;
      if (isMulti && Array.isArray(q.correctIndexes)){
        isCorrectTarget = q.correctIndexes.includes(optIdx);
      } else if (!isMulti && q.correctIndex !== undefined){
        isCorrectTarget = q.correctIndex === optIdx;
      }

      if (isPicked && isCorrectTarget){
        // Correct answer student picked: green text with tick icon at right
        optRow.classList.add('correct-chosen');
        optRow.innerHTML = `<span>${escapeHtml(optText)}</span><i class="bx bx-check" style="font-size:1.2rem;color:var(--success);"></i>`;
      } else if (isPicked && !isCorrectTarget){
        // Wrong answer student picked: red text with crossed icon at left
        optRow.classList.add('wrong-chosen');
        optRow.innerHTML = `<i class="bx bx-x" style="font-size:1.2rem;color:var(--danger);margin-right:8px;"></i><span>${escapeHtml(optText)}</span>`;
      } else if (!isPicked && isCorrectTarget){
        // Correct answer set by admin (user didn't pick it): white text with green tick at right
        optRow.classList.add('correct-target');
        optRow.innerHTML = `<span>${escapeHtml(optText)}</span><i class="bx bx-check" style="font-size:1.2rem;color:var(--success);"></i>`;
      } else {
        // Not selected & incorrect: normal text
        optRow.innerHTML = `<span>${escapeHtml(optText)}</span>`;
      }

      optsList.appendChild(optRow);
    });

    card.appendChild(optsList);
    body.appendChild(card);
  });

  submissionModal.classList.add('open');
}

/* =========================================================
   SETTINGS TAB
   ========================================================= */
function paintSettingsPanel(){
  const noCard = document.getElementById('noSelectionCard');
  const fileCard = document.getElementById('fileSettingsCard');
  const t = allTests.find(x => x.id === selectedId);

  if (!t){
    noCard.classList.remove('hidden');
    fileCard.classList.add('hidden');
    return;
  }
  noCard.classList.add('hidden');
  fileCard.classList.remove('hidden');

  document.getElementById('settingsFileTitle').innerHTML = `<i class="bx bx-edit-alt"></i> ${escapeHtml(t.title || 'Untitled')}`;
  document.getElementById('settingsFileType').textContent = t.type === 'exam' ? 'Exam' : 'Test';
  document.getElementById('settingsAttempts').value = t.attemptsAllowed || 1;
  document.getElementById('settingsShowScore').checked = t.showScoreToStudent !== false;
  document.getElementById('settingsRandomize').checked = t.randomizeQuestions === true;
  document.getElementById('settingsAllowPreview').checked = t.allowPreview !== false;
  document.getElementById('settingsDuration').value = t.durationSeconds || '';

  const start = t.openFrom?.toDate ? t.openFrom.toDate() : null;
  const end = t.openUntil?.toDate ? t.openUntil.toDate() : null;
  document.getElementById('settingsDate').value = start ? start.toISOString().slice(0,10) : '';
  document.getElementById('settingsStartTime').value = start ? start.toTimeString().slice(0,5) : '';
  document.getElementById('settingsEndTime').value = end ? end.toTimeString().slice(0,5) : '';
}

document.getElementById('settingsAttemptsMinus').addEventListener('click', () => stepValue('settingsAttempts', -1));
document.getElementById('settingsAttemptsPlus').addEventListener('click', () => stepValue('settingsAttempts', 1));
function stepValue(inputId, delta){
  const input = document.getElementById(inputId);
  const next = Math.max(1, (parseInt(input.value, 10) || 1) + delta);
  input.value = next;
}

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedId) return;
  const btn = document.getElementById('settingsSaveBtn');
  btn.classList.add('loading');
  btn.disabled = true;

  try{
    const dateVal = document.getElementById('settingsDate').value;
    const startVal = document.getElementById('settingsStartTime').value;
    const endVal = document.getElementById('settingsEndTime').value;
    const openFrom = dateVal && startVal ? Timestamp.fromDate(new Date(`${dateVal}T${startVal}`)) : null;
    const openUntil = dateVal && endVal ? Timestamp.fromDate(new Date(`${dateVal}T${endVal}`)) : null;

    await updateDoc(doc(db, 'tests', selectedId), {
      attemptsAllowed: parseInt(document.getElementById('settingsAttempts').value, 10) || 1,
      showScoreToStudent: document.getElementById('settingsShowScore').checked,
      randomizeQuestions: document.getElementById('settingsRandomize').checked,
      allowPreview: document.getElementById('settingsAllowPreview').checked,
      durationSeconds: parseInt(document.getElementById('settingsDuration').value, 10) || null,
      ...(openFrom ? { openFrom } : {}),
      ...(openUntil ? { openUntil } : {})
    });
    showToast('Settings saved');
  }catch(err){
    console.error(err);
    showToast("Couldn't save — try again");
  }finally{
    btn.classList.remove('loading');
    btn.disabled = false;
  }
});

/* =========================================================
   ADD / EDIT FORM MODAL
   ========================================================= */
const formModal = document.getElementById('formModal');
const lmsForm = document.getElementById('lmsForm');
let editingId = null;

document.getElementById('fAttemptsMinus').addEventListener('click', () => stepValue('fAttempts', -1));
document.getElementById('fAttemptsPlus').addEventListener('click', () => stepValue('fAttempts', 1));

document.querySelectorAll('#typeRow .radio-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('#typeRow .radio-pill').forEach(p => p.classList.remove('checked'));
    pill.classList.add('checked');
    pill.querySelector('input').checked = true;
  });
});
function getSelectedType(){ return document.querySelector('#typeRow input:checked')?.value || 'test'; }
function setSelectedType(value){
  document.querySelectorAll('#typeRow .radio-pill').forEach(p => {
    const isMatch = p.dataset.value === value;
    p.classList.toggle('checked', isMatch);
    p.querySelector('input').checked = isMatch;
  });
}

function openNewForm(){
  editingId = null;
  lmsForm.reset();
  setSelectedType('test');
  document.getElementById('fAttempts').value = 1;
  document.getElementById('formTitle').textContent = 'New Test / Exam';
  document.getElementById('formSaveLabel').textContent = 'Add';
  document.getElementById('formDeleteBtn').classList.add('hidden');
  formModal.classList.add('open');
}
document.getElementById('fabAdd').addEventListener('click', openNewForm);
document.getElementById('formClose').addEventListener('click', () => formModal.classList.remove('open'));

function openEditForm(id){
  const t = allTests.find(x => x.id === id);
  if (!t) return;
  editingId = id;

  setSelectedType(t.type || 'test');
  document.getElementById('fLevel').value = t.level || 'All';
  document.getElementById('fTitleInput').value = t.title || '';
  document.getElementById('fDescription').value = t.description || '';
  document.getElementById('fDuration').value = t.durationSeconds || '';

  const start = t.openFrom?.toDate ? t.openFrom.toDate() : null;
  const end = t.openUntil?.toDate ? t.openUntil.toDate() : null;
  document.getElementById('fDate').value = start ? start.toISOString().slice(0,10) : '';
  document.getElementById('fStartTime').value = start ? start.toTimeString().slice(0,5) : '';
  document.getElementById('fEndTime').value = end ? end.toTimeString().slice(0,5) : '';
  document.getElementById('fAttempts').value = t.attemptsAllowed || 1;

  document.getElementById('formTitle').textContent = 'Edit Test / Exam';
  document.getElementById('formSaveLabel').textContent = 'Save Changes';
  document.getElementById('formDeleteBtn').classList.remove('hidden');
  formModal.classList.add('open');
}

lmsForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = document.getElementById('fTitleInput').value.trim();
  const dateVal = document.getElementById('fDate').value;
  let valid = true;
  document.getElementById('fTitleErr').classList.toggle('hidden', !!title);
  if (!title) valid = false;
  document.getElementById('fDateErr').classList.toggle('hidden', !!dateVal);
  if (!dateVal) valid = false;

  const startVal = document.getElementById('fStartTime').value || '00:00';
  const endVal = document.getElementById('fEndTime').value || '23:59';
  const endErrEl = document.getElementById('fEndTimeErr');
  const endAfterStart = endVal > startVal;
  endErrEl.classList.toggle('hidden', endAfterStart);
  if (!endAfterStart) valid = false;

  if (!valid) return;

  const btn = document.getElementById('formSaveBtn');
  btn.classList.add('loading');
  btn.disabled = true;

  const level = document.getElementById('fLevel').value;
  const type = getSelectedType();
  const payload = {
    type,
    level,
    title,
    description: document.getElementById('fDescription').value.trim(),
    durationSeconds: parseInt(document.getElementById('fDuration').value, 10) || null,
    openFrom: Timestamp.fromDate(new Date(`${dateVal}T${startVal}`)),
    openUntil: Timestamp.fromDate(new Date(`${dateVal}T${endVal}`)),
    attemptsAllowed: parseInt(document.getElementById('fAttempts').value, 10) || 1
  };

  try{
    if (editingId){
      await updateDoc(doc(db, 'tests', editingId), payload);
      showToast('Test/exam updated');
    } else {
      const newDoc = await addDoc(collection(db, 'tests'), {
        ...payload,
        showScoreToStudent: true,
        randomizeQuestions: false,
        allowPreview: true,
        totalMarks: 0,
        questions: [],
        published: true,
        createdAt: serverTimestamp()
      });

      notifyEligibleStudents(level, {
        title: `New ${type} available: ${title}`,
        message: `A new ${type} has been added${level !== 'All' ? ` for ${level}` : ''} — check the LMS page to take it.`,
        type: 'test',
        link: `test.html?id=${newDoc.id}`
      });

      showToast('Test/exam created — add questions from its card');
    }
    formModal.classList.remove('open');
  }catch(err){
    console.error(err);
    showToast("Couldn't save — try again");
  }finally{
    btn.classList.remove('loading');
    btn.disabled = false;
  }
});

/* =========================================================
   DELETE CONFIRM
   ========================================================= */
const deleteModal = document.getElementById('deleteModal');
let pendingDeleteId = null;

function openDeleteConfirm(id){
  pendingDeleteId = id;
  deleteModal.classList.add('open');
}
document.getElementById('formDeleteBtn').addEventListener('click', () => {
  formModal.classList.remove('open');
  openDeleteConfirm(editingId);
});
document.getElementById('deleteCancel').addEventListener('click', () => deleteModal.classList.remove('open'));
document.getElementById('deleteConfirm').addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  const id = pendingDeleteId;
  deleteModal.classList.remove('open');

  try{
    const attemptsSnap = await getDocs(query(collectionGroup(db, 'attempts'), where('testId', '==', id)));
    if (!attemptsSnap.empty){
      const batch = writeBatch(db);
      attemptsSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    await deleteDoc(doc(db, 'tests', id));
    if (selectedId === id){ selectedId = null; paintSettingsPanel(); paintSubmissionsPanel(); }
    showToast('Test/exam deleted');
  }catch(err){
    console.error(err);
    showToast("Couldn't delete — try again");
  }
  pendingDeleteId = null;
});