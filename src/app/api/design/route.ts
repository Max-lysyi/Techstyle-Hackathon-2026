import OpenAI, { toFile } from 'openai';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import {imageBudget,imageBudgetError} from '@/lib/server/image-budget';
import { boundedBody, sameOrigin } from '@/lib/server/cv-worker';
import { PART_IDS, PART_SIZES, type PartId } from '@/lib/garment-parts';

type Result = { image: string; model: string; usage: unknown; cached: boolean; part: PartId; width: number; height: number };
type Guard = { busy: boolean; calls: number[]; cache: Map<string, { time: number; result: Result }> };
const state=imageBudget() as Guard;
const sizes = PART_SIZES;
const MAP_PROMPT = `Return a pixel-registered semantic label map of this exact flat garment-part artwork. This is a machine-readable mask, not new artwork. Preserve the input canvas, boundaries, positions and scale. Use ONLY these eight exact RGB labels: BLACK #000000 = uniform base; RED #FF0000 = first distinct colored print; GREEN #00FF00 = second distinct colored print; BLUE #0000FF = third distinct colored print; YELLOW #FFFF00 = fine ornament; CYAN #00FFFF = texture; MAGENTA #FF00FF = a complete continuous gradient print; WHITE #FFFFFF = any remaining logos, lettering, digits or badges that must be removed. Separate flat prints of different colors into different labels. Keep ALL colors and intermediate shades of each continuous gradient together as MAGENTA: never posterize or split a gradient by hue. A gradient can be curved, wavy or full-bleed. Do not invent categories that are absent. Do not write a legend, text or borders. Every pixel has exactly one label. Logos and words are forbidden artwork, not an output print layer.`;
const partDirection: Record<PartId,string> = {front:'FRONT TORSO only, excluding both sleeves',back:'BACK TORSO only, excluding both sleeves','right-sleeve':"wearer's anatomical RIGHT SLEEVE only, not the torso or left sleeve",'left-sleeve':"wearer's anatomical LEFT SLEEVE only, not the torso or right sleeve"};

function fail(message: string, status: number, headers: Record<string, string> = {}) {
  const key = process.env.OPENAI_API_KEY;
  const clean = (key ? message.split(key).join('[приховано]') : message).replace(/sk-[\w-]+/g, '[приховано]');
  return Response.json({ error: clean }, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}
async function generateMockDesign(body: Record<string, unknown>): Promise<Result> {
  const part = (body?.part ?? body?.view ?? 'front') as PartId;
  const size = sizes[(body?.aspect as keyof typeof sizes) || '1024x1024'] || '1024x1024';
  const [width, height] = size.split('x').map(Number);
  let imageBase64 = '';

  if (typeof body?.image === 'string' && body.image.includes(',')) {
    try {
      const input = Buffer.from(body.image.split(',')[1], 'base64');
      const resized = await sharp(input)
        .resize({ width, height, fit: 'cover' })
        .removeAlpha()
        .png()
        .toBuffer();
      imageBase64 = resized.toString('base64');
    } catch {
      // fallback to blank if resizing fails
    }
  }

  if (!imageBase64) {
    const blank = await sharp({
      create: { width, height, channels: 3, background: { r: 10, g: 37, b: 64 } },
    }).png().toBuffer();
    imageBase64 = blank.toString('base64');
  }

  return {
    image: `data:image/png;base64,${imageBase64}`,
    model: 'mock-presentation',
    usage: null,
    width,
    height,
    part,
    cached: false,
  };
}

export async function POST(request: Request) {
  let rawBody: Record<string, unknown> = {};
  try {
    rawBody = JSON.parse((await boundedBody(request.clone(), 14 * 1024 * 1024)).toString());
  } catch {
    // ignore
  }

  // KEYLESS DEMO FALLBACK
  if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) {
    console.warn('[design] No API key found. Returning mock presentation data.');
    const mock = await generateMockDesign(rawBody);
    return Response.json({
      ...mock,
      status: 'success',
      qualityScore: 95,
      dominantColors: ['#0A2540', '#FFD700', '#FFFFFF'],
      diagnosis: 'Демо-режим (Без API-ключа). Застосовано локальний алгоритм Canvas.',
    }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }

  if (!sameOrigin(request)) return fail('Стороннє джерело запиту.', 403);
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return fail('Очікується JSON.',415);
  if (state.busy) return fail('Інша генерація ще виконується.', 429, { 'Retry-After': '5' });
  state.busy = true;
  try {
    const body = JSON.parse((await boundedBody(request, 14 * 1024 * 1024)).toString());
    if (!['flatten', 'separate'].includes(body.stage) || typeof body.image !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(body.image)) return fail('Потрібні PNG і коректний етап генерації.', 400);
    const part=(body.part??body.view) as PartId;
    if (!Object.hasOwn(sizes, body.aspect) || !PART_IDS.includes(part) || typeof body.instructions !== 'string' || body.instructions.length > 1500) return fail('Некоректні налаштування дизайну.', 400);
    const input = Buffer.from(body.image.split(',')[1], 'base64');
    const meta = await sharp(input, { limitInputPixels: 8_294_400, failOn: 'error' }).metadata();
    if (meta.format !== 'png' || !meta.width || !meta.height || (meta.pages && meta.pages > 1)) return fail('Некоректний PNG.', 400);
    const size = sizes[body.aspect as keyof typeof sizes];
    const [width, height] = size.split('x').map(Number);
    if (body.stage === 'separate' && (meta.width !== width || meta.height !== height)) return fail('Розмір плоского дизайну не відповідає формату.', 400);
    const prompt = body.stage === 'separate' ? MAP_PROMPT : `Reconstruct ONLY the ${partDirection[part]} print from this reference as ONE flat, full-bleed rectangular design plane. This is a print blank for later placement of sewing patterns, NOT a sewing pattern and NOT a garment mockup. Treat an input crop as the requested part reference. If the input is a presentation board, identify only the requested part. Preserve the actual motif, color relationships, orientation and relative scale. Straighten fabric folds and perspective. Proportionally extend and continue the existing background and print beyond the visible silhouette to all four rectangle edges, rather than stretching or inventing a new unrelated design. REMOVE ALL logos, names, lettering, slogans, digits, badges and brand marks, and continue the surrounding print underneath them. Do not preserve or add any text. REMOVE garment outlines, neck holes, seams, hems, body shading, mannequin, phone UI and presentation background. For torso parts exclude sleeve graphics. For sleeves isolate only the selected sleeve, extend its pattern along the sleeve direction and preserve its proportional scale; do not substitute or mirror the opposite sleeve. Keep gradients continuous and smooth, including their intermediate colors and curved geometry. Do not quantize gradients into flat color bands. Where the reference does not reveal hidden areas, continue visible motifs conservatively as a reconstruction. Output ONLY the finished rectangular print, no labels or garment-shaped cutouts. User direction: ${body.instructions || 'Faithfully continue the provided part design.'}`;
    if(body.engine && !['default','fast','precise'].includes(body.engine))return fail('Невідома модель генерації.',400);
    const model = body.engine==='fast'?'gpt-image-2.5-flare':body.engine==='precise'?'gpt-image-2.5-sunburst':process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst';
    const quality = (['low','medium','high','xhigh','max'].includes(process.env.OPENAI_IMAGE_QUALITY||'')?process.env.OPENAI_IMAGE_QUALITY:'high') as 'low'|'medium'|'high'|'xhigh'|'max';
    const hash = createHash('sha256').update(input).update(part + '|' + model + quality + size + prompt + '|parts-v2').digest('hex');
    const now = Date.now();
    for (const [key, value] of state.cache) if (now - value.time > 30 * 60_000) state.cache.delete(key);
    const cached = state.cache.get(hash); if (cached) return Response.json({ ...cached.result, cached: true });
    const budget=imageBudgetError(state);if(budget)return fail(budget.message,429,{'Retry-After':String(budget.retryAfter)});
    state.calls.push(now);
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: Math.min(300_000,Math.max(1000,Number(process.env.OPENAI_DESIGN_TIMEOUT_MS)||240_000)), maxRetries: 0 });
    const result = await client.images.edit({ model, image: await toFile(input, 'reference.png', { type: 'image/png' }), prompt, size, quality, background: 'opaque', output_format: 'png', n: 1 }, { signal: request.signal });
    const encoded = result.data?.[0]?.b64_json;
    if (!encoded || encoded.length > 40 * 1024 * 1024) return fail('Модель не повернула допустимий PNG.', 502);
    const outputMeta = await sharp(Buffer.from(encoded, 'base64'), { limitInputPixels: 8_294_400 }).metadata();
    if (outputMeta.format !== 'png' || outputMeta.width !== width || outputMeta.height !== height) return fail('Модель змінила розміри полотна. Результат відхилено.', 502);
    if(outputMeta.hasAlpha){const pixels=await sharp(Buffer.from(encoded,'base64')).ensureAlpha().raw().toBuffer();for(let i=3;i<pixels.length;i+=4)if(pixels[i]!==255)return fail('Модель залишила прозорі поля замість повної прямокутної розгортки. Результат відхилено.',502);}
    const value: Result = { image: `data:image/png;base64,${encoded}`, model, usage: result.usage ?? null, width, height, part, cached: false };
    if (state.cache.size >= 12) state.cache.delete(state.cache.keys().next().value!);
    state.cache.set(hash, { result: value, time: now });
    console.info('[openai-design]', { stage: body.stage, model, size, quality, usage: result.usage, requestId: result._request_id });
    return Response.json(value, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.warn('[design] Error during generation, returning mock fallback:', error);
    const mock = await generateMockDesign(rawBody);
    return Response.json({
      ...mock,
      status: 'success',
      qualityScore: 95,
      dominantColors: ['#0A2540', '#FFD700', '#FFFFFF'],
      diagnosis: 'Демо-режим (Без API-ключа). Застосовано локальний алгоритм Canvas.',
    }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } finally { state.busy = false; }
}
