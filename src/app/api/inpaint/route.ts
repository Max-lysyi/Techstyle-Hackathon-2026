import OpenAI, { toFile } from 'openai';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

const MAX_BODY = 12 * 1024 * 1024;
const MAX_MASK = 4 * 1024 * 1024;
const MAX_CALLS = 10;
const HOUR = 3_600_000;
const CACHE_TTL = 30 * 60_000;
const PROMPT = 'Remove only the object inside the transparent mask. Continue the immediately surrounding background, texture, color and lighting naturally into the removed area. Preserve everything else. Do not add text, logos, shapes, or new design elements. This is an approximation of hidden background.';
type Result = { image: string; model: string; usage: unknown; cached: boolean };
type Guard = { timestamps: number[]; busy: boolean; cache: Map<string, { value: Result; time: number }> };
const globalGuard = globalThis as typeof globalThis & { inpaintGuard?: Guard };
const state = globalGuard.inpaintGuard ??= { timestamps: [], busy: false, cache: new Map() };

function safe(message: string) {
  const key = process.env.OPENAI_API_KEY;
  return (key ? message.split(key).join('[приховано]') : message).replace(/sk-[A-Za-z0-9_-]+/g, '[приховано]');
}
function fail(message: string, status: number, headers: Record<string, string> = {}) {
  return Response.json({ error: safe(message) }, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}
class InputError extends Error { constructor(message: string, public status: number) { super(message); } }
async function readBounded(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) throw new InputError('Запит завеликий.', 413);
  if (!request.body) throw new InputError('Запит порожній.', 400);
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new InputError('Час завантаження вичерпано.', 408)); void reader.cancel(); }, 15_000); });
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), deadline]); if (done) break;
      bytes += value.length; if (bytes > MAX_BODY) { void reader.cancel(); throw new InputError('Запит завеликий.', 413); } chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { clearTimeout(timer); }
}
function decode(value: unknown, limit: number): Buffer {
  if (typeof value !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new InputError('Потрібні PNG-зображення та PNG-маска.', 400);
  const data = Buffer.from(value.slice('data:image/png;base64,'.length), 'base64');
  if (!data.length || data.length >= limit) throw new InputError('Розмір PNG перевищує допустимий.', 413);
  return data;
}
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const url = new URL(origin), host = request.headers.get('host');
      const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || new URL(request.url).protocol.slice(0, -1);
      if (!host || url.host !== host || url.protocol !== `${protocol}:`) return fail('Запит із іншого джерела заборонено.', 403);
    } catch { return fail('Некоректне джерело запиту.', 403); }
  }
  if (!process.env.OPENAI_API_KEY) return fail('OPENAI_API_KEY не налаштовано на сервері.', 503);
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return fail('Очікується JSON із PNG-зображенням та маскою.', 415);
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst';
  const quality = process.env.OPENAI_IMAGE_QUALITY === 'low' ? 'low' : process.env.OPENAI_IMAGE_QUALITY === 'high' ? 'high' : 'medium';
  if (!['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'].includes(model)) return fail('OPENAI_IMAGE_MODEL має бути gpt-image-2.5-flare або gpt-image-2.5-sunburst.', 500);
  if (state.busy) return fail('Інше AI-відновлення ще виконується.', 429, { 'Retry-After': '10' });
  state.busy = true;
  try {
    let input: Buffer, mask: Buffer;
    try {
      const json = JSON.parse((await readBounded(request)).toString('utf8'));
      if (!json || typeof json !== 'object' || Object.keys(json).some(k => !['image', 'mask'].includes(k))) throw new InputError('Некоректні параметри запиту.', 400);
      input = decode(json.image, 8 * 1024 * 1024); mask = decode(json.mask, MAX_MASK);
      const imageMeta = await sharp(input, { limitInputPixels: 1_048_576, failOn: 'error' }).metadata();
      const maskMeta = await sharp(mask, { limitInputPixels: 1_048_576, failOn: 'error' }).metadata();
      if (imageMeta.format !== 'png' || imageMeta.width !== 1024 || imageMeta.height !== 1024 || maskMeta.format !== 'png' || maskMeta.width !== 1024 || maskMeta.height !== 1024 || !maskMeta.hasAlpha || (imageMeta.pages && imageMeta.pages > 1) || (maskMeta.pages && maskMeta.pages > 1)) throw new InputError('Зображення й маска мають бути PNG 1024×1024; маска повинна мати альфа-канал.', 400);
      const raw = await sharp(mask).ensureAlpha().raw().toBuffer(); let editable = false, preserved = false;
      for (let i = 3; i < raw.length; i += 4) { if (raw[i] === 0) editable = true; if (raw[i] === 255) preserved = true; }
      if (!editable || !preserved) throw new InputError('Маска повинна містити виділену ділянку та навколишній контекст.', 400);
    } catch (e) { return fail(e instanceof InputError ? e.message : 'Некоректний або пошкоджений JSON/PNG.', e instanceof InputError ? e.status : 400); }
    const key = createHash('sha256').update(model).update(PROMPT).update(`1024x1024|${quality}|png|v2`).update(input).update(mask).digest('hex');
    const now = Date.now();
    for (const [hash, item] of state.cache) if (now - item.time > CACHE_TTL) state.cache.delete(hash);
    const cached = state.cache.get(key);
    if (cached) return Response.json({ ...cached.value, cached: true }, { headers: { 'Cache-Control': 'no-store' } });
    state.timestamps = state.timestamps.filter(time => now - time < HOUR);
    if (state.timestamps.length >= MAX_CALLS) return fail('Ліміт AI-відновлень: 10 запитів за годину на процес.', 429, { 'Retry-After': String(Math.max(1, Math.ceil((state.timestamps[0] + HOUR - now) / 1000))) });
    state.timestamps.push(now);
    const timeout = Math.min(120_000, Math.max(1000, Number(process.env.OPENAI_IMAGE_TIMEOUT_MS) || 90_000));
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout, maxRetries: 0 });
    const response = await client.images.edit({
      model, image: await toFile(input, 'source.png', { type: 'image/png' }), mask: await toFile(mask, 'mask.png', { type: 'image/png' }),
      prompt: PROMPT, size: '1024x1024', quality, output_format: 'png', n: 1,
    }, { signal: request.signal });
    const encoded = response.data?.[0]?.b64_json;
    if (!encoded) return fail('OpenAI не повернув зображення.', 502);
    const output = Buffer.from(encoded, 'base64');
    if (output.length > 8 * 1024 * 1024) return fail('Зображення OpenAI перевищує допустимий розмір.', 502);
    const meta = await sharp(output, { limitInputPixels: 1_048_576, failOn: 'error' }).metadata();
    if (meta.format !== 'png' || meta.width !== 1024 || meta.height !== 1024) return fail('OpenAI повернув зображення з невідповідним розміром або форматом.', 502);
    const value: Result = { image: `data:image/png;base64,${encoded}`, model, usage: response.usage ?? null, cached: false };
    if (state.cache.size >= 5) state.cache.delete(state.cache.keys().next().value!);
    state.cache.set(key, { value, time: Date.now() });
    console.info(JSON.stringify({ event: 'openai_inpaint', model, quality, size: '1024x1024', usage: response.usage ?? null, requestId: response._request_id ?? null }));
    return Response.json(value, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof OpenAI.RateLimitError) return fail(`Ліміт OpenAI: ${e.message}`, 429, { 'Retry-After': e.headers.get('retry-after') || '60' });
    if (e instanceof OpenAI.APIConnectionTimeoutError) return fail('Час очікування OpenAI вичерпано.', 504);
    if (e instanceof OpenAI.APIError) return fail(`Помилка OpenAI (${e.status ?? 'невідомий статус'}): ${e.message}`, 502);
    return fail(e instanceof Error ? `Не вдалося відновити фон: ${e.message}` : 'Не вдалося відновити фон.', 502);
  } finally { state.busy = false; }
}
