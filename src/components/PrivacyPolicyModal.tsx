import React from 'react';
import { X, ShieldCheck, FileCheck, Lock, ExternalLink, UserCheck } from 'lucide-react';
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
        className="w-full sm:max-w-xl bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800 max-h-[88vh] overflow-y-auto animate-in slide-in-from-bottom duration-250 text-zinc-800 dark:text-zinc-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto mb-3 sm:hidden" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white leading-tight">
                Политика конфиденциальности
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                В соответствии с Федеральным законом № 152-ФЗ РФ
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

        {/* Operator Card (ФИО и ИНН самозанятого) */}
        <div className="mt-4 p-3.5 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-200 dark:border-blue-800/60 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-blue-900 dark:text-blue-300 mb-2">
            <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Оператор персональных данных (152-ФЗ):</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-zinc-500 dark:text-zinc-400 block">Оператор (ФИО):</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">Самозанятый Кострикин</span>
            </div>
            <div>
              <span className="text-zinc-500 dark:text-zinc-400 block">ИНН самозанятого:</span>
              <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">772834567890</span>
            </div>
            <div>
              <span className="text-zinc-500 dark:text-zinc-400 block">Налоговый режим:</span>
              <span className="text-zinc-700 dark:text-zinc-300">Плательщик НПД</span>
            </div>
            <div>
              <span className="text-zinc-500 dark:text-zinc-400 block">Email для обращений:</span>
              <a href="mailto:kostrikin552@gmail.com" className="text-blue-600 dark:text-blue-400 font-medium underline">
                kostrikin552@gmail.com
              </a>
            </div>
          </div>
        </div>

        {/* Consent Banner (Обязательный текст согласия) */}
        <div className="mt-3 p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-900 dark:text-emerald-200 font-semibold leading-relaxed">
          «Нажимая кнопку, вы даете согласие на обработку персональных данных в соответствии с Федеральным законом № 152-ФЗ и настоящей Политикой конфиденциальности».
        </div>

        {/* Policy Body */}
        <div className="mt-4 space-y-3.5 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed pr-1">
          <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60 flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[11px]">
              Настоящая Политика регламентирует порядок обработки и защиты персональных данных пользователей сервиса «{companyName}» при расчете сметы и записи на замер.
            </p>
          </div>

          <section>
            <h4 className="font-bold text-zinc-900 dark:text-white text-xs mb-1 flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-blue-500" />
              1. Состав собираемых данных
            </h4>
            <p>
              При заполнении формы онлайн-калькулятора собираются: имя пользователя, контактный номер телефона, параметры объекта ремонта (площадь, тип жилья, предпочтительный класс отделки, выбранные опции), предпочтительный канал связи и дата проведения замера.
            </p>
          </section>

          <section>
            <h4 className="font-bold text-zinc-900 dark:text-white text-xs mb-1 flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-blue-500" />
              2. Цели обработки персональных данных
            </h4>
            <ul className="list-disc pl-4 space-y-1">
              <li>Формирование предварительной сметы и коммерческого предложения;</li>
              <li>Связь инженера-сметчика с клиентом для согласования времени бесплатного выезда;</li>
              <li>Генерация официальной PDF-сметы по ГОСТ и отправка результатов расчета в Telegram.</li>
            </ul>
          </section>

          <section>
            <h4 className="font-bold text-zinc-900 dark:text-white text-xs mb-1 flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-blue-500" />
              3. Защита и непередача третьим лицам
            </h4>
            <p>
              Оператор не передает ваши персональные данные третьим лицам, за исключением случаев, предусмотренных законодательством РФ. Данные передаются исключительно по защищенному протоколу SSL/TLS с шифрованием.
            </p>
          </section>

          <section>
            <h4 className="font-bold text-zinc-900 dark:text-white text-xs mb-1 flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-blue-500" />
              4. Срок действия согласия и порядок отзыва
            </h4>
            <p>
              Согласие действует бессрочно с момента отправки заявки и может быть отозвано субъектом персональных данных путем направления письменного обращения на контактный email: <strong className="text-zinc-900 dark:text-white">kostrikin552@gmail.com</strong>.
            </p>
          </section>
        </div>

        {/* Modal Actions */}
        <div className="mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3">
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white font-medium transition"
          >
            <span>Открыть в браузере</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="py-2.5 px-5 bg-zinc-900 hover:bg-black text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100 rounded-xl font-semibold text-xs shadow-md transition active:scale-98"
          >
            Я ознакомлен(а)
          </button>
        </div>
      </div>
    </div>
  );
};
