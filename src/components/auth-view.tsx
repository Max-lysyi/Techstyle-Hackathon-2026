'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Mail, Building2, Lock, ArrowRight, Zap, Sparkles } from 'lucide-react';
import { useAppStore } from '@/store/app-store';

export function AuthView() {
  const { authTab, navigateTo, login } = useAppStore();
  const [tab, setTab] = useState<'login' | 'register'>(authTab);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJuryLogin = async () => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    login({ name: 'Журі Хакатону', email: 'jury@clotecs.ua', company: 'Clotecs 2026' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    login({
      name: name || email.split('@')[0] || 'Оператор',
      email: email,
      company: company || 'AI Print Studio',
    });
  };

  const inputCls =
    'w-full pl-10 pr-4 py-3 rounded-xl bg-white border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sport-red/30 focus:border-sport-red transition-all';

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1E1E1E] via-[#252526] to-[#1E1E1E] flex items-center justify-center px-4 py-16">
      {/* Background grid */}
      <div className="absolute inset-0 grid-pattern opacity-40 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <button
            onClick={() => navigateTo('landing')}
            className="inline-flex items-baseline gap-1 select-none cursor-pointer"
          >
            <span className="text-3xl font-black italic text-[#D90416]">AI</span>
            <span className="text-3xl font-black italic text-white">PRINT STUDIO</span>
          </button>
          <div className="mt-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#D90416]/20 border border-[#D90416]/30 text-[11px] font-bold text-[#D90416] tracking-wider uppercase">
              AI STUDIO
            </span>
          </div>
          <p className="mt-3 text-sm text-gray-400">
            Платформа для автоматичної підготовки дизайнів до сублімації
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            {(['login', 'register'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-4 text-sm font-bold transition-all cursor-pointer ${
                  tab === t
                    ? 'text-[#D90416] border-b-2 border-[#D90416] bg-red-50/50'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {t === 'login' ? 'Вхід' : 'Реєстрація'}
              </button>
            ))}
          </div>

          <div className="p-8">
            {/* Quick jury login */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleJuryLogin}
              disabled={loading}
              className="w-full mb-6 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-bold shadow-lg shadow-amber-200/40 hover:shadow-xl hover:shadow-amber-300/50 transition-all disabled:opacity-60 cursor-pointer"
            >
              <Zap size={16} />
              Швидкий вхід для Журі (1 клік)
              <Sparkles size={14} />
            </motion.button>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center">
                <span className="px-3 bg-white text-xs text-gray-400">або заповніть форму</span>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.form
                key={tab}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                onSubmit={handleSubmit}
                className="space-y-4"
              >
                {tab === 'register' && (
                  <div className="relative">
                    <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Ваше ім'я"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={inputCls}
                      required
                    />
                  </div>
                )}

                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    placeholder="Робочий Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputCls}
                    required
                  />
                </div>

                {tab === 'register' && (
                  <div className="relative">
                    <Building2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Компанія / Цех"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                )}

                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    placeholder="Пароль"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputCls}
                    required
                    minLength={4}
                  />
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#D90416] to-[#B8000F] text-white font-bold text-sm shadow-lg shadow-red-200/50 hover:shadow-xl hover:shadow-red-300/50 transition-all disabled:opacity-60 cursor-pointer"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Вхід...
                    </span>
                  ) : (
                    <>
                      {tab === 'login' ? 'Увійти в систему' : 'Зареєструватись'}
                      <ArrowRight size={16} />
                    </>
                  )}
                </motion.button>
              </motion.form>
            </AnimatePresence>

            <p className="mt-4 text-center text-xs text-gray-400">
              {tab === 'login' ? 'Немає акаунту? ' : 'Вже є акаунт? '}
              <button
                onClick={() => setTab(tab === 'login' ? 'register' : 'login')}
                className="text-[#D90416] font-semibold hover:underline cursor-pointer"
              >
                {tab === 'login' ? 'Зареєструватись' : 'Увійти'}
              </button>
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-500">
          © 2026 AI Print Studio · Clotecs Hackathon
        </p>
      </motion.div>
    </div>
  );
}
