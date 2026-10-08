// Shared analysis mode control; each view keeps its own category and parameters.
export function mountTransportCategory(root, {value, onChange}) {
  root.classList.add('transport-category');
  root.innerHTML=`<legend class="sr-only">Transport category</legend><label><input type="radio" name="${root.id}" value="passengers"><span>Passengers</span></label><label><input type="radio" name="${root.id}" value="freight"><span>Freight</span></label>`;
  const setValue=category=>{root.querySelector(`input[value="${category}"]`).checked=true;};
  setValue(value);
  root.addEventListener('change',()=>onChange(root.querySelector('input:checked').value));
  return {setValue};
}
