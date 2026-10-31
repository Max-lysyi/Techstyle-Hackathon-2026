/** CIE 1976 L*a*b* and CIE76 distance for preliminary factory palette matching. */
export interface FactoryColor { name: string; hex: string; cmyk?: {c:number;m:number;y:number;k:number} | null; profile?: string | null }

export function hexRgb(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, '');
  if (!/^[\da-fA-F]{6}$/.test(clean)) throw new Error(`Некоректний HEX: ${hex}`);
  return [0, 2, 4].map(i => parseInt(clean.slice(i, i + 2), 16)) as [number, number, number];
}

export function rgbLab(r: number, g: number, b: number): [number, number, number] {
  const linear = [r, g, b].map(v => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  // sRGB D65 -> XYZ normalized by the D65 reference white.
  const x = (linear[0] * 0.4124564 + linear[1] * 0.3575761 + linear[2] * 0.1804375) / 0.95047;
  const y = (linear[0] * 0.2126729 + linear[1] * 0.7151522 + linear[2] * 0.0721750);
  const z = (linear[0] * 0.0193339 + linear[1] * 0.1191920 + linear[2] * 0.9503041) / 1.08883;
  const f = (t: number) => t > 0.008856451679 ? Math.cbrt(t) : t / (3 * 0.206896551724 ** 2) + 4 / 29;
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE76(hexA: string, hexB: string): number {
  const [ar, ag, ab] = hexRgb(hexA);
  const [br, bg, bb] = hexRgb(hexB);
  const a = rgbLab(ar, ag, ab), b = rgbLab(br, bg, bb);
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

export function nearestColor(hex: string, factory: FactoryColor[]): (FactoryColor & { deltaE: number }) | null {
  if (!factory.length) return null;
  let closest = factory[0];
  let distance = Infinity;
  for (const color of factory) {
    const diff = deltaE76(hex, color.hex);
    if (diff < distance) { closest = color; distance = diff; }
  }
  return { ...closest, deltaE: Math.round(distance * 10) / 10 };
}

/** Accepts CSV/TSV: name;#RRGGBB, #RRGGBB;name or name,#RRGGBB. */
export function parseFactoryCsv(raw: string): FactoryColor[] {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/);
  const colors: FactoryColor[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const hex = line.match(/#[\da-fA-F]{6}\b/);
    if (!hex) continue;
    const other = line.replace(hex[0], '').replace(/^[;,\t\s"']+|[;,\t\s"']+$/g, '');
    const name = (other.split(/[;,\t]/)[0] || `Колір ${colors.length + 1}`).trim();
    colors.push({ name, hex: hex[0].toUpperCase() });
  }
  return colors;
}
