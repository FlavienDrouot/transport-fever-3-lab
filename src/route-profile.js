import {gradientAcceleration, validateGradient, MOTION_UNITS, RAIL_MOTION} from './gradient.js';

/** Ordered A→B infrastructure. Lengths are travelled kilometres, not horizontal projection. */
export function validateRouteProfile(segments) {
  if (!Array.isArray(segments) || !segments.length || segments.length > 24) throw new RangeError('A route needs 1–24 segments');
  let total = 0;
  const route = segments.map((part, index) => {
    const distanceKm=Number(part.distanceKm),gradePercent=Number(part.gradePercent),speedLimitKmh=Number(part.speedLimitKmh);
    if (!Number.isFinite(distanceKm) || distanceKm < .000001 || distanceKm > 100) throw new RangeError(`Segment ${index+1}: distance must be positive and at most 100 km`);
    validateGradient(gradePercent,9);
    if (!Number.isFinite(speedLimitKmh) || speedLimitKmh < 10 || speedLimitKmh > 350) throw new RangeError(`Segment ${index+1}: speed limit must be 10–350 km/h`);
    total+=distanceKm;
    return {distanceKm,gradePercent,speedLimitKmh};
  });
  if(total>100)throw new RangeError('Route distance must not exceed 100 km');
  return route;
}

export function reverseRouteProfile(segments) {
  return validateRouteProfile(segments).toReversed().map(part=>({...part,gradePercent:-part.gradePercent}));
}

export function routeProfileDistance(segments) {
  return validateRouteProfile(segments).reduce((total,part)=>total+part.distanceKm,0);
}

const trajectoryCache=new WeakMap();
/** Calibrated tractive force plus theoretical gravity. Profile caps and terminal stop are anticipated. */
export function routeTrajectory(train,segments,{brakeAtEnd=false,brakingDeceleration=2.5}={}) {
  const route=validateRouteProfile(segments);
  if(!Number.isFinite(brakingDeceleration)||brakingDeceleration<=0)throw new RangeError('Braking must be positive');
  const key=JSON.stringify([route,brakeAtEnd,brakingDeceleration]);
  const identity=train.model??train;
  let cache=trajectoryCache.get(identity);
  if(!cache){cache=new Map();trajectoryCache.set(identity,cache);}
  if(cache.has(key))return cache.get(key);
  const mass=train.massTonnes*1000,force=train.tractionKgf*MOTION_UNITS.kgfNewtons*RAIL_MOTION.tractionFactor,power=train.powerCh*MOTION_UNITS.horsepowerWatts;
  const vehicleCap=train.maxSpeedKmh/3.6;
  if(![mass,force,power,vehicleCap].every(n=>Number.isFinite(n)&&n>0))throw new RangeError('Invalid train motion parameters');
  let end=0;
  const sections=route.map(part=>{const start=end;end+=part.distanceKm*1000;return {start,end,gradePercent:part.gradePercent,cap:Math.min(vehicleCap,part.speedLimitKmh/3.6),gravity:gradientAcceleration(part.gradePercent)};});
  const routeMetres=end,dt=RAIL_MOTION.stepSeconds;
  const speeds=[0],distances=[0],times=[0],events=[];
  let position=0,speed=0,time=0,index=0,stalled=false,brakingLast=false;
  // The minimum braking ability over the remaining path gives a conservative
  // envelope for every future lower cap, including the stop at B.
  const targets=sections.slice(1).map((section,i)=>({distance:section.start,speed:section.cap,label:`Segment ${i+2}`}));
  if(brakeAtEnd)targets.push({distance:routeMetres,speed:0,label:'Terminal B'});
  const braking=sections.map(section=>brakingDeceleration+section.gravity);
  if(braking.some(value=>value<=0))throw new RangeError('Vehicle cannot brake on this gradient');
  const envelope=(metres,partIndex)=>{
    let allowed=sections[partIndex].cap;
    for(const target of targets){
      if(target.distance<metres-1e-7)continue;
      let distance=target.distance-metres,b=Infinity;
      for(let k=partIndex;k<sections.length&&sections[k].start<target.distance;k++)b=Math.min(b,braking[k]);
      allowed=Math.min(allowed,Math.sqrt(target.speed**2+2*b*distance));
    }
    return allowed;
  };
  const push=(t,d,v)=>{times.push(t);distances.push(d);speeds.push(v);};
  // Bounded by 100 km at 0.2 s; a stalled uphill train exits immediately.
  for(let steps=0;position<routeMetres-1e-7&&steps<2_000_000;steps++){
    const section=sections[index];
    const resistance=RAIL_MOTION.frictionAcceleration+section.gravity;
    const traction=Math.min(force,speed>0?power/speed:Infinity)/mass-resistance;
    const brake=braking[index],remaining=section.end-position;
    // Long near-equilibrium cruises need no millions of indistinguishable
    // 0.2 s samples. Stop before any future braking point or segment boundary.
    if(speed>0&&(Math.abs(traction)<1e-7||(speed>=section.cap-1e-8&&traction>=0))){
      let bulkTo=section.end;
      for(const target of targets){
        if(target.distance<=position||speed<=target.speed)continue;
        let minimumBrake=Infinity;
        for(let k=index;k<sections.length&&sections[k].start<target.distance;k++)minimumBrake=Math.min(minimumBrake,braking[k]);
        bulkTo=Math.min(bulkTo,target.distance-(speed*speed-target.speed*target.speed)/(2*minimumBrake)-speed*dt*2);
      }
      if(bulkTo-position>speed*dt*10){
        const delta=bulkTo-position;time+=delta/speed;position=bulkTo;
        push(time,position,speed);
        if(position>=section.end-1e-7&&index<sections.length-1){index++;events.push({time,distanceKm:position/1000,label:`Segment ${index+1}`});}
        continue;
      }
    }
    // A step may start under traction and finish under braking. Solve the
    // switching instant against the next cap/terminal stopping envelope.
    const stepState=(switchAt)=>{
      const first=Math.min(dt,switchAt),second=dt-first;
      const middle=Math.max(0,Math.min(section.cap,speed+traction*first));
      const finish=Math.max(0,middle-brake*second);
      const firstDistance=(speed+middle)*first/2;
      const secondDistance=(middle+finish)*second/2;
      const distance=firstDistance+secondDistance;
      if(distance<=remaining+1e-9)return {step:dt,travelled:distance,next:finish};
      // Find the exact boundary crossing on the piecewise constant-accel step.
      let low=0,high=dt;
      for(let k=0;k<36;k++){
        const h=(low+high)/2,h1=Math.min(h,first),h2=Math.max(0,h-first);
        const v1=Math.max(0,Math.min(section.cap,speed+traction*h1));
        const v2=Math.max(0,middle-brake*h2);
        const d=(speed+v1)*h1/2+(middle+v2)*h2/2;
        if(d<remaining)low=h;else high=h;
      }
      const h=(low+high)/2,h1=Math.min(h,first),h2=Math.max(0,h-first);
      return {step:h,travelled:remaining,next:h2?Math.max(0,middle-brake*h2):Math.max(0,Math.min(section.cap,speed+traction*h1))};
    };
    const excess=state=>state.next-envelope(Math.min(routeMetres,position+state.travelled),index);
    let motion=stepState(dt),switchAt=dt;
    if(excess(motion)>1e-8){
      let low=0,high=dt;
      for(let k=0;k<35;k++){
        const middle=(low+high)/2;
        if(excess(stepState(middle))>0)high=middle;else low=middle;
      }
      switchAt=(low+high)/2;motion=stepState(switchAt);
    }
    let {step,travelled,next}=motion;
    const brakingNow=switchAt<step-1e-7&&next<speed-1e-7;
    if(brakingNow&&!brakingLast){
      const middle=Math.max(0,Math.min(section.cap,speed+traction*switchAt));
      events.push({time:time+switchAt,distanceKm:(position+(speed+middle)*switchAt/2)/1000,label:'Braking'});
    }
    brakingLast=brakingNow;
    const threshold=power/force;
    if(speed<threshold-1e-7&&next>=threshold){
      const fraction=(threshold-speed)/(next-speed);
      events.push({time:time+step*fraction,distanceKm:(position+travelled*fraction)/1000,label:'Traction → power'});
    }
    if(travelled<1e-10){stalled=true;break;}
    position=Math.min(routeMetres,position+travelled);time+=step;speed=next;
    push(time,position,speed);
    if(position>=section.end-1e-7&&index<sections.length-1){index++;events.push({time,distanceKm:position/1000,label:`Segment ${index+1}`});}
  }
  if(position<routeMetres-1e-7)stalled=true;
  if(brakeAtEnd&&!stalled&&speed<.01){speed=0;speeds[speeds.length-1]=0;}
  const find=(values,target)=>{let lo=0,hi=values.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(values[mid]<=target)lo=mid;else hi=mid;}return lo;};
  const interpolate=(values,target)=>{const i=find(values,target),fraction=values[i+1]===values[i]?0:(target-values[i])/(values[i+1]-values[i]);return {time:times[i]+(times[i+1]-times[i])*fraction,distanceKm:(distances[i]+(distances[i+1]-distances[i])*fraction)/1000,speedKmh:(speeds[i]+(speeds[i+1]-speeds[i])*fraction)*3.6};};
  events.sort((a,b)=>a.time-b.time);
  const result={routeDistanceKm:routeMetres/1000,travelSeconds:stalled?Infinity:time,stalled,events,
    maxSpeedKmh:speeds.reduce((max,value)=>Math.max(max,value),0)*3.6,
    stateAt(t){if(!Number.isFinite(t)||t<0)throw new RangeError('Invalid time');if(t>=time)return {distanceKm:position/1000,speedKmh:speed*3.6};const {distanceKm,speedKmh}=interpolate(times,t);return {distanceKm,speedKmh};},
    timeAt(km){if(!Number.isFinite(km)||km<0)throw new RangeError('Invalid distance');if(km===0)return 0;if(km>position/1000+1e-9)return Infinity;return interpolate(distances,Math.min(km*1000,position)).time;}};
  if(cache.size>=12)cache.clear();cache.set(key,result);
  return result;
}

export function routeRoundTrip(train,segments,options={}) {
  const outbound=routeTrajectory(train,segments,{...options,brakeAtEnd:true});
  const back=routeTrajectory(train,reverseRouteProfile(segments),{...options,brakeAtEnd:true});
  return {travelSeconds:(outbound.travelSeconds+back.travelSeconds)/2,
    outboundTravelSeconds:outbound.travelSeconds,returnTravelSeconds:back.travelSeconds,
    outboundPeakSpeedKmh:outbound.maxSpeedKmh,returnPeakSpeedKmh:back.maxSpeedKmh,
    brakingSeconds:0,peakSpeedKmh:Math.max(outbound.maxSpeedKmh,back.maxSpeedKmh),eligible:!outbound.stalled&&!back.stalled};
}

/** Keep the relative layout when a distance phase diagram varies the route length. */
export function scaledRouteProfile(segments,distanceKm) {
  if(!Number.isFinite(distanceKm)||distanceKm<=0||distanceKm>100)throw new RangeError('Route distance must be 0–100 km');
  const route=validateRouteProfile(segments),factor=distanceKm/routeProfileDistance(route);
  return route.map(part=>({...part,distanceKm:part.distanceKm*factor}));
}
