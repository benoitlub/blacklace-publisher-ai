import { readFile } from "node:fs/promises";
const bundle = JSON.parse(await readFile(new URL("../knowledge-packs/gerard-creative-skills-2026-10/tool-packs.json",import.meta.url),"utf8"));
const endpoint="https://blacklace-publisher-worker.benoitlubert.workers.dev/api/observatory/sources";
let ok=0;const results=[];
for(const pack of bundle.packs){
  const url="https://github.com/benoitlub/blacklace-publisher-ai/blob/feature/gerard-four-creative-skill-packs/knowledge-packs/gerard-creative-skills-2026-10/tool-packs.json#"+pack.id;
  const payload={
    id:"gerard-observatory-"+pack.id,
    kind:"github-tool-pack",value:url,name:pack.title,
    category:"creative-automation",
    summary:pack.capabilities.join(", ")+" — "+pack.deliverables.join(", "),
    confidence:0.98,
    tags:["gerard","publisher","octopus","tool-pack","creative-workflow",pack.id],
    pack:{contract:"publisher-gerard-skill-observation-v1",bundle:bundle.bundle,
      source:"user-approved-reel-references",state:"proposed-not-executed",
      permissions:bundle.guardrails,details:pack},
    features:pack.capabilities,patterns:pack.workflow,recommendations:pack.acceptance,
    language:"fr"
  };
  const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)});
  const result=await response.json().catch(()=>({}));
  const saved=["ok","persisted-without-octopus"].includes(result.status);
  if(saved)ok++;
  results.push({id:pack.id,http:response.status,status:String(result.status??"unknown"),persisted:saved});
}
console.log(JSON.stringify({bundle:bundle.bundle,expected:bundle.packs.length,persisted:ok,results}));
if(ok!==bundle.packs.length)process.exitCode=1;
