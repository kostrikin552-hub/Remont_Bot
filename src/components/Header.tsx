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
    <header className="px-4 py-2.5 flex items-center justify-between border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md sticky top-0 z-30 transition-colors">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
          {company.logoLetter || company.name.charAt(0) || 'Р'}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="text-sm font-bold text-zinc-950 dark:text-white truncate leading-none">
              {company.name}
            </h1>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium shrink-0">
              · {company.city}
            </span>
          </div>
          <p className="text-[11px] text-zinc-600 dark:text-zinc-300 font-medium leading-none mt-1">
            Калькулятор ремонта под ключ
          </p>
        </div>
      </div>

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
    </header>
  );
};
