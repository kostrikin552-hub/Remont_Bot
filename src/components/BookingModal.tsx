import React, { useState, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  Calendar,
  Phone,
  User,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Loader2,
  ArrowRight,
  KeyRound,
  FileText,
  AlertTriangle,
  Download,
} from 'lucide-react';
import { CalculationResult, BookingFormState, CompanyConfig, KeyStatus } from '../types';
import { formatCurrency, triggerHaptic, getTelegramUser, getDetectedBotUsername } from '../utils/telegram';
import { calculateLeadScore } from '../utils/estimates';
import { createLead } from '../lib/supabase';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';
import { PublicOfferModal } from './PublicOfferModal';

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
  const rawFirstName = (tgUser?.first_name || '').trim();
  const isNickname = /^[@_0-9]/.test(rawFirstName) || /bot$/i.test(rawFirstName) || rawFirstName.includes('_');
  const initialRealName = !isNickname && rawFirstName.length >= 2 ? rawFirstName : '';
  const tgUsername = tgUser?.username ? `@${tgUser.username.replace('@', '')}` : '';
  const [manualTgUsername, setManualTgUsername] = useState('');
  const effectiveTgUsername = tgUsername || (manualTgUsername.trim() ? (manualTgUsername.trim().startsWith('@') ? manualTgUsername.trim() : `@${manualTgUsername.trim()}`) : '');

  const [form, setForm] = useState<BookingFormState>({
    name: initialRealName,
    phone: '',
    address: '',
    date: 'Завтра',
    communication: 'telegram',
    comment: '',
    keyStatus: 'ready',
    agreement152fz: true,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [bookingCode, setBookingCode] = useState('');
  const [error, setError] = useState('');
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const DATE_OPTIONS = ['Сегодня', 'Завтра', 'В субботу', 'В воскресенье'];

  // Вычисляем скоринг заявки
  const scoring = useMemo(() => {
    return calculateLeadScore({
      keyStatus: form.keyStatus,
      renovationClass: result.renovationClass.id,
      propertySubtype: result.propertySubtype,
      area: result.area,
      preferredDate: form.date,
      hasAddress: Boolean(form.address.trim()),
    });
  }, [form.keyStatus, result.renovationClass.id, result.propertySubtype, result.area, form.date, form.address]);

  // Нативный запрос контакта через Telegram WebApp
  const handleRequestTelegramContact = () => {
    triggerHaptic('medium');
    const tg = window.Telegram?.WebApp as unknown as { requestContact?: (callback: (ok: boolean) => void) => void };
    if (tg?.requestContact) {
      try {
        tg.requestContact((ok: boolean) => {
          if (ok) {
            triggerHaptic('success');
          }
        });
        return;
      } catch {
        // Fallback
      }
    }
  };

  const handleDownloadPdf = async () => {
    triggerHaptic('medium');
    setIsDownloadingPdf(true);
    try {
      const response = await fetch(`/api/leads/${bookingCode}/pdf`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Smeta_${bookingCode}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        window.print();
      }
    } catch {
      window.print();
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setError('Укажите ваше настоящее имя');
      triggerHaptic('heavy');
      return;
    }

    if (trimmedName.startsWith('@') || trimmedName.includes('t.me/')) {
      setError(`Укажите ваше настоящее имя (например: Алексей), а ник Telegram ${tgUsername || ''} прикрепится автоматически`);
      triggerHaptic('heavy');
      return;
    }

    if (trimmedName.length < 2) {
      setError('Имя должно содержать минимум 2 буквы');
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

      // Технические параметры объекта
      activeOptionTitles.push(`Тип: ${result.propertySubtype}`);
      activeOptionTitles.push(`Санузлов: ${result.bathroomsCount}`);
      activeOptionTitles.push(`Потолки: ${result.ceilingHeight} м`);
      activeOptionTitles.push(`Стены: ${result.wallArea} м²`);
      activeOptionTitles.push(`Статус ключей: ${form.keyStatus}`);
      activeOptionTitles.push(`Скоринг: ${scoring.score}/100 (${scoring.badge})`);

      if (effectiveTgUsername) {
        activeOptionTitles.push(`Telegram: ${effectiveTgUsername}`);
      }

      const combinedComment = [
        form.comment.trim(),
        `Статус ключей: ${form.keyStatus === 'ready' ? 'Ключи на руках' : form.keyStatus === 'in_30_days' ? 'Ключи в течение 30 дней' : 'Дом строится'}`,
        effectiveTgUsername ? `Telegram: ${effectiveTgUsername}` : '',
      ]
        .filter(Boolean)
        .join(' | ');

      const res = await createLead({
        company_id: company.id,
        name: trimmedName,
        phone: form.phone.trim(),
        city: company.city,
        area: result.area,
        property_type: result.propertyType,
        property_subtype: result.propertySubtype,
        bathrooms_count: result.bathroomsCount,
        ceiling_height: result.ceilingHeight,
        key_status: form.keyStatus,
        is_visit_allowed: form.keyStatus === 'ready',
        lead_score: scoring.score,
        lead_grade: scoring.grade,
        renovation_class: result.renovationClass.title,
        price_min: result.priceMin,
        price_max: result.priceMax,
        total_base_cost: result.totalCost,
        active_options: activeOptionTitles,
        address: form.address.trim() || undefined,
        preferred_date: form.keyStatus === 'ready' ? form.date : 'Онлайн-консультация',
        communication: form.communication,
        comment: combinedComment || undefined,
        telegram_username: effectiveTgUsername || undefined,
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
              date: form.keyStatus === 'ready' ? form.date : 'Онлайн-консультация',
              propertyType: result.propertyType,
              propertySubtype: result.propertySubtype,
              bathroomsCount: result.bathroomsCount,
              ceilingHeight: result.ceilingHeight,
              keyStatus: form.keyStatus,
              isVisitAllowed: form.keyStatus === 'ready',
              leadScore: scoring.score,
              leadGrade: scoring.grade,
              priceMin: result.priceMin,
              priceMax: result.priceMax,
              communication: form.communication,
              telegram_username: effectiveTgUsername || undefined,
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

  const botUsername = getDetectedBotUsername(company.botUsername, company.id);

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
              <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
                  {form.keyStatus === 'ready'
                    ? 'Заявка на замер принята!'
                    : 'Расчёт зафиксирован со скидкой!'}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs mx-auto leading-relaxed">
                  {form.keyStatus === 'ready'
                    ? 'Инженер свяжется с вами для подтверждения времени выезда.'
                    : 'Инженер подготовит предварительный проект и свяжется онлайн.'}
                </p>
              </div>

              {/* Карточка вознаграждения / Лид-магнит */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-3.5 rounded-xl border border-blue-200/80 dark:border-blue-900/50 text-left space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-blue-950 dark:text-blue-100 block">
                      Детальная ГОСТ-смета сформирована
                    </span>
                    <span className="text-[10px] text-blue-700 dark:text-blue-300">
                      Все объемы и расценки высланы в чат Telegram
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isDownloadingPdf}
                  className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
                >
                  {isDownloadingPdf ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>Скачать официальную смету (PDF)</span>
                </button>
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-800 p-4 rounded-xl text-left border border-zinc-200/80 dark:border-zinc-700 text-xs space-y-2">
                <div className="flex justify-between items-center pb-2 border-b border-zinc-200/50 dark:border-zinc-800">
                  <span className="text-zinc-400">Номер заявки:</span>
                  <span className="font-mono font-bold text-zinc-900 dark:text-white">{bookingCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Объект:</span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {result.area} м² ({result.propertyType === 'new' ? 'Новостройка' : 'Вторичка'}), потолки {result.ceilingHeight} м
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Санузлы:</span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {result.bathroomsCount} мокрых зон
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
                <div className="flex justify-between items-center pt-1 border-t border-zinc-200/50 dark:border-zinc-800">
                  <span className="text-zinc-400">Статус обработки:</span>
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    {scoring.badge}
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
                    {form.keyStatus === 'ready'
                      ? 'Запись на выезд инженера'
                      : 'Бронирование расчёта и консультация'}
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
                {/* 1. Квалификационный шаг: Статус готовности объекта */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                    <span>Статус объекта и ключей:</span>
                  </label>
                  <div className="space-y-1.5">
                    {[
                      {
                        id: 'ready' as KeyStatus,
                        title: '🟢 Ключи на руках, объект готов к замеру',
                        hint: 'Бесплатный выезд инженера с лазерным дальномером',
                      },
                      {
                        id: 'in_30_days' as KeyStatus,
                        title: '🟡 Ключи получаем в течение 30 дней',
                        hint: 'Предварительный расчёт и онлайн-консультация',
                      },
                      {
                        id: 'construction' as KeyStatus,
                        title: '⚪ Дом строится (сдача через 2+ мес)',
                        hint: 'Фиксация скидки на смету + консультация по планировке',
                      },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('selection');
                          setForm({ ...form, keyStatus: opt.id });
                        }}
                        className={`w-full p-2.5 rounded-lg border text-left transition-all flex flex-col ${
                          form.keyStatus === opt.id
                            ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 border-zinc-900 dark:border-white shadow-xs'
                            : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200'
                        }`}
                      >
                        <span className="text-xs font-bold leading-tight">{opt.title}</span>
                        <span className={`text-[10px] mt-0.5 leading-snug ${form.keyStatus === opt.id ? 'text-zinc-300 dark:text-zinc-700' : 'text-zinc-500 dark:text-zinc-400'}`}>
                          {opt.hint}
                        </span>
                      </button>
                    ))}
                  </div>

                  {form.keyStatus === 'construction' && (
                    <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-[11px] text-amber-900 dark:text-amber-200 mt-2 flex items-start gap-2 leading-relaxed">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        <b>Выезд замерщика на строящийся объект невозможен.</b> Инженер проведет детальную консультацию по планировке онлайн и зафиксирует за вами цену сметы со скидкой!
                      </span>
                    </div>
                  )}
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Ваше имя (не никнейм)
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      placeholder="Например: Алексей, Михаил"
                      value={form.name}
                      onChange={(e) => {
                        setError('');
                        setForm({ ...form, name: e.target.value });
                      }}
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                    />
                  </div>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
                    Укажите настоящее имя для обращения мастера
                  </p>
                  {tgUsername ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-[11px] text-blue-800 dark:text-blue-300 mt-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>
                        Telegram-аккаунт <b className="font-mono">{tgUsername}</b> будет прикреплён к заявке
                      </span>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3 text-blue-500" />
                        Ник в Telegram для связи (например: @ivan_remont)
                      </label>
                      <input
                        type="text"
                        placeholder="@username"
                        value={manualTgUsername}
                        onChange={(e) => setManualTgUsername(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  )}
                </div>

                {/* Phone & Native Verification */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Телефон для связи
                    </label>
                    <button
                      type="button"
                      onClick={handleRequestTelegramContact}
                      className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      📱 Заполнить из Telegram
                    </button>
                  </div>
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

                {/* Address & Geo-Validation */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                      Адрес объекта или ЖК
                    </span>
                    <span className="text-[10px] text-zinc-400 font-normal">
                      Зона: {company.serviceRadius || `г. ${company.city}`}
                    </span>
                  </label>
                  <input
                    type="text"
                    placeholder="г. Москва, ЖК «Скандинавия», кв. 42"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                  />
                  {form.address && company.city && !form.address.toLowerCase().includes(company.city.toLowerCase().slice(0, 4)) && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 leading-tight">
                      📍 Выезд за пределы основной зоны ({company.city}) согласовывается индивидуально.
                    </p>
                  )}
                </div>

                {/* Preferred Date (Only if keyStatus === 'ready') */}
                {form.keyStatus === 'ready' && (
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                      Желаемый день для выезда замерщика
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
                )}

                {/* Communication channel */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-zinc-500" />
                    Куда прислать подтверждение и смету
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'telegram', label: '✈️ Telegram' },
                      { id: 'call', label: '📞 Телефонный звонок' },
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
                      Согласен на обработку данных по{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          triggerHaptic('light');
                          setShowPrivacyModal(true);
                        }}
                        className="underline text-zinc-700 dark:text-zinc-300 font-medium cursor-pointer"
                      >
                        152-ФЗ
                      </button>
                      {' '}и условиями{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          triggerHaptic('light');
                          setShowOfferModal(true);
                        }}
                        className="underline text-zinc-700 dark:text-zinc-300 font-medium cursor-pointer"
                      >
                        публичной оферты
                      </button>
                    </span>
                  </label>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 px-4 bg-zinc-900 hover:bg-black text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100 rounded-xl font-semibold text-sm shadow-md transition active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none mt-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Отправка данных...</span>
                    </>
                  ) : (
                    <>
                      <span>
                        {form.keyStatus === 'ready'
                          ? 'Зафиксировать смету и записаться на замер'
                          : 'Зафиксировать скидку и получить консультацию'}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                {/* 152-ФЗ: Согласие, ссылка на документ и оператор прямо под кнопкой */}
                <div className="mt-3 text-center px-1 space-y-1">
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                    Нажимая кнопку, вы даете согласие на обработку персональных данных в соответствии с{' '}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        triggerHaptic('light');
                        setShowPrivacyModal(true);
                      }}
                      className="underline text-zinc-800 dark:text-zinc-200 font-medium hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                    >
                      Политикой конфиденциальности (152-ФЗ)
                    </button>
                    {' '}и условиями{' '}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        triggerHaptic('light');
                        setShowOfferModal(true);
                      }}
                      className="underline text-zinc-800 dark:text-zinc-200 font-medium hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                    >
                      публичной оферты
                    </button>
                    .
                  </p>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                    Оператор: Самозанятый Кострикин Алексей Алексеевич • ИНН 711380053758
                  </p>
                </div>
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

      {showOfferModal && (
        <PublicOfferModal
          companyName={company.name}
          onClose={() => setShowOfferModal(false)}
        />
      )}
    </>
  );
};

