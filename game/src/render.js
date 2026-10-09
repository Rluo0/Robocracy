// Canvas renderer. Purely cosmetic: it reads battle state and drains
// battle.state.events for particles, so Math.random is fine in here.
import { TILE, COLS, ROWS, W, H, EMPTY, WALL, CRATE, BARREL, STEEL, TILE_HP, POWERUPS, layerOf } from './sim.js';

const TAU = Math.PI * 2;
const DEBRIS = { [WALL]: '#8b93a7', [CRATE]: '#c08a4a', [BARREL]: '#e2553f' };
const SHOT = { blaster: '#fde047', scatter: '#fdba74', rocket: '#f87171' };

export const EYES = {
  mono: { label: 'Cyclops' }, twin: { label: 'Twin' }, visor: { label: 'Visor' }, angry: { label: 'Angry' }, googly: { label: 'Googly' },
};
export const HATS = {
  none: { label: 'None' }, antenna: { label: 'Antenna' }, mohawk: { label: 'Mohawk' }, crown: { label: 'Crown' },
  horns: { label: 'Horns' }, propeller: { label: 'Propeller' }, tophat: { label: 'Top hat' },
};
export const PATTERNS = {
  plain: { label: 'Plain' }, stripes: { label: 'Stripes' }, hazard: { label: 'Hazard' }, spots: { label: 'Spots' }, split: { label: 'Split' },
};
const known = (cat, k) => (cat[k] ? k : Object.keys(cat)[0]);

function bodyPath(ctx, chassis, r) {
  ctx.beginPath();
  if (chassis === 'tank') ctx.rect(-r * 0.85, -r * 0.72, r * 1.7, r * 1.44);
  else if (chassis === 'scout') {
    ctx.moveTo(r * 1.1, 0);
    ctx.lineTo(-r * 0.85, r * 0.9);
    ctx.lineTo(-r * 0.4, 0);
    ctx.lineTo(-r * 0.85, -r * 0.9);
    ctx.closePath();
  } else {
    for (let i = 0; i < 6; i++) ctx.lineTo(Math.cos((i / 6) * TAU) * r, Math.sin((i / 6) * TAU) * r);
    ctx.closePath();
  }
}

function drawPattern(ctx, kind, r, color) {
  ctx.fillStyle = color;
  if (kind === 'stripes') {
    for (const s of [-1, 1]) ctx.fillRect(-r * 1.2, s * r * 0.32 - r * 0.08, r * 2.4, r * 0.16);
  } else if (kind === 'hazard') {
    ctx.rotate(Math.PI / 4);
    for (let k = -4; k <= 3; k++) ctx.fillRect(k * r * 0.5, -r * 2, r * 0.25, r * 4);
  } else if (kind === 'spots') {
    for (const [px, py, pr] of [[0.45, -0.4, 0.2], [0.5, 0.42, 0.16], [-0.3, -0.45, 0.17], [-0.35, 0.4, 0.21], [-0.75, 0, 0.13]]) {
      ctx.beginPath();
      ctx.arc(px * r, py * r, pr * r, 0, TAU);
      ctx.fill();
    }
  } else if (kind === 'split') ctx.fillRect(-r * 1.2, 0, r * 2.4, r * 1.2);
}

function drawEyes(ctx, kind, r, time) {
  const eye = (x, y, er) => {
    ctx.beginPath();
    ctx.arc(x, y, er, 0, TAU);
    ctx.fillStyle = '#0b0d12';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + er * 0.3, y, er * 0.48, 0, TAU);
    ctx.fillStyle = '#fff';
    ctx.fill();
  };
  if (kind === 'twin' || kind === 'angry') {
    eye(r * 0.12, -r * 0.3, r * 0.23);
    eye(r * 0.12, r * 0.3, r * 0.23);
    if (kind === 'angry') {
      ctx.strokeStyle = '#0b0d12';
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const s of [-1, 1]) {
        ctx.moveTo(r * -0.2, s * r * 0.62);
        ctx.lineTo(r * 0.32, s * r * 0.12);
      }
      ctx.stroke();
    }
  } else if (kind === 'visor') {
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(r * 0.02, -r * 0.5, r * 0.4, r);
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(r * 0.1, -r * 0.42, r * 0.24, r * 0.84);
    ctx.fillStyle = '#a5f3fc';
    ctx.fillRect(r * 0.1, -r * 0.42, r * 0.08, r * 0.84);
  } else if (kind === 'googly') {
    for (const [i, s] of [-1, 1].entries()) {
      const ex = r * 0.14, ey = s * r * 0.32, er = r * 0.28;
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.strokeStyle = '#0b0d12';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ex + Math.cos(time * 9 + i * 2.1) * er * 0.38, ey + Math.sin(time * 11 + i * 1.3) * er * 0.38, er * 0.38, 0, TAU);
      ctx.fillStyle = '#0b0d12';
      ctx.fill();
    }
  } else eye(0, 0, r * 0.34);
}

function drawHat(ctx, kind, r, time) {
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.strokeStyle = '#0b0d12';
  if (kind === 'antenna') {
    const bx = -r * 0.95 - Math.sin(time * 3) * r * 0.12, by = Math.cos(time * 2.3) * r * 0.1;
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, 0);
    ctx.lineTo(bx, by);
    ctx.strokeStyle = '#9aa3b8';
    ctx.stroke();
    ctx.globalAlpha = 0.35 + 0.2 * Math.sin(time * 6);
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(bx, by, r * 0.3, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(bx, by, r * 0.17, 0, TAU);
    ctx.fill();
  } else if (kind === 'mohawk') {
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, -r * 0.1);
    for (let i = 0; i < 5; i++) {
      ctx.lineTo(-r * (0.38 + i * 0.13), -r * 0.3);
      ctx.lineTo(-r * (0.44 + i * 0.13), -r * 0.1);
    }
    for (let i = 4; i >= 0; i--) {
      ctx.lineTo(-r * (0.44 + i * 0.13), r * 0.1);
      ctx.lineTo(-r * (0.38 + i * 0.13), r * 0.3);
    }
    ctx.lineTo(-r * 0.3, r * 0.1);
    ctx.closePath();
    ctx.fillStyle = '#f472b6';
    ctx.fill();
    ctx.stroke();
  } else if (kind === 'crown') {
    ctx.fillStyle = '#facc15';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      ctx.beginPath();
      ctx.arc(-r * 0.55 + Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36, r * 0.14, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(-r * 0.55, 0, r * 0.36, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-r * 0.55, 0, r * 0.14, 0, TAU);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
  } else if (kind === 'horns') {
    ctx.fillStyle = '#f1e7d0';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.05, s * r * 0.55);
      ctx.quadraticCurveTo(-r * 0.2, s * r * 1.25, -r * 0.8, s * r * 1.2);
      ctx.quadraticCurveTo(-r * 0.45, s * r * 0.95, -r * 0.4, s * r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (kind === 'propeller') {
    ctx.save();
    ctx.translate(-r * 0.55, 0);
    ctx.rotate(time * 18);
    ctx.fillStyle = '#e5e7eb';
    for (let i = 0; i < 2; i++) {
      ctx.rotate(Math.PI);
      ctx.beginPath();
      ctx.ellipse(r * 0.3, 0, r * 0.3, r * 0.11, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.1, 0, TAU);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.restore();
  } else if (kind === 'tophat') {
    ctx.beginPath();
    ctx.arc(-r * 0.55, 0, r * 0.42, 0, TAU);
    ctx.fillStyle = '#1b1d27';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-r * 0.55, 0, r * 0.26, 0, TAU);
    ctx.fillStyle = '#2a2e3b';
    ctx.fill();
    ctx.strokeStyle = '#ef4444';
    ctx.stroke();
  }
}

// Shared with the setup screen and garage so previews match what fights.
// b: { color, teamColor, chassis, weapon, eyes?, hat?, pattern?, accent? }
export function drawRobot(ctx, x, y, r, angle, b, time = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.arc(0, 0, r + 3.5, 0, TAU);
  ctx.strokeStyle = b.teamColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.strokeStyle = '#0b0d12';
  ctx.lineWidth = 1.5;
  if (b.chassis === 'tank') {
    ctx.fillStyle = '#1f2430';
    ctx.fillRect(-r, -r, r * 2, r * 0.5);
    ctx.fillRect(-r, r * 0.5, r * 2, r * 0.5);
  }
  bodyPath(ctx, b.chassis, r);
  ctx.fillStyle = b.color;
  ctx.fill();
  const pattern = known(PATTERNS, b.pattern);
  if (pattern !== 'plain') {
    ctx.save();
    ctx.clip();
    drawPattern(ctx, pattern, r, b.accent || '#0b0d12');
    ctx.restore();
  }
  ctx.stroke();

  ctx.fillStyle = '#d5dae6';
  if (b.weapon === 'blaster') ctx.fillRect(r * 0.2, -2, r * 1.1, 4);
  else if (b.weapon === 'scatter') ctx.fillRect(r * 0.2, -4.5, r * 0.85, 9);
  else if (b.weapon === 'rocket') {
    ctx.fillRect(r * 0.1, -6.5, r * 0.95, 5);
    ctx.fillRect(r * 0.1, 1.5, r * 0.95, 5);
  } else if (b.weapon === 'rail') {
    ctx.fillRect(r * 0.1, -2.5, r * 1.6, 5);
    ctx.fillStyle = '#67e8f9';
    ctx.fillRect(r * 0.3, -1, r * 1.4, 2);
  } else if (b.weapon === 'saw') {
    const sr = r * 0.62;
    ctx.translate(r + 2, 0);
    ctx.rotate(time * 25);
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const rr = i % 2 ? sr : sr * 0.68;
      ctx.lineTo(Math.cos((i / 16) * TAU) * rr, Math.sin((i / 16) * TAU) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.rotate(-time * 25);
    ctx.translate(-r - 2, 0);
  }

  drawHat(ctx, known(HATS, b.hat), r, time);
  drawEyes(ctx, known(EYES, b.eyes), r, time);
  ctx.restore();
}

export function createRenderer(canvas, battle, { onEvent } = {}) {
  const s = battle.state;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Persistent layer for scorch marks, rubble and wrecks.
  const ground = document.createElement('canvas');
  ground.width = W;
  ground.height = H;
  const g = ground.getContext('2d');
  g.fillStyle = '#151821';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.035)';
  g.beginPath();
  for (let x = 0; x <= W; x += TILE) { g.moveTo(x, 0); g.lineTo(x, H); }
  for (let y = 0; y <= H; y += TILE) { g.moveTo(0, y); g.lineTo(W, y); }
  g.stroke();

  let time = 0, shake = 0, banner = null;
  const particles = [], rings = [], beams = [], floaters = [];
  const bubbles = [], BUBBLE_LIFE = 1.8;

  function say(id) {
    const b = s.bots[id];
    if (!b || !b.alive || !b.cry) return;
    const old = bubbles.findIndex((x) => x.id === id);
    if (old >= 0) bubbles.splice(old, 1);
    while (bubbles.length >= 4) bubbles.shift();
    bubbles.push({ id, life: BUBBLE_LIFE });
  }
  // One random talker per team just after FIGHT (sim time, so not during the countdown), staggered.
  const intro = battle.teams
    .map((t) => {
      const talkers = s.bots.filter((b) => b.team === t.id && b.cry);
      return talkers.length ? talkers[Math.floor(Math.random() * talkers.length)].id : -1;
    })
    .filter((id) => id >= 0)
    .map((id, i) => ({ id, at: 0.4 + i * 0.35 + Math.random() * 0.2 }));

  function burst(x, y, n, color, speed, size = 3, life = 0.6) {
    for (let i = 0; i < n && particles.length < 900; i++) {
      const a = Math.random() * TAU, v = speed * (0.3 + Math.random() * 0.7);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.5 + Math.random() * 0.5), max: life, size: size * (0.5 + Math.random()), color });
    }
  }
  const ring = (x, y, r, color, life = 0.35) => rings.push({ x, y, r, color, life, max: life });
  function floater(x, y, text, color, size = 11) {
    if (floaters.length < 60) floaters.push({ x: x + (Math.random() - 0.5) * 14, y, text, color, size, life: 0.9 });
  }
  function scorch(x, y, r, alpha) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(0,0,0,${alpha})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function on(e) {
    switch (e.type) {
      case 'boom':
        burst(e.x, e.y, Math.min(28, e.r / 2.2), '#fb923c', e.r * 4, 4, 0.5);
        burst(e.x, e.y, Math.min(14, e.r / 4), '#fef08a', e.r * 2.5, 3, 0.35);
        burst(e.x, e.y, 6, '#57534e', e.r * 1.5, 6, 0.9);
        ring(e.x, e.y, e.r, '#fed7aa');
        scorch(e.x, e.y, e.r * 0.9, 0.4);
        shake = Math.max(shake, e.r / 6);
        break;
      case 'tilehit': burst(e.x, e.y, 2, DEBRIS[e.tile], 70, 2, 0.3); break;
      case 'tilebreak':
        burst(e.x, e.y, 7, DEBRIS[e.tile], 130, 3.5, 0.6);
        g.fillStyle = 'rgba(0,0,0,0.22)';
        for (let i = 0; i < 4; i++) g.fillRect(e.x - 10 + Math.random() * 18, e.y - 10 + Math.random() * 18, 3, 3);
        break;
      case 'hit':
        if (e.amt >= 5) floater(e.x, e.y - 14, Math.round(e.amt) + (e.crit ? '!' : ''), e.crit ? '#fde047' : '#fff', e.crit ? 15 : 11);
        burst(e.x, e.y, 2, '#fff', 90, 2, 0.25);
        break;
      case 'block': ring(e.x, e.y, 20, '#38bdf8', 0.2); break;
      case 'death': {
        const b = s.bots[e.id];
        burst(e.x, e.y, 34, b.color, 260, 4.5, 0.9);
        burst(e.x, e.y, 12, '#e5e7eb', 180, 3, 0.7);
        g.fillStyle = 'rgba(10,10,14,0.8)';
        g.beginPath();
        g.arc(e.x, e.y, b.baseR, 0, TAU);
        g.fill();
        g.strokeStyle = b.color;
        g.globalAlpha = 0.5;
        g.stroke();
        g.globalAlpha = 1;
        shake = Math.max(shake, 9);
        if (e.killer >= 0) say(e.killer);
        break;
      }
      case 'pickup': {
        const p = POWERUPS[e.power];
        floater(e.x, e.y - 20, `${p.icon} ${p.label}`, p.color, 13);
        ring(e.x, e.y, 34, p.color, 0.45);
        break;
      }
      case 'beam': beams.push({ ...e, life: 0.28 }); break;
      case 'fire': burst(e.x, e.y, 1, '#fef9c3', 30, 4, 0.08); break;
      case 'land': ring(e.x, e.y, 16, '#e5e7eb', 0.25); break;
      case 'shuffle':
        for (const p of e.pts) { ring(p.x, p.y, 30, '#c084fc', 0.5); burst(p.x, p.y, 8, '#c084fc', 120, 3, 0.5); }
        break;
      case 'quake': shake = Math.max(shake, 16); break;
      case 'lava': shake = Math.max(shake, 5); break;
      case 'banner': banner = { text: e.text, life: 2.2 }; break;
    }
    onEvent?.(e);
  }

  function drawTiles() {
    for (let cy = 0; cy < ROWS; cy++)
      for (let cx = 0; cx < COLS; cx++) {
        const i = cy * COLS + cx, type = s.tiles[i];
        if (type === EMPTY) continue;
        const x = cx * TILE, y = cy * TILE;
        if (type === STEEL) {
          ctx.fillStyle = '#2b303c';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = '#3a4050';
          ctx.fillRect(x + 2, y + 2, TILE - 4, 3);
        } else if (type === WALL) {
          ctx.fillStyle = '#5b6478';
          ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
          ctx.fillStyle = '#7a849b';
          ctx.fillRect(x + 1, y + 1, TILE - 2, 4);
        } else if (type === CRATE) {
          ctx.fillStyle = '#a8763e';
          ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
          ctx.strokeStyle = '#6b4722';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + TILE - 4, y + TILE - 4);
          ctx.moveTo(x + TILE - 4, y + 4); ctx.lineTo(x + 4, y + TILE - 4);
          ctx.stroke();
          ctx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);
        } else if (type === BARREL) {
          ctx.fillStyle = '#d8432f';
          ctx.beginPath();
          ctx.arc(x + TILE / 2, y + TILE / 2, TILE / 2 - 3, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#fde047';
          ctx.fillRect(x + 6, y + TILE / 2 - 2, TILE - 12, 4);
        }
        const wear = 1 - s.tileHp[i] / TILE_HP[type];
        if (wear > 0.05) {
          ctx.fillStyle = `rgba(0,0,0,${wear * 0.55})`;
          ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
        }
      }
  }

  function drawLava() {
    if (!s.sudden) return;
    const inset = s.lava * TILE;
    ctx.beginPath();
    ctx.rect(TILE, TILE, W - TILE * 2, H - TILE * 2);
    ctx.rect(inset, inset, W - inset * 2, H - inset * 2);
    ctx.fillStyle = `rgba(255,${80 + Math.sin(time * 5) * 25},20,0.6)`;
    ctx.fill('evenodd');
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2;
    ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
    // The next ring to go flashes as a warning.
    ctx.strokeStyle = `rgba(248,113,113,${0.3 + 0.3 * Math.sin(time * 10)})`;
    ctx.strokeRect(inset + TILE, inset + TILE, W - (inset + TILE) * 2, H - (inset + TILE) * 2);
    for (const b of s.bots)
      if (b.alive && layerOf((b.x / TILE) | 0, (b.y / TILE) | 0) < s.lava && Math.random() < 0.4) burst(b.x, b.y, 1, '#fb923c', 60, 4, 0.4);
  }

  function drawPowerups(falling) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of s.powerups) {
      if (p.fall > 0 !== falling) continue;
      const info = POWERUPS[p.type];
      const lift = Math.max(0, p.fall) * 260, bob = falling ? 0 : Math.sin(time * 4 + p.x) * 2;
      if (falling) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 10, 5, 0, 0, TAU);
        ctx.fill();
      } else if (p.life < 3 && Math.sin(time * 18) > 0) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y - lift + bob, 10, 0, TAU);
      ctx.fillStyle = '#0b0d12';
      ctx.fill();
      ctx.strokeStyle = info.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(info.icon, p.x, p.y - lift + bob + 1);
    }
  }

  function drawMeteors() {
    for (const m of s.meteors) {
      const k = 1 - m.t / m.T;
      ctx.strokeStyle = `rgba(248,113,113,${0.4 + 0.4 * Math.sin(time * 20)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(248,113,113,0.12)';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r * k, 0, TAU);
      ctx.fill();
      const mx = m.x + m.t * 220, my = m.y - m.t * 520;
      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(mx + 14, my - 34);
      ctx.lineTo(mx, my);
      ctx.stroke();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(mx, my, 6, 0, TAU);
      ctx.fill();
    }
  }

  function drawBots() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (const b of s.bots) {
      if (!b.alive) continue;
      const r = b.baseR * (b.fx.giant > 0 ? 1.6 : 1);
      drawRobot(ctx, b.x, b.y, r, b.angle, b, time);
      if (b.fx.shield > 0) {
        ctx.strokeStyle = '#38bdf8';
        ctx.fillStyle = 'rgba(56,189,248,0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r + 7, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
      if (b.fx.overdrive > 0 && Math.random() < 0.5) burst(b.x, b.y, 1, '#facc15', 90, 2, 0.3);
      if (b.fx.haste > 0 && Math.random() < 0.5) burst(b.x, b.y, 1, '#f0abfc', 20, 3, 0.35);

      const top = b.y - r - 9;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(b.x - 15, top, 30, 4);
      ctx.fillStyle = b.teamColor;
      ctx.fillRect(b.x - 15, top, 30 * Math.max(0, b.hp / b.maxHp), 4);
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(b.name, b.x, top - 4);
      ctx.fillStyle = '#f3f4f6';
      ctx.fillText(b.name, b.x, top - 4);
    }
  }

  function drawShots() {
    for (const p of s.shots) {
      ctx.strokeStyle = SHOT[p.kind] || '#fff';
      ctx.lineWidth = p.kind === 'rocket' ? 4 : p.crit ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      if (p.kind === 'rocket' && Math.random() < 0.6) burst(p.x, p.y, 1, '#9ca3af', 15, 3, 0.35);
    }
  }

  function frame(dt) {
    time += dt;
    for (const e of s.events.splice(0)) on(e);
    while (intro.length && s.t >= intro[0].at) say(intro.shift().id);

    shake *= Math.pow(0.002, dt);
    ctx.save();
    if (shake > 0.3) ctx.translate((Math.random() - 0.5) * shake * 2, (Math.random() - 0.5) * shake * 2);
    ctx.drawImage(ground, 0, 0);
    drawLava();
    drawTiles();
    drawPowerups(false);
    drawBots();
    drawShots();

    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      if ((b.life -= dt) <= 0) { beams.splice(i, 1); continue; }
      const k = b.life / 0.28;
      ctx.globalAlpha = k;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 7 * k;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 * k;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if ((p.life -= dt) <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      ctx.globalAlpha = Math.min(1, (p.life / p.max) * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      if ((r.life -= dt) <= 0) { rings.splice(i, 1); continue; }
      const k = r.life / r.max;
      ctx.globalAlpha = k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (1 - k * 0.7), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    drawMeteors();
    drawPowerups(true);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      if ((f.life -= dt) <= 0) { floaters.splice(i, 1); continue; }
      f.y -= 28 * dt;
      ctx.globalAlpha = Math.min(1, f.life * 2.5);
      ctx.font = `700 ${f.size}px system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const m = bubbles[i], b = s.bots[m.id];
      if ((m.life -= dt) <= 0 || !b.alive) { bubbles.splice(i, 1); continue; }
      const cry = b.cry.slice(0, 40), w = ctx.measureText(cry).width + 12, h = 17;
      const bx = Math.max(4, Math.min(W - 4 - w, b.x - w / 2));
      const by = Math.max(4, b.y - b.baseR * (b.fx.giant > 0 ? 1.6 : 1) - 9 - 4 - 14 - h);
      ctx.globalAlpha = Math.min(1, m.life * 2.5);
      ctx.fillStyle = 'rgba(11,13,18,0.92)';
      ctx.strokeStyle = b.teamColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(bx, by, w, h, 6);
      ctx.moveTo(b.x - 4, by + h);
      ctx.lineTo(b.x, by + h + 4);
      ctx.lineTo(b.x + 4, by + h);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f3f4f6';
      ctx.fillText(cry, bx + w / 2, by + h / 2 + 0.5);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (banner && (banner.life -= dt) > 0) {
      const k = Math.min(1, banner.life * 2, (2.2 - banner.life) * 6);
      ctx.globalAlpha = k;
      ctx.font = `900 ${44 + (1 - k) * 20}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#0b0d12';
      ctx.strokeText(banner.text, W / 2, 96);
      ctx.fillStyle = '#fde047';
      ctx.fillText(banner.text, W / 2, 96);
      ctx.globalAlpha = 1;
    }
  }

  return { frame };
}
