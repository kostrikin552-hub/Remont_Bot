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
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
          Дополнительные опции
        </span>
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
          По запросу
        </span>
      </div>

      <div className="bg-white dark:bg-zinc-900/90 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 divide-y divide-zinc-100 dark:divide-zinc-800 shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden">
        {options.map((option) => {
          const totalOptionCost = option.pricePerMeter * area;
          return (
            <div
              key={option.id}
              onClick={() => handleToggle(option.id)}
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors select-none"
            >
              <div className="pr-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">
                    {option.title}
                  </h4>
                  <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 tabular-nums">
                    +{formatCurrency(option.pricePerMeter)}/м²
                  </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                  {option.subtitle}
                </p>
                {option.enabled && (
                  <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mt-1 tabular-nums">
                    К сметным работам: +{formatCurrency(totalOptionCost)}
                  </p>
                )}
              </div>

              {/* Minimal Native Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={option.enabled}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  option.enabled
                    ? 'bg-zinc-900 dark:bg-white'
                    : 'bg-zinc-200 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-zinc-950 shadow-sm transition duration-200 ease-in-out ${
                    option.enabled ? 'translate-x-5' : 'translate-x-0'
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
