import React from 'react';
import { Bath, Ruler, CheckCircle2, PackageCheck, AlertCircle } from 'lucide-react';
import { BathroomsCount, CeilingHeight, RenovationClassId } from '../types';
import { triggerHaptic, formatCurrency } from '../utils/telegram';

interface EngineeringParametersProps {
  bathroomsCount: BathroomsCount;
  onChangeBathrooms: (count: BathroomsCount) => void;
  ceilingHeight: CeilingHeight;
  onChangeCeiling: (height: CeilingHeight) => void;
  area: number;
  wallArea: number;
  perimeterRatio: number;
  finishingEstimate: {
    min: number;
    max: number;
    minPerMeter: number;
    maxPerMeter: number;
  };
  wetAreasCost: {
    works: number;
    materials: number;
  };
  renovationClassId: RenovationClassId;
}

export const EngineeringParameters: React.FC<EngineeringParametersProps> = ({
  bathroomsCount,
  onChangeBathrooms,
  ceilingHeight,
  onChangeCeiling,
  area,
  wallArea,
  perimeterRatio,
  finishingEstimate,
  wetAreasCost,
}) => {
  const BATHROOM_OPTIONS: { id: BathroomsCount; title: string; subtitle: string }[] = [
    { id: 1, title: '1 совм.', subtitle: 'Базовый узел' },
    { id: 1.5, title: 'Раздельный', subtitle: 'Ванная + туалет' },
    { id: 2, title: '2 санузла', subtitle: 'Мастер + гостевой' },
    { id: 3, title: '3+ санузла', subtitle: 'Премиум проект' },
  ];

  const CEILING_OPTIONS: { id: CeilingHeight; title: string; hint: string }[] = [
    { id: 2.7, title: '2.7 м', hint: 'Типовой дом' },
    { id: 3.0, title: '3.0 м', hint: 'Комфорт' },
    { id: 3.2, title: '3.2 м', hint: 'Сталинка / Бизнес' },
    { id: 3.5, title: '3.5 м+', hint: 'Лофт / Премиум' },
  ];

  const hasExtraBaths = bathroomsCount > 1;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
          2. Инженерные параметры и геометрия
        </span>
        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
          Лазерная точность ГОСТ
        </span>
      </div>

      {/* Мокрые зоны (санузлы) */}
      <div>
        <div className="flex items-center justify-between mb-1.5 px-0.5">
          <label className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
            <Bath className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span>Количество санузлов (Мокрые зоны):</span>
          </label>
          {hasExtraBaths && (
            <span className="text-[10px] font-extrabold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-900/60">
              +{formatCurrency(wetAreasCost.works + wetAreasCost.materials)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-4 gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-lg">
          {BATHROOM_OPTIONS.map((opt) => {
            const isSelected = bathroomsCount === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  onChangeBathrooms(opt.id);
                }}
                className={`py-1.5 px-1 rounded-md text-center transition-all ${
                  isSelected
                    ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-xs font-bold ring-1 ring-zinc-900/10 dark:ring-white/20'
                    : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                <span className="block text-xs leading-tight">{opt.title}</span>
                <span className="block text-[9px] text-zinc-500 dark:text-zinc-400 leading-tight mt-0.5 truncate">
                  {opt.subtitle}
                </span>
              </button>
            );
          })}
        </div>

        {hasExtraBaths && (
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 px-0.5 leading-snug">
            💡 Учтены: доп. коллекторный узел Rehau/Far, штробление, гидроизоляция и укладка керамогранита.
          </p>
        )}
      </div>

      {/* Высота потолков и площадь стен */}
      <div>
        <div className="flex items-center justify-between mb-1.5 px-0.5">
          <label className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
            <Ruler className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Высота потолков:</span>
          </label>
          <span className="text-[11px] font-mono font-bold text-zinc-900 dark:text-white">
            {ceilingHeight} м
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-lg">
          {CEILING_OPTIONS.map((opt) => {
            const isSelected = ceilingHeight === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  onChangeCeiling(opt.id);
                }}
                className={`py-1.5 px-1 rounded-md text-center transition-all ${
                  isSelected
                    ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-xs font-bold ring-1 ring-zinc-900/10 dark:ring-white/20'
                    : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                <span className="block text-xs leading-tight">{opt.title}</span>
                <span className="block text-[9px] text-zinc-500 dark:text-zinc-400 leading-tight mt-0.5 truncate">
                  {opt.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Динамический расчет поверхностей стен */}
      <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-lg p-2.5 border border-zinc-200/80 dark:border-zinc-700/60 flex items-center justify-between gap-2 text-xs">
        <div>
          <span className="text-zinc-600 dark:text-zinc-400 block text-[11px]">
            Расчётная площадь стен:
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-sm font-extrabold text-zinc-950 dark:text-white font-mono">
              {wallArea} м²
            </span>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
              (периметр ×{perimeterRatio} к полу)
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block flex items-center gap-1 justify-end">
            <CheckCircle2 className="w-3 h-3" />
            <span>Нелинейная модель</span>
          </span>
          <span className="text-[9px] text-zinc-400 dark:text-zinc-500">
            Без скрытых доплат за штукатурку
          </span>
        </div>
      </div>

      {/* Вилка «Чистовые материалы (Ориентир)» */}
      <div className="bg-gradient-to-br from-zinc-50 to-amber-50/30 dark:from-zinc-800/50 dark:to-amber-950/20 rounded-lg p-2.5 border border-amber-200/60 dark:border-amber-900/40 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
            <PackageCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Ориентир бюджета на чистовые материалы:</span>
          </span>
          <span className="text-[10px] uppercase font-extrabold text-amber-700 dark:text-amber-300">
            Под ключ
          </span>
        </div>
        <div className="flex items-baseline justify-between pt-0.5">
          <span className="text-xs sm:text-sm font-extrabold text-amber-900 dark:text-amber-200 tabular-nums">
            {formatCurrency(finishingEstimate.min)} — {formatCurrency(finishingEstimate.max)}
          </span>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
            ~{finishingEstimate.minPerMeter.toLocaleString('ru-RU')}–{finishingEstimate.maxPerMeter.toLocaleString('ru-RU')} ₽/м²
          </span>
        </div>
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">
          Включает ориентировочную стоимость: напольные покрытия, керамогранит, чистовая сантехника, двери, выключатели и краска/обои.
        </p>
      </div>
    </div>
  );
};
