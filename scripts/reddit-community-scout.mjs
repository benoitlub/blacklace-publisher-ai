#!/usr/bin/env node
// Publisher Reddit community scout: read-only research planning.
// No Reddit authentication, posting, messaging, scraping or paid advertising.
import fs from "node:fs";
const projects = [
  {id:"terra",title:"TERRA",topics:["science fiction","cosmic fiction","indie books"],kind:"book"},
  {id:"vacances-interdites",title:"Les Vacances Interdites",topics:["YA science fiction","humorous sci fi","indie books"],kind:"book"},
  {id:"gerard-et-gerard",title:"Gérard et Gérard",topics:["absurd fiction","humor books","indie books"],kind:"book"},
  {id:"kif-et-molla",title:"Kiff et Molla",topics:["comic fiction","absurd fiction","indie books"],kind:"book"},
  {id:"jeux",title:"Pro.hibited / Feuch Dice / Jointed",topics:["indie board games","card game design","tabletop games"],kind:"game"}
];
const enc = encodeURIComponent;
const url = q => "https://www.reddit.com/search/?q="+enc(q)+"&type=communities";
const checks = ["Open subreddit rules and pinned threads at time of participation","Verify self-promotion, external-link and commercial restrictions","Check age/karma requirements and whether moderator approval is needed","Confirm topical relevance with recent human discussions","Prefer genuine participation; never mass-post, auto-comment, DM or purchase ads"];
const opportunities = projects.map(p=>({
  project:p.id,title:p.title,kind:p.kind,
  status:"discovery-only",communitiesVerified:0,
  searches:p.topics.map(topic=>({topic,communitySearch:url(topic),status:"unverified"})),
  reviewChecklist:checks,
  proposal:"Research community norms and draft a helpful, non-promotional contribution for human approval.",
  approvalRequired:true,autoPublish:false,paidAds:false
}));
const report={contract:"publisher-reddit-community-scout-v1",generatedAt:new Date().toISOString(),
  capability:"audience.community.discovery",provider:"reddit",mode:"read-only-research-plan",
  caveat:"Search links are leads, not validated subreddits or permission to promote.",
  sources:["https://redditinc.com/policies/reddit-rules","https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam"],
  opportunities};
const out=process.argv[2];if(out)fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
else process.stdout.write(JSON.stringify(report,null,2)+"\n");
