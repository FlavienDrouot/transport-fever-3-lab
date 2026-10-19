/** Round values (1, 2 or 5 × 10ⁿ steps) between min and max, about `count` intervals apart. */
export function roundTicks(min, max, count = 5) {
  if (!(max > min)) return [min];
  // The 1/2/5 step whose interval count is closest to the requested one.
  const raw = (max - min) / count, power = 10 ** Math.floor(Math.log10(raw));
  const step = [.5, 1, 2, 5, 10].map(m => m * power).reduce((best, s) => Math.abs((max - min) / s - count) < Math.abs((max - min) / best - count) ? s : best);
  const digits = Math.max(0, -Math.floor(Math.log10(step)) + 1), ticks = [];
  for (let i = Math.ceil(min / step - 1e-9); i * step <= max * (1 + 1e-12) + 1e-12; i++) ticks.push(Number((i * step).toFixed(digits)));
  return ticks;
}

const TIME_STEPS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];
/** Round clock values for a linear seconds axis: 0:30, 1:00, 5:00… */
export function timeTicks(max, count = 5) {
  const step = TIME_STEPS.find(s => s >= max / count) ?? 10 ** Math.ceil(Math.log10(max / count));
  return Array.from({length: Math.floor(max / step + 1e-9) + 1}, (_, i) => i * step);
}

/** Axis labels keeping both meaningful ends, with round values in between that do not crowd them. */
export function boundedTicks(min, max, count = 5) {
  const inner = roundTicks(min, max, count), gap = (max - min) / count * .45;
  return [min, ...inner.filter(x => x - min > gap && max - x > gap), max];
}

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
    ticks.push(...roundTicks(0, max));
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
