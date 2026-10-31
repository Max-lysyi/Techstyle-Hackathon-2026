import {z} from 'zod';
import {loadSketch} from './load-sketch';

export const DEMO_PROJECTS=[
  {id:'askelat',title:'ASKELAT · хвилі',description:'4 деталі · кольорові принти й текстура',cover:'/demos/askelat/cover.webp'},
  {id:'victory',title:'VICTORY · птахи',description:'4 деталі · герб, написи й кольорові принти',cover:'/demos/victory/cover.webp'},
] as const;
const path=z.string().regex(/^\/demos\/[a-z0-9/-]+\.(webp|png|jpg)$/);
const rect=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative(),width:z.number().int().positive(),height:z.number().int().positive()});
const hex=z.string().regex(/^#[0-9a-f]{6}$/i);
const type=z.enum(['logo','text','number','graphic','background','unknown']);
const assetSize=z.enum(['1024x1024','1024x1536','1536x1024','2048x2048','2048x3072','3072x2048']);
export const demoSchema=z.object({
  schemaVersion:z.literal(1),id:z.enum(['askelat','victory']),title:z.string().max(100),description:z.string(),
  originalFile:path,sourceArchiveSha256:z.string().regex(/^[a-f0-9]{64}$/),provenance:z.string(),notes:z.array(z.string()),
  parts:z.array(z.object({id:z.enum(['front','back','right-sleeve','left-sleeve']),canvas:z.object({width:z.number().int().positive(),height:z.number().int().positive()}),
    masterFile:path,model:z.string(),usage:z.array(z.unknown()),sourceRect:rect.nullable(),warnings:z.array(z.string()),
    groups:z.array(z.object({id:z.string(),name:z.string(),visible:z.boolean()})),
    layers:z.array(z.object({id:z.string(),name:z.string(),type,kind:z.enum(['solid','gradient','texture','raster']),bounds:rect,
      visible:z.boolean(),groupHidden:z.boolean(),order:z.number().int(),groupId:z.string().nullable(),fillHex:hex.nullable(),file:path,
      gradient:z.object({sourceStops:z.tuple([hex,hex]),stops:z.tuple([hex,hex])}).nullable(),operations:z.array(z.string()),
    })).min(1).max(8),
  })).length(4),
  elements:z.array(z.object({id:z.string(),name:z.string(),type,sourceBounds:rect,file:path,model:z.string(),usage:z.unknown(),
    settings:z.object({text:z.string(),instructions:z.string(),size:assetSize}),approved:z.literal(true),source:z.literal('ai-reconstruction'),
  })).max(12),
});

async function bytes(path:string,signal:AbortSignal){
  const r=await fetch(path,{signal});if(!r.ok)throw new Error(`Не вдалося завантажити демо (${r.status}).`);
  const b=await r.arrayBuffer();if(b.byteLength>25*1024*1024)throw new Error('Файл демо перевищує ліміт.');return b;
}
async function pixels(data:ArrayBuffer){
  const bitmap=await createImageBitmap(new Blob([data]));
  try{
    if(bitmap.width*bitmap.height>16_777_216)throw new Error('Завелике зображення демо.');
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Canvas недоступний.');
    ctx.drawImage(bitmap,0,0);return ctx.getImageData(0,0,bitmap.width,bitmap.height);
  }finally{bitmap.close();}
}
export async function loadDemoProject(id:string,signal:AbortSignal){
  if(!DEMO_PROJECTS.some(d=>d.id===id))throw new Error('Невідомий демопроєкт.');
  const manifest=demoSchema.parse(JSON.parse(new TextDecoder().decode(await bytes(`/demos/${id}/project.json`,signal))));
  if(manifest.id!==id||new Set(manifest.parts.map(p=>p.id)).size!==4)throw new Error('Некоректні деталі демо.');
  const file=new File([await bytes(manifest.originalFile,signal)],`${manifest.title}.jpg`,{type:'image/jpeg'});
  // Load all data before replacing the user's current document.
  const parts=[];
  for(const part of manifest.parts){
    const master=await pixels(await bytes(part.masterFile,signal));
    if(master.width!==part.canvas.width||master.height!==part.canvas.height)throw new Error('Розміри демо не збігаються.');
    const layers=[];
    for(const layer of part.layers){
      const image=await pixels(await bytes(layer.file,signal));
      if(image.width!==master.width||image.height!==master.height||layer.bounds.x!==0||layer.bounds.y!==0||layer.bounds.width!==master.width||layer.bounds.height!==master.height)throw new Error('Координати шару демо не збігаються.');
      const mask=new Uint8Array(image.width*image.height);
      for(let p=0;p<mask.length;p++){mask[p]=image.data[p*4+3];if(!mask[p])for(let c=0;c<3;c++)image.data[p*4+c]=master.data[p*4+c];image.data[p*4+3]=255;}
      layers.push({...layer,image,mask});
    }
    parts.push({...part,master,layers});
  }
  const elements=[];
  for(const entry of manifest.elements){
    const png=new Uint8Array(await bytes(entry.file,signal)),image=await pixels(png.buffer);
    if(`${image.width}x${image.height}`!==entry.settings.size)throw new Error('Некоректний розмір елемента демо.');
    elements.push({...entry,png,image});
  }
  signal.throwIfAborted();
  return {manifest,parts,elements,file,loaded:await loadSketch(file)};
}
