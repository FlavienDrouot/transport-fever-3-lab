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
 * Horizontal arrival labels stacked in rows above a finish line: each label starts at its
 * marker (or ends there near the right edge) and takes the lowest row where it fits.
 */
export function stackArrivalLabels(items,{left,right,charWidth=6.6,gap=10}){
  const rowEnds=[];
  const placed=[...items].sort((a,b)=>a.x-b.x).map(item=>{
    const width=item.text.length*charWidth,anchor=item.x+width>right?'end':'start';
    const start=Math.max(left,anchor==='end'?item.x-width:item.x);
    let row=rowEnds.findIndex(end=>start>=end+gap);
    if(row<0){row=rowEnds.length;rowEnds.push(0);}
    rowEnds[row]=start+width;
    return {...item,anchor,row,labelX:anchor==='end'?item.x:start};
  });
  return {labels:placed,rows:rowEnds.length};
}
