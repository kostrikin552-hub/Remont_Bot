import { X, Calculator, CheckCircle2 } from 'lucide-react';
import { LiveLead } from '../../types/admin';

interface LeadEstimateModalProps {
  lead: LiveLead | null;
  onClose: () => void;
}

export function LeadEstimateModal({ lead, onClose }: LeadEstimateModalProps) {
  if (!lead) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center font-bold shadow-xs">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold text-zinc-950 dark:text-white uppercase tracking-wider">
                  Смета #{lead.id}
                </h2>
                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-sm bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200">
                  {lead.renovationClass}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                {lead.createdAt} • СК «{lead.companyName}»
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Client & Property Info */}
        <div className="p-3.5 bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
          <div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Заказчик</div>
            <div className="font-bold text-zinc-950 dark:text-white mt-0.5">{lead.customerName}</div>
            <div className="text-zinc-500 font-mono text-[11px]">{lead.phone}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Объект</div>
            <div className="font-bold text-zinc-950 dark:text-white mt-0.5">{lead.city}</div>
            <div className="text-zinc-500 text-[11px] truncate">{lead.address}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Площадь</div>
            <div className="font-extrabold text-zinc-950 dark:text-white mt-0.5">{lead.area} м²</div>
            <div className="text-zinc-500 text-[11px]">{lead.rooms}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Итоговая смета</div>
            <div className="text-sm font-extrabold text-zinc-950 dark:text-white mt-0.5">
              {lead.estimateTotal.toLocaleString('ru-RU')} ₽
            </div>
            {lead.savingsTotal > 0 && (
              <div className="text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                Экономия: -{lead.savingsTotal.toLocaleString('ru-RU')} ₽
              </div>
            )}
          </div>
        </div>

        {/* Estimate Breakdown List */}
        <div className="p-3.5 flex-1 overflow-y-auto space-y-2">
          <div className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Технологическая ведомость работ (СП 71.13330):</span>
            <span className="text-[11px] text-zinc-500 normal-case font-normal">{lead.breakdown.length} позиций</span>
          </div>

          <div className="space-y-1.5">
            {lead.breakdown.map((item, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/80 flex items-center justify-between text-xs hover:border-zinc-300 dark:hover:border-zinc-600 transition"
              >
                <div>
                  <div className="font-bold text-zinc-900 dark:text-white">{item.name}</div>
                  <div className="text-[10px] text-zinc-500 flex items-center gap-1.5 mt-0.5">
                    <span className="px-1.5 py-0.2 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium">
                      {item.category}
                    </span>
                    <span>Объем: {item.qty}</span>
                  </div>
                </div>
                <div className="font-extrabold text-zinc-950 dark:text-white whitespace-nowrap text-right pl-3">
                  {item.total.toLocaleString('ru-RU')} ₽
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="text-[10px] sm:text-[11px] text-zinc-500 flex items-center gap-1 self-start sm:self-auto">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Смета зафиксирована по нормам СП 71.13330</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={() => {
                if (navigator.clipboard) {
                  navigator.clipboard.writeText(`Смета #${lead.id}: ${lead.customerName}, ${lead.area}м², сумма: ${lead.estimateTotal.toLocaleString('ru-RU')} ₽`);
                }
              }}
              className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold transition text-center"
            >
              Копировать
            </button>
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 text-xs font-bold transition shadow-xs text-center"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
