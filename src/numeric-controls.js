/** Retain the last valid calculation, with an explicit notice until corrected. */
export function validateNumberInputs(inputs, notice) {
  const errors = [];
  for (const input of inputs) {
    const positive=input.getAttribute('data-strict-positive')==='true';
    const valid = input.disabled || (Number.isFinite(input.valueAsNumber) && input.checkValidity() && (!positive || input.valueAsNumber>0));
    input.setAttribute('aria-invalid', String(!valid));
    if (valid) continue;
    const name = input.getAttribute('aria-label') || input.labels?.[0]?.textContent.trim() || 'Value';
    const validity = input.validity;
    const reason = positive&&input.valueAsNumber<=0 ? 'must be greater than zero'
      : validity.rangeUnderflow ? `must be at least ${input.min}`
      : validity.rangeOverflow ? `must be at most ${input.max}`
      : validity.stepMismatch ? `must use increments of ${input.step}` : 'must be a valid number';
    errors.push(`${name} ${reason}.`);
  }
  notice.hidden = errors.length === 0;
  notice.textContent = errors.length ? `${errors.join(' ')} Results still use the last valid settings.` : '';
  return errors.length === 0;
}

export function syncNumberInput(input, value) {
  if (input.getAttribute('aria-invalid') !== 'true') input.value = value;
}

/** One binding for a distance field and its bounded slider. */
export function mountDistanceControl({number, range, validate, onChange, event = 'change'}) {
  if (event !== 'input') number.addEventListener('input', validate);
  number.addEventListener(event, () => { if (validate()) onChange(number.valueAsNumber); });
  range.addEventListener('input', () => {
    number.value = range.value;
    if (validate()) onChange(range.valueAsNumber);
  });
}

export function mountYearControl({range, output, previous, next, onChange}) {
  const update = () => {
    const year = range.valueAsNumber;
    output.textContent = year;
    previous.disabled = year <= Number(range.min);
    next.disabled = year >= Number(range.max);
    onChange(year);
  };
  range.addEventListener('input', update);
  for (const [button, step] of [[previous, -1], [next, 1]]) button.addEventListener('click', () => {
    range.value = Math.max(Number(range.min), Math.min(Number(range.max), range.valueAsNumber + step));
    update();
  });
  previous.disabled = range.valueAsNumber <= Number(range.min);
  next.disabled = range.valueAsNumber >= Number(range.max);
  return update;
}
