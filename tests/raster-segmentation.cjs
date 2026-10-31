/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const sharp = require('sharp');
global.ImageData = class ImageData {
  constructor(data, width, height) { this.data = data; this.width = width; this.height = height; }
};
function loadTs(file) {
  const pathname = path.resolve(__dirname, '..', file);
  const source = ts.transpileModule(fs.readFileSync(pathname, 'utf8'), { fileName: pathname, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = new Module(pathname); mod.filename = pathname; mod.paths = Module._nodeModulePaths(path.dirname(pathname)); mod._compile(source, pathname); return mod.exports;
}
const { getSelectedMask, connectedComponent, contrastMask, paintMask, mergeMasks, maskBounds, maskedPixels } = loadTs('src/lib/decomposition.ts');
async function raster(body, jpeg = false) {
  let input = sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">${body}</svg>`));
  input = jpeg ? sharp(await input.jpeg({ quality: 22 }).toBuffer()) : sharp(await input.png().toBuffer());
  const { data, info } = await input.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return new ImageData(new Uint8ClampedArray(data), info.width, info.height);
}
const at = (mask, x, y) => mask[y * 256 + x];
async function main() {
  const roi = { x: 0, y: 0, width: 256, height: 256 };
  const logo = await raster('<rect width="256" height="256" fill="white"/><rect x="50" y="55" width="60" height="70" fill="black"/><rect x="150" y="55" width="30" height="30" fill="black"/>');
  const black = getSelectedMask(logo, roi, { x: 65, y: 70 }, 12);
  assert.equal(at(black, 65, 70), 255); assert.equal(at(black, 160, 65), 255); assert.equal(at(black, 5, 5), 0);
  const component = connectedComponent(black, 256, 256, { x: 65, y: 70 });
  assert.equal(at(component, 65, 70), 255); assert.equal(at(component, 160, 65), 0);
  assert.deepEqual(maskBounds(component, 256, 256), { x: 50, y: 55, width: 60, height: 70 });
  const edgeImage = new ImageData(new Uint8ClampedArray([0,0,0,128, 25,0,0,200]), 2, 1);
  const soft = getSelectedMask(edgeImage, {x:0,y:0,width:2,height:1}, {x:0,y:0}, 12);
  assert.ok(soft[1] > 0 && soft[1] < 255);
  const softPixels = maskedPixels(edgeImage, soft);
  assert.equal(softPixels.data[3], 128); assert.equal(softPixels.data[7], Math.round(200 * soft[1] / 255));
  console.log('Чорний логотип на білому: колір, зв’язний компонент і альфа — OK');

  const text = await raster('<rect width="256" height="256" fill="#151b28"/><text x="20" y="145" font-family="sans-serif" font-size="75" font-weight="bold" fill="white">MAX</text>');
  let point = null;
  for (let y = 70; y < 145 && !point; y++) for (let x = 20; x < 240; x++) { const i = (y * 256 + x) * 4; if (text.data[i] > 245 && text.data[i + 1] > 245 && text.data[i + 2] > 245) { point = { x, y }; break; } }
  assert.ok(point); const white = getSelectedMask(text, roi, point, 22);
  assert.ok(white.reduce((n, v) => n + (v > 0), 0) > 1000); assert.equal(at(white, 4, 4), 0);
  console.log('Білий напис на темному: вибір кольору — OK');

  const badge = await raster('<rect width="256" height="256" fill="white"/><circle cx="85" cy="120" r="38" fill="#e22035"/><circle cx="165" cy="120" r="38" fill="#1250ba"/>');
  const red = getSelectedMask(badge, roi, { x: 85, y: 120 }, 12), blue = getSelectedMask(badge, roi, { x: 165, y: 120 }, 12);
  const multi = mergeMasks([{ mask: red }, { mask: blue }], 256 * 256);
  assert.equal(at(multi, 85, 120), 255); assert.equal(at(multi, 165, 120), 255); assert.equal(at(multi, 5, 5), 0);
  const pixels = maskedPixels(badge, multi, maskBounds(multi, 256, 256));
  const encoded = await sharp(Buffer.from(pixels.data), { raw: { width: pixels.width, height: pixels.height, channels: 4 } }).png().toBuffer();
  const decoded = await sharp(encoded).raw().toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.channels, 4); assert.equal(decoded.data[3], 0); assert.ok(decoded.data.some((v, i) => i % 4 === 3 && v === 255));
  console.log('Багатоколірна емблема: одна маска та прозорий PNG — OK');

  const gradient = await raster('<defs><linearGradient id="g"><stop stop-color="#eeeeee"/><stop offset="1" stop-color="#888888"/></linearGradient></defs><rect width="256" height="256" fill="url(#g)"/><rect x="90" y="90" width="70" height="70" fill="#151515"/>');
  const contrast = contrastMask(gradient, { x: 20, y: 20, width: 210, height: 210 }, 18);
  assert.ok(at(contrast, 120, 120) > 220); assert.equal(at(contrast, 30, 30), 0);
  console.log('Логотип на простому градієнті: контраст від меж області — OK');

  const jpeg = await raster('<rect width="256" height="256" fill="white"/><rect x="53" y="57" width="70" height="70" fill="#101010"/>', true);
  const compressed = getSelectedMask(jpeg, roi, { x: 80, y: 80 }, 25);
  assert.ok(at(compressed, 80, 80) > 200); assert.equal(at(compressed, 15, 15), 0);
  console.log('JPEG із компресією: основна частина логотипа — OK');

  const w = 3000, h = 2100, data = new Uint8ClampedArray(w * h * 4);
  const index = (2050 * w + 2900) * 4; data.set([12, 34, 56, 200], index);
  const original = new ImageData(data, w, h), originalMask = new Uint8Array(w * h); originalMask[2050 * w + 2900] = 128;
  const bound = maskBounds(originalMask, w, h); assert.deepEqual(bound, { x: 2900, y: 2050, width: 1, height: 1 });
  const crop = maskedPixels(original, originalMask, bound); assert.deepEqual(Array.from(crop.data), [12, 34, 56, 100]);
  const brush = new Uint8Array(w * h); paintMask(brush, w, h, { x: 2900, y: 2050 }, { x: 2910, y: 2050 }, 4, true);
  assert.equal(brush[2050 * w + 2905], 255); paintMask(brush, w, h, { x: 2905, y: 2050 }, { x: 2905, y: 2050 }, 2, false); assert.equal(brush[2050 * w + 2905], 0);
  console.log('Оригінал 3000×2100: координати, альфа та пензель — OK');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
