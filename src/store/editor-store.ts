import { create } from 'zustand';
import { paletteEntries } from '@/lib/palette';

export interface ColorLayer {
  id: string;
  hex: string;
  cmyk: { c: number; m: number; y: number; k: number };
  percentage: number;
  visible: boolean;
  pixels: number; // pixel count belonging to this cluster
}

export type EditorStage = 'idle' | 'upload-modal' | 'artboard';

export interface EditorState {
  stage: EditorStage;
  uploadedFile: File | null;
  uploadedImageUrl: string | null;
  uploadedImageData: ImageData | null;
  previewImageData: ImageData | null;
  workingImageData: ImageData | null;
  workingPreview: ImageData | null;
  colorLayers: ColorLayer[];
  soloLayerId: string | null; // null = show all
  garmentType: 'jersey' | 'hoodie' | 'tracksuit';
  garmentSize: string;
  isExporting: boolean;
  zoom: number;
  activeTool: string;

  // actions
  openUploadModal: () => void;
  closeUploadModal: () => void;
  setUploadedFile: (file: File, url: string, data: ImageData, preview: ImageData) => void;
  setColorLayers: (layers: ColorLayer[]) => void;
  toggleLayerVisibility: (id: string) => void;
  setSoloLayer: (id: string | null) => void;
  showAllLayers: () => void;
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
  previewImageData: null,
  workingImageData: null,
  workingPreview: null,
  colorLayers: [],
  soloLayerId: null,
  garmentType: 'jersey',
  garmentSize: 'Дорослий 50 (L)',
  isExporting: false,
  zoom: 100,
  activeTool: 'V',

  openUploadModal: () => set({ stage: 'upload-modal' }),
  closeUploadModal: () => set({ stage: get().uploadedImageData ? 'artboard' : 'idle' }),

  setUploadedFile: (file, url, data, preview) =>
    set({
      uploadedFile: file,
      uploadedImageUrl: url,
      uploadedImageData: data,
      previewImageData: preview,
      workingImageData: null,
      workingPreview: null,
      colorLayers: paletteEntries(preview),
      soloLayerId: null,
      stage: 'artboard',
    }),

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
      previewImageData: null,
      workingImageData: null,
      workingPreview: null,
      colorLayers: [],
      soloLayerId: null,
    }),
}));
