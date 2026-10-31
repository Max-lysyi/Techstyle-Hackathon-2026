import type { PrintLayer, Rect } from './decomposition';
import { hexRgb } from './color-matching';

export const PART_IDS = ['front', 'back', 'right-sleeve', 'left-sleeve'] as const;
export type PartId = typeof PART_IDS[number];
export const PART_NAMES: Record<PartId, string> = { front: 'Перед', back: 'Спинка', 'right-sleeve': 'Правий рукав', 'left-sleeve': 'Лівий рукав' };
export const PART_SIZES = { portrait: '1024x1536', square: '1024x1024', landscape: '1536x1024', sleeve: '768x1536', 'portrait-2k':'2048x3072', 'square-2k':'2048x2048', 'landscape-2k':'3072x2048', 'sleeve-2k':'1536x3072' } as const;
export type PartAspect = keyof typeof PART_SIZES;
export type LayerGroup = { id: string; name: string; visible: boolean };
export type PartSettings = { aspect: PartAspect; instructions: string; engine: 'default' | 'fast' | 'precise'; sourceRect: Rect | null };
export const defaultPartSettings = (): Record<PartId, PartSettings> => Object.fromEntries(PART_IDS.map(id => [id, { aspect: id.includes('sleeve') ? 'sleeve-2k' : 'portrait-2k', instructions: '', engine: 'default', sourceRect: null }])) as Record<PartId, PartSettings>;
// These are classification labels, never output artwork colors.
export const PART_CODES = [[0,0,0],[255,0,0],[0,255,0],[0,0,255],[255,255,0],[0,255,255],[255,0,255],[255,255,255]] as const;
export function classifyPart(master: ImageData, map: ImageData): Uint8Array {
  if (master.width!==map.width || master.height!==map.height) throw new Error('Карта має інші розміри, ніж розгортка деталі.');
  const classes=new Uint8Array(master.width*master.height),queue=new Int32Array(classes.length);let invalid=0,tail=0;const seeds=new Uint32Array(8);
  for(let p=0;p<classes.length;p++){
    let best=0,distance=Infinity;
    for(let c=0;c<PART_CODES.length;c++){const d=PART_CODES[c].reduce<number>((sum,v,k)=>sum+(v-map.data[p*4+k])**2,0);if(d<distance){distance=d;best=c;}}
    if(distance>(best===7?40**2:70**2)){classes[p]=255;invalid++;}else{classes[p]=best;seeds[best]++;}
  }
  if(invalid>classes.length*.1)throw new Error('Модель повернула некоректну карту принтів. Повторіть поділ.');
  // Antialiased mixtures of two label colors can resemble a third label. Propagate confident
  // neighboring labels instead of inventing a print or a forbidden-text region at that boundary.
  for(let p=0;p<classes.length;p++)if(classes[p]<8){if(classes[p]===7&&seeds[7]<4)classes[p]=255;else queue[tail++]=p;}
  let head=0;const width=master.width;while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);for(const n of [x?p-1:-1,x<width-1?p+1:-1,y?p-width:-1,y<master.height-1?p+width:-1])if(n>=0&&classes[n]===255){classes[n]=classes[p];queue[tail++]=n;}}
  return classes;
}
export function partBaseColor(image: ImageData, classes: Uint8Array): string {
  const counts=new Map<number,number>(),step=Math.max(1,Math.floor(classes.length/120000));
  for(let p=0;p<classes.length;p+=step)if(classes[p]===0){const i=p*4,n=(image.data[i]<<16)|(image.data[i+1]<<8)|image.data[i+2];counts.set(n,(counts.get(n)||0)+1);}
  // With no visible base the hidden substrate is unknowable. Use a conservative dark
  // corner color as an editable default; the opaque print still preserves every source pixel.
  if(!counts.size){const corners=[0,image.width-1,image.width*(image.height-1),image.width*image.height-1];corners.sort((a,b)=>[.2126,.7152,.0722].reduce((sum,v,c)=>sum+(image.data[a*4+c]-image.data[b*4+c])*v,0));const i=corners[0]*4,n=(image.data[i]<<16)|(image.data[i+1]<<8)|image.data[i+2];counts.set(n,1);}
  const value=[...counts].reduce((a,b)=>b[1]>a[1]?b:a)[0];return '#'+value.toString(16).padStart(6,'0');
}
export function normalizePartBase(image: ImageData, classes: Uint8Array, hex: string): ImageData {
  const out=new ImageData(new Uint8ClampedArray(image.data),image.width,image.height),rgb=hexRgb(hex);
  for(let p=0;p<classes.length;p++)if(classes[p]===0&&rgb.every((v,c)=>Math.abs(image.data[p*4+c]-v)<=6))out.data.set([...rgb,255],p*4);
  return out;
}
function colorOf(image: ImageData,mask:Uint8Array):string {
  const sums=[0,0,0];let count=0;const step=Math.max(1,Math.floor(mask.length/8000));
  for(let p=0;p<mask.length;p+=step)if(mask[p]){for(let c=0;c<3;c++)sums[c]+=image.data[p*4+c];count++;}
  if(!count)for(let p=0;p<mask.length;p++)if(mask[p])return '#'+[0,1,2].map(c=>image.data[p*4+c].toString(16).padStart(2,'0')).join('');
  return '#'+sums.map(v=>Math.round(v/Math.max(1,count)).toString(16).padStart(2,'0')).join('');
}
/** Estimate a color coordinate from the raster; no original vector gradient parameters are claimed. */
export function gradientStops(image:ImageData,mask:Uint8Array):[string,string] {
  const samples:number[][]=[],step=Math.max(1,Math.floor(mask.length/10000));
  for(let p=0;p<mask.length;p+=step)if(mask[p])samples.push([image.data[p*4],image.data[p*4+1],image.data[p*4+2]]);
  if(!samples.length)return ['#000000','#ffffff'];
  const mean=[0,1,2].map(c=>samples.reduce((s,v)=>s+v[c],0)/samples.length),cov=Array.from({length:3},()=>[0,0,0]);
  for(const sample of samples)for(let a=0;a<3;a++)for(let b=0;b<3;b++)cov[a][b]+=(sample[a]-mean[a])*(sample[b]-mean[b]);
  let axis=[1,.7,.3];for(let n=0;n<12;n++){const next=cov.map(row=>row.reduce((s,v,c)=>s+v*axis[c],0)),norm=Math.hypot(...next)||1;axis=next.map(v=>v/norm);}
  if(axis.reduce((s,v,c)=>s+v*[.2126,.7152,.0722][c],0)<0)axis=axis.map(v=>-v);
  samples.sort((a,b)=>a.reduce((s,v,c)=>s+(v-b[c])*axis[c],0));
  const hex=(sample:number[])=>'#'+sample.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
  return [hex(samples[Math.floor((samples.length-1)*.03)]),hex(samples[Math.floor((samples.length-1)*.97)])];
}
export function createPartLayers(master:ImageData,classes:Uint8Array,baseHex:string):PrintLayer[] {
  if(classes.length!==master.width*master.height || classes.some(v=>v>7))throw new Error('Некоректна класифікація деталі.');
  const bounds={x:0,y:0,width:master.width,height:master.height},base=hexRgb(baseHex),solid=new ImageData(new Uint8ClampedArray(master.data.length),master.width,master.height);
  const masks=Array.from({length:7},()=>new Uint8Array(classes.length));masks[0].fill(255);
  for(let p=0;p<classes.length;p++){solid.data.set([...base,255],p*4);const code=classes[p];if(code===7)throw new Error('Спочатку вилучіть написи й логотипи з розгортки.');if(code>0)masks[code][p]=255;else if(base.some((v,c)=>v!==master.data[p*4+c]))masks[1][p]=255;}
  return masks.flatMap((mask,code)=>{
    if(code>0&&!mask.some(Boolean))return [];
    const color=code===0?baseHex:colorOf(master,mask),kind=code===0?'solid':code===6?'gradient':code===5?'texture':'raster';
    const name=code===0?'Основа':code===6?'Градієнт':code===5?'Текстура':code===4?'Орнамент':`Кольоровий принт ${code}`;
    return [{id:`part-layer-${code}`,name,fillHex:color,type:code===0?'background':'graphic',source:'estimated-foreground',bounds,mask,visible:true,order:code,kind,
      foreground:{image:code===0?solid:master,bounds},gradient:code===6?{sourceStops:gradientStops(master,mask),stops:gradientStops(master,mask)}:undefined,
      operations:['розгортка окремої деталі','без логотипів та написів','маски у спільних координатах деталі']} as PrintLayer];
  });
}
/** Recolor from the unchanged source each time; keep geometry, alpha and texture residuals. */
export function recolorPartLayer(layer:PrintLayer,fromHex:string,toHex:string,gradient?:[string,string]):PrintLayer {
  if(!layer.foreground)throw new Error('Шар не має растрового джерела.');
  const source=layer.colorSource||layer.foreground.image,out=new ImageData(new Uint8ClampedArray(source.data),source.width,source.height);
  const low=hexRgb(layer.gradient?.sourceStops[0]||fromHex),high=hexRgb(layer.gradient?.sourceStops[1]||fromHex),a=hexRgb(gradient?.[0]||toHex),b=hexRgb(gradient?.[1]||toHex);
  const axis=high.map((v,c)=>v-low[c]),length=axis.reduce((s,v)=>s+v*v,0)||1;
  for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){
    const p=y*source.width+x,global=(y+layer.foreground.bounds.y)*layer.bounds.width+x+layer.foreground.bounds.x;
    if(!layer.mask[global])continue;
    if(layer.kind==='gradient'){
      const t=Math.max(0,Math.min(1,axis.reduce((s,v,c)=>s+(source.data[p*4+c]-low[c])*v,0)/length));
      for(let c=0;c<3;c++)out.data[p*4+c]=a[c]+(b[c]-a[c])*t+source.data[p*4+c]-(low[c]+axis[c]*t);
    }else if(layer.type==='background'){for(let c=0;c<3;c++)out.data[p*4+c]=a[c];}
    else {const old=hexRgb(layer.recolorSource||fromHex),shade=Math.max(.05,(source.data[p*4]*.2126+source.data[p*4+1]*.7152+source.data[p*4+2]*.0722)/Math.max(1,old[0]*.2126+old[1]*.7152+old[2]*.0722));for(let c=0;c<3;c++)out.data[p*4+c]=a[c]*shade;}
  }
  return {...layer,fillHex:toHex,colorSource:source,recolorSource:layer.recolorSource||fromHex,foreground:{...layer.foreground,image:out},gradient:layer.gradient?{...layer.gradient,stops:gradient||[toHex,toHex]}:undefined,operations:[...layer.operations,'перефарбування з палітри']};
}
export function updatePartMask(master:ImageData,layers:PrintLayer[],id:string,mask:Uint8Array):PrintLayer[] {
  const target=layers.findIndex(layer=>layer.id===id);if(target<0||layers[target].type==='background')throw new Error('Редагуйте маску принта; основа залишається суцільною.');
  if(mask.length!==master.width*master.height)throw new Error('Розміри маски не збігаються.');
  return layers.map((layer,index)=>index===target?{...layer,mask,operations:[...layer.operations,'ручна корекція маски']}:layer);
}
export function effectiveLayers(layers:PrintLayer[]):PrintLayer[]{return layers.filter(l=>l.visible&&!l.groupHidden);}
/** Relabel forbidden marks from their nearest surrounding print, without inventing a logo layer. */
export function relabelRemoved(classes:Uint8Array,width:number,height:number):Uint8Array{
  const out=classes.slice(),queue=new Int32Array(out.length);let head=0,tail=0;
  const neighbors=(p:number)=>[p%width? p-1:-1,p%width<width-1?p+1:-1,p>=width?p-width:-1,p<width*(height-1)?p+width:-1];
  for(let p=0;p<out.length;p++)if(classes[p]===7){const near=neighbors(p).find(n=>n>=0&&classes[n]!==7);if(near!==undefined){out[p]=classes[near];queue[tail++]=p;}}
  while(head<tail){const p=queue[head++];for(const n of neighbors(p))if(n>=0&&out[n]===7){out[n]=out[p];queue[tail++]=n;}}
  if(out.some(v=>v===7))throw new Error('Маска написів охоплює всю деталь: потрібен видимий принт навколо.');return out;
}
/** Join classifier fragments only when their shared edge is photometrically continuous with a gradient. */
export function unifyContinuousGradient(image:ImageData,classes:Uint8Array):Uint8Array{
  if(!classes.some(v=>v===6))return classes;
  const out=classes.slice(),visited=new Uint8Array(classes.length),queue=new Int32Array(classes.length),w=image.width,h=image.height;
  for(let seed=0;seed<out.length;seed++){
    const code=out[seed];if(!code||code>=6||visited[seed])continue;
    let head=0,tail=1,edges=0,close=0;queue[0]=seed;visited[seed]=1;
    while(head<tail){const p=queue[head++],x=p%w,y=Math.floor(p/w);const neighbors=[x?p-1:-1,x<w-1?p+1:-1,y?p-w:-1,y<h-1?p+w:-1];
      for(const n of neighbors)if(n>=0){if(out[n]===code&&!visited[n]){visited[n]=1;queue[tail++]=n;}else if(out[n]===6){edges++;const distance=Math.hypot(image.data[p*4]-image.data[n*4],image.data[p*4+1]-image.data[n*4+1],image.data[p*4+2]-image.data[n*4+2]);if(distance<28)close++;}}
    }
    if(tail>=64&&edges>=12&&close/edges>=.8)for(let i=0;i<tail;i++)out[queue[i]]=6;
  }
  return out;
}
/** Explicit merge for manual correction of a print that the classifier split into several fragments. */
export function mergePartPrints(master:ImageData,layers:PrintLayer[],ids:string[],id:string):PrintLayer[]{
  const chosen=layers.filter(l=>ids.includes(l.id)&&l.type!=='background');if(chosen.length<2)throw new Error('Оберіть щонайменше два принти без основи.');
  const data=new Uint8ClampedArray(master.data.length),mask=new Uint8Array(master.width*master.height);
  for(const layer of [...chosen].sort((a,b)=>a.order-b.order)){
    const source=layer.foreground?.image||master,bounds=layer.foreground?.bounds||{x:0,y:0,width:master.width,height:master.height};
    for(let p=0;p<mask.length;p++)if(layer.mask[p]){const x=p%master.width,y=Math.floor(p/master.width),q=(y-bounds.y)*source.width+x-bounds.x;if(x<bounds.x||y<bounds.y||x>=bounds.x+bounds.width||y>=bounds.y+bounds.height)continue;const a=layer.mask[p]/255,b=mask[p]/255,alpha=a+b*(1-a);for(let c=0;c<3;c++)data[p*4+c]=(source.data[q*4+c]*a+data[p*4+c]*b*(1-a))/alpha;mask[p]=Math.round(alpha*255);}
  }
  if(!mask.some(Boolean))throw new Error('Маски обраних принтів порожні.');for(let p=0;p<mask.length;p++)data[p*4+3]=255;
  const image=new ImageData(data,master.width,master.height),isGradient=chosen.some(l=>l.kind==='gradient'),stops=isGradient?gradientStops(image,mask):undefined;
  const merged:PrintLayer={id,name:isGradient?'Об’єднаний градієнт':'Об’єднаний принт',type:'graphic',kind:isGradient?'gradient':'raster',source:'estimated-foreground',bounds:{x:0,y:0,width:master.width,height:master.height},mask,visible:true,order:Math.min(...chosen.map(l=>l.order)),foreground:{image,bounds:{x:0,y:0,width:master.width,height:master.height}},gradient:stops?{sourceStops:stops,stops}:undefined,operations:[...chosen.flatMap(l=>l.operations),'ручне об’єднання принтів']};
  return [...layers.filter(l=>!chosen.some(c=>c.id===l.id)),merged].sort((a,b)=>a.order-b.order);
}
