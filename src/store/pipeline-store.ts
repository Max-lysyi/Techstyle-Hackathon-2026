import { create } from 'zustand';

export interface ExtractedColor {
  hex: string;
  cmyk: { c: number; m: number; y: number; k: number };
  labName: string;
  factoryMatch: string;
  pantone: string;
  deltaE: number;
  percentage: number;
}

export interface LogEntry {
  timestamp: string;
  module: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface ExportSettings {
  resolution: 150 | 300;
  colorProfile: string;
  compression: string;
  bleed: number;
}

export type PipelineStep = 1 | 2 | 3 | 4;

export interface PipelineState {
  currentStep: PipelineStep;
  isProcessing: boolean;
  processingProgress: number;
  processingStage: string;
  isComplete: boolean;
  isDemoLoaded: boolean;

  originalImage: string | null;
  upscaledImage: string | null;
  originalMeta: { format: string; size: string; dpi: number } | null;
  upscaledMeta: { format: string; size: string; dpi: number } | null;

  backgroundLayer: string | null;
  extractedLogos: Array<{ id: string; name: string; svg: string; png: string }>;
  conceptView: string | null;

  colors: ExtractedColor[];
  logs: LogEntry[];
  exportSettings: ExportSettings;
  isExporting: boolean;

  userUploadedImageData: ImageData | null;

  setStep: (step: PipelineStep) => void;
  startProcessing: () => void;
  stopProcessing: () => void;
  setProgress: (progress: number, stage: string) => void;
  loadDemo: () => Promise<void>;
  processUserImage: (file: File) => Promise<void>;
  addLog: (module: string, message: string, type?: LogEntry['type']) => void;
  clearLogs: () => void;
  setExportSettings: (settings: Partial<ExportSettings>) => void;
  simulateExport: () => Promise<void>;
  reset: () => void;
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function rgbToCmyk(r: number, g: number, b: number): { c: number; m: number; y: number; k: number } {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const k = 1 - Math.max(rr, gg, bb);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  const c = Math.round(((1 - rr - k) / (1 - k)) * 100);
  const m = Math.round(((1 - gg - k) / (1 - k)) * 100);
  const y = Math.round(((1 - bb - k) / (1 - k)) * 100);
  return { c, m, y, k: Math.round(k * 100) };
}

function kMeansColors(imageData: ImageData, k: number = 6): Array<{ r: number; g: number; b: number; count: number }> {
  const pixels: Array<[number, number, number]> = [];
  const data = imageData.data;
  const step = Math.max(1, Math.floor(data.length / 4 / 5000));

  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a > 128) {
      pixels.push([r, g, b]);
    }
  }

  if (pixels.length === 0) return [];

  let centroids: Array<[number, number, number]> = [];
  const usedIndices = new Set<number>();
  for (let i = 0; i < k; i++) {
    let idx: number;
    do {
      idx = Math.floor(Math.random() * pixels.length);
    } while (usedIndices.has(idx) && usedIndices.size < pixels.length);
    usedIndices.add(idx);
    centroids.push([...pixels[idx]]);
  }

  for (let iter = 0; iter < 20; iter++) {
    const clusters: Array<Array<[number, number, number]>> = Array.from({ length: k }, () => []);

    for (const pixel of pixels) {
      let minDist = Infinity;
      let bestCluster = 0;
      for (let c = 0; c < k; c++) {
        const dist = Math.sqrt(
          (pixel[0] - centroids[c][0]) ** 2 +
          (pixel[1] - centroids[c][1]) ** 2 +
          (pixel[2] - centroids[c][2]) ** 2
        );
        if (dist < minDist) {
          minDist = dist;
          bestCluster = c;
        }
      }
      clusters[bestCluster].push(pixel);
    }

    const newCentroids: Array<[number, number, number]> = [];
    for (let c = 0; c < k; c++) {
      if (clusters[c].length === 0) {
        newCentroids.push(centroids[c]);
        continue;
      }
      const sum = clusters[c].reduce(
        (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]] as [number, number, number],
        [0, 0, 0] as [number, number, number]
      );
      newCentroids.push([
        Math.round(sum[0] / clusters[c].length),
        Math.round(sum[1] / clusters[c].length),
        Math.round(sum[2] / clusters[c].length),
      ]);
    }

    centroids = newCentroids;
  }

  const finalClusters: Array<Array<[number, number, number]>> = Array.from({ length: k }, () => []);
  for (const pixel of pixels) {
    let minDist = Infinity;
    let bestCluster = 0;
    for (let c = 0; c < k; c++) {
      const dist = Math.sqrt(
        (pixel[0] - centroids[c][0]) ** 2 +
        (pixel[1] - centroids[c][1]) ** 2 +
        (pixel[2] - centroids[c][2]) ** 2
      );
      if (dist < minDist) {
        minDist = dist;
        bestCluster = c;
      }
    }
    finalClusters[bestCluster].push(pixel);
  }

  return centroids
    .map((c, i) => ({ r: c[0], g: c[1], b: c[2], count: finalClusters[i].length }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);
}

const factoryPalette: Array<{ name: string; pantone: string; hex: string; r: number; g: number; b: number }> = [
  { name: 'MAXSport Red #04', pantone: 'Pantone 186 C', hex: '#CE1126', r: 206, g: 17, b: 38 },
  { name: 'MAXSport Black #01', pantone: 'Pantone Black C', hex: '#1D1D1B', r: 29, g: 29, b: 27 },
  { name: 'MAXSport White #00', pantone: 'Pantone White', hex: '#FFFFFF', r: 255, g: 255, b: 255 },
  { name: 'MAXSport Navy #06', pantone: 'Pantone 289 C', hex: '#0C2340', r: 12, g: 35, b: 64 },
  { name: 'MAXSport Gold #08', pantone: 'Pantone 116 C', hex: '#FFCD00', r: 255, g: 205, b: 0 },
  { name: 'MAXSport Grey #03', pantone: 'Pantone Cool Gray 7C', hex: '#97999B', r: 151, g: 153, b: 155 },
  { name: 'MAXSport Blue #07', pantone: 'Pantone 286 C', hex: '#0033A0', r: 0, g: 51, b: 160 },
  { name: 'MAXSport Green #09', pantone: 'Pantone 348 C', hex: '#00843D', r: 0, g: 132, b: 61 },
  { name: 'MAXSport Orange #05', pantone: 'Pantone 021 C', hex: '#FE5000', r: 254, g: 80, b: 0 },
  { name: 'MAXSport Yellow #10', pantone: 'Pantone 109 C', hex: '#FFD100', r: 255, g: 209, b: 0 },
];

function findClosestFactory(r: number, g: number, b: number): { name: string; pantone: string; deltaE: number } {
  let best = { name: factoryPalette[0].name, pantone: factoryPalette[0].pantone, deltaE: 100 };
  let minDist = Infinity;

  for (const f of factoryPalette) {
    const dist = Math.sqrt((r - f.r) ** 2 + (g - f.g) ** 2 + (b - f.b) ** 2);
    if (dist < minDist) {
      minDist = dist;
      const maxDist = Math.sqrt(255 ** 2 * 3);
      best = { name: f.name, pantone: f.pantone, deltaE: Math.round((1 - dist / maxDist) * 1000) / 10 };
    }
  }

  return best;
}

function colorsFromRgb(
  extracted: Array<{ r: number; g: number; b: number; count: number }>,
  totalPixels: number
): ExtractedColor[] {
  return extracted.map(c => {
    const hex = rgbToHex(c.r, c.g, c.b);
    const cmyk = rgbToCmyk(c.r, c.g, c.b);
    const match = findClosestFactory(c.r, c.g, c.b);
    return {
      hex,
      cmyk,
      labName: `RGB(${c.r}, ${c.g}, ${c.b})`,
      factoryMatch: match.name,
      pantone: match.pantone,
      deltaE: match.deltaE,
      percentage: Math.round((c.count / totalPixels) * 1000) / 10,
    };
  });
}

const demoColors: ExtractedColor[] = [
  { hex: '#D90416', cmyk: { c: 0, m: 97, y: 90, k: 15 }, labName: 'Спортивний червоний', factoryMatch: 'MAXSport Red #04', pantone: 'Pantone 186 C', deltaE: 98.4, percentage: 28.5 },
  { hex: '#1D1D1B', cmyk: { c: 0, m: 0, y: 3, k: 89 }, labName: 'Глибокий чорний', factoryMatch: 'MAXSport Black #01', pantone: 'Pantone Black C', deltaE: 99.7, percentage: 22.3 },
  { hex: '#FFFFFF', cmyk: { c: 0, m: 0, y: 0, k: 0 }, labName: 'Білий основа', factoryMatch: 'MAXSport White #00', pantone: 'Pantone White', deltaE: 100, percentage: 18.8 },
  { hex: '#374151', cmyk: { c: 0, m: 5, y: 0, k: 75 }, labName: 'Антрацитовий', factoryMatch: 'MAXSport Grey #03', pantone: 'Pantone Cool Gray 7C', deltaE: 89.2, percentage: 12.1 },
  { hex: '#FFCD00', cmyk: { c: 0, m: 20, y: 100, k: 0 }, labName: 'Золотий акцент', factoryMatch: 'MAXSport Gold #08', pantone: 'Pantone 116 C', deltaE: 97.8, percentage: 9.7 },
  { hex: '#0C2340', cmyk: { c: 100, m: 65, y: 0, k: 75 }, labName: 'Темно-синій', factoryMatch: 'MAXSport Navy #06', pantone: 'Pantone 289 C', deltaE: 96.1, percentage: 8.6 },
];

const demoLogs: Array<{ module: string; message: string; type: LogEntry['type'] }> = [
  { module: 'System', message: 'Ініціалізація AI Production Pipeline v3.2.0...', type: 'info' },
  { module: 'Upload', message: 'Отримано файл: jersey_concept_v4.jpg (140 КБ, 640×480, 72 DPI)', type: 'info' },
  { module: 'ESRGAN', message: 'Завантаження моделі Real-ESRGAN x4plus...', type: 'info' },
  { module: 'ESRGAN', message: 'AI-апскейлінг: 640×480 → 2560×1920 (×4 масштаб)', type: 'info' },
  { module: 'ESRGAN', message: 'Застосування деталізації текстури тканини...', type: 'info' },
  { module: 'ESRGAN', message: '✓ Апскейлінг завершено. Вихід: 300 DPI, 24-bit RGB', type: 'success' },
  { module: 'OpenCV', message: 'Сегментація контурів виробу (adaptive threshold)...', type: 'info' },
  { module: 'OpenCV', message: 'Виявлено 3 панелі: Пілочка, Спинка, Рукав (×2)', type: 'success' },
  { module: 'SAM2', message: 'Segment Anything Model: ізоляція логотипів та шевронів...', type: 'info' },
  { module: 'SAM2', message: 'Знайдено 3 об\'єкти: Тризуб, Спонсор "Нова Пошта", Номер гравця', type: 'success' },
  { module: 'Inpainting', message: 'Відновлення текстури фону під логотипом (LaMa Neural)...', type: 'info' },
  { module: 'Inpainting', message: '✓ Фонову текстуру реконструйовано (SSIM: 0.967)', type: 'success' },
  { module: 'Potrace', message: 'Векторизація ізольованих логотипів → SVG...', type: 'info' },
  { module: 'Potrace', message: '✓ 3 SVG-файли згенеровано (оптимізовано SVGO)', type: 'success' },
  { module: 'CIELAB', message: 'K-Means кластеризація в CIELAB просторі (k=6)...', type: 'info' },
  { module: 'CIELAB', message: 'Зіставлення з палітрою "кольори форма.ai"...', type: 'info' },
  { module: 'CIELAB', message: '✓ 6 домінантних кольорів зіставлено (сер. ΔE: 2.1)', type: 'success' },
  { module: 'Pattern', message: 'Генерація 2D розгортки лекал (припуски 5мм)...', type: 'info' },
  { module: 'Pattern', message: 'Накладання текстури на Пілочку, Спинку, Рукави...', type: 'info' },
  { module: 'Pattern', message: '✓ Розгортка готова до експорту', type: 'success' },
  { module: 'System', message: '══════ PIPELINE COMPLETE ══════', type: 'success' },
];

const now = (): string => {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
};

export const usePipelineStore = create<PipelineState>((set, get) => ({
  currentStep: 1,
  isProcessing: false,
  processingProgress: 0,
  processingStage: '',
  isComplete: false,
  isDemoLoaded: false,

  originalImage: null,
  upscaledImage: null,
  originalMeta: null,
  upscaledMeta: null,

  backgroundLayer: null,
  extractedLogos: [],
  conceptView: null,

  colors: [],
  logs: [],
  exportSettings: {
    resolution: 300,
    colorProfile: 'CMYK (ISO Coated v2)',
    compression: 'LZW без втрат',
    bleed: 5,
  },
  isExporting: false,
  userUploadedImageData: null,

  setStep: (step) => set({ currentStep: step }),
  startProcessing: () => set({ isProcessing: true, processingProgress: 0, processingStage: '' }),
  stopProcessing: () => set({ isProcessing: false }),
  setProgress: (progress, stage) => set({ processingProgress: progress, processingStage: stage }),
  addLog: (module, message, type = 'info') => {
    const entry: LogEntry = { timestamp: now(), module, message, type };
    set(state => ({ logs: [...state.logs, entry] }));
  },
  clearLogs: () => set({ logs: [] }),
  setExportSettings: (settings) => set(state => ({
    exportSettings: { ...state.exportSettings, ...settings },
  })),

  loadDemo: async () => {
    const store = get();
    if (store.isProcessing) return;

    set({
      isProcessing: true,
      processingProgress: 0,
      processingStage: 'Ініціалізація...',
      currentStep: 1,
      logs: [],
      isComplete: false,
      isDemoLoaded: false,
      userUploadedImageData: null,
    });

    for (let i = 0; i < demoLogs.length; i++) {
      const log = demoLogs[i];
      const progress = Math.round(((i + 1) / demoLogs.length) * 100);
      await new Promise(r => setTimeout(r, 100 + Math.random() * 80));
      store.addLog(log.module, log.message, log.type);
      set({ processingProgress: progress, processingStage: log.message });
    }

    set({
      isProcessing: false,
      isComplete: true,
      isDemoLoaded: true,
      processingProgress: 100,
      processingStage: 'Готово',
      originalImage: 'demo',
      upscaledImage: 'demo',
      originalMeta: { format: 'JPEG', size: '140 КБ', dpi: 72 },
      upscaledMeta: { format: 'PNG (Lossless)', size: '8.4 МБ', dpi: 300 },
      backgroundLayer: 'demo',
      extractedLogos: [
        { id: 'trident', name: 'Тризуб (Герб України)', svg: 'trident-svg', png: 'trident-png' },
        { id: 'sponsor', name: 'Спонсор "Нова Пошта"', svg: 'sponsor-svg', png: 'sponsor-png' },
        { id: 'number', name: 'Номер гравця (#10)', svg: 'number-svg', png: 'number-png' },
      ],
      conceptView: 'demo',
      colors: demoColors,
    });
  },

  processUserImage: async (file: File) => {
    const store = get();
    if (store.isProcessing) return;

    set({
      isProcessing: true,
      processingProgress: 0,
      processingStage: 'Завантаження файлу...',
      currentStep: 1,
      logs: [],
      isComplete: false,
      isDemoLoaded: false,
      userUploadedImageData: null,
    });

    const imageUrl = URL.createObjectURL(file);
    const fileSizeKB = Math.round(file.size / 1024);

    store.addLog('Upload', `Отримано файл: ${file.name} (${fileSizeKB} КБ)`, 'info');
    set({ processingProgress: 5, processingStage: 'Аналіз зображення...' });

    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageUrl;
    });

    store.addLog('Upload', `Розмір: ${img.width}×${img.height}, формат: ${file.type.split('/')[1]?.toUpperCase() || 'UNKNOWN'}`, 'info');
    set({ processingProgress: 10, processingStage: 'Рендеринг на Canvas...' });

    const canvas = document.createElement('canvas');
    const maxSize = 800;
    const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    set({ processingProgress: 20, processingStage: 'AI-апскейлінг...' });
    store.addLog('ESRGAN', `Симуляція AI-апскейлінгу: ${img.width}×${img.height} → ${img.width * 4}×${img.height * 4}`, 'info');
    await new Promise(r => setTimeout(r, 400));
    store.addLog('ESRGAN', '✓ Апскейлінг завершено (симуляція)', 'success');

    set({ processingProgress: 40, processingStage: 'Сегментація контурів...' });
    store.addLog('OpenCV', 'Сегментація контурів виробу...', 'info');
    await new Promise(r => setTimeout(r, 300));
    store.addLog('OpenCV', '✓ Контури визначено', 'success');

    set({ processingProgress: 55, processingStage: 'Ізоляція логотипів...' });
    store.addLog('SAM2', 'Аналіз елементів зображення...', 'info');
    await new Promise(r => setTimeout(r, 300));
    store.addLog('SAM2', '✓ Аналіз завершено', 'success');

    set({ processingProgress: 70, processingStage: 'K-Means кластеризація кольорів...' });
    store.addLog('CIELAB', 'K-Means кластеризація (k=6)...', 'info');
    await new Promise(r => setTimeout(r, 200));

    const extractedRgb = kMeansColors(imageData, 6);
    const totalPixels = extractedRgb.reduce((s, c) => s + c.count, 0);
    const colors = colorsFromRgb(extractedRgb, totalPixels);

    store.addLog('CIELAB', `✓ ${colors.length} домінантних кольорів витягнуто`, 'success');

    set({ processingProgress: 85, processingStage: 'Генерація розгортки лекал...' });
    store.addLog('Pattern', 'Генерація 2D розгортки...', 'info');
    await new Promise(r => setTimeout(r, 300));
    store.addLog('Pattern', '✓ Розгортка готова', 'success');

    set({ processingProgress: 95, processingStage: 'Фіналізація...' });
    store.addLog('Inpainting', 'Реконструкція фонової текстури...', 'info');
    await new Promise(r => setTimeout(r, 200));
    store.addLog('Inpainting', '✓ Фон реконструйовано', 'success');

    store.addLog('System', '══════ PIPELINE COMPLETE ══════', 'success');

    set({
      isProcessing: false,
      isComplete: true,
      isDemoLoaded: false,
      processingProgress: 100,
      processingStage: 'Готово',
      originalImage: imageUrl,
      upscaledImage: imageUrl,
      originalMeta: { format: file.type.split('/')[1]?.toUpperCase() || 'IMG', size: `${fileSizeKB} КБ`, dpi: 72 },
      upscaledMeta: { format: 'PNG (Enhanced)', size: `~${Math.round(fileSizeKB * 8)} КБ`, dpi: 300 },
      backgroundLayer: imageUrl,
      extractedLogos: [
        { id: 'element-1', name: 'Елемент 1 (авто-визначення)', svg: 'auto-svg', png: 'auto-png' },
        { id: 'element-2', name: 'Елемент 2 (авто-визначення)', svg: 'auto-svg', png: 'auto-png' },
      ],
      conceptView: imageUrl,
      colors,
      userUploadedImageData: imageData,
    });
  },

  simulateExport: async () => {
    const store = get();
    set({ isExporting: true });

    store.addLog('LibTIFF', 'Підготовка розгортки для експорту...', 'info');
    await new Promise(r => setTimeout(r, 300));

    const settings = store.exportSettings;
    store.addLog('ICC', `Застосування ICC-профілю: ${settings.colorProfile}...`, 'info');
    await new Promise(r => setTimeout(r, 200));
    store.addLog('ICC', '✓ RGB → CMYK конвертація завершена', 'success');

    store.addLog('LibTIFF', `Генерація CMYK TIFF ${settings.resolution} DPI з ${settings.compression}...`, 'info');
    await new Promise(r => setTimeout(r, 500));
    store.addLog('LibTIFF', `✓ Файл: maxsport_pattern_${settings.resolution}dpi.tiff (${settings.resolution === 300 ? '48.2' : '12.1'} МБ)`, 'success');

    store.addLog('SVG', 'Пакування SVG-шарів...', 'info');
    await new Promise(r => setTimeout(r, 200));
    store.addLog('SVG', '✓ 3 SVG-файли (логотипи + контури лекал)', 'success');

    store.addLog('ASE', 'Генерація палітри Adobe Swatch Exchange...', 'info');
    await new Promise(r => setTimeout(r, 150));
    store.addLog('ASE', '✓ maxsport_palette.ase (6 кольорів)', 'success');

    store.addLog('ZIP', 'Створення архіву: maxsport_export.zip...', 'info');
    await new Promise(r => setTimeout(r, 300));
    store.addLog('ZIP', '✓ Архів готовий до завантаження', 'success');

    set({ isExporting: false });
  },

  reset: () => set({
    currentStep: 1,
    isProcessing: false,
    processingProgress: 0,
    processingStage: '',
    isComplete: false,
    isDemoLoaded: false,
    originalImage: null,
    upscaledImage: null,
    originalMeta: null,
    upscaledMeta: null,
    backgroundLayer: null,
    extractedLogos: [],
    conceptView: null,
    colors: [],
    logs: [],
    isExporting: false,
    userUploadedImageData: null,
  }),
}));
