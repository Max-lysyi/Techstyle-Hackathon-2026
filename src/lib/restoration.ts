import { maskBounds, maskedPixels, type Rect } from './decomposition';

/** Replace only pixels covered by the original selection, blending its antialiased edge. */
export function compositeMasked(original: ImageData, patch: ImageData, mask: Uint8Array, bounds: Rect): ImageData {
  if (mask.length !== original.width * original.height || patch.width !== bounds.width || patch.height !== bounds.height || bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > original.width || bounds.y + bounds.height > original.height) throw new Error('Розміри реконструкції та маски не збігаються.');
  const out = new ImageData(new Uint8ClampedArray(original.data), original.width, original.height);
  for (let y = 0; y < bounds.height; y++) for (let x = 0; x < bounds.width; x++) {
    const p = (bounds.y + y) * original.width + bounds.x + x, alpha = mask[p] / 255;
    if (!alpha) continue;
    const dst = p * 4, src = (y * bounds.width + x) * 4;
    for (let c = 0; c < 4; c++) out.data[dst + c] = Math.round(original.data[dst + c] * (1 - alpha) + patch.data[src + c] * alpha);
  }
  return out;
}

/** An opaque-background preview with visible extracted layers composited in their original positions. */
export function composePreview(original: ImageData, background: ImageData, mask: Uint8Array): ImageData {
  if (background.width !== original.width || background.height !== original.height || mask.length !== original.width * original.height) throw new Error('Некоректні розміри прев’ю.');
  const out = new ImageData(new Uint8ClampedArray(background.data), original.width, original.height);
  for (let p = 0; p < mask.length; p++) {
    const a = mask[p] / 255 * original.data[p * 4 + 3] / 255;
    if (!a) continue;
    const i = p * 4, ba = background.data[i + 3] / 255, resultAlpha = a + ba * (1 - a);
    for (let c = 0; c < 3; c++) out.data[i + c] = resultAlpha ? Math.round((original.data[i + c] * a + background.data[i + c] * ba * (1 - a)) / resultAlpha) : 0;
    out.data[i + 3] = Math.round(resultAlpha * 255);
  }
  return out;
}

interface RequestCrop { bounds: Rect; left: number; top: number; width: number; height: number; image: string; mask: string }
export function prepareInpaintRequest(image: ImageData, mask: Uint8Array): RequestCrop {
  const selected = maskBounds(mask, image.width, image.height);
  if (!selected || !mask.some(value => value === 0)) throw new Error('Потрібна непорожня маска та навколишній фон.');
  const pad = Math.max(32, Math.ceil(Math.max(selected.width, selected.height) * 0.5));
  const x = Math.max(0, selected.x - pad), y = Math.max(0, selected.y - pad);
  const right = Math.min(image.width, selected.x + selected.width + pad), bottom = Math.min(image.height, selected.y + selected.height + pad);
  const bounds = { x, y, width: right - x, height: bottom - y };
  const scale = Math.min(1024 / bounds.width, 1024 / bounds.height);
  const width = Math.max(1, Math.round(bounds.width * scale)), height = Math.max(1, Math.round(bounds.height * scale));
  const left = Math.floor((1024 - width) / 2), top = Math.floor((1024 - height) / 2);
  const source = document.createElement('canvas'); source.width = image.width; source.height = image.height;
  const sourceCtx = source.getContext('2d'); if (!sourceCtx) throw new Error('Canvas недоступний'); sourceCtx.putImageData(image, 0, 0);
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 1024;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas недоступний');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1024, 1024);
  ctx.drawImage(source, x, y, bounds.width, bounds.height, left, top, width, height);
  const input = canvas.toDataURL('image/png'); source.width = 1;
  const apiMask = ctx.createImageData(1024, 1024);
  for (let i = 0; i < apiMask.data.length; i += 4) { apiMask.data[i] = 255; apiMask.data[i + 1] = 255; apiMask.data[i + 2] = 255; apiMask.data[i + 3] = 255; }
  for (let yy = selected.y; yy < selected.y + selected.height; yy++) for (let xx = selected.x; xx < selected.x + selected.width; xx++) {
    if (!mask[yy * image.width + xx]) continue;
    const mx = left + Math.min(width - 1, Math.floor((xx - x) * width / bounds.width));
    const my = top + Math.min(height - 1, Math.floor((yy - y) * height / bounds.height));
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const px = mx + dx, py = my + dy;
      if (px >= left && py >= top && px < left + width && py < top + height) apiMask.data[(py * 1024 + px) * 4 + 3] = 0;
    }
  }
  ctx.putImageData(apiMask, 0, 0);
  return { bounds, left, top, width, height, image: input, mask: canvas.toDataURL('image/png') };
}

export async function mapInpaintResult(url: string, crop: RequestCrop): Promise<ImageData> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('Не вдалося прочитати відповідь OpenAI.')); img.src = url; });
  if (img.naturalWidth !== 1024 || img.naturalHeight !== 1024) throw new Error('OpenAI повернув зображення з неправильним розміром.');
  const canvas = document.createElement('canvas'); canvas.width = crop.bounds.width; canvas.height = crop.bounds.height;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas недоступний');
  ctx.drawImage(img, crop.left, crop.top, crop.width, crop.height, 0, 0, crop.bounds.width, crop.bounds.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function composeExtractedLayers(original: ImageData, background: ImageData, layers: import('./decomposition').PrintLayer[]): ImageData {
  const out = new ImageData(new Uint8ClampedArray(background.data), background.width, background.height);
  for (const layer of [...layers].filter(layer=>layer.visible&&!layer.groupHidden).sort((a,b)=>a.order-b.order)) {
    const pixels = maskedPixels(original,layer.mask,layer.bounds,layer.foreground);
    for(let y=0;y<pixels.height;y++) for(let x=0;x<pixels.width;x++) {
      const src=(y*pixels.width+x)*4, dst=((y+layer.bounds.y)*out.width+x+layer.bounds.x)*4;
      const a=pixels.data[src+3]/255,b=out.data[dst+3]/255,alpha=a+b*(1-a);
      if(!a)continue;
      for(let c=0;c<3;c++)out.data[dst+c]=alpha?Math.round((pixels.data[src+c]*a+out.data[dst+c]*b*(1-a))/alpha):0;
      out.data[dst+3]=Math.round(alpha*255);
    }
  }
  return out;
}
