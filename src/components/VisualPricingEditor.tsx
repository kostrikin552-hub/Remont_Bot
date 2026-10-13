import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Save,
  Check,
  RefreshCw,
  Building,
  Sliders,
  DollarSign,
  Sparkles,
  Info,
  Layers,
  Calculator,
  ShieldCheck,
} from 'lucide-react';
import { CompanyConfig, PricingRules, RenovationClassId } from '../types';
import { DEMO_COMPANIES, DEFAULT_COMPANY_ID, fetchCompanyData, saveCompanyPricing, updateCompanyProfile } from '../lib/supabase';
import { triggerHaptic } from '../utils/telegram';

interface VisualPricingEditorProps {
  initialCompanyId?: string;
  onBackToCalculator: () => void;
  onOpenAdmin?: () => void;
  isSuperAdmin?: boolean;
}

const DEFAULT_GOST_PRICING: PricingRules = {
  cosmeticPrice: 4500,
  capitalPrice: 8500,
  designerPrice: 15000,
  designProjectPrice: 2000,
  demolitionPrice: 1200,
  materialsPrice: 3500,
};

export function VisualPricingEditor({
  initialCompanyId = DEFAULT_COMPANY_ID,
  onBackToCalculator,
  onOpenAdmin,
  isSuperAdmin = false,
}: VisualPricingEditorProps) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(initialCompanyId);
  const [company, setCompany] = useState<CompanyConfig>(() => DEMO_COMPANIES[DEFAULT_COMPANY_ID].company);
  const [pricing, setPricing] = useState<PricingRules>(() => DEMO_COMPANIES[DEFAULT_COMPANY_ID].pricing);
  const [secondaryCoeff, setSecondaryCoeff] = useState<number>(1.15);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string>('');

  // Interactive Live Preview State
  const [previewArea, setPreviewArea] = useState<number>(54);
  const [previewPropertyType, setPreviewPropertyType] = useState<'new' | 'secondary'>('new');
  const [previewAddons, setPreviewAddons] = useState<{
    materials: boolean;
    demolition: boolean;
    design: boolean;
  }>({
    materials: true,
    demolition: false,
    design: false,
  });

  // Available companies list
  const [availableCompanies, setAvailableCompanies] = useState<Array<{ id: string; name: string; city: string; botUsername?: string }>>(() => {
    return Object.entries(DEMO_COMPANIES).map(([k, v]) => ({
      id: k,
      name: v.company.name,
      city: v.company.city,
      botUsername: v.company.botUsername,
    }));
  });

  // Load companies from localStorage (real ones added in admin)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('remontsaas_real_companies');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const mapped = parsed.map((c: any) => ({
            id: c.id,
            name: c.name,
            city: c.city,
            botUsername: c.botUsername,
          }));
          setAvailableCompanies((prev) => {
            const map = new Map<string, { id: string; name: string; city: string; botUsername?: string }>();
            prev.forEach((item) => map.set(item.id, item));
            mapped.forEach((item) => map.set(item.id, item));
            return Array.from(map.values());
          });
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Fetch company & pricing when selectedCompanyId changes
  useEffect(() => {
    let isCancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const res = await fetchCompanyData(selectedCompanyId);
        if (!isCancelled) {
          setCompany(res.company);
          setPricing(res.pricing);
          setSecondaryCoeff(res.company.secondaryCoeff || 1.15);
        }
      } catch (e) {
        console.error('Ошибка загрузки компании:', e);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      isCancelled = true;
    };
  }, [selectedCompanyId]);

  // Handle Save
  const handleSave = async () => {
    triggerHaptic('medium');
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      // 1. Save pricing rules to API + Supabase
      const priceRes = await saveCompanyPricing(company.id, pricing);

      // 2. Save secondary coeff & phone to company profile
      await updateCompanyProfile(company.id, {
        name: company.name,
        city: company.city,
        phone: company.phone,
        admin_chat_id: company.adminChatId,
      });

      // 3. Update localStorage so calculator gets immediate updates
      try {
        localStorage.setItem(`company_pricing_${company.id}`, JSON.stringify(pricing));
        localStorage.setItem(`company_pricing_${selectedCompanyId}`, JSON.stringify(pricing));
      } catch {}

      setSaveSuccess(true);
      setSaveMessage(priceRes.message || 'Расценки успешно сохранены в базе данных!');
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      console.error('Ошибка сохранения расценок:', err);
      setSaveMessage('Произошла ошибка при сохранении расценок');
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to default GOST rates
  const handleResetToGost = () => {
    triggerHaptic('selection');
    if (window.confirm('Сбросить все расценки к рекомендованным базовым ценам РФ?')) {
      setPricing(DEFAULT_GOST_PRICING);
      setSecondaryCoeff(1.15);
    }
  };

  // Calculation for live preview
  const currentCoeff = previewPropertyType === 'secondary' ? secondaryCoeff : 1.0;
  const calcClassTotal = (classId: RenovationClassId) => {
    let baseRate = pricing.capitalPrice;
    if (classId === 'cosmetic') baseRate = pricing.cosmeticPrice;
    if (classId === 'designer') baseRate = pricing.designerPrice;

    const worksCost = Math.round(previewArea * baseRate * currentCoeff);
    let addons = 0;
    if (previewAddons.materials) addons += previewArea * pricing.materialsPrice;
    if (previewAddons.demolition) addons += previewArea * pricing.demolitionPrice;
    if (previewAddons.design) addons += previewArea * pricing.designProjectPrice;

    return {
      worksCost,
      addonsCost: addons,
      total: worksCost + addons,
      ratePerMeter: Math.round((worksCost + addons) / previewArea),
    };
  };

  const cosmeticCalc = calcClassTotal('cosmetic');
  const capitalCalc = calcClassTotal('capital');
  const designerCalc = calcClassTotal('designer');

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-['Manrope',sans-serif] pb-24">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                triggerHaptic('light');
                onBackToCalculator();
              }}
              className="p-2 -ml-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition"
              title="Вернуться к калькулятору"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="text-sm font-extrabold text-zinc-950 dark:text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Визуальный редактор расценок</span>
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-sm">
                  Pro Pricing
                </span>
              </div>
              <div className="text-xs text-zinc-500 font-medium">
                Калибровка сметной формулы компании: <span className="font-bold text-zinc-800 dark:text-zinc-200">{company.name}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSuperAdmin && onOpenAdmin && (
              <button
                onClick={() => {
                  triggerHaptic('light');
                  onOpenAdmin();
                }}
                className="hidden sm:inline-flex px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                Админ-панель
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm ${
                saveSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100'
              }`}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Сохранение...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Сохранено!</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Сохранить расценки</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Save Notification */}
        {saveMessage && (
          <div
            className={`p-3 rounded-xl text-xs font-medium border flex items-center justify-between ${
              saveSuccess
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>{saveMessage}</span>
            </div>
            <button
              onClick={() => setSaveMessage('')}
              className="text-xs opacity-60 hover:opacity-100 ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Company Selector Strip */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-base text-zinc-900 dark:text-white shrink-0">
              {company.name.charAt(0)}
            </div>
            <div>
              <div className="text-xs text-zinc-500 font-medium">Редактируемый профиль компании:</div>
              <div className="text-sm font-bold text-zinc-950 dark:text-white flex items-center gap-2">
                <span>{company.name}</span>
                <span className="text-xs text-zinc-500">· {company.city}</span>
                {company.botUsername && (
                  <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400">
                    @{company.botUsername.replace('@', '')}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500 font-bold shrink-0">Выбрать бота:</label>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold text-zinc-900 dark:text-white focus:outline-none"
            >
              {availableCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.city})
                </option>
              ))}
            </select>
            <button
              onClick={handleResetToGost}
              title="Сбросить к рекомендованным ГОСТ ценам"
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-bold flex items-center gap-1 transition"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Сброс</span>
            </button>
          </div>
        </div>

        {/* Two-Column Editor Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Form Controls (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Section 1: Base Renovation Classes */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-zinc-950 dark:text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-600" />
                    <span>1. Базовые расценки на работы (₽ / м²)</span>
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Стоимость работ за 1 м² площади квартиры для новостройки без наценок
                  </p>
                </div>
              </div>

              {/* Cosmetic Rate */}
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      Косметический ремонт
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Чистовая отделка: обои, ламинат, розетки, натяжные потолки
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPricing({ ...pricing, cosmeticPrice: Math.max(1000, pricing.cosmeticPrice - 500) })}
                      className="w-7 h-7 rounded-lg bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 text-xs font-bold hover:bg-zinc-100"
                    >
                      -
                    </button>
                    <div className="relative">
                      <input
                        type="number"
                        step={100}
                        value={pricing.cosmeticPrice}
                        onChange={(e) => setPricing({ ...pricing, cosmeticPrice: Number(e.target.value) || 0 })}
                        className="w-24 px-2 py-1 bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg text-xs font-bold font-mono text-right pr-6"
                      />
                      <span className="absolute right-2 top-1 text-[11px] text-zinc-400 font-mono">₽</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPricing({ ...pricing, cosmeticPrice: pricing.cosmeticPrice + 500 })}
                      className="w-7 h-7 rounded-lg bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 text-xs font-bold hover:bg-zinc-100"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Capital Rate */}
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <span>Капитальный ремонт</span>
                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950 px-1.5 py-0.5 rounded-sm">
                        ХИТ ПРОДАЖ
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Штукатурка по маякам, стяжка, полная электрика, санузел под ключ
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPricing({ ...pricing, capitalPrice: Math.max(2000, pricing.capitalPrice - 500) })}
                      className="w-7 h-7 rounded-lg bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 text-xs font-bold hover:bg-zinc-100"
                    >
                      -
                    </button>
                    <div className="relative">
                      <input
                        type="number"
                        step={100}
                        value={pricing.capitalPrice}
                        onChange={(e) => setPricing({ ...pricing, capitalPrice: Number(e.target.value) || 0 })}
                        className="w-24 px-2 py-1 bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg text-xs font-bold font-mono text-right pr-6"
                      />
                      <span className="absolute right-2 top-1 text-[11px] text-zinc-400 font-mono">₽</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPricing({ ...pricing, capitalPrice: pricing.capitalPrice + 500 })}
                      className="w-7 h-7 rounded-lg bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 text-xs font-bold hover:bg-zinc-100"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Designer Rate */}
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      Дизайнерский ремонт
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Теневые профили, скрытые двери, керамогранит крупный формат, шумоизоляция
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPricing({ ...pricing, designerPrice: Math.max(5000, pricing.designerPrice - 1000) })}
                      className="w-7 h-7 rounded-lg bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 text-xs font-bold hover:bg-zinc-100"
                    >
                      -
                    </button>
                    <div className="relative">
                      <input
                        type="number"
                        step={500}
                        value={pricing.designerPrice}
                        onChange={(e) => setPricing({ ...pricing, designerPrice: Number(e.target.value) || 0 })}
                        className="w-24 px-2 py-1 bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg text-xs font-bold font-mono text-right pr-6"
                      />
                      <span className="absolute right-2 top-1 text-[11px] text-zinc-400 font-mono">₽</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPricing({ ...pricing, designerPrice: pricing.designerPrice + 1000 })}
                      className="w-7 h-7 rounded-lg bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 text-xs font-bold hover:bg-zinc-100"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Secondary Housing Multiplier */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4">
              <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <h2 className="text-sm font-bold text-zinc-950 dark:text-white flex items-center gap-2">
                  <Building className="w-4 h-4 text-amber-500" />
                  <span>2. Коэффициент наценки на вторичное жильё</span>
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Учитывает демонтаж старой отделки, неровности плит и замену ветхих коммуникаций
                </p>
              </div>

              <div className="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      Множитель вторички (k):
                    </div>
                    <div className="text-[11px] text-zinc-600 dark:text-zinc-400">
                      Наценка к стоимости всех работ: <span className="font-bold font-mono text-amber-700 dark:text-amber-300">+{Math.round((secondaryCoeff - 1) * 100)}%</span>
                    </div>
                  </div>
                  <div className="text-sm font-extrabold font-mono text-amber-600 dark:text-amber-400">
                    k = {secondaryCoeff.toFixed(2)}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-mono text-zinc-400">1.00</span>
                  <input
                    type="range"
                    min="1.00"
                    max="1.45"
                    step="0.01"
                    value={secondaryCoeff}
                    onChange={(e) => setSecondaryCoeff(Number(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <span className="text-[11px] font-mono text-zinc-400">1.45</span>
                </div>
              </div>
            </div>

            {/* Section 3: Add-on services & rough materials */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4">
              <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <h2 className="text-sm font-bold text-zinc-950 dark:text-white flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-blue-500" />
                  <span>3. Сопутствующие услуги и материалы (₽ / м²)</span>
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Опциональные пункты сметы, которые клиент может включить или исключить
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Rough Materials */}
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700/60 space-y-1.5">
                  <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    Черновые материалы
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    Смеси, гипсокартон, кабель
                  </div>
                  <div className="relative pt-1">
                    <input
                      type="number"
                      step={100}
                      value={pricing.materialsPrice}
                      onChange={(e) => setPricing({ ...pricing, materialsPrice: Number(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg text-xs font-bold font-mono text-right pr-6"
                    />
                    <span className="absolute right-2 top-2.5 text-[11px] text-zinc-400 font-mono">₽</span>
                  </div>
                </div>

                {/* Demolition */}
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700/60 space-y-1.5">
                  <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    Демонтажные работы
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    Снос перегородок, стяжки
                  </div>
                  <div className="relative pt-1">
                    <input
                      type="number"
                      step={100}
                      value={pricing.demolitionPrice}
                      onChange={(e) => setPricing({ ...pricing, demolitionPrice: Number(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg text-xs font-bold font-mono text-right pr-6"
                    />
                    <span className="absolute right-2 top-2.5 text-[11px] text-zinc-400 font-mono">₽</span>
                  </div>
                </div>

                {/* Design Project */}
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700/60 space-y-1.5">
                  <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    Дизайн-проект 3D
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    Планировка + визуализация
                  </div>
                  <div className="relative pt-1">
                    <input
                      type="number"
                      step={100}
                      value={pricing.designProjectPrice}
                      onChange={(e) => setPricing({ ...pricing, designProjectPrice: Number(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg text-xs font-bold font-mono text-right pr-6"
                    />
                    <span className="absolute right-2 top-2.5 text-[11px] text-zinc-400 font-mono">₽</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Live Interactive Estimate Preview (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-zinc-900 text-white rounded-2xl p-5 border border-zinc-800 shadow-xl space-y-4 sticky top-20">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                    Живой предпросмотр сметы
                  </span>
                </div>
                <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 rounded-sm">
                  LIVE SYNC
                </span>
              </div>

              {/* Controls for Preview Area & Property Type */}
              <div className="space-y-3">
                <div>
                  <div className="text-[11px] font-bold text-zinc-400 mb-1.5">Площадь квартиры для теста:</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[35, 54, 75, 100].map((m2) => (
                      <button
                        key={m2}
                        type="button"
                        onClick={() => setPreviewArea(m2)}
                        className={`py-1 text-xs font-mono font-bold rounded-lg transition ${
                          previewArea === m2
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {m2} м²
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPreviewPropertyType('new')}
                    className={`py-1.5 text-xs font-bold rounded-lg transition ${
                      previewPropertyType === 'new'
                        ? 'bg-zinc-800 text-white border border-zinc-700'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    🏢 Новостройка (x1.0)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewPropertyType('secondary')}
                    className={`py-1.5 text-xs font-bold rounded-lg transition ${
                      previewPropertyType === 'secondary'
                        ? 'bg-amber-950/60 text-amber-300 border border-amber-800/60'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    🏚 Вторичка (x{secondaryCoeff.toFixed(2)})
                  </button>
                </div>

                {/* Additional options toggle */}
                <div className="flex items-center gap-3 text-[11px] pt-1">
                  <label className="flex items-center gap-1.5 text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={previewAddons.materials}
                      onChange={(e) => setPreviewAddons({ ...previewAddons, materials: e.target.checked })}
                      className="rounded accent-emerald-500"
                    />
                    <span>+ Черновые материалы</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={previewAddons.demolition}
                      onChange={(e) => setPreviewAddons({ ...previewAddons, demolition: e.target.checked })}
                      className="rounded accent-emerald-500"
                    />
                    <span>+ Демонтаж</span>
                  </label>
                </div>
              </div>

              {/* Live Calculated Cards */}
              <div className="space-y-2.5 pt-2 border-t border-zinc-800">
                {/* Cosmetic Card */}
                <div className="p-3 rounded-xl bg-zinc-800/60 border border-zinc-700/60 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-zinc-200">Косметический</div>
                    <div className="text-[10px] text-zinc-400 font-mono">
                      Работы: {cosmeticCalc.worksCost.toLocaleString()} ₽
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold font-mono text-zinc-100">
                      {cosmeticCalc.total.toLocaleString()} ₽
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono">
                      ~{cosmeticCalc.ratePerMeter.toLocaleString()} ₽/м²
                    </div>
                  </div>
                </div>

                {/* Capital Card (Highlighted) */}
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-700/60 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-emerald-300 flex items-center gap-1">
                      <span>Капитальный</span>
                      <span className="text-[9px] bg-emerald-600 text-white px-1 rounded-xs font-bold">ХИТ</span>
                    </div>
                    <div className="text-[10px] text-emerald-400/80 font-mono">
                      Работы: {capitalCalc.worksCost.toLocaleString()} ₽
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-extrabold font-mono text-emerald-400">
                      {capitalCalc.total.toLocaleString()} ₽
                    </div>
                    <div className="text-[10px] text-emerald-400/80 font-mono">
                      ~{capitalCalc.ratePerMeter.toLocaleString()} ₽/м²
                    </div>
                  </div>
                </div>

                {/* Designer Card */}
                <div className="p-3 rounded-xl bg-zinc-800/60 border border-zinc-700/60 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-zinc-200">Дизайнерский</div>
                    <div className="text-[10px] text-zinc-400 font-mono">
                      Работы: {designerCalc.worksCost.toLocaleString()} ₽
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold font-mono text-zinc-100">
                      {designerCalc.total.toLocaleString()} ₽
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono">
                      ~{designerCalc.ratePerMeter.toLocaleString()} ₽/м²
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Info Box */}
              <div className="p-2.5 rounded-lg bg-zinc-800/40 text-[11px] text-zinc-400 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                <span>
                  Именно эти итоговые суммы с точностью до 1 ₽ увидят заказчики при расчете в Mini App и боте.
                </span>
              </div>

              {/* Bottom Save Action */}
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md"
              >
                {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Применить расценки для {company.name}</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
