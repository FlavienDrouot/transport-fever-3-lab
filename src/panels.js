export function syncAnalysisPanels(document,view,{domain='rail'}={}){
  const $=id=>document.getElementById(id);
  const roadView=view==='trucks'||view==='race'&&domain==='road';
  document.querySelector('.workspace').classList.toggle('truck-view',roadView);
  document.querySelector('.workspace').classList.toggle('data-view',view==='data');
  document.querySelector('.workspace').classList.toggle('route-profile-view',view==='route-profile');
  document.querySelector('.workspace').classList.toggle('configurator-view',view==='configurator');
  document.querySelector('.workspace').classList.toggle('optimizer-view',view==='optimizer');
  const trainView=view==='economics'||view==='race'&&!roadView;
  $('catalogue').hidden=!trainView;
  $('picker-toggle').hidden=!trainView;
  $('road-sidebar').hidden=!roadView;
  $('road-picker-toggle').hidden=!roadView;
  $('configuration-sidebar').hidden=view!=='configurator';
  $('configuration-picker-toggle').hidden=view!=='configurator';
  $('profile-sidebar').hidden=view!=='route-profile';
  $('profile-picker-toggle').hidden=view!=='route-profile';
  $('line-capacity').hidden=view!=='economics';
  $('train-race-settings').hidden=!trainView&&!roadView&&view!=='optimizer';
  $('rail-service-note').hidden=view!=='economics';
  if(!trainView&&$('train-drawer').open)$('train-drawer').close();
  if(!roadView&&$('road-drawer').open)$('road-drawer').close();
  if(view!=='configurator'&&$('configuration-drawer').open)$('configuration-drawer').close();
  if(view!=='route-profile'&&$('profile-drawer').open)$('profile-drawer').close();
}

export function mountPanelDrawers(document,mobile) {
  const $=id=>document.getElementById(id);
  for(const ids of [
    {drawer:'train-drawer',panel:'catalogue',toggle:'picker-toggle',close:'picker-close',anchor:'catalogue-anchor',focus:'train-search'},
    {drawer:'road-drawer',panel:'road-sidebar',toggle:'road-picker-toggle',close:'road-picker-close',anchor:'road-sidebar-anchor',focus:'road-vehicle-search'},
    {drawer:'configuration-drawer',panel:'configuration-sidebar',toggle:'configuration-picker-toggle',close:'configuration-picker-close',anchor:'configuration-sidebar-anchor',focus:'configuration-search'},
    {drawer:'profile-drawer',panel:'profile-sidebar',toggle:'profile-picker-toggle',close:'profile-picker-close',anchor:'profile-sidebar-anchor',focus:'profile-segment-list'},
  ]){
    const drawer=$(ids.drawer),panel=$(ids.panel),toggle=$(ids.toggle);
    const sync=()=>{
      if(mobile.matches)drawer.append(panel);
      else {if(drawer.open)drawer.close();$(ids.anchor).before(panel);}
    };
    toggle.addEventListener('click',()=>{
      drawer.showModal();toggle.setAttribute('aria-expanded','true');document.body.classList.add('picker-open');
      const target=$(ids.focus);
      for(let parent=target.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
      (target.matches('input')?target:target.querySelector('input:checked')??target.querySelector('input')??target.querySelector('button')).focus();
    });
    $(ids.close).addEventListener('click',()=>drawer.close());
    drawer.addEventListener('click',event=>{const box=drawer.getBoundingClientRect();if(event.target===drawer&&(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom))drawer.close();});
    drawer.addEventListener('close',()=>{toggle.setAttribute('aria-expanded','false');document.body.classList.remove('picker-open');if(mobile.matches&&!toggle.hidden)toggle.focus();});
    mobile.addEventListener('change',sync);sync();
  }
}
