import React from 'react';
import {
  Building2,
  CheckCircle2,
  X,
  Bot,
  Phone,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';

export interface CompanyOption {
  id: string;
  name: string;
  city: string;
  phone: string;
  botUsername: string;
  statusText: string;
  badge?: string;
  highlight?: boolean;
  prices: {
    cosmetic: number;
    capital: number;
    designer: number;
    designProject?: number;
  };
  guaranteeText?: string;
  foreman?: string;
}

export const PRESET_COMPANIES: CompanyOption[] = [
  {
    id: 'petrishin-stroy',
    name: 'Петришин-Строй',
    city: 'Москва и МО',
    phone: '+7 (495) 105-95-24',
    botUsername: 'petrishinstroy_bot',
    statusText: 'Гарантия 5 лет на инженерию · Без предоплаты',
    badge: 'Официальный прайс 2026',
    highlight: true,
    foreman: 'Сергей Петришин',
    guaranteeText: '5 лет на инженерные сети, 2 года на отделку',
    prices: {
      cosmetic: 4500,
      capital: 8900,
      designer: 15500,
      designProject: 2799,
    },
  },
  {
    id: 'remont-pro',
    name: 'РемонтПро',
    city: 'Москва и МО',
    phone: '+7 (495) 120-00-50',
    botUsername: 'cuberlife_bot',
    statusText: 'Работаем без предоплаты',
    badge: 'PRO',
    foreman: 'Александр Волков',
    guaranteeText: '3 года гарантии по договору',
    prices: {
      cosmetic: 4500,
      capital: 8500,
      designer: 15000,
      designProject: 2000,
    },
  },
  {
    id: 'omon',
    name: 'ОМОН',
    city: 'Рязань и область',
    phone: '+7 (920) 953-45-00',
    botUsername: 'omonremont_bot',
    statusText: 'Оплата по акту приемки · Без предоплаты',
    badge: 'PRO',
    foreman: 'Алексей Кострикин',
    guaranteeText: 'Поэтапная приемка скрытых работ',
    prices: {
      cosmetic: 4200,
      capital: 7900,
      designer: 13500,
      designProject: 1800,
    },
  },
  {
    id: 'brigadealexey',
    name: 'Бригада Алексея',
    city: 'Москва и область',
    phone: '+7 (926) 314-55-20',
    botUsername: 'brigadealexey_bot',
    statusText: 'Договор и гарантия 3 года',
    badge: 'PRO',
    foreman: 'Алексей Смирнов',
    guaranteeText: 'Гарантия 3 года на общестроительные работы',
    prices: {
      cosmetic: 4500,
      capital: 8500,
      designer: 15000,
      designProject: 2000,
    },
  },
  {
    id: 'atlon',
    name: 'Студия ремонта Атлонфм',
    city: 'Санкт-Петербург и ЛО',
    phone: '+7 (812) 385-75-75',
    botUsername: 'atlonbot_bot',
    statusText: 'Гарантия качества по ГОСТ',
    badge: 'Премиум',
    foreman: 'Денис АтлонФМ',
    guaranteeText: 'Премиальная отделка по ГОСТ и СП',
    prices: {
      cosmetic: 4400,
      capital: 8200,
      designer: 14500,
      designProject: 1900,
    },
  },
];

interface CompanySelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCompanyId: string;
  onSelectCompany: (companyId: string) => void;
  customCompanies?: Array<{
    id: string;
    name: string;
    city: string;
    foremanPhone?: string;
    botUsername?: string;
  }>;
}

export const CompanySelectorModal: React.FC<CompanySelectorModalProps> = ({
  isOpen,
  onClose,
  activeCompanyId,
  onSelectCompany,
  customCompanies = [],
}) => {
  if (!isOpen) return null;

  // Merge preset companies with any extra custom companies from database
  const allCompanies: CompanyOption[] = [...PRESET_COMPANIES];

  customCompanies.forEach((cc) => {
    const cleanId = cc.id.toLowerCase();
    const cleanBot = (cc.botUsername || '').replace(/^@/, '').toLowerCase();
    const alreadyExists = allCompanies.some(
      (p) =>
        p.id.toLowerCase() === cleanId ||
        p.botUsername.toLowerCase() === cleanBot ||
        p.name.toLowerCase() === cc.name.toLowerCase()
    );
    if (!alreadyExists) {
      allCompanies.push({
        id: cc.id,
        name: cc.name,
        city: cc.city || 'Москва',
        phone: cc.foremanPhone || '+7 (495) 000-00-00',
        botUsername: cleanBot || 'remont_pro_bot',
        statusText: 'Фиксированная цена по смете',
        badge: 'Клиентский бот',
        prices: {
          cosmetic: 4500,
          capital: 8500,
          designer: 15000,
          designProject: 2000,
        },
      });
    }
  });

  const handleChoose = (companyId: string) => {
    triggerHaptic('medium');
    onSelectCompany(companyId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-4 sm:p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto font-['Manrope',sans-serif]">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-zinc-950 dark:text-white">
                Выбор подрядчика и Telegram-бота
              </h2>
              <p className="text-[11px] text-zinc-500">
                Смета, цены и контакты инженера мгновенно адаптируются
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="w-7 h-7 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Company Cards List */}
        <div className="space-y-2.5">
          {allCompanies.map((c) => {
            const isActive =
              activeCompanyId.toLowerCase() === c.id.toLowerCase() ||
              activeCompanyId.toLowerCase().includes(c.botUsername.toLowerCase());

            return (
              <div
                key={c.id}
                onClick={() => handleChoose(c.id)}
                className={`p-3.5 rounded-xl border transition cursor-pointer relative ${
                  isActive
                    ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 shadow-xs ring-1 ring-blue-500/30'
                    : c.highlight
                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/20 dark:bg-emerald-950/10 hover:border-emerald-400'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-extrabold text-xs sm:text-sm text-zinc-950 dark:text-white">
                        {c.name}
                      </span>
                      {c.badge && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                            c.highlight
                              ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                          }`}
                        >
                          {c.badge}
                        </span>
                      )}
                      {isActive && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-blue-500 text-white flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>Выбран</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 flex-wrap">
                      <span>{c.city}</span>
                      <span>·</span>
                      <span className="font-mono text-blue-600 dark:text-blue-400 font-bold flex items-center gap-0.5">
                        <Bot className="w-3 h-3" />
                        @{c.botUsername}
                      </span>
                      {c.foreman && (
                        <>
                          <span>·</span>
                          <span>{c.foreman}</span>
                        </>
                      )}
                    </div>

                    {c.guaranteeText && (
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-300 mt-1 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>{c.guaranteeText}</span>
                      </p>
                    )}

                    {/* Price rates pill grid */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 text-[10px]">
                      <div className="p-1 rounded bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-center">
                        <span className="text-zinc-400 block text-[9px]">Косметика:</span>
                        <b className="text-zinc-900 dark:text-zinc-100">{c.prices.cosmetic} ₽</b>
                      </div>
                      <div className="p-1 rounded bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-center">
                        <span className="text-zinc-400 block text-[9px]">Капитальный:</span>
                        <b className="text-blue-600 dark:text-blue-400">{c.prices.capital} ₽</b>
                      </div>
                      <div className="p-1 rounded bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-center">
                        <span className="text-zinc-400 block text-[9px]">Дизайнерский:</span>
                        <b className="text-purple-600 dark:text-purple-400">{c.prices.designer} ₽</b>
                      </div>
                      {c.prices.designProject && (
                        <div className="p-1 rounded bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-center col-span-3 sm:col-span-1">
                          <span className="text-zinc-400 block text-[9px]">Проект:</span>
                          <b className="text-emerald-600 dark:text-emerald-400">{c.prices.designProject} ₽</b>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center pt-1">
                    <ChevronRight className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-zinc-400'}`} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info banner */}
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs">
          <span className="text-[11px] text-zinc-500">
            Мультитенантная платформа Telegram Mini App
          </span>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-bold text-xs transition cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
