import {formatTime} from './format.js';
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n,d=0) => n.toLocaleString('en-GB',{maximumFractionDigits:d});
export function renderDataView(dataset,trains,experiments) {
  document.getElementById('experiment-cards').innerHTML=experiments.experiments.map(e=>`<article class="experiment-card"><div class="panel-top"><h3>${escape(e.topic)}</h3><span class="evidence-status">${escape(e.status)}</span></div><p>${escape(e.observation)}</p><p><strong>Used in the model:</strong> ${escape(e.adopted)}</p><p class="chart-help">${escape(e.limits)}</p></article>`).join('');
  document.getElementById('motion-validation').innerHTML=dataset.trains.flatMap(t=>(t.measurements||[]).map(m=>{const model=trains.find(x=>x.id===t.id)?.model;return model?`<tr><th scope="row">${escape(t.name)}</th><td>${fmt(m.distanceKm,1)}</td><td>${formatTime(m.videoSeconds-dataset.source.departureVideoSeconds)}</td><td>${formatTime(model.timeAt(m.distanceKm))}</td><td>${fmt(model.timeAt(m.distanceKm)-(m.videoSeconds-dataset.source.departureVideoSeconds),1)}</td></tr>`:'';})).join('') || '<tr><td colspan="5">No video observations for trains matching the current filters.</td></tr>';
}
