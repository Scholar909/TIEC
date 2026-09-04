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
   AUTH GUARD (same block every admin page must repeat)
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
function fmtTime12(hhmm){
  if (!hhmm) return '';
  let [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2,'0')} ${ap}`;
}
function fmtDate(d){ return d ? d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—'; }

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
   PAGE TABS (Files / Settings)
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
   DATA: tests
   tests/{id} — type ('test'|'exam'), level, title, description,
     openFrom, openUntil (Timestamp), attemptsAllowed (number),
     showScoreToStudent (bool), totalMarks (number),
     questions (array), published (bool), createdAt
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
    lmsEmpty.hidden = false;
    return;
  }
  lmsEmpty.hidden = true;

  lmsList.innerHTML = visible.map(t => {
    const start = t.openFrom?.toDate ? t.openFrom.toDate() : null;
    const end = t.openUntil?.toDate ? t.openUntil.toDate() : null;
    const isChecked = selectedId === t.id;
    return `
      <div class="lms-card glass" data-id="${t.id}">
        <span class="lms-checkbox-wrap"><input type="checkbox" class="lms-select" data-id="${t.id}" ${isChecked ? 'checked' : ''}></span>
        <div class="lms-card-icon ${t.type === 'exam' ? 'type-exam' : ''}"><i class="bx ${t.type === 'exam' ? 'bx-file-blank' : 'bx-edit-alt'}"></i></div>
        <div class="lms-card-body" data-role="open">
          <div class="lms-card-top">
            <span class="lms-card-title">${escapeHtml(t.title || 'Untitled')}</span>
            <span class="badge-pill ${t.type === 'exam' ? 'badge-pill-blue' : ''}">${t.type === 'exam' ? 'Exam' : 'Test'}</span>
            <span class="badge-pill badge-pill-purple">${escapeHtml(t.level || 'All')}</span>
          </div>
          <div class="lms-card-meta">
            <span><i class="bx bx-calendar"></i> ${fmtDate(start)}</span>
            <span><i class="bx bx-time-five"></i> ${start ? start.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) : '—'} – ${end ? end.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) : '—'}</span>
            <span><i class="bx bx-repeat"></i> ${t.attemptsAllowed || 1} attempt${(t.attemptsAllowed || 1) === 1 ? '' : 's'}</span>
            <span><i class="bx bx-list-ul"></i> ${(t.questions || []).length} question${(t.questions || []).length === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div class="lms-card-actions">
          <button class="edit-lms-btn" data-id="${t.id}" aria-label="Edit"><i class="bx bx-edit"></i></button>
          <button class="delete-lms-btn" data-id="${t.id}" aria-label="Delete"><i class="bx bx-trash"></i></button>
        </div>
      </div>`;
  }).join('');

  lmsList.querySelectorAll('[data-role="open"]').forEach(el => {
    el.addEventListener('click', () => {
      window.location.href = `lms-questions.html?id=${el.closest('.lms-card').dataset.id}`;
    });
  });
  lmsList.querySelectorAll('.lms-select').forEach(cb => {
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => {
      selectedId = cb.checked ? cb.dataset.id : null;
      lmsList.querySelectorAll('.lms-select').forEach(other => { if (other !== cb) other.checked = false; });
      paintSettingsPanel();
    });
  });
  lmsList.querySelectorAll('.edit-lms-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openEditForm(btn.dataset.id); });
  });
  lmsList.querySelectorAll('.delete-lms-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openDeleteConfirm(btn.dataset.id); });
  });
}

onSnapshot(query(collection(db, 'tests'), orderBy('createdAt', 'desc')), (snap) => {
  allTests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderList();
  paintSettingsPanel();
}, (err) => {
  console.error(err);
  lmsList.innerHTML = '';
  lmsEmpty.hidden = false;
  lmsEmpty.textContent = "Couldn't load tests/exams.";
});

/* =========================================================
   SETTINGS TAB
   ========================================================= */
function paintSettingsPanel(){
  const noCard = document.getElementById('noSelectionCard');
  const fileCard = document.getElementById('fileSettingsCard');
  const t = allTests.find(x => x.id === selectedId);

  if (!t){
    noCard.hidden = false;
    fileCard.hidden = true;
    return;
  }
  noCard.hidden = true;
  fileCard.hidden = false;

  document.getElementById('settingsFileTitle').innerHTML = `<i class="bx bx-edit-alt"></i> ${escapeHtml(t.title || 'Untitled')}`;
  document.getElementById('settingsFileType').textContent = t.type === 'exam' ? 'Exam' : 'Test';
  document.getElementById('settingsAttempts').value = t.attemptsAllowed || 1;
  document.getElementById('settingsShowScore').checked = t.showScoreToStudent !== false;

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

function openNewForm(){
  editingId = null;
  lmsForm.reset();
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

  document.getElementById('fType').value = t.type || 'test';
  document.getElementById('fLevel').value = t.level || 'All';
  document.getElementById('fTitleInput').value = t.title || '';
  document.getElementById('fDescription').value = t.description || '';

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

  const payload = {
    type: document.getElementById('fType').value,
    level: document.getElementById('fLevel').value,
    title,
    description: document.getElementById('fDescription').value.trim(),
    openFrom: Timestamp.fromDate(new Date(`${dateVal}T${startVal}`)),
    openUntil: Timestamp.fromDate(new Date(`${dateVal}T${endVal}`)),
    attemptsAllowed: parseInt(document.getElementById('fAttempts').value, 10) || 1
  };

  try{
    if (editingId){
      await updateDoc(doc(db, 'tests', editingId), payload);
      showToast('Test/exam updated');
    } else {
      await addDoc(collection(db, 'tests'), {
        ...payload,
        showScoreToStudent: true,
        totalMarks: 10,
        questions: [],
        published: true,
        createdAt: serverTimestamp()
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
   DELETE (cascades to every student's attempts at this test)
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
    if (selectedId === id){ selectedId = null; paintSettingsPanel(); }
    showToast('Test/exam deleted');
  }catch(err){
    console.error(err);
    showToast("Couldn't delete — try again");
  }
  pendingDeleteId = null;
});
