import sharp from 'sharp';
import { boundedBody, runCvWorker, sameOrigin } from '@/lib/server/cv-worker';
const guard = globalThis as typeof globalThis & { cvBusy?: number };
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Стороннє джерело запиту.' }, { status: 403 });
  if ((guard.cvBusy || 0) >= 2) return Response.json({ error: 'Обробка зайнята. Повторіть за кілька секунд.' }, { status: 429, headers: { 'Retry-After': '2' } });
  guard.cvBusy = (guard.cvBusy || 0) + 1;
  try {
    const body = JSON.parse((await boundedBody(request, 14 * 1024 * 1024)).toString());
    if (!['segment', 'restore'].includes(body.op) || typeof body.image !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(body.image)) throw new Error('Очікується PNG та коректна CV-операція.');
    const metadata = await sharp(Buffer.from(body.image.split(',')[1], 'base64'), { limitInputPixels: 4_194_304 }).metadata();
    if (metadata.format !== 'png' || !metadata.width || !metadata.height || (metadata.pages && metadata.pages > 1)) throw new Error('Некоректне зображення.');
    const modes = body.op === 'segment' ? ['auto', 'light', 'dark', 'multicolor', 'grabcut', 'emblem'] : ['telea', 'ns', 'gradient'];
    if (!modes.includes(body.mode)) throw new Error('Невідомий режим.');
    const payload: Record<string, unknown> = { op: body.op, image: body.image, mode: body.mode };
    if (body.op === 'segment') {
      if (!Array.isArray(body.box) || body.box.length !== 4 || body.box.some((v: unknown) => typeof v !== 'number' || !Number.isFinite(v))) throw new Error('Некоректні координати.');
      const [x,y,w,h] = body.box;
      if (x < 0 || y < 0 || w < 1 || h < 1 || x+w > metadata.width || y+h > metadata.height) throw new Error('Область поза зображенням.');
      payload.box = body.box;
    } else {
      if (typeof body.mask !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(body.mask)) throw new Error('Потрібна PNG-маска.');
      const mask = await sharp(Buffer.from(body.mask.split(',')[1], 'base64'), { limitInputPixels: 4_194_304 }).metadata();
      if (mask.format !== 'png' || mask.width !== metadata.width || mask.height !== metadata.height) throw new Error('Розміри маски не збігаються.');
      payload.mask = body.mask;
    }
    const result = await runCvWorker(payload, request.signal);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Помилка обробки.' }, { status: 400 }); }
  finally { guard.cvBusy = Math.max(0, (guard.cvBusy || 1)-1); }
}
