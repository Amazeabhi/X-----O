// --- Your Firebase config ---
const firebaseConfig = {
  apiKey: "AIzaSyDOCcKKI9oLsIFWDuSPzjJxQjdlIBSWm60",
  authDomain: "game-19da9.firebaseapp.com",
  projectId: "game-19da9",
  storageBucket: "game-19da9.firebasestorage.app",
  messagingSenderId: "303594620970",
  appId: "1:303594620970:web:5728f11a925aafb0d85b53",
  measurementId: "G-RR7NLLM5GM"
};
// ----------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, runTransaction, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// UI elements
const authStatus = document.getElementById('authStatus');
const lobby = document.getElementById('lobby');
const roomSec = document.getElementById('room');
const roomCodeEl = document.getElementById('roomCode');
const yourMarkEl = document.getElementById('yourMark');
const statusEl = document.getElementById('status');
const boardEl = document.getElementById('board');

const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const joinCodeInput = document.getElementById('joinCode');
const leaveBtn = document.getElementById('leaveBtn');
const resetBtn = document.getElementById('resetBtn');
const deleteBtn = document.getElementById('deleteBtn');

let uid = null;
let unsub = null;
let currentRoom = null;
let myMark = null; // 'X' or 'O'

// Helpers
const genCode = () => String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
const emptyBoard = () => Array(9).fill("");

const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8], // rows
  [0,3,6],[1,4,7],[2,5,8], // cols
  [0,4,8],[2,4,6]          // diags
];

function calcWinner(board) {
  for (const [a,b,c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return board[a]; // 'X' or 'O'
    }
  }
  if (board.every(v => v)) return 'DRAW';
  return null;
}

function showLobby() {
  lobby.classList.remove('hidden');
  roomSec.classList.add('hidden');
  currentRoom = null;
  myMark = null;
}

function showRoom() {
  lobby.classList.add('hidden');
  roomSec.classList.remove('hidden');
}

function setBoardUI(board, currentTurn, status) {
  for (const btn of boardEl.querySelectorAll('button')) {
    const i = Number(btn.dataset.idx);
    btn.textContent = board[i] || '';
    btn.disabled = !canPlay(board, currentTurn, status, i);
  }
}

function canPlay(board, currentTurn, status, idx) {
  if (status !== 'playing') return false;
  if (!myMark || currentTurn !== myMark) return false;
  if (board[idx]) return false;
  return true;
}

// Auth
signInAnonymously(auth).catch(console.error);

onAuthStateChanged(auth, (user) => {
  if (user) {
    uid = user.uid;
    authStatus.textContent = `Connected as: ${uid.slice(0,6)}…`;
    lobby.classList.remove('hidden');
  } else {
    authStatus.textContent = 'Not signed in';
  }
});

// Create game
createBtn.addEventListener('click', async () => {
  const code = genCode();
  const ref = doc(db, 'games', code);

  await setDoc(ref, {
    code,
    board: emptyBoard(),
    xPlayer: uid,
    oPlayer: null,
    currentTurn: 'X',
    status: 'waiting',   // 'waiting' | 'playing' | 'x_won' | 'o_won' | 'draw'
    createdAt: serverTimestamp(),
    lastMoveAt: serverTimestamp()
  });

  joinRoom(code);
});

// Join game by code
joinBtn.addEventListener('click', async () => {
  const code = (joinCodeInput.value || '').replace(/\D/g,'').padStart(6, '0').slice(0,6);
  if (!code || code.length !== 6) {
    alert('Enter a valid 6‑digit code.');
    return;
  }
  const ref = doc(db, 'games', code);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    alert('Room not found.');
    return;
  }

  // Claim O if available; else if you are X or O already, proceed.
  await runTransaction(db, async (tx) => {
    const ds = await tx.get(ref);
    if (!ds.exists()) throw new Error('Room disappeared.');
    const g = ds.data();

    if (g.xPlayer !== uid && g.oPlayer !== uid) {
      if (!g.oPlayer) {
        tx.update(ref, { oPlayer: uid, status: 'playing' });
      } else if (!g.xPlayer) {
        tx.update(ref, { xPlayer: uid, status: 'playing' });
      } else {
        throw new Error('Room already has two players.');
      }
    }
  }).catch(err => {
    alert(err.message);
  });

  joinRoom(code);
});

// Subscribe to room
function joinRoom(code) {
  if (unsub) { unsub(); unsub = null; }
  currentRoom = code;
  const ref = doc(db, 'games', code);
  roomCodeEl.textContent = code;
  showRoom();

  unsub = onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      alert('Room was deleted.');
      unsub && unsub(); showLobby(); return;
    }
    const g = snap.data();

    // Determine my mark
    myMark = (g.xPlayer === uid) ? 'X' : (g.oPlayer === uid) ? 'O' : null;
    yourMarkEl.textContent = myMark ?? 'Spectator';

    // Status text
    let s = '';
    if (g.status === 'waiting') s = 'Waiting for opponent to join…';
    if (g.status === 'playing') s = (g.currentTurn === myMark) ? 'Your turn!' : "Opponent's turn…";
    if (g.status === 'x_won') s = (myMark === 'X') ? 'You won! 🎉' : 'X won.';
    if (g.status === 'o_won') s = (myMark === 'O') ? 'You won! 🎉' : 'O won.';
    if (g.status === 'draw')   s = 'Draw!';
    statusEl.textContent = s;

    setBoardUI(g.board, g.currentTurn, g.status);
  });
}

// Make a move
boardEl.addEventListener('click', async (e) => {
  const cell = e.target.closest('button[data-idx]');
  if (!cell || !currentRoom) return;
  const idx = Number(cell.dataset.idx);
  const ref = doc(db, 'games', currentRoom);

  try {
    await runTransaction(db, async (tx) => {
      const ds = await tx.get(ref);
      if (!ds.exists()) throw new Error('Room gone!');
      const g = ds.data();

      if (g.status !== 'playing') throw new Error('Game is not active.');
      if (!myMark || g.currentTurn !== myMark) throw new Error('Not your turn.');
      if (g.board[idx]) throw new Error('Cell already taken.');

      const newBoard = g.board.slice();
      newBoard[idx] = myMark;

      // Determine outcome
      const outcome = calcWinner(newBoard);
      let status = g.status;
      if (outcome === 'X') status = 'x_won';
      else if (outcome === 'O') status = 'o_won';
      else if (outcome === 'DRAW') status = 'draw';
      else status = 'playing';

      tx.update(ref, {
        board: newBoard,
        currentTurn: (status === 'playing') ? (g.currentTurn === 'X' ? 'O' : 'X') : g.currentTurn,
        status,
        lastMoveAt: serverTimestamp()
      });
    });
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
});

// Reset board (keep players)
resetBtn.addEventListener('click', async () => {
  if (!currentRoom) return;
  const ref = doc(db, 'games', currentRoom);
  await updateDoc(ref, {
    board: emptyBoard(),
    currentTurn: 'X',
    status: 'playing',
    lastMoveAt: serverTimestamp()
  }).catch(e => alert(e.message));
});

// Leave room (you stay in DB but unsubscribe UI)
leaveBtn.addEventListener('click', () => {
  if (unsub) { unsub(); unsub = null; }
  showLobby();
});

// Delete room (creator or anyone for demo)
deleteBtn.addEventListener('click', async () => {
  if (!currentRoom) return;
  const ok = confirm('Delete this room for everyone?');
  if (!ok) return;
  const ref = doc(db, 'games', currentRoom);
  await deleteDoc(ref).catch(e => alert(e.message));
  showLobby();
});
