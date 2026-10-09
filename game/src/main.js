// Demo shell: argument setup -> battle -> verdict. The website can replace
// this file and feed createBattle() its own teams and robots.
import { createBattle, CHASSIS, WEAPONS, POWERUPS, DT } from './sim.js';
import { createRenderer, drawRobot, EYES, HATS, PATTERNS } from './render.js';
import { music, sfx } from './audio.js';
import { PALETTE, CRIES, LIM, HEX, BLURBS, pick, text, randomName, randomRobot, reroll, sanitizeRobot } from './robot.js';
import { initLobby } from './lobby.js';

const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const newSeed = () => Math.random().toString(36).slice(2, 8);

const MAX_OPTIONS = 6, MAX_ROBOTS = 8;

const defaultSetup = () => ({
  question: 'Where are we eating tonight?',
  options: ['Pizza', 'Tacos', 'Sushi'].map((name, i) => ({ name, color: PALETTE[i], robots: [randomRobot(PALETTE[i]), randomRobot(PALETTE[i])] })),
});

// ---------- persistence ----------
const STORE = 'robocracy.setup.v1';

function sanitize(raw) {
  if (!raw || !Array.isArray(raw.options) || raw.options.length < 1 || raw.options.length > MAX_OPTIONS) return null;
  const options = [];
  for (const [i, o] of raw.options.entries()) {
    if (!o || typeof o.name !== 'string' || !Array.isArray(o.robots) || o.robots.length > MAX_ROBOTS) return null;
    const color = HEX.test(o.color) ? o.color : PALETTE[i % PALETTE.length];
    const robots = [];
    for (const r of o.robots) {
      const clean = sanitizeRobot(r, PALETTE[i % PALETTE.length]);
      if (!clean) return null;
      robots.push(clean);
    }
    options.push({ name: text(o.name, LIM.opt), color, robots });
  }
  return { question: text(raw.question, LIM.question), options };
}

function load() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(STORE)));
  } catch {
    return null;
  }
}

function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({ question: setup.question, options: setup.options }));
  } catch {}
  lobby?.sync();
}

let lobby = null;
const setup = { seed: newSeed(), ...(load() || defaultSetup()) };

// ---------- setup screen ----------
const setupEl = $('#setup'), battleEl = $('#battle');

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
          <canvas width="60" height="60" data-prev="${oi}.${ri}" data-act="garage" data-o="${oi}" data-r="${ri}" title="Open garage"></canvas>
          <div class="bot-fields">
            <input type="text" data-o="${oi}" data-r="${ri}" data-f="name" value="${esc(r.name)}" placeholder="Robot name" maxlength="${LIM.name}">
            <div class="bot-sum">${r.owner ? `by ${esc(r.owner)} · ` : ''}${CHASSIS[r.chassis].label} · ${WEAPONS[r.weapon].label}</div>
          </div>
          <button data-act="garage" data-o="${oi}" data-r="${ri}" title="Customize in the garage">✎</button>
          <button data-act="roll" data-o="${oi}" data-r="${ri}" title="Randomize">🎲</button>
          <button data-act="delbot" data-o="${oi}" data-r="${ri}" title="Remove robot">✕</button>
        </div>`).join('')}
      ${o.robots.length < MAX_ROBOTS ? `<button class="ghost" data-act="addbot" data-o="${oi}">+ Add robot</button>` : ''}
    </div>`).join('') +
    (setup.options.length < MAX_OPTIONS ? `<button class="ghost addopt" data-act="addopt">+ Add option</button>` : '');
  $('#mode').textContent = teamMode ? 'Team battle: last team standing wins' : 'Free-for-all: last robot standing wins';
  $('#question').value = setup.question;
  $('#seed').value = setup.seed;
  drawPreviews();
  save();
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
  if (!f) return save();
  const o = setup.options[t.dataset.o];
  (t.dataset.r === undefined ? o : o.robots[t.dataset.r])[f] = t.value;
  if (f === 'color' && t.dataset.r === undefined) t.closest('.opt').style.setProperty('--c', t.value);
  if (f !== 'name') drawPreviews();
  save();
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
  else if (act === 'roll') o.robots[ri] = reroll(o.robots[ri]);
  else if (act === 'garage') return openGarage(Number(oi), Number(ri));
  else if (act === 'reseed') setup.seed = newSeed();
  else if (act === 'start') return start();
  renderSetup();
});

// ---------- garage ----------
const garageEl = $('#garage');
let gar = null;

const chips = (f, map, sel) => `<div class="chips">${Object.entries(map).map(([k, v]) =>
  `<button type="button" class="chip${k === sel ? ' on' : ''}" data-chip="${f}" data-v="${k}">${v.label}</button>`).join('')}</div>`;
const garageBot = () => setup.options[gar.oi].robots[gar.ri];

function buildGarage() {
  const o = setup.options[gar.oi], r = garageBot();
  garageEl.style.setProperty('--c', o.color);
  garageEl.innerHTML = `
    <div class="g-body">
      <div class="g-stage">
        <canvas width="400" height="400"></canvas>
        <div class="g-name" data-g="name"></div>
        <div class="dim" data-g="owner"></div>
        <div class="g-cry" data-g="cry"></div>
      </div>
      <div class="g-fields">
        <div class="g-field"><span>Name</span><div class="row">
          <input type="text" data-f="name" value="${esc(r.name)}" placeholder="Robot name" maxlength="${LIM.name}">
          <button type="button" data-act="gname" title="New name">🎲</button></div></div>
        <div class="g-field"><span>Built by</span>
          <input type="text" data-f="owner" value="${esc(r.owner)}" placeholder="Your name" maxlength="${LIM.owner}"></div>
        <div class="g-field"><span>Battle cry</span><div class="row">
          <input type="text" data-f="cry" value="${esc(r.cry)}" placeholder="Shout something" maxlength="${LIM.cry}">
          <button type="button" data-act="gcry" title="New battle cry">🎲</button></div></div>
        <div class="g-colors">
          <label>Paint <input type="color" data-f="color" value="${esc(r.color)}"></label>
          <label>Accent <input type="color" data-f="accent" value="${esc(r.accent)}"></label>
        </div>
        <div class="g-field"><span>Chassis</span>${chips('chassis', CHASSIS, r.chassis)}<div class="blurb" data-blurb="chassis"></div></div>
        <div class="g-field"><span>Weapon</span>${chips('weapon', WEAPONS, r.weapon)}<div class="blurb" data-blurb="weapon"></div></div>
        <div class="g-field"><span>Eyes</span>${chips('eyes', EYES, r.eyes)}</div>
        <div class="g-field"><span>Topper</span>${chips('hat', HATS, r.hat)}</div>
        <div class="g-field"><span>Pattern</span>${chips('pattern', PATTERNS, r.pattern)}</div>
      </div>
    </div>
    <div class="g-foot">
      <button type="button" data-act="gsurprise">🎲 Surprise me</button>
      <button type="button" class="primary" data-act="gdone">Done</button>
    </div>`;
  gar.canvas = garageEl.querySelector('canvas');
  refreshGarage();
}

function refreshGarage() {
  const r = garageBot(), g = (k) => garageEl.querySelector(`[data-g="${k}"]`);
  g('name').textContent = r.name || 'Unnamed';
  g('owner').textContent = r.owner ? `built by ${r.owner}` : '';
  g('cry').textContent = r.cry ? `“${r.cry}”` : '';
  for (const k of ['chassis', 'weapon']) garageEl.querySelector(`[data-blurb="${k}"]`).textContent = BLURBS[r[k]] || '';
}

function garageLoop(now) {
  if (!gar) return;
  const o = setup.options[gar.oi], r = garageBot(), ctx = gar.canvas.getContext('2d'), t = now / 1000;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, 400, 400);
  ctx.scale(3, 3);
  drawRobot(ctx, 400 / 6, 400 / 6, CHASSIS[r.chassis].r * 2.8, Math.sin(t * 1.3) * 0.35, { ...r, teamColor: o.color }, t);
  gar.raf = requestAnimationFrame(garageLoop);
}

function openGarage(oi, ri) {
  gar = { oi, ri, raf: 0, canvas: null };
  buildGarage();
  garageEl.showModal();
  gar.raf = requestAnimationFrame(garageLoop);
}

garageEl.addEventListener('input', (e) => {
  const t = e.target, f = t.dataset.f;
  if (!gar || !f) return;
  garageBot()[f] = t.value;
  refreshGarage();
  save();
});

// Only a press that starts on the backdrop closes, so drag-selecting text out of a field doesn't.
let downOnBackdrop = false;
garageEl.addEventListener('mousedown', (e) => (downOnBackdrop = e.target === garageEl));
garageEl.addEventListener('click', (e) => {
  if (!gar) return;
  if (e.target === garageEl) return downOnBackdrop && garageEl.close();
  const r = garageBot(), chip = e.target.closest('[data-chip]'), btn = e.target.closest('[data-act]');
  const fill = (f) => (garageEl.querySelector(`input[data-f="${f}"]`).value = r[f]);
  if (chip) {
    r[chip.dataset.chip] = chip.dataset.v;
    for (const c of chip.parentElement.children) c.classList.toggle('on', c === chip);
    refreshGarage();
  } else if (btn?.dataset.act === 'gname') {
    r.name = randomName();
    fill('name');
    refreshGarage();
  } else if (btn?.dataset.act === 'gcry') {
    r.cry = pick(CRIES);
    fill('cry');
    refreshGarage();
  } else if (btn?.dataset.act === 'gsurprise') {
    Object.assign(r, reroll(r));
    buildGarage();
  } else if (btn?.dataset.act === 'gdone') garageEl.close();
  save();
});

// Esc, backdrop and Done all end up here.
garageEl.addEventListener('close', () => {
  cancelAnimationFrame(gar?.raf);
  gar = null;
  renderSetup();
});

function start() {
  const teams = [], robots = [];
  setup.options.forEach((o, i) => {
    if (!o.robots.length) return;
    teams.push({ id: i, name: o.name.trim() || `Option ${i + 1}`, color: o.color });
    for (const r of o.robots) robots.push({ ...r, name: r.name.trim() || 'Unnamed', owner: r.owner.trim(), cry: r.cry.trim(), team: i });
  });
  if (teams.length < 2) {
    $('#error').textContent = 'An argument needs at least two options with a robot each.';
    return;
  }
  $('#error').textContent = '';
  runBattle({ seed: setup.seed || newSeed(), teams, robots });
}

// ---------- battle screen ----------
let raf = 0, speed = 1, introTimer = 0;

function runBattle(config, hooks = {}) {
  cancelAnimationFrame(raf);
  try {
    hooks.onStart?.();
  } catch (err) {
    console.warn('onStart hook failed:', err);
  }
  setupEl.hidden = true;
  battleEl.hidden = false;
  $('#result').hidden = true;
  $('#feed').innerHTML = '';
  $('#title').textContent = setup.question || 'The argument';

  const battle = createBattle(config);
  const s = battle.state;
  const teamOf = (b) => battle.teams.find((t) => t.id === b.team);
  const tag = (b) => `<b style="color:${esc(b.teamColor)}">${esc(b.name)}</b>`;

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

  // Crowd battles: compact rows past 12 robots, one shared card past 8 teams.
  const compact = s.bots.length > 12, one = battle.teams.length > 8;
  const groups = one ? [{ id: 'all', name: 'Free-for-all', color: '#8b93a7', bots: s.bots }]
    : battle.teams.map((t) => ({ ...t, bots: s.bots.filter((b) => b.team === t.id) }));
  $('#hud').innerHTML = groups.map((t) => `
    <div class="team" data-team="${t.id}" style="--c:${esc(t.color)}">
      <h3><i></i>${esc(t.name)}<span></span></h3>
      ${t.bots.map((b) => `
        <div class="hbot" data-bot="${b.id}"${one ? ` style="--c:${esc(b.teamColor)}"` : ''}>
          <div class="hname">${esc(b.name)} <em>${compact ? (b.owner ? esc(b.owner) : '') : `${b.owner ? `by ${esc(b.owner)} · ` : ''}${CHASSIS[b.chassis].label} · ${WEAPONS[b.weapon].label}`}</em></div>
          ${compact ? '' : `<div class="hstats">HP ${b.maxHp} · SPD ${Math.round(b.speed)} · DMG ×${b.dmg.toFixed(2)} · ROF ×${b.rate.toFixed(2)} · ARM ${Math.round(b.armor * 100)}% · CRIT ${Math.round(b.crit * 100)}%</div>`}
          <div class="bar"><i></i></div>
        </div>`).join('')}
    </div>`).join('');
  const bars = s.bots.map((b) => $(`.hbot[data-bot="${b.id}"]`));
  const counts = groups.map((t) => $(`.team[data-team="${t.id}"] h3 span`));

  function updateHud() {
    s.bots.forEach((b, i) => {
      bars[i].classList.toggle('dead', !b.alive);
      bars[i].querySelector('.bar i').style.width = `${Math.max(0, (b.hp / b.maxHp) * 100)}%`;
    });
    groups.forEach((t, i) => {
      const mine = t.bots;
      counts[i].textContent = `${mine.filter((b) => b.alive).length}/${mine.length}`;
    });
    $('#clock').textContent = s.sudden ? `SUDDEN DEATH ${s.t.toFixed(0)}s` : `${s.t.toFixed(0)}s`;
  }

  function showResult() {
    const r = battle.result();
    const mins = (t) => `${t.toFixed(1)}s`;
    const champ = r.standings.find((b) => b.team === r.winner.id);
    $('#result').innerHTML = `
      <div class="verdict" style="--c:${esc(r.winner.color)}">
        <small>${esc(setup.question || 'The argument')}</small>
        <h2>🏆 ${esc(r.winner.name)}</h2>
        <p>${r.survivors.length ? `Last standing: ${r.survivors.map(tag).join(', ')}` : `Everyone exploded. ${tag(r.standings[0])} exploded last.`} · settled in ${mins(r.duration)}</p>
        ${champ ? `
        <div class="champ">
          <canvas id="champ" width="192" height="192" style="width:96px;height:96px"></canvas>
          <div>
            <small>Champion</small>
            ${tag(champ)}
            ${champ.owner ? `<span class="dim">built by ${esc(champ.owner)}</span>` : ''}
            ${champ.cry ? `<div class="cry">“${esc(champ.cry)}”</div>` : ''}
          </div>
        </div>` : ''}
        <table>
          <tr><th>Robot</th><th>Option</th><th>Kills</th><th>Damage</th><th>Fate</th></tr>
          ${r.standings.map((b) => `<tr><td>${tag(b)}${b.owner ? `<small>by ${esc(b.owner)}</small>` : ''}</td><td>${esc(teamOf(b).name)}</td><td>${b.kills}</td><td>${Math.round(b.dealt)}</td><td>${b.alive ? 'Survived' : `Scrapped at ${mins(b.diedAt)}`}</td></tr>`).join('')}
        </table>
        <div class="row">
          <button class="primary" data-act="rematch">Rematch</button>
          <button data-act="replay">Watch replay</button>
          <button data-act="edit">Edit robots</button>
        </div>
        <small>Seed <code>${esc(config.seed)}</code>: the same seed always replays the same battle.</small>
      </div>`;
    $('#result').hidden = false;
    if (champ) {
      const ctx = $('#champ').getContext('2d');
      ctx.scale(2, 2);
      drawRobot(ctx, 48, 48, CHASSIS[champ.chassis].r * 2.2, 0, champ);
    }
    $('#result').onclick = (e) => {
      const act = e.target.dataset.act;
      if (act === 'rematch') runBattle({ ...config, seed: (setup.seed = newSeed()) }, hooks);
      else if (act === 'replay') runBattle(config, hooks);
      else if (act === 'edit') backToSetup();
    };
    try {
      hooks.onResult?.(r);
    } catch (err) {
      console.warn('onResult hook failed:', err);
    }
  }

  const countEl = $('#count'), announcer = $('#announcer');
  function clearIntro() {
    clearTimeout(introTimer);
    countEl.textContent = '';
    announcer.hidden = true;
  }

  // The announcer calls a number (or FIGHT! at 0), restarting the pop animation.
  function call(n) {
    countEl.textContent = n > 0 ? n : 'FIGHT!';
    countEl.classList.toggle('word', n === 0);
    countEl.style.animation = 'none';
    void countEl.offsetWidth;
    countEl.style.animation = '';
    sfx.tone(n > 0 ? 440 : 880, n > 0 ? 440 : 880, n > 0 ? 0.18 : 0.5, 'square', 0.07);
    sfx.say(n > 0 ? String(n) : 'Fight!');
    if (n === 0) music.drop();
    if (n === 0) introTimer = setTimeout(clearIntro, 800);
  }

  $('#skip').onclick = () => {
    while (!s.over) battle.step();
    s.events.length = 0;
    intro = -1;
    countdown = 0;
    sfx.hush();
    music.drop();
    clearIntro();
  };

  clearIntro();
  music.menu();
  const line = battle.teams.length > 4 ? `Welcome to Robocracy! ${s.bots.length} robots enter, one leaves. Robots, power up!`
    : `Welcome to Robocracy! ${battle.teams.map((t) => t.name).join(' versus ')}. Robots, power up!`;
  $('#say').textContent = line;
  announcer.hidden = false;
  sfx.tone(330, 990, 0.35, 'triangle', 0.08);
  let talking = sfx.say(line, () => (talking = false));

  // intro counts up while the announcer talks (capped in case speech never reports back), then 3 2 1
  let intro = 0, countdown = 3, acc = 0, afterOver = 0, shown = false, last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (intro >= 0) {
      intro += dt;
      if (intro > 2.5 && (!talking || intro > 8)) {
        intro = -1;
        call(3);
      }
    } else if (countdown > 0) {
      const before = Math.ceil(countdown);
      countdown -= dt;
      const n = Math.ceil(countdown);
      if (n !== before) call(n);
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
  raf = requestAnimationFrame(loop);
}

function backToSetup() {
  cancelAnimationFrame(raf);
  clearTimeout(introTimer);
  sfx.hush();
  music.menu();
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
    if (sfx.muted) sfx.hush();
    music.mute(sfx.muted);
    b.textContent = sfx.muted ? '🔇' : '🔊';
  } else if (b.id === 'quit') backToSetup();
});

music.load('assets/theme.mp3').catch(() => {});
lobby = initLobby({ setup, runBattle, renderSetup, mount: $('#lobby') });
renderSetup();
