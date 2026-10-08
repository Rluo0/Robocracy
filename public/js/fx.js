// Shared visual chaos: robot avatars, cursor-tracking eyes, shakes, sparks and slam text.
window.RR = window.RR || {};

(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ROBOT_COLORS = ['#ff4f7b', '#ffd23f', '#3ee6a8', '#4fb0ff', '#c084fc', '#ff8a3d', '#a3e635', '#22d3ee'];

  // Stable small integer from any string, so the same player always gets the same robot.
  function hash(str) {
    let h = 2166136261;
    for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
  }

  function robot(color, seed = Math.random().toString(36)) {
    const h = hash(seed);
    const pick = (list, shift) => list[(h >>> shift) % list.length];
    const bot = document.createElement('div');
    bot.className = ['bot', pick(['', 'wide', 'tall'], 0), pick(['', 'm-o', 'm-zig', 'm-smile'], 3), pick(['', '', 'noant'], 6)]
      .filter(Boolean)
      .join(' ');
    bot.style.setProperty('--c', color || ROBOT_COLORS[h % ROBOT_COLORS.length]);
    bot.setAttribute('aria-hidden', 'true');

    // Mismatched googly eyes on some robots. Deliberately unsettling.
    const [left, right] = pick([['', ''], ['big', 'small'], ['small', 'big'], ['big', 'big']], 9);
    bot.innerHTML = `
      <div class="bot-ant"></div>
      <div class="bot-ear l"></div><div class="bot-ear r"></div>
      <div class="bot-head">
        <div class="bot-eyes"><span class="eye ${left}"><span class="pupil"></span></span><span class="eye ${right}"><span class="pupil"></span></span></div>
        <div class="bot-mouth"></div>
      </div>`;
    const blink = `${-((h >>> 12) % 40) / 10}s`;
    bot.querySelectorAll('.eye').forEach((eye) => eye.style.setProperty('--blink', blink));
    return bot;
  }

  // Every robot on the page stares at the cursor.
  let raf = 0;
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const root = document.documentElement.style;
      root.setProperty('--lx', ((e.clientX / innerWidth) * 2 - 1).toFixed(3));
      root.setProperty('--ly', ((e.clientY / innerHeight) * 2 - 1).toFixed(3));
    });
  });

  let layer;
  function fxLayer() {
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'fx-layer';
      layer.setAttribute('aria-hidden', 'true');
      document.body.append(layer);
    }
    return layer;
  }

  function shake(hard = false) {
    if (reduced) return;
    const cls = hard ? 'shake-hard' : 'shake';
    document.body.classList.remove('shake', 'shake-hard');
    void document.body.offsetWidth; // restart the animation
    document.body.classList.add(cls);
    setTimeout(() => document.body.classList.remove(cls), 750);
  }

  function burst(x, y, colors = ['#ffd23f', '#eeebe4'], count = 18) {
    if (reduced) return;
    const host = fxLayer();
    for (let i = 0; i < count; i++) {
      const s = document.createElement('div');
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const dist = 80 + Math.random() * 160;
      s.className = 'spark';
      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      s.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      s.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
      s.style.setProperty('--sz', `${8 + Math.random() * 14}px`);
      s.style.setProperty('--sc', colors[i % colors.length]);
      host.append(s);
      setTimeout(() => s.remove(), 800);
    }
  }

  function burstAt(el, colors) {
    const r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, colors);
  }

  function slam(text, { tone = '', tilt = -8, flash = false } = {}) {
    const host = fxLayer();
    if (flash && !reduced) {
      const f = document.createElement('div');
      f.className = 'flash';
      host.append(f);
      setTimeout(() => f.remove(), 400);
    }
    const t = document.createElement('div');
    t.className = `slam ${tone}`;
    t.textContent = text;
    t.style.setProperty('--r', `${tilt}deg`);
    host.append(t);
    setTimeout(() => t.remove(), 1000);
  }

  // A small robot sprints across the bottom of the screen. Purely for the "wait, what" moment.
  function runner(color) {
    if (reduced) return;
    const wrap = document.createElement('div');
    wrap.className = 'runner';
    wrap.append(robot(color));
    fxLayer().append(wrap);
    setTimeout(() => wrap.remove(), 2700);
  }

  function vibrate(pattern) {
    try { navigator.vibrate?.(pattern); } catch {}
  }

  Object.assign(RR, { robot, hash, shake, burst, burstAt, slam, runner, vibrate, reduced, ROBOT_COLORS });
})();
