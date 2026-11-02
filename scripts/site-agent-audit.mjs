#!/usr/bin/env node
// Publisher site-agent audit v1. Public sites only, read-only, no credentials.
import fs from "node:fs";
const targets=process.argv.slice(2).filter(x=>!x.startsWith("--"));
const outArg=process.argv.find(x=>x.startsWith("--out="));
const output=outArg?.slice(6);
const urls=targets.length?targets:["https://benoitlub.github.io/prohibited-portal/"];
function checkTarget(s){
 const u=new URL(s);
 if(u.protocol!=="https:"||u.username||u.password||!u.hostname||u.port)throw Error("HTTPS public hostname required");
 if(/^(localhost|.*\\.localhost|.*\\.local|.*\\.internal)$/i.test(u.hostname)||/^\\d+\\.\\d+\\.\\d+\\.\\d+$/.test(u.hostname)||u.hostname.includes(":"))throw Error("Private/IP hosts forbidden");
 return u;
}
async function fetchText(u){
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),9000);
 try{
  const r=await fetch(u,{signal:c.signal,redirect:"manual",headers:{"User-Agent":"PublisherSiteAudit/1.0 (+read-only site diagnostics)"}});
  const ct=r.headers.get("content-type")||"";
  if(!r.ok||r.status>=300)return {status:r.status,error:"HTTP status / redirect; not followed"};
  if(!/text\\/html|text\\/plain|application\\/xml|text\\/xml/i.test(ct))return {status:r.status,error:"Unsupported content type"};
  const length=Number(r.headers.get("content-length")||0);
  if(length>1500000)return {status:r.status,error:"Response too large"};
  const body=(await r.text()).slice(0,1500000);
  return {status:r.status,body,contentType:ct};
 }catch(e){return {error:e?.name==="AbortError"?"Timeout":"Fetch unavailable"}}
 finally{clearTimeout(timer)}
}
function capture(html,re){return html.match(re)?.[1]?.trim()||null}
async function audit(raw){
 const u=checkTarget(raw),home=await fetchText(u.href);
 const result={url:u.href,checkedAt:new Date().toISOString(),httpStatus:home.status??null,fetchError:home.error??null,checks:[],recommendations:[],limitations:["Static HTTP/HTML audit only; no JavaScript rendering, mobile performance measurement, agent transaction test, or search ranking guarantees."]};
 const add=(id,ok,detail,fix)=>{result.checks.push({id,status:ok?"pass":"review",detail});if(!ok&&fix)result.recommendations.push({id,action:fix,requiresApproval:true})};
 if(!home.body){add("homepage-fetch",false,home.error||"No HTML","Investigate public access and redirects manually");return result}
 const h=home.body;
 add("title",/<title\\b[^>]*>[^<]{8,}<\\/title>/i.test(h),"HTML title","Add a descriptive unique title");
 add("meta-description",/<meta\\b(?=[^>]*name=["']description["'])(?=[^>]*content=["'][^"']{40,})[^>]*>/i.test(h),"Meta description","Add a useful description");
 add("lang",/<html\\b[^>]*\\blang=["'][a-z]{2}/i.test(h),"Document language","Declare html lang");
 add("viewport",/<meta\\b[^>]*name=["']viewport["']/i.test(h),"Viewport metadata","Add responsive viewport metadata");
 add("h1",/<h1\\b/i.test(h),"Primary heading","Provide a clear visible H1");
 add("canonical",/<link\\b(?=[^>]*rel=["']canonical["'])[^>]*>/i.test(h),"Canonical URL","Add canonical URL if appropriate");
 add("structured-data",/<script\\b[^>]*type=["']application\\/ld\\+json["']/i.test(h),"JSON-LD","Consider accurate Schema.org structured data");
 add("open-graph",/property=["']og:title["']/i.test(h),"Open Graph title","Add social preview metadata");
 add("navigation",/<nav\\b/i.test(h),"Semantic navigation","Add accessible navigation if missing");
 const links=[...h.matchAll(/<a\\b[^>]*href=["']([^"'#]+)["']/gi)].map(x=>x[1]);
 add("links",links.length>0,links.length+" links detected","Add descriptive navigable links");
 const images=[...h.matchAll(/<img\\b[^>]*>/gi)].map(x=>x[0]);
 add("image-alt",images.every(x=>/\\balt=["'][^"']*["']/i.test(x)),images.length+" images checked","Review alt text on images");
 const robots=await fetchText(new URL("/robots.txt",u.origin).href);
 result.robots={status:robots.status??null,accessible:!!robots.body,error:robots.error??null};
 add("robots-txt",!!robots.body,"robots.txt availability","Review crawler directives; absence does not imply blocked indexing");
 const sitemap=await fetchText(new URL("/sitemap.xml",u.origin).href);
 result.sitemap={status:sitemap.status??null,accessible:!!sitemap.body,error:sitemap.error??null};
 add("sitemap",!!sitemap.body,"sitemap.xml availability","Consider sitemap for public content");
 result.linkSample=links.slice(0,12);
 result.score={passed:result.checks.filter(x=>x.status==="pass").length,total:result.checks.length,meaning:"Diagnostic checklist count, not a search or agent visibility score"};
 return result;
}
const reports=[];
for(const url of urls){try{reports.push(await audit(url))}catch(e){reports.push({url,error:e.message})}}
const report={contract:"publisher-site-agent-audit-v1",mode:"read-only",generatedAt:new Date().toISOString(),reports,approvalRequiredForChanges:true,autoFix:false,autoPublish:false};
const json=JSON.stringify(report,null,2)+"\\n";
if(output)fs.writeFileSync(output,json);else process.stdout.write(json);
