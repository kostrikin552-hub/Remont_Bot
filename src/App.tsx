import { useState, useEffect, useMemo } from 'react';
import {
  PropertyType,
  RenovationClass,
  RenovationClassId,
  AdditionalOption,
  CalculationResult,
  CompanyConfig,
  PricingRules,
} from './types';
import { Header } from './components/Header';
import { PropertyTypeSelector } from './components/PropertyTypeSelector';
import { AreaSlider } from './components/AreaSlider';
import { RenovationClassCards } from './components/RenovationClassCards';
import { AdditionalOptions } from './components/AdditionalOptions';
import { StickyBottomBar } from './components/StickyBottomBar';
import { CalculationBreakdownModal } from './components/CalculationBreakdownModal';
import { BookingModal } from './components/BookingModal';
import { AppSkeleton } from './components/AppSkeleton';
import { initTelegramApp, triggerHaptic } from './utils/telegram';
import {
  getCompanyIdFromContext,
  fetchCompanyData,
  DEMO_COMPANIES,
  DEFAULT_COMPANY_ID,
} from './lib/supabase';
import {
  FileText,
  BadgePercent,
  HelpCircle,
  PhoneCall,
  ChevronDown,
} from 'lucide-react';

const FAQ_ITEMS = [
  {
    q: 'Что входит в бесплатный замер?',
    a: 'Инженер с лазерным дальномером проводит точные обмеры каждого помещения, проверяет перепады пола и стен, оценивает состояние электропроводки и составляет точную смету с фиксированной ценой.',
  },
  {
    q: 'Действительно ли работаете без предоплаты?',
    a: 'Да! Вы не платите аванс за работу. Оплата происходит поэтапно: мы выполняем согласованный этап (например, демонтаж или черновую электрику), вы принимаете качество и только после этого оплачиваете.',
  },
  {
    q: 'Кто покупает строительные материалы?',
    a: 'Вы можете закупать материалы самостоятельно, либо доверить это нам. Мы сотрудничаем напрямую с производителями Knauf, Ceresit, Rehau и закупаем черновые материалы по оптовым ценам с доставкой и подъемом.',
  },
];

export default function App() {
  // Theme state: dark / light
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const tgScheme = window.Telegram?.WebApp?.colorScheme;
      if (tgScheme) return tgScheme === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Multi-tenant state
  const [activeCompanyId, setActiveCompanyId] = useState<string>(() => getCompanyIdFromContext());
  const [isLoadingCompany, setIsLoadingCompany] = useState<boolean>(true);
  const [company, setCompany] = useState<CompanyConfig>(
    () => DEMO_COMPANIES[DEFAULT_COMPANY_ID].company
  );
  const [pricing, setPricing] = useState<PricingRules>(
    () => DEMO_COMPANIES[DEFAULT_COMPANY_ID].pricing
  );
  const [isFromSupabase, setIsFromSupabase] = useState<boolean>(false);

  // Calculator State
  const [propertyType, setPropertyType] = useState<PropertyType>('new');
  const [area, setArea] = useState<number>(54);
  const [selectedClassId, setSelectedClassId] = useState<RenovationClassId>('capital');
  const [optionStates, setOptionStates] = useState<{
    designProject: boolean;
    demolition: boolean;
    materials: boolean;
  }>({
    designProject: false,
    demolition: false,
    materials: false,
  });

  // Modals
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  // Initialize Telegram Mini App SDK
  useEffect(() => {
    initTelegramApp();
  }, []);

  // Fetch dynamic company & pricing rules on activeCompanyId change
  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      setIsLoadingCompany(true);
      try {
        const data = await fetchCompanyData(activeCompanyId);
        if (!isCancelled) {
          setCompany(data.company);
          setPricing(data.pricing);
          setIsFromSupabase(data.isFromSupabase);
        }
      } catch (err) {
        console.error('Error fetching company:', err);
      } finally {
        if (!isCancelled) {
          setIsLoadingCompany(false);
        }
      }
    }

    loadData();

    return () => {
      isCancelled = true;
    };
  }, [activeCompanyId]);

  // Sync dark class on document
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  // Toggle Theme
  const handleToggleTheme = () => {
    setIsDark((prev) => !prev);
  };

  // Switch Company Tenant
  const handleSelectCompanyId = (newCompanyId: string) => {
    setActiveCompanyId(newCompanyId);
    // Update URL query param cleanly without full page reload
    if (typeof window !== 'undefined' && window.history?.pushState) {
      const url = new URL(window.location.href);
      url.searchParams.set('company_id', newCompanyId);
      window.history.pushState({}, '', url.toString());
    }
  };

  // Dynamic Renovation Classes based on company's pricing
  const dynamicClasses: RenovationClass[] = useMemo(() => {
    return [
      {
        id: 'cosmetic',
        title: 'Косметический',
        pricePerMeter: pricing.cosmeticPrice,
        description: 'Быстрое обновление интерьера без переноса коммуникаций',
        features: [
          'Поклейка обоев / покраска',
          'Укладка ламината и плинтусов',
          'Замена розеток и светильников',
          'Косметический ремонт санузла',
        ],
      },
      {
        id: 'capital',
        title: 'Капитальный',
        pricePerMeter: pricing.capitalPrice,
        popular: true,
        badge: 'Хит выбора',
        description: 'Полный комплекс работ с выравниванием геометрии и новыми сетями',
        features: [
          'Выравнивание стен по маякам',
          'Стяжка пола с шумоизоляцией',
          'Новая электрика и сантехника',
          'Укладка керамогранита',
        ],
      },
      {
        id: 'designer',
        title: 'Дизайнерский',
        pricePerMeter: pricing.designerPrice,
        badge: 'Премиум',
        description: 'Эксклюзивная отделка по авторскому дизайн-проекту',
        features: [
          'Скрытые двери и теневые плинтусы',
          'Трековые системы освещения',
          'Сложные узлы и ниши с подсветкой',
          'Монтаж премиальной сантехники',
        ],
      },
    ];
  }, [pricing]);

  // Dynamic Additional Options based on company's pricing
  const dynamicOptions: AdditionalOption[] = useMemo(() => {
    return [
      {
        id: 'designProject',
        title: 'Нужен дизайн-проект',
        subtitle: '3D-визуализация, чертежи, развертки стен и спецификация',
        pricePerMeter: pricing.designProjectPrice,
        iconName: 'Palette',
        enabled: optionStates.designProject,
      },
      {
        id: 'demolition',
        title: 'Демонтаж старой отделки',
        subtitle: 'Снятие обоев, плитки, стяжки, вывоз строительного мусора',
        pricePerMeter: pricing.demolitionPrice,
        iconName: 'Hammer',
        enabled: optionStates.demolition,
      },
      {
        id: 'materials',
        title: 'Комплектация черновыми материалами',
        subtitle: 'Закупка смесей, кабелей, труб оптом со скидкой до 20%',
        pricePerMeter: pricing.materialsPrice,
        iconName: 'PackageCheck',
        enabled: optionStates.materials,
      },
    ];
  }, [pricing, optionStates]);

  // Toggle Option
  const handleToggleOption = (id: AdditionalOption['id']) => {
    setOptionStates((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Calculations: Formula: (Площадь * База * Коэфф) + Допы
  const calculation: CalculationResult = useMemo(() => {
    const selectedClass =
      dynamicClasses.find((c) => c.id === selectedClassId) || dynamicClasses[1];
    const propertyCoeff = propertyType === 'secondary' ? company.secondaryCoeff : 1.0;

    const baseWorkCost = Math.round(area * selectedClass.pricePerMeter * propertyCoeff);

    const activeOptions = dynamicOptions.filter((o) => o.enabled);
    const addonsCost = activeOptions.reduce((acc, opt) => acc + opt.pricePerMeter * area, 0);

    const totalCost = baseWorkCost + addonsCost;
    // Price range: X (-5%) to Y (+10%)
    const priceMin = Math.round(totalCost * 0.95);
    const priceMax = Math.round(totalCost * 1.1);

    // Days estimate
    let daysBase = { min: 20, max: 35 };
    if (selectedClassId === 'cosmetic') {
      daysBase = {
        min: Math.round(14 + area * 0.25),
        max: Math.round(22 + area * 0.35),
      };
    } else if (selectedClassId === 'capital') {
      daysBase = {
        min: Math.round(28 + area * 0.45),
        max: Math.round(42 + area * 0.6),
      };
    } else {
      daysBase = {
        min: Math.round(40 + area * 0.65),
        max: Math.round(65 + area * 0.85),
      };
    }

    return {
      area,
      propertyType,
      propertyTypeCoeff: propertyCoeff,
      renovationClass: selectedClass,
      activeOptions,
      baseWorkCost,
      addonsCost,
      totalCost,
      priceMin,
      priceMax,
      estimatedDays: daysBase,
    };
  }, [area, propertyType, selectedClassId, dynamicClasses, dynamicOptions, company.secondaryCoeff]);

  if (isLoadingCompany) {
    return <AppSkeleton />;
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors pb-32">
      <div className="max-w-md mx-auto">
        {/* 1. Header: Название компании, статус, город, телефон, смена тенанта */}
        <Header
          isDark={isDark}
          onToggleTheme={handleToggleTheme}
          company={company}
          onSelectCompanyId={handleSelectCompanyId}
          isFromSupabase={isFromSupabase}
        />

        <main className="px-3.5 space-y-3.5 mt-1">
          {/* 2. Тип недвижимости: Новостройка (1.0) / Вторичка (secondaryCoeff) */}
          <PropertyTypeSelector
            value={propertyType}
            onChange={(type) => setPropertyType(type)}
            secondaryCoeff={company.secondaryCoeff}
          />

          {/* 3. Площадь: Интерактивный ползунок от 20 до 180 м² с крупной цифрой по центру */}
          <AreaSlider
            value={area}
            onChange={(val) => setArea(val)}
          />

          {/* 4. Класс ремонта: 3 карточки с радио-выбором */}
          <RenovationClassCards
            classes={dynamicClasses}
            selectedId={selectedClassId}
            onSelect={(id) => setSelectedClassId(id)}
          />

          {/* 5. Дополнительные опции: Дизайн-проект, Демонтаж, Черновые материалы */}
          <AdditionalOptions
            options={dynamicOptions}
            area={area}
            onToggle={handleToggleOption}
          />

          {/* Value Propositions / Trust Banners */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="p-3 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/70 dark:border-slate-800/80 shadow-xs">
              <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2">
                <BadgePercent className="w-4 h-4" />
              </div>
              <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                Рассрочка 0%
              </h5>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                До 12 месяцев без первоначального взноса
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/70 dark:border-slate-800/80 shadow-xs">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
                <FileText className="w-4 h-4" />
              </div>
              <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                Фикс-цена
              </h5>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Стоимость не вырастет в процессе работ
              </p>
            </div>
          </div>

          {/* Workflow Steps */}
          <div className="bg-white dark:bg-slate-900/90 rounded-2xl p-4 border border-slate-200/70 dark:border-slate-800/80 shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
              Как мы работаем
            </h4>
            <div className="space-y-3">
              {[
                {
                  step: '1',
                  title: 'Бесплатный замер и смета',
                  desc: 'Инженер приедет, снимет размеры и согласует детали',
                },
                {
                  step: '2',
                  title: 'Договор с гарантией 3 года',
                  desc: 'Фиксируем сроки, штрафы за задержку и итоговую сумму',
                },
                {
                  step: '3',
                  title: 'Поэтапная оплата без предоплаты',
                  desc: 'Оплачиваете каждый этап только после проверки качества',
                },
              ].map((item, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {item.step}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* FAQ Accordion */}
          <div className="bg-white dark:bg-slate-900/90 rounded-2xl p-3.5 border border-slate-200/70 dark:border-slate-800/80 shadow-xs">
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                Частые вопросы
              </span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {FAQ_ITEMS.map((faq, idx) => {
                const isOpen = expandedFaq === idx;
                return (
                  <div key={idx} className="py-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setExpandedFaq(isOpen ? null : idx);
                      }}
                      className="w-full flex items-center justify-between text-left text-xs font-semibold text-slate-800 dark:text-slate-200 gap-2"
                    >
                      <span>{faq.q}</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${
                          isOpen ? 'rotate-180 text-blue-500' : ''
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed animate-in fade-in duration-150">
                        {faq.a}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick contact badge */}
          <div className="text-center py-2">
            <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1">
              <span>Служба поддержки и консультации:</span>
              <a
                href={`tel:${company.phone.replace(/[^0-9+]/g, '')}`}
                className="text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-0.5"
              >
                <PhoneCall className="w-3 h-3" />
                {company.phone}
              </a>
            </p>
          </div>
        </main>

        {/* 6. Sticky Bottom Calculation Bar */}
        <StickyBottomBar
          result={calculation}
          onOpenBreakdown={() => setIsBreakdownOpen(true)}
          onOpenBooking={() => setIsBookingOpen(true)}
        />

        {/* Detailed Breakdown Modal */}
        {isBreakdownOpen && (
          <CalculationBreakdownModal
            result={calculation}
            onClose={() => setIsBreakdownOpen(false)}
            onOpenBooking={() => {
              setIsBreakdownOpen(false);
              setIsBookingOpen(true);
            }}
          />
        )}

        {/* Booking Modal with 152-FZ Privacy Policy & Supabase Leads integration */}
        {isBookingOpen && (
          <BookingModal
            result={calculation}
            company={company}
            onClose={() => setIsBookingOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
