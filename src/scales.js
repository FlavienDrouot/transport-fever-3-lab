/** A true base-10 log scale: non-positive values have no plotted position. */
export function createScale(mode, max, floor = 1) {
  if (!['linear', 'log'].includes(mode) || !Number.isFinite(max) || max <= 0 || (mode === 'log' && (!Number.isFinite(floor) || floor <= 0 || floor >= max))) throw new RangeError('Invalid scale domain');
  const min = mode === 'log' ? floor : 0;
  const transform = n => mode === 'log' ? Math.log10(n) : n;
  const low = transform(min), span = transform(max) - low;
  // Clipped plots may extrapolate coordinates without changing their domain.
  const positionUnbounded = n => !Number.isFinite(n) || (mode === 'log' && n <= 0) ? NaN : (transform(n) - low) / span;
  const position = n => !Number.isFinite(n) || n < min || n > max ? NaN : (transform(n) - low) / span;
  const invert = fraction => mode === 'log' ? 10 ** (low + fraction * span) : fraction * max;
  const ticks = [];
  if (mode === 'linear') {
    for (let i = 0; i <= 5; i++) ticks.push(i === 5 ? max : max * i / 5);
  } else {
    for (let exponent = Math.floor(Math.log10(min)); exponent <= Math.ceil(Math.log10(max)); exponent++) {
      for (const multiple of [1, 2, 5]) {
        const n = multiple * 10 ** exponent;
        if (n >= min && n <= max) ticks.push(n);
      }
    }
  }
  return {mode, min, max, position, positionUnbounded, invert, ticks};
}
