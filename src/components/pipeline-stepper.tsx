'use client';

import { motion } from 'framer-motion';
import { Upload, Layers, Palette, Download, Check, Loader2 } from 'lucide-react';
import { usePipelineStore, type PipelineStep } from '@/store/pipeline-store';

const steps: Array<{ step: PipelineStep; label: string; icon: typeof Upload }> = [
  { step: 1, label: 'Вхідний макет та AI-апскейл', icon: Upload },
  { step: 2, label: 'Декомпозиція та Розгортка', icon: Layers },
  { step: 3, label: 'Кольори та CMYK-мепінг', icon: Palette },
  { step: 4, label: 'Експорт для Illustrator', icon: Download },
];

export function PipelineStepper() {
  const { currentStep, setStep, isComplete, isProcessing } = usePipelineStore();

  return (
    <div className="flex items-center justify-center gap-0 w-full max-w-4xl mx-auto mb-8">
      {steps.map((s, i) => {
        const isActive = currentStep === s.step;
        const isDone = isComplete && s.step <= currentStep;
        const isAccessible = isComplete || s.step === 1;

        return (
          <div key={s.step} className="flex items-center flex-1 last:flex-initial">
            <motion.button
              whileHover={isAccessible ? { scale: 1.05 } : {}}
              whileTap={isAccessible ? { scale: 0.95 } : {}}
              onClick={() => isAccessible && setStep(s.step)}
              disabled={!isAccessible || isProcessing}
              className={`
                relative flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer
                disabled:cursor-not-allowed
                ${isActive
                  ? 'bg-gradient-to-r from-sport-red to-sport-red-dark text-white shadow-lg shadow-red-200/40'
                  : isDone
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-white text-muted-gray border border-gray-200 hover:border-gray-300'
                }
              `}
            >
              <div className={`
                flex items-center justify-center w-7 h-7 rounded-lg shrink-0
                ${isActive ? 'bg-white/20' : isDone ? 'bg-emerald-100' : 'bg-gray-100'}
              `}>
                {isProcessing && isActive ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : isDone ? (
                  <Check size={14} strokeWidth={3} />
                ) : (
                  <s.icon size={14} />
                )}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-[10px] font-medium opacity-60 uppercase tracking-wider">Крок {s.step}</div>
                <div className="text-xs font-semibold leading-tight whitespace-nowrap">{s.label}</div>
              </div>
              <div className="sm:hidden">
                <div className="text-[10px] font-bold">{s.step}</div>
              </div>
            </motion.button>

            {i < steps.length - 1 && (
              <div className="flex-1 h-[2px] mx-2 relative">
                <div className="absolute inset-0 bg-gray-200 rounded-full" />
                {isDone && (
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full"
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
