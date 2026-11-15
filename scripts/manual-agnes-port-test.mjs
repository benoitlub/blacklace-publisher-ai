// One explicit manual Agnes Flash request. No retries on submission, no publishing.
// The current provider adapter supports text-to-video only: use the canonical port
// as a visual description, not an unsupported image-reference claim.
import fs from 'node:fs';
const key = process.env.AGNES_API_KEY?.trim();
if (!key) throw new Error('AGNES_API_KEY_MISSING: configure GitHub Actions secret AGNES_API_KEY');
const base = 'https://apihub.agnes-ai.com';
const model = 'agnes-video-2.5-flash';
const prompt = 'Blacklace Island, the Port of Porsa Rotas, cinematic fantasy island harbour. A slow camera push above the harbour, subtle moving sea mist, gentle reflections and softly moving water, preserved coastline, harbor buildings, distant volcanic island silhouette. Warm daytime light, atmospheric and detailed, no characters, no people, no humanoid embodiment of the island, no added buildings, no captions, no logos. Five-second continuous establishing shot.';
const headers = {Authorization: 'Bearer ' + key, 'Content-Type':'application/json'};
async function request(url, init) {
  const response = await fetch(url, {...init, signal: AbortSignal.timeout(25000), redirect:'error'});
  if (!response.ok) throw new Error('AGNES_HTTP_' + response.status);
  return response.json();
}
const report = {model, mode:'text', seconds:5, status:'submitting', referenceImageUsed:false, note:'Text-to-video only; reference-image API not yet integrated'};
const save = () => fs.writeFileSync('agnes-port-result.json', JSON.stringify(report,null,2));
save();
try {
  const submitted = await request(base+'/v1/videos', {method:'POST', headers, body:JSON.stringify({model, mode:'text', prompt, seconds:'5', size:'720P', aspect_ratio:'9:16'})});
  const id = submitted.video_id;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(id)) throw new Error('AGNES_TASK_ID_INVALID');
  report.video_id = id;
  report.status = 'queued';
  save();
  console.log('Agnes task ID:',id);
  for(let attempt=0; attempt<40; attempt++){
    await new Promise(resolve=>setTimeout(resolve,12000));
    const data=await request(base+'/agnesapi?video_id='+encodeURIComponent(id)+'&model_name='+model,{headers});
    const status=String(data.status||'');
    if (!['queued','in_progress','completed','failed'].includes(status)) throw new Error('AGNES_UNKNOWN_STATUS');
    report.status=status;
    // Only expose an HTTPS URL in the report; never fetch provider-controlled URLs.
    if (status==='completed') {
      const candidate=[data.video_url,data.url,data.output_url,data?.data?.video_url,data?.data?.url].find(v=>typeof v==='string');
      if(candidate){
        try{
          const u=new URL(candidate);
          if(u.protocol==='https:' && !u.username && !u.password && !['localhost','127.0.0.1','0.0.0.0','::1'].includes(u.hostname) && !u.hostname.endsWith('.local')) report.video_url=u.href;
        }catch{}
      }
    }
    save();
    console.log('Agnes status:',status);
    if(status==='completed'){
      if(report.video_url) console.log('Video URL:',report.video_url);
      else console.log('Completed, but no validated video URL found. Inspect provider task in Agnes console.');
      process.exit(0);
    }
    if(status==='failed') throw new Error('AGNES_TASK_FAILED');
  }
  throw new Error('AGNES_POLL_TIMEOUT: task may still be running; do not resubmit automatically');
} catch(error) {
  report.error=String(error?.message||error);
  save();
  throw error;
}
