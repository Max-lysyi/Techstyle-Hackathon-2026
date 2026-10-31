/** Baseline little-endian TIFF: 8-bit RGB, straight alpha, lossless Adobe Deflate.
 * No resolution or printing-profile tags are invented. One image, chunky strips.
 */
export async function encodeTiff(image:Pick<ImageData,'width'|'height'|'data'>):Promise<Uint8Array>{
  const {width,height,data}=image;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>16_777_216||data.length!==width*height*4)throw new Error('Некоректні розміри TIFF.');
  if(typeof CompressionStream==='undefined')throw new Error('Браузер не підтримує стиснення TIFF.');
  const rows=64,strips:Uint8Array[]=[];
  for(let y=0;y<height;y+=rows){
    const count=Math.min(rows,height-y),raw=new Uint8Array(width*count*4);
    for(let row=0;row<count;row++)for(let x=0;x<width*4;x++){
      const source=((y+row)*width*4)+x;
      raw[row*width*4+x]=(data[source]-(x>=4?data[source-4]:0)+256)&255;
    }
    strips.push(new Uint8Array(await new Response(new Blob([raw.buffer]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()));
  }
  const tags=12,ifdEnd=8+2+tags*12+4,bitsOffset=ifdEnd,offsetsOffset=bitsOffset+8;
  const countsOffset=offsetsOffset+(strips.length>1?strips.length*4:0);
  const pixelsOffset=countsOffset+(strips.length>1?strips.length*4:0);
  const total=pixelsOffset+strips.reduce((sum,s)=>sum+s.length,0),out=new Uint8Array(total),v=new DataView(out.buffer);
  out.set([73,73,42,0]);v.setUint32(4,8,true);v.setUint16(8,tags,true);
  let entry=10;
  const tag=(id:number,type:number,count:number,value:number)=>{v.setUint16(entry,id,true);v.setUint16(entry+2,type,true);v.setUint32(entry+4,count,true);if(type===3&&count===1)v.setUint16(entry+8,value,true);else v.setUint32(entry+8,value,true);entry+=12;};
  tag(256,4,1,width);tag(257,4,1,height);tag(258,3,4,bitsOffset);tag(259,3,1,8);tag(262,3,1,2);
  tag(273,4,strips.length,strips.length===1?pixelsOffset:offsetsOffset);tag(277,3,1,4);tag(278,4,1,rows);
  tag(279,4,strips.length,strips.length===1?strips[0].length:countsOffset);tag(284,3,1,1);tag(317,3,1,2);tag(338,3,1,2);
  v.setUint32(entry,0,true);for(let i=0;i<4;i++)v.setUint16(bitsOffset+i*2,8,true);
  let position=pixelsOffset;
  strips.forEach((strip,index)=>{if(strips.length>1){v.setUint32(offsetsOffset+index*4,position,true);v.setUint32(countsOffset+index*4,strip.length,true);}out.set(strip,position);position+=strip.length;});
  return out;
}

export type ArchiveFile={name:string;bytes:Uint8Array};
/** Add TIFF counterparts to color images. Masks stay in PNG. No external API. */
export async function appendTiffCopies(files:ArchiveFile[],progress?:(message:string)=>void):Promise<Record<string,string>>{
  const candidates=files.filter(f=>/\.(png|jpe?g)$/i.test(f.name)&&!/(?:\/masks\/|(?:^|\/)masks\/|-mask\.png$|\/masks\.png$)/i.test(f.name));
  const mapping:Record<string,string>={};
  for(const [index,file]of candidates.entries()){
    progress?.(`TIFF ${index+1}/${candidates.length} · ${file.name}`);
    const bitmap=await createImageBitmap(new Blob([file.bytes as Uint8Array<ArrayBuffer>],{type:/\.png$/i.test(file.name)?'image/png':'image/jpeg'}));
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx){bitmap.close();throw new Error('Canvas недоступний для TIFF.');}
    ctx.drawImage(bitmap,0,0);bitmap.close();
    const bytes=await encodeTiff(ctx.getImageData(0,0,canvas.width,canvas.height));canvas.width=1;
    const name=file.name.replace(/\.(png|jpe?g)$/i,'.tiff');files.push({name,bytes});mapping[file.name]=name;
  }
  // Mirror links in each manifest without changing PNG paths or geometry.
  const annotate=(value:unknown):unknown=>{
    if(Array.isArray(value))return value.map(annotate);
    if(!value||typeof value!=='object')return value;
    const out:Record<string,unknown>={};
    for(const [key,item]of Object.entries(value)){out[key]=annotate(item);if(typeof item==='string'&&mapping[item])out[key==='file'?'tiffFile':`${key.replace(/File$/,'')}TiffFile`]=mapping[item];}
    return out;
  };
  const encoder=new TextEncoder();
  for(const file of files)if(file.name.endsWith('manifest.json')){
    const manifest=annotate(JSON.parse(new TextDecoder().decode(file.bytes))) as Record<string,unknown>;
    manifest.tiff={format:'TIFF',colorSpace:'RGB',bitsPerSample:8,alpha:'unassociated',compression:'Adobe Deflate',dpi:null,...(file.name==='manifest.json'?{files:mapping}:{})};
    file.bytes=encoder.encode(JSON.stringify(manifest,null,2));
  }
  return mapping;
}
