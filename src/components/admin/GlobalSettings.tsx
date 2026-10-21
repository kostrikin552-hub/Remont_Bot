import { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Plus,
  Save,
  RotateCcw,
  Trash2,
  Edit2,
  Check,
  Building2,
  SlidersHorizontal,
  Bot,
  Sparkles,
  Layers,
  Shield,
  HelpCircle,
  Copy,
  FolderOpen,
} from 'lucide-react';
import { TenantCompany } from '../../types/admin';
import { EstimateItem, EstimateCategoryType, PricingRules, RenovationClassId } from '../../types';
import {
  DEFAULT_ESTIMATE_CATALOG,
  getCompanyEstimateItems,
  saveCompanyEstimateItems,
} from '../../utils/estimates';
import { DEMO_COMPANIES, DEFAULT_COMPANY_ID, saveCompanyPricing } from '../../lib/supabase';
import { triggerHaptic } from '../../utils/telegram';
import { SUPERADMIN_TELEGRAM_ID } from '../../utils/auth';

interface GlobalSettingsProps {
  companies?: TenantCompany[];
  selectedCompanyId?: string;
  onUpdateCompany?: (updated: TenantCompany) => void;
  onShowToast?: (msg: string) => void;
}

const CATEGORY_LABELS: Record<EstimateCategoryType, { title: string; icon: string }> = {
  demolition: { title: 'Демонтаж и подготовка', icon: '🔨' },
  rough: { title: 'Черновые работы и геометрия', icon: '🧱' },
  engineering: { title: 'Инженерные сети (электрика/сантехника)', icon: '⚡' },
  finishing: { title: 'Чистовая отделка', icon: '🎨' },
  materials: { title: 'Черновые строительные материалы', icon: '📦' },
};

export function GlobalSettings({
  companies = [],
  selectedCompanyId: propSelectedCompanyId,
  onUpdateCompany,
  onShowToast,
}: GlobalSettingsProps) {
  // Current active company for editing prices (or 'default' for base template)
  const [activeCompanyId, setActiveCompanyId] = useState<string>(() => {
    return propSelectedCompanyId || (companies.length > 0 ? companies[0].id : DEFAULT_COMPANY_ID);
  });

  useEffect(() => {
    if (propSelectedCompanyId) {
      setActiveCompanyId(propSelectedCompanyId);
    }
  }, [propSelectedCompanyId]);

  // Pricing rules state for the active company
  const [pricing, setPricing] = useState<PricingRules>(() => {
    const fallback = DEMO_COMPANIES[DEFAULT_COMPANY_ID]?.pricing || {
      cosmeticPrice: 4500,
      capitalPrice: 8500,
      designerPrice: 15000,
      materialsPrice: 3500,
      demolitionPrice: 1200,
      designProjectPrice: 2000,
    };

    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(`company_pricing_${activeCompanyId}`);
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return fallback;
  });

  // Estimate items catalog for the active company
  const [items, setItems] = useState<EstimateItem[]>(() => {
    return getCompanyEstimateItems(activeCompanyId, pricing);
  });

  // Reload pricing and estimate items when active company changes
  useEffect(() => {
    const fallback = DEMO_COMPANIES[activeCompanyId]?.pricing || DEMO_COMPANIES[DEFAULT_COMPANY_ID]?.pricing || {
      cosmeticPrice: 4500,
      capitalPrice: 8500,
      designerPrice: 15000,
      materialsPrice: 3500,
      demolitionPrice: 1200,
      designProjectPrice: 2000,
    };

    let resolvedPricing = fallback;
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(`company_pricing_${activeCompanyId}`);
        if (stored) {
          resolvedPricing = JSON.parse(stored);
        }
      } catch {}
    }

    setPricing(resolvedPricing);
    setItems(getCompanyEstimateItems(activeCompanyId, resolvedPricing));
  }, [activeCompanyId]);

  // Secondary Coefficient (Вторичка)
  const [secondaryCoeff, setSecondaryCoeff] = useState<number>(() => {
    const match = companies.find((c) => c.id === activeCompanyId);
    return match?.pricingMultiplier || 1.15;
  });

  // Search & Filter in items
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // New Service Modal
  const [isAddServiceOpen, setIsAddServiceOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<EstimateCategoryType>('rough');
  const [newUnit, setNewUnit] = useState('м²');
  const [newPrice, setNewPrice] = useState(500);
  const [newRatio, setNewRatio] = useState(1.0);
  const [newDesc, setNewDesc] = useState('');

  // Editing existing service
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editPriceVal, setEditPriceVal] = useState<number>(0);
  const [editTitleVal, setEditTitleVal] = useState<string>('');
  const [editUnitVal, setEditUnitVal] = useState<string>('м²');
  const [editRatioVal, setEditRatioVal] = useState<number>(1.0);

  const [savedNotice, setSavedNotice] = useState(false);

  const activeCompany = companies.find((c) => c.id === activeCompanyId);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchSearch =
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchCat = filterCategory === 'all' || item.category === filterCategory;
      return matchSearch && matchCat;
    });
  }, [items, searchQuery, filterCategory]);

  const handleSaveAll = () => {
    triggerHaptic('heavy');

    // 1. Save pricing rules to API & Supabase
    saveCompanyPricing(activeCompanyId, pricing).catch((err) => {
      console.warn('saveCompanyPricing error:', err);
    });

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`company_pricing_${activeCompanyId}`, JSON.stringify(pricing));
      } catch (e) {
        console.error('Error saving pricing rules:', e);
      }
    }

    // 2. Save items catalog
    saveCompanyEstimateItems(activeCompanyId, items);

    // 3. Update company in state if applicable
    if (activeCompany && onUpdateCompany) {
      onUpdateCompany({
        ...activeCompany,
        pricingMultiplier: secondaryCoeff,
      });
    }

    setSavedNotice(true);
    if (onShowToast) {
      onShowToast(`Расценки и услуги для бота «${activeCompany?.name || 'Шаблон'}» успешно сохранены!`);
    }
    setTimeout(() => setSavedNotice(false), 3000);
  };

  const handleResetToGost = () => {
    if (
      window.confirm(
        'Сбросить все расценки и услуги данного бота к базовому технологическому каталогу ГОСТ?'
      )
    ) {
      const basePricing: PricingRules = {
        cosmeticPrice: 4500,
        capitalPrice: 8500,
        designerPrice: 15000,
        materialsPrice: 3500,
        demolitionPrice: 1200,
        designProjectPrice: 2000,
      };
      setPricing(basePricing);
      const resetItems = DEFAULT_ESTIMATE_CATALOG.map((i) => ({ ...i }));
      setItems(resetItems);
      saveCompanyEstimateItems(activeCompanyId, resetItems);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`company_pricing_${activeCompanyId}`, JSON.stringify(basePricing));
      }
      if (onShowToast) {
        onShowToast('Расценки сброшены к стандарту ГОСТ!');
      }
    }
  };

  const handleStartEditItem = (item: EstimateItem) => {
    setEditingItemId(item.id);
    setEditPriceVal(item.unitPrice);
    setEditTitleVal(item.title);
    setEditUnitVal(item.unit);
    setEditRatioVal(item.quantityRatio);
  };

  const handleSaveItemEdit = (id: string) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              unitPrice: Number(editPriceVal) || i.unitPrice,
              title: editTitleVal.trim() || i.title,
              unit: editUnitVal.trim() || i.unit,
              quantityRatio: Number(editRatioVal) || i.quantityRatio,
            }
          : i
      )
    );
    setEditingItemId(null);
  };

  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleCreateNewService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newItem: EstimateItem = {
      id: `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      category: newCategory,
      title: newTitle.trim(),
      unit: newUnit.trim() || 'м²',
      quantityRatio: Number(newRatio) || 1.0,
      unitPrice: Number(newPrice) || 500,
      tariffApplicability: ['cosmetic', 'capital', 'designer'],
      description: newDesc.trim() || 'Индивидуальная позиция сметы компании',
    };

    setItems((prev) => [newItem, ...prev]);
    setIsAddServiceOpen(false);
    setNewTitle('');
    setNewDesc('');
    setNewPrice(500);
    setNewRatio(1.0);
    if (onShowToast) {
      onShowToast(`Услуга «${newItem.title}» добавлена в смету! Не забудьте сохранить.`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Save Control */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-zinc-950 dark:text-white">
                  Управление услугами, расценками & ГОСТ-сметами
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold">
                  Ручной редактор
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Полный контроль над ценами за м², пакетами отделки и любой строкой официальной сметы для конкретного бота.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleResetToGost}
              className="px-3 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold text-xs transition flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Сбросить к ГОСТ</span>
            </button>
            <button
              onClick={handleSaveAll}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Сохранить все расценки</span>
            </button>
          </div>
        </div>

        {savedNotice && (
          <div className="mt-3 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>Все услуги и цены успешно сохранены и привязаны к боту!</span>
          </div>
        )}

        {/* Bot / Company Selector Bar */}
        <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
              Выбранный бот:
            </span>
            <select
              value={activeCompanyId}
              onChange={(e) => setActiveCompanyId(e.target.value)}
              className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.city}) — @{c.botUsername}
                </option>
              ))}
              <option value="remont-pro">РемонтПро (Базовый шаблон)</option>
            </select>
          </div>

          <div className="text-[11px] text-zinc-500 font-medium flex items-center gap-1">
            <Bot className="w-3.5 h-3.5 text-emerald-500" />
            <span>
              Редактируются эксклюзивные цены для бота компании{' '}
              <strong className="text-zinc-900 dark:text-white">
                {activeCompany?.name || 'РемонтПро'}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Block 1: Base Packages & Main Works (₽/м²) */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">🏷</span>
            <h3 className="font-bold text-sm text-zinc-950 dark:text-white">
              Базовые пакеты отделки под ключ (₽ за м² площади пола)
            </h3>
          </div>
          <span className="text-[10px] text-zinc-400 font-medium">
            Обновляется в реальном времени
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Cosmetic */}
          <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-zinc-900 dark:text-white">
                Косметический ремонт
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold">
                Эконом
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number"
                value={pricing.cosmeticPrice}
                onChange={(e) =>
                  setPricing({ ...pricing, cosmeticPrice: Number(e.target.value) || 0 })
                }
                className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-black text-zinc-950 dark:text-white focus:outline-none"
              />
              <span className="text-xs text-zinc-400 font-bold shrink-0">₽/м²</span>
            </div>
            <p className="text-[10px] text-zinc-500 mt-1.5 leading-snug">
              Обновление финишных покрытий без переноса стен и сантехники.
            </p>
          </div>

          {/* Capital */}
          <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-zinc-900 dark:text-white">
                Капитальный ремонт
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold">
                Хит продаж
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number"
                value={pricing.capitalPrice}
                onChange={(e) =>
                  setPricing({ ...pricing, capitalPrice: Number(e.target.value) || 0 })
                }
                className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-black text-zinc-950 dark:text-white focus:outline-none"
              />
              <span className="text-xs text-zinc-400 font-bold shrink-0">₽/м²</span>
            </div>
            <p className="text-[10px] text-zinc-500 mt-1.5 leading-snug">
              Выравнивание стен по маякам 90°, новая электрика и сантехразводка под ключ.
            </p>
          </div>

          {/* Designer */}
          <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-zinc-900 dark:text-white">
                Дизайнерский ремонт
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 font-bold">
                Премиум
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number"
                value={pricing.designerPrice}
                onChange={(e) =>
                  setPricing({ ...pricing, designerPrice: Number(e.target.value) || 0 })
                }
                className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-black text-zinc-950 dark:text-white focus:outline-none"
              />
              <span className="text-xs text-zinc-400 font-bold shrink-0">₽/м²</span>
            </div>
            <p className="text-[10px] text-zinc-500 mt-1.5 leading-snug">
              Сложные инженерные узлы, теневые плинтусы, крупноформатный керамогранит.
            </p>
          </div>
        </div>

        {/* Additional Works Rates */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <div className="p-2.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
            <span className="text-[10px] text-zinc-500 block">Черновые материалы:</span>
            <div className="flex items-center gap-1 mt-1">
              <input
                type="number"
                value={pricing.materialsPrice}
                onChange={(e) =>
                  setPricing({ ...pricing, materialsPrice: Number(e.target.value) || 0 })
                }
                className="w-full px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-bold"
              />
              <span className="text-[10px] text-zinc-400">₽/м²</span>
            </div>
          </div>

          <div className="p-2.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
            <span className="text-[10px] text-zinc-500 block">Демонтажные работы:</span>
            <div className="flex items-center gap-1 mt-1">
              <input
                type="number"
                value={pricing.demolitionPrice}
                onChange={(e) =>
                  setPricing({ ...pricing, demolitionPrice: Number(e.target.value) || 0 })
                }
                className="w-full px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-bold"
              />
              <span className="text-[10px] text-zinc-400">₽/м²</span>
            </div>
          </div>

          <div className="p-2.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
            <span className="text-[10px] text-zinc-500 block">Дизайн-проект интерьера:</span>
            <div className="flex items-center gap-1 mt-1">
              <input
                type="number"
                value={pricing.designProjectPrice}
                onChange={(e) =>
                  setPricing({ ...pricing, designProjectPrice: Number(e.target.value) || 0 })
                }
                className="w-full px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-bold"
              />
              <span className="text-[10px] text-zinc-400">₽/м²</span>
            </div>
          </div>

          <div className="p-2.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
            <span className="text-[10px] text-zinc-500 block">Коэф. вторички (старый фонд):</span>
            <div className="flex items-center gap-1 mt-1">
              <input
                type="number"
                step="0.05"
                value={secondaryCoeff}
                onChange={(e) => setSecondaryCoeff(Number(e.target.value) || 1.15)}
                className="w-full px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-bold"
              />
              <span className="text-[10px] text-zinc-400">x</span>
            </div>
          </div>
        </div>
      </div>

      {/* Block 2: Complete Interactive Estimate Catalog (ГОСТ) */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base">📋</span>
              <h3 className="font-bold text-sm text-zinc-950 dark:text-white">
                Каталог абсолютно всех услуг и технологических позиций сметы
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold">
                Позиций: {items.length}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Вы можете редактировать расценку любой работы, единицы измерения, а также добавлять новые услуги.
            </p>
          </div>

          <button
            onClick={() => {
              triggerHaptic('medium');
              setIsAddServiceOpen(true);
            }}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition shadow-xs flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Добавить услугу</span>
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-1">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по названию или описанию работы..."
              className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setFilterCategory('all')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition shrink-0 ${
                filterCategory === 'all'
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              Все ({items.length})
            </button>
            {(Object.keys(CATEGORY_LABELS) as EstimateCategoryType[]).map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition shrink-0 flex items-center gap-1 ${
                  filterCategory === cat
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                }`}
              >
                <span>{CATEGORY_LABELS[cat].icon}</span>
                <span>{CATEGORY_LABELS[cat].title.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Services List Table */}
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden mt-2">
          <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 text-[10px] font-bold uppercase tracking-wider z-10">
                <tr>
                  <th className="py-2.5 px-3">Категория</th>
                  <th className="py-2.5 px-3">Наименование работы</th>
                  <th className="py-2.5 px-3">Ед. изм.</th>
                  <th className="py-2.5 px-3">Расход (x)</th>
                  <th className="py-2.5 px-3">Расценка (₽)</th>
                  <th className="py-2.5 px-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredItems.map((item) => {
                  const isEditing = editingItemId === item.id;
                  const catMeta = CATEGORY_LABELS[item.category] || {
                    title: item.category,
                    icon: '⚙️',
                  };

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                          <span>{catMeta.icon}</span>
                          <span className="hidden sm:inline">{catMeta.title.split(' ')[0]}</span>
                        </span>
                      </td>

                      <td className="py-2 px-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editTitleVal}
                            onChange={(e) => setEditTitleVal(e.target.value)}
                            className="w-full px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-semibold"
                          />
                        ) : (
                          <div>
                            <span className="font-bold text-zinc-900 dark:text-white block">
                              {item.title}
                            </span>
                            {item.description && (
                              <span className="text-[10px] text-zinc-500 block leading-tight">
                                {item.description}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-2 px-3 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editUnitVal}
                            onChange={(e) => setEditUnitVal(e.target.value)}
                            className="w-16 px-1.5 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-mono"
                          />
                        ) : (
                          <span className="text-zinc-600 dark:text-zinc-400 font-mono text-[11px]">
                            {item.unit}
                          </span>
                        )}
                      </td>

                      <td className="py-2 px-3 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.05"
                            value={editRatioVal}
                            onChange={(e) => setEditRatioVal(Number(e.target.value))}
                            className="w-16 px-1.5 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-mono"
                          />
                        ) : (
                          <span className="text-zinc-500 font-mono text-[11px]">
                            ×{item.quantityRatio}
                          </span>
                        )}
                      </td>

                      <td className="py-2 px-3 whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={editPriceVal}
                              onChange={(e) => setEditPriceVal(Number(e.target.value))}
                              className="w-24 px-2 py-1 bg-white dark:bg-zinc-900 border border-emerald-500 rounded text-xs font-black text-emerald-600"
                            />
                            <span className="text-zinc-400 text-[10px]">₽</span>
                          </div>
                        ) : (
                          <span className="font-extrabold text-xs text-zinc-950 dark:text-white tabular-nums">
                            {item.unitPrice.toLocaleString('ru-RU')} ₽
                          </span>
                        )}
                      </td>

                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {isEditing ? (
                            <button
                              onClick={() => handleSaveItemEdit(item.id)}
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold flex items-center gap-1 shadow-xs"
                            >
                              <Check className="w-3 h-3" />
                              <span>OK</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStartEditItem(item)}
                              className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 rounded transition"
                              title="Редактировать работу"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1 hover:bg-red-50 dark:hover:bg-red-950/60 text-red-500 rounded transition"
                            title="Удалить услугу из сметы"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal: Add New Service */}
      {isAddServiceOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-5 max-w-md w-full border border-zinc-200 dark:border-zinc-800 shadow-2xl animate-in zoom-in-95 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800 mb-3.5">
              <h3 className="font-bold text-sm text-zinc-950 dark:text-white flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>Добавление новой услуги в смету</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddServiceOpen(false)}
                className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex items-center justify-center hover:text-zinc-900"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNewService} className="space-y-3">
              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                  Категория работ:
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as EstimateCategoryType)}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                >
                  <option value="demolition">🔨 Демонтаж и подготовка</option>
                  <option value="rough">🧱 Черновые работы и выравнивание</option>
                  <option value="engineering">⚡ Инженерные сети (электрика / сантехника)</option>
                  <option value="finishing">🎨 Чистовая отделка</option>
                  <option value="materials">📦 Черновые строительные материалы</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                  Название работы: <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Например: Монтаж шумоизоляции пола Шуманет"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                    Ед. изм.:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="м²"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                    Цена (₽):
                  </label>
                  <input
                    type="number"
                    required
                    value={newPrice}
                    onChange={(e) => setNewPrice(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                    Расход/м²:
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    required
                    value={newRatio}
                    onChange={(e) => setNewRatio(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                  Описание технологии / ГОСТ:
                </label>
                <textarea
                  rows={2}
                  placeholder="Краткое пояснение технологии выполнения работы..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsAddServiceOpen(false)}
                  className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  Добавить в смету
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
