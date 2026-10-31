/** Deterministic RGB k-means on sampled pixels; coverage is measured on all visible preview pixels. */
export function extractDominantColors(image: ImageData, requested = 8): Array<{ r: number; g: number; b: number; count: number }> {
  const { data } = image, pixels = image.width * image.height;
  const step = Math.max(1, Math.floor(pixels / 8000));
  const samples: Array<[number, number, number]> = [];
  for (let p = 0; p < pixels; p += step) if (data[p * 4 + 3] > 32) samples.push([data[p * 4], data[p * 4 + 1], data[p * 4 + 2]]);
  if (!samples.length) return [];
  const k = Math.min(8, Math.max(1, Math.floor(requested)), samples.length);
  const centers: Array<[number, number, number]> = [samples[0].slice() as [number, number, number]];
  while (centers.length < k) {
    let farthest = 0, chosen = samples[0];
    for (const sample of samples) {
      const d = Math.min(...centers.map(c => (c[0] - sample[0]) ** 2 + (c[1] - sample[1]) ** 2 + (c[2] - sample[2]) ** 2));
      if (d > farthest) { farthest = d; chosen = sample; }
    }
    if (!farthest) break;
    centers.push([...chosen]);
  }
  for (let n = 0; n < 12; n++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const sample of samples) {
      let best = 0, distance = Infinity;
      for (let i = 0; i < centers.length; i++) { const c = centers[i], d = (c[0] - sample[0]) ** 2 + (c[1] - sample[1]) ** 2 + (c[2] - sample[2]) ** 2; if (d < distance) { distance = d; best = i; } }
      sums[best][0] += sample[0]; sums[best][1] += sample[1]; sums[best][2] += sample[2]; sums[best][3]++;
    }
    for (let i = 0; i < centers.length; i++) if (sums[i][3]) centers[i] = [Math.round(sums[i][0] / sums[i][3]), Math.round(sums[i][1] / sums[i][3]), Math.round(sums[i][2] / sums[i][3])];
  }
  const counts = centers.map(() => 0);
  for (let p = 0; p < pixels; p++) {
    const i = p * 4; if (data[i + 3] <= 32) continue;
    let best = 0, distance = Infinity;
    for (let c = 0; c < centers.length; c++) { const v = centers[c], d = (v[0] - data[i]) ** 2 + (v[1] - data[i + 1]) ** 2 + (v[2] - data[i + 2]) ** 2; if (d < distance) { distance = d; best = c; } }
    counts[best]++;
  }
  return centers.map((c, i) => ({ r: c[0], g: c[1], b: c[2], count: counts[i] })).filter(c => c.count).sort((a, b) => b.count - a.count);
}

export function paletteEntries(image: ImageData) {
  const colors=extractDominantColors(image,8),total=colors.reduce((sum,color)=>sum+color.count,0)||1;
  return colors.map((color,index)=>{
    const r=color.r/255,g=color.g/255,b=color.b/255,k=1-Math.max(r,g,b),f=1-k;
    const cmyk=k>=.999?{c:0,m:0,y:0,k:100}:{c:Math.round((1-r-k)/f*100),m:Math.round((1-g-k)/f*100),y:Math.round((1-b-k)/f*100),k:Math.round(k*100)};
    return {id:`color-${index}`,hex:'#'+[color.r,color.g,color.b].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase(),cmyk,percentage:Math.round(color.count/total*1000)/10,visible:true,pixels:color.count};
  });
}
