import React from 'react';
import { Check, Sparkles, Flame, Crown } from 'lucide-react';
import { RenovationClass, RenovationClassId } from '../types';
import { formatCurrency, triggerHaptic } from '../utils/telegram';

interface RenovationClassCardsProps {
  classes: RenovationClass[];
  selectedId: RenovationClassId;
  onSelect: (id: RenovationClassId) => void;
}

export const RenovationClassCards: React.FC<RenovationClassCardsProps> = ({
  classes,
  selectedId,
  onSelect,
}) => {
  const handleCardClick = (id: RenovationClassId) => {
    if (selectedId !== id) {
      triggerHaptic('medium');
      onSelect(id);
    }
  };

  const getCardIcon = (id: RenovationClassId) => {
    switch (id) {
      case 'cosmetic':
        return <Sparkles className="w-4 h-4 text-emerald-500" />;
      case 'capital':
        return <Flame className="w-4 h-4 text-blue-500" />;
      case 'designer':
        return <Crown className="w-4 h-4 text-amber-500" />;
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Класс ремонта
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Выберите тариф
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        {classes.map((item) => {
          const isSelected = selectedId === item.id;
          return (
            <div
              key={item.id}
              onClick={() => handleCardClick(item.id)}
              className={`relative cursor-pointer rounded-2xl p-4 transition-all duration-200 border text-left ${
                isSelected
                  ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-500/80 dark:border-blue-500 ring-2 ring-blue-500/20 shadow-md shadow-blue-500/10'
                  : 'bg-white dark:bg-slate-900/90 border-slate-200/70 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
              }`}
            >
              {/* Top Row: Title, Icon, Badge, Radio */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      isSelected
                        ? 'bg-blue-100 dark:bg-blue-900/60'
                        : 'bg-slate-100 dark:bg-slate-800'
                    }`}
                  >
                    {getCardIcon(item.id)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 dark:text-white text-base">
                        {item.title}
                      </h3>
                      {item.badge && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                            item.popular
                              ? 'bg-blue-600 text-white'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {item.description}
                    </p>
                  </div>
                </div>

                {/* iOS Style Radio Checkbox */}
                <div
                  className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 transition-colors mt-0.5 ${
                    isSelected
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-slate-300 dark:border-slate-600 bg-transparent'
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </div>

              {/* Price display */}
              <div className="mt-3 pt-2.5 border-t border-slate-200/50 dark:border-slate-800/60 flex items-center justify-between">
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">
                    {formatCurrency(item.pricePerMeter)}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">/ м²</span>
                </div>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  работа под ключ
                </span>
              </div>

              {/* Key Features preview */}
              <div className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-1">
                {item.features.map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    <span className="truncate">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
