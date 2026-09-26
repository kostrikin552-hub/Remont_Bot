import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { CompanyConfig } from '../types';
import { triggerHaptic } from '../utils/telegram';

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
  company: CompanyConfig;
}

export const Header: React.FC<HeaderProps> = ({
  isDark,
  onToggleTheme,
  company,
}) => {
  return (
    <header className="pt-3 pb-3 px-4 transition-colors">
      <div className="flex items-center justify-between gap-3">
        {/* Architectural Brand Identity */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center font-bold text-base tracking-tight shrink-0 shadow-sm">
            {company.logoLetter || company.name.charAt(0) || 'Р'}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white leading-none">
                {company.name}
              </h1>
              {company.city && (
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  {company.city}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 font-normal">
              {company.subtitle || 'Инженерный расчет стоимости ремонта'}
            </p>
          </div>
        </div>

        {/* Minimal Theme Switcher */}
        <button
          onClick={() => {
            triggerHaptic('light');
            onToggleTheme();
          }}
          aria-label="Сменить тему оформления"
          className="w-9 h-9 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 flex items-center justify-center transition-transform active:scale-95 shrink-0"
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-zinc-700" />
          )}
        </button>
      </div>

      {/* Quiet Trust Bar */}
      <div className="mt-3.5 pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 font-medium tracking-tight">
        <span>Договор и фиксация сметы</span>
        <span className="text-zinc-300 dark:text-zinc-700">·</span>
        <span>Оплата после приёмки</span>
        <span className="text-zinc-300 dark:text-zinc-700">·</span>
        <span>Выезд 0 ₽</span>
      </div>
    </header>
  );
};
