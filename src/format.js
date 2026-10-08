/** Display elapsed time as minutes:seconds, rounded to the nearest second. */
export function formatTime(seconds) {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character]));
}

export function formatNumber(value, digits = 0, fixed = false) {
  return Number.isFinite(value) ? value.toLocaleString('en-GB', {
    minimumFractionDigits: fixed ? digits : 0, maximumFractionDigits: digits,
  }) : 'Unknown';
}
