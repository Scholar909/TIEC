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
   OPERATOR CHROME
   ========================================================= */
function initials(name){
  return (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase();
}
if (operator){
  document.getElementById('opAvatar').textContent = initials(operator.fullName);
  document.getElementById('opName').textContent = operator.fullName || operator.username;
  document.getElementById('opRole').textContent = operator.role || 'teacher';
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
const overlay = document.getElementById('sidebarOverlay');
function openSidebar(){ sidebar.classList.add('open'); overlay.classList.add('show'); }
function closeSidebar(){ sidebar.classList.remove('open'); overlay.classList.remove('show'); }
document.getElementById('sbOpen').addEventListener('click', openSidebar);
document.getElementById('sbClose').addEventListener('click', closeSidebar);
overlay.addEventListener('click', closeSidebar);

const signOutModal = document.getElementById('signOutModal');
document.getElementById('signOutBtn').addEventListener('click', () => signOutModal.classList.add('show'));
document.getElementById('cancelSignOut').addEventListener('click', () => signOutModal.classList.remove('show'));
document.getElementById('confirmSignOut').addEventListener('click', async () => {
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
   APPLICATIONS DATA
   Field names match the public membership.html #joinForm exactly:
   applications/{id}: {
     studentName, studentEmail, studentDob (date string),
     academy, level ('Young Explorers' | 'Junior Innovators' | 'Teen Innovators'),
     experience, notes,
     parentName, parentEmail, parentPhone,
     submittedAt: Timestamp,
     status: 'pending' | 'approved' | 'rejected',
     approvedAt / rejectedAt: Timestamp, approvedBy / rejectedBy: operator username,
     rejectionReason,
     studentUid: set once the account is created on approve
   }
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
let activeAppId = null;

const appListEl = document.getElementById('appList');

function formatDate(ts){
  if (!ts || !ts.toDate) return '—';
  return ts.toDate().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}
function formatDob(dobStr){
  if (!dobStr) return '—';
  const d = new Date(dobStr);
  if (isNaN(d)) return dobStr;
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}
function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

function render(){
  const counts = { pending:0, approved:0, rejected:0, all: allApplications.length };
  allApplications.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });
  document.getElementById('countPending').textContent = counts.pending;
  document.getElementById('countApproved').textContent = counts.approved;
  document.getElementById('countRejected').textContent = counts.rejected;
  document.getElementById('countAll').textContent = counts.all;

  const badge = document.getElementById('badgeApplications');
  if (counts.pending > 0){ badge.textContent = counts.pending; badge.classList.add('show'); }
  else badge.classList.remove('show');

  document.getElementById('countSummary').textContent =
    `${counts.pending} pending · ${counts.approved} approved · ${counts.rejected} rejected`;

  let rows = activeTab === 'all' ? allApplications : allApplications.filter(a => a.status === activeTab);
  if (searchTerm){
    const t = searchTerm.toLowerCase();
    rows = rows.filter(a => (a.studentName || '').toLowerCase().includes(t) || (a.parentName || '').toLowerCase().includes(t));
  }

  if (rows.length === 0){
    appListEl.innerHTML = `<div class="empty-state">No ${activeTab === 'all' ? '' : activeTab} applications${searchTerm ? ' match your search' : ''}.</div>`;
    return;
  }

  appListEl.innerHTML = rows.map(a => {
    const lvl = levelMeta(a.level);
    const st = STATUS_META[a.status] || { label: a.status || '—', cls: '' };
    return `
      <div class="app-row" data-id="${a.id}">
        <div class="applicant-cell">
          <div class="applicant-avatar">${escapeHtml(initials(a.studentName))}</div>
          <div class="applicant-info">
            <span class="applicant-name">${escapeHtml(a.studentName || 'Unnamed applicant')}</span>
            <span class="applicant-parent">${escapeHtml(a.parentName || '')}</span>
          </div>
        </div>
        <div><span class="col-mobile-label">Level</span><span class="level-pill ${lvl.cls}">${escapeHtml(lvl.label)}</span></div>
        <div class="date-cell"><span class="col-mobile-label">Submitted</span>${formatDate(a.submittedAt)}</div>
        <div><span class="col-mobile-label">Status</span><span class="status-pill ${st.cls}">${escapeHtml(st.label)}</span></div>
        <div class="row-arrow"><i class='bx bx-chevron-right'></i></div>
      </div>`;
  }).join('');

  appListEl.querySelectorAll('.app-row').forEach(row => {
    row.addEventListener('click', () => openDrawer(row.dataset.id));
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

/* live listener on the whole collection — fine for a club-scale dataset */
onSnapshot(query(collection(db, 'applications'), orderBy('submittedAt', 'desc')), (snap) => {
  allApplications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render();
  if (activeAppId){
    const current = allApplications.find(a => a.id === activeAppId);
    if (current) populateDrawer(current);
  }
}, (err) => {
  console.error(err);
  appListEl.innerHTML = '<div class="empty-state">Couldn\'t load applications.</div>';
});

/* =========================================================
   DETAIL DRAWER
   ========================================================= */
const drawerOverlay = document.getElementById('drawerOverlay');
function openDrawer(id){
  activeAppId = id;
  const a = allApplications.find(x => x.id === id);
  if (!a) return;
  populateDrawer(a);
  drawerOverlay.classList.add('show');
}
function closeDrawer(){
  drawerOverlay.classList.remove('show');
  activeAppId = null;
  document.getElementById('rejectReasonBlock').classList.add('hidden');
  document.getElementById('confirmRejectRow').classList.add('hidden');
  document.getElementById('pendingActions').querySelector('.action-row').classList.remove('hidden');
  document.getElementById('rejectReason').value = '';
  document.getElementById('rejectReasonErr').classList.add('hidden');
  document.getElementById('approvingBlock').classList.add('hidden');
}
document.getElementById('drawerClose').addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', (e) => { if (e.target === drawerOverlay) closeDrawer(); });

function populateDrawer(a){
  const lvl = levelMeta(a.level);
  const st = STATUS_META[a.status] || { label: a.status || '—', cls: '' };

  document.getElementById('detailAvatar').textContent = initials(a.studentName);
  document.getElementById('detailName').textContent = a.studentName || 'Unnamed applicant';
  document.getElementById('detailLevelPill').textContent = lvl.label;
  document.getElementById('detailLevelPill').className = 'level-pill ' + lvl.cls;
  document.getElementById('detailStatusPill').textContent = st.label;
  document.getElementById('detailStatusPill').className = 'status-pill ' + st.cls;

  document.getElementById('detailStudentEmail').textContent = a.studentEmail || '—';
  document.getElementById('detailDob').textContent = formatDob(a.studentDob);
  document.getElementById('detailSubmitted').textContent = formatDate(a.submittedAt);
  document.getElementById('detailAcademy').textContent = a.academy || '—';
  document.getElementById('detailExperience').textContent = a.experience || '—';
  document.getElementById('detailNotes').textContent = a.notes || '—';
  document.getElementById('detailParentName').textContent = a.parentName || '—';
  document.getElementById('detailParentPhone').textContent = a.parentPhone || '—';
  document.getElementById('detailParentEmail').textContent = a.parentEmail || '—';

  document.getElementById('pendingActions').classList.toggle('hidden', a.status !== 'pending');
  document.getElementById('approvingBlock').classList.add('hidden');
  document.getElementById('approvedBlock').classList.toggle('hidden', a.status !== 'approved');
  document.getElementById('rejectedBlock').classList.toggle('hidden', a.status !== 'rejected');

  if (a.status === 'approved'){
    const tempPassword = tempPasswordFor(a.studentName);
    const link = `${window.location.origin}/pages/student/student-login.html?email=${encodeURIComponent(a.studentEmail)}&pwd=${encodeURIComponent(tempPassword)}`;
    document.getElementById('signupLinkInput').value = link;
    document.getElementById('tempPwText').textContent = tempPassword;
  }
  if (a.status === 'rejected'){
    document.getElementById('rejectedReasonText').textContent = a.rejectionReason || 'No reason recorded.';
  }
}

/* =========================================================
   Temporary password: deterministic from the student's full
   name, so it never needs to be stored in Firestore — it can
   always be recomputed for the link/copy box.
   Format: @tiec-student-<initials of each name part, lowercase>
   ========================================================= */
function tempPasswordFor(fullName){
  const abbrev = (fullName || 'student')
    .trim()
    .split(/\s+/)
    .map(w => w[0])
    .join('')
    .toLowerCase();
  return `@tiec-student-${abbrev || 'x'}`;
}

/* ---------- approve: create the student's account from the admin side ---------- */
document.getElementById('approveBtn').addEventListener('click', async () => {
  if (!activeAppId || !operator) return;
  const a = allApplications.find(x => x.id === activeAppId);
  if (!a || !a.studentEmail){
    showToast('This application is missing a student email — can\'t create an account.');
    return;
  }

  document.getElementById('pendingActions').classList.add('hidden');
  document.getElementById('approvingBlock').classList.remove('hidden');

  const tempPassword = tempPasswordFor(a.studentName);
  let secondaryApp;
  try{
    // Create the account on a secondary Firebase app instance so the
    // admin's own signed-in session is never touched.
    secondaryApp = initializeApp(firebaseConfig, 'StudentCreate-' + Date.now());
    const secondaryAuth = getAuth(secondaryApp);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, a.studentEmail, tempPassword);
    const uid = cred.user.uid;
    await signOut(secondaryAuth);

    await setDoc(doc(db, 'students', uid), {
      fullName: a.studentName || '',
      email: a.studentEmail,
      dob: a.studentDob || '',
      academy: a.academy || '',
      membershipLevel: a.level || '',
      experience: a.experience || '',
      notes: a.notes || '',
      parentName: a.parentName || '',
      parentEmail: a.parentEmail || '',
      parentPhone: a.parentPhone || '',
      applicationId: a.id,
      dateJoined: serverTimestamp(),
      passwordActivated: false
    });

    await updateDoc(doc(db, 'applications', a.id), {
      status: 'approved',
      approvedAt: serverTimestamp(),
      approvedBy: operator.username,
      studentUid: uid
    });

    showToast('Account created — link ready to share');
  }catch(err){
    console.error(err);
    document.getElementById('pendingActions').classList.remove('hidden');
    document.getElementById('approvingBlock').classList.add('hidden');
    if (err.code === 'auth/email-already-in-use'){
      showToast('That student email already has an account.');
    } else {
      showToast("Couldn't create the account — try again");
    }
  }finally{
    if (secondaryApp){
      try{ await deleteApp(secondaryApp); }catch(e){ /* ignore */ }
    }
  }
});

/* ---------- reject (two-step confirm) ---------- */
document.getElementById('rejectBtn').addEventListener('click', () => {
  document.getElementById('rejectReasonBlock').classList.remove('hidden');
  document.getElementById('pendingActions').querySelector('.action-row').classList.add('hidden');
  document.getElementById('confirmRejectRow').classList.remove('hidden');
});
document.getElementById('cancelRejectBtn').addEventListener('click', () => {
  document.getElementById('rejectReasonBlock').classList.add('hidden');
  document.getElementById('confirmRejectRow').classList.add('hidden');
  document.getElementById('pendingActions').querySelector('.action-row').classList.remove('hidden');
  document.getElementById('rejectReason').value = '';
  document.getElementById('rejectReasonErr').classList.add('hidden');
});
document.getElementById('confirmRejectBtn').addEventListener('click', async () => {
  if (!activeAppId || !operator) return;
  const reason = document.getElementById('rejectReason').value.trim();
  if (!reason){
    document.getElementById('rejectReasonErr').classList.remove('hidden');
    return;
  }
  const btn = document.getElementById('confirmRejectBtn');
  btn.disabled = true;
  try{
    await updateDoc(doc(db, 'applications', activeAppId), {
      status: 'rejected',
      rejectedAt: serverTimestamp(),
      rejectedBy: operator.username,
      rejectionReason: reason
    });
    showToast('Application rejected');
  }catch(e){
    console.error(e);
    showToast("Couldn't reject — try again");
  }
  btn.disabled = false;
});

/* ---------- copy signup link ---------- */
document.getElementById('copyLinkBtn').addEventListener('click', async () => {
  const input = document.getElementById('signupLinkInput');
  try{
    await navigator.clipboard.writeText(input.value);
    showToast('Link copied');
  }catch(e){
    input.select();
    document.execCommand('copy');
    showToast('Link copied');
  }
});
