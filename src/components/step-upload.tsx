'use client';

import { useCallback, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, ImagePlus, Zap, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { usePipelineStore } from '@/store/pipeline-store';
import { drawJerseySVG } from '@/lib/svg-generators';

export function StepUpload() {
  const {
    isProcessing, isComplete, isDemoLoaded,
    originalImage, upscaledImage,
    originalMeta, upscaledMeta,
    loadDemo, processUserImage,
    processingProgress, processingStage,
  } = usePipelineStore();

  const [sliderPos, setSliderPos] = useState(50);
  const [isDragOver, setIsDragOver] = useState(false);
  const sliderContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const originalSvg = useMemo(() => drawJerseySVG({ width: 400, height: 500, blur: true }), []);
  const upscaledSvg = useMemo(() => drawJerseySVG({ width: 400, height: 500, blur: false }), []);

  const handleSliderMove = useCallback((clientX: number) => {
    if (!sliderContainerRef.current) return;
    const rect = sliderContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    handleSliderMove(e.clientX);
  }, [handleSliderMove]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (e.buttons > 0) {
      handleSliderMove(e.clientX);
    }
  }, [handleSliderMove]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      processUserImage(files[0]);
    }
  }, [processUserImage]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processUserImage(files[0]);
    }
  }, [processUserImage]);

  if (!isComplete && !isProcessing) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-3xl mx-auto"
      >
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`
            relative rounded-2xl border-2 border-dashed transition-all duration-300 overflow-hidden
            ${isDragOver
              ? 'border-sport-red bg-red-50/50 scale-[1.01]'
              : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50/50'
            }
          `}
        >
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
            <motion.div
              animate={isDragOver ? { scale: 1.1, rotate: 5 } : { scale: 1, rotate: 0 }}
              className={`
                w-20 h-20 rounded-2xl flex items-center justify-center mb-6 transition-colors duration-300
                ${isDragOver ? 'bg-sport-red text-white' : 'bg-pearl text-muted-gray'}
              `}
            >
              <Upload size={32} strokeWidth={1.5} />
            </motion.div>

            <h3 className="text-lg font-bold text-deep mb-2">
              Перетягніть макет сюди
            </h3>
            <p className="text-sm text-muted-gray mb-1">
              JPEG або PNG — зображення спортивної форми, AI-концепт або фото з телефону
            </p>
            <p className="text-xs text-muted-gray/60 mb-8">
              Підтримуються файли від 50 КБ. Система автоматично виконає AI-апскейлінг до 300 DPI.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileSelect}
              />
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-deep shadow-sm hover:shadow-md transition-all cursor-pointer"
              >
                <ImagePlus size={16} />
                Обрати файл
              </motion.button>

              <span className="text-xs text-muted-gray">або</span>

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => loadDemo()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-sport-red to-sport-red-dark text-white text-sm font-bold shadow-lg shadow-red-200/40 hover:shadow-xl hover:shadow-red-300/50 transition-all cursor-pointer"
              >
                <Sparkles size={16} />
                Завантажити демо-макет
              </motion.button>
            </div>
          </div>

          {/* Animated scanning line on drag over */}
          <AnimatePresence>
            {isDragOver && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 pointer-events-none"
              >
                <div className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-sport-red to-transparent animate-scan-line" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    );
  }

  if (isProcessing) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto"
      >
        <div className="rounded-2xl bg-white border border-gray-100 shadow-xl overflow-hidden">
          <div className="p-8 text-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-r from-sport-red to-sport-red-dark flex items-center justify-center"
            >
              <Zap size={28} className="text-white" />
            </motion.div>

            <h3 className="text-lg font-bold text-deep mb-2">AI-обробка макету</h3>
            <p className="text-sm text-muted-gray mb-6">{processingStage}</p>

            <div className="w-full max-w-md mx-auto">
              <div className="flex justify-between text-xs text-muted-gray mb-1.5">
                <span>Прогрес</span>
                <span>{processingProgress}%</span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-sport-red to-sport-red-dark rounded-full relative"
                  initial={{ width: 0 }}
                  animate={{ width: `${processingProgress}%` }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="absolute inset-0 animate-shimmer" />
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-4xl mx-auto space-y-4"
    >
      {/* Metrics badges */}
      <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
        <Badge variant="outline" className="px-3 py-1.5 text-xs font-mono bg-white border-gray-200">
          <span className="text-muted-gray">Вхід:</span>
          <span className="ml-1.5 font-semibold text-deep">
            {originalMeta?.format} ({originalMeta?.size}, {originalMeta?.dpi} DPI)
          </span>
        </Badge>
        <ArrowRight size={14} className="text-sport-red" />
        <Badge variant="outline" className="px-3 py-1.5 text-xs font-mono bg-emerald-50 border-emerald-200 text-emerald-700">
          <Sparkles size={12} className="mr-1" />
          <span>Вихід:</span>
          <span className="ml-1.5 font-semibold">
            Деталізований растр ({upscaledMeta?.dpi} DPI)
          </span>
        </Badge>
      </div>

      {/* Before/After Slider */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-xl overflow-hidden">
        <div
          ref={sliderContainerRef}
          className="relative w-full aspect-[4/3] sm:aspect-[16/10] overflow-hidden cursor-col-resize select-none bg-charcoal-dark"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
        >
          {/* Upscaled (Right / Full background) */}
          <div className="absolute inset-0 flex items-center justify-center">
            {isDemoLoaded ? (
              <div
                className="w-full h-full flex items-center justify-center p-8"
                dangerouslySetInnerHTML={{ __html: upscaledSvg }}
              />
            ) : upscaledImage ? (
              <img
                src={upscaledImage}
                alt="Upscaled"
                className="w-full h-full object-contain"
                draggable={false}
              />
            ) : null}
          </div>

          {/* Original (Left / Clipped) */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              {isDemoLoaded ? (
                <div
                  className="w-full h-full flex items-center justify-center p-8"
                  dangerouslySetInnerHTML={{ __html: originalSvg }}
                />
              ) : originalImage ? (
                <img
                  src={originalImage}
                  alt="Original"
                  className="w-full h-full object-contain"
                  style={{ filter: 'blur(2px) brightness(0.95)' }}
                  draggable={false}
                />
              ) : null}
            </div>
          </div>

          {/* Slider handle */}
          <div
            className="absolute top-0 bottom-0 z-10"
            style={{ left: `${sliderPos}%`, transform: 'translateX(-50%)' }}
          >
            <div className="w-[3px] h-full bg-white shadow-lg" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-xl flex items-center justify-center border-2 border-sport-red">
              <div className="flex items-center gap-0.5">
                <div className="w-0 h-0 border-y-[5px] border-y-transparent border-r-[6px] border-r-sport-red" />
                <div className="w-0 h-0 border-y-[5px] border-y-transparent border-l-[6px] border-l-sport-red" />
              </div>
            </div>
          </div>

          {/* Labels */}
          <div className="absolute top-4 left-4 z-20">
            <span className="px-3 py-1 rounded-full bg-black/60 backdrop-blur-sm text-white text-xs font-semibold">
              Оригінал (72 DPI)
            </span>
          </div>
          <div className="absolute top-4 right-4 z-20">
            <span className="px-3 py-1 rounded-full bg-gradient-to-r from-sport-red to-sport-red-dark text-white text-xs font-semibold shadow-lg">
              <Sparkles size={11} className="inline mr-1 -mt-0.5" />
              AI-апскейл (300 DPI)
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
