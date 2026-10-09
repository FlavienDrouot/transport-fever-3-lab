import {gradientAcceleration,validateGradient} from './gradient.js';

// Stable logarithmic primitives of v/(q-bv) and v²/(q-bv).
function logTerms(z,log=-Math.log1p(-z)) {
  if(Math.abs(z)<.02){
    let l1=0,l2=0,l3=0,power=1;
    for(let k=0;k<12;k++,power*=z){l1+=power/(k+1);l2+=power/(k+2);l3+=power/(k+3);}
    return [l1,l2,l3];
  }
  return [log/z,(log-z)/z**2,(log-z-z*z/2)/z**3];
}

/** Constant grade: m dv/dt = min(Fmax,P/v) - mg sin(atan(grade)). */
export function createGradientModel(train,units,gradePercent,rebuild) {
  validateGradient(gradePercent);
  const m=train.massTonnes*1000,f=train.tractionKgf*units.kgfNewtons,p=train.powerCh*units.horsepowerWatts;
  const nominal=train.maxSpeedKmh/3.6,b=gradientAcceleration(gradePercent),a=f/m-b,q=p/m;
  if(![m,f,p,nominal].every(n=>Number.isFinite(n)&&n>0))throw new RangeError('Invalid physical parameters');
  const valid=n=>{if(!Number.isFinite(n)||n<0)throw new RangeError('Invalid time or distance');};
  const common={gradePercent,withGradient:grade=>rebuild(train,units,grade),withSpeedLimit:limit=>rebuild({...train,maxSpeedKmh:Math.min(train.maxSpeedKmh,limit)},units,gradePercent)};
  if(a<=0)return {...common,canStart:false,effectiveMaxSpeedKmh:0,tractionEndSeconds:0,speedCapSeconds:0,speedCapKm:0,
    stateAt:t=>{valid(t);return {speedKmh:0,distanceKm:0};},timeAt:km=>{valid(km);return km===0?0:Infinity;}};
  // Uphill equilibrium is asymptotic. Its final 1e-8 relative speed gap is
  // approximated by a steady tail, keeping finite chart horizons and inversions.
  const terminal=b>0?q/b:Infinity,vmax=Math.min(nominal,terminal*(1-1e-8));
  const v1=Math.min(p/f,vmax),t1=v1/a,x1=v1*t1/2,D=q-b*v1;
  const primitives=(w,z,log)=>{
    const [l1,l2,l3]=logTerms(z,log);
    return {time:t1+v1*w/D*l1+w*w/D*l2,
      distance:x1+v1*v1*w/D*l1+2*v1*w*w/D*l2+w**3/D*l3,
      speed:v1+w};
  };
  const powerState=v=>{
    const w=v-v1;return primitives(w,b*w/D);
  };
  // On an uphill power phase, solve in the logarithm of the remaining
  // force rather than velocity. Its derivatives stay finite at equilibrium.
  const logarithmic=b>0;
  const upper=logarithmic?-Math.log1p(-b*(vmax-v1)/D):vmax;
  const at=logarithmic?s=>{
    const z=-Math.expm1(-s);return primitives(D/b*z,z,s);
  }:powerState;
  const end=at(upper),t2=end.time,x2=end.distance;
  const invert=(target,key)=>{
    let low=logarithmic?0:v1,high=upper,coordinate=(low+high)/2;
    for(let i=0;i<55;i++){
      const state=at(coordinate),error=state[key]-target;
      if(Math.abs(error)<=1e-11*Math.max(1,target))return state;
      if(error<0)low=coordinate;else high=coordinate;
      const v=state.speed;
      const derivative=(key==='time'?v:v*v)/(logarithmic?b:q-b*v);
      const next=coordinate-error/derivative;
      coordinate=next>low&&next<high?next:(low+high)/2;
    }
    return at(coordinate);
  };
  const asymptoticSpeed=terminal<=nominal;
  const displaySpeed=vmax*.999;
  const speedViewSeconds=asymptoticSpeed?(displaySpeed<=v1?displaySpeed/a:powerState(displaySpeed).time):t2;
  return {...common,canStart:true,effectiveMaxSpeedKmh:vmax*3.6,
    tractionEndSeconds:t1,speedCapSeconds:t2,speedCapKm:x2/1000,speedViewSeconds,asymptoticSpeed,
    motionParameters:{tractionAcceleration:f/m,powerPerMass:q,gravity:b},
    motionAtSpeed(speedKmh){const v=Math.min(vmax,Math.max(0,speedKmh/3.6));return v<=v1?{time:v/a,distance:v*v/(2*a)}:powerState(v);},
    stateAt(t){
      valid(t);
      if(t<=t1)return {speedKmh:a*t*3.6,distanceKm:a*t*t/2000};
      if(t>=t2)return {speedKmh:vmax*3.6,distanceKm:(x2+vmax*(t-t2))/1000};
      const state=invert(t,'time');return {speedKmh:state.speed*3.6,distanceKm:state.distance/1000};
    },
    timeAt(km){
      valid(km);const x=km*1000;
      if(x<=x1)return Math.sqrt(2*x/a);
      if(x>=x2)return t2+(x-x2)/vmax;
      return invert(x,'distance').time;
    }};
}
