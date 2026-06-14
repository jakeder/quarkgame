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

// Resolve the Firebase config from one of two sources:
//   1. ./firebase-config.js  (local dev — gitignored, you create it)
//   2. /__/firebase/init.json (auto-served by Firebase Hosting when the app
//      is deployed on the same Firebase project — no config file needed)
async function loadConfig() {
  try {
    const mod = await import('./firebase-config.js');
    if (mod && mod.firebaseConfig) return mod.firebaseConfig;
  } catch (_) {
    // No local config file — fall through to the Hosting-provided one.
  }
  try {
    const res = await fetch('/__/firebase/init.json');
    if (res.ok) return await res.json();
  } catch (_) {
    // Not on Firebase Hosting (or offline) — nothing more to try.
  }
  return null;
}

async function init() {
  const cfg = await loadConfig();
  if (!cfg) {
    api = { ready: false, error: 'No Firebase config found. For local dev, copy firebase-config.example.js to firebase-config.js and fill it in. When deployed on Firebase Hosting this is automatic.' };
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

  async function createRoom(hostName, config) {
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
      // Publish lobby-relevant config (advanced flag + which variants) so guests
      // can show the right pre-game pickers (e.g. Anti Hero world choice).
      config: config || null,
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

  // A player sets their own pre-game choice (e.g. Anti Hero world).
  async function setPlayerWorld(code, uid, world) {
    await update(ref(db, `rooms/${code}/players/${uid}`), { world });
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
      state: JSON.stringify(initialState),
    });
  }

  async function writeState(code, state) {
    await set(ref(db, `rooms/${code}/state`), JSON.stringify(state));
  }

  api = {
    ready: true,
    createRoom, joinRoom, subscribeToRoom, leaveRoom, startRoom, writeState,
    setPlayerWorld,
  };
  window.Multiplayer = api;
  return api;
}

window.MultiplayerReady = init();
