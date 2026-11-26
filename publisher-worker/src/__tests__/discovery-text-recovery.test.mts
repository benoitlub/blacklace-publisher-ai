import test from 'node:test';
import assert from 'node:assert/strict';
import { searchPublicWeb, fetchPublicPage } from '../public-web-discovery.ts';
import { generateCloudflareText, TEXT_MODEL } from '../cloudflare-text.ts';

test('search uses keyless public endpoint and preserves citation evidence without executing candidates', async () => {
  const result = await searchPublicWeb('text generation API', async (url, init) => {
    assert.equal(String(url), 'https://api.keenable.ai/v1/search/public');
    assert.equal(new Headers(init?.headers).has('Authorization'), false);
    assert.equal(new Headers(init?.headers).get('X-Keenable-Title'), 'Blacklace Publisher');
    return Response.json({results:[{title:'Official docs',url:'https://example.org/docs',snippet:'Text generation API'}, {url:'javascript:alert(1)'}]});
  });
  assert.deepEqual(result.data.citations, [{title:'Official docs',url:'https://example.org/docs',description:'Text generation API'}]);
  assert.equal(result.executable, false);
});
test('search rate limits and malformed responses fail visibly without retries', async () => {
  let calls=0;
  await assert.rejects(searchPublicWeb('text',async()=>{calls++; return new Response('',{status:429});}), /http-429/);
  assert.equal(calls,1);
  await assert.rejects(searchPublicWeb('text',async()=>Response.json({})), /invalid-search-response/);
});
test('page retrieval keeps public evidence and refuses private targets', async () => {
  let calls=0;
  const result=await fetchPublicPage('https://example.org/docs',100,async(url)=>{calls++;assert.equal(new URL(String(url)).pathname,'/v1/fetch/public');return Response.json({content:'Text generation API documentation'});});
  assert.match(result.data.content,/Text generation/);
  for (const url of ['http://127.0.0.1/', 'http://169.254.169.254/', 'file:///etc/passwd', 'https://user:pass@example.org/'])
    await assert.rejects(fetchPublicPage(url,100,async()=>{calls++;return Response.json({});}));
  assert.equal(calls,1);
});
test('Cloudflare generates one bounded text artifact with actual provider provenance', async () => {
  let calls=0,reservations=0;
  const result=await generateCloudflareText({run:async(model,input)=>{
    calls++; assert.equal(model,TEXT_MODEL); assert.equal(input.max_completion_tokens,1000);
    assert.equal(input.stream,false); assert.equal(Object.hasOwn(input,'audio'),false);
    return {choices:[{message:{content:'Bonjour Benoît.'}}],usage:{completion_tokens:4}};
  }},{title:'Test',prompt:'Bonjour',maxTokens:5000},async()=>{reservations++;return true;});
  assert.equal(calls,1);assert.equal(reservations,1);
  assert.equal(result.content,'Bonjour Benoît.');assert.equal(result.metadata.provider,'cloudflare-workers-ai');
});
test('missing binding, oversized context and exhausted budget never invoke inference', async () => {
  let calls=0;const ai={run:async()=>{calls++;return {};}};
  await assert.rejects(generateCloudflareText(undefined,{title:'Test',prompt:'Hi'},async()=>true),/binding-missing/);
  await assert.rejects(generateCloudflareText(ai,{title:'Test',prompt:'é'.repeat(9000)},async()=>true),/context-too-large/);
  await assert.rejects(generateCloudflareText(ai,{title:'Test',prompt:'Hi'},async()=>false),/budget-exhausted/);
  assert.equal(calls,0);
});
test('upstream failure and missing final content are not retried or fabricated', async () => {
  let calls=0;
  await assert.rejects(generateCloudflareText({run:async()=>{calls++;throw Error('upstream-unavailable');}},{title:'Test',prompt:'Hi'},async()=>true),/upstream-unavailable/);
  assert.equal(calls,1);
  for(const payload of [{response:''},{choices:[{message:{content:'<think>private reasoning</think>'}}]}])
    await assert.rejects(generateCloudflareText({run:async()=>payload},{title:'Test',prompt:'Hi'},async()=>true),/no-final-content/);
});
