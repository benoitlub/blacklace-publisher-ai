import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGeminiText, GEMINI_TEXT_MODEL } from '../gemini-text.ts';
const request={title:'Essai',prompt:'Un texte bref'};
test('bounded text-only request protects the key and preserves provider evidence',async()=>{
 let calls=0;
 const result=await generateGeminiText(' private-key ',{...request,maxTokens:5000},async(url,init)=>{
  calls++; assert.equal(String(url),`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent`);
  assert.equal(String(url).includes('private-key'),false);
  assert.equal(new Headers(init?.headers).get('x-goog-api-key'),'private-key');
  const body=JSON.parse(String(init?.body)); assert.equal(body.generationConfig.maxOutputTokens,1000); assert.equal(body.tools,undefined);
  assert.equal(body.contents[0].parts[0].text,request.prompt);
  return Response.json({candidates:[{content:{parts:[{text:'hidden',thought:true},{text:'Réponse '},{text:'réelle.'}]},finishReason:'STOP'}],modelVersion:'verified-version',usageMetadata:{totalTokenCount:30}});
 });
 assert.equal(calls,1); assert.equal(result.content,'Réponse réelle.'); assert.equal(result.metadata.provider,'google-gemini');
 assert.equal(result.metadata.model,GEMINI_TEXT_MODEL); assert.equal(result.metadata.modelVersion,'verified-version'); assert.equal(result.metadata.usage.totalTokenCount,30);
});
test('missing credentials, empty prompt and oversized context never use network',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return Response.json({});};
 await assert.rejects(generateGeminiText('',request,fetcher),/key-missing/);
 await assert.rejects(generateGeminiText('key',{...request,prompt:' '},fetcher),/prompt-required/);
 await assert.rejects(generateGeminiText('key',{...request,prompt:'x'.repeat(16001)},fetcher),/context-too-large/);assert.equal(calls,0);
});
test('quota/server failures do not retry or expose provider error payloads',async()=>{
 for(const status of [400,403,404,429,500]){
  let calls=0; await assert.rejects(generateGeminiText('secret',request,async()=>{calls++;return Response.json({error:{message:'secret and private project'}},{status});}),error=>error.message===`gemini-text-http-${status}`);assert.equal(calls,1);
 }
});
test('empty, blocked, thought-only and truncated results never become completed artifacts',async()=>{
 for(const payload of [{},{promptFeedback:{blockReason:'SAFETY'}},{candidates:[{content:{parts:[{text:'reasoning',thought:true}]}}]}]) await assert.rejects(generateGeminiText('key',request,async()=>Response.json(payload)),/no-final-content/);
 await assert.rejects(generateGeminiText('key',request,async()=>Response.json({candidates:[{content:{parts:[{text:'unfinished'}]},finishReason:'MAX_TOKENS'}]})),/incomplete-content/);
});
