/** Visible help works by click, touch and keyboard, alongside existing descriptions. */
let index=0;
const mounted=new WeakSet();
export function mountControlHelp(document,root=document) {
  for (const button of root.querySelectorAll('.control-info')) {
    if(mounted.has(button))continue;
    let description = document.getElementById(button.getAttribute('aria-describedby'));
    if(!description&&button.title){
      description=document.createElement('span');description.id=`control-help-${++index}`;description.textContent=button.title;
      const host=button.closest('.service-winner,.target-control,.infrastructure-control,.service-option-group,.panel-group-body,p')??button.parentElement;
      host.append(description);button.setAttribute('aria-describedby',description.id);
    }
    if (!description) continue;
    mounted.add(button);
    button.setAttribute('aria-controls', description.id);
    button.setAttribute('aria-expanded', 'false');
    description.classList.remove('sr-only');
    description.classList.add('control-help-text');
    description.hidden = true;
    button.addEventListener('click', () => {
      description.hidden = !description.hidden;
      button.setAttribute('aria-expanded', String(!description.hidden));
    });
    button.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        description.hidden = true;
        button.setAttribute('aria-expanded', 'false');
      }
    });
  }
}
