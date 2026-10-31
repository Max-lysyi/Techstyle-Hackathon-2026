/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('fs'),fsp=require('fs/promises'),path=require('path'),os=require('os'),assert=require('node:assert/strict'),{spawn,spawnSync}=require('child_process'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),port=8107,debug=9233,delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<400;i++){try{const r=await fn();if(r)return r}catch{}await delay(150)}throw Error('Timeout '+label)}
function zipEntries(buffer){const out=new Map();let p=0;while(buffer.readUInt32LE(p)===0x04034b50){const size=buffer.readUInt32LE(p+18),n=buffer.readUInt16LE(p+26),e=buffer.readUInt16LE(p+28),name=buffer.subarray(p+30,p+30+n).toString(),start=p+30+n+e;out.set(name,buffer.subarray(start,start+size));p=start+size}return out}
(async()=>{
  const tmp=await fsp.mkdtemp(path.join(os.tmpdir(),'studio-demos-')),artifacts=path.join(root,'artifacts/presentation-demos');await fsp.mkdir(artifacts,{recursive:true});
  const chromeBin=[process.env.CHROME_BIN,'/home/volic/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));assert.ok(chromeBin);
  const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port',String(port)],{cwd:root,env:{...process.env,OPENAI_API_KEY:'',OPENAI_BASE_URL:'http://127.0.0.1:1'},stdio:'ignore'});
  const chrome=spawn(chromeBin,['--no-sandbox','--headless',`--remote-debugging-port=${debug}`,`--user-data-dir=${tmp}/profile`,'about:blank'],{stdio:'ignore'});let ws;
  try{
    await until(async()=>(await fetch(`http://localhost:${port}/studio`)).ok,'server');const tabs=await until(async()=>(await fetch(`http://localhost:${debug}/json`)).json(),'browser');
    ws=new WebSocket(tabs[0].webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map(),api=[],exceptions=[];
    ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result);pending.delete(m.id)}if(m.method==='Network.requestWillBeSent'&&new URL(m.params.request.url).pathname.startsWith('/api/'))api.push(m.params.request.url);if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails)};
    const send=(method,params={})=>new Promise((resolve,reject)=>{const i=++id;pending.set(i,{resolve,reject});ws.send(JSON.stringify({id:i,method,params}))});
    const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value};
    const wait=expr=>until(()=>evaluate(expr),expr);const click=name=>evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)}).click()`);
    const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});await fsp.writeFile(path.join(artifacts,name),Buffer.from(r.data,'base64'))};
    await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1100,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:`http://localhost:${port}/studio`});await wait(`document.querySelectorAll('[data-demo]').length===2`);await shot('welcome.png');assert.equal(api.length,0);
    for(const demo of ['askelat','victory']){
      if(demo==='victory'){await click('Демонстрації');await wait(`!!document.querySelector('[role=dialog]')`)}
      await evaluate(`document.querySelector('[data-demo="${demo}"]').click()`);await wait(`document.querySelectorAll('[data-part] canvas').length===4`);await wait(`!document.querySelector('[role=dialog]')`);
      assert.equal(api.length,0,'loading a real demo never calls any server API');await shot(`${demo}-overview.png`);
      await evaluate(`document.querySelector('[aria-label="Відкрити Перед"]').click()`);await wait(`document.querySelectorAll('[data-quick-layer]').length>1`);
      const before=await evaluate(`document.querySelector('.studio-detail-canvas canvas').toDataURL()`);
      await evaluate(`document.querySelectorAll('[data-quick-layer] button[aria-label^="Видимість"]')[1].click()`);await delay(250);
      assert.notEqual(await evaluate(`document.querySelector('.studio-detail-canvas canvas').toDataURL()`),before,'hiding a real print changes the composition');
      await evaluate(`document.querySelectorAll('[data-quick-layer] button[aria-label^="Видимість"]')[1].click()`);await delay(150);
      await evaluate(`document.querySelectorAll('[data-quick-layer] input[type=checkbox]')[1].click();document.querySelectorAll('[data-quick-layer] input[type=checkbox]')[2].click()`);await click('Згрупувати вибрані (2)');await wait(`document.body.innerText.includes('Розгрупувати')`);
      await evaluate(`document.querySelector('[data-quick-layer] button[aria-label^="Змінити колір"]').click()`);await wait(`!!document.querySelector('[data-palette-picker]')`);await evaluate(`document.querySelector('[data-palette-picker] button[aria-label^="Колір "]').click()`);await shot(`${demo}-layers.png`);
      await click('Усі 4 деталі');
      if(demo==='victory'){
        await evaluate(`document.querySelector('[aria-label="Герби й номери"]').click()`);await wait(`document.querySelectorAll('[data-asset-id]').length===3`);assert.equal(await evaluate(`document.querySelectorAll('[data-asset-proposal]').length`),0);await shot('victory-assets.png');await click('Усі 4 деталі');
      }
      await click('Увімкнути профіль презентації');assert.equal(await evaluate(`document.querySelector('[aria-label="Якість нових деталей"]').value`),'detail');assert.equal(await evaluate(`document.querySelector('[aria-label="TIFF у ZIP"]').checked`),true);assert.equal(api.length,0,'profile change is never a paid action');
      const downloads=path.join(tmp,demo);await fsp.mkdir(downloads);await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});await click('Завантажити ZIP');const file=path.join(downloads,'AI_Promt_Studio_project.zip');await until(()=>fs.existsSync(file),'real demo ZIP');
      assert.equal(spawnSync('unzip',['-t',file]).status,0);const files=zipEntries(fs.readFileSync(file)),manifest=JSON.parse(files.get('manifest.json'));assert.equal(manifest.demoProject.id,demo);assert.equal(manifest.parts.length,4);assert.ok(manifest.parts.every(p=>p.status==='ready'));assert.equal(manifest.elements.length,demo==='victory'?3:0);assert.ok(files.get(manifest.originalFile).equals(fs.readFileSync(path.join(root,`public/demos/${demo}/original.jpg`))));
      for(const [png,tiff]of Object.entries(manifest.tiff.files)){const a=await sharp(files.get(png)).metadata(),b=await sharp(files.get(tiff)).metadata();assert.equal(b.format,'tiff');assert.deepEqual([b.width,b.height],[a.width,a.height]);assert.ok(b.hasAlpha)}
      assert.equal(api.length,0,'editing and TIFF export are completely local');await fsp.copyFile(file,path.join(artifacts,`${demo}.zip`));
    }
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await click('Демонстрації');await shot('gallery-mobile.png');assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth`));assert.equal(exceptions.length,0,JSON.stringify(exceptions));
    console.log('Two real demos: load → four editable parts → hide/group/recolor → accepted assets → presentation profile → real PNG/TIFF ZIP; zero API calls, no key, valid coordinates/alpha/CRC and mobile layout verified.');
  }finally{ws?.close();server.kill('SIGTERM');chrome.kill('SIGTERM');await delay(500);await fsp.rm(tmp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
