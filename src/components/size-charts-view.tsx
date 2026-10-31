'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useAppStore } from '@/store/app-store';

interface SizeRow {
  size: string;
  height: string;
  chest: string;
  waist: string;
  hips: string;
}

interface SizeGroup {
  label: string;
  rows: SizeRow[];
}

const menGroups: SizeGroup[] = [
  {
    label: 'Дитячі',
    rows: [
      { size: '30', height: '116', chest: '58-62', waist: '50-56', hips: '62-66' },
      { size: '32', height: '122', chest: '62-66', waist: '52-58', hips: '66-70' },
      { size: '32', height: '128', chest: '62-66', waist: '54-60', hips: '66-70' },
      { size: '34', height: '134', chest: '66-70', waist: '56-62', hips: '70-74' },
    ],
  },
  {
    label: 'Підліток',
    rows: [
      { size: '34', height: '140', chest: '66-70', waist: '58-64', hips: '70-74' },
      { size: '36', height: '146', chest: '70-74', waist: '61-67', hips: '74-78' },
      { size: '38', height: '152', chest: '74-78', waist: '64-70', hips: '78-82' },
      { size: '40', height: '158', chest: '78-82', waist: '67-73', hips: '82-86' },
    ],
  },
  {
    label: 'Юніор',
    rows: [
      { size: '42', height: '164', chest: '82-86', waist: '70-76', hips: '86-90' },
      { size: '44', height: '170', chest: '86-90', waist: '74-80', hips: '90-94' },
      { size: '46', height: '176', chest: '90-94', waist: '78-84', hips: '94-98' },
    ],
  },
  {
    label: 'Дорослі',
    rows: [
      { size: '48', height: '176', chest: '94-98', waist: '82-88', hips: '98-102' },
      { size: '50', height: '176', chest: '98-102', waist: '86-92', hips: '102-106' },
      { size: '52', height: '182', chest: '102-106', waist: '90-96', hips: '106-110' },
      { size: '54', height: '182', chest: '106-110', waist: '94-100', hips: '110-114' },
      { size: '56', height: '188', chest: '110-114', waist: '98-104', hips: '114-118' },
    ],
  },
  {
    label: 'Великі розміри',
    rows: [
      { size: '58', height: '188', chest: '114-118', waist: '102-108', hips: '118-122' },
      { size: '60', height: '188', chest: '118-122', waist: '106-112', hips: '122-126' },
      { size: '62', height: '188', chest: '122-126', waist: '110-116', hips: '126-128' },
    ],
  },
];

const womenGroups: SizeGroup[] = [
  {
    label: 'Дитячі',
    rows: [
      { size: '30', height: '116', chest: '58-62', waist: '50-56', hips: '62-66' },
      { size: '32', height: '122', chest: '62-66', waist: '52-58', hips: '66-70' },
      { size: '32', height: '128', chest: '62-66', waist: '54-60', hips: '66-70' },
      { size: '34', height: '134', chest: '66-70', waist: '56-62', hips: '70-74' },
    ],
  },
  {
    label: 'Підліток',
    rows: [
      { size: '34', height: '140', chest: '66-70', waist: '58-62', hips: '72-76' },
      { size: '36', height: '146', chest: '70-74', waist: '60-64', hips: '76-80' },
      { size: '38', height: '152', chest: '74-78', waist: '62-66', hips: '80-84' },
      { size: '40', height: '158', chest: '78-82', waist: '64-68', hips: '84-88' },
    ],
  },
  {
    label: 'Дорослі',
    rows: [
      { size: '42', height: '164', chest: '82-86', waist: '66-70', hips: '88-92' },
      { size: '44', height: '164', chest: '86-90', waist: '70-74', hips: '92-96' },
      { size: '46', height: '164', chest: '90-94', waist: '74-78', hips: '96-100' },
      { size: '48', height: '170', chest: '94-98', waist: '78-82', hips: '100-104' },
    ],
  },
  {
    label: 'Великі розміри',
    rows: [
      { size: '50', height: '170', chest: '98-102', waist: '82-86', hips: '104-108' },
      { size: '52', height: '170', chest: '102-106', waist: '86-90', hips: '108-112' },
      { size: '54', height: '170', chest: '106-110', waist: '90-96', hips: '112-116' },
      { size: '56', height: '170', chest: '110-114', waist: '96-102', hips: '116-120' },
    ],
  },
];

function SizeTable({ groups }: { groups: SizeGroup[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#D90416] text-white">
            <th className="px-5 py-4 text-left font-bold">Розмір</th>
            <th className="px-5 py-4 text-center font-bold">Ріст, см</th>
            <th className="px-5 py-4 text-center font-bold">Обхват грудей, см</th>
            <th className="px-5 py-4 text-center font-bold">Обхват талії, см</th>
            <th className="px-5 py-4 text-center font-bold">Обхват бедер, см</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <>
              <tr key={`g-${group.label}`} className="bg-gray-100">
                <td
                  colSpan={5}
                  className="px-5 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider"
                >
                  {group.label}
                </td>
              </tr>
              {group.rows.map((row, i) => (
                <tr
                  key={`${group.label}-${i}`}
                  className="border-t border-gray-100 hover:bg-red-50/40 transition-colors"
                >
                  <td className="px-5 py-3 font-bold text-[#D90416] text-base">{row.size}</td>
                  <td className="px-5 py-3 text-center text-gray-700">{row.height}</td>
                  <td className="px-5 py-3 text-center text-gray-700">{row.chest}</td>
                  <td className="px-5 py-3 text-center text-gray-700">{row.waist}</td>
                  <td className="px-5 py-3 text-center text-gray-700">{row.hips}</td>
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SizeChartsView() {
  const router = useRouter();
  const { navigateTo } = useAppStore();
  const [tab, setTab] = useState<'men' | 'women'>('men');

  const handleGoHome = () => {
    navigateTo('landing');
    router.push('/');
  };

  const handleOpenStudio = () => {
    router.push('/studio');
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6]">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={handleGoHome}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all cursor-pointer"
            >
              <ArrowLeft size={16} />
              На головну
            </button>
            <div className="flex items-baseline gap-1 select-none">
              <span className="text-xl font-black italic text-[#D90416]">AI</span>
              <span className="text-xl font-black italic text-[#1E1E1E]">PRINT STUDIO</span>
            </div>
            <h1 className="text-lg font-black text-[#1E1E1E] hidden sm:inline">Таблиці розмірів</h1>
          </div>
          <button
            onClick={handleOpenStudio}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#D90416] hover:bg-[#B8000F] text-white text-xs font-bold shadow-md transition-all cursor-pointer"
          >
            Відкрити Студію →
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-center mb-8">
            <h2 className="text-3xl font-black italic text-[#1E1E1E] mb-2">
              ТАБЛИЦІ <span className="text-[#D90416]">РОЗМІРІВ</span>
            </h2>
            <p className="text-gray-500 text-sm max-w-xl mx-auto">
              Розмірні таблиці спортивної форми. Масштаб принта й накладання лекал перевіряє конструктор.
            </p>
          </div>

          {/* Tab switcher */}
          <div className="flex rounded-xl bg-white border border-gray-200 shadow-sm p-1 mb-8 max-w-sm mx-auto">
            <button
              onClick={() => setTab('men')}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all cursor-pointer ${
                tab === 'men'
                  ? 'bg-[#D90416] text-white shadow-md'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Чоловічі
            </button>
            <button
              onClick={() => setTab('women')}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all cursor-pointer ${
                tab === 'women'
                  ? 'bg-[#D90416] text-white shadow-md'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Жіночі
            </button>
          </div>

          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h3 className="text-xl font-bold text-[#1E1E1E] mb-4">
              {tab === 'men' ? 'Таблиця чоловічих розмірів' : 'Таблиця жіночих розмірів'}
            </h3>
            <SizeTable groups={tab === 'men' ? menGroups : womenGroups} />
          </motion.div>

          <div className="mt-8 p-4 bg-white rounded-xl border border-gray-200 text-xs text-gray-500 text-center">
            Усі розміри вказані в сантиметрах. Для точного підбору рекомендуємо знімати мірки з урахуванням щільності посадки спортивної форми.
          </div>
        </motion.div>
      </div>
    </div>
  );
}
