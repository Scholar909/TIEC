// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Additional SDKs used on this page (Auth + Firestore)
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, addDoc, onSnapshot, collection, query, orderBy, getDocs, limit, serverTimestamp
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
   Assumed setup:

   students/{uid}/sentMessages/{autoId}   — the student's own
     copy, used for the confirmation preview + history list
     subject, message, sentAt (Timestamp)

   adminMessages/{autoId}   — shared inbox collection, also
     written to by the public contact.html form (tag: 'visitor').
     Student portal messages get tag: 'student' so the future
     admin contact page can tell them apart / filter by either.
     name, email, phone, reason (=subject), message, tag,
     studentUid, status, createdAt (Timestamp)

   EMAILJS SETUP — replace these values once your EmailJS
   account is ready (https://www.emailjs.com):
     1. EMAILJS_PUBLIC_KEY   → Account → API Keys → Public Key
     2. EMAILJS_SERVICE_ID   → Email Services → your connected service
     3. EMAILJS_TEMPLATE_ID  → Email Templates → the template you build
   Build the EmailJS template with variables matching the
   templateParams keys sent below: {{visitor_name}} (student's
   name), {{visitor_email}}, {{visitor_phone}}, {{reason}},
   {{message}} — same variable names as the public contact form's
   template, so one EmailJS template can serve both if you want.
   ========================================================= */

const EMAILJS_PUBLIC_KEY = 'l3a0ppvzcfugMl2ja';   // TODO
const EMAILJS_SERVICE_ID = 'service_62tyel1';   // TODO
const EMAILJS_TEMPLATE_ID = 'template_75fgr3o'; // TODO
window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });

let uid = null;
let studentName = 'A student';
let studentEmail = '';

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
function formatDateTime(d){
  if (!d) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function timeAgo(d){
  if (!d) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function paintIdentity(data){
  studentName = data.fullName || 'Explorer';
  studentEmail = data.studentEmail || data.email || '';
  const initials = getInitials(studentName);
  document.getElementById('topAvatar').textContent = initials;
  document.getElementById('ddAvatar').textContent = initials;
  document.getElementById('ddName').textContent = studentName;
  document.getElementById('ddLevel').textContent = data.membershipLevel || 'Member';
}

/* =========================================================
   QUICK REASON CHIPS
   ========================================================= */
const subjectInput = document.getElementById('subjectInput');
document.getElementById('reasonRow').querySelectorAll('.reason-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.reason-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    if (chip.dataset.reason !== 'Other'){
      subjectInput.value = chip.dataset.reason;
    } else if (subjectInput.value === '' ) {
      subjectInput.focus();
    }
    subjectInput.dispatchEvent(new Event('input'));
  });
});

/* =========================================================
   FORM SUBMIT
   ========================================================= */
const contactForm = document.getElementById('contactForm');
const submitBtn = document.getElementById('submitBtn');
const confirmPanel = document.getElementById('confirmPanel');
const messageInput = document.getElementById('messageInput');

function setError(groupId, show){
  const group = document.getElementById(groupId);
  group.classList.toggle('error', show);
  if (show){
    group.classList.remove('shake');
    void group.offsetWidth;
    group.classList.add('shake');
  }
}

contactForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const subject = subjectInput.value.trim();
  const message = messageInput.value.trim();

  const subjectValid = subject.length > 2;
  const messageValid = message.length > 4;
  setError('group-subject', !subjectValid);
  setError('group-message', !messageValid);
  if (!subjectValid || !messageValid) return;

  submitBtn.classList.add('loading');
  submitBtn.disabled = true;

  try{
    const sentAt = new Date();

    // Copy for the student's own confirmation + history
    await addDoc(collection(db, 'students', uid, 'sentMessages'), {
      subject, message, sentAt: serverTimestamp()
    });

    // Delivery to admin — shared inbox doc (tag: 'student') + EmailJS alert
    await addDoc(collection(db, 'adminMessages'), {
      name: studentName,
      email: studentEmail,
      phone: '',
      reason: subject,
      message,
      tag: 'student',
      studentUid: uid,
      status: 'unread',
      createdAt: serverTimestamp()
    });

    try{
      await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        tagged_name: `Student - ${studentName}`,
        visitor_name: studentName,
        visitor_email: studentEmail || 'Not provided',
        visitor_phone: 'Not provided',
        reason: subject,
        message
      });
    } catch (emailErr){
      console.error('Admin alert email failed to send (message was still saved):', emailErr);
    }

    document.getElementById('confirmSubject').textContent = subject;
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmTime').textContent = `Sent ${formatDateTime(sentAt)}`;

    contactForm.hidden = true;
    confirmPanel.classList.add('show');
    confirmPanel.hidden = false;

    loadHistory();
  } catch (err){
    console.error('Send failed:', err);
    alert("Sorry, we couldn't send that just now. Please try again.");
  } finally {
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
  }
});

document.getElementById('sendAnotherBtn').addEventListener('click', () => {
  contactForm.reset();
  setError('group-subject', false);
  setError('group-message', false);
  document.querySelectorAll('.reason-chip').forEach((c, i) => c.classList.toggle('active', i === 0));
  confirmPanel.classList.remove('show');
  confirmPanel.hidden = true;
  contactForm.hidden = false;
});

/* =========================================================
   SENT MESSAGE HISTORY
   ========================================================= */
async function loadHistory(){
  const list = document.getElementById('historyList');
  const empty = document.getElementById('historyEmpty');

  try{
    // 1. Added limit(5) to fetch only the 5 most recent messages
    const q = query(collection(db, 'students', uid, 'sentMessages'), orderBy('sentAt', 'desc'), limit(5));
    const snap = await getDocs(q);

    if (snap.empty){
      list.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    list.innerHTML = snap.docs.map(d => {
      const m = d.data();
      const date = toDate(m.sentAt);
      const fullMessage = m.message || '';
      
      // 2. Only enable reveal/chevron if message is longer than 90 characters
      const isLong = fullMessage.length > 90;
      const snippet = isLong ? fullMessage.slice(0, 90) + '…' : fullMessage;

      return `
        <div class="history-item ${isLong ? 'expandable' : ''}" data-id="${d.id}" style="${!isLong ? 'cursor:default;' : ''}">
          <div class="history-top">
            <span class="history-subject">${m.subject || 'Message'}</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="history-time">${timeAgo(date)}</span>
              ${isLong ? '<i class="bx bx-chevron-down history-chevron"></i>' : ''}
            </div>
          </div>
          <div class="history-snippet">${snippet}</div>
          ${isLong ? `<div class="history-full">${fullMessage}</div>` : ''}
        </div>
      `;
    }).join('');

    // Only attach click listeners to messages that actually need expansion
    list.querySelectorAll('.history-item.expandable').forEach(item => {
      item.addEventListener('click', () => item.classList.toggle('open'));
    });
  } catch (err){
    console.error('History load failed:', err);
    list.innerHTML = '';
    // 3. Prevent the empty state message from incorrectly showing on query errors
    empty.hidden = true; 
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
    const data = studentSnap.exists() ? studentSnap.data() : { fullName: user.displayName, studentEmail: user.email };
    paintIdentity(data);

    loadHistory();
    loadNotificationsPreview(uid);
  } catch (err){
    console.error('Contact Admin page load failed:', err);
  }
});
