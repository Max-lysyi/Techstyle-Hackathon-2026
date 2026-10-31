/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('fs'),http=require('http'),assert=require('node:assert/strict'),sharp=require('sharp'),ts=require('typescript'),Module=require('module'),path=require('path');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,file);
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,...args){return resolve.call(this,name.startsWith('@/')?path.resolve('src',name.slice(2)):name,...args)};
const {validatePartLocations}=require('../src/lib/part-locations.ts');
const {POST}=require('../src/app/api/analyze/route.ts');
const parts=['front','back','right-sleeve','left-sleeve'];
const data={parts:parts.map(part=>({part,bbox:{x:-.02,y:.1,width:.5,height:1},reason:'Test-only region'}))};
assert.equal(validatePartLocations(data).parts[0].bbox.x,0);
assert.equal(validatePartLocations(data).parts[0].bbox.height,.9);
assert.throws(()=>validatePartLocations({parts:[data.parts[0],data.parts[0],data.parts[2],data.parts[3]]}));
assert.throws(()=>validatePartLocations({parts:data.parts.map(p=>({...p,bbox:{x:2,y:0,width:1,height:1}}))}));
assert.equal(validatePartLocations({parts:data.parts.map(p=>({...p,bbox:null}))}).parts[0].bbox,null);
(async()=>{
 const saved={...process.env};let calls=0,mode='ok';
 const server=http.createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);calls++;const body=JSON.parse(Buffer.concat(chunks));assert.equal(body.store,false);assert.equal(body.model,'gpt-5.4-mini');assert.deepEqual(body.reasoning,{effort:'low'});assert.equal(body.text.format.strict,true);assert.ok(['garment_part_locations','design_decomposition'].includes(body.text.format.name));assert.equal(body.input[0].content[1].type,'input_image');res.setHeader('content-type','application/json');
 if(mode==='timeout')return setTimeout(()=>res.destroy(),1600);
 if(mode==='rate'){res.writeHead(429,{'retry-after':'3'});return res.end(JSON.stringify({error:{message:'test rate limit',type:'rate_limit_error'}}));}
 if(mode==='error'){res.writeHead(500);return res.end(JSON.stringify({error:{message:'test failure sk-locator-test',type:'server_error'}}));}
 const artwork={elements:[],background:{type:'solid',description:'test-only',selectionRecommendation:'local',restorationRecommendation:'local'}};const output=mode==='invalid'?{parts:[data.parts[0]]}:body.text.format.name==='design_decomposition'?artwork:data;
 res.end(JSON.stringify({id:'test-only',object:'response',status:'completed',model:'test-vision',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(output),annotations:[]}]}],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let bytes=await sharp({create:{width:64,height:64,channels:3,background:'#123456'}}).png().toBuffer();
 const request=(headers={})=>new Request('http://localhost/api/analyze',{method:'POST',headers:{'content-type':'image/png','x-analysis-task':'garment-parts',...headers},body:bytes});
 try{
 delete process.env.OPENAI_API_KEY;assert.equal((await POST(request())).status,503);
 process.env.OPENAI_PARTS_MODEL='gpt-5.4-mini';process.env.OPENAI_ASSET_VISION_MODEL='gpt-5.4-mini';process.env.OPENAI_API_KEY='sk-locator-test';process.env.OPENAI_BASE_URL=`http://127.0.0.1:${server.address().port}/v1`;
 assert.equal((await POST(request({origin:'https://foreign.example',host:'localhost'}))).status,403);
 assert.equal((await POST(request({'content-type':'image/gif'}))).status,415);
 const realBytes=bytes;bytes=Buffer.from('bad');assert.equal((await POST(request())).status,400);bytes=realBytes;
 let response=await POST(request());const payload=await response.json();assert.equal(response.status,200,JSON.stringify(payload));assert.equal(payload.data.parts.length,4);assert.equal(calls,1);
 assert.equal((await POST(request())).status,200);assert.equal(calls,1,'content cache avoids repeated paid requests');response=await POST(request({'x-analysis-task':'artwork-elements'}));assert.equal(response.status,200);assert.ok(Array.isArray((await response.json()).data.elements));assert.equal(calls,2,'tasks have independent cache entries');assert.equal((await POST(request({'x-analysis-task':'artwork-elements'}))).status,200);assert.equal(calls,2);
 const fresh=async()=>{bytes=await sharp({create:{width:64,height:64,channels:3,background:`#${(123456+calls).toString(16).padStart(6,'0')}`}}).png().toBuffer();};
 mode='invalid';await fresh();assert.equal((await POST(request())).status,502);
 mode='rate';await fresh();response=await POST(request());assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'3');
 mode='error';await fresh();response=await POST(request());assert.equal(response.status,502);assert.ok(!(await response.text()).includes('sk-locator-test'));
 mode='timeout';process.env.OPENAI_VISION_TIMEOUT_MS='1000';await fresh();assert.equal((await POST(request())).status,504);
 global.visionGuard.timestamps=Array(30).fill(Date.now());assert.equal((await POST(request())).status,429);
 console.log('Part locator: strict schema, bounded coordinates, missing/duplicate parts, SDK payload, cache, key isolation, origin, errors and rate limits verified.');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
})().catch(e=>{console.error(e);process.exitCode=1});
