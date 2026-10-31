import {boundedBody,sameOrigin} from '@/lib/server/cv-worker';
import {studioJobs} from '@/lib/server/studio-jobs';

const routes={design:'/api/design',analyze:'/api/analyze',assets:'/api/assets/reconstruct',inpaint:'/api/inpaint'};
const fail=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
  if(!sameOrigin(request))return fail('Стороннє джерело запиту.',403);
  const task=new URL(request.url).searchParams.get('task') as keyof typeof routes;
  if(!Object.hasOwn(routes,task))return fail('Невідома операція.',400);
  try{
    const body=await boundedBody(request,18*1024*1024),headers=new Headers(request.headers);
    headers.delete('content-length');
    const url=new URL(routes[task],request.url);
    const id=studioJobs.enqueue(async signal=>{
      const run=task==='design'?(await import('../design/route')).POST:task==='analyze'?(await import('../analyze/route')).POST:task==='assets'?(await import('../assets/reconstruct/route')).POST:(await import('../inpaint/route')).POST;
      return run(new Request(url,{method:'POST',headers,body:Uint8Array.from(body),signal}));
    });
    if(!id)return fail('Черга заповнена. Зачекайте завершення поточних операцій.',429);
    return Response.json({id},{status:202,headers:{'Cache-Control':'no-store'}});
  }catch{return fail('Не вдалося прочитати запит. Максимум 18 МБ.',400);}
}
function id(request:Request){const value=new URL(request.url).searchParams.get('id')||'';return /^[a-f0-9]{48}$/.test(value)?value:'';}
export async function GET(request:Request){
  if(!sameOrigin(request))return fail('Стороннє джерело запиту.',403);
  return studioJobs.read(id(request))||fail('Завдання не знайдено або сервер перезапущено. Готовий результат не підставляється.',404);
}
export async function DELETE(request:Request){
  if(!sameOrigin(request))return fail('Стороннє джерело запиту.',403);
  return studioJobs.cancel(id(request))?Response.json({cancelled:true}):fail('Завдання не знайдено.',404);
}
