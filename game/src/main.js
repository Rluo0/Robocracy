// Demo shell: argument setup -> battle -> verdict. The website can replace
// this file and feed createBattle() its own teams and robots.
import { createBattle, CHASSIS, WEAPONS, POWERUPS, DT } from './sim.js';
import { createRenderer, drawRobot } from './render.js';
import { sfx } from './audio.js';

const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const newSeed = () => Math.random().toString(36).slice(2, 8);

const PALETTE = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316'];
const NAMES = ['Clanker', 'Sprocket', 'Rustbucket', 'Gizmo', 'Sir Clanks', 'Toasty', 'Widget', 'Zapp', 'Crankshaft', 'Dent',
  'Tin Fury', 'Scrapheap', 'Voltina', 'Gearhead', 'Bolt Face', 'Wrecksy', 'Fuse', 'Piston Pete', 'Lugnut', 'Sparky'];
const MAX_OPTIONS = 6, MAX_ROBOTS = 8;

const randomRobot = (color) => ({ name: pick(NAMES), color, chassis: pick(Object.keys(CHASSIS)), weapon: pick(Object.keys(WEAPONS)) });

const setup = {
  question: 'Where are we eating tonight?',
  seed: newSeed(),
  options: ['Pizza', 'Tacos', 'Sushi'].map((name, i) => ({ name, color: PALETTE[i], robots: [randomRobot(PALETTE[i]), randomRobot(PALETTE[i])] })),
};

// ---------- setup screen ----------
const setupEl = $('#setup'), battleEl = $('#battle');

const options = (map, selected) =>
  Object.entries(map).map(([k, v]) => `<option value="${k}"${k === selected ? ' selected' : ''}>${v.label}</option>`).join('');

function renderSetup() {
  const teamMode = setup.options.some((o) => o.robots.length > 1);
  $('#options').innerHTML = setup.options.map((o, oi) => `
    <div class="opt" style="--c:${o.color}">
      <div class="opt-head">
        <input type="color" data-o="${oi}" data-f="color" value="${o.color}" title="Team colour">
        <input type="text" data-o="${oi}" data-f="name" value="${esc(o.name)}" placeholder="Option ${oi + 1}" maxlength="24">
        <button data-act="delopt" data-o="${oi}" title="Remove option">✕</button>
      </div>
      ${o.robots.map((r, ri) => `
        <div class="bot">
          <canvas width="60" height="60" data-prev="${oi}.${ri}"></canvas>
          <div class="bot-fields">
            <input type="text" data-o="${oi}" data-r="${ri}" data-f="name" value="${esc(r.name)}" placeholder="Robot name" maxlength="14">
            <div class="row">
              <input type="color" data-o="${oi}" data-r="${ri}" data-f="color" value="${r.color}" title="Paint">
              <select data-o="${oi}" data-r="${ri}" data-f="chassis" title="Chassis">${options(CHASSIS, r.chassis)}</select>
              <select data-o="${oi}" data-r="${ri}" data-f="weapon" title="Weapon">${options(WEAPONS, r.weapon)}</select>
              <button data-act="roll" data-o="${oi}" data-r="${ri}" title="Randomize">🎲</button>
              <button data-act="delbot" data-o="${oi}" data-r="${ri}" title="Remove robot">✕</button>
            </div>
          </div>
        </div>`).join('')}
      ${o.robots.length < MAX_ROBOTS ? `<button class="ghost" data-act="addbot" data-o="${oi}">+ Add robot</button>` : ''}
    </div>`).join('') +
    (setup.options.length < MAX_OPTIONS ? `<button class="ghost addopt" data-act="addopt">+ Add option</button>` : '');
  $('#mode').textContent = teamMode ? 'Team battle: last team standing wins' : 'Free-for-all: last robot standing wins';
  $('#question').value = setup.question;
  $('#seed').value = setup.seed;
  drawPreviews();
}

function drawPreviews() {
  for (const c of setupEl.querySelectorAll('canvas[data-prev]')) {
    const [oi, ri] = c.dataset.prev.split('.').map(Number);
    const o = setup.options[oi], r = o.robots[ri];
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 60, 60);
    drawRobot(ctx, 26, 30, CHASSIS[r.chassis].r * 1.25, 0, { ...r, teamColor: o.color });
  }
}

setupEl.addEventListener('input', (e) => {
  const t = e.target, f = t.dataset.f;
  if (t.id === 'question') setup.question = t.value;
  else if (t.id === 'seed') setup.seed = t.value;
  if (!f) return;
  const o = setup.options[t.dataset.o];
  (t.dataset.r === undefined ? o : o.robots[t.dataset.r])[f] = t.value;
  if (f === 'color' && t.dataset.r === undefined) t.closest('.opt').style.setProperty('--c', t.value);
  if (f !== 'name') drawPreviews();
});

setupEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const { act, o: oi, r: ri } = btn.dataset;
  const o = setup.options[oi];
  if (act === 'addopt') {
    const color = PALETTE.find((c) => !setup.options.some((x) => x.color === c)) || pick(PALETTE);
    setup.options.push({ name: '', color, robots: [randomRobot(color)] });
  } else if (act === 'delopt') setup.options.splice(oi, 1);
  else if (act === 'addbot') o.robots.push(randomRobot(o.color));
  else if (act === 'delbot') o.robots.splice(ri, 1);
  else if (act === 'roll') o.robots[ri] = randomRobot(o.robots[ri].color);
  else if (act === 'reseed') setup.seed = newSeed();
  else if (act === 'start') return start();
  renderSetup();
});

function start() {
  const teams = [], robots = [];
  setup.options.forEach((o, i) => {
    if (!o.robots.length) return;
    teams.push({ id: i, name: o.name.trim() || `Option ${i + 1}`, color: o.color });
    for (const r of o.robots) robots.push({ ...r, name: r.name.trim() || 'Unnamed', team: i });
  });
  if (teams.length < 2) {
    $('#error').textContent = 'An argument needs at least two options with a robot each.';
    return;
  }
  $('#error').textContent = '';
  runBattle({ seed: setup.seed || newSeed(), teams, robots });
}

// ---------- battle screen ----------
let raf = 0, speed = 1;

function runBattle(config) {
  cancelAnimationFrame(raf);
  setupEl.hidden = true;
  battleEl.hidden = false;
  $('#result').hidden = true;
  $('#feed').innerHTML = '';
  $('#title').textContent = setup.question || 'The argument';

  const battle = createBattle(config);
  const s = battle.state;
  const teamOf = (b) => battle.teams.find((t) => t.id === b.team);
  const tag = (b) => `<b style="color:${b.teamColor}">${esc(b.name)}</b>`;

  function feed(html) {
    const el = document.createElement('div');
    el.innerHTML = html;
    $('#feed').prepend(el);
    while ($('#feed').children.length > 6) $('#feed').lastChild.remove();
    setTimeout(() => el.remove(), 6000);
  }

  const renderer = createRenderer($('#arena'), battle, {
    onEvent(e) {
      if (e.type === 'boom') sfx.boom(e.r / 50);
      else if (e.type === 'beam') sfx.tone(1800, 200, 0.2, 'sawtooth', 0.04);
      else if (e.type === 'banner') sfx.tone(220, 660, 0.4, 'triangle', 0.08);
      else if (e.type === 'pickup') {
        sfx.tone(520, 1040, 0.12);
        feed(`${tag(s.bots[e.id])} grabbed ${POWERUPS[e.power].icon} ${POWERUPS[e.power].label}`);
      } else if (e.type === 'death') {
        sfx.tone(300, 40, 0.5, 'sawtooth', 0.09);
        const victim = s.bots[e.id];
        feed(e.killer >= 0 ? `${tag(s.bots[e.killer])} scrapped ${tag(victim)}` : `${tag(victim)} was obliterated`);
      }
    },
  });

  $('#hud').innerHTML = battle.teams.map((t) => `
    <div class="team" data-team="${t.id}" style="--c:${t.color}">
      <h3><i></i>${esc(t.name)}<span></span></h3>
      ${s.bots.filter((b) => b.team === t.id).map((b) => `
        <div class="hbot" data-bot="${b.id}">
          <div class="hname">${esc(b.name)} <em>${CHASSIS[b.chassis].label} · ${WEAPONS[b.weapon].label}</em></div>
          <div class="hstats">HP ${b.maxHp} · SPD ${Math.round(b.speed)} · DMG ×${b.dmg.toFixed(2)} · ROF ×${b.rate.toFixed(2)} · ARM ${Math.round(b.armor * 100)}% · CRIT ${Math.round(b.crit * 100)}%</div>
          <div class="bar"><i></i></div>
        </div>`).join('')}
    </div>`).join('');
  const bars = s.bots.map((b) => $(`.hbot[data-bot="${b.id}"]`));
  const counts = battle.teams.map((t) => $(`.team[data-team="${t.id}"] h3 span`));

  function updateHud() {
    s.bots.forEach((b, i) => {
      bars[i].classList.toggle('dead', !b.alive);
      bars[i].querySelector('.bar i').style.width = `${Math.max(0, (b.hp / b.maxHp) * 100)}%`;
    });
    battle.teams.forEach((t, i) => {
      const mine = s.bots.filter((b) => b.team === t.id);
      counts[i].textContent = `${mine.filter((b) => b.alive).length}/${mine.length}`;
    });
    $('#clock').textContent = s.sudden ? `SUDDEN DEATH ${s.t.toFixed(0)}s` : `${s.t.toFixed(0)}s`;
  }

  function showResult() {
    const r = battle.result();
    const mins = (t) => `${t.toFixed(1)}s`;
    $('#result').innerHTML = `
      <div class="verdict" style="--c:${r.winner.color}">
        <small>${esc(setup.question || 'The argument')}</small>
        <h2>🏆 ${esc(r.winner.name)}</h2>
        <p>${r.survivors.length ? `Last standing: ${r.survivors.map(tag).join(', ')}` : `Everyone exploded. ${tag(r.standings[0])} exploded last.`} · settled in ${mins(r.duration)}</p>
        <table>
          <tr><th>Robot</th><th>Option</th><th>Kills</th><th>Damage</th><th>Fate</th></tr>
          ${r.standings.map((b) => `<tr><td>${tag(b)}</td><td>${esc(teamOf(b).name)}</td><td>${b.kills}</td><td>${Math.round(b.dealt)}</td><td>${b.alive ? 'Survived' : `Scrapped at ${mins(b.diedAt)}`}</td></tr>`).join('')}
        </table>
        <div class="row">
          <button class="primary" data-act="rematch">Rematch</button>
          <button data-act="replay">Watch replay</button>
          <button data-act="edit">Edit robots</button>
        </div>
        <small>Seed <code>${esc(config.seed)}</code>: the same seed always replays the same battle.</small>
      </div>`;
    $('#result').hidden = false;
    $('#result').onclick = (e) => {
      const act = e.target.dataset.act;
      if (act === 'rematch') runBattle({ ...config, seed: (setup.seed = newSeed()) });
      else if (act === 'replay') runBattle(config);
      else if (act === 'edit') backToSetup();
    };
  }

  $('#skip').onclick = () => {
    while (!s.over) battle.step();
    s.events.length = 0;
  };

  let countdown = 3.2, acc = 0, afterOver = 0, shown = false, last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (countdown > 0) {
      const before = Math.ceil(countdown);
      countdown -= dt;
      const n = Math.ceil(countdown);
      $('#count').textContent = n > 3 ? '' : n > 0 ? n : 'FIGHT!';
      if (n !== before) sfx.tone(n > 0 ? 440 : 880, n > 0 ? 440 : 880, 0.18, 'square', 0.07);
      if (countdown <= 0) setTimeout(() => ($('#count').textContent = ''), 600);
    } else if (!s.over) {
      acc += dt * speed;
      while (acc >= DT && !s.over) {
        battle.step();
        acc -= DT;
      }
    } else if (!shown && (afterOver += dt) > 1.8) {
      shown = true;
      showResult();
    }
    renderer.frame(dt);
    updateHud();
    raf = requestAnimationFrame(loop);
  }
  $('#count').textContent = '';
  raf = requestAnimationFrame(loop);
}

function backToSetup() {
  cancelAnimationFrame(raf);
  battleEl.hidden = true;
  setupEl.hidden = false;
  renderSetup();
}

$('#controls').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.speed) {
    speed = Number(b.dataset.speed);
    for (const x of document.querySelectorAll('[data-speed]')) x.classList.toggle('on', x === b);
  } else if (b.id === 'mute') {
    sfx.muted = !sfx.muted;
    b.textContent = sfx.muted ? '🔇' : '🔊';
  } else if (b.id === 'quit') backToSetup();
});

renderSetup();
