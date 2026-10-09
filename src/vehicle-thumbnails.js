import {escapeHtml as escape} from './format.js';

/** Original purchase-list images, with an optional leading-section catalogue view. */
export function vehicleThumbnail(item,index,{headOnly=false}={}){
  const formation=index?.components?.[item.id]?.parts;
  if(!formation?.length)return '';
  const parts=headOnly?formation.slice(0,1):formation;
  const ratio=parts.reduce((total,part)=>total+part.width/part.height,0);
  return `<span class="vehicle-thumbnail" aria-hidden="true"><span class="thumbnail-formation" style="aspect-ratio:${ratio};width:min(100%,${ratio*48}px)">${parts.map(part=>`<img src="${escape(part.src)}" width="${part.width}" height="${part.height}" alt="" loading="lazy" decoding="async" style="width:${100*(part.width/part.height)/ratio}%"${part.reverse?' class="thumbnail-reversed"':''}>`).join('')}</span></span>`;
}
