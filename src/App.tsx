import { useState, useEffect, useMemo } from 'react';
import {
  PropertyType,
  PropertySubtype,
  BathroomsCount,
  CeilingHeight,
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
import { EngineeringParameters } from './components/EngineeringParameters';
import { AreaSlider } from './components/AreaSlider';
import { RenovationClassCards } from './components/RenovationClassCards';
import { AdditionalOptions } from './components/AdditionalOptions';
import { StickyBottomBar } from './components/StickyBottomBar';
import { DetailedEstimateSection } from './components/DetailedEstimateSection';
import { BookingModal } from './components/BookingModal';
import { MoveInBudgetCard } from './components/MoveInBudgetCard';
import { ViralShareModal } from './components/ViralShareModal';
import { CompetitorAuditModal } from './components/CompetitorAuditModal';
import { PublicOfferModal } from './components/PublicOfferModal';
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal';
import { AppSkeleton } from './components/AppSkeleton';
import { initTelegramApp, triggerHaptic, formatCurrency } from './utils/telegram';
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
import { SuperAdminDashboard } from './components/admin/SuperAdminDashboard';
import { AdminAccessGate } from './components/admin/AdminAccessGate';
import { VisualPricingEditor } from './components/VisualPricingEditor';
import { StepWizardNav, WizardStepId } from './components/StepWizardNav';
import { PriceLockCard } from './components/PriceLockCard';
import { PrintProposalModal } from './components/PrintProposalModal';
import { isSuperAdminUser } from './utils/auth';
import {
  ChevronDown,
  SearchCheck,
  ArrowRight,
  ArrowLeft,
  LayoutDashboard,
  Calculator as CalcIcon,
  Calendar,
  FileText,
  Share2,
  CheckCircle2,
  SlidersHorizontal,
  Sparkles,
  ShieldCheck,
  Printer,
  Compass,
} from 'lucide-react';

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
  const [propertySubtype, setPropertySubtype] = useState<PropertySubtype>('new_concrete');
  const [bathroomsCount, setBathroomsCount] = useState<BathroomsCount>(1);
  const [ceilingHeight, setCeilingHeight] = useState<CeilingHeight>(2.7);
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

  // View mode: 'miniapp' (client calculator), 'admin' (RemontSaaS SuperAdmin Dashboard), or 'pricing' (Visual Pricing Editor)
  const [viewMode, setViewMode] = useState<'miniapp' | 'admin' | 'pricing'>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const wantsPricing =
        urlParams.get('pricing') === 'true' ||
        urlParams.get('mode') === 'pricing' ||
        window.location.pathname.startsWith('/pricing');

      // СТРОГО: доступ к редактору цен ТОЛЬКО при подтверждении владельца (ID 5629144056)
      if (wantsPricing && isSuperAdminUser()) {
        return 'pricing';
      }

      const wantsAdmin =
        urlParams.get('admin') === 'true' ||
        urlParams.get('saas') === 'true' ||
        urlParams.get('mode') === 'admin' ||
        window.location.pathname.startsWith('/admin');

      // СТРОГО: доступ к админ-панели ТОЛЬКО при подтверждении владельца (ID 5629144056)
      if (wantsAdmin && isSuperAdminUser()) {
        return 'admin';
      }
    }
    return 'miniapp'; // Default MUST ALWAYS be client renovation calculator
  });

  // Modals & UI
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isOfferOpen, setIsOfferOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isProposalOpen, setIsProposalOpen] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  // Пошаговый мастер (Step-by-step Wizard) для понятной презентации заказчику
  const [isWizardMode, setIsWizardMode] = useState<boolean>(true);
  const [currentStep, setCurrentStep] = useState<WizardStepId>(1);
  const [maxReachedStep, setMaxReachedStep] = useState<WizardStepId>(1);

  // Accordion collapsible states for high-converting compact structure
  const [isDetailedEstimateOpen, setIsDetailedEstimateOpen] = useState(false);
  const [isEngineeringOpen, setIsEngineeringOpen] = useState(false);

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
      excludedItemIds,
      propertySubtype,
      bathroomsCount,
      ceilingHeight
    );
  }, [
    items,
    area,
    propertyType,
    company.secondaryCoeff,
    selectedClassId,
    dynamicOptions,
    excludedItemIds,
    propertySubtype,
    bathroomsCount,
    ceilingHeight,
  ]);

  // Unified Calculator Result derived strictly from the estimate
  const calculation: CalculationResult = useMemo(() => {
    const selectedClass =
      dynamicClasses.find((c) => c.id === selectedClassId) || dynamicClasses[1];
    const propertyCoeff =
      propertySubtype === 'old_fund'
        ? 1.45
        : propertyType === 'secondary'
        ? company.secondaryCoeff
        : 1.0;

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
      propertySubtype,
      bathroomsCount,
      ceilingHeight,
      wallArea: estimateData.wallArea,
      perimeterRatio: estimateData.perimeterRatio,
      propertyTypeCoeff: propertyCoeff,
      renovationClass: selectedClass,
      activeOptions: dynamicOptions.filter((o) => o.enabled),
      baseWorkCost: estimateData.worksTotal,
      addonsCost: estimateData.materialsTotal,
      wetAreasCost: estimateData.wetAreasCost,
      finishingMaterialsEstimate: estimateData.finishingMaterialsEstimate,
      totalCost: estimateData.grandTotal,
      priceMin: estimateData.grandTotal,
      priceMax: estimateData.grandTotal,
      estimatedDays: daysBase,
    };
  }, [
    area,
    propertyType,
    propertySubtype,
    bathroomsCount,
    ceilingHeight,
    selectedClassId,
    dynamicClasses,
    dynamicOptions,
    company.secondaryCoeff,
    estimateData,
  ]);

  const isSuperAdmin = isSuperAdminUser();

  if (isLoadingCompany) {
    return <AppSkeleton />;
  }

  // If in Visual Pricing Editor mode (/pricing)
  if (viewMode === 'pricing') {
    if (!isSuperAdmin) {
      return (
        <AdminAccessGate
          onAuthorized={() => setViewMode('pricing')}
          onCancel={() => setViewMode('miniapp')}
          isDark={isDark}
        />
      );
    }

    return (
      <VisualPricingEditor
        initialCompanyId={activeCompanyId}
        onBackToCalculator={() => setViewMode('miniapp')}
        onOpenAdmin={isSuperAdmin ? () => setViewMode('admin') : undefined}
        isSuperAdmin={isSuperAdmin}
      />
    );
  }

  // If in SuperAdmin dashboard mode, render the full-scale B2B SaaS platform
  if (viewMode === 'admin') {
    if (!isSuperAdmin) {
      return (
        <AdminAccessGate
          onAuthorized={() => setViewMode('admin')}
          onCancel={() => setViewMode('miniapp')}
          isDark={isDark}
        />
      );
    }

    return (
      <SuperAdminDashboard
        onSwitchToMiniApp={() => setViewMode('miniapp')}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f4f5] dark:bg-[#09090b] text-[#18181b] dark:text-[#f4f4f5] transition-colors pb-24 font-['Manrope',sans-serif]">
      <div className="max-w-md mx-auto">
        {/* Header with Company Branding & Theme Switcher */}
        <Header
          isDark={isDark}
          onToggleTheme={handleToggleTheme}
          company={company}
          onOpenAdmin={isSuperAdmin ? () => setViewMode('admin') : undefined}
          onOpenPricing={isSuperAdmin ? () => setViewMode('pricing') : undefined}
        />

        {/* Main Unified Calculator */}
        <main className="px-3 space-y-3 mt-2">
          {/* Интерактивный навигатор пошагового мастера с переключателем режимов */}
          <StepWizardNav
            currentStep={currentStep}
            onSelectStep={(s) => {
              setCurrentStep(s);
              setMaxReachedStep((prev) => Math.max(prev, s) as WizardStepId);
            }}
            isWizardMode={isWizardMode}
            onToggleMode={(wiz) => setIsWizardMode(wiz)}
            maxReachedStep={maxReachedStep}
          />

          {isWizardMode ? (
            /* --- РЕЖИМ ПОШАГОВОГО МАСТЕРА (WIZARD MODE) --- */
            <div className="space-y-3">
              {/* ШАГ 1: Объект и площадь */}
              {currentStep === 1 && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <PropertyTypeSelector
                    value={propertyType}
                    subtype={propertySubtype}
                    onChange={(type) => setPropertyType(type)}
                    onChangeSubtype={(st) => setPropertySubtype(st)}
                    secondaryCoeff={company.secondaryCoeff}
                  />

                  <AreaSlider
                    value={area}
                    onChange={(val) => setArea(val)}
                  />

                  {/* Нижняя панель перехода Шаг 1 -> Шаг 2 */}
                  <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between gap-3">
                    <div className="text-xs">
                      <span className="text-zinc-500 dark:text-zinc-400 block text-[10px] uppercase font-bold">Ориентир сметы:</span>
                      <span className="font-extrabold font-mono text-zinc-900 dark:text-white text-sm sm:text-base">
                        {formatCurrency(estimateData.grandTotal)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        setCurrentStep(2);
                        setMaxReachedStep((prev) => Math.max(prev, 2) as WizardStepId);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition cursor-pointer"
                    >
                      <span>Далее: Класс ремонта</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* ШАГ 2: Класс ремонта и состав работ */}
              {currentStep === 2 && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <RenovationClassCards
                    classes={dynamicClasses}
                    selectedId={selectedClassId}
                    onSelect={(id) => setSelectedClassId(id)}
                  />

                  {/* Поясняющая карточка тарифов для мастера и клиента */}
                  <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 text-xs space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Разница между тарифами простыми словами:</span>
                    </div>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
                      • <strong>Косметический:</strong> Чистовое обновление (обои/покраска, ламинат, натяжной потолок) без демонтажа и переноса коммуникаций.
                    </p>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
                      • <strong>Капитальный под ключ (Хит):</strong> Новая стяжка пола, выравнивание стен под 90° по маякам, разводка труб Rehau и щит с автоматами.
                    </p>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
                      • <strong>Дизайнерский:</strong> Проектная отделка, теневые профили, керамогранит 120×60, скрытый плинтус и трековый свет.
                    </p>
                  </div>

                  {/* Навигация Шага 2 */}
                  <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setCurrentStep(1);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="py-2.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold text-xs flex items-center gap-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Назад</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        setCurrentStep(3);
                        setMaxReachedStep((prev) => Math.max(prev, 3) as WizardStepId);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition cursor-pointer"
                    >
                      <span>Далее: Опции и материалы</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* ШАГ 3: Дополнительные опции и инженерия */}
              {currentStep === 3 && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <AdditionalOptions
                    options={dynamicOptions}
                    area={area}
                    onToggle={handleToggleOption}
                  />

                  {/* Инженерные параметры */}
                  <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                        Санузлы и высота потолков ({bathroomsCount} узел, {ceilingHeight} м)
                      </span>
                    </div>
                    <EngineeringParameters
                      bathroomsCount={bathroomsCount}
                      onChangeBathrooms={(b) => setBathroomsCount(b)}
                      ceilingHeight={ceilingHeight}
                      onChangeCeiling={(h) => setCeilingHeight(h)}
                      area={area}
                      wallArea={estimateData.wallArea}
                      perimeterRatio={estimateData.perimeterRatio}
                      finishingEstimate={estimateData.finishingMaterialsEstimate}
                      wetAreasCost={estimateData.wetAreasCost}
                      renovationClassId={selectedClassId}
                    />
                  </div>

                  {/* Навигация Шага 3 */}
                  <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setCurrentStep(2);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="py-2.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold text-xs flex items-center gap-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Назад</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('heavy');
                        setCurrentStep(4);
                        setMaxReachedStep((prev) => Math.max(prev, 4) as WizardStepId);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition cursor-pointer"
                    >
                      <span>Далее: Итоговая смета и фиксация</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* ШАГ 4: Итоговая смета, фиксация цены и КП */}
              {currentStep === 4 && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  {/* Hero Result Card */}
                  <div className="bg-gradient-to-br from-emerald-950 via-zinc-900 to-zinc-950 text-white rounded-2xl p-4 sm:p-5 border border-emerald-800/50 shadow-xl space-y-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 rounded-sm">
                            Итоговая смета под ключ
                          </span>
                          <span className="text-[11px] text-zinc-400 font-medium">
                            · {calculation.area} м² ({calculation.propertyType === 'new' ? 'Новостройка' : 'Вторичка'})
                          </span>
                        </div>
                        <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-white mt-1.5 flex items-baseline gap-2">
                          <span>{formatCurrency(estimateData.grandTotal)}</span>
                        </div>
                        <div className="text-xs text-emerald-300/90 font-medium mt-0.5 flex items-center gap-2">
                          <span>~{Math.round(estimateData.grandTotal / calculation.area).toLocaleString('ru-RU')} ₽/м²</span>
                          <span>•</span>
                          <span>Срок: ~{calculation.estimatedDays.min}–{calculation.estimatedDays.max} дней</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setIsProposalOpen(true);
                          }}
                          className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-emerald-400 transition shrink-0 active:scale-95 cursor-pointer"
                          title="Открыть коммерческое предложение / PDF"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setIsShareOpen(true);
                          }}
                          className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-300 transition shrink-0 active:scale-95 cursor-pointer"
                          title="Поделиться расчетом / сохранить в Telegram"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Главная кнопка действия (Primary CTA) */}
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('heavy');
                        setIsBookingOpen(true);
                      }}
                      className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-zinc-950 rounded-xl font-extrabold text-xs sm:text-sm shadow-lg shadow-emerald-950/40 transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Calendar className="w-4 h-4 shrink-0" />
                      <span>Записаться на бесплатный замер (0 ₽) и зафиксировать скидку</span>
                      <ArrowRight className="w-4 h-4 shrink-0" />
                    </button>
                  </div>

                  {/* Сертификат фиксации цены и гарантийный блок */}
                  <PriceLockCard
                    grandTotal={estimateData.grandTotal}
                    worksTotal={estimateData.worksTotal}
                    materialsTotal={estimateData.materialsTotal}
                    area={calculation.area}
                    estimatedDays={calculation.estimatedDays}
                    onOpenBooking={() => setIsBookingOpen(true)}
                    onOpenPrint={() => setIsProposalOpen(true)}
                  />

                  {/* Детальная смета по 35 пунктам ГОСТ (Сворачиваемый аккордеон) */}
                  <div
                    id="estimate-breakdown"
                    className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden transition-all scroll-mt-14"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setIsDetailedEstimateOpen(!isDetailedEstimateOpen);
                      }}
                      className="w-full p-3.5 flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 font-bold">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-zinc-950 dark:text-white flex items-center gap-1.5">
                            <span>Подробная смета по 35 пунктам ГОСТ</span>
                            <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-1.5 py-0.5 rounded-sm font-mono">
                              35 работ
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 mt-0.5">
                            {isDetailedEstimateOpen ? 'Нажмите, чтобы скрыть детализацию' : 'Раскрыть технологическую карту с ценами за единицу'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold font-mono text-zinc-900 dark:text-zinc-100 hidden sm:inline">
                          {formatCurrency(estimateData.grandTotal)}
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
                            isDetailedEstimateOpen ? 'rotate-180 text-zinc-900 dark:text-white' : ''
                          }`}
                        />
                      </div>
                    </button>
                    {isDetailedEstimateOpen && (
                      <div className="p-3 pt-0 border-t border-zinc-100 dark:border-zinc-800 animate-in fade-in duration-150">
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
                      </div>
                    )}
                  </div>

                  {/* Навигация Шага 4 */}
                  <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setCurrentStep(1);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="py-2.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold text-xs flex items-center gap-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Изменить параметры</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setIsProposalOpen(true);
                      }}
                      className="py-2.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Печать / PDF сметы</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* --- СВОДНЫЙ РЕЖИМ (ALL-IN-ONE VIEW) --- */
            <div className="space-y-3">
              {/* 1. Базовые параметры объекта */}
              <PropertyTypeSelector
                value={propertyType}
                subtype={propertySubtype}
                onChange={(type) => setPropertyType(type)}
                onChangeSubtype={(st) => setPropertySubtype(st)}
                secondaryCoeff={company.secondaryCoeff}
              />

              {/* 2. Площадь объекта с быстрыми чипами */}
              <AreaSlider
                value={area}
                onChange={(val) => setArea(val)}
              />

              {/* 3. Выбор тарифа отделки */}
              <RenovationClassCards
                classes={dynamicClasses}
                selectedId={selectedClassId}
                onSelect={(id) => setSelectedClassId(id)}
              />

              {/* 4. ГЛАВНЫЙ КОНВЕРСИОННЫЙ ОФФЕР */}
              <div className="bg-gradient-to-br from-emerald-950 via-zinc-900 to-zinc-950 text-white rounded-2xl p-4 sm:p-5 border border-emerald-800/50 shadow-xl space-y-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 rounded-sm">
                        Итоговая смета под ключ
                      </span>
                      <span className="text-[11px] text-zinc-400 font-medium">
                        · {calculation.area} м² ({calculation.propertyType === 'new' ? 'Новостройка' : 'Вторичка'})
                      </span>
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-white mt-1.5 flex items-baseline gap-2">
                      <span>{formatCurrency(estimateData.grandTotal)}</span>
                    </div>
                    <div className="text-xs text-emerald-300/90 font-medium mt-0.5 flex items-center gap-2">
                      <span>~{Math.round(estimateData.grandTotal / calculation.area).toLocaleString('ru-RU')} ₽/м²</span>
                      <span>•</span>
                      <span>Срок: ~{calculation.estimatedDays.min}–{calculation.estimatedDays.max} дней</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setIsProposalOpen(true);
                      }}
                      className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-emerald-400 transition shrink-0 active:scale-95 cursor-pointer"
                      title="Открыть коммерческое предложение / PDF"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setIsShareOpen(true);
                      }}
                      className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-300 transition shrink-0 active:scale-95 cursor-pointer"
                      title="Поделиться расчетом / сохранить в Telegram"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-white/10 text-center text-xs">
                  <div className="p-1.5 rounded-lg bg-white/5">
                    <div className="font-bold text-white text-[11px]">0% аванс</div>
                    <div className="text-[9px] text-zinc-400 mt-0.5 leading-tight">Оплата по акту</div>
                  </div>
                  <div className="p-1.5 rounded-lg bg-white/5">
                    <div className="font-bold text-white text-[11px]">Договор</div>
                    <div className="text-[9px] text-zinc-400 mt-0.5 leading-tight">Фикс. цена</div>
                  </div>
                  <div className="p-1.5 rounded-lg bg-white/5">
                    <div className="font-bold text-white text-[11px]">3 года</div>
                    <div className="text-[9px] text-zinc-400 mt-0.5 leading-tight">Гарантия ГОСТ</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('heavy');
                    setIsBookingOpen(true);
                  }}
                  className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-zinc-950 rounded-xl font-extrabold text-xs sm:text-sm shadow-lg shadow-emerald-950/40 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Calendar className="w-4 h-4 shrink-0" />
                  <span>Записаться на бесплатный замер (0 ₽) и зафиксировать скидку</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              </div>

              {/* Сертификат фиксации цены */}
              <PriceLockCard
                grandTotal={estimateData.grandTotal}
                worksTotal={estimateData.worksTotal}
                materialsTotal={estimateData.materialsTotal}
                area={calculation.area}
                estimatedDays={calculation.estimatedDays}
                onOpenBooking={() => setIsBookingOpen(true)}
                onOpenPrint={() => setIsProposalOpen(true)}
              />

              {/* 5. Дополнительные опции ремонта */}
              <AdditionalOptions
                options={dynamicOptions}
                area={area}
                onToggle={handleToggleOption}
              />

              {/* 6. Сворачиваемые инженерные параметры */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setIsEngineeringOpen(!isEngineeringOpen);
                  }}
                  className="w-full p-3 flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      Уточнить санузлы и высоту потолков ({bathroomsCount} узел, {ceilingHeight} м)
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
                      isEngineeringOpen ? 'rotate-180 text-zinc-900 dark:text-white' : ''
                    }`}
                  />
                </button>
                {isEngineeringOpen && (
                  <div className="p-3 pt-0 border-t border-zinc-100 dark:border-zinc-800 animate-in fade-in duration-150">
                    <EngineeringParameters
                      bathroomsCount={bathroomsCount}
                      onChangeBathrooms={(b) => setBathroomsCount(b)}
                      ceilingHeight={ceilingHeight}
                      onChangeCeiling={(h) => setCeilingHeight(h)}
                      area={area}
                      wallArea={estimateData.wallArea}
                      perimeterRatio={estimateData.perimeterRatio}
                      finishingEstimate={estimateData.finishingMaterialsEstimate}
                      wetAreasCost={estimateData.wetAreasCost}
                      renovationClassId={selectedClassId}
                    />
                  </div>
                )}
              </div>

              {/* 7. Детальная смета по 35 пунктам ГОСТ */}
              <div
                id="estimate-breakdown"
                className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden transition-all scroll-mt-14"
              >
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setIsDetailedEstimateOpen(!isDetailedEstimateOpen);
                  }}
                  className="w-full p-3.5 flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 font-bold">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-zinc-950 dark:text-white flex items-center gap-1.5">
                        <span>Подробная смета по 35 пунктам ГОСТ</span>
                        <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-1.5 py-0.5 rounded-sm font-mono">
                          35 работ
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {isDetailedEstimateOpen ? 'Нажмите, чтобы скрыть детализацию' : 'Раскрыть технологическую карту с ценами за единицу'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold font-mono text-zinc-900 dark:text-zinc-100 hidden sm:inline">
                      {formatCurrency(estimateData.grandTotal)}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
                        isDetailedEstimateOpen ? 'rotate-180 text-zinc-900 dark:text-white' : ''
                      }`}
                    />
                  </div>
                </button>
                {isDetailedEstimateOpen && (
                  <div className="p-3 pt-0 border-t border-zinc-100 dark:border-zinc-800 animate-in fade-in duration-150">
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
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 8. Социальное доказательство, гарантии и экспресс-аудит */}
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
              className="py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs shrink-0 transition shadow-xs flex items-center gap-1 cursor-pointer"
            >
              <span>Проверить</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* Полный бюджет до заселения с мебелью (Формула 25/40/25/10) */}
          <MoveInBudgetCard grandTotal={estimateData.grandTotal} />

          {/* Стандарты договора и надежности */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs">
            <div className="flex items-center gap-1.5 mb-2 px-0.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                Стандарты договора и гарантии
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                <span className="block text-xs font-bold text-zinc-950 dark:text-white">100% фикс-цена</span>
                <span className="block text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-tight">Без скрытых доплат</span>
              </div>
              <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                <span className="block text-xs font-bold text-zinc-950 dark:text-white">0% аванс</span>
                <span className="block text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-tight">Оплата по акту</span>
              </div>
              <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                <span className="block text-xs font-bold text-zinc-950 dark:text-white">36 мес. ГОСТ</span>
                <span className="block text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-tight">Гарантия в договоре</span>
              </div>
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

          {/* Юридические ссылки */}
          <div className="text-center py-2 space-y-1.5">
            <div className="flex items-center justify-center gap-3 text-[11px] text-zinc-500 dark:text-zinc-400">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setIsPrivacyOpen(true);
                }}
                className="hover:text-zinc-800 dark:hover:text-zinc-200 underline font-medium cursor-pointer"
              >
                Политика конфиденциальности (152-ФЗ)
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setIsOfferOpen(true);
                }}
                className="hover:text-zinc-800 dark:hover:text-zinc-200 underline cursor-pointer"
              >
                Публичная оферта
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setViewMode('pricing');
                }}
                className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 underline font-semibold cursor-pointer"
                title="Визуальная настройка расценок на ремонт"
              >
                Редактор расценок (/pricing)
              </button>
              {isSuperAdmin && (
                <>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      setViewMode('admin');
                    }}
                    className="text-emerald-600 dark:text-emerald-400 hover:underline font-bold cursor-pointer"
                  >
                    Панель управления (Бот & БД)
                  </button>
                </>
              )}
            </div>
            {company.phone && (
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium pt-1">
                Контактный телефон компании / прораба:{' '}
                <a
                  href={`tel:${company.phone.replace(/[^0-9+]/g, '')}`}
                  className="font-bold font-mono text-zinc-900 dark:text-white underline"
                >
                  {company.phone}
                </a>
              </div>
            )}
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 pt-0.5">
              Оператор персональных данных: Самозанятый Кострикин Алексей Алексеевич • ИНН 711380053758
            </p>
          </div>
        </main>

        {/* Sticky Bottom Calculation Bar */}
        <StickyBottomBar
          result={calculation}
          onOpenBreakdown={() => {
            setIsDetailedEstimateOpen(true);
            setTimeout(() => {
              const el = document.getElementById('estimate-breakdown');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 50);
          }}
          onOpenBooking={() => setIsBookingOpen(true)}
          onOpenShare={() => setIsShareOpen(true)}
          onOpenPrint={() => setIsProposalOpen(true)}
        />

        {/* Printable Commercial Proposal Modal (Смета и КП) */}
        {isProposalOpen && (
          <PrintProposalModal
            isOpen={isProposalOpen}
            onClose={() => setIsProposalOpen(false)}
            company={company}
            result={calculation}
            selectedClass={calculation.renovationClass}
            groups={estimateData.groups}
            grandTotal={estimateData.grandTotal}
            worksTotal={estimateData.worksTotal}
            materialsTotal={estimateData.materialsTotal}
            estimatedDays={calculation.estimatedDays}
          />
        )}

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

        {/* Public Offer Modal */}
        {isOfferOpen && (
          <PublicOfferModal
            companyName={company.name}
            onClose={() => setIsOfferOpen(false)}
          />
        )}

        {/* Privacy Policy Modal */}
        {isPrivacyOpen && (
          <PrivacyPolicyModal
            companyName={company.name}
            onClose={() => setIsPrivacyOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
