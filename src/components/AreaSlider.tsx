import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';

interface AreaSliderProps {
  value: number;
  onChange: (value: number) => void;
}

const PRESETS = [
  { label: 'Студия', area: 28 },
  { label: '1-комн', area: 42 },
  { label: '2-комн', area: 62 },
  { label: '3-комн', area: 85 },
  { label: '4-комн+', area: 120 },
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

  const handlePreset = (area: number) => {
    triggerHaptic('medium');
    onChange(area);
  };

  const getLayoutHint = (m2: number) => {
    if (m2 <= 32) return 'Компактная студия';
    if (m2 <= 50) return 'Однокомнатная квартира';
    if (m2 <= 75) return 'Двухкомнатная / Евротрёшка';
    if (m2 <= 105) return 'Трёхкомнатная квартира';
    return 'Просторная четырёхкомнатная или пентхаус';
  };

  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div className="bg-white dark:bg-zinc-900/90 rounded-2xl p-4 border border-zinc-200/80 dark:border-zinc-800/80 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
          Площадь объекта
        </span>
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
          20 — 180 м²
        </span>
      </div>

      {/* Hero Number Display */}
      <div className="flex items-center justify-between py-2">
        <button
          type="button"
          onClick={() => handleStep(-1)}
          disabled={value <= min}
          aria-label="Уменьшить площадь"
          className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-90 transition-transform disabled:opacity-30 disabled:pointer-events-none"
        >
          <Minus className="w-4 h-4 stroke-[2.5]" />
        </button>

        <div className="text-center select-none">
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="text-4xl sm:text-5xl font-extrabold tracking-tight text-zinc-900 dark:text-white tabular-nums">
              {value}
            </span>
            <span className="text-xl font-medium text-zinc-400 dark:text-zinc-500">
              м²
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 font-medium">
            {getLayoutHint(value)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleStep(1)}
          disabled={value >= max}
          aria-label="Увеличить площадь"
          className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-90 transition-transform disabled:opacity-30 disabled:pointer-events-none"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>

      {/* Architectural Slider */}
      <div className="mt-4 px-1">
        <div className="relative flex items-center">
          <div className="absolute left-0 right-0 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden pointer-events-none">
            <div
              className="h-full bg-zinc-900 dark:bg-zinc-100 rounded-full transition-all duration-75"
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
            className="w-full h-7 z-10 cursor-pointer"
            aria-label="Выбор площади"
          />
        </div>
      </div>

      {/* Preset Quick Chips */}
      <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
        <div className="grid grid-cols-5 gap-1.5">
          {PRESETS.map((preset) => {
            const isSelected = value === preset.area;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => handlePreset(preset.area)}
                className={`py-2 px-1 rounded-lg text-center transition-all ${
                  isSelected
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 font-semibold shadow-xs'
                    : 'bg-zinc-100/80 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/80 dark:hover:bg-zinc-700'
                }`}
              >
                <span className="block text-[11px] leading-tight truncate">
                  {preset.label}
                </span>
                <span className="block text-[10px] opacity-75 mt-0.5 tabular-nums">
                  {preset.area}м²
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
