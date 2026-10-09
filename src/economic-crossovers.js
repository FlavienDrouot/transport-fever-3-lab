import {analyseEconomicService as analyseLine} from './rail-freight.js';

const axisDefinitions = {
  distance: {label:'One-way distance (km)', start:.1},
  year: {label:'Game year', start:1900},
  utilization: {label:'Utilization (%)', start:1},
  demand: {label:'Passengers / year / direction', start:1},
  headway: {label:'Frequency interval (minutes)', start:.1},
};

/** Vary one diagram parameter, keeping the scenario and its controls unchanged. */
export function economicStory(trains, distance, fill, targets = {}, {axis='distance',year=2035} = {}) {
  if(axis==='utilisation')axis='utilization';
  if(!axisDefinitions[axis])throw new RangeError('Unknown economic axis');
  const start=axis==='distance'?Math.min(axisDefinitions.distance.start,distance/10):axisDefinitions[axis].start;
  const label=axis==='demand'&&targets.freight?'Cargo units / year delivered':axisDefinitions[axis].label;
  const rateKey=targets.freight?'demandPerYear':'demandPerDirection';
  const current={distance,year,utilization:fill*100,demand:targets[rateKey]??null,headway:targets.maxHeadwaySeconds==null?null:targets.maxHeadwaySeconds/60}[axis];
  const end={distance,year:2035,utilization:100,demand:Math.max(1000,current??0),headway:Math.max(10,current??0)}[axis];
  const byId=new Map(trains.map(train=>[train.id,train]));
  const values=new Map();
  const valueAt=(id,x)=>{
    const train=byId.get(id);
    if(!train || (axis==='year' && train.year>Math.floor(x)))return null;
    const cacheKey=axis==='year'?id:`${id}:${x}`;
    if(values.has(cacheKey))return values.get(cacheKey);
    const options={distanceKm:distance,fillRatio:fill,...targets};
    if(axis==='distance')options.distanceKm=x;
    if(axis==='utilization')options.fillRatio=x/100;
    if(axis==='demand')options[rateKey]=x;
    if(axis==='headway')options.maxHeadwaySeconds=x*60;
    const value=analyseLine(train,options).maintenancePerUnit;values.set(cacheKey,value);return value;
  };
  const enabled=fill>0 || axis==='utilization';
  const story=axis==='year'?yearRankingStory(trains,valueAt,start,end,enabled):rankingStory(trains.map(t=>t.id),(id,x)=>{
    const cost=valueAt(id,x);return cost===null?null:1/cost;
  },start,end,enabled,targets.routeProfile&&axis==='distance'?24:512);
  return {...story,axis,label,current,year,valueAt,discontinuous:axis==='year'||axis==='demand'||axis==='headway'||targets[rateKey]!=null||targets.maxHeadwaySeconds!=null,
    sampled:axis!=='year'&&(targets.routeProfile||targets[rateKey]!=null||targets.maxHeadwaySeconds!=null||axis==='demand'||axis==='headway')};
}

function ranksFor(ids,score,x) {
  const scores=ids.map(id=>({id,value:score(id,x)}));
  const available=scores.filter(s=>Number.isFinite(s.value)).sort((a,b)=>b.value-a.value);
  const tolerance=Math.max(...available.map(s=>Math.abs(s.value)),Number.MIN_VALUE)*1e-9;
  const ranks=Object.fromEntries(ids.map(id=>[id,null]));
  let better=0;
  for(const entry of available){
    while(available[better].value>entry.value+tolerance)better++;
    ranks[entry.id]=better+1;
  }
  return ranks;
}

/** Discrete catalogue years, including availability on the final year endpoint.
 * valueAt supplies a lower-is-better value or null when the item is unavailable.
 */
export function yearRankingStory(items,valueAt,start=1900,end=2035,enabled=true) {
  const ids=items.map(item=>item.id);
  if(!Number.isInteger(start)||!Number.isInteger(end)||end<=start)throw new RangeError('Invalid year domain');
  const byId=new Map(items.map(item=>[item.id,item]));
  const availableValueAt=(id,x)=>{
    const item=byId.get(id),year=Math.floor(x);
    return !item||item.year>year?null:valueAt(id,year);
  };
  const score=(id,x)=>{const value=availableValueAt(id,x);return value===null?null:-value;};
  const intervals=[],phases=[];
  if(enabled&&ids.length)for(let year=start;year<end;year++) {
    const ranks=ranksFor(ids,score,year);
    const leaders=ids.filter(id=>ranks[id]===1).sort();
    const previous=intervals.at(-1);
    if(previous&&ids.every(id=>previous.ranks[id]===ranks[id]))previous.end=year+1;
    else intervals.push({start:year,end:year+1,ranks});
    if(phases.at(-1)?.leaders.join('|')===leaders.join('|'))phases.at(-1).end=year+1;
    else phases.push({start:year,end:year+1,leaders});
  }
  return {start,end,roots:intervals.slice(1).map(p=>p.start),intervals,phases,axis:'year',label:'Game year',discontinuous:true,valueAt:availableValueAt,
    ranksAt:x=>ranksFor(ids,score,x)};
}

export function rankingStory(ids, score, start, end, enabled = true, samples = 512) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start<=0 || end<=start) throw new RangeError('Invalid ranking domain');
  if (!ids.length || !enabled) return {start,end,roots:[],intervals:[],phases:[]};
  const grid = [...new Set(Array.from({length:samples+1},(_,i)=>[start+(end-start)*i/samples,start*(end/start)**(i/samples)]).flat())].sort((a,b)=>a-b);
  const values = Object.fromEntries(ids.map(id=>[id,grid.map(x=>score(id,x))]));
  const delta = (a,b) => (a-b)/Math.max(Math.abs(a),Math.abs(b),Number.MIN_VALUE);
  const roots=[];
  for(let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++) {
    const a=ids[i],b=ids[j];let priorSign=0,priorX=start;
    for(let k=0;k<grid.length;k++) {
      if(!Number.isFinite(values[a][k])||!Number.isFinite(values[b][k])){priorSign=0;continue;}
      const difference=delta(values[a][k],values[b][k]);
      const sign=Math.abs(difference)<1e-10?0:Math.sign(difference);
      if(!sign) continue; // Persistent ties do not create an event.
      if(priorSign && sign!==priorSign) {
        let low=priorX,high=grid[k];
        for(let step=0;step<45;step++) {const mid=(low+high)/2;if(Math.sign(delta(score(a,mid),score(b,mid)))===priorSign) low=mid;else high=mid;}
        const root=(low+high)/2;if(root>start+1e-8 && root<end-1e-8) roots.push(root);
      }
      priorSign=sign;priorX=grid[k];
    }
  }
  const distinct=[];
  for(const root of roots.sort((a,b)=>a-b)) if(!distinct.length || root-distinct.at(-1)>Math.max(1e-7,root*1e-8)) distinct.push(root);
  const knots=[start,...distinct,end],intervals=[],phases=[];
  for(let i=0;i<knots.length-1;i++) {
    const first=knots[i],last=knots[i+1],x=(first+last)/2;
    const ranks=ranksFor(ids,score,x);
    const leaders=ids.filter(id=>ranks[id]===1).sort();
    if(intervals.length&&ids.every(id=>intervals.at(-1).ranks[id]===ranks[id]))intervals.at(-1).end=last;
    else intervals.push({start:first,end:last,ranks});
    if(phases.at(-1)?.leaders.join('|')===leaders.join('|')) phases.at(-1).end=last;
    else phases.push({start:first,end:last,leaders});
  }
  return {start,end,roots:intervals.slice(1).map(interval=>interval.start),intervals,phases};
}
