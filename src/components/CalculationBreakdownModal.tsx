import React, { useState } from 'react';
import { X, Check, Copy, Clock, ShieldCheck, Sparkles, AlertCircle } from 'lucide-react';
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
    const text = `РемонтПро — Расчет стоимости:
• Площадь: ${result.area} м²
• Недвижимость: ${result.propertyType === 'new' ? 'Новостройка (1.0)' : 'Вторичка (1.15)'}
• Тариф: ${result.renovationClass.title} (${result.renovationClass.pricePerMeter} ₽/м²)
• Базовые работы: ${formatCurrency(result.baseWorkCost)}
${result.activeOptions
  .map(
    (opt) =>
      `• ${opt.title}: +${formatCurrency(opt.pricePerMeter * result.area)}`
  )
  .join('\n')}
------------------------------------
• Базовая сумма: ${formatCurrency(result.totalCost)}
• Вилка сметы: от ${formatCurrency(result.priceMin)} до ${formatCurrency(result.priceMax)}
• Срок выполнения: ~${result.estimatedDays.min}–${result.estimatedDays.max} дней
• Выезд замерщика и смета: 0 ₽`;

    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-250"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-3 sm:hidden" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Детализация сметы</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 font-medium">
                {result.area} м²
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Формула: (Площадь × База × Коэфф) + Допы
            </p>
          </div>
          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Breakdown Items */}
        <div className="mt-4 space-y-3">
          {/* Base works */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-1.5 border border-slate-100 dark:border-slate-800">
            <div className="flex justify-between items-center text-sm font-semibold text-slate-900 dark:text-white">
              <span>{result.renovationClass.title} ремонт</span>
              <span>{formatCurrency(result.baseWorkCost)}</span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-col gap-0.5">
              <div className="flex justify-between">
                <span>Базовая ставка тарифа:</span>
                <span>{formatCurrency(result.renovationClass.pricePerMeter)} / м²</span>
              </div>
              <div className="flex justify-between">
                <span>Коэффициент фонда ({result.propertyType === 'new' ? 'Новостройка' : 'Вторичка'}):</span>
                <span>×{result.propertyTypeCoeff}</span>
              </div>
              <div className="flex justify-between font-medium text-slate-700 dark:text-slate-300 pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                <span>Расчет: {result.area} м² × {formatCurrency(result.renovationClass.pricePerMeter)} × {result.propertyTypeCoeff}</span>
                <span>= {formatCurrency(result.baseWorkCost)}</span>
              </div>
            </div>
          </div>

          {/* Additional Options */}
          {result.activeOptions.length > 0 && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-2 border border-slate-100 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                Выбранные доп. услуги
              </span>
              {result.activeOptions.map((opt) => (
                <div key={opt.id} className="flex justify-between items-center text-xs">
                  <span className="text-slate-700 dark:text-slate-300">
                    {opt.title} ({formatCurrency(opt.pricePerMeter)}/м² × {result.area} м²)
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    +{formatCurrency(opt.pricePerMeter * result.area)}
                  </span>
                </div>
              ))}
              <div className="pt-1.5 border-t border-slate-200/50 dark:border-slate-700/50 flex justify-between text-xs font-medium text-slate-800 dark:text-slate-200">
                <span>Всего по доп. услугам:</span>
                <span className="font-bold">+{formatCurrency(result.addonsCost)}</span>
              </div>
            </div>
          )}

          {/* Total exact sum */}
          <div className="p-3.5 bg-blue-50/70 dark:bg-blue-950/30 rounded-xl border border-blue-200/60 dark:border-blue-900/40">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Базовый расчет (формула)
              </span>
              <span className="text-lg font-black text-blue-600 dark:text-blue-400">
                {formatCurrency(result.totalCost)}
              </span>
            </div>
          </div>

          {/* Fork breakdown explanation */}
          <div className="p-3.5 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-emerald-600/10 dark:from-blue-950/40 dark:to-emerald-950/40 rounded-xl border border-blue-500/20">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white mb-1">
              <Sparkles className="w-4 h-4 text-blue-500" />
              <span>Ориентировочная вилка стоимости</span>
            </div>
            <div className="flex items-baseline justify-between py-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                от (-5%) до (+10%):
              </span>
              <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                {formatCurrency(result.priceMin)} — {formatCurrency(result.priceMax)}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1 flex items-start gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <span>
                Вилка учитывает возможные отклонения кривизны стен, высоту потолков и индивидуальные пожелания по чистовым материалам. Точная сумма фиксируется в договоре после замера.
              </span>
            </p>
          </div>

          {/* Guarantees & Deadlines */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500 shrink-0" />
              <div>
                <p className="text-slate-400 text-[10px]">Срок ремонта</p>
                <p className="font-semibold text-slate-900 dark:text-white">
                  ~{result.estimatedDays.min}–{result.estimatedDays.max} дней
                </p>
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <div>
                <p className="text-slate-400 text-[10px]">Гарантия качества</p>
                <p className="font-semibold text-slate-900 dark:text-white">
                  3 года по договору
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="mt-5 space-y-2">
          <button
            onClick={() => {
              triggerHaptic('medium');
              onClose();
              onOpenBooking();
            }}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-500/25 transition active:scale-98"
          >
            Забронировать бесплатный замер
          </button>

          <button
            onClick={handleCopy}
            className="w-full py-2.5 px-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl font-medium text-xs transition flex items-center justify-center gap-1.5"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  Смета скопирована в буфер!
                </span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-500" />
                <span>Скопировать текст сметы</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
