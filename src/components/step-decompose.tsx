'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Download, Eye, Layers, ImageIcon, FileType2, ToggleLeft, ToggleRight } from 'lucide-react';
import { usePipelineStore } from '@/store/pipeline-store';
import {
  drawPatternUnwrapSVG,
  drawBackgroundTextureSVG,
  drawTridentSVG,
  drawSponsorLogoSVG,
  drawNumberSVG,
  drawJerseySVG,
} from '@/lib/svg-generators';

export function StepDecompose() {
  const { isComplete, isDemoLoaded, extractedLogos, backgroundLayer, userUploadedImageData, originalImage } = usePipelineStore();
  const [showBleed, setShowBleed] = useState(true);
  const [showBlindZones, setShowBlindZones] = useState(true);
  const patternCanvasRef = useRef<HTMLCanvasElement>(null);

  const bgTextureSvg = useMemo(() => drawBackgroundTextureSVG(500, 400), []);
  const patternSvg = useMemo(() =>
    drawPatternUnwrapSVG({ width: 600, height: 420, showBleed, showBlindZones }),
  [showBleed, showBlindZones]);
  const jerseySvg = useMemo(() => drawJerseySVG({ width: 320, height: 400 }), []);
  const tridentSvg = useMemo(() => drawTridentSVG(100), []);
  const sponsorSvg = useMemo(() => drawSponsorLogoSVG(160, 65), []);
  const numberSvg = useMemo(() => drawNumberSVG('10', 100), []);

  useEffect(() => {
    if (!userUploadedImageData || !patternCanvasRef.current) return;
    const canvas = patternCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 600;
    canvas.height = 420;

    ctx.fillStyle = '#2D2D2D';
    ctx.fillRect(0, 0, 600, 420);

    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = userUploadedImageData.width;
    tmpCanvas.height = userUploadedImageData.height;
    const tmpCtx = tmpCanvas.getContext('2d')!;
    tmpCtx.putImageData(userUploadedImageData, 0, 0);

    const drawPanel = (x: number, y: number, w: number, h: number, label: string) => {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 6);
      ctx.clip();
      ctx.drawImage(tmpCanvas, x, y, w, h);
      ctx.restore();

      ctx.strokeStyle = '#ffffff33';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 6);
      ctx.stroke();

      ctx.fillStyle = '#9CA3AF';
      ctx.font = '700 9px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + w / 2, y - 8);
    };

    drawPanel(30, 52, 180, 315, 'ПІЛОЧКА');
    drawPanel(228, 42, 180, 328, 'СПИНКА');
    drawPanel(432, 35, 120, 180, 'РУКАВ (П)');
    drawPanel(432, 235, 120, 180, 'РУКАВ (Л)');

    if (showBleed) {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#E91E63';
      ctx.lineWidth = 0.8;
      [[22, 44, 196, 331], [220, 34, 196, 344], [424, 27, 136, 196], [424, 227, 136, 196]].forEach(([bx, by, bw, bh]) => {
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 4);
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    if (showBlindZones) {
      ctx.fillStyle = 'rgba(255,165,0,0.12)';
      ctx.fillRect(39, 55, 27, 95);
      ctx.fillRect(174, 55, 27, 95);
      ctx.fillRect(237, 45, 27, 90);
      ctx.fillRect(372, 45, 27, 90);
    }
  }, [userUploadedImageData, showBleed, showBlindZones]);

  if (!isComplete) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto"
      >
        <div className="rounded-2xl bg-white border border-gray-100 shadow-lg p-12 text-center">
          <Layers size={48} className="mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-bold text-deep mb-2">Декомпозиція та розгортка</h3>
          <p className="text-sm text-muted-gray">
            Завантажте макет на Кроці 1, щоб побачити AI-декомпозицію шарів
          </p>
        </div>
      </motion.div>
    );
  }

  const demoLogos = [
    { id: 'trident', name: 'Тризуб (Герб України)', svg: tridentSvg },
    { id: 'sponsor', name: 'Спонсор "Нова Пошта"', svg: sponsorSvg },
    { id: 'number', name: 'Номер гравця (#10)', svg: numberSvg },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-5xl mx-auto"
    >
      <Tabs defaultValue="background" className="w-full">
        <TabsList className="w-full grid grid-cols-3 mb-6 rounded-xl bg-pearl p-1 h-auto">
          <TabsTrigger
            value="background"
            className="flex items-center gap-2 py-2.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-md rounded-lg cursor-pointer"
          >
            <Eye size={14} />
            Чистий фон та текстура
          </TabsTrigger>
          <TabsTrigger
            value="logos"
            className="flex items-center gap-2 py-2.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-md rounded-lg cursor-pointer"
          >
            <ImageIcon size={14} />
            Ізольовані логотипи
            <Badge className="bg-sport-red text-white text-[10px] px-1.5 py-0">{extractedLogos.length}</Badge>
          </TabsTrigger>
          <TabsTrigger
            value="concept"
            className="flex items-center gap-2 py-2.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-md rounded-lg cursor-pointer"
          >
            <Layers size={14} />
            3D/2D Концепт
          </TabsTrigger>
        </TabsList>

        {/* Background + Pattern Unwrap */}
        <TabsContent value="background">
          <div className="space-y-4">
            {/* Toggle controls */}
            <div className="flex flex-wrap items-center gap-4 px-1">
              <button
                onClick={() => setShowBleed(!showBleed)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer
                  border-pink-200 bg-pink-50/50 text-pink-700 hover:bg-pink-100/50"
              >
                {showBleed ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                Виліт (5 мм)
              </button>
              <button
                onClick={() => setShowBlindZones(!showBlindZones)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer
                  border-orange-200 bg-orange-50/50 text-orange-700 hover:bg-orange-100/50"
              >
                {showBlindZones ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                Сліпі зони
              </button>
              <Badge variant="outline" className="text-[10px] bg-white">
                Метод інпейнтингу: LaMa Neural Network
              </Badge>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Inpainted Background */}
              <div className="rounded-2xl bg-white border border-gray-100 shadow-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-pearl/50">
                  <h4 className="text-sm font-bold text-deep">Реконструйований фон</h4>
                  <p className="text-[11px] text-muted-gray">Логотипи видалено та заповнено AI-інпейнтингом</p>
                </div>
                <div className="p-4 flex items-center justify-center bg-gray-50/50 min-h-[280px]">
                  {isDemoLoaded ? (
                    <div dangerouslySetInnerHTML={{ __html: bgTextureSvg }} className="max-w-full" />
                  ) : originalImage ? (
                    <div className="relative">
                      <img src={originalImage} alt="Background" className="max-h-[260px] rounded-lg opacity-80" />
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/10 rounded-lg" />
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Pattern Unwrap */}
              <div className="rounded-2xl bg-white border border-gray-100 shadow-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-pearl/50">
                  <h4 className="text-sm font-bold text-deep">2D розгортка лекал</h4>
                  <p className="text-[11px] text-muted-gray">Пілочка · Спинка · Рукави з припусками на шви</p>
                </div>
                <div className="p-4 flex items-center justify-center bg-[#2D2D2D] rounded-b-2xl min-h-[280px]">
                  {userUploadedImageData ? (
                    <canvas ref={patternCanvasRef} className="max-w-full rounded-lg" style={{ maxHeight: 320 }} />
                  ) : (
                    <div dangerouslySetInnerHTML={{ __html: patternSvg }} className="max-w-full" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Extracted Logos */}
        <TabsContent value="logos">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(isDemoLoaded ? demoLogos : extractedLogos.map(l => ({ id: l.id, name: l.name, svg: '' }))).map((logo, index) => (
              <motion.div
                key={logo.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="rounded-2xl bg-white border border-gray-100 shadow-lg overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-gray-100">
                  <h4 className="text-sm font-bold text-deep">{logo.name}</h4>
                </div>
                <div className="checkerboard p-6 flex items-center justify-center min-h-[140px]">
                  {isDemoLoaded && logo.svg ? (
                    <div dangerouslySetInnerHTML={{ __html: logo.svg }} />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-gray-200/50 flex items-center justify-center">
                      <ImageIcon size={24} className="text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="px-4 py-3 flex gap-2 border-t border-gray-100 bg-pearl/30">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-deep hover:bg-gray-50 transition-all cursor-pointer"
                  >
                    <Download size={12} />
                    PNG
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-sport-red to-sport-red-dark text-white text-xs font-bold shadow-sm hover:shadow-md transition-all cursor-pointer"
                  >
                    <FileType2 size={12} />
                    SVG (Potrace)
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        {/* Concept View */}
        <TabsContent value="concept">
          <div className="rounded-2xl bg-white border border-gray-100 shadow-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-pearl/50">
              <h4 className="text-sm font-bold text-deep">Оригінальний 3D/2D концепт</h4>
              <p className="text-[11px] text-muted-gray">Повне референсне зображення для порівняння</p>
            </div>
            <div className="p-8 flex items-center justify-center bg-gradient-to-b from-gray-50 to-white min-h-[350px]">
              {isDemoLoaded ? (
                <div dangerouslySetInnerHTML={{ __html: jerseySvg }} className="max-w-sm" />
              ) : originalImage ? (
                <img src={originalImage} alt="Concept" className="max-h-[340px] rounded-xl shadow-lg" />
              ) : null}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
