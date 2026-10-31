import { boundedBody, runCvWorker, sameOrigin } from '@/lib/server/cv-worker';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Стороннє джерело запиту.' }, { status: 403 });
  try {
    const file = await boundedBody(request, 8 * 1024 * 1024);
    if (!file.subarray(0,5).equals(Buffer.from('%PDF-'))) throw new Error('Потрібен PDF-сумісний .ai/PDF із таблицею прямокутних зразків; інші файли експортуйте в CSV.');
    return Response.json(await runCvWorker({ op: 'palette', file: file.toString('base64') }, request.signal), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Не вдалося прочитати палітру.' }, { status: 400 }); }
}
