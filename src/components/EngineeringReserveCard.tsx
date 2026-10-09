import React, { useState } from 'react';
import { getReserveData } from '../config/engineeringRisks';
import { triggerHaptic } from '../utils/telegram';

interface Props {
  housingType: string;
  grandTotal: number;
}

export const EngineeringReserveCard: React.FC<Props> = ({ housingType, grandTotal }) => {
  const [isOpen, setIsOpen] = useState(false);
  const data = getReserveData(housingType, grandTotal);

  const toggleOpen = () => {
    triggerHaptic('light');
    setIsOpen(!isOpen);
  };

  return (
    <div className="bg-slate-900/90 dark:bg-zinc-900/90 border border-slate-700/60 dark:border-zinc-700/60 rounded-2xl p-4 my-3 backdrop-blur-sm shadow-sm transition-all text-left">
      {/* Шапка карточки */}
      <div 
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={toggleOpen}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🛡️</span>
          <div>
            <div className="text-xs text-slate-400 dark:text-zinc-400 font-medium">
              Рекомендуемый буфер безопасности ({data.label})
            </div>
            <div className="text-sm font-bold text-white">
              +{data.percent}% ({data.reserveAmount.toLocaleString('ru-RU')} ₽)
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleOpen();
          }}
          className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition"
        >
          {isOpen ? 'Скрыть ▲' : 'Что входит? ▼'}
        </button>
      </div>

      {/* Раскрывающийся список скрытых факторов */}
      {isOpen && (
        <div className="mt-3 pt-3 border-t border-slate-800 dark:border-zinc-800 text-xs text-slate-300 dark:text-zinc-300 space-y-2 animate-in fade-in duration-200">
          <p className="text-slate-400 dark:text-zinc-400 leading-relaxed">
            Калькулятор считает норматив СП. При выезде инженер проверит параметры, которые невозможно оценить онлайн:
          </p>
          <ul className="space-y-1.5 pl-1">
            {data.risks.map((risk, idx) => (
              <li key={idx} className="flex items-start gap-1.5 leading-snug">
                <span className="text-blue-400 font-bold shrink-0">•</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
          <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-xl p-2.5 text-[11px] text-emerald-300 flex items-start gap-2 mt-2 leading-relaxed">
            <span className="text-sm shrink-0">🔒</span>
            <span>
              Если скрытых дефектов нет — сумма остаётся у вас. Окончательная смета фиксируется в договоре без доплат.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
