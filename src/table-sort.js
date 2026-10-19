// Click-to-sort column headers: one active column, missing values always last.
export function sortRows(items,{key,dir},accessors,tieBreak=item=>item.name){
  const read=accessors[key],sign=dir==='asc'?1:-1;
  const missing=value=>value==null||Number.isNaN(value);
  return [...items].sort((a,b)=>{
    const x=read(a),y=read(b);
    if(missing(x)||missing(y))return missing(x)-missing(y);
    return (typeof x==='string'?x.localeCompare(y,'en'):x-y)*sign||String(tieBreak(a)).localeCompare(String(tieBreak(b)),'en');
  });
}
/** Clicking the active column reverses it; another column starts in its natural direction. */
export function nextSort(current,key,firstDirection={}){
  return current.key===key?{key,dir:current.dir==='asc'?'desc':'asc'}:{key,dir:firstDirection[key]??'desc'};
}
/** Turn `th[data-sort]` labels into buttons and keep aria-sort in step with the state. */
export function mountSortHeaders(head,getState,onSort){
  if(!head)return {sync(){}};
  for(const th of head.querySelectorAll('th[data-sort]')){
    th.innerHTML=`<button type="button" class="sort-button" data-sort-key="${th.dataset.sort}">${th.innerHTML}<span class="sort-indicator" aria-hidden="true"></span></button>`;
  }
  const sync=()=>{
    const {key,dir}=getState();
    for(const th of head.querySelectorAll('th[data-sort]')){
      const active=th.dataset.sort===key;
      th.setAttribute('aria-sort',active?(dir==='asc'?'ascending':'descending'):'none');
      th.querySelector('.sort-indicator').textContent=active?(dir==='asc'?'▲':'▼'):'';
    }
  };
  head.addEventListener('click',event=>{const button=event.target.closest('[data-sort-key]');if(button){onSort(button.dataset.sortKey);sync();}});
  sync();
  return {sync};
}
