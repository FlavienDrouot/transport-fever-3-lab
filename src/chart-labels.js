import {escapeHtml as escape} from './format.js';
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
  const legend = `<p class="train-legend">${trains.map(t=>`<span data-train="${escape(t.id)}" style="color:${t.color};opacity:${highlighted&&highlighted!==t.id?.3:1}">${escape(t.name)}</span>`).join('')}</p>`;
  return trains.length > 10 ? `<details class="legend-disclosure"><summary>Vehicle legend · ${trains.length} names</summary>${legend}</details>` : legend;
}
/**
 * Arrival names rising at 45° to the right from the finish line. Neighbours keep a minimum
 * horizontal gap; each name is pulled left only as far as needed to stay inside the chart.
 */
export function spreadDiagonalLabels(items,{left,right,charWidth=7,gap=22}){
  const slant=Math.SQRT1_2,labels=[...items].sort((a,b)=>a.x-b.x).map(item=>({...item,reach:item.text.length*charWidth*slant}));
  labels.forEach((label,i)=>{label.labelX=Math.max(label.x,left+5,i?labels[i-1].labelX+gap:-Infinity);});
  for(let i=labels.length-1;i>=0;i--)labels[i].labelX=Math.min(labels[i].labelX,right-5-labels[i].reach,i<labels.length-1?labels[i+1].labelX-gap:Infinity);
  return {labels,height:Math.max(0,...labels.map(label=>label.reach))};
}
