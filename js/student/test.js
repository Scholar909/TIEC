// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Additional SDKs used on this page (Auth + Firestore)
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, addDoc, getDocs, onSnapshot, serverTimestamp
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
   Assumed Firestore schema:

   tests/{testId}
     title, description, published (bool),
     questions: [{
       type: 'single' | 'multi', question, options: [],
       required (bool),
       correctIndex (number, type:'single' only),
       correctIndexes (number[], type:'multi' only)
     }],
     totalMarks (number), attemptsAllowed (number, default 1),
     timeLimitMinutes (number, optional — a per-attempt countdown,
       separate from the openFrom/openUntil wall-clock window),
     openFrom / openUntil (Timestamp),
     showScoreToStudent (bool)

   students/{uid}/testAttempts/{testId}/attempts/{autoId}
     — a new doc per attempt, so multiple attempts can be tracked
     answers, score (0-100 percentage), earned, totalMarks, testId,
     submittedAt, totalQuestions

   Every question is single- or multi-choice, so every attempt is
   auto-scored the instant it's submitted — there's no more
   "pending review" state.

   ⚠️ NOTE ON SCORING: this scores answers client-side by
   comparing against `correctIndex`/`correctIndexes`, which means
   a determined student could read the answer key straight out of
   the `tests/{testId}` document before submitting. That's an
   acceptable tradeoff for a lightweight club quiz tool, but if
   these tests ever carry real stakes, move scoring into a
   Cloud Function that the client calls instead of reading the
   correct answers directly.
   ========================================================= */

const params = new URLSearchParams(window.location.search);
const testId = params.get('id');

let uid = null;
let testData = null;
let answers = {};      // { questionIndex: selectedOptionIndex (single) | number[] (multi) }
let timerInterval = null;
let expiryInterval = null;
let secondsLeft = 0;
let submitted = false;

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

/* ---------- helpers ---------- */
function toDate(value){
  if (!value) return null;
  return value.toDate ? value.toDate() : new Date(value);
}
function showState(id){
  ['loadingState', 'blockedState', 'testBody', 'resultState'].forEach(s => {
    document.getElementById(s).hidden = s !== id;
  });
}
function blockWith(title, message){
  document.getElementById('blockedTitle').textContent = title;
  document.getElementById('blockedMessage').textContent = message;
  showState('blockedState');
}

/* ---------- exit (unsaved-progress guard) ---------- */
const exitOverlay = document.getElementById('exitOverlay');
document.getElementById('exitBtn').addEventListener('click', () => {
  if (submitted){ window.location.href = 'lms.html'; return; }
  exitOverlay.classList.add('open');
});
document.getElementById('exitCancel').addEventListener('click', () => exitOverlay.classList.remove('open'));
document.getElementById('exitProceed').addEventListener('click', () => { window.location.href = 'lms.html'; });

/* =========================================================
   RENDER QUESTIONS — every question is single or multi choice
   ========================================================= */
function renderQuestions(){
  const list = document.getElementById('questionList');
  const questions = testData.questions || [];
  document.getElementById('totalCount').textContent = questions.length;

  list.innerHTML = questions.map((q, i) => {
    const isMulti = q.type === 'multi';
    const options = (q.options || []).map((opt, oi) => `
      <label class="option-row" data-index="${i}" data-option="${oi}">
        <input type="${isMulti ? 'checkbox' : 'radio'}" name="q-${i}" value="${oi}">
        <span>${opt}</span>
      </label>
    `).join('');
    return `
      <div class="question-card glass" id="q-${i}">
        <div class="question-head">
          <span class="question-num">${i + 1}</span>
          <span class="question-text">${q.question}${q.required === false ? ' <em class="optional-hint">(optional)</em>' : ''}</span>
        </div>
        <div class="option-list">${options}</div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.option-row').forEach(row => {
    row.addEventListener('click', (e) => {
      e.preventDefault();
      const qIndex = Number(row.dataset.index);
      const optIndex = Number(row.dataset.option);
      const q = questions[qIndex];
      const input = row.querySelector('input');

      if (q.type === 'multi'){
        const current = Array.isArray(answers[qIndex]) ? [...answers[qIndex]] : [];
        const pos = current.indexOf(optIndex);
        if (pos === -1) current.push(optIndex); else current.splice(pos, 1);
        answers[qIndex] = current;
        input.checked = current.includes(optIndex);
        row.classList.toggle('selected', input.checked);
      } else {
        answers[qIndex] = optIndex;
        document.querySelectorAll(`.option-row[data-index="${qIndex}"]`).forEach(r => {
          r.classList.remove('selected');
          r.querySelector('input').checked = false;
        });
        row.classList.add('selected');
        input.checked = true;
      }

      const hasAnswer = q.type === 'multi' ? (answers[qIndex] || []).length > 0 : typeof answers[qIndex] === 'number';
      document.getElementById(`q-${qIndex}`).classList.toggle('unanswered', !hasAnswer);
      updateProgress();
    });
  });

  updateProgress();
}

function updateProgress(){
  const questions = testData.questions || [];
  const answeredCount = questions.reduce((count, q, i) => {
    const val = answers[i];
    const isAnswered = q.type === 'multi' ? Array.isArray(val) && val.length > 0 : typeof val === 'number';
    return count + (isAnswered ? 1 : 0);
  }, 0);

  document.getElementById('answeredCount').textContent = answeredCount;
  document.getElementById('progressFill').style.width = `${questions.length ? (answeredCount / questions.length) * 100 : 0}%`;
}

/* =========================================================
   TIMER
   ========================================================= */
function startTimer(minutes){
  secondsLeft = Math.round(minutes * 60);
  const chip = document.getElementById('timerChip');
  const text = document.getElementById('timerText');
  chip.hidden = false;

  function tick(){
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    text.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    chip.classList.toggle('urgent', secondsLeft <= 60);

    if (secondsLeft <= 0){
      clearInterval(timerInterval);
      submitTest(true);
      return;
    }
    secondsLeft--;
  }
  tick();
  timerInterval = setInterval(tick, 1000);
}

/* =========================================================
   LIVE EXPIRY WATCHDOG
   Independent of the optional per-attempt timer above — this
   checks the test's wall-clock closing time (openUntil) every
   second and force-submits if it passes while a student is
   still mid-test, closing the page like a real exam system.
   ========================================================= */
function startExpiryWatchdog(openUntil){
  if (!openUntil) return;
  expiryInterval = setInterval(() => {
    if (new Date() >= openUntil){
      clearInterval(expiryInterval);
      submitTest(true, 'expired');
    }
  }, 1000);
}

/* =========================================================
   SUBMIT
   ========================================================= */
const confirmOverlay = document.getElementById('confirmOverlay');
document.getElementById('submitBtn').addEventListener('click', () => {
  const questions = testData.questions || [];
  const unanswered = questions.filter((q, i) => {
    const val = answers[i];
    return q.type === 'multi' ? !(Array.isArray(val) && val.length > 0) : typeof val !== 'number';
  }).length;

  document.getElementById('confirmSubmitBody').textContent = unanswered > 0
    ? `You have ${unanswered} unanswered question${unanswered === 1 ? '' : 's'}. You won't be able to change your answers after submitting.`
    : "You won't be able to change your answers after this.";

  confirmOverlay.classList.add('open');
});
document.getElementById('confirmCancel').addEventListener('click', () => confirmOverlay.classList.remove('open'));
document.getElementById('confirmProceed').addEventListener('click', () => {
  confirmOverlay.classList.remove('open');
  submitTest(false);
});

async function submitTest(autoSubmitted, reason){
  if (submitted) return;
  submitted = true;
  clearInterval(timerInterval);
  clearInterval(expiryInterval);

  const questions = testData.questions || [];
  const totalMarks = testData.totalMarks || questions.length || 1;
  const marksPerQuestion = questions.length ? totalMarks / questions.length : 0;

  let earned = 0;
  questions.forEach((q, i) => {
    if (q.type === 'multi'){
      const correctSet = q.correctIndexes || [];
      const selected = Array.isArray(answers[i]) ? answers[i] : [];
      const correctSelectedCount = selected.filter(x => correctSet.includes(x)).length;
      if (correctSet.length) earned += (correctSelectedCount / correctSet.length) * marksPerQuestion;
    } else {
      if (answers[i] === q.correctIndex) earned += marksPerQuestion;
    }
  });

  const percentage = totalMarks ? Math.round((earned / totalMarks) * 100) : 0;

  try{
    await addDoc(collection(db, 'students', uid, 'testAttempts', testId, 'attempts'), {
      answers,
      score: percentage,
      earned,
      totalMarks,
      testId,
      submittedAt: serverTimestamp(),
      totalQuestions: questions.length
    });
  } catch (err){
    console.error('Submit failed:', err);
  }

  showResult(percentage, autoSubmitted, reason);
}

function showResult(score, autoSubmitted, reason){
  document.getElementById('resultTitle').textContent = autoSubmitted
    ? (reason === 'expired' ? 'Time window closed — test submitted' : "Time's up — test submitted")
    : 'Test submitted';

  const scoreCircle = document.getElementById('scoreCircle');
  if (testData.showScoreToStudent){
    scoreCircle.hidden = false;
    scoreCircle.style.setProperty('--pct', score);
    document.getElementById('scoreValue').textContent = `${score}%`;
    document.getElementById('resultMessage').textContent = 'Nice work — here\u2019s how you did.';
  } else {
    scoreCircle.hidden = true;
    document.getElementById('resultMessage').textContent = "Your answers have been recorded. Your score isn't shown for this test.";
  }

  showState('resultState');
}

/* =========================================================
   LOAD TEST + AUTH GUARD
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

  if (!testId){
    blockWith('No test selected', 'Head back to the LMS and pick a test to start.');
    return;
  }

  try{
    const [testSnap, attemptsSnap] = await Promise.all([
      getDoc(doc(db, 'tests', testId)),
      getDocs(collection(db, 'students', uid, 'testAttempts', testId, 'attempts'))
    ]);

    if (!testSnap.exists() || testSnap.data().published !== true){
      blockWith('Test not found', 'This test may have been removed or isn\u2019t published yet.');
      return;
    }

    testData = testSnap.data();

    const attemptsAllowed = testData.attemptsAllowed || 1;
    const attemptsUsed = attemptsSnap.size;
    if (attemptsUsed >= attemptsAllowed){
      blockWith('No attempts left', `You've used all ${attemptsAllowed} attempt${attemptsAllowed === 1 ? '' : 's'} for this ${testData.type === 'exam' ? 'exam' : 'test'} — check the LMS page for your result.`);
      return;
    }

    const now = new Date();
    const openFrom = toDate(testData.openFrom);
    const openUntil = toDate(testData.openUntil);
    if (openFrom && openFrom > now){
      blockWith('Not open yet', `This ${testData.type === 'exam' ? 'exam' : 'test'} opens at ${openFrom.toLocaleString()}.`);
      return;
    }
    if (openUntil && openUntil <= now){
      blockWith('This has closed', `The window to take this ${testData.type === 'exam' ? 'exam' : 'test'} closed at ${openUntil.toLocaleString()}.`);
      return;
    }

    document.getElementById('testTitle').textContent = testData.title || 'Test';
    document.getElementById('testDesc').textContent = testData.description || '';
    renderQuestions();
    showState('testBody');

    startExpiryWatchdog(openUntil);
    if (testData.timeLimitMinutes){
      startTimer(testData.timeLimitMinutes);
    }
  } catch (err){
    console.error('Test load failed:', err);
    blockWith('Something went wrong', 'We couldn\u2019t load this test. Please try again.');
  }
});
