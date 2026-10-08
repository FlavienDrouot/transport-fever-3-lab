const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Right-hand labels on wide plots; a colored legend preserves plot space on phones.
export function curveLabels(points, {width, right, top, bottom, highlighted}) {
  if(width<700)return '';
  const rows=points.filter(p=>Number.isFinite(p.y)).map(p=>({...p,y:Math.max(top,Math.min(bottom,p.y))})).sort((a,b)=>a.y-b.y);
  const gap=Math.min(20,(bottom-top)/Math.max(1,rows.length-1));
  rows.forEach((p,i)=>{p.labelY=Math.max(p.y,i?rows[i-1].labelY+gap:top);});
  for(let i=rows.length-1;i>=0;i--)rows[i].labelY=Math.min(rows[i].labelY,i===rows.length-1?bottom:rows[i+1].labelY-gap);
  return rows.map(({t,y,labelY,opacity})=>`<line x1="${width-right}" y1="${y}" x2="${width-right+12}" y2="${labelY}" stroke="${t.color}" opacity=".35"/><text class="end-label" data-train="${escape(t.id)}" x="${width-right+17}" y="${labelY+4}" style="fill:${t.color}" opacity="${opacity??(highlighted&&highlighted!==t.id?.25:1)}">${escape(t.name)}</text>`).join('');
}
export function trainLegend(trains,width,highlighted){
  if(width>=700)return '';
  return `<p class="train-legend">${trains.map(t=>`<span data-train="${escape(t.id)}" style="color:${t.color};opacity:${highlighted&&highlighted!==t.id?.3:1}">${escape(t.name)}</span>`).join('')}</p>`;
}
