import type { PrintLayer, Rect } from './decomposition';
import { hexRgb } from './color-matching';

export const DESIGN_LAYER_NAMES = ['Однотонна основа', 'Принт 1 · основні форми', 'Принт 2 · орнамент і деталі', 'Принт 3 · логотипи й написи'] as const;
export const DESIGN_CODES = [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255]] as const;

/** The generated classification map supplies membership only, never artwork RGB. */
export function classifyDesign(master: ImageData, map: ImageData): Uint8Array {
  if (master.width !== map.width || master.height !== map.height) throw new Error('Карта шарів має інший розмір. Повторіть поділ.');
  const classes = new Uint8Array(master.width * master.height);
  let invalid=0;
  for (let p = 0; p < classes.length; p++) {
    let nearest = 0, distance = Infinity;
    for (let c = 0; c < DESIGN_CODES.length; c++) {
      const code = DESIGN_CODES[c], d = code.reduce<number>((sum, value, k) => sum + (value - map.data[p * 4 + k]) ** 2, 0);
      if (d < distance) { distance = d; nearest = c; }
    }
    classes[p] = nearest;if(distance>70**2)invalid++;
  }
  if(invalid>classes.length*.1)throw new Error('Модель повернула ілюстрацію замість карти шарів. Результат відхилено; повторіть поділ.');
  return classes;
}

export function designBaseColor(image: ImageData, classes: Uint8Array): string {
  const counts = new Map<number, number>(), step = Math.max(1, Math.floor(classes.length / 160_000));
  for (let p = 0; p < classes.length; p += step) if (classes[p] === 0) {
    const i = p * 4, rgb = (image.data[i] << 16) | (image.data[i + 1] << 8) | image.data[i + 2];
    counts.set(rgb, (counts.get(rgb) || 0) + 1);
  }
  if (!counts.size) throw new Error('Модель не позначила однотонну основу. Повторіть поділ або уточніть ескіз.');
  const best = [...counts].reduce((a, b) => b[1] > a[1] ? b : a)[0];
  return `#${best.toString(16).padStart(6, '0')}`;
}

/** Suppress tiny generative RGB fluctuations only inside the predicted uniform base. */
export function normalizeDesignBase(image: ImageData, classes: Uint8Array, baseHex: string): ImageData {
  const rgb=hexRgb(baseHex),output=new ImageData(new Uint8ClampedArray(image.data),image.width,image.height);
  for(let p=0;p<classes.length;p++)if(classes[p]===0){
    const i=p*4;
    if(rgb.every((value,c)=>Math.abs(image.data[i+c]-value)<=6))for(let c=0;c<3;c++)output.data[i+c]=rgb[c];
  }
  return output;
}

/** Four registered full-size canvases. Upper membership is exclusive, so the stack preserves master RGB. */
export function createDesignLayers(master: ImageData, classes: Uint8Array, baseHex: string, underpaint?: ImageData): PrintLayer[] {
  if (classes.length !== master.width * master.height || classes.some(c => c > 3)) throw new Error('Некоректна карта шарів.');
  if (underpaint && (underpaint.width !== master.width || underpaint.height !== master.height)) throw new Error('Некоректне відновлення нижнього принта.');
  const base = hexRgb(baseHex), bounds: Rect = { x: 0, y: 0, width: master.width, height: master.height };
  const solid = new ImageData(new Uint8ClampedArray(master.data.length), master.width, master.height);
  const masks = Array.from({ length: 4 }, () => new Uint8Array(classes.length)); masks[0].fill(255);
  for (let p = 0; p < classes.length; p++) {
    const i = p * 4;
    solid.data[i]=base[0];solid.data[i+1]=base[1];solid.data[i+2]=base[2];solid.data[i+3]=255;
    const rgb = underpaint || master;
    // Exact base matches remain transparent; all other master pixels survive in a print layer.
    if (rgb.data[i] !== base[0] || rgb.data[i + 1] !== base[1] || rgb.data[i + 2] !== base[2]) masks[1][p] = 255;
    if (classes[p] > 1) {
      masks[classes[p]][p] = 255;
      if (!underpaint) masks[1][p] = 0;
    }
  }
  return DESIGN_LAYER_NAMES.map((name, index) => ({
    id: `design-${index}`, name, type: index === 0 ? 'background' : index === 3 ? 'logo' : 'graphic',
    source: 'estimated-foreground', bounds, visible: true, order: index, mask: masks[index],
    foreground: { image: index === 0 ? solid : index === 1 && underpaint ? underpaint : master, bounds },
    operations: ['генеративне розгортання ескізу', 'спільне прямокутне полотно', index === 0 ? 'однотонна заливка' : 'AI-класифікація пікселів; потребує перевірки'],
  }));
}

/** Reassign edited pixels between the three fixed print canvases; never create a fifth layer. */
export function updateDesignMask(master: ImageData, layers: PrintLayer[], targetId: string, mask: Uint8Array): PrintLayer[] {
  const target=layers.findIndex(layer=>layer.id===targetId);
  if(target<1 || mask.length!==master.width*master.height)throw new Error('Редагуйте один із трьох принтів; основа залишається однотонною.');
  const old=layers[target].mask, masks:Uint8Array[]=layers.map(layer=>layer.mask.slice());masks[target]=mask;
  let firstPixels:ImageData|undefined;
  for(let p=0;p<mask.length;p++) {
    if(mask[p]===255 && mask[p]>old[p])for(let index=1;index<layers.length;index++)if(index!==target)masks[index][p]=Math.min(masks[index][p],255-mask[p]);
    if(target>1 && mask[p]<old[p]) {
      masks[1][p]=255;
      if(!firstPixels)firstPixels=new ImageData(new Uint8ClampedArray(layers[1].foreground?.image.data || master.data),master.width,master.height);
      firstPixels.data.set(master.data.subarray(p*4,p*4+4),p*4);
    }
  }
  return layers.map((layer,index)=>({...layer,mask:masks[index],foreground:index===1&&firstPixels?{image:firstPixels,bounds:layer.bounds}:layer.foreground,operations:index===target?[...layer.operations,'ручне виправлення розподілу']:layer.operations}));
}
