'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, EyeOff, Loader2, Settings2, Sparkles, Upload, X, Download, Eraser, Eye, Image as ImageIcon, Layers, MousePointer2, Palette, Pipette, ScanSearch, Trash2 } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { loadSketch } from '@/lib/load-sketch';
import {DEMO_PROJECTS,loadDemoProject} from '@/lib/demo-projects';
import {studioRequest} from '@/lib/studio-request';
import { validatePartLocations } from '@/lib/part-locations';
import { useEditorStore } from '@/store/editor-store';
import {
  type PrintLayer, type Rect, getSelectedMask, connectedComponent, contrastMask, paintMask,
  maskBounds, maskedPixels, mergeMasks, mergedForeground, expandRepairMask, normalizeRect,
} from '@/lib/decomposition';
import { appendTiffCopies } from '@/lib/tiff';
import { zipFiles } from '@/lib/zip-store';
import { nearestColor, parseFactoryCsv, type FactoryColor } from '@/lib/color-matching';
import { validateVisionResult, isGarmentArtwork, type VisionElement, type VisionResult } from '@/lib/vision-analysis';
import { compositeMasked, composeExtractedLayers, prepareInpaintRequest, mapInpaintResult } from '@/lib/restoration';
import { encodePng } from '@/lib/png';
import factoryData from '@/data/factory-palette.json';
import { paletteEntries } from '@/lib/palette';
import { PART_IDS, PART_NAMES, PART_SIZES, defaultPartSettings, classifyPart, unifyContinuousGradient, partBaseColor, normalizePartBase, createPartLayers, mergePartPrints, relabelRemoved, updatePartMask, recolorPartLayer, gradientStops, type PartId, type PartSettings, type PartAspect, type LayerGroup } from '@/lib/garment-parts';

type Mode = 'rect' | 'pick' | 'brush-add' | 'brush-erase' | 'pan';
type Preview = 'group' | 'sheet' | 'original' | 'mask' | 'repair' | 'layer' | 'background' | 'layers';
type SegmentationMode = 'color' | 'connected' | 'contrast' | 'rectangle';
type CvMode = 'auto' | 'light' | 'dark' | 'multicolor' | 'grabcut' | 'emblem';
type MaskSnapshot = { design: DesignProject | null; layers: PrintLayer[]; draftMask: Uint8Array | null; editingLayerId: string | null; draftOps: string[]; draftForeground: PrintLayer['foreground']; draftExtraction: PrintLayer['extraction'] };
function snapshot(state: MaskSnapshot): MaskSnapshot { return { design:state.design, layers: state.layers, draftMask: state.draftMask, editingLayerId: state.editingLayerId, draftOps: state.draftOps, draftForeground: state.draftForeground, draftExtraction: state.draftExtraction }; }
function historyFor(state: SelectionState): MaskSnapshot[] {
  const bytes = workingImage()?.data.length ?? 4;
  const limit = Math.max(1, Math.min(20, Math.floor(32 * 1024 * 1024 / Math.max(1, bytes))));
  return [...state.past, snapshot(state)].slice(-limit);
}
type DesignProject = { source: ImageData; sourceUrl: string; labelMap: string; model: string; usage: unknown[]; baseHex: string; instructions: string; view: PartId; aspect: PartAspect; warnings: string[]; groups: LayerGroup[]; referenceRect:Rect|null; removedMask?:Uint8Array };
type GeneratedPart = { image:ImageData; url:string; model:string; usage:unknown; cached:boolean; settings:PartSettings };
type PartSession = { design:DesignProject|null; layers:PrintLayer[]; draftMask:Uint8Array|null; draftOps:string[]; draftForeground:PrintLayer['foreground'];draftExtraction:PrintLayer['extraction'];editingLayerId:string|null;past:MaskSnapshot[];future:MaskSnapshot[];roi:Rect|null;sample:{x:number;y:number}|null };
type AssetEntry={id:string;name:string;type:PrintLayer['type'];bbox:Rect;layer?:PrintLayer;transcription?:string;verified?:boolean};
type AssetSettings={text:string;instructions:string;size:'1024x1024'|'1024x1536'|'1536x1024'|'2048x2048'|'2048x3072'|'3072x2048'};
type AssetVersion={image:ImageData;png:Uint8Array;model:string;usage:unknown;cached:boolean;sourceRect:Rect;settings:AssetSettings};
type AssetVariants={proposal?:AssetVersion;accepted?:AssetVersion};
function emptyPart():PartSession{return {design:null,layers:[],draftMask:null,draftOps:[],draftForeground:undefined,draftExtraction:undefined,editingLayerId:null,past:[],future:[],roi:null,sample:null};}
function capturePart(s:SelectionState):PartSession{return {design:s.design,layers:s.layers,draftMask:s.draftMask,draftOps:s.draftOps,draftForeground:s.draftForeground,draftExtraction:s.draftExtraction,editingLayerId:s.editingLayerId,past:s.past,future:s.future,roi:s.roi,sample:s.sample};}
function allParts(s:SelectionState):Partial<Record<PartId,PartSession>>{return s.assetView?s.documents:{...s.documents,[s.activePart]:capturePart(s)};}
function assetDocument(s:SelectionState):PartSession{return s.assetView?capturePart(s):s.assetSession;}
function assetRegions(s:SelectionState){return s.assetView?s.regions:s.assetRegions;}
function graphicEntries(s:SelectionState):AssetEntry[]{
  const layers=assetDocument(s).layers,regions=assetRegions(s);
  return [...regions.map(r=>({id:r.id,name:r.name,type:r.type,bbox:r.bbox,transcription:r.transcription,verified:r.verified,layer:layers.find(l=>l.extraction?.regionId===r.id)})),...layers.filter(l=>!regions.some(r=>r.id===l.extraction?.regionId)).map(l=>({id:l.id,name:l.name,type:l.type,bbox:l.bounds,layer:l}))];
}
function defaultAssetSettings(entry:AssetEntry):AssetSettings{return {text:entry.transcription||'',instructions:'',size:entry.bbox.width>entry.bbox.height*1.6?'3072x2048':entry.bbox.height>entry.bbox.width*1.6?'2048x3072':'2048x2048'};}
function assetSettingsFor(s:SelectionState,entry:AssetEntry){return s.assetSettings[entry.id]||defaultAssetSettings(entry);}
function matchesVersion(version:AssetVersion|undefined,entry:AssetEntry,settings:AssetSettings){return !!version&&JSON.stringify(version.sourceRect)===JSON.stringify(entry.bbox)&&JSON.stringify(version.settings)===JSON.stringify(settings);}
function exportedAssetCount(s:SelectionState){return graphicEntries(s).filter(e=>e.layer||s.assetVariants[e.id]?.accepted).length;}
function updateAssetSession(update:(session:PartSession)=>PartSession){useDecomposition.setState(s=>{const session=update(assetDocument(s));return {assetSession:session,...(s.assetView?session:{})};});}
const workingImage = () => { const s=useEditorStore.getState();return useDecomposition.getState().referenceView?s.uploadedImageData:s.workingImageData ?? s.uploadedImageData; };
const workingPreview = () => { const s=useEditorStore.getState();return useDecomposition.getState().referenceView?s.previewImageData:s.workingPreview ?? s.previewImageData; };
let partController:AbortController|null=null;
let locateController:AbortController|null=null;
let assetController:AbortController|null=null;
let assetGenerationController:AbortController|null=null;
let jobEpoch=0;
type DetectedRegion = Omit<VisionElement, 'bbox'> & { bbox: Rect; manual: boolean; verified?:boolean; transcription?:string };
type RestoreMethod = 'local' | 'openai';
type RestoreResult = { image: ImageData; source: ImageData; method: RestoreMethod; layerIds: string[]; layerMasks: Array<{ id: string; mask: Uint8Array }>; model?: string; usage?: unknown; cached?: boolean; repairMask: Uint8Array; margin: number; localMode: string };
function restoreValid(result: RestoreResult | null, image: ImageData | null, layers: PrintLayer[]): result is RestoreResult {
  return !!result && result.source === image && result.layerMasks.length === layers.length && result.layerMasks.every(({ id, mask }) => layers.some(layer => layer.id === id && layer.mask === mask));
}
let restoreController: AbortController | null = null;
type AnalysisPayload = { data: VisionResult; model: string; usage: { input_tokens: number; output_tokens: number; total_tokens: number } | null };
const analysisCache = new Map<string, AnalysisPayload>();
let analysisController: AbortController | null = null;
let localSequence = 0;
function nextLocalId(prefix: string) { localSequence += 1; return `${prefix}-${localSequence}`; }

interface SelectionState {
  demoProject:{id:string;title:string;notes:string[];sourceArchiveSha256:string}|null;
  assetVerification:{candidates:number;confirmed:number;rejected:Array<{id:string;name:string;reason:string}>}|null;
  includeTiff:boolean;
  exportProgress:string;
  assetVariants:Record<string,AssetVariants>;
  assetSettings:Record<string,AssetSettings>;
  assetSelection:string[];
  assetGenerationBusy:boolean;
  assetGeneratingId:string|null;
  assetGenerationProgress:string;
  assetGenerationErrors:Record<string,string>;
  assetView:boolean;
  assetSession:PartSession;
  assetRegions:DetectedRegion[];
  assetAnalyzed:boolean;
  assetBusy:boolean;
  assetProgress:string;
  assetError:string;
  assetFailures:Record<string,string>;
  assetUsage:unknown;
  switchAssets:()=>void;
  jobBusy:boolean;
  jobMessage:string;
  jobError:string;
  locationUsage:unknown;

  activePart:PartId;
  documents:Partial<Record<PartId,PartSession>>;
  partSettings:Record<PartId,PartSettings>;
  partDrafts:Partial<Record<PartId,GeneratedPart>>;
  partStatus:Partial<Record<PartId,string>>;
  partErrors:Partial<Record<PartId,string>>;
  referenceView:boolean;
  activeGroupId:string|null;
  switchPart:(part:PartId)=>void;
  showSource:()=>void;
  configurePart:(part:PartId,settings:Partial<PartSettings>)=>void;
  groupLayers:(ids:string[])=>void;
  toggleGroup:(id:string)=>void;
  ungroup:(id:string)=>void;
  recolorLayer:(id:string,hex:string,stop?:0|1)=>void;

  design: DesignProject | null;
  roi: Rect | null;
  sample: { x: number; y: number } | null;
  mode: Mode;
  tolerance: number;
  layers: PrintLayer[];
  draftMask: Uint8Array | null;
  draftOps: string[];
  draftForeground: PrintLayer['foreground'];
  draftExtraction: PrintLayer['extraction'];
  segmentStatus: 'idle' | 'loading' | 'error';
  segmentError: string;
  segment: (image: ImageData, roi: Rect, mode: CvMode, create?: { id: string; name: string; type: PrintLayer['type'] }) => Promise<boolean>;
  editingLayerId: string | null;
  segmentationMode: SegmentationMode;
  additive: boolean;
  brushRadius: number;
  past: MaskSnapshot[];
  future: MaskSnapshot[];
  commitMask: (mask: Uint8Array, operation: string) => void;
  clearMask: () => void;
  newMask: () => void;
  moveLayer: (id: string, direction: number) => void;
  editLayer: (id: string) => void;
  saveLayer: (image: ImageData) => void;
  renameLayer: (id: string, name: string) => void;
  combineLayers: (ids: string[], image: ImageData) => void;
  setSegmentationMode: (mode: SegmentationMode) => void;
  setAdditive: (v: boolean) => void;
  setBrushRadius: (v: number) => void;
  undo: () => void;
  redo: () => void;
  preview: Preview;
  error: string;
  repairMargin: number;
  localMode: 'telea' | 'ns' | 'gradient';
  checkedLayers: string[];
  setCheckedLayers: (ids: string[] | ((previous: string[]) => string[])) => void;
  setRepairMargin: (value: number) => void;
  setLocalMode: (mode: 'telea' | 'ns' | 'gradient') => void;
  restoreProgress: string;
  restoreStatus: 'idle' | 'loading' | 'ready' | 'error';
  restoreError: string;
  proposal: RestoreResult | null;
  restored: RestoreResult | null;
  restore: (image: ImageData, ids: string[], method: RestoreMethod) => Promise<void>;
  acceptRestore: () => void;
  rejectRestore: () => void;
  regions: DetectedRegion[];
  selectedRegionId: string | null;
  analysis: AnalysisPayload | null;
  analysisStatus: 'idle' | 'loading' | 'success' | 'error';
  analysisError: string;
  cached: boolean;
  selectRegion: (id: string | null) => void;
  deleteRegion: (id: string) => void;
  addManualRegion: () => void;
  analyze: (image: ImageData) => Promise<void>;
  resetImage: () => void;
  setRoi: (rect: Rect) => void;
  setSample: (point: { x: number; y: number }) => void;
  setMode: (mode: Mode) => void;
  setTolerance: (tolerance: number) => void;
  setPreview: (preview: Preview) => void;
  setError: (error: string) => void;
  addLayer: (layer: PrintLayer) => void;
  toggleLayer: (id: string) => void;
  deleteLayer: (id: string) => void;
  reset: () => void;
}
const useDecomposition = create<SelectionState>((set) => ({
  demoProject:null,
  assetVerification:null,includeTiff:true,exportProgress:'',assetVariants:{},assetSettings:{},assetSelection:[],assetGenerationBusy:false,assetGeneratingId:null,assetGenerationProgress:'',assetGenerationErrors:{},
  assetView:false,assetSession:emptyPart(),assetRegions:[],assetAnalyzed:false,assetBusy:false,assetProgress:'',assetError:'',assetFailures:{},assetUsage:null,
  jobBusy:false,jobMessage:'',jobError:'',locationUsage:null,
  activePart:'front',documents:{},partSettings:defaultPartSettings(),partDrafts:{},partStatus:{},partErrors:{},referenceView:false,activeGroupId:null,
  design: null, roi: null, sample: null, mode: 'rect', tolerance: 38,
  layers: [], draftMask: null, draftOps: [], draftForeground: undefined, draftExtraction: undefined, segmentStatus: 'idle', segmentError: '', editingLayerId: null, segmentationMode: 'color', additive: true, brushRadius: 20, past: [], future: [], preview: 'sheet', error: '',
  repairMargin: 2, localMode: 'telea', checkedLayers: [], restoreProgress: '',
  restoreStatus: 'idle', restoreError: '', proposal: null, restored: null,
  regions: [], selectedRegionId: null, analysis: null, analysisStatus: 'idle', analysisError: '', cached: false,
  switchPart: part => {
    const current=useDecomposition.getState();if(part===current.activePart&&!current.assetView)return;
    analysisController?.abort();restoreController?.abort();
    const documents=allParts(current),next=documents[part]||emptyPart();
    set({...next,documents,...(current.assetView?{assetSession:capturePart(current),assetRegions:current.regions}:{}),assetView:false,activePart:part,referenceView:false,activeGroupId:null,mode:'rect',checkedLayers:[],regions:[],selectedRegionId:null,analysis:null,analysisStatus:'idle',analysisError:'',restoreStatus:'idle',restored:null,proposal:null,error:'',segmentStatus:'idle',segmentError:'',preview:next.design?'layers':'sheet'});
    useEditorStore.setState({workingImageData:next.design?.source||null,workingPreview:next.design?.source||null,colorLayers:next.design?paletteEntries(composeExtractedLayers(next.design.source,new ImageData(new Uint8ClampedArray(next.design.source.data.length),next.design.source.width,next.design.source.height),next.layers)):[]});
  },
  switchAssets:()=>{
    const current=useDecomposition.getState();if(current.assetView)return;
    analysisController?.abort();restoreController?.abort();
    set({...current.assetSession,documents:allParts(current),assetView:true,referenceView:false,activeGroupId:null,regions:current.assetRegions,selectedRegionId:null,checkedLayers:[],preview:'original',mode:'rect',analysis:null,analysisStatus:'idle',analysisError:'',restoreStatus:'idle',restored:null,proposal:null,error:'',segmentStatus:'idle',segmentError:''});
    useEditorStore.setState({workingImageData:null,workingPreview:null});
  },
  showSource:()=>set({referenceView:true,preview:'original',mode:'rect',error:''}),
  configurePart:(part,settings)=>set(s=>({partSettings:{...s.partSettings,[part]:{...s.partSettings[part],...settings}}})),
  groupLayers:ids=>set(s=>{
    if(!s.design||ids.length<2)return {};
    const id=nextLocalId('group'),group={id,name:`Група ${s.design.groups.length+1}`,visible:true};
    return {past:historyFor(s),future:[],layers:s.layers.map(l=>ids.includes(l.id)?{...l,groupId:id,groupHidden:false}:l),design:{...s.design,groups:[...s.design.groups,group]},checkedLayers:[]};
  }),
  toggleGroup:id=>set(s=>{
    const group=s.design?.groups.find(g=>g.id===id);if(!group||!s.design)return {};
    return {past:historyFor(s),future:[],design:{...s.design,groups:s.design.groups.map(g=>g.id===id?{...g,visible:!g.visible}:g)},layers:s.layers.map(l=>l.groupId===id?{...l,groupHidden:group.visible}:l)};
  }),
  ungroup:id=>set(s=>s.design?{past:historyFor(s),future:[],design:{...s.design,groups:s.design.groups.filter(g=>g.id!==id)},...(s.activeGroupId===id?{activeGroupId:null,preview:'layers' as Preview}:{}),layers:s.layers.map(l=>l.groupId===id?{...l,groupId:undefined,groupHidden:false}:l)}:{}),
  recolorLayer:(id,hex,stop)=>set(s=>{
    const layer=s.layers.find(l=>l.id===id);if(!layer||!s.design)return {};
    const pixels=maskedPixels(s.design.source,layer.mask,layer.bounds,layer.foreground),from=layer.recolorSource||paletteEntries(pixels)[0]?.hex||'#000000';
    const stops=layer.gradient?[...layer.gradient.stops] as [string,string]:undefined;if(stops&&stop!==undefined)stops[stop]=hex;
    const replacement=recolorPartLayer(layer,from,hex,stops);
    return {past:historyFor(s),future:[],layers:s.layers.map(l=>l.id===id?replacement:l),design:layer.type==='background'?{...s.design,baseHex:hex}:s.design,error:''};
  }),
  setRoi: roi => set(state => ({ roi, sample: null, mode: 'pick', error: '',
    regions: state.regions.map(region => region.id === state.selectedRegionId ? { ...region, bbox: roi,manual:true,verified:false } : region),
  })),
  selectRegion: id => set(state => {
    const region = state.regions.find(item => item.id === id);
    return { selectedRegionId: id, roi: region?.bbox ?? null, sample: null, preview: 'original', mode: region ? 'pick' : 'rect' };
  }),
  deleteRegion: id => set(state => ({ regions: state.regions.filter(item => item.id !== id),
    ...(state.selectedRegionId === id ? { selectedRegionId: null, roi: null, sample: null } : {}) })),
  addManualRegion: () => set(state => {
    if (!state.roi) return { error: 'Спочатку намалюйте область на полотні.' };
    const id = nextLocalId('manual');
    return { regions: [...state.regions, { id, name: 'Власна область', type: 'unknown', description: 'Область додана користувачем', confidence: 0, bbox: state.roi, manual: true }], selectedRegionId: id, error: '',...(state.assetView?{assetSelection:[...state.assetSelection,id].slice(0,8)}:{}) };
  }),
  resetImage: () => { assetGenerationController?.abort();assetGenerationController=null;assetController?.abort();assetController=null;jobEpoch++;locateController?.abort();locateController=null;partController?.abort();partController=null;analysisController?.abort(); analysisController = null; restoreController?.abort(); restoreController = null; set({demoProject:null,assetVerification:null,assetVariants:{},assetSettings:{},assetSelection:[],assetGenerationBusy:false,assetGeneratingId:null,assetGenerationProgress:'',assetGenerationErrors:{},assetView:false,assetSession:emptyPart(),assetRegions:[],assetAnalyzed:false,assetBusy:false,assetProgress:'',assetError:'',assetFailures:{},assetUsage:null,jobBusy:false,jobMessage:'',jobError:'',locationUsage:null,activePart:'front',documents:{},partSettings:defaultPartSettings(),partDrafts:{},partStatus:{},partErrors:{},referenceView:false,activeGroupId:null, design: null, checkedLayers: [], restoreProgress: '', draftForeground: undefined, draftExtraction: undefined, segmentStatus: 'idle', segmentError: '', restoreStatus: 'idle', restoreError: '', proposal: null, restored: null, roi: null, sample: null, mode: 'rect', layers: [], draftMask: null, draftOps: [], editingLayerId: null, past: [], future: [], preview: 'sheet', error: '', regions: [], selectedRegionId: null, analysis: null, analysisStatus: 'idle', analysisError: '', cached: false }); },
  analyze: async image => {
    if (useDecomposition.getState().analysisStatus === 'loading' || useDecomposition.getState().analysisStatus === 'success') return;
    const targetAssetView=useDecomposition.getState().assetView,targetPart=useDecomposition.getState().activePart;
    const stillCurrent=()=>workingImage()===image&&useDecomposition.getState().assetView===targetAssetView&&useDecomposition.getState().activePart===targetPart;
    const controller = new AbortController();
    analysisController = controller;
    set({ analysisStatus: 'loading', analysisError: '' });
    try {
      const preview = workingPreview();
      if (!preview) throw new Error('Прев’ю недоступне.');
      const canvas = document.createElement('canvas'); canvas.width = preview.width; canvas.height = preview.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Не вдалося підготувати зображення.');
      ctx.putImageData(preview, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Не вдалося підготувати PNG.')), 'image/png'));
      const hash = globalThis.crypto?.subtle ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('') : '';
      if (controller.signal.aborted || !stillCurrent()) return;
      let payload = hash ? analysisCache.get(hash) : undefined;
      const cached = !!payload;
      if (!payload) {
        const response = await studioRequest('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'image/png',...(targetAssetView?{'X-Analysis-Task':'artwork-elements'}:{}) }, body: blob, signal: controller.signal });
        const json = await response.json().catch(() => ({ error: `Сервер повернув некоректну відповідь (${response.status}).` }));
        if (!response.ok) throw new Error(json.error || `Помилка сервера (${response.status}).`);
        payload = json as AnalysisPayload;
        if (hash) { if (analysisCache.size >= 10) analysisCache.delete(analysisCache.keys().next().value!); analysisCache.set(hash, payload); }
      }
      if (controller.signal.aborted || !stillCurrent()) return;
      const regions = payload.data.elements.map(element => {
        const x = Math.min(image.width - 1, Math.max(0, Math.floor(element.bbox.x * image.width)));
        const y = Math.min(image.height - 1, Math.max(0, Math.floor(element.bbox.y * image.height)));
        const right = Math.min(image.width, Math.ceil((element.bbox.x + element.bbox.width) * image.width));
        const bottom = Math.min(image.height, Math.ceil((element.bbox.y + element.bbox.height) * image.height));
        return { ...element, id: `ai-${element.id}`, bbox: { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) }, manual: false };
      });
      set(state => ({ analysis: payload, regions: [...state.regions.filter(region => region.manual), ...regions], analysisStatus: 'success', cached,...(targetAssetView?{assetAnalyzed:true,assetRegions:regions,assetUsage:{model:payload!.model,usage:payload!.usage}}:{}) }));
    } catch (error) {
      if (!controller.signal.aborted && stillCurrent()) set({ analysisStatus: 'error', analysisError: error instanceof Error ? error.message : 'Помилка аналізу.' });
    } finally { if (analysisController === controller) analysisController = null; }
  },
  segment: async (image, roi, mode, create) => {
    if (useDecomposition.getState().segmentStatus === 'loading') return false;
    const targetPart=useDecomposition.getState().activePart,targetAssetView=useDecomposition.getState().assetView;
    set({ segmentStatus: 'loading', segmentError: '' });
    try {
      const {mask,bounds:layerBounds,foreground,extraction}=await segmentPixels(image,roi,mode,create?.id);
      if(workingImage()!==image||useDecomposition.getState().activePart!==targetPart||useDecomposition.getState().assetView!==targetAssetView)return false;
      if (create && extraction.metrics.coverage > 0.8) throw new Error(`${create.name}: виділено забагато фону, потрібна ручна перевірка.`);
      if (create) {
        const current = useDecomposition.getState();
        current.addLayer({ id: nextLocalId('layer'), name: create.name, type: create.type, source: 'estimated-foreground', foreground, extraction, mask, bounds: layerBounds, visible: true, order: Math.max(-1,...current.layers.map(layer => layer.order))+1, operations: [`OpenCV: ${extraction.method}`, 'оцінка альфи та очищення кольору країв'] });
        set({ segmentStatus: 'idle' });
      } else {
        set(state => ({ past: historyFor(state), future: [], draftMask: mask, draftForeground: foreground, draftExtraction: extraction, draftOps: [`OpenCV: ${extraction.method}`, 'оцінка альфи та очищення кольору країв'], preview: 'mask', segmentStatus: 'idle', error: '' }));
      }
      return true;
    } catch (error) { if(useDecomposition.getState().activePart===targetPart&&useDecomposition.getState().assetView===targetAssetView)set({ segmentStatus: 'error', segmentError: error instanceof Error ? error.message : 'Помилка виділення.' }); return false; }
  },
  restore: async (image, ids, method) => {
    if (useDecomposition.getState().restoreStatus === 'loading') return;
    const current = useDecomposition.getState(), chosen = ids.length ? current.layers.filter(layer => ids.includes(layer.id)) : current.layers;
    if (!chosen.length) { set({ restoreStatus: 'error', restoreError: 'Створіть хоча б один шар для видалення з фону.' }); return; }
    const layerMasks = current.layers.map(({ id, mask }) => ({ id, mask }));
    const mask = expandRepairMask(mergeMasks(chosen, image.width * image.height),image.width,image.height,current.repairMargin), bounds = maskBounds(mask, image.width, image.height);
    if (!bounds || !mask.some(value => value === 0)) { set({ restoreStatus: 'error', restoreError: 'Маска порожня або охоплює весь макет: потрібен навколишній фон.' }); return; }
    if (method==='openai' && chosen.length>10) { set({ restoreStatus:'error',restoreError:'Для AI оберіть до 10 шарів за один запуск.' });return; }
    const controller = new AbortController(); restoreController = controller;
    set({ restoreStatus: 'loading', restoreError: '', proposal: null });
    try {
      await new Promise(resolve => setTimeout(resolve, 0));
      let restored = image, model: string | undefined, cached = true; const usages: unknown[] = [];
      for(let index=0;index<chosen.length;index++) {
        if(controller.signal.aborted)return;
        set({restoreProgress:`Ділянка ${index+1} з ${chosen.length}: ${chosen[index].name}`});
        const repair=expandRepairMask(chosen[index].mask,image.width,image.height,current.repairMargin);
        if(method==='local') {
          const patch=await localCvRestore(restored,repair,current.localMode,controller.signal);
          restored=compositeMasked(restored,patch.image,repair,patch.bounds);
        } else {
          const crop = prepareInpaintRequest(restored, repair);
          const response = await studioRequest('/api/inpaint', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: crop.image, mask: crop.mask }), signal: controller.signal });
          const json = await response.json().catch(() => ({ error: `Некоректна відповідь сервера (${response.status}).` }));
          if (!response.ok) throw new Error(json.error || `Помилка сервера (${response.status}).`);
          if (typeof json.image !== 'string' || !json.image.startsWith('data:image/png;base64,')) throw new Error('OpenAI не повернув PNG.');
          const patch = await mapInpaintResult(json.image, crop);
          restored = compositeMasked(restored, patch, repair, crop.bounds);
          model = json.model; if(json.usage)usages.push(json.usage); cached = cached && !!json.cached;
        }
      }
      const usage=usages.length?usages:undefined;
      if (controller.signal.aborted) return;
      const result: RestoreResult = { image: restored, source: image, method, layerIds: chosen.map(layer => layer.id), layerMasks, model, usage, cached, repairMask:mask, margin:current.repairMargin, localMode:current.localMode };
      if (!restoreValid(result, workingImage(), useDecomposition.getState().layers)) throw new Error('Макет або шари змінилися під час відновлення. Повторіть операцію.');
      set({ proposal: result, restoreStatus: 'ready', preview: 'background' });
    } catch (error) {
      if (!controller.signal.aborted) set({ restoreStatus: 'error', restoreError: error instanceof Error ? error.message : 'Не вдалося відновити фон.' });
    } finally { if (restoreController === controller) restoreController = null; }
  },
  acceptRestore: () => set(state => state.proposal && restoreValid(state.proposal, workingImage(), state.layers) ? { restored: state.proposal, proposal: null, restoreStatus: 'idle', preview: 'background' } : { restoreStatus: 'error', restoreError: 'Шари змінилися. Повторіть відновлення.', proposal: null }),
  rejectRestore: () => set({ proposal: null, restoreStatus: 'idle', restoreError: '', preview: 'original' }),
  setCheckedLayers: ids => set(state=>({checkedLayers:typeof ids==='function'?ids(state.checkedLayers):ids})),
  setRepairMargin: repairMargin => set({repairMargin:Math.max(0,Math.min(8,Math.round(repairMargin)))}),
  setLocalMode: localMode => set({localMode}),
  setSample: sample => set({ sample, error: '' }),
  setMode: mode => set({ mode }),
  setTolerance: tolerance => set({ tolerance }),
  setPreview: preview => set({ preview,referenceView:false }),
  setError: error => set({ error }),
  setSegmentationMode: segmentationMode => set({ segmentationMode }),
  setAdditive: additive => set({ additive }),
  setBrushRadius: brushRadius => set({ brushRadius }),
  commitMask: (draftMask, operation) => set(state => ({ past: historyFor(state), future: [], draftMask, draftOps: [...state.draftOps, operation], preview: 'mask', error: '' })),
  clearMask: () => set(state => ({ past: historyFor(state), future: [], draftMask: null, draftOps: [], draftForeground: undefined, draftExtraction: undefined, error: '' })),
  newMask: () => set(state => ({ past: historyFor(state), future: [], draftMask: null, draftOps: [], draftForeground: undefined, draftExtraction: undefined, editingLayerId: null, sample: null, preview: 'mask' })),
  moveLayer: (id, direction) => set(state => {
    const layers = [...state.layers].sort((a, b) => a.order - b.order), i = layers.findIndex(layer => layer.id === id), target = i + direction;
    if(state.design&&(i===0||target===0))return {};
    if (i < 0 || target < 0 || target >= layers.length) return {};
    [layers[i], layers[target]] = [layers[target], layers[i]];
    return { past: historyFor(state), future: [], layers: layers.map((layer, order) => ({ ...layer, order })) };
  }),
  editLayer: id => set(state => {
    const layer = state.layers.find(item => item.id === id);
    return layer ? { referenceView:false, draftMask: layer.mask, draftOps: layer.operations, draftForeground: layer.foreground, draftExtraction: layer.extraction, editingLayerId: id, preview: 'mask', error: '' } : {};
  }),
  saveLayer: image => set(state => {
    if (!state.editingLayerId || !state.draftMask) return { error: 'Немає маски для збереження.' };
    if(state.design){
      try{return {past:historyFor(state),future:[],layers:updatePartMask(image,state.layers,state.editingLayerId,state.draftMask),error:''};}
      catch(e){return {error:e instanceof Error?e.message:'Помилка маски.'};}
    }
    const bounds = maskBounds(state.draftMask, image.width, image.height);
    if (!bounds) return { error: 'Маска порожня.' };
    return { past: historyFor(state), future: [], layers: state.layers.map(layer => layer.id === state.editingLayerId ? { ...layer, mask: state.draftMask!, bounds, operations: state.draftOps, foreground: state.draftForeground, extraction: state.draftExtraction, source: state.draftForeground ? 'estimated-foreground' : 'original' } : layer), error: '' };
  }),
  addLayer: layer => set(state => ({ past: historyFor(state), future: [], layers: [...state.layers, layer], draftMask: null, draftOps: [], draftForeground: undefined, draftExtraction: undefined, editingLayerId: null, sample: null, preview: 'layers' })),
  toggleLayer: id => set(state => ({ past: historyFor(state), future: [], layers: state.layers.map(layer => layer.id === id ? { ...layer, visible: !layer.visible } : layer) })),
  renameLayer: (id, name) => set(state => ({ past: historyFor(state), future: [], layers: state.layers.map(layer => layer.id === id ? { ...layer, name: name.trim().slice(0, 80) || layer.name } : layer) })),
  deleteLayer: id => set(state => ({ past: historyFor(state), future: [], layers: state.layers.filter(layer => layer.id !== id), ...(state.editingLayerId === id ? { draftMask: null, draftOps: [], draftForeground: undefined, draftExtraction: undefined, editingLayerId: null } : {}) })),
  combineLayers: (ids, image) => set(state => {
    if(state.design){try{return {past:historyFor(state),future:[],layers:mergePartPrints(image,state.layers,ids,nextLocalId('merged-print')),draftMask:null,draftOps:[],editingLayerId:null,draftForeground:undefined,draftExtraction:undefined,checkedLayers:[],error:''};}catch(e){return {error:e instanceof Error?e.message:'Помилка об’єднання.'};}}
    const chosen = state.layers.filter(layer => ids.includes(layer.id));
    if (chosen.length < 2) return {};
    const mask = mergeMasks(chosen, image.width * image.height), bounds = maskBounds(mask, image.width, image.height);
    if (!bounds) return {};
    const layer: PrintLayer = { id: nextLocalId('combined'), name: 'Об’єднаний елемент', type: 'unknown', source: chosen.some(layer=>layer.foreground) ? 'estimated-foreground' : 'original', foreground: mergedForeground(image,chosen,mask,bounds), bounds, mask, visible: true, order: Math.min(...chosen.map(item => item.order)), operations: [...new Set(chosen.flatMap(item => item.operations)), 'об’єднання шарів'] };
    return { past: historyFor(state), future: [], layers: [...state.layers.filter(item => !ids.includes(item.id)), layer].sort((a, b) => a.order - b.order), draftMask: null, draftOps: [], draftForeground: undefined, draftExtraction: undefined, editingLayerId: null };
  }),
  undo: () => set(state => {
    const previous = state.past[state.past.length - 1];
    return previous ? { ...previous, past: state.past.slice(0, -1), future: [...state.future, snapshot(state)], preview: 'mask' } : {};
  }),
  redo: () => set(state => {
    const next = state.future[state.future.length - 1];
    return next ? { ...next, past: historyFor(state), future: state.future.slice(0, -1), preview: 'mask' } : {};
  }),
  reset: () => set(state => ({ past: historyFor(state), future: [], roi: null, sample: null, mode: 'rect', layers: [], draftMask: null, draftOps: [], draftForeground: undefined, draftExtraction: undefined, editingLayerId: null, preview: 'original', error: '', selectedRegionId: null })),
}));

async function pngDataUrl(image: ImageData): Promise<string> {
  const bytes = await encodePng(image); let text = '';
  for (let i=0; i<bytes.length; i+=32768) text += String.fromCharCode(...bytes.subarray(i,i+32768));
  return `data:image/png;base64,${btoa(text)}`;
}
async function readPngPixels(url: string): Promise<ImageData> {
  const img = new Image(); await new Promise<void>((resolve,reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('Некоректний PNG результату.')); img.src = url; });
  const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas недоступний'); ctx.drawImage(img,0,0); return ctx.getImageData(0,0,canvas.width,canvas.height);
}

function maskImage(mask: Uint8Array,width:number,height:number): ImageData {
  const image=new ImageData(width,height);
  for(let p=0;p<mask.length;p++){image.data[p*4]=mask[p];image.data[p*4+1]=mask[p];image.data[p*4+2]=mask[p];image.data[p*4+3]=255;}
  return image;
}
async function localCvRestore(image:ImageData,mask:Uint8Array,mode:string,signal:AbortSignal):Promise<{image:ImageData;bounds:Rect}> {
  const region=maskBounds(mask,image.width,image.height);if(!region)throw new Error('Порожня зона відновлення.');
  const pad=Math.max(16,Math.ceil(Math.min(region.width,region.height)*.25));
  const x=Math.max(0,region.x-pad),y=Math.max(0,region.y-pad),bounds={x,y,width:Math.min(image.width,region.x+region.width+pad)-x,height:Math.min(image.height,region.y+region.height+pad)-y};
  if(bounds.width*bounds.height>4_194_304)throw new Error('Зменште область для локального відновлення.');
  const small=new Uint8Array(bounds.width*bounds.height);for(let yy=0;yy<bounds.height;yy++)for(let xx=0;xx<bounds.width;xx++)small[yy*bounds.width+xx]=mask[(yy+y)*image.width+xx+x];
  const [source,selection]=await Promise.all([pngDataUrl(maskedPixels(image,undefined,bounds)),pngDataUrl(maskImage(small,bounds.width,bounds.height))]);
  const response=await fetch('/api/cv',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'restore',image:source,mask:selection,mode}),signal});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Помилка локального відновлення.');
  const pixels=await readPngPixels(result.image);if(pixels.width!==bounds.width||pixels.height!==bounds.height)throw new Error('Розміри локального результату не збігаються.');
  return {image:pixels,bounds};
}

function imageToBytes(dataUrl: string): Uint8Array {
  const data = atob(dataUrl.split(',')[1] || '');
  const bytes = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
  return bytes;
}

function maskPng(mask: Uint8Array, width: number, bounds: Rect): string {
  const canvas = document.createElement('canvas'); canvas.width = bounds.width; canvas.height = bounds.height;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas недоступний');
  const pixels = ctx.createImageData(bounds.width, bounds.height);
  for (let y = 0; y < bounds.height; y++) for (let x = 0; x < bounds.width; x++) {
    const value = mask[(y + bounds.y) * width + x + bounds.x], i = (y * bounds.width + x) * 4;
    pixels.data[i] = value; pixels.data[i + 1] = value; pixels.data[i + 2] = value; pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0); return canvas.toDataURL('image/png');
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function getPoint(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement, width: number, height: number) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(width - 1, Math.floor((event.clientX - bounds.left) / bounds.width * width))),
    y: Math.max(0, Math.min(height - 1, Math.floor((event.clientY - bounds.top) / bounds.height * height))),
  };
}

function RasterPreview({ image, className = '' }: { image: ImageData; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d')?.putImageData(image,0,0);
  }, [image]);
  return <canvas ref={ref} className={`block w-full h-auto ${className}`} />;
}

function partComposition(document:PartSession):ImageData|null {
  if(!document.design)return null;const image=document.design.source;
  return composeExtractedLayers(image,new ImageData(new Uint8ClampedArray(image.data.length),image.width,image.height),document.layers);
}
function PartCard({part,document,settings,status,error}:{part:PartId;document?:PartSession;settings:PartSettings;status?:string;error?:string}) {
  const design=document?.design,layers=document?.layers;
  const image=useMemo(()=>design&&layers?composeExtractedLayers(design.source,new ImageData(new Uint8ClampedArray(design.source.data.length),design.source.width,design.source.height),layers):null,[design,layers]);
  const [width,height]=PART_SIZES[settings.aspect].split('x').map(Number);
  return <div data-part={part} className="min-w-0 rounded-lg border border-white/20 bg-[#202020] overflow-hidden">
    <div className="p-2 text-sm font-bold text-white">{PART_NAMES[part]}</div>
    <button onClick={()=>{useDecomposition.getState().switchPart(part);if(image)useDecomposition.getState().setPreview('layers');else useDecomposition.getState().showSource();}} className="checkerboard relative block w-full text-gray-300" style={{aspectRatio:image?`${image.width}/${image.height}`:`${width}/${height}`}}>
      {image?<RasterPreview image={image}/>:<span className="absolute inset-0 flex flex-col items-center justify-center p-3 bg-[#292929] text-xs"><span>{status||'Розгортку ще не створено'}</span><span className="mt-2 text-gray-500">Вибрати область ескізу</span></span>}
    </button>
    <div className="p-2 text-[10px] text-gray-400">{image?`${image.width} × ${image.height} px · ${document?.layers.length} шарів`:`Формат ${width} × ${height}`}</div>
    {status&&image&&<p className="px-2 text-[10px] text-red-200">{status}</p>}{error&&<p role="alert" className="px-2 text-[10px] text-orange-300">{error}</p>}
    <button onClick={()=>{useDecomposition.getState().switchPart(part);useDecomposition.getState().showSource();}} className="p-2 text-xs text-red-300 w-full">Область на ескізі</button>
  </div>;
}
function DesignSheet() {
  const state=useDecomposition(),documents=allParts(state);
  return <div className="p-5 overflow-auto flex-1"><h2 className="text-lg font-bold text-white">Чотири деталі форми</h2>
    <p className="text-xs text-gray-400 mt-1 mb-4">Кожен прямокутник — окрема деталь із власними шарами. Логотипи й написи вилучаються.</p>
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">{PART_IDS.map(part=><PartCard key={part} part={part} document={documents[part]} settings={state.partSettings[part]} status={state.partStatus[part]} error={state.partErrors[part]}/>)}</div>
    <p className="text-xs text-amber-200 mt-4">Пропорційні заготовки для накладання лекал. Невидимі ділянки реконструюються приблизно; стикування перевіряє конструктор.</p>
  </div>;
}
async function requestPart(stage:'flatten'|'separate',part:PartId,image:string,settings:PartSettings,signal:AbortSignal){
  const response=await studioRequest('/api/design',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stage,part,view:part,aspect:settings.aspect,instructions:settings.instructions,engine:settings.engine,image}),signal});
  const result=await response.json().catch(()=>({error:`Некоректна відповідь (${response.status}).`}));if(!response.ok)throw new PartRequestError(result.error||'Помилка генерації деталі.',response.status);
  if(result.part!==part)throw new Error('Сервер повернув іншу деталь. Результат відхилено.');return result;
}
class PartRequestError extends Error {
  constructor(message:string,public status:number){super(message);}
}
function cancelPartJob(){
  jobEpoch++;locateController?.abort();partController?.abort();assetController?.abort();assetGenerationController?.abort();
  useDecomposition.setState(s=>({jobBusy:false,jobMessage:'Обробку зупинено. Створені деталі збережено.',...(s.assetGenerationBusy?{assetGenerationProgress:'AI-відтворення зупинено. Пропозиції збережено.'}:{})}));
}
async function runParts(){
  const original=useEditorStore.getState().uploadedImageData,state=useDecomposition.getState();
  if(!original||state.jobBusy||partController||locateController)return;
  const pending=PART_IDS.filter(id=>!allParts(state)[id]?.design);
  if(!pending.length)return;
  const epoch=++jobEpoch;
  const current=()=>jobEpoch===epoch&&useEditorStore.getState().uploadedImageData===original;
  useDecomposition.setState({jobBusy:true,jobError:'',jobMessage:'Визначаємо перед, спинку та рукави…'});
  try{
    await extractOriginalAssets();
    if(!current())return;
    const assetError=useDecomposition.getState().assetError;
    if(/OPENAI_API_KEY|авторизац|401|quota|rate limit/i.test(assetError))throw new Error(assetError);
    if(pending.some(id=>!state.partSettings[id].sourceRect&&!state.partDrafts[id])){
      const controller=new AbortController();locateController=controller;
      try{
        const url=await partReference(original,null);
        const response=await studioRequest('/api/analyze',{method:'POST',headers:{'Content-Type':'image/png','X-Analysis-Task':'garment-parts'},body:imageToBytes(url) as BodyInit,signal:controller.signal});
        const result=await response.json().catch(()=>({error:`Некоректна відповідь (${response.status}).`}));
        if(!response.ok)throw new PartRequestError(result.error||'Не вдалося визначити деталі.',response.status);
        const locations=validatePartLocations(result.data);
        if(!current())return;
        useDecomposition.setState({locationUsage:result.usage??null});
        for(const item of locations.parts){
          const latest=useDecomposition.getState();
          if(!pending.includes(item.part)||latest.partSettings[item.part].sourceRect||latest.partDrafts[item.part])continue;
          if(!item.bbox){partProgress(item.part,'',`Не знайдено на ескізі. ${item.reason} Позначте область у «Інструментах».`);continue;}
          const {x,y,width,height}=item.bbox;
          latest.configurePart(item.part,{sourceRect:normalizeRect({x:Math.floor(x*original.width),y:Math.floor(y*original.height),width:Math.ceil(width*original.width),height:Math.ceil(height*original.height)},original.width,original.height)});
        }
      }finally{if(locateController===controller)locateController=null;}
    }
    for(const [index,part] of pending.entries()){
      if(!current())return;
      const latest=useDecomposition.getState();
      if(!latest.partSettings[part].sourceRect&&!latest.partDrafts[part])continue;
      useDecomposition.setState({jobMessage:`${PART_NAMES[part]} · деталь ${index+1} із ${pending.length}`});
      const generated=!!latest.partDrafts[part]||await generatePart(part);
      if(!current())return;
      if(generated)await separatePart(part);
      if(!current())return;
      const error=useDecomposition.getState().partErrors[part]||'';
      if(/ліміт|OPENAI_API_KEY|авторизац|401|quota|rate limit/i.test(error))throw new Error(error);
    }
    if(current()){
      const count=PART_IDS.filter(id=>allParts(useDecomposition.getState())[id]?.design).length;
      useDecomposition.setState({jobMessage:count===4?'Усі чотири деталі створено.':`Створено ${count} із 4 деталей. Інші потребують уваги.`});
    }
  }catch(e){if(current())useDecomposition.setState({jobError:e instanceof Error?e.message:'Не вдалося обробити макет.',jobMessage:''});}
  finally{if(current())useDecomposition.setState({jobBusy:false});}
}
async function partReference(original:ImageData,rect:Rect|null,maxEdge=1536):Promise<string>{
  const pixels=rect?maskedPixels(original,undefined,normalizeRect(rect,original.width,original.height)):original;
  const source=document.createElement('canvas');source.width=pixels.width;source.height=pixels.height;source.getContext('2d')!.putImageData(pixels,0,0);
  const scale=Math.min(1,maxEdge/Math.max(pixels.width,pixels.height)),preview=document.createElement('canvas');preview.width=Math.max(1,Math.round(pixels.width*scale));preview.height=Math.max(1,Math.round(pixels.height*scale));
  const ctx=preview.getContext('2d')!;ctx.drawImage(source,0,0,preview.width,preview.height);source.width=1;return pngDataUrl(ctx.getImageData(0,0,preview.width,preview.height));
}
function partProgress(part:PartId,status:string,error=''){useDecomposition.setState(s=>({partStatus:{...s.partStatus,[part]:status},partErrors:{...s.partErrors,[part]:error}}));}
async function segmentPixels(image:ImageData,roi:Rect,mode:CvMode,regionId?:string,signal?:AbortSignal){
  const selected=normalizeRect(roi,image.width,image.height),pad=Math.max(12,Math.ceil(Math.min(selected.width,selected.height)*.12));
  const x=Math.max(0,selected.x-pad),y=Math.max(0,selected.y-pad);
  const bounds={x,y,width:Math.min(image.width,selected.x+selected.width+pad)-x,height:Math.min(image.height,selected.y+selected.height+pad)-y};
  if(bounds.width*bounds.height>4_194_304)throw new Error('Оберіть область одного елемента до 4 мегапікселів.');
  const input=await pngDataUrl(maskedPixels(image,undefined,bounds));
  const response=await fetch('/api/cv',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'segment',image:input,box:[selected.x-x,selected.y-y,selected.width,selected.height],mode}),signal});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Не вдалося виділити елемент.');
  const [colors,matte]=await Promise.all([readPngPixels(result.foreground),readPngPixels(result.mask)]);
  if([colors,matte].some(p=>p.width!==bounds.width||p.height!==bounds.height))throw new Error('Розміри результату CV не збігаються.');
  const mask=new Uint8Array(image.width*image.height);
  for(let yy=0;yy<bounds.height;yy++)for(let xx=0;xx<bounds.width;xx++)mask[(yy+y)*image.width+xx+x]=matte.data[(yy*bounds.width+xx)*4];
  const layerBounds=maskBounds(mask,image.width,image.height);if(!layerBounds)throw new Error('Маска порожня. Уточніть область або режим виділення.');
  return {mask,bounds:layerBounds,foreground:{image:colors,bounds},extraction:{regionId,method:String(result.mode),warnings:result.warnings as string[],metrics:result.metrics as Record<string,number>}};
}
async function extractOriginalAssets(local=false){
  const original=useEditorStore.getState().uploadedImageData;if(!original||assetController)return;
  const controller=new AbortController();assetController=controller;
  const current=()=>!controller.signal.aborted&&useEditorStore.getState().uploadedImageData===original;
  useDecomposition.setState({assetBusy:true,assetError:'',assetProgress:'Знаходимо герби, логотипи, номери й написи на оригіналі…'});
  try{
    if(!useDecomposition.getState().assetAnalyzed&&!(local&&assetRegions(useDecomposition.getState()).length)){
      const response=await studioRequest('/api/analyze',{method:'POST',headers:{'Content-Type':'image/png','X-Analysis-Task':'artwork-elements'},body:imageToBytes(await partReference(original,null,2048)) as BodyInit,signal:controller.signal});
      const result=await response.json().catch(()=>({error:`Некоректна відповідь (${response.status}).`}));
      if(!response.ok)throw new Error(result.error||'Не вдалося знайти елементи.');
      // The same validated schema as the manual Vision tool; never treat boxes as masks.
      const data=validateVisionResult(result.data);
      if(!current())return;
      const regions:DetectedRegion[]=data.elements.filter(isGarmentArtwork).slice(0,20).map(e=>({...e,id:`asset-${e.id}`,manual:false,verified:result.verifiedIds?.includes(e.id)??false,transcription:result.transcriptions?.[e.id]||'',bbox:normalizeRect({x:Math.floor(e.bbox.x*original.width),y:Math.floor(e.bbox.y*original.height),width:Math.ceil(e.bbox.width*original.width),height:Math.ceil(e.bbox.height*original.height)},original.width,original.height)}));
      useDecomposition.setState(s=>{const manual=assetRegions(s).filter(r=>r.manual),combined=[...manual,...regions.filter(r=>!manual.some(m=>m.id===r.id))];return {assetVerification:result.verification??null,assetAnalyzed:true,assetRegions:combined,assetSelection:combined.slice(0,8).map(r=>r.id),...(s.assetView?{regions:combined}:{}),assetUsage:{model:result.model,usage:result.usage??null}};});
    }
    const regions=assetRegions(useDecomposition.getState()),failures:Record<string,string>={};
    if(!local){useDecomposition.setState({assetProgress:regions.length?`Знайдено ${regions.length} елементів. Виберіть потрібні й запустіть AI-відтворення.`:'Елементів не знайдено. Додайте область вручну.'});return;}
    for(const [index,region] of regions.entries()){
      if(!current())return;
      if(assetDocument(useDecomposition.getState()).layers.some(l=>l.extraction?.regionId===region.id))continue;
      useDecomposition.setState({assetProgress:`Витягуємо пікселі: ${index+1}/${regions.length} · ${region.name}`});
      try{
        const result=await segmentPixels(original,region.bbox,'auto',region.id,controller.signal);
        if(!current())return;
        if(result.extraction.metrics.coverage>.8)throw new Error('Забагато фону у масці. Уточніть область або виправте пензлем.');
        updateAssetSession(session=>({...session,layers:[...session.layers,{...result,id:nextLocalId('asset'),name:region.name,type:region.type,source:'estimated-foreground',visible:true,order:Math.max(-1,...session.layers.map(l=>l.order))+1,operations:['Виділено з оригіналу через OpenCV','Оцінка альфи й очищення кольору країв; без генерації елемента']}],future:[]}));
      }catch(e){if(!current())return;failures[region.id]=e instanceof Error?e.message:'Потрібна ручна корекція.';}
    }
    if(current())useDecomposition.setState({assetFailures:failures,assetProgress:regions.length?`Витягнуто ${assetDocument(useDecomposition.getState()).layers.length} елементів.${Object.keys(failures).length?' Частина областей потребує ручного виділення.':''}`:'На ескізі не знайдено гербів, написів чи номерів. Можна додати область вручну.'});
  }catch(e){if(current())useDecomposition.setState({assetError:e instanceof Error?e.message:'Помилка виділення елементів.',assetProgress:''});}
  finally{if(assetController===controller){assetController=null;useDecomposition.setState({assetBusy:false});}}
}
async function reconstructAssets(ids:string[]){
  const initial=useDecomposition.getState(),original=useEditorStore.getState().uploadedImageData;
  if(!original||assetGenerationController||initial.jobBusy||partController)return;
  const chosen=graphicEntries(initial).filter(e=>ids.includes(e.id));
  if(!chosen.length)return;
  if(chosen.length>8){useDecomposition.setState({assetGenerationProgress:'Оберіть до 8 елементів за один платний запуск.'});return;}
  const controller=new AbortController();assetGenerationController=controller;
  const current=()=>!controller.signal.aborted&&useEditorStore.getState().uploadedImageData===original;
  useDecomposition.setState({assetGenerationBusy:true,assetError:'',assetGenerationProgress:'Готуємо референси…'});
  try{
    for(const [index,entry]of chosen.entries()){
      if(!current())return;
      const state=useDecomposition.getState(),settings={...assetSettingsFor(state,entry)},existing=state.assetVariants[entry.id];
      if(matchesVersion(existing?.proposal,entry,settings)||matchesVersion(existing?.accepted,entry,settings))continue;
      useDecomposition.setState(s=>({assetGeneratingId:entry.id,assetGenerationErrors:{...s.assetGenerationErrors,[entry.id]:''},assetGenerationProgress:`AI-відтворення ${index+1}/${chosen.length} · ${entry.name} · 2K може тривати кілька хвилин`}));
      try{
        const pad=Math.max(24,Math.ceil(Math.max(entry.bbox.width,entry.bbox.height)*.9)),left=Math.max(0,entry.bbox.x-pad),top=Math.max(0,entry.bbox.y-pad);
        const context=normalizeRect({x:left,y:top,width:Math.min(original.width,entry.bbox.x+entry.bbox.width+pad)-left,height:Math.min(original.height,entry.bbox.y+entry.bbox.height+pad)-top},original.width,original.height);
        const image=await partReference(original,context,2048);
        const response=await studioRequest('/api/assets/reconstruct',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,bbox:{x:(entry.bbox.x-context.x)/context.width,y:(entry.bbox.y-context.y)/context.height,width:entry.bbox.width/context.width,height:entry.bbox.height/context.height},name:entry.name,type:entry.type==='background'?'unknown':entry.type,...settings}),signal:controller.signal});
        const result=await response.json().catch(()=>({error:`Некоректна відповідь (${response.status}).`}));
        if(!response.ok)throw new PartRequestError(result.error||'Помилка AI-відтворення.',response.status);
        const pixels=await readPngPixels(result.image),[width,height]=settings.size.split('x').map(Number);
        if(pixels.width!==width||pixels.height!==height||result.reconstruction!==true)throw new Error('Сервер повернув невідповідний результат.');
        if(!current())return;
        if(!graphicEntries(useDecomposition.getState()).some(e=>e.id===entry.id))continue;
        const proposal:AssetVersion={image:pixels,png:imageToBytes(result.image),sourceRect:{...entry.bbox},model:result.model,usage:result.usage??null,cached:!!result.cached,settings};
        useDecomposition.setState(s=>({assetVariants:{...s.assetVariants,[entry.id]:{...s.assetVariants[entry.id],proposal}}}));
      }catch(e){
        if(!current())return;
        useDecomposition.setState(s=>({assetGenerationErrors:{...s.assetGenerationErrors,[entry.id]:e instanceof Error?e.message:'Помилка відтворення.'}}));
        if(e instanceof PartRequestError&&[401,429,503].includes(e.status))break;
      }
    }
    if(current()){
      const latest=useDecomposition.getState(),ready=chosen.filter(e=>latest.assetVariants[e.id]?.proposal||latest.assetVariants[e.id]?.accepted).length;
      useDecomposition.setState({assetGenerationProgress:ready?`Готових варіантів: ${ready}/${chosen.length}. Перегляньте й прийміть потрібні. Неприйняті варіанти не експортуються.`:'Відтворення не завершилося успішно. Перевірте помилки на картках; готові зображення не підставляються.'});
    }
  }catch(e){if(current())useDecomposition.setState({assetGenerationProgress:e instanceof Error?e.message:'Не вдалося підготувати відтворення.'});}
  finally{if(assetGenerationController===controller){assetGenerationController=null;useDecomposition.setState({assetGenerationBusy:false,assetGeneratingId:null});}}
}
async function generatePart(part:PartId):Promise<boolean>{
  const original=useEditorStore.getState().uploadedImageData,settings={...useDecomposition.getState().partSettings[part]};if(!original||partController)return false;
  if(part.includes('sleeve')&&!settings.sourceRect){partProgress(part,'','Позначте область саме цього рукава на ескізі. Правий і лівий визначаються відносно людини у формі.');return false;}
  const controller=new AbortController();partController=controller;partProgress(part,'Генерується розгортка без написів…');
  try{
    const result=await requestPart('flatten',part,await partReference(original,settings.sourceRect,settings.aspect.endsWith('-2k')?2048:1536),settings,controller.signal),image=await readPngPixels(result.image);
    if(controller.signal.aborted||useEditorStore.getState().uploadedImageData!==original)return false;
    useDecomposition.setState(s=>({partDrafts:{...s.partDrafts,[part]:{image,url:result.image,model:result.model,usage:result.usage,cached:result.cached,settings}}}));return true;
  }catch(e){if(!controller.signal.aborted)partProgress(part,'',e instanceof Error?e.message:'Помилка генерації.');return false;}
  finally{if(partController===controller){partController=null;useDecomposition.setState(s=>({partStatus:{...s.partStatus,[part]:''}}));}}
}
async function separatePart(part:PartId):Promise<void>{
  const original=useEditorStore.getState().uploadedImageData,draft=useDecomposition.getState().partDrafts[part];if(!draft||partController)return;
  const controller=new AbortController();partController=controller;partProgress(part,'Розподіляються кольорові принти та градієнти…');
  try{
    const result=await requestPart('separate',part,draft.url,draft.settings,controller.signal),map=await readPngPixels(result.image);
    let classes=classifyPart(draft.image,map),master=draft.image;const warnings=['Розгортка та продовження невидимих ділянок є реконструкцією.'];let removedMask:Uint8Array|undefined;
    const marks=Uint8Array.from(classes,value=>value===7?255:0);
    if(marks.some(Boolean)){
      partProgress(part,'Вилучаються залишкові логотипи та написи…');removedMask=expandRepairMask(marks,master.width,master.height,4);
      const patch=await localCvRestore(master,removedMask,'telea',controller.signal);master=compositeMasked(master,patch.image,removedMask,patch.bounds);classes=relabelRemoved(classes,master.width,master.height);
      warnings.push('Під залишковими написами принт відновлено локально; перевірте ці місця.');
    }
    classes=unifyContinuousGradient(master,classes);
    if(!classes.some(value=>value===0))warnings.push('Принт закриває всю деталь: колір прихованої основи оцінено. За потреби задайте його з палітри.');
    const baseHex=partBaseColor(master,classes);master=normalizePartBase(master,classes,baseHex);const layers=createPartLayers(master,classes,baseHex);
    if(controller.signal.aborted||useEditorStore.getState().uploadedImageData!==original)return;
    const design:DesignProject={source:master,sourceUrl:draft.url,labelMap:result.image,model:draft.model,usage:[draft.usage,result.usage],baseHex,instructions:draft.settings.instructions,view:part,aspect:draft.settings.aspect,warnings,groups:[],referenceRect:draft.settings.sourceRect,removedMask};
    const current=useDecomposition.getState(),documents=allParts(current),session={...emptyPart(),design,layers};documents[part]=session;
    const drafts={...current.partDrafts};delete drafts[part];
    useDecomposition.setState({...(!current.assetView&&current.activePart===part?session:{}),documents,partDrafts:drafts,...(!current.assetView&&current.activePart===part?{referenceView:false,preview:'sheet',error:''}:{})});
    if(!current.assetView&&current.activePart===part)useEditorStore.setState({workingImageData:master,workingPreview:master,colorLayers:paletteEntries(master)});
  }catch(e){if(!controller.signal.aborted)partProgress(part,'',e instanceof Error?e.message:'Помилка поділу.');}
  finally{if(partController===controller){partController=null;useDecomposition.setState(s=>({partStatus:{...s.partStatus,[part]:''}}));}}
}
function DesignControls(){
  const state=useDecomposition(),part=state.activePart,settings=state.partSettings[part],draft=state.partDrafts[part],busy=state.jobBusy||Object.values(state.partStatus).some(Boolean);
  const original=useEditorStore(s=>s.uploadedImageData);
  return <div className="p-3 space-y-2 rounded-lg border border-red-700/60 bg-[#191919]">
    <h2 className="font-bold text-sm">Деталь → розгортка → шари принта</h2>
    <div className="grid grid-cols-2 gap-1">{PART_IDS.map(id=><button key={id} onClick={()=>state.switchPart(id)} className={`p-2 rounded text-xs ${id===part?'bg-red-700':'bg-white/10'}`}>{PART_NAMES[id]}</button>)}</div>
    <p className="text-[10px] text-gray-400">Рукави позначено відносно людини у формі. Кожна деталь має окремі пропорції, шари й історію.</p>
    <button onClick={state.showSource} disabled={!original} className="w-full rounded bg-white/10 p-2 text-xs disabled:opacity-40">Позначити {PART_NAMES[part].toLowerCase()} на ескізі</button>
    {settings.sourceRect&&<p className="text-[10px] text-gray-300">Область: {settings.sourceRect.x}, {settings.sourceRect.y} · {settings.sourceRect.width} × {settings.sourceRect.height}px <button disabled={busy} className="text-red-300" onClick={()=>state.configurePart(part,{sourceRect:null})}>Скинути</button></p>}
    <select aria-label="Формат деталі" disabled={busy} value={settings.aspect} onChange={e=>state.configurePart(part,{aspect:e.target.value as PartAspect})} className="w-full bg-[#303030] rounded p-2 text-xs">{Object.entries(PART_SIZES).map(([aspect,size])=><option key={aspect} value={aspect}>{size.replace('x',' × ')}{aspect==='sleeve'?' · вузька деталь':''}</option>)}</select>
    <select aria-label="AI-модель дизайну" disabled={busy} value={settings.engine} onChange={e=>state.configurePart(part,{engine:e.target.value as PartSettings['engine']})} className="w-full bg-[#303030] rounded p-2 text-xs"><option value="default">Модель із налаштувань сервера</option><option value="fast">Flare · швидше</option><option value="precise">Sunburst · точніше</option></select>
    <textarea aria-label="Вказівки до деталі" disabled={busy} maxLength={1500} value={settings.instructions} onChange={e=>state.configurePart(part,{instructions:e.target.value})} placeholder="Напрямок і масштаб візерунка, що потрібно продовжити…" className="w-full bg-[#303030] rounded p-2 text-xs" rows={2}/>
    <button onClick={()=>void generatePart(part)} disabled={!original||busy} className="w-full p-2 rounded bg-red-700 text-xs font-bold disabled:opacity-40">1. Розгорнути деталь без написів</button>
    {draft&&<div className="space-y-2"><RasterPreview image={draft.image}/><p className="text-[10px] text-amber-200">Пропозиція для «{PART_NAMES[part]}». Перевірте напрямок, масштаб принта та відсутність написів.{draft.cached?' Із кешу.':''}</p><button disabled={busy} onClick={()=>void separatePart(part)} className="w-full p-2 rounded bg-red-700 text-xs font-bold disabled:opacity-40">2. Прийняти й розділити принти</button><button disabled={busy} onClick={()=>useDecomposition.setState(s=>({partDrafts:{...s.partDrafts,[part]:undefined}}))} className="w-full text-xs text-gray-300 disabled:opacity-40">Відхилити розгортку</button></div>}
    {state.partStatus[part]&&<p role="status" className="text-xs text-red-200">{state.partStatus[part]}</p>}{state.partErrors[part]&&<p role="alert" className="text-xs text-orange-300">{state.partErrors[part]}</p>}
    <button onClick={()=>state.setPreview('sheet')} className="w-full rounded bg-white/10 p-2 text-xs">Усі 4 деталі</button>
    {state.design&&<><button onClick={()=>state.setPreview('layers')} className="w-full rounded bg-white/10 p-2 text-xs">Композиція цієї деталі</button>{state.design.warnings.map(w=><p key={w} className="text-[10px] text-amber-200">{w}</p>)}<details className="text-[10px] text-gray-400"><summary>Модель та використання API</summary><pre className="whitespace-pre-wrap break-all">{state.design.model}{'\n'}{JSON.stringify(state.design.usage,null,2)}</pre></details></>}
    {state.locationUsage!=null&&<details className="text-[10px] text-gray-400"><summary>Використання API для визначення деталей</summary><pre className="whitespace-pre-wrap">{JSON.stringify(state.locationUsage,null,2)}</pre></details>}
    <p className="text-[10px] text-gray-500">Кожен етап — окремий платний запит за натисканням. Основа й принти розділяються всередині вибраної деталі; градієнти зберігаються цілісними.</p>
  </div>;
}

export function DecompositionCanvas() {
  const state = useDecomposition();
  const image = useEditorStore(s => state.referenceView?s.uploadedImageData:s.workingImageData ?? s.uploadedImageData);
  const previewImage = useEditorStore(s => state.referenceView?s.previewImageData:s.workingPreview ?? s.previewImageData);
  const zoom = useEditorStore(s => s.zoom);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const feedbackRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const stroke = useRef<{ mask: Uint8Array; last: { x: number; y: number } } | null>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [dragRect, setDragRect] = useState<Rect | null>(null);
  const [surface, setSurface] = useState('checkerboard');
  const [viewportSize,setViewportSize]=useState({width:600,height:600});
  useEffect(()=>{
    const viewport=viewportRef.current;if(!viewport)return;
    const observer=new ResizeObserver(([entry])=>setViewportSize({width:entry.contentRect.width,height:entry.contentRect.height}));
    observer.observe(viewport);return ()=>observer.disconnect();
  },[state.preview,image]);

  useEffect(() => {
    if (originalCanvasRef.current) { originalCanvasRef.current.width = 1; originalCanvasRef.current = null; }
  }, [image]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      if (event.shiftKey) useDecomposition.getState().redo(); else useDecomposition.getState().undo();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);
  const repairPreview = useMemo(() => image && state.preview==='repair'
    ? expandRepairMask(mergeMasks(state.checkedLayers.length ? state.layers.filter(layer=>state.checkedLayers.includes(layer.id)) : state.layers,image.width*image.height),image.width,image.height,state.repairMargin) : null,
    [image,state.preview,state.layers,state.checkedLayers,state.repairMargin]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!image || !previewImage || !canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const scale = Math.min(1, previewImage.width / image.width * Math.max(1, zoom / 100));
    const width = Math.max(1, Math.round(image.width * scale)), height = Math.max(1, Math.round(image.height * scale));
    canvas.width = width; canvas.height = height;
    if (zoom > 100 && scale > previewImage.width / image.width) {
      if (!originalCanvasRef.current) {
        const originalCanvas = document.createElement('canvas'); originalCanvas.width = image.width; originalCanvas.height = image.height;
        originalCanvas.getContext('2d')?.putImageData(image, 0, 0); originalCanvasRef.current = originalCanvas;
      }
      ctx.drawImage(originalCanvasRef.current, 0, 0, width, height);
    } else {
      if (originalCanvasRef.current) { originalCanvasRef.current.width = 1; originalCanvasRef.current = null; }
      ctx.putImageData(previewImage, 0, 0);
    }

    if(state.referenceView){if(feedbackRef.current){feedbackRef.current.width=width;feedbackRef.current.height=height;}return;}
    const sampledMask = (source: Uint8Array) => {
      const small = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const ox = Math.min(image.width - 1, Math.floor((x + 0.5) * image.width / width));
        const oy = Math.min(image.height - 1, Math.floor((y + 0.5) * image.height / height));
        small[y * width + x] = source[oy * image.width + ox];
      }
      return small;
    };
    const reconstruction = state.proposal ?? state.restored;
    if (state.preview === 'background' && restoreValid(reconstruction, image, state.layers)) {
      const restoredCanvas = document.createElement('canvas'); restoredCanvas.width = image.width; restoredCanvas.height = image.height;
      restoredCanvas.getContext('2d')?.putImageData(reconstruction.image, 0, 0);
      ctx.clearRect(0, 0, width, height); ctx.drawImage(restoredCanvas, 0, 0, width, height); restoredCanvas.width = 1;
    } else {
      if (state.preview === 'layers' || state.preview === 'layer' || state.preview==='group') {
        ctx.clearRect(0,0,width,height);
        const draw = (mask:Uint8Array,bounds:Rect,foreground:PrintLayer['foreground']) => {
          const pixels=maskedPixels(image,mask,bounds,foreground),tile=document.createElement('canvas');tile.width=pixels.width;tile.height=pixels.height;
          tile.getContext('2d')?.putImageData(pixels,0,0);ctx.drawImage(tile,bounds.x*width/image.width,bounds.y*height/image.height,bounds.width*width/image.width,bounds.height*height/image.height);tile.width=1;
        };
        if(state.preview==='layers'||state.preview==='group')for(const layer of state.layers.filter(layer=>state.preview==='group'?layer.groupId===state.activeGroupId&&layer.visible:layer.visible&&!layer.groupHidden).sort((a,b)=>a.order-b.order))draw(layer.mask,layer.bounds,layer.foreground);
        else if(state.draftMask){const bounds=maskBounds(state.draftMask,image.width,image.height);if(bounds)draw(state.draftMask,bounds,state.draftForeground);}
      }
      const displayedMask=state.preview==='repair'?repairPreview:state.preview==='mask'?state.draftMask:null;
      if (displayedMask) {
        const small = sampledMask(displayedMask), highlight = ctx.createImageData(width, height);
        for (let p = 0; p < small.length; p++) if (small[p]) {
          highlight.data[p * 4] = 249; highlight.data[p * 4 + 1] = state.preview==='repair'?180:25; highlight.data[p * 4 + 2] = 58; highlight.data[p * 4 + 3] = Math.round(small[p] * 0.5);
        }
        const overlay = document.createElement('canvas'); overlay.width = width; overlay.height = height;
        overlay.getContext('2d')?.putImageData(highlight, 0, 0); ctx.drawImage(overlay, 0, 0);
      }
    }
    const feedback = feedbackRef.current;
    if (feedback) { feedback.width = width; feedback.height = height; }
  }, [image, previewImage, state.preview, state.layers, state.draftMask, state.draftForeground, state.editingLayerId, state.proposal, state.restored, repairPreview, zoom, state.referenceView, state.activeGroupId]);

  if (!image || !previewImage) return <div className="flex h-full items-center justify-center bg-[#303030] text-gray-300 text-sm">Завантажте JPEG або PNG, щоб розпочати декомпозицію.</div>;
  const width = image.width, height = image.height;
  const activeRect = dragRect ?? (state.referenceView?state.partSettings[state.activePart].sourceRect:state.roi);
  const rect = state.roi ?? { x: 0, y: 0, width, height };
  const applyMask = (candidate: Uint8Array, operation: string) => {
    const mask = state.additive && state.draftMask ? mergeMasks([{ mask: state.draftMask }, { mask: candidate }], width * height) : candidate;
    state.commitMask(mask, operation);
  };
  const finishDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pan.current) { pan.current = null; return; }
    if (stroke.current) {
      state.commitMask(stroke.current.mask, state.mode === 'brush-add' ? 'ручне додавання пензлем' : 'ручне стирання пензлем');
      stroke.current = null; const feedback = feedbackRef.current; feedback?.getContext('2d')?.clearRect(0, 0, feedback.width, feedback.height); return;
    }
    if (!start.current || state.mode !== 'rect') return;
    const p = getPoint(event, event.currentTarget, width, height);
    const x = Math.min(start.current.x, p.x), y = Math.min(start.current.y, p.y);
    const w = Math.abs(start.current.x - p.x) + 1, h = Math.abs(start.current.y - p.y) + 1;
    const selected = w < 4 || h < 4 ? { x: 0, y: 0, width, height } : normalizeRect({ x, y, width: w, height: h }, width, height);
    if(state.referenceView){if(w<4||h<4)state.setError('Намалюйте прямокутну область потрібної деталі.');else state.configurePart(state.activePart,{sourceRect:selected});start.current=null;setDragRect(null);return;}
    state.setRoi(selected);
    if (state.segmentationMode === 'rectangle') {
      const mask = new Uint8Array(width * height);
      for (let yy = selected.y; yy < selected.y + selected.height; yy++) mask.fill(255, yy * width + selected.x, yy * width + selected.x + selected.width);
      applyMask(mask, 'прямокутне виділення');
    }
    start.current = null; setDragRect(null);
  };
  const drawFeedback = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const ctx = feedbackRef.current?.getContext('2d'); if (!ctx) return;
    const sx = ctx.canvas.width / width, sy = ctx.canvas.height / height;
    ctx.strokeStyle = state.mode === 'brush-add' ? 'rgba(250,30,50,.5)' : 'rgba(240,240,240,.65)';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1, state.brushRadius * 2 * (sx + sy) / 2);
    ctx.beginPath(); ctx.moveTo(a.x * sx, a.y * sy); ctx.lineTo(b.x * sx + 0.01, b.y * sy); ctx.stroke();
  };
  const toolClass = (mode: Mode) => `px-2 py-1.5 rounded border ${state.mode === mode ? 'bg-[#D90416] border-red-600 text-white' : 'bg-[#242424] border-white/10'}`;
  return <div className="flex h-full flex-col bg-[#303030]">
    <div className="flex gap-2 flex-wrap items-center px-4 py-3 border-b border-white/10 text-[11px] text-gray-300">
      <span className="font-semibold text-white">Декомпозиція</span>
      <button onClick={() => { state.setMode('rect'); state.setPreview('mask'); }} className={toolClass('rect')}><MousePointer2 size={12} className="inline" /> Область</button>
      <button onClick={() => { state.setMode('pick'); state.setPreview('mask'); }} className={toolClass('pick')}><Pipette size={12} className="inline" /> Виділити</button>
      <button onClick={() => { state.setMode('brush-add'); state.setPreview('mask'); }} className={toolClass('brush-add')}>Пензель +</button>
      <button onClick={() => { state.setMode('brush-erase'); state.setPreview('mask'); }} className={toolClass('brush-erase')}>Пензель −</button>
      <button onClick={() => state.setMode('pan')} className={toolClass('pan')}>Рука</button>
      <button onClick={state.undo} disabled={!state.past.length} className="disabled:opacity-30">↶ Undo</button><button onClick={state.redo} disabled={!state.future.length} className="disabled:opacity-30">↷ Redo</button>
      <button aria-label="Зменшити масштаб" onClick={()=>useEditorStore.getState().setZoom(Math.max(25,zoom-25))}>−</button><button onClick={()=>useEditorStore.getState().setZoom(100)}>Вмістити</button><button aria-label="Збільшити масштаб" onClick={()=>useEditorStore.getState().setZoom(Math.min(400,zoom+25))}>+</button>
      <select aria-label="Фон перевірки" value={surface} onChange={event=>setSurface(event.target.value)} className="bg-[#202020] text-gray-200 rounded p-1"><option value="checkerboard">Шахівниця</option><option value="#ffffff">Білий</option><option value="#303030">Темний</option><option value="#6b84aa">Синій</option></select>
      <span className="ml-auto">{state.referenceView?'Ескіз':state.design?PART_NAMES[state.activePart]:'Оригінал'} {width} × {height} px · {zoom}%</span>
    </div>
    {state.preview==='sheet' ? <DesignSheet/> : <div ref={viewportRef} className="flex-1 overflow-auto p-5 min-h-0">
      <div className="relative shadow-2xl mx-auto" style={{ width:Math.max(1,Math.min(viewportSize.width,viewportSize.height*width/height))*zoom/100 }}>
        <div className={`absolute inset-0 ${surface==='checkerboard'?'checkerboard':''}`} style={{backgroundColor:surface==='checkerboard'?undefined:surface}} />
        <canvas ref={canvasRef} width={previewImage.width} height={previewImage.height} className={`relative block w-full h-auto touch-none ${state.mode === 'pan' ? 'cursor-grab' : 'cursor-crosshair'}`}
          onPointerDown={event => {
            if (state.mode === 'pan') { const viewport = viewportRef.current; if (viewport) pan.current = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop }; event.currentTarget.setPointerCapture(event.pointerId); return; }
            const point = getPoint(event, event.currentTarget, width, height);
            if (state.mode === 'rect') { start.current = point; event.currentTarget.setPointerCapture(event.pointerId); return; }
            if(state.design && state.layers.find(l=>l.id===state.editingLayerId)?.type==='background'){state.setError('Основа однотонна. Для зміни її кольору використайте колір основи.');return;}
            if (state.mode === 'brush-add' || state.mode === 'brush-erase') {
              const mask = state.draftMask ? state.draftMask.slice() : new Uint8Array(width * height);
              paintMask(mask, width, height, point, point, state.brushRadius, state.mode === 'brush-add');
              stroke.current = { mask, last: point }; drawFeedback(point, point); event.currentTarget.setPointerCapture(event.pointerId); return;
            }
            state.setSample(point);
            if (state.segmentationMode === 'rectangle') { state.setError('Оберіть інструмент «Область» та намалюйте прямокутник.'); return; }
            const candidate = state.segmentationMode === 'contrast' ? contrastMask(image, rect, state.tolerance) : getSelectedMask(image, rect, point, state.tolerance);
            const selected = state.segmentationMode === 'connected' ? connectedComponent(candidate, width, height, point) : candidate;
            if (!selected.some(Boolean)) { state.setError('Пікселі не знайдено. Перевірте область, допуск або скористайтесь пензлем.'); return; }
            applyMask(selected, state.segmentationMode === 'connected' ? 'зв’язний компонент за кольором' : state.segmentationMode === 'contrast' ? 'контраст від меж області' : 'виділення за кольором');
          }}
          onPointerMove={event => {
            if (pan.current && viewportRef.current) { viewportRef.current.scrollLeft = pan.current.left - (event.clientX - pan.current.x); viewportRef.current.scrollTop = pan.current.top - (event.clientY - pan.current.y); return; }
            const p = getPoint(event, event.currentTarget, width, height);
            if (stroke.current) { const prev = stroke.current.last; paintMask(stroke.current.mask, width, height, prev, p, state.brushRadius, state.mode === 'brush-add'); drawFeedback(prev, p); stroke.current.last = p; return; }
            if (start.current && state.mode === 'rect') setDragRect({ x: Math.min(start.current.x, p.x), y: Math.min(start.current.y, p.y), width: Math.abs(p.x - start.current.x) + 1, height: Math.abs(p.y - start.current.y) + 1 });
          }} onPointerUp={finishDrag} onPointerCancel={finishDrag} />
        <canvas ref={feedbackRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        {!state.referenceView && (state.preview === 'original' || state.preview === 'mask') && state.regions.map(region => <div key={region.id} className={`absolute pointer-events-none border ${region.id === state.selectedRegionId ? 'border-yellow-300' : 'border-sky-400'}`} style={{ left: `${region.bbox.x / width * 100}%`, top: `${region.bbox.y / height * 100}%`, width: `${region.bbox.width / width * 100}%`, height: `${region.bbox.height / height * 100}%` }}><span className="absolute left-0 top-0 max-w-full truncate bg-black/80 text-white text-[10px] px-1">{region.name}</span></div>)}
        {activeRect && (state.preview === 'original' || state.preview === 'mask') && <div className="absolute pointer-events-none border-2 border-[#FFCD00]" style={{ left: `${activeRect.x / width * 100}%`, top: `${activeRect.y / height * 100}%`, width: `${activeRect.width / width * 100}%`, height: `${activeRect.height / height * 100}%` }} />}
      </div>
    </div>}
    <div className="flex flex-wrap justify-between gap-2 items-center px-4 py-2 text-[11px] bg-[#252526] text-gray-400 border-t border-white/10">
      <span>{state.referenceView?`Оберіть область: ${PART_NAMES[state.activePart]}`:state.editingLayerId?'Редагування маски шару':PART_NAMES[state.activePart]}</span><button onClick={state.showSource} className="text-xs text-gray-300">Ескіз</button>
      <div className="flex flex-wrap gap-1">{(state.design ? ['sheet','original','mask','layer','layers','group'] as Preview[] : ['sheet','original', 'mask', 'repair', 'layer', 'layers', 'background'] as Preview[]).map(preview => <button key={preview} onClick={() => state.setPreview(preview)} className={`rounded px-2 py-1 ${state.preview === preview ? 'bg-red-700 text-white' : 'bg-white/10'}`}>{{ group:'Група', sheet: '4 деталі', original: state.design?'Плоский дизайн':'Оригінал', mask: 'Маска', repair:'Зона відновлення', layer: 'Окремий шар', layers: 'Усі шари', background: 'Фон' }[preview]}</button>)}</div>
    </div>
  </div>;
}

function LayerThumbnail({image,layer}:{image:ImageData;layer:PrintLayer}) {
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const target=ref.current;if(!target)return;const ctx=target.getContext('2d');if(!ctx)return;
    const pixels=maskedPixels(image,layer.mask,layer.bounds,layer.foreground),canvas=document.createElement('canvas');canvas.width=pixels.width;canvas.height=pixels.height;canvas.getContext('2d')?.putImageData(pixels,0,0);
    target.width=64;target.height=48;ctx.clearRect(0,0,64,48);const scale=Math.min(64/pixels.width,48/pixels.height);ctx.drawImage(canvas,(64-pixels.width*scale)/2,(48-pixels.height*scale)/2,pixels.width*scale,pixels.height*scale);canvas.width=1;
  },[image,layer]);
  return <canvas ref={ref} className="w-16 h-12 checkerboard rounded shrink-0" aria-label={`Прев’ю ${layer.name}`} />;
}

function paletteCsv(image:ImageData,palette:FactoryColor[]):string{
  const rows=paletteEntries(image).map(color=>{const match=nearestColor(color.hex,palette);return [color.hex,color.percentage,color.cmyk.c,color.cmyk.m,color.cmyk.y,color.cmyk.k,match?.name||'',match?.hex||'',match?.deltaE??'',match?.cmyk?.c??'',match?.cmyk?.m??'',match?.cmyk?.y??'',match?.cmyk?.k??'',match?.profile||''];});
  return '\uFEFF'+[['HEX','Частка %','C приблизно','M приблизно','Y приблизно','K приблизно','Зразок фабрики','HEX фабрики','ΔE76','C фабрики','M фабрики','Y фабрики','K фабрики','ICC таблиці'],...rows].map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(';')).join('\n');
}
async function exportPartProject(palette:FactoryColor[],paletteSource:string){
  const state=useDecomposition.getState(),documents=allParts(state),editor=useEditorStore.getState(),encoder=new TextEncoder();
  const files:Array<{name:string;bytes:Uint8Array}>=[],parts=[];
  const sheet=document.createElement('canvas');sheet.width=1600;sheet.height=1000;const ctx=sheet.getContext('2d')!;ctx.fillStyle='#e5e5e5';ctx.fillRect(0,0,sheet.width,sheet.height);
  for(let n=0;n<PART_IDS.length;n++){
    const id=PART_IDS[n],entry=documents[id],folder=`parts/${id}`,x=(n%2)*800,y=Math.floor(n/2)*500;
    ctx.fillStyle='#202020';ctx.font='bold 24px sans-serif';ctx.fillText(PART_NAMES[id],x+20,y+32);
    if(!entry?.design){parts.push({id,name:PART_NAMES[id],status:'missing',canvas:null,layers:[]});ctx.font='18px sans-serif';ctx.fillText('Розгортку ще не створено',x+20,y+75);continue;}
    if(entry.editingLayerId&&entry.layers.find(l=>l.id===entry.editingLayerId)?.mask!==entry.draftMask)throw new Error(`Збережіть виправлену маску: ${PART_NAMES[id]}.`);
    const design=entry.design,image=design.source,composition=partComposition(entry)!;
    const canvas={width:image.width,height:image.height};
    const layers=entry.layers.map((layer,index)=>({id:layer.id,name:layer.name,type:layer.type,kind:layer.kind||'raster',bounds:layer.bounds,visible:layer.visible,groupHidden:!!layer.groupHidden,order:layer.order,groupId:layer.groupId||null,fillHex:layer.fillHex||null,gradient:layer.gradient||null,operations:layer.operations,file:`${folder}/layers/${String(index+1).padStart(2,'0')}.png`,maskFile:`${folder}/masks/${String(index+1).padStart(2,'0')}.png`}));
    const record={id,name:PART_NAMES[id],status:'ready',canvas,sourceRect:design.referenceRect,sourceNormalized:design.referenceRect&&editor.uploadedImageData?{x:design.referenceRect.x/editor.uploadedImageData.width,y:design.referenceRect.y/editor.uploadedImageData.height,width:design.referenceRect.width/editor.uploadedImageData.width,height:design.referenceRect.height/editor.uploadedImageData.height}:null,model:design.model,usage:design.usage,reconstruction:true,warnings:design.warnings,groups:design.groups,layers,masterFile:`${folder}/master.png`,previewFile:`${folder}/preview.png`,backgroundFile:`${folder}/background.png`,paletteFile:`${folder}/palette.csv`,removedMaskFile:design.removedMask?`${folder}/removed-marks-mask.png`:null};
    parts.push(record);
    const base=entry.layers.find(l=>l.type==='background');if(!base)throw new Error(`У деталі ${PART_NAMES[id]} відсутня основа.`);
    files.push({name:record.masterFile,bytes:await encodePng(image)},{name:record.previewFile,bytes:await encodePng(composition)},{name:record.backgroundFile,bytes:await encodePng(maskedPixels(image,base.mask,base.bounds,base.foreground))},{name:record.paletteFile,bytes:encoder.encode(paletteCsv(composition,palette))},{name:`${folder}/manifest.json`,bytes:encoder.encode(JSON.stringify(record,null,2))});
    for(let i=0;i<entry.layers.length;i++){const layer=entry.layers[i];files.push({name:layers[i].file,bytes:await encodePng(maskedPixels(image,layer.mask,layer.bounds,layer.foreground))},{name:layers[i].maskFile,bytes:await encodePng(maskImage(layer.mask,image.width,image.height))});}
    if(design.removedMask)files.push({name:record.removedMaskFile!,bytes:await encodePng(maskImage(design.removedMask,image.width,image.height))});
    const tile=document.createElement('canvas');tile.width=image.width;tile.height=image.height;tile.getContext('2d')!.putImageData(composition,0,0);const scale=Math.min(760/image.width,440/image.height);ctx.drawImage(tile,x+20,y+50,image.width*scale,image.height*scale);tile.width=1;
  }
  const assets=assetDocument(state),elements=[];
  if(assets.editingLayerId&&assets.layers.find(l=>l.id===assets.editingLayerId)?.mask!==assets.draftMask)throw new Error('Збережіть виправлену маску графічного елемента.');
  if(editor.uploadedImageData)for(const [index,entry] of graphicEntries(state).entries()){
    const layer=entry.layer,version=state.assetVariants[entry.id]?.accepted;
    if(!layer&&!version)continue;
    const folder=`elements/${String(index+1).padStart(2,'0')}`,file=`${folder}.png`,maskFile=`${folder}-mask.png`;
    if(version){
      const pixels=version.image,mask=new Uint8Array(pixels.width*pixels.height);for(let p=0;p<mask.length;p++)mask[p]=pixels.data[p*4+3];
      files.push({name:file,bytes:version.png},{name:maskFile,bytes:await encodePng(maskImage(mask,pixels.width,pixels.height))});
      const originalExtractFile=layer?`${folder}-original-extraction.png`:null;
      if(layer&&originalExtractFile)files.push({name:originalExtractFile,bytes:await encodePng(maskedPixels(editor.uploadedImageData,layer.mask,layer.bounds,layer.foreground))});
      elements.push({id:entry.id,name:entry.name,type:entry.type,file,maskFile,bounds:{x:0,y:0,width:pixels.width,height:pixels.height},sourceBounds:version.sourceRect,placement:null,source:'ai-reconstruction',reconstruction:true,model:version.model,usage:version.usage,settings:version.settings,originalExtractFile,approved:true,note:'Генеративна реконструкція. Роздільність PNG не є підтвердженням відновленої справжньої деталізації. Координати ескізу є лише референсом, автоматичного перенесення на деталі немає.'});
    }else if(layer){
      files.push({name:file,bytes:await encodePng(maskedPixels(editor.uploadedImageData,layer.mask,layer.bounds,layer.foreground))},{name:maskFile,bytes:imageToBytes(maskPng(layer.mask,editor.uploadedImageData.width,layer.bounds))});
      elements.push({id:entry.id,name:entry.name,type:entry.type,file,maskFile,bounds:layer.bounds,sourceBounds:layer.bounds,visible:layer.visible,order:layer.order,source:'original',pixelProcessing:layer.source,extraction:layer.extraction??null,operations:layer.operations,reconstruction:false});
    }
  }
  const originalFile=editor.uploadedFile?`original.${editor.uploadedFile.type==='image/jpeg'?'jpg':'png'}`:null;
  if(originalFile&&editor.uploadedFile)files.push({name:originalFile,bytes:new Uint8Array(await editor.uploadedFile.arrayBuffer())});
  files.push({name:'preview.png',bytes:await encodePng(ctx.getImageData(0,0,sheet.width,sheet.height))});
  files.push({name:'manifest.json',bytes:encoder.encode(JSON.stringify({schemaVersion:2,kind:'garment-part-print-project',units:'px',anatomicalSides:true,originalFile,originalCanvas:editor.uploadedImageData?{width:editor.uploadedImageData.width,height:editor.uploadedImageData.height}:null,previewFile:'preview.png',factoryPaletteSource:paletteSource,demoProject:state.demoProject,parts,elements,detectedElements:graphicEntries(state).map(e=>({id:e.id,name:e.name,type:e.type,sourceBounds:e.bbox,acceptedAI:!!state.assetVariants[e.id]?.accepted})),elementAnalysis:state.assetUsage,note:'Чотири окремі прямокутні заготовки з власними шарами. Не лекала. Невидимий принт реконструйовано приблизно; фізичні розміри не задано. CMYK макета приблизний; фабричні зразки з наданої таблиці.'},null,2))});
  if(state.includeTiff)await appendTiffCopies(files,exportProgress=>useDecomposition.setState({exportProgress}));
  downloadBlob(zipFiles(files),'AI_Print_Studio_project.zip');
}

function PartLayerList({image,palette}:{image:ImageData;palette:FactoryColor[]}){
  const state=useDecomposition();
  const paletteSelect=(layer:PrintLayer,stop?:0|1)=><select aria-label={stop===undefined?`Колір шару ${layer.name}`:`Колір ${stop+1} градієнта ${layer.name}`} value="" onChange={e=>{if(e.target.value)state.recolorLayer(layer.id,e.target.value,stop);}} className="w-full mt-1 rounded bg-[#303030] p-1 text-[10px]"><option value="">{stop===undefined?'Змінити колір із палітри':`Замінити колір ${stop+1}`}</option>{palette.map((color,i)=><option key={`${i}-${color.hex}`} value={color.hex}>{color.name} · {color.hex}</option>)}</select>;
  return <div className="border-t border-white/10 pt-3 space-y-2">
    <h3 className="font-bold text-xs">{PART_NAMES[state.activePart]} · шари ({state.layers.length})</h3>
    {state.checkedLayers.length>=2&&<button onClick={()=>state.groupLayers(state.checkedLayers)} className="w-full p-2 rounded bg-white/10 text-xs">Згрупувати вибрані ({state.checkedLayers.length})</button>}
    {state.checkedLayers.filter(id=>state.layers.find(l=>l.id===id)?.type!=='background').length>=2&&<button onClick={()=>state.combineLayers(state.checkedLayers,image)} className="w-full p-2 rounded bg-white/10 text-xs">{state.layers.some(l=>state.checkedLayers.includes(l.id)&&l.kind==='gradient')?'Об’єднати в цілісний градієнт':'Об’єднати в один принт'}</button>}
    {state.design?.groups.map(group=><div key={group.id} className="p-2 rounded border border-sky-700/50 text-xs">
      <input aria-label="Назва групи" key={`${group.id}-${group.name}`} defaultValue={group.name} onBlur={e=>{const name=e.target.value.trim();if(name&&name!==group.name)useDecomposition.setState(s=>s.design?{past:historyFor(s),future:[],design:{...s.design,groups:s.design.groups.map(g=>g.id===group.id?{...g,name}:g)}}:{});}} className="bg-transparent w-full text-sky-200"/>
      <div className="flex flex-wrap gap-2 mt-1"><button onClick={()=>state.toggleGroup(group.id)}>{group.visible?'Приховати групу':'Показати групу'}</button><button onClick={()=>useDecomposition.setState({activeGroupId:group.id,preview:'group',referenceView:false})}>Лише група</button><button onClick={()=>state.ungroup(group.id)} className="text-red-300">Розгрупувати</button></div>
    </div>)}
    {state.layers.map(layer=><div key={layer.id} className="p-2 rounded border border-white/10 bg-[#1C1C1C]" data-layer-id={layer.id}>
      <div className="flex gap-2 items-center"><input aria-label={`Обрати шар ${layer.name}`} type="checkbox" checked={state.checkedLayers.includes(layer.id)} onChange={e=>state.setCheckedLayers(ids=>e.target.checked?[...ids,layer.id]:ids.filter(id=>id!==layer.id))}/><LayerThumbnail image={image} layer={layer}/><div className="flex-1 min-w-0"><input aria-label="Назва шару" key={`${layer.id}-${layer.name}`} defaultValue={layer.name} onBlur={e=>state.renameLayer(layer.id,e.target.value)} className="bg-transparent w-full text-xs font-semibold"/><p className="text-[10px] text-gray-400">{layer.kind==='gradient'?'Цілісний градієнт':layer.type==='background'?'Основа':'Принт'}{layer.groupId?` · ${state.design?.groups.find(g=>g.id===layer.groupId)?.name||'Група'}`:''}</p></div><button aria-label={`Видимість ${layer.name}`} onClick={()=>state.toggleLayer(layer.id)} className={layer.visible&&!layer.groupHidden?'text-white':'text-gray-600'}><Eye size={14}/></button></div>
      <div className="flex gap-2 mt-2 text-[10px] text-red-300"><button onClick={()=>{state.editLayer(layer.id);state.setPreview('layer');}}>Лише цей шар</button>{layer.type!=='background'&&<><button onClick={()=>state.editLayer(layer.id)}>Маска</button><button aria-label="Перемістити шар вище" onClick={()=>state.moveLayer(layer.id,-1)}>↑</button><button aria-label="Перемістити шар нижче" onClick={()=>state.moveLayer(layer.id,1)}>↓</button><button onClick={()=>state.deleteLayer(layer.id)}>Видалити</button></>}</div>
      {layer.kind==='gradient'?<><div className="flex gap-2 my-1">{layer.gradient?.stops.map((hex,i)=><span key={i} className="text-[10px] flex items-center gap-1"><span className="w-3 h-3 inline-block rounded" style={{background:hex}}/>{hex}</span>)}</div>{paletteSelect(layer,0)}{paletteSelect(layer,1)}<p className="text-[9px] text-gray-500 mt-1">Перефарбування зберігає плавність, маску та напрямок переходу в растрі.</p></>:<>{paletteSelect(layer)}{layer.type!=='background'&&<button className="text-[10px] text-gray-400 mt-1" onClick={()=>{const bounds={x:0,y:0,width:image.width,height:image.height},source=maskedPixels(image,undefined,bounds,layer.foreground),stops=gradientStops(source,layer.mask);useDecomposition.setState(s=>({past:historyFor(s),future:[],layers:s.layers.map(l=>l.id===layer.id?{...l,kind:'gradient',gradient:{sourceStops:stops,stops},foreground:{image:source,bounds},colorSource:undefined}:l)}));}}>Редагувати як градієнт</button>}</>}
    </div>)}
  </div>;
}

export function DecompositionSidebar() {
  const image = useEditorStore(s => s.workingImageData ?? s.uploadedImageData);
  const colors = useEditorStore(s => s.colorLayers);
  const originalFile = useEditorStore(s => s.uploadedFile);
  const state = useDecomposition();
  const [name, setName] = useState('Принт');
  const [layerType, setLayerType] = useState<PrintLayer['type']>('unknown');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'elements' | 'colors'>('elements');
  const {factoryPalette,factorySource,setFactoryPalette,setFactorySource}=useProductionPalette();
  const [cvMode, setCvMode] = useState<CvMode>('auto');
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchProgress, setBatchProgress] = useState('');
  const selectedLayers = state.checkedLayers;
  const [restoreMethod, setRestoreMethod] = useState<RestoreMethod>('local');
  const [exportLayer, setExportLayer] = useState('');
  const [advanced,setAdvanced]=useState(state.assetView);
  const extractedMask = state.draftMask;
  const editedLayer = state.layers.find(layer => layer.id === state.editingLayerId);
  const hasUnsavedLayerEdits = !!editedLayer && editedLayer.mask !== state.draftMask;
  const pixelCount = useMemo(() => extractedMask ? extractedMask.reduce((n, v) => n + (v ? 1 : 0), 0) : 0, [extractedMask]);

  const addSelected = () => {
        if (!image || !extractedMask || pixelCount < 1) { state.setError('Спершу створіть маску виділення.'); return; }
    if (state.editingLayerId) { state.saveLayer(image); return; }
    const bounds = state.design?{x:0,y:0,width:image.width,height:image.height}:maskBounds(extractedMask, image.width, image.height);
    if (!bounds) return;
    const region = state.regions.find(item => item.id === state.selectedRegionId);
    state.addLayer({
      id: nextLocalId('layer'), name: name.trim() || `Елемент ${state.layers.length + 1}`,
      kind: 'raster', type: layerType === 'unknown' ? region?.type ?? 'unknown' : layerType, source: state.draftForeground ? 'estimated-foreground' : 'original', foreground: state.draftForeground, extraction: state.draftExtraction, bounds, mask: extractedMask,
      visible: true, order: Math.max(-1, ...state.layers.map(layer => layer.order)) + 1,
      operations: state.draftOps,
    });
    setName(`Елемент ${state.layers.length + 1}`);
  };

  const runAutomatic = async () => {
    if(!image || batchBusy || state.design)return;
    setBatchBusy(true);setBatchProgress('Пошук елементів…');state.setError('');
    try {
      if(useDecomposition.getState().analysisStatus!=='success')await state.analyze(image);
      if(useDecomposition.getState().analysisStatus!=='success' || workingImage()!==image){setBatchProgress('');return;}
      const existing=new Set(useDecomposition.getState().layers.map(layer=>layer.extraction?.regionId));
      const regions=useDecomposition.getState().regions.filter(region=>!existing.has(region.id) && ['logo','text','number'].includes(region.type) && !/заголов|підпис|інтерфейс|перед$|спина$|вид з/i.test(region.name+' '+region.description)).slice(0,20);
      if(!regions.length){setBatchProgress(existing.size?'Усі придатні області вже вилучено.':'Немає придатних областей. Намалюйте область навколо логотипа.');return;}
      let completed=0;const failed:string[]=[];
      for(let i=0;i<regions.length;i++){
        if(workingImage()!==image){setBatchProgress('');return;}
        const region=regions[i];setBatchProgress(`${i+1}/${regions.length}: ${region.name}`);
        if(await useDecomposition.getState().segment(image,region.bbox,'auto',{id:region.id,name:region.name,type:region.type}))completed++;else failed.push(region.name);
      }
      setBatchProgress(`Створено ${completed} шарів. Перевірте краї на білому й темному фоні.${failed.length?` Потрібна ручна перевірка: ${failed.join(', ')}.`:''}`);
    } finally {setBatchBusy(false);}
  };


  const downloadLayer = async (layer: PrintLayer) => {
    if (!image) return;
    try {
      const bytes = await encodePng(maskedPixels(image, layer.mask, layer.bounds, layer.foreground));
      downloadBlob(new Blob([Uint8Array.from(bytes).buffer], { type: 'image/png' }), `${state.design?state.activePart+'_':''}${layer.name.replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'layer'}.png`);
    } catch (error) { state.setError(error instanceof Error ? error.message : 'Не вдалося експортувати шар.'); }
  };

  const exportZip = async () => {
    if (!image) return;
    setBusy(true);
    state.setError('');
    try {
      if(state.assetView||!state.layers.length || Object.values(allParts(useDecomposition.getState())).some(document=>document?.design)){await exportPartProject(factoryPalette,factorySource);return;}
      if (hasUnsavedLayerEdits) throw new Error('Спочатку збережіть зміни маски шару.');
      const accepted = restoreValid(state.restored, image, state.layers) ? state.restored : null;
      if (!state.design && state.layers.length && !accepted) throw new Error('Спочатку відновіть і прийміть фон для поточних шарів.');
      const background = state.design ? maskedPixels(image,state.layers[0].mask,state.layers[0].bounds,state.layers[0].foreground) : accepted?.image ?? image;
      const preview = composeExtractedLayers(image, state.design ? new ImageData(new Uint8ClampedArray(image.data.length),image.width,image.height) : background, state.layers);
      const csv = '\uFEFF' + 'HEX;C приблизно;M приблизно;Y приблизно;K приблизно;Частка %;Колір виробництва;HEX фабрики;ΔE76;C фабрики;M фабрики;Y фабрики;K фабрики;ICC фабрики\n' +
        colors.map(c => {
          const match = nearestColor(c.hex, factoryPalette);
          return [c.hex, c.cmyk.c, c.cmyk.m, c.cmyk.y, c.cmyk.k, c.percentage,
            match?.name || 'палітра не завантажена', match?.hex || '', match?.deltaE ?? '', match?.cmyk?.c ?? '', match?.cmyk?.m ?? '', match?.cmyk?.y ?? '', match?.cmyk?.k ?? '', match?.profile ?? ''].map(value => `"${String(value).replaceAll('"', '""')}"`).join(';');
        }).join('\n');
      const manifest = {
        design: state.design ? {kind:'generated-flat-print',model:state.design.model,view:state.design.view,aspect:state.design.aspect,baseHex:state.design.baseHex,instructions:state.design.instructions,warnings:state.design.warnings,sourceDimensions: {width:useEditorStore.getState().uploadedImageData?.width,height:useEditorStore.getState().uploadedImageData?.height}} : null,
        reconstruction: accepted ? { method: accepted.method, model: accepted.model ?? null, layerIds: accepted.layerIds, approximate: true, margin:accepted.margin, maskFile:'reconstruction-mask.png', localMode:accepted.method==='local'?accepted.localMode:null } : null,
        preview: 'preview.png',
        note: 'RGB PNG. CMYK макета — приблизна RGB-формула. CMYK зразків фабрики взято з таблиці; ICC таблиці не є профілем друкарської машини. Точність обмежена вхідним растром.',
        canvas: { width: image.width, height: image.height },
        originalFile: originalFile ? (originalFile.type === 'image/jpeg' ? 'original.jpg' : 'original.png') : null,
        layers: state.layers.map(({ id, name, type, source, bounds, visible, order, operations, extraction }, i) => ({ id, name, type, source, bounds, visible, order, operations, extraction, file: `layers/${String(i + 1).padStart(2, '0')}_${name.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 50)}.png`, maskFile: `masks/${String(i + 1).padStart(2, '0')}.png` })),
        factoryPaletteCount: factoryPalette.length,
        factoryPaletteSource:factorySource,
      };
      const encoder = new TextEncoder();
      const files = [
        { name: 'background.png', bytes: await encodePng(background) },
        { name: 'preview.png', bytes: await encodePng(preview) },
        { name: 'palette.csv', bytes: encoder.encode(csv) },
        { name: 'manifest.json', bytes: encoder.encode(JSON.stringify(manifest, null, 2)) },
        ...state.layers.map((layer, i) => ({ name: `masks/${String(i + 1).padStart(2, '0')}.png`, bytes: imageToBytes(maskPng(layer.mask, image.width, layer.bounds)) })),
        ...(state.design ? [{name:'flat-design.png',bytes:await encodePng(image)},{name:'generated-reference.png',bytes:imageToBytes(state.design.sourceUrl)},...(state.design.labelMap?[{name:'classification-map.png',bytes:imageToBytes(state.design.labelMap)}]:[])] : []),
        ...(originalFile && manifest.originalFile ? [{ name: manifest.originalFile, bytes: new Uint8Array(await originalFile.arrayBuffer()) }] : []),
      ];
      if(accepted) files.push({name:'reconstruction-mask.png',bytes:await encodePng(maskImage(accepted.repairMask,image.width,image.height))});
      for (let i = 0; i < state.layers.length; i++) {
        const layer = state.layers[i];
        files.push({ name: manifest.layers[i].file, bytes: await encodePng(maskedPixels(image, layer.mask, layer.bounds, layer.foreground)) });
      }
      if(state.includeTiff)await appendTiffCopies(files,exportProgress=>useDecomposition.setState({exportProgress}));
      downloadBlob(zipFiles(files), 'AI_Print_Studio_decomposition.zip');
    } catch (error) {
      state.setError(error instanceof Error ? error.message : 'Не вдалося створити ZIP');
    } finally { setBusy(false); }
  };

  return (
    <div className="h-full flex flex-col text-white bg-[#252526] border-l border-white/10">
      <div className="grid grid-cols-2 border-b border-white/10 bg-[#1E1E1E] text-xs">
        <button onClick={() => setTab('elements')} className={`py-3 flex items-center justify-center gap-2 ${tab === 'elements' ? 'text-white border-b-2 border-red-600' : 'text-gray-400'}`}><Layers size={14}/> Елементи</button>
        <button onClick={() => {const current=useDecomposition.getState(),document=allParts(current)[current.activePart],composition=document?partComposition(document):null;if(composition)useEditorStore.getState().setColorLayers(paletteEntries(composition));setTab('colors');}} className={`py-3 flex items-center justify-center gap-2 ${tab === 'colors' ? 'text-white border-b-2 border-red-600' : 'text-gray-400'}`}><Palette size={14}/> Кольори ({colors.length})</button>
      </div>
      {tab === 'elements' ? (
        <div className="p-3 space-y-3 overflow-y-auto flex-1">
          {!state.assetView&&<DesignControls/>}
          {state.design && state.editingLayerId && <button onClick={()=>image&&state.saveLayer(image)} className="w-full rounded bg-red-700 py-2 text-xs">Зберегти виправлену маску</button>}
          <button onClick={()=>setAdvanced(value=>!value)} className="w-full text-xs text-gray-300">{advanced?'Сховати інструменти масок':'Ручне виправлення масок / локальне виділення'}</button>
          {advanced && <><div className="space-y-2 rounded-lg border border-white/10 bg-[#1C1C1C] p-3">
            <button onClick={() => image && void state.analyze(image)} disabled={!image || state.analysisStatus === 'loading' || state.analysisStatus === 'success'} className="w-full rounded-lg bg-red-700 py-2 text-xs font-bold disabled:opacity-50">
              {state.analysisStatus === 'loading' ? 'Аналіз OpenAI…' : state.analysisStatus === 'success' ? 'AI-аналіз виконано' : 'AI-аналіз макета'}
            </button>
            <button onClick={()=>void runAutomatic()} disabled={!image || batchBusy || state.segmentStatus==='loading'} className="w-full rounded-lg bg-white/10 py-2 text-xs font-semibold disabled:opacity-40">{batchBusy?'Розкладання…':'Знайти й вилучити написи та логотипи'}</button>
            {batchProgress && <p role="status" className="text-[11px] text-gray-300">{batchProgress}</p>}
            <p className="text-[10px] text-gray-400">Зображення надсилається до OpenAI лише після натискання. Рамки приблизні; перевірте їх перед виділенням.</p>
            {state.analysisStatus === 'error' && <p role="alert" className="text-[11px] text-orange-300">{state.analysisError}</p>}
            {state.analysisStatus === 'success' && state.analysis && <div className="text-[10px] text-gray-300 space-y-1" role="status">
              <p>Аналіз завершено{state.cached ? ' (результат з пам’яті)' : ''}. Модель: {state.analysis.model}</p>
              {state.analysis.usage && <p>Токени: вхід {state.analysis.usage.input_tokens}, вихід {state.analysis.usage.output_tokens}, разом {state.analysis.usage.total_tokens}</p>}
              <p>Фон: {({ solid: 'однотонний', gradient: 'градієнтний', geometric: 'геометричний', textured: 'текстурований', unknown: 'невідомий' })[state.analysis.data.background.type]} · {state.analysis.data.background.description}</p>
              <p>Виділення: {state.analysis.data.background.selectionRecommendation}</p><p>Відновлення: {state.analysis.data.background.restorationRecommendation}</p>
            </div>}
            <div className="flex justify-between items-center text-xs font-bold pt-1"><span>Області ({state.regions.length})</span><button onClick={() => state.selectRegion(null)} className="text-red-300 text-[10px]">Нова область</button></div>
            {state.regions.map(region => <div key={region.id} className={`flex gap-1 items-start rounded border p-2 ${region.id === state.selectedRegionId ? 'border-yellow-400' : 'border-white/10'}`}>
              <button onClick={() => state.selectRegion(region.id)} className="text-left flex-1 min-w-0"><span className="block text-xs font-semibold break-words">{region.name}</span><span className="block text-[10px] text-gray-400">{region.type}{region.manual ? ' · вручну' : ` · оцінка ${Math.round(region.confidence * 100)}%`}</span><span className="block text-[10px] text-gray-400 break-words">{region.description}</span></button>
              <button onClick={() => state.deleteRegion(region.id)} aria-label={`Видалити область ${region.name}`} className="text-red-400 p-1"><Trash2 size={13}/></button>
            </div>)}
            <button onClick={state.addManualRegion} disabled={!state.roi || !!state.selectedRegionId} className="w-full rounded bg-white/10 py-2 text-[11px] disabled:opacity-40">Додати намальовану область</button>
            <p className="text-[10px] text-gray-500">Щоб змінити межі, виберіть область у списку та намалюйте нову рамку інструментом «1. Область».</p>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-3 space-y-2">
            <label className="block text-xs text-gray-200">Точне виділення області
              <select aria-label="Алгоритм виділення" value={cvMode} onChange={event=>setCvMode(event.target.value as CvMode)} className="w-full mt-1 bg-[#171717] rounded p-2 text-xs">
                <option value="auto">Автоматично</option><option value="light">Світлий напис / темний фон</option><option value="dark">Темний напис / світлий фон</option><option value="multicolor">Багатоколірний логотип</option><option value="emblem">Суцільна емблема (зберегти білі деталі)</option><option value="grabcut">GrabCut</option>
              </select>
            </label>
            <button disabled={!image || !state.roi || state.segmentStatus==='loading' || batchBusy} onClick={()=>image&&state.roi&&void state.segment(image,state.roi,cvMode)} className="w-full rounded bg-red-700 py-2 text-xs font-bold disabled:opacity-40">{state.segmentStatus==='loading'?'Виділення пікселів…':'Автовиділення пікселів області'}</button>
            <p className="text-[10px] text-gray-400">Виберіть AI-область або намалюйте рамку навколо одного елемента. Результат можна виправити пензлем.</p>
            {state.segmentStatus==='error' && <p role="alert" className="text-[11px] text-orange-300">{state.segmentError}</p>}
            {state.draftExtraction && <p className="text-[10px] text-amber-200">{state.draftExtraction.warnings.length?state.draftExtraction.warnings.join(' '):'Альфу й колір країв оцінено з оригіналу. Перевірте результат.'}</p>}
          </div>
          <div className="text-xs text-gray-300 leading-relaxed bg-white/5 rounded-lg p-3">
            Оберіть область і режим. Піпетка додає кольори до однієї маски; пензель виправляє її на оригіналі. Складний фон може потребувати ручної корекції.
          </div>
          <label className="block text-[11px] text-gray-300">Режим виділення
            <select aria-label="Режим виділення" value={state.segmentationMode} onChange={event => { const mode = event.target.value as SegmentationMode; state.setSegmentationMode(mode); state.setMode(mode === 'rectangle' ? 'rect' : 'pick'); }} className="mt-1 w-full bg-[#151515] rounded border border-white/20 p-2 text-xs">
              <option value="color">Колір в області</option><option value="connected">Зв’язний компонент</option><option value="contrast">Контраст від меж області</option><option value="rectangle">Прямокутна маска</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-[11px] text-gray-300"><input type="checkbox" checked={state.additive} onChange={event => state.setAdditive(event.target.checked)} className="accent-red-600" /> Додавати до маски (кілька кольорів)</label>
          <label htmlFor="selection-tolerance" className="flex justify-between text-[11px] text-gray-300"><span>Допуск кольору / контрасту</span><span>{state.tolerance}</span></label>
          <input id="selection-tolerance" type="range" min="5" max="120" step="1" value={state.tolerance} onChange={event => state.setTolerance(Number(event.target.value))} className="w-full accent-red-600" />
          <p className="text-[10px] text-gray-500">Допуск застосовується під час наступного натискання. Для меншого допуску очистіть маску й виберіть колір знову.</p>
          <label htmlFor="brush-radius" className="flex justify-between text-[11px] text-gray-300"><span>Радіус пензля в оригіналі</span><span>{state.brushRadius} px</span></label>
          <input id="brush-radius" type="range" min="2" max="200" value={state.brushRadius} onChange={event => state.setBrushRadius(Number(event.target.value))} className="w-full accent-red-600" />
          <div className="flex justify-between text-[10px] text-gray-400"><span>Пікселів у масці: {pixelCount.toLocaleString('uk-UA')}</span><button onClick={state.clearMask} disabled={!extractedMask} className="disabled:opacity-40 text-red-300">Очистити маску</button></div>
          {!state.editingLayerId && <label className="block text-[11px] text-gray-300">Тип шару
            <select aria-label="Тип шару" value={layerType} onChange={event => setLayerType(event.target.value as PrintLayer['type'])} className="mt-1 w-full bg-[#151515] rounded border border-white/20 p-2 text-xs">
              <option value="unknown">Авто / невідомо</option><option value="logo">Логотип</option><option value="text">Напис</option><option value="number">Номер</option><option value="graphic">Графіка</option><option value="background">Фон</option>
            </select>
          </label>}
          {!state.editingLayerId && <input value={name} onChange={event => setName(event.target.value)} maxLength={80} aria-label="Назва принта" placeholder="Назва елемента" className="w-full px-3 py-2 rounded bg-[#151515] text-xs border border-white/20 focus:outline-none focus:border-red-600" />}
          <button onClick={addSelected} disabled={!pixelCount} className="w-full rounded-lg bg-[#D90416] py-2.5 font-bold text-xs disabled:opacity-40 flex justify-center items-center gap-2"><ScanSearch size={14}/> {state.editingLayerId ? 'Зберегти маску шару' : 'Створити шар із маски'}</button>
          {state.editingLayerId && <button onClick={state.newMask} className="w-full text-xs text-gray-300">Почати нову маску</button>}
          {!state.design && state.editingLayerId && <button onClick={() => state.addLayer({ id: nextLocalId('layer'), name: name.trim() || 'Копія шару', type: 'unknown', source: state.draftForeground?'estimated-foreground':'original', foreground:state.draftForeground, extraction:state.draftExtraction, bounds: maskBounds(extractedMask!, image!.width, image!.height)!, mask: extractedMask!, visible: true, order: Math.max(-1, ...state.layers.map(layer => layer.order)) + 1, operations: state.draftOps })} disabled={!image || !pixelCount} className="w-full text-xs text-gray-300 disabled:opacity-40">Зберегти як новий шар</button>}
          {state.error && <p role="alert" className="text-[11px] text-orange-300">{state.error}</p>}
          </>}
          {state.design&&image?<PartLayerList image={image} palette={factoryPalette}/>:<div className="text-xs text-gray-400">Локальні PNG-шари: {state.layers.length}{state.layers.map(layer=><div key={layer.id} className="flex gap-2 p-2 border border-white/10 mt-1"><span>{layer.name}</span><button onClick={()=>state.editLayer(layer.id)}>Маска</button><button onClick={()=>void downloadLayer(layer)}>PNG</button></div>)}</div>}

        </div>
      ) : (
        <div className="p-3 space-y-3 overflow-y-auto flex-1">
          <button disabled={!image || !state.roi} onClick={()=>{if(image&&state.roi)useEditorStore.getState().setColorLayers(paletteEntries(maskedPixels(image,undefined,state.roi)));}} className="w-full rounded bg-white/10 py-2 text-xs disabled:opacity-40">Палітра вибраної області</button>
          <button disabled={!image} onClick={()=>{const preview=state.design&&image?composeExtractedLayers(image,new ImageData(new Uint8ClampedArray(image.data.length),image.width,image.height),state.layers):workingPreview();if(preview)useEditorStore.getState().setColorLayers(paletteEntries(preview));}} className="w-full rounded bg-white/10 py-2 text-xs disabled:opacity-40">Палітра всього макета</button>
          <p className="text-[11px] text-gray-400">CMYK макета — приблизний. CMYK зразків виробництва прочитано з таблиці; HEX зразків перетворено через її ICC. Палітра області дозволяє виключити фон презентації.</p>
          <label className="block text-[11px] text-white font-medium">Палітра фабрики (CSV / PDF-сумісний AI)
            <input type="file" accept=".csv,.txt,.ai,.pdf,text/csv,text/plain,application/pdf" className="mt-2 text-[10px] w-full text-gray-300" onChange={async e => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                if(file.size>8*1024*1024)throw new Error('Палітра завелика (максимум 8 МБ).');
                if(/\.(ai|pdf)$/i.test(file.name)){
                  const response=await fetch('/api/factory-palette',{method:'POST',headers:{'Content-Type':'application/pdf'},body:file});const result=await response.json();if(!response.ok)throw new Error(result.error);
                  setFactoryPalette(result.colors);setFactorySource(`${file.name} · ${result.source.count} зразків · ${result.source.profile||'без ICC'}`);
                }else{const result=parseFactoryCsv(await file.text());if(!result.length)throw new Error('Не знайдено HEX-кольорів у CSV.');setFactoryPalette(result);setFactorySource(file.name);}
                state.setError('');
              }catch(error){state.setError(error instanceof Error?error.message:'Не вдалося імпортувати палітру.');}
            }} />
          </label>
          <p className="text-[10px] text-gray-500">{factorySource} · порівняння ΔE76 у Lab</p>
          {colors.map((color, i) => (
            <div key={`${color.hex}-${i}`} className="flex items-center gap-2 rounded-lg bg-[#1C1C1C] p-2 border border-white/10">
              <div className="w-10 h-10 rounded border border-white/20" style={{ background: color.hex }} />
              <div className="flex-1"><div className="font-mono text-xs">{color.hex} <span className="text-gray-500">{color.percentage}%</span></div><div className="text-[10px] text-gray-400">C{color.cmyk.c} M{color.cmyk.m} Y{color.cmyk.y} K{color.cmyk.k}</div><div className="text-[10px] text-gray-500">{factoryPalette.length ? (() => { const match = nearestColor(color.hex, factoryPalette); return match ? `${match.name} · ΔE76 ${match.deltaE}${match.cmyk?` · CMYK ${match.cmyk.c}/${match.cmyk.m}/${match.cmyk.y}/${match.cmyk.k}`:''}` : ''; })() : 'Палітра виробництва не завантажена'}</div></div>
            </div>
          ))}
        </div>
      )}
      <div className="p-3 space-y-2 bg-[#191919] border-t border-white/10 overflow-y-auto max-h-[42%]">
        {state.error && <p role="alert" className="text-xs text-orange-300">{state.error}</p>}
        {hasUnsavedLayerEdits && <p className="text-[10px] text-amber-300">Збережіть зміни маски шару перед відновленням та експортом.</p>}
        {!state.design && <><label className="block text-[11px] text-gray-300">Відновлення фону
          <select aria-label="Спосіб відновлення" value={restoreMethod} onChange={event => setRestoreMethod(event.target.value as RestoreMethod)} className="w-full mt-1 rounded bg-[#292929] p-2 text-xs">
            <option value="local">Локально</option><option value="openai">OpenAI</option>
          </select>
        </label>
        {restoreMethod==='local' && <select aria-label="Локальне відновлення" value={state.localMode} onChange={event=>state.setLocalMode(event.target.value as 'telea'|'ns'|'gradient')} className="w-full rounded bg-[#292929] p-2 text-xs"><option value="telea">OpenCV Telea</option><option value="ns">OpenCV Navier–Stokes</option><option value="gradient">Однотонний / плавний градієнт</option></select>}
        <label className="flex justify-between text-[10px] text-gray-300">Відступ зони відновлення <span>{state.repairMargin} px</span></label>
        <input aria-label="Відступ відновлення" type="range" min="0" max="8" value={state.repairMargin} onChange={event=>state.setRepairMargin(Number(event.target.value))} className="w-full accent-amber-500" />
        <button onClick={()=>state.setPreview('repair')} className="text-[10px] text-amber-200">Показати зону відновлення</button>
        <p className="text-[10px] text-gray-400">{selectedLayers.length ? `Відновлюються вибрані шари: ${selectedLayers.length}` : `Відновлюються всі шари: ${state.layers.length}.`} Результат є наближенням прихованого фону.</p>
        <button disabled={!image || !state.layers.length || hasUnsavedLayerEdits || state.restoreStatus === 'loading'} onClick={() => image && void state.restore(image, selectedLayers, restoreMethod)} className="w-full rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold py-2.5 disabled:opacity-50"><Eraser size={13} className="inline mr-2"/>{state.restoreStatus === 'loading' ? 'Відновлення…' : 'Відновити фон'}</button>
        {state.restoreStatus === 'loading' && <p role="status" className="text-xs text-gray-300">{state.restoreProgress} · {restoreMethod === 'openai' ? 'OpenAI: платний запит на кожну ділянку.' : 'Локальна реконструкція…'}</p>}
        {state.restoreStatus === 'error' && <p role="alert" className="text-xs text-orange-300">{state.restoreError}</p>}
        {state.proposal && restoreValid(state.proposal, image, state.layers) && <div className="space-y-2 border border-amber-600/50 p-2 rounded text-[11px] text-amber-200">
          <p>{state.proposal.method === 'openai' ? `AI-реконструкція (${state.proposal.model})` : 'Локальна реконструкція'} · попередній результат{state.proposal.cached ? ' із кешу' : ''}. Поза маскою збережено оригінальні пікселі.</p>
          {state.proposal.usage != null && <p>Використання API: {JSON.stringify(state.proposal.usage)}</p>}
          <div className="flex gap-2"><button onClick={() => state.setPreview('original')} className="rounded bg-white/10 px-2 py-1">До</button><button onClick={() => state.setPreview('background')} className="rounded bg-white/10 px-2 py-1">Після</button><button onClick={state.acceptRestore} className="rounded bg-green-700 px-2 py-1 text-white">Прийняти</button><button onClick={state.rejectRestore} className="rounded bg-white/10 px-2 py-1">Відхилити</button></div>
        </div>}
        {state.restored && (restoreValid(state.restored, image, state.layers) ? <p className="text-[10px] text-green-300">Прийнято: {state.restored.method === 'openai' ? 'AI-реконструкція' : 'локальна реконструкція'}.</p> : <p className="text-[10px] text-orange-300">Шари змінилися; повторіть відновлення фону.</p>)}
        </>}
        <label className="block text-[11px] text-gray-300">Окремий шар для експорту<select aria-label="Шар для експорту" value={exportLayer} onChange={event => setExportLayer(event.target.value)} className="w-full mt-1 rounded bg-[#292929] p-2 text-xs"><option value="">Оберіть шар</option>{state.layers.map(layer => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></label>
        <button disabled={!image || !state.layers.some(layer => layer.id === exportLayer)} onClick={() => { const layer = state.layers.find(item => item.id === exportLayer); if (image && layer) void downloadLayer(layer); }} className="w-full rounded-lg bg-white/10 py-2 text-xs disabled:opacity-40">Експортувати вибраний PNG</button>
        <button disabled={!image || busy || hasUnsavedLayerEdits || state.restoreStatus === 'loading' || Object.values(state.partStatus).some(Boolean)} onClick={exportZip} className="w-full rounded-lg bg-[#D90416] hover:bg-red-700 text-xs font-bold py-3 disabled:opacity-50"><Download size={14} className="inline mr-2"/> {busy ? 'Створення архіву...' : 'Експортувати проєкт'}</button><p className="text-[10px] text-gray-400">Готових деталей: {PART_IDS.filter(id=>allParts(state)[id]?.design).length}/4. Відсутні деталі позначаються в manifest.</p>
        <div className="text-[10px] text-gray-500"><ImageIcon size={12} className="inline mr-1"/> RGB PNG; результат потребує перевірки перед друком.</div>
      </div>
    </div>
  );
}

const useProductionPalette=create<{
  factoryPalette:FactoryColor[];factorySource:string;
  setFactoryPalette:(colors:FactoryColor[])=>void;setFactorySource:(source:string)=>void;
}>(set=>({factoryPalette:factoryData.colors,factorySource:`кольори форма.ai · ${factoryData.source.count} зразків · ${factoryData.source.profile}`,
  setFactoryPalette:factoryPalette=>set({factoryPalette}),setFactorySource:factorySource=>set({factorySource})}));

/** A concise view of the same part sessions and masks used by the detailed workbench. */
function QuickLayers({solo,onSolo,onMask}:{solo:string|null;onSolo:(id:string|null)=>void;onMask:(id:string)=>void}){
  const state=useDecomposition(),{factoryPalette,factorySource}=useProductionPalette();
  const [colorTarget,setColorTarget]=useState<{id:string;stop?:0|1}|null>(null);
  const [filter,setFilter]=useState('');
  const [error,setError]=useState('');
  const image=state.design!.source;
  const target=state.layers.find(l=>l.id===colorTarget?.id);
  return <aside className="studio-inspector">
    <div className="flex justify-between items-center mb-4"><div><h3 className="font-semibold text-lg">Шари деталі</h3><p className="text-xs text-gray-500 mt-1">Око — видимість. Назва — окремий перегляд.</p></div><Layers size={18} className="text-gray-500"/></div>
    <button className={`studio-soft w-full mb-3 ${!solo?'text-white':'text-gray-400'}`} onClick={()=>onSolo(null)}>Усі шари разом</button>
    {state.checkedLayers.length>=2&&<button className="studio-soft w-full mb-3 text-red-300" onClick={()=>state.groupLayers(state.checkedLayers)}>Згрупувати вибрані ({state.checkedLayers.length})</button>}
    {state.design?.groups.map(group=><div key={group.id} className="flex gap-2 items-center text-xs rounded-lg bg-white/5 p-2 mb-2">
      <button aria-label={`Видимість групи ${group.name}`} onClick={()=>state.toggleGroup(group.id)}>{group.visible?<Eye size={15}/>:<EyeOff size={15}/>}</button>
      <span className="flex-1">{group.name}</span><button className="text-gray-400" onClick={()=>state.ungroup(group.id)}>Розгрупувати</button>
    </div>)}
    <div className="space-y-2">{state.layers.map(layer=><div key={layer.id} data-quick-layer={layer.id} className={`rounded-xl border p-3 ${solo===layer.id?'border-red-600 bg-red-950/20':'border-white/10 bg-[#202022]'}`}>
      <div className="flex gap-2 items-center">
        <input aria-label={`Обрати шар ${layer.name}`} type="checkbox" className="accent-red-600" checked={state.checkedLayers.includes(layer.id)} onChange={e=>state.setCheckedLayers(ids=>e.target.checked?[...ids,layer.id]:ids.filter(id=>id!==layer.id))}/>
        <button aria-label={`Видимість ${layer.name}`} onClick={()=>state.toggleLayer(layer.id)} className={layer.visible&&!layer.groupHidden?'text-gray-200':'text-gray-600'}>{layer.visible&&!layer.groupHidden?<Eye size={17}/>:<EyeOff size={17}/>}</button>
        <button onClick={()=>onSolo(solo===layer.id?null:layer.id)} className="flex-1 text-left min-w-0"><span className="block text-sm truncate font-medium">{layer.name}</span><span className="text-[11px] text-gray-500">{layer.kind==='gradient'?'Цілісний градієнт':layer.type==='background'?'Однотонна основа':layer.kind==='texture'?'Текстура':'Кольоровий принт'}</span></button>
        <div className="flex gap-1">{(layer.kind==='gradient'?layer.gradient?.stops:[layer.fillHex||'#777777'])?.map((hex,index)=><button key={index} aria-label={layer.kind==='gradient'?`Змінити колір ${index+1} градієнта ${layer.name}`:`Змінити колір ${layer.name}`} title={`${hex} · змінити колір`} onClick={()=>{setColorTarget({id:layer.id,stop:layer.kind==='gradient'?index as 0|1:undefined});setFilter('');}} className="w-6 h-6 rounded-full border-2 border-white/30 hover:scale-110" style={{background:hex}}/>)}</div>
      </div>
      {solo===layer.id&&<div className="flex justify-between mt-3 text-xs text-gray-400"><button onClick={()=>onMask(layer.id)}>Уточнити маску</button><button onClick={()=>{void encodePng(maskedPixels(image,layer.mask,layer.bounds,layer.foreground)).then(bytes=>downloadBlob(new Blob([Uint8Array.from(bytes).buffer],{type:'image/png'}),`${state.activePart}-${layer.id}.png`)).catch(e=>setError(e.message));}}>Зберегти PNG</button></div>}
    </div>)}</div>
    {target&&colorTarget&&<div className="mt-4 rounded-xl border border-white/15 p-3" data-palette-picker>
      <div className="flex justify-between gap-2 mb-2"><p className="text-xs font-semibold">{target.name}{colorTarget.stop!==undefined?` · колір ${colorTarget.stop+1}`:''}</p><button aria-label="Закрити палітру" onClick={()=>setColorTarget(null)}><X size={14}/></button></div>
      <p className="text-[10px] text-gray-500 mb-2">Виробнича палітра · {factoryPalette.length} кольорів</p>
      <input aria-label="Пошук кольору" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Назва або HEX" className="bg-white/5 rounded p-2 w-full text-xs mb-2"/>
      <div className="grid grid-cols-8 gap-1.5 max-h-44 overflow-auto">{factoryPalette.filter(c=>`${c.name} ${c.hex}`.toLowerCase().includes(filter.toLowerCase())).map((color,index)=><button key={index} aria-label={`Колір ${color.name} ${color.hex}`} title={`${color.name} · ${color.hex}`} style={{background:color.hex}} className="aspect-square rounded border border-white/20 hover:ring-2 hover:ring-white" onClick={()=>state.recolorLayer(target.id,color.hex,colorTarget.stop)}/>)}</div>
      <p className="text-[10px] text-gray-500 mt-2 break-words">{factorySource}</p>
    </div>}
    {error&&<p role="alert" className="text-xs text-orange-300 mt-2">{error}</p>}
    <p className="mt-5 text-xs text-gray-500">Кольорові кружечки відкривають палітру. Для групування відмітьте кілька шарів.</p>
  </aside>;
}

function PresentationPart({part,entry,status,error,onOpen,onTools}:{part:PartId;entry?:PartSession;status?:string;error?:string;onOpen:()=>void;onTools:()=>void}){
  const design=entry?.design,layers=entry?.layers;
  const image=useMemo(()=>design&&layers?composeExtractedLayers(design.source,new ImageData(new Uint8ClampedArray(design.source.data.length),design.source.width,design.source.height),layers):null,[design,layers]);
  return <article data-part={part} className="studio-part">
    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10"><h3 className="font-semibold text-sm">{PART_NAMES[part]}</h3>{image?<CheckCircle2 size={16} className="text-emerald-400"/>:status?<Loader2 size={16} className="animate-spin text-red-400"/>:<span className="text-xs text-gray-600">0{PART_IDS.indexOf(part)+1}</span>}</div>
    <button disabled={!image} onClick={onOpen} aria-label={`Відкрити ${PART_NAMES[part]}`} className={`studio-part-image ${image?'checkerboard':'bg-[#202022]'}`}>
      {image?<RasterPreview image={image}/>:<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-5"><div className={`w-12 h-12 rounded-xl border border-dashed flex items-center justify-center ${status?'text-red-400 border-red-800':'text-gray-600 border-gray-700'}`}>{status?<Loader2 size={22} className="animate-spin"/>:<Layers size={22}/>}</div><span className="text-xs text-gray-500 text-center">{status|| (error?'Потрібна увага':'Тут буде дизайн деталі')}</span></div>}
    </button>
    <div className="px-4 py-3 flex justify-between items-center text-xs"><span className="text-gray-500">{image?`${entry?.layers.length} шарів · ${image.width} × ${image.height}`:'Основа + кольорові принти'}</span>{image&&<button onClick={onOpen} className="text-gray-200 flex items-center gap-1">Шари <ChevronRight size={13}/></button>}</div>
    {status&&image&&<p role="status" className="text-xs text-red-300 p-3">{status}</p>}
    {error&&<div className="p-3 pt-0"><p role="alert" className="text-xs text-orange-300">{error}</p><button className="text-xs text-gray-300 underline mt-2" onClick={onTools}>Уточнити область</button></div>}
  </article>;
}

function OriginalAssetTile({entry,image,onReference,onLocalMask}:{entry:AssetEntry;image:ImageData;onReference:()=>void;onLocalMask:()=>void}){
  const state=useDecomposition(),version=state.assetVariants[entry.id]||{},settings=assetSettingsFor(state,entry),[view,setView]=useState<'result'|'reference'|'local'>('result');
  const [error,setError]=useState('');
  const reference=useMemo(()=>maskedPixels(image,undefined,entry.bbox),[image,entry.bbox]);
  const local=useMemo(()=>entry.layer?maskedPixels(image,entry.layer.mask,entry.layer.bounds,entry.layer.foreground):null,[image,entry.layer]);
  const result=version.proposal||version.accepted,pixels=view==='reference'?reference:view==='local'&&local?local:result?.image||reference;
  const sourceOnly=view==='reference'||(view==='result'&&!result),generating=state.assetGeneratingId===entry.id;
  const updateSettings=(patch:Partial<AssetSettings>)=>useDecomposition.setState(s=>({assetSettings:{...s.assetSettings,[entry.id]:{...settings,...patch}}}));
  const downloadable=version.accepted?.image||(view==='local'?local:null);
  return <article data-asset-id={entry.id} className="rounded-xl border border-white/10 bg-[#1c1c1f] overflow-hidden">
    <div className="flex justify-between items-center px-3 py-2 text-[10px] border-b border-white/10"><label className="flex gap-2 items-center"><input aria-label={`Обрати елемент ${entry.name}`} type="checkbox" className="accent-red-600" checked={state.assetSelection.includes(entry.id)} disabled={!state.assetSelection.includes(entry.id)&&state.assetSelection.length>=8} onChange={e=>useDecomposition.setState(s=>({assetSelection:e.target.checked?[...s.assetSelection,entry.id].slice(0,8):s.assetSelection.filter(id=>id!==entry.id)}))}/>До генерації</label><span className={sourceOnly?'text-gray-500':version.proposal?'text-amber-300':'text-emerald-300'}>{sourceOnly?(entry.verified?'AI-орієнтир · рамка приблизна':'Референс з ескізу'):view==='local'?'Локальне виділення':version.proposal?'AI-пропозиція':'AI · прийнято'}</span></div>
    <div className={`h-56 p-4 flex flex-col items-center justify-center gap-3 ${sourceOnly?'bg-[#242427]':'checkerboard'}`}><div className="min-h-0 max-w-full" style={sourceOnly?{width:Math.min(360,reference.width*2),height:Math.min(150,reference.height*2)}:{width:'100%',height:'100%'}}><RasterPreview image={pixels} className="!w-full !h-full object-contain"/></div>{sourceOnly&&<p className="text-[11px] text-gray-500 text-center">Обрізок ескізу · ще не згенеровано</p>}</div>
    <div className="p-3">
      <div className="flex flex-wrap gap-3 text-xs mb-3">{result&&<button className={view==='result'?'text-white':'text-gray-500'} onClick={()=>setView('result')}>AI-результат</button>}<button className={view==='reference'?'text-white':'text-gray-500'} onClick={()=>setView('reference')}>Оригінал</button>{local&&<button className={view==='local'?'text-white':'text-gray-500'} onClick={()=>setView('local')}>Вирізаний</button>}<span className="ml-auto text-gray-500">{pixels.width} × {pixels.height} px</span></div>
      <input aria-label="Назва елемента" value={entry.name} onChange={e=>{if(entry.layer)state.renameLayer(entry.layer.id,e.target.value);useDecomposition.setState(s=>({assetRegions:assetRegions(s).map(r=>r.id===entry.id?{...r,name:e.target.value}:r),...(s.assetView?{regions:s.regions.map(r=>r.id===entry.id?{...r,name:e.target.value}:r)}:{})}));}} className="bg-transparent text-sm font-semibold w-full"/>
      <input aria-label={`Точний текст ${entry.name}`} maxLength={300} value={settings.text} onChange={e=>updateSettings({text:e.target.value})} placeholder="Точний напис або номер (за потреби)" className="w-full bg-white/5 rounded p-2 text-xs mt-3"/>
      <details className="text-xs text-gray-400 mt-3"><summary>Референс і параметри</summary><div className="space-y-2 mt-2"><select aria-label={`Розмір відтворення ${entry.name}`} value={settings.size} onChange={e=>updateSettings({size:e.target.value as AssetSettings['size']})} className="w-full bg-[#303033] p-2 rounded">{['2048x2048','3072x2048','2048x3072','1024x1024','1536x1024','1024x1536'].map(size=><option key={size} value={size}>{size.replace('x',' × ')} px</option>)}</select><textarea aria-label={`Уточнення ${entry.name}`} value={settings.instructions} maxLength={1500} rows={2} onChange={e=>updateSettings({instructions:e.target.value})} className="w-full bg-white/5 p-2 rounded" placeholder="Кольори, форма, які деталі зберегти…"/><button onClick={onReference} className="underline">Уточнити область на ескізі</button>{entry.layer&&<button className="block underline" onClick={onLocalMask}>Маска локального вирізання</button>}</div></details>
      <button disabled={state.jobBusy||state.assetBusy||state.assetGenerationBusy} className="studio-primary w-full mt-3 disabled:opacity-40" onClick={()=>{setView('result');void reconstructAssets([entry.id]);}}>{generating?<Loader2 size={14} className="animate-spin"/>:<Sparkles size={14}/>} {generating?'Відтворюється…':'AI-відтворити елемент'}</button>
      {version.proposal&&<div data-asset-proposal className="mt-3 p-2 border border-amber-700/40 rounded-lg text-xs"><p className="text-amber-200 mb-2">Реконструкція: перевірте форму, кольори та всі символи.</p><div className="flex gap-3"><button disabled={!matchesVersion(version.proposal,entry,settings)} className="text-emerald-300 disabled:opacity-30" onClick={()=>useDecomposition.setState(s=>({assetVariants:{...s.assetVariants,[entry.id]:{accepted:s.assetVariants[entry.id].proposal}}}))}>Прийняти PNG</button><button className="text-gray-300" onClick={()=>useDecomposition.setState(s=>({assetVariants:{...s.assetVariants,[entry.id]:{accepted:s.assetVariants[entry.id].accepted}}}))}>Відхилити</button></div>{!matchesVersion(version.proposal,entry,settings)&&<p className="mt-2 text-gray-500">Параметри або область змінено. Згенеруйте новий варіант.</p>}</div>}
      <div className="flex gap-3 items-center mt-3 text-xs"><button disabled={!downloadable} className="text-red-300 disabled:opacity-30" onClick={()=>{if(downloadable)void (version.accepted?Promise.resolve(version.accepted.png):encodePng(downloadable)).then(bytes=>downloadBlob(new Blob([Uint8Array.from(bytes).buffer],{type:'image/png'}),`${entry.name.replace(/[^\p{L}\p{N}_-]/gu,'_')||'element'}.png`)).catch(e=>setError(e.message));}}>PNG ↓</button><span className="text-gray-600">{version.accepted?'Прийнятий AI-варіант':local&&view==='local'?'Локальний варіант':'Спочатку прийміть результат'}</span><button disabled={state.assetGenerationBusy} className="ml-auto text-gray-500" aria-label={`Видалити ${entry.name}`} onClick={()=>{if(entry.layer)state.deleteLayer(entry.layer.id);state.deleteRegion(entry.id);useDecomposition.setState(s=>({assetRegions:assetRegions(s).filter(r=>r.id!==entry.id),assetSelection:s.assetSelection.filter(id=>id!==entry.id),assetVariants:Object.fromEntries(Object.entries(s.assetVariants).filter(([id])=>id!==entry.id)),assetSettings:Object.fromEntries(Object.entries(s.assetSettings).filter(([id])=>id!==entry.id))}));}}><Trash2 size={13}/></button></div>
      {(state.assetGenerationErrors[entry.id]||error)&&<p role="alert" className="text-xs text-orange-300 mt-2">{state.assetGenerationErrors[entry.id]||error}</p>}
      {result&&<details className="text-[10px] text-gray-500 mt-3"><summary>Модель та використання API{result.cached?' · з кешу':''}</summary><pre className="whitespace-pre-wrap">{result.model}{'\n'}{JSON.stringify(result.usage,null,2)}</pre></details>}
      {view==='local'&&entry.layer?.extraction?.warnings.map(w=><p key={w} className="text-[10px] text-amber-200 mt-2">{w}</p>)}
    </div>
  </article>;
}
function OriginalAssets({onEdit,onAdd}:{onEdit:(layer?:PrintLayer,region?:DetectedRegion)=>void;onAdd:()=>void}){
  const state=useDecomposition(),image=useEditorStore(s=>s.uploadedImageData),preview=useEditorStore(s=>s.previewImageData);
  const entries=graphicEntries(state),regions=assetRegions(state);
  if(!image||!preview)return null;
  return <main className="studio-results">
    <div className="mb-5"><h2 className="text-lg font-semibold">Герби, номери й написи</h2><p className="text-sm text-gray-500 mt-1">Знайдіть елементи → відтворіть у більшій роздільності → порівняйте й прийміть PNG.</p></div>
    <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-6">
      <aside><div className="relative rounded-xl overflow-hidden bg-white"><RasterPreview image={preview}/>{regions.map(region=><button key={region.id} title={region.name} aria-label={`Уточнити область ${region.name}`} onClick={()=>onEdit(undefined,region)} className="absolute border-2 border-red-500 bg-red-500/10 hover:bg-red-500/30" style={{left:`${region.bbox.x/image.width*100}%`,top:`${region.bbox.y/image.height*100}%`,width:`${region.bbox.width/image.width*100}%`,height:`${region.bbox.height/image.height*100}%`}}/>)}</div><p className="text-xs text-gray-500 mt-3">Рамки приблизні. AI отримує збільшений фрагмент і навколишній контекст; вихідні пікселі зберігаються.</p><button className="studio-soft mt-3 w-full" onClick={onAdd}>Додати область вручну</button><details className="text-xs text-gray-500 mt-4"><summary>Локальні інструменти</summary><button disabled={state.assetBusy||state.assetGenerationBusy} className="studio-soft w-full mt-2" onClick={()=>void extractOriginalAssets(true)}>Локально без AI</button><p className="mt-2">Вирізання з оригіналу підходить для чітких зображень. Дрібні JPEG-елементи можуть потребувати AI-відтворення.</p></details></aside>
      <div>{(state.assetProgress||state.assetGenerationProgress)&&<p role="status" className="text-sm text-gray-300 mb-4">{(state.assetBusy||state.assetGenerationBusy)&&<Loader2 size={14} className="inline animate-spin mr-2"/>}{state.assetGenerationProgress||state.assetProgress}</p>}{state.assetError&&<p role="alert" className="text-sm text-orange-300 mb-4">{state.assetError}</p>}
        {!entries.length&&!state.assetBusy&&<div className="rounded-xl border border-dashed border-white/15 text-gray-500 p-8 mb-4 text-sm">Натисніть «Знайти елементи» або додайте область вручну.</div>}
        {state.assetVerification&&state.assetVerification.rejected.length>0&&<details className="text-xs text-gray-500 mb-4"><summary>Відсіяно непідтверджених областей: {state.assetVerification.rejected.length}</summary>{state.assetVerification.rejected.map(r=><p key={r.id} className="mt-1">{r.name}: {r.reason}</p>)}</details>}<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">{entries.map(entry=>{const variant=state.assetVariants[entry.id];return <OriginalAssetTile key={`${entry.id}-${variant?.proposal?'proposal':variant?.accepted?'accepted':'reference'}`} entry={entry} image={image} onReference={()=>onEdit(regions.some(r=>r.id===entry.id)?undefined:entry.layer,regions.find(r=>r.id===entry.id))} onLocalMask={()=>onEdit(entry.layer)}/>;})}</div>
        <p className="text-xs text-gray-500 mt-5">Кожен запуск відтворення — платний Images Edit запит. Оберіть до 8 елементів. AI реконструює, а не відновлює невідому справжню деталізацію; перевірте герби, цифри й літери. У ZIP входять лише прийняті AI-варіанти та явно вирізані локальні елементи.</p>
      </div>
    </div>
  </main>;
}

export function StudioWorkspace(){
  const state=useDecomposition(),editor=useEditorStore();
  const [screen,setScreen]=useState<'overview'|'part'|'tools'|'assets'>('overview');
  const [gallery,setGallery]=useState(false);
  const [presentation,setPresentation]=useState(false);
  const [queuePosition,setQueuePosition]=useState(0);
  const [reconnecting,setReconnecting]=useState(false);
  const demoController=useRef<AbortController|null>(null);
  const [solo,setSolo]=useState<string|null>(null);
  const [showReference,setShowReference]=useState<boolean|null>(null);
  const [uploading,setUploading]=useState(false);
  const [exporting,setExporting]=useState(false);
  const [fileError,setFileError]=useState('');
  const [dragging,setDragging]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  const uploadEpoch=useRef(0);
  const {factoryPalette,factorySource}=useProductionPalette();
  useEffect(()=>useEditorStore.subscribe((current,previous)=>{if(current.uploadedImageData!==previous.uploadedImageData)useDecomposition.getState().resetImage();}),[]);
  useEffect(()=>()=>{uploadEpoch.current++;demoController.current?.abort();},[]);
  useEffect(()=>{
    const update=(event:Event)=>{const data=(event as CustomEvent<{position:number;state:string}>).detail;setQueuePosition(data.position||0);setReconnecting(data.state==='reconnecting');};
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setGallery(false);};
    window.addEventListener('studio-job-state',update);window.addEventListener('keydown',close);
    return ()=>{window.removeEventListener('studio-job-state',update);window.removeEventListener('keydown',close);};
  },[]);
  const entries=allParts(state),ready=PART_IDS.filter(id=>entries[id]?.design).length;
  const busy=state.jobBusy||state.assetBusy||state.assetGenerationBusy||Object.values(state.partStatus).some(Boolean);
  const assetCount=exportedAssetCount(state);
  const foundAssetCount=graphicEntries(state).length;
  const referenceVisible=showReference??(ready===0);
  const preview=useMemo(()=>{
    if(!state.design)return null;
    const image=state.design.source,layer=state.layers.find(l=>l.id===solo);
    return layer?maskedPixels(image,layer.mask,layer.bounds,layer.foreground):composeExtractedLayers(image,new ImageData(new Uint8ClampedArray(image.data.length),image.width,image.height),state.layers);
  },[state.design,state.layers,solo]);
  const load=async(file?:File)=>{
    if(!file)return;
    demoController.current?.abort();
    const epoch=++uploadEpoch.current;setUploading(true);setFileError('');
    try{
      const result=await loadSketch(file);
      if(epoch!==uploadEpoch.current){URL.revokeObjectURL(result.url);return;}
      const old=useEditorStore.getState().uploadedImageUrl;
      useEditorStore.getState().setUploadedFile(file,result.url,result.original,result.preview);
      if(old?.startsWith('blob:'))URL.revokeObjectURL(old);
      setScreen('overview');setSolo(null);setShowReference(null);
    }catch(e){if(epoch===uploadEpoch.current)setFileError(e instanceof Error?e.message:'Не вдалося відкрити макет.');}
    finally{if(epoch===uploadEpoch.current)setUploading(false);}
  };
  const openDemo=async(id:string)=>{
    demoController.current?.abort();const controller=new AbortController();demoController.current=controller;
    const epoch=++uploadEpoch.current;setUploading(true);setFileError('');
    try{
      const demo=await loadDemoProject(id,controller.signal);
      if(epoch!==uploadEpoch.current){URL.revokeObjectURL(demo.loaded.url);return;}
      const documents:Partial<Record<PartId,PartSession>>={};
      for(const part of demo.parts){
        const aspect=(Object.entries(PART_SIZES).find(([,size])=>size===`${part.master.width}x${part.master.height}`)?.[0]||'portrait') as PartAspect;
        const layers:PrintLayer[]=part.layers.map(l=>({...l,source:'estimated-foreground',groupId:l.groupId||undefined,fillHex:l.fillHex||undefined,gradient:l.gradient||undefined,foreground:{image:l.image,bounds:l.bounds}}));
        documents[part.id]={...emptyPart(),design:{source:part.master,sourceUrl:await pngDataUrl(part.master),labelMap:'',model:part.model,usage:part.usage,baseHex:layers.find(l=>l.type==='background')?.fillHex||'#000000',instructions:'',view:part.id,aspect,warnings:part.warnings,groups:part.groups,referenceRect:part.sourceRect},layers};
      }
      const regions:DetectedRegion[]=demo.elements.map(e=>({id:e.id,name:e.name,type:e.type,bbox:e.sourceBounds,confidence:0,description:'Прийнята реконструкція зі збереженого демопроєкту.',manual:false}));
      const variants:Record<string,AssetVariants>={},settings:Record<string,AssetSettings>={};
      for(const e of demo.elements){settings[e.id]=e.settings;variants[e.id]={accepted:{image:e.image,png:e.png,sourceRect:e.sourceBounds,settings:e.settings,model:e.model,usage:e.usage,cached:false}};}
      if(epoch!==uploadEpoch.current){URL.revokeObjectURL(demo.loaded.url);return;}
      const old=useEditorStore.getState().uploadedImageUrl;
      useEditorStore.getState().setUploadedFile(demo.file,demo.loaded.url,demo.loaded.original,demo.loaded.preview);
      useDecomposition.setState({...documents.front,documents,demoProject:{id:demo.manifest.id,title:demo.manifest.title,notes:demo.manifest.notes,sourceArchiveSha256:demo.manifest.sourceArchiveSha256},assetRegions:regions,assetVariants:variants,assetSettings:settings,assetSelection:regions.map(e=>e.id),assetAnalyzed:true,jobMessage:'Завантажено збережений результат. Нових AI-запитів не було.'});
      useEditorStore.setState({workingImageData:documents.front!.design!.source,workingPreview:documents.front!.design!.source});
      if(old?.startsWith('blob:'))URL.revokeObjectURL(old);
      setScreen('overview');setSolo(null);setShowReference(true);setGallery(false);setPresentation(false);
    }catch(e){if(epoch===uploadEpoch.current&&!controller.signal.aborted)setFileError(e instanceof Error?e.message:'Не вдалося відкрити демонстрацію.');}
    finally{if(epoch===uploadEpoch.current)setUploading(false);}
  };
  const presentationProfile=()=>{
    for(const part of PART_IDS){const aspect=state.partSettings[part].aspect.replace('-2k','');state.configurePart(part,{aspect:`${aspect}-2k` as PartAspect,engine:'precise'});}
    useDecomposition.setState(s=>({includeTiff:true,assetSettings:Object.fromEntries(graphicEntries(s).map(e=>[e.id,{...assetSettingsFor(s,e),size:defaultAssetSettings(e).size}]))}));
    setPresentation(true);
  };
  const demoGallery=<section className="studio-demo-gallery" aria-label="Готові демонстрації">
    <div className="text-left"><h2 className="font-semibold text-lg">Подивитися без очікування</h2><p className="text-xs text-gray-500 mt-1">Справжні збережені проєкти. Відкриття не запускає аналіз або генерацію.</p></div>
    <div className="studio-demo-grid">{DEMO_PROJECTS.map(d=><button key={d.id} data-demo={d.id} className="studio-demo-card" disabled={uploading||busy||exporting} onClick={()=>void openDemo(d.id)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={d.cover} alt={`Початковий ескіз ${d.title}`} width={210} height={210}/><span className="text-left"><strong className="block text-sm">{d.title}</strong><span className="block text-xs text-gray-400 mt-2">{d.description}</span><span className="block text-xs text-red-300 mt-4">{uploading?'Завантажуємо проєкт…':'Відкрити готовий проєкт →'}</span></span>
    </button>)}</div>
  </section>;
  const openPart=(part:PartId)=>{state.switchPart(part);setSolo(null);setScreen('part');};
  const showOverview=()=>{if(state.assetView)state.switchPart(state.activePart);setScreen('overview');};
  const showAssets=()=>{state.switchAssets();setScreen('assets');};
  const editAsset=(layer?:PrintLayer,region?:DetectedRegion)=>{
    state.switchAssets();const s=useDecomposition.getState();
    if(layer)s.editLayer(layer.id);else{s.newMask();s.selectRegion(region?.id??null);s.setPreview('original');s.setMode('rect');}
    setScreen('tools');
  };
  const tools=(part?:PartId)=>{if(part)state.switchPart(part);setScreen('tools');if(part&&!entries[part]?.design)useDecomposition.getState().showSource();};
  const exportProject=async()=>{
    if(exporting||busy||(!ready&&!assetCount))return;
    setExporting(true);setFileError('');useDecomposition.setState({exportProgress:'Готуємо файли…'});
    try{await exportPartProject(factoryPalette,factorySource);}catch(e){setFileError(e instanceof Error?e.message:'Не вдалося створити ZIP.');}finally{setExporting(false);useDecomposition.setState({exportProgress:''});}
  };
  return <div className="studio-shell" onDragOver={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();setDragging(true);}}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false);}} onDrop={e=>{e.preventDefault();setDragging(false);void load(e.dataTransfer.files[0]);}}>
    <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" aria-label="Завантажити макет" onChange={e=>{void load(e.target.files?.[0]);e.target.value='';}}/>
    <header className="studio-header">
      <div className="flex items-center gap-3 shrink-0">
        <Link href="/" onClick={()=>useAppStore.getState().navigateTo('landing')} className="text-left shrink-0"><span className="font-semibold tracking-tight text-lg"><span className="text-[#ec2439]">AI</span> Print Studio</span></Link>
        <Link href="/" onClick={()=>useAppStore.getState().navigateTo('landing')} className="text-xs text-gray-400 hover:text-white transition-colors">← На головну (Лендінг)</Link>
      </div>
      <div className="studio-steps" aria-label="Етап роботи">{['Макет','Обробка','Результат'].map((name,i)=><span key={name} className={`flex items-center gap-2 ${i===(busy?1:(ready||assetCount)?2:0)?'text-white':'text-gray-500'}`}><span className={`studio-step ${i===(busy?1:(ready||assetCount)?2:0)?'studio-step-active':''}`}>{(i===0&&editor.uploadedImageData)||(i===1&&ready===4)?<Check size={12}/>:i+1}</span>{name}{i<2&&<ChevronRight size={14} className="ml-2 mr-2 text-gray-700"/>}</span>)}</div>
      <div className="flex items-center gap-2"><button className="studio-soft" onClick={() => window.open('/size-charts', '_blank')}>Таблиці розмірів</button><button className="studio-soft" disabled={busy||uploading||exporting} onClick={()=>setGallery(true)}>Демонстрації</button>{editor.uploadedImageData&&<><button className="studio-soft" onClick={()=>fileRef.current?.click()} disabled={uploading||exporting}><Upload size={14}/>Інший макет</button><button className={`studio-soft ${screen==='tools'?'text-red-300':''}`} onClick={()=>screen==='tools'?(state.assetView?showAssets():showOverview()):tools()}><Settings2 size={14}/><span className="hidden sm:inline">Інструменти</span></button></>}</div>
    </header>
    {gallery&&<div className="studio-demo-overlay" role="dialog" aria-modal="true" aria-label="Демонстраційні проєкти"><div className="studio-demo-dialog"><button className="studio-soft mb-4 ml-auto" aria-label="Закрити демонстрації" onClick={()=>setGallery(false)}><X size={16}/>Закрити</button>{demoGallery}</div></div>}
    {fileError&&<div role="alert" className="studio-alert">{fileError}<button aria-label="Закрити помилку" onClick={()=>setFileError('')}><X size={16}/></button></div>}
    {dragging&&<div className="studio-drop-overlay pointer-events-none"><Upload size={42}/><p>Відпустіть, щоб відкрити макет</p></div>}
    {!editor.uploadedImageData?<main className="studio-welcome">
      <div className="studio-eyebrow">ВІД ЕСКІЗУ ДО ШАРІВ ПРИНТА</div><h1>Один макет.<br/><span className="text-gray-500">Чотири деталі.</span></h1>
      <p className="text-gray-400 text-base max-w-md leading-relaxed">Завантажте вигляд форми спереду та ззаду.<br/>Отримайте перед, спинку й два рукави — з окремими шарами фону та принтів.</p>
      <button className="studio-upload-zone" disabled={uploading} onClick={()=>fileRef.current?.click()}>{uploading?<Loader2 className="animate-spin" size={28}/>:<Upload size={28}/>}<span className="font-semibold text-lg">{uploading?'Відкриваємо макет…':'Завантажити макет'}</span><span className="text-sm text-gray-500">або перетягніть JPEG / PNG сюди · до 20 МБ</span></button>
      <div className="flex flex-wrap justify-center gap-5 text-xs text-gray-500"><span>01 Завантажте</span><ArrowRight size={14}/><span>02 Запустіть обробку</span><ArrowRight size={14}/><span>03 Перегляньте й експортуйте</span></div>
      {demoGallery}
    </main>:<>
      <div className="studio-project-bar"><div className="min-w-0"><p className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">{screen==='tools'?'Детальне редагування':screen==='part'?'Шари та кольори':'Робочий проєкт'}</p><h1 className="text-xl font-semibold truncate">{screen==='part'?PART_NAMES[state.activePart]:editor.uploadedFile?.name||'Новий макет'}</h1></div>
        <div className="flex items-center gap-2 flex-wrap justify-end">{screen!=='overview'?<button className="studio-soft" onClick={()=>screen==='tools'&&state.assetView?showAssets():showOverview()}><ArrowLeft size={15}/>{screen==='tools'&&state.assetView?'Герби й номери':'Усі 4 деталі'}</button>:<button className="studio-soft" onClick={()=>setShowReference(!referenceVisible)}><ImageIcon size={15}/>{referenceVisible?'Сховати ескіз':'Ескіз'}</button>}
          {busy?<button className="studio-soft text-red-300" onClick={cancelPartJob}><X size={14}/>Зупинити</button>:screen==='assets'?<button className="studio-primary" disabled={foundAssetCount>0&&!state.assetSelection.length} onClick={()=>foundAssetCount>0?void reconstructAssets(state.assetSelection):void extractOriginalAssets()}>{foundAssetCount>0?<Sparkles size={16}/>:<ScanSearch size={16}/>} {foundAssetCount>0?`Згенерувати вибрані (${state.assetSelection.length})`:'Знайти елементи'}</button>:ready<4&&<button className="studio-primary" disabled={uploading||exporting} onClick={()=>{showOverview();void runParts();}}><Sparkles size={16}/>{ready?'Достворити деталі':'Розкласти макет'}</button>}
          {(ready>0||assetCount>0)&&<button className={ready===4?'studio-primary':'studio-soft'} disabled={busy||exporting} onClick={()=>void exportProject()}>{exporting?<Loader2 size={15} className="animate-spin"/>:<Download size={15}/>}Завантажити ZIP</button>}
        </div>
      </div>
      {busy&&reconnecting&&<p role="status" className="px-9 pb-3 text-xs text-amber-200">Відновлюємо зв’язок із сервером. Генерація повторно не запускається.</p>}
      {busy&&queuePosition>0&&<p role="status" className="px-9 pb-3 text-xs text-amber-200">У черзі: перед вами {queuePosition} операцій. Новий платний запит не повторюється.</p>}
      {state.demoProject&&<div className="studio-demo-banner"><strong>Демо · {state.demoProject.title}</strong><span>Збережена генерація 1K · шари, кольори й експорт без нових AI-запитів.</span></div>}
      <div className="px-4 sm:px-9 pb-4 flex flex-wrap gap-3 items-center"><button className="studio-soft" disabled={busy||uploading||exporting} onClick={presentationProfile}>{presentation?'Профіль презентації увімкнено':'Увімкнути профіль презентації'}</button><span className="text-xs text-gray-500">2K · детальний режим · TIFF у ZIP · генерація лише за вашим натисканням</span></div>
      <nav className="flex flex-wrap items-center gap-2 mx-4 sm:mx-9 mb-4" aria-label="Результати декомпозиції"><button className={`studio-tab ${!state.assetView?'studio-tab-active':''}`} onClick={showOverview}>Чотири деталі</button><button aria-label="Герби й номери" className={`studio-tab ${state.assetView?'studio-tab-active':''}`} onClick={showAssets}>Герби й номери <span className="ml-2 text-gray-500">{state.assetBusy?'…':foundAssetCount}{state.assetError?' !':''}</span></button><label className="ml-auto flex gap-2 items-center text-xs text-gray-400">Нові генерації<select aria-label="Якість нових деталей" className="bg-[#252529] rounded p-2 text-xs" value={state.partSettings.front.aspect.endsWith('-2k')?'detail':'standard'} disabled={busy} onChange={e=>{const detail=e.target.value==='detail';for(const part of PART_IDS){const aspect=state.partSettings[part].aspect.replace('-2k','');state.configurePart(part,{aspect:(aspect+(detail?'-2k':'')) as PartAspect});}}}><option value="detail">Детальна · 2K</option><option value="standard">Економна · 1K</option></select></label><label className="flex gap-2 items-center text-xs text-gray-400"><input aria-label="TIFF у ZIP" type="checkbox" checked={state.includeTiff} onChange={e=>useDecomposition.setState({includeTiff:e.target.checked})} disabled={exporting} className="accent-red-600"/>TIFF у ZIP</label></nav>{state.exportProgress&&<p role="status" className="px-9 pb-3 text-xs text-gray-400">{state.exportProgress}</p>}
      {(state.jobBusy||Object.values(state.partStatus).some(Boolean)||state.jobError||(screen==='overview'&&state.jobMessage))&&<div className={`studio-job ${state.jobError?'text-orange-300':''}`} aria-live="polite">{busy?<Loader2 size={16} className="animate-spin text-red-400"/>:ready===4?<CheckCircle2 size={16} className="text-emerald-400"/>:null}<span role={state.jobError?'alert':'status'}>{state.jobError||(state.assetBusy?state.assetProgress:state.jobMessage)}</span><span className="ml-auto text-gray-500 text-xs shrink-0">{ready} / 4 деталей</span></div>}
      {screen==='assets'?<OriginalAssets onEdit={editAsset} onAdd={()=>editAsset()}/>:screen==='tools'?<div className="flex flex-1 min-h-0 overflow-hidden"><div className="flex-1 min-w-0"><DecompositionCanvas/></div><div className="w-80 shrink-0 overflow-auto"><DecompositionSidebar/></div></div>:screen==='part'&&preview?<div className="studio-detail">
        <div className="min-w-0 flex flex-col"><div className="flex gap-2 flex-wrap mb-4">{PART_IDS.map(part=><button key={part} disabled={!entries[part]?.design} className={`studio-tab ${state.activePart===part?'studio-tab-active':''}`} onClick={()=>openPart(part)}>{PART_NAMES[part]}</button>)}</div>
          <div className="studio-detail-canvas checkerboard"><RasterPreview image={preview}/></div><p className="text-xs text-gray-500 mt-3">{solo?state.layers.find(l=>l.id===solo)?.name:'Композиція всіх видимих шарів'} · {preview.width} × {preview.height} px</p>
        </div><QuickLayers key={state.activePart} solo={solo} onSolo={setSolo} onMask={id=>{state.editLayer(id);setScreen('tools');}}/>
      </div>:<main className="studio-results">
        <div className="flex items-end justify-between gap-4 mb-5"><div><h2 className="text-lg font-semibold">Чотири деталі форми</h2><p className="text-sm text-gray-500 mt-1">{ready?'Натисніть на деталь, щоб переглянути шари та змінити кольори.':'Натисніть «Розкласти макет» — деталі обробляються послідовно.'}</p></div><span className="text-xs text-gray-500 shrink-0">{ready} з 4 створено</span></div>
        <div className={`studio-results-layout ${referenceVisible?'with-reference':''}`}>
          {referenceVisible&&editor.previewImageData&&<aside className="studio-reference"><span className="studio-eyebrow mb-3 block">ПОЧАТКОВИЙ ЕСКІЗ</span><div className="rounded-xl overflow-hidden bg-white"><RasterPreview image={editor.previewImageData}/></div><p className="text-xs text-gray-500 mt-3">Оригінал збережено без змін.</p></aside>}
          <div className="studio-parts-grid">{PART_IDS.map(part=><PresentationPart key={part} part={part} entry={entries[part]} status={state.partStatus[part]} error={state.partErrors[part]} onOpen={()=>openPart(part)} onTools={()=>tools(part)}/>)}</div>
        </div>
        <div className="studio-results-note">{ready===0?'Один запуск: пошук і перевірка елементів та деталей (до 5 Vision-запитів) + до 8 платних AI-операцій. Готові деталі повторно не генеруються.':'Принти продовжено пропорційно. Невидимі ділянки реконструйовано; результат перевіряє конструктор.'}</div>
        {ready===0&&!busy&&!state.jobError&&<p className="text-xs text-gray-600 mt-2">Області й параметри можна уточнити у «Інструментах». Герби, номери й написи зберігаються окремо у вкладці «Герби й номери».</p>}
      </main>}
    </>}
  </div>;
}
