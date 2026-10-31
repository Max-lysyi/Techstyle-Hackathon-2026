import { z } from 'zod';
import { PART_IDS } from './garment-parts';

const bbox = z.object({ x:z.number().finite(), y:z.number().finite(), width:z.number().finite().positive(), height:z.number().finite().positive() }).strict();
const locations = z.object({ parts:z.array(z.object({
  part:z.enum(PART_IDS), bbox:bbox.nullable(), reason:z.string().max(600),
}).strict()).length(4) }).strict();
export type PartLocations = z.infer<typeof locations>;
export const partLocationsSchema = {
  type:'object', additionalProperties:false, required:['parts'], properties:{ parts:{ type:'array', items:{
    type:'object', additionalProperties:false, required:['part','bbox','reason'], properties:{
      part:{type:'string',enum:PART_IDS}, reason:{type:'string'},
      bbox:{anyOf:[{type:'null'},{type:'object',additionalProperties:false,required:['x','y','width','height'],properties:{x:{type:'number'},y:{type:'number'},width:{type:'number'},height:{type:'number'}}}]},
    },
  } } },
} as const;
export function validatePartLocations(value:unknown):PartLocations {
  const parsed=locations.parse(value);
  if(new Set(parsed.parts.map(p=>p.part)).size!==4)throw new Error('Повторна деталь у відповіді.');
  return {parts:parsed.parts.map(p=>{
    if(!p.bbox)return p;
    const {x,y,width,height}=p.bbox,left=Math.max(0,x),top=Math.max(0,y),right=Math.min(1,x+width),bottom=Math.min(1,y+height);
    if(right-left<.01||bottom-top<.01)throw new Error('Область деталі поза зображенням або надто мала.');
    return {...p,bbox:{x:left,y:top,width:right-left,height:bottom-top}};
  })};
}
export const locatePartsPrompt = `Знайди на презентаційному макеті спортивної ФУТБОЛКИ чотири джерела принта: front (перед тулуба), back (спинка тулуба), right-sleeve (анатомічно правий рукав), left-sleeve (анатомічно лівий рукав). Поверни рівно чотири записи, по одному на кожний part. bbox — приблизний прямокутник області у нормалізованих координатах x,y,width,height відносно ВСЬОГО зображення. Для тулуба виключи рукави; для рукава вибери лише сам рукав із достатнім контекстом його візерунка. Перевага найбільшому, найчіткішому зображенню відповідної деталі. На передньому вигляді анатомічно правий рукав ліворуч для глядача, на задньому вигляді — праворуч. Можна вибрати видимий рукав з будь-якого вигляду, але не підміняй його протилежним. Не вибирай шорти, рекламний фон або таблиці. Якщо деталь дійсно не видно чи неможливо визначити сторону, bbox=null; не вигадуй її. reason — коротке пояснення українською. Це визначення областей для наступної реконструкції принта, не готові маски й не лекала.`;
