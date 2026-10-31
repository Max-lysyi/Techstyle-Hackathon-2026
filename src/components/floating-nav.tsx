'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { User, LogOut, ChevronRight, LayoutGrid } from 'lucide-react';
import { useAppStore } from '@/store/app-store';

export function FloatingNav() {
  const router = useRouter();
  const { isLoggedIn, user, navigateTo, logout } = useAppStore();

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const navLinks = [
    { label: 'Про продукт', target: 'hero' },
    { label: 'Етапи роботи', target: 'workflow' },
    { label: 'Відео-демо', target: 'video' },
    { label: 'Переваги B2B', target: 'b2b' },
  ];

  const handleOpenStudio = () => {
    router.push('/studio');
  };

  return (
    <motion.header
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-[1200px]"
    >
      <nav className="flex items-center justify-between rounded-full bg-white/95 backdrop-blur-xl shadow-lg shadow-black/5 border border-gray-100 px-4 sm:px-6 py-3">
        {/* Logo */}
        <button
          onClick={() => navigateTo('landing')}
          className="flex items-center gap-2 shrink-0 cursor-pointer"
        >
          <div className="flex items-baseline gap-1 select-none">
            <span className="text-xl font-black italic tracking-tight text-[#D90416]">AI</span>
            <span className="text-xl font-black italic tracking-tight text-[#1E1E1E]">PRINT STUDIO</span>
          </div>
        </button>

        {/* Center Nav Links */}
        <div className="hidden lg:flex items-center gap-1">
          {navLinks.map((link) => (
            <button
              key={link.target}
              onClick={() => scrollTo(link.target)}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-gray-500 hover:text-[#1E1E1E] hover:bg-[#F3F4F6] transition-all duration-200 cursor-pointer"
            >
              {link.label}
            </button>
          ))}
          <button
            onClick={() => navigateTo('size-charts')}
            className="px-3 py-1.5 rounded-full text-xs font-medium text-gray-600 hover:text-[#D90416] hover:bg-red-50 transition-all duration-200 cursor-pointer"
          >
            Таблиці розмірів
          </button>
          <button
            onClick={() => navigateTo('pricing')}
            className="px-3 py-1.5 rounded-full text-xs font-medium text-[#D90416] hover:bg-red-50 transition-all duration-200 cursor-pointer font-bold"
          >
            Тарифи
          </button>
        </div>

        {/* Right: Auth Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {isLoggedIn ? (
            <>
              {/* User badge */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F3F4F6] border border-gray-200">
                <User size={13} className="text-[#D90416]" />
                <span className="text-[11px] font-semibold text-[#1E1E1E]">
                  {user?.name ?? 'Оператор AI Print Studio'}
                </span>
              </div>
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleOpenStudio}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-[#D90416] to-[#B8000F] text-white text-xs font-bold shadow-md shadow-red-200/50 hover:shadow-lg transition-all cursor-pointer"
              >
                <LayoutGrid size={13} strokeWidth={2.5} />
                <span className="hidden sm:inline">Відкрити Редактор</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                onClick={logout}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium text-gray-500 hover:text-[#1E1E1E] hover:bg-[#F3F4F6] transition-all cursor-pointer"
              >
                <LogOut size={13} />
                <span className="hidden sm:inline">Вийти</span>
              </motion.button>
            </>
          ) : (
            <>
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigateTo('auth', 'login')}
                className="px-4 py-2 rounded-full text-xs font-bold text-gray-600 border border-gray-200 hover:bg-[#F3F4F6] transition-all cursor-pointer"
              >
                Увійти
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigateTo('auth', 'register')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-[#D90416] to-[#B8000F] text-white text-xs font-bold shadow-md shadow-red-200/50 hover:shadow-lg transition-all cursor-pointer"
              >
                Реєстрація
                <ChevronRight size={13} />
              </motion.button>
            </>
          )}
        </div>
      </nav>
    </motion.header>
  );
}
