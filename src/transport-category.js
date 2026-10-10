// Shared category selector; its owner decides which views share the value.
export function mountTransportCategory(root, {value, onChange,legend='Transport category',showLegend=false}) {
  root.classList.add('transport-category');
  root.innerHTML=`<legend${showLegend?'':' class="sr-only"'}>${legend}</legend><label><input type="radio" name="${root.id}" value="passengers"><span>Passengers</span></label><label><input type="radio" name="${root.id}" value="freight"><span>Freight</span></label>`;
  const setValue=category=>{root.querySelector(`input[value="${category}"]`).checked=true;};
  setValue(value);
  root.addEventListener('change',()=>onChange(root.querySelector('input:checked').value));
  return {setValue};
}

/** Same cargo choices for Rail, Road and Composition; filtering stays with the owner. */
export function mountFreightFilter(root,{name=root.id}={}){
  root.innerHTML='<legend class="sr-only">Freight specialization</legend>'+[['all','All freight'],['bulk','Bulk'],['goods','Goods'],['flatbed','Flatbed'],['liquid','Liquid']].map(([value,label])=>`<label><input type="radio" name="${name}" value="${value}"${value==='all'?' checked':''}><span>${label}</span></label>`).join('');
}

export const ROUTE_SPEED_PRESETS=Object.freeze([30,50,60,80,100,120,160,350]);
export const speedPresets=domain=>domain==='all'?ROUTE_SPEED_PRESETS:domain==='road'?[50,80,120]:[100,160,350];
