// Music theory + challenge generation (no DOM). Notes are {letter 0-6 (C..B), oct, alt -1|0|1}.
const LETTER_SEMI = [0, 2, 4, 5, 7, 9, 11];
const LETTER_NAMES = 'CDEFGAB';
const MAJOR_SEMI = [0, 2, 4, 5, 7, 9, 11];

const noteMidi = n => 12 * (n.oct + 1) + LETTER_SEMI[n.letter] + n.alt;
const noteDn = n => n.oct * 7 + n.letter; // diatonic step number (C4 = 28)
const accSymbol = alt => (alt === 1 ? '♯' : alt === -1 ? '♭' : '');
const letterName = n => LETTER_NAMES[n.letter] + accSymbol(n.alt);

// C♭, F♭, E♯, B♯ are never shown (they have natural equivalents).
const oddSpelling = (letter, alt) =>
  (alt === -1 && (letter === 0 || letter === 3)) || (alt === 1 && (letter === 2 || letter === 6));

// Move a note by a number of letter steps and semitones; null if it would need a double accidental.
function transpose(n, steps, semis) {
  const dn = noteDn(n) + steps;
  const letter = ((dn % 7) + 7) % 7, oct = Math.floor(dn / 7);
  const alt = noteMidi(n) + semis - (12 * (oct + 1) + LETTER_SEMI[letter]);
  return Math.abs(alt) > 1 || oddSpelling(letter, alt) ? null : { letter, oct, alt };
}

const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const ALTS = [0, 0, 0, 0, 1, -1]; // accidentals are less common than naturals

function randomNote(minMidi, maxMidi) {
  for (let i = 0; i < 500; i++) {
    const n = { letter: rnd(7), oct: rnd(8), alt: pick(ALTS) };
    if (oddSpelling(n.letter, n.alt)) continue;
    const m = noteMidi(n);
    if (m >= minMidi && m <= maxMidi) return n;
  }
  return null;
}

const CHORDS = [
  { name: 'major',         iv: [[2, 4], [4, 7]] },
  { name: 'minor',         iv: [[2, 3], [4, 7]] },
  { name: 'diminished',    iv: [[2, 3], [4, 6]] },
  { name: 'augmented',     iv: [[2, 4], [4, 8]] },
  { name: 'dominant 7th',  iv: [[2, 4], [4, 7], [6, 10]] },
  { name: 'major 7th',     iv: [[2, 4], [4, 7], [6, 11]] },
  { name: 'minor 7th',     iv: [[2, 3], [4, 7], [6, 10]] },
];
const INTERVALS = [
  ['minor 2nd', 1, 1], ['major 2nd', 1, 2], ['minor 3rd', 2, 3], ['major 3rd', 2, 4],
  ['perfect 4th', 3, 5], ['tritone', 3, 6], ['perfect 5th', 4, 7], ['minor 6th', 5, 8],
  ['major 6th', 5, 9], ['minor 7th', 6, 10], ['major 7th', 6, 11], ['octave', 7, 12],
];

// A chord of 3-4 notes, sung bottom-up. All notes lie inside [low, high].
function makeChord(low, high) {
  for (let i = 0; i < 500; i++) {
    const def = pick(CHORDS);
    const root = randomNote(low, high);
    if (!root) continue;
    const notes = [root];
    let ok = true;
    for (const [steps, semis] of def.iv) {
      const n = transpose(root, steps, semis);
      if (!n || noteMidi(n) > high) { ok = false; break; }
      notes.push(n);
    }
    if (ok) return { type: 'chord', stacked: true, notes, label: `${letterName(root)} ${def.name}` };
  }
  throw new Error('range too small for a chord');
}

// Two notes, sung in order, ascending or descending.
function makeInterval(low, high) {
  for (let i = 0; i < 500; i++) {
    const [name, steps, semis] = pick(INTERVALS);
    const down = Math.random() < 0.5;
    const a = randomNote(low, high);
    if (!a) continue;
    const b = down ? transpose(a, -steps, -semis) : transpose(a, steps, semis);
    if (!b || noteMidi(b) < low || noteMidi(b) > high) continue;
    return { type: 'interval', stacked: false, notes: [a, b], label: `${name} ${down ? '↓' : '↑'}` };
  }
  throw new Error('range too small for an interval');
}

// 4-9 notes: a random walk through a major scale, no immediate repeats.
function makeSequence(low, high) {
  for (let i = 0; i < 500; i++) {
    const tonic = { letter: rnd(7), oct: 4, alt: pick(ALTS) };
    if (oddSpelling(tonic.letter, tonic.alt)) continue;
    const scale = [];
    let bad = false;
    for (let d = -21; d <= 21 && !bad; d++) {
      const n = transpose(tonic, d, MAJOR_SEMI[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7));
      if (!n) bad = true;
      else if (noteMidi(n) >= low && noteMidi(n) <= high) scale.push(n);
    }
    if (bad || scale.length < 6) continue;
    const len = 4 + rnd(6);
    let idx = rnd(scale.length);
    const notes = [scale[idx]];
    while (notes.length < len) {
      let step = pick([-3, -2, -2, -1, -1, 1, 1, 2, 2, 3]);
      let j = idx + step;
      if (j < 0 || j >= scale.length) j = idx - step;
      if (j < 0 || j >= scale.length || j === idx) continue;
      idx = j;
      notes.push(scale[idx]);
    }
    return { type: 'sequence', stacked: false, notes, label: `${notes.length} notes in ${letterName(tonic)} major` };
  }
  throw new Error('range too small for a sequence');
}

function makeChallenge(type, low, high) {
  return { chord: makeChord, interval: makeInterval, sequence: makeSequence }[type](low, high);
}
