import { useState, useEffect, useMemo } from 'react';
import {
  PropertyType,
  RenovationClass,
  RenovationClassId,
  AdditionalOption,
  CalculationResult,
  CompanyConfig,
  PricingRules,
  EstimateItem,
} from './types';
import { Header } from './components/Header';
import { PropertyTypeSelector } from './components/PropertyTypeSelector';
import { AreaSlider } from './components/AreaSlider';
import { RenovationClassCards } from './components/RenovationClassCards';
import { AdditionalOptions } from './components/AdditionalOptions';
import { StickyBottomBar } from './components/StickyBottomBar';
import { DetailedEstimateSection } from './components/DetailedEstimateSection';
import { BookingModal } from './components/BookingModal';
import { ViralShareModal } from './components/ViralShareModal';
import { CompetitorAuditModal } from './components/CompetitorAuditModal';
import { AppSkeleton } from './components/AppSkeleton';
import { initTelegramApp, triggerHaptic } from './utils/telegram';
import {
  getCompanyEstimateItems,
  calculateDetailedEstimate,
  saveCompanyEstimateItems,
} from './utils/estimates';
import {
  getCompanyIdFromContext,
  fetchCompanyData,
  DEMO_COMPANIES,
  DEFAULT_COMPANY_ID,
} from './lib/supabase';
import { ChevronDown, SearchCheck, ArrowRight } from 'lucide-react';

const FAQ_ITEMS = [
  {
    q: 'Как формируется смета в калькуляторе?',
    a: 'Все расчёты строятся строго по действующим технологическим картам и расценкам компании за единицу работы. Вы можете в реальном времени исключать ненужные работы галочками — сумма пересчитывается моментально.',
  },
  {
    q: 'Что входит в бесплатный замер?',
    a: 'Инженер с лазерным дальномером проводит точные обмеры каждого помещения, проверяет перепады пола и стен, оценивает состояние электропроводки и фиксирует финальную смету без скрытых доплат.',
  },
  {
    q: 'Действительно ли работаете без предоплаты?',
    a: 'Да! Вы не платите аванс за работу. Оплата происходит поэтапно: мы выполняем согласованный этап (например, демонтаж или черновую электрику), вы принимаете качество по акту и только после этого оплачиваете.',
  },
  {
    q: 'Кто покупает строительные материалы?',
    a: 'Вы можете закупать материалы сами, либо включить комплектацию в калькуляторе. Мы закупаем черновые смеси, кабели и трубы напрямую у производителей (Knauf, Ceresit, Rehau) по оптовым ценам с доставкой и подъемом.',
  },
];

export default function App() {
  // Theme state: dark / light with persistent storage & Telegram sync
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('remont_theme');
      if (saved) return saved === 'dark';
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

  // Estimate state loaded directly for active company
  const [items, setItems] = useState<EstimateItem[]>(() =>
    getCompanyEstimateItems(company.id, pricing)
  );
  const [excludedItemIds, setExcludedItemIds] = useState<string[]>([]);

  // Modals & UI
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  // Initialize Telegram Mini App SDK & parse viral deep links
  useEffect(() => {
    initTelegramApp();

    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const qArea = urlParams.get('area');
      const qClass = urlParams.get('class');
      const qBot = urlParams.get('bot') || urlParams.get('bot_username') || urlParams.get('tg_bot');
      const receiverBot = (window.Telegram?.WebApp?.initDataUnsafe as { receiver?: { username?: string } })?.receiver?.username;
      const detectedBotRaw = qBot || receiverBot;

      if (detectedBotRaw) {
        const clean = detectedBotRaw.replace(/^@/, '').trim();
        try {
          localStorage.setItem('remont_bot_username', clean);
        } catch {
          // ignore
        }
        setCompany((prev) => ({
          ...prev,
          botUsername: clean,
        }));
      }
      const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;

      if (qArea) {
        const parsedArea = parseInt(qArea, 10);
        if (!isNaN(parsedArea) && parsedArea >= 20 && parsedArea <= 250) {
          setArea(parsedArea);
        }
      }
      if (qClass && ['cosmetic', 'capital', 'designer'].includes(qClass)) {
        setSelectedClassId(qClass as RenovationClassId);
      }

      if (startParam) {
        const parts = startParam.split('_');
        if ((parts[0] === 'calc' || parts[0] === 'est' || parts[0] === 'estimate') && parts.length >= 3) {
          const pArea = parseInt(parts[1], 10);
          if (!isNaN(pArea) && pArea >= 20 && pArea <= 250) setArea(pArea);
          if (['cosmetic', 'capital', 'designer'].includes(parts[2])) {
            setSelectedClassId(parts[2] as RenovationClassId);
          }
        }
      }
    }
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
          const companyItems = getCompanyEstimateItems(data.company.id, data.pricing);
          setItems(companyItems);
          setExcludedItemIds([]);
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

  // Sync dark class on document element and save in localStorage
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      try {
        localStorage.setItem('remont_theme', 'dark');
      } catch {
        // No-op
      }
    } else {
      root.classList.remove('dark');
      try {
        localStorage.setItem('remont_theme', 'light');
      } catch {
        // No-op
      }
    }
  }, [isDark]);

  // Toggle Theme
  const handleToggleTheme = () => {
    setIsDark((prev) => !prev);
  };

  // Dynamic Renovation Classes
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

  // Dynamic Additional Options
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

  // Estimate Items Management
  const handleUpdateItems = (updated: EstimateItem[]) => {
    setItems(updated);
    saveCompanyEstimateItems(company.id, updated);
  };

  const handleResetItems = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`company_estimate_${company.id}`);
    }
    const fresh = getCompanyEstimateItems(company.id, pricing);
    setItems(fresh);
    setExcludedItemIds([]);
  };

  const handleToggleItemExclusion = (itemId: string) => {
    setExcludedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const handleRestoreAllItems = () => {
    setExcludedItemIds([]);
  };

  // Exact Estimate Calculation - SINGLE SOURCE OF TRUTH FOR ALL CALCULATOR PRICES
  const estimateData = useMemo(() => {
    return calculateDetailedEstimate(
      items,
      area,
      propertyType,
      company.secondaryCoeff,
      selectedClassId,
      dynamicOptions,
      excludedItemIds
    );
  }, [items, area, propertyType, company.secondaryCoeff, selectedClassId, dynamicOptions, excludedItemIds]);

  // Unified Calculator Result derived strictly from the estimate
  const calculation: CalculationResult = useMemo(() => {
    const selectedClass =
      dynamicClasses.find((c) => c.id === selectedClassId) || dynamicClasses[1];
    const propertyCoeff = propertyType === 'secondary' ? company.secondaryCoeff : 1.0;

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
      activeOptions: dynamicOptions.filter((o) => o.enabled),
      baseWorkCost: estimateData.worksTotal,
      addonsCost: estimateData.materialsTotal,
      totalCost: estimateData.grandTotal,
      priceMin: estimateData.grandTotal,
      priceMax: estimateData.grandTotal,
      estimatedDays: daysBase,
    };
  }, [area, propertyType, selectedClassId, dynamicClasses, dynamicOptions, company.secondaryCoeff, estimateData]);

  if (isLoadingCompany) {
    return <AppSkeleton />;
  }

  return (
    <div className="min-h-screen bg-[#f4f4f5] dark:bg-[#09090b] text-[#18181b] dark:text-[#f4f4f5] transition-colors pb-24 font-['Manrope',sans-serif]">
      <div className="max-w-md mx-auto">
        {/* Header with Company Branding & Theme Switcher */}
        <Header
          isDark={isDark}
          onToggleTheme={handleToggleTheme}
          company={company}
        />

        {/* Main Unified Calculator */}
        <main className="px-3 space-y-2.5 mt-2">
          {/* 1. Тип недвижимости */}
          <PropertyTypeSelector
            value={propertyType}
            onChange={(type) => setPropertyType(type)}
            secondaryCoeff={company.secondaryCoeff}
          />

          {/* 2. Площадь объекта */}
          <AreaSlider
            value={area}
            onChange={(val) => setArea(val)}
          />

          {/* 3. Тариф отделки */}
          <RenovationClassCards
            classes={dynamicClasses}
            selectedId={selectedClassId}
            onSelect={(id) => setSelectedClassId(id)}
          />

          {/* Вирусная механика 4: Экспресс-аудит сметы конкурента («Троянский конь») */}
          <div
            id="competitor-audit-banner"
            className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-xl p-3 border border-amber-200/80 dark:border-amber-800/50 shadow-xs flex items-center justify-between gap-3 no-print"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
                <SearchCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-zinc-950 dark:text-white">
                    Есть смета от другого прораба?
                  </span>
                  <span className="text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded-sm bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200">
                    Анти-развод
                  </span>
                </div>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-300 mt-0.5 leading-snug">
                  Проверьте её на скрытые доплаты и переплату за 30 секунд
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                setIsAuditOpen(true);
              }}
              className="py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs shrink-0 transition shadow-xs flex items-center gap-1"
            >
              <span>Проверить</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* 4. Дополнительные опции */}
          <AdditionalOptions
            options={dynamicOptions}
            area={area}
            onToggle={handleToggleOption}
          />

          {/* 5. Построчная смета работ и материалов (Строго по расценкам компании) */}
          <DetailedEstimateSection
            result={calculation}
            company={company}
            pricing={pricing}
            items={items}
            onUpdateItems={handleUpdateItems}
            onResetItems={handleResetItems}
            excludedItemIds={excludedItemIds}
            onToggleItemExclusion={handleToggleItemExclusion}
            onRestoreAllItems={handleRestoreAllItems}
            estimateData={estimateData}
            onOpenBooking={() => setIsBookingOpen(true)}
            onOpenShare={() => setIsShareOpen(true)}
          />

          {/* 6. Стандарты качества */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-2.5 border border-zinc-200 dark:border-zinc-800 shadow-xs grid grid-cols-3 gap-1.5 text-center">
            <div className="p-1">
              <span className="block text-xs font-bold text-zinc-950 dark:text-white">Фикс-смета</span>
              <span className="block text-[10px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-tight">Без скрытых доплат</span>
            </div>
            <div className="p-1 border-x border-zinc-200 dark:border-zinc-800">
              <span className="block text-xs font-bold text-zinc-950 dark:text-white">Пост-оплата</span>
              <span className="block text-[10px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-tight">Оплата по акту</span>
            </div>
            <div className="p-1">
              <span className="block text-xs font-bold text-zinc-950 dark:text-white">Гарантия 3 года</span>
              <span className="block text-[10px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-tight">По договору</span>
            </div>
          </div>

          {/* 7. Частые вопросы */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs">
            <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider block mb-1 px-1">
              Вопросы и ответы
            </span>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {FAQ_ITEMS.map((faq, idx) => {
                const isOpen = expandedFaq === idx;
                return (
                  <div key={idx} className="py-2">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setExpandedFaq(isOpen ? null : idx);
                      }}
                      className="w-full flex items-center justify-between text-left text-xs font-bold text-zinc-900 dark:text-zinc-100 px-1 gap-2"
                    >
                      <span>{faq.q}</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-200 ${
                          isOpen ? 'rotate-180 text-zinc-950 dark:text-white' : ''
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <p className="text-[11px] text-zinc-700 dark:text-zinc-300 mt-1.5 px-1 leading-relaxed animate-in fade-in duration-150">
                        {faq.a}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Дежурный инженер */}
          <div className="text-center py-1">
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Дежурный инженер:{' '}
              <a
                href={`tel:${company.phone.replace(/[^0-9+]/g, '')}`}
                className="text-zinc-900 dark:text-zinc-200 font-bold hover:underline"
              >
                {company.phone}
              </a>
            </p>
          </div>
        </main>

        {/* Sticky Bottom Calculation Bar */}
        <StickyBottomBar
          result={calculation}
          onOpenBooking={() => setIsBookingOpen(true)}
          onOpenShare={() => setIsShareOpen(true)}
        />

        {/* Booking Modal */}
        {isBookingOpen && (
          <BookingModal
            result={calculation}
            company={company}
            onClose={() => setIsBookingOpen(false)}
          />
        )}

        {/* Viral Share Modal (Механики 1 и 3) */}
        <ViralShareModal
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
          company={company}
          result={calculation}
          selectedClass={calculation.renovationClass}
          savings={estimateData.savingsTotal}
        />

        {/* Competitor Audit Modal (Механика 4) */}
        <CompetitorAuditModal
          isOpen={isAuditOpen}
          initialArea={area}
          onClose={() => setIsAuditOpen(false)}
          onApplyHonestEstimate={(newArea, newClass) => {
            setArea(newArea);
            setSelectedClassId(newClass);
            setTimeout(() => {
              const el = document.getElementById('estimate-breakdown');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          }}
        />
      </div>
    </div>
  );
}
