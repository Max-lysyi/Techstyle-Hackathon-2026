import { create } from 'zustand';

export interface ColorLayer {
  id: string;
  hex: string;
  cmyk: { c: number; m: number; y: number; k: number };
  percentage: number;
  pantone: string;
  visible: boolean;
  pixels: number; // pixel count belonging to this cluster
}

export type EditorStage = 'idle' | 'upload-modal' | 'ai-scan' | 'ai-enhance' | 'review' | 'artboard';

export interface AiDiagnosticData {
  qualityScore: number;
  detectedDpi: number;
  targetDpi: number;
  compressionArtifacts: boolean;
  blurDetected: boolean;
  diagnosticSummary: string;
  reconstructedElements: string[];
  recommendations: string;
  geminiLive?: boolean;
}

export interface EditorState {
  stage: EditorStage;
  uploadedFile: File | null;
  uploadedImageUrl: string | null;
  uploadedImageData: ImageData | null;
  enhancedImageUrl: string | null;
  enhancedSeed: number; // increment to trigger regeneration
  scanProgress: number;
  scanStage: string;
  aiAnalysis: AiDiagnosticData | null;
  colorLayers: ColorLayer[];
  soloLayerId: string | null; // null = show all
  geminiApiKey: string;
  garmentType: 'jersey' | 'hoodie' | 'tracksuit';
  garmentSize: string;
  isExporting: boolean;
  zoom: number;
  activeTool: string;

  // actions
  openUploadModal: () => void;
  closeUploadModal: () => void;
  setUploadedFile: (file: File, url: string, data: ImageData) => void;
  startAiScan: () => void;
  setProgress: (progress: number, stage: string) => void;
  setAiAnalysis: (analysis: AiDiagnosticData | null) => void;
  setEnhancedImage: (url: string) => void;
  regenerate: () => void;
  acceptEnhancement: () => void;
  setColorLayers: (layers: ColorLayer[]) => void;
  toggleLayerVisibility: (id: string) => void;
  setSoloLayer: (id: string | null) => void;
  showAllLayers: () => void;
  setGeminiKey: (key: string) => void;
  setGarmentType: (type: 'jersey' | 'hoodie' | 'tracksuit') => void;
  setGarmentSize: (size: string) => void;
  setExporting: (v: boolean) => void;
  setZoom: (z: number) => void;
  setActiveTool: (tool: string) => void;
  resetEditor: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  stage: 'idle',
  uploadedFile: null,
  uploadedImageUrl: null,
  uploadedImageData: null,
  enhancedImageUrl: null,
  enhancedSeed: 0,
  scanProgress: 0,
  scanStage: '',
  aiAnalysis: null,
  colorLayers: [],
  soloLayerId: null,
  geminiApiKey: '',
  garmentType: 'jersey',
  garmentSize: 'Дорослий 50 (L)',
  isExporting: false,
  zoom: 100,
  activeTool: 'V',

  openUploadModal: () => set({ stage: 'upload-modal' }),
  closeUploadModal: () => set({ stage: get().stage === 'upload-modal' ? 'idle' : get().stage }),

  setUploadedFile: (file, url, data) =>
    set({
      uploadedFile: file,
      uploadedImageUrl: url,
      uploadedImageData: data,
      stage: 'ai-scan',
    }),

  startAiScan: () => set({ stage: 'ai-scan', scanProgress: 0, scanStage: '' }),

  setProgress: (progress, stage) => set({ scanProgress: progress, scanStage: stage }),

  setAiAnalysis: (analysis) => set({ aiAnalysis: analysis }),

  setEnhancedImage: (url) => set({ enhancedImageUrl: url, stage: 'review' }),

  regenerate: () => set((s) => ({ enhancedSeed: s.enhancedSeed + 1, stage: 'ai-enhance' })),

  acceptEnhancement: () => set({ stage: 'artboard' }),

  setColorLayers: (layers) => set({ colorLayers: layers }),

  toggleLayerVisibility: (id) =>
    set((s) => {
      const updated = s.colorLayers.map((l) =>
        l.id === id ? { ...l, visible: !l.visible } : l
      );
      const visibleCount = updated.filter((l) => l.visible).length;
      return {
        colorLayers: updated,
        soloLayerId: visibleCount === 1 ? updated.find((l) => l.visible)?.id || null : null,
      };
    }),

  setSoloLayer: (id) =>
    set((s) => ({
      soloLayerId: id,
      colorLayers: s.colorLayers.map((l) => ({ ...l, visible: id === null || l.id === id })),
    })),

  showAllLayers: () =>
    set((s) => ({
      soloLayerId: null,
      colorLayers: s.colorLayers.map((l) => ({ ...l, visible: true })),
    })),

  setGeminiKey: (key) => set({ geminiApiKey: key }),
  setGarmentType: (type) => set({ garmentType: type }),
  setGarmentSize: (size) => set({ garmentSize: size }),
  setExporting: (v) => set({ isExporting: v }),
  setZoom: (z) => set({ zoom: z }),
  setActiveTool: (tool) => set({ activeTool: tool }),

  resetEditor: () =>
    set({
      stage: 'upload-modal',
      uploadedFile: null,
      uploadedImageUrl: null,
      uploadedImageData: null,
      enhancedImageUrl: null,
      enhancedSeed: 0,
      scanProgress: 0,
      scanStage: '',
      aiAnalysis: null,
      colorLayers: [],
      soloLayerId: null,
    }),
}));
