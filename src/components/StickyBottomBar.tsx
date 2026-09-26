import React from 'react';
import { ArrowRight, FileSpreadsheet } from 'lucide-react';
import { CalculationResult } from '../types';
import { formatCurrency, triggerHaptic } from '../utils/telegram';

interface StickyBottomBarProps {
  result: CalculationResult;
  onOpenBreakdown: () => void;
  onOpenBooking: () => void;
}

export const StickyBottomBar: React.FC<StickyBottomBarProps> = ({
  result,
  onOpenBreakdown,
  onOpenBooking,
}) => {
  const handleBookingClick = () => {
    triggerHaptic('heavy');
    onOpenBooking();
  };

  const handleBreakdownClick = () => {
    triggerHaptic('light');
    onOpenBreakdown();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-200/80 dark:border-zinc-800/80 shadow-[0_-8px_24px_rgba(0,0,0,0.04)] dark:shadow-[0_-8px_24px_rgba(0,0,0,0.4)] safe-bottom transition-colors">
      <div className="max-w-md mx-auto px-4 pt-3 pb-2.5">
        {/* Top Info line */}
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-zinc-500 dark:text-zinc-400 font-medium">
            Ориентир сметы под ключ:
          </span>

          <button
            type="button"
            onClick={handleBreakdownClick}
            className="flex items-center gap-1 text-zinc-900 dark:text-zinc-100 font-semibold hover:underline transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-zinc-500" />
            <span>Детализация сметы</span>
          </button>
        </div>

        {/* Price row */}
        <div className="flex items-baseline justify-between mb-3">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500">
              от
            </span>
            <span className="text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white tabular-nums">
              {formatCurrency(result.priceMin)}
            </span>
            <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500">
              до
            </span>
            <span className="text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white tabular-nums">
              {formatCurrency(result.priceMax)}
            </span>
          </div>

          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
            {result.area} м² · ~{result.estimatedDays.min} дн.
          </span>
        </div>

        {/* Primary CTA */}
        <button
          type="button"
          onClick={handleBookingClick}
          className="w-full py-3.5 px-5 bg-zinc-900 hover:bg-black text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-950 rounded-xl font-semibold text-sm shadow-md transition-all active:scale-[0.98] flex items-center justify-between select-none"
        >
          <div className="text-left leading-tight">
            <span className="block text-sm font-bold">Вызвать инженера на замер</span>
            <span className="block text-[11px] opacity-75 font-normal">Бесплатно · Фиксация сметы</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-white/10 dark:bg-zinc-900/10 flex items-center justify-center shrink-0">
            <ArrowRight className="w-4 h-4" />
          </div>
        </button>
      </div>
    </div>
  );
};
