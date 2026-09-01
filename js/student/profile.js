import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, updateDoc, increment, collection, query, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js";

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
const storage = getStorage(app);

/* =========================================================
   Assumed Firestore schema on students/{uid} — this is what
   the membership application (membership.html) submits, plus
   what the (future) admin portal sets on approval:

   fullName, studentEmail, dob, academy, membershipLevel,
   experience, notes, parentName, parentEmail, parentPhone,
   username,
   approvedAt        (Timestamp — set the moment admin approves;
                       this is what "account age" counts from)
   photoURL          (string, optional — empty until student uploads)
   photoChangesRemaining (number, defaults to 2 if the field is
                       missing, i.e. no photo uploaded yet)
   ========================================================= */

let uid = null;
let currentChangesRemaining = 2;
let pendingFile = null;

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

/* ---------- notifications bell preview (same behaviour as dashboard) ---------- */
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

/* ---------- small helpers ---------- */
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
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}
function calcAge(dobValue){
  const dob = toDate(dobValue) || (typeof dobValue === 'string' ? new Date(dobValue) : null);
  if (!dob || isNaN(dob)) return '—';
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age--;
  return `${age} years old`;
}
function formatAccountAge(approvedAt){
  const start = toDate(approvedAt);
  if (!start) return '—';
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();
  if (days < 0){
    months--;
    const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    days += prevMonth;
  }
  if (months < 0){ years--; months += 12; }

  if (years > 0) return `${years} yr${years > 1 ? 's' : ''}, ${months} mo${months !== 1 ? 's' : ''}`;
  if (months > 0) return `${months} mo${months !== 1 ? 's' : ''}, ${days} day${days !== 1 ? 's' : ''}`;
  if (days > 0) return `${days} day${days !== 1 ? 's' : ''}`;
  return 'Joined today';
}

/* ---------- paint profile from Firestore data ---------- */
function paintProfile(data){
  const name = data.fullName || 'Explorer';
  const level = data.membershipLevel || 'Member';
  const initials = getInitials(name);

  document.getElementById('topAvatar').textContent = initials;
  document.getElementById('ddAvatar').textContent = initials;
  document.getElementById('ddName').textContent = name;
  document.getElementById('ddLevel').textContent = level;

  document.getElementById('headerName').textContent = name;
  document.getElementById('headerLevel').textContent = level;
  document.getElementById('headerAge').innerHTML = `<i class="bx bx-time-five"></i> ${formatAccountAge(data.approvedAt)} on the team`;

  document.getElementById('photoInitials').textContent = initials;
  document.getElementById('previewInitials').textContent = initials;

  if (data.photoURL){
    const img = document.getElementById('photoImg');
    img.src = data.photoURL;
    img.hidden = false;
    document.getElementById('photoInitials').style.display = 'none';

    const pImg = document.getElementById('previewImg');
    pImg.src = data.photoURL;
    pImg.hidden = false;
    document.getElementById('previewInitials').style.display = 'none';
  }

  // Registration details
  document.getElementById('dFullName').textContent = name;
  document.getElementById('dEmail').textContent = data.studentEmail || data.email || '—';
  document.getElementById('dDob').textContent = data.dob ? formatDate(toDate(data.dob) || new Date(data.dob)) : '—';
  document.getElementById('dAge').textContent = data.dob ? calcAge(data.dob) : '—';
  document.getElementById('dAcademy').textContent = data.academy || '—';
  document.getElementById('dLevel').textContent = level;
  document.getElementById('dExperience').textContent = data.experience || '—';
  document.getElementById('dNotes').textContent = data.notes && data.notes.trim() ? data.notes : '—';

  // Parent / guardian
  document.getElementById('pName').textContent = data.parentName || '—';
  document.getElementById('pEmail').textContent = data.parentEmail || '—';
  document.getElementById('pPhone').textContent = data.parentPhone || '—';

  // Membership
  document.getElementById('mUsername').textContent = data.username || '—';
  document.getElementById('mApproved').textContent = formatDate(toDate(data.approvedAt));
  document.getElementById('mAccountAge').textContent = formatAccountAge(data.approvedAt);

  // Photo changes remaining
  currentChangesRemaining = typeof data.photoChangesRemaining === 'number' ? data.photoChangesRemaining : 2;
  paintChangesRemaining();
}

function paintChangesRemaining(){
  const pill = document.getElementById('changesPill');
  const locked = currentChangesRemaining <= 0;

  pill.textContent = locked ? 'No changes left' : `${currentChangesRemaining} change${currentChangesRemaining === 1 ? '' : 's'} left`;
  pill.classList.toggle('pill-zero', locked);

  document.getElementById('lockedNote').hidden = !locked;
  document.getElementById('chooseFileBtn').disabled = locked;
  document.getElementById('photoNote').style.display = locked ? 'none' : 'block';
}

/* =========================================================
   PHOTO UPLOAD FLOW
   ========================================================= */
const photoInput = document.getElementById('photoInput');
const chooseFileBtn = document.getElementById('chooseFileBtn');
const savePhotoBtn = document.getElementById('savePhotoBtn');
const previewImg = document.getElementById('previewImg');
const previewInitials = document.getElementById('previewInitials');

chooseFileBtn.addEventListener('click', () => photoInput.click());

photoInput.addEventListener('change', () => {
  const file = photoInput.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')){
    alert('Please choose an image file.');
    photoInput.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024){
    alert('That image is over 5MB — please choose a smaller file.');
    photoInput.value = '';
    return;
  }

  pendingFile = file;
  const url = URL.createObjectURL(file);
  previewImg.src = url;
  previewImg.hidden = false;
  previewInitials.style.display = 'none';
  savePhotoBtn.disabled = currentChangesRemaining <= 0;
});

savePhotoBtn.addEventListener('click', () => {
  if (!pendingFile || currentChangesRemaining <= 0) return;
  document.getElementById('confirmRemaining').textContent = String(currentChangesRemaining - 1);
  document.getElementById('confirmOverlay').classList.add('open');
});

document.getElementById('confirmCancel').addEventListener('click', () => {
  document.getElementById('confirmOverlay').classList.remove('open');
});

document.getElementById('confirmProceed').addEventListener('click', async () => {
  if (!pendingFile || !uid) return;
  document.getElementById('confirmOverlay').classList.remove('open');

  savePhotoBtn.classList.add('loading');
  savePhotoBtn.disabled = true;

  try{
    const path = `profile-photos/${uid}/photo-${Date.now()}.jpg`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, pendingFile);
    const url = await getDownloadURL(fileRef);

    await updateDoc(doc(db, 'students', uid), {
      photoURL: url,
      photoChangesRemaining: increment(-1)
    });

    currentChangesRemaining = Math.max(0, currentChangesRemaining - 1);

    const headerImg = document.getElementById('photoImg');
    headerImg.src = url;
    headerImg.hidden = false;
    document.getElementById('photoInitials').style.display = 'none';

    paintChangesRemaining();
    pendingFile = null;
    photoInput.value = '';
  } catch (err){
    console.error('Photo upload failed:', err);
    alert("Sorry, we couldn't save that photo. Please try again.");
  } finally {
    savePhotoBtn.classList.remove('loading');
    savePhotoBtn.disabled = currentChangesRemaining <= 0;
  }
});

/* =========================================================
   AUTH GUARD + DATA LOAD
   ========================================================= */
onAuthStateChanged(auth, async (user) => {
  if (!user){
    window.location.href = 'student-login.html';
    return;
  }
  uid = user.uid;

  try{
    const snap = await getDoc(doc(db, 'students', uid));
    const data = snap.exists() ? snap.data() : { fullName: user.displayName, studentEmail: user.email };
    paintProfile(data);
    loadNotificationsPreview(uid);
  } catch (err){
    console.error('Profile load failed:', err);
  }
});
