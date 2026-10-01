import { useState } from 'react';
import {
  Send,
  Users,
  CheckCircle,
  Bot,
  Info,
} from 'lucide-react';
import { TenantCompany } from '../../types/admin';

interface TelegramBroadcastProps {
  companies: TenantCompany[];
  onBroadcastSuccess: (info: { segment: string; count: number }) => void;
}

export function TelegramBroadcast({
  companies,
  onBroadcastSuccess,
}: TelegramBroadcastProps) {
  const [segment, setSegment] = useState<'all' | 'active' | 'trial' | 'expiring_3d'>('all');
  const [messageText, setMessageText] = useState(
    'Здравствуйте, {name}! 🏗️\n\nМы обновили каталог расценок по ГОСТ в вашем калькуляторе. Теперь клиенты могут исключать работы со стяжкой и штукатуркой в один клик.\n\nПроверьте работу в вашем боте и запустите рекламу прямо сейчас!'
  );
  const [buttonText, setButtonText] = useState('Открыть калькулятор');
  const [buttonUrl, setButtonUrl] = useState('https://t.me/remont_pro_bot');
  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  const targetCount = (() => {
    switch (segment) {
      case 'all':
        return companies.length;
      case 'active':
        return companies.filter((c) => c.subscriptionStatus === 'active').length;
      case 'trial':
        return companies.filter((c) => c.subscriptionStatus === 'trial').length;
      case 'expiring_3d':
        return companies.filter((c) => c.daysLeft <= 3 && c.subscriptionStatus === 'active').length;
      default:
        return companies.length;
    }
  })();

  const handleSend = () => {
    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      setSentSuccess(true);
      onBroadcastSuccess({
        segment,
        count: targetCount,
      });
      setTimeout(() => setSentSuccess(false), 5000);
    }, 1200);
  };

  const previewFormatted = messageText
    .replace(/{name}/g, 'Алексей (РемонтПро)')
    .replace(/{days_left}/g, '14');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-base font-bold text-zinc-950 dark:text-white uppercase tracking-wider flex items-center gap-2">
          <span>Рассылка по строительным компаниям</span>
          <span className="text-[10px] px-2 py-0.5 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-extrabold normal-case">
            Мастер-бот Telegram
          </span>
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Мгновенная отправка сервисных уведомлений и акций прорабам в чаты @RemontMaster_bot.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Form */}
        <div className="lg:col-span-7 space-y-3">
          {/* Segment Selector */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[11px] font-bold text-zinc-950 dark:text-white uppercase tracking-wider">
                Сегмент получателей
              </span>
              <span className="text-xs font-extrabold text-zinc-950 dark:text-white">
                {targetCount} получателей
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setSegment('all')}
                className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                  segment === 'all'
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 border-zinc-900 dark:border-white shadow-xs'
                    : 'bg-zinc-50 dark:bg-zinc-800/80 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700'
                }`}
              >
                <div className="font-bold">Все компании</div>
                <div className="text-[11px] opacity-70">Все СК платформы ({companies.length})</div>
              </button>

              <button
                type="button"
                onClick={() => setSegment('active')}
                className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                  segment === 'active'
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 border-zinc-900 dark:border-white shadow-xs'
                    : 'bg-zinc-50 dark:bg-zinc-800/80 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700'
                }`}
              >
                <div className="font-bold">Только активные</div>
                <div className="text-[11px] opacity-70">Оплаченная подписка</div>
              </button>

              <button
                type="button"
                onClick={() => setSegment('trial')}
                className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                  segment === 'trial'
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 border-zinc-900 dark:border-white shadow-xs'
                    : 'bg-zinc-50 dark:bg-zinc-800/80 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700'
                }`}
              >
                <div className="font-bold">Только триал (3 лида)</div>
                <div className="text-[11px] opacity-70">Тестирующие платформу</div>
              </button>

              <button
                type="button"
                onClick={() => setSegment('expiring_3d')}
                className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                  segment === 'expiring_3d'
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 border-zinc-900 dark:border-white shadow-xs'
                    : 'bg-zinc-50 dark:bg-zinc-800/80 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700'
                }`}
              >
                <div className="font-bold">Истекают через 3 дня</div>
                <div className="text-[11px] opacity-70">Напоминание о продлении</div>
              </button>
            </div>
          </div>

          {/* Text Editor */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[11px] font-bold text-zinc-950 dark:text-white uppercase tracking-wider">
                Текст сообщения
              </span>
              <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                <span>Переменные:</span>
                <button
                  type="button"
                  onClick={() => setMessageText((prev) => prev + ' {name}')}
                  className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-bold hover:bg-zinc-200"
                >
                  {'{name}'}
                </button>
                <button
                  type="button"
                  onClick={() => setMessageText((prev) => prev + ' {days_left}')}
                  className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-bold hover:bg-zinc-200"
                >
                  {'{days_left}'}
                </button>
              </div>
            </div>

            <textarea
              rows={5}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Введите текст рассылки..."
              className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none leading-relaxed font-sans"
            />

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 mb-1 block uppercase">Текст кнопки:</label>
                <input
                  type="text"
                  value={buttonText}
                  onChange={(e) => setButtonText(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 mb-1 block uppercase">URL кнопки:</label>
                <input
                  type="text"
                  value={buttonUrl}
                  onChange={(e) => setButtonUrl(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <Info className="w-3.5 h-3.5 text-zinc-400" />
                <span>Отправка через API Telegram (30 сообщ./сек)</span>
              </div>

              <button
                type="button"
                disabled={isSending || targetCount === 0}
                onClick={handleSend}
                className="py-2 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-bold text-xs transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSending ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white dark:border-zinc-950 border-t-transparent rounded-full animate-spin" />
                    <span>Отправка...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Запустить ({targetCount})</span>
                  </>
                )}
              </button>
            </div>

            {sentSuccess && (
              <div className="p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                <span>Рассылка успешно доставлена {targetCount} компаниям!</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Preview */}
        <div className="lg:col-span-5">
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-2">
            <div className="flex items-center justify-between pb-1 border-b border-zinc-200 dark:border-zinc-800">
              <span className="text-[11px] font-bold text-zinc-950 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-zinc-500" />
                <span>Предпросмотр в Telegram</span>
              </span>
              <span className="text-[10px] text-zinc-400">iOS / Android preview</span>
            </div>

            <div className="p-3 rounded-lg bg-[#0f141c] min-h-[320px] flex flex-col justify-end relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 p-2 bg-[#17212b] border-b border-[#242f3d] flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-zinc-100 text-zinc-950 text-[10px] font-extrabold flex items-center justify-center">
                  M
                </div>
                <div>
                  <div className="text-[11px] font-bold text-white leading-tight">
                    Remont Master Platform
                  </div>
                  <div className="text-[9px] text-[#6ab2f2]">бот</div>
                </div>
              </div>

              <div className="mt-8 max-w-[90%] self-start bg-[#182533] border border-[#2b5278]/40 rounded-xl p-3 shadow-xs">
                <p className="text-xs text-zinc-100 whitespace-pre-wrap leading-relaxed font-sans">
                  {previewFormatted}
                </p>
                <div className="text-right text-[10px] text-zinc-400 mt-1">12:44</div>

                {buttonText && (
                  <div className="mt-2 pt-2 border-t border-[#2b5278]/50">
                    <div className="w-full py-1.5 bg-[#2b5278]/60 text-center text-xs font-bold text-[#6ab2f2] rounded-md">
                      {buttonText}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
