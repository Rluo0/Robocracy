// Demo shell: argument setup -> battle -> verdict. The website can replace
// this file and feed createBattle() its own teams and robots.
import { CHASSIS, WEAPONS } from './sim.js';
import { drawRobot, EYES, HATS, PATTERNS } from './render.js';
import { music } from './audio.js';
import { runBattle as playBattle, stopBattle, esc } from './battle.js';
import { PALETTE, CRIES, LIM, HEX, BLURBS, pick, text, randomName, randomRobot, reroll, sanitizeRobot } from './robot.js';
import { initLobby } from './lobby.js';

const $ = (sel) => document.querySelector(sel);
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
const setupEl = $('#setup');

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
function runBattle(config, hooks = {}) {
  setupEl.hidden = true;
  const opts = {
    title: setup.question || 'The argument',
    hooks,
    onQuit: backToSetup,
    actions: [
      { label: 'Rematch', primary: true, run: () => runBattle({ ...config, seed: (setup.seed = newSeed()) }, hooks) },
      { label: 'Watch replay', run: () => runBattle(config, hooks) },
      { label: 'Edit robots', run: backToSetup },
    ],
  };
  playBattle(config, opts);
}

function backToSetup() {
  stopBattle();
  setupEl.hidden = false;
  renderSetup();
}

music.load('assets/theme.mp3').catch(() => {});
lobby = initLobby({ setup, runBattle, renderSetup, mount: $('#lobby') });
renderSetup();
