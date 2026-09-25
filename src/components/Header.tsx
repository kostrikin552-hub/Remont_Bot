import React, { useState } from 'react';
import { ShieldCheck, Moon, Sun, MapPin, ChevronDown, Check, Building, Phone } from 'lucide-react';
import { CompanyConfig } from '../types';
import { triggerHaptic } from '../utils/telegram';
import { DEMO_COMPANIES } from '../lib/supabase';

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
  company: CompanyConfig;
  onSelectCompanyId?: (companyId: string) => void;
  isFromSupabase?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  isDark,
  onToggleTheme,
  company,
  onSelectCompanyId,
  isFromSupabase = false,
}) => {
  const [tenantModalOpen, setTenantModalOpen] = useState(false);

  return (
    <header className="pt-2 pb-3 px-4 transition-colors">
      {/* Top row: Brand & Status & Theme Toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-black text-lg shadow-md shadow-blue-500/20 shrink-0">
            {company.logoLetter || 'Р'}
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {company.name}
              </h1>
              {company.badgeText && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                  {company.badgeText}
                </span>
              )}
              {isFromSupabase && (
                <span className="inline-flex items-center px-1 py-0.2 rounded text-[9px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                  Supabase DB
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {company.subtitle || 'Калькулятор ремонта квартир'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Quick Company switcher modal toggle */}
          <button
            onClick={() => {
              triggerHaptic('light');
              setTenantModalOpen(true);
            }}
            title="Сменить компанию (Мультитенант)"
            className="w-9 h-9 rounded-xl bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center transition-transform active:scale-90 hover:bg-slate-300/80 dark:hover:bg-slate-700"
          >
            <Building className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          </button>

          {/* Theme Toggle */}
          <button
            onClick={() => {
              triggerHaptic('light');
              onToggleTheme();
            }}
            aria-label="Переключить тему"
            className="w-9 h-9 rounded-xl bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center transition-transform active:scale-90 hover:bg-slate-300/80 dark:hover:bg-slate-700"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>
        </div>
      </div>

      {/* Second row: Status badge & City & Phone info */}
      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap text-xs">
        {/* Status: dynamic from company config */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-semibold shadow-xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <ShieldCheck className="w-3.5 h-3.5 inline text-emerald-600 dark:text-emerald-400" />
          <span>{company.statusText || 'Работаем без предоплаты'}</span>
        </div>

        {/* City Badge Button */}
        <button
          onClick={() => {
            triggerHaptic('light');
            setTenantModalOpen(true);
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-200/80 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-300/80 dark:hover:bg-slate-700 transition active:scale-95 border border-slate-300/40 dark:border-slate-700/50"
        >
          <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>{company.city}</span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>
      </div>

      {/* Multi-tenant Company Switcher Modal */}
      {tenantModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center sm:justify-center p-0 sm:p-4"
          onClick={() => setTenantModalOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-200 text-slate-900 dark:text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4 sm:hidden" />

            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Мультитенантность компании
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Выберите компанию или передайте ID в URL: <code className="text-blue-500">?company_id=...</code>
                </p>
              </div>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {Object.entries(DEMO_COMPANIES).map(([id, item]) => {
                const isSelected = company.id === id;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      triggerHaptic('selection');
                      if (onSelectCompanyId) {
                        onSelectCompanyId(id);
                      }
                      setTenantModalOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500/80 text-blue-600 dark:text-blue-300'
                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/70 dark:border-slate-700/60 text-slate-800 dark:text-slate-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-black flex items-center justify-center text-sm shadow-xs">
                        {item.company.logoLetter}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            {item.company.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 font-mono text-slate-600 dark:text-slate-300">
                            {id}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>{item.company.city}</span>
                          <span>•</span>
                          <span className="flex items-center gap-0.5">
                            <Phone className="w-3 h-3" />
                            {item.company.phone}
                          </span>
                        </div>
                      </div>
                    </div>
                    {isSelected && <Check className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />}
                  </button>
                );
              })}
            </div>

            <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500 leading-tight">
              В Telegram боте переход осуществляется по ссылке с параметром: <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">t.me/your_bot?startapp={company.id}</code>
            </p>

            <button
              onClick={() => setTenantModalOpen(false)}
              className="mt-4 w-full py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-medium text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
