/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('fs'),http=require('http'),assert=require('node:assert/strict'),sharp=require('sharp'),ts=require('typescript'),Module=require('module'),path=require('path');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,file);
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,...args){return resolve.call(this,name.startsWith('@/')?path.resolve('src',name.slice(2)):name,...args)};
const {POST}=require('../src/app/api/design/route.ts');
(async()=>{
 const saved={...process.env};let mode='ok',calls=0;
 const output=await sharp({create:{width:1024,height:1024,channels:3,background:'#123456'}}).png().toBuffer();
 const large=await sharp({create:{width:2048,height:3072,channels:3,background:'#123456'}}).png().toBuffer();
 const transparent=await sharp({create:{width:1024,height:1024,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer(),wrong=await sharp({create:{width:320,height:200,channels:3,background:'red'}}).png().toBuffer();
 const upstream=http.createServer(async(req,res)=>{for await(const chunk of req)void chunk;calls++;res.setHeader('content-type','application/json');if(mode==='rate'){res.writeHead(429,{'retry-after':'2'});return res.end(JSON.stringify({error:{message:'rate limit',type:'rate_limit_error'}}))}if(mode==='error'){res.writeHead(500);return res.end(JSON.stringify({error:{message:'test failure sk-design-test',type:'server_error'}}))}if(mode==='timeout'){return setTimeout(()=>res.destroy(),1800)}res.end(JSON.stringify({created:1,data:[{b64_json:(mode==='transparent'?transparent:mode==='wrongsize'?wrong:mode==='hq'?large:output).toString('base64')}],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}))});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const image='data:image/png;base64,'+(await sharp({create:{width:64,height:64,channels:3,background:'black'}}).png().toBuffer()).toString('base64');
 const request=(extra={},headers={})=>new Request('http://localhost/api/design',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({stage:'flatten',image,view:'front',aspect:'square',instructions:'',...extra})});
 try {
 delete process.env.OPENAI_API_KEY;assert.equal((await POST(request())).status,503);
 process.env.OPENAI_API_KEY='sk-design-test';process.env.OPENAI_BASE_URL=`http://127.0.0.1:${upstream.address().port}/v1`;process.env.OPENAI_IMAGE_MODEL='gpt-image-2.5-sunburst';process.env.OPENAI_DESIGN_TIMEOUT_MS='1000';process.env.OPENAI_DESIGN_REQUESTS_PER_HOUR='10';
 assert.equal((await POST(request({}, {origin:'https://elsewhere.example',host:'localhost'}))).status,403);
 assert.equal((await POST(request({image:'broken'}))).status,400);assert.equal((await POST(request({stage:'separate'}))).status,400);assert.equal((await POST(request({engine:'wrong'}))).status,400);assert.equal((await POST(request({part:'unknown'}))).status,400);assert.equal(calls,0);
 let response=await POST(request());assert.equal(response.status,200);const first=await response.json();assert.equal(first.cached,false);assert.equal(first.part,'front');assert.equal(calls,1);
 response=await POST(request());assert.equal((await response.json()).cached,true);assert.equal(calls,1);
 response=await POST(request({part:'back'}));assert.equal((await response.json()).part,'back');assert.equal(calls,2,'part identity participates in cache key');
 mode='hq';response=await POST(request({aspect:'portrait-2k'}));assert.equal(response.status,200);assert.equal((await response.json()).width,2048);
 mode='transparent';assert.equal((await POST(request({instructions:'alpha'}))).status,502);mode='wrongsize';assert.equal((await POST(request({instructions:'size'}))).status,502);
 mode='rate';response=await POST(request({instructions:'rate'}));assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'2');
 mode='error';response=await POST(request({instructions:'error'}));assert.equal(response.status,502);assert.ok(!(await response.text()).includes('sk-design-test'));
 mode='timeout';assert.equal((await POST(request({instructions:'timeout'}))).status,504);
 global.designGuard.calls=Array(10).fill(Date.now());response=await POST(request({instructions:'budget'}));assert.equal(response.status,429);assert.ok(Number(response.headers.get('retry-after'))>0);assert.ok((await response.text()).includes('10 AI-операцій'));assert.equal((await POST(request())).status,200,'cache remains available when budget is exhausted');process.env.OPENAI_DESIGN_REQUESTS_PER_HOUR='40';mode='ok';assert.equal((await POST(request({instructions:'configured-budget'}))).status,200);
 console.log('Design API: validation, key isolation, real SDK multipart, cache, upstream error/rate limit, timeout and budget guard verified.');
 }finally{upstream.closeAllConnections();await new Promise(r=>upstream.close(r));for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
})().catch(e=>{console.error(e);process.exitCode=1});
