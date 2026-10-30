'use client';

import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Download,
  FileImage,
  FolderArchive,
  Settings,
  Loader2,
  Check,
  Monitor,
  Printer,
  Shield,
} from 'lucide-react';
import { usePipelineStore } from '@/store/pipeline-store';

export function StepExport() {
  const { isComplete, exportSettings, setExportSettings, simulateExport, isExporting } = usePipelineStore();

  if (!isComplete) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto"
      >
        <div className="rounded-2xl bg-white border border-gray-100 shadow-lg p-12 text-center">
          <Download size={48} className="mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-bold text-deep mb-2">Експорт для Adobe Illustrator</h3>
          <p className="text-sm text-muted-gray">
            Завершіть обробку макету, щоб підготувати файли до експорту
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      {/* Export settings card */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-pearl/50 flex items-center gap-2">
          <Settings size={16} className="text-muted-gray" />
          <h4 className="text-sm font-bold text-deep">Налаштування експорту</h4>
        </div>

        <div className="p-6 space-y-5">
          {/* Resolution */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-pearl flex items-center justify-center">
                <Monitor size={16} className="text-muted-gray" />
              </div>
              <div>
                <div className="text-sm font-semibold text-deep">Роздільна здатність</div>
                <div className="text-[11px] text-muted-gray">DPI вихідного файлу</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExportSettings({ resolution: 150 })}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer
                  ${exportSettings.resolution === 150
                    ? 'bg-charcoal-dark text-white'
                    : 'bg-pearl text-muted-gray hover:bg-gray-200'
                  }`}
              >
                150 DPI
              </button>
              <button
                onClick={() => setExportSettings({ resolution: 300 })}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer
                  ${exportSettings.resolution === 300
                    ? 'bg-gradient-to-r from-sport-red to-sport-red-dark text-white shadow-sm'
                    : 'bg-pearl text-muted-gray hover:bg-gray-200'
                  }`}
              >
                300 DPI
              </button>
            </div>
          </div>

          {/* Color Profile */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-pearl flex items-center justify-center">
                <Printer size={16} className="text-muted-gray" />
              </div>
              <div>
                <div className="text-sm font-semibold text-deep">Колірний профіль</div>
                <div className="text-[11px] text-muted-gray">ICC-профіль для сублімаційного друку</div>
              </div>
            </div>
            <Badge variant="outline" className="text-xs font-mono bg-cyan-50 border-cyan-200 text-cyan-700">
              CMYK (ISO Coated v2)
            </Badge>
          </div>

          {/* Compression */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-pearl flex items-center justify-center">
                <Shield size={16} className="text-muted-gray" />
              </div>
              <div>
                <div className="text-sm font-semibold text-deep">Стиснення</div>
                <div className="text-[11px] text-muted-gray">Без втрати якості для виробництва</div>
              </div>
            </div>
            <Badge variant="outline" className="text-xs font-mono bg-white border-gray-200">
              LZW без втрат
            </Badge>
          </div>

          {/* Bleed */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-pearl flex items-center justify-center">
                <span className="text-xs font-bold text-muted-gray">✂</span>
              </div>
              <div>
                <div className="text-sm font-semibold text-deep">Додати виліт (Bleed)</div>
                <div className="text-[11px] text-muted-gray">Припуск на обрізку для сублімації</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-deep font-semibold">5 мм</span>
              <Switch
                checked={exportSettings.bleed === 5}
                onCheckedChange={(checked) => setExportSettings({ bleed: checked ? 5 : 0 })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Export Summary */}
      <div className="rounded-2xl bg-gradient-to-br from-charcoal-dark to-charcoal p-6 text-white">
        <div className="flex flex-wrap items-start gap-4 mb-6">
          <div className="flex-1 min-w-[150px]">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Формат виходу</div>
            <div className="text-sm font-bold">TIFF (CMYK, 16-bit)</div>
          </div>
          <div className="flex-1 min-w-[150px]">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Орієнтовний розмір</div>
            <div className="text-sm font-bold">{exportSettings.resolution === 300 ? '~48 МБ' : '~12 МБ'}</div>
          </div>
          <div className="flex-1 min-w-[150px]">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Панелі лекал</div>
            <div className="text-sm font-bold">4 шт (Пілочка + Спинка + 2× Рукав)</div>
          </div>
          <div className="flex-1 min-w-[150px]">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Додаткові файли</div>
            <div className="text-sm font-bold">SVG логотипи + ASE палітра</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => simulateExport()}
            disabled={isExporting}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-sport-red to-sport-red-dark text-white font-bold text-sm shadow-lg shadow-red-900/30 hover:shadow-xl hover:shadow-red-900/40 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Експортування...
              </>
            ) : (
              <>
                <FileImage size={18} />
                Експортувати розгортку в TIFF (CMYK)
              </>
            )}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => simulateExport()}
            disabled={isExporting}
            className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 text-white font-semibold text-sm hover:bg-white/20 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            <FolderArchive size={18} />
            <span className="hidden sm:inline">Завантажити архів (.TIFF + .SVG + .ASE)</span>
            <span className="sm:hidden">Архів шарів</span>
          </motion.button>
        </div>
      </div>

      {/* File manifest */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-pearl/50">
          <h4 className="text-sm font-bold text-deep">Маніфест файлів експорту</h4>
        </div>
        <div className="p-4">
          <div className="space-y-2">
            {[
              { name: `maxsport_pattern_${exportSettings.resolution}dpi.tiff`, type: 'TIFF CMYK', size: exportSettings.resolution === 300 ? '48.2 МБ' : '12.1 МБ', icon: '📐' },
              { name: 'maxsport_pilochka_front.tiff', type: 'TIFF CMYK', size: exportSettings.resolution === 300 ? '16.4 МБ' : '4.1 МБ', icon: '👕' },
              { name: 'maxsport_spynka_back.tiff', type: 'TIFF CMYK', size: exportSettings.resolution === 300 ? '17.8 МБ' : '4.5 МБ', icon: '👕' },
              { name: 'maxsport_rukav_sleeve_L.tiff', type: 'TIFF CMYK', size: exportSettings.resolution === 300 ? '7.2 МБ' : '1.8 МБ', icon: '💪' },
              { name: 'maxsport_rukav_sleeve_R.tiff', type: 'TIFF CMYK', size: exportSettings.resolution === 300 ? '7.2 МБ' : '1.8 МБ', icon: '💪' },
              { name: 'logo_trident.svg', type: 'SVG Vector', size: '24 КБ', icon: '🔱' },
              { name: 'logo_sponsor_nova_poshta.svg', type: 'SVG Vector', size: '18 КБ', icon: '📦' },
              { name: 'number_10.svg', type: 'SVG Vector', size: '8 КБ', icon: '🔢' },
              { name: 'maxsport_palette.ase', type: 'Adobe Swatch', size: '2 КБ', icon: '🎨' },
            ].map((file, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-pearl/50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-base">{file.icon}</span>
                  <div>
                    <div className="text-xs font-mono font-semibold text-deep">{file.name}</div>
                    <div className="text-[10px] text-muted-gray">{file.type}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-muted-gray">{file.size}</span>
                  <Check size={14} className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
