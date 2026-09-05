import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, updateDoc
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
   AUTH GUARD
   ========================================================= */
const operatorRaw = sessionStorage.getItem('iec_operator');
if (!operatorRaw) { window.location.href = 'admin-login.html'; }

onAuthStateChanged(auth, (user) => {
  if (!user) {
    sessionStorage.removeItem('iec_operator');
    window.location.href = 'admin-login.html';
  }
});

/* ---------- theme ---------- */
const themeToggle = document.getElementById('themeToggle');
themeToggle.innerHTML = document.documentElement.classList.contains('light-mode') ? "<i class='bx bx-sun'></i>" : "<i class='bx bx-moon'></i>";
themeToggle.addEventListener('click', () => {
  document.documentElement.classList.toggle('light-mode');
  const light = document.documentElement.classList.contains('light-mode');
  themeToggle.innerHTML = light ? "<i class='bx bx-sun'></i>" : "<i class='bx bx-moon'></i>";
  try{ localStorage.setItem('iec-theme', light ? 'light' : 'dark'); }catch(e){}
});

/* ---------- toast ---------- */
let toastTimer;
function showToast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* =========================================================
   STATE
   ========================================================= */
const testId = new URLSearchParams(window.location.search).get('id');
let questionSeq = 0;
const questionList = document.getElementById('questionList');
const qTemplate = document.getElementById('questionTemplate');
const optTemplate = document.getElementById('optionTemplate');

function showState(id){
  ['loadingState', 'blockedState', 'qbBody'].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.toggle('hidden', s !== id);
  });
}

/* =========================================================
   BUILD A QUESTION CARD
   ========================================================= */
function addQuestionCard(data){
  const node = qTemplate.content.firstElementChild.cloneNode(true);
  const qId = 'q' + (questionSeq++);
  node.dataset.qid = qId;

  node.querySelector('.q-text').value = data?.question || '';
  node.querySelector('.q-type').value = data?.type || 'single';
  node.querySelector('.q-mark').value = data?.mark !== undefined ? data.mark : 1;
  node.querySelector('.q-required').checked = data?.required !== false;

  const optionsList = node.querySelector('.options-list');
  const opts = (data?.options && data.options.length) ? data.options : ['', ''];
  opts.forEach((text, i) => {
    const isCorrect = data?.type === 'multi'
      ? (data.correctIndexes || []).includes(i)
      : data?.correctIndex === i;
    addOptionRow(optionsList, node, text, isCorrect);
  });

  node.querySelector('.add-option-btn').addEventListener('click', () => {
    addOptionRow(optionsList, node, '', false);
  });
  node.querySelector('.delete-question-btn').addEventListener('click', () => {
    node.remove();
    renumberQuestions();
    recomputeTotalMarks();
  });

  node.querySelector('.q-type').addEventListener('change', (e) => {
    convertOptionInputs(node, e.target.value);
    toggleMultiNote(node, e.target.value);
  });

  node.querySelector('.q-mark').addEventListener('input', recomputeTotalMarks);

  questionList.appendChild(node);
  convertOptionInputs(node, node.querySelector('.q-type').value);
  toggleMultiNote(node, node.querySelector('.q-type').value);
  renumberQuestions();
  recomputeTotalMarks();
}

function addOptionRow(optionsList, questionNode, text, isCorrect){
  const row = optTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector('.option-text').value = text || '';

  const type = questionNode.querySelector('.q-type').value;
  const input = document.createElement('input');
  input.type = type === 'multi' ? 'checkbox' : 'radio';
  if (type !== 'multi') input.name = questionNode.dataset.qid + '-correct';
  input.checked = !!isCorrect;
  row.querySelector('.option-correct-wrap').appendChild(input);

  row.querySelector('.delete-option-btn').addEventListener('click', () => {
    if (optionsList.children.length <= 2){
      showToast('A question needs at least 2 options');
      return;
    }
    row.remove();
  });

  optionsList.appendChild(row);
}

function convertOptionInputs(questionNode, type){
  const qid = questionNode.dataset.qid;
  questionNode.querySelectorAll('.option-correct-wrap').forEach(wrap => {
    const old = wrap.querySelector('input');
    const wasChecked = old ? old.checked : false;
    const input = document.createElement('input');
    input.type = type === 'multi' ? 'checkbox' : 'radio';
    if (type !== 'multi') input.name = qid + '-correct';
    input.checked = wasChecked;
    wrap.innerHTML = '';
    wrap.appendChild(input);
  });
  if (type !== 'multi'){
    const inputs = [...questionNode.querySelectorAll('.option-correct-wrap input')];
    let seenChecked = false;
    inputs.forEach(inp => {
      if (inp.checked){
        if (seenChecked) inp.checked = false;
        seenChecked = true;
      }
    });
  }
}

function toggleMultiNote(node, type){
  const note = node.querySelector('.multi-note');
  if (note) note.classList.toggle('hidden', type !== 'multi');
}

function renumberQuestions(){
  [...questionList.children].forEach((card, i) => {
    card.querySelector('.question-num').textContent = `Question ${i + 1}`;
  });
}

function recomputeTotalMarks(){
  let total = 0;
  const cards = [...questionList.children];
  cards.forEach(card => {
    const val = parseFloat(card.querySelector('.q-mark').value) || 0;
    total += val;
  });

  document.getElementById('totalMarksCount').textContent = total;
  document.getElementById('qbSummary').textContent = `${cards.length} question${cards.length === 1 ? '' : 's'}`;
}

document.getElementById('addQuestionBtn').addEventListener('click', () => addQuestionCard());

/* =========================================================
   SAVE ALL
   ========================================================= */
document.getElementById('saveAllBtn').addEventListener('click', async () => {
  const cards = [...questionList.children];

  if (!cards.length){
    showToast('Add at least one question first');
    return;
  }

  const questions = [];
  let calculatedTotalMarks = 0;

  for (const card of cards){
    const questionText = card.querySelector('.q-text').value.trim();
    const type = card.querySelector('.q-type').value;
    const mark = parseFloat(card.querySelector('.q-mark').value) || 1;
    const required = card.querySelector('.q-required').checked;
    const optionRows = [...card.querySelectorAll('.option-row')];
    const options = optionRows.map(r => r.querySelector('.option-text').value.trim());

    if (!questionText){ showToast('Every question needs text'); return; }
    if (options.some(o => !o)){ showToast('Every option needs text'); return; }

    calculatedTotalMarks += mark;

    if (type === 'multi'){
      const correctIndexes = [];
      optionRows.forEach((r, i) => { if (r.querySelector('input').checked) correctIndexes.push(i); });
      if (!correctIndexes.length){ showToast(`Mark at least one correct option for "${questionText}"`); return; }
      questions.push({ question: questionText, type, mark, required, options, correctIndexes });
    } else {
      const correctIndex = optionRows.findIndex(r => r.querySelector('input').checked);
      if (correctIndex === -1){ showToast(`Mark the correct option for "${questionText}"`); return; }
      questions.push({ question: questionText, type, mark, required, options, correctIndex });
    }
  }

  const btn = document.getElementById('saveAllBtn');
  btn.classList.add('loading');
  btn.disabled = true;

  try{
    await updateDoc(doc(db, 'tests', testId), {
      questions,
      totalMarks: calculatedTotalMarks
    });
    showToast('Saved successfully');
  }catch(err){
    console.error(err);
    showToast("Couldn't save — try again");
  }finally{
    btn.classList.remove('loading');
    btn.disabled = false;
  }
});

/* =========================================================
   LOAD
   ========================================================= */
async function loadTest(){
  if (!testId){ showState('blockedState'); return; }
  try{
    const snap = await getDoc(doc(db, 'tests', testId));
    if (!snap.exists()){ showState('blockedState'); return; }

    const t = snap.data();
    document.getElementById('qbTitle').textContent = t.title || 'Untitled';
    document.getElementById('qbType').textContent = t.type === 'exam' ? 'Exam' : 'Test';
    document.getElementById('qbType').classList.toggle('exam', t.type === 'exam');
    document.getElementById('qbLevel').textContent = t.level || 'All';

    (t.questions || []).forEach(q => addQuestionCard(q));
    if (!(t.questions || []).length) addQuestionCard();

    recomputeTotalMarks();
    showState('qbBody');
  }catch(err){
    console.error(err);
    showState('blockedState');
  }
}
loadTest();
