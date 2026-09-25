import React from 'react';
import { X, ShieldCheck, FileCheck, Lock } from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';

interface PrivacyPolicyModalProps {
  companyName: string;
  onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({
  companyName,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[88vh] overflow-y-auto animate-in slide-in-from-bottom duration-250 text-slate-800 dark:text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-3 sm:hidden" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                Политика конфиденциальности
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                В соответствии с Федеральным законом № 152-ФЗ РФ
              </p>
            </div>
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

        {/* Policy Body */}
        <div className="mt-4 space-y-3.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed pr-1">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60 flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[11px]">
              Настоящая Политика регламентирует порядок обработки и защиты персональных данных пользователей сервиса «{companyName}» при расчете сметы и записи на замер.
            </p>
          </div>

          <section>
            <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1 flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-blue-500" />
              1. Состав собираемых данных
            </h4>
            <p>
              При заполнении формы онлайн-калькулятора собираются: имя пользователя, контактный номер телефона, параметры объекта ремонта (площадь, тип жилья, предпочтительный класс отделки, выбранные опции), предпочтительный канал связи и дата проведения замера.
            </p>
          </section>

          <section>
            <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1 flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-blue-500" />
              2. Цели обработки персональных данных
            </h4>
            <ul className="list-disc pl-4 space-y-1">
              <li>Формирование предварительной сметы и коммерческого предложения;</li>
              <li>Связь специалиста с клиентом для согласования времени бесплатного выезда инженера-сметчика;</li>
              <li>Подготовка персонального 3D-плана расстановки мебели и фиксация скидок.</li>
            </ul>
          </section>

          <section>
            <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1 flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-blue-500" />
              3. Защита и непередача третьим лицам
            </h4>
            <p>
              Компания «{companyName}» не передает ваши персональные данные третьим лицам, за исключением случаев, предусмотренных законодательством РФ. Данные хранятся в защищенной базе данных с шифрованием канала передачи по протоколу SSL/TLS.
            </p>
          </section>

          <section>
            <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1 flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-blue-500" />
              4. Срок действия согласия и отзыв
            </h4>
            <p>
              Согласие действует бессрочно с момента отправки заявки и может быть отозвано субъектом персональных данных путем направления письменного обращения на контактный email или по телефону компании.
            </p>
          </section>
        </div>

        {/* Modal Action */}
        <div className="mt-5">
          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs shadow-md transition active:scale-98"
          >
            Я ознакомлен(а)
          </button>
        </div>
      </div>
    </div>
  );
};
