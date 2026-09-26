import React from 'react';
import { AdditionalOption } from '../types';
import { formatCurrency, triggerHaptic } from '../utils/telegram';

interface AdditionalOptionsProps {
  options: AdditionalOption[];
  area: number;
  onToggle: (id: AdditionalOption['id']) => void;
}

export const AdditionalOptions: React.FC<AdditionalOptionsProps> = ({
  options,
  area,
  onToggle,
}) => {
  const handleToggle = (id: AdditionalOption['id']) => {
    triggerHaptic('light');
    onToggle(id);
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs">
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
          Дополнительные опции
        </span>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
          По желанию
        </span>
      </div>

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {options.map((option) => {
          const totalOptionCost = option.pricePerMeter * area;
          return (
            <div
              key={option.id}
              onClick={() => handleToggle(option.id)}
              className="flex items-center justify-between py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-lg px-1 transition-colors select-none"
            >
              <div className="pr-2 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h4 className="text-xs font-bold text-zinc-950 dark:text-white">
                    {option.title}
                  </h4>
                  <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 tabular-nums">
                    +{formatCurrency(option.pricePerMeter)}/м²
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  {option.subtitle}
                </p>
                {option.enabled && (
                  <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    Итого к смете: +{formatCurrency(totalOptionCost)}
                  </span>
                )}
              </div>

              {/* Native Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={option.enabled}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  option.enabled
                    ? 'bg-zinc-900 dark:bg-white'
                    : 'bg-zinc-200 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white dark:bg-zinc-950 shadow-xs transition duration-200 ease-in-out ${
                    option.enabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
