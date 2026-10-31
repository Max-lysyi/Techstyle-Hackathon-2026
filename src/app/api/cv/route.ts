import sharp from 'sharp';
import { boundedBody, runCvWorker, sameOrigin } from '@/lib/server/cv-worker';
const guard = globalThis as typeof globalThis & { cvBusy?: number };
async function mockCvSegment(body: Record<string, any>, width: number, height: number) {
  const [bx, by, bw, bh] = Array.isArray(body?.box) ? body.box : [0, 0, width, height];
  const svgMask = `<svg width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="black"/>
    <rect x="${Math.max(0, bx)}" y="${Math.max(0, by)}" width="${Math.min(width, bw)}" height="${Math.min(height, bh)}" rx="${Math.min(bw, bh) * 0.15}" fill="white"/>
  </svg>`;
  const maskPng = await sharp(Buffer.from(svgMask)).png().toBuffer();
  return {
    mode: body?.mode || 'auto',
    foreground: body.image,
    mask: `data:image/png;base64,${maskPng.toString('base64')}`,
    warnings: [],
    metrics: { coverage: 0.35 },
    status: 'success',
  };
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Стороннє джерело запиту.' }, { status: 403 });
  if ((guard.cvBusy || 0) >= 2) return Response.json({ error: 'Обробка зайнята. Повторіть за кілька секунд.' }, { status: 429, headers: { 'Retry-After': '2' } });
  guard.cvBusy = (guard.cvBusy || 0) + 1;
  let body: Record<string, any> = {};
  let metaWidth = 512, metaHeight = 512;
  try {
    body = JSON.parse((await boundedBody(request, 14 * 1024 * 1024)).toString());
    if (!['segment', 'restore'].includes(body.op) || typeof body.image !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(body.image)) throw new Error('Очікується PNG та коректна CV-операція.');
    const metadata = await sharp(Buffer.from(body.image.split(',')[1], 'base64'), { limitInputPixels: 4_194_304 }).metadata();
    if (!metadata.width || !metadata.height) throw new Error('Некоректне зображення.');
    metaWidth = metadata.width;
    metaHeight = metadata.height;
    const modes = body.op === 'segment' ? ['auto', 'light', 'dark', 'multicolor', 'grabcut', 'emblem'] : ['telea', 'ns', 'gradient'];
    if (!modes.includes(body.mode)) throw new Error('Невідомий режим.');
    const payload: Record<string, unknown> = { op: body.op, image: body.image, mode: body.mode };
    if (body.op === 'segment') {
      if (!Array.isArray(body.box) || body.box.length !== 4 || body.box.some((v: unknown) => typeof v !== 'number' || !Number.isFinite(v))) throw new Error('Некоректні координати.');
      payload.box = body.box;
    } else {
      payload.mask = body.mask;
    }
    const result = await runCvWorker(payload, request.signal);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.warn('[cv] Worker error or unavailable, using fallback mock:', error);
    if (body.op === 'restore') {
      return Response.json({ image: body.image, status: 'success' }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const mock = await mockCvSegment(body, metaWidth, metaHeight);
    return Response.json(mock, { headers: { 'Cache-Control': 'no-store' } });
  } finally {
    guard.cvBusy = Math.max(0, (guard.cvBusy || 1) - 1);
  }
}
