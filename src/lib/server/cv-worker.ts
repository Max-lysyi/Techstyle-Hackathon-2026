import { spawn } from 'node:child_process';
import path from 'node:path';

export async function runCvWorker(payload: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
  if (signal?.aborted) throw new Error('Обробку скасовано.');
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.CV_PYTHON || 'python3', [path.join(process.cwd(), 'scripts/cv/worker.py')], {
      env: { ...process.env, OPENAI_API_KEY: '', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1' }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = []; let size = 0, settled = false;
    const stop = (error: Error) => { if (settled) return; settled = true; child.kill('SIGKILL'); clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(error); };
    const abort = () => stop(new Error('Обробку скасовано.'));
    const timer = setTimeout(() => stop(new Error('Час обробки OpenCV вичерпано.')), 30_000);
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', () => stop(new Error('Python/OpenCV недоступний. Налаштуйте CV_PYTHON і scripts/cv/requirements.txt.')));
    child.stdout.on('data', (data: Buffer) => { size += data.length; if (size > 28 * 1024 * 1024) stop(new Error('Результат обробки завеликий. Зменште область.')); else chunks.push(data); });
    child.stderr.on('data', () => { /* Never log source data or subprocess internals. */ });
    child.stdin.on('error', () => { /* Process failure is handled on close. */ });
    child.on('close', () => {
      if (settled) return;
      clearTimeout(timer); signal?.removeEventListener('abort', abort); settled = true;
      try { const result = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (result.error) reject(new Error(result.error)); else resolve(result); }
      catch { reject(new Error('OpenCV не повернув результат. Перевірте Python-залежності.')); }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

export async function boundedBody(request: Request, maxBytes: number): Promise<Buffer> {
  if (Number(request.headers.get('content-length') || 0) > maxBytes) throw new Error('Запит перевищує допустимий розмір.');
  if (!request.body) throw new Error('Порожній запит.');
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new Error('Час завантаження вичерпано.')); void reader.cancel(); }, 15_000); });
  try {
    while (true) { const { value, done } = await Promise.race([reader.read(), deadline]); if (done) break; size += value.length; if (size > maxBytes) { void reader.cancel(); throw new Error('Запит завеликий.'); } chunks.push(value); }
    return Buffer.concat(chunks);
  } finally { clearTimeout(timer); }
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin'); if (!origin) return true;
  try { const url = new URL(origin); return url.host === request.headers.get('host') && url.protocol === `${request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || new URL(request.url).protocol.slice(0,-1)}:`; } catch { return false; }
}
