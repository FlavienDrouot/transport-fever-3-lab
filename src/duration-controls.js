import {syncNumberInput} from './numeric-controls.js';
import {escapeHtml} from './format.js';

/** One framed duration control with native segments and a fixed colon. */
export function durationInputs({id,name=id,label,value=300,disabled=false,describedBy=''}){
  const rounded=Math.round(value),description=describedBy?` aria-describedby="${describedBy}"`:'';
  const input=(suffix,amount,max,unit)=>`<input id="${id}${suffix}" name="${name}${suffix? 'Seconds':''}" type="number" min="0" max="${max}" step="1" value="${amount}" required${disabled?' disabled':''} aria-label="${escapeHtml(label)} · ${unit}"${description}>`;
  return `<span class="duration-entry" role="group" aria-label="${escapeHtml(label)} (minutes:seconds)">${input('',Math.floor(rounded/60),10000,'minutes')}<span class="duration-separator" aria-hidden="true">:</span>${input('-seconds',String(rounded%60).padStart(2,'0'),59,'seconds')}</span>`;
}

export function durationSeconds(minutes,seconds){return minutes.valueAsNumber*60+seconds.valueAsNumber;}

export function syncDurationInputs(minutes,seconds,value){
  const rounded=Math.round(value);
  syncNumberInput(minutes,Math.floor(rounded/60));syncNumberInput(seconds,String(rounded%60).padStart(2,'0'));
}

export function enableDurationInputs(minutes,seconds,enabled){
  minutes.disabled=seconds.disabled=!enabled;
  seconds.setCustomValidity(enabled&&durationSeconds(minutes,seconds)===0?'Duration must be greater than zero.':'');
}

const boundDocuments=new WeakSet();
export function bindDurationInputs(document){
  if(boundDocuments.has(document))return;
  boundDocuments.add(document);
  document.addEventListener('focusout',event=>{
    const input=event.target;
    if(input.matches('.duration-entry input:last-child')&&input.checkValidity())input.value=String(input.valueAsNumber).padStart(2,'0');
  });
  document.addEventListener('keydown',event=>{
    if(event.key!==':'||!event.target.matches('.duration-entry input'))return;
    event.preventDefault();
    event.target.closest('.duration-entry').querySelector('input:last-child').focus();
  });
}
