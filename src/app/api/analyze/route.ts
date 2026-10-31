import OpenAI from 'openai';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { locatePartsPrompt, partLocationsSchema, validatePartLocations } from '@/lib/part-locations';
import {coordinateGuide,verifyArtwork} from '@/lib/server/artwork-grounding';
import { validateVisionResult, visionJsonSchema } from '@/lib/vision-analysis';

const MAX_BYTES = 18 * 1024 * 1024;
const MAX_REQUESTS_PER_HOUR = 30;
const timeoutMs = () => Math.max(1000,Math.min(120_000,Number(process.env.OPENAI_VISION_TIMEOUT_MS)||90_000));
const locationCache = new Map<string,{time:number;payload:unknown}>();
// Instance-local guard: production requires shared rate limits and authenticated access.
const guard = globalThis as typeof globalThis & { visionGuard?: { timestamps: number[]; busy: boolean } };
const state = guard.visionGuard ??= { timestamps: [], busy: false };

function safeMessage(message: string) {
  const key = process.env.OPENAI_API_KEY;
  return (key ? message.split(key).join('[приховано]') : message).replace(/sk-[A-Za-z0-9_-]+/g, '[приховано]');
}

function error(message: string, status: number, headers?: HeadersInit) {
  return Response.json({ error: safeMessage(message) }, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

class InputError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function readBounded(request: Request): Promise<Buffer> {
  if (Number(request.headers.get('content-length') || 0) > MAX_BYTES) throw new InputError('Зображення завелике: максимум 18 МБ.', 413);
  if (!request.body) throw new InputError('Зображення відсутнє.', 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new InputError('Час завантаження зображення вичерпано.', 408)); void reader.cancel(); }, 15_000);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { void reader.cancel(); throw new InputError('Зображення завелике: максимум 18 МБ.', 413); }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { clearTimeout(timer); }
}

export async function POST(request: Request) {
  const task=request.headers.get('x-analysis-task');
  const locateParts = task === 'garment-parts', artworkElements=task === 'artwork-elements';
  const model=locateParts||artworkElements ? ((artworkElements?process.env.OPENAI_ASSET_VISION_MODEL:undefined)||process.env.OPENAI_PARTS_MODEL || 'gpt-5.4') : (process.env.OPENAI_VISION_MODEL || 'gpt-6.1-terra');
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const host = request.headers.get('host');
      const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || new URL(request.url).protocol.slice(0, -1);
      if (!host || originUrl.host !== host || originUrl.protocol !== `${protocol}:`) return error('Запит із іншого джерела заборонено.', 403);
    } catch { return error('Некоректне джерело запиту.', 403); }
  }
  if (!process.env.OPENAI_API_KEY) return error('OPENAI_API_KEY не налаштовано на сервері.', 503);
  const contentType = request.headers.get('content-type')?.split(';')[0];
  if (contentType !== 'image/png' && contentType !== 'image/jpeg') return error('Підтримуються лише JPEG та PNG.', 415);
  state.timestamps = state.timestamps.filter(t => Date.now() - t < 60 * 60 * 1000);
  if (state.busy) return error('Інший AI-аналіз ще виконується. Повторіть пізніше.', 429, { 'Retry-After': '10' });
  state.busy = true;
  try {
    let bytes: Buffer;
    try { bytes = await readBounded(request); } catch (e) { return error(e instanceof Error ? e.message : 'Не вдалося прочитати файл.', e instanceof InputError ? e.status : 400); }
    let prepared: Buffer;
    try {
      const input = sharp(bytes, { limitInputPixels: 16_777_216, failOn: 'error' });
      const metadata = await input.metadata();
      if (!metadata.width || !metadata.height || !['png', 'jpeg'].includes(metadata.format || '') || metadata.format !== (contentType === 'image/png' ? 'png' : 'jpeg') || (metadata.pages && metadata.pages > 1)) throw new Error('invalid image');
      prepared = await input.rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    } catch { return error('Пошкоджене або непідтримуване зображення, або перевищено ліміт пікселів.', 400); }
    const cacheKey=locateParts||artworkElements?createHash('sha256').update(prepared).update(model).update((task||'')+'|grounded-v5').digest('hex'):'';
    const cached=locationCache.get(cacheKey);
    if(cached && Date.now()-cached.time<30*60*1000)return Response.json(cached.payload,{headers:{'Cache-Control':'no-store'}});
    const consume=()=>{state.timestamps=state.timestamps.filter(t=>Date.now()-t<3_600_000);if(state.timestamps.length>=MAX_REQUESTS_PER_HOUR)throw new InputError('Вичерпано бюджет Vision-перевірок. Спробуйте пізніше.',429);state.timestamps.push(Date.now());};
    consume();
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: timeoutMs(), maxRetries: 0 });
    const response = await client.responses.create({
      model,
      store: false,
      max_output_tokens: locateParts ? 1800 : artworkElements?5000:3500,
      reasoning: model.startsWith('gpt-4') ? undefined : { effort: 'low' },
      input: [{ role: 'user', content: [
        { type: 'input_text', text: locateParts ? locatePartsPrompt : (artworkElements?'Знайди до 12 різних повних знаків. Обирай найчіткіший і найбільший повтор кожного логотипа, не дублюй однакову графіку з різних ракурсів. Усі назви українською. Друге зображення — лише координатна сітка для рамок; не розпізнавай її цифри. Відповідь bbox має бути у частках 0..1 відносно всього чистого зображення. ':'')+'Проаналізуй видимий растровий макет спортивного одягу для декомпозиції. Знайди до 20 логотипів, емблем, імен, номерів та написів САМЕ НА ОДЯЗІ або окремих референсних логотипів. Не включай заголовки презентації, підписи зображень, інтерфейс телефону, таблиці характеристик чи рамки. Кожен логотип/напис поверни окремо з щільною рамкою: вона має містити всі літери та край елемента, але мінімум навколишнього декору. Для групи різноколірних частин одного логотипа дай одну рамку. Не об’єднуй весь одяг в елемент. Для видимих написів (транскрибуй лише якщо читаються), номерів та графічних елементів. Не припускай прихованого або нечіткого тексту. Для кожного дай унікальний id, назву, тип, приблизну рамку bbox: x і y лівого верхнього кута, width і height; усі значення нормалізовані від 0 до 1 відносно всього зображення. confidence від 0 до 1 є приблизною оцінкою, а не виміряною ймовірністю. Визнач характер фону та надай практичні рекомендації щодо виділення і відновлення українською. Рамки приблизні, не контури сегментації. Не вигадуй DPI, ICC, CMYK чи Pantone. Якщо елементів немає, поверни порожній масив.' },
        { type: 'input_image', image_url: `data:image/png;base64,${prepared.toString('base64')}`, detail: 'high' },
        ...(locateParts||artworkElements?[{type:'input_image' as const,image_url:`data:image/png;base64,${(await coordinateGuide(prepared)).toString('base64')}`,detail:'high' as const}]:[]),
      ] }],
      text: { format: { type: 'json_schema', name: locateParts ? 'garment_part_locations' : 'design_decomposition', strict: true, schema: locateParts ? partLocationsSchema : visionJsonSchema } },
    }, { signal: request.signal });
    if (response.status !== 'completed') return error(`OpenAI не завершив аналіз: ${response.incomplete_details?.reason || response.status}.`, 502);
    const refusal = response.output.flatMap(item => item.type === 'message' ? item.content : []).find(part => part.type === 'refusal');
    if (refusal && refusal.type === 'refusal') return error(`OpenAI відхилив запит: ${refusal.refusal}`, 422);
    if (!response.output_text) return error('OpenAI повернув порожню відповідь.', 502);
    let data;
    try { data = locateParts ? validatePartLocations(JSON.parse(response.output_text)) : validateVisionResult(JSON.parse(response.output_text)); } catch { return error('OpenAI повернув некоректні структуровані дані або координати.', 502); }
    console.info('[openai-vision]', { model: response.model, usage: response.usage, requestId: response._request_id });
    let verification:Awaited<ReturnType<typeof verifyArtwork>>|undefined;
    if(artworkElements){verification=await verifyArtwork(client,prepared,data as import('@/lib/vision-analysis').VisionResult,model,request.signal,consume);data=verification.data;}
    const calls=[response.usage,...(verification?.usages||[])].filter(Boolean) as Array<{input_tokens:number;output_tokens:number;total_tokens:number}>;
    const usage=calls.length?{input_tokens:calls.reduce((n,u)=>n+u.input_tokens,0),output_tokens:calls.reduce((n,u)=>n+u.output_tokens,0),total_tokens:calls.reduce((n,u)=>n+u.total_tokens,0),calls}:null;
    const payload={data,usage,model:response.model,...(verification?{verifiedIds:verification.verifiedIds,transcriptions:verification.transcriptions,verification:verification.verification}:{})};
    if(locateParts||artworkElements){if(locationCache.size>=8)locationCache.delete(locationCache.keys().next().value!);locationCache.set(cacheKey,{time:Date.now(),payload});}
    return Response.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if(e instanceof InputError)return error(e.message,e.status,e.status===429?{'Retry-After':'60'}:undefined);
    if (e instanceof OpenAI.RateLimitError) return error(`Ліміт OpenAI: ${e.message}`, 429, { 'Retry-After': e.headers.get('retry-after') || '60' });
    if (e instanceof OpenAI.APIConnectionTimeoutError) return error('Час очікування відповіді OpenAI вичерпано.', 504);
    if (e instanceof OpenAI.APIError) return error(`Помилка OpenAI (${e.status ?? 'невідомий статус'}): ${e.message}`, 502);
    return error(e instanceof Error ? `Не вдалося виконати аналіз: ${e.message}` : 'Не вдалося виконати аналіз.', 502);
  } finally { state.busy = false; }
}
