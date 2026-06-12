// Firebase Realtime Database wrapper for online play.
//
// Loaded as an ES module. Exposes window.Multiplayer once Firebase has
// initialized; window.MultiplayerReady is a Promise that resolves to the
// same object so ui.js can wait for it before wiring online actions.
//
// Trust model: friends-trust. All clients can write to a room; the JS UI
// enforces who's allowed to act. Lock down via security rules later.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getDatabase, ref, set, get, onValue, update, remove, onDisconnect, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

let api = null;

async function init() {
  let cfg;
  try {
    cfg = (await import('./firebase-config.js')).firebaseConfig;
  } catch (err) {
    // No config — surface a friendly message instead of crashing.
    api = { ready: false, error: 'Missing firebase-config.js. See firebase-config.example.js for setup.' };
    window.Multiplayer = api;
    return api;
  }

  const app = initializeApp(cfg);
  const db = getDatabase(app);

  // Codes avoid ambiguous characters (0/O, 1/I/L).
  const ALPHABET = 'ABCDEFGHJKMNPQRTUVWXYZ23456789';
  function randomCode(len = 5) {
    let s = '';
    for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return s;
  }
  function randomUid() {
    return 'p_' + Math.random().toString(36).slice(2, 10);
  }

  async function createRoom(hostName) {
    const uid = randomUid();
    let code;
    // Avoid collisions on small code space.
    for (let attempt = 0; attempt < 8; attempt++) {
      code = randomCode();
      const snap = await get(ref(db, `rooms/${code}`));
      if (!snap.exists()) break;
      if (attempt === 7) throw new Error('Could not allocate a room code; try again.');
    }
    await set(ref(db, `rooms/${code}`), {
      code,
      createdAt: serverTimestamp(),
      hostUid: uid,
      players: {
        [uid]: { name: hostName, joinedAt: serverTimestamp() },
      },
      started: false,
      state: null,
    });
    // Best-effort cleanup if the host's tab closes before starting.
    onDisconnect(ref(db, `rooms/${code}/players/${uid}`)).remove();
    return { code, uid };
  }

  async function joinRoom(code, playerName) {
    code = String(code || '').toUpperCase().trim();
    if (!code) throw new Error('Enter a room code.');
    const roomSnap = await get(ref(db, `rooms/${code}`));
    if (!roomSnap.exists()) throw new Error('Room ' + code + ' not found.');
    const room = roomSnap.val();
    if (room.started) throw new Error('Game already in progress.');
    const uid = randomUid();
    await update(ref(db, `rooms/${code}/players/${uid}`), {
      name: playerName,
      joinedAt: serverTimestamp(),
    });
    onDisconnect(ref(db, `rooms/${code}/players/${uid}`)).remove();
    return { code, uid };
  }

  function subscribeToRoom(code, callback) {
    const r = ref(db, `rooms/${code}`);
    const unsub = onValue(r, (snap) => callback(snap.val()));
    return unsub;
  }

  async function leaveRoom(code, uid) {
    await remove(ref(db, `rooms/${code}/players/${uid}`));
  }

  async function startRoom(code, initialState) {
    await update(ref(db, `rooms/${code}`), {
      started: true,
      state: initialState,
    });
  }

  async function writeState(code, state) {
    await set(ref(db, `rooms/${code}/state`), state);
  }

  api = {
    ready: true,
    createRoom, joinRoom, subscribeToRoom, leaveRoom, startRoom, writeState,
  };
  window.Multiplayer = api;
  return api;
}

window.MultiplayerReady = init();
