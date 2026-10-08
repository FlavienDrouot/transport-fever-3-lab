const previewRows=10;
export function updateTablePreview(document,bodyId){
  const button=document.querySelector?.(`[data-expand-table="${bodyId}"]`);
  if(!button)return;
  const body=document.getElementById(bodyId);
  const count=body.rows.length,expanded=button.getAttribute('aria-expanded')==='true';
  body.classList.toggle('compact-rows',!expanded);
  button.hidden=count<=previewRows;
  button.textContent=expanded?`Show first ${previewRows} rows`:`Show all ${count} rows`;
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
