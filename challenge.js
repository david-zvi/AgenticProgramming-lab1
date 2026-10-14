// Challenge mode: chords, intervals and sequences notated on a staff.
// bottom = diatonic number of the bottom staff line, anchor = the line the clef glyph sits on.
const CLEFS = {
  treble: { label: 'Treble', glyph: '\u{1D11E}', bottom: 30, anchor: 32 },
  bass:   { label: 'Bass',   glyph: '\u{1D122}', bottom: 18, anchor: 24 },
  alto:   { label: 'Alto',   glyph: '\u{1D121}', bottom: 24, anchor: 28 },
  tenor:  { label: 'Tenor',  glyph: '\u{1D121}', bottom: 22, anchor: 28 },
};
const MIN_RANGE = 12;          // semitones; at least an octave
const CAL_HOLD_MS = 800;
const SKIP_PENALTY_S = 10;
const INSTRUCTIONS = {
  chord: 'Sing the chord one note at a time, from the bottom up',
  interval: 'Sing the two notes in order, left to right',
  sequence: 'Sing the notes in order, left to right',
};

const CLEF_FONT = '"Noto Music", "Bravura Text", "Segoe UI Symbol", "Apple Symbols", "Symbola", serif';
// Where the clef's ink should span, in staff spaces above the bottom line.
const CLEF_FIT = {
  treble: { top: 5.3, bottom: -1.6 },
  bass:   { top: 4.0, bottom: 0.9 },
  alto:   { top: 4.0, bottom: 0.0 },
  tenor:  { top: 5.0, bottom: 1.0 },
};

const TYPES = ['chord', 'interval', 'sequence'];
const savedType = localStorage.getItem('singNoteChType');
const savedLen = +localStorage.getItem('singNoteChLen');
const CH = {
  format: localStorage.getItem('singNoteChFormat') || (savedType === 'allstar' ? 'allstar' : 'run'),
  type: TYPES.includes(savedType) ? savedType : 'chord',
  len: savedLen === 10 ? 10 : 5,
  clef: localStorage.getItem('singNoteClef'),
  range: JSON.parse(localStorage.getItem('singNoteRange') || 'null'),
};
if (!['single', 'run', 'allstar'].includes(CH.format)) CH.format = 'run';
if (!CLEFS[CH.clef]) CH.clef = null;

const chCount = () => (CH.format === 'single' ? 1 : CH.len);
const timeKey = () => `singNoteBestTime_${CH.format}_${CH.format === 'allstar' ? 'mixed' : CH.type}_${chCount()}_${difficulty.challenge}`;
const getBestTime = () => +localStorage.getItem(timeKey()) || 0;
const fmt = s => s.toFixed(1) + ' s';

function refreshChallengeMenu() {
  const on = (id, test) => document.querySelectorAll(`#${id} button`).forEach(b => b.classList.toggle('active', test(b.dataset.v)));
  on('ch-format', v => v === CH.format);
  on('ch-type', v => v === CH.type);
  on('ch-len', v => +v === CH.len);
  on('ch-clef', v => v === CH.clef);
  document.querySelectorAll('.diff-group[data-mode="challenge"] button').forEach(b =>
    b.classList.toggle('active', b.dataset.d === difficulty.challenge));
  $('row-type').hidden = CH.format === 'allstar';
  $('row-len').hidden = CH.format === 'single';
  $('ch-range').textContent = CH.range
    ? `${midiName(CH.range.low)} – ${midiName(CH.range.high)}` : 'not calibrated yet';
  const t = getBestTime();
  $('ch-best').textContent = t ? fmt(t) : '—';
}
function refreshAll() { refreshClassicMenu(); refreshChallengeMenu(); }

function bindGroup(id, key, store, num) {
  document.querySelectorAll(`#${id} button`).forEach(b => b.onclick = () => {
    CH[key] = num ? +b.dataset.v : b.dataset.v;
    localStorage.setItem(store, CH[key]);
    refreshChallengeMenu();
  });
}
bindGroup('ch-format', 'format', 'singNoteChFormat');
bindGroup('ch-type', 'type', 'singNoteChType');
bindGroup('ch-len', 'len', 'singNoteChLen', true);
bindGroup('ch-clef', 'clef', 'singNoteClef');

// ---------- staff rendering ----------
// Fonts disagree on where a clef glyph's baseline is, so measure the actual ink and fit it to the staff.
let clefCtx = null;
function clefPlacement(name, c, yb, S) {
  clefCtx = clefCtx || document.createElement('canvas').getContext('2d');
  clefCtx.font = `100px ${CLEF_FONT}`;
  const m = clefCtx.measureText(c.glyph);
  const ink = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  const fit = CLEF_FIT[name];
  if (!(ink > 0)) return { x: 16, y: yb - (c.anchor - c.bottom) * S / 2, size: 4 * S };
  const k = (fit.top - fit.bottom) * S / ink;
  return {
    x: 14 + m.actualBoundingBoxLeft * k,
    y: yb - fit.top * S + m.actualBoundingBoxAscent * k,
    size: 100 * k,
  };
}

function renderStaff(ch, doneN, curN) {
  const c = CLEFS[CH.clef], yb = 150, S = 10;
  const yOf = dn => yb - (dn - c.bottom) * S / 2;
  let s = '';
  for (let i = 0; i < 5; i++) s += `<line class="staffline" x1="10" x2="590" y1="${yb - i * S}" y2="${yb - i * S}"/>`;
  const cp = clefPlacement(CH.clef, c, yb, S);
  s += `<text class="clef" x="${cp.x}" y="${cp.y}" font-size="${cp.size}">${c.glyph}</text>`;
  const n = ch.notes.length;
  const span = 440, step = n > 1 ? Math.min(64, span / (n - 1)) : 0;
  const startX = ch.stacked ? 330 : 330 - (n - 1) * step / 2;
  let accCount = 0;
  ch.notes.forEach((note, i) => {
    const x = ch.stacked ? startX : startX + i * step;
    const dn = noteDn(note), y = yOf(dn), k = dn - c.bottom;
    const cls = i < doneN ? 'done' : i === curN ? 'cur' : '';
    // ledger lines
    for (let e = -2; e >= k; e -= 2) s += `<line class="ledger" x1="${x - 13}" x2="${x + 13}" y1="${yOf(c.bottom + e)}" y2="${yOf(c.bottom + e)}"/>`;
    for (let e = 10; e <= k; e += 2) s += `<line class="ledger" x1="${x - 13}" x2="${x + 13}" y1="${yOf(c.bottom + e)}" y2="${yOf(c.bottom + e)}"/>`;
    s += `<ellipse class="head ${cls}" cx="${x}" cy="${y}" rx="8.5" ry="5.5"/>`;
    if (note.alt) {
      const ax = x - 24 - (ch.stacked ? accCount * 13 : 0);
      accCount++;
      s += `<text class="acc ${cls}" x="${ax}" y="${y + 7}" font-size="22">${accSymbol(note.alt)}</text>`;
    }
  });
  $('staff').innerHTML = s;
}

// ---------- calibration ----------
let calRunning = false;
const CAL_STABLE_MS = 350;

// Press Record, then sing/step towards your extreme; the lowest (or highest) steady note is kept.
function startCalibration(onDone) {
  const names = ['lowest', 'highest'];
  let step = 0, got = [], recording = false, samples = [], cand = null;
  calRunning = true;

  function setUi() {
    $('cal-prompt').textContent = `Step ${step + 1} of 2: your ${names[step]} comfortable note`;
    $('btn-cal-rec').textContent = recording ? 'Stop' : `Record ${names[step]} note`;
    $('cal-cand').textContent = recording
      ? (cand === null ? 'Listening…' : `${names[step]} so far: ${midiName(cand)}`) : '';
  }
  $('cal-msg').textContent = '';
  $('cal-heard').textContent = '–';
  $('cal-bar').style.width = '0';
  setUi();
  show('calibrate');

  $('btn-cal-rec').onclick = () => {
    if (!recording) {
      recording = true; cand = null; samples = [];
      $('cal-msg').textContent = got.length ? `Lowest: ${midiName(got[0])}` : '';
    } else {
      recording = false;
      if (cand === null) {
        $('cal-msg').textContent = "I didn't hear a steady note. Try again.";
      } else {
        got.push(cand);
        if (got.length === 2) {
          const low = Math.min(...got), high = Math.max(...got);
          if (high - low < MIN_RANGE) {
            $('cal-msg').textContent = `That's only ${high - low} semitones (${midiName(low)}–${midiName(high)}). Please reach for at least a full octave, and try again.`;
            got = []; step = 0;
          } else {
            CH.range = { low, high };
            localStorage.setItem('singNoteRange', JSON.stringify(CH.range));
            calRunning = false;
            refreshChallengeMenu();
            return onDone();
          }
        } else { step = 1; $('cal-msg').textContent = `Lowest: ${midiName(got[0])}`; }
      }
    }
    setUi();
  };

  function frame(now) {
    if (!calRunning) return;
    const f = listen();
    let held = 0;
    if (f > 0) {
      const m = freqToMidi(f);
      const med = samples.length ? samples.map(x => x.m).sort((a, b) => a - b)[samples.length >> 1] : m;
      if (Math.abs(m - med) > 0.7) samples = [];
      samples.push({ t: now, m });
      $('cal-heard').textContent = midiName(Math.round(m));
      held = now - samples[0].t;
    } else { samples = []; $('cal-heard').textContent = '–'; }
    $('cal-bar').style.width = Math.min(100, held / CAL_STABLE_MS * 100) + '%';
    if (recording && held >= CAL_STABLE_MS) {
      const sorted = samples.map(x => x.m).sort((a, b) => a - b);
      const m = Math.round(sorted[sorted.length >> 1]);
      const better = cand === null || (step === 0 ? m < cand : m > cand);
      if (better) { cand = m; setUi(); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ---------- run ----------
let run = null;

async function startChallenge() {
  showError('');
  try { await ensureMic(); } catch (e) { showError('Could not access the microphone: ' + e.message); return; }
  if (!CH.range) return startCalibration(startChallenge);
  if (!CH.clef) { show('clef-pick'); return; }
  run = {
    challenges: [], idx: 0, ni: 0, hold: 0, lastGood: 0, skips: 0,
    pauseUntil: 0, next: null,   // next: 'load' | 'finish' once the pause after a completed challenge ends
    start: performance.now(), last: performance.now(), over: false, finalTime: 0,
  };
  for (let i = 0; i < chCount(); i++) {
    const type = CH.format === 'allstar' ? TYPES[rnd(3)] : CH.type;
    run.challenges.push(makeChallenge(type, CH.range.low, CH.range.high));
  }
  loadChallenge();
  show('challenge-game');
  requestAnimationFrame(challengeLoop);
}

function loadChallenge() {
  const ch = run.challenges[run.idx];
  run.ni = 0; run.hold = 0; run.next = null;
  $('ch-progress').textContent = `${run.idx + 1} / ${run.challenges.length}`;
  $('ch-title').textContent = ch.label;
  $('ch-instr').textContent = INSTRUCTIONS[ch.type];
  $('ch-hold').style.width = '0';
  renderStaff(ch, 0, 0);
}

function elapsed(now) { return (now - run.start) / 1000 + run.skips * SKIP_PENALTY_S; }

function challengeLoop(now) {
  if (!run || run.over) return;
  const dt = now - run.last; run.last = now;
  if (run.next === null) $('ch-time').textContent = elapsed(now).toFixed(1);

  // Pause after a completed challenge; the transition happens here, in the loop, so it can't race.
  if (run.next !== null) {
    if (now >= run.pauseUntil) {
      if (run.next === 'finish') return finishChallenge();
      loadChallenge();
    }
    return requestAnimationFrame(challengeLoop);
  }

  const d = DIFFICULTIES[difficulty.challenge];
  const ch = run.challenges[run.idx];
  const tm = noteMidi(ch.notes[run.ni]);
  const freq = listen();
  let onTarget = false;
  if (freq > 0) {
    const midi = freqToMidi(freq);
    const r = Math.round(midi), cents = (midi - r) * 100;
    $('ch-heard').textContent = `${midiName(r)}  (${cents >= 0 ? '+' : ''}${Math.round(cents)}¢)`;
    const off = (midi - tm) * 100;
    setNeedle($('ch-needle'), off);
    onTarget = Math.abs(off) <= d.tolerance;
  } else {
    $('ch-needle').style.opacity = 0;
    $('ch-heard').textContent = '–';
  }
  if (onTarget) { run.lastGood = now; run.hold += dt; }
  else if (now - run.lastGood > GRACE_MS) run.hold = 0;
  $('ch-hold').style.width = Math.min(100, run.hold / d.hold * 100) + '%';

  if (run.hold >= d.hold) {
    // Note sung: it turns green and stays green (progress is preserved).
    run.ni++; run.hold = 0;
    $('ch-hold').style.width = '0';
    beep(520 + run.ni * 60);
    if (run.ni >= ch.notes.length) {
      renderStaff(ch, run.ni, -1);
      beep(880, 0.25);
      run.idx++;
      run.pauseUntil = now + 700;
      if (run.idx >= run.challenges.length) { run.next = 'finish'; run.finalTime = elapsed(now); }
      else run.next = 'load';
    } else {
      renderStaff(ch, run.ni, run.ni);
    }
  }
  requestAnimationFrame(challengeLoop);
}

function finishChallenge() {
  run.over = true;
  const total = run.finalTime;
  const best = getBestTime();
  const isBest = !best || total < best;
  if (isBest) localStorage.setItem(timeKey(), total);
  $('ch-final').textContent = fmt(total);
  $('ch-skips').textContent = run.skips ? `Includes ${run.skips} skip${run.skips > 1 ? 's' : ''} (+${SKIP_PENALTY_S} s each)` : 'No skips!';
  $('ch-newbest').hidden = !isBest;
  refreshChallengeMenu();
  beep(440, 0.4);
  show('challenge-end');
}

function toChallengeMenu() {
  if (run) run.over = true;
  refreshChallengeMenu();
  show('challenge-menu');
}

$('btn-challenge').onclick = toChallengeMenu;
$('btn-ch-start').onclick = startChallenge;
$('btn-ch-again').onclick = startChallenge;
$('btn-ch-menu').onclick = toChallengeMenu;
$('btn-recal').onclick = async () => {
  showError('');
  try { await ensureMic(); } catch (e) { showError('Could not access the microphone: ' + e.message); return; }
  startCalibration(toChallengeMenu);
};
$('btn-cal-cancel').onclick = () => { calRunning = false; toChallengeMenu(); };
document.querySelectorAll('#clef-pick button').forEach(b => b.onclick = () => {
  CH.clef = b.dataset.v;
  localStorage.setItem('singNoteClef', CH.clef);
  refreshChallengeMenu();
  startChallenge();
});
$('btn-ch-skip').onclick = () => {
  if (!run || run.over || run.next !== null) return;
  run.skips++;
  run.idx++;
  if (run.idx >= run.challenges.length) {
    run.finalTime = elapsed(performance.now());
    return finishChallenge();
  }
  loadChallenge();
};
$('btn-ch-quit').onclick = toChallengeMenu;
document.querySelectorAll('.btn-home').forEach(b => b.onclick = () => {
  if (run) run.over = true;
  running = false; calRunning = false;
  show('home');
});
