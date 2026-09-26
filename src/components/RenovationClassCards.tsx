import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
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
  const [expandedId, setExpandedId] = useState<RenovationClassId | null>(null);

  const handleCardClick = (id: RenovationClassId) => {
    if (selectedId !== id) {
      triggerHaptic('selection');
      onSelect(id);
    }
  };

  const toggleExpand = (e: React.MouseEvent, id: RenovationClassId) => {
    e.stopPropagation();
    triggerHaptic('light');
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
          Тариф отделки
        </span>
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
          Работа под ключ
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        {classes.map((item) => {
          const isSelected = selectedId === item.id;
          const isExpanded = expandedId === item.id;

          return (
            <div
              key={item.id}
              onClick={() => handleCardClick(item.id)}
              className={`relative cursor-pointer rounded-2xl p-4 transition-all duration-200 border text-left ${
                isSelected
                  ? 'bg-white dark:bg-zinc-900 border-zinc-900 dark:border-zinc-100 shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)]'
                  : 'bg-white/80 dark:bg-zinc-900/60 border-zinc-200/80 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-base text-zinc-900 dark:text-white tracking-tight">
                      {item.title}
                    </h3>
                    {item.popular && (
                      <span className="text-[10px] font-semibold text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">
                        Хит выбора
                      </span>
                    )}
                    {item.id === 'designer' && (
                      <span className="text-[10px] font-semibold text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-md">
                        Премиум
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                {/* Minimal Radio Indicator */}
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors mt-0.5 ${
                    isSelected
                      ? 'bg-zinc-900 border-zinc-900 text-white dark:bg-white dark:border-white dark:text-zinc-950'
                      : 'border-zinc-300 dark:border-zinc-600 bg-transparent'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </div>

              {/* Price row */}
              <div className="mt-3.5 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white tabular-nums">
                    {formatCurrency(item.pricePerMeter)}
                  </span>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                    / м²
                  </span>
                </div>

                <button
                  type="button"
                  onClick={(e) => toggleExpand(e, item.id)}
                  className="text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white flex items-center gap-1 transition-colors py-1"
                >
                  <span>{isExpanded ? 'Скрыть состав' : 'Что входит'}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </div>

              {/* Collapsible Features Details */}
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-1.5 animate-in fade-in duration-150">
                  {item.features.map((feature, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400"
                    >
                      <Check className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
