// Tiny synthesized sound effects, no asset files.
let ac = null, noise = null, lastBoom = 0;

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
};
