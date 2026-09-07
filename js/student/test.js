// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Additional SDKs used on this page (Auth + Firestore)
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, addDoc, getDocs, updateDoc, onSnapshot, serverTimestamp
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
   Assumed Firestore schema (matches the admin LMS pages):

   tests/{testId}
     title, description, published (bool), type ('test'|'exam'), level,
     questions: [{
       type: 'single' | 'multi', question, options: [],
       required (bool),
       correctIndex (number, type:'single' only),
       correctIndexes (number[], type:'multi' only)
     }],
     totalMarks (number), attemptsAllowed (number, default 1),
     durationSeconds (number, optional — a per-attempt countdown,
       set by admin in seconds; shown to students as hh:mm:ss),
     openFrom / openUntil (Timestamp),
     showScoreToStudent (bool), allowPreview (bool, default true),
     randomizeQuestions (bool) — shuffles both question order AND
       each question's option order for this student; correct
       answers are remapped to match so scoring stays correct

   students/{uid}/testAttempts/{testId}/attempts/{autoId}
     — a new doc per attempt, so multiple attempts can be tracked
     answers, score (RAW POINTS EARNED, not a percentage — the
       admin side divides by totalMarks itself), totalMarks, testId,
     studentId, studentName, studentLevel,
     submittedAt, totalQuestions

   Every question is single- or multi-choice, so every attempt is
   auto-scored the instant it's submitted — there's no "pending
   review" state.

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

const PAGE_SIZE = 5;

let uid = null;
let studentName = 'Student';
let studentLevel = '';
let testData = null;
let answers = {};      // { questionIndex: selectedOptionIndex (single) | number[] (multi) }
let currentPage = 0;
let timerInterval = null;
let expiryInterval = null;
let secondsLeft = 0;
let submitted = false;
let currentAttemptId = null;


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
// Uses the .hidden class (display:none !important) instead of the
// `hidden` attribute alone, so a component's own display rule can
// never leave two states visible on top of each other.
function showState(id){
  ['loadingState', 'blockedState', 'testBody', 'resultState'].forEach(s => {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
}
function blockWith(title, message){
  document.getElementById('blockedTitle').textContent = title;
  document.getElementById('blockedMessage').textContent = message;
  showState('blockedState');
}
function shuffleArray(arr){
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* =========================================================
   RANDOMIZATION — question order AND per-question option order,
   with correctIndex/correctIndexes remapped so scoring still works
   ========================================================= */
function randomizeTestData(questions){
  const shuffledQuestions = shuffleArray(questions).map(q => {
    const order = shuffleArray(q.options.map((_, i) => i)); // new position -> old index
    const newOptions = order.map(oldIndex => q.options[oldIndex]);

    if (q.type === 'multi'){
      const oldCorrect = q.correctIndexes || [];
      const newCorrectIndexes = order
        .map((oldIndex, newIndex) => oldCorrect.includes(oldIndex) ? newIndex : -1)
        .filter(i => i !== -1);
      return { ...q, options: newOptions, correctIndexes: newCorrectIndexes };
    }
    const newCorrectIndex = order.indexOf(q.correctIndex);
    return { ...q, options: newOptions, correctIndex: newCorrectIndex };
  });
  return shuffledQuestions;
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
   RENDER — 5 questions per page, plus the jump-to-question grid
   ========================================================= */
function totalPages(){
  const n = (testData.questions || []).length;
  return Math.max(1, Math.ceil(n / PAGE_SIZE));
}

function isAnswered(qIndex){
  const q = testData.questions[qIndex];
  const val = answers[qIndex];
  return q.type === 'multi' ? Array.isArray(val) && val.length > 0 : typeof val === 'number';
}

function renderQuestions(){
  const list = document.getElementById('questionList');
  const questions = testData.questions || [];
  document.getElementById('totalCount').textContent = questions.length;

  const start = currentPage * PAGE_SIZE;
  const pageQuestions = questions.slice(start, start + PAGE_SIZE);

  list.innerHTML = pageQuestions.map((q, localIndex) => {
    const i = start + localIndex; // global question index
    const isMulti = q.type === 'multi';
    const options = (q.options || []).map((opt, oi) => {
      const selected = isMulti
        ? Array.isArray(answers[i]) && answers[i].includes(oi)
        : answers[i] === oi;
      return `
        <label class="option-row ${selected ? 'selected' : ''}" data-index="${i}" data-option="${oi}">
          <input type="${isMulti ? 'checkbox' : 'radio'}" name="q-${i}" value="${oi}" ${selected ? 'checked' : ''}>
          <span>${opt}</span>
        </label>
      `;
    }).join('');
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
      const q = testData.questions[qIndex];
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

      document.getElementById(`q-${qIndex}`).classList.toggle('unanswered', !isAnswered(qIndex));
      updateProgress();
      buildQuestionGrid();
    });
  });

  updateProgress();
  updatePageControls();
  buildQuestionGrid();
}

function updateProgress(){
  const questions = testData.questions || [];
  const answeredCount = questions.reduce((count, q, i) => count + (isAnswered(i) ? 1 : 0), 0);
  document.getElementById('answeredCount').textContent = answeredCount;
  document.getElementById('progressFill').style.width = `${questions.length ? (answeredCount / questions.length) * 100 : 0}%`;
}

function updatePageControls(){
  document.getElementById('pageIndicator').textContent = `Page ${currentPage + 1} of ${totalPages()}`;
  document.getElementById('prevPageBtn').disabled = currentPage === 0;
  document.getElementById('nextPageBtn').disabled = currentPage >= totalPages() - 1;
}

document.getElementById('prevPageBtn').addEventListener('click', () => {
  if (currentPage > 0){ currentPage--; renderQuestions(); scrollToQuestions(); }
});
document.getElementById('nextPageBtn').addEventListener('click', () => {
  if (currentPage < totalPages() - 1){ currentPage++; renderQuestions(); scrollToQuestions(); }
});
function scrollToQuestions(){
  document.getElementById('questionList').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* =========================================================
   QUESTION NUMBER GRID — "calendar" view: grey once answered,
   white while blank, ring around the current page's questions
   ========================================================= */
function buildQuestionGrid(){
  const grid = document.getElementById('qGrid');
  const questions = testData.questions || [];
  const pageStart = currentPage * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;

  grid.innerHTML = questions.map((q, i) => {
    const answered = isAnswered(i);
    const onCurrentPage = i >= pageStart && i < pageEnd;
    return `<button type="button" class="qgrid-item ${answered ? 'answered' : ''} ${onCurrentPage ? 'current' : ''}" data-index="${i}">${i + 1}</button>`;
  }).join('');

  grid.querySelectorAll('.qgrid-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.index);
      currentPage = Math.floor(i / PAGE_SIZE);
      renderQuestions();
      scrollToQuestions();
    });
  });
}

/* =========================================================
   TIMER — fixed bar, always visible, hh:mm:ss from a
   durationSeconds value admin sets in seconds
   ========================================================= */
function formatHMS(totalSeconds){
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function startTimer(durationSeconds){
  secondsLeft = Math.round(durationSeconds);
  const bar = document.getElementById('timerBar');
  const text = document.getElementById('timerText');
  bar.classList.remove('hidden');
  document.getElementById('testMain').classList.add('has-timer');

  function tick(){
    text.textContent = formatHMS(Math.max(0, secondsLeft));
    bar.classList.toggle('urgent', secondsLeft <= 60);

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
  const unanswered = questions.filter((q, i) => !isAnswered(i)).length;

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
    if (currentAttemptId) {
      await updateDoc(doc(db, 'students', uid, 'testAttempts', testId, 'attempts', currentAttemptId), {
        answers,
        score: earned,       // raw points earned — admin side computes % itself
        totalMarks,
        submittedAt: serverTimestamp(),
        status: 'completed'
      });
    } else {
      await addDoc(collection(db, 'students', uid, 'testAttempts', testId, 'attempts'), {
        answers,
        score: earned,
        totalMarks,
        testId,
        studentId: uid,
        studentName,
        studentLevel,
        submittedAt: serverTimestamp(),
        totalQuestions: questions.length,
        status: 'completed'
      });
    }
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
  if (testData.showScoreToStudent !== false){
    scoreCircle.classList.remove('hidden');
    scoreCircle.style.setProperty('--pct', score);
    document.getElementById('scoreValue').textContent = `${score}%`;
    document.getElementById('resultMessage').textContent = 'Nice work — here\u2019s how you did.';
  } else {
    scoreCircle.classList.add('hidden');
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
    const [testSnap, attemptsSnap, studentSnap] = await Promise.all([
      getDoc(doc(db, 'tests', testId)),
      getDocs(collection(db, 'students', uid, 'testAttempts', testId, 'attempts')),
      getDoc(doc(db, 'students', uid))
    ]);

    if (studentSnap.exists()){
      const sd = studentSnap.data();
      studentName = sd.fullName || 'Student';
      studentLevel = sd.membershipLevel || '';
    }

    if (!testSnap.exists() || testSnap.data().published !== true){
      blockWith('Test not found', 'This test may have been removed or isn\u2019t published yet.');
      return;
    }

    testData = testSnap.data();
    if (testData.randomizeQuestions){
      testData = { ...testData, questions: randomizeTestData(testData.questions || []) };
    }

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
    currentPage = 0;
    renderQuestions();
    showState('testBody');

    // Instantly create an attempt doc so exiting without submitting consumes this attempt
    const newAttemptRef = await addDoc(collection(db, 'students', uid, 'testAttempts', testId, 'attempts'), {
      answers: {},
      score: 0,
      totalMarks: testData.totalMarks || (testData.questions || []).length || 0,
      testId,
      studentId: uid,
      studentName,
      studentLevel,
      submittedAt: serverTimestamp(),
      totalQuestions: (testData.questions || []).length,
      status: 'incomplete'
    });
    currentAttemptId = newAttemptRef.id;


    startExpiryWatchdog(openUntil);
    if (testData.durationSeconds){
      startTimer(testData.durationSeconds);
    }
  } catch (err){
    console.error('Test load failed:', err);
    blockWith('Something went wrong', 'We couldn\u2019t load this test. Please try again.');
  }
});
