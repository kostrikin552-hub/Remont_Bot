import React from 'react';
import { ShieldCheck, Lock, Award, FileText, ArrowRight } from 'lucide-react';
import { formatCurrency, triggerHaptic } from '../utils/telegram';

interface PriceLockCardProps {
  grandTotal: number;
  worksTotal: number;
  materialsTotal: number;
  area: number;
  estimatedDays: { min: number; max: number };
  onOpenBooking: () => void;
  onOpenPrint?: () => void;
}

export const PriceLockCard: React.FC<PriceLockCardProps> = ({
  grandTotal,
  worksTotal,
  materialsTotal,
  area,
  estimatedDays,
  onOpenBooking,
  onOpenPrint,
}) => {
  // Вычисляем дату фиксации: сегодня + 14 дней
  const lockUntilDate = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, []);

  const worksPercent = grandTotal > 0 ? Math.round((worksTotal / grandTotal) * 100) : 60;
  const materialsPercent = Math.max(0, 100 - worksPercent);

  return (
    <div className="bg-zinc-900 text-white rounded-xl p-4 sm:p-5 border border-zinc-800 shadow-xl space-y-3.5">
      {/* Шапка гарантийного сертификата */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-300 bg-emerald-950/90 border border-emerald-700/60 px-2 py-0.5 rounded">
              <Lock className="w-3 h-3 text-emerald-400" />
              Фиксация сметы по ГОСТ
            </span>
            <span className="text-[11px] text-zinc-400 font-mono font-medium">
              до {lockUntilDate}
            </span>
          </div>
          <h3 className="text-base sm:text-lg font-bold text-white tracking-tight leading-snug">
            Защита от удорожания и скрытых доплат
          </h3>
          <p className="text-xs text-zinc-300 leading-relaxed">
            Сумма сметы не вырастет в процессе ремонта. Вся стоимость работ и расчетные объемы фиксируются в официальном договоре.
          </p>
        </div>

        <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 text-emerald-400 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
      </div>

      {/* Структура сметы: Прозрачное разделение Работа vs Материалы */}
      <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-400 font-medium">Прозрачная структура бюджета:</span>
          <span className="text-zinc-200 font-bold tabular-nums">100% прозрачность</span>
        </div>

        {/* Прогресс-бар долей */}
        <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden flex">
          <div
            style={{ width: `${worksPercent}%` }}
            className="h-full bg-emerald-500 transition-all duration-500"
            title={`Работы: ${worksPercent}%`}
          />
          <div
            style={{ width: `${materialsPercent}%` }}
            className="h-full bg-amber-500 transition-all duration-500"
            title={`Черновые материалы: ${materialsPercent}%`}
          />
        </div>

        {/* Детализация долей */}
        <div className="grid grid-cols-2 gap-2 text-xs pt-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
            <div>
              <div className="text-[11px] text-zinc-400 leading-tight">Работа мастеров ({worksPercent}%)</div>
              <div className="text-xs font-bold text-white font-mono">{formatCurrency(worksTotal)}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
            <div>
              <div className="text-[11px] text-zinc-400 leading-tight">Черновые материалы ({materialsPercent}%)</div>
              <div className="text-xs font-bold text-white font-mono">{formatCurrency(materialsTotal)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Ключевые гарантии для клиента */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="p-2 rounded-lg bg-white/5 border border-white/5">
          <div className="font-bold text-emerald-400 text-xs">0% аванс</div>
          <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">Оплата только за готовые этапы</div>
        </div>
        <div className="p-2 rounded-lg bg-white/5 border border-white/5">
          <div className="font-bold text-white text-xs">~{estimatedDays.min}–{estimatedDays.max} дней</div>
          <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">Фиксированный срок в договоре</div>
        </div>
        <div className="p-2 rounded-lg bg-white/5 border border-white/5">
          <div className="font-bold text-emerald-400 text-xs">3 года</div>
          <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">Гарантия на все скрытые работы</div>
        </div>
      </div>

      {/* Быстрые действия: Экспорт сметы и Запись на замер */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
        {onOpenPrint && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onOpenPrint();
            }}
            className="flex-1 py-3 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.99]"
          >
            <FileText className="w-4 h-4 text-emerald-400" />
            <span>Коммерческое предложение (PDF/Печать)</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            triggerHaptic('heavy');
            onOpenBooking();
          }}
          className="flex-1 py-3 px-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 transition cursor-pointer active:scale-[0.99]"
        >
          <Award className="w-4 h-4" />
          <span>Зафиксировать цену (Замер 0 ₽)</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
