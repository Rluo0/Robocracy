// Host side of the audience lobby: room code + QR, live list of joined robots, crowd battle.
import { openRoom, newRoomCode, ROOM_RE } from './net.js';
import { drawRobot } from './render.js';
import { CHASSIS } from './sim.js';
import { LIM, num, sanitizeRobot } from './robot.js';

const MAX_CROWD = 48;
const CROWD_SUDDEN = 25;
const KEY = 'robocracy.host.room', FFA_KEY = 'robocracy.host.ffa';
const esc = (v) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const store = (k, v) => {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v);
  } catch {}
  return null;
};
const PID_RE = /^[a-z0-9]{8,32}$/;
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

export function initLobby({ setup, runBattle, renderSetup, mount }) {
  let open = false, code = '', room = null, unwatch = null, gen = 0, timer = 0;
  let entries = [], ffa = store(FFA_KEY) === '1', battling = false, hasResult = true, msg = '', lastMeta = '';
  const $l = (k) => mount.querySelector(`[data-l="${k}"]`);

  const joinUrl = () => {
    const u = new URL('join.html', location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('room', code);
    return u.href;
  };
  const optName = (o, i) => o.name.trim().slice(0, LIM.opt) || `Option ${i + 1}`;
  const meta = (state) => ({
    question: setup.question.slice(0, LIM.question),
    options: setup.options.map((o, i) => ({ name: optName(o, i), color: o.color })),
    ffa, state, max: MAX_CROWD,
  });
  // Writes meta; an unchanged 'open' meta is not re-sent.
  function putMeta(state) {
    const m = meta(state), j = JSON.stringify(m);
    if (j === lastMeta) return Promise.resolve();
    lastMeta = j;
    return room.set('meta', m).catch((err) => {
      lastMeta = '';
      throw err;
    });
  }
  const fail = (err) => {
    const el = $l('err');
    if (el) el.textContent = `Connection problem: ${err?.message || err}`;
  };

  function publish() {
    if (!room || !open || battling) return;
    putMeta('open').catch(fail);
    if (hasResult) {
      hasResult = false;
      room.remove('result').catch(fail);
    }
  }

  // Called whenever the setup screen changes (and when the host returns to it).
  function sync() {
    if (!open) return;
    battling = false;
    clearTimeout(timer);
    timer = setTimeout(publish, 350);
  }

  function collapsed() {
    mount.innerHTML = '<button data-l="open">📱 Let the audience join</button>';
  }

  function renderList() {
    const bots = $l('bots');
    if (!bots) return;
    $l('count').textContent = `${entries.length} / ${MAX_CROWD} robots joined`;
    $l('start').disabled = entries.length < 2;
    bots.innerHTML = entries.map((r, i) => {
      const o = setup.options[r.option] || setup.options[0];
      return `
        <div class="bot">
          <canvas width="60" height="60" data-i="${i}"></canvas>
          <div class="bot-fields">
            <b>${esc(r.name || 'Unnamed')}</b>
            <div class="bot-sum">${r.owner ? `by ${esc(r.owner)}` : ''}${!ffa && o ? `${r.owner ? ' · ' : ''}<span style="color:${esc(o.color)}">${esc(optName(o, setup.options.indexOf(o)))}</span>` : ''}</div>
          </div>
          <button data-l="kick" data-id="${esc(r.id)}" title="Remove robot">✕</button>
        </div>`;
    }).join('');
    for (const c of bots.querySelectorAll('canvas')) {
      const r = entries[c.dataset.i], o = setup.options[r.option] || setup.options[0];
      const ctx = c.getContext('2d');
      drawRobot(ctx, 26, 30, CHASSIS[r.chassis].r * 1.25, 0, { ...r, teamColor: o ? o.color : r.color });
    }
  }

  function onEntries(raw) {
    const list = [], now = Date.now();
    for (const [id, e] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
      try {
        if (!PID_RE.test(id)) continue;
        const r = sanitizeRobot(e);
        if (!r) continue;
        const at = num(e.at, -1);
        list.push({ id, ...r, option: Number.isInteger(e.option) && e.option >= 0 ? e.option : 0, at: at < 0 ? Infinity : Math.min(at, now) });
      } catch {}
    }
    list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));
    entries = list.slice(0, MAX_CROWD);
    renderList();
  }

  async function drawQr(canvas, url) {
    try {
      const { default: qrcode } = await import('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm');
      const q = qrcode(0, 'M');
      q.addData(url);
      q.make();
      const n = q.getModuleCount(), cell = Math.ceil(260 / (n + 8)), size = cell * (n + 8);
      canvas.width = canvas.height = size;
      canvas.style.width = `${size}px`;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#000';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect((c + 4) * cell, (r + 4) * cell, cell, cell);
    } catch {
      canvas.remove();
    }
  }

  function shell() {
    const url = joinUrl();
    mount.innerHTML = `
      <div class="lobby">
        <div class="lobby-top">
          <canvas class="lobby-qr" width="1" height="1"></canvas>
          <div class="lobby-join">
            <div class="dim">Scan the code, or open</div>
            <div class="lobby-url">${esc(url)}</div>
            <div class="dim">Room code</div>
            <div class="lobby-code">${esc(code)}</div>
          </div>
        </div>
        <div class="lobby-warn" data-l="warn"></div>
        <div class="lobby-err" data-l="err">Connecting…</div>
        <div class="dim" data-l="count"></div>
        <div class="lobby-bots" data-l="bots"></div>
        <div class="lobby-foot">
          <label><input type="checkbox" data-l="ffa"${ffa ? ' checked' : ''}> Free-for-all</label>
          <div class="row">
            <button class="primary" data-l="start" disabled>Start crowd battle</button>
            <button data-l="new">New room</button>
            <button data-l="close">Close</button>
          </div>
        </div>
      </div>`;
    const warn = [];
    if (LOCAL_HOSTS.includes(location.hostname)) warn.push("Phones can't reach localhost. Deploy the site to use this for real.");
    $l('warn').innerHTML = warn.map(esc).join('<br>');
    drawQr(mount.querySelector('.lobby-qr'), url);
  }

  async function connect() {
    const mine = ++gen;
    leave();
    entries = [];
    shell();
    let r;
    try {
      r = await openRoom(code);
    } catch (err) {
      if (mine === gen) fail(err);
      return;
    }
    if (mine !== gen) return;
    room = r;
    $l('err').textContent = msg = '';
    if (r.mode === 'local') $l('warn').innerHTML += `${$l('warn').innerHTML ? '<br>' : ''}Local test mode: Firebase is not configured, only tabs in this browser can join.`;
    hasResult = true;
    battling = false;
    lastMeta = '';
    unwatch = r.watch('entries', onEntries);
    publish();
  }

  function openPanel() {
    open = true;
    const saved = store(KEY);
    code = ROOM_RE.test(saved || '') ? saved : newRoomCode();
    store(KEY, code);
    connect();
  }

  // Tell phones the room is closed (best effort), then disconnect.
  function leave() {
    clearTimeout(timer);
    unwatch?.();
    const old = room;
    unwatch = room = null;
    if (!old) return;
    const done = () => old.close?.();
    Promise.race([old.set('meta', meta('closed')), new Promise((res) => setTimeout(res, 1500))]).catch(() => {}).then(done);
  }

  function closePanel() {
    open = false;
    gen++;
    leave();
    collapsed();
  }

  function start() {
    const err = $l('err');
    const bots = entries.map(({ id, name, owner, cry, color, accent, chassis, weapon, eyes, hat, pattern, option }) =>
      ({ pid: id, name: name.trim() || 'Unnamed', owner: owner.trim(), cry: cry.trim(), color, accent, chassis, weapon, eyes, hat, pattern, option }));
    let teams, robots;
    if (ffa) {
      teams = bots.map((b, i) => ({ id: i, name: b.name, color: b.color }));
      robots = bots.map((b, i) => ({ ...b, team: i }));
    } else {
      teams = setup.options.map((o, i) => ({ id: i, name: optName(o, i), color: o.color }));
      robots = bots.map((b) => ({ ...b, team: b.option < teams.length ? b.option : 0 }));
    }
    if (robots.length < 2 || new Set(robots.map((r) => r.team)).size < 2) {
      err.textContent = ffa ? 'Need at least 2 robots.' : 'Robots from at least 2 different sides are needed (or switch on Free-for-all).';
      return;
    }
    err.textContent = '';
    clearTimeout(timer);
    runBattle({ seed: Math.random().toString(36).slice(2, 8), teams, robots, suddenAt: CROWD_SUDDEN }, {
      onStart() {
        battling = true;
        clearTimeout(timer);
        if (room) putMeta('battle').catch(() => {});
        room?.remove('result').catch(() => {});
      },
      onResult(r) {
        const places = {};
        r.standings.forEach((b, i) => {
          if (PID_RE.test(b.pid)) places[b.pid] = i + 1;
        });
        hasResult = true;
        if (!room) return;
        room.set('result', { winner: String(r.winner.name).slice(0, 40), places, total: r.standings.length }).catch(() => {});
        putMeta('done').catch(() => {});
      },
    });
  }

  mount.addEventListener('click', (e) => {
    const b = e.target.closest('[data-l]');
    if (!b) return;
    const k = b.dataset.l;
    if (k === 'open') openPanel();
    else if (k === 'close') closePanel();
    else if (k === 'new') {
      leave();
      code = newRoomCode();
      store(KEY, code);
      connect();
    } else if (k === 'start') start();
    else if (k === 'kick') room?.remove(`entries/${b.dataset.id}`).catch(fail);
  });
  mount.addEventListener('change', (e) => {
    if (e.target.dataset.l !== 'ffa') return;
    ffa = e.target.checked;
    store(FFA_KEY, ffa ? '1' : '0');
    renderList();
    sync();
  });

  collapsed();
  return { sync };
}
