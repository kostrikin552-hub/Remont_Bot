import React, { useState } from 'react';
import {
  Copy,
  Check,
  Printer,
  ChevronDown,
  ArrowRight,
  ShieldCheck,
  SlidersHorizontal,
  RefreshCw,
  Share2,
  Users,
  Building2,
  Sparkles,
} from 'lucide-react';
import {
  CalculationResult,
  CompanyConfig,
  PricingRules,
  EstimateItem,
  EstimateCategoryGroup,
} from '../types';
import {
  formatTextEstimate,
} from '../utils/estimates';
import { formatCurrency, triggerHaptic, getDetectedBotUsername } from '../utils/telegram';

interface DetailedEstimateSectionProps {
  result: CalculationResult;
  company: CompanyConfig;
  pricing: PricingRules;
  items: EstimateItem[];
  onUpdateItems: (newItems: EstimateItem[]) => void;
  onResetItems: () => void;
  excludedItemIds: string[];
  onToggleItemExclusion: (itemId: string) => void;
  onRestoreAllItems: () => void;
  estimateData: {
    groups: EstimateCategoryGroup[];
    grandTotal: number;
    worksTotal: number;
    materialsTotal: number;
    totalPositions: number;
    activePositions: number;
    excludedCount: number;
    savingsTotal: number;
  };
  onOpenBooking: () => void;
  onOpenShare?: () => void;
}

export const DetailedEstimateSection: React.FC<DetailedEstimateSectionProps> = ({
  result,
  company,
  items,
  onUpdateItems,
  onResetItems,
  excludedItemIds,
  onToggleItemExclusion,
  onRestoreAllItems,
  estimateData,
  onOpenBooking,
  onOpenShare,
}) => {
  const [copied, setCopied] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [isEditorOpen, setIsEditorOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      return p.get('pro_mode') === 'true' || p.get('pro_mode') === '1' || p.get('admin') === '1';
    }
    return false;
  });
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editPriceVal, setEditPriceVal] = useState<string>('');
  const [saveSuccessToast, setSaveSuccessToast] = useState(false);

  const toggleCategory = (catKey: string) => {
    triggerHaptic('light');
    setCollapsedCategories((prev) => ({
      ...prev,
      [catKey]: !prev[catKey],
    }));
  };

  const botUsername = getDetectedBotUsername(company.botUsername, company.id);

  const handleCopy = () => {
    triggerHaptic('success');
    const text = formatTextEstimate(
      company.name,
      result.area,
      result.propertyType,
      result.renovationClass.title,
      estimateData.groups,
      estimateData.grandTotal,
      botUsername
    );
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handlePrint = () => {
    triggerHaptic('light');
    window.print();
  };

  const handleStartEditPrice = (item: EstimateItem) => {
    setEditingItemId(item.id);
    setEditPriceVal(String(item.unitPrice));
  };

  const handleSavePrice = (itemId: string) => {
    const num = parseInt(editPriceVal, 10);
    if (!isNaN(num) && num >= 0) {
      const updated = items.map((it) => (it.id === itemId ? { ...it, unitPrice: num } : it));
      onUpdateItems(updated);
      triggerHaptic('medium');
    }
    setEditingItemId(null);
  };

  const handleAdjustAllPrices = (percent: number) => {
    triggerHaptic('medium');
    const factor = 1 + percent / 100;
    const updated = items.map((it) => ({
      ...it,
      unitPrice: Math.max(10, Math.round((it.unitPrice * factor) / 10) * 10),
    }));
    onUpdateItems(updated);
    setSaveSuccessToast(true);
    setTimeout(() => setSaveSuccessToast(false), 3000);
  };

  const handleSaveAllPrices = () => {
    triggerHaptic('success');
    onUpdateItems(items);
    setSaveSuccessToast(true);
    setTimeout(() => setSaveSuccessToast(false), 3500);

    // Optional sync to backend API if available
    if (typeof window !== 'undefined') {
      try {
        fetch(`/api/companies/${company.id}/pricing`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items,
            company_id: company.id,
          }),
        }).catch(() => {});
      } catch {}
    }
  };

  const pricePerMeter = result.area > 0 ? Math.round(estimateData.grandTotal / result.area) : 0;

  return (
    <div id="estimate-breakdown" className="space-y-2.5 pt-1">
      {/* 1. Header Card with Toolbar */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-md bg-zinc-900 text-white dark:bg-white dark:text-zinc-950">
                {company.badgeText || 'ГОСТ'}
              </span>
              <span className="text-xs sm:text-sm font-bold text-zinc-950 dark:text-white">
                Смета работ и материалов
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Строго по расценкам {company.name} · {result.area} м²
            </p>
          </div>

          {/* Quick Action Toolbar */}
          <div className="flex items-center gap-1">
            {onOpenShare && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenShare();
                }}
                className="py-1.5 px-2.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold flex items-center gap-1 transition active:scale-95"
                title="Поделиться сметным расчётом"
              >
                <Share2 className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                <span className="text-[11px]">Шеринг</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCopy}
              className="py-1.5 px-2.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold flex items-center gap-1 transition active:scale-95"
              title="Копировать смету"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-600 dark:text-emerald-400 text-[11px]">Скопировано</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                  <span className="text-[11px]">Копия</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="py-1.5 px-2.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold flex items-center gap-1 transition active:scale-95"
              title="Печать или сохранение в PDF"
            >
              <Printer className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
              <span className="text-[11px]">PDF</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setIsEditorOpen(!isEditorOpen);
              }}
              className={`py-1.5 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 transition active:scale-95 ${
                isEditorOpen
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200'
              }`}
              title="Admin Pro Mode: точечная калибровка расценок компании"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="text-[11px]">✏️ Режим цен</span>
            </button>
          </div>
        </div>

        {/* Client exclusion savings banner */}
        {estimateData.excludedCount > 0 && (
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-900 dark:text-emerald-300 flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold">Исключено работ: {estimateData.excludedCount}</span>
              <span className="text-[11px] opacity-85">
                (экономия {formatCurrency(estimateData.savingsTotal)})
              </span>
            </div>
            <button
              type="button"
              onClick={onRestoreAllItems}
              className="underline font-bold text-[11px] shrink-0 ml-2 hover:opacity-80"
            >
              Вернуть все
            </button>
          </div>
        )}

        {/* Pro Mode Banner */}
        {isEditorOpen && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs space-y-2 animate-in fade-in">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-500 text-white">
                    PRO РЕЖИМ
                  </span>
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">
                    Калибровка расценок прораба
                  </span>
                </div>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-1 leading-snug">
                  Тапайте по ставкам в строках сметы, чтобы изменить цены. Или откалибруйте все расценки сразу:
                </p>
              </div>

              <button
                type="button"
                onClick={onResetItems}
                className="underline font-bold text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 shrink-0 flex items-center gap-0.5"
                title="Сбросить к исходным эталонам"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Сброс</span>
              </button>
            </div>

            {/* Quick calibration buttons */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <button
                type="button"
                onClick={() => handleAdjustAllPrices(10)}
                className="py-1 px-2.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-bold text-[11px] transition active:scale-95"
              >
                +10% ко всем
              </button>
              <button
                type="button"
                onClick={() => handleAdjustAllPrices(-10)}
                className="py-1 px-2.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-bold text-[11px] transition active:scale-95"
              >
                -10% ко всем
              </button>
              <button
                type="button"
                onClick={handleSaveAllPrices}
                className="py-1 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] ml-auto transition active:scale-95 shadow-xs flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                <span>Сохранить мои цены</span>
              </button>
            </div>

            {saveSuccessToast && (
              <div className="p-2 bg-emerald-500/15 border border-emerald-500/40 rounded-lg text-emerald-800 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1.5 animate-in fade-in">
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Ваши базовые расценки успешно сохранены и зафиксированы для всех новых смет!</span>
              </div>
            )}
          </div>
        )}

        {/* Client Transparency Notice */}
        <div className="flex items-center gap-2 pt-0.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-snug">
            Снимайте галочки с работ, которые хотите сделать сами — калькулятор моментально пересчитает итоговую сумму.
          </p>
        </div>
      </div>

      {/* 2. Itemized Work Categories */}
      <div className="space-y-2">
        {estimateData.groups.map((group) => {
          const isCollapsed = Boolean(collapsedCategories[group.category]);
          const activeInGroup = group.items.filter((ci) => !ci.excluded).length;
          const hasExcludedInGroup = activeInGroup < group.items.length;

          return (
            <div
              key={group.category}
              className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden transition"
            >
              {/* Category Header Button */}
              <button
                type="button"
                onClick={() => toggleCategory(group.category)}
                className="w-full p-3 flex items-center justify-between text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-xs sm:text-sm text-zinc-950 dark:text-white">
                      {group.title}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-md font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                      {hasExcludedInGroup
                        ? `${activeInGroup} из ${group.items.length} поз.`
                        : `${group.items.length} поз.`}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug break-words">
                    {group.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs sm:text-sm font-extrabold text-zinc-950 dark:text-white tabular-nums">
                    {formatCurrency(group.totalCost)}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
                      isCollapsed ? '-rotate-90' : ''
                    }`}
                  />
                </div>
              </button>

              {/* Items List */}
              {!isCollapsed && (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border-t border-zinc-100 dark:border-zinc-800/80 px-3">
                  {group.items.map((ci) => {
                    const isEditingThis = editingItemId === ci.item.id;
                    const isExcluded = Boolean(ci.excluded);

                    return (
                      <div
                        key={ci.item.id}
                        className={`py-2.5 text-xs flex items-start sm:items-center justify-between gap-2.5 transition ${
                          isExcluded ? 'opacity-60 bg-zinc-50/50 dark:bg-zinc-800/20 -mx-3 px-3' : ''
                        }`}
                      >
                        {/* Checkbox for Client to include/exclude position */}
                        <button
                          type="button"
                          onClick={() => onToggleItemExclusion(ci.item.id)}
                          className={`shrink-0 mt-0.5 sm:mt-0 w-4.5 h-4.5 rounded flex items-center justify-center border transition-all active:scale-90 ${
                            !isExcluded
                              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-950'
                              : 'border-zinc-300 dark:border-zinc-600 bg-transparent text-transparent hover:border-zinc-400'
                          }`}
                          title={isExcluded ? 'Вернуть работу в смету' : 'Исключить работу из сметы'}
                        >
                          <Check className="w-3 h-3 stroke-[3]" />
                        </button>

                        <div className="min-w-0 flex-1 pr-1">
                          <p
                            className={`font-bold leading-snug cursor-pointer select-none transition ${
                              isExcluded
                                ? 'line-through text-zinc-400 dark:text-zinc-500'
                                : 'text-zinc-950 dark:text-white'
                            }`}
                            onClick={() => onToggleItemExclusion(ci.item.id)}
                          >
                            {ci.item.title}
                          </p>
                          {ci.item.description && (
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                              {ci.item.description}
                            </p>
                          )}
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-2 flex-wrap">
                            <span>
                              Объем:{' '}
                              <strong className="text-zinc-800 dark:text-zinc-200 font-semibold">
                                {ci.quantity} {ci.item.unit}
                              </strong>
                            </span>
                            <span>·</span>
                            {isEditingThis ? (
                              <div
                                className="flex items-center gap-1 my-0.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="number"
                                  value={editPriceVal}
                                  onChange={(e) => setEditPriceVal(e.target.value)}
                                  className="w-20 px-1.5 py-0.5 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-xs font-bold text-zinc-900 dark:text-white"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSavePrice(ci.item.id)}
                                  className="px-2 py-0.5 bg-amber-500 text-white rounded text-[10px] font-bold shadow-xs"
                                >
                                  ОК
                                </button>
                              </div>
                            ) : (
                              <span
                                onClick={() => isEditorOpen && handleStartEditPrice(ci.item)}
                                className={`${
                                  isEditorOpen
                                    ? 'cursor-pointer px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold border border-amber-500/30 hover:bg-amber-500/25 transition'
                                    : ''
                                }`}
                              >
                                Ставка:{' '}
                                <strong className="text-zinc-800 dark:text-zinc-200 font-semibold">
                                  {formatCurrency(ci.item.unitPrice)} / {ci.item.unit}
                                </strong>
                                {isEditorOpen && ' ✏️'}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0 pt-0.5 sm:pt-0">
                          {isExcluded ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 whitespace-nowrap">
                              Исключено
                            </span>
                          ) : (
                            <span className="text-xs sm:text-sm font-extrabold text-zinc-950 dark:text-white tabular-nums">
                              {formatCurrency(ci.subtotal)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 3. Grand Totals Summary Card - Matches Calculator dark theme */}
      <div className="bg-zinc-900 text-white dark:bg-zinc-800 dark:text-white rounded-xl p-3.5 shadow-xs space-y-2.5">
        <div className="flex justify-between items-center gap-2 text-xs text-zinc-300 pb-2 border-b border-zinc-700/80">
          <span className="leading-snug">Строительно-монтажные работы ({estimateData.activePositions} поз.):</span>
          <span className="font-bold tabular-nums text-white shrink-0">
            {formatCurrency(estimateData.worksTotal)}
          </span>
        </div>

        {estimateData.materialsTotal > 0 && (
          <div className="flex justify-between items-center gap-2 text-xs text-zinc-300 pb-2 border-b border-zinc-700/80">
            <span className="leading-snug">Черновые сертифицированные материалы:</span>
            <span className="font-bold tabular-nums text-white shrink-0">
              +{formatCurrency(estimateData.materialsTotal)}
            </span>
          </div>
        )}

        {estimateData.savingsTotal > 0 && (
          <div className="flex justify-between items-center gap-2 text-xs text-emerald-400 pb-2 border-b border-zinc-700/80">
            <span className="leading-snug">Экономия (исключено {estimateData.excludedCount} поз.):</span>
            <span className="font-bold tabular-nums text-emerald-400 shrink-0">
              -{formatCurrency(estimateData.savingsTotal)}
            </span>
          </div>
        )}

        <div className="flex justify-between items-center text-base sm:text-lg font-extrabold pt-0.5">
          <div>
            <span>Итого по смете:</span>
            <span className="block text-[11px] font-medium text-zinc-400 mt-0.5">
              ~{pricePerMeter.toLocaleString('ru-RU')} ₽ за м²
            </span>
          </div>
          <span className="tabular-nums text-emerald-400 text-lg sm:text-xl">
            {formatCurrency(estimateData.grandTotal)}
          </span>
        </div>

        <p className="text-[11px] text-zinc-400 leading-relaxed pt-1">
          * Оплата по факту приёмки каждого этапа без предоплаты. Все расценки неизменны в ходе ремонта и фиксируются в договоре.
        </p>
      </div>

      {/* 4. Viral Share Loops: Семейный совет (Шеринг супругу) & Чат ЖК */}
      {onOpenShare && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 no-print">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              onOpenShare();
            }}
            className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/50 hover:bg-blue-100/80 dark:hover:bg-blue-900/40 text-left transition active:scale-[0.99] flex items-center justify-between gap-2 shadow-2xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Share2 className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold text-blue-950 dark:text-blue-100 block leading-tight truncate">
                  Поделиться
                </span>
                <span className="text-[10px] text-blue-700/80 dark:text-blue-300/80 leading-none">
                  Шеринг в Telegram в 1 клик
                </span>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              onOpenShare();
            }}
            className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 hover:bg-amber-100/80 dark:hover:bg-amber-900/40 text-left transition active:scale-[0.99] flex items-center justify-between gap-2 shadow-2xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0">
                <Building2 className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold text-amber-950 dark:text-amber-100 block leading-tight truncate">
                  Смета в чат своего ЖК
                </span>
                <span className="text-[10px] text-amber-700/80 dark:text-amber-300/80 leading-none">
                  Полезный пост для соседей
                </span>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          </button>
        </div>
      )}

      {/* 5. Direct CTA to book measurement */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic('heavy');
          onOpenBooking();
        }}
        className="w-full py-3.5 px-4 bg-zinc-950 hover:bg-black text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100 rounded-xl font-bold text-sm transition active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm no-print"
      >
        <span>Зафиксировать смету и записаться на замер 0 ₽</span>
        <ArrowRight className="w-4 h-4" />
      </button>

      {/* 6. Вирусный бейдж Powered by Remont_Bot (Механика 2) */}
      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 text-left print-avoid-break">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded-sm bg-zinc-900 text-white dark:bg-white dark:text-zinc-950">
              ГОСТ СТАНДАРТ
            </span>
            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
              Сформировано в Remont_Bot
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-snug">
            Единый сметный стандарт без скрытых доплат. Автоматизируйте расчёты вашей строительной компании за 2 минуты.
          </p>
        </div>
        <a
          href={`https://t.me/${botUsername}?start=connect`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 py-1.5 px-2.5 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-600 text-[11px] font-bold shadow-2xs hover:bg-zinc-50 dark:hover:bg-zinc-600 transition"
        >
          Подключить
        </a>
      </div>
    </div>
  );
};
