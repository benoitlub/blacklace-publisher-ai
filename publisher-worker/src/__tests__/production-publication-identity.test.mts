import test from 'node:test';
import assert from 'node:assert/strict';
import workerModule from '../worker.ts';
import {verifyGerardGithubOidc} from '../gerard-github-oidc.ts';
import {productionPublicationToken,forwardMetricoolPublication} from '../../../artifacts/api-server/src/publisher/metricool-forward.ts';

test('publication identity is scoped to Production/main, its own audience and signed GitHub claims',async t=>{
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'fixture',use:'sig'};
 t.mock.method(globalThis,'fetch',async()=>Response.json({keys:[jwk]}));
 const now=Math.floor(Date.now()/1000);
 const base={iss:'https://token.actions.githubusercontent.com',aud:'blacklace-publisher-gerard-production-publish',repository:'benoitlub/poulpe-fiction',ref:'refs/heads/main',workflow_ref:'benoitlub/poulpe-fiction/.github/workflows/gerard-production.yml@refs/heads/main',sub:'repo:benoitlub/poulpe-fiction:ref:refs/heads/main',event_name:'schedule',iat:now,exp:now+300};
 async function token(change={}) {
  const part=(x:unknown)=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const data=part({alg:'RS256',kid:'fixture'})+'.'+part({...base,...change});
  return data+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(data))).toString('base64url');
 }
 assert.equal(await verifyGerardGithubOidc(await token(),'production-publish'),true);
 const worker='fetch' in workerModule ? workerModule : workerModule.default;
 const publication={operationId:'fixture-operation',harvestId:'fixture-harvest',text:'Une proposition de test simulée',media:[],networks:['facebook'],source:'gerard',decision:'schedule',dryRun:false};
 for(const enabled of ['false','true']) {
  const response=await worker.fetch(new Request('https://publisher.example/api/social/publication/finalize',{method:'POST',headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json'},body:JSON.stringify(publication)}),{METRICOOL_PUBLISHING_ENABLED:enabled} as never);
  const body=await response.json() as any;
  assert.equal(body.scheduled,false);
  assert.equal(body.stage,enabled==='false'?'authorization':'persistence','valid identity must pass authentication but cannot write without the remaining dependencies');
 }

 assert.equal(await verifyGerardGithubOidc(await token(),'runtime-send'),false);
 for(const change of [{aud:'blacklace-publisher-gerard-owner-test'},{workflow_ref:'benoitlub/poulpe-fiction/.github/workflows/gerard-runtime.yml@refs/heads/main'},{ref:'refs/heads/other'},{repository:'another/repo'},{exp:now-1},{event_name:'pull_request'}])assert.equal(await verifyGerardGithubOidc(await token(change),'production-publish'),false);
});

test('Node forwarder obtains a fresh GitHub identity without a new static secret',async()=>{
 const calls:string[]=[];
 const env={GITHUB_WORKFLOW_REF:'benoitlub/poulpe-fiction/.github/workflows/gerard-production.yml@refs/heads/main',ACTIONS_ID_TOKEN_REQUEST_URL:'https://github.example/token',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'fixture-request-token'};
 const fetchImpl=async(url:any,init:any)=>{
  calls.push(String(url));
  if(String(url).startsWith('https://github.example')) {assert.equal(new URL(url).searchParams.get('audience'),'blacklace-publisher-gerard-production-publish');return Response.json({value:'fixture-jwt'});}
  assert.equal(init.headers.Authorization,'Bearer fixture-jwt');assert.ok(!init.body.includes('fixture-jwt'));
  assert.equal(JSON.parse(init.body).dryRun,false);
  return Response.json({status:'confirmed-scheduled',scheduled:true,postId:'fixture-post'});
 };
 const r=await forwardMetricoolPublication({dryRun:false,operationId:'stable'}, {workerUrl:'https://publisher.example',fetchImpl,getToken:()=>productionPublicationToken({env,fetchImpl})});
 assert.equal(r.status,'confirmed-scheduled');assert.equal(calls.length,2);
 assert.equal(await productionPublicationToken({env:{...env,GITHUB_WORKFLOW_REF:'other'},fetchImpl}),null);assert.equal(calls.length,2);
 const blocked=await forwardMetricoolPublication({dryRun:false},{workerUrl:'https://publisher.example',getToken:async()=>{throw Error('unavailable');},fetchImpl});
 assert.equal(blocked.reason,'GITHUB_PUBLICATION_IDENTITY_UNAVAILABLE');assert.equal(calls.length,2);
});
