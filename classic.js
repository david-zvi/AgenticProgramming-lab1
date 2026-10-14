// Classic mode: 60 seconds, sing as many random notes as you can.
const SPELLINGS = [
  ['C'], ['C♯', 'D♭'], ['D'], ['D♯', 'E♭'], ['E'], ['F'],
  ['F♯', 'G♭'], ['G'], ['G♯', 'A♭'], ['A'], ['A♯', 'B♭'], ['B']
];
const GAME_SECONDS = 60;
const GRACE_MS = 150;         // brief dropouts don't reset the hold
const FAST_MS = 2000;         // hit within this long of the note appearing = fast
const FAST_BONUS_S = 3;       // seconds added for a fast hit
const COMBO_WINDOW_MS = 4000; // combo fades if no hit within this time
const COMBO_STEP = 2;         // hits per multiplier level
const MAX_MULT = 5;
const RING_LEN = 289;

let score, streak, comboCount, lastHitTime, target, targetName, noteShownAt;
let holdMs, lastGood, endTime, running, lastFrame, diff;

const bestKey = d => 'singNoteBest_' + d;
const getBest = d => +localStorage.getItem(bestKey(d)) || 0;

function refreshHome() {
  document.querySelectorAll('#difficulty button').forEach(b =>
    b.classList.toggle('active', b.dataset.d === difficulty));
  $('best-start').textContent = getBest(difficulty);
  $('best-label').textContent = DIFFICULTIES[difficulty].label;
  if (typeof refreshChallengeMenu === 'function') refreshChallengeMenu();
}
document.querySelectorAll('#difficulty button').forEach(b => b.onclick = () => {
  difficulty = b.dataset.d;
  localStorage.setItem('singNoteDifficulty', difficulty);
  refreshHome();
});

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

function floatText(parent, text, cls) {
  const el = document.createElement('div');
  el.className = cls; el.textContent = text;
  parent.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

async function startClassic() {
  showError('');
  try { await ensureMic(); } catch (e) { showError('Could not access the microphone: ' + e.message); return; }
  diff = DIFFICULTIES[difficulty];
  score = 0; streak = 0; comboCount = 0; target = -1; lastGood = 0; lastHitTime = 0;
  $('score').textContent = 0; $('streak').textContent = 0;
  $('diff-badge').textContent = diff.label;
  nextNote();
  endTime = performance.now() + GAME_SECONDS * 1000;
  running = true; lastFrame = performance.now();
  show('classic-game');
  requestAnimationFrame(classicLoop);
}

function classicLoop(now) {
  if (!running) return;
  const dt = now - lastFrame; lastFrame = now;
  const left = endTime - now;
  if (left <= 0) return finishClassic();
  $('time').textContent = Math.ceil(left / 1000);
  updateCombo(now);

  const freq = listen();
  const needle = $('meter-needle');
  let onTarget = false;
  if (freq > 0) {
    const midi = freqToMidi(freq);
    const r = Math.round(midi), cents = (midi - r) * 100;
    const pc = ((r % 12) + 12) % 12;
    const name = pc === target ? targetName : SPELLINGS[pc][0];
    $('heard').textContent = `${name}  (${cents >= 0 ? '+' : ''}${Math.round(cents)}¢)`;
    // Distance from the target pitch class (any octave), wrapped to ±600 cents.
    let d = (pc - target) * 100 + cents;
    d = ((d + 600) % 1200 + 1200) % 1200 - 600;
    setNeedle(needle, d);
    onTarget = Math.abs(d) <= diff.tolerance;
  } else {
    needle.style.opacity = 0;
    $('heard').textContent = '–';
  }

  if (onTarget) { lastGood = now; holdMs += dt; }
  else if (now - lastGood > GRACE_MS) holdMs = 0;
  setRing(Math.min(1, holdMs / diff.hold));

  if (holdMs >= diff.hold) {
    const before = multiplier();
    comboCount = (comboCount > 0 && now - lastHitTime <= COMBO_WINDOW_MS) ? comboCount + 1 : 1;
    lastHitTime = now;
    const pts = multiplier();
    score += pts; streak++;
    floatText($('note-card'), '+' + pts, 'popup');
    if (now - noteShownAt <= FAST_MS) {
      endTime += FAST_BONUS_S * 1000;
      floatText($('time-box'), `+${FAST_BONUS_S}s`, 'timer-popup');
      restartAnim($('time-box'), 'bonus');
      $('time').textContent = Math.ceil((endTime - now) / 1000);
    }
    // Pop the multiplier when it rises, and on every hit while maxed out.
    if (pts > before || pts === MAX_MULT) restartAnim($('mult'), 'pop');
    $('score').textContent = score; $('streak').textContent = streak;
    beep(660); setTimeout(() => beep(880), 80);
    restartAnim($('note-card'), 'hit');
    nextNote();
  }
  requestAnimationFrame(classicLoop);
}

function finishClassic() {
  running = false;
  $('final').textContent = score;
  const isBest = score > getBest(difficulty);
  if (isBest) localStorage.setItem(bestKey(difficulty), score);
  $('newbest').hidden = !isBest;
  $('best-end').textContent = getBest(difficulty);
  $('best-end-label').textContent = diff.label;
  refreshHome();
  beep(440, 0.4);
  show('classic-end');
}

$('btn-classic').onclick = startClassic;
$('btn-again').onclick = startClassic;
$('btn-skip').onclick = () => {
  if (!running) return;
  streak = 0; comboCount = 0;
  $('streak').textContent = 0;
  nextNote();
};
