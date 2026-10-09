// Phone join page: enter name + pick, then follow your robot through the battle.
const socket = io();
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

let me = null;
let lastStatus = null;
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

function showForm(error) {
  me = null;
  lastStatus = null;
  $('status-screen').classList.add('hidden');
  $('form-screen').classList.remove('hidden');
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
  const bot = RR.robot(me.color, me.id);
  bot.classList.add('wander');
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
  $('form-screen').classList.add('hidden');
  $('status-screen').classList.remove('hidden');
  $('me').style.setProperty('--c', me.color);
  $('me-name').textContent = me.name;
  $('me-pick').textContent = me.pick;
  $('leave').classList.toggle('hidden', room.status !== 'lobby');

  const changed = room.status !== lastStatus;
  lastStatus = room.status;
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
      if (won) setTimeout(() => RR.burstAt($('stage'), [me.color, '#ffd23f', '#eeebe4']), 150);
      RR.sfx[won ? 'win' : 'lose']();
    }
  }
}

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
    render(res.room);
    if (fresh) {
      RR.sfx.boing();
      RR.vibrate(120);
      RR.burstAt($('stage'), [me.color, '#ffd23f', '#eeebe4']);
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
