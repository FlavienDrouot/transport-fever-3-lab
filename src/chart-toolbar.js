// On narrow screens, scale switches and exports wait behind one "Chart options" button so the chart comes first.
const HIDEABLE='fieldset[id$="-scale"],.exports';
export function mountChartToolbars(document){
  for(const toolbar of document.querySelectorAll('.chart-toolbar')){
    if(!toolbar.querySelector(HIDEABLE)||toolbar.querySelector('.chart-options-toggle'))continue;
    const button=document.createElement('button');
    button.type='button';button.className='chart-options-toggle';button.textContent='Chart options';
    button.setAttribute('aria-expanded','false');
    button.addEventListener('click',()=>{
      const open=toolbar.classList.toggle('options-open');
      button.setAttribute('aria-expanded',String(open));
    });
    toolbar.append(button);
  }
}
