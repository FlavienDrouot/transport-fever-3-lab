import {analyseLine} from './line.js';

/** Bounded ranking story: crossings before 100 m and beyond the selected route are omitted. */
export function economicStory(trains, distance, fill) {
  return rankingStory(trains.map(t=>t.id), (id,x)=>analyseLine(trains.find(t=>t.id===id), {distanceKm:x,fillRatio:fill}).efficiency, .1, distance, fill>0);
}

export function rankingStory(ids, score, start, end, enabled = true) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start<=0 || end<=start) throw new RangeError('Invalid ranking domain');
  if (!ids.length || !enabled) return {start,end,roots:[],intervals:[],phases:[]};
  const grid = [...new Set(Array.from({length:513},(_,i)=>[start+(end-start)*i/512,start*(end/start)**(i/512)]).flat())].sort((a,b)=>a-b);
  const values = Object.fromEntries(ids.map(id=>[id,grid.map(x=>score(id,x))]));
  const delta = (a,b) => (a-b)/Math.max(Math.abs(a),Math.abs(b),Number.MIN_VALUE);
  const roots=[];
  for(let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++) {
    const a=ids[i],b=ids[j];let priorSign=0,priorX=start;
    for(let k=0;k<grid.length;k++) {
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
    const scores=ids.map(id=>({id,value:score(id,x)}));
    const tolerance=Math.max(...scores.map(s=>Math.abs(s.value)),Number.MIN_VALUE)*1e-9;
    const ranks=Object.fromEntries(scores.map(s=>[s.id,1+scores.filter(other=>other.value>s.value+tolerance).length]));
    const leaders=ids.filter(id=>ranks[id]===1).sort();
    intervals.push({start:first,end:last,ranks});
    if(phases.at(-1)?.leaders.join('|')===leaders.join('|')) phases.at(-1).end=last;
    else phases.push({start:first,end:last,leaders});
  }
  return {start,end,roots:distinct,intervals,phases};
}
