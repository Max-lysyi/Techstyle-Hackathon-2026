/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const port = Number(process.env.BROWSER_TEST_PORT || 8105);
const noKey = process.env.BROWSER_NO_KEY === '1';
const debugPort = Number(process.env.BROWSER_DEBUG_PORT || 9231);
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(r => setTimeout(r, ms));
const browsers = [process.env.CHROME_BIN, '/home/volic/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].filter(Boolean);
const browserBin = browsers.find(f => fs.existsSync(f));
if (!browserBin) { console.error('Chromium не знайдено. Встановіть його або задайте CHROME_BIN.'); process.exit(1); }
async function waitFor(fn, label, timeout=35000) { const deadline=Date.now()+timeout; while(Date.now()<deadline) { try { const value=await fn(); if(value) return value; } catch {} await delay(150); } throw Error(`Timeout: ${label}`); }
function entries(buffer) {
  const files = new Map(); let p=0;
  while(buffer.readUInt32LE(p)===0x04034b50) {
    const size=buffer.readUInt32LE(p+18), nameSize=buffer.readUInt16LE(p+26), extra=buffer.readUInt16LE(p+28);
    const name=buffer.subarray(p+30,p+30+nameSize).toString('utf8'), start=p+30+nameSize+extra;
    files.set(name,buffer.subarray(start,start+size)); p=start+size;
  }
  return files;
}
async function main() {
  const tmp=await fsp.mkdtemp(path.join(os.tmpdir(),'maxsport-e2e-')); const downloads=path.join(tmp,'downloads'); await fsp.mkdir(downloads);
  const original=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#d54738"/><rect x="100" y="70" width="50" height="50" fill="#111111"/></svg>')).png().toBuffer();
  const fixture=path.join(tmp,'source.png'); await fsp.writeFile(fixture,original);
  const modelImage=await sharp({create:{width:1024,height:1024,channels:4,background:'#3782a0'}}).png().toBuffer();
  let visionCalls=0, imageCalls=0;
  const upstream=http.createServer(async (req,res) => {
    for await (const ignored of req) { void ignored; }
    res.setHeader('content-type','application/json');
    if(req.url.includes('/responses')) {
      visionCalls++;
      const analysis={elements:[{id:'logo-1',name:'TEST LOGO',type:'logo',bbox:{x:0.32,y:0.33,width:0.2,height:0.29},confidence:0.9,description:'Темний логотип'}],background:{type:'solid',description:'Однотонний',selectionRecommendation:'Колір',restorationRecommendation:'Сусідні пікселі'}};
      res.end(JSON.stringify({id:'resp_test',object:'response',status:'completed',model:'gpt-6.1-terra',output:[{id:'msg_test',type:'message',status:'completed',role:'assistant',content:[{type:'output_text',text:JSON.stringify(analysis),annotations:[]}]}],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}));
    } else if(req.url.includes('/images/edits')) {imageCalls++;res.end(JSON.stringify({created:1,data:[{b64_json:modelImage.toString('base64')}],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}));}
    else {res.writeHead(404);res.end('{}');}
  });
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const env={...process.env,OPENAI_API_KEY:noKey ? '' : 'sk-browser-test',OPENAI_BASE_URL:`http://127.0.0.1:${upstream.address().port}/v1`,OPENAI_IMAGE_MODEL:'gpt-image-2.5-flare'};
  const server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','--port',String(port)],{cwd:root,env,stdio:'ignore'});
  const chrome=spawn(browserBin,['--no-sandbox','--headless',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${path.join(tmp,'profile')}`,'about:blank'],{stdio:'ignore'});
  let ws;
  try {
    await waitFor(async()=> (await fetch(`http://localhost:${port}`)).ok,'Next server');
    const tabs=await waitFor(async()=>await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json(),'Chromium');
    ws=new WebSocket(tabs[0].webSocketDebuggerUrl); await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    let id=0; const pending=new Map(); let browserError='';
    ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);if(m.error) p.reject(Error(m.error.message)); else p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown') browserError+=m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text;};
    const send=(method,params={})=>new Promise((resolve,reject)=>{const i=++id;pending.set(i,{resolve,reject});ws.send(JSON.stringify({id:i,method,params}));});
    const evaluate=async expression=>{const v=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(v.exceptionDetails)throw Error(v.exceptionDetails.exception?.description || v.exceptionDetails.text);return v.result.value;};
    const wait=async expr=>waitFor(()=>evaluate(expr),expr);
    const click=async name=>{assert.equal(await evaluate(`(()=>{let b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(name)});if(!b)return false;b.click();return true})()`),true,name);};
    await send('Runtime.enable'); await send('Page.enable'); await send('DOM.enable'); await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads}); await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1000,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:`http://localhost:${port}`}); await wait(`document.body?.innerText.includes('Почати роботу')`); await click('Почати роботу');
    await wait(`!!document.querySelector('input[type=file]')`);
    const doc=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[type=file]'});await send('DOM.setFileInputFiles',{nodeId,files:[fixture]});
    await wait(`document.body.innerText.includes('Чотири деталі форми')`);await click('Інструменти');await click('Оригінал');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('canvas.touch-none')).touchAction`),'none','production CSS');
    assert.equal(imageCalls,0);assert.equal(visionCalls,0);
    if(noKey){await click('1. Розгорнути деталь без написів');await wait(`document.body.innerText.includes('OPENAI_API_KEY не налаштовано на сервері.')`);}
    await click('Ручне виправлення масок / локальне виділення');
    await click('AI-аналіз макета');
    if (noKey) { await wait(`document.body.innerText.includes('OPENAI_API_KEY не налаштовано на сервері.')`); assert.equal(visionCalls,0); }
    else { await wait(`document.body.innerText.includes('TEST LOGO')`); assert.equal(visionCalls,1); await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent.includes('TEST LOGO')).click()`); }
    const pointer=async (x,y)=>{const b=await evaluate(`(()=>{const r=document.querySelector('canvas.touch-none').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);const px=b.x+b.w*x/300,py=b.y+b.h*y/200;await send('Input.dispatchMouseEvent',{type:'mousePressed',x:px,y:py,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:px,y:py,button:'left',clickCount:1});};
    if (!noKey) { await click('Автовиділення пікселів області'); }
    else { await click('Виділити');await pointer(125,90); }await wait(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Створити шар із маски') && !b.disabled)`);
    await click('Пензель +');await pointer(150,95);await click('Створити шар із маски');await wait(`document.body.innerText.includes('Локальні PNG-шари: 1')`);
    await click('Відновити фон');await wait(`document.body.innerText.includes('Локальна реконструкція · попередній результат')`);assert.equal(imageCalls,0);
    await click('До');await click('Після');await click('Відхилити');await click('Відновити фон');await wait(`document.body.innerText.includes('Локальна реконструкція · попередній результат')`);await click('Прийняти');
    await evaluate(`(()=>{let s=document.querySelector('select[aria-label="Спосіб відновлення"]');s.value='openai';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await click('Відновити фон');
    if (noKey) { await wait(`document.querySelectorAll('[role="alert"]').length >= 3 && !document.body.innerText.includes('Відновлення…')`); assert.equal(imageCalls,0); }
    else { await wait(`document.body.innerText.includes('AI-реконструкція (gpt-image-2.5-flare)')`); assert.equal(imageCalls,1); await click('Прийняти'); await click('Відновити фон'); await wait(`document.body.innerText.includes('із кешу')`); assert.equal(imageCalls,1); await click('Прийняти'); }
    await click('Експортувати проєкт');const zipPath=path.join(downloads,'AI_Promt_Studio_decomposition.zip');await waitFor(()=>fs.existsSync(zipPath), 'ZIP download');await delay(500);
    const zip=await fsp.readFile(zipPath);assert.equal(spawnSync('unzip',['-t',zipPath]).status,0);const files=entries(zip), manifest=JSON.parse(files.get('manifest.json').toString());
    assert.deepEqual(manifest.canvas,{width:300,height:200});assert.equal(manifest.reconstruction.method,noKey ? 'local' : 'openai');assert.ok(files.get('original.png').equals(original));assert.ok(files.has('palette.csv'));
    const bg=await sharp(files.get('background.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true}), orig=await sharp(original).ensureAlpha().raw().toBuffer();
    const layer=manifest.layers[0], layerPixels=await sharp(files.get(layer.file)).ensureAlpha().raw().toBuffer({resolveWithObject:true}), preview=await sharp(files.get('preview.png')).metadata();
    assert.equal(bg.info.width,300);assert.equal(bg.info.height,200);assert.equal(preview.width,300);assert.equal(preview.height,200);assert.equal(layerPixels.info.width,layer.bounds.width);assert.equal(layerPixels.info.height,layer.bounds.height);assert.ok(layerPixels.data.some((v,i)=>i%4===3 && v===0));assert.ok(layerPixels.data.some((v,i)=>i%4===3 && v===255));
    const repair=await sharp(files.get(manifest.reconstruction.maskFile)).raw().toBuffer({resolveWithObject:true});
    for(let y=0;y<200;y++) for(let x=0;x<300;x++){const selected=repair.data[(y*300+x)*repair.info.channels];if(!selected){const i=(y*300+x)*4;assert.ok(bg.data.subarray(i,i+4).equals(orig.subarray(i,i+4)),`outside mask ${x},${y}`);}}
    assert.equal(browserError,'');
    console.log(noKey ? 'Browser E2E without API key: local reconstruction and ZIP verified.' : 'Browser E2E: upload → Vision → selection → brush → layer → local/AI restore → compare/reject/accept → cached repeat → ZIP verified.');
  } finally {
    if(ws)ws.close();
    const stop = child => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); setTimeout(resolve, 3000).unref(); });
    await Promise.all([stop(chrome), stop(server)]); upstream.closeAllConnections(); await new Promise(r=>upstream.close(r));
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
