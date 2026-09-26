import React from 'react';
import { ArrowRight, Info } from 'lucide-react';
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
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_16px_rgba(0,0,0,0.5)] safe-bottom transition-colors">
      <div className="max-w-md mx-auto px-4 py-2 flex items-center justify-between gap-3">
        {/* Left: Price summary & Breakdown link */}
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 dark:text-zinc-400">
              Смета ({result.area} м²):
            </span>
            <button
              type="button"
              onClick={handleBreakdownClick}
              className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 underline decoration-zinc-400 flex items-center gap-0.5"
            >
              <Info className="w-3 h-3 text-zinc-400" />
              <span>детали</span>
            </button>
          </div>

          <div className="text-sm sm:text-base font-extrabold text-zinc-950 dark:text-white tabular-nums tracking-tight truncate leading-tight mt-0.5">
            {formatCurrency(result.priceMin)} — {formatCurrency(result.priceMax)}
          </div>
        </div>

        {/* Right: Booking CTA */}
        <button
          type="button"
          onClick={handleBookingClick}
          className="py-2.5 px-4 bg-zinc-950 hover:bg-black text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-950 rounded-xl font-bold text-xs sm:text-sm shadow-sm transition active:scale-95 flex items-center gap-1.5 shrink-0"
        >
          <span>Замер 0 ₽</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
