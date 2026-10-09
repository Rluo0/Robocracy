// Phone join page: enter name + pick, build a robot in the garage, then follow it through the battle.
import { PALETTE, CRIES, LIM, BLURBS, pick, randomName, randomRobot, reroll, sanitizeRobot } from '/game/src/robot.js';
import { EYES, HATS, PATTERNS } from '/game/src/render.js';
import { CHASSIS, WEAPONS } from '/game/src/sim.js';
import { paintBot } from '/js/bot-canvas.js';

const socket = io();
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

let me = null;
let lastStatus = null;
let lastRobotSig = null;
let lastRoom = null; // latest room payload, so closing the garage can re-render the status screen
let draft = null; // the robot being built in the garage
let garageOpen = false;
let sendRobot = false; // false once the server rejects an update, so we stop nagging it
let sendTimer = null;
let stageRobot = null; // robot drawn on the status screen canvas
let stageDead = false;
let code = (params.get('room') || '').toUpperCase();

// Storage can throw in private mode; rejoining is a nice-to-have, not required.
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

if (code) {
  $('code').value = code;
}

const DRAFT_KEY = 'rr-robot';

function loadDraft() {
  try {
    return sanitizeRobot(JSON.parse(store.get(DRAFT_KEY)));
  } catch {
    return null;
  }
}
const saveDraft = () => store.set(DRAFT_KEY, JSON.stringify(draft));

// The robot as the server should see it: never empty-named, cry always set.
function outgoing(robot, playerName, fallbackCry) {
  const out = sanitizeRobot(robot);
  out.name = out.name.trim() || 'Unnamed';
  out.cry = out.cry.trim() || fallbackCry.slice(0, LIM.cry);
  out.owner = playerName;
  return out;
}

const SCREENS = ['form-screen', 'garage-screen', 'status-screen'];
function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
}

function showForm(error) {
  me = null;
  lastStatus = null;
  lastRobotSig = null;
  garageOpen = false;
  clearTimeout(sendTimer);
  showScreen('form-screen');
  $('join-btn').disabled = false;
  const box = $('form-error');
  box.classList.toggle('hidden', !error);
  box.innerHTML = error ? '<i class="ph-bold ph-warning" aria-hidden="true"></i><span></span>' : '';
  if (error) {
    box.querySelector('span').textContent = error;
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
    RR.vibrate([60, 40, 60]);
  }
}

function setStage({ dead = false, crown = false, motion = 'bob' } = {}) {
  const stage = $('stage');
  stageRobot = me.robot ? sanitizeRobot(me.robot) : null;
  stageDead = dead;
  let bot;
  if (stageRobot) {
    bot = document.createElement('canvas');
    bot.width = bot.height = 340;
    bot.className = 'bot-cv';
    bot.setAttribute('aria-hidden', 'true');
  } else {
    // Older server without robots: fall back to the cartoon avatar.
    bot = RR.robot(me.color, me.id);
    bot.classList.add('wander');
  }
  if (motion) bot.classList.add(motion);
  if (dead) bot.classList.add('dead');
  stage.replaceChildren(bot);
  if (crown) {
    const c = document.createElement('i');
    c.className = 'ph-fill ph-crown crown';
    c.setAttribute('aria-hidden', 'true');
    stage.append(c);
  }
}

function render(room) {
  lastRoom = room;
  // The battle started while tinkering: drop the garage, there is no more editing.
  if (garageOpen && room.status !== 'lobby') closeGarage(false);
  if (!garageOpen) showScreen('status-screen');
  const botColor = me.robot?.color || me.color;
  $('me').style.setProperty('--c', botColor);
  $('me-name').textContent = me.robot?.name || me.name;
  $('me-by').textContent = me.robot ? `by ${me.name}` : '';
  $('me-pick').textContent = me.pick;
  const inLobby = room.status === 'lobby';
  $('leave').classList.toggle('hidden', !inLobby);
  $('edit-robot').classList.toggle('hidden', !inLobby || !me.robot);

  // In the lobby a changed robot also redraws the stage; other states only redraw on a state change.
  const robotSig = JSON.stringify(me.robot || null);
  const changed = room.status !== lastStatus || (inLobby && robotSig !== lastRobotSig);
  lastStatus = room.status;
  lastRobotSig = robotSig;
  const title = $('status-title');
  const text = $('status-text');

  if (room.status === 'lobby') {
    title.innerHTML = "You're <em>in!</em>";
    text.textContent = room.locked ? 'Entries locked. The fight is about to start.' : 'Eyes on the big screen. The fight starts soon.';
    if (changed) setStage();
  } else if (room.status === 'battle') {
    title.innerHTML = '<em>FIGHT!</em>';
    text.textContent = 'Your robot is in the arena. Watch the big screen!';
    if (changed) {
      setStage({ motion: 'rattle' });
      RR.vibrate([200, 80, 200, 80, 400]);
    }
  } else if (room.status === 'results') {
    const winner = room.players.find((p) => p.id === room.winnerId);
    const won = winner?.id === me.id;
    if (won) {
      title.innerHTML = 'You <em>won!</em>';
      text.textContent = `${me.pick} takes it. The robots have spoken.`;
    } else {
      title.innerHTML = '<em>Destroyed.</em>';
      text.textContent = winner ? `${winner.name} won with ${winner.pick}.` : 'The battle is over.';
    }
    if (changed) {
      setStage(won ? { crown: true } : { dead: true, motion: null });
      RR.vibrate(won ? [80, 60, 80, 60, 300] : [600]);
      if (won) setTimeout(() => RR.burstAt($('stage'), [botColor, '#ffd23f', '#eeebe4']), 150);
      RR.sfx[won ? 'win' : 'lose']();
    }
  }
}

// ---------- Garage ----------
const CHIP_GROUPS = { chassis: CHASSIS, weapon: WEAPONS, eyes: EYES, hat: HATS, pattern: PATTERNS };

// Chips are built with DOM APIs; labels come from game code, but textContent keeps it safe regardless.
function buildChips() {
  for (const [field, map] of Object.entries(CHIP_GROUPS)) {
    const box = $(`chips-${field}`);
    for (const [key, def] of Object.entries(map)) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.field = field;
      chip.dataset.v = key;
      chip.textContent = def.label;
      box.append(chip);
    }
  }
}

// Push the draft into every control (on open, dice and Surprise me).
function syncGarage() {
  $('g-name').value = draft.name;
  $('g-cry').value = draft.cry;
  $('g-color').value = draft.color;
  $('g-accent').value = draft.accent;
  for (const chip of document.querySelectorAll('#garage-screen .chip')) {
    const on = draft[chip.dataset.field] === chip.dataset.v;
    chip.classList.toggle('on', on);
    chip.setAttribute('aria-pressed', String(on));
  }
  $('blurb-chassis').textContent = BLURBS[draft.chassis] || '';
  $('blurb-weapon').textContent = BLURBS[draft.weapon] || '';
}

function openGarage() {
  garageOpen = true;
  sendRobot = true;
  showScreen('garage-screen');
  syncGarage();
  scrollTo(0, 0);
}

function closeGarage(flush = true) {
  if (flush) flushRobot();
  clearTimeout(sendTimer);
  garageOpen = false;
  if (me && lastRoom) {
    lastStatus = null; // force the status stage to rebuild with the final robot
    render(lastRoom);
  }
}

// Every tweak is saved locally at once and sent live (debounced) so the projector follows along.
function tweaked() {
  saveDraft();
  if (!sendRobot) return;
  clearTimeout(sendTimer);
  sendTimer = setTimeout(flushRobot, 300);
}

function flushRobot() {
  clearTimeout(sendTimer);
  if (!sendRobot || !me || !draft) return;
  const robot = outgoing(draft, me.name, `For ${me.pick}!`);
  socket.emit('player:robot', { robot }, (res) => {
    if (res?.ok) {
      if (res.player) me = res.player;
      return;
    }
    // Rejected (usually: the battle already started). Stop sending and show the status screen.
    sendRobot = false;
    if (garageOpen) closeGarage(false);
  });
}

buildChips();

$('g-name').addEventListener('input', (e) => {
  draft.name = e.target.value;
  tweaked();
});
$('g-cry').addEventListener('input', (e) => {
  draft.cry = e.target.value;
  tweaked();
});
$('g-color').addEventListener('input', (e) => {
  draft.color = e.target.value;
  tweaked();
});
$('g-accent').addEventListener('input', (e) => {
  draft.accent = e.target.value;
  tweaked();
});
$('g-name-dice').addEventListener('click', () => {
  draft.name = randomName();
  syncGarage();
  tweaked();
});
$('g-cry-dice').addEventListener('click', () => {
  draft.cry = pick(CRIES);
  syncGarage();
  tweaked();
});
$('garage-screen').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  draft[chip.dataset.field] = chip.dataset.v;
  syncGarage();
  tweaked();
});
$('g-surprise').addEventListener('click', () => {
  // reroll keeps paint and builder; fresh name and cry are part of the surprise.
  draft = reroll(draft);
  syncGarage();
  tweaked();
});
$('g-done').addEventListener('click', () => closeGarage(true));

$('edit-robot').addEventListener('click', () => {
  if (!me?.robot || lastRoom?.status !== 'lobby') return;
  draft = sanitizeRobot(me.robot);
  openGarage();
});

// Gentle sway like the old garage; one loop paints whichever robot canvas is on screen.
function loop(now) {
  const t = now / 1000;
  const angle = Math.sin(t * 1.3) * 0.35;
  if (garageOpen && draft) {
    paintBot($('garage-cv'), draft, angle, t);
  } else if (stageRobot) {
    const cv = $('stage').querySelector('canvas');
    if (cv) paintBot(cv, stageRobot, stageDead ? 0.6 : angle, stageDead ? 0 : t);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- Joining ----------
function join(payload) {
  socket.emit('player:join', payload, (res) => {
    if (!res.ok) {
      store.del(`rr-player-${payload.code}`);
      return showForm(payload.playerId ? null : res.error);
    }
    const fresh = !me && !payload.playerId;
    me = res.player;
    code = res.room.code;
    store.set(`rr-player-${code}`, me.id);
    history.replaceState(null, '', `/join?room=${code}`);
    lastRoom = res.room;
    // A fresh join lands in the garage; reattaching goes straight to the status screen.
    if (fresh && res.room.status === 'lobby' && me.robot) {
      draft = sanitizeRobot(me.robot);
      openGarage();
      render(res.room); // fills the status screen behind the garage
    } else {
      render(res.room);
    }
    if (fresh) {
      RR.sfx.boing();
      RR.vibrate(120);
      RR.burstAt($(garageOpen ? 'garage-stage' : 'stage'), [me.robot?.color || me.color, '#ffd23f', '#eeebe4']);
    }
  });
}

$('code').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));

$('join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  RR.sfx.unlock();
  const payload = { code: $('code').value.trim().toUpperCase(), name: $('name').value, pick: $('pick').value };
  const invalid = (field, message) => {
    showForm(message);
    $(field).focus();
  };
  if (payload.code.length !== 4) return invalid('code', 'Room codes are 4 characters. Check the big screen.');
  if (!payload.name.trim()) return invalid('name', 'Your robot needs a name.');
  if (!payload.pick.trim()) return invalid('pick', 'Tell your robot what it is fighting for.');
  // Reuse the saved robot from the last room, or roll a fresh one.
  const saved = loadDraft() || randomRobot(pick(PALETTE));
  payload.robot = outgoing(saved, payload.name.trim(), `For ${payload.pick.trim()}!`);
  draft = payload.robot;
  saveDraft();
  $('join-btn').disabled = true;
  join(payload);
});

$('leave').addEventListener('click', () => {
  socket.emit('player:leave');
  store.del(`rr-player-${code}`);
  showForm();
});

socket.on('room:update', (room) => {
  if (!me) return;
  lastRoom = room;
  const fresh = room.players.find((p) => p.id === me.id);
  if (fresh) me = fresh;
  render(room);
});

socket.on('player:kicked', () => {
  store.del(`rr-player-${code}`);
  showForm('The host removed you from this battle.');
});

// On first load and after every reconnect (phones sleep a lot), reattach to our fighter.
socket.on('connect', () => {
  const playerId = me?.id || (code && store.get(`rr-player-${code}`));
  if (playerId) join({ code, playerId });
});
