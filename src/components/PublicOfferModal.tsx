import React, { useState } from 'react';
import { X, FileText, CheckCircle2, RefreshCw, Zap, Shield, Printer, ExternalLink } from 'lucide-react';
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
                Оказание информационно-технических услуг (подписка)
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
            {/* Highlight 1: Момент оказания услуги */}
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-800/60 space-y-1">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-xs">
                <Zap className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Момент оказания услуги (п. 3.2):</span>
              </div>
              <p className="text-[12px] font-semibold text-zinc-900 dark:text-zinc-100 pl-6">
                «Услуга считается оказанной в момент предоставления доступа к функционалу платформы».
              </p>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 pl-6">
                Доступ открывается автоматически сразу после подтверждения оплаты (разблокировка лидов, калькулятора и генератора смет).
              </p>
            </div>

            {/* Highlight 2: Автопродление */}
            <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-200 dark:border-blue-800/60 space-y-1">
              <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300 font-bold text-xs">
                <RefreshCw className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Порядок автопродления (раздел 5):</span>
              </div>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-300 pl-6">
                Подписка продлевается автоматически каждые 30, 90 или 365 дней (в зависимости от выбранного тарифа) в день окончания оплаченного периода. За 24 часа бот отправляет напоминание в Telegram.
              </p>
            </div>

            {/* Highlight 3: Отмена в 1 клик */}
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 space-y-1">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Отмена подписки в 1 клик (раздел 6):</span>
              </div>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-300 pl-6">
                Вы можете отказаться от автопродления в любой момент в 1 клик через команду <code className="bg-emerald-100 dark:bg-emerald-900/60 px-1 py-0.5 rounded font-mono">/cancel_subscription</code> или кнопку в боте. Никаких комиссий и штрафов. Доступ ко всем функциям сохраняется до конца уже оплаченного периода!
              </p>
            </div>

            {/* Tariffs summary */}
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60 text-[11px] space-y-1.5">
              <div className="font-bold text-zinc-900 dark:text-white">Тарифные планы:</div>
              <div className="flex justify-between py-0.5 border-b border-zinc-200 dark:border-zinc-700">
                <span>1 месяц (30 дней):</span>
                <span className="font-bold">2 990 ₽</span>
              </div>
              <div className="flex justify-between py-0.5 border-b border-zinc-200 dark:border-zinc-700">
                <span>3 месяца (90 дней):</span>
                <span className="font-bold text-amber-600">6 990 ₽ (-22%)</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span>1 год (365 дней):</span>
                <span className="font-bold text-emerald-600">22 990 ₽ (-35%)</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3.5 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed pr-1 max-h-[55vh] overflow-y-auto">
            <section>
              <h4 className="font-bold text-zinc-900 dark:text-white text-xs mb-1">
                1. Термины и предмет договора
              </h4>
              <p>
                Исполнитель предоставляет Заказчику удаленный доступ к программно-аппаратному комплексу «{companyName}» (Telegram-бот, онлайн-калькулятор смет, генератор официальных PDF-смет по ГОСТ, маршрутизация клиентских заявок) на условиях подписки.
              </p>
            </section>

            <section>
              <h4 className="font-bold text-zinc-900 dark:text-white text-xs mb-1">
                2. Момент оказания услуги
              </h4>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-lg border border-amber-200 dark:border-amber-800">
                Услуга считается оказанной в момент предоставления доступа к функционалу платформы. Обязательства Исполнителя признаются исполненными в полном объеме с момента зачисления оплаты и активации тарифа.
              </p>
            </section>

            <section>
              <h4 className="font-bold text-zinc-900 dark:text-white text-xs mb-1">
                3. Порядок автопродления (рекуррентные платежи)
              </h4>
              <p>
                Оплата производится на условиях автоматического регулярного списания (автопродление) раз в расчетный период (1 месяц, 3 месяца или 1 год) в день окончания оплаченного периода. За 24 часа до списания пользователю направляется сервисный анонс в Telegram.
              </p>
            </section>

            <section>
              <h4 className="font-bold text-zinc-900 dark:text-white text-xs mb-1">
                4. Порядок отмены подписки в 1 клик
              </h4>
              <p>
                Пользователь вправе в любой момент отказаться от автопродления подписки без удержаний и комиссий: в Telegram-боте командой /cancel_subscription или кнопкой в кабинете /subscription. Доступ к функционалу сохраняется в полном объеме до конца оплаченного расчетного периода.
              </p>
            </section>

            <section>
              <h4 className="font-bold text-zinc-900 dark:text-white text-xs mb-1">
                5. Персональные данные (152-ФЗ)
              </h4>
              <p>
                Обработка данных производится в строгом соответствии с 152-ФЗ РФ и Политикой конфиденциальности. Данные хранятся в защищенном контуре с шифрованием.
              </p>
            </section>

            <section>
              <h4 className="font-bold text-zinc-900 dark:text-white text-xs mb-1">
                6. Реквизиты Исполнителя
              </h4>
              <p className="text-zinc-700 dark:text-zinc-300">
                Исполнитель: Самозанятый Кострикин Алексей Алексеевич (Плательщик НПД)<br />
                ИНН: <span className="font-mono font-semibold">711380053758</span> • Email: <a href="mailto:kostrikin552@gmail.com" className="text-blue-600 dark:text-blue-400 underline">kostrikin552@gmail.com</a>
              </p>
            </section>
          </div>
        )}

        {/* Modal Actions */}
        <div className="mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3">
          <a
            href="/offer"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white font-medium transition"
          >
            <span>Открыть в браузере</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              onClose();
            }}
            className="py-2.5 px-5 bg-zinc-900 hover:bg-black text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100 rounded-xl font-semibold text-xs transition"
          >
            Понятно, закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
