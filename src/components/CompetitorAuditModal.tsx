import React, { useState, useMemo } from 'react';
import {
  X,
  SearchCheck,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { formatCurrency, triggerHaptic } from '../utils/telegram';

interface CompetitorAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyHonestEstimate: (area: number, renovationClass: 'cosmetic' | 'capital' | 'designer') => void;
  initialArea?: number;
}

export const CompetitorAuditModal: React.FC<CompetitorAuditModalProps> = ({
  isOpen,
  onClose,
  onApplyHonestEstimate,
  initialArea = 54,
}) => {
  const [competitorPrice, setCompetitorPrice] = useState<string>('1650000');
  const [auditArea, setAuditArea] = useState<number>(initialArea);
  const [auditType, setAuditType] = useState<'cosmetic' | 'capital' | 'designer'>('capital');

  const rawNum = parseInt(competitorPrice.replace(/\D/g, ''), 10) || 0;
  const pricePerMeter = auditArea > 0 ? Math.round(rawNum / auditArea) : 0;

  // Рыночные эталоны 2026 года для работ под ключ (без накруток)
  const BENCHMARKS = {
    cosmetic: { min: 4000, market: 5500, max: 7500, name: 'Косметический' },
    capital: { min: 7500, market: 10500, max: 14500, name: 'Капитальный' },
    designer: { min: 14000, market: 18500, max: 25000, name: 'Дизайнерский' },
  };

  const currentBenchmark = BENCHMARKS[auditType];

  // Диагностика сметы
  const verdict = useMemo(() => {
    if (pricePerMeter === 0) {
      return {
        status: 'neutral',
        title: 'Введите сумму чужой сметы',
        description: 'Укажите предложенную другим прорабом стоимость для мгновенного анализа.',
        color: 'zinc',
      };
    }

    if (pricePerMeter < currentBenchmark.min) {
      return {
        status: 'danger_low',
        title: '🚨 Опасное занижение («Смета-ловушка»)',
        description: `Заявленная цена ${formatCurrency(pricePerMeter)}/м² подозрительно ниже реальной себестоимости по ГОСТ. Вероятность 98%, что в смету забыли включить 30–50% базовых работ (подъем смесей на этаж, вынос мусора, шумоизоляцию, гидроизоляцию, штробы под проводку). В процессе ремонта вам выставят доп. соглашений на 300 000 – 600 000 ₽!`,
        color: 'red',
        difference: `Ниже честного рынка на ${Math.round((1 - pricePerMeter / currentBenchmark.market) * 100)}%`,
      };
    }

    if (pricePerMeter > currentBenchmark.max) {
      return {
        status: 'danger_high',
        title: '⚠️ Завышение сметы на 25–40% выше рынка',
        description: `Заявленная цена ${formatCurrency(pricePerMeter)}/м² существенно превышает рыночные нормативы 2026 года. Скорее всего, вы переплачиваете за бренд, раздутые офисные расходы компании или за скрытых посредников-агрегаторов.`,
        color: 'amber',
        difference: `Выше честного рынка на ${Math.round((pricePerMeter / currentBenchmark.market - 1) * 100)}%`,
      };
    }

    return {
      status: 'fair',
      title: '✅ В пределах рыночного диапазона',
      description: `Ставка ${formatCurrency(pricePerMeter)}/м² соответствует средней норме рынка. Однако обязательно проверьте наличие 5 критических пунктов договора: фиксируется ли сумма навсегда, за чей счет устраняются переделки и предусмотрена ли поэтапная оплата строго без аванса.`,
      color: 'emerald',
      difference: 'Рыночная цена без явного обмана',
    };
  }, [pricePerMeter, currentBenchmark]);

  if (!isOpen) return null;

  const handleApply = () => {
    triggerHaptic('medium');
    onApplyHonestEstimate(auditArea, auditType);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <SearchCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm sm:text-base font-bold text-zinc-950 dark:text-white leading-tight">
                  Экспресс-аудит чужой сметы
                </h2>
                <span className="text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  Анти-обман
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Проверьте смету любого мастера на скрытые доплаты за 30 сек
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Input Form */}
        <div className="p-4 overflow-y-auto space-y-4">
          {/* 1. Чужая сумма */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Сколько вам насчитали в чужой смете? (₽)
            </label>
            <div className="relative">
              <input
                type="text"
                value={competitorPrice}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/\D/g, '');
                  setCompetitorPrice(cleaned);
                }}
                placeholder="Например: 1 500 000"
                className="w-full pl-3 pr-12 py-2.5 text-sm font-bold rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 tabular-nums focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
              <span className="absolute right-3 top-2.5 text-xs font-semibold text-zinc-400">
                рублей
              </span>
            </div>
            {/* Quick preset buttons */}
            <div className="flex gap-1.5 mt-1.5">
              {['950 000', '1 450 000', '1 950 000', '2 600 000'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setCompetitorPrice(preset.replace(/\s/g, ''));
                  }}
                  className="text-[10px] py-0.5 px-2 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 font-medium"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Площадь и Тип */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Площадь объекта:
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={20}
                  max={250}
                  value={auditArea}
                  onChange={(e) => setAuditArea(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 tabular-nums focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
                <span className="absolute right-3 top-2 text-xs font-medium text-zinc-400">
                  м²
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Тип ремонта:
              </label>
              <select
                value={auditType}
                onChange={(e) => setAuditType(e.target.value as any)}
                className="w-full px-2 py-2 text-xs font-bold rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              >
                <option value="cosmetic">Косметический</option>
                <option value="capital">Капитальный (ГОСТ)</option>
                <option value="designer">Дизайнерский</option>
              </select>
            </div>
          </div>

          {/* 3. Вердикт аудита */}
          <div
            className={`p-3.5 rounded-xl border transition-all ${
              verdict.color === 'red'
                ? 'bg-rose-50/90 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60'
                : verdict.color === 'amber'
                ? 'bg-amber-50/90 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60'
                : verdict.color === 'emerald'
                ? 'bg-emerald-50/90 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60'
                : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="font-extrabold text-xs sm:text-sm">
                {verdict.title}
              </span>
              {pricePerMeter > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/80 dark:bg-zinc-800/80 tabular-nums">
                  {pricePerMeter.toLocaleString('ru-RU')} ₽/м²
                </span>
              )}
            </div>

            <p className="text-xs leading-relaxed opacity-90">
              {verdict.description}
            </p>

            {verdict.difference && (
              <div className="mt-2 pt-2 border-t border-black/10 dark:border-white/10 flex items-center gap-1.5 text-[11px] font-bold">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>{verdict.difference}</span>
              </div>
            )}
          </div>

          {/* 4. Чек-лист «5 ловушек в сметах» */}
          <div className="bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Что часто «забывают» в нечестных сметах:
            </span>
            <div className="space-y-1 text-[11px] text-zinc-600 dark:text-zinc-300">
              <div className="flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span>Подъем стройматериалов и смесей (до +45 000 ₽)</span>
              </div>
              <div className="flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span>Вынос, погрузка и утилизация строймусора контейнером (до +35 000 ₽)</span>
              </div>
              <div className="flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span>Гидроизоляция санузлов и шумоизоляция стояков (до +28 000 ₽)</span>
              </div>
              <div className="flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span>Грунтовка в 2 слоя перед каждым этапом шпаклевки</span>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <button
            onClick={handleApply}
            className="w-full py-3 px-4 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-zinc-800 dark:hover:bg-zinc-100 active:scale-[0.98] transition-all shadow-md"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Собрать честную смету ГОСТ на {auditArea} м²</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
