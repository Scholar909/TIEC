import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, onSnapshot,
  collection, query, orderBy, serverTimestamp
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
if (!operatorRaw) {
  window.location.href = 'admin-login.html';
}
const operator = operatorRaw ? JSON.parse(operatorRaw) : null;
const isAdmin = !!(operator && operator.role === 'admin');

let currentUser = null;
onAuthStateChanged(auth, (user) => {
  if (!user) {
    sessionStorage.removeItem('iec_operator');
    window.location.href = 'admin-login.html';
    return;
  }
  currentUser = user;
});

onSnapshot(doc(db, 'system', 'activeSession'), (snap) => {
  if (!snap.exists()) return;
  const data = snap.data();
  if (operator && data.username && data.username !== operator.username) {
    sessionStorage.removeItem('iec_operator');
    signOut(auth).finally(() => {
      window.location.href = 'admin-login.html?kicked=1';
    });
  }
});

/* =========================================================
   HELPERS
   ========================================================= */
function initials(name){
  return (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase();
}
function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

/* =========================================================
   OPERATOR CHROME + ROLE GATING
   ========================================================= */
if (operator){
  const name = operator.fullName || operator.username;
  const role = operator.role || 'teacher';
  document.getElementById('topAvatar').textContent = initials(name);
  document.getElementById('ddAvatar').textContent = initials(name);
  document.getElementById('ddName').textContent = name;
  document.getElementById('ddRole').textContent = role;
  document.getElementById('selfAvatar').textContent = initials(name);
  document.getElementById('selfName').textContent = name;
  document.getElementById('selfRole').textContent = role;

  document.getElementById('accessNoteText').textContent = isAdmin
    ? 'You have full read & write access to settings.'
    : "You have read-only access — you can view staff details but can't add, edit, or remove anyone.";
}

// Add Staff card is admin-only
document.getElementById('addStaffCard').hidden = !isAdmin;

// Change Password tab: admin gets the real form, teacher gets a restricted message
document.getElementById('passwordCard').hidden = !isAdmin;
document.getElementById('passwordRestrictedCard').hidden = isAdmin;

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
function openSidebar(){ sidebar.classList.add('open'); backdrop.classList.add('show'); }
function closeSidebar(){ sidebar.classList.remove('open'); backdrop.classList.remove('show'); }
document.getElementById('hamburger').addEventListener('click', () => {
  sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});
backdrop.addEventListener('click', closeSidebar);

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

/* password show/hide (the staff form + change-password fields) */
document.querySelectorAll('.pw-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.innerHTML = show ? "<i class='bx bx-hide'></i>" : "<i class='bx bx-show'></i>";
  });
});

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
   TABS
   ========================================================= */
document.querySelectorAll('#settingsTabs .settings-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#settingsTabs .settings-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.target).classList.add('active');
  });
});

/* =========================================================
   STAFF ACCOUNT (view for everyone, write for admins only)
   operators/{username} — fullName, role, password, createdAt
   ========================================================= */
let allStaff = [];
const staffForm = document.getElementById('staffForm');
const staffList = document.getElementById('staffList');
const staffEmpty = document.getElementById('staffEmpty');
const revealedPasswords = new Set();

function openStaffForm(mode, staff){
  if (!isAdmin) return;
  staffForm.hidden = false;
  document.getElementById('addStaffBtn').hidden = true;

  if (mode === 'edit' && staff){
    document.getElementById('staffOriginalUsername').value = staff.id;
    document.getElementById('staffFullName').value = staff.fullName || '';
    document.getElementById('staffUsername').value = staff.id;
    document.getElementById('staffUsername').disabled = true;
    document.getElementById('staffRole').value = staff.role || 'teacher';
    document.getElementById('staffPassword').value = staff.password || '';
    document.getElementById('staffSaveLabel').textContent = 'Save Changes';
  } else {
    staffForm.reset();
    document.getElementById('staffOriginalUsername').value = '';
    document.getElementById('staffUsername').disabled = false;
    document.getElementById('staffSaveLabel').textContent = 'Add Staff Member';
  }
  staffForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function closeStaffForm(){
  staffForm.hidden = true;
  document.getElementById('addStaffBtn').hidden = false;
  staffForm.reset();
}

if (isAdmin){
  document.getElementById('addStaffBtn').addEventListener('click', () => openStaffForm('add'));
  document.getElementById('staffCancelBtn').addEventListener('click', closeStaffForm);

  staffForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const originalUsername = document.getElementById('staffOriginalUsername').value;
    const fullName = document.getElementById('staffFullName').value.trim();
    const username = document.getElementById('staffUsername').value.trim().toLowerCase();
    const role = document.getElementById('staffRole').value;
    const password = document.getElementById('staffPassword').value;

    if (!fullName || !username || !password){
      showToast('Fill in every field first');
      return;
    }

    const saveBtn = document.getElementById('staffSaveBtn');
    saveBtn.classList.add('loading');
    saveBtn.disabled = true;

    try{
      if (originalUsername){
        await updateDoc(doc(db, 'operators', originalUsername), { fullName, role, password });
        showToast('Staff member updated');
      } else {
        const existing = await getDoc(doc(db, 'operators', username));
        if (existing.exists()){
          showToast('That username is already taken');
          saveBtn.classList.remove('loading');
          saveBtn.disabled = false;
          return;
        }
        await setDoc(doc(db, 'operators', username), { fullName, role, password, createdAt: serverTimestamp() });
        showToast('Staff member added');
      }
      closeStaffForm();
    }catch(err){
      console.error(err);
      showToast("Couldn't save — try again");
    }finally{
      saveBtn.classList.remove('loading');
      saveBtn.disabled = false;
    }
  });
}

function renderStaff(){
  if (!allStaff.length){
    staffList.innerHTML = '';
    staffEmpty.hidden = false;
    return;
  }
  staffEmpty.hidden = true;

  staffList.innerHTML = allStaff.map(s => {
    const isYou = operator && operator.username === s.id;
    const revealed = revealedPasswords.has(s.id);
    const pwDisplay = revealed ? escapeHtml(s.password || '') : '••••••••';

    return `
      <div class="staff-item">
        <span class="staff-avatar">${initials(s.fullName)}</span>
        <div class="staff-info">
          <div class="staff-name">${escapeHtml(s.fullName || s.id)}${isYou ? '<span class="you-tag">YOU</span>' : ''}</div>
          <div class="staff-meta">@${escapeHtml(s.id)}</div>
        </div>
        <span class="staff-role-pill ${s.role === 'admin' ? 'role-admin' : ''}">${escapeHtml(s.role || 'teacher')}</span>
        <div class="staff-pw">
          <span class="staff-pw-value" data-pw-value="${s.id}">${pwDisplay}</span>
          <button class="staff-pw-toggle" data-id="${s.id}" aria-label="Show password"><i class="bx ${revealed ? 'bx-hide' : 'bx-show'}"></i></button>
        </div>
        ${isAdmin ? `
        <div class="staff-actions">
          <button class="edit-staff-btn" data-id="${s.id}" aria-label="Edit"><i class="bx bx-edit"></i></button>
          <button class="delete-staff-btn" data-id="${s.id}" aria-label="Delete"><i class="bx bx-trash"></i></button>
        </div>` : ''}
      </div>`;
  }).join('');

  staffList.querySelectorAll('.staff-pw-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      revealedPasswords.has(id) ? revealedPasswords.delete(id) : revealedPasswords.add(id);
      renderStaff();
    });
  });

  if (isAdmin){
    staffList.querySelectorAll('.edit-staff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const staff = allStaff.find(s => s.id === btn.dataset.id);
        if (staff) openStaffForm('edit', staff);
      });
    });
    staffList.querySelectorAll('.delete-staff-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (operator && operator.username === id){
          showToast("You can't remove your own account while signed in");
          return;
        }
        const staff = allStaff.find(s => s.id === id);
        if (!confirm(`Remove ${staff?.fullName || id} from staff accounts?`)) return;
        try{
          await deleteDoc(doc(db, 'operators', id));
          showToast('Staff member removed');
        }catch(err){
          console.error(err);
          showToast("Couldn't remove — try again");
        }
      });
    });
  }
}

onSnapshot(query(collection(db, 'operators'), orderBy('createdAt', 'asc')), (snap) => {
  allStaff = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderStaff();
}, (err) => {
  console.error(err);
  staffList.innerHTML = '';
  staffEmpty.hidden = false;
  staffEmpty.textContent = "Couldn't load staff accounts.";
});

/* =========================================================
   CHANGE PASSWORD (shared Firebase Auth credential) — admin only
   ========================================================= */
function setPwError(id, show){
  document.getElementById('group-' + id)?.classList.toggle('error', show);
}

if (isAdmin){
  document.getElementById('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const current = document.getElementById('currentPassword').value;
    const next = document.getElementById('newPassword').value;
    const confirm2 = document.getElementById('confirmPassword').value;

    let valid = true;
    setPwError('currentPassword', false);
    setPwError('newPassword', false);
    setPwError('confirmPassword', false);

    if (!current){ setPwError('currentPassword', true); valid = false; }
    if (!next || next.length < 8){ setPwError('newPassword', true); valid = false; }
    if (next !== confirm2){ setPwError('confirmPassword', true); valid = false; }
    if (!valid || !currentUser) return;

    const btn = document.getElementById('passwordSaveBtn');
    btn.classList.add('loading');
    btn.disabled = true;

    try{
      const credential = EmailAuthProvider.credential(currentUser.email, current);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, next);

      document.getElementById('passwordForm').reset();
      showToast('Shared admin password updated');
    }catch(err){
      console.error(err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'){
        setPwError('currentPassword', true);
        showToast('Current password is incorrect');
      } else {
        showToast("Couldn't update password — try again");
      }
    }finally{
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });
}
