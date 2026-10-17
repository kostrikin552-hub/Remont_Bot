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
import { StepWizardNav } from './components/StepWizardNav';
import { PriceLockCard } from './components/PriceLockCard';
import { PrintProposalModal } from './components/PrintProposalModal';
import { CompetitorTruthTable } from './components/CompetitorTruthTable';
import { AiProjectScannerModal } from './components/AiProjectScannerModal';
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
  Zap,
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
  const [isAiScannerOpen, setIsAiScannerOpen] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

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
      // Внутри Telegram для любого чужого аккаунта доступ категорически закрыт: возврат в калькулятор
      const tgUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (tgUserId && String(tgUserId) !== '5629144056') {
        setViewMode('miniapp');
        return null;
      }

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
      // Внутри Telegram для любого чужого аккаунта доступ категорически закрыт: возврат в калькулятор
      const tgUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (tgUserId && String(tgUserId) !== '5629144056') {
        setViewMode('miniapp');
        return null;
      }

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
          onOpenScanner={isSuperAdmin ? () => setIsAiScannerOpen(true) : undefined}
        />

        {/* Main Unified Calculator */}
        <main className="px-3 space-y-3 mt-2">
          {/* Интерактивный якорный трекер этапов расчета */}
          <StepWizardNav grandTotal={estimateData.grandTotal} />

          {/* Инженерный сканер чертежей и смет Banner — доступен ТОЛЬКО владельцу бота (Режим прораба) */}
          {isSuperAdmin && (
            <div className="bg-zinc-900 text-white rounded-xl p-2.5 sm:p-3 border border-zinc-800 shadow-xs flex items-center justify-between gap-3 relative overflow-hidden animate-in fade-in">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Compass className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-white">Инженерный сканер чертежей</span>
                    <span className="text-[9px] font-mono bg-emerald-950/80 text-emerald-400 px-1.5 py-0.2 rounded border border-emerald-800/80">
                      Режим прораба
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                    Загрузите PDF проекта ➔ мгновенный аудит и расчёт сметы на замере
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  setIsAiScannerOpen(true);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs shrink-0 transition active:scale-95 cursor-pointer shadow-xs"
              >
                Скан проекта
              </button>
            </div>
          )}

          {/* 1. Базовые параметры объекта: Тип недвижимости и площадь */}
          <section id="sec-property" className="space-y-3 scroll-mt-24">
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
          </section>

          {/* 2. Выбор тарифа отделки с составом работ */}
          <section id="sec-tariff" className="space-y-3 scroll-mt-24">
            <RenovationClassCards
              classes={dynamicClasses}
              selectedId={selectedClassId}
              onSelect={(id) => setSelectedClassId(id)}
            />

            {/* Карточка-подсказка сравнения тарифов */}
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
          </section>

          {/* 3. Дополнительные опции и инженерия */}
          <section id="sec-options" className="space-y-3 scroll-mt-24">
            <AdditionalOptions
              options={dynamicOptions}
              area={area}
              onToggle={handleToggleOption}
            />

            {/* Сворачиваемые инженерные параметры */}
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
          </section>

          {/* 4. Финальная смета, фиксация цены и КП */}
          <section id="sec-estimate" className="space-y-3 scroll-mt-24">
            {/* Интерактивный аудит честной сметы: разоблачение уловок конкурентов */}
            <CompetitorTruthTable />

            {/* ГЛАВНЫЙ ИНЖЕНЕРНЫЙ ОФФЕР СМЕТЫ */}
            <div className="bg-zinc-900 text-white rounded-xl p-3 sm:p-3.5 border border-zinc-800 shadow-xl space-y-2.5 relative overflow-hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-2 py-0.5 rounded">
                      Итоговая смета под ключ
                    </span>
                    <span className="text-[11px] text-zinc-400 font-mono font-medium">
                      {calculation.area} м² • {calculation.propertyType === 'new' ? 'Новостройка' : 'Вторичка'}
                    </span>
                  </div>
                  <div className="text-xl sm:text-2xl font-extrabold font-mono tracking-tight text-white mt-0.5 flex items-baseline gap-2">
                    <span>{formatCurrency(estimateData.grandTotal)}</span>
                  </div>
                  <div className="text-[11px] text-zinc-300 font-medium flex items-center gap-2">
                    <span className="font-mono text-emerald-400 font-bold">~{Math.round(estimateData.grandTotal / calculation.area).toLocaleString('ru-RU')} ₽/м²</span>
                    <span className="text-zinc-600">•</span>
                    <span className="font-mono text-zinc-400">Срок: ~{calculation.estimatedDays.min}–{calculation.estimatedDays.max} дней</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setIsProposalOpen(true);
                    }}
                    className="p-1.5 sm:p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-emerald-400 transition shrink-0 active:scale-95 cursor-pointer"
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
                    className="p-1.5 sm:p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 transition shrink-0 active:scale-95 cursor-pointer"
                    title="Поделиться расчетом / сохранить в Telegram"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Инженерные триггеры надежности */}
              <div className="grid grid-cols-3 gap-1.5 pt-0.5 border-t border-zinc-800 text-center text-xs">
                <div className="p-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/50">
                  <div className="font-bold font-mono text-emerald-400 text-xs">0% аванс</div>
                  <div className="text-[9px] text-zinc-400 mt-0.5 leading-tight">Оплата по акту КС-2</div>
                </div>
                <div className="p-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/50">
                  <div className="font-bold text-white text-xs">Твёрдая цена</div>
                  <div className="text-[9px] text-zinc-400 mt-0.5 leading-tight">Фиксация в договоре</div>
                </div>
                <div className="p-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/50">
                  <div className="font-bold font-mono text-emerald-400 text-xs">36 мес.</div>
                  <div className="text-[9px] text-zinc-400 mt-0.5 leading-tight">СП 71.13330.2017</div>
                </div>
              </div>

              {/* Главная кнопка действия (Primary CTA) */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('heavy');
                  setIsBookingOpen(true);
                }}
                className="w-full py-2.5 px-3 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-zinc-950 rounded-xl font-extrabold text-xs sm:text-sm shadow-md shadow-emerald-950/40 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Calendar className="w-4 h-4 shrink-0" />
                <span>Записаться на бесплатный выезд инженера (0 ₽)</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
              <p className="text-[10px] text-center text-zinc-400 leading-tight">
                Инженер проведет замер лазером, проверит ровность стен и зафиксирует цену в договоре
              </p>
            </div>

            {/* Сертификат фиксации цены от удорожания по договору */}
            <PriceLockCard
              grandTotal={estimateData.grandTotal}
              worksTotal={estimateData.worksTotal}
              materialsTotal={estimateData.materialsTotal}
              area={calculation.area}
              estimatedDays={calculation.estimatedDays}
              onOpenBooking={() => setIsBookingOpen(true)}
              onOpenPrint={() => setIsProposalOpen(true)}
            />

            {/* Детальная смета по 35 пунктам ГОСТ */}
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

            {/* Социальное доказательство, гарантии и экспресс-аудит */}
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

            {/* Полный бюджет до заселения с мебелью */}
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
          </section>

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

        {/* AI Project Scanner Modal (Gemini Flash Multimodal) */}
        {isAiScannerOpen && (
          <AiProjectScannerModal
            isOpen={isAiScannerOpen}
            onClose={() => setIsAiScannerOpen(false)}
            onApplyToCalculator={(specs) => {
              setArea(specs.area);
              setPropertyType(specs.propertyType);
              setSelectedClassId(specs.classId);
              const bCount = (Math.min(3, Math.max(1, specs.bathrooms)) as 1 | 2 | 3);
              setBathroomsCount(bCount);
              setTimeout(() => {
                const el = document.getElementById('sec-estimate');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 100);
            }}
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
