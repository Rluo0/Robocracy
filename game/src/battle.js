// Battle screen: countdown, fight, HUD and verdict card. Needs the #battle markup (see index.html and public/battle.html).
// runBattle(config, { title, hooks, actions, onQuit }): actions are the verdict buttons, [{ label, primary?, run() }].
import { createBattle, CHASSIS, WEAPONS, POWERUPS, DT } from './sim.js';
import { createRenderer, drawRobot } from './render.js';
import { music, sfx } from './audio.js';

const $ = (sel) => document.querySelector(sel);
export const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let raf = 0, speed = 1, introTimer = 0, onQuit = null;

export function runBattle(config, { title = '', hooks = {}, actions = [], onQuit: quit = null } = {}) {
  cancelAnimationFrame(raf);
  onQuit = quit;
  try {
    hooks.onStart?.();
  } catch (err) {
    console.warn('onStart hook failed:', err);
  }
  $('#battle').hidden = false;
  $('#result').hidden = true;
  $('#feed').innerHTML = '';
  $('#title').textContent = title;

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
        <small>${esc(title)}</small>
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
          ${actions.map((a, i) => `<button${a.primary ? ' class="primary"' : ''} data-act="${i}">${esc(a.label)}</button>`).join('')}
        </div>
        <small>Seed <code>${esc(config.seed)}</code>: the same seed always replays the same battle.</small>
        <div class="verdict-note" id="verdict-note"></div>
      </div>`;
    $('#result').hidden = false;
    if (champ) {
      const ctx = $('#champ').getContext('2d');
      ctx.scale(2, 2);
      drawRobot(ctx, 48, 48, CHASSIS[champ.chassis].r * 2.2, 0, champ);
    }
    $('#result').onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (b) actions[Number(b.dataset.act)]?.run();
    };
    try {
      hooks.onResult?.(r, $('#verdict-note'));
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

// Stops the loop and hides the screen; the caller decides what to show next.
export function stopBattle() {
  cancelAnimationFrame(raf);
  clearTimeout(introTimer);
  sfx.hush();
  music.menu();
  $('#battle').hidden = true;
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
  } else if (b.id === 'quit') onQuit?.();
});
