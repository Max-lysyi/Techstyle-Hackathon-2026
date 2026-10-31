'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ShieldCheck,
  CreditCard,
  Lock,
  CheckCircle2,
  Sparkles,
  HelpCircle,
  Building,
  Check,
} from 'lucide-react';
import { useAppStore, PlanDetails } from '@/store/app-store';

export function CheckoutView() {
  const router = useRouter();
  const { selectedPlan, navigateTo, setActiveSubscription, user } = useAppStore();

  // Fallback plan if user accessed checkout directly
  const plan: PlanDetails = selectedPlan || {
    id: 'pro',
    name: 'Pro AI (Для дизайнерів)',
    price: 1199,
    period: 'monthly',
    billingText: '1 199 ₴ / міс',
    features: [
      '500 генерацій ШІ щомісяця',
      'Експорт TIFF 300 DPI CMYK для друку',
      'Пріоритетна черга генерації AI',
      'Без водяних знаків AI Print Studio',
      'AI-декомпозиція шарів та кольорів',
      'GLTF 3D-манекени (чоловічий / жіночий)',
    ],
  };

  const [paymentMethod, setPaymentMethod] = useState<'card' | 'apple-pay' | 'google-pay'>('card');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState(user?.name ? user.name.toUpperCase() : 'MAKSYM LYSYI');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [saveCard, setSaveCard] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Format card number with spaces every 4 digits
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 16);
    const formatted = raw.replace(/(\d{4})/g, '$1 ').trim();
    setCardNumber(formatted);
  };

  // Format expiry date as MM/YY
  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (raw.length >= 3) {
      raw = raw.slice(0, 2) + '/' + raw.slice(2);
    }
    setCardExpiry(raw);
  };

  const handleCvcChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 3));
  };

  // Total calculation
  const totalAmount =
    plan.period === 'annually' ? plan.price * 12 : plan.price;

  const handlePay = async () => {
    setIsProcessing(true);
    await new Promise((r) => setTimeout(r, 1200));
    setIsProcessing(false);
    setIsSuccess(true);
    setActiveSubscription(plan.id);

    // Redirect directly to /studio after success state
    setTimeout(() => {
      router.push('/studio');
    }, 900);
  };

  return (
    <div className="min-h-screen bg-[#121214] text-white flex flex-col justify-between selection:bg-[#D90416] selection:text-white">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 right-1/4 w-[600px] h-[350px] bg-[#D90416]/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-10 left-10 w-[500px] h-[300px] bg-red-950/20 rounded-full blur-[160px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between border-b border-white/10">
        <button
          onClick={() => navigateTo('pricing')}
          className="flex items-center gap-2 text-gray-400 hover:text-white text-sm font-semibold transition-colors cursor-pointer group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          <span>&lt; Назад до тарифів</span>
        </button>

        <div className="flex items-baseline gap-1 select-none">
          <span className="text-2xl font-black italic text-[#D90416]">AI</span>
          <span className="text-2xl font-black italic text-white">PRINT STUDIO</span>
          <span className="ml-2 hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-[#D90416]/20 border border-[#D90416]/40 text-[10px] font-bold text-[#D90416] tracking-wider uppercase">
            CHECKOUT
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-emerald-400">
          <Lock size={14} />
          <span className="hidden sm:inline">256-bit SSL захист</span>
        </div>
      </header>

      {/* Main Checkout Grid */}
      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-10 flex flex-col lg:flex-row gap-8 items-start">
        {/* Left Column: Order Summary */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full lg:w-5/12 bg-[#18181B] border border-white/10 rounded-2xl p-6 sm:p-8 backdrop-blur-md"
        >
          <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles size={16} className="text-[#D90416]" />
              Підсумок замовлення
            </h2>
            <span className="text-xs px-2.5 py-1 rounded-full bg-[#D90416]/10 text-[#D90416] font-bold border border-[#D90416]/20">
              {plan.period === 'annually' ? 'Річна передплата' : 'Щомісячна передплата'}
            </span>
          </div>

          <div className="space-y-4 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-bold text-white">{plan.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  B2B доступ до AI Print Studio з пріоритетною чергою генерацій
                </p>
              </div>
              <span className="text-lg font-extrabold text-white shrink-0 ml-4">
                {plan.price} ₴
              </span>
            </div>

            {plan.period === 'annually' && (
              <div className="flex justify-between text-xs text-gray-400 pt-2">
                <span>Період розрахунку:</span>
                <span>12 місяців (зі знижкою 20%)</span>
              </div>
            )}

            <div className="flex justify-between text-xs text-gray-400">
              <span>ПДВ (0% для IT-експорту):</span>
              <span>0 ₴</span>
            </div>
          </div>

          {/* Included Features Checklist */}
          <div className="bg-[#121214] rounded-xl p-4 border border-white/5 mb-6">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-3">
              Що включено у цей план:
            </span>
            <ul className="space-y-2">
              {plan.features.slice(0, 4).map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-gray-300">
                  <Check size={14} className="text-emerald-400 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Grand Total */}
          <div className="pt-4 border-t border-white/10 flex justify-between items-baseline">
            <div>
              <span className="text-sm font-semibold text-gray-300 block">Разом до сплати:</span>
              <span className="text-[11px] text-gray-500">
                {plan.period === 'annually'
                  ? 'Списання 1 раз на рік з можливістю скасування'
                  : 'Списання щомісяця з можливістю скасування у будь-який час'}
              </span>
            </div>
            <div className="text-right">
              <span className="text-3xl font-black text-white">{totalAmount} ₴</span>
            </div>
          </div>
        </motion.div>

        {/* Right Column: Payment Form */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="w-full lg:w-7/12 bg-[#18181B] border border-white/10 rounded-2xl p-6 sm:p-8 backdrop-blur-md"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <CreditCard size={18} className="text-[#D90416]" />
              Спосіб оплати
            </h2>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span>Безпечний платіж</span>
            </div>
          </div>

          {/* Payment Method Switcher */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <button
              type="button"
              onClick={() => setPaymentMethod('card')}
              className={`py-3 px-2 rounded-xl text-xs font-bold border transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                paymentMethod === 'card'
                  ? 'bg-red-500/10 border-[#D90416] text-white shadow-sm'
                  : 'bg-[#121214] border-white/5 text-gray-400 hover:text-white hover:border-white/20'
              }`}
            >
              <CreditCard size={18} className={paymentMethod === 'card' ? 'text-[#D90416]' : ''} />
              <span>Банківська картка</span>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod('apple-pay')}
              className={`py-3 px-2 rounded-xl text-xs font-bold border transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                paymentMethod === 'apple-pay'
                  ? 'bg-white/10 border-white text-white shadow-sm'
                  : 'bg-[#121214] border-white/5 text-gray-400 hover:text-white hover:border-white/20'
              }`}
            >
              <span className="text-lg leading-none font-bold">Pay</span>
              <span>Apple Pay</span>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod('google-pay')}
              className={`py-3 px-2 rounded-xl text-xs font-bold border transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                paymentMethod === 'google-pay'
                  ? 'bg-white/10 border-white text-white shadow-sm'
                  : 'bg-[#121214] border-white/5 text-gray-400 hover:text-white hover:border-white/20'
              }`}
            >
              <span className="text-lg leading-none font-bold">GPay</span>
              <span>Google Pay</span>
            </button>
          </div>

          <AnimatePresence mode="wait">
            {paymentMethod === 'card' ? (
              <motion.div
                key="card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                    Номер банківської картки
                  </label>
                  <div className="relative">
                    <CreditCard size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="text"
                      placeholder="4149 •••• •••• 9821"
                      value={cardNumber}
                      onChange={handleCardNumberChange}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#121214] border border-white/10 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#D90416] transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                      Термін дії (MM/YY)
                    </label>
                    <input
                      type="text"
                      placeholder="12/28"
                      value={cardExpiry}
                      onChange={handleExpiryChange}
                      className="w-full px-4 py-3 rounded-xl bg-[#121214] border border-white/10 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#D90416] transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1.5 flex items-center justify-between">
                      <span>CVV / CVC</span>
                      <span className="text-[10px] text-gray-500">3 цифри</span>
                    </label>
                    <input
                      type="password"
                      placeholder="•••"
                      maxLength={3}
                      value={cardCvc}
                      onChange={handleCvcChange}
                      className="w-full px-4 py-3 rounded-xl bg-[#121214] border border-white/10 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#D90416] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                    Ім&apos;я власника картки
                  </label>
                  <input
                    type="text"
                    placeholder="MAKSYM LYSYI"
                    value={cardHolder}
                    onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                    className="w-full px-4 py-3 rounded-xl bg-[#121214] border border-white/10 text-white placeholder-gray-600 text-sm uppercase focus:outline-none focus:border-[#D90416] transition-colors"
                  />
                </div>

                <label className="flex items-center gap-2 pt-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveCard}
                    onChange={(e) => setSaveCard(e.target.checked)}
                    className="rounded border-gray-600 text-[#D90416] focus:ring-[#D90416]"
                  />
                  <span className="text-xs text-gray-400">
                    Зберегти дані картки для майбутніх B2B замовлень
                  </span>
                </label>
              </motion.div>
            ) : (
              <motion.div
                key="wallet"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="py-10 text-center space-y-6"
              >
                <div className="w-16 h-16 mx-auto rounded-full bg-white/5 flex items-center justify-center border border-white/10 text-3xl">
                  {paymentMethod === 'apple-pay' ? '' : 'G'}
                </div>
                <div>
                  <h4 className="text-base font-bold text-white mb-1">
                    Швидка оплата в один дотик через{' '}
                    {paymentMethod === 'apple-pay' ? 'Apple Pay' : 'Google Pay'}
                  </h4>
                  <p className="text-xs text-gray-400 max-w-sm mx-auto">
                    Кошти буде автоматично списано з прив&apos;язаної картки вашого цифрового гаманця.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handlePay}
                  disabled={isProcessing || isSuccess}
                  className={`w-full py-4 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xl ${
                    paymentMethod === 'apple-pay'
                      ? 'bg-white text-black hover:bg-gray-100'
                      : 'bg-white text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {isProcessing ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Обробка запиту через гаманець...
                    </span>
                  ) : (
                    <span>Оплатити {totalAmount} ₴ в 1 клік</span>
                  )}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Primary Submit Button for Card */}
          {paymentMethod === 'card' && (
            <div className="mt-8">
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={handlePay}
                disabled={isProcessing || isSuccess}
                className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-[#D90416] via-[#B8000F] to-[#8F000B] hover:from-red-600 hover:to-red-800 text-white font-bold text-base shadow-xl shadow-red-950/60 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isProcessing ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Обробка платежу через безпечний шлюз...
                  </span>
                ) : isSuccess ? (
                  <span className="flex items-center gap-2 text-white">
                    <CheckCircle2 size={20} className="text-white" />
                    Успішно оплачено! Перехід у Редактор...
                  </span>
                ) : (
                  <>
                    <Lock size={16} />
                    <span>Оплатити {totalAmount} ₴ та перейти в Редактор</span>
                  </>
                )}
              </motion.button>
            </div>
          )}

          <div className="mt-6 flex items-center justify-center gap-6 text-[11px] text-gray-500">
            <span className="flex items-center gap-1">
              <ShieldCheck size={14} className="text-emerald-500" />
              PCI DSS Level 1
            </span>
            <span className="flex items-center gap-1">
              <Building size={14} />
              Офіційний B2B інвойс
            </span>
            <span>Безпечний протокол 3D-Secure 2.0</span>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-6 text-center text-xs text-gray-500">
        <p>© 2026 AI Print Studio · Clotecs Hackathon</p>
      </footer>
    </div>
  );
}

