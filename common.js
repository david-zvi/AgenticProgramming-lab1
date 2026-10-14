// Shared helpers: screens, microphone, sounds, difficulty.
const $ = id => document.getElementById(id);

function show(name) {
  document.querySelectorAll('[data-screen]').forEach(s => { s.hidden = s.dataset.screen !== name; });
}
function showError(msg) {
  document.querySelectorAll('.error').forEach(e => { e.textContent = msg; e.hidden = !msg; });
}

const NOTE_NAMES_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
function midiName(m) { return NOTE_NAMES_SHARP[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }
function freqToMidi(f) { return 69 + 12 * Math.log2(f / 440); }

const DIFFICULTIES = {
  easy:   { tolerance: 45, hold: 300, label: 'Easy' },
  normal: { tolerance: 30, hold: 400, label: 'Normal' },
  hard:   { tolerance: 15, hold: 500, label: 'Hard' },
};
let difficulty = localStorage.getItem('singNoteDifficulty') || 'normal';
if (!DIFFICULTIES[difficulty]) difficulty = 'normal';

const Mic = { ctx: null, analyser: null, buf: null, stream: null };

async function ensureMic() {
  if (!Mic.stream) {
    Mic.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    Mic.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = Mic.ctx.createMediaStreamSource(Mic.stream);
    Mic.analyser = Mic.ctx.createAnalyser();
    Mic.analyser.fftSize = 2048;
    src.connect(Mic.analyser);
    Mic.buf = new Float32Array(Mic.analyser.fftSize);
  }
  await Mic.ctx.resume();
}

// Current sung frequency in Hz, or -1 if nothing clear is being sung.
function listen() {
  Mic.analyser.getFloatTimeDomainData(Mic.buf);
  return detectPitch(Mic.buf, Mic.ctx.sampleRate).freq;
}

function beep(freq, dur = 0.15) {
  const o = Mic.ctx.createOscillator(), g = Mic.ctx.createGain();
  o.frequency.value = freq; o.type = 'sine';
  g.gain.setValueAtTime(0.15, Mic.ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, Mic.ctx.currentTime + dur);
  o.connect(g).connect(Mic.ctx.destination);
  o.start(); o.stop(Mic.ctx.currentTime + dur);
}

function restartAnim(el, cls) {
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
}

function setNeedle(needle, centsOff) {
  needle.style.opacity = 1;
  needle.style.left = (50 + Math.max(-100, Math.min(100, centsOff)) / 100 * 45) + '%';
}
