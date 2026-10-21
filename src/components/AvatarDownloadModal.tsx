import React from 'react';
import { X, Download, ExternalLink, Bot, CheckCircle2, Sparkles } from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';

interface AvatarDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  botUsername?: string;
}

export const AvatarDownloadModal: React.FC<AvatarDownloadModalProps> = ({
  isOpen,
  onClose,
  botUsername = 'remont_pro_bot',
}) => {
  if (!isOpen) return null;

  const avatarUrl = '/bot_avatar.jpg';

  const handleDownload = () => {
    triggerHaptic('success');
    const link = document.createElement('a');
    link.href = avatarUrl;
    link.download = 'remont_bot_avatar.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-zinc-950 dark:text-white leading-tight">
                Аватарка Telegram-бота
              </h3>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                Премиальный 3D-логотип 1:1
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col items-center text-center">
          {/* Circular Telegram Crop Preview */}
          <div className="relative group">
            <div className="w-36 h-36 rounded-full overflow-hidden border-4 border-amber-500/40 shadow-xl bg-zinc-950 flex items-center justify-center ring-4 ring-zinc-950/10 dark:ring-white/10">
              <img
                src={avatarUrl}
                alt="Telegram Bot Avatar Preview"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md border-2 border-white dark:border-zinc-900">
              <Bot className="w-4 h-4" />
            </div>
          </div>

          <span className="mt-3 text-xs font-mono font-bold text-zinc-700 dark:text-zinc-300">
            @{botUsername}
          </span>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Так аватарка выглядит в кружке чата Telegram
          </span>

          {/* Action Buttons */}
          <div className="w-full mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="w-full py-2.5 px-4 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 hover:bg-zinc-800 dark:hover:bg-zinc-100 active:scale-[0.98] transition shadow-md"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Скачать аватарку (.jpg)</span>
            </button>

            <a
              href={avatarUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition"
            >
              <ExternalLink className="w-3 h-3 text-zinc-400" />
              <span>Открыть оригинал в новой вкладке</span>
            </a>
          </div>

          {/* How to install in BotFather */}
          <div className="w-full mt-4 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200/70 dark:border-zinc-700/60 text-left">
            <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 mb-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Как установить в @BotFather:
            </span>
            <ol className="text-[10px] text-zinc-600 dark:text-zinc-400 space-y-1 list-decimal list-inside leading-tight font-sans">
              <li>Откройте бота <b>@BotFather</b> в Telegram</li>
              <li>Отправьте команду <code>/setuserpic</code></li>
              <li>Выберите вашего бота из списка</li>
              <li>Прикрепите и отправьте скачанный файл</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};
