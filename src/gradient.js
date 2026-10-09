export const GRAVITY = 9.80665;
export const MOTION_UNITS = {kgfNewtons:9.80665,horsepowerWatts:735.5};
export const RAIL_MOTION = Object.freeze({stepSeconds:.2,tractionFactor:2,frictionAcceleration:.02});

// Provisional road coefficients: initialized from rail, calibrated independently.
export const ROAD_MOTION = Object.freeze({...RAIL_MOTION,brakingDeceleration:2.5});

export function validateGradient(percent,maximum=20) {
  if(!Number.isFinite(percent)||Math.abs(percent)>maximum)throw new RangeError(`Gradient must be between -${maximum}% and ${maximum}%`);
  return percent;
}

/** Grade is rise / horizontal run; distance remains the travelled route length. */
export function gradientAcceleration(percent) {
  validateGradient(percent);
  return GRAVITY*Math.sin(Math.atan(percent/100));
}

/** Starting uphill requires strictly more traction than the gravity component. */
export function canClimb(vehicle,percent) {
  validateGradient(percent);
  if(percent<=0)return true;
  const mass=vehicle.massTonnes*1000,force=vehicle.tractionKgf*MOTION_UNITS.kgfNewtons;
  return Number.isFinite(mass)&&mass>0&&Number.isFinite(force)&&force>mass*gradientAcceleration(percent);
}

/** Rail uses the observed effective traction and constant friction, also at 0%. */
export function canClimbRail(vehicle,percent) {
  validateGradient(percent);
  const mass=vehicle.massTonnes*1000,force=vehicle.tractionKgf*MOTION_UNITS.kgfNewtons*RAIL_MOTION.tractionFactor;
  return Number.isFinite(mass)&&mass>0&&Number.isFinite(force)&&
    force>mass*(gradientAcceleration(percent)+RAIL_MOTION.frictionAcceleration);
}

/** Road retains its steady-speed assumption, with an uphill traction/power limit. */
export function roadGradientSpeeds(vehicle,percent,speedLimit=null) {
  validateGradient(percent);
  const maximum=Math.min(vehicle.maxSpeedKmh,speedLimit??Infinity);
  if(!percent)return {eligible:true,outboundSpeedKmh:maximum,returnSpeedKmh:maximum,effectiveSpeedKmh:maximum};
  const resistance=vehicle.massTonnes*1000*Math.abs(gradientAcceleration(percent));
  const power=vehicle.powerCh*MOTION_UNITS.horsepowerWatts;
  if(!canClimb(vehicle,Math.abs(percent))||!Number.isFinite(power)||power<=0)return {eligible:false};
  const uphill=Math.min(maximum,power/resistance*3.6);
  const outboundSpeedKmh=percent>0?uphill:maximum,returnSpeedKmh=percent<0?uphill:maximum;
  return {eligible:true,outboundSpeedKmh,returnSpeedKmh,effectiveSpeedKmh:2/(1/outboundSpeedKmh+1/returnSpeedKmh)};
}
