// Synthesized arcade sound effects and a looping lobby beat. No audio files needed.
// Browsers only allow audio after a click or tap, so call RR.sfx.unlock() inside one first.
window.RR = window.RR || {};

(() => {
  let ctx = null;
  let master = null;
  let muted = false;
  try { muted = localStorage.getItem('rr-muted') === '1'; } catch {}

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function tone({ type = 'square', from, to = from, dur = 0.15, vol = 0.3, at = 0 }) {
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise({ dur = 0.4, vol = 0.4, at = 0, cutoff = 1200 }) {
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = buf;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
  }

  const sfx = {
    unlock,
    blip: () => tone({ from: 880, to: 1320, dur: 0.08, vol: 0.15 }),
    boing: () => { tone({ type: 'sine', from: 180, to: 900, dur: 0.22, vol: 0.4 }); tone({ type: 'square', from: 1200, to: 1800, dur: 0.06, vol: 0.08, at: 0.2 }); },
    deny: () => { tone({ type: 'sawtooth', from: 160, to: 120, dur: 0.14, vol: 0.25 }); tone({ type: 'sawtooth', from: 160, to: 100, dur: 0.2, vol: 0.25, at: 0.16 }); },
    boom: () => { noise({ dur: 0.7, vol: 0.6, cutoff: 2400 }); tone({ type: 'sine', from: 140, to: 30, dur: 0.6, vol: 0.7 }); },
    poof: () => noise({ dur: 0.25, vol: 0.3, cutoff: 4000 }),
    siren: () => { for (let i = 0; i < 3; i++) { tone({ type: 'square', from: 520, to: 980, dur: 0.22, vol: 0.18, at: i * 0.26 }); } noise({ dur: 0.9, vol: 0.5, at: 0.75, cutoff: 3000 }); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone({ from: f, dur: i === 3 ? 0.5 : 0.14, vol: 0.2, at: i * 0.12 })),
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', from: f, to: f * 0.97, dur: 0.22, vol: 0.3, at: i * 0.2 })),
  };

  // Lobby beat: kick + hat + a square-wave bass riff, scheduled slightly ahead of time.
  const BPM = 138;
  const STEP = 60 / BPM / 4;
  const BASS = [55, 0, 55, 0, 82.4, 0, 55, 73.4, 55, 0, 55, 0, 98, 0, 82.4, 73.4];
  let musicTimer = null;
  let step = 0;
  let nextAt = 0;

  function scheduleStep(i, t) {
    const at = t - ctx.currentTime;
    if (i % 4 === 0) tone({ type: 'sine', from: 150, to: 40, dur: 0.14, vol: 0.55, at });
    if (i % 4 === 2) noise({ dur: 0.04, vol: 0.12, at, cutoff: 9000 });
    if (i % 8 === 4) noise({ dur: 0.12, vol: 0.2, at, cutoff: 3500 });
    const f = BASS[i % BASS.length];
    if (f) tone({ type: 'square', from: f * 2, dur: STEP * 0.9, vol: 0.09, at });
  }

  function startMusic() {
    unlock();
    if (!ctx || musicTimer) return;
    nextAt = ctx.currentTime + 0.05;
    musicTimer = setInterval(() => {
      while (nextAt < ctx.currentTime + 0.12) {
        scheduleStep(step++, nextAt);
        nextAt += STEP;
      }
    }, 25);
  }

  function stopMusic() {
    clearInterval(musicTimer);
    musicTimer = null;
  }

  function setMuted(value) {
    muted = value;
    try { localStorage.setItem('rr-muted', muted ? '1' : '0'); } catch {}
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02);
  }

  Object.assign(sfx, { startMusic, stopMusic, setMuted, isMuted: () => muted });
  RR.sfx = sfx;
})();
