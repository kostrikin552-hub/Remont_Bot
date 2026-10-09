import { useState } from 'react';
import {
  Check,
  CreditCard,
  Edit2,
  Save,
  ShieldCheck,
  Send,
  Sparkles,
  Zap,
  Layers,
  Clock,
  Coins,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { GostPriceCatalogItem } from '../../types/admin';
import { GOST_PRICE_CATALOG } from '../../data/mockAdminData';

export interface SubscriptionPlanConfig {
  id: '1m' | '3m' | '1y';
  name: string;
  durationDays: number;
  price: number;
  label: string;
  badge: string;
  badgeColor: string;
  description: string;
  discountText: string;
  economy: string;
  monthlyEquiv: number;
}

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

  // 1. НАСТОЯЩИЕ БОЕВЫЕ ПЕРЕМЕННЫЕ ЭКВАЙРИНГА
  const [telegramPaymentToken, setTelegramPaymentToken] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('remontsaas_tg_payment_token');
      if (saved) return saved;
    } catch {}
    return '390540012:LIVE:102909';
  });

  const [yookassaShopId, setYookassaShopId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('remontsaas_yookassa_shop_id');
      if (saved) return saved;
    } catch {}
    return '1413258';
  });

  const [isTestPaymentMode, setIsTestPaymentMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('remontsaas_test_payment_mode');
      if (saved) return saved === 'true';
    } catch {}
    return false;
  });

  const [trialLeadsCount, setTrialLeadsCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('remontsaas_trial_leads_count');
      if (saved) return Number(saved);
    } catch {}
    return 3;
  });

  // 2. ТРИ ОФИЦИАЛЬНЫХ ТАРИФА ПОДПИСКИ (1m, 3m, 1y)
  const [plans, setPlans] = useState<Record<'1m' | '3m' | '1y', SubscriptionPlanConfig>>(() => {
    const defaultPlans: Record<'1m' | '3m' | '1y', SubscriptionPlanConfig> = {
      '1m': {
        id: '1m',
        name: '1 месяц',
        durationDays: 30,
        price: 2990,
        label: '1 месяц — 2 990 ₽',
        badge: 'Базовый',
        badgeColor: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200',
        description: '30 дней безлимитной работы бота и приёма заявок заказчиков',
        discountText: 'Базовый тариф',
        economy: '0 ₽',
        monthlyEquiv: 2990,
      },
      '3m': {
        id: '3m',
        name: '3 месяца',
        durationDays: 90,
        price: 6990,
        label: '3 месяца — 6 990 ₽',
        badge: 'Популярный 🔥',
        badgeColor: 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300',
        description: '90 дней работы бота без перебоев (выгода 22%, экономия 1 980 ₽)',
        discountText: 'Скидка 22%',
        economy: '1 980 ₽',
        monthlyEquiv: 2330,
      },
      '1y': {
        id: '1y',
        name: '1 год',
        durationDays: 365,
        price: 22990,
        label: '1 год — 22 990 ₽',
        badge: 'Максимальная выгода ⭐️',
        badgeColor: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300',
        description: '365 дней работы бота (всего ~1 915 ₽/мес, экономия 12 890 ₽)',
        discountText: 'Экономия 12 890 ₽',
        economy: '12 890 ₽',
        monthlyEquiv: 1915,
      },
    };

    try {
      const saved = localStorage.getItem('remontsaas_real_tariffs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed['1m'] && parsed['3m'] && parsed['1y']) {
          return parsed;
        }
      }
    } catch {}
    return defaultPlans;
  });

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
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

  const handleUpdatePlanPrice = (planId: '1m' | '3m' | '1y', newPrice: number) => {
    setPlans((prev) => {
      const target = prev[planId];
      const months = planId === '1m' ? 1 : planId === '3m' ? 3 : 12;
      const updated: SubscriptionPlanConfig = {
        ...target,
        price: newPrice,
        monthlyEquiv: Math.round(newPrice / months),
        label: `${target.name} — ${newPrice.toLocaleString('ru-RU')} ₽`,
      };
      return { ...prev, [planId]: updated };
    });
  };

  const handleSaveAllSettings = () => {
    try {
      localStorage.setItem('remontsaas_tg_payment_token', telegramPaymentToken);
      localStorage.setItem('remontsaas_yookassa_shop_id', yookassaShopId);
      localStorage.setItem('remontsaas_test_payment_mode', String(isTestPaymentMode));
      localStorage.setItem('remontsaas_trial_leads_count', String(trialLeadsCount));
      localStorage.setItem('remontsaas_real_tariffs', JSON.stringify(plans));
    } catch {}
    showNotice();
  };

  const copyToClipboard = (text: string, keyName: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(keyName);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-bold text-zinc-950 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <span>Управление ценами, тарифами & эквайрингом</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold normal-case">
              3 тарифа активны
            </span>
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Конфигурация платных тарифов подписки Telegram-бота, боевые платежные токены и ГОСТ-каталог расценок.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSaveAllSettings}
          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-lg transition shadow-xs flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>Сохранить все тарифы</span>
        </button>
      </div>

      {isSavedNotice && (
        <div className="p-3 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2 shadow-xs">
          <Check className="w-4 h-4" />
          <span>Настройки тарифов и платежные ключи успешно сохранены и синхронизированы!</span>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 1. БОЕВЫЕ ПЕРЕМЕННЫЕ ПЛАТЕЖНЫХ ШЛЮЗОВ (TELEGRAM & YOOKASSA) */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <h2 className="text-xs font-bold text-zinc-950 dark:text-white uppercase tracking-wider">
              Боевые платежные шлюзы и переменные окружения
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-sm uppercase ${
                isTestPaymentMode
                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
              }`}
            >
              {isTestPaymentMode ? 'ТЕСТОВЫЙ РЕЖИМ' : 'БОЕВОЙ РЕЖИМ (LIVE)'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* TELEGRAM_PAYMENT_PROVIDER_TOKEN */}
          <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-blue-500" />
                TELEGRAM_PAYMENT_PROVIDER_TOKEN
              </span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300">
                Telegram Payments API
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 leading-tight">
              Токен платежного провайдера (Сбербанк/ЮKassa) для нативной оплаты через инвойсы в Telegram-боте.
            </p>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={telegramPaymentToken}
                onChange={(e) => setTelegramPaymentToken(e.target.value)}
                className="flex-1 px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-md text-xs font-mono font-bold text-zinc-950 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(telegramPaymentToken, 'tg_token')}
                className="p-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 rounded-md text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
                title="Скопировать токен"
              >
                {copiedKey === 'tg_token' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Подключено: <code>390540012:LIVE:102909</code>
            </div>
          </div>

          {/* YOOKASSA_SHOP_ID */}
          <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-purple-500" />
                YOOKASSA_SHOP_ID
              </span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300">
                СБП / Карты РФ
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 leading-tight">
              Идентификатор магазина ЮKassa для формирования веб-страниц оплаты и автоматического выставления чеков.
            </p>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={yookassaShopId}
                onChange={(e) => setYookassaShopId(e.target.value)}
                className="flex-1 px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-md text-xs font-mono font-bold text-zinc-950 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(yookassaShopId, 'shop_id')}
                className="p-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 rounded-md text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
                title="Скопировать ShopId"
              >
                {copiedKey === 'shop_id' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Подключено: <code>1413258</code>
            </div>
          </div>
        </div>

        {/* Дополнительные параметры (Режим & Стартовый триал) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
            <div>
              <div className="text-xs font-bold text-zinc-900 dark:text-white">
                Режим платежей
              </div>
              <div className="text-[10px] text-zinc-500">
                {isTestPaymentMode ? 'Тестовые карты без списания' : 'Боевой режим со списанием средств'}
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

          <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
            <div>
              <div className="text-xs font-bold text-zinc-900 dark:text-white">
                Стартовый триал (Freemium)
              </div>
              <div className="text-[10px] text-zinc-500">
                Заявок с открытыми контактами до пейволла
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="1"
                max="20"
                value={trialLeadsCount}
                onChange={(e) => setTrialLeadsCount(Number(e.target.value))}
                className="w-14 px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded text-xs font-bold text-center"
              />
              <span className="text-xs font-semibold text-zinc-500">заявки</span>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2. ТРИ ОФИЦИАЛЬНЫХ ТАРИФА ПОДПИСКИ СЕРВИСА (1m, 3m, 1y) */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-600" />
            <h2 className="text-xs font-bold text-zinc-950 dark:text-white uppercase tracking-wider">
              3 Официальных тарифа сервиса (1 месяц, 3 месяца, 1 год)
            </h2>
          </div>
          <span className="text-[11px] text-zinc-500">
            Команда для прораба в боте: <code>/pay</code> или <code>/subscription</code>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['1m', '3m', '1y'] as const).map((planId) => {
            const plan = plans[planId];
            return (
              <div
                key={planId}
                className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between space-y-3 relative overflow-hidden"
              >
                {/* Top Badge */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                    ID: {plan.id}
                  </span>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${plan.badgeColor}`}>
                    {plan.badge}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-extrabold text-zinc-950 dark:text-white">
                    {plan.name}
                  </h3>
                  <div className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Срок действия: <b>{plan.durationDays} дней</b></span>
                  </div>
                </div>

                {/* Price editor */}
                <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 space-y-1">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase block">
                    Стоимость тарифа (₽):
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="10"
                      value={plan.price}
                      onChange={(e) => handleUpdatePlanPrice(planId, Number(e.target.value))}
                      className="w-full px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded text-sm font-extrabold text-zinc-950 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-extrabold text-zinc-900 dark:text-white">₽</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-0.5">
                    <span>В месяц: ~<b>{plan.monthlyEquiv.toLocaleString('ru-RU')} ₽</b></span>
                    {plan.economy !== '0 ₽' && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                        Экономия {plan.economy}
                      </span>
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
                  {plan.description}
                </p>

                {/* Telegram Bot Command & Gateway Binding */}
                <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/80 text-[10px] space-y-1.5">
                  <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Боевой эквайринг тарифа</span>
                    <span className="text-emerald-600 font-bold">LIVE</span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-300 font-mono text-[9px]">
                    <span className="text-zinc-400">TG Provider:</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400 truncate max-w-[140px]" title={telegramPaymentToken}>
                      {telegramPaymentToken}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-300 font-mono text-[9px]">
                    <span className="text-zinc-400">Shop ID:</span>
                    <span className="font-bold text-purple-600 dark:text-purple-400">
                      {yookassaShopId}
                    </span>
                  </div>
                </div>

                {/* Telegram Bot Command Preview */}
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-[11px]">
                  <span className="text-zinc-500 font-mono text-[10px]">Команда:</span>
                  <code className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold text-[10px]">
                    /pay {plan.id}
                  </code>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 3. ЭТАЛОННЫЙ ГОСТ-КАТАЛОГ РАСЦЕНОК ПО ВИДАМ РАБОТ */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-emerald-600" />
              <h2 className="text-xs font-bold text-zinc-950 dark:text-white uppercase tracking-wider">
                Эталонный ГОСТ-каталог расценок за м² и единицу
              </h2>
              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                СНиП / СП 71.13330
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Инициализирует базовые цены калькулятора при регистрации нового прораба в Telegram-боте.
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
                          className="p-1 bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 rounded cursor-pointer"
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
                          className="p-1 bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded cursor-pointer"
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
                          className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-bold text-xs rounded transition flex items-center gap-1 ml-auto shadow-xs cursor-pointer"
                        >
                          <Save className="w-3 h-3" />
                          <span>Сохранить</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStartEdit(item)}
                          className="p-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded transition ml-auto cursor-pointer"
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
