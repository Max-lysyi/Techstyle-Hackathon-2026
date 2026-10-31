import OpenAI from 'openai';
import sharp from 'sharp';
import {z} from 'zod';
import {isGarmentArtwork,type VisionResult,type VisionElement} from '../vision-analysis';

/** The guide is only supplied to Vision. It is never used as artwork or a generation source. */
export async function coordinateGuide(bytes:Buffer,permille=false):Promise<Buffer>{
  const meta=await sharp(bytes).metadata(),w=meta.width!,h=meta.height!,font=Math.max(10,Math.round(Math.min(w,h)/50));
  let marks='';
  for(let n=1;n<10;n++){
    const x=Math.round(w*n/10),y=Math.round(h*n/10),label=permille?String(n*100):(n/10).toFixed(1);
    marks+=`<path d="M${x} 0V${h}M0 ${y}H${w}" stroke="#ffffff" stroke-opacity=".26" stroke-width="1"/>`;
    marks+=`<g fill="white" stroke="#000" stroke-width="2" paint-order="stroke" font-family="sans-serif" font-size="${font}"><text x="${x+2}" y="${font+2}">${label}</text><text x="2" y="${y-2}">${label}</text></g>`;
  }
  return sharp(bytes).composite([{input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${marks}</svg>`)}]).png().toBuffer();
}
const checkSchema=z.object({elements:z.array(z.object({
  id:z.string().max(120),present:z.boolean(),identity:z.string().max(200),name:z.string().max(200),
  type:z.enum(['logo','text','number']),text:z.string().max(300),reason:z.string().max(600),
  bbox:z.object({x:z.number().finite().min(0).max(1000),y:z.number().finite().min(0).max(1000),width:z.number().finite().positive().max(1000),height:z.number().finite().positive().max(1000)}).strict().nullable(),
}).strict()).max(4)}).strict();
export const artworkVerificationSchema={type:'object',additionalProperties:false,required:['elements'],properties:{elements:{type:'array',items:{type:'object',additionalProperties:false,required:['id','present','identity','name','type','text','reason','bbox'],properties:{id:{type:'string'},present:{type:'boolean'},identity:{type:'string'},name:{type:'string'},type:{type:'string',enum:['logo','text','number']},text:{type:'string'},reason:{type:'string'},bbox:{anyOf:[{type:'null'},{type:'object',additionalProperties:false,required:['x','y','width','height'],properties:{x:{type:'number'},y:{type:'number'},width:{type:'number'},height:{type:'number'}}}]}}}}}} as const;

export async function verifyArtwork(client:OpenAI,bytes:Buffer,initial:VisionResult,model:string,signal:AbortSignal,consume:()=>void){
  const meta=await sharp(bytes).metadata(),width=meta.width!,height=meta.height!;
  const candidates=initial.elements.filter(isGarmentArtwork).slice(0,12),rejected:Array<{id:string;name:string;reason:string}>=[],verified: Array<{element:VisionElement;identity:string;text:string}>=[],usages:unknown[]=[];
  for(let start=0;start<candidates.length;start+=4){
    if(signal.aborted)throw new Error('Аналіз скасовано.');
    const group=candidates.slice(start,start+4),crops=[];
    for(const element of group){
      const b=element.bbox,pad=Math.max(32,Math.max(b.width*width,b.height*height)*.9);
      const left=Math.max(0,Math.floor(b.x*width-pad)),top=Math.max(0,Math.floor(b.y*height-pad));
      const cw=Math.min(width,Math.ceil((b.x+b.width)*width+pad))-left,ch=Math.min(height,Math.ceil((b.y+b.height)*height+pad))-top;
      const image=await sharp(bytes).extract({left,top,width:cw,height:ch}).resize({width:1024,height:1024,fit:'inside',kernel:'lanczos3'}).png().toBuffer();
      crops.push({element,left,top,width:cw,height:ch,image,guide:await coordinateGuide(image,true)});
    }
    const content:OpenAI.Responses.ResponseInputContent[]=[{type:'input_text',text:'Перевір і точно локалізуй кожен кандидат на ОКРЕМОМУ фрагменті. До кожного id подано чистий фрагмент і той самий фрагмент із координатною сіткою. Координати bbox x,y,width,height від 0 до 1000 ВІДНОСНО СВОГО ФРАГМЕНТА, не всього аркуша. Поверни рівно один запис на кожний id. Назва кандидата може бути ПОМИЛКОВОЮ: спочатку реально подивись на зображення. present=true лише якщо логотип/герб/номер або потрібний напис ВИДНО ПОВНІСТЮ. Для порожньої тканини, коміра, декоративної хвилі замість напису, обрізаних літер, рекламних слоганів і підписів презентації present=false і bbox=null. Не прив’язуй назву емблеми до сусідніх літер. Знайди щільну рамку самого елемента з усіма краями; для тексту включи всі літери. Один різноколірний герб — одна рамка. Якщо той самий знак видно краще поруч на фрагменті, обери повний найчіткіший варіант. identity — короткий стабільний ідентифікатор графіки (однаковий для дублікатів того самого знака/напису; різний для різних кольорових варіантів). name і reason українською. text — лише дослівно прочитаний текст або номер, інакше порожній рядок. Не розпізнавай цифри координатної сітки як написи.'}];
    for(const crop of crops)content.push({type:'input_text',text:`id=${crop.element.id}; можлива назва=${crop.element.name}; збільшений чистий фрагмент (координати 0..1000 відносно цього зображення):`},{type:'input_image',image_url:`data:image/png;base64,${crop.image.toString('base64')}`,detail:'high'},{type:'input_image',image_url:`data:image/png;base64,${crop.guide.toString('base64')}`,detail:'high'});
    consume();
    const response=await client.responses.create({model,store:false,max_output_tokens:6000,reasoning:model.startsWith('gpt-4')?undefined:{effort:'low'},input:[{role:'user',content}],text:{format:{type:'json_schema',name:'verify_artwork_crops',strict:true,schema:artworkVerificationSchema}}},{signal});
    console.info('[openai-vision-verify]',{model:response.model,status:response.status,usage:response.usage,requestId:response._request_id});
    if(response.status!=='completed'||!response.output_text)throw new Error(`OpenAI не завершив перевірку областей (${response.incomplete_details?.reason||response.status}). Результати не прийнято.`);
    const result=checkSchema.parse(JSON.parse(response.output_text));
    if(result.elements.length!==group.length||new Set(result.elements.map(e=>e.id)).size!==group.length||result.elements.some(e=>!group.some(g=>g.id===e.id)))throw new Error('Некоректні ідентифікатори перевірених областей.');
    usages.push(response.usage??null);
    for(const item of result.elements){
      const crop=crops.find(c=>c.element.id===item.id)!;
      if(!item.present||!item.bbox){rejected.push({id:item.id,name:crop.element.name,reason:item.reason||'Елемент не підтверджено.'});continue;}
      const b=item.bbox,x=Math.max(0,b.x/1000),y=Math.max(0,b.y/1000),right=Math.min(1,(b.x+b.width)/1000),bottom=Math.min(1,(b.y+b.height)/1000);
      if(right<=x||bottom<=y||(right-x)*crop.width<4||(bottom-y)*crop.height<4)throw new Error('Перевірена рамка некоректна.');
      // Vision boxes remain approximate, even after crop inspection. Keep a safety
      // border so a small coordinate error cannot cut a thin emblem in half.
      // Lettering gets less padding to avoid including the adjacent line.
      const shortEdge=Math.min((right-x)*crop.width,(bottom-y)*crop.height);
      const margin=Math.max(3,shortEdge*(item.type==='text'?.15:.7));
      const left=Math.max(0,crop.left+x*crop.width-margin),top=Math.max(0,crop.top+y*crop.height-margin),r=Math.min(width,crop.left+right*crop.width+margin),bt=Math.min(height,crop.top+bottom*crop.height+margin);
      const element:VisionElement={...crop.element,name:item.name||crop.element.name,type:item.type,description:item.reason,bbox:{x:left/width,y:top/height,width:(r-left)/width,height:(bt-top)/height}};
      verified.push({element,identity:item.identity.trim().toLocaleLowerCase()||item.id,text:item.text});
    }
  }
  const unique=new Map<string,typeof verified[number]>();
  for(const entry of verified){const key=entry.identity,previous=unique.get(key);if(!previous||entry.element.bbox.width*entry.element.bbox.height>previous.element.bbox.width*previous.element.bbox.height)unique.set(key,entry);}
  const entries=[...unique.values()];
  return {data:{...initial,elements:entries.map(e=>e.element)},verifiedIds:entries.map(e=>e.element.id),transcriptions:Object.fromEntries(entries.map(e=>[e.element.id,e.text])),verification:{candidates:candidates.length,confirmed:entries.length,rejected},usages};
}
