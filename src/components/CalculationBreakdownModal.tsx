import React, { useState } from 'react';
import { X, Check, Copy, Clock, ShieldCheck, ArrowRight } from 'lucide-react';
import { CalculationResult } from '../types';
import { formatCurrency, triggerHaptic } from '../utils/telegram';

interface CalculationBreakdownModalProps {
  result: CalculationResult;
  onClose: () => void;
  onOpenBooking: () => void;
}

export const CalculationBreakdownModal: React.FC<CalculationBreakdownModalProps> = ({
  result,
  onClose,
  onOpenBooking,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    triggerHaptic('success');
    const text = `Инженерная смета на ремонт:
• Площадь: ${result.area} м²
• Тип объекта: ${result.propertyType === 'new' ? 'Новостройка' : 'Вторичное жилье (×' + result.propertyTypeCoeff + ')'}
• Тариф: ${result.renovationClass.title} (${formatCurrency(result.renovationClass.pricePerMeter)}/м²)
• Базовые работы: ${formatCurrency(result.baseWorkCost)}
${result.activeOptions
  .map(
    (opt) =>
      `• ${opt.title}: +${formatCurrency(opt.pricePerMeter * result.area)}`
  )
  .join('\n')}
------------------------------------
• Ориентировочный диапазон: от ${formatCurrency(result.priceMin)} до ${formatCurrency(result.priceMax)}
• Срок: ~${result.estimatedDays.min}–${result.estimatedDays.max} дней
• Выезд замерщика и смета: 0 ₽`;

    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl border border-zinc-200/80 dark:border-zinc-800 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto mb-3 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h3 className="text-base font-bold tracking-tight text-zinc-900 dark:text-white">
              Детализация расчета
            </h3>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
              Объект {result.area} м² · {result.propertyType === 'new' ? 'Новостройка' : 'Вторичка'}
            </p>
          </div>
          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Calculation Details */}
        <div className="mt-4 space-y-3">
          {/* Base Work */}
          <div className="p-3.5 bg-zinc-50 dark:bg-zinc-850 rounded-xl space-y-2 border border-zinc-100 dark:border-zinc-800 text-xs">
            <div className="flex justify-between items-center text-sm font-bold text-zinc-900 dark:text-white">
              <span>{result.renovationClass.title} тариф</span>
              <span className="tabular-nums">{formatCurrency(result.baseWorkCost)}</span>
            </div>
            <div className="text-zinc-500 dark:text-zinc-400 space-y-1">
              <div className="flex justify-between">
                <span>Базовая ставка:</span>
                <span className="tabular-nums">{formatCurrency(result.renovationClass.pricePerMeter)} / м²</span>
              </div>
              <div className="flex justify-between">
                <span>Коэффициент фонда:</span>
                <span>×{result.propertyTypeCoeff}</span>
              </div>
            </div>
          </div>

          {/* Additional Options */}
          {result.activeOptions.length > 0 && (
            <div className="p-3.5 bg-zinc-50 dark:bg-zinc-850 rounded-xl space-y-2 border border-zinc-100 dark:border-zinc-800 text-xs">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 block">
                Дополнительные опции
              </span>
              {result.activeOptions.map((opt) => (
                <div key={opt.id} className="flex justify-between items-center text-zinc-600 dark:text-zinc-400">
                  <span className="truncate pr-2">{opt.title}</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums shrink-0">
                    +{formatCurrency(opt.pricePerMeter * result.area)}
                  </span>
                </div>
              ))}
              <div className="pt-2 border-t border-zinc-200/50 dark:border-zinc-800 flex justify-between font-bold text-zinc-900 dark:text-white">
                <span>Итого по опциям:</span>
                <span className="tabular-nums">+{formatCurrency(result.addonsCost)}</span>
              </div>
            </div>
          )}

          {/* Price Range Box */}
          <div className="p-4 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded-xl">
            <div className="flex justify-between items-center text-xs opacity-70 mb-1">
              <span>Диапазон стоимости:</span>
              <span>-5% ... +10%</span>
            </div>
            <div className="text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums">
              {formatCurrency(result.priceMin)} — {formatCurrency(result.priceMax)}
            </div>
            <p className="text-[11px] opacity-80 mt-1.5 leading-relaxed">
              Финальная стоимость фиксируется в смете и приложении к договору после выезда инженера.
            </p>
          </div>

          {/* Guarantees */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-850 border border-zinc-100 dark:border-zinc-800 flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-zinc-500 shrink-0" />
              <div>
                <p className="text-[10px] text-zinc-400">Срок выполнения</p>
                <p className="font-semibold text-zinc-900 dark:text-white">
                  ~{result.estimatedDays.min}–{result.estimatedDays.max} дней
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-850 border border-zinc-100 dark:border-zinc-800 flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-zinc-500 shrink-0" />
              <div>
                <p className="text-[10px] text-zinc-400">Гарантия на работы</p>
                <p className="font-semibold text-zinc-900 dark:text-white">
                  36 месяцев
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-5 space-y-2">
          <button
            onClick={() => {
              triggerHaptic('medium');
              onClose();
              onOpenBooking();
            }}
            className="w-full py-3.5 px-4 bg-zinc-900 hover:bg-black text-white dark:bg-white dark:text-zinc-950 rounded-xl font-semibold text-sm transition active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <span>Записаться на бесплатный замер</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={handleCopy}
            className="w-full py-2.5 px-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl font-medium text-xs transition flex items-center justify-center gap-1.5"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-500" />
                <span className="font-semibold">Смета скопирована</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-zinc-400" />
                <span>Скопировать текст сметы</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
