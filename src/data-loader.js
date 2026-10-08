/** Lazy loading shares in-flight requests; failed requests can be retried. */
export function createDataLoader(fetcher, baseUrl) {
  const cache=new Map();
  return function load(name) {
    if(!cache.has(name)) {
      const request=Promise.resolve().then(()=>fetcher(new URL(`../data/${name}.json`,baseUrl))).then(response=>{
        if(!response.ok)throw new Error(`${name} data unavailable`);
        return response.json();
      }).catch(error=>{cache.delete(name);throw error;});
      cache.set(name,request);
    }
    return cache.get(name);
  };
}
