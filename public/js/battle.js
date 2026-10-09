// Embeds Richard's fight simulator (game/src) into the website.
// The game code is used as-is: lobby players become teams/robots, his sim decides, we report the winner.
import { createBattle, CHASSIS, WEAPONS, POWERUPS, DT, W, H } from '/game/src/sim.js';
import { createRenderer } from '/game/src/render.js';
import { sfx as gameSfx } from '/game/src/audio.js';

const CHASSIS_KEYS = Object.keys(CHASSIS);
const WEAPON_KEYS = Object.keys(WEAPONS);

const SLOWMO_RATE = 0.25; // sim speed during the final blow
const SLOWMO_SECONDS = 1.1; // sim seconds of slow motion before the battle ends
const DENSE_AT = 13; // compact fighter list from this many robots

// Free for all: every player is their own team of one robot.
// Chassis and weapon come from the player id, so a player keeps the same loadout across rounds.
export function buildConfig(room, seed = Math.random().toString(36).slice(2, 8)) {
  const teams = [];
  const robots = [];
  const playerByTeam = new Map();
  room.players.forEach((p, i) => {
    const h = RR.hash(p.id);
    teams.push({ id: i, name: p.pick, color: p.color });
    robots.push({
      name: p.name,
      team: i,
      color: p.color,
      chassis: CHASSIS_KEYS[h % CHASSIS_KEYS.length],
      weapon: WEAPON_KEYS[(h >>> 5) % WEAPON_KEYS.length],
    });
    playerByTeam.set(i, p);
  });
  return { config: { seed, teams, robots }, playerByTeam };
}

// The sim is deterministic (same config + seed = same fight), so a silent dry run tells us
// exactly when the final two face off and when the last blow lands. The live battle uses
// that to start the zoom and slow motion in time, even when the final duel lasts a split second.
function forecast(config) {
  const b = createBattle(structuredClone(config));
  const st = b.state;
  let finalTwo = null;
  while (!st.over) {
    b.step();
    st.events.length = 0;
    if (finalTwo === null && st.bots.filter((x) => x.alive).length <= 2) finalTwo = st.t;
  }
  return { end: st.t, finalTwo: finalTwo ?? st.t, winner: st.winner };
}

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Mounts a live battle into `root`.
 * onResult(winnerPlayer) fires once when the sim declares a winner.
 * onPlayAgain() fires when the host clicks PLAY AGAIN on the winner screen.
 */
export function mountBattle(root, { room, onResult, onPlayAgain }) {
  const { config, playerByTeam } = buildConfig(room);
  const plan = forecast(config);
  const battle = createBattle(config);
  const s = battle.state;
  const dramatic = s.bots.length >= 3;
  // Start the showdown when two are left, but at least 5s before the end so it never gets skipped.
  const dramaAt = dramatic ? Math.max(1.5, Math.min(plan.finalTwo, plan.end - 5)) : Infinity;
  const slowAt = dramatic ? plan.end - SLOWMO_SECONDS : Infinity;

  root.innerHTML = `
    <div class="bt">
      <div class="bt-stage">
        <div class="bt-frame">
          <div class="bt-view">
            <canvas class="bt-canvas" aria-label="Robot battle arena"></canvas>
            <div class="bt-vignette" aria-hidden="true"></div>
            <div class="bt-bars" aria-hidden="true"><i></i><i></i></div>
          </div>
          <div class="bt-feed" aria-live="polite"></div>
        </div>
      </div>
      <aside class="bt-rail">
        <div class="bt-head">
          <h2>FIGHT!</h2>
          <div class="bt-alive"><b></b><span>left</span></div>
        </div>
        <div class="bt-controls">
          <button class="btn dark" data-speed="1" aria-pressed="true">1x</button>
          <button class="btn dark" data-speed="2" aria-pressed="false">2x</button>
          <button class="btn dark" data-speed="4" aria-pressed="false">4x</button>
          <button class="btn dark" data-act="skip"><i class="ph-bold ph-fast-forward" aria-hidden="true"></i>Skip</button>
          <button class="btn dark icon-only" data-act="mute" aria-label="Mute battle sound"><i class="ph-bold ph-speaker-high" aria-hidden="true"></i></button>
          <span class="bt-clock"></span>
        </div>
        <ol class="bt-list"></ol>
      </aside>
      <div class="bt-result hidden"></div>
    </div>`;

  const $ = (sel) => root.querySelector(sel);
  const shell = $('.bt');
  const canvas = $('.bt-canvas');
  const feedBox = $('.bt-feed');
  const list = $('.bt-list');
  const resultBox = $('.bt-result');
  list.classList.toggle('dense', s.bots.length >= DENSE_AT);

  // Fighter list on the rail: robot avatar, name, pick, health bar. Knocked-out robots sink to the bottom.
  const rows = s.bots.map((b) => {
    const p = playerByTeam.get(b.team);
    const row = el('li', 'bt-row');
    row.style.setProperty('--c', p.color);
    const bot = RR.robot(p.color, p.id);
    const who = el('div', 'bt-who');
    who.append(el('span', 'bt-name', p.name), el('span', 'bt-pick', p.pick));
    const bar = el('div', 'bt-bar');
    bar.append(el('i'));
    who.append(bar);
    row.append(bot, who);
    list.append(row);
    return { row, bot, fill: bar.firstChild };
  });

  const tag = (b) => {
    const t = el('b', null, b.name);
    t.style.color = b.color;
    return t;
  };

  function feed(...parts) {
    const line = el('div');
    line.append(...parts.map((part) => (typeof part === 'string' ? document.createTextNode(part) : part)));
    feedBox.prepend(line);
    while (feedBox.children.length > 5) feedBox.lastChild.remove();
    setTimeout(() => line.remove(), 5000);
  }

  const renderer = createRenderer(canvas, battle, {
    onEvent(e) {
      if (e.type === 'boom') gameSfx.boom(e.r / 50);
      else if (e.type === 'beam') gameSfx.tone(1800, 200, 0.2, 'sawtooth', 0.04);
      else if (e.type === 'banner') {
        gameSfx.tone(220, 660, 0.4, 'triangle', 0.08);
        RR.shake(true);
      } else if (e.type === 'pickup') {
        gameSfx.tone(520, 1040, 0.12);
        const info = POWERUPS[e.power];
        feed(tag(s.bots[e.id]), ` grabbed ${info.icon} ${info.label}`);
      } else if (e.type === 'death') {
        gameSfx.tone(300, 40, 0.5, 'sawtooth', 0.09);
        const victim = s.bots[e.id];
        if (e.killer >= 0) feed(tag(s.bots[e.killer]), ' scrapped ', tag(victim));
        else feed(tag(victim), ' was obliterated');
        rows[e.id].bot.classList.add('dead');
        list.append(rows[e.id].row);
      }
    },
  });

  function updateRail() {
    let alive = 0;
    s.bots.forEach((b, i) => {
      if (b.alive) alive++;
      rows[i].row.classList.toggle('out', !b.alive);
      rows[i].fill.style.transform = `scaleX(${Math.max(0, b.hp / b.maxHp)})`;
    });
    $('.bt-alive b').textContent = alive;
    $('.bt-clock').textContent = s.sudden ? `SUDDEN DEATH ${s.t.toFixed(0)}s` : `${s.t.toFixed(0)}s`;
  }

  // ---------- speed ----------
  let speed = 1;
  function setSpeed(value) {
    speed = value;
    root.querySelectorAll('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.speed) === value)));
  }

  $('.bt-controls').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.speed) setSpeed(Number(b.dataset.speed));
    else if (b.dataset.act === 'skip') {
      while (!s.over) battle.step();
      s.events.length = 0;
    } else if (b.dataset.act === 'mute') {
      gameSfx.muted = !gameSfx.muted;
      b.querySelector('i').className = `ph-bold ${gameSfx.muted ? 'ph-speaker-slash' : 'ph-speaker-high'}`;
      b.setAttribute('aria-label', gameSfx.muted ? 'Unmute battle sound' : 'Mute battle sound');
    }
  });

  // ---------- showdown: camera, letterbox, heartbeat, slow motion ----------
  let drama = false;
  let heartbeat = 0;
  const cam = { x: W / 2, y: H / 2, s: 1 };

  function startDrama() {
    drama = true;
    shell.classList.add('showdown');
    setSpeed(1);
    const alive = s.bots.filter((b) => b.alive).length;
    RR.slam(alive <= 2 ? 'FINAL SHOWDOWN' : `FINAL ${alive}`, { flash: true, tilt: -5 });
    RR.sfx.showdown();
    RR.shake(true);
  }

  // Frame the robots still standing (or the last one to fall), zooming in as the field shrinks.
  function updateCamera(dt, slow) {
    let tx = W / 2;
    let ty = H / 2;
    let ts = 1;
    if (drama) {
      let focus = s.bots.filter((b) => b.alive);
      if (!focus.length) focus = [[...s.bots].sort((a, b) => (b.diedAt ?? 0) - (a.diedAt ?? 0))[0]];
      const xs = focus.map((b) => b.x);
      const ys = focus.map((b) => b.y);
      const pad = 110;
      const bw = Math.max(Math.max(...xs) - Math.min(...xs) + pad * 2, 240);
      const bh = Math.max(Math.max(...ys) - Math.min(...ys) + pad * 2, 240);
      ts = clamp(Math.min(W / bw, H / bh), 1, slow || s.over ? 3 : 2.3);
      tx = (Math.min(...xs) + Math.max(...xs)) / 2;
      ty = (Math.min(...ys) + Math.max(...ys)) / 2;
    }
    const k = 1 - Math.exp(-dt * (slow ? 6 : 2.6));
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    cam.s += (ts - cam.s) * k;
    // Keep the view inside the arena.
    const cx = clamp(cam.x, W / 2 / cam.s, W - W / 2 / cam.s);
    const cy = clamp(cam.y, H / 2 / cam.s, H - H / 2 / cam.s);
    const px = canvas.clientWidth / W;
    canvas.style.transform = `translate(${(W / 2 - cx * cam.s) * px}px, ${(H / 2 - cy * cam.s) * px}px) scale(${cam.s})`;
  }

  // ---------- winner podium ----------
  function showWinner() {
    const r = battle.result();
    const winner = playerByTeam.get(r.winner.id);
    if (r.winner.id !== plan.winner) console.warn('Battle forecast and live result disagree', plan.winner, r.winner.id);
    onResult?.(winner);

    const box = el('div', 'bt-winner');
    const headline = el('h2', 'bt-wins');
    headline.append(el('em', null, winner.pick), ' wins!');

    // Display order: 2nd, 1st, 3rd.
    const top = r.standings.slice(0, 3).map((b) => ({ b, p: playerByTeam.get(b.team) }));
    const podium = el('div', 'podium');
    [1, 0, 2].forEach((place) => {
      const entry = top[place];
      if (!entry) return;
      const col = el('div', `pod pod-${place + 1}`);
      col.style.setProperty('--c', entry.p.color);
      const bot = RR.robot(entry.p.color, entry.p.id);
      bot.classList.add(place === 0 ? 'bob' : 'wander');
      const perch = el('div', 'pod-bot');
      perch.append(bot);
      if (place === 0) {
        const crown = el('i', 'ph-fill ph-crown crown');
        crown.setAttribute('aria-hidden', 'true');
        perch.append(crown);
      }
      const block = el('div', 'pod-block');
      block.append(
        el('span', 'pod-rank', String(place + 1)),
        el('span', 'pod-name', entry.p.name),
        el('span', 'pod-pick', entry.p.pick),
        el('span', 'pod-kos', `${entry.b.kills} KO${entry.b.kills === 1 ? '' : 's'}`),
      );
      col.append(perch, block);
      podium.append(col);
    });

    const again = el('button', 'btn mega');
    again.innerHTML = '<i class="ph-fill ph-lightning" aria-hidden="true"></i>PLAY AGAIN';
    again.addEventListener('click', () => onPlayAgain?.());

    box.append(headline, podium, el('p', 'muted', `Settled in ${r.duration.toFixed(1)}s. ${s.bots.length - 1} robots scrapped.`), again);
    resultBox.replaceChildren(box);
    resultBox.classList.remove('hidden');
    shell.classList.remove('showdown');

    RR.sfx.victory();
    RR.shake(true);
    // Sparks when the winner's block lands (it rises last, see CSS).
    setTimeout(() => {
      const first = podium.querySelector('.pod-1 .pod-bot');
      if (first) RR.burstAt(first, [winner.color, '#ffd23f', '#eeebe4']);
      RR.sfx.boom();
    }, 1150);
    again.focus({ preventScroll: true });
  }

  // ---------- loop: countdown, fixed-step sim, drama, winner ----------
  let raf = 0;
  let countdown = 3.2;
  let acc = 0;
  let afterOver = 0;
  let shown = false;
  let last = performance.now();

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const slow = drama && !s.over && s.t >= slowAt;
    if (countdown > 0) {
      const before = Math.ceil(countdown);
      countdown -= dt;
      const n = Math.ceil(countdown);
      if (n !== before && n <= 3) {
        RR.slam(n > 0 ? String(n) : 'FIGHT!', { tilt: n % 2 ? -8 : 8, flash: n === 0 });
        gameSfx.tone(n > 0 ? 440 : 880, n > 0 ? 440 : 880, 0.18, 'square', 0.07);
        if (n === 0) RR.shake(true);
      }
    } else if (!s.over) {
      acc += dt * (slow ? SLOWMO_RATE : speed);
      while (acc >= DT && !s.over) {
        battle.step();
        acc -= DT;
      }
      if (!drama && s.t >= dramaAt) startDrama();
      if (drama && (heartbeat -= dt) <= 0) {
        RR.sfx.heartbeat();
        heartbeat = slow ? 0.45 : 0.8;
      }
      shell.classList.toggle('slowmo', slow);
    } else if (!shown && (afterOver += dt) > (drama ? 2.4 : 1.8)) {
      shown = true;
      shell.classList.remove('slowmo');
      showWinner();
    }
    renderer.frame(slow ? dt * SLOWMO_RATE * 1.6 : dt);
    updateCamera(dt, slow);
    updateRail();
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      RR.sfx.stopMusic();
      root.replaceChildren();
    },
  };
}
