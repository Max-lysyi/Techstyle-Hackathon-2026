/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,f);
const {studioRequest}=require('../src/lib/studio-request.ts');
(async()=>{
  global.window=new EventTarget();const savedFetch=global.fetch,savedTimeout=global.setTimeout;global.setTimeout=(fn,ms,...args)=>savedTimeout(fn,Math.min(ms,5),...args);
  try{
    const id='a'.repeat(48);let submissions=0,polls=0,cancellations=0;const events=[];
    window.addEventListener('studio-job-state',e=>events.push(e.detail.state));
    global.fetch=async(url,init)=>{
      if(init?.method==='DELETE'){cancellations++;return Response.json({cancelled:true})}
      if(url.includes('task=')){submissions++;return Response.json({id},{status:202})}
      polls++;if(polls===1)throw Error('temporary network failure');
      if(polls===2)return Response.json({state:'running',position:0},{status:202});
      return Response.json({image:'test-only-result'});
    };
    const result=await studioRequest('/api/design',{method:'POST',body:'{}'});assert.deepEqual(await result.json(),{image:'test-only-result'});assert.equal(submissions,1,'GET recovery must never duplicate a paid submission');assert.ok(events.includes('reconnecting'));assert.equal(events.at(-1),'idle');
    const controller=new AbortController();global.fetch=async(url,init)=>{
      if(init?.method==='DELETE'){cancellations++;return Response.json({cancelled:true})}
      if(url.includes('task='))return Response.json({id},{status:202});
      savedTimeout(()=>controller.abort(),0);return Response.json({state:'queued',position:1},{status:202});
    };
    await assert.rejects(studioRequest('/api/analyze',{method:'POST',signal:controller.signal}),e=>e.name==='AbortError');assert.equal(cancellations,1,'cancel aborts the server job');
    global.fetch=async()=>Response.json({error:'Actual upstream timeout'},{status:504});assert.equal((await studioRequest('/api/design',{method:'POST'})).status,504,'submission errors are not accepted as successful results');
    console.log('Job transport: transient GET recovery without paid resubmission, progress, cancellation and real error propagation verified.');
  }finally{global.fetch=savedFetch;global.setTimeout=savedTimeout;delete global.window;}
})().catch(e=>{console.error(e);process.exitCode=1});
