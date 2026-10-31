/** Small ZIP writer using STORE entries (PNG files are already compressed). */
const encode = (value: string) => new TextEncoder().encode(value);

const crcTable=Uint32Array.from({length:256},(_,value)=>{let c=value;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);return c>>>0;});
function crc32(bytes:Uint8Array):number{let crc=0xffffffff;for(const value of bytes)crc=(crc>>>8)^crcTable[(crc^value)&255];return (crc^0xffffffff)>>>0;}

function word(view: DataView, offset: number, value: number) { view.setUint16(offset, value, true); }
function dword(view: DataView, offset: number, value: number) { view.setUint32(offset, value >>> 0, true); }

export function zipFiles(files: Array<{ name: string; bytes: Uint8Array }>): Blob {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encode(file.name);
    const checksum = crc32(file.bytes);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    dword(localView, 0, 0x04034b50);
    word(localView, 4, 20);
    word(localView, 6, 0x0800); // UTF-8 filename flag
    word(localView, 8, 0); // uncompressed
    dword(localView, 14, checksum);
    dword(localView, 18, file.bytes.length);
    dword(localView, 22, file.bytes.length);
    word(localView, 26, name.length);
    local.set(name, 30);
    locals.push(local, file.bytes);

    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    dword(c, 0, 0x02014b50);
    word(c, 4, 20);
    word(c, 6, 20);
    word(c, 8, 0x0800);
    dword(c, 16, checksum);
    dword(c, 20, file.bytes.length);
    dword(c, 24, file.bytes.length);
    word(c, 28, name.length);
    dword(c, 42, offset);
    central.set(name, 46);
    centrals.push(central);
    offset += local.byteLength + file.bytes.byteLength;
  }
  const cdSize = centrals.reduce((total, bytes) => total + bytes.byteLength, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  dword(e, 0, 0x06054b50);
  word(e, 8, files.length);
  word(e, 10, files.length);
  dword(e, 12, cdSize);
  dword(e, 16, offset);
  // TS DOM BlobPart may require ArrayBuffer backed by ArrayBuffer rather than SharedArrayBuffer.
  const chunks = [...locals, ...centrals, end].map(item => item.buffer instanceof ArrayBuffer ? item as Uint8Array<ArrayBuffer> : Uint8Array.from(item).buffer);
  return new Blob(chunks, { type: 'application/zip' });
}
