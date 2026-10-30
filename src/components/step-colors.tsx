'use client';

import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Palette, CheckCircle, AlertCircle } from 'lucide-react';
import { usePipelineStore } from '@/store/pipeline-store';

export function StepColors() {
  const { isComplete, colors } = usePipelineStore();

  if (!isComplete) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto"
      >
        <div className="rounded-2xl bg-white border border-gray-100 shadow-lg p-12 text-center">
          <Palette size={48} className="mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-bold text-deep mb-2">Квантизація кольорів</h3>
          <p className="text-sm text-muted-gray">
            Завантажте макет, щоб побачити витягнуті кольори та CMYK-мепінг
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
      className="max-w-5xl mx-auto space-y-4"
    >
      {/* Summary badge row */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Badge variant="outline" className="px-3 py-1.5 text-xs bg-white border-gray-200">
          <span className="text-muted-gray">Метод:</span>
          <span className="ml-1.5 font-semibold text-deep">K-Means (CIELAB, k={colors.length})</span>
        </Badge>
        <Badge variant="outline" className="px-3 py-1.5 text-xs bg-white border-gray-200">
          <span className="text-muted-gray">Палітра фабрики:</span>
          <span className="ml-1.5 font-semibold text-deep">кольори форма.ai</span>
        </Badge>
        <Badge variant="outline" className="px-3 py-1.5 text-xs bg-emerald-50 border-emerald-200 text-emerald-700">
          <CheckCircle size={11} className="mr-1" />
          Сер. ΔE збіг: {(colors.reduce((s, c) => s + c.deltaE, 0) / colors.length).toFixed(1)}%
        </Badge>
      </div>

      {/* Color grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {colors.map((color, index) => {
          const isHighMatch = color.deltaE >= 95;
          const isMedMatch = color.deltaE >= 85;

          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: index * 0.08, duration: 0.4 }}
              className="rounded-2xl bg-white border border-gray-100 shadow-lg overflow-hidden group hover:shadow-xl transition-shadow"
            >
              {/* Color swatch header */}
              <div className="relative h-20 overflow-hidden">
                <div
                  className="absolute inset-0 transition-transform duration-500 group-hover:scale-105"
                  style={{ backgroundColor: color.hex }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/10" />
                {/* Percentage pill */}
                <div className="absolute top-3 right-3">
                  <span className="px-2 py-0.5 rounded-full bg-black/30 backdrop-blur-sm text-white text-[10px] font-bold">
                    {color.percentage}%
                  </span>
                </div>
                {/* Delta-E badge */}
                <div className="absolute bottom-3 left-3">
                  <span className={`
                    px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1
                    ${isHighMatch
                      ? 'bg-emerald-500/90 text-white'
                      : isMedMatch
                        ? 'bg-yellow-500/90 text-white'
                        : 'bg-orange-500/90 text-white'
                    }
                  `}>
                    {isHighMatch ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                    {color.deltaE}% збіг
                  </span>
                </div>
              </div>

              <div className="p-4 space-y-3">
                {/* HEX & Lab Name */}
                <div>
                  <div className="text-[11px] text-muted-gray mb-0.5">{color.labName}</div>
                  <div className="font-mono text-sm font-bold text-deep">{color.hex}</div>
                </div>

                {/* CMYK Values */}
                <div className="grid grid-cols-4 gap-1">
                  {[
                    { label: 'C', value: color.cmyk.c, color: 'bg-cyan-500' },
                    { label: 'M', value: color.cmyk.m, color: 'bg-pink-500' },
                    { label: 'Y', value: color.cmyk.y, color: 'bg-yellow-400' },
                    { label: 'K', value: color.cmyk.k, color: 'bg-gray-800' },
                  ].map(ch => (
                    <div key={ch.label} className="text-center">
                      <div className={`h-1 rounded-full ${ch.color} mb-1`} style={{ width: `${Math.max(ch.value, 5)}%`, margin: '0 auto 4px' }} />
                      <div className="text-[10px] font-bold text-muted-gray">{ch.label}</div>
                      <div className="text-xs font-mono font-semibold text-deep">{ch.value}%</div>
                    </div>
                  ))}
                </div>

                {/* Factory Match */}
                <div className="pt-2 border-t border-gray-100">
                  <div className="text-[10px] text-muted-gray uppercase tracking-wider mb-1">Фабричний колір</div>
                  <div className="text-xs font-bold text-deep">{color.factoryMatch}</div>
                  <div className="text-[11px] text-muted-gray font-mono">{color.pantone}</div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* CMYK Table (compact) */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-pearl/50">
          <h4 className="text-sm font-bold text-deep">Повна таблиця кольорів для сублімації</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-pearl/50">
                <th className="px-4 py-2.5 text-left font-semibold text-muted-gray">Колір</th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-gray">HEX</th>
                <th className="px-4 py-2.5 text-center font-semibold text-muted-gray">C</th>
                <th className="px-4 py-2.5 text-center font-semibold text-muted-gray">M</th>
                <th className="px-4 py-2.5 text-center font-semibold text-muted-gray">Y</th>
                <th className="px-4 py-2.5 text-center font-semibold text-muted-gray">K</th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-gray">Фабричний збіг</th>
                <th className="px-4 py-2.5 text-center font-semibold text-muted-gray">ΔE</th>
              </tr>
            </thead>
            <tbody>
              {colors.map((color, i) => (
                <tr key={i} className="border-t border-gray-50 hover:bg-pearl/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md border border-gray-200 shrink-0" style={{ backgroundColor: color.hex }} />
                      <span className="font-medium text-deep">{color.labName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono font-semibold text-deep">{color.hex}</td>
                  <td className="px-4 py-2.5 text-center font-mono">{color.cmyk.c}%</td>
                  <td className="px-4 py-2.5 text-center font-mono">{color.cmyk.m}%</td>
                  <td className="px-4 py-2.5 text-center font-mono">{color.cmyk.y}%</td>
                  <td className="px-4 py-2.5 text-center font-mono">{color.cmyk.k}%</td>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-deep">{color.factoryMatch}</div>
                    <div className="text-muted-gray text-[10px]">{color.pantone}</div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`
                      px-1.5 py-0.5 rounded-full text-[10px] font-bold
                      ${color.deltaE >= 95
                        ? 'bg-emerald-100 text-emerald-700'
                        : color.deltaE >= 85
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-orange-100 text-orange-700'
                      }
                    `}>
                      {color.deltaE}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
