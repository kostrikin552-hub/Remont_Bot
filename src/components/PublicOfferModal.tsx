import React, { useState } from 'react';
import { X, FileText, CheckCircle2, Shield, Printer, ExternalLink, Hammer } from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';

interface PublicOfferModalProps {
  companyName: string;
  onClose: () => void;
}

export const PublicOfferModal: React.FC<PublicOfferModalProps> = ({
  companyName,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'highlights' | 'full'>('highlights');

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-250 text-zinc-800 dark:text-zinc-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto mb-3 sm:hidden" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white leading-tight">
                Публичная оферта
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Договор на выполнение ремонтно-отделочных работ и сметный аудит
              </p>
            </div>
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

        {/* Tabs */}
        <div className="flex gap-2 mt-3.5 p-1 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setActiveTab('highlights');
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition ${
              activeTab === 'highlights'
                ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            Ключевые условия
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setActiveTab('full');
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition ${
              activeTab === 'full'
                ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            Полный текст оферты
          </button>
        </div>

        {/* Content */}
        {activeTab === 'highlights' ? (
          <div className="mt-4 space-y-3.5 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed pr-1">
            {/* Highlight 1: Фиксированная смета */}
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 space-y-1">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Фиксация цены без скрытых доплат (п. 2.1):</span>
              </div>
              <p className="text-[12px] font-semibold text-zinc-900 dark:text-zinc-100 pl-6">
                «Стоимость работ и смета фиксируются в официальном договоре подряда и не увеличиваются в процессе ремонта».
              </p>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 pl-6">
                Все расчеты в калькуляторе ведутся по технологическим картам и ГОСТ-расценкам компании.
              </p>
            </div>

            {/* Highlight 2: Оплата поэтапно */}
            <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-200 dark:border-blue-800/60 space-y-1">
              <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300 font-bold text-xs">
                <Hammer className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Поэтапная оплата по факту приемки (п. 3.2):</span>
              </div>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-300 pl-6">
                Мы не берем предоплату за строительные работы. Заказчик оплачивает каждый завершенный этап только после личной проверки и подписания двустороннего акта выполненных работ.
              </p>
            </div>

            {/* Highlight 3: Гарантия */}
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-800/60 space-y-1">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-xs">
                <Shield className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Официальная гарантия до 3 лет (п. 5.1):</span>
              </div>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-300 pl-6">
                На все монтажные, черновые и финишные работы предоставляется гарантия по договору с устранением любых гарантийных замечаний за счет компании.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed font-normal pr-1 select-text">
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80">
              <h4 className="font-bold text-zinc-900 dark:text-white mb-1">
                ПУБЛИЧНАЯ ОФЕРТА НА ВЫПОЛНЕНИЕ РЕМОНТНО-ОТДЕЛОЧНЫХ РАБОТ
              </h4>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Редакция от 01 января 2026 года • г. Москва
              </p>
            </div>

            <section className="space-y-1.5">
              <h5 className="font-bold text-zinc-900 dark:text-white text-xs">
                1. Общие положения и акцепт
              </h5>
              <p>
                1.1. Настоящий документ является официальным предложением (публичной офертой в соответствии со ст. 437 Гражданского кодекса РФ) строительно-ремонтной компании «{companyName}» (далее — Исполнитель) заключить договор на выполнение строительно-отделочных работ и сметный аудит с любым дееспособным физическим или юридическим лицом (далее — Заказчик).
              </p>
              <p>
                1.2. Акцептом настоящей оферты признается направление заявки на расчет сметы, вызов инженера-замерщика либо подписание предварительного листа согласования.
              </p>
            </section>

            <section className="space-y-1.5">
              <h5 className="font-bold text-zinc-900 dark:text-white text-xs">
                2. Предмет договора
              </h5>
              <p>
                2.1. Исполнитель обязуется выполнить ремонтно-отделочные работы на объекте Заказчика в соответствии с согласованной сметой и стандартами СНиП/ГОСТ, а Заказчик обязуется принять результат работ и оплатить его в порядке и сроки, установленные договором.
              </p>
              <p>
                2.2. Онлайн-калькулятор производит предварительный расчет сметы на основании параметров помещения (площадь, высоты потолков, выбранный пакет отделки). Итоговая смета фиксируется инженером-сметчиком на объекте при лазерном замере.
              </p>
            </section>

            <section className="space-y-1.5">
              <h5 className="font-bold text-zinc-900 dark:text-white text-xs">
                3. Стоимость и порядок расчетов
              </h5>
              <p>
                3.1. Стоимость работ определяется сметным расчетом и фиксируется в приложении к договору.
              </p>
              <p>
                3.2. Оплата производится поэтапно (демонтаж, черновые работы, инженерные сети, чистовая отделка) по факту выполнения каждого этапа в течение 3 (трех) банковских дней с момента подписания акта сдачи-приемки. Предоплата за выполнение строительных работ не взимается.
              </p>
            </section>

            <section className="space-y-1.5">
              <h5 className="font-bold text-zinc-900 dark:text-white text-xs">
                4. Гарантийные обязательства
              </h5>
              <p>
                4.1. Гарантийный срок на выполненные отделочные и монтажные работы составляет до 36 (тридцати шести) месяцев с момента подписания итогового акта приемки.
              </p>
              <p>
                4.2. В случае обнаружения дефектов Исполнитель обязуется безвозмездно устранить их в согласованный с Заказчиком срок.
              </p>
            </section>
          </div>
        )}

        {/* Modal Footer */}
        <div className="mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
            <Shield className="w-3.5 h-3.5 text-emerald-500" />
            <span>Договор компании {companyName}</span>
          </div>

          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-bold text-xs transition"
          >
            Понятно, закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
