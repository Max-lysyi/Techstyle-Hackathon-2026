/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const http = require('node:http');
const ts = require('typescript');
const sharp = require('sharp');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, filename);
global.ImageData = class ImageData { constructor(data, width, height) { this.data = data; this.width = width; this.height = height; } };
const { compositeMasked, composePreview } = require('../src/lib/restoration.ts');
const { encodePng } = require('../src/lib/png.ts');
const { extractDominantColors } = require('../src/lib/palette.ts');
const { POST } = require('../src/app/api/inpaint/route.ts');

async function main() {
  const original = new ImageData(new Uint8ClampedArray([1,2,3,17, 10,20,30,255, 4,5,6,110, 200,150,100,255]), 2, 2);
  const patch = new ImageData(new Uint8ClampedArray([250,240,230,255, 220,210,200,255, 210,200,190,255, 20,30,40,255]), 2, 2);
  const mask = new Uint8Array([0, 255, 0, 128]);
  const result = compositeMasked(original, patch, mask, { x: 0, y: 0, width: 2, height: 2 });
  assert.deepEqual(Array.from(result.data.slice(0,4)), Array.from(original.data.slice(0,4)));
  assert.deepEqual(Array.from(result.data.slice(8,12)), Array.from(original.data.slice(8,12)));
  assert.deepEqual(Array.from(result.data.slice(4,8)), [220,210,200,255]);
  assert.throws(() => compositeMasked(original, patch, mask, { x: 0, y: 0, width: 1, height: 2 }));
  const png = await encodePng(result);
  const decoded = await sharp(Buffer.from(png)).raw().toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.width, 2); assert.equal(decoded.info.height, 2); assert.equal(decoded.info.channels, 4);
  assert.deepEqual(Array.from(decoded.data), Array.from(result.data));
  const preview = composePreview(original, result, new Uint8Array([0,255,0,0]));
  assert.deepEqual(Array.from(preview.data.slice(4,8)), Array.from(original.data.slice(4,8)));
  const colors = extractDominantColors(new ImageData(new Uint8ClampedArray([255,0,0,255,255,0,0,255,0,0,255,255,0,0,0,0]),4,1),8);
  assert.equal(colors.length,2); assert.deepEqual(colors.map(x=>x.count),[2,1]);
  assert.deepEqual(colors,extractDominantColors(new ImageData(new Uint8ClampedArray([255,0,0,255,255,0,0,255,0,0,255,255,0,0,0,0]),4,1),8));

  const maskData = Buffer.alloc(1024*1024*4,255); for(let y=300;y<400;y++) for(let x=300;x<400;x++) maskData[(y*1024+x)*4+3]=0;
  const maskPng = await sharp(maskData,{raw:{width:1024,height:1024,channels:4}}).png().toBuffer();
  const outPng = await sharp({create:{width:1024,height:1024,channels:4,background:'#557799'}}).png().toBuffer();
  const image = async n => sharp({create:{width:1024,height:1024,channels:4,background:{r:n,g:23,b:37,alpha:1}}}).png().toBuffer();
  const dataUrl = buffer => `data:image/png;base64,${buffer.toString('base64')}`;
  const body = async n => JSON.stringify({ image: dataUrl(await image(n)), mask: dataUrl(maskPng) });
  let mode='ok', calls=0, multipart=false;
  const upstream=http.createServer(async (req,res) => {
    calls++; const parts=[]; for await (const part of req) parts.push(part);
    const payload=Buffer.concat(parts).toString('latin1'); multipart ||= payload.includes('name="mask"') && payload.includes('name="image"') && payload.includes('gpt-image-2.5-flare');
    if(mode==='timeout') { setTimeout(()=>{ if(!res.destroyed) {res.writeHead(500);res.end();} }, 2200); return; }
    if(mode==='rate') {res.writeHead(429,{'content-type':'application/json','retry-after':'2'});res.end(JSON.stringify({error:{message:'Rate limit exceeded',type:'rate_limit_error'}}));return;}
    if(mode==='error') {res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'failure for sk-dummy-secret',type:'server_error'}}));return;}
    const output = mode === 'wrong-size' ? await sharp({create:{width:32,height:32,channels:4,background:'#123456'}}).png().toBuffer() : outPng;
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({created:1,data:[{b64_json:output.toString('base64')}],usage:{input_tokens:10,output_tokens:20,total_tokens:30}}));
  });
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const port=upstream.address().port;
  process.env.OPENAI_API_KEY='sk-dummy-secret'; process.env.OPENAI_BASE_URL=`http://127.0.0.1:${port}/v1`; process.env.OPENAI_IMAGE_TIMEOUT_MS='1000'; process.env.OPENAI_IMAGE_MODEL='gpt-image-2.5-flare';
  const req = data => new Request('http://localhost/api/inpaint',{method:'POST',headers:{'content-type':'application/json'},body:data});
  try {
    delete process.env.OPENAI_API_KEY; assert.equal((await POST(req('{}'))).status,503); process.env.OPENAI_API_KEY='sk-dummy-secret';
    assert.equal((await POST(new Request('http://localhost/api/inpaint',{method:'POST',headers:{'content-type':'text/plain'},body:'x'}))).status,415);
    assert.equal((await POST(req('{bad'))).status,400);
    assert.equal((await POST(new Request('http://localhost/api/inpaint',{method:'POST',headers:{'content-type':'application/json','origin':'https://evil.example','host':'localhost'},body:'{}'}))).status,403);
    assert.equal((await POST(new Request('http://localhost/api/inpaint',{method:'POST',headers:{'content-type':'application/json','content-length':String(13*1024*1024)},body:'{}'}))).status,413);
    const data=await body(20), first=await POST(req(data)); assert.equal(first.status,200); assert.equal((await first.json()).cached,false); assert.equal(calls,1); assert.ok(multipart);
    const second=await POST(req(data)); assert.equal((await second.json()).cached,true); assert.equal(calls,1);
    mode='wrong-size'; assert.equal((await POST(req(await body(21)))).status,502);
    mode='rate'; const rate=await POST(req(await body(22))); assert.equal(rate.status,429); assert.equal(rate.headers.get('retry-after'),'2');
    mode='error'; const error=await POST(req(await body(23))); assert.equal(error.status,502); assert.ok(!(await error.text()).includes('sk-dummy-secret'));
    mode='timeout'; assert.equal((await POST(req(await body(24)))).status,504);
    mode='ok'; for(let n=25;n<30;n++) assert.equal((await POST(req(await body(n)))).status,200);
    assert.equal((await POST(req(await body(30)))).status,429); assert.equal(calls,10);
    const cachedAtLimit = await POST(req(await body(29))); assert.equal(cachedAtLimit.status,200); assert.equal((await cachedAtLimit.json()).cached,true); assert.equal(calls,10);
    console.log('Inpainting integration: exact RGBA, PNG, palette, validation, cache, errors, timeout and rate limit passed.');
  } finally { upstream.closeAllConnections(); await new Promise(r=>upstream.close(r)); }
}
main().catch(e=>{console.error(e);process.exitCode=1});
