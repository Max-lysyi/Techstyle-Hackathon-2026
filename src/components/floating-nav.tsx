'use client';

import { motion } from 'framer-motion';
import { Cpu, Plus, LayoutDashboard, BookOpen, Palette, History } from 'lucide-react';
import { usePipelineStore } from '@/store/pipeline-store';

const navLinks = [
  { label: 'Робоча зона', icon: LayoutDashboard, id: 'workspace' },
  { label: 'База лекал (.ai)', icon: BookOpen, id: 'patterns' },
  { label: 'Палітра виробництва', icon: Palette, id: 'palette' },
  { label: 'Історія (TIFF)', icon: History, id: 'history' },
];

export function FloatingNav() {
  const { reset, isProcessing } = usePipelineStore();

  return (
    <motion.header
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-[1200px]"
    >
      <nav className="flex items-center justify-between rounded-full bg-white/95 backdrop-blur-xl shadow-lg shadow-black/5 border border-gray-100 px-4 sm:px-8 py-3">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-baseline gap-0.5 select-none">
            <span className="text-xl font-black italic tracking-tight text-sport-red">MAX</span>
            <span className="text-xl font-black italic tracking-tight text-charcoal-dark">SPORT</span>
          </div>
          <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full bg-gradient-to-r from-sport-red to-sport-red-dark text-[10px] font-bold text-white tracking-wider uppercase">
            AI STUDIO
          </span>
        </div>

        {/* Center Nav Links */}
        <div className="hidden lg:flex items-center gap-1">
          {navLinks.map((link) => (
            <button
              key={link.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-muted-gray hover:text-deep hover:bg-pearl transition-all duration-200 cursor-pointer"
            >
              <link.icon size={14} strokeWidth={2} />
              <span>{link.label}</span>
            </button>
          ))}
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 border border-green-200">
            <motion.div
              className="w-2 h-2 rounded-full bg-emerald-500"
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <span className="text-[11px] font-medium text-emerald-700">
              <Cpu size={11} className="inline mr-0.5 -mt-0.5" />
              AI Engine: Online
            </span>
          </div>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            disabled={isProcessing}
            onClick={() => reset()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-sport-red to-sport-red-dark text-white text-xs font-bold tracking-wide shadow-md shadow-red-200/50 hover:shadow-lg hover:shadow-red-300/50 transition-all duration-200 disabled:opacity-50 cursor-pointer"
          >
            <Plus size={14} strokeWidth={3} />
            <span className="hidden sm:inline">Нове замовлення</span>
          </motion.button>
        </div>
      </nav>
    </motion.header>
  );
}
