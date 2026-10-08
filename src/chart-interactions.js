const charts = new WeakMap();
const bindings = new WeakMap();
const observers = new WeakMap();

export function observeChartHighlight(document, group, onHighlight) {
  if (!observers.has(document)) observers.set(document, new Map());
  observers.get(document).set(group, onHighlight);
}

function applyHighlight(container, id) {
  const config = bindings.get(container)?.config;
  if (!config) return;
  const segments = [...container.querySelectorAll(config.selector)];
  for (const segment of segments) {
    const appearance = config.appearance(segment, id);
    segment.setAttribute('opacity', appearance.opacity);
    segment.setAttribute('stroke-width', appearance.width);
  }
  segments.sort((a,b) => Number(a.dataset.train === id) - Number(b.dataset.train === id)
    || Number(a.dataset.winner === 'true') - Number(b.dataset.winner === 'true'));
  for (const segment of segments) segment.parentNode.appendChild(segment);
  for (const label of container.querySelectorAll('.end-label,.train-legend [data-train],.phase-leaders [data-train],.arrival-marker')) {
    const opacity = id ? (label.dataset.train === id ? 1 : .25) : Number(label.dataset.baseOpacity ?? 1);
    if (label.classList.contains('end-label') || label.classList.contains('arrival-marker')) label.setAttribute('opacity', opacity);
    else label.style.opacity = opacity;
  }
}

export function setChartHighlight(document, group, id) {
  for (const chart of charts.get(document) ?? []) {
    if (bindings.get(chart).config.group === group) applyHighlight(chart, id);
  }
  observers.get(document)?.get(group)?.(id);
}

export function mountChartInteractions(container, {
  group = 'rail', highlighted, selector = '.train-curve',
  appearance = (segment, id) => ({opacity:id && segment.dataset.train !== id ? .16 : 1, width:segment.dataset.train === id ? 4 : 2}),
} = {}) {
  if (!container.addEventListener || !container.ownerDocument) return;
  for (const label of container.querySelectorAll('.end-label,.train-legend [data-train],.phase-leaders [data-train]')) label.setAttribute('tabindex', '0');
  let binding = bindings.get(container);
  const config = {group, selector, appearance};
  if (binding) binding.config = config;
  else {
    binding = {config};
    bindings.set(container, binding);
    const document = container.ownerDocument;
    if (!charts.has(document)) charts.set(document, new Set());
    charts.get(document).add(container);
    const targetId = target => target?.closest?.('[data-train]')?.dataset.train;
    const update = id => setChartHighlight(document, binding.config.group, id);
    container.addEventListener('pointerover', event => update(targetId(event.target)));
    container.addEventListener('pointerleave', () => update(container.contains(document.activeElement) ? targetId(document.activeElement) : undefined));
    container.addEventListener('focusin', event => update(targetId(event.target)));
    container.addEventListener('focusout', event => update(container.contains(event.relatedTarget) ? targetId(event.relatedTarget) : undefined));
  }
  applyHighlight(container, highlighted);
}
