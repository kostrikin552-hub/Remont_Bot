/**
 * src/components/CalculatorScreen.tsx
 * 
 * Модуль решения болей сметы:
 * - Боль 5: Смежные специалисты (натяжные потолки, кондиционеры, двери)
 * - Боль 7: Маркетингово-юридический бейдж «100% твёрдая смета в договоре»
 * - Боль 8: Карточка полного бюджета новоселья: fullMoveInBudget = grandTotal * 2.2 (Формула 25/40/25/10)
 */

import React, { useMemo, useState } from 'react';
import {
  ShieldCheck,
  Zap,
  Truck,
  Wrench,
  Trash2,
  Percent,
  Wind,
  Home,
  CheckCircle2,
  ChevronDown,
  Info,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { calculateMvpRenovation, formatRubles, MvpInput } from '../utils/pricingEngine';
import { triggerHaptic } from '../utils/telegram';

interface CalculatorScreenProps {
  initialArea?: number;
  initialHousingType?: 'white_box' | 'new_concrete' | 'secondary' | 'old_fund';
  initialRepairClass?: 'cosmetic' | 'capital' | 'designer';
  initialBathroomsCount?: 1 | 2;
  grandTotalOverride?: number;
  onOpenBooking: () => void;
}

export const CalculatorScreen: React.FC<CalculatorScreenProps> = ({
  initialArea = 55,
  initialHousingType = 'new_concrete',
  initialRepairClass = 'capital',
  initialBathroomsCount = 1,
  grandTotalOverride,
  onOpenBooking,
}) => {
  const [area, setArea] = useState(initialArea);
  const [housingType, setHousingType] = useState(initialHousingType);
  const [repairClass, setRepairClass] = useState(initialRepairClass);
  const [bathroomsCount, setBathroomsCount] = useState(initialBathroomsCount);
  const [showFormulaDetails, setShowFormulaDetails] = useState(false);

  const mvpResult = useMemo(() => {
    return calculateMvpRenovation({
      area,
      housingType,
      repairClass,
      bathroomsCount,
    });
  }, [area, housingType, repairClass, bathroomsCount]);

  // Если передана сумма из основной сметы приложения, используем её
  const activeGrandTotal = grandTotalOverride || mvpResult.grandTotal;
  const activeFullBudget = Math.round(activeGrandTotal * 2.2);

  const budgetBreakdown = useMemo(() => {
    return {
      works: Math.round(activeFullBudget * 0.25),
      materials: Math.round(activeFullBudget * 0.40),
      furnitureAndTech: Math.round(activeFullBudget * 0.25),
      specialistsAndMisc: Math.round(activeFullBudget * 0.10),
    };
  }, [activeFullBudget]);

  return (
    <div className="space-y-3 font-['Manrope',sans-serif]">
      {/* ======================================================== */}
      {/* БОЛЬ 7: Маркетингово-юридический бейдж «100% твёрдая смета в договоре» */}
      {/* ======================================================== */}
      <div className="rounded-2xl p-4 bg-gradient-to-br from-emerald-950 via-zinc-900 to-zinc-950 text-white border border-emerald-500/30 shadow-lg relative overflow-hidden">
        <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                Гарантия договора
              </span>
              <span className="text-[11px] text-zinc-400">ГОСТ 31189 & СП 71.13330</span>
            </div>
            <h3 className="text-sm font-bold text-white mt-1">
              100% твёрдая смета в договоре
            </h3>
            <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
              Фиксируем конечную стоимость в договоре до начала работ. Любые просчёты, непредвиденные расходники или перерасход материалов компенсируются за счёт компании, а не вашего кошелька.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-zinc-800 text-center">
          <div>
            <span className="text-[10px] text-zinc-400 block">Плата за скрытое:</span>
            <span className="text-xs font-extrabold text-emerald-400">0 ₽</span>
          </div>
          <div className="border-x border-zinc-800">
            <span className="text-[10px] text-zinc-400 block">Предоплата:</span>
            <span className="text-xs font-extrabold text-white">По факту акта</span>
          </div>
          <div>
            <span className="text-[10px] text-zinc-400 block">Гарантия качества:</span>
            <span className="text-xs font-extrabold text-emerald-400">36 месяцев</span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* БОЛЬ 8: Карточка полного бюджета заселения «Формула 25/40/25/10» */}
      {/* ======================================================== */}
      <div className="rounded-2xl p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <Home className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-extrabold text-zinc-950 dark:text-white block">
                Полный бюджет до заселения
              </span>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                Формула 25 / 40 / 25 / 10 (Смета × 2.2)
              </span>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/40">
            × 2.2
          </span>
        </div>

        {/* Главная цифра бюджета заселения */}
        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block">
              Ориентир «под ключ с мебелью»:
            </span>
            <span className="text-lg sm:text-xl font-black text-zinc-950 dark:text-white tabular-nums">
              {formatRubles(activeFullBudget)}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-zinc-400 block">Базовая смета:</span>
            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 tabular-nums">
              {formatRubles(activeGrandTotal)}
            </span>
          </div>
        </div>

        {/* Визуальный прогресс-бар долей 25 / 40 / 25 / 10 */}
        <div className="space-y-1.5">
          <div className="h-3 w-full rounded-full overflow-hidden flex bg-zinc-100 dark:bg-zinc-800">
            <div
              style={{ width: '25%' }}
              className="bg-indigo-500 h-full transition-all"
              title="25% — СМР и отделка"
            />
            <div
              style={{ width: '40%' }}
              className="bg-emerald-500 h-full transition-all"
              title="40% — Черновые и чистовые материалы"
            />
            <div
              style={{ width: '25%' }}
              className="bg-amber-500 h-full transition-all"
              title="25% — Мебель, кухня и техника"
            />
            <div
              style={{ width: '10%' }}
              className="bg-sky-500 h-full transition-all"
              title="10% — Смежные специалисты и резерв"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
            <div className="p-2 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-900/40">
              <span className="font-bold text-indigo-700 dark:text-indigo-300 block">25% Работы</span>
              <span className="text-[10px] text-zinc-600 dark:text-zinc-400 block">
                {formatRubles(budgetBreakdown.works)}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40">
              <span className="font-bold text-emerald-700 dark:text-emerald-300 block">40% Материалы</span>
              <span className="text-[10px] text-zinc-600 dark:text-zinc-400 block">
                {formatRubles(budgetBreakdown.materials)}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40">
              <span className="font-bold text-amber-700 dark:text-amber-300 block">25% Мебель & быт</span>
              <span className="text-[10px] text-zinc-600 dark:text-zinc-400 block">
                {formatRubles(budgetBreakdown.furnitureAndTech)}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-sky-50/60 dark:bg-sky-950/30 border border-sky-200/60 dark:border-sky-900/40">
              <span className="font-bold text-sky-700 dark:text-sky-300 block">10% Смежники</span>
              <span className="text-[10px] text-zinc-600 dark:text-zinc-400 block">
                {formatRubles(budgetBreakdown.specialistsAndMisc)}
              </span>
            </div>
          </div>
        </div>

        {/* Спойлер пояснения формулы */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setShowFormulaDetails(!showFormulaDetails);
          }}
          className="w-full text-left flex items-center justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white pt-1"
        >
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-zinc-400" />
            Зачем нужен расчёт на 2.2×?
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${showFormulaDetails ? 'rotate-180' : ''}`}
          />
        </button>

        {showFormulaDetails && (
          <div className="text-[11px] text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/50 p-2.5 rounded-xl border border-zinc-200/60 dark:border-zinc-700/50 space-y-1.5 leading-relaxed">
            <p>
              Частая ошибка заказчиков — считать, что стоимость сметы прораба равна расходам на весь переезд. На практике ремонт без кухни, дверей, штор и кондиционеров непригоден для жизни.
            </p>
            <p>
              Формула <b>25/40/25/10</b> защищает от внезапной нехватки средств перед новосельем и даёт честную картину инвестиций.
            </p>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* БОЛИ 1, 2, 3, 4, 5, 6: Решения прорабских болей, зашитые в смету */}
      {/* ======================================================== */}
      <div className="rounded-2xl p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Зашито в смету без сюрпризов
          </span>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
            6 гарантий
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {/* Боль 1: Электроточки */}
          <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/50 flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold text-zinc-900 dark:text-white block">
                Электрика по ГОСТ ({mvpResult.electricalPointsCount} точек)
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug block mt-0.5">
                Авторасчёт по эргономике: {mvpResult.electricalPointsCount} шт. (Math.ceil(S × 1.15))
              </span>
            </div>
          </div>

          {/* Боль 2: Доставка и подъем */}
          <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/50 flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Truck className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold text-zinc-900 dark:text-white block">
                Логистика & подъём ({formatRubles(mvpResult.deliveryAndLiftingCost)})
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug block mt-0.5">
                Включена аренда транспорта и ручной занос на этаж
              </span>
            </div>
          </div>

          {/* Боль 3: Расходники */}
          <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/50 flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Wrench className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold text-zinc-900 dark:text-white block">
                Расходники ({formatRubles(mvpResult.consumablesCost)})
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug block mt-0.5">
                Буры, плёнка, скотч, мешки: 800 ₽/м² зашиты в смету
              </span>
            </div>
          </div>

          {/* Боль 4: Мусор ТБО */}
          <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/50 flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold text-zinc-900 dark:text-white block">
                Вывоз ТБО ({mvpResult.trashContainersCount} конт. 8 м³)
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug block mt-0.5">
                Авторасчёт контейнеров: {formatRubles(mvpResult.trashRemovalCost)} с погрузкой
              </span>
            </div>
          </div>

          {/* Боль 6: Запас на подрезку 10% */}
          <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/50 flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Percent className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold text-zinc-900 dark:text-white block">
                Запас на подрезку (+10%)
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug block mt-0.5">
                Технологический коэффициент × 1.10 на черновой объём
              </span>
            </div>
          </div>

          {/* Боль 5: Смежные специалисты */}
          <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/50 flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
              <Wind className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold text-zinc-900 dark:text-white block">
                Смежники (10% бюджета)
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug block mt-0.5">
                Натяжные потолки, трассы сплит-систем, входные/межкомнатные двери
              </span>
            </div>
          </div>
        </div>

        {/* CTA фиксации сметы */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('heavy');
            onOpenBooking();
          }}
          className="w-full mt-2 py-3 px-4 rounded-xl bg-zinc-900 hover:bg-black text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100 font-bold text-xs sm:text-sm transition shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
        >
          <Calendar className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
          <span>Зафиксировать 100% твёрдую смету & замер 0 ₽</span>
        </button>
      </div>
    </div>
  );
};
