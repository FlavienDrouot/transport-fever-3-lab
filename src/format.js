/** Display elapsed time as minutes:seconds, rounded to the nearest second. */
export function formatTime(seconds) {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}
