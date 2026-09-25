import React from 'react';
import { Minus, Plus, Maximize2 } from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';

interface AreaSliderProps {
  value: number;
  onChange: (value: number) => void;
}

const PRESETS = [
  { label: 'Студия', area: 28 },
  { label: '1-комн', area: 42 },
  { label: '2-комн', area: 62 },
  { label: '3-комн', area: 86 },
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

  // Helper text describing the layout roughly
  const getLayoutHint = (m2: number) => {
    if (m2 <= 32) return 'Компактная студия или смарт-квартира';
    if (m2 <= 48) return 'Однокомнатная квартира с просторной кухней';
    if (m2 <= 75) return 'Двухкомнатная квартира / Евротрёшка';
    if (m2 <= 105) return 'Трёхкомнатная квартира для семьи';
    return 'Просторная четырёхкомнатная квартира или пентхаус';
  };

  // Calculate percentage for progress fill of range
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div className="bg-white dark:bg-slate-900/90 rounded-2xl p-4 shadow-xs border border-slate-200/70 dark:border-slate-800/80">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
          <Maximize2 className="w-3.5 h-3.5 text-blue-500" />
          Площадь объекта
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          от 20 до 180 м²
        </span>
      </div>

      {/* Central Big Number Display with - / + buttons */}
      <div className="flex items-center justify-between py-1 px-1">
        <button
          type="button"
          onClick={() => handleStep(-1)}
          disabled={value <= min}
          aria-label="Уменьшить площадь на 1 м²"
          className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
        >
          <Minus className="w-4 h-4 stroke-[2.5]" />
        </button>

        <div className="text-center select-none">
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white tabular-nums">
              {value}
            </span>
            <span className="text-xl font-semibold text-slate-400 dark:text-slate-500">
              м²
            </span>
          </div>
          <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400 mt-0.5">
            {getLayoutHint(value)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleStep(1)}
          disabled={value >= max}
          aria-label="Увеличить площадь на 1 м²"
          className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>

      {/* Interactive Range Slider */}
      <div className="mt-4 px-1">
        <div className="relative flex items-center">
          <div className="absolute left-0 right-0 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden pointer-events-none">
            <div
              className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-75"
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
            className="w-full h-8 z-10 cursor-pointer"
            aria-label="Площадь в квадратных метрах"
          />
        </div>

        <div className="flex justify-between text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-medium px-0.5">
          <span>20 м²</span>
          <span>100 м²</span>
          <span>180 м²</span>
        </div>
      </div>

      {/* Quick Preset Buttons */}
      <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {PRESETS.map((preset) => {
            const isSelected = value === preset.area;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => handlePreset(preset.area)}
                className={`flex-1 shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs font-semibold'
                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>{preset.label}</span>
                <span className={`block text-[10px] opacity-75 ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                  {preset.area} м²
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
