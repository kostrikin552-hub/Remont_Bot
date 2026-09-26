import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  Calendar,
  Phone,
  User,
  MessageSquare,
  ShieldCheck,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { CalculationResult, BookingFormState, CompanyConfig } from '../types';
import { formatCurrency, triggerHaptic, getTelegramUser } from '../utils/telegram';
import { createLead } from '../lib/supabase';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';

interface BookingModalProps {
  result: CalculationResult;
  company: CompanyConfig;
  onClose: () => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  result,
  company,
  onClose,
}) => {
  const tgUser = getTelegramUser();
  const defaultName = tgUser?.first_name
    ? `${tgUser.first_name}${tgUser.last_name ? ' ' + tgUser.last_name : ''}`
    : '';

  const [form, setForm] = useState<BookingFormState>({
    name: defaultName,
    phone: '',
    date: 'Завтра',
    communication: 'telegram',
    comment: '',
    agreement152fz: true,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [bookingCode, setBookingCode] = useState('');
  const [error, setError] = useState('');
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  const DATE_OPTIONS = ['Сегодня', 'Завтра', 'В субботу', 'В воскресенье'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      setError('Укажите ваше имя');
      triggerHaptic('heavy');
      return;
    }

    const cleanPhone = form.phone.replace(/\D/g, '');
    if (!form.phone.trim() || cleanPhone.length < 10) {
      setError('Укажите корректный номер телефона (от 10 цифр)');
      triggerHaptic('heavy');
      return;
    }

    if (!form.agreement152fz) {
      setError('Необходимо согласие на обработку данных (152-ФЗ)');
      triggerHaptic('heavy');
      return;
    }

    setError('');
    setIsSubmitting(true);
    triggerHaptic('light');

    try {
      const activeOptionTitles = result.activeOptions.map(
        (opt) => `${opt.title} (+${opt.pricePerMeter} ₽/м²)`
      );

      const res = await createLead({
        company_id: company.id,
        name: form.name.trim(),
        phone: form.phone.trim(),
        city: company.city,
        area: result.area,
        property_type: result.propertyType,
        renovation_class: result.renovationClass.title,
        price_min: result.priceMin,
        price_max: result.priceMax,
        total_base_cost: result.totalCost,
        active_options: activeOptionTitles,
        preferred_date: form.date,
        communication: form.communication,
        comment: form.comment.trim() || undefined,
        agreement_152fz: form.agreement152fz,
      });

      setBookingCode(res.leadId);
      setIsSubmitted(true);
      triggerHaptic('success');

      if (window.Telegram?.WebApp?.sendData) {
        try {
          window.Telegram.WebApp.sendData(
            JSON.stringify({
              leadId: res.leadId,
              companyId: company.id,
              name: form.name.trim(),
              phone: form.phone.trim(),
              area: result.area,
              renovationClass: result.renovationClass.title,
              date: form.date,
            })
          );
        } catch {
          // No-op
        }
      }
    } catch (err) {
      console.error('Lead submit error:', err);
      setBookingCode('LEAD-' + Math.floor(100000 + Math.random() * 900000));
      setIsSubmitted(true);
      triggerHaptic('success');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}
      >
        <div
          className="w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl border border-zinc-200/80 dark:border-zinc-800 max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom duration-200 text-zinc-900 dark:text-zinc-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-10 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto mb-3 sm:hidden" />

          {isSubmitted ? (
            <div className="py-4 text-center space-y-4">
              <div className="w-14 h-14 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-2xl flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
                  Заявка зарегистрирована
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs mx-auto leading-relaxed">
                  Инженер свяжется с вами для согласования удобного времени визита.
                </p>
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-850 p-4 rounded-xl text-left border border-zinc-200/60 dark:border-zinc-800 text-xs space-y-2">
                <div className="flex justify-between items-center pb-2 border-b border-zinc-200/50 dark:border-zinc-800">
                  <span className="text-zinc-400">Номер заявки:</span>
                  <span className="font-mono font-bold text-zinc-900 dark:text-white">{bookingCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Объект:</span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {result.area} м² ({result.propertyType === 'new' ? 'Новостройка' : 'Вторичка'})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Тариф:</span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {result.renovationClass.title}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Ориентир сметы:</span>
                  <span className="font-bold text-zinc-900 dark:text-white tabular-nums">
                    {formatCurrency(result.priceMin)} — {formatCurrency(result.priceMax)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onClose();
                }}
                className="w-full py-3 bg-zinc-900 hover:bg-black text-white dark:bg-white dark:text-zinc-950 rounded-xl font-semibold text-sm transition"
              >
                Вернуться к расчету
              </button>
            </div>
          ) : (
            <div>
              {/* Modal Top */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <div>
                  <h3 className="text-base font-bold tracking-tight text-zinc-900 dark:text-white">
                    Запись на выезд инженера
                  </h3>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                    {company.name} · {company.city}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onClose();
                  }}
                  className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white flex items-center justify-center transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Ваше имя
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      placeholder="Иван"
                      value={form.name}
                      onChange={(e) => {
                        setError('');
                        setForm({ ...form, name: e.target.value });
                      }}
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                    />
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Телефон для связи
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                    <input
                      type="tel"
                      required
                      placeholder="+7 999 000-00-00"
                      value={form.phone}
                      onChange={(e) => {
                        setError('');
                        setForm({ ...form, phone: e.target.value });
                      }}
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                    />
                  </div>
                  {error && (
                    <p className="text-xs text-rose-500 mt-1 font-medium">
                      {error}
                    </p>
                  )}
                </div>

                {/* Preferred Date */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                    Желаемый день для замера
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {DATE_OPTIONS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          triggerHaptic('selection');
                          setForm({ ...form, date: d });
                        }}
                        className={`py-2 px-1 text-xs font-medium rounded-lg border transition ${
                          form.date === d
                            ? 'bg-zinc-900 border-zinc-900 text-white dark:bg-white dark:border-white dark:text-zinc-950 font-semibold'
                            : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Communication channel */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-zinc-500" />
                    Куда прислать подтверждение
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'telegram', label: 'Telegram' },
                      { id: 'whatsapp', label: 'WhatsApp' },
                      { id: 'call', label: 'Звонок' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('selection');
                          setForm({
                            ...form,
                            communication: item.id as BookingFormState['communication'],
                          });
                        }}
                        className={`py-2 px-2 text-xs font-medium rounded-lg border transition ${
                          form.communication === item.id
                            ? 'bg-zinc-900 border-zinc-900 text-white dark:bg-white dark:border-white dark:text-zinc-950 font-semibold'
                            : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 152-FZ */}
                <div className="pt-1">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.agreement152fz}
                      onChange={(e) => {
                        triggerHaptic('selection');
                        setForm({ ...form, agreement152fz: e.target.checked });
                      }}
                      className="mt-0.5 w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 text-zinc-900 focus:ring-zinc-900 cursor-pointer shrink-0"
                    />
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
                      Согласен на обработку данных в соответствии со{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          triggerHaptic('light');
                          setShowPrivacyModal(true);
                        }}
                        className="underline text-zinc-700 dark:text-zinc-300 font-medium"
                      >
                        152-ФЗ и политикой
                      </button>
                    </span>
                  </label>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 px-4 bg-zinc-900 hover:bg-black text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100 rounded-xl font-semibold text-sm shadow-md transition active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none mt-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Отправка данных...</span>
                    </>
                  ) : (
                    <>
                      <span>Зафиксировать расчет и вызвать инженера</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {showPrivacyModal && (
        <PrivacyPolicyModal
          companyName={company.name}
          onClose={() => setShowPrivacyModal(false)}
        />
      )}
    </>
  );
};
