import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';

interface AreaSliderProps {
  value: number;
  onChange: (value: number) => void;
}

const PRESETS = [
  { label: '28 м²', area: 28 },
  { label: '42 м²', area: 42 },
  { label: '62 м²', area: 62 },
  { label: '85 м²', area: 85 },
  { label: '120 м²', area: 120 },
];

export const AreaSlider: React.FC<AreaSliderProps> = ({ value, onChange }) => {
  const min = 20;
  const max = 180;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    triggerHaptic('selection');
    onChange(val);
  };

  const handleStep = (delta: number) => {
    const nextVal = Math.min(max, Math.max(min, value + delta));
    if (nextVal !== value) {
      triggerHaptic('light');
      onChange(nextVal);
    }
  };

  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs">
      {/* Top Header & Value */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider block">
            Площадь объекта
          </span>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
            от 20 до 180 м²
          </span>
        </div>

        {/* Stepper with current value */}
        <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => handleStep(-1)}
            disabled={value <= min}
            aria-label="Уменьшить площадь"
            className="w-7 h-7 rounded-md bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-600 active:scale-95 disabled:opacity-30 disabled:pointer-events-none shadow-xs"
          >
            <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>

          <div className="px-2 text-center min-w-[58px]">
            <span className="text-base font-extrabold text-zinc-950 dark:text-white tabular-nums">
              {value}
            </span>
            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 ml-0.5">
              м²
            </span>
          </div>

          <button
            type="button"
            onClick={() => handleStep(1)}
            disabled={value >= max}
            aria-label="Увеличить площадь"
            className="w-7 h-7 rounded-md bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-600 active:scale-95 disabled:opacity-30 disabled:pointer-events-none shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Slider Bar */}
      <div className="mt-2.5 px-0.5">
        <div className="relative flex items-center">
          <div className="absolute left-0 right-0 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden pointer-events-none">
            <div
              className="h-full bg-zinc-950 dark:bg-zinc-100 rounded-full"
              style={{ width: `${percent}%` }}
            />
          </div>
          <input
            type="range"
            min={min}
            max={max}
            step={1}
            value={value}
            onChange={handleSliderChange}
            className="w-full h-6 z-10 cursor-pointer"
            aria-label="Площадь в квадратных метрах"
          />
        </div>
      </div>

      {/* Quick Presets */}
      <div className="grid grid-cols-5 gap-1 mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
        {PRESETS.map((p) => {
          const isSelected = value === p.area;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onChange(p.area);
              }}
              className={`py-1 px-1 rounded-md text-center text-[11px] font-semibold transition-all ${
                isSelected
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 shadow-xs'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
