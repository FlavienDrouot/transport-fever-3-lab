import {escapeHtml as escape} from './format.js';

// Route/year/category filters belong to the caller; search, ordering and selection
// behave identically for both transport families.
export function selectorResults(items, query = '', sort = 'year') {
  const needle = query.trim().toLowerCase();
  return items.filter(t => `${t.name} ${t.year}`.toLowerCase().includes(needle)).sort((a,b) =>
    (sort === 'speed' ? b.maxSpeedKmh-a.maxSpeedKmh : sort === 'year' ? b.year-a.year : a.name.localeCompare(b.name)) || a.name.localeCompare(b.name));
}
export function selectResults(selected, items, choose) {
  for (const item of items) choose ? selected.add(item.id) : selected.delete(item.id);
}
export function selectAll(selected, items) {
  selected.clear(); selectResults(selected, items, true);
}
export function vehicleRows(items, selected, describe) {
  return items.map(t => `<label class="train-row" data-train="${escape(t.id)}" style="--train-color:${escape(t.color || 'var(--green)')}"><input type="checkbox" value="${escape(t.id)}" ${selected.has(t.id) ? 'checked' : ''} aria-label="Compare ${escape(t.name)}"><span class="train-info"><span class="train-name">${escape(t.name)}</span><span class="train-spec">${escape(t.year)} · ${escape(t.maxSpeedKmh)} km/h</span><span class="train-power">${escape(describe(t))}</span></span></label>`).join('');
}
export function mountVehicleSelector(root, {ids, getItems, getSelected, describe, onChange, onHighlight=()=>{}}) {
  root.classList.add('vehicle-selector');
  root.innerHTML = `<label class="search-label" for="${ids.search}">Find vehicles</label><input id="${ids.search}" type="search" placeholder="Search name or year" autocomplete="off"><div class="catalogue-tools"><span id="${ids.sort}-label">Sort</span><fieldset id="${ids.sort}" class="scale-toggle" aria-labelledby="${ids.sort}-label"><legend class="sr-only">Vehicle order</legend><label><input type="radio" name="${ids.sort}" value="name"><span>Name</span></label><label><input type="radio" name="${ids.sort}" value="speed"><span>Speed</span></label><label><input type="radio" name="${ids.sort}" value="year" checked><span>Year</span></label></fieldset></div><p id="${ids.count}" class="selection-count" role="status"></p><div class="selection-actions"><button id="${ids.select}" type="button">Select results</button><button id="${ids.clear}" type="button">Clear results</button></div><div id="${ids.list}" class="train-list"></div><p id="${ids.empty}" class="selector-empty" hidden>No vehicles match these filters.</p>`;
  const el = key => root.querySelector(`#${ids[key]}`);
  const getVisible = () => selectorResults(getItems(), el('search').value, el('sort').querySelector('input:checked').value);
  function updateCount() {
    const eligible = getItems(), selected = getSelected(), shown = eligible.filter(t => selected.has(t.id)).length;
    const hidden = selected.size-shown;
    el('count').textContent = `${shown} selected${hidden ? ` · ${hidden} hidden by filters` : ''} · ${getVisible().length} of ${eligible.length} shown`;
  }
  let renderedRows,highlighted;
  const highlight=id=>{highlighted=id;for(const row of el('list').querySelectorAll('[data-train]'))row.classList.toggle('is-highlighted',row.dataset.train===id);};
  function render() {
    const items = getVisible();
    updateCount();
    // Selection changes must not replace the focused checkbox or reset list scroll.
    const rows = vehicleRows(items, new Set(), describe);
    if (rows !== renderedRows) {el('list').innerHTML = rows; renderedRows = rows;}
    for (const input of el('list').querySelectorAll('input[type="checkbox"]')) input.checked = getSelected().has(input.value);
    highlight(highlighted);
    el('empty').hidden = !!items.length;
    el('select').disabled = el('clear').disabled = !items.length;
  }
  const changed = () => {render(); onChange();};
  el('search').addEventListener('input', changed);
  el('sort').addEventListener('change', changed);
  el('list').addEventListener('change', event => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    selectResults(getSelected(), [{id:event.target.value}], event.target.checked);
    updateCount(); onChange();
  });
  for (const [key, choose] of [['select',true],['clear',false]]) el(key).addEventListener('click', () => {
    selectResults(getSelected(), getVisible(), choose); changed();
  });
  const list=el('list'),targetId=target=>target?.closest?.('[data-train]')?.dataset.train;
  list.addEventListener('pointerover',event=>onHighlight(targetId(event.target)));
  list.addEventListener('focusin',event=>onHighlight(targetId(event.target)));
  list.addEventListener('pointerleave',()=>onHighlight(list.contains(root.ownerDocument.activeElement)?targetId(root.ownerDocument.activeElement):undefined));
  list.addEventListener('focusout',event=>onHighlight(list.contains(event.relatedTarget)?targetId(event.relatedTarget):undefined));
  return {render, highlight, updateCount, getVisible, clearSearch: () => {el('search').value='';}};
}
