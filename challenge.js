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

const CH = {
  type: localStorage.getItem('singNoteChType') || 'chord',
  len: +localStorage.getItem('singNoteChLen') || 5,
  clef: localStorage.getItem('singNoteClef'),
  range: JSON.parse(localStorage.getItem('singNoteRange') || 'null'),
};
if (!CLEFS[CH.clef]) CH.clef = null;

const timeKey = () => `singNoteBestTime_${CH.type}_${CH.len}_${difficulty}`;
const getBestTime = () => +localStorage.getItem(timeKey()) || 0;
const fmt = s => s.toFixed(1) + ' s';

function refreshChallengeMenu() {
  document.querySelectorAll('#ch-type button').forEach(b => b.classList.toggle('active', b.dataset.v === CH.type));
  document.querySelectorAll('#ch-len button').forEach(b => b.classList.toggle('active', +b.dataset.v === CH.len));
  document.querySelectorAll('#ch-clef button').forEach(b => b.classList.toggle('active', b.dataset.v === CH.clef));
  $('ch-range').textContent = CH.range
    ? `${midiName(CH.range.low)} – ${midiName(CH.range.high)}` : 'not calibrated yet';
  const t = getBestTime();
  $('ch-best').textContent = t ? fmt(t) : '—';
  $('ch-diff').textContent = DIFFICULTIES[difficulty].label;
}
function bindGroup(id, key, store, num) {
  document.querySelectorAll(`#${id} button`).forEach(b => b.onclick = () => {
    CH[key] = num ? +b.dataset.v : b.dataset.v;
    localStorage.setItem(store, CH[key]);
    refreshChallengeMenu();
  });
}
bindGroup('ch-type', 'type', 'singNoteChType');
bindGroup('ch-len', 'len', 'singNoteChLen', true);
bindGroup('ch-clef', 'clef', 'singNoteClef');

// ---------- staff rendering ----------
function renderStaff(ch, doneN, curN) {
  const c = CLEFS[CH.clef], yb = 150, S = 10;
  const yOf = dn => yb - (dn - c.bottom) * S / 2;
  let s = '';
  for (let i = 0; i < 5; i++) s += `<line class="staffline" x1="10" x2="590" y1="${yb - i * S}" y2="${yb - i * S}"/>`;
  s += `<text class="clef" x="16" y="${yOf(c.anchor)}" font-size="${4 * S}">${c.glyph}</text>`;
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

function startCalibration(onDone) {
  const prompts = ['Sing your LOWEST comfortable note and hold it', 'Now sing your HIGHEST comfortable note and hold it'];
  let step = 0, samples = [], got = [], pauseUntil = 0;
  calRunning = true;
  $('cal-prompt').textContent = prompts[0];
  $('cal-msg').textContent = '';
  $('cal-heard').textContent = '–';
  $('cal-bar').style.width = '0';
  show('calibrate');

  function frame(now) {
    if (!calRunning) return;
    if (now < pauseUntil) return requestAnimationFrame(frame);
    const f = listen();
    if (f > 0) {
      const m = freqToMidi(f);
      const med = samples.length ? samples.map(x => x.m).sort((a, b) => a - b)[samples.length >> 1] : m;
      if (Math.abs(m - med) > 0.7) samples = [];
      samples.push({ t: now, m });
      $('cal-heard').textContent = midiName(Math.round(m));
    } else { samples = []; $('cal-heard').textContent = '–'; }
    const held = samples.length ? now - samples[0].t : 0;
    $('cal-bar').style.width = Math.min(100, held / CAL_HOLD_MS * 100) + '%';
    if (held >= CAL_HOLD_MS) {
      const sorted = samples.map(x => x.m).sort((a, b) => a - b);
      got.push(Math.round(sorted[sorted.length >> 1]));
      samples = [];
      beep(660);
      if (got.length === 2) {
        const low = Math.min(...got), high = Math.max(...got);
        if (high - low < MIN_RANGE) {
          $('cal-msg').textContent = `That's only ${high - low} semitones (${midiName(low)}–${midiName(high)}). Please reach for at least a full octave. Let's try again.`;
          got = []; step = 0; $('cal-prompt').textContent = prompts[0];
          pauseUntil = now + 1500;
        } else {
          CH.range = { low, high };
          localStorage.setItem('singNoteRange', JSON.stringify(CH.range));
          calRunning = false;
          refreshChallengeMenu();
          return onDone();
        }
      } else {
        step = 1; $('cal-prompt').textContent = prompts[1];
        $('cal-msg').textContent = `Lowest: ${midiName(got[0])}`;
        pauseUntil = now + 1000;
      }
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
  const types = ['chord', 'interval', 'sequence'];
  run = {
    challenges: [], idx: 0, ni: 0, hold: 0, lastGood: 0, skips: 0, pauseUntil: 0,
    start: performance.now(), last: performance.now(), over: false,
  };
  for (let i = 0; i < CH.len; i++) {
    run.challenges.push(makeChallenge(CH.type === 'allstar' ? types[rnd(3)] : CH.type, CH.range.low, CH.range.high));
  }
  loadChallenge();
  show('challenge-game');
  requestAnimationFrame(challengeLoop);
}

function loadChallenge() {
  const ch = run.challenges[run.idx];
  run.ni = 0; run.hold = 0;
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
  $('ch-time').textContent = elapsed(now).toFixed(1);
  const d = DIFFICULTIES[difficulty];
  const ch = run.challenges[run.idx];
  if (now < run.pauseUntil) return requestAnimationFrame(challengeLoop);

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
      run.pauseUntil = now + 700;
      run.idx++;
      if (run.idx >= run.challenges.length) return setTimeout(() => finishChallenge(), 700);
      setTimeout(loadChallenge, 700);
    } else {
      renderStaff(ch, run.ni, run.ni);
    }
  }
  requestAnimationFrame(challengeLoop);
}

function finishChallenge() {
  run.over = true;
  const total = elapsed(performance.now());
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

$('btn-challenge').onclick = () => { refreshChallengeMenu(); show('challenge-menu'); };
$('btn-ch-start').onclick = startChallenge;
$('btn-ch-again').onclick = startChallenge;
$('btn-recal').onclick = async () => {
  showError('');
  try { await ensureMic(); } catch (e) { showError('Could not access the microphone: ' + e.message); return; }
  startCalibration(() => show('challenge-menu'));
};
$('btn-cal-cancel').onclick = () => { calRunning = false; show('challenge-menu'); };
document.querySelectorAll('#clef-pick button').forEach(b => b.onclick = () => {
  CH.clef = b.dataset.v;
  localStorage.setItem('singNoteClef', CH.clef);
  refreshChallengeMenu();
  startChallenge();
});
$('btn-ch-skip').onclick = () => {
  if (!run || run.over) return;
  run.skips++;
  run.idx++;
  if (run.idx >= run.challenges.length) return finishChallenge();
  loadChallenge();
};
$('btn-ch-quit').onclick = () => { if (run) run.over = true; show('challenge-menu'); };
document.querySelectorAll('.btn-home').forEach(b => b.onclick = () => {
  if (run) run.over = true;
  running = false; calRunning = false;
  refreshHome(); show('home');
});
