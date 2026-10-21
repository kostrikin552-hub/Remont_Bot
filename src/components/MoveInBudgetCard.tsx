import React, { useState, useMemo } from 'react';
import { Home, ChevronDown, Info, ShieldCheck, Sparkles, CheckCircle2 } from 'lucide-react';
import { formatCurrency, triggerHaptic } from '../utils/telegram';

interface MoveInBudgetCardProps {
  grandTotal: number;
}

export const MoveInBudgetCard: React.FC<MoveInBudgetCardProps> = ({ grandTotal }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

  // Формула 25 / 40 / 25 / 10 (Смета на СМР × 2.2)
  const fullBudget = Math.round(grandTotal * 2.2);

  const breakdown = useMemo(() => {
    return {
      works: Math.round(fullBudget * 0.25),
      materials: Math.round(fullBudget * 0.40),
      furniture: Math.round(fullBudget * 0.25),
      specialists: Math.round(fullBudget * 0.10),
    };
  }, [fullBudget]);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden transition-all">
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          setIsOpen(!isOpen);
        }}
        className="w-full p-3.5 flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition cursor-pointer"
      >
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 font-bold">
            <Home className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-zinc-950 dark:text-white">
                Бюджет до заселения с мебелью и техникой
              </span>
              <span className="text-[10px] bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 px-1.5 py-0.2 rounded-sm font-mono font-bold">
                ×2.2 к смете
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
              {isOpen
                ? 'Честный расчет расходов на весь переезд'
                : `Ориентир «под ключ с кухней»: ~${formatCurrency(fullBudget)}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <ChevronDown
            className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-zinc-900 dark:text-white' : ''
            }`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="p-3.5 pt-0 border-t border-zinc-100 dark:border-zinc-800 space-y-3 animate-in fade-in duration-150">
          {/* Main Full Budget Indicator */}
          <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 flex items-center justify-between gap-3">
            <div>
              <span className="text-[11px] text-zinc-600 dark:text-zinc-400 block font-medium">
                Полная сумма до готового переезда:
              </span>
              <span className="text-lg sm:text-xl font-black text-zinc-950 dark:text-white font-mono tabular-nums">
                {formatCurrency(fullBudget)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block">Базовая смета ремонта:</span>
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 font-mono tabular-nums">
                {formatCurrency(grandTotal)}
              </span>
            </div>
          </div>

          {/* Visual Progress Bar 25 / 40 / 25 / 10 */}
          <div className="space-y-1.5">
            <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-zinc-100 dark:bg-zinc-800">
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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
              <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60">
                <span className="font-bold text-indigo-700 dark:text-indigo-400 block text-[11px]">25% Отделка</span>
                <span className="text-[10px] text-zinc-600 dark:text-zinc-300 font-mono mt-0.5 block">
                  {formatCurrency(breakdown.works)}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60">
                <span className="font-bold text-emerald-700 dark:text-emerald-400 block text-[11px]">40% Материалы</span>
                <span className="text-[10px] text-zinc-600 dark:text-zinc-300 font-mono mt-0.5 block">
                  {formatCurrency(breakdown.materials)}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60">
                <span className="font-bold text-amber-700 dark:text-amber-400 block text-[11px]">25% Мебель & быт</span>
                <span className="text-[10px] text-zinc-600 dark:text-zinc-300 font-mono mt-0.5 block">
                  {formatCurrency(breakdown.furniture)}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60">
                <span className="font-bold text-sky-700 dark:text-sky-400 block text-[11px]">10% Смежники</span>
                <span className="text-[10px] text-zinc-600 dark:text-zinc-300 font-mono mt-0.5 block">
                  {formatCurrency(breakdown.specialists)}
                </span>
              </div>
            </div>
          </div>

          {/* Explanation spoiler */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setShowExplanation(!showExplanation);
            }}
            className="w-full text-left flex items-center justify-between text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white pt-1 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-500" />
              Зачем знать полный бюджет заселения?
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                showExplanation ? 'rotate-180' : ''
              }`}
            />
          </button>

          {showExplanation && (
            <div className="text-[11px] text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/50 p-2.5 rounded-xl border border-zinc-200/60 dark:border-zinc-700/50 space-y-1.5 leading-relaxed">
              <p>
                Главная ошибка новосёлов — тратить весь бюджет на одну лишь отделку стен и полов, а потом месяцами жить без кухни, дивана и кондиционера.
              </p>
              <p>
                Статистическая формула <b>25/40/25/10</b> помогает спланировать финансовые ресурсы заранее и переехать в полностью обустроенную квартиру без кредитов и задержек.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
