import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  increment,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  onSnapshot
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
   CLOUDINARY
   ========================================================= */

const CLOUDINARY_CLOUD_NAME = "dejkcjvw";
const CLOUDINARY_UPLOAD_PRESET = "tiec uploads";

async function uploadToCloudinary(file){

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET){
    throw new Error("cloudinary-not-configured");
  }

  const formData = new FormData();

  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    {
      method: "POST",
      body: formData
    }
  );

  if (!response.ok){

    let details = "";

    try {
      details = await response.text();
    } catch (e) {}

    console.error("Cloudinary upload failed:", details);

    throw new Error("cloudinary-upload-failed");
  }

  const data = await response.json();

  if (!data.secure_url){
    throw new Error("cloudinary-no-url");
  }

  return data.secure_url;
}


/* =========================================================
   Assumed Firestore schema on students/{uid}
   =========================================================

   fullName
   studentEmail
   dob
   academy
   membershipLevel
   experience
   notes
   parentName
   parentEmail
   parentPhone
   username

   approvedAt
   photoURL
   photoChangesRemaining

   ========================================================= */


let uid = null;
let currentChangesRemaining = 2;
let pendingFile = null;
let previewObjectURL = null;


/* ---------- theme (persisted) ---------- */

const themeToggle = document.getElementById('themeToggle');

function paintThemeIcon(){

  const light =
    document.documentElement.classList.contains('light-mode');

  themeToggle.innerHTML = light
    ? '<i class="bx bx-sun"></i>'
    : '<i class="bx bx-moon"></i>';
}

paintThemeIcon();

themeToggle.addEventListener('click', () => {

  document.documentElement.classList.toggle('light-mode');

  const light =
    document.documentElement.classList.contains('light-mode');

  try {
    localStorage.setItem(
      'iec-theme',
      light ? 'light' : 'dark'
    );
  } catch (e) {}

  paintThemeIcon();
});


/* ---------- sidebar (mobile off-canvas) ---------- */

const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('sidebarBackdrop');
const hamburger = document.getElementById('hamburger');

function openSidebar(){
  sidebar.classList.add('open');
  backdrop.classList.add('show');
}

function closeSidebar(){
  sidebar.classList.remove('open');
  backdrop.classList.remove('show');
}

hamburger.addEventListener('click', () => {

  sidebar.classList.contains('open')
    ? closeSidebar()
    : openSidebar();

});

backdrop.addEventListener('click', closeSidebar);


/* ---------- dropdowns (bell + avatar) ---------- */

function wireDropdown(btnId, panelId){

  const btn = document.getElementById(btnId);
  const panel = document.getElementById(panelId);

  btn.addEventListener('click', (e) => {

    e.stopPropagation();

    const willOpen =
      !panel.classList.contains('open');

    document
      .querySelectorAll('.dropdown-panel.open')
      .forEach(p => p.classList.remove('open'));

    if (willOpen){
      panel.classList.add('open');
    }

  });

}

wireDropdown('bellBtn', 'bellDropdown');
wireDropdown('avatarBtn', 'avatarDropdown');

document.addEventListener('click', () => {

  document
    .querySelectorAll('.dropdown-panel.open')
    .forEach(p => p.classList.remove('open'));

});


/* ---------- logout ---------- */

async function logout(){

  try {
    await signOut(auth);
  } finally {
    window.location.href = 'student-login.html';
  }

}

document
  .getElementById('logoutBtnSide')
  .addEventListener('click', logout);

document
  .getElementById('logoutBtnTop')
  .addEventListener('click', logout);


/* ---------- notifications bell preview ---------- */

async function loadNotificationsPreview(studentUid){

  try{

    const q = query(
      collection(
        db,
        'students',
        studentUid,
        'notifications'
      ),
      orderBy('createdAt', 'desc'),
      limit(4)
    );

    const snap = await getDocs(q);

    const list =
      document.getElementById('bellList');

    let unread = 0;

    if (snap.empty){

      list.innerHTML =
        '<p class="dropdown-empty">No notifications yet.</p>';

      document.getElementById('bellBadge').hidden = true;

      return;
    }

    list.innerHTML = snap.docs.map(d => {

      const n = d.data();

      if (!n.read) unread++;

      return `
        <div class="notif-row">
          <i class="bx bx-bell"></i>

          <div>
            <div class="notif-title">
              ${n.title || 'Notification'}
            </div>

            <div class="notif-time">
              ${n.read ? '' : 'New'}
            </div>
          </div>
        </div>
      `;

    }).join('');

    document.getElementById('bellBadge').hidden =
      unread === 0;

  } catch (err){

    console.error(
      'Notifications preview failed:',
      err
    );

  }

}


/* ---------- small helpers ---------- */

function getInitials(name){

  if (!name) return '--';

  const parts =
    name.trim().split(/\s+/);

  return (
    (parts[0]?.[0] || '') +
    (parts[1]?.[0] || '')
  ).toUpperCase() || '--';

}


function toDate(value){

  if (!value) return null;

  return value.toDate
    ? value.toDate()
    : new Date(value);

}


function formatDate(d){

  if (!d) return '—';

  return d.toLocaleDateString(
    undefined,
    {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }
  );

}


function calcAge(dobValue){

  const dob =
    toDate(dobValue) ||
    (
      typeof dobValue === 'string'
        ? new Date(dobValue)
        : null
    );

  if (!dob || isNaN(dob)) return '—';

  const now = new Date();

  let age =
    now.getFullYear() -
    dob.getFullYear();

  const monthDiff =
    now.getMonth() -
    dob.getMonth();

  if (
    monthDiff < 0 ||
    (
      monthDiff === 0 &&
      now.getDate() < dob.getDate()
    )
  ){
    age--;
  }

  return `${age} years old`;

}


function formatAccountAge(approvedAt){

  const start = toDate(approvedAt);

  if (!start) return '—';

  const now = new Date();

  let years =
    now.getFullYear() -
    start.getFullYear();

  let months =
    now.getMonth() -
    start.getMonth();

  let days =
    now.getDate() -
    start.getDate();

  if (days < 0){

    months--;

    const prevMonth =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        0
      ).getDate();

    days += prevMonth;
  }

  if (months < 0){

    years--;
    months += 12;

  }

  if (years > 0){

    return `${years} yr${years > 1 ? 's' : ''}, ${months} mo${months !== 1 ? 's' : ''}`;

  }

  if (months > 0){

    return `${months} mo${months !== 1 ? 's' : ''}, ${days} day${days !== 1 ? 's' : ''}`;

  }

  if (days > 0){

    return `${days} day${days !== 1 ? 's' : ''}`;

  }

  return 'Joined today';

}


/* ---------- paint profile from Firestore data ---------- */

function paintProfile(data){

  const name =
    data.fullName || 'Explorer';

  const level =
    data.membershipLevel || 'Member';

  const initials =
    getInitials(name);


  document.getElementById('topAvatar').textContent =
    initials;

  document.getElementById('ddAvatar').textContent =
    initials;

  document.getElementById('ddName').textContent =
    name;

  document.getElementById('ddLevel').textContent =
    level;


  document.getElementById('headerName').textContent =
    name;

  document.getElementById('headerLevel').textContent =
    level;

  document.getElementById('headerAge').innerHTML =
    `<i class="bx bx-time-five"></i> ${formatAccountAge(data.approvedAt)} on the team`;


  document.getElementById('photoInitials').textContent =
    initials;

  document.getElementById('previewInitials').textContent =
    initials;


  /* ---------- existing photo ---------- */

  const img =
    document.getElementById('photoImg');

  const photoInitials =
    document.getElementById('photoInitials');

  const pImg =
    document.getElementById('previewImg');

  const previewInitials =
    document.getElementById('previewInitials');


  if (data.photoURL){

    img.src = data.photoURL;
    img.hidden = false;

    photoInitials.style.display = 'none';


    pImg.src = data.photoURL;
    pImg.hidden = false;

    previewInitials.style.display = 'none';

  } else {

    img.removeAttribute('src');
    img.hidden = true;

    photoInitials.style.display = '';


    pImg.removeAttribute('src');
    pImg.hidden = true;

    previewInitials.style.display = '';

  }


  /* ---------- Registration details ---------- */

  document.getElementById('dFullName').textContent =
    name;

  document.getElementById('dEmail').textContent =
    data.studentEmail ||
    data.email ||
    '—';

  document.getElementById('dDob').textContent =
    data.dob
      ? formatDate(
          toDate(data.dob) ||
          new Date(data.dob)
        )
      : '—';

  document.getElementById('dAge').textContent =
    data.dob
      ? calcAge(data.dob)
      : '—';

  document.getElementById('dAcademy').textContent =
    data.academy || '—';

  document.getElementById('dLevel').textContent =
    level;

  document.getElementById('dExperience').textContent =
    data.experience || '—';

  document.getElementById('dNotes').textContent =
    data.notes && data.notes.trim()
      ? data.notes
      : '—';


  /* ---------- Parent / guardian ---------- */

  document.getElementById('pName').textContent =
    data.parentName || '—';

  document.getElementById('pEmail').textContent =
    data.parentEmail || '—';

  document.getElementById('pPhone').textContent =
    data.parentPhone || '—';


  /* ---------- Membership ---------- */

  document.getElementById('mUsername').textContent =
    data.username || '—';

  document.getElementById('mApproved').textContent =
    formatDate(toDate(data.approvedAt));

  document.getElementById('mAccountAge').textContent =
    formatAccountAge(data.approvedAt);


  /* ---------- Photo changes remaining ---------- */

  currentChangesRemaining =
    typeof data.photoChangesRemaining === 'number'
      ? data.photoChangesRemaining
      : 2;

  paintChangesRemaining();

}


function paintChangesRemaining(){

  const pill =
    document.getElementById('changesPill');

  const locked =
    currentChangesRemaining <= 0;


  pill.textContent =
    locked
      ? 'No changes left'
      : `${currentChangesRemaining} change${currentChangesRemaining === 1 ? '' : 's'} left`;


  pill.classList.toggle(
    'pill-zero',
    locked
  );


  document.getElementById('lockedNote').hidden =
    !locked;


  document.getElementById('chooseFileBtn').disabled =
    locked;


  document.getElementById('photoNote').style.display =
    locked
      ? 'none'
      : 'block';


  /* Save button is also disabled when there is
     no pending image to save. */

  document.getElementById('savePhotoBtn').disabled =
    locked || !pendingFile;

}


/* =========================================================
   PHOTO UPLOAD FLOW
   ========================================================= */

const photoInput =
  document.getElementById('photoInput');

const chooseFileBtn =
  document.getElementById('chooseFileBtn');

const savePhotoBtn =
  document.getElementById('savePhotoBtn');

const previewImg =
  document.getElementById('previewImg');

const previewInitials =
  document.getElementById('previewInitials');


/* ---------- choose file ---------- */

chooseFileBtn.addEventListener('click', () => {

  if (currentChangesRemaining <= 0) return;

  photoInput.click();

});


/* ---------- image selected ---------- */

photoInput.addEventListener('change', () => {

  const file =
    photoInput.files[0];

  if (!file) return;


  /* Only pictures */

  if (!file.type.startsWith('image/')){

    alert('Please choose an image file.');

    photoInput.value = '';

    return;
  }


  /* Maximum 5MB */

  if (file.size > 5 * 1024 * 1024){

    alert(
      'That image is over 5MB — please choose a smaller file.'
    );

    photoInput.value = '';

    return;
  }


  /* Make sure the student still has a change */

  if (currentChangesRemaining <= 0){

    alert(
      'You have no profile photo changes remaining.'
    );

    photoInput.value = '';

    return;
  }


  /* Remove previous temporary preview URL */

  if (previewObjectURL){

    URL.revokeObjectURL(
      previewObjectURL
    );

  }


  pendingFile = file;


  previewObjectURL =
    URL.createObjectURL(file);


  previewImg.src =
    previewObjectURL;

  previewImg.hidden = false;

  previewInitials.style.display =
    'none';


  savePhotoBtn.disabled = false;

});


/* ---------- open confirmation ---------- */

savePhotoBtn.addEventListener('click', () => {

  if (
    !pendingFile ||
    currentChangesRemaining <= 0
  ){
    return;
  }


  document.getElementById(
    'confirmRemaining'
  ).textContent =
    String(
      currentChangesRemaining - 1
    );


  document
    .getElementById('confirmOverlay')
    .classList.add('open');

});


/* ---------- cancel confirmation ---------- */

document
  .getElementById('confirmCancel')
  .addEventListener('click', () => {

    document
      .getElementById('confirmOverlay')
      .classList.remove('open');

  });


/* ---------- proceed with upload ---------- */

document
  .getElementById('confirmProceed')
  .addEventListener('click', async () => {

    if (!pendingFile || !uid) return;


    document
      .getElementById('confirmOverlay')
      .classList.remove('open');


    savePhotoBtn.classList.add('loading');
    savePhotoBtn.disabled = true;


    try{

      /* =====================================================
         1. Upload picture to Cloudinary
         ===================================================== */

      const url =
        await uploadToCloudinary(
          pendingFile
        );


      /* =====================================================
         2. Save Cloudinary URL in Firestore
         ===================================================== */

      await updateDoc(
        doc(db, 'students', uid),
        {
          photoURL: url,

          photoChangesRemaining:
            increment(-1)
        }
      );


      /* =====================================================
         3. Update local state
         ===================================================== */

      currentChangesRemaining =
        Math.max(
          0,
          currentChangesRemaining - 1
        );


      /* =====================================================
         4. Display uploaded picture immediately
         ===================================================== */

      const headerImg =
        document.getElementById('photoImg');

      headerImg.src = url;
      headerImg.hidden = false;


      document.getElementById(
        'photoInitials'
      ).style.display = 'none';


      previewImg.src = url;
      previewImg.hidden = false;

      previewInitials.style.display =
        'none';


      /* =====================================================
         5. Clean up selected file
         ===================================================== */

      if (previewObjectURL){

        URL.revokeObjectURL(
          previewObjectURL
        );

        previewObjectURL = null;
      }


      pendingFile = null;

      photoInput.value = '';


      /* =====================================================
         6. Update remaining-change display
         ===================================================== */

      paintChangesRemaining();


    } catch (err){

      console.error(
        'Photo upload failed:',
        err
      );


      if (
        err.message ===
        'cloudinary-upload-failed'
      ){

        alert(
          "Cloudinary couldn't upload that picture. Please try again."
        );

      } else if (
        err.message ===
        'cloudinary-no-url'
      ){

        alert(
          "The picture uploaded, but Cloudinary didn't return a usable image link."
        );

      } else {

        alert(
          "Sorry, we couldn't save that photo. Please try again."
        );

      }

    } finally {

      savePhotoBtn.classList.remove(
        'loading'
      );

      savePhotoBtn.disabled =
        currentChangesRemaining <= 0 ||
        !pendingFile;

    }

  });


/* =========================================================
   AUTH GUARD + DATA LOAD
   ========================================================= */

onAuthStateChanged(
  auth,
  async (user) => {

    if (!user){

      window.location.href =
        'student-login.html';

      return;
    }


    uid = user.uid;


    /* Live guard: force sign-out if
       this account gets blocked/deleted */

    onSnapshot(
      doc(db, 'students', uid),
      (guardSnap) => {

        if (
          !guardSnap.exists() ||
          guardSnap.data().blocked === true
        ){

          signOut(auth).finally(() => {

            window.location.href =
              'student-login.html?blocked=1';

          });

        }

      }
    );


    try{

      const snap =
        await getDoc(
          doc(db, 'students', uid)
        );


      const data =
        snap.exists()
          ? snap.data()
          : {
              fullName: user.displayName,
              studentEmail: user.email
            };


      paintProfile(data);

      loadNotificationsPreview(uid);


    } catch (err){

      console.error(
        'Profile load failed:',
        err
      );

    }

  }
);