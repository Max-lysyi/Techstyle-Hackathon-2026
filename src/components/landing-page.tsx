'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Zap, Layers, Palette, FileImage, ArrowRight,
  Clock, CheckCircle, ArrowDown, ChevronRight
} from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { FloatingNav } from '@/components/floating-nav';

/* ---------- Reusable animated section wrapper ---------- */
function FadeUp({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 60 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ---------- SECTION 1: Hero ---------- */
function HeroSection({
  heroRef,
  onCta,
}: {
  heroRef: React.RefObject<HTMLElement | null>;
  onCta: () => void;
}) {
  return (
    <section
      ref={heroRef}
      id="hero"
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#1E1E1E] via-[#252526] to-[#1a1a1a]"
    >
      {/* Grid overlay */}
      <div className="absolute inset-0 grid-pattern opacity-50" />
      {/* Diagonal accent */}
      <div className="absolute inset-0 pointer-events-none">
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 1440 900">
          <defs>
            <linearGradient id="hg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#D90416" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#B8000F" stopOpacity="0.04" />
            </linearGradient>
          </defs>
          <polygon points="0,0 1440,0 1440,350 0,700" fill="url(#hg)" />
          <polygon points="950,0 1440,0 1440,900 550,900" fill="rgba(217,4,22,0.03)" />
        </svg>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#D90416]/15 border border-[#D90416]/30 text-[#D90416] text-xs font-bold tracking-widest uppercase mb-8">
            <motion.span
              animate={{ scale: [1, 1.4, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-[#D90416] inline-block"
            />
            Clotecs Hackathon 2026 · Live Demo
          </div>

          {/* Title */}
          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black italic tracking-tight leading-none mb-6">
            <span className="text-[#D90416]">AI</span>
            <span className="text-white"> PRINT </span>
            <span className="text-[#D90416]">STUDIO</span>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed mb-8">
            Чотири розгортки спортивної форми: перед, спинка та два рукави. У кожній — окремі кольорові принти й цілісні градієнти, без логотипів та написів.
          </p>

          {/* Tech pills */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="flex flex-wrap items-center justify-center gap-2 mb-10"
          >
            {[
              { icon: Zap, label: 'OpenAI Vision' },
              { icon: Layers, label: 'OpenCV + маски' },
              { icon: Palette, label: 'RGB K-Means' },
              { icon: FileImage, label: 'PNG + ZIP' },
            ].map((p, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs text-gray-300 font-medium"
              >
                <p.icon size={12} className="text-[#D90416]" />
                {p.label}
              </span>
            ))}
          </motion.div>

          {/* CTA Button */}
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            onClick={onCta}
            className="inline-flex items-center gap-3 px-10 py-5 rounded-2xl bg-gradient-to-r from-[#D90416] to-[#B8000F] text-white text-lg font-black shadow-2xl shadow-red-900/40 hover:shadow-red-900/60 transition-all cursor-pointer"
          >
            Почати роботу
            <ArrowRight size={22} />
          </motion.button>
          
        </motion.div>


      </div>
      {/* Scroll hint */}
      <motion.div
        className="absolute bottom-10 left-1/2 -translate-x-1/2 text-gray-500 mb-5"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 1.8, repeat: Infinity }}
      >
        <ArrowDown size={20} />
      </motion.div>
    </section>
  );
}

/* ---------- SECTION 2: Workflow Pipeline ---------- */
const WORKFLOW_STEPS = [
  {
    n: '01',
    title: 'Завантаження макета',
    desc: 'Завантаження JPEG або PNG у локальний редактор.',
  },
  {
    n: '02',
    title: 'Вибір деталі',
    desc: 'Перед, спинка, правий або лівий рукав — кожна деталь має свою область ескізу.',
  },
  {
    n: '03',
    title: 'Розгортка принта',
    desc: 'Пропорційне продовження візерунка на прямокутну заготовку без написів.',
  },
  {
    n: '04',
    title: 'Шари кожної деталі',
    desc: 'Основа, кольорові принти, орнаменти й цілісний градієнт у спільних координатах.',
  },
  {
    n: '05',
    title: 'Ручне уточнення',
    desc: 'Маски, видимість, групування та перефарбування з виробничої палітри.',
  },
  {
    n: '06',
    title: 'Експорт PNG / ZIP',
    desc: 'Окремі папки деталей із PNG-шарами, композицією, масками та палітрою.',
  },
];

function WorkflowSection({ sectionRef }: { sectionRef: React.RefObject<HTMLElement | null> }) {
  return (
    <section ref={sectionRef} id="workflow" className="py-24 bg-[#F3F4F6]">
      <div className="max-w-7xl mx-auto px-6">
        <FadeUp className="text-center mb-14">
          <span className="inline-block px-4 py-1.5 rounded-full bg-white border border-gray-200 text-[#D90416] text-xs font-bold uppercase tracking-widest mb-4 shadow-sm">
            Автоматизований конвеєр
          </span>
          <h2 className="text-3xl sm:text-4xl font-black italic text-[#1E1E1E] leading-tight">
            ОДИН МАКЕТ.{' '}
            <span className="text-[#D90416]">ПОВНИЙ ЦИКЛ</span>
            <br />
            ПІДГОТОВКИ ДО ДРУКУ.
          </h2>
          <p className="mt-3 text-sm text-gray-500 max-w-xl mx-auto">
            Завантажте макет, перевірте запропоновані області та виділіть потрібні елементи.
          </p>
        </FadeUp>

        {/* Step cards with arrows */}
        <div className="relative">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {WORKFLOW_STEPS.map((step, i) => (
              <FadeUp key={i} delay={i * 0.08}>
                <div className="relative bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-lg transition-all p-6 group h-full">
                  {/* Number */}
                  <div className="text-5xl font-black italic text-gray-100 select-none mb-3 group-hover:text-red-50 transition-colors">
                    {step.n}
                  </div>
                  <h3 className="text-base font-bold text-[#1E1E1E] mb-2">{step.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{step.desc}</p>
                  {/* Arrow connector (desktop) */}
                  {i < WORKFLOW_STEPS.length - 1 && (i + 1) % 3 !== 0 && (
                    <div className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-6 h-6 items-center justify-center">
                      <ChevronRight size={18} className="text-[#D90416]" />
                    </div>
                  )}
                  {/* Bottom accent */}
                  <div className="absolute bottom-0 left-0 h-1 w-0 group-hover:w-full bg-gradient-to-r from-[#D90416] to-[#B8000F] rounded-b-2xl transition-all duration-300" />
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- SECTION 3: Video & Features ---------- */
const FEATURE_LIST = [
  'Завантаження JPEG та PNG із комп’ютера.',
  'Чотири незалежні розгортки: перед, спинка, правий і лівий рукав.',
  'Перевірка композиції перед наступним платним етапом.',
  'Основа й кольорові принти кожної деталі без логотипів та написів.',
  'Ручне уточнення масок і перегляд накладання.',
  'Порівняння кольорів із завантаженою палітрою виробництва.',
  'Експорт PNG-шарів, палітри та координат у ZIP.',
];

function VideoSection({
  sectionRef,
  onTryEditor,
}: {
  sectionRef: React.RefObject<HTMLElement | null>;
  onTryEditor?: () => void;
}) {
  return (
    <section
      ref={sectionRef}
      id="video"
      className="min-h-screen flex items-center py-24 bg-gradient-to-br from-[#1E1E1E] via-[#252526] to-[#1a1a1a]"
    >
      <div className="max-w-7xl mx-auto px-6 w-full">
        <FadeUp className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-black italic text-white leading-tight">
            Від розмитого фото з телефону
            <br />
            до <span className="text-[#D90416]">окремих прозорих шарів</span>.
          </h2>
        </FadeUp>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          {/* Left: Video window */}
          <FadeUp delay={0.1}>
            <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/40 bg-[#2D2D2D]">
              {/* Window chrome */}
              <div className="flex items-center gap-2 px-4 py-3 bg-[#3a3a3a] border-b border-white/10">
                <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
                <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
                <div className="w-3 h-3 rounded-full bg-[#28C840]" />
                <span className="ml-3 text-[11px] text-gray-400 font-mono">
                  AI Print Studio — Demo
                </span>
              </div>
              {/* Video container */}
              <div className="relative aspect-video bg-black overflow-hidden rounded-b-2xl flex items-center justify-center">
                <video
                  src="/demo-video.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls
                  className="w-full h-full object-cover rounded-b-xl"
                  ref={(el) => {
                    if (el) {
                      el.muted = true;
                      el.play().catch(() => {});
                    }
                  }}
                >
                  <source src="/demo-video.mp4" type="video/mp4" />
                  <source src="/demo-video.mov" type="video/quicktime" />
                  Ваш браузер не підтримує відтворення відео.
                </video>
              </div>
            </div>
          </FadeUp>

          {/* Right: Features list */}
          <FadeUp delay={0.2} className="space-y-6">
            <h3 className="text-xl font-bold text-[#D90416]">
              Макет. Області. Шари.
              <br />
              <span className="text-white font-medium text-base">
                Перевірка та підготовка елементів макета.
              </span>
            </h3>

            <ol className="space-y-3">
              {FEATURE_LIST.map((item, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.07, duration: 0.4 }}
                  className="flex gap-3 text-sm text-gray-300"
                >
                  <span className="shrink-0 w-6 h-6 rounded-full bg-[#D90416]/20 border border-[#D90416]/40 text-[#D90416] text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span>{item}</span>
                </motion.li>
              ))}
            </ol>

            <div className="flex flex-wrap gap-3 pt-2">

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={onTryEditor}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-[#D90416] to-[#B8000F] text-white text-sm font-bold shadow-lg shadow-red-900/40 hover:shadow-red-900/60 transition-all cursor-pointer"
              >
                Спробувати в Редакторі
                <ArrowRight size={16} />
              </motion.button>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}

/* ---------- SECTION 4: B2B Comparison + Specs ---------- */
const B2B_CARDS = [
  {
    icon: '🎨',
    title: 'Пошаровий контроль кольорів',
    desc: 'Виділіть елемент за кольором і перевірте його на прозорому фоні.',
  },
  {
    icon: '✏️',
    title: 'Приблизні області AI',
    desc: 'Аналіз допомагає знайти видимі написи, номери та графічні елементи.',
  },
  {
    icon: '📐',
    title: 'Ручне уточнення',
    desc: 'Відкоригуйте межі та допуск кольору перед створенням шару.',
  },
  {
    icon: '📦',
    title: 'Експорт PNG та ZIP',
    desc: 'Архів містить шари, наближений фон, палітру та координати.',
  },
];

function B2BSection({
  sectionRef,
  onCta,
}: {
  sectionRef: React.RefObject<HTMLElement | null>;
  onCta: () => void;
}) {
  return (
    <section ref={sectionRef} id="b2b" className="py-24 bg-[#F3F4F6]">
      <div className="max-w-7xl mx-auto px-6 space-y-20">
        {/* Comparison */}
        <FadeUp>
          <div className="text-center mb-10">
            <h2 className="text-3xl font-black italic text-[#1E1E1E]">
              Порівняння:{' '}
              <span className="text-[#D90416]">Ручна робота vs. AI Studio</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Manual */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-2xl">
                  🖱️
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Традиційний метод</div>
                  <div className="font-bold text-[#1E1E1E]">Ручна робота в Illustrator</div>
                </div>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <Clock size={28} className="text-orange-400 shrink-0" />
                <span className="text-4xl font-black text-orange-400">Вручну</span>
              </div>
              <ul className="space-y-2 text-sm text-gray-500">
                {[
                  'Пошук елементів на макеті',
                  'Ручне виділення логотипів',
                  'Робота з кольорами',
                  'Відновлення фону',
                  'Підготовка файлів до друку',
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-300 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {/* AI */}
            <div className="bg-gradient-to-br from-[#1E1E1E] to-[#252526] rounded-2xl shadow-xl p-8 text-white">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-[#D90416]/20 flex items-center justify-center text-2xl">
                  ⚡
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider">AI Автоматизація</div>
                  <div className="font-bold text-white">AI Print Studio</div>
                </div>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <Zap size={28} className="text-[#D90416] shrink-0" />
                <span className="text-4xl font-black text-[#D90416]">MVP</span>
              </div>
              <ul className="space-y-2 text-sm text-gray-300">
                {[
                  'AI-аналіз видимих елементів',
                  'Уточнення областей вручну',
                  'Кластеризація кольорів RGB',
                  'Виділення пікселів за кольором',
                  'Експорт PNG та ZIP',
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-[#D90416] shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={onCta}
                className="mt-6 w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#D90416] text-white text-sm font-bold hover:bg-[#B8000F] transition-all cursor-pointer"
              >
                Спробувати зараз
                <ArrowRight size={16} />
              </motion.button>
            </div>
          </div>
        </FadeUp>

        {/* B2B Tech Cards */}
        <FadeUp>
          <div className="text-center mb-10">
            <h2 className="text-2xl font-black italic text-[#1E1E1E]">
              Файли для{' '}
              <span className="text-[#D90416]">роботи дизайнера</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {B2B_CARDS.map((card, i) => (
              <FadeUp key={i} delay={i * 0.08}>
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 hover:shadow-md transition-all h-full">
                  <div className="text-3xl mb-3">{card.icon}</div>
                  <h4 className="font-bold text-[#1E1E1E] text-sm mb-2">{card.title}</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">{card.desc}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

/* ---------- Footer ---------- */
function Footer() {
  return (
    <footer className="bg-[#1E1E1E] text-gray-400 py-10 border-t border-white/5">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-baseline gap-1 select-none">
          <span className="text-xl font-black italic text-[#D90416]">AI</span>
          <span className="text-xl font-black italic text-white">PRINT STUDIO</span>
          <span className="ml-2 text-xs text-gray-500">v0.1</span>
        </div>
        <div className="flex flex-wrap gap-4 text-xs">

          <span className="text-gray-600">AI Print Studio</span>
        </div>
        <div className="text-xs text-gray-500">© 2026 AI Print Studio · Clotecs Hackathon</div>
      </div>
    </footer>
  );
}

/* ================================================================
   Main Landing Page Component
================================================================ */
export function LandingPage() {
  const { isLoggedIn, navigateTo } = useAppStore();

  const heroRef = useRef<HTMLElement>(null);
  const workflowRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLElement>(null);
  const b2bRef = useRef<HTMLElement>(null);

  const handleCta = () => {
    if (isLoggedIn) {
      navigateTo('pricing');
    } else {
      navigateTo('auth', 'register');
    }
  };

  return (
    <div className="overflow-x-hidden">
      <FloatingNav />
      <HeroSection heroRef={heroRef} onCta={handleCta} />
      <WorkflowSection sectionRef={workflowRef} />
      <VideoSection
        sectionRef={videoRef}
        onTryEditor={handleCta}
      />
      <B2BSection sectionRef={b2bRef} onCta={handleCta} />
      <Footer />
    </div>
  );
}

