import React from 'react';
import { Building2, Home } from 'lucide-react';
import { PropertyType } from '../types';
import { triggerHaptic } from '../utils/telegram';

interface PropertyTypeSelectorProps {
  value: PropertyType;
  onChange: (type: PropertyType) => void;
  secondaryCoeff?: number;
}

export const PropertyTypeSelector: React.FC<PropertyTypeSelectorProps> = ({
  value,
  onChange,
  secondaryCoeff = 1.15,
}) => {
  const handleSelect = (type: PropertyType) => {
    if (value !== type) {
      triggerHaptic('selection');
      onChange(type);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900/90 rounded-2xl p-3.5 shadow-xs border border-slate-200/70 dark:border-slate-800/80">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Тип недвижимости
        </span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          {value === 'new' ? 'Коэффициент 1.0' : `Коэффициент ${secondaryCoeff}`}
        </span>
      </div>

      {/* iOS Segmented / Card Buttons */}
      <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl">
        {/* Новостройка */}
        <button
          type="button"
          onClick={() => handleSelect('new')}
          className={`relative flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
            value === 'new'
              ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm shadow-slate-900/5'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Building2
            className={`w-4 h-4 ${
              value === 'new' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
            }`}
          />
          <span>Новостройка</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-slate-200/60 dark:bg-slate-800 rounded font-normal text-slate-500 dark:text-slate-400">
            1.0
          </span>
        </button>

        {/* Вторичка */}
        <button
          type="button"
          onClick={() => handleSelect('secondary')}
          className={`relative flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
            value === 'secondary'
              ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm shadow-slate-900/5'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Home
            className={`w-4 h-4 ${
              value === 'secondary' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
            }`}
          />
          <span>Вторичка</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-amber-100 dark:bg-amber-950/60 rounded font-normal text-amber-700 dark:text-amber-300">
            ×{secondaryCoeff}
          </span>
        </button>
      </div>

      <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500 leading-tight">
        {value === 'new'
          ? 'Для новостроек без чистовой отделки: ровные базовые поверхности, нет скрытых старых коммуникаций.'
          : 'Для вторичного жилья: учитывается демонтаж части слоев, перепад высот и перекладка старых сетей.'}
      </p>
    </div>
  );
};
