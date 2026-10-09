// Room transport: Firebase Realtime Database, or a same-browser fallback for testing.
// Paths are relative to rooms/<code>/, e.g. 'meta', 'entries/<playerId>', 'result'.
import { firebaseConfig } from './firebase-config.js';

export const ROOM_RE = /^[A-Z]{4}$/;
export const newRoomCode = () => Array.from({ length: 4 }, () => 'BCDFGHJKLMNPQRSTVWXZ'[Math.floor(Math.random() * 20)]).join('');

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const BAD_KEYS = ['__proto__', 'constructor', 'prototype'];
const parts = (path) => {
  const keys = String(path).split('/').filter(Boolean);
  if (keys.some((k) => BAD_KEYS.includes(k))) throw new Error('Bad path');
  return keys;
};

async function openFirebase(code) {
  let app, db;
  try {
    [app, db] = await Promise.all([import(`${FB}firebase-app.js`), import(`${FB}firebase-database.js`)]);
  } catch (err) {
    throw new Error(`Could not load Firebase (${err.message || 'offline?'}). Check the internet connection.`);
  }
  let base;
  try {
    base = db.getDatabase(app.initializeApp(firebaseConfig));
  } catch (err) {
    throw new Error(`Firebase setup failed: ${err.message || err}`);
  }
  const at = (path) => db.ref(base, ['rooms', code, ...parts(path)].join('/'));
  return {
    mode: 'firebase',
    set: async (path, value) => db.set(at(path), value),
    remove: async (path) => db.remove(at(path)),
    watch(path, cb) {
      return db.onValue(at(path), (snap) => cb(snap.val()), (err) => console.warn('Firebase watch failed:', err));
    },
    serverTime: () => db.serverTimestamp(),
    close() {},
  };
}

function openLocal(code) {
  const key = `robocracy.room.${code}`;
  const chan = typeof BroadcastChannel === 'function' ? new BroadcastChannel(key) : null;
  const subs = new Set();
  const readAll = () => {
    try {
      return JSON.parse(localStorage.getItem(key)) || {};
    } catch {
      return {};
    }
  };
  const get = (path) => {
    try {
      return parts(path).reduce((v, k) => (v && typeof v === 'object' && Object.hasOwn(v, k) ? v[k] : null), readAll()) ?? null;
    } catch {
      return null;
    }
  };
  const notify = () => {
    for (const fn of [...subs]) {
      try {
        fn();
      } catch (err) {
        console.warn('Room watcher failed:', err);
      }
    }
  };
  function write(path, value) {
    const keys = parts(path), root = readAll();
    if (!keys.length) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } else {
      let node = root;
      for (const k of keys.slice(0, -1)) node = node[k] && typeof node[k] === 'object' ? node[k] : (node[k] = {});
      if (value === null) delete node[keys.at(-1)];
      else node[keys.at(-1)] = value;
      localStorage.setItem(key, JSON.stringify(root));
    }
    notify();
    chan?.postMessage('change');
  }
  if (chan) chan.onmessage = notify;
  // Another tab's write can reach localStorage here after its broadcast does; the storage event is the reliable signal.
  const onStorage = (e) => e.key === key && notify();
  globalThis.addEventListener?.('storage', onStorage);
  return {
    mode: 'local',
    set: async (path, value) => write(path, JSON.parse(JSON.stringify(value))),
    remove: async (path) => write(path, null),
    watch(path, cb) {
      let last;
      const fire = () => {
        const v = get(path), j = JSON.stringify(v);
        if (j === last) return;
        last = j;
        cb(v);
      };
      subs.add(fire);
      fire();
      return () => subs.delete(fire);
    },
    serverTime: () => Date.now(),
    close() {
      subs.clear();
      globalThis.removeEventListener?.('storage', onStorage);
      if (chan) chan.onmessage = null;
      chan?.close();
    },
  };
}

export async function openRoom(code) {
  const c = firebaseConfig;
  return c.apiKey && c.databaseURL ? openFirebase(code) : openLocal(code);
}
