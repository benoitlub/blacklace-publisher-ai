#!/usr/bin/env node
// Read-only Reddit community research. Public endpoints can refuse access;
// inaccessible or ambiguous rules are NEVER interpreted as permission to post.
import fs from "node:fs";
const projects=[
 {id:"terra",title:"TERRA",candidates:["printSF","scifi","sciencefiction","selfpublish"]},
 {id:"vacances-interdites",title:"Les Vacances Interdites",candidates:["scifi","YAlit","selfpublish","writing"]},
 {id:"gerard-et-gerard",title:"Gérard et Gérard",candidates:["books","selfpublish","writing"]},
 {id:"kif-et-molla",title:"Kiff et Molla",candidates:["books","selfpublish","writing"]},
 {id:"jeux",title:"Pro.hibited / Feuch Dice / Jointed",candidates:["boardgames","tabletopgamedesign","cardgames","BoardgameDesign"]}
];
const unique=[...new Set(projects.flatMap(p=>p.candidates))];
const headers={"User-Agent":"PublisherCommunityScout/0.2 (read-only research; contact via repository issues)","Accept":"application/json"};
async function getJson(url){
 const ctrl=new AbortController(), timer=setTimeout(()=>ctrl.abort(),4500);
 try {
  const r=await fetch(url,{headers,signal:ctrl.signal,redirect:"error"});
  if(!r.ok)return {ok:false,error:"HTTP_"+r.status};
  const body=await r.json();return {ok:true,body};
 }catch(e){return {ok:false,error:e?.name==="AbortError"?"TIMEOUT":"UNAVAILABLE"}}
 finally{clearTimeout(timer)}
}
const keywords=/self.promo|promot|advertis|spam|commercial|solicit|link|market|book|survey|crowdfund|kickstart|sale/i;
async function review(name){
 const base="https://www.reddit.com/r/"+encodeURIComponent(name);
 const [about,rules,posts]=await Promise.all([
  getJson(base+"/about.json"),getJson(base+"/about/rules.json"),getJson(base+"/hot.json?limit=10")
 ]);
 const data=about.ok?about.body?.data:null;
 const ruleItems=rules.ok&&Array.isArray(rules.body?.rules)?rules.body.rules:[];
 const examples=posts.ok&&Array.isArray(posts.body?.data?.children)
  ?posts.body.data.children.slice(0,6).map(x=>({title:String(x.data?.title??"").slice(0,180),permalink:x.data?.permalink?("https://www.reddit.com"+x.data.permalink):null})):[];
 const relevantRules=ruleItems.filter(x=>keywords.test(String(x.short_name??"")+" "+String(x.description??""))).map(x=>({title:x.short_name,description:String(x.description??"").slice(0,600)}));
 const hasData=Boolean(data)&&rules.ok&&posts.ok;
 return {name,url:base,publicDataAccessible:hasData,access:{about:about.ok?"ok":about.error,rules:rules.ok?"ok":rules.error,posts:posts.ok?"ok":posts.error},
  description:data?String(data.public_description??"").slice(0,350):null,
  subscribers:Number.isFinite(data?.subscribers)?data.subscribers:null,
  over18:typeof data?.over18==="boolean"?data.over18:null,
  recentExamples:examples,ruleCount:ruleItems.length,relevantRules,
  status:hasData?"requires-human-rule-review":"unverified-access",
  promotionalPermission:"NOT_ESTABLISHED",
  note:"Automated keyword matching cannot establish subreddit permission, relevance or eligibility. Review full rules, pinned posts and recent activity manually."};
}
const communities=[];
for(const name of unique)communities.push(await review(name));
const byName=new Map(communities.map(x=>[x.name,x]));
const report={contract:"publisher-reddit-community-scout-v2",generatedAt:new Date().toISOString(),mode:"read-only-community-qualification",
 disclaimer:"Candidate names are hypotheses, not recommendations. No community is approved for promotion automatically. Reddit may block anonymous public requests; do not bypass restrictions.",
 sources:["https://redditinc.com/policies/reddit-rules","https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam"],
 projects:projects.map(p=>({id:p.id,title:p.title,candidates:p.candidates.map(n=>byName.get(n)),nextAction:"Human verifies full rules and recent threads; propose useful contribution for approval only."})),
 communitiesChecked:communities.length,communitiesAccessible:communities.filter(c=>c.publicDataAccessible).length,
 automaticPublishing:false,paidAdvertising:false};
const out=process.argv[2];if(out)fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");else console.log(JSON.stringify(report,null,2));
