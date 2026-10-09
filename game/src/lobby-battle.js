// Battle page for the Node lobby (public/battle.html): loads the room's players, fights, reports the winner.
// Contract: see LOBBY.md. Everything the lobby server needs is the three calls below.
import { music } from './audio.js';
import { runBattle, esc } from './battle.js';
import { buildConfig, winnerId } from './fighters.js';

const $ = (sel) => document.querySelector(sel);
const code = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
const hostKey = sessionStorage.getItem(`rr-host-${code}`);
const newSeed = () => Math.random().toString(36).slice(2, 8);
const socket = io();

function problem(msg) {
  $('#problem').innerHTML = `<h2>${esc(msg)}</h2><a href="/">Back to the lobby</a>`;
  $('#problem').hidden = false;
}

// Back to the lobby for another round (same players).
function backToLobby() {
  const go = () => {
    socket.emit('host:reset', { code, hostKey });
    setTimeout(() => (location.href = `/host?room=${encodeURIComponent(code)}`), 250);
  };
  if (socket.connected) go();
  else {
    socket.once('connect', go);
    setTimeout(() => (location.href = `/host?room=${encodeURIComponent(code)}`), 3000);
  }
}

async function main() {
  if (!code) return problem('No room code in the link.');
  if (!hostKey) return problem('This screen is not the host of this room.');
  let room;
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
    if (res.status === 404) return problem(`Room ${code} was not found. The server may have restarted.`);
    if (!res.ok) return problem('Could not load the room.');
    room = await res.json();
  } catch {
    return problem('Could not reach the server.');
  }
  const { config, mode, error } = buildConfig(room, newSeed());
  if (error) return problem(error);

  const hooks = {
    onResult(r, note) {
      socket.emit('battle:result', { code, hostKey, winnerId: winnerId(r) }, (res) => {
        if (!res?.ok) note.textContent = `Could not tell the phones: ${res?.error || 'no answer'}`;
      });
    },
  };
  const opts = {
    title: `${mode === 'ffa' ? 'Free for all' : 'Team fight'} · room ${code}`,
    hooks,
    onQuit: backToLobby,
    actions: [
      { label: 'Play again', primary: true, run: backToLobby },
      // Same seed, same battle: the winner is already reported, so the replay doesn't report again.
      { label: 'Watch replay', run: () => runBattle(config, { ...opts, hooks: {} }) },
    ],
  };
  runBattle(config, opts);
}

music.load('/game/assets/theme.mp3').catch(() => {});
main();
