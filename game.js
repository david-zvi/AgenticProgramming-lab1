const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const GAME_SECONDS = 60;
const TOLERANCE_CENTS = 30;   // how close to the note (any octave) counts
const HOLD_MS = 400;          // must be held steady this long
const GRACE_MS = 150;         // brief dropouts don't reset the hold
const RING_LEN = 289;

const $ = id => document.getElementById(id);
const screens = { start: $('screen-start'), game: $('screen-game'), end: $('screen-end') };
function show(name) { for (const k in screens) screens[k].hidden = k !== name; }

let audioCtx, analyser, stream, buf;
let score, streak, target, holdMs, lastGood, endTime, running, lastFrame;
let best = +localStorage.getItem('singNoteBest') || 0;
$('best-start').textContent = best;

// Returns {pc, cents} of the nearest semitone for a frequency (A4 = 440 Hz).
function freqToNote(f) {
  const midi = 69 + 12 * Math.log2(f / 440);
  const r = Math.round(midi);
  return { pc: ((r % 12) + 12) % 12, cents: (midi - r) * 100, midi: r };
}
// Pitch class index: MIDI 60 is C, so pc 0 = C.

function beep(freq, dur = 0.15) {
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.frequency.value = freq; o.type = 'sine';
  g.gain.setValueAtTime(0.15, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  o.connect(g).connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + dur);
}

function nextNote() {
  let n;
  do { n = Math.floor(Math.random() * 12); } while (n === target);
  target = n;
  $('target').textContent = NOTES[n];
  holdMs = 0;
  setRing(0);
}

function setRing(frac) {
  $('ring').firstElementChild.style.strokeDashoffset = RING_LEN * (1 - frac);
}

async function start() {
  $('error').hidden = true;
  try {
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      buf = new Float32Array(analyser.fftSize);
    }
    await audioCtx.resume();
  } catch (e) {
    $('error').textContent = 'Could not access the microphone: ' + e.message;
    $('error').hidden = false;
    return;
  }
  score = 0; streak = 0; target = -1; lastGood = 0;
  $('score').textContent = 0; $('streak').textContent = 0;
  nextNote();
  endTime = performance.now() + GAME_SECONDS * 1000;
  running = true; lastFrame = performance.now();
  show('game');
  requestAnimationFrame(loop);
}

function loop(now) {
  if (!running) return;
  const dt = now - lastFrame; lastFrame = now;
  const left = endTime - now;
  if (left <= 0) return finish();
  $('time').textContent = Math.ceil(left / 1000);

  analyser.getFloatTimeDomainData(buf);
  const { freq } = detectPitch(buf, audioCtx.sampleRate);
  const needle = $('meter-needle');
  let onTarget = false;
  if (freq > 0) {
    const { pc, cents } = freqToNote(freq);
    $('heard').textContent = `${NOTES[pc]}  (${cents >= 0 ? '+' : ''}${Math.round(cents)}¢)`;
    // Needle shows cents distance from the *target* pitch class, wrapped to ±600.
    let d = (pc - target) * 100 + cents;
    d = ((d + 600) % 1200 + 1200) % 1200 - 600;
    needle.style.opacity = 1;
    needle.style.left = (50 + Math.max(-100, Math.min(100, d)) / 100 * 45) + '%';
    onTarget = Math.abs(d) <= TOLERANCE_CENTS;
  } else {
    needle.style.opacity = 0;
    $('heard').textContent = '–';
  }

  if (onTarget) { lastGood = now; holdMs += dt; }
  else if (now - lastGood > GRACE_MS) holdMs = 0;
  setRing(Math.min(1, holdMs / HOLD_MS));

  if (holdMs >= HOLD_MS) {
    score++; streak++;
    $('score').textContent = score; $('streak').textContent = streak;
    beep(660); setTimeout(() => beep(880), 80);
    const card = $('note-card');
    card.classList.remove('hit'); void card.offsetWidth; card.classList.add('hit');
    nextNote();
  }
  requestAnimationFrame(loop);
}

function finish() {
  running = false;
  $('final').textContent = score;
  const isBest = score > best;
  if (isBest) { best = score; localStorage.setItem('singNoteBest', best); }
  $('newbest').hidden = !isBest;
  $('best-end').textContent = best;
  $('best-start').textContent = best;
  beep(440, 0.4);
  show('end');
}

$('btn-start').onclick = start;
$('btn-again').onclick = start;
$('btn-skip').onclick = () => { if (running) { streak = 0; $('streak').textContent = 0; nextNote(); } };
