import {UI_TERMS} from './ui-terms.js';
import {escapeHtml as escape, formatNumber} from './format.js';
import {analyseTruckService,analysePassengerRoadService,selectRoadVehicles,roadRouteSpeeds} from './trucks.js';
import {rankingStory} from './economic-crossovers.js';
import {createPhaseScale,leadershipWeights} from './phase-scale.js';
import {renderPhaseDiagram,rankPhaseSegments,winningValueCeiling} from './phase-diagram.js';
import {GAME_YEAR_SECONDS} from './line.js';
import {fixedRateFleetCount} from './service-fleet.js';
import {styleVehicleCatalogues} from './vehicle-styles.js';
const fmt=n=>formatNumber(n,2);

export function roadPhaseStory(vehicles,options,{axis='distance',start=.01,end=5}={}){
  if(!['distance','year','utilization'].includes(axis))throw new RangeError('Unsupported road phase axis');
  const rows=(options.passenger?analysePassengerRoadService:analyseTruckService)(vehicles,options);
  vehicles=vehicles.filter(v=>rows.some(r=>r.truck.id===v.id));
  const coefficients=new Map(rows.map(row=>{
    const factor=row.truck.economy.annualMaintenance/(GAME_YEAR_SECONDS*row.deliveredPerCycle);
    return [row.truck.id,{row,transferFactor:(options.demandPerYear??0)/GAME_YEAR_SECONDS*(row.loadingSeconds+row.unloadingSeconds)/row.deliveredPerCycle,handling:factor*(row.loadingSeconds+row.unloadingSeconds),fixed:factor*(2*row.travelSeconds+2*row.terminalDelaySeconds),slope:factor*7200/row.effectiveSpeedKmh,intercept:factor*(row.loadingSeconds+row.unloadingSeconds+2*row.terminalDelaySeconds)}];
  }));
  const valueAt=(id,x)=>{
    const c=coefficients.get(id);if(!c)return null;
    if(options.demandPerYear!=null){
      if(axis==='year'&&c.row.truck.year>x)return null;
      const scale=axis==='utilization'?x/100/(options.fillRatio??1):1;
      const fixedSeconds=axis==='distance'?7200*x/c.row.effectiveSpeedKmh+2*c.row.terminalDelaySeconds:2*c.row.travelSeconds+2*c.row.terminalDelaySeconds;
      const minimumVehicles=c.transferFactor+options.demandPerYear/GAME_YEAR_SECONDS*fixedSeconds/(c.row.deliveredPerCycle*scale);
      const count=fixedRateFleetCount(fixedSeconds,c.transferFactor,minimumVehicles,options.maxHeadwaySeconds??null,options.frequencyMode);
      // A fixed rate is delivered exactly: fleet maintenance / annual delivery.
      return c.row.truck.economy.annualMaintenance*count/options.demandPerYear;
    }
    if(axis==='year')return c.row.truck.year<=x?c.row.costPerCargo:null;
    return axis==='distance'?c.slope*x+c.intercept:c.handling+c.fixed*(options.fillRatio??1)/(x/100);
  };
  if(axis!=='year')return {...rankingStory(vehicles.map(v=>v.id),(id,x)=>-valueAt(id,x),start,end),valueAt};
  if(!Number.isInteger(start)||!Number.isInteger(end)||end<=start)throw new RangeError('Invalid year domain');
  const knots=[...new Set([start,...vehicles.map(v=>v.year).filter(y=>y>start&&y<end),end])].sort((a,b)=>a-b);
  const intervals=[],phases=[];
  for(let i=0;i<knots.length-1;i++){
    const x=knots[i],scores=vehicles.filter(v=>v.year<=x).map(v=>({id:v.id,value:valueAt(v.id,x)}));
    const ranks=Object.fromEntries(vehicles.map(v=>[v.id,null]));
    for(const score of scores)ranks[score.id]=1+scores.filter(s=>s.value<score.value-Math.max(1,Math.abs(score.value))*1e-9).length;
    const leaders=scores.filter(s=>ranks[s.id]===1).map(s=>s.id).sort();
    intervals.push({start:x,end:knots[i+1],ranks});
    if(phases.at(-1)?.leaders.join('|')===leaders.join('|'))phases.at(-1).end=knots[i+1];
    else phases.push({start:x,end:knots[i+1],leaders});
  }
  const endScores=vehicles.filter(v=>v.year<=end).map(v=>({id:v.id,value:valueAt(v.id,end)}));
  const endRanks=Object.fromEntries(endScores.map(s=>[s.id,1+endScores.filter(other=>other.value<s.value-Math.max(1,Math.abs(s.value))*1e-9).length]));
  return {start,end,roots:knots.slice(1,-1),intervals,phases,valueAt,endRanks};
}
const layouts=new WeakMap();
function updateCurrentMarker(container,current,axis,sx){
  const marker=container.querySelector?.('.phase-current-setting');
  if(!marker?.setAttribute)return;
  const visible=Number.isFinite(current)&&current>=sx.start&&current<=sx.end;
  marker.style.display=visible?'':'none';
  if(visible){
    marker.setAttribute('x1',sx(current));marker.setAttribute('x2',sx(current));
    marker.querySelector('title').textContent=`Current setting: ${axis==='year'?String(Math.round(current)):fmt(current)}`;
  }
}
function phaseChart(container,vehicles,story,{axis,label,current,mode,rank,stepped=false}){
  if(!vehicles.length){container.textContent='No compatible vehicles in this range.';return;}
  const W=Math.max(320,container.clientWidth||1000);
  const layout=layouts.get(container);
  if(layout&&layout.story===story&&layout.width===W&&layout.mode===mode&&layout.rank===rank&&layout.axis===axis&&layout.stepped===stepped){
    updateCurrentMarker(container,current,axis,layout.sx);return;
  }
  const H=rank?Math.max(330,vehicles.length*22+100):450;
  const L=65,R=W>=700?220:20,T=35,B=55;
  const segments=rank?story.intervals:story.phases;
  const knots=mode==='linear'?[story.start,story.end]:[story.start,...segments.map(p=>p.end)];
  const scale=createPhaseScale(knots,mode==='linear'||rank?undefined:leadershipWeights(segments.length));
  const pixel=value=>Math.round(value*100)/100;
  const sx=x=>pixel(L+scale.position(x)*(W-L-R));
  sx.start=story.start;sx.end=story.end;
  // Road costs are monotone within a phase for every supported horizontal axis,
  // so the leader's endpoints bound its entire curve, including tied leaders.
  const winningValues=story.phases.flatMap(p=>p.leaders.flatMap(id=>[story.valueAt(id,p.start),story.valueAt(id,p.end)]));
  const lo=0,hi=winningValueCeiling(winningValues);
  const sy=y=>pixel(T+(rank?(y-1)/Math.max(1,vehicles.length-1):(hi-y)/(hi-lo))*(H-T-B));
  let svg=`<title>${rank?'Rank changes':'Running cost phases'}</title><desc>${escape(label)} varies; other settings remain fixed. Lower costs are better.</desc><text x="${L}" y="18">${rank?'Rank · first place at the top':`Running cost / ${UI_TERMS.capacityUnit} ($)`}</text>`;
  const ticks=rank?Array.from({length:vehicles.length},(_,i)=>i+1):Array.from({length:5},(_,i)=>lo+(hi-lo)*i/4);
  for(const tick of ticks)svg+=`<line x1="${L}" x2="${W-R}" y1="${sy(tick)}" y2="${sy(tick)}" stroke="#ccd4cc" opacity=".5" stroke-dasharray="2 5"/><text x="${L-8}" y="${sy(tick)+4}" text-anchor="end">${rank?tick:tick.toLocaleString('en-GB',{notation:'compact',maximumFractionDigits:1})}</text>`;
  const xticks=mode==='linear'?Array.from({length:6},(_,i)=>story.start+(story.end-story.start)*i/5):knots;
  const spacing=Math.max(1,Math.ceil(xticks.length/Math.max(2,(W-L-R)/85)));
  xticks.forEach((x,i)=>{if(i%spacing===0||i===xticks.length-1)svg+=`<text x="${sx(x)}" y="${H-B+22}" text-anchor="${i===0?'start':i===xticks.length-1?'end':'middle'}">${axis==='year'?String(Math.round(x)):fmt(x)}</text>`;if(mode!=='linear'&&i>0&&i<xticks.length-1)svg+=`<line x1="${sx(x)}" x2="${sx(x)}" y1="${T}" y2="${H-B}" stroke="#aa6a22" opacity=".5" stroke-dasharray="3 5"/>`;});
  const paths=rank?rankPhaseSegments(vehicles,story.phases,story.intervals,sx,sy):[];
  if(!rank)for(const v of vehicles)for(const phase of story.phases){
    let d='',pen=false,lastY,lastX,emittedX;
    const begin=axis==='year'?Math.max(phase.start,v.year):phase.start;if(begin>=phase.end)continue;
    // Sample in screen space: narrow phases need fewer points than wide phases.
    const steps=stepped?Math.max(1,Math.ceil((sx(phase.end)-sx(begin))/2)):50;
    for(let i=0;i<=steps;i++){
      const x=begin+(phase.end-begin)*i/steps,y=story.valueAt(v.id,x);if(y==null){pen=false;continue;}
      const px=sx(x),py=sy(y);
      if(!pen||!stepped){d+=`${pen?'L':'M'}${px},${py} `;emittedX=px;}
      else if(py!==lastY){d+=`H${px} V${py} `;emittedX=px;}
      lastX=px;lastY=py;pen=true;
    }
    if(stepped&&pen&&lastX!==emittedX)d+=`H${lastX} `;
    if(d)paths.push({t:v,d,winner:phase.leaders.includes(v.id)});
  }
  let overlay='';
  for(const v of vehicles)if(axis==='year'&&v.year===story.end)overlay+=`<circle cx="${sx(story.end)}" cy="${sy(rank?story.endRanks[v.id]:story.valueAt(v.id,story.end))}" r="3" fill="${v.color}"><title>${escape(v.name)} · introduced ${v.year}</title></circle>`;
  overlay+=`<line class="phase-current-setting" style="${current>=story.start&&current<=story.end?'':'display:none'}" x1="${sx(current)}" x2="${sx(current)}" y1="${T}" y2="${H-B}" stroke="currentColor" stroke-dasharray="6 4"><title>Current setting: ${axis==='year'?String(Math.round(current)):fmt(current)}</title></line>`;
  overlay+=`<text x="${(L+W-R)/2}" y="${H-8}" text-anchor="middle">${escape(label)} · ${mode==='linear'?'linear':rank?'all rank changes':'leader phase focus'}</text>`;
  renderPhaseDiagram(container,{trains:vehicles,segments:paths,frame:svg,overlay,width:W,height:H,left:L,right:R,top:T,bottom:B,title:`${label}: ${rank?'vehicle rank changes':'running cost phases'}`,group:'road',
    endpoints:vehicles.map(t=>{const value=rank?(story.endRanks?.[t.id]??story.intervals.at(-1).ranks[t.id]):story.valueAt(t.id,story.end);return {t,y:value==null?NaN:sy(value),winner:story.endRanks?story.endRanks[t.id]===1:story.phases.at(-1).leaders.includes(t.id)};}),
    bands:story.phases.map(p=>({leaders:p.leaders,width:scale.position(p.end)-scale.position(p.start)}))});
  layouts.set(container,{story,width:W,mode,rank,axis,stepped,sx});
}
let cacheKey,cached;
export function renderRoadPhases(document,datasets,selection,options){
  const node=id=>document.getElementById(id),axis=node('road-phase-axis').querySelector('input:checked').value;
  let vehicles=selectRoadVehicles(styleVehicleCatalogues(datasets),{...selection,year:axis==='year'?2035:selection.year});
  vehicles=vehicles.filter(v=>roadRouteSpeeds(v,options).eligible);
  const domain=axis==='year'?{start:1900,end:2035}:axis==='utilization'?{start:1,end:100}:{start:.01,end:Math.max(5,options.distanceKm)};
  const current=axis==='year'?selection.year:axis==='utilization'?options.fillRatio*100:options.distanceKm;
  const label=axis==='year'?'Game year':axis==='utilization'?'Utilization (%)':'One-way distance (km)';
  // The swept parameter belongs to the marker, not to the curve cache.
  const phaseOptions={...options,...(axis==='distance'?{distanceKm:1}:axis==='utilization'?{fillRatio:1}:{})};
  const key=JSON.stringify([vehicles,phaseOptions,axis,domain]);
  if(key!==cacheKey){cached=roadPhaseStory(vehicles,phaseOptions,{axis,...domain});cacheKey=key;}
  node('road-phase-help').textContent=`${label} varies over ${axis==='year'?String(domain.start):fmt(domain.start)}–${axis==='year'?String(domain.end):fmt(domain.end)}; other settings remain fixed. Dashed line: current setting. ${axis==='distance'&&options.routeProfile?'All segment lengths scale together; their gradients and speed limits remain fixed. ':''}${axis==='year'?'Vehicles enter at their introduction year; retirement dates are not applied.':''}`;
  phaseChart(node('road-cost-phases-chart'),vehicles,cached,{axis,label,current,mode:node('road-cost-scale').querySelector('input:checked').value,rank:false,stepped:options.demandPerYear!=null});
  phaseChart(node('road-rank-phases-chart'),vehicles,cached,{axis,label,current,mode:node('road-rank-scale').querySelector('input:checked').value,rank:true});
}
