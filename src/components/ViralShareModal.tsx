import React, { useState, useEffect } from 'react';
import {
  X,
  Share2,
  Users,
  Building2,
  Copy,
  Check,
  Send,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Bot,
  Edit2,
} from 'lucide-react';
import { CompanyConfig, CalculationResult, RenovationClass } from '../types';
import {
  formatCurrency,
  openTelegramShare,
  copyTextToClipboard,
  triggerHaptic,
  getDetectedBotUsername,
  cleanTelegramBotUsername,
  buildCompanyBotUrl,
} from '../utils/telegram';

interface ViralShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: CompanyConfig;
  result: CalculationResult;
  selectedClass: RenovationClass;
  savings: number;
}

export const ViralShareModal: React.FC<ViralShareModalProps> = ({
  isOpen,
  onClose,
  company,
  result,
  selectedClass,
  savings,
}) => {
  const [activeTab, setActiveTab] = useState<'family' | 'community'>('family');
  const [jkName, setJkName] = useState<string>('ЖК Скандинавия');
  const [copied, setCopied] = useState<boolean>(false);

  // Юзернейм Telegram-бота компании, в котором производился расчёт
  const [botUsername, setBotUsername] = useState<string>(() =>
    getDetectedBotUsername(company.botUsername, company.id)
  );
  const [isEditingBot, setIsEditingBot] = useState<boolean>(false);
  const [botInputVal, setBotInputVal] = useState<string>('');

  // Синхронизируем юзернейм бота при смене компании
  useEffect(() => {
    const detected = getDetectedBotUsername(company.botUsername, company.id);
    setBotUsername(detected);
  }, [company.botUsername, company.id]);

  if (!isOpen) return null;

  const handleSaveBot = () => {
    const cleaned = cleanTelegramBotUsername(botInputVal);
    if (cleaned) {
      setBotUsername(cleaned);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('remont_bot_username', cleaned);
        } catch {
          // ignore
        }
      }
      triggerHaptic('success');
    }
    setIsEditingBot(false);
  };

  // Прямая ссылка строго на бота компании с параметрами расчета (для старта диалога с ботом)
  const companyBotUrl = buildCompanyBotUrl(
    botUsername,
    result.area,
    selectedClass.id,
    company.id
  );

  // Текст для отправки (Механика 1: Семейный совет / Поделиться)
  const savingsPart = savings > 0 ? ` (сэкономили ${formatCurrency(savings)} на исключении лишних позиций)` : '';
  const familyText = `Посмотри предварительную смету нашего ремонта: ${formatCurrency(result.totalCost)} на ${result.area} м² (тариф «${selectedClass.title}»)${savingsPart}. Я проверил расценки по ГОСТ без скрытых доплат в боте «${company.name}» (@${botUsername}). Посмотри интерактивный расклад и скажи, что думаешь:`;

  // Текст для чата ЖК (Механика 3: Посев в чаты новостроек)
  const communityText = `Соседи из ${jkName.trim() || 'нашего ЖК'}! Посчитал в сметном боте @${botUsername} («${company.name}») реальную стоимость ремонта на типовую квартиру ${result.area} м² по действующим расценкам 2026 года. Стяжка, стены по маякам, электрика по ГОСТу — вышло ~${formatCurrency(result.totalCost)} (без накруток за бренд и без скрытых доплат). Кому актуально прицениться к отделке — вот открытый интерактивный расклад:`;

  const currentText = activeTab === 'family' ? familyText : communityText;

  const handleNativeShare = () => {
    triggerHaptic('medium');
    openTelegramShare(companyBotUrl, currentText);
  };

  const handleCopy = async () => {
    const fullMessage = `${currentText}\n\n👉 Открыть расчет в Telegram-боте компании:\n${companyBotUrl}`;
    const success = await copyTextToClipboard(fullMessage);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center font-bold">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-zinc-950 dark:text-white leading-tight">
                Поделиться интерактивной сметой
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Нативный шеринг в 1 клик через Telegram
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-800">
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-200/70 dark:bg-zinc-800 rounded-xl">
            <button
              onClick={() => {
                triggerHaptic('light');
                setActiveTab('family');
              }}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'family'
                  ? 'bg-white text-zinc-950 dark:bg-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>👨‍👩‍👧 Супругу / партнеру</span>
            </button>
            <button
              onClick={() => {
                triggerHaptic('light');
                setActiveTab('community');
              }}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'community'
                  ? 'bg-white text-zinc-950 dark:bg-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>🏢 В чат своего ЖК</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-4">
          {activeTab === 'family' ? (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
                <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300 font-bold text-xs mb-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Семейный совет (согласование ремонта)</span>
                </div>
                <p className="text-[11px] text-blue-900/80 dark:text-blue-200/80 leading-relaxed">
                  Ремонт выбирается вместе! Отправьте партнеру интерактивную смету вместо кривых скриншотов. Партнер сможет открыть живой калькулятор с вашими параметрами.
                </p>
              </div>

              {/* Estimate Preview Pill */}
              <div className="bg-zinc-50 dark:bg-zinc-800/60 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700/60">
                <div className="flex justify-between items-center text-xs text-zinc-500 dark:text-zinc-400 pb-1.5 border-b border-zinc-200/60 dark:border-zinc-700/60">
                  <span>Объект: {result.area} м² ({selectedClass.title})</span>
                  <span className="font-bold text-zinc-950 dark:text-white">{formatCurrency(result.totalCost)}</span>
                </div>
                {savings > 0 && (
                  <div className="flex justify-between items-center text-[11px] text-emerald-600 dark:text-emerald-400 pt-1.5">
                    <span>Сэкономлено на оптимизации:</span>
                    <span className="font-bold">-{formatCurrency(savings)}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50">
                <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-bold text-xs mb-1">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Экспертный отзыв для соседей без бана и спама</span>
                </div>
                <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
                  Прямая реклама в чатах жильцов удаляется за 1 секунду. Экспертный пост с реальными цифрами за м² воспринимается соседями как полезный контент.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Название вашего жилого комплекса:
                </label>
                <input
                  type="text"
                  value={jkName}
                  onChange={(e) => setJkName(e.target.value)}
                  placeholder="Например: ЖК Скандинавия, ЖК Зиларт..."
                  className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                />
              </div>
            </div>
          )}

          {/* Generated Message Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Текст сообщения в Telegram:
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <div className="w-4 h-4 rounded-full overflow-hidden border border-emerald-500/40 shrink-0">
                    <img
                      src="/src/assets/images/bot_avatar_1790670298956.jpg"
                      alt="Bot Avatar"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <span>Бот:</span>
                  <span className="font-mono font-bold">@{botUsername}</span>
                </span>
                {!isEditingBot ? (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setBotInputVal(botUsername);
                      setIsEditingBot(true);
                    }}
                    className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
                    title="Изменить юзернейм бота"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                ) : null}
              </div>
            </div>

            {/* Быстрый редактор юзернейма бота (если прораб хочет указать другой свой бот) */}
            {isEditingBot && (
              <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 flex items-center gap-2 animate-in fade-in">
                <span className="text-xs font-mono font-bold text-zinc-500">@</span>
                <input
                  type="text"
                  value={botInputVal}
                  onChange={(e) => setBotInputVal(e.target.value)}
                  placeholder="юзернейм_бота (например stroy_bot)"
                  className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-zinc-900 dark:text-white font-mono focus:outline-hidden focus:ring-1 focus:ring-zinc-900"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveBot}
                  className="px-2.5 py-1 bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 rounded-lg text-xs font-bold"
                >
                  ОК
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingBot(false)}
                  className="p-1 text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed border border-zinc-200 dark:border-zinc-700 select-all font-sans">
              <p className="whitespace-pre-line">{currentText}</p>
              <div className="mt-2.5 pt-2.5 border-t border-zinc-200 dark:border-zinc-700 flex flex-col gap-1">
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold uppercase">
                  Прямая ссылка на бота компании:
                </span>
                <span className="text-[11px] text-blue-600 dark:text-blue-400 break-all font-mono font-bold">
                  {companyBotUrl}
                </span>
              </div>
            </div>

            {/* Поясняющая плашка: ссылка на бота, а не на мини-апп */}
            <div className="p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-emerald-900 dark:text-emerald-200 leading-snug">
                <b>Защита лида:</b> отправляется ссылка именно на бота компании <code>@{botUsername}</code> (а не на мини-приложение). Получатель переходит в диалог с ботом, нажимает «Старт» и навсегда фиксируется как ваш лид в Telegram.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col gap-2">
          <button
            onClick={handleNativeShare}
            className="w-full py-3 px-4 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-zinc-800 dark:hover:bg-zinc-100 active:scale-[0.98] transition-all shadow-md"
          >
            <Send className="w-4 h-4" />
            <span>
              {activeTab === 'family'
                ? 'Отправить супругу / партнеру в Telegram'
                : 'Отправить в чат своего ЖК'}
            </span>
          </button>

          <button
            onClick={handleCopy}
            className="w-full py-2.5 px-4 rounded-xl bg-zinc-200/80 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-bold text-xs flex items-center justify-center gap-2 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-600 dark:text-emerald-400">Текст и ссылка скопированы!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Скопировать готовый текст с ссылкой</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
