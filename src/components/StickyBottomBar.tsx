import React from 'react';
import { CalendarCheck, ChevronRight, Info } from 'lucide-react';
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
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 shadow-[0_-8px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_-8px_20px_rgba(0,0,0,0.3)] safe-bottom">
      <div className="max-w-md mx-auto px-4 pt-3 pb-2">
        {/* Top Info Bar: Formula hint & Details Link */}
        <div className="flex items-center justify-between text-xs mb-1.5">
          <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-medium">
            <span>Вилка стоимости ремонта:</span>
          </div>

          <button
            type="button"
            onClick={handleBreakdownClick}
            className="flex items-center gap-0.5 text-blue-600 dark:text-blue-400 font-semibold hover:underline active:opacity-70 transition"
          >
            <Info className="w-3.5 h-3.5 inline" />
            <span>Детали сметы</span>
          </button>
        </div>

        {/* Price Range Display */}
        <div className="flex items-baseline justify-between mb-2.5">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
              от
            </span>
            <span className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white tabular-nums">
              {formatCurrency(result.priceMin)}
            </span>
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
              до
            </span>
            <span className="text-xl sm:text-2xl font-black tracking-tight text-blue-600 dark:text-blue-400 tabular-nums">
              {formatCurrency(result.priceMax)}
            </span>
          </div>

          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/20">
            0 ₽ аванс
          </span>
        </div>

        {/* Big Action Button */}
        <button
          type="button"
          onClick={handleBookingClick}
          className="w-full py-3.5 px-5 bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white rounded-2xl font-bold text-sm sm:text-base shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] select-none"
        >
          <CalendarCheck className="w-5 h-5 shrink-0" />
          <span>Забронировать бесплатный замер</span>
          <ChevronRight className="w-4 h-4 shrink-0 opacity-70" />
        </button>
      </div>
    </div>
  );
};
