/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('fs'),assert=require('node:assert/strict'),ts=require('typescript'),Module=require('module'),path=require('path');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,file);
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,...args){return resolve.call(this,name.startsWith('@/')?path.resolve('src',name.slice(2)):name,...args)};
global.ImageData=class ImageData{constructor(data,width,height){this.data=data;this.width=width;this.height=height}};
const {PART_IDS,defaultPartSettings,classifyPart,partBaseColor,createPartLayers,normalizePartBase,unifyContinuousGradient,relabelRemoved,recolorPartLayer,mergePartPrints,updatePartMask}=require('../src/lib/garment-parts.ts');
const {composeExtractedLayers}=require('../src/lib/restoration.ts');
assert.deepEqual(PART_IDS,['front','back','right-sleeve','left-sleeve']);const settings=defaultPartSettings();settings.front.instructions='front only';assert.equal(settings.back.instructions,'');assert.notEqual(settings.front.aspect,settings['right-sleeve'].aspect);
const master=new ImageData(new Uint8ClampedArray([10,20,30,255, 200,10,10,255, 0,40,100,255, 0,90,180,255, 0,150,250,255, 10,20,30,255]),3,2);
const map=new ImageData(new Uint8ClampedArray([0,0,0,255, 255,0,0,255, 255,0,255,255, 255,0,255,255, 255,0,255,255, 0,0,0,255]),3,2);
const classes=classifyPart(master,map);assert.deepEqual([...classes],[0,1,6,6,6,0]);const base=partBaseColor(master,classes),layers=createPartLayers(master,classes,base);assert.equal(layers.length,3);assert.equal(layers.filter(l=>l.kind==='gradient').length,1,'all intermediate gradient colors remain together');assert.ok(layers.every(l=>l.type!=='logo'&&l.type!=='text'));
for(const layer of layers)assert.deepEqual(layer.bounds,{x:0,y:0,width:3,height:2});assert.deepEqual([...composeExtractedLayers(master,layers[0].foreground.image,layers).data],[...master.data]);
const gradient=layers.find(l=>l.kind==='gradient'),original=gradient.foreground.image.data.slice();
const recolored=recolorPartLayer(gradient,'#0044aa','#ffee00',['#990000','#ffee00']);assert.equal(recolored.mask,gradient.mask);assert.deepEqual([...gradient.foreground.image.data],[...original],'source stays unchanged');assert.notDeepEqual([...recolored.foreground.image.data],[...original]);for(let p=0;p<classes.length;p++)if(classes[p]!==6)assert.deepEqual([...recolored.foreground.image.data.slice(p*4,p*4+4)],[...original.slice(p*4,p*4+4)]);
const restored=recolorPartLayer(recolored,'#0044aa','#0044aa',gradient.gradient.sourceStops);assert.deepEqual([...restored.foreground.image.data],[...original],'gradient recoloring has no cumulative drift');
const groups=layers.map(l=>l.kind==='gradient'?{...l,groupId:'g',groupHidden:true}:l);assert.notDeepEqual([...composeExtractedLayers(master,layers[0].foreground.image,groups).data],[...master.data]);
const edited=gradient.mask.slice();edited[2]=0;const updated=updatePartMask(master,layers,gradient.id,edited);assert.equal(updated.length,layers.length);assert.equal(updated.find(l=>l.id===gradient.id).mask[2],0);assert.equal(layers.find(l=>l.id===gradient.id).mask[2],255);
assert.throws(()=>updatePartMask(master,layers,layers[0].id,edited));assert.throws(()=>createPartLayers(master,new Uint8Array([0,1,7,6,6,0]),base));assert.deepEqual([...relabelRemoved(new Uint8Array([0,7,6]),3,1)],[0,0,6]);assert.throws(()=>relabelRemoved(new Uint8Array([7,7]),2,1));
assert.throws(()=>classifyPart(master,new ImageData(new Uint8ClampedArray(4),1,1)));assert.equal(normalizePartBase(master,classes,base).data.length,master.data.length);
console.log('Garment parts: independent settings, variable layers, whole gradient, recoloring, alpha, grouping and forbidden-label exclusion verified.');

const smooth=new ImageData(new Uint8ClampedArray(80*20*4),80,20),split=new Uint8Array(80*20);for(let y=0;y<20;y++)for(let x=0;x<80;x++){const p=y*80+x;smooth.data.set([x*3,40,180,255],p*4);split[p]=x<40?6:5;}
assert.ok(unifyContinuousGradient(smooth,split).every(v=>v===6),'a smooth gradient split by the classifier reunites');
for(let y=0;y<20;y++)for(let x=40;x<80;x++)smooth.data.set([0,255,0,255],(y*80+x)*4);assert.equal(unifyContinuousGradient(smooth,split)[70],5,'hard-edged print stays independent');

const merged=mergePartPrints(master,layers,layers.slice(1).map(l=>l.id),'merged');assert.equal(merged.length,2);assert.equal(merged[1].kind,'gradient');assert.deepEqual([...composeExtractedLayers(master,layers[0].foreground.image,merged).data],[...master.data]);assert.deepEqual(merged[1].bounds,{x:0,y:0,width:3,height:2});

const edgeMaster=new ImageData(new Uint8ClampedArray(80),20,1),edgeMap=new ImageData(new Uint8ClampedArray(80),20,1);for(let p=0;p<20;p++)edgeMap.data.set(p<10?[0,255,255,255]:[255,0,255,255],p*4);edgeMap.data.set([128,128,255,255],9*4);const edgeClasses=classifyPart(edgeMaster,edgeMap);assert.ok(edgeClasses.every(v=>v===5||v===6),'mixed label boundaries cannot invent blue prints or forbidden text');

edgeMap.data.set([206,225,247,255],8*4);assert.ok(classifyPart(edgeMaster,edgeMap).every(v=>v!==7),'a pale mixed edge pixel is not a text-removal mask');
