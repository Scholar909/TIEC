import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteField, onSnapshot,
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
function timeAgo(date){
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}
function formatDate(ts){
  if (!ts || !ts.toDate) return '—';
  return ts.toDate().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
}
function formatDob(dobStr){
  if (!dobStr) return '—';
  const d = new Date(dobStr);
  if (isNaN(d)) return dobStr;
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}
function calcAge(dobStr){
  const d = new Date(dobStr);
  if (isNaN(d)) return '—';
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return `${age} years old`;
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
   APPLICATIONS DATA
   Field names match the public membership.html #joinForm exactly.
   On approve, this is written to students/{uid} — schema matches
   what pages/student/profile.js already reads:
   fullName, studentEmail, dob, academy, membershipLevel,
   experience, notes, parentName, parentEmail, parentPhone,
   username, approvedAt (Timestamp — "account age" counts from
   this), applicationId, passwordActivated:false.
   photoURL / photoChangesRemaining are left unset — optional,
   student sets these later from their own profile page.
   ========================================================= */
function levelMeta(level){
  const l = (level || '').toLowerCase();
  if (l.includes('young'))  return { label: 'Young Explorers',   cls: 'level-young'  };
  if (l.includes('junior')) return { label: 'Junior Innovators', cls: 'level-junior' };
  if (l.includes('teen'))   return { label: 'Teen Innovators',   cls: 'level-teen'   };
  return { label: level || 'Unspecified', cls: 'level-unknown' };
}
const STATUS_META = {
  pending:  { label: 'Pending',  cls: 'status-pending'  },
  approved: { label: 'Approved', cls: 'status-approved' },
  rejected: { label: 'Rejected', cls: 'status-rejected' }
};

let allApplications = [];
let activeTab = 'pending';
let searchTerm = '';
const expandedState = new Map(); // id -> bool, defaults set the first time a card is seen
const busyIds = new Set();       // ids currently mid-approve, to lock re-clicks

const appListEl = document.getElementById('appList');

function usernameFor(fullName){
  return (fullName || 'student').trim().toLowerCase().split(/\s+/).join('.');
}
function tempPasswordFor(fullName){
  const abbrev = (fullName || 'student').trim().split(/\s+/).map(w => w[0]).join('').toLowerCase();
  return `@tiec-student-${abbrev || 'x'}`;
}

function render(){
  const counts = { pending:0, approved:0, rejected:0, all: allApplications.length };
  allApplications.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });
  document.getElementById('countPending').textContent = counts.pending;
  document.getElementById('countApproved').textContent = counts.approved;
  document.getElementById('countRejected').textContent = counts.rejected;
  document.getElementById('countAll').textContent = counts.all;

  const navBadge = document.getElementById('navBadgeApplications');
  if (counts.pending > 0){ navBadge.textContent = counts.pending; navBadge.hidden = false; }
  else navBadge.hidden = true;

  let rows = activeTab === 'all' ? allApplications : allApplications.filter(a => a.status === activeTab);
  if (searchTerm){
    const t = searchTerm.toLowerCase();
    rows = rows.filter(a => (a.studentName || '').toLowerCase().includes(t) || (a.parentName || '').toLowerCase().includes(t));
  }

  if (rows.length === 0){
    appListEl.innerHTML = `<p class="list-empty">No ${activeTab === 'all' ? '' : activeTab} applications${searchTerm ? ' match your search' : ''}.</p>`;
    return;
  }

  appListEl.innerHTML = rows.map(a => cardHtml(a)).join('');
  wireCardEvents();
}

function cardHtml(a){
  if (!expandedState.has(a.id)) expandedState.set(a.id, a.status === 'pending');
  const expanded = expandedState.get(a.id);
  const lvl = levelMeta(a.level);
  const st = STATUS_META[a.status] || { label: a.status || '—', cls: '' };
  const when = a.submittedAt && a.submittedAt.toDate ? timeAgo(a.submittedAt.toDate()) : '';
  const isBusy = busyIds.has(a.id);

  return `
    <div class="app-card glass ${expanded ? 'expanded' : ''}" data-id="${a.id}" data-status="${a.status}">
      <div class="app-card-header" data-role="toggle">
        <span class="avatar-circle">${escapeHtml(initials(a.studentName))}</span>
        <div class="app-card-titles">
          <h3>${escapeHtml(a.studentName || 'Unnamed applicant')}</h3>
          <div class="app-card-pills">
            <span class="level-badge ${lvl.cls}">${escapeHtml(lvl.label)}</span>
            <span class="status-pill ${st.cls}">${escapeHtml(st.label)}</span>
          </div>
        </div>
        <span class="app-card-meta">${when}</span>
        <button class="expand-toggle" aria-label="Expand"><i class="bx bx-chevron-down"></i></button>
      </div>

      <div class="app-card-parent-line">
        <i class="bx bx-group"></i>
        <span><b>${escapeHtml(a.parentName || 'No parent name')}</b></span>
        <span class="sep">·</span>
        <span>${escapeHtml(a.parentPhone || '—')}</span>
        <span class="sep">·</span>
        <span>${escapeHtml(a.parentEmail || '—')}</span>
      </div>

      <div class="app-card-body">
        <div class="detail-section-title"><i class="bx bx-id-card"></i> Registration Details</div>
        <div class="detail-grid">
          <div class="detail-item"><span class="detail-label">Student Email</span><span class="detail-value">${escapeHtml(a.studentEmail || '—')}</span></div>
          <div class="detail-item"><span class="detail-label">Date of Birth</span><span class="detail-value">${escapeHtml(formatDob(a.studentDob))}</span></div>
          <div class="detail-item"><span class="detail-label">Age</span><span class="detail-value">${a.studentDob ? calcAge(a.studentDob) : '—'}</span></div>
          <div class="detail-item"><span class="detail-label">Preferred Academy</span><span class="detail-value">${escapeHtml(a.academy || '—')}</span></div>
          <div class="detail-item"><span class="detail-label">Experience Level</span><span class="detail-value">${escapeHtml(a.experience || '—')}</span></div>
          <div class="detail-item"><span class="detail-label">Submitted</span><span class="detail-value">${formatDate(a.submittedAt)}</span></div>
          <div class="detail-item detail-wide"><span class="detail-label">Notes / Interests</span><span class="detail-value">${escapeHtml(a.notes && a.notes.trim() ? a.notes : '—')}</span></div>
        </div>

        <div class="detail-section-title"><i class="bx bx-group"></i> Parent / Guardian</div>
        <div class="detail-grid">
          <div class="detail-item"><span class="detail-label">Name</span><span class="detail-value">${escapeHtml(a.parentName || '—')}</span></div>
          <div class="detail-item"><span class="detail-label">Email</span><span class="detail-value">${escapeHtml(a.parentEmail || '—')}</span></div>
          <div class="detail-item detail-wide"><span class="detail-label">Phone (WhatsApp)</span><span class="detail-value">${escapeHtml(a.parentPhone || '—')}</span></div>
        </div>

        ${a.status === 'approved' ? approvedSectionHtml(a) : ''}
        ${a.status === 'rejected' ? rejectedSectionHtml(a) : ''}
        ${a.status === 'pending' && !isBusy ? pendingActionsHtml(a) : ''}
        ${isBusy ? `<div class="approving-note"><span class="mini-spinner"></span> Creating the student's account…</div>` : ''}
      </div>
    </div>`;
}

function approvedSectionHtml(a){
  const tempPassword = tempPasswordFor(a.studentName);
  const username = a.username || usernameFor(a.studentName);
  const link = `${window.location.origin}/pages/student/student-login.html?email=${encodeURIComponent(a.studentEmail || '')}&pwd=${encodeURIComponent(tempPassword)}`;
  return `
    <div class="detail-section-title"><i class="bx bx-shield-quarter"></i> Membership</div>
    <div class="detail-grid">
      <div class="detail-item"><span class="detail-label">Username</span><span class="detail-value">${escapeHtml(username)}</span></div>
      <div class="detail-item"><span class="detail-label">Approved On</span><span class="detail-value">${formatDate(a.approvedAt)}</span></div>
    </div>
    <p class="temp-pw-note">Share this link so the family can log in and set their permanent password:</p>
    <div class="link-box">
      <input type="text" readonly value="${escapeHtml(link)}" data-role="link-input">
      <button class="btn btn-lime" data-role="copy-link" data-link="${escapeHtml(link)}"><i class="bx bx-copy"></i></button>
    </div>
    <p class="temp-pw-note">Temporary password: <code>${escapeHtml(tempPassword)}</code></p>`;
}

function rejectedSectionHtml(a){
  return `
    <div class="detail-section-title"><i class="bx bx-x-circle"></i> Rejection</div>
    <div class="rejected-note">
      <i class="bx bx-info-circle"></i>
      <p>${escapeHtml(a.rejectionReason || 'No reason recorded.')}</p>
    </div>`;
}

function pendingActionsHtml(a){
  return `
    <div class="reject-reason hidden" data-role="reject-reason-block">
      <label>Reason for rejection</label>
      <textarea rows="3" placeholder="Let the family know why…" data-role="reject-reason-input"></textarea>
      <span class="field-err hidden" data-role="reject-reason-err">A reason is required.</span>
      <div class="action-row">
        <button class="btn btn-ghost" data-role="cancel-reject">Cancel</button>
        <button class="btn btn-danger" data-role="confirm-reject">Confirm Rejection</button>
      </div>
    </div>
    <div class="action-row" data-role="main-actions">
      <button class="btn btn-outline-danger" data-role="reject-btn"><i class="bx bx-x-circle"></i> Reject</button>
      <button class="btn btn-lime" data-role="approve-btn"><i class="bx bx-check"></i> Approve</button>
    </div>`;
}

function wireCardEvents(){
  appListEl.querySelectorAll('.app-card').forEach(card => {
    const id = card.dataset.id;
    const a = allApplications.find(x => x.id === id);
    if (!a) return;

    card.querySelector('[data-role="toggle"]').addEventListener('click', () => {
      const nowExpanded = !expandedState.get(id);
      expandedState.set(id, nowExpanded);
      card.classList.toggle('expanded', nowExpanded);
    });

    const approveBtn = card.querySelector('[data-role="approve-btn"]');
    if (approveBtn) approveBtn.addEventListener('click', () => approveApplication(a));

    const rejectBtn = card.querySelector('[data-role="reject-btn"]');
    if (rejectBtn) rejectBtn.addEventListener('click', () => {
      card.querySelector('[data-role="reject-reason-block"]').classList.remove('hidden');
      card.querySelector('[data-role="main-actions"]').classList.add('hidden');
    });

    const cancelReject = card.querySelector('[data-role="cancel-reject"]');
    if (cancelReject) cancelReject.addEventListener('click', () => {
      card.querySelector('[data-role="reject-reason-block"]').classList.add('hidden');
      card.querySelector('[data-role="main-actions"]').classList.remove('hidden');
    });

    const confirmReject = card.querySelector('[data-role="confirm-reject"]');
    if (confirmReject) confirmReject.addEventListener('click', () => rejectApplication(a, card));

    const copyBtn = card.querySelector('[data-role="copy-link"]');
    if (copyBtn) copyBtn.addEventListener('click', async () => {
      const link = copyBtn.dataset.link;
      try{
        await navigator.clipboard.writeText(link);
      }catch(e){
        const input = card.querySelector('[data-role="link-input"]');
        input.select();
        document.execCommand('copy');
      }
      showToast('Link copied');
    });
  });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.status;
    render();
  });
});
document.getElementById('searchInput').addEventListener('input', (e) => {
  searchTerm = e.target.value.trim();
  render();
});

onSnapshot(query(collection(db, 'applications'), orderBy('submittedAt', 'desc')), (snap) => {
  allApplications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render();
}, (err) => {
  console.error(err);
  appListEl.innerHTML = '<p class="list-empty">Couldn\'t load applications.</p>';
});

/* ---------- approve: create the student's account from the admin side ---------- */
async function approveApplication(a){
  if (!operator || !a.studentEmail){
    showToast("This application is missing a student email — can't create an account.");
    return;
  }
  busyIds.add(a.id);
  render();

  const tempPassword = tempPasswordFor(a.studentName);
  const username = usernameFor(a.studentName);
  let secondaryApp;
  try{
    secondaryApp = initializeApp(firebaseConfig, 'StudentCreate-' + Date.now());
    const secondaryAuth = getAuth(secondaryApp);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, a.studentEmail, tempPassword);
    const uid = cred.user.uid;
    await signOut(secondaryAuth);

    await setDoc(doc(db, 'students', uid), {
      fullName: a.studentName || '',
      studentEmail: a.studentEmail,
      dob: a.studentDob || '',
      academy: a.academy || '',
      membershipLevel: a.level || '',
      experience: a.experience || '',
      notes: a.notes || '',
      parentName: a.parentName || '',
      parentEmail: a.parentEmail || '',
      parentPhone: a.parentPhone || '',
      username,
      applicationId: a.id,
      photoChangesRemaining: 2,
      approvedAt: serverTimestamp(),
      passwordActivated: false
    });

    await updateDoc(doc(db, 'applications', a.id), {
      status: 'approved',
      approvedAt: serverTimestamp(),
      approvedBy: operator.username,
      studentUid: uid,
      username
    });

    showToast('Account created — link ready to share');
  }catch(err){
    console.error(err);
    if (err.code === 'auth/email-already-in-use'){
      showToast('That student email already has an account.');
    } else {
      showToast("Couldn't create the account — try again");
    }
  }finally{
    busyIds.delete(a.id);
    if (secondaryApp){
      try{ await deleteApp(secondaryApp); }catch(e){ /* ignore */ }
    }
  }
}

/* ---------- reject: status change only — admin follows up with parents directly ---------- */
async function rejectApplication(a, card){
  const textarea = card.querySelector('[data-role="reject-reason-input"]');
  const reason = textarea.value.trim();
  if (!reason){
    card.querySelector('[data-role="reject-reason-err"]').classList.remove('hidden');
    return;
  }
  const btn = card.querySelector('[data-role="confirm-reject"]');
  btn.disabled = true;
  try{
    await updateDoc(doc(db, 'applications', a.id), {
      status: 'rejected',
      rejectedAt: serverTimestamp(),
      rejectedBy: operator.username,
      rejectionReason: reason
    });
    expandedState.set(a.id, false);
    showToast('Application rejected');
  }catch(e){
    console.error(e);
    showToast("Couldn't reject — try again");
    btn.disabled = false;
  }
}
