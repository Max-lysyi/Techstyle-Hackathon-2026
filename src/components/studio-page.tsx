'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { FloatingNav } from '@/components/floating-nav';
import { PipelineStepper } from '@/components/pipeline-stepper';
import { StepUpload } from '@/components/step-upload';
import { StepDecompose } from '@/components/step-decompose';
import { StepColors } from '@/components/step-colors';
import { StepExport } from '@/components/step-export';
import { TerminalLog } from '@/components/terminal-log';
import { usePipelineStore } from '@/store/pipeline-store';
import { Sparkles, Zap, Layers, Palette, FileImage, ArrowDown } from 'lucide-react';

function HeroSection() {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-charcoal-dark via-charcoal to-charcoal-dark">
      {/* Diagonal geometric split */}
      <div className="absolute inset-0">
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 1440 400">
          <defs>
            <linearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#D90416" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#B8000F" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <polygon points="0,0 1440,0 1440,200 0,400" fill="url(#heroGrad)" />
          <polygon points="900,0 1440,0 1440,400 600,400" fill="rgba(217,4,22,0.03)" />
        </svg>
      </div>
      <div className="absolute inset-0 grid-pattern" />

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-28 pb-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          {/* Title */}
          <div className="mb-4">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black italic tracking-tight text-white leading-none mb-2">
              <span className="text-sport-red">AI</span> PRINT{' '}
              <span className="text-sport-red">STUDIO</span>
            </h1>
            <p className="text-sm sm:text-base text-gray-400 max-w-xl mx-auto leading-relaxed">
              Автоматична декомпозиція дизайнів, AI-апскейлінг та підготовка
              розгорток лекал для сублімаційного друку
            </p>
          </div>

          {/* Feature pills */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="flex flex-wrap items-center justify-center gap-2 mb-6"
          >
            {[
              { icon: Zap, label: 'Real-ESRGAN 4×' },
              { icon: Layers, label: 'SAM2 + LaMa' },
              { icon: Palette, label: 'CIELAB K-Means' },
              { icon: FileImage, label: 'CMYK TIFF 300 DPI' },
            ].map((pill, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] text-gray-300 font-medium"
              >
                <pill.icon size={12} className="text-sport-red" />
                {pill.label}
              </span>
            ))}
          </motion.div>

          {/* Scroll hint */}
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            className="text-gray-500"
          >
            <ArrowDown size={18} className="mx-auto" />
          </motion.div>
        </motion.div>
      </div>

      {/* Bottom edge */}
      <svg className="relative -mb-1 w-full" viewBox="0 0 1440 60" preserveAspectRatio="none">
        <path d="M0,60 L0,30 Q720,0 1440,30 L1440,60 Z" fill="#F3F4F6" />
      </svg>
    </div>
  );
}

function WorkspaceContent() {
  const { currentStep } = usePipelineStore();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentStep}
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -15 }}
        transition={{ duration: 0.3 }}
      >
        {currentStep === 1 && <StepUpload />}
        {currentStep === 2 && <StepDecompose />}
        {currentStep === 3 && <StepColors />}
        {currentStep === 4 && <StepExport />}
      </motion.div>
    </AnimatePresence>
  );
}

export default function StudioPage() {
  return (
    <main className="min-h-screen bg-pearl">
      <FloatingNav />
      <HeroSection />

      {/* Workspace */}
      <section className="relative px-4 sm:px-6 py-10 max-w-7xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-gray-200 shadow-sm mb-4">
            <Sparkles size={14} className="text-sport-red" />
            <span className="text-xs font-semibold text-deep">Виробничий конвеєр</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black italic tracking-tight text-deep">
            РОБОЧА <span className="text-sport-red">ЗОНА</span>
          </h2>
        </div>

        <PipelineStepper />
        <WorkspaceContent />
        <TerminalLog />
      </section>

      {/* Footer */}
      <footer className="bg-charcoal-dark text-gray-400 py-8 mt-16">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-baseline gap-1 select-none">
            <span className="text-lg font-black italic tracking-tight text-sport-red">MAX</span>
            <span className="text-lg font-black italic tracking-tight text-white">SPORT</span>
            <span className="ml-2 text-xs text-gray-500">AI Print Studio v3.2.0</span>
          </div>
          <div className="text-xs text-gray-500">
            © 2026 MAXSport · maxsport.ua · Clotecs Hackathon
          </div>
        </div>
      </footer>
    </main>
  );
}
