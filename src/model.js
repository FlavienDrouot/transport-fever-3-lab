import {gradientAcceleration,validateGradient,RAIL_MOTION} from './gradient.js';

/** Calibrated rail increments, shared by flat and theoretical graded motion. */
export function createModel(train,units,{gradePercent=0}={}) {
  validateGradient(gradePercent);
  const m=train.massTonnes*1000,f=train.tractionKgf*units.kgfNewtons*RAIL_MOTION.tractionFactor;
  const p=train.powerCh*units.horsepowerWatts,nominal=train.maxSpeedKmh/3.6;
  if(![m,f,p,nominal].every(n=>Number.isFinite(n)&&n>0))throw new RangeError('Invalid physical parameters');
  const h=RAIL_MOTION.stepSeconds,b=RAIL_MOTION.frictionAcceleration+gradientAcceleration(gradePercent);
  const a=f/m-b,q=p/m;
  const valid=n=>{if(!Number.isFinite(n)||n<0)throw new RangeError('Invalid time or distance');};
  const common={gradePercent,withGradient:grade=>createModel(train,units,{gradePercent:grade}),
    withSpeedLimit:limit=>createModel({...train,maxSpeedKmh:Math.min(train.maxSpeedKmh,limit)},units,{gradePercent})};
  if(a<=0)return {...common,canStart:false,effectiveMaxSpeedKmh:0,tractionEndSeconds:0,speedCapSeconds:0,speedCapKm:0,
    stateAt:t=>{valid(t);return {speedKmh:0,distanceKm:0};},timeAt:km=>{valid(km);return km===0?0:Infinity;}};
  const terminal=b>0?q/b:Infinity,asymptoticSpeed=terminal<=nominal;
  // As before, only the final relative 1e-8 equilibrium gap becomes a steady tail.
  const vmax=asymptoticSpeed?terminal*(1-1e-8):nominal;
  const threshold=Math.min(p/f,vmax),tractionSteps=Math.ceil(threshold/(a*h));
  // Every uncapped constant-traction step is exactly quadratic. Skip them in
  // bulk so a barely climbable custom formation cannot require a huge table.
  const constantSteps=Math.max(0,tractionSteps-1),baseTime=constantSteps*h;
  const baseSpeed=a*baseTime,baseDistance=a*baseTime*baseTime/2;
  const speeds=[baseSpeed],distances=[baseDistance];
  let speed=baseSpeed,distance=baseDistance;
  while(speed<vmax){
    const acceleration=Math.min(f,speed>0?p/speed:Infinity)/m-b;
    const next=Math.min(vmax,speed+acceleration*h);
    distance+=(speed+next)*h/2;speed=next;
    speeds.push(speed);distances.push(distance);
  }
  const capTime=baseTime+(speeds.length-1)*h,capDistance=distance;
  // Upper bound in a monotone table; inversions never replay simulation steps.
  const interval=(values,target)=>{
    let low=0,high=values.length-1;
    while(high-low>1){const mid=(low+high)>>1;if(values[mid]<=target)low=mid;else high=mid;}
    return low;
  };
  const segment=(index,seconds)=>{
    const acceleration=(speeds[index+1]-speeds[index])/h;
    return {speed:speeds[index]+acceleration*seconds,
      distance:distances[index]+speeds[index]*seconds+acceleration*seconds*seconds/2};
  };
  const motionAtSpeed=speedKmh=>{
    const v=Math.min(vmax,Math.max(0,speedKmh/3.6));
    if(v<=baseSpeed)return {time:v/a,distance:v*v/(2*a)};
    if(v>=vmax)return {time:capTime,distance:capDistance};
    const i=interval(speeds,v),seconds=h*(v-speeds[i])/(speeds[i+1]-speeds[i]);
    return {time:baseTime+i*h+seconds,distance:segment(i,seconds).distance};
  };
  return {...common,canStart:true,effectiveMaxSpeedKmh:vmax*3.6,asymptoticSpeed,
    tractionEndSeconds:Math.min(tractionSteps*h,capTime),speedCapSeconds:capTime,speedCapKm:capDistance/1000,
    speedViewSeconds:asymptoticSpeed?motionAtSpeed(vmax*3.6*.99).time:capTime,
    motionParameters:{tractionAcceleration:f/m,powerPerMass:q,gravity:b},motionAtSpeed,
    stateAt(t){
      valid(t);
      if(t<=baseTime)return {speedKmh:a*t*3.6,distanceKm:a*t*t/2000};
      if(t>=capTime)return {speedKmh:vmax*3.6,distanceKm:(capDistance+vmax*(t-capTime))/1000};
      const offset=(t-baseTime)/h,i=Math.min(speeds.length-2,Math.floor(offset));
      const state=segment(i,(offset-i)*h);
      return {speedKmh:state.speed*3.6,distanceKm:state.distance/1000};
    },
    timeAt(km){
      valid(km);const x=km*1000;
      if(x<=baseDistance)return Math.sqrt(2*x/a);
      if(x>=capDistance)return capTime+(x-capDistance)/vmax;
      const i=interval(distances,x),dx=x-distances[i],v=speeds[i],acceleration=(speeds[i+1]-v)/h;
      const seconds=2*dx/(v+Math.sqrt(v*v+2*acceleration*dx));
      return baseTime+i*h+seconds;
    }};
}
