// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Additional SDKs used on this page (Auth + Firestore)
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
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
     questions: [{ type: 'mcq' | 'short', question, options: [],
                    correctIndex (number, mcq only) }],
     timeLimitMinutes (number, optional),
     openFrom / openUntil (Timestamp, optional),
     showScoreToStudent (bool)

   students/{uid}/testAttempts/{testId}
     answers, score (number | null), submittedAt, totalQuestions

   ⚠️ NOTE ON SCORING: this scores MCQ answers client-side by
   comparing against `correctIndex`, which means a determined
   student could read the answer key straight out of the
   `tests/{testId}` document before submitting. That's an
   acceptable tradeoff for a lightweight club quiz tool, but if
   these tests ever carry real stakes, move scoring into a
   Cloud Function that the client calls instead of reading
   `correctIndex` directly.
   ========================================================= */

const params = new URLSearchParams(window.location.search);
const testId = params.get('id');

let uid = null;
let testData = null;
let answers = {};      // { questionIndex: selectedOptionIndex | textValue }
let timerInterval = null;
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
   RENDER QUESTIONS
   ========================================================= */
function renderQuestions(){
  const list = document.getElementById('questionList');
  const questions = testData.questions || [];
  document.getElementById('totalCount').textContent = questions.length;

  list.innerHTML = questions.map((q, i) => {
    if (q.type === 'short'){
      return `
        <div class="question-card glass" id="q-${i}">
          <div class="question-head">
            <span class="question-num">${i + 1}</span>
            <span class="question-text">${q.question}</span>
          </div>
          <div class="short-answer">
            <textarea data-index="${i}" placeholder="Type your answer..."></textarea>
          </div>
        </div>
      `;
    }
    const options = (q.options || []).map((opt, oi) => `
      <label class="option-row" data-index="${i}" data-option="${oi}">
        <input type="radio" name="q-${i}" value="${oi}">
        <span>${opt}</span>
      </label>
    `).join('');
    return `
      <div class="question-card glass" id="q-${i}">
        <div class="question-head">
          <span class="question-num">${i + 1}</span>
          <span class="question-text">${q.question}</span>
        </div>
        <div class="option-list">${options}</div>
      </div>
    `;
  }).join('');

  // wire MCQ option clicks
  list.querySelectorAll('.option-row').forEach(row => {
    row.addEventListener('click', () => {
      const qIndex = Number(row.dataset.index);
      const optIndex = Number(row.dataset.option);
      answers[qIndex] = optIndex;

      document.querySelectorAll(`.option-row[data-index="${qIndex}"]`).forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      row.querySelector('input').checked = true;
      document.getElementById(`q-${qIndex}`).classList.remove('unanswered');
      updateProgress();
    });
  });

  // wire short-answer text
  list.querySelectorAll('textarea').forEach(ta => {
    ta.addEventListener('input', () => {
      const qIndex = Number(ta.dataset.index);
      answers[qIndex] = ta.value;
      document.getElementById(`q-${qIndex}`).classList.toggle('unanswered', !ta.value.trim());
      updateProgress();
    });
  });

  updateProgress();
}

function updateProgress(){
  const questions = testData.questions || [];
  const answeredCount = questions.reduce((count, q, i) => {
    const val = answers[i];
    const isAnswered = q.type === 'short' ? !!(val && String(val).trim()) : typeof val === 'number';
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
   SUBMIT
   ========================================================= */
const confirmOverlay = document.getElementById('confirmOverlay');
document.getElementById('submitBtn').addEventListener('click', () => {
  const questions = testData.questions || [];
  const unanswered = questions.filter((q, i) => {
    const val = answers[i];
    return q.type === 'short' ? !(val && String(val).trim()) : typeof val !== 'number';
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

async function submitTest(autoSubmitted){
  if (submitted) return;
  submitted = true;
  clearInterval(timerInterval);

  const questions = testData.questions || [];
  const allMcq = questions.every(q => q.type !== 'short');
  let score = null;

  if (allMcq && questions.length){
    const correctCount = questions.reduce((count, q, i) => count + (answers[i] === q.correctIndex ? 1 : 0), 0);
    score = Math.round((correctCount / questions.length) * 100);
  }

  try{
    await setDoc(doc(db, 'students', uid, 'testAttempts', testId), {
      answers,
      score,
      submittedAt: serverTimestamp(),
      totalQuestions: questions.length
    });
  } catch (err){
    console.error('Submit failed:', err);
  }

  showResult(score, autoSubmitted);
}

function showResult(score, autoSubmitted){
  document.getElementById('resultTitle').textContent = autoSubmitted ? "Time's up — test submitted" : 'Test submitted';

  const scoreCircle = document.getElementById('scoreCircle');
  if (testData.showScoreToStudent && typeof score === 'number'){
    scoreCircle.hidden = false;
    scoreCircle.style.setProperty('--pct', score);
    document.getElementById('scoreValue').textContent = `${score}%`;
    document.getElementById('resultMessage').textContent = 'Nice work — here\u2019s how you did.';
  } else {
    scoreCircle.hidden = true;
    document.getElementById('resultMessage').textContent = 'Your answers have been recorded and are awaiting review.';
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
    const [testSnap, attemptSnap] = await Promise.all([
      getDoc(doc(db, 'tests', testId)),
      getDoc(doc(db, 'students', uid, 'testAttempts', testId))
    ]);

    if (!testSnap.exists() || testSnap.data().published !== true){
      blockWith('Test not found', 'This test may have been removed or isn\u2019t published yet.');
      return;
    }

    if (attemptSnap.exists()){
      blockWith('Already completed', 'You\u2019ve already submitted this test — check the LMS page for your result.');
      return;
    }

    testData = testSnap.data();

    const now = new Date();
    const openFrom = toDate(testData.openFrom);
    const openUntil = toDate(testData.openUntil);
    if (openFrom && openFrom > now){
      blockWith('Not open yet', `This test opens on ${openFrom.toLocaleDateString()}.`);
      return;
    }
    if (openUntil && openUntil < now){
      blockWith('This test has closed', `The window to take this test closed on ${openUntil.toLocaleDateString()}.`);
      return;
    }

    document.getElementById('testTitle').textContent = testData.title || 'Test';
    document.getElementById('testDesc').textContent = testData.description || '';
    renderQuestions();
    showState('testBody');

    if (testData.timeLimitMinutes){
      startTimer(testData.timeLimitMinutes);
    }
  } catch (err){
    console.error('Test load failed:', err);
    blockWith('Something went wrong', 'We couldn\u2019t load this test. Please try again.');
  }
});
