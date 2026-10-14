// Every pitch class with all its valid spellings (no Cb, E#, Fb, B#).
const SPELLINGS = [
  ['C'], ['C♯', 'D♭'], ['D'], ['D♯', 'E♭'], ['E'], ['F'],
  ['F♯', 'G♭'], ['G'], ['G♯', 'A♭'], ['A'], ['A♯', 'B♭'], ['B']
];
const DIFFICULTIES = {
  easy:   { tolerance: 45, hold: 300, label: 'Easy' },
  normal: { tolerance: 30, hold: 400, label: 'Normal' },
  hard:   { tolerance: 15, hold: 500, label: 'Hard' },
};
const GAME_SECONDS = 60;
const GRACE_MS = 150;         // brief dropouts don't reset the hold
const FAST_MS = 2000;         // hit within this long of the note appearing = fast
const FAST_BONUS_S = 3;       // seconds added for a fast hit
const COMBO_WINDOW_MS = 4000; // combo fades if no hit within this time
const COMBO_STEP = 2;         // hits per multiplier level
const MAX_MULT = 5;
const RING_LEN = 289;

const $ = id => document.getElementById(id);
const screens = { start: $('screen-start'), game: $('screen-game'), end: $('screen-end') };
function show(name) { for (const k in screens) screens[k].hidden = k !== name; }

let audioCtx, analyser, stream, buf;
let score, streak, comboCount, lastHitTime, target, targetName, noteShownAt;
let holdMs, lastGood, endTime, running, lastFrame, diff;
let difficulty = localStorage.getItem('singNoteDifficulty') || 'normal';
if (!DIFFICULTIES[difficulty]) difficulty = 'normal';

const bestKey = d => 'singNoteBest_' + d;
const getBest = d => +localStorage.getItem(bestKey(d)) || 0;

function refreshStart() {
  document.querySelectorAll('#difficulty button').forEach(b =>
    b.classList.toggle('active', b.dataset.d === difficulty));
  $('best-start').textContent = getBest(difficulty);
  $('best-label').textContent = DIFFICULTIES[difficulty].label;
}
document.querySelectorAll('#difficulty button').forEach(b => b.onclick = () => {
  difficulty = b.dataset.d;
  localStorage.setItem('singNoteDifficulty', difficulty);
  refreshStart();
});
refreshStart();

// Nearest semitone for a frequency (A4 = 440 Hz). pc 0 = C.
function freqToNote(f) {
  const midi = 69 + 12 * Math.log2(f / 440);
  const r = Math.round(midi);
  return { pc: ((r % 12) + 12) % 12, cents: (midi - r) * 100 };
}

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
  const names = SPELLINGS[n];
  targetName = names[Math.floor(Math.random() * names.length)];
  $('target').textContent = targetName;
  holdMs = 0;
  noteShownAt = performance.now();
  setRing(0);
}

function setRing(frac) {
  $('ring').firstElementChild.style.strokeDashoffset = RING_LEN * (1 - frac);
}

function multiplier() { return Math.min(MAX_MULT, 1 + Math.floor(comboCount / COMBO_STEP)); }

function updateCombo(now) {
  const age = now - lastHitTime;
  if (comboCount > 0 && age > COMBO_WINDOW_MS) comboCount = 0;
  const frac = comboCount > 0 ? 1 - age / COMBO_WINDOW_MS : 0;
  $('combo-bar').style.width = (frac * 100) + '%';
  $('mult').textContent = '×' + multiplier();
  $('mult').classList.toggle('on', multiplier() > 1);
}

function popup(text) {
  const el = document.createElement('div');
  el.className = 'popup'; el.textContent = text;
  $('note-card').appendChild(el);
  setTimeout(() => el.remove(), 900);
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
  diff = DIFFICULTIES[difficulty];
  score = 0; streak = 0; comboCount = 0; target = -1; lastGood = 0; lastHitTime = 0;
  $('score').textContent = 0; $('streak').textContent = 0;
  $('diff-badge').textContent = diff.label;
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
  updateCombo(now);

  analyser.getFloatTimeDomainData(buf);
  const { freq } = detectPitch(buf, audioCtx.sampleRate);
  const needle = $('meter-needle');
  let onTarget = false;
  if (freq > 0) {
    const { pc, cents } = freqToNote(freq);
    const name = pc === target ? targetName : SPELLINGS[pc][0];
    $('heard').textContent = `${name}  (${cents >= 0 ? '+' : ''}${Math.round(cents)}¢)`;
    // Needle: distance from the target pitch class, wrapped to ±600 cents.
    let d = (pc - target) * 100 + cents;
    d = ((d + 600) % 1200 + 1200) % 1200 - 600;
    needle.style.opacity = 1;
    needle.style.left = (50 + Math.max(-100, Math.min(100, d)) / 100 * 45) + '%';
    onTarget = Math.abs(d) <= diff.tolerance;
  } else {
    needle.style.opacity = 0;
    $('heard').textContent = '–';
  }

  if (onTarget) { lastGood = now; holdMs += dt; }
  else if (now - lastGood > GRACE_MS) holdMs = 0;
  setRing(Math.min(1, holdMs / diff.hold));

  if (holdMs >= diff.hold) {
    // Combo continues if this hit lands inside the fade window.
    comboCount = (comboCount > 0 && now - lastHitTime <= COMBO_WINDOW_MS) ? comboCount + 1 : 1;
    lastHitTime = now;
    const pts = multiplier();
    score += pts; streak++;
    let msg = '+' + pts;
    if (now - noteShownAt <= FAST_MS) {
      endTime += FAST_BONUS_S * 1000;
      msg += `  ⚡+${FAST_BONUS_S}s`;
    }
    popup(msg);
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
  const isBest = score > getBest(difficulty);
  if (isBest) localStorage.setItem(bestKey(difficulty), score);
  $('newbest').hidden = !isBest;
  $('best-end').textContent = getBest(difficulty);
  $('best-end-label').textContent = diff.label;
  refreshStart();
  beep(440, 0.4);
  show('end');
}

$('btn-start').onclick = start;
$('btn-again').onclick = () => show('start');
$('btn-skip').onclick = () => {
  if (!running) return;
  streak = 0; comboCount = 0;
  $('streak').textContent = 0;
  nextNote();
};
