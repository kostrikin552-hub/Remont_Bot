import React from 'react';
import { ArrowRight, FileText, Share2 } from 'lucide-react';
import { CalculationResult } from '../types';
import { formatCurrency, triggerHaptic } from '../utils/telegram';

interface StickyBottomBarProps {
  result: CalculationResult;
  onOpenBreakdown?: () => void;
  onOpenBooking: () => void;
  onOpenShare?: () => void;
}

export const StickyBottomBar: React.FC<StickyBottomBarProps> = ({
  result,
  onOpenBreakdown,
  onOpenBooking,
  onOpenShare,
}) => {
  const handleBookingClick = () => {
    triggerHaptic('heavy');
    onOpenBooking();
  };

  const handleBreakdownClick = () => {
    triggerHaptic('light');
    const el = document.getElementById('estimate-breakdown');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (onOpenBreakdown) {
      onOpenBreakdown();
    }
  };

  const pricePerMeter = result.area > 0 ? Math.round(result.totalCost / result.area) : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_16px_rgba(0,0,0,0.5)] safe-bottom transition-colors">
      <div className="max-w-md mx-auto px-4 py-2 flex items-center justify-between gap-3">
        {/* Left: Exact estimate summary & link to estimate items */}
        <div className="min-w-0 flex-1 pr-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 dark:text-zinc-400">
              Смета ({result.area} м²):
            </span>
            <button
              type="button"
              onClick={handleBreakdownClick}
              className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 underline decoration-zinc-400 flex items-center gap-0.5"
            >
              <FileText className="w-3 h-3 text-zinc-400 shrink-0" />
              <span>к смете</span>
            </button>
          </div>

          <div className="text-sm sm:text-base font-extrabold text-zinc-950 dark:text-white tabular-nums tracking-tight leading-tight mt-0.5 flex items-baseline gap-1.5 flex-wrap">
            <span>{formatCurrency(result.totalCost)}</span>
            <span className="text-[10px] sm:text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              ({pricePerMeter.toLocaleString('ru-RU')} ₽/м²)
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenShare && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onOpenShare();
              }}
              className="w-10 h-10 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 flex items-center justify-center transition active:scale-95 border border-zinc-200/80 dark:border-zinc-700/80"
              title="Отправить смету супругу / в чат ЖК"
              aria-label="Поделиться сметой"
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={handleBookingClick}
            className="py-2.5 px-3.5 sm:px-4 bg-zinc-950 hover:bg-black text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-950 rounded-xl font-bold text-xs sm:text-sm shadow-sm transition active:scale-95 flex items-center gap-1.5"
          >
            <span>Замер 0 ₽</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
