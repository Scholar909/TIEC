import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteField, onSnapshot,
  collection, query, orderBy
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
function levelMeta(level){
  const l = (level || '').toLowerCase();
  if (l.includes('young'))  return { label: 'Young Explorers',   cls: 'level-young'  };
  if (l.includes('junior')) return { label: 'Junior Innovators', cls: 'level-junior' };
  if (l.includes('teen'))   return { label: 'Teen Innovators',   cls: 'level-teen'   };
  return { label: level || 'Unspecified', cls: 'level-unknown' };
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
   STUDENTS LIST
   ========================================================= */
let allStudents = [];
let activeFilter = 'all';
let searchTerm = '';
const gridEl = document.getElementById('studentsGrid');

function render(){
  const counts = { all: allStudents.length, 'Young Explorers':0, 'Junior Innovators':0, 'Teen Innovators':0, blocked:0 };
  allStudents.forEach(s => {
    const lvl = levelMeta(s.membershipLevel).label;
    if (counts[lvl] !== undefined) counts[lvl]++;
    if (s.blocked === true) counts.blocked++;
  });
  document.getElementById('countAll').textContent = counts.all;
  document.getElementById('countYoung').textContent = counts['Young Explorers'];
  document.getElementById('countJunior').textContent = counts['Junior Innovators'];
  document.getElementById('countTeen').textContent = counts['Teen Innovators'];
  document.getElementById('countBlocked').textContent = counts.blocked;

  let rows = allStudents;
  if (activeFilter === 'blocked') rows = rows.filter(s => s.blocked === true);
  else if (activeFilter !== 'all') rows = rows.filter(s => levelMeta(s.membershipLevel).label === activeFilter);

  if (searchTerm){
    const t = searchTerm.toLowerCase();
    rows = rows.filter(s => (s.fullName || '').toLowerCase().includes(t));
  }

  if (rows.length === 0){
    gridEl.innerHTML = `<p class="list-empty">No students${activeFilter !== 'all' ? ' in this group' : ''}${searchTerm ? ' match your search' : ''}.</p>`;
    return;
  }

  gridEl.innerHTML = rows.map(s => {
    const lvl = levelMeta(s.membershipLevel);
    const photo = s.photoURL
      ? `<img src="${escapeHtml(s.photoURL)}" alt="${escapeHtml(s.fullName || '')}">`
      : escapeHtml(initials(s.fullName));
    return `
      <a href="view.html?uid=${encodeURIComponent(s.id)}" class="student-card glass ${s.blocked ? 'is-blocked' : ''}">
        <span class="student-photo">${photo}</span>
        <div class="student-info">
          <span class="student-name">${escapeHtml(s.fullName || 'Unnamed student')}</span>
          <span class="student-level">
            <span class="level-badge ${lvl.cls}">${escapeHtml(lvl.label)}</span>
            ${s.blocked ? '<span class="blocked-pill"><i class="bx bx-block"></i> Blocked</span>' : ''}
          </span>
        </div>
        <i class="bx bx-chevron-right card-chevron"></i>
      </a>`;
  }).join('');
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.level;
    render();
  });
});
document.getElementById('searchInput').addEventListener('input', (e) => {
  searchTerm = e.target.value.trim();
  render();
});

onSnapshot(query(collection(db, 'students'), orderBy('fullName', 'asc')), (snap) => {
  allStudents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render();
}, (err) => {
  console.error(err);
  gridEl.innerHTML = '<p class="list-empty">Couldn\'t load students.</p>';
});
