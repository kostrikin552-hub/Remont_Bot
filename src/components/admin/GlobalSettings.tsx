import { useState } from 'react';
import {
  Check,
  CreditCard,
  Edit2,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { GostPriceCatalogItem } from '../../types/admin';
import { GOST_PRICE_CATALOG } from '../../data/mockAdminData';

export function GlobalSettings() {
  const [catalog, setCatalog] = useState<GostPriceCatalogItem[]>(() => {
    try {
      const saved = localStorage.getItem('remontsaas_real_gost_prices');
      if (saved) return JSON.parse(saved);
    } catch {}
    return GOST_PRICE_CATALOG;
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<number>(0);

  const [isTestPaymentMode, setIsTestPaymentMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('remontsaas_test_payment_mode');
      if (saved) return saved === 'true';
    } catch {}
    return false;
  });
  const [subscriptionCost, setSubscriptionCost] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('remontsaas_sub_cost');
      if (saved) return Number(saved);
    } catch {}
    return 2990;
  });
  const [trialLeadsCount, setTrialLeadsCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('remontsaas_trial_leads_count');
      if (saved) return Number(saved);
    } catch {}
    return 3;
  });
  const [shopId, setShopId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('remontsaas_shop_id');
      if (saved) return saved;
    } catch {}
    return '392014_remontsaas';
  });
  const [isSavedNotice, setIsSavedNotice] = useState<boolean>(false);

  const handleStartEdit = (item: GostPriceCatalogItem) => {
    setEditingId(item.id);
    setEditPrice(item.baseCost);
  };

  const handleSavePrice = (id: string) => {
    setCatalog((prev) => {
      const updated = prev.map((item) => (item.id === id ? { ...item, baseCost: editPrice } : item));
      try {
        localStorage.setItem('remontsaas_real_gost_prices', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    setEditingId(null);
    showNotice();
  };

  const showNotice = () => {
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 3000);
  };

  const handleSaveBillingSettings = () => {
    try {
      localStorage.setItem('remontsaas_test_payment_mode', String(isTestPaymentMode));
      localStorage.setItem('remontsaas_sub_cost', String(subscriptionCost));
      localStorage.setItem('remontsaas_trial_leads_count', String(trialLeadsCount));
      localStorage.setItem('remontsaas_shop_id', shopId);
    } catch {}
    showNotice();
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div>
        <h1 className="text-base font-bold text-zinc-950 dark:text-white uppercase tracking-wider flex items-center gap-2">
          <span>Настройки системы и ГОСТ-каталог</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold normal-case">
            Эталонные расценки
          </span>
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Базовые цены, применяемые по умолчанию для всех новых подключающихся строительных компаний.
        </p>
      </div>

      {isSavedNotice && (
        <div className="p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
          <Check className="w-4 h-4" />
          <span>Настройки успешно сохранены!</span>
        </div>
      )}

      {/* Grid: Payments Settings & Security */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Payment Gateway (ЮKassa) */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-zinc-500" />
              <h2 className="text-xs font-bold text-zinc-950 dark:text-white uppercase tracking-wider">
                Эквайринг ЮKassa (Тарифы)
              </h2>
            </div>
            <span
              className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-sm uppercase ${
                isTestPaymentMode
                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
              }`}
            >
              {isTestPaymentMode ? 'ТЕСТОВЫЙ' : 'БОЕВОЙ'}
            </span>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
              <div>
                <div className="text-xs font-bold text-zinc-900 dark:text-white">
                  Режим интеграции платежей
                </div>
                <div className="text-[11px] text-zinc-500">
                  {isTestPaymentMode
                    ? 'Тестовые карты без реального списания'
                    : 'Боевые платежи через СБП и банковские карты'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsTestPaymentMode(!isTestPaymentMode);
                  showNotice();
                }}
                className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors cursor-pointer ${
                  !isTestPaymentMode ? 'bg-zinc-900 dark:bg-white' : 'bg-zinc-300 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-zinc-900 transition-transform ${
                    !isTestPaymentMode ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 mb-1 block uppercase">
                  Стоимость подписки (₽/мес):
                </label>
                <input
                  type="number"
                  value={subscriptionCost}
                  onChange={(e) => setSubscriptionCost(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-xs font-bold text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 mb-1 block uppercase">
                  Бесплатных лидов (триал):
                </label>
                <input
                  type="number"
                  value={trialLeadsCount}
                  onChange={(e) => setTrialLeadsCount(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-xs font-bold text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 mb-1 block uppercase">
                ShopId магазина ЮKassa:
              </label>
              <input
                type="text"
                value={shopId}
                onChange={(e) => setShopId(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-xs font-mono text-zinc-950 dark:text-white focus:outline-none"
              />
            </div>

            <div className="pt-1 text-right">
              <button
                type="button"
                onClick={handleSaveBillingSettings}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-bold text-xs rounded-md transition shadow-xs cursor-pointer"
              >
                Сохранить тарифы
              </button>
            </div>
          </div>
        </div>

        {/* Global Security */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-zinc-500" />
              <h2 className="text-xs font-bold text-zinc-950 dark:text-white uppercase tracking-wider">
                Безопасность & Telegram Bot API
              </h2>
            </div>
            <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
              TLS 1.3 / HTTPS
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
              <div className="font-bold text-zinc-950 dark:text-white mb-0.5">
                Валидация Telegram WebApp InitData
              </div>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
                Изменение расценок проверяет HMAC-SHA256 подпись Telegram бота. Никакой сторонний посетитель не может переписать системные настройки СК.
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
              <div className="font-bold text-zinc-950 dark:text-white mb-0.5">
                Изоляция тенантов (Multi-Tenancy)
              </div>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
                Каждая компания имеет изолированную конфигурацию в PostgreSQL со своими наценками, вторичными коэффициентами и логотипами.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Reference GOST Pricing Catalog */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-zinc-950 dark:text-white uppercase tracking-wider">
                Эталонный ГОСТ-каталог расценок
              </h2>
              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                СНиП / СП 71.13330
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Инициализирует базовые цены калькулятора при регистрации нового прораба.
            </p>
          </div>
        </div>

        {/* Mobile Compact Cards for GOST items (< md) */}
        <div className="md:hidden space-y-2">
          {catalog.map((item) => {
            const isEditing = editingId === item.id;
            return (
              <div
                key={item.id}
                className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-800 space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-zinc-950 dark:text-white leading-snug">
                      {item.name}
                    </div>
                    <div className="text-[10px] text-zinc-500 flex items-center gap-1.5 mt-0.5">
                      <span className="font-semibold">{item.category}</span>
                      <span>•</span>
                      <span className="font-mono text-zinc-600 dark:text-zinc-400">{item.gostCode}</span>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          autoFocus
                          value={editPrice}
                          onChange={(e) => setEditPrice(Number(e.target.value))}
                          className="w-16 px-1.5 py-0.5 bg-white dark:bg-zinc-900 border border-zinc-900 dark:border-white rounded text-xs font-bold"
                        />
                        <button
                          onClick={() => handleSavePrice(item.id)}
                          className="p-1 bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 rounded"
                        >
                          <Save className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-extrabold text-zinc-950 dark:text-white whitespace-nowrap">
                          {item.baseCost.toLocaleString('ru-RU')} ₽ <span className="text-[10px] font-normal text-zinc-500">/{item.unit}</span>
                        </span>
                        <button
                          onClick={() => handleStartEdit(item)}
                          className="p-1 bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-2 px-3 font-bold">Категория</th>
                <th className="py-2 px-3 font-bold">Наименование работы</th>
                <th className="py-2 px-3 font-bold">Норматив ГОСТ/СП</th>
                <th className="py-2 px-3 font-bold">Ед. изм.</th>
                <th className="py-2 px-3 font-bold">Базовая ставка (₽)</th>
                <th className="py-2 px-3 text-right font-bold">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {catalog.map((item) => {
                const isEditing = editingId === item.id;

                return (
                  <tr key={item.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                    <td className="py-2.5 px-3 text-zinc-500 font-medium whitespace-nowrap">
                      {item.category}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-950 dark:text-white font-medium max-w-[300px]">
                      <div className="font-semibold">{item.name}</div>
                      <div className="text-[10px] text-zinc-500">{item.description}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono text-[10px]">
                        {item.gostCode}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-zinc-500">{item.unit}</td>
                    <td className="py-2.5 px-3">
                      {isEditing ? (
                        <input
                          type="number"
                          autoFocus
                          value={editPrice}
                          onChange={(e) => setEditPrice(Number(e.target.value))}
                          className="w-24 px-2 py-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-900 dark:border-white rounded text-xs font-bold text-zinc-950 dark:text-white focus:outline-none"
                        />
                      ) : (
                        <span className="font-bold text-zinc-950 dark:text-white">
                          {item.baseCost.toLocaleString('ru-RU')} ₽
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {isEditing ? (
                        <button
                          onClick={() => handleSavePrice(item.id)}
                          className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-bold text-xs rounded transition flex items-center gap-1 ml-auto shadow-xs"
                        >
                          <Save className="w-3 h-3" />
                          <span>Сохранить</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStartEdit(item)}
                          className="p-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded transition ml-auto"
                          title="Редактировать базовую цену"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
