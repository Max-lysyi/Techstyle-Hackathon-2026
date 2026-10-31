import OpenAI,{toFile} from 'openai';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {boundedBody,sameOrigin} from '@/lib/server/cv-worker';
import {imageBudget,imageBudgetError} from '@/lib/server/image-budget';

const inputSchema=z.object({
  image:z.string().max(14*1024*1024).regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/),
  bbox:z.object({x:z.number().finite().min(0).max(1),y:z.number().finite().min(0).max(1),width:z.number().finite().positive().max(1),height:z.number().finite().positive().max(1)}).strict(),
  name:z.string().trim().min(1).max(200),type:z.enum(['logo','text','number','graphic','unknown']),
  text:z.string().max(300),instructions:z.string().max(1500),size:z.enum(['1024x1024','1024x1536','1536x1024','2048x2048','2048x3072','3072x2048']),
}).strict();
type Result={image:string;model:string;usage:unknown;width:number;height:number;cached:boolean;reconstruction:true};
const cache=new Map<string,{time:number;result:Result}>();
const state=imageBudget();
function fail(message:string,status:number,headers:Record<string,string>={}){
  const key=process.env.OPENAI_API_KEY;
  const safe=(key?message.split(key).join('[приховано]'):message).replace(/sk-[\w-]+/g,'[приховано]');
  return Response.json({error:safe},{status,headers:{'Cache-Control':'no-store',...headers}});
}
export async function POST(request:Request){
  if(!sameOrigin(request))return fail('Стороннє джерело запиту.',403);
  if(!process.env.OPENAI_API_KEY)return fail('OPENAI_API_KEY не налаштовано на сервері.',503);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return fail('Очікується JSON.',415);
  if(Number(request.headers.get('content-length')||0)>16*1024*1024)return fail('Завеликий запит.',413);
  if(state.busy)return fail('Інша AI-операція ще виконується.',429,{'Retry-After':'5'});
  state.busy=true;
  try{
    const parsed=inputSchema.safeParse(JSON.parse((await boundedBody(request,16*1024*1024)).toString()));
    if(!parsed.success)return fail('Некоректний PNG, область або налаштування елемента.',400);
    const body=parsed.data,{x,y,width,height}=body.bbox;
    if(x+width>1.001||y+height>1.001)return fail('Область виходить за межі зображення.',400);
    const bytes=Buffer.from(body.image.split(',')[1],'base64');
    const input=sharp(bytes,{limitInputPixels:4_194_304,failOn:'error'}),meta=await input.metadata();
    if(meta.format!=='png'||!meta.width||!meta.height||(meta.pages&&meta.pages>1))return fail('Потрібен звичайний PNG до 4 мегапікселів.',400);
    const left=Math.floor(x*meta.width),top=Math.floor(y*meta.height),right=Math.min(meta.width,Math.ceil((x+width)*meta.width)),bottom=Math.min(meta.height,Math.ceil((y+height)*meta.height));
    if(right-left<3||bottom-top<3)return fail('Область надто мала. Уточніть її на ескізі.',400);
    const crop=async(padding:number)=>{
      const pad=Math.max(3,Math.ceil(Math.min(right-left,bottom-top)*padding)),cx=Math.max(0,left-pad),cy=Math.max(0,top-pad);
      const cw=Math.min(meta.width!,right+pad)-cx,ch=Math.min(meta.height!,bottom+pad)-cy,edge=padding>.1?1536:Math.max(768,Math.min(2048,Math.max(cw,ch)));
      return input.clone().extract({left:cx,top:cy,width:cw,height:ch}).resize({width:edge,height:edge,fit:'inside',withoutEnlargement:padding>.1,kernel:'lanczos3'}).png().toBuffer();
    };
    const [detail,context]=await Promise.all([crop(.08),crop(.8)]);
    const model=process.env.OPENAI_ASSET_IMAGE_MODEL||process.env.OPENAI_IMAGE_MODEL||'gpt-image-2.5-sunburst';
    const quality=(['low','medium','high','xhigh','max'].includes(process.env.OPENAI_ASSET_IMAGE_QUALITY||'')?process.env.OPENAI_ASSET_IMAGE_QUALITY:'high') as 'low'|'medium'|'high'|'xhigh'|'max';
    const prompt=`RECONSTRUCT A SINGLE GRAPHIC ELEMENT for a sportswear print asset. The FIRST image is a display-enlarged crop of the selected element (enlargement does not add original detail); the SECOND is surrounding reference context. Target: ${body.name}. Category: ${body.type}. Redraw ONLY this emblem, logo, numeral, or lettering as one crisp, clean, flat graphic on a genuinely TRANSPARENT background. This is a generative reconstruction from an imperfect compressed sketch, not a simple enlarged photograph. Preserve recognizable geometry, symbols, line weights, color relationships, font character and letter/number spacing. Remove the fabric, collar, garment silhouette, presentation background, lighting, folds, JPEG noise and unrelated neighboring graphics. Recover coherent sharp curves and small strokes conservatively; do not invent extra decorations. Keep all colors of a multicolor emblem in ONE asset. Preserve interior holes as transparency where appropriate. Use flat vector-like fills and crisp outlines. NO glow, bloom, light rays, halos, blur, lighting, metallic effects, shadows, bevels, mockups, frames, checkerboards, captions or watermarks. The entire empty space, including INTERNAL holes between strokes of an emblem or character, MUST have zero alpha. Do not fill negative spaces with yellow or any other color. Preserve opaque color inside the strokes with only narrow antialiased edges. Center the complete graphic with about 8% transparent padding and preserve its natural aspect ratio; do not stretch it to the canvas. ${body.text?`The exact required inscription/number, supplied by the user, is: ${JSON.stringify(body.text)}. Render these characters exactly and no additional text.`:'Preserve clearly readable lettering from the selected reference. Do not guess additional unreadable words.'} User refinement: ${body.instructions||'Match the reference faithfully.'} Output a single independent transparent PNG asset.`;
    const key=createHash('sha256').update(detail).update(context).update(model+quality+body.size+prompt+'|asset-v2').digest('hex'),now=Date.now();
    for(const [id,entry]of cache)if(now-entry.time>30*60_000)cache.delete(id);
    const cached=cache.get(key);if(cached)return Response.json({...cached.result,cached:true},{headers:{'Cache-Control':'no-store'}});
    const budget=imageBudgetError(state);if(budget)return fail(budget.message,429,{'Retry-After':String(budget.retryAfter)});
    state.calls.push(now);
    const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0,timeout:Math.max(1000,Math.min(300_000,Number(process.env.OPENAI_ASSET_TIMEOUT_MS)||(Number(body.size.split('x')[0])*Number(body.size.split('x')[1])>2_000_000?240_000:120_000)))});
    const result=await client.images.edit({model,image:[await toFile(detail,'selected-element.png',{type:'image/png'}),await toFile(context,'surrounding-context.png',{type:'image/png'})],prompt,size:body.size,quality,background:'transparent',output_format:'png',n:1},{signal:request.signal});
    const encoded=result.data?.[0]?.b64_json;if(!encoded||encoded.length>40*1024*1024)return fail('OpenAI не повернув допустимий PNG.',502);
    const output=sharp(Buffer.from(encoded,'base64'),{limitInputPixels:8_294_400,failOn:'error'}),info=await output.metadata(),[ow,oh]=body.size.split('x').map(Number);
    if(info.format!=='png'||info.width!==ow||info.height!==oh||(info.pages&&info.pages>1))return fail('OpenAI змінив формат або розміри елемента. Результат відхилено.',502);
    if(!info.hasAlpha)return fail('OpenAI повернув зображення без прозорості. Результат відхилено.',502);
    const pixels=await output.ensureAlpha().raw().toBuffer();let transparent=0,visible=0;
    for(let i=3;i<pixels.length;i+=4){if(pixels[i]===0)transparent++;if(pixels[i]>=128)visible++;}
    if(transparent<ow*oh*.01||visible<ow*oh*.0001)return fail('Немає справжнього прозорого фону або видимого елемента. Результат відхилено.',502);
    const value:Result={image:`data:image/png;base64,${encoded}`,model,usage:result.usage??null,width:ow,height:oh,cached:false,reconstruction:true};
    if(cache.size>=8)cache.delete(cache.keys().next().value!);cache.set(key,{time:Date.now(),result:value});
    console.info('[openai-asset]',{model,size:body.size,quality,usage:result.usage,requestId:result._request_id});
    return Response.json(value,{headers:{'Cache-Control':'no-store'}});
  }catch(e){
    if(e instanceof OpenAI.RateLimitError)return fail(`Ліміт OpenAI: ${e.message}`,429,{'Retry-After':e.headers.get('retry-after')||'60'});
    if(e instanceof OpenAI.APIConnectionTimeoutError)return fail('Час AI-відтворення елемента вичерпано.',504);
    if(e instanceof OpenAI.APIError)return fail(`Помилка OpenAI: ${e.message}`,502);
    return fail(e instanceof Error?e.message:'Не вдалося відтворити елемент.',400);
  }finally{state.busy=false;}
}
