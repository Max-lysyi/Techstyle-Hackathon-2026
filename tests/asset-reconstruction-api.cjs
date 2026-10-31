/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('fs'),http=require('http'),assert=require('node:assert/strict'),sharp=require('sharp'),ts=require('typescript'),Module=require('module'),path=require('path');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,file);
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,...args){return resolve.call(this,name.startsWith('@/')?path.resolve('src',name.slice(2)):name,...args)};
const {POST}=require('../src/app/api/assets/reconstruct/route.ts'),{POST:partsPost}=require('../src/app/api/design/route.ts');
(async()=>{
 const saved={...process.env};let calls=0,mode='ok',lastPayload='';
 const png=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><circle cx="512" cy="512" r="300" fill="#ffc400"/></svg>')).png().toBuffer();
 const large=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048"><circle cx="1024" cy="1024" r="700" fill="yellow"/></svg>')).png().toBuffer();
 const opaque=await sharp({create:{width:1024,height:1024,channels:3,background:'red'}}).png().toBuffer(),empty=await sharp({create:{width:1024,height:1024,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();
 const server=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);calls++;lastPayload=Buffer.concat(chunks).toString('latin1');res.setHeader('content-type','application/json');if(mode==='rate'){res.writeHead(429,{'retry-after':'4'});return res.end(JSON.stringify({error:{message:'test rate',type:'rate_limit_error'}}));}if(mode==='error'){res.writeHead(500);return res.end(JSON.stringify({error:{message:'test failure sk-asset-test',type:'server_error'}}));}if(mode==='timeout')return setTimeout(()=>res.destroy(),1600);res.end(JSON.stringify({created:1,data:[{b64_json:(mode==='opaque'?opaque:mode==='empty'?empty:mode==='hq'?large:png).toString('base64')}],usage:{input_tokens:2,output_tokens:3,total_tokens:5}}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const source='data:image/png;base64,'+(await sharp({create:{width:64,height:64,channels:3,background:'blue'}}).png().toBuffer()).toString('base64');
 const body={image:source,bbox:{x:.2,y:.2,width:.5,height:.5},name:'Герб',type:'logo',text:'13',instructions:'Yellow and blue',size:'1024x1024'};
 const request=(extra={},headers={})=>new Request('http://localhost/api/assets/reconstruct',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({...body,...extra})});
 try{
 delete process.env.OPENAI_API_KEY;assert.equal((await POST(request())).status,503);
 process.env.OPENAI_API_KEY='sk-asset-test';process.env.OPENAI_BASE_URL=`http://127.0.0.1:${server.address().port}/v1`;process.env.OPENAI_IMAGE_MODEL='gpt-image-2.5-sunburst';process.env.OPENAI_ASSET_IMAGE_QUALITY='high';process.env.OPENAI_ASSET_TIMEOUT_MS='1000';process.env.OPENAI_DESIGN_REQUESTS_PER_HOUR='40';
 assert.equal((await POST(request({}, {origin:'https://other.example',host:'localhost'}))).status,403);
 assert.equal((await POST(request({bbox:{x:.9,y:0,width:.2,height:1}}))).status,400);assert.equal((await POST(request({size:'fake-svg'}))).status,400);assert.equal((await POST(request({type:'background'}))).status,400);assert.equal((await POST(request({text:'a'.repeat(301)}))).status,400);assert.equal((await POST(request({image:'data:image/png;base64,YmFk'}))).status,400);assert.equal(calls,0);
 let response=await POST(request());assert.equal(response.status,200);const first=await response.json();assert.equal(first.reconstruction,true);assert.equal(first.cached,false);assert.equal(first.width,1024);assert.equal(calls,1);
 assert.ok(lastPayload.includes('selected-element.png')&&lastPayload.includes('surrounding-context.png'));assert.equal((lastPayload.match(/name="image\[\]"/g)||[]).length,2);assert.ok(lastPayload.includes('transparent'));assert.ok(lastPayload.includes('exact required inscription/number'));assert.ok(lastPayload.includes('13'));assert.ok(lastPayload.includes('high'));assert.ok(!lastPayload.includes('sk-asset-test'));
 assert.equal((await (await POST(request())).json()).cached,true);assert.equal(calls,1);
 assert.equal((await POST(request({text:'14'}))).status,200);assert.equal(calls,2,'text affects cache key');
 mode='hq';response=await POST(request({size:'2048x2048'}));assert.equal(response.status,200);assert.equal((await response.json()).width,2048,'native 2K response, not client enlargement');
 mode='opaque';assert.equal((await POST(request({instructions:'opaque'}))).status,502);mode='empty';assert.equal((await POST(request({instructions:'empty'}))).status,502);mode='ok';assert.equal((await POST(request({size:'1024x1536'}))).status,502);
 mode='rate';response=await POST(request({instructions:'rate'}));assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'4');
 mode='error';response=await POST(request({instructions:'error'}));assert.equal(response.status,502);assert.ok(!(await response.text()).includes('sk-asset-test'));
 mode='timeout';assert.equal((await POST(request({instructions:'timeout'}))).status,504);
 global.designGuard.calls=Array(40).fill(Date.now());assert.equal((await POST(request({instructions:'budget'}))).status,429);assert.equal((await (await POST(request())).json()).cached,true);
 const partsRequest=new Request('http://localhost/api/design',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({stage:'flatten',image:source,part:'front',aspect:'square',instructions:''})});assert.equal((await partsPost(partsRequest)).status,429,'parts and reconstructed assets share a budget');
 console.log('Asset reconstruction API: strict inputs, two real SDK reference uploads, transparent PNG validation, parameter cache, shared budget, no key leak, rate limit, timeout and errors verified.');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
})().catch(e=>{console.error(e);process.exitCode=1});
