/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('fs'),path=require('path'),ts=require('typescript'),Module=require('module'),assert=require('node:assert/strict');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,f);
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,...args){return resolve.call(this,name.startsWith('@/')?path.resolve('src',name.slice(2)):name,...args)};
const {StudioJobs}=require('../src/lib/server/studio-jobs.ts');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const jobs=new StudioJobs();let release;const executed=[];
  const first=jobs.enqueue(async()=>{executed.push(1);await new Promise(r=>release=r);return Response.json({image:'actual-result'})});
  const second=jobs.enqueue(async()=>{executed.push(2);return Response.json({})});
  const third=jobs.enqueue(async()=>{executed.push(3);return Response.json({error:'Rate limit'},{status:429,headers:{'Retry-After':'17'}})});
  assert.equal(first.length,48);assert.equal(jobs.read(first).status,202);assert.equal((await jobs.read(third).json()).position,2);
  assert.equal(jobs.enqueue(async()=>Response.json({})),null,'bounded pending queue');
  jobs.cancel(second);release();await sleep(10);assert.deepEqual(executed,[1,3],'cancelled queued job never executes');
  assert.equal(jobs.read(second).status,499);assert.deepEqual(await jobs.read(first).json(),{image:'actual-result'});
  assert.equal(jobs.read(third).status,429);assert.equal(jobs.read(third).headers.get('retry-after'),'17');
  assert.deepEqual(await jobs.read(first).json(),{image:'actual-result'},'repeated polls do not repeat execution');
  const cancelled=jobs.enqueue(async signal=>{await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('private data'))));return Response.json({})});jobs.cancel(cancelled);await sleep(10);assert.equal(jobs.read(cancelled).status,499);assert.ok(!(await jobs.read(cancelled).text()).includes('private data'));
  const failed=jobs.enqueue(async()=>{throw Error('secret-source-and-key')});await sleep(10);assert.equal(jobs.read(failed).status,502);assert.ok(!(await jobs.read(failed).text()).includes('secret-source'));
  const {POST,GET,DELETE}=require('../src/app/api/jobs/route.ts'),saved=process.env.OPENAI_API_KEY;
  try{
    delete process.env.OPENAI_API_KEY;
    assert.equal((await POST(new Request('http://localhost/api/jobs?task=design',{method:'POST'}))).status,503);
    process.env.OPENAI_API_KEY='sk-jobs-test';
    assert.equal((await POST(new Request('http://localhost/api/jobs?task=wrong',{method:'POST'}))).status,400);
    assert.equal((await POST(new Request('http://localhost/api/jobs?task=design',{method:'POST',headers:{origin:'https://wrong.test',host:'localhost'}}))).status,403);
    const create=await POST(new Request('http://localhost/api/jobs?task=design',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}));assert.equal(create.status,202);const {id}=await create.json();
    let result;for(let n=0;n<30;n++){result=await GET(new Request(`http://localhost/api/jobs?id=${id}`));if(result.status!==202)break;await sleep(10)}
    assert.equal(result.status,400,'real downstream validation error is preserved without an AI call');
    assert.equal((await GET(new Request('http://localhost/api/jobs?id=wrong'))).status,404);
    assert.equal((await DELETE(new Request('http://localhost/api/jobs?id=wrong'))).status,404);
  }finally{if(saved===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=saved;}
  console.log('Background jobs: short submission/polling, bounded serial queue, cancellation, no re-execution, original error/status/Retry-After, origin/key validation and no secret leaks verified.');
})().catch(e=>{console.error(e);process.exitCode=1});
