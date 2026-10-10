import React, { useState } from 'react';
import { Moon, Sun, SlidersHorizontal } from 'lucide-react';
import { CompanyConfig } from '../types';
import { triggerHaptic } from '../utils/telegram';
import { isSuperAdminUser } from '../utils/auth';
import { AvatarDownloadModal } from './AvatarDownloadModal';

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
  company: CompanyConfig;
  onOpenAdmin?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isDark,
  onToggleTheme,
  company,
  onOpenAdmin,
}) => {
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const isSuperAdmin = isSuperAdminUser();

  return (
    <>
      <header className="px-4 py-2.5 flex items-center justify-between border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md sticky top-0 z-30 transition-colors">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setIsAvatarModalOpen(true);
            }}
            title="Нажмите, чтобы просмотреть и скачать аватарку бота"
            className="w-8 h-8 rounded-lg overflow-hidden shrink-0 shadow-xs border border-zinc-200/60 dark:border-zinc-800 bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center font-bold text-sm cursor-pointer hover:scale-105 active:scale-95 transition-transform"
          >
            <img
              src="/bot_avatar.jpg"
              alt={company.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => {
                // Graceful fallback to initial letter
                e.currentTarget.style.display = 'none';
              }}
            />
            <span className="hidden only:block">{company.logoLetter || company.name.charAt(0) || 'Р'}</span>
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="text-sm font-bold text-zinc-950 dark:text-white leading-tight">
                {company.name}
              </h1>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium shrink-0">
                · {company.city}
              </span>
              {company.phone && (
                <a
                  href={`tel:${company.phone.replace(/[^0-9+]/g, '')}`}
                  className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 hover:underline shrink-0"
                  title="Позвонить компании"
                >
                  · {company.phone}
                </a>
              )}
            </div>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-300 font-medium leading-tight mt-0.5">
              Калькулятор ремонта под ключ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {isSuperAdmin && onOpenAdmin && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onOpenAdmin();
              }}
              title="Открыть Панель управления (доступно только владельцу)"
              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Бот & БД</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onToggleTheme();
            }}
            aria-label="Сменить тему"
            className="w-8 h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 flex items-center justify-center transition shrink-0"
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-500" />
            ) : (
              <Moon className="w-4 h-4 text-zinc-800" />
            )}
          </button>
        </div>
      </header>

      <AvatarDownloadModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
        botUsername={company.botUsername}
      />
    </>
  );
};
