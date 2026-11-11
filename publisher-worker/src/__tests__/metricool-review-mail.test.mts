import test from 'node:test';
import assert from 'node:assert/strict';
import {metricoolReviewMail} from '../metricool-review-mail.ts';
const payload={contract:'gerard-metricool-mail-v1',operationId:'gerard-metricool-'+ 'a'.repeat(64),harvestId:'h',seedId:'blacklace-island',brandId:'3350145',title:'Blacklace Island',networks:['facebook'],text:'Une légende source\n\nUne vraie question.',media:[]};
const input={subject:'[Gerard Metricool v1] Blacklace Island',body:JSON.stringify(payload),operationId:'gerard-mail-'+ 'a'.repeat(64),recipientEmail:'benoitlubert@gmail.com',presentation:'editorial-review-v1'};
test('owner gets a short subject and readable caption, while archive keeps the complete v1 envelope',()=>{
 const result=metricoolReviewMail(input);
 assert.ok(result.subject.length<100);assert.ok(!result.subject.includes(payload.operationId));
 assert.match(result.body,/Bonjour Benoît/);assert.ok(result.body.includes(payload.text));assert.match(result.body,/texte seul/);
 assert.match(result.body,/Aucune programmation ou publication confirmée/);
 assert.ok(!result.body.includes('"contract"'));assert.deepEqual(result.relay,payload);
});
test('legacy machine emails and ordinary emails remain byte-for-byte unchanged without opt-in',()=>{
 for(const presentation of [undefined,'machine']) assert.deepEqual(metricoolReviewMail({...input,presentation}),{subject:input.subject,body:input.body});
});
test('human presentation cannot bypass 420 review or disguise an unrelated or malformed payload',()=>{
 assert.throws(()=>metricoolReviewMail({...input,body:JSON.stringify({...payload,seedId:'420-dice'})}),/420-dice-review-required/);
 for(const altered of [{...input,body:'not JSON'},{...input,body:JSON.stringify({...payload,networks:['__proto__']})},{...input,recipientEmail:'other@example.org'},{...input,operationId:'gerard-mail-different'},{...input,body:JSON.stringify({...payload,media:['file:///tmp/test']})}]) assert.throws(()=>metricoolReviewMail(altered),/metricool-review-invalid/);
});
test('media links are explicitly supplied links, never an invented generated image',()=>{
 const r=metricoolReviewMail({...input,body:JSON.stringify({...payload,media:['https://example.org/image.png']})});
 assert.match(r.body,/droits et fichier à vérifier/);assert.match(r.body,/https:\/\/example.org/);assert.doesNotMatch(r.body,/image générée/);
});
