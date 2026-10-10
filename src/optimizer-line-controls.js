import {railLineTiers,roadLineTiers,segmentLineTiers} from './optimizer-line-infrastructure.js';
import {UI_TERMS as T} from './ui-terms.js';
import {formatNumber} from './format.js';

/** Lane counts are route constraints, never choices made by the optimizer. */
export function mountOptimizerLineInfrastructure(root,{getRoute,getScope,onRouteChange,onChange}){
  root.innerHTML=`<details class="panel-group" open><summary>Tracks &amp; roads</summary><div class="panel-group-body">
    <label class="road-inline-check"><input type="checkbox" data-line-costs> Include route ${T.runningCosts}</label>
    <label class="road-inline-check" data-tram-option><input type="checkbox" data-include-trams> Include trams in Road search</label>
    <p class="chart-help" data-tram-help hidden>Trams use Road tracks or dedicated tracks, chosen per segment. Road tracks add no upkeep and cannot use 100/120 km/h highway tiers. Dedicated tram tracks cost $20,000/km/year for both directions, with a 100 km/h maximum. The nine confirmed light-rail models are also searched with Rail.</p>
    <div data-tram-segments></div>
    <div data-line-settings><p class="chart-help">Choose the cheapest feasible tier for each segment, including its upkeep. City segments and non-tier speed limits stay constrained; tier selection cannot raise a curve limit.</p>
    <div data-line-segments></div><p class="chart-help" data-line-track-help>Auto uses one track for a one-train service, or two tracks (one per direction) for larger fleets. Passing loops, shared switches and signal capacity are not modeled.</p><details><summary>Maintenance tariffs</summary><div data-line-tariffs class="chart-help"></div></details></div>
  </div></details>`;
  let key='',lanes=new Map(),tracks=new Map(),tramTracks=new Map();
  const checkbox=root.querySelector('[data-line-costs]');
  const trams=root.querySelector('[data-include-trams]');
  function routeValue(){return getRoute().map((part,i)=>({...part,roadLanes:lanes.get(i)??part.roadLanes??2,railTracks:tracks.has(i)?tracks.get(i):part.railTracks??null,tramInfrastructure:tramTracks.get(i)??part.tramInfrastructure??'auto'}));}
  function refresh(){
    root.querySelector('[data-line-settings]').hidden=!checkbox.checked;
    const route=getRoute(),scope=getScope(),includeTrams=trams.checked&&scope.domain!=='rail',next=JSON.stringify([route,scope.domain,scope.year,includeTrams]);
    root.querySelector('[data-tram-option]').hidden=scope.domain==='rail';
    root.querySelector('[data-tram-help]').hidden=!includeTrams;
    root.querySelector('[data-tram-segments]').hidden=!includeTrams;
    if(next===key)return;
    key=next;lanes=new Map(route.map((part,i)=>[i,part.roadLanes??2]));tracks=new Map(route.map((part,i)=>[i,part.railTracks??null]));tramTracks=new Map(route.map((part,i)=>[i,part.tramInfrastructure??'auto']));
    root.querySelector('[data-tram-segments]').innerHTML=route.map((part,i)=>`<div class="optimizer-line-segment"><strong>Tram · segment ${i+1} · ${formatNumber(part.distanceKm,4)} km</strong><fieldset class="scale-toggle"><legend>Tram infrastructure</legend>${[['auto','Auto'],['road','Road tracks'],['dedicated','Dedicated tracks']].map(([value,label])=>`<label><input type="radio" name="optimizer-tram-tracks-${i}" data-tram-segment="${i}" value="${value}"${tramTracks.get(i)===value?' checked':''}><span>${label}</span></label>`).join('')}</fieldset></div>`).join('');
    root.querySelector('[data-line-track-help]').hidden=scope.domain==='road';
    root.querySelector('[data-line-segments]').innerHTML=route.map((part,i)=>{
      const tiers=segmentLineTiers(part,'road',scope.year),city=tiers[0]?.city;
      return `<div class="optimizer-line-segment"><strong>Segment ${i+1} · ${formatNumber(part.distanceKm,4)} km${scope.domain!=='rail'&&city?' · City':''}</strong>
        ${scope.domain==='road'?'':`<fieldset class="scale-toggle"><legend>Rail tracks</legend>${[['auto','Auto'],['2','2 tracks']].map(([value,label])=>`<label><input type="radio" name="optimizer-rail-tracks-${i}" data-track-segment="${i}" value="${value}"${(tracks.get(i)===2?'2':'auto')===value?' checked':''}><span>${label}</span></label>`).join('')}</fieldset>`}
        ${scope.domain==='rail'?'':`<fieldset class="scale-toggle"><legend>Road lanes</legend>${[2,4].map(count=>`<label><input type="radio" name="optimizer-road-lanes-${i}" data-lane-segment="${i}" value="${count}"${lanes.get(i)===count?' checked':''}><span>${count} lanes</span></label>`).join('')}</fieldset>`}</div>`;
    }).join('');
    const road=roadLineTiers(scope.year);
    root.querySelector('[data-line-tariffs]').innerHTML=`${scope.domain!=='road'?`<p>Rail available in ${scope.year}: ${railLineTiers(scope.year).map(tier=>`${tier.speed} km/h · $${formatNumber(tier.maintenance,0,true)}`).join('; ')} per track per km/year. 160 km/h unlocks in 1930; 350 in 1980.</p>`:''}${scope.domain!=='rail'?`<p>Road ${scope.year<1940?'before 1940':'from 1940'}: ${road.map(tier=>`${tier.speed} km/h${tier.city?' (city)':''} · $${formatNumber(tier.maintenance,0,true)}${tier.speed===120?' (4 lanes)':tier.speed===100?' (2 lanes only)':' (2 lanes; ×2 for 4)'}`).join('; ')} per km/year. ${scope.year<1940?'No faster road tier is available. ':''}Extra lanes provide no modeled performance gain.</p>`:''}`;
  }
  root.addEventListener('change',event=>{
    const input=event.target;
    if(input.hasAttribute('data-lane-segment')||input.hasAttribute('data-track-segment')||input.hasAttribute('data-tram-segment')){
      if(input.hasAttribute('data-lane-segment'))lanes.set(Number(input.dataset.laneSegment),Number(input.value));
      else if(input.hasAttribute('data-track-segment'))tracks.set(Number(input.dataset.trackSegment),input.value==='auto'?null:2);
      else tramTracks.set(Number(input.dataset.tramSegment),input.value);
      const route=routeValue(),scope=getScope();
      // Parent refresh must not replace the radio currently holding keyboard focus.
      key=JSON.stringify([route,scope.domain,scope.year,trams.checked&&scope.domain!=='rail']);
      onRouteChange?.(route);
    }
    refresh();onChange();
  });
  refresh();
  return {refresh,getValue:()=>checkbox.checked?{}:null,getRoute:routeValue,includeTrams:()=>trams.checked&&getScope().domain!=='rail'};
}
