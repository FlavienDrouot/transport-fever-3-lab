export const ANALYSIS_VIEWS=['race','economics','trucks','configurator','route-profile','data'];
export const initialNavigation=()=>({space:'compare',view:'race',railView:'race',roadView:'trucks',designView:'configurator',dataView:'catalogue',domain:'rail'});

/** Keep existing chart hashes while remembering the last workspace within each space. */
export function resolveNavigation(state,{hash='',owner=null,dataSection=null}={}){
  const id=hash.replace(/^#/,'');
  let view=owner;
  if(id==='compare')view=state.domain==='road'?state.roadView:state.railView;
  else if(id==='road-race')view='race';
  else if(id==='design')view=state.designView;
  else if(['data','models','checks'].includes(id))view='data';
  else if(ANALYSIS_VIEWS.includes(id))view=id;
  if(!ANALYSIS_VIEWS.includes(view))return state;
  const next={...state,view};
  if(['race','economics','trucks'].includes(view)){
    next.space='compare';next.domain=view==='trucks'||id==='road-race'||(view==='race'&&id!=='race'&&state.domain==='road')?'road':'rail';
    if(next.domain==='road')next.roadView=view;else next.railView=view;
  }else if(view==='data'){
    next.space='data';
    next.dataView=dataSection??(id==='models'?'models':id==='checks'?'checks':id==='data'?'catalogue':state.dataView);
  }else {next.space='design';next.designView=view;}
  return next;
}
