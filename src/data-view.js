import {escapeHtml as escape,formatNumber as fmt} from './format.js';
import {createModel} from './model.js';
import {RAIL_MOTION} from './gradient.js';

export function renderDataView(dataset,trains,experiments) {
  document.getElementById('experiment-cards').innerHTML=experiments.experiments.map(e=>`<article class="experiment-card"><div class="panel-top"><h3>${escape(e.topic)}</h3><span class="evidence-status">${escape(e.status)}</span></div><p>${escape(e.observation)}</p><p><strong>Used in the model:</strong> ${escape(e.adopted)}</p><p class="chart-help">${escape(e.limits)}</p></article>`).join('');
  const calibration=experiments.experiments.find(e=>e.id==='rail-acceleration');
  // The measurements have a fixed setup; route controls must never alter a check.
  const selected=new Set(trains.map(t=>t.id));
  const measured=new Map((calibration?.measurements??[]).flatMap(record=>{
    const train=dataset.trains.find(t=>t.id===record.vehicleId);
    return train&&selected.has(train.id)?[[train.id,{train,record,model:createModel(train,dataset.source)}]]:[];
  }));
  document.getElementById('motion-validation').innerHTML=[...measured.values()].flatMap(({train,record,model})=>record.increments.map((steps,i)=>{
    const time=steps*RAIL_MOTION.stepSeconds,state=model.stateAt(time),distance=record.distanceMetres[steps],metres=state.distanceKm*1000;
    return `<tr><th scope="row">${escape(train.name)}</th><td>${steps}</td><td>${fmt(time,1)}</td><td>${fmt(record.speedKmh[i])}</td><td>${fmt(state.speedKmh,2)}</td><td>${fmt(state.speedKmh-record.speedKmh[i],2)}</td><td>${distance==null?'—':fmt(distance,2)}</td><td>${fmt(metres,2)}</td><td>${distance==null?'—':fmt(metres-distance,2)}</td></tr>`;
  })).join('')||'<tr><td colspan="9">No increment measurements for trains matching the current filters.</td></tr>';
  const rows=[];
  const row=(checkpoint,quantity,observed,predicted,difference)=>rows.push(`<tr><th scope="row">${escape(checkpoint)}</th><td>${escape(quantity)}</td><td>${escape(observed)}</td><td>${escape(predicted)}</td><td>${escape(difference)}</td></tr>`);
  const point=calibration?.raceCheckpoint;
  const reference=measured.get(point?.referenceVehicleId),other=measured.get(point?.otherVehicleId);
  if(reference){
    const time=reference.model.timeAt(point.referenceDistanceMetres/1000),speed=reference.model.stateAt(time).speedKmh;
    const label=`${reference.train.name} at ${fmt(point.referenceDistanceMetres,2)} m`;
    row(label,`${reference.train.name} speed`,`${fmt(point.referenceSpeedKmh)} km/h`,`${fmt(speed,2)} km/h`,`${fmt(speed-point.referenceSpeedKmh,2)} km/h`);
    if(other){
      const state=other.model.stateAt(time),lead=point.referenceDistanceMetres-state.distanceKm*1000;
      row(label,`${other.train.name} speed`,`${fmt(point.otherSpeedKmh)} km/h`,`${fmt(state.speedKmh,2)} km/h`,`${fmt(state.speedKmh-point.otherSpeedKmh,2)} km/h`);
      const offset=point.initialNoseOffsetMagnitudeMetres,range=(value)=>`${fmt(value-offset,2)}–${fmt(value+offset,2)} m`;
      row(label,'Nose-to-nose lead (both initial offset directions)',`${fmt(point.leadMetres)} m`,range(lead),range(lead-point.leadMetres));
    }
  }
  const crossing=calibration?.raceCrossover;
  const first=measured.get(crossing?.referenceVehicleId),second=measured.get(crossing?.otherVehicleId);
  if(first){
    const state=first.model.stateAt(crossing.firstReferenceAheadIncrement*RAIL_MOTION.stepSeconds),metres=state.distanceKm*1000;
    row(`Increment ${crossing.firstReferenceAheadIncrement}`,`${first.train.name} distance`,`${fmt(crossing.referenceReportedDistanceMetres,2)} m`,`${fmt(metres,2)} m`,`${fmt(metres-crossing.referenceReportedDistanceMetres,2)} m`);
    if(second){
      const offset=crossing.initialNoseOffsetMagnitudeMetres;
      const horizon=Math.max(...first.record.increments,...second.record.increments);
      let step=1;
      for(;step<=horizon;step++)if((first.model.stateAt(step*RAIL_MOTION.stepSeconds).distanceKm-second.model.stateAt(step*RAIL_MOTION.stepSeconds).distanceKm)*1000>offset)break;
      row('First nose crossover',`${second.train.name} initially ${fmt(offset,2)} m ahead (inferred)`,`${crossing.lastOtherAheadIncrement} → ${crossing.firstReferenceAheadIncrement}`,step<=horizon?`${step-1} → ${step}`:'Beyond measured increments','—');
    }
  }
  document.getElementById('motion-checkpoints').innerHTML=rows.join('')||'<tr><td colspan="5">No race checkpoints for trains matching the current filters.</td></tr>';
  document.getElementById('motion-checkpoint-note').textContent=calibration?'Distances are compared as displacement from each train’s own initial nose position. The measured initial nose offset is 0.47 m; its direction was not separately confirmed. The 5 km lead shows both directions. The crossover calculation assumes the TGV starts ahead, as inferred from the 83 → 84 bracket. This repeat supersedes the earlier approximate 170 m crossing.':'';
}
