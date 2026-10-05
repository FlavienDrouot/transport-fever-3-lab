import {createModel} from './model.js';
const $ = id => document.getElementById(id);
const fmt = (n, digits = 1) => n.toLocaleString('fr-FR', {minimumFractionDigits: digits, maximumFractionDigits: digits});
const views = {
  distance: {title: 'Distance en fonction du temps', x: 'Temps depuis le départ (s)', y: 'Distance parcourue (km)', unit: 's', help: 'La courbe la plus haute correspond au train en tête.'},
  speed: {title: 'Vitesse en fonction du temps', x: 'Temps depuis le départ (s)', y: 'Vitesse (km/h)', unit: 's', help: 'Les plateaux correspondent aux vitesses maximales. Les mesures disponibles portent sur la distance et le temps ; aucune vitesse mesurée à superposer.'},
  time: {title: 'Temps en fonction de la distance', x: 'Distance parcourue (km)', y: 'Temps depuis le départ (s)', unit: 'km', help: 'La courbe la plus basse correspond au train qui atteint la distance en premier.'}
};
let dataset, trains, selected, view = 'distance', horizon = 300, cursor = 120;
const H = 420, L = 70, R = 25, T = 48, B = 55;
function active() {return trains.filter(t => selected.has(t.id));}
function value(t, x) {return view === 'time' ? t.model.timeAt(x) : t.model.stateAt(x)[view === 'speed' ? 'speedKmh' : 'distanceKm'];}
function points(t) {return Array.from({length: 301}, (_, i) => {const x = i * horizon / 300; return [x, value(t, x)];});}
function render(width) {
  const W = typeof width === 'number' ? width : Math.max(320, Math.min(1000, $('chart').clientWidth || 1000));
  const ts = active();
  const spec = views[view];
  $('chart-heading').textContent = spec.title;
  $('chart-help').textContent = spec.help + (view === 'speed' ? '' : ' Cercles : mesures vidéo. Losanges : mesures approximatives.');
  $('measurements').disabled = view === 'speed';
  $('cursor').max = horizon;
  $('cursor').step = view === 'time' ? .1 : 1;
  cursor = Math.min(cursor, horizon);
  $('cursor').value = cursor;
  $('cursor-value').textContent = `${fmt(cursor, view === 'time' ? 1 : 0)} ${spec.unit}`;
  $('empty').hidden = ts.length > 0;
  $('csv').disabled = $('svg').disabled = !ts.length;
  const measured = $('measurements').checked && view !== 'speed';
  const observations = ts.flatMap(t => t.measurements.map(m => {
    const time = m.videoSeconds - dataset.source.departureVideoSeconds;
    return {...m, t, x: view === 'time' ? m.distanceKm : time, y: view === 'time' ? time : m.distanceKm};
  })).filter(m => m.x <= horizon);
  const max = Math.max(1, ...ts.map(t => value(t, horizon)), ...(measured ? observations.map(m => m.y) : []));
  const scale = 10 ** Math.floor(Math.log10(max / 5));
  const tick = Math.ceil(max / 5 / scale) * scale;
  const ymax = tick * 5;
  const sx = x => L + x / horizon * (W - L - R);
  const sy = y => H - B - y / ymax * (H - T - B);
  let content = `<title>${spec.title}</title><desc>Courbes théoriques des trains sélectionnés. Une table fournit les valeurs à la position du curseur ; les exports CSV permettent une lecture complète.</desc><rect width="${W}" height="${H}" fill="white"/><text x="${L}" y="22">${spec.y}</text>`;
  for (let i = 0; i <= 5; i++) {
    const y = ymax * i / 5, x = horizon * i / 5;
    content += `<line x1="${L}" x2="${W - R}" y1="${sy(y)}" y2="${sy(y)}" stroke="#e5ebe2"/><text x="${L - 12}" y="${sy(y) + 4}" text-anchor="end">${fmt(y, y < 1 && y > 0 ? 2 : 0)}</text><text x="${sx(x)}" y="${H - B + 23}" text-anchor="middle">${fmt(x, 0)}</text>`;
  }
  content += `<text x="${(W + L - R) / 2}" y="${H - 6}" text-anchor="middle">${spec.x}</text>`;
  for (const t of ts) {
    const d = points(t).map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(2)},${sy(y).toFixed(2)}`).join(' ');
    content += `<path d="${d}" fill="none" stroke="${t.color}" stroke-width="3" stroke-dasharray="${t.dash}"><title>${t.name} — modèle</title></path>`;
  }
  if (measured) for (const m of observations) {
    const x = sx(m.x), y = sy(m.y);
    const tooltip = `${m.t.name} : ${m.distanceKm} km à ${m.videoSeconds - dataset.source.departureVideoSeconds} s${m.approximate ? ' (approximatif)' : ''}`;
    content += m.approximate ? `<path d="M${x},${y - 6} l6,6 l-6,6 l-6,-6 Z" fill="white" stroke="${m.t.color}" stroke-width="2"><title>${tooltip}</title></path>` : `<circle cx="${x}" cy="${y}" r="5" fill="white" stroke="${m.t.color}" stroke-width="2"><title>${tooltip}</title></circle>`;
  }
  content += `<line x1="${sx(cursor)}" x2="${sx(cursor)}" y1="${T}" y2="${H - B}" stroke="#253b36" stroke-dasharray="4 5"/>`;
  for (const t of ts) content += `<circle cx="${sx(cursor)}" cy="${sy(value(t, cursor))}" r="4" fill="${t.color}"/>`;
  $('chart').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${spec.title}">${content}</svg>`;
  const ranking = ts.map(t => ({t, y: value(t, cursor)})).sort((a, b) => view === 'time' ? a.y - b.y : b.y - a.y);
  $('ranking-caption').textContent = `Classement théorique à ${fmt(cursor, view === 'time' ? 1 : 0)} ${spec.unit}${cursor === 0 ? ' · tous ex æquo' : ''}`;
  $('value-heading').textContent = spec.y;
  $('extra-heading').textContent = view === 'speed' ? 'Distance (km)' : 'Vitesse (km/h)';
  $('ranking').innerHTML = ranking.map(({t, y}, i) => {
    const state = t.model.stateAt(view === 'time' ? y : cursor);
    return `<tr><td>${cursor === 0 ? '—' : i + 1}</td><td><span class="train-key" style="--train-color:${t.color}"></span>${t.name}</td><td>${fmt(y, view === 'distance' ? 2 : 1)}</td><td>${fmt(view === 'speed' ? state.distanceKm : state.speedKmh, view === 'speed' ? 2 : 1)}</td></tr>`;
  }).join('');
  $('transitions').innerHTML = ts.map(t => `<tr><td>${t.name}</td><td>${fmt(t.model.tractionEndSeconds)}</td><td>${fmt(t.model.speedCapSeconds)}</td><td>${fmt(t.model.speedCapKm, 2)}</td></tr>`).join('');
  $('residuals').innerHTML = ts.flatMap(t => t.measurements.map(m => {
    const observed = m.videoSeconds - dataset.source.departureVideoSeconds, theoretical = t.model.timeAt(m.distanceKm);
    return `<tr><td>${t.name}</td><td>${m.approximate ? '≈ ' : ''}${m.distanceKm}</td><td>${m.approximate ? '≈ ' : ''}${observed}</td><td>${fmt(theoretical)}</td><td>${fmt(observed - theoretical)}</td></tr>`;
  })).join('');
}
function download(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('status').textContent = `Export préparé : ${filename}`;
}
async function init() {
  const response = await fetch(new URL('../data/trains.json', import.meta.url));
  if (!response.ok) throw new Error('Données indisponibles');
  dataset = await response.json();
  trains = dataset.trains.map(t => ({...t, model: createModel(t, dataset.source)}));
  selected = new Set(trains.map(t => t.id));
  $('trains').innerHTML = trains.map(t => `<label class="train-card" style="--train-color:${t.color}"><div class="train-title"><span>${t.name}</span><input type="checkbox" value="${t.id}" checked aria-label="Comparer ${t.name}"></div><div class="year">${t.year}</div><div class="train-speed">${t.maxSpeedKmh} <small>km/h</small></div><div class="train-spec"><span>${t.massTonnes} t</span><span>${fmt(t.powerCh, 0)} ch</span><span>${fmt(t.tractionKgf, 0)} kgf</span></div></label>`).join('');
  $('trains').addEventListener('change', e => {if (e.target.checked) selected.add(e.target.value); else selected.delete(e.target.value); render();});
  document.querySelector('.views').addEventListener('change', e => {
    const previous = view; view = e.target.value;
    if ((previous === 'time') !== (view === 'time')) {
      horizon = view === 'time' ? 20 : 300; cursor = view === 'time' ? 5 : 120;
      $('horizon').innerHTML = (view === 'time' ? [10, 20, 40] : [180, 300, 600]).map(n => `<option value="${n}" ${n === horizon ? 'selected' : ''}>${n} ${views[view].unit}</option>`).join('');
    }
    render();
  });
  $('horizon').addEventListener('change', e => {horizon = Number(e.target.value); render();});
  $('measurements').addEventListener('change', render);
  $('cursor').addEventListener('input', e => {cursor = Number(e.target.value); render();});
  $('svg').addEventListener('click', () => {
    render(1000);
    const W = 1000;
    const svg = $('chart').querySelector('svg').cloneNode(true);
    render();
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = 'text{font-family:system-ui,sans-serif;font-size:12px;fill:#63726a}'; svg.prepend(style);
    const legend = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    legend.setAttribute('x', L); legend.setAttribute('y', H + 22);
    legend.textContent = active().map(t => t.name).join(' · ') + ' | Modèle idéal sans résistance';
    svg.append(legend); svg.setAttribute('viewBox', `0 0 ${W} ${H + 42}`);
    download(new XMLSerializer().serializeToString(svg), 'image/svg+xml', `tf3-${view}.svg`);
  });
  $('csv').addEventListener('click', () => {
    const rows = [['train', 'type', 'time_s', 'distance_km', 'speed_kmh', 'approximate']];
    for (const t of active()) {
      for (let i = 0; i <= 300; i++) {
        const x = i * horizon / 300, time = view === 'time' ? t.model.timeAt(x) : x;
        const state = t.model.stateAt(time);
        rows.push([t.name, 'model', time.toFixed(4), state.distanceKm.toFixed(6), state.speedKmh.toFixed(4), false]);
      }
      if ($('measurements').checked && view !== 'speed') for (const m of t.measurements) {
        const time = m.videoSeconds - dataset.source.departureVideoSeconds;
        if ((view === 'time' ? m.distanceKm : time) <= horizon) rows.push([t.name, 'video', time, m.distanceKm, '', !!m.approximate]);
      }
    }
    download(rows.map(row => row.join(',')).join('\n'), 'text/csv;charset=utf-8', `tf3-${view}.csv`);
  });
  window.addEventListener('resize', () => render());
  render();
}
init().catch(error => {$('status').textContent = 'Impossible de charger le laboratoire. Servez le site avec un serveur HTTP puis réessayez.'; console.error(error);});
