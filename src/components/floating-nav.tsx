'use client';

import { motion } from 'framer-motion';
import { LayoutGrid } from 'lucide-react';
import { useAppStore } from '@/store/app-store';

export function FloatingNav() {
  const navigateTo = useAppStore(state => state.navigateTo);
  const navLinks = [
    { label: 'Про продукт', target: 'hero' },
    { label: 'Етапи роботи', target: 'workflow' },
    { label: 'Можливості', target: 'b2b' },
  ];
  return (
    <motion.header initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-[1200px]">
      <nav className="flex items-center justify-between rounded-full bg-white/95 backdrop-blur-xl shadow-lg border border-gray-100 px-4 sm:px-6 py-3">
        <button onClick={() => navigateTo('landing')} className="flex items-center gap-2 cursor-pointer">
          <span className="text-xl font-black italic tracking-tight text-[#D90416]">AI <span className="text-[#1E1E1E]">PROMT STUDIO</span></span>
        </button>
        <div className="hidden lg:flex gap-2">
          {navLinks.map(link => <button key={link.target} onClick={() => document.getElementById(link.target)?.scrollIntoView({ behavior: 'smooth' })} className="px-3 py-1.5 text-xs text-gray-500 hover:text-black cursor-pointer">{link.label}</button>)}
        </div>
        <button onClick={() => navigateTo('editor')} className="flex items-center gap-2 rounded-full bg-[#D90416] px-4 py-2 text-xs font-bold text-white cursor-pointer"><LayoutGrid size={14}/>Відкрити редактор</button>
      </nav>
    </motion.header>
  );
}
