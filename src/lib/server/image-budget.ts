/** Images Edit budget shared by garment parts and generated graphic elements. */
export interface ImageBudget {busy:boolean;calls:number[];cache:Map<string,unknown>}
const shared=globalThis as typeof globalThis & {designGuard?:ImageBudget};
export function imageBudget():ImageBudget{return shared.designGuard??={busy:false,calls:[],cache:new Map()};}
export function imageBudgetError(state:ImageBudget):{message:string;retryAfter:number}|null{
  const now=Date.now();state.calls=state.calls.filter(time=>now-time<3_600_000);
  const configured=Number(process.env.OPENAI_DESIGN_REQUESTS_PER_HOUR);
  const limit=Number.isInteger(configured)&&configured>=1&&configured<=200?configured:40;
  if(state.calls.length<limit)return null;
  const retryAfter=Math.max(1,Math.ceil((state.calls[0]+3_600_000-now)/1000));
  return {message:`Вичерпано встановлений бюджет обробки: ${limit} AI-операцій за годину. Спробуйте через ${Math.ceil(retryAfter/60)} хв. Готові результати збережено; завантаження з кешу доступне.`,retryAfter};
}
