import {optimizeService} from './optimizer.js';
self.onmessage=({data})=>{
  try{
    const search=optimizeService(data.catalogue,data.request);let step,last=-Infinity;
    do{step=search.next();if(!step.done&&performance.now()-last>100){self.postMessage({type:'progress',...step.value});last=performance.now();}}while(!step.done);
    self.postMessage({type:'complete',result:step.value});
  }catch(error){self.postMessage({type:'error',message:error.message});}
};
