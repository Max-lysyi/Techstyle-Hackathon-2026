/** Local, deterministic raster tools for Task 2. No neural reconstruction is claimed. */
export interface Rect { x: number; y: number; width: number; height: number }
export interface PrintLayer {
  id: string;
  name: string;
  type: 'logo' | 'text' | 'number' | 'graphic' | 'background' | 'unknown';
  source: 'original' | 'estimated-foreground';
  kind?: 'solid' | 'gradient' | 'texture' | 'raster';
  groupId?: string;
  groupHidden?: boolean;
  colorSource?: ImageData;
  recolorSource?: string;
  fillHex?: string;
  gradient?: { sourceStops: [string,string]; stops: [string,string] };
  foreground?: { image: ImageData; bounds: Rect };
  extraction?: { regionId?: string; method: string; warnings: string[]; metrics: Record<string, number> };
  bounds: Rect;
  mask: Uint8Array;
  visible: boolean;
  order: number;
  operations: string[];
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function normalizeRect(rect: Rect, width: number, height: number): Rect {
  const x = clamp(Math.floor(rect.x), 0, width - 1);
  const y = clamp(Math.floor(rect.y), 0, height - 1);
  return {
    x, y,
    width: Math.max(1, Math.min(width - x, Math.ceil(rect.width))),
    height: Math.max(1, Math.min(height - y, Math.ceil(rect.height))),
  };
}

export function getSelectedMask(image: ImageData, roi: Rect, point: { x: number; y: number }, tolerance: number, excluded?: Uint8Array): Uint8Array {
  const { width, height, data } = image;
  const rect = normalizeRect(roi, width, height);
  const px = clamp(Math.floor(point.x), 0, width - 1), py = clamp(Math.floor(point.y), 0, height - 1);
  const mask = new Uint8Array(width * height);
  if (px < rect.x || py < rect.y || px >= rect.x + rect.width || py >= rect.y + rect.height) return mask;
  const seed = (py * width + px) * 4;
  const r = data[seed], g = data[seed + 1], b = data[seed + 2];
  const threshold = tolerance * Math.sqrt(3), feather = Math.max(4, tolerance * 0.25) * Math.sqrt(3);
  for (let y = rect.y; y < rect.y + rect.height; y++) for (let x = rect.x; x < rect.x + rect.width; x++) {
    const index = y * width + x, i = index * 4;
    if (!data[i + 3] || excluded?.[index]) continue;
    const distance = Math.hypot(r - data[i], g - data[i + 1], b - data[i + 2]);
    mask[index] = Math.round(255 * clamp((threshold + feather - distance) / feather, 0, 1));
  }
  return mask;
}

/** Restrict a candidate mask to the 8-connected component containing the clicked pixel. */
export function connectedComponent(mask: Uint8Array, width: number, height: number, point: { x: number; y: number }): Uint8Array {
  const result = new Uint8Array(mask.length);
  const x = Math.floor(point.x), y = Math.floor(point.y);
  if (x < 0 || y < 0 || x >= width || y >= height || !mask[y * width + x]) return result;
  const queue = new Int32Array(mask.length); let head = 0, tail = 0;
  const seed = y * width + x; queue[tail++] = seed; result[seed] = mask[seed];
  while (head < tail) {
    const p = queue[head++], px = p % width, py = Math.floor(p / width);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = px + dx, ny = py + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (mask[n] && !result[n]) { result[n] = mask[n]; queue[tail++] = n; }
    }
  }
  return result;
}

/** Compare pixels to an interpolated estimate of the ROI border, including simple gradients. */
export function contrastMask(image: ImageData, roi: Rect, threshold: number): Uint8Array {
  const { width, height, data } = image, rect = normalizeRect(roi, width, height);
  const mask = new Uint8Array(width * height), feather = Math.max(5, threshold * 0.35);
  const right = rect.x + rect.width - 1, bottom = rect.y + rect.height - 1;
  for (let y = rect.y; y <= bottom; y++) for (let x = rect.x; x <= right; x++) {
    const tx = rect.width > 1 ? (x - rect.x) / (rect.width - 1) : 0;
    const ty = rect.height > 1 ? (y - rect.y) / (rect.height - 1) : 0;
    const p = y * width + x, i = p * 4;
    let d = 0;
    for (let c = 0; c < 3; c++) {
      const horizontal = data[(y * width + rect.x) * 4 + c] * (1 - tx) + data[(y * width + right) * 4 + c] * tx;
      const vertical = data[(rect.y * width + x) * 4 + c] * (1 - ty) + data[(bottom * width + x) * 4 + c] * ty;
      const delta = data[i + c] - (horizontal + vertical) / 2; d += delta * delta;
    }
    if (data[i + 3]) mask[p] = Math.round(255 * clamp((Math.sqrt(d / 3) - threshold) / feather, 0, 1));
  }
  return mask;
}

/** Apply an antialiased circular brush stroke, interpolating between pointer positions. */
export function paintMask(mask: Uint8Array, width: number, height: number, from: {x: number; y: number}, to: {x: number; y: number}, radius: number, add: boolean): void {
  radius = Math.max(1, radius);
  const distance = Math.hypot(to.x - from.x, to.y - from.y), steps = Math.max(1, Math.ceil(distance / Math.max(1, radius / 3)));
  for (let step = 0; step <= steps; step++) {
    const cx = from.x + (to.x - from.x) * step / steps, cy = from.y + (to.y - from.y) * step / steps;
    for (let y = Math.max(0, Math.floor(cy - radius - 1)); y <= Math.min(height - 1, Math.ceil(cy + radius + 1)); y++) {
      for (let x = Math.max(0, Math.floor(cx - radius - 1)); x <= Math.min(width - 1, Math.ceil(cx + radius + 1)); x++) {
        const coverage = clamp(radius + 0.5 - Math.hypot(x - cx, y - cy), 0, 1), i = y * width + x;
        if (coverage) mask[i] = add ? Math.max(mask[i], Math.round(coverage * 255)) : Math.round(mask[i] * (1 - coverage));
      }
    }
  }
}

export function maskBounds(mask: Uint8Array, width: number, height: number): Rect | null {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % width, y = Math.floor(i / width);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function maskedPixels(image: ImageData, mask?: Uint8Array, bounds?: Rect, foreground?: { image: ImageData; bounds: Rect }): ImageData {
  const rect = bounds || { x: 0, y: 0, width: image.width, height: image.height };
  const out = new ImageData(new Uint8ClampedArray(rect.width * rect.height * 4), rect.width, rect.height);
  for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
    const srcPixel = (y + rect.y) * image.width + x + rect.x, dst = (y * rect.width + x) * 4;
    const gx = x + rect.x, gy = y + rect.y;
    const corrected = foreground && gx >= foreground.bounds.x && gy >= foreground.bounds.y && gx < foreground.bounds.x + foreground.bounds.width && gy < foreground.bounds.y + foreground.bounds.height;
    const colorSource = corrected ? foreground.image.data : image.data;
    const colorIndex = corrected ? ((gy - foreground.bounds.y) * foreground.image.width + gx - foreground.bounds.x) * 4 : srcPixel * 4;
    out.data[dst] = colorSource[colorIndex]; out.data[dst + 1] = colorSource[colorIndex + 1]; out.data[dst + 2] = colorSource[colorIndex + 2];
    out.data[dst + 3] = mask ? Math.round(image.data[srcPixel * 4 + 3] * mask[srcPixel] / 255) : image.data[srcPixel * 4 + 3];
  }
  return out;
}

function getCanvas(image: ImageData, mask?: Uint8Array, bounds?: Rect): HTMLCanvasElement {
  const pixels = maskedPixels(image, mask, bounds);
  const canvas = document.createElement('canvas'); canvas.width = pixels.width; canvas.height = pixels.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D недоступний');
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

export function maskedPng(image: ImageData, mask: Uint8Array, bounds: Rect): string {
  return getCanvas(image, mask, bounds).toDataURL('image/png');
}
export function imagePng(image: ImageData): string {
  return getCanvas(image).toDataURL('image/png');
}

export function mergeMasks(layers: Array<Pick<PrintLayer, 'mask'>>, size: number): Uint8Array {
  const all = new Uint8Array(size);
  for (const layer of layers) for (let i = 0; i < size; i++) if (layer.mask[i] > all[i]) all[i] = layer.mask[i];
  return all;
}

/** Multisource nearest-neighbor infill, then local smoothing. Appropriate for simple / flat backgrounds. */
export function restoreBackground(image: ImageData, mask: Uint8Array): ImageData {
  const { width: w, height: h } = image;
  const pixels = w * h;
  const result = new ImageData(new Uint8ClampedArray(image.data), w, h);
  if (!mask.some(Boolean)) return result;
  const visited = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  let head = 0, tail = 0;
  // Boundary unmasked pixels seed the fill. Only mask-adjacent pixels are needed.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (mask[p]) continue;
    if ((x > 0 && mask[p - 1]) || (x < w - 1 && mask[p + 1]) ||
        (y > 0 && mask[p - w]) || (y < h - 1 && mask[p + w])) {
      visited[p] = 1;
      queue[tail++] = p;
    }
  }
  // If entire image is selected, leave the original rather than fabricate a background.
  if (!tail) return result;
  while (head < tail) {
    const p = queue[head++];
    const x = p % w, y = Math.floor(p / w);
    const neighbors = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1,
      y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
    for (const n of neighbors) {
      if (n < 0 || visited[n] || !mask[n]) continue;
      visited[n] = 1;
      for (let c = 0; c < 4; c++) result.data[n * 4 + c] = result.data[p * 4 + c];
      queue[tail++] = n;
    }
  }
  // Smooth only the restored part, retaining every original pixel outside it.
  for (let pass = 0; pass < 4; pass++) {
    const src = new Uint8ClampedArray(result.data);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (!mask[p] || !visited[p]) continue;
      for (let c = 0; c < 3; c++) {
        result.data[p * 4 + c] = Math.round((src[p * 4 + c] * 4 + src[(p - 1) * 4 + c] + src[(p + 1) * 4 + c] + src[(p - w) * 4 + c] + src[(p + w) * 4 + c]) / 8);
      }
    }
  }
  return result;
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** A separate, visible repair zone includes mixed/JPEG edge pixels around the extracted element. */
export function expandRepairMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  radius = Math.max(0, Math.min(8, Math.round(radius)));
  const out = new Uint8Array(mask.length), bounds = maskBounds(mask, width, height);
  if (!bounds) return out;
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
    if (!mask[y * width + x]) continue;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (dx*dx + dy*dy > radius*radius) continue;
      const xx=x+dx, yy=y+dy;
      if (xx>=0 && yy>=0 && xx<width && yy<height) out[yy*width+xx]=255;
    }
  }
  return out;
}

export function mergedForeground(image: ImageData, layers: PrintLayer[], mask: Uint8Array, bounds: Rect): { image: ImageData; bounds: Rect } | undefined {
  if (!layers.some(layer => layer.foreground)) return undefined;
  const pixels = maskedPixels(image, mask, bounds), best = new Uint8Array(bounds.width * bounds.height);
  for (const layer of layers) {
    const part = maskedPixels(image, layer.mask, layer.bounds, layer.foreground);
    for (let y=0; y<part.height; y++) for (let x=0; x<part.width; x++) {
      const px=layer.bounds.x+x-bounds.x, py=layer.bounds.y+y-bounds.y;
      if (px<0 || py<0 || px>=bounds.width || py>=bounds.height) continue;
      const index=py*bounds.width+px, src=(y*part.width+x)*4, strength=layer.mask[(y+layer.bounds.y)*image.width+x+layer.bounds.x];
      if (strength > best[index]) { best[index]=strength; for (let c=0;c<3;c++) pixels.data[index*4+c]=part.data[src+c]; }
    }
  }
  for (let i=3;i<pixels.data.length;i+=4) pixels.data[i]=255;
  return { image:pixels,bounds };
}
