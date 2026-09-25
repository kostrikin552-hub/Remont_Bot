import React from 'react';
import { Palette, Hammer, PackageCheck } from 'lucide-react';
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

  const getIcon = (name: AdditionalOption['iconName']) => {
    switch (name) {
      case 'Palette':
        return <Palette className="w-4 h-4 text-purple-500" />;
      case 'Hammer':
        return <Hammer className="w-4 h-4 text-amber-500" />;
      case 'PackageCheck':
        return <PackageCheck className="w-4 h-4 text-emerald-500" />;
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Дополнительные опции
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          по желанию
        </span>
      </div>

      <div className="bg-white dark:bg-slate-900/90 rounded-2xl p-1 shadow-xs border border-slate-200/70 dark:border-slate-800/80 divide-y divide-slate-100 dark:divide-slate-800">
        {options.map((option) => {
          const totalOptionCost = option.pricePerMeter * area;
          return (
            <div
              key={option.id}
              onClick={() => handleToggle(option.id)}
              className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/40 rounded-xl transition-colors select-none"
            >
              <div className="flex items-center gap-3 pr-2">
                <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  {getIcon(option.iconName)}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {option.title}
                    </h4>
                    <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.2 rounded">
                      +{formatCurrency(option.pricePerMeter)}/м²
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {option.subtitle}
                    {option.enabled && (
                      <span className="ml-1 text-slate-700 dark:text-slate-300 font-medium">
                        (всего: {formatCurrency(totalOptionCost)})
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* iOS Native Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={option.enabled}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  option.enabled ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
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
