/** Short HTTP requests for long AI work over a reverse proxy. Never retries creation. */
export async function studioRequest(route:'/api/design'|'/api/analyze'|'/api/assets/reconstruct'|'/api/inpaint',init:RequestInit):Promise<Response>{
  const task={'/api/design':'design','/api/analyze':'analyze','/api/assets/reconstruct':'assets','/api/inpaint':'inpaint'}[route];
  const created=await fetch(`/api/jobs?task=${task}`,init);
  if(created.status!==202)return created;
  const {id}=await created.json();if(!/^[a-f0-9]{48}$/.test(id))throw new Error('Некоректний ідентифікатор завдання.');
  const url=`/api/jobs?id=${id}`,signal=init.signal;
  const cancel=()=>{void fetch(url,{method:'DELETE',keepalive:true}).catch(()=>{});};
  signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted){cancel();signal.throwIfAborted();}
  const pause=(ms:number)=>new Promise<void>((resolve,reject)=>{
    const stop=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);reject(new DOMException('Скасовано','AbortError'));};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve();},ms);
    signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
  });
  const deadline=Date.now()+25*60_000;
  try{
    for(;;){
      signal?.throwIfAborted();
      if(Date.now()>deadline){cancel();throw new Error('Час очікування завдання вичерпано.');}
      let result:Response;
      try{result=await fetch(url,{signal,cache:'no-store'});}
      catch{
        signal?.throwIfAborted();
        window.dispatchEvent(new CustomEvent('studio-job-state',{detail:{state:'reconnecting',position:0}}));
        await pause(2000);continue;
      }
      if(result.status!==202)return result;
      const progress=await result.json();
      window.dispatchEvent(new CustomEvent('studio-job-state',{detail:progress}));
      await pause(1000);
    }
  }finally{signal?.removeEventListener('abort',cancel);window.dispatchEvent(new CustomEvent('studio-job-state',{detail:{state:'idle',position:0}}));}
}
