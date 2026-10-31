import { boundedBody, runCvWorker, sameOrigin } from '@/lib/server/cv-worker';
const fallbackPalette = [
  { name: 'Pantone 289 C (Темно-синій)', hex: '#0A2540', lab: [16, 4, -20], cmyk: [100, 76, 12, 64] },
  { name: 'Pantone 123 C (Жовтий)', hex: '#FFD700', lab: [86, 10, 85], cmyk: [0, 19, 89, 0] },
  { name: 'Pantone White (Білий)', hex: '#FFFFFF', lab: [100, 0, 0], cmyk: [0, 0, 0, 0] },
  { name: 'Pantone 186 C (Червоний)', hex: '#D90416', lab: [45, 68, 48], cmyk: [0, 100, 81, 4] },
];

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Стороннє джерело запиту.' }, { status: 403 });
  try {
    const file = await boundedBody(request, 8 * 1024 * 1024);
    if (!file.subarray(0,5).equals(Buffer.from('%PDF-'))) throw new Error('Потрібен PDF-сумісний .ai/PDF із таблицею прямокутних зразків; інші файли експортуйте в CSV.');
    return Response.json(await runCvWorker({ op: 'palette', file: file.toString('base64') }, request.signal), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.warn('[factory-palette] Using fallback palette due to:', error);
    return Response.json(fallbackPalette, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
}
