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
    <div className="bg-white dark:bg-zinc-900 rounded-xl p-2.5 border border-zinc-200 dark:border-zinc-800 shadow-xs">
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
          Тип жилья
        </span>
        <span className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium">
          {value === 'new' ? 'Новостройка' : `Вторичный фонд (×${secondaryCoeff})`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 p-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
        <button
          type="button"
          onClick={() => handleSelect('new')}
          className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-md text-xs font-bold transition-all ${
            value === 'new'
              ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-xs'
              : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white'
          }`}
        >
          <Building2 className="w-3.5 h-3.5 shrink-0" />
          <span>Новостройка</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelect('secondary')}
          className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-md text-xs font-bold transition-all ${
            value === 'secondary'
              ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-xs'
              : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white'
          }`}
        >
          <Home className="w-3.5 h-3.5 shrink-0" />
          <span>Вторичка</span>
        </button>
      </div>
    </div>
  );
};
