export function syncAnalysisPanels(document,view){
  const $=id=>document.getElementById(id);
  document.querySelector('.workspace').classList.toggle('truck-view',view==='trucks');
  document.querySelector('.workspace').classList.toggle('data-view',view==='data');
  const trainView=view==='race'||view==='economics';
  $('catalogue').hidden=!trainView;
  $('picker-toggle').hidden=!trainView;
  $('road-sidebar').hidden=view!=='trucks';
  $('road-picker-toggle').hidden=view!=='trucks';
  if(!trainView&&$('train-drawer').open)$('train-drawer').close();
  if(view!=='trucks'&&$('road-drawer').open)$('road-drawer').close();
}

export function mountPanelDrawers(document,mobile) {
  const $=id=>document.getElementById(id);
  for(const ids of [
    {drawer:'train-drawer',panel:'catalogue',toggle:'picker-toggle',close:'picker-close',anchor:'catalogue-anchor',focus:'train-search'},
    {drawer:'road-drawer',panel:'road-sidebar',toggle:'road-picker-toggle',close:'road-picker-close',anchor:'road-sidebar-anchor',focus:'road-category'},
  ]){
    const drawer=$(ids.drawer),panel=$(ids.panel),toggle=$(ids.toggle);
    const sync=()=>{
      if(mobile.matches)drawer.append(panel);
      else {if(drawer.open)drawer.close();$(ids.anchor).before(panel);}
    };
    toggle.addEventListener('click',()=>{
      drawer.showModal();toggle.setAttribute('aria-expanded','true');document.body.classList.add('picker-open');
      const target=$(ids.focus);(target.matches('input')?target:target.querySelector('input:checked')??target.querySelector('input')).focus();
    });
    $(ids.close).addEventListener('click',()=>drawer.close());
    drawer.addEventListener('click',event=>{const box=drawer.getBoundingClientRect();if(event.target===drawer&&(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom))drawer.close();});
    drawer.addEventListener('close',()=>{toggle.setAttribute('aria-expanded','false');document.body.classList.remove('picker-open');if(mobile.matches&&!toggle.hidden)toggle.focus();});
    mobile.addEventListener('change',sync);sync();
  }
}
