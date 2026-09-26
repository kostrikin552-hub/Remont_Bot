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
  const [showDetails, setShowDetails] = useState(false);

  const selectedClass = classes.find((c) => c.id === selectedId) || classes[1];

  const handleSelect = (id: RenovationClassId) => {
    if (selectedId !== id) {
      triggerHaptic('medium');
      onSelect(id);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
          Тариф отделки
        </span>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
          Работа под ключ
        </span>
      </div>

      {/* 3-Column Compact Selector */}
      <div className="grid grid-cols-3 gap-1.5">
        {classes.map((item) => {
          const isSelected = selectedId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`p-2 rounded-lg text-left transition-all border relative flex flex-col justify-between ${
                isSelected
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 border-zinc-900 dark:border-white shadow-xs'
                  : 'bg-zinc-50 dark:bg-zinc-800/80 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-xs font-bold truncate">
                    {item.title}
                  </span>
                  {item.popular && (
                    <span
                      className={`text-[9px] font-bold px-1 rounded ${
                        isSelected
                          ? 'bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-950'
                          : 'bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200'
                      }`}
                    >
                      Хит
                    </span>
                  )}
                </div>
                <div className="text-[10px] opacity-75 line-clamp-1 leading-tight">
                  {item.id === 'cosmetic'
                    ? 'Косметика'
                    : item.id === 'capital'
                    ? 'С нуля под ключ'
                    : 'Авторский'}
                </div>
              </div>

              <div className="mt-2 pt-1.5 border-t border-current/15">
                <span className="text-xs font-extrabold tabular-nums block leading-tight">
                  {formatCurrency(item.pricePerMeter)}
                </span>
                <span className="text-[10px] opacity-70 leading-none">за м²</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Class Highlight & Details Toggle */}
      <div className="mt-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
        <div className="flex items-center justify-between text-xs">
          <p className="text-zinc-700 dark:text-zinc-300 text-[11px] leading-snug pr-2">
            <strong>{selectedClass.title}:</strong> {selectedClass.description}
          </p>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setShowDetails((prev) => !prev);
            }}
            className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 hover:underline shrink-0 flex items-center gap-0.5"
          >
            <span>{showDetails ? 'Скрыть' : 'Состав'}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                showDetails ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {/* Expandable Features List */}
        {showDetails && (
          <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-zinc-700 dark:text-zinc-300 animate-in fade-in duration-150">
            {selectedClass.features.map((feature, idx) => (
              <div key={idx} className="flex items-start gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span className="truncate">{feature}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
