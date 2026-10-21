import React, { useState, useMemo } from 'react';
import {
  X,
  Printer,
  Copy,
  Check,
  Share2,
  FileText,
  Calendar,
  ShieldCheck,
  Building2,
  Phone,
  Mail,
  User,
  MapPin,
  Clock,
  Sparkles,
} from 'lucide-react';
import {
  CalculationResult,
  CompanyConfig,
  EstimateCategoryGroup,
  RenovationClass,
} from '../types';
import { formatCurrency, triggerHaptic, copyTextToClipboard } from '../utils/telegram';
import { formatTextEstimate } from '../utils/estimates';

interface PrintProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: CompanyConfig;
  result: CalculationResult;
  selectedClass: RenovationClass;
  groups: EstimateCategoryGroup[];
  grandTotal: number;
  worksTotal: number;
  materialsTotal: number;
  estimatedDays: { min: number; max: number };
}

export const PrintProposalModal: React.FC<PrintProposalModalProps> = ({
  isOpen,
  onClose,
  company,
  result,
  selectedClass,
  groups,
  grandTotal,
  worksTotal,
  materialsTotal,
  estimatedDays,
}) => {
  const [clientName, setClientName] = useState('Заказчик');
  const [objectAddress, setObjectAddress] = useState('г. Москва, Объект ремонта');
  const [copied, setCopied] = useState(false);

  const lockUntilDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, []);

  const todayStr = useMemo(() => {
    return new Date().toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, []);

  if (!isOpen) return null;

  const handlePrint = () => {
    triggerHaptic('light');
    window.print();
  };

  const handleCopy = async () => {
    const text = formatTextEstimate(
      company.name,
      result.area,
      result.propertyType,
      selectedClass.title,
      groups,
      grandTotal,
      company.botUsername
    );
    const success = await copyTextToClipboard(text);
    if (success) {
      setCopied(true);
      triggerHaptic('success');
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleShareTelegram = () => {
    triggerHaptic('light');
    const text = encodeURIComponent(
      `📄 Коммерческое предложение по ремонту (${result.area} м²)\n` +
      `Компания: ${company.name}\n` +
      `Тариф: ${selectedClass.title}\n` +
      `Итоговая смета: ${formatCurrency(grandTotal)}\n` +
      `Срок выполнения: ${estimatedDays.min}–${estimatedDays.max} дней\n` +
      `🔒 Цена зафиксирована по договору до ${lockUntilDate}`
    );
    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${text}`;
    window.open(tgUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white print:static print:overflow-visible">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-3xl w-full border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] print:max-h-none print:border-none print:shadow-none print:w-full print:rounded-none">
        {/* Панель управления (скрывается при печати) */}
        <div className="p-3 sm:p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 bg-zinc-50 dark:bg-zinc-900/90 print:hidden shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                Коммерческое предложение / Смета
              </h3>
              <p className="text-[11px] text-zinc-500 truncate">
                Готово для печати в PDF или отправки заказчику
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold flex items-center gap-1 transition"
              title="Скопировать текст сметы"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? 'Скопировано' : 'Текст сметы'}</span>
            </button>

            <button
              type="button"
              onClick={handleShareTelegram}
              className="px-2.5 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold flex items-center gap-1 transition"
              title="Отправить в Telegram"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Telegram</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Печать / PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Быстрое редактирование данных заказчика перед печатью (скрывается при печати) */}
        <div className="p-3 bg-zinc-100/80 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs print:hidden shrink-0">
          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
              Кому (ФИО заказчика):
            </label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Например: Иванов Алексей Сергеевич"
              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-medium focus:outline-emerald-500"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
              Адрес объекта:
            </label>
            <input
              type="text"
              value={objectAddress}
              onChange={(e) => setObjectAddress(e.target.value)}
              placeholder="Например: ЖК Скандинавия, корпус 2"
              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-medium focus:outline-emerald-500"
            />
          </div>
        </div>

        {/* ПЕЧАТНЫЙ ДОКУМЕНТ (A4 FORMAT) */}
        <div
          id="printable-estimate-content"
          className="p-4 sm:p-6 space-y-4 overflow-y-auto text-zinc-900 dark:text-zinc-100 print:text-black print:overflow-visible print:p-0 print:space-y-3"
        >
          {/* Шапка коммерческого предложения */}
          <div className="flex items-start justify-between border-b pb-4 border-zinc-200 dark:border-zinc-800 print:border-black/20">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-zinc-900 text-white font-extrabold flex items-center justify-center text-sm print:border print:border-black">
                  {company.logoLetter || company.name.charAt(0) || 'Р'}
                </span>
                <div>
                  <h1 className="text-base sm:text-lg font-extrabold text-zinc-950 dark:text-white print:text-black leading-tight">
                    {company.name}
                  </h1>
                  <p className="text-[11px] text-zinc-500 print:text-zinc-600">
                    Ремонт и отделка квартир под ключ по стандартам ГОСТ и СНиП
                  </p>
                </div>
              </div>
            </div>

            <div className="text-right text-xs space-y-0.5">
              <div className="font-bold text-zinc-900 dark:text-zinc-100 print:text-black">
                {company.city}
              </div>
              {company.phone && (
                <div className="text-zinc-600 dark:text-zinc-400 print:text-zinc-800 font-mono font-semibold">
                  {company.phone}
                </div>
              )}
              <div className="text-[11px] text-zinc-500">
                Дата сметы: {todayStr}
              </div>
            </div>
          </div>

          {/* Карточка объекта и заказчика */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 print:bg-zinc-100/50 print:border-black/20 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-0.5">Заказчик:</span>
              <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100 print:text-black">{clientName}</div>
              <div className="text-[11px] text-zinc-600 dark:text-zinc-400 print:text-zinc-800 mt-0.5">{objectAddress}</div>
            </div>

            <div className="text-right sm:text-left">
              <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-0.5">Параметры объекта:</span>
              <div className="font-bold text-zinc-900 dark:text-zinc-100 print:text-black">
                {result.area} м² · {result.propertyType === 'new' ? 'Новостройка' : 'Вторичное жилье'}
              </div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 print:text-zinc-800 font-semibold mt-0.5">
                Тариф: {selectedClass.title}
              </div>
            </div>
          </div>

          {/* Финансовая сводка */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 print:border-black/20">
              <span className="text-[10px] text-zinc-500 uppercase font-bold block">Работа мастеров</span>
              <span className="text-sm sm:text-base font-extrabold font-mono text-zinc-900 dark:text-zinc-100 print:text-black block mt-0.5">
                {formatCurrency(worksTotal)}
              </span>
            </div>

            <div className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 print:border-black/20">
              <span className="text-[10px] text-zinc-500 uppercase font-bold block">Черновые материалы</span>
              <span className="text-sm sm:text-base font-extrabold font-mono text-zinc-900 dark:text-zinc-100 print:text-black block mt-0.5">
                {formatCurrency(materialsTotal)}
              </span>
            </div>

            <div className="p-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-950/40 print:bg-zinc-100 print:border-black">
              <span className="text-[10px] text-emerald-700 dark:text-emerald-300 uppercase font-bold block">Итого под ключ</span>
              <span className="text-sm sm:text-base font-black font-mono text-emerald-700 dark:text-emerald-400 print:text-black block mt-0.5">
                {formatCurrency(grandTotal)}
              </span>
              <span className="text-[10px] text-zinc-500 block">
                ~{Math.round(grandTotal / result.area).toLocaleString('ru-RU')} ₽/м²
              </span>
            </div>
          </div>

          {/* Разделы сметных работ */}
          <div className="space-y-3 pt-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 border-b pb-1 border-zinc-200 dark:border-zinc-800">
              Перечень основных технологических этапов по ГОСТ:
            </h3>

            <div className="space-y-2 text-xs">
              {groups.map((group) => (
                <div
                  key={group.category}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden print:border-black/20"
                >
                  <div className="p-2 bg-zinc-100 dark:bg-zinc-800/80 flex items-center justify-between font-bold text-xs print:bg-zinc-200">
                    <span className="text-zinc-900 dark:text-zinc-100 print:text-black">
                      {group.title}
                    </span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200 print:text-black">
                      {formatCurrency(group.totalCost)}
                    </span>
                  </div>

                  <div className="p-2 space-y-1 bg-white dark:bg-zinc-900 print:bg-white text-[11px]">
                    {group.items
                      .filter((item) => !item.excluded)
                      .slice(0, 4)
                      .map((ci) => (
                        <div key={ci.item.id} className="flex items-center justify-between gap-2 text-zinc-600 dark:text-zinc-400 print:text-zinc-800">
                          <span className="truncate">• {ci.item.title}</span>
                          <span className="font-mono tabular-nums shrink-0 font-medium">
                            {formatCurrency(ci.subtotal)}
                          </span>
                        </div>
                      ))}
                    {group.items.filter((i) => !i.excluded).length > 4 && (
                      <div className="text-[10px] text-zinc-400 italic pt-0.5">
                        ... и еще {group.items.filter((i) => !i.excluded).length - 4} технологических позиций
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Сертификат фиксации цены и гарантийные условия */}
          <div className="p-3 rounded-xl border border-emerald-600/40 bg-emerald-50/50 dark:bg-emerald-950/20 print:border-black print:bg-white space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300 print:text-black">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Официальная гарантия фиксации стоимости:</span>
            </div>
            <ul className="text-[11px] text-zinc-700 dark:text-zinc-300 print:text-black space-y-1 list-disc pl-4">
              <li>
                <strong>Фиксация сметы до {lockUntilDate}:</strong> Стоимость работ и расценок не подлежит увеличению после подписания договора.
              </li>
              <li>
                <strong>0% скрытых платежей:</strong> Оплата производится поэтапно строго по актам фактически выполненных работ (КС-2/КС-3).
              </li>
              <li>
                <strong>Гарантия 36 месяцев:</strong> Полная юридическая ответственность за инженерные коммуникации и чистовую отделку.
              </li>
              <li>
                <strong>Срок работ:</strong> {estimatedDays.min}–{estimatedDays.max} календарных дней с фиксацией штрафов за задержку.
              </li>
            </ul>
          </div>

          {/* Подписи сторон */}
          <div className="grid grid-cols-2 gap-8 pt-4 border-t border-zinc-200 dark:border-zinc-800 print:border-black/30 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-3">Подрядчик:</span>
              <div className="border-b border-zinc-400 dark:border-zinc-600 print:border-black pb-1 mb-1 font-semibold">
                {company.name}
              </div>
              <div className="text-[10px] text-zinc-500">М.П. / Подпись</div>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-3">Заказчик:</span>
              <div className="border-b border-zinc-400 dark:border-zinc-600 print:border-black pb-1 mb-1 font-semibold">
                {clientName}
              </div>
              <div className="text-[10px] text-zinc-500">Подпись с условиями ознакомлен</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
