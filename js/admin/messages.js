import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, onSnapshot,
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
function timeAgo(date){
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}
function formatDateTime(ts){
  if (!ts || !ts.toDate) return '—';
  return ts.toDate().toLocaleString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'numeric', minute:'2-digit' });
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
   MESSAGES DATA
   Reads the shared `adminMessages` collection — written to by
   both pages/contact.html (tag: 'visitor') and
   js/student/contact-admin.js (tag: 'student').
     name, email, phone, reason, message, tag ('visitor'|'student'),
     status ('unread'|'read'), studentUid (student tag only),
     createdAt (Timestamp)
   ========================================================= */
const TAG_META = {
  visitor: { label: 'Visitor', cls: 'tag-visitor' },
  student: { label: 'Student', cls: 'tag-student' }
};

let allMessages = [];
let activeFilter = 'all';
let searchTerm = '';
const expandedState = new Map();

const msgListEl = document.getElementById('msgList');
const listEmptyEl = document.getElementById('listEmpty');

function matchesFilter(m){
  if (activeFilter === 'unread') return m.status === 'unread';
  if (activeFilter === 'visitor') return m.tag === 'visitor';
  if (activeFilter === 'student') return m.tag === 'student';
  return true;
}
function matchesSearch(m){
  if (!searchTerm) return true;
  const term = searchTerm.toLowerCase();
  return (m.name || '').toLowerCase().includes(term)
    || (m.email || '').toLowerCase().includes(term)
    || (m.reason || '').toLowerCase().includes(term)
    || (m.message || '').toLowerCase().includes(term);
}

function render(){
  const counts = { all: allMessages.length, unread: 0, visitor: 0, student: 0 };
  allMessages.forEach(m => {
    if (m.status === 'unread') counts.unread++;
    if (m.tag === 'visitor') counts.visitor++;
    if (m.tag === 'student') counts.student++;
  });
  document.getElementById('countAll').textContent = counts.all;
  document.getElementById('countUnread').textContent = counts.unread;
  document.getElementById('countVisitor').textContent = counts.visitor;
  document.getElementById('countStudent').textContent = counts.student;

  const navBadge = document.getElementById('navBadgeMessages');
  if (counts.unread > 0){ navBadge.textContent = counts.unread; navBadge.hidden = false; }
  else { navBadge.hidden = true; }

  const visible = allMessages.filter(m => matchesFilter(m) && matchesSearch(m));

  if (!visible.length){
    msgListEl.innerHTML = '';
    listEmptyEl.hidden = false;
    return;
  }
  listEmptyEl.hidden = true;

  msgListEl.innerHTML = visible.map(cardHtml).join('');
  wireCardEvents();
}

function cardHtml(m){
  const tagMeta = TAG_META[m.tag] || TAG_META.visitor;
  const isUnread = m.status === 'unread';
  const isExpanded = !!expandedState.get(m.id);
  const when = m.createdAt && m.createdAt.toDate ? timeAgo(m.createdAt.toDate()) : '';

  return `
    <div class="msg-card glass ${isUnread ? 'unread' : ''} ${isExpanded ? 'expanded' : ''}" data-id="${m.id}">
      <div class="msg-card-header" data-role="toggle">
        <span class="msg-avatar">${initials(m.name)}</span>
        <div class="msg-card-titles">
          <h3>${isUnread ? '<span class="unread-dot"></span>' : ''}${escapeHtml(m.name || 'Unknown')}</h3>
          <div class="msg-card-subject">${escapeHtml(m.reason || m.message || '')}</div>
        </div>
        <div class="msg-card-meta">
          <span class="tag-pill ${tagMeta.cls}">${tagMeta.label}</span>
          ${when}
        </div>
        <button class="expand-toggle" aria-label="Expand"><i class="bx bx-chevron-down"></i></button>
      </div>

      <div class="msg-card-body">
        <div class="detail-section-title"><i class="bx bx-user"></i> Sender</div>
        <div class="detail-grid">
          <div class="detail-item"><span class="detail-label">Name</span><span class="detail-value">${escapeHtml(m.name || '—')}</span></div>
          <div class="detail-item"><span class="detail-label">Email</span><span class="detail-value">${escapeHtml(m.email || '—')}</span></div>
          <div class="detail-item"><span class="detail-label">Phone</span><span class="detail-value">${escapeHtml(m.phone || 'Not provided')}</span></div>
          <div class="detail-item"><span class="detail-label">Reason</span><span class="detail-value">${escapeHtml(m.reason || '—')}</span></div>
          <div class="detail-item detail-wide"><span class="detail-label">Sent</span><span class="detail-value">${formatDateTime(m.createdAt)}</span></div>
        </div>

        <div class="detail-section-title"><i class="bx bx-message-detail"></i> Message</div>
        <div class="msg-full-text">${escapeHtml(m.message || '')}</div>

        <div class="msg-action-row">
          <a class="btn btn-lime" href="mailto:${encodeURIComponent(m.email || '')}?subject=${encodeURIComponent('Re: ' + (m.reason || 'Your message to TIEC'))}&body=${encodeURIComponent('Hi ' + (m.name || '') + ',\n\n')}" data-role="reply-link"><i class="bx bx-reply"></i> Reply by Email</a>
          <button class="btn btn-outline" data-role="toggle-read">${isUnread ? '<i class="bx bx-envelope-open"></i> Mark as Read' : '<i class="bx bx-envelope"></i> Mark as Unread'}</button>
          <button class="btn btn-outline-danger" data-role="delete-btn"><i class="bx bx-trash"></i> Delete</button>
        </div>
      </div>
    </div>`;
}

function wireCardEvents(){
  msgListEl.querySelectorAll('.msg-card').forEach(card => {
    const id = card.dataset.id;
    const m = allMessages.find(x => x.id === id);
    if (!m) return;

    card.querySelector('[data-role="toggle"]').addEventListener('click', () => {
      const nowExpanded = !expandedState.get(id);
      expandedState.set(id, nowExpanded);
      card.classList.toggle('expanded', nowExpanded);

      if (nowExpanded && m.status === 'unread'){
        markStatus(m, 'read');
      }
    });

    card.querySelector('[data-role="toggle-read"]').addEventListener('click', (e) => {
      e.stopPropagation();
      markStatus(m, m.status === 'unread' ? 'read' : 'unread');
    });

    card.querySelector('[data-role="delete-btn"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete this message from ${m.name || 'this sender'}? This can't be undone.`)) return;
      try{
        await deleteDoc(doc(db, 'adminMessages', m.id));
        showToast('Message deleted');
      }catch(err){
        console.error(err);
        showToast("Couldn't delete — try again");
      }
    });

    card.querySelector('[data-role="reply-link"]').addEventListener('click', (e) => e.stopPropagation());
  });
}

async function markStatus(m, status){
  try{
    await updateDoc(doc(db, 'adminMessages', m.id), { status });
  }catch(err){
    console.error(err);
    showToast("Couldn't update — try again");
  }
}

document.querySelectorAll('#filterTabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#filterTabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    render();
  });
});
document.getElementById('searchInput').addEventListener('input', (e) => {
  searchTerm = e.target.value.trim();
  render();
});

onSnapshot(query(collection(db, 'adminMessages'), orderBy('createdAt', 'desc')), (snap) => {
  allMessages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render();
}, (err) => {
  console.error(err);
  msgListEl.innerHTML = '';
  listEmptyEl.hidden = false;
  listEmptyEl.textContent = "Couldn't load messages.";
});
