'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Check,
  Zap,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Building2,
  Cpu,
  Layers,
  ArrowLeft,
  Crown,
} from 'lucide-react';
import { useAppStore, PlanDetails } from '@/store/app-store';

export function PricingView() {
  const router = useRouter();
  const { navigateTo, setSelectedPlan, setActiveSubscription, user } = useAppStore();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annually'>('monthly');

  const plans = {
    basic: {
      id: 'basic' as const,
      name: 'Базова (Безкоштовно)',
      description: 'Ексклюзивно для тестування та журі хакатону',
      priceMonthly: 0,
      priceAnnually: 0,
      badge: null,
      features: [
        '50 безкоштовних генерацій ШІ',
        'Базовий експорт 72 DPI PNG',
        'Ручна розкладка лекал',
        'AI-аналіз палітри кольорів',
        'Базовий 3D-манекен',
        'Стандартна техпідтримка',
      ],
      ctaText: 'Швидкий вхід для журі',
      ctaType: 'jury' as const,
    },
    pro: {
      id: 'pro' as const,
      name: 'Pro AI (Для дизайнерів)',
      description: 'Для професійних спортивних дизайнерів і студій',
      priceMonthly: 1199,
      priceAnnually: 959,
      badge: 'Популярний',
      features: [
        '500 генерацій ШІ щомісяця',
        'Експорт TIFF 300 DPI CMYK для друку',
        'Пріоритетна черга генерації AI',
        'Без водяних знаків AI Print Studio',
        'AI-декомпозиція шарів та кольорів',
        'Повна бібліотека спортивних лекал',
        'GLTF 3D-манекени (чоловічий / жіночий)',
      ],
      ctaText: 'Оформити Pro',
      ctaType: 'checkout' as const,
    },
    enterprise: {
      id: 'enterprise' as const,
      name: 'Enterprise / Корпоративна',
      description: 'Для швейних фабрик та виробництв повного циклу',
      priceMonthly: 3499,
      priceAnnually: 2799,
      badge: 'Найкращий вибір',
      features: [
        'Безлімітний ШІ та векторний апскейл',
        'Командний доступ (до 5 операторів)',
        'Smart Nesting (-15% тканини на розкладці)',
        'Пряма API інтеграція з RIP-станціями Mimaki/Epson',
        'Виділений персональний менеджер 24/7',
        'Кастомні розмірні сітки під лекала фабрики',
        'Пакетна генерація та CMYK сертифікація',
      ],
      ctaText: 'Підключити бізнес',
      ctaType: 'checkout' as const,
    },
  };

  const handleSelectPlan = (planKey: 'basic' | 'pro' | 'enterprise') => {
    const p = plans[planKey];
    const price = billingPeriod === 'annually' ? p.priceAnnually : p.priceMonthly;

    const planDetails: PlanDetails = {
      id: p.id,
      name: p.name,
      price: price,
      period: billingPeriod,
      billingText:
        price === 0
          ? '0 ₴ / назавжди'
          : billingPeriod === 'annually'
          ? `${price} ₴ / міс (оплата ${price * 12} ₴ / рік)`
          : `${price} ₴ / міс`,
      badge: p.badge || undefined,
      features: p.features,
    };

    if (p.ctaType === 'jury') {
      // Direct entry to the working AI Print Studio for hackathon jury
      setActiveSubscription('basic');
      setSelectedPlan(planDetails);
      router.push('/studio');
    } else {
      setSelectedPlan(planDetails);
      navigateTo('checkout');
    }
  };

  return (
    <div className="min-h-screen bg-[#121214] text-white flex flex-col justify-between selection:bg-[#D90416] selection:text-white">
      {/* Background decorations */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#D90416]/15 rounded-full blur-[140px]" />
        <div className="absolute top-1/3 -right-40 w-[600px] h-[400px] bg-red-950/20 rounded-full blur-[160px]" />
        <div className="absolute bottom-0 left-0 w-full h-[300px] bg-gradient-to-t from-black/80 to-transparent" />
      </div>

      {/* Header */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigateTo('landing')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs font-semibold transition-all cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>На головну</span>
          </button>
          <div className="flex items-baseline gap-1 select-none">
            <span className="text-2xl font-black italic text-[#D90416]">AI</span>
            <span className="text-2xl font-black italic text-white">PRINT STUDIO</span>
            <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#D90416] text-white">
              B2B
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {user && (
            <span className="text-xs text-gray-400 hidden sm:inline">
              Користувач: <strong className="text-white">{user.name}</strong>
            </span>
          )}
          <button
            onClick={() => router.push('/studio')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#D90416] hover:bg-[#B8000F] text-white text-xs font-bold shadow-md shadow-red-950/50 transition-all cursor-pointer"
          >
            <Zap size={13} />
            <span>До Студії</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col items-center">
        {/* Title & Description */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mb-10"
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#D90416]/10 text-[#D90416] border border-[#D90416]/30 text-xs font-bold tracking-wider uppercase mb-4">
            <Sparkles size={13} />
            Монетизація та B2B Тарифи
          </span>
          <h1 className="text-3xl sm:text-5xl font-black italic tracking-tight text-white mb-4">
            ТАРИФНІ ПЛАНИ <span className="text-[#D90416]">ДЛЯ БІЗНЕСУ</span>
          </h1>
          <p className="text-sm sm:text-base text-gray-400 max-w-2xl mx-auto">
            Оберіть оптимальний план для вашого швейного цеху або спортивного бренду. Від безкоштовного тесту до повної інтеграції з обладнанням для сублімації.
          </p>

          {/* Billing Switcher (Monthly / Annually) */}
          <div className="mt-8 inline-flex items-center bg-[#1E1E22] p-1 rounded-xl border border-white/10 shadow-lg">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`px-5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                billingPeriod === 'monthly'
                  ? 'bg-[#D90416] text-white shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Щомісяця
            </button>
            <button
              onClick={() => setBillingPeriod('annually')}
              className={`px-5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                billingPeriod === 'annually'
                  ? 'bg-[#D90416] text-white shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <span>Щорічно</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-extrabold">
                -20%
              </span>
            </button>
          </div>
        </motion.div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 w-full max-w-6xl mb-16">
          {/* 1. Basic Free Tier */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex flex-col justify-between p-6 sm:p-8 rounded-2xl bg-[#18181B]/90 border border-white/10 hover:border-white/20 transition-all backdrop-blur-md"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Хакатон Демо
                </span>
              </div>

              <h3 className="text-xl font-bold text-white mb-2">{plans.basic.name}</h3>
              <p className="text-xs text-gray-400 mb-6 min-h-[32px]">{plans.basic.description}</p>

              <div className="flex items-baseline gap-1 mb-6 pb-6 border-b border-white/10">
                <span className="text-4xl font-extrabold text-white">0 ₴</span>
                <span className="text-xs text-gray-400">/ назавжди</span>
              </div>

              <ul className="space-y-3 mb-8">
                {plans.basic.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-300">
                    <Check size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => handleSelectPlan('basic')}
              className="w-full py-3.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-sm border border-white/10 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <Zap size={16} className="text-amber-400" />
              <span>{plans.basic.ctaText}</span>
              <ArrowRight size={16} />
            </button>
          </motion.div>

          {/* 2. Pro Tier (Popular / Featured) */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative flex flex-col justify-between p-6 sm:p-8 rounded-2xl bg-gradient-to-b from-[#1F1416] via-[#18181B] to-[#121214] border-2 border-[#D90416] shadow-2xl shadow-red-950/60 scale-100 md:-translate-y-2 transition-all"
          >
            {/* Top Glow Badge */}
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-[#D90416] to-[#B8000F] text-white text-[11px] font-black uppercase tracking-wider shadow-lg shadow-red-900/50 flex items-center gap-1">
              <Sparkles size={12} />
              {plans.pro.badge}
            </div>

            <div>
              <div className="flex items-center justify-between mb-4 mt-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[#D90416]">
                  Індивідуальний дизайнер
                </span>
                <Cpu size={16} className="text-[#D90416]" />
              </div>

              <h3 className="text-xl font-bold text-white mb-2">{plans.pro.name}</h3>
              <p className="text-xs text-gray-400 mb-6 min-h-[32px]">{plans.pro.description}</p>

              <div className="flex items-baseline gap-1.5 mb-6 pb-6 border-b border-white/10">
                <span className="text-4xl font-extrabold text-white">
                  {billingPeriod === 'annually' ? plans.pro.priceAnnually : plans.pro.priceMonthly} ₴
                </span>
                <span className="text-xs text-gray-400">
                  / міс {billingPeriod === 'annually' && '(оплата щорічно)'}
                </span>
              </div>

              <ul className="space-y-3 mb-8">
                {plans.pro.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-200">
                    <Check size={16} className="text-[#D90416] shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => handleSelectPlan('pro')}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#D90416] to-[#B8000F] hover:from-red-600 hover:to-red-800 text-white font-bold text-sm shadow-lg shadow-red-900/60 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{plans.pro.ctaText}</span>
              <ArrowRight size={16} />
            </button>
          </motion.div>

          {/* 3. Enterprise Tier */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col justify-between p-6 sm:p-8 rounded-2xl bg-[#18181B]/90 border border-amber-500/30 hover:border-amber-500/50 transition-all backdrop-blur-md relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-bl-full pointer-events-none" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 to-red-500/20 text-amber-300 text-xs font-bold border border-amber-500/40 shadow-sm">
                  <Crown size={12} className="text-amber-400" />
                  {plans.enterprise.badge}
                </span>
                <Building2 size={16} className="text-amber-400" />
              </div>

              <h3 className="text-xl font-bold text-white mb-2">{plans.enterprise.name}</h3>
              <p className="text-xs text-gray-400 mb-6 min-h-[32px]">{plans.enterprise.description}</p>

              <div className="flex items-baseline gap-1.5 mb-6 pb-6 border-b border-white/10">
                <span className="text-4xl font-extrabold text-amber-300">
                  {billingPeriod === 'annually'
                    ? plans.enterprise.priceAnnually
                    : plans.enterprise.priceMonthly}{' '}
                  ₴
                </span>
                <span className="text-xs text-gray-400">
                  / міс {billingPeriod === 'annually' && '(оплата щорічно)'}
                </span>
              </div>

              <ul className="space-y-3 mb-8">
                {plans.enterprise.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-200">
                    <Check size={16} className="text-amber-400 shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => handleSelectPlan('enterprise')}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-[#D90416] to-[#B8000F] hover:from-amber-400 hover:to-red-600 text-white font-bold text-sm shadow-xl shadow-red-950/50 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Crown size={16} />
              <span>{plans.enterprise.ctaText}</span>
              <ArrowRight size={16} />
            </button>
          </motion.div>
        </div>

        {/* B2B Guarantees & Features Grid */}
        <div className="w-full max-w-5xl bg-[#18181B]/80 border border-white/10 rounded-2xl p-6 sm:p-8 backdrop-blur-md mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center sm:text-left">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-red-500/10 text-[#D90416] shrink-0">
                <Cpu size={24} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white mb-1">ШІ-декомпозиція лекал</h4>
                <p className="text-xs text-gray-400">
                  Автоматичний розклад ескізу на 4 робочі деталі (перед, спинка, рукави) з розділенням шарів.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 shrink-0">
                <Layers size={24} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white mb-1">Колірна декомпозиція</h4>
                <p className="text-xs text-gray-400">
                  Миттєве відокремлення логотипів, векторних плашок та чистого фону тканини для сублімації.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
                <ShieldCheck size={24} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white mb-1">Офіційний B2B договір</h4>
                <p className="text-xs text-gray-400">
                  Оплата за безготівковим розрахунком для ТОВ та ФОП з наданням усіх бухгалтерських актів.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-6 text-center text-xs text-gray-500">
        <p>© 2026 AI Print Studio · Розроблено для Clotecs Hackathon 2026</p>
      </footer>
    </div>
  );
}

