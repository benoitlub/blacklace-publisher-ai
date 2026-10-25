const endpoint="https://blacklace-publisher-worker.benoitlubert.workers.dev/api/observatory/sources?limit=500";
const want=["gerard-explorer-playwright","gerard-art-direction","gerard-impeccable-quality","gerard-media-blender"];
try{
 const response=await fetch(endpoint,{signal:AbortSignal.timeout(25000)});
 const body=await response.json();
 const sources=Array.isArray(body.sources)?body.sources:[];
 const found=want.map(id=>({id,present:sources.some(source=>
   JSON.stringify(source).includes(id))}));
 console.log(JSON.stringify({http:response.status,configured:body.configured??true,
   count:sources.length,found,allPresent:found.every(x=>x.present)}));
 if(!response.ok||!found.every(x=>x.present))process.exitCode=1;
}catch(e){console.log(JSON.stringify({status:"not-confirmed",error:e.name}));process.exitCode=1;}
