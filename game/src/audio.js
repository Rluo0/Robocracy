// Tiny synthesized sound effects, no asset files.
let ac = null, noise = null, lastBoom = 0;
let voice = null; // held so the utterance isn't collected before it finishes

function audio() {
  if (!ac) {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    noise = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

// Theme music: the quiet intro loops in the menus, the drop lands when the fight starts.
const INTRO = [0.3, 9.1], DROP = [9.3, 404], VOLUME = 0.25;
let track = null, playing = null, master = null, mode = 'menu';

function play() {
  if (!track) return;
  const a = audio(), now = a.currentTime;
  if (playing) {
    playing.gain.gain.setTargetAtTime(0, now, 0.015);
    playing.src.stop(now + 0.1);
  }
  const src = a.createBufferSource(), gain = a.createGain();
  src.buffer = track;
  src.loop = true;
  [src.loopStart, src.loopEnd] = mode === 'drop' ? DROP : INTRO;
  src.connect(gain).connect(master);
  src.start(now, src.loopStart);
  playing = { src, gain };
}

export const music = {
  async load(url) {
    // Browsers keep audio suspended until the first click or key press.
    for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, audio, { once: true });
    const a = audio();
    master = a.createGain();
    master.gain.value = sfx.muted ? 0 : VOLUME;
    master.connect(a.destination);
    track = await a.decodeAudioData(await (await fetch(url)).arrayBuffer());
    play();
  },

  menu() {
    if (mode === 'menu') return;
    mode = 'menu';
    play();
  },

  drop() {
    if (mode === 'drop') return;
    mode = 'drop';
    play();
  },

  mute(on) {
    if (master) master.gain.value = on ? 0 : VOLUME;
  },
};

export const sfx = {
  muted: false,

  boom(size = 1) {
    if (this.muted) return;
    const a = audio();
    if (a.currentTime - lastBoom < 0.05) return;
    lastBoom = a.currentTime;
    const src = a.createBufferSource(), filter = a.createBiquadFilter(), gain = a.createGain();
    src.buffer = noise;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900 / size, a.currentTime);
    filter.frequency.exponentialRampToValueAtTime(60, a.currentTime + 0.4);
    gain.gain.setValueAtTime(Math.min(0.5, 0.18 * size), a.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.25 + 0.2 * size);
    src.connect(filter).connect(gain).connect(a.destination);
    src.start();
    src.stop(a.currentTime + 0.6);
  },

  tone(from, to, dur = 0.15, type = 'square', vol = 0.06) {
    if (this.muted) return;
    const a = audio();
    const osc = a.createOscillator(), gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, a.currentTime);
    osc.frequency.exponentialRampToValueAtTime(to, a.currentTime + dur);
    gain.gain.setValueAtTime(vol, a.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    osc.connect(gain).connect(a.destination);
    osc.start();
    osc.stop(a.currentTime + dur);
  },

  // Robot announcer voice. Returns false when nothing will be spoken.
  say(text, onend) {
    const synth = window.speechSynthesis;
    if (this.muted || !synth) return false;
    synth.cancel();
    voice = new SpeechSynthesisUtterance(text);
    voice.pitch = 0.1;
    voice.rate = 1.5;
    voice.onend = voice.onerror = onend;
    synth.speak(voice);
    return true;
  },

  hush() {
    window.speechSynthesis?.cancel();
  },
};
