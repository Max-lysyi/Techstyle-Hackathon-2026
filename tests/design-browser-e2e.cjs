/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const port = Number(process.env.BROWSER_TEST_PORT || 8106);
const noKey = process.env.BROWSER_NO_KEY === '1';
const debugPort = Number(process.env.BROWSER_DEBUG_PORT || 9232);
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
  const original=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#d54738"/><path fill="#111111" fill-rule="evenodd" d="M100 70h50v50h-50z M110 80v30h30v-30z"/><text x="215" y="40" font-size="24" fill="white">13</text></svg>')).png().toBuffer();
  const fixture=process.env.DESIGN_FIXTURE || path.join(tmp,'source.png'); if(!process.env.DESIGN_FIXTURE)await fsp.writeFile(fixture,original);
  const variants=new Map(),generatedAssets=new Map();let imageCalls=0,assetCalls=0,visionCalls=0,failFirstMap=true,locatorMode='ok';
  for(const size of ['1024x1024','1024x1536','768x1536','1536x1024']){
    const [w,h]=size.split('x').map(Number),extra=size==='1024x1536'?'<path d="M20 65H280" stroke="#20a080" stroke-width="6"/>':size==='1536x1024'?'<path d="M20 65H280" stroke="#e0b020" stroke-width="6"/>':'';
    const extraMap=size==='1024x1536'?'<path d="M20 65H280" stroke="#00ffff" stroke-width="6"/>':size==='1536x1024'?'<path d="M20 65H280" stroke="#ffff00" stroke-width="6"/>':'';
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 300 200" preserveAspectRatio="none"><defs><linearGradient id="g"><stop stop-color="#003388"/><stop offset="1" stop-color="#ffe040"/></linearGradient></defs><rect width="300" height="200" fill="#101820"/><rect x="20" y="20" width="60" height="30" fill="#e02020"/><rect x="20" y="85" width="260" height="95" fill="url(#g)"/>${extra}<text x="115" y="40" font-size="24" fill="white">TEST</text></svg>`;
    const map=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 300 200" preserveAspectRatio="none"><rect width="300" height="200" fill="black"/><rect x="20" y="20" width="60" height="30" fill="red"/><rect x="20" y="85" width="260" height="95" fill="#ff00ff"/>${extraMap}<text x="115" y="40" font-size="24" fill="white">TEST</text></svg>`;
    generatedAssets.set(size,await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><circle cx="${w/2}" cy="${h/2}" r="${Math.min(w,h)*.3}" fill="#f4c400"/></svg>`)).png().toBuffer());
    variants.set(size,{image:await sharp(Buffer.from(svg)).png().toBuffer(),map:await sharp(Buffer.from(map)).png().toBuffer()});
  }
  for(const size of ['2048x2048','3072x2048','2048x3072']){const [w,h]=size.split('x').map(Number);generatedAssets.set(size,await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><circle cx="${w/2}" cy="${h/2}" r="${Math.min(w,h)*.3}" fill="#f4c400"/></svg>`)).png().toBuffer());}
  const upstream=http.createServer(async(req,res)=>{const chunks=[];for await(const part of req)chunks.push(part);const payload=Buffer.concat(chunks).toString('latin1');res.setHeader('content-type','application/json');if(req.url.includes('/responses')){visionCalls++;if(locatorMode==='slow')await delay(800);const requestData=JSON.parse(payload);if(requestData.text.format.name==='verify_artwork_crops'){const definitions=[{id:'logo-1',name:'TEST LOGO',type:'logo',x:.31,y:.32,w:.21,h:.31},{id:'number-13',name:'Номер 13',type:'number',x:.7,y:.05,w:.25,h:.2}];const elements=definitions.map(d=>{const pad=Math.max(32,Math.max(d.w*300,d.h*200)*.9),left=Math.max(0,Math.floor(d.x*300-pad)),top=Math.max(0,Math.floor(d.y*200-pad)),cw=Math.min(300,Math.ceil((d.x+d.w)*300+pad))-left,ch=Math.min(200,Math.ceil((d.y+d.h)*200+pad))-top;return {id:d.id,present:true,identity:d.id,name:d.name,type:d.type,text:d.type==='number'?'13':'',reason:'Test-only verified region',bbox:{x:(d.x*300-left)/cw*1000,y:(d.y*200-top)/ch*1000,width:d.w*300/cw*1000,height:d.h*200/ch*1000}};});return res.end(JSON.stringify({id:'test-verified',object:'response',status:'completed',model:'test-vision',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({elements}),annotations:[]}]}],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}));} if(requestData.text.format.name==='design_decomposition'){const data={elements:[{id:'logo-1',name:'TEST LOGO',type:'logo',bbox:{x:.31,y:.32,width:.21,height:.31},confidence:.95,description:'Test-only logo region'},{id:'number-13',name:'Номер 13',type:'number',bbox:{x:.7,y:.05,width:.25,height:.2},confidence:.95,description:'Test-only number region'}],background:{type:'solid',description:'Test-only',selectionRecommendation:'Color',restorationRecommendation:'Local'}};return res.end(JSON.stringify({id:'test-elements',object:'response',status:'completed',model:'test-vision',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(data),annotations:[]}]}],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}));}const data={parts:['front','back','right-sleeve','left-sleeve'].map((part,i)=>({part,bbox:locatorMode==='missing'?null:{x:.05+i*.1,y:.05,width:.35,height:.85},reason:'Test-only fixture region'}))};return res.end(JSON.stringify({id:'test-locator',object:'response',status:'completed',model:'test-vision',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(data),annotations:[]}]}],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}));}if(!req.url.includes('/images/edits')){res.writeHead(404);return res.end('{}');}if(payload.includes('RECONSTRUCT A SINGLE GRAPHIC ELEMENT')){assetCalls++;const size=payload.match(/name="size"\r\n\r\n([0-9]+x[0-9]+)/)?.[1];assert.ok(payload.includes('transparent'));assert.ok(payload.includes('13'));return res.end(JSON.stringify({created:1,data:[{b64_json:generatedAssets.get(size).toString('base64')}],usage:{input_tokens:2,output_tokens:3,total_tokens:5}}));}imageCalls++;const size=payload.match(/name="size"\r\n\r\n([0-9]+x[0-9]+)/)?.[1],fixture=variants.get(size);if(!fixture){res.writeHead(400);return res.end('{}');}const map=payload.includes('pixel-registered semantic label map');if(map&&failFirstMap){failFirstMap=false;res.writeHead(502);return res.end(JSON.stringify({error:{message:'test-only separation failure',type:'server_error'}}));}res.end(JSON.stringify({created:1,data:[{b64_json:(map?fixture.map:fixture.image).toString('base64')}],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}));});
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const env={...process.env,OPENAI_API_KEY:noKey?'':'sk-browser-test',OPENAI_BASE_URL:`http://127.0.0.1:${upstream.address().port}/v1`,OPENAI_IMAGE_MODEL:'gpt-image-2.5-flare'};
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
    await send('Page.navigate',{url:`http://localhost:${port}/studio`}); await wait(`document.body?.innerText.includes('Один макет.')`);
    await wait(`!!document.querySelector('input[type=file]')`);
    const doc=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[type=file]'});await send('DOM.setFileInputFiles',{nodeId,files:[fixture]});
    await wait(`document.body.innerText.includes('Чотири деталі форми') && !document.body.innerText.includes('Завантаження макета в роботу')`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-part]').length`),4);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-part]').parentElement).display`),'grid');
    await click('Сховати ескіз');assert.equal(await evaluate(`document.querySelectorAll('.studio-reference').length`),0);await click('Ескіз');assert.equal(await evaluate(`document.querySelectorAll('.studio-reference').length`),1);await click('Сховати ескіз');
    await evaluate(`(()=>{const s=document.querySelector('select[aria-label="Якість нових деталей"]');if(s.value!=='detail')throw Error('2K must be default');s.value='standard';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);assert.equal(await evaluate(`document.body.innerText.includes('MAXSport')`),false,'old product brand removed');
    assert.equal(imageCalls,0,'upload does not trigger a paid operation');assert.equal(visionCalls,0);
    if(noKey){await click('Розкласти макет');await wait(`document.body.innerText.includes('OPENAI_API_KEY не налаштовано на сервері.')`);assert.equal(imageCalls,0);assert.equal(await evaluate(`document.querySelectorAll('[data-part] canvas').length`),0);console.log('Parts browser offline: four empty parts, real configuration error, no fake ready images.');return;}
    await click('Розкласти макет');
    await wait(`document.body.innerText.includes('Створено 3 із 4 деталей')`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-part] canvas').length`),3);
    assert.equal(imageCalls,8);assert.equal(visionCalls,3);
    await click('Достворити деталі');
    await wait(`document.body.innerText.includes('Усі чотири деталі створено.')`);
    assert.equal(imageCalls,9,'retry reuses the failed part master and skips all ready parts');assert.equal(visionCalls,3);
    assert.equal(await evaluate(`document.querySelectorAll('[data-part] canvas').length`),4);
    assert.equal(await evaluate(`document.querySelectorAll('select').length`),1,'only the quality control is visible; technical controls are hidden on the main screen');
    await evaluate(`document.querySelector('button[aria-label="Герби й номери"]').click()`);await wait(`document.querySelectorAll('[data-asset-id]').length===2`);
    assert.equal(assetCalls,0,'detecting graphics never automatically triggers paid image generation');
    await evaluate(`[...document.querySelectorAll('summary')].find(b=>b.textContent==='Локальні інструменти').click()`);await click('Локально без AI');await wait(`document.body.innerText.includes('Витягнуто 2 елементів.')`);
    await evaluate(`(()=>{const i=document.querySelector('input[aria-label="Точний текст Номер 13"]');i.focus();i.select();return true})()`);await send('Input.insertText',{text:'13'});
    const generateNumber=()=>evaluate(`[...document.querySelectorAll('[data-asset-id]')].find(e=>e.querySelector('input[aria-label="Назва елемента"]').value==='Номер 13').querySelector('button.studio-primary').click()`);
    await generateNumber();await wait(`document.querySelectorAll('[data-asset-proposal]').length===1`);assert.equal(assetCalls,1);assert.equal(await evaluate(`document.querySelector('[data-asset-proposal]').closest('article').querySelector('button.text-red-300').disabled`),true,'unapproved proposal cannot be downloaded');
    await click('Відхилити');await wait(`document.querySelectorAll('[data-asset-proposal]').length===0`);await generateNumber();await wait(`document.querySelectorAll('[data-asset-proposal]').length===1`);assert.equal(assetCalls,1,'rejected unchanged reconstruction is served from server cache');await click('Прийняти PNG');await wait(`document.querySelectorAll('[data-asset-proposal]').length===0`);
    await evaluate(`document.querySelector('[data-asset-id] summary').click()`);await click('Маска локального вирізання');await wait(`!!document.querySelector('canvas.touch-none')`);await click('Пензель +');
    const assetSurface=await evaluate(`(()=>{const r=document.querySelector('canvas.touch-none').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:assetSurface.x+assetSurface.w*125/300,y:assetSurface.y+assetSurface.h*95/200,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:assetSurface.x+assetSurface.w*125/300,y:assetSurface.y+assetSurface.h*95/200,button:'left',clickCount:1});
    await wait(`document.body.innerText.includes('Збережіть зміни маски шару')`);await click('Зберегти маску шару');await click('Герби й номери');await wait(`document.querySelectorAll('[data-asset-id]').length===2`);await click('Чотири деталі');await wait(`document.querySelectorAll('[data-part] canvas').length===4`);
    await evaluate(`document.querySelector('button[aria-label="Відкрити Перед"]').click()`);
    await wait(`document.querySelectorAll('[data-quick-layer]').length===4`);
    await evaluate(`document.querySelector('button[aria-label="Змінити колір 1 градієнта Градієнт"]').click()`);
    await wait(`document.querySelectorAll('[data-palette-picker] button[title]').length>100`);
    const target=await evaluate(`(()=>{const b=document.querySelectorAll('[data-palette-picker] button[title]')[1];const hex=b.title.split(' · ').at(-1);b.click();return hex})()`);
    await evaluate(`document.querySelector('[data-quick-layer="part-layer-6"] button.flex-1').click()`);await wait(`document.body.innerText.includes('Уточнити маску')`);await click('Усі шари разом');
    await click('Інструменти');await wait(`document.querySelectorAll('[data-layer-id]').length===4`);
    // Grouping is non-destructive, and a complete gradient has exactly one layer.
    await evaluate(`[...document.querySelectorAll('[data-layer-id] input[type=checkbox]')].slice(-2).forEach(x=>x.click())`);await click('Згрупувати вибрані (2)');await click('Приховати групу');await click('Показати групу');await click('Лише група');await click('Композиція цієї деталі');
    await click('Спинка');await wait(`document.querySelectorAll('[data-layer-id]').length===4`);await click('Перед');await wait(`document.querySelectorAll('[data-layer-id]').length===4`);assert.equal(await evaluate(`document.body.innerText.includes('Розгрупувати')`),true,'group belongs to front and persists after switching');
    await evaluate(`[...document.querySelector('[data-layer-id="part-layer-6"]').querySelectorAll('button')].find(b=>b.textContent.trim()==='Маска').click()`);await click('Пензель −');
    const surface=await evaluate(`(()=>{const r=document.querySelector('canvas.touch-none').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:surface.x+surface.w*.45,y:surface.y+surface.h*.6,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:surface.x+surface.w*.45,y:surface.y+surface.h*.6,button:'left',clickCount:1});
    await wait(`document.body.innerText.includes('Збережіть зміни маски шару')`);await click('Спинка');await click('Експортувати проєкт');await wait(`document.body.innerText.includes('Збережіть виправлену маску: Перед.')`);await click('Перед');await wait(`document.body.innerText.includes('Збережіть зміни маски шару')`);await click('Зберегти виправлену маску');await wait(`!document.body.innerText.includes('Збережіть зміни маски шару')`);
    await click('Усі 4 деталі');await click('Завантажити ZIP');const zipPath=path.join(downloads,'AI_Promt_Studio_project.zip');await waitFor(()=>fs.existsSync(zipPath),'parts ZIP');await delay(400);
    assert.equal(spawnSync('unzip',['-t',zipPath]).status,0);const files=entries(await fsp.readFile(zipPath)),manifest=JSON.parse(files.get('manifest.json'));
    assert.equal(manifest.elements.length,2);assert.deepEqual(manifest.elements.map(e=>e.type),['logo','number']);for(const asset of manifest.elements){const pixels=await sharp(files.get(asset.file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(pixels.info.width,asset.bounds.width);assert.equal(pixels.info.height,asset.bounds.height);assert.ok(pixels.data.some((v,i)=>i%4===3&&v===0));assert.ok(pixels.data.some((v,i)=>i%4===3&&v===255));assert.equal(asset.source,asset.type==='number'?'ai-reconstruction':'original');assert.equal(asset.reconstruction,asset.type==='number');if(asset.type==='number'){assert.equal(asset.settings.text,'13');assert.deepEqual([pixels.info.width,pixels.info.height],[2048,2048]);assert.ok(files.get(asset.file).equals(generatedAssets.get('2048x2048')),'accepted PNG bytes are preserved');assert.ok(asset.sourceBounds);assert.equal(asset.placement,null);assert.ok(files.has(asset.originalExtractFile));}assert.ok(files.has(asset.maskFile));}
    assert.ok(Object.keys(manifest.tiff.files).length>10,'TIFF copies included by default');for(const [png,tiff]of Object.entries(manifest.tiff.files)){assert.ok(files.has(tiff));const a=await sharp(files.get(png)).metadata(),b=await sharp(files.get(tiff)).metadata();assert.equal(b.format,'tiff');assert.deepEqual([b.width,b.height],[a.width,a.height]);assert.equal(b.hasAlpha,true);}
    assert.equal(manifest.kind,'garment-part-print-project');assert.equal(manifest.parts.length,4);assert.ok(files.get(manifest.originalFile).equals(await fsp.readFile(fixture)));
    const expected={'front':[1024,1536,4],'back':[1024,1536,4],'right-sleeve':[768,1536,3],'left-sleeve':[768,1536,3]};
    for(const part of manifest.parts){assert.equal(part.status,'ready');assert.deepEqual([part.canvas.width,part.canvas.height,part.layers.length],expected[part.id]);assert.ok(part.sourceRect&&part.sourceNormalized);assert.equal(part.layers.filter(l=>l.kind==='gradient').length,1);assert.ok(part.layers.every(l=>!['logo','text','number'].includes(l.type)));assert.ok(part.removedMaskFile);assert.ok(files.has(part.paletteFile));
      for(const layer of part.layers){const decoded=await sharp(files.get(layer.file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.deepEqual(layer.bounds,{x:0,y:0,width:part.canvas.width,height:part.canvas.height});assert.equal(decoded.info.width,part.canvas.width);assert.equal(decoded.info.height,part.canvas.height);assert.ok(decoded.data.some((v,i)=>i%4===3&&v===255));if(layer.type==='background')assert.ok(decoded.data.every((v,i)=>i%4!==3||v===255),'base fills the complete rectangle');if(layer.type!=='background')assert.ok(decoded.data.some((v,i)=>i%4===3&&v===0));}
      const mask=await sharp(files.get(part.removedMaskFile)).raw().toBuffer({resolveWithObject:true}),clean=await sharp(files.get(part.masterFile)).ensureAlpha().raw().toBuffer();let repaired=0;for(let p=0;p<mask.info.width*mask.info.height;p++)if(mask.data[p*mask.info.channels]){assert.ok(clean[p*4]<100&&clean[p*4+1]<100&&clean[p*4+2]<100,'remaining white lettering is removed');repaired++;}assert.ok(repaired>0);
    }
    const edited=await sharp(files.get(manifest.parts[0].layers.find(l=>l.kind==='gradient').maskFile)).raw().toBuffer({resolveWithObject:true});assert.equal(edited.data[(Math.floor(edited.info.height*.6)*edited.info.width+Math.floor(edited.info.width*.45))*edited.info.channels],0,'saved front mask');const independent=await sharp(files.get(manifest.parts[2].layers.find(l=>l.kind==='gradient').maskFile)).raw().toBuffer({resolveWithObject:true});assert.equal(independent.data[(Math.floor(independent.info.height*.6)*independent.info.width+Math.floor(independent.info.width*.45))*independent.info.channels],255,'other part mask is independent');
    assert.equal(manifest.parts[0].groups.length,1);assert.equal(manifest.parts[1].groups.length,0);assert.equal(manifest.parts[0].layers.find(l=>l.kind==='gradient').gradient.stops[0],target);
    await fsp.mkdir('artifacts/garment-parts-browser',{recursive:true});await fsp.copyFile(zipPath,'artifacts/garment-parts-browser/project.zip');const shot=await send('Page.captureScreenshot',{format:'png'});await fsp.writeFile('artifacts/garment-parts-browser/overview.png',Buffer.from(shot.data,'base64'));
    // The complete result is above; all following sources are explicitly synthetic edge cases.
    const replaceSource=async(n)=>{const next=path.join(tmp,`source-${n}.png`);await fsp.writeFile(next,await sharp({create:{width:300,height:200,channels:3,background:`#${(0x223344+n).toString(16)}`}}).png().toBuffer());const doc=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[aria-label="Завантажити макет"]'});await send('DOM.setFileInputFiles',{nodeId,files:[next]});await wait(`document.body.innerText.includes('source-${n}.png')`);};
    locatorMode='missing';await replaceSource(1);await click('Розкласти макет');await wait(`document.body.innerText.includes('Створено 0 із 4 деталей')`);assert.equal(imageCalls,9,'unseen parts are not invented or sent to paid generation');assert.equal(await evaluate(`document.querySelectorAll('[data-part] canvas').length`),0);
    locatorMode='slow';await replaceSource(2);const beforeCancel=visionCalls;await click('Розкласти макет');await waitFor(()=>visionCalls>beforeCancel,'locator starts');await click('Зупинити');await delay(1200);assert.equal(imageCalls,9,'cancelled locator never starts a generation');assert.equal(await evaluate(`document.querySelectorAll('[data-part] canvas').length`),0);
    await replaceSource(3);const beforeReplace=visionCalls;await click('Розкласти макет');await waitFor(()=>visionCalls>beforeReplace,'locator starts before replace');await replaceSource(4);await delay(1200);assert.equal(imageCalls,9,'new upload invalidates the old run');assert.equal(await evaluate(`document.querySelectorAll('[data-part] canvas').length`),0);
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true,'mobile viewport has no horizontal overflow');
    assert.equal(browserError,'');
    console.log('Parts browser: four part documents, original masks, AI asset reference → reconstruct → reject → cached retry → accept, exact generated PNG bytes, palette/groups and ZIP verified.');
  } finally {
    if(ws)ws.close();
    const stop = child => !child ? Promise.resolve() : child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); setTimeout(resolve, 3000).unref(); });
    await Promise.all([stop(chrome), stop(server)]); upstream.closeAllConnections(); await new Promise(r=>upstream.close(r));
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
