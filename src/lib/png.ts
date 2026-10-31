/** Encode the exact RGBA bytes as PNG without a canvas premultiplication round trip. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length + 12), view = new DataView(result.buffer);
  view.setUint32(0, data.length); const name = new TextEncoder().encode(type); result.set(name, 4); result.set(data, 8);
  view.setUint32(data.length + 8, crc32(result.subarray(4, data.length + 8))); return result;
}
export async function encodePng(image: ImageData): Promise<Uint8Array> {
  if (!image.width || !image.height || image.data.length !== image.width * image.height * 4) throw new Error('Некоректні пікселі PNG.');
  if (typeof CompressionStream === 'undefined') throw new Error('Браузер не підтримує збереження PNG без втрати точності.');
  let row = 0;
  const input = new ReadableStream<BufferSource>({ pull(controller) {
    if (row >= image.height) { controller.close(); return; }
    const scanline = new Uint8Array(image.width * 4 + 1);
    scanline.set(image.data.subarray(row * image.width * 4, (row + 1) * image.width * 4), 1); row++; controller.enqueue(scanline);
  } });
  const compressed = new Uint8Array(await new Response(input.pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, image.width); view.setUint32(4, image.height); header[8] = 8; header[9] = 6;
  const parts = [new Uint8Array([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', compressed), chunk('IEND', new Uint8Array())];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
