// Host (projector) lobby: creates or resumes a room, shows the QR code, and drops robots in as fighters join.
const socket = io();
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

let code = (params.get('room') || '').toUpperCase();
let hostKey = code ? sessionStorage.getItem(`rr-host-${code}`) : null;
let room = null;
let firstRender = true;

const MODE_LABELS = { ffa: 'FREE FOR ALL', teams: 'TEAM FIGHT' };
const cards = new Map(); // playerId -> element, so existing robots don't re-drop on every update

for (let i = 0; i < 3; i++) {
  const bot = RR.robot(RR.ROBOT_COLORS[i * 2], `load-${i}`);
  bot.classList.add('bob', 'wander');
  $('loading-bots').append(bot);
}

function show(id) {
  for (const s of ['loading', 'error', 'lobby']) $(s).classList.toggle('hidden', s !== id);
}

function fail(message) {
  $('error-text').textContent = message;
  show('error');
}

function enterLobby(res) {
  room = res.room;
  $('qr').src = res.qr;
  $('join-url').textContent = res.joinUrl.replace(/^https?:\/\//, '');
  $('room-code').replaceChildren(...[...room.code].map((ch) => Object.assign(document.createElement('span'), { textContent: ch })));
  $('room-code').setAttribute('aria-label', `Room code ${room.code.split('').join(' ')}`);
  $('mode-pill').textContent = MODE_LABELS[room.mode];

  if (!$('qr-frame').querySelector('.peek')) {
    const peek = RR.robot('#ff4f7b', 'peek');
    peek.classList.add('peek', 'bob');
    $('qr-frame').append(peek);
  }
  render();
  show('lobby');
}

function connectAsHost() {
  if (code && hostKey) {
    socket.emit('host:resume', { code, hostKey }, (res) => (res.ok ? enterLobby(res) : fail(res.error)));
    return;
  }
  const mode = params.get('mode');
  if (!mode) return fail('Start a new battle from the home page.');
  socket.emit('host:create', { mode }, (res) => {
    if (!res.ok) return fail(res.error);
    code = res.room.code;
    hostKey = res.hostKey;
    sessionStorage.setItem(`rr-host-${code}`, hostKey);
    // Refreshing the projector now resumes this lobby instead of making a new one.
    history.replaceState(null, '', `/host?room=${code}`);
    enterLobby(res);
  });
}

function fighterCard(p) {
  const card = document.createElement('div');
  card.className = 'fighter';
  card.style.setProperty('--c', p.color);
  card.style.setProperty('--tilt', `${(RR.hash(p.id) % 9) - 4}deg`);

  const bot = RR.robot(p.color, p.id);
  bot.classList.add('bob');
  bot.style.animationDelay = `${-(RR.hash(p.id) % 13) / 10}s`;

  const tag = document.createElement('div');
  tag.className = 'tag';
  const name = document.createElement('span');
  name.className = 'name';
  tag.append(name);

  const pick = document.createElement('div');
  pick.className = 'pick';
  pick.innerHTML = '<i class="ph-fill ph-lightning" aria-hidden="true"></i> <span></span>';

  const kick = document.createElement('button');
  kick.className = 'kick';
  kick.innerHTML = '<i class="ph-bold ph-x" aria-hidden="true"></i>';
  kick.addEventListener('click', () => {
    RR.sfx.poof();
    RR.burstAt(card, [p.color, '#eeebe4']);
    socket.emit('host:kick', { code, hostKey, playerId: p.id });
  });

  card.append(kick, bot, tag, pick);
  return card;
}

function updateCard(card, p) {
  card.querySelector('.name').textContent = p.name;
  card.querySelector('.pick span').textContent = p.pick;
  card.querySelector('.kick').setAttribute('aria-label', `Remove ${p.name}`);
  card.classList.toggle('offline', !p.connected);
}

function render() {
  if (!room) return;
  const floor = $('players');
  const players = room.players;
  const ids = new Set(players.map((p) => p.id));
  const arrivals = [];

  for (const [id, card] of cards) {
    if (!ids.has(id)) {
      card.remove();
      cards.delete(id);
    }
  }

  floor.querySelector('.empty-floor')?.remove();
  for (const p of players) {
    let card = cards.get(p.id);
    if (!card) {
      card = fighterCard(p);
      cards.set(p.id, card);
      // Robots that were already here when the page loaded skip the drop-in.
      if (firstRender) card.classList.add('settled');
      else arrivals.push({ card, p });
    }
    updateCard(card, p);
    floor.append(card);
  }

  if (players.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-floor';
    const bot = RR.robot('#4fb0ff', 'lonely');
    bot.classList.add('bob');
    const text = document.createElement('p');
    text.textContent = 'Nobody here yet. Scan the code.';
    empty.append(bot, text);
    floor.append(empty);
  }

  const count = $('count');
  if (count.textContent !== String(players.length)) {
    count.textContent = players.length;
    count.classList.remove('bump');
    void count.offsetWidth;
    count.classList.add('bump');
  }

  // New fighter: drop in, sparks on landing, a boing, and their name slammed across the screen.
  arrivals.forEach(({ card, p }, i) => {
    setTimeout(() => {
      RR.sfx.boing();
      RR.burstAt(card, [p.color, '#eeebe4', '#ffd23f']);
      RR.shake();
    }, 380 + i * 120);
  });
  if (arrivals.length === 1) RR.slam(arrivals[0].p.name.toUpperCase(), { tone: 'bone', tilt: (Math.random() * 16) - 8 });
  else if (arrivals.length > 1) RR.slam(`+${arrivals.length}`, { tilt: 6 });

  firstRender = false;

  const enough = players.length >= 2;
  $('start').disabled = !enough;
  $('lock').querySelector('span').textContent = room.locked ? 'Unlock' : 'Lock entries';
  $('lock').querySelector('i').className = `ph-bold ${room.locked ? 'ph-lock' : 'ph-lock-open'}`;
  const hint = $('hint');
  hint.classList.toggle('ready', enough);
  hint.innerHTML = '';
  const icon = document.createElement('i');
  icon.className = `ph-bold ${room.locked ? 'ph-lock' : enough ? 'ph-lightning' : 'ph-warning'}`;
  hint.append(
    icon,
    room.locked ? 'Entries locked' : enough ? 'Ready to rumble' : `Need ${2 - players.length} more fighter${players.length === 1 ? '' : 's'}`,
  );
}

// ---------- Sound ----------
// Browsers block audio until the page is clicked, so the speaker button doubles as "enable sound".
function syncSoundButton() {
  const on = !RR.sfx.isMuted();
  $('sound').querySelector('i').className = `ph-bold ${on ? 'ph-speaker-high' : 'ph-speaker-slash'}`;
  $('sound').setAttribute('aria-label', on ? 'Mute music' : 'Unmute music');
}

function startAudio() {
  RR.sfx.unlock();
  if (!RR.sfx.isMuted()) RR.sfx.startMusic();
}
addEventListener('pointerdown', startAudio, { once: true });
addEventListener('keydown', startAudio, { once: true });

$('sound').addEventListener('click', () => {
  RR.sfx.unlock();
  RR.sfx.setMuted(!RR.sfx.isMuted());
  if (RR.sfx.isMuted()) RR.sfx.stopMusic();
  else RR.sfx.startMusic();
  syncSoundButton();
});
syncSoundButton();

// ---------- Controls ----------
$('lock').addEventListener('click', () => {
  RR.sfx.blip();
  socket.emit('host:lock', { code, hostKey, locked: !room.locked });
});

$('start').addEventListener('click', () => {
  $('start').disabled = true;
  socket.emit('host:start', { code, hostKey }, (res) => {
    if (!res.ok) {
      $('hint').textContent = res.error;
      $('start').disabled = false;
      return;
    }
    RR.sfx.stopMusic();
    RR.sfx.siren();
    RR.shake(true);
    RR.slam('FIGHT!', { flash: true, tilt: -6 });
    document.querySelectorAll('.fighter .bot').forEach((b) => b.classList.replace('bob', 'rattle'));
    setTimeout(() => (location.href = `/battle?room=${code}`), 1300);
  });
});

socket.on('room:update', (update) => {
  room = update;
  render();
});

// Runs on first connect and again after any reconnect, so the host rejoins its room.
socket.on('connect', () => {
  if (room) socket.emit('host:resume', { code, hostKey }, (res) => res.ok && enterLobby(res));
  else connectAsHost();
});
