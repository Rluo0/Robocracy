// Phone page: scan the QR, build a robot, send it to the host's lobby.
import { openRoom, ROOM_RE } from './net.js';
import { drawRobot, EYES, HATS, PATTERNS } from './render.js';
import { CHASSIS, WEAPONS } from './sim.js';
import { PALETTE, CRIES, LIM, HEX, BLURBS, pick, text, num, randomName, randomRobot, reroll, sanitizeRobot } from './robot.js';

const $ = (sel) => document.querySelector(sel);
const esc = (v) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const PLAYER = 'robocracy.player', DRAFT = 'robocracy.draft';
const store = (k, v) => {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v);
  } catch {}
  return null;
};

const code = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
const viewEl = $('#view');

let pid = store(PLAYER);
if (!/^[a-z0-9]{8,32}$/.test(pid || '')) {
  pid = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => (b % 36).toString(36)).join('');
  store(PLAYER, pid);
}

let room = null, meta = null, entries = {}, result = null, mine = null, error = '';
let ready = 0, editing = false, note = '', prevState = null, view = '', shown = '', busy = false;

function loadDraft() {
  try {
    const raw = JSON.parse(store(DRAFT)), r = sanitizeRobot(raw);
    if (r) return { ...r, option: Number.isInteger(raw.option) ? raw.option : -1 };
  } catch {}
  return { ...randomRobot(pick(PALETTE)), option: -1 };
}
let draft = loadDraft();
const saveDraft = () => store(DRAFT, JSON.stringify(draft));

const ffa = () => meta?.ffa === true;
const opts = () => (Array.isArray(meta?.options) ? meta.options.slice(0, 6).map((o) => ({ name: text(o?.name, LIM.opt), color: HEX.test(o?.color) ? o.color : '#8b93a7' })) : []);
const maxBots = () => num(meta?.max) || 48;
const teamColor = (r) => (ffa() ? r.color : opts()[r.option]?.color || r.color);

function viewName() {
  if (!ROOM_RE.test(code)) return 'code';
  if (error) return 'error';
  if (ready < 3) return 'loading';
  if (!meta || typeof meta !== 'object') return 'notfound';
  if (meta.state === 'closed') return 'closed';
  if (meta.state === 'battle') return 'battle';
  if (meta.state === 'done') return 'done';
  if (mine && !editing) return 'submitted';
  if (!mine && Object.keys(entries).length >= maxBots()) return 'full';
  return 'builder';
}

const chips = (f, map, sel) => `<div class="chips">${Object.entries(map).map(([k, v]) =>
  `<button type="button" class="chip${k === sel ? ' on' : ''}" data-chip="${f}" data-v="${k}">${v.label}</button>`).join('')}</div>`;

const stage = (r) => `
  <div class="stage">
    <canvas id="cv" width="400" height="400"></canvas>
    <div class="g-name" data-g="name">${esc(r.name || 'Unnamed')}</div>
    <div class="dim" data-g="owner">${r.owner ? `built by ${esc(r.owner)}` : ''}</div>
    <div class="g-cry" data-g="cry">${r.cry ? `“${esc(r.cry)}”` : ''}</div>
  </div>`;

function builderHtml() {
  const r = draft, o = opts();
  return `
    <div class="q">${esc(text(meta.question, LIM.question))}</div>
    <div class="note err" id="note"${note ? '' : ' hidden'}>${esc(note)}</div>
    ${stage(r)}
    <div class="g-fields">
      ${ffa() ? '' : `<div class="g-field"><span>Pick your side</span><div class="chips">${o.map((x, i) =>
        `<button type="button" class="chip side${i === r.option ? ' on' : ''}" style="--c:${esc(x.color)}" data-side="${i}">${esc(x.name)}</button>`).join('')}</div></div>`}
      <div class="g-field"><span>Robot name</span><div class="row">
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
      <div class="g-field"><span>Chassis</span>${chips('chassis', CHASSIS, r.chassis)}<div class="blurb" data-blurb="chassis">${esc(BLURBS[r.chassis] || '')}</div></div>
      <div class="g-field"><span>Weapon</span>${chips('weapon', WEAPONS, r.weapon)}<div class="blurb" data-blurb="weapon">${esc(BLURBS[r.weapon] || '')}</div></div>
      <div class="g-field"><span>Eyes</span>${chips('eyes', EYES, r.eyes)}</div>
      <div class="g-field"><span>Topper</span>${chips('hat', HATS, r.hat)}</div>
      <div class="g-field"><span>Pattern</span>${chips('pattern', PATTERNS, r.pattern)}</div>
    </div>
    <button type="button" data-act="surprise">🎲 Surprise me</button>
    <button type="button" class="primary big" data-act="submit">${mine ? 'Update my robot' : 'Send my robot to battle'}</button>`;
}

function html(v) {
  const sideOf = (r) => (ffa() ? '' : opts()[r.option] ? `<div class="dim">Fighting for <b style="color:${esc(opts()[r.option].color)}">${esc(opts()[r.option].name)}</b></div>` : '');
  if (v === 'code') return `
    <div class="center">
      <div class="q">Type the 4-letter code from the big screen</div>
      <input type="text" class="code" id="codein" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD">
      <button type="button" class="primary big" data-act="join">Join</button>
    </div>`;
  if (v === 'error') return `<div class="note err">${esc(error)}</div>`;
  if (v === 'loading') return '<div class="center dim">Connecting…</div>';
  if (v === 'closed') return '<div class="note err">This room is closed. Check the big screen for a new code.</div>';
  if (v === 'notfound') return '<div class="note err">Room not found. Check the code on the big screen.</div>';
  if (v === 'full') return '<div class="center"><div class="big-msg">The arena is full</div><div class="dim">Too many robots already joined this battle.</div></div>';
  if (v === 'builder') return builderHtml();
  if (v === 'submitted') return `
    <div class="center"><div class="big-msg">You're in!</div><div>Watch the big screen.</div></div>
    ${stage(mine)}${sideOf(mine)}
    <button type="button" data-act="edit">Edit my robot</button>`;
  if (v === 'battle') return `
    <div class="center"><div class="big-msg">Battle in progress</div><div>Eyes on the big screen!</div></div>
    ${mine ? stage(mine) : ''}`;
  const res = result && typeof result === 'object' ? result : null, pl = res?.places && typeof res.places === 'object' ? res.places : null;
  const n = pl && Object.hasOwn(pl, pid) ? Math.floor(num(pl[pid])) : 0;
  const total = Math.floor(num(res?.total));
  const winner = text(res?.winner, 40), side = !ffa() && mine ? opts()[mine.option] : null;
  return `
    <div class="center">
      ${res ? `<div class="dim">Winner</div><div class="big-msg">🏆 ${esc(winner)}</div>` : '<div class="big-msg">The battle is over</div>'}
      ${side && res && side.name === winner ? '<div class="big-msg">🏆 Your side won!</div>' : ''}
      ${n > 0 ? (n === 1 && ffa() ? '<div class="big-msg">🏆 Your robot won it all!</div>' : `<div>Your robot finished #${n} of ${total}</div>`) : ''}
    </div>
    ${mine ? stage(mine) : ''}`;
}

function render() {
  view = viewName();
  const key = JSON.stringify([view, view === 'builder' ? [ffa(), opts(), !!mine, text(meta.question, LIM.question)] : [mine, ffa() && 0, opts(), view === 'done' ? result : 0]]);
  if (key === shown) return;
  shown = key;
  viewEl.innerHTML = html(view);
}

function change() {
  const e = entries[pid], prevMine = mine;
  const r = e && sanitizeRobot(e);
  mine = r ? { ...r, option: Number.isInteger(e.option) && e.option >= 0 ? e.option : 0, at: num(e.at) } : null;
  if (ready >= 3) {
    const st = meta?.state;
    if (st === 'open' && prevState && prevState !== 'open') {
      editing = !!mine;
      if (mine) draft = { ...mine };
    } else if (view === 'submitted' && !mine && prevMine && st !== 'battle' && st !== 'done') {
      editing = true;
      note = 'The host removed your robot. Try again.';
    }
    prevState = st;
  }
  render();
}

function refreshStage() {
  const set = (k, v) => {
    const el = viewEl.querySelector(`[data-g="${k}"]`);
    if (el) el.textContent = v;
  };
  set('name', draft.name || 'Unnamed');
  set('owner', draft.owner ? `built by ${draft.owner}` : '');
  set('cry', draft.cry ? `“${draft.cry}”` : '');
  for (const k of ['chassis', 'weapon']) {
    const el = viewEl.querySelector(`[data-blurb="${k}"]`);
    if (el) el.textContent = BLURBS[draft[k]] || '';
  }
}

function showNote(msg) {
  note = msg;
  const el = $('#note');
  if (!el) return;
  el.textContent = msg;
  el.hidden = !msg;
}

async function submit(btn) {
  if (busy) return;
  const o = opts();
  if (!ffa() && !(draft.option >= 0 && draft.option < o.length)) return showNote('Pick your side first.');
  if (!mine && Object.keys(entries).length >= maxBots()) return render();
  const r = sanitizeRobot(draft);
  r.name = r.name.trim() || 'Unnamed';
  r.owner = r.owner.trim();
  r.cry = r.cry.trim();
  const entry = { ...r, option: ffa() ? 0 : draft.option, at: mine?.at || room.serverTime() };
  busy = btn.disabled = true;
  note = '';
  editing = false;
  let slow = false;
  try {
    const p = room.set(`entries/${pid}`, entry);
    // Firebase queues writes while offline and never settles; a late success still lands via the watcher.
    p.then(() => {
      if (!slow) return;
      editing = false;
      note = '';
      change();
    }, () => {});
    await Promise.race([p, new Promise((res) => setTimeout(() => res((slow = true)), 8000))]);
    if (slow) {
      editing = true;
      render();
      showNote("Couldn't reach the arena. Check your connection and try again.");
    }
  } catch (err) {
    editing = true;
    render();
    showNote(`Could not send: ${err?.message || err}`);
  }
  busy = false;
  if (btn.isConnected) btn.disabled = false;
}

viewEl.addEventListener('input', (e) => {
  const f = e.target.dataset.f;
  if (!f || view !== 'builder') return;
  draft[f] = e.target.value;
  refreshStage();
  saveDraft();
});

viewEl.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-chip]'), side = e.target.closest('[data-side]'), btn = e.target.closest('[data-act]');
  const fill = (f) => (viewEl.querySelector(`input[data-f="${f}"]`).value = draft[f]);
  if (chip && view === 'builder') {
    draft[chip.dataset.chip] = chip.dataset.v;
    for (const c of chip.parentElement.children) c.classList.toggle('on', c === chip);
    refreshStage();
  } else if (side && view === 'builder') {
    draft.option = Number(side.dataset.side);
    for (const c of side.parentElement.children) c.classList.toggle('on', c === side);
    showNote('');
  } else if (btn) {
    const act = btn.dataset.act;
    if (act === 'join') {
      const c = ($('#codein').value || '').trim().toUpperCase();
      if (ROOM_RE.test(c)) location.search = `?room=${c}`;
      else $('#codein').focus();
    } else if (act === 'edit') {
      editing = true;
      draft = { ...mine };
      render();
    } else if (view === 'builder') {
      if (act === 'gname') {
        draft.name = randomName();
        fill('name');
        refreshStage();
      } else if (act === 'gcry') {
        draft.cry = pick(CRIES);
        fill('cry');
        refreshStage();
      } else if (act === 'surprise') {
        draft = { ...reroll(draft), option: draft.option };
        shown = '';
        render();
      } else if (act === 'submit') return submit(btn).then(saveDraft);
    }
  }
  if (view === 'builder') saveDraft();
});

$('#view').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'codein') viewEl.querySelector('[data-act="join"]').click();
});

function loop(now) {
  const cv = $('#cv'), r = view === 'builder' ? draft : mine;
  if (cv && r && CHASSIS[r.chassis]) {
    const ctx = cv.getContext('2d'), t = now / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 400, 400);
    ctx.scale(3, 3);
    const tc = view === 'builder' ? (!ffa() && opts()[r.option]?.color) || r.color : teamColor(r);
    drawRobot(ctx, 400 / 6, 400 / 6, CHASSIS[r.chassis].r * 2.8, Math.sin(t * 1.3) * 0.35, { ...r, teamColor: tc }, t);
  }
  requestAnimationFrame(loop);
}

async function init() {
  render();
  requestAnimationFrame(loop);
  if (!ROOM_RE.test(code)) return;
  try {
    room = await openRoom(code);
  } catch (err) {
    error = err?.message || String(err);
    return render();
  }
  if (room.mode === 'local') $('#foot').textContent = 'local test mode';
  let n = 0;
  const once = (set) => {
    let first = true;
    return (v) => {
      try {
        set(v);
      } catch {}
      if (first) {
        first = false;
        n++;
      }
      ready = n;
      try {
        change();
      } catch (err) {
        console.warn('Bad room data:', err);
        shown = '';
        viewEl.textContent = 'Something is wrong with this room. Check the big screen.';
      }
    };
  };
  room.watch('meta', once((v) => (meta = v)));
  room.watch('entries', once((v) => (entries = v && typeof v === 'object' ? v : {})));
  room.watch('result', once((v) => (result = v)));
}

init();
