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

  // Drama cues for the final showdown.
  sfx.heartbeat = () => {
    tone({ type: 'sine', from: 75, to: 38, dur: 0.16, vol: 0.9 });
    tone({ type: 'sine', from: 65, to: 34, dur: 0.18, vol: 0.65, at: 0.2 });
  };
  sfx.showdown = () => {
    noise({ dur: 1.2, vol: 0.5, cutoff: 1800 });
    tone({ type: 'sawtooth', from: 220, to: 55, dur: 1.4, vol: 0.22 });
    tone({ type: 'square', from: 110, to: 27.5, dur: 1.6, vol: 0.14, at: 0.05 });
  };

  // ---------- Music: looping tracks scheduled slightly ahead of time ----------
  const C = [523.25, 659.25, 783.99];
  const AM = [440, 523.25, 659.25];
  const F = [349.23, 440, 523.25];
  const G = [392, 493.88, 587.33];

  const TRACKS = {
    // Lobby: kick + hat + a square-wave bass riff.
    lobby: {
      bpm: 138,
      step(i, at, len) {
        const BASS = [55, 0, 55, 0, 82.4, 0, 55, 73.4, 55, 0, 55, 0, 98, 0, 82.4, 73.4];
        if (i % 4 === 0) tone({ type: 'sine', from: 150, to: 40, dur: 0.14, vol: 0.55, at });
        if (i % 4 === 2) noise({ dur: 0.04, vol: 0.12, at, cutoff: 9000 });
        if (i % 8 === 4) noise({ dur: 0.12, vol: 0.2, at, cutoff: 3500 });
        const f = BASS[i % BASS.length];
        if (f) tone({ type: 'square', from: f * 2, dur: len * 0.9, vol: 0.09, at });
      },
    },
    // Victory: bright C, Am, F, G arpeggios over a marching beat.
    victory: {
      bpm: 150,
      step(i, at, len) {
        const chord = [C, AM, F, G][Math.floor(i / 16) % 4];
        const s = i % 16;
        if (s % 4 === 0) tone({ type: 'sine', from: 160, to: 45, dur: 0.13, vol: 0.6, at });
        if (s === 4 || s === 12) noise({ dur: 0.14, vol: 0.28, at, cutoff: 5000 });
        if (s % 2 === 1) noise({ dur: 0.03, vol: 0.08, at, cutoff: 10000 });
        if (s % 2 === 0) tone({ type: 'triangle', from: chord[0] / 4, dur: len * 1.8, vol: 0.3, at });
        const arp = [0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 2, 2, 1][s];
        const lift = s >= 12 ? 2 : 1;
        tone({ type: 'square', from: chord[arp] * lift, dur: len * 0.8, vol: 0.05, at });
      },
    },
  };

  let musicTimer = null;
  let current = null;
  let step = 0;
  let nextAt = 0;

  function startMusic(name = 'lobby', delay = 0.05) {
    unlock();
    if (!ctx) return;
    if (musicTimer && current === name) return;
    stopMusic();
    const track = TRACKS[name];
    const len = 60 / track.bpm / 4;
    current = name;
    step = 0;
    nextAt = ctx.currentTime + delay;
    musicTimer = setInterval(() => {
      while (nextAt < ctx.currentTime + 0.12) {
        track.step(step++, nextAt - ctx.currentTime, len);
        nextAt += len;
      }
    }, 25);
  }

  function stopMusic() {
    clearInterval(musicTimer);
    musicTimer = null;
    current = null;
  }

  // Fanfare, then the victory loop kicks in underneath the winner screen.
  sfx.victory = () => {
    unlock();
    if (!ctx) return;
    stopMusic();
    [[392, 0, 0.12], [523.25, 0.13, 0.12], [659.25, 0.26, 0.12], [783.99, 0.39, 0.45], [659.25, 0.86, 0.1], [1046.5, 0.98, 0.7]].forEach(([f, at, dur]) => {
      tone({ type: 'square', from: f, dur, vol: 0.12, at });
      tone({ type: 'triangle', from: f / 2, dur, vol: 0.25, at });
    });
    noise({ dur: 0.5, vol: 0.3, at: 0.98, cutoff: 6000 });
    startMusic('victory', 1.75);
  };

  function setMuted(value) {
    muted = value;
    try { localStorage.setItem('rr-muted', muted ? '1' : '0'); } catch {}
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02);
  }

  Object.assign(sfx, { startMusic, stopMusic, setMuted, isMuted: () => muted });
  RR.sfx = sfx;
})();
