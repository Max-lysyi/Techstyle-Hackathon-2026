/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,file);
// Match source aliases in the test runner without changing the app build.
const Module=require('module'),resolve=Module._resolveFilename;
Module._resolveFilename=function(name,...args){return resolve.call(this,name.startsWith('@/')?require('path').resolve('src',name.slice(2)):name,...args)};
global.ImageData=class ImageData{constructor(data,width,height){this.data=data;this.width=width;this.height=height}};
const {classifyDesign,designBaseColor,createDesignLayers,updateDesignMask}=require('../src/lib/four-layer-design.ts');
const {composeExtractedLayers}=require('../src/lib/restoration.ts');
const master=new ImageData(new Uint8ClampedArray([10,20,30,255, 90,40,20,255, 15,160,80,255, 250,250,250,255, 10,20,30,255, 15,160,80,255]),3,2);
const map=new ImageData(new Uint8ClampedArray([0,0,0,255, 255,0,0,255, 0,255,0,255, 0,0,255,255, 0,0,0,255, 0,255,0,255]),3,2);
const classes=classifyDesign(master,map);assert.deepEqual([...classes],[0,1,2,3,0,2]);
const base=designBaseColor(master,classes);assert.equal(base,'#0a141e');
const repaired=new ImageData(new Uint8ClampedArray(master.data),3,2);for(let p=0;p<classes.length;p++)if(classes[p]>1)repaired.data.set([10,20,30,255],p*4);
for(const underpaint of [undefined,repaired]){
 const layers=createDesignLayers(master,classes,base,underpaint);assert.equal(layers.length,4);
 for(const layer of layers){assert.deepEqual(layer.bounds,{x:0,y:0,width:3,height:2});assert.equal(layer.mask.length,6)}
 assert.ok(layers[0].mask.every(v=>v===255));assert.ok(layers[3].mask.some(v=>v===0));
 const composition=composeExtractedLayers(master,layers[0].foreground.image,layers);assert.deepEqual([...composition.data],[...master.data]);
 const changed=layers[3].mask.slice();changed[3]=0;changed[2]=255;
 const corrected=updateDesignMask(master,layers,'design-3',changed);assert.equal(corrected.length,4);assert.equal(corrected[2].mask[2],0);assert.equal(corrected[1].mask[3],255);
 assert.throws(()=>updateDesignMask(master,layers,'design-0',changed));
 const partial=layers[3].mask.slice();partial[3]=128;const soft=updateDesignMask(master,layers,'design-3',partial);assert.deepEqual([...composeExtractedLayers(master,layers[0].foreground.image,soft).data],[...master.data]);
}
assert.throws(()=>classifyDesign(master,new ImageData(new Uint8ClampedArray(4),1,1)));
console.log('Four rectangular layers: shared canvas, solid base, exact composite, transparency and reassignment verified.');

assert.throws(()=>classifyDesign(master,new ImageData(new Uint8ClampedArray(24).fill(255),3,2)));
