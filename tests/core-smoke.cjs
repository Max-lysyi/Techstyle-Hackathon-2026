/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');

function loadTs(filename) {
  const pathname = path.resolve(__dirname, '..', filename);
  const script = ts.transpileModule(fs.readFileSync(pathname, 'utf8'), {
    fileName: pathname,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = new Module(pathname);
  mod.filename = pathname;
  mod.paths = Module._nodeModulePaths(path.dirname(pathname));
  mod._compile(script, pathname);
  return mod.exports;
}

// Node smoke test for the browser-independent parts of the image pipeline.
global.ImageData = class ImageData {
  constructor(data, width, height) { this.data = data; this.width = width; this.height = height; }
};
const { getSelectedMask, maskBounds, restoreBackground, mergeMasks } = loadTs('src/lib/decomposition.ts');
const { nearestColor, parseFactoryCsv, deltaE76 } = loadTs('src/lib/color-matching.ts');
const { zipFiles } = loadTs('src/lib/zip-store.ts');
const { validateVisionResult, isGarmentArtwork } = loadTs('src/lib/vision-analysis.ts');

async function main() {
  assert.equal(isGarmentArtwork({type:'text',name:'Caption under front view',description:'presentation caption'}),false);
  assert.equal(isGarmentArtwork({type:'logo',name:'Brand logo reference',description:'presentation board reference'}),true);
  assert.equal(isGarmentArtwork({type:'number',name:'Номер 10',description:'На спинці футболки'}),true);
  assert.equal(isGarmentArtwork({type:'text',name:'RUDYUK',description:'Напис на одязі'}),true);
  const w = 20, h = 20;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const pixel = (y * w + x) * 4;
    const logo = x >= 7 && x <= 12 && y >= 5 && y <= 14;
    data.set(logo ? [230, 24, 34, 255] : [20, 30, 50, 255], pixel);
  }
  const original = new ImageData(data, w, h);
  const mask = getSelectedMask(original, { x: 5, y: 3, width: 10, height: 14 }, { x: 8, y: 6 }, 15);
  assert.equal(mask.reduce((sum, value) => sum + Boolean(value), 0), 60);
  assert.deepEqual(maskBounds(mask, w, h), { x: 7, y: 5, width: 6, height: 10 });
  assert.equal(mergeMasks([{ mask }], w * h)[8 * w + 10], 255);
  const restored = restoreBackground(original, mask);
  assert.equal(restored.data[(8 * w + 10) * 4], 20);
  assert.equal(restored.data[(0 * w + 0) * 4], 20);
  assert.equal(deltaE76('#ffffff', '#ffffff'), 0);
  assert.ok(deltaE76('#ffffff', '#000000') > 90);
  const palette = parseFactoryCsv('Company Blue;#123456\nCompany Red;#FE0000');
  assert.equal(palette.length, 2);
  assert.equal(nearestColor('#ff0000', palette).name, 'Company Red');
  const archive = zipFiles([{ name: 'layers/logo.txt', bytes: new TextEncoder().encode('logo') }]);
  const bytes = Buffer.from(await archive.arrayBuffer());
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  assert.equal(bytes.readUInt32LE(bytes.length - 22), 0x06054b50);
  const detection = { id: '1', name: 'Номер', type: 'number', bbox: { x: -0.1, y: 0.8, width: 0.5, height: 0.5 }, confidence: 0.7, description: '10' };
  const result = { elements: [detection], background: { type: 'solid', description: 'Фон', selectionRecommendation: 'Колір', restorationRecommendation: 'Сусідні пікселі' } };
  const validated = validateVisionResult(result);
  assert.equal(validated.elements[0].bbox.x, 0);
  assert.ok(Math.abs(validated.elements[0].bbox.height - 0.2) < 1e-10);
  assert.throws(() => validateVisionResult({ ...result, elements: [detection, detection] }));
  assert.throws(() => validateVisionResult({ ...result, elements: [{ ...detection, confidence: 1.1 }] }));
  assert.throws(() => validateVisionResult({ ...result, elements: [{ ...detection, bbox: { x: 2, y: 0, width: 1, height: 1 } }] }));
  assert.throws(() => validateVisionResult({ ...result, elements: [{ ...detection, bbox: { ...detection.bbox, width: -1 } }] }));
  console.log('All decomposition core tests passed (segmentation, inpainting, Lab, ZIP).');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
