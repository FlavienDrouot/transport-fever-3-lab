const previewRows=10;
export function updateTablePreview(document,bodyId){
  const button=document.querySelector?.(`[data-expand-table="${bodyId}"]`);
  if(!button)return;
  const body=document.getElementById(bodyId);
  if(!body){button.hidden=true;return;}
  const count=(body.rows ?? body.children).length,expanded=button.getAttribute('aria-expanded')==='true';
  body.classList.toggle('compact-rows',!expanded);
  button.hidden=count<=previewRows;
  const label=button.dataset.previewLabel??'rows';
  button.textContent=expanded?`Show first ${previewRows} ${label}`:`Show all ${count} ${label}`;
}
export function mountTablePreviews(document){
  for(const button of document.querySelectorAll('[data-expand-table]')){
    button.addEventListener('click',()=>{
      button.setAttribute('aria-expanded',button.getAttribute('aria-expanded')==='true'?'false':'true');
      updateTablePreview(document,button.dataset.expandTable);
    });
    updateTablePreview(document,button.dataset.expandTable);
  }
}
