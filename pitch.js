// Pitch detection using the McLeod-style normalized autocorrelation (NSDF).
// Returns frequency in Hz, or -1 if no clear pitch / too quiet.
function detectPitch(buf, sampleRate) {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.01) return { freq: -1, rms };

  const minLag = Math.floor(sampleRate / 1000); // up to 1000 Hz
  const maxLag = Math.min(Math.floor(sampleRate / 70), n >> 1); // down to 70 Hz
  const nsdf = new Float32Array(maxLag + 1);
  for (let lag = minLag - 1; lag <= maxLag; lag++) {
    let acf = 0, div = 0;
    for (let i = 0; i < n - lag; i++) {
      acf += buf[i] * buf[i + lag];
      div += buf[i] * buf[i] + buf[i + lag] * buf[i + lag];
    }
    nsdf[lag] = div > 0 ? (2 * acf) / div : 0;
  }
  // Pick the first peak that is close to the global max (avoids octave errors).
  let best = 0;
  for (let lag = minLag; lag < maxLag; lag++) best = Math.max(best, nsdf[lag]);
  if (best < 0.8) return { freq: -1, rms };
  for (let lag = minLag; lag < maxLag; lag++) {
    if (nsdf[lag] > 0.9 * best && nsdf[lag] >= nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1]) {
      // Parabolic interpolation for sub-sample accuracy.
      const a = nsdf[lag - 1], b = nsdf[lag], c = nsdf[lag + 1];
      const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
      return { freq: sampleRate / (lag + shift), rms };
    }
  }
  return { freq: -1, rms };
}
