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
    <div className="bg-white dark:bg-zinc-900/90 rounded-2xl p-4 border border-zinc-200/80 dark:border-zinc-800/80 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
          Тип жилья
        </span>
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
          {value === 'new' ? 'Базовый тариф' : `Коэффициент ×${secondaryCoeff}`}
        </span>
      </div>

      {/* Tactile Segmented Switch */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl">
        <button
          type="button"
          onClick={() => handleSelect('new')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${
            value === 'new'
              ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          <Building2 className="w-4 h-4 shrink-0" />
          <span>Новостройка</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelect('secondary')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${
            value === 'secondary'
              ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          <Home className="w-4 h-4 shrink-0" />
          <span>Вторичное жилье</span>
        </button>
      </div>

      <p className="mt-2.5 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
        {value === 'new'
          ? 'Чистовая отделка с нуля: ровная геометрия стен и готовые шахты коммуникаций.'
          : 'С учетом выравнивания перепадов пола/стен и демонтажа старых коммуникаций.'}
      </p>
    </div>
  );
};
