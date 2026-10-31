import {randomBytes} from 'node:crypto';

type Job={id:string;created:number;updated:number;state:'queued'|'running'|'done';controller:AbortController;run:(signal:AbortSignal)=>Promise<Response>;result?:{body:string;status:number;retryAfter:string|null}};
/** Self-hosted Next.js process queue. Job IDs are private bearer capabilities. */
export class StudioJobs{
  private jobs=new Map<string,Job>();
  private running=false;
  enqueue(run:Job['run']):string|null{
    this.prune();
    if([...this.jobs.values()].filter(j=>j.state!=='done').length>=3)return null;
    const id=randomBytes(24).toString('hex'),now=Date.now();
    this.jobs.set(id,{id,created:now,updated:now,state:'queued',controller:new AbortController(),run});
    void this.pump();return id;
  }
  private prune(){
    for(const [id,job]of this.jobs)if(job.state==='done'&&Date.now()-job.updated>15*60_000)this.jobs.delete(id);
    const completed=[...this.jobs.values()].filter(j=>j.state==='done');
    while(completed.length>=6)this.jobs.delete(completed.shift()!.id);
  }
  private async pump(){
    if(this.running)return;this.running=true;
    try{
      for(const job of this.jobs.values()){
        if(job.state!=='queued')continue;
        job.state='running';
        const timer=setTimeout(()=>job.controller.abort(),480_000);
        try{
          const response=await job.run(job.controller.signal),body=await response.text();
          if(body.length>45*1024*1024)throw new Error('Результат перевищує допустимий розмір.');
          job.result={body,status:response.status,retryAfter:response.headers.get('retry-after')};
        }catch{
          job.result={body:JSON.stringify({error:job.controller.signal.aborted?'AI-операцію скасовано або вичерпано час очікування.':'Не вдалося виконати фонову операцію. Спробуйте ще раз явно.'}),status:job.controller.signal.aborted?499:502,retryAfter:null};
        }finally{
          clearTimeout(timer);job.state='done';job.updated=Date.now();
          // Release source image captured by the callback.
          job.run=async()=>Response.json({error:'Завершено.'});
        }
      }
    }finally{this.running=false;}
  }
  read(id:string){
    this.prune();const job=this.jobs.get(id);
    if(!job)return null;
    if(job.result)return new Response(job.result.body,{status:job.result.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...(job.result.retryAfter?{'Retry-After':job.result.retryAfter}:{})}});
    return Response.json({state:job.state,position:[...this.jobs.values()].filter(j=>j.state!=='done').findIndex(j=>j.id===id)},{status:202,headers:{'Cache-Control':'no-store'}});
  }
  cancel(id:string){
    const job=this.jobs.get(id);if(!job)return false;job.controller.abort();
    if(job.state==='queued'){job.state='done';job.updated=Date.now();job.result={body:JSON.stringify({error:'Операцію скасовано.'}),status:499,retryAfter:null};job.run=async()=>Response.json({});}
    return true;
  }
}
const shared=globalThis as typeof globalThis&{studioJobs?:StudioJobs};
export const studioJobs=shared.studioJobs??=new StudioJobs();
