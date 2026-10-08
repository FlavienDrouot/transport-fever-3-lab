const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Original purchase-list images, ordered and oriented for a complete formation. */
export function vehicleThumbnail(item,index){
  const parts=index?.components?.[item.id]?.parts;
  if(!parts?.length)return '';
  const ratio=parts.reduce((total,part)=>total+part.width/part.height,0);
  return `<span class="vehicle-thumbnail" aria-hidden="true"><span class="thumbnail-formation" style="aspect-ratio:${ratio};width:min(100%,${ratio*48}px)">${parts.map(part=>`<img src="${escape(part.src)}" width="${part.width}" height="${part.height}" alt="" loading="lazy" decoding="async" style="width:${100*(part.width/part.height)/ratio}%"${part.reverse?' class="thumbnail-reversed"':''}>`).join('')}</span></span>`;
}
