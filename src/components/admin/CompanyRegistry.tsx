import { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  ExternalLink,
  Copy,
  Check,
  Building,
  Phone,
  Send,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  Edit2,
  CheckCircle2,
  Clock,
  Sparkles,
  Bot,
  DollarSign,
  Key,
  AlertTriangle,
  X,
} from 'lucide-react';
import { TenantCompany, BotDeploymentStatus } from '../../types/admin';
import { triggerHaptic } from '../../utils/telegram';
import { updateCompanyProfile } from '../../lib/supabase';

interface CompanyRegistryProps {
  companies: TenantCompany[];
  onToggleBlock?: (companyId: string) => void;
  onTestMiniApp: (company: TenantCompany) => void;
  onAddCompany?: (newCompany: TenantCompany) => void;
  onUpdateCompany?: (updatedCompany: TenantCompany) => void;
  onDeleteCompany?: (companyId: string) => void;
  onEditPricing?: (companyId: string) => void;
  // Compatibility props
  onAddDays?: (companyId: string, days: number) => void;
  onAddTrialLeads?: (companyId: string, leads: number) => void;
}

export function CompanyRegistry({
  companies,
  onTestMiniApp,
  onAddCompany,
  onUpdateCompany,
  onDeleteCompany,
  onEditPricing,
}: CompanyRegistryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New Bot Modal State
  const [isNewCompanyModalOpen, setIsNewCompanyModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCity, setNewCity] = useState('Москва');
  const [newForeman, setNewForeman] = useState('');
  const [newPhone, setNewPhone] = useState('+7 ');
  const [newBot, setNewBot] = useState('');
  const [newAdminChatId, setNewAdminChatId] = useState('');
  const [newRadius, setNewRadius] = useState('Вся Москва + 15 км от МКАД');
  const [newPrice, setNewPrice] = useState(45000);
  const [newStatus, setNewStatus] = useState<BotDeploymentStatus>('ready');

  // Initial custom pricing for newly created bot
  const [newCosmetic, setNewCosmetic] = useState(4500);
  const [newCapital, setNewCapital] = useState(8500);
  const [newDesigner, setNewDesigner] = useState(15000);
  const [newMaterials, setNewMaterials] = useState(3500);
  const [newDemolition, setNewDemolition] = useState(1200);
  const [newDesignProject, setNewDesignProject] = useState(2000);

  // Edit Bot Modal State
  const [editingCompany, setEditingCompany] = useState<TenantCompany | null>(null);

  // BotFather Token Binding Modal State
  const [selectedTokenBot, setSelectedTokenBot] = useState<TenantCompany | null>(null);
  const [botFatherToken, setBotFatherToken] = useState('');
  const [tokenCheckStatus, setTokenCheckStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTestingToken, setIsTestingToken] = useState(false);

  const handleOpenTokenModal = (company: TenantCompany) => {
    setSelectedTokenBot(company);
    const saved = localStorage.getItem(`bot_token_${company.id}`) || '';
    setBotFatherToken(saved);
    setTokenCheckStatus(null);
    triggerHaptic('light');
  };

  const handleTestToken = async () => {
    const token = botFatherToken.trim();
    if (!token) return;
    if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
      setTokenCheckStatus({
        ok: false,
        message: 'Неверный формат токена. Ожидается: 1234567890:ABCdefGhIJK...',
      });
      return;
    }
    setIsTestingToken(true);
    setTokenCheckStatus(null);
    try {
      const resp = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = await resp.json();
      if (data && data.ok && data.result) {
        setTokenCheckStatus({
          ok: true,
          message: `Токен валиден! Бот найден: @${data.result.username} (${data.result.first_name})`,
        });
      } else {
        setTokenCheckStatus({
          ok: false,
          message: data.description || 'Ошибка проверки в Telegram Bot API',
        });
      }
    } catch {
      setTokenCheckStatus({
        ok: true,
        message: 'Формат токена валиден. Готов к привязке вебхука.',
      });
    } finally {
      setIsTestingToken(false);
    }
  };

  const handleSaveToken = () => {
    if (!selectedTokenBot) return;
    const token = botFatherToken.trim();
    if (!token) return;
    try {
      localStorage.setItem(`bot_token_${selectedTokenBot.id}`, token);
    } catch {}
    triggerHaptic('success');
    setSelectedTokenBot(null);
  };

  const cities = useMemo(() => {
    return Array.from(new Set(companies.map((c) => c.city)));
  }, [companies]);

  const filtered = useMemo(() => {
    return companies.filter((c) => {
      const matchSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.botUsername.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.foremanName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.foremanPhone.includes(searchQuery);

      const matchCity = selectedCity === 'all' || c.city === selectedCity;
      const currentBotStatus = c.botStatus || (c.subscriptionStatus === 'active' ? 'active' : 'ready');
      const matchStatus = selectedStatus === 'all' || currentBotStatus === selectedStatus;

      return matchSearch && matchCity && matchStatus;
    });
  }, [companies, searchQuery, selectedCity, selectedStatus]);

  const handleCopyClientLink = (company: TenantCompany) => {
    triggerHaptic('light');
    const origin = window.location.origin;
    const cleanBot = company.botUsername.replace(/^@/, '');
    const clientUrl = `${origin}/?bot=${encodeURIComponent(cleanBot)}&company=${encodeURIComponent(company.id)}`;
    navigator.clipboard.writeText(clientUrl);
    setCopiedId(company.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleCreateCompanySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const slug = newName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9а-яё]/gi, '-')
      .replace(/-+/g, '-');
    const compId = `comp-${slug}-${Math.floor(100 + Math.random() * 900)}`;
    const botUser = (newBot || `${slug}_bot`).replace(/^@/, '').trim();

    const created: TenantCompany = {
      id: compId,
      name: newName.trim(),
      city: newCity.trim(),
      foremanName: newForeman.trim() || 'Дежурный инженер',
      foremanPhone: newPhone.trim(),
      foremanTg: `@${botUser}`,
      botUsername: botUser,
      adminChatId: newAdminChatId.trim() || undefined,
      botStatus: newStatus,
      botPrice: Number(newPrice) || 45000,
      soldAt: newStatus === 'active' ? new Date().toISOString().split('T')[0] : undefined,
      totalLeads: 0,
      revenueEst: 0,
      registeredAt: new Date().toISOString().split('T')[0],
      isBlocked: false,
      webhookStatus: 'healthy',
      pricingMultiplier: 1.0,
      serviceRadius: newRadius.trim() || `${newCity.trim()} и пригород до 15 км`,
      subscriptionStatus: 'active',
      daysLeft: 365,
      trialLeadsLeft: 999,
    };

    // Save custom pricing for this created company in localStorage
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          `company_pricing_${compId}`,
          JSON.stringify({
            cosmeticPrice: Number(newCosmetic) || 4500,
            capitalPrice: Number(newCapital) || 8500,
            designerPrice: Number(newDesigner) || 15000,
            materialsPrice: Number(newMaterials) || 3500,
            demolitionPrice: Number(newDemolition) || 1200,
            designProjectPrice: Number(newDesignProject) || 2000,
          })
        );
      } catch (err) {
        console.error('Error storing custom pricing:', err);
      }
    }

    if (onAddCompany) {
      onAddCompany(created);
    }

    try {
      fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: created,
          pricing: {
            cosmeticPrice: Number(newCosmetic) || 4500,
            capitalPrice: Number(newCapital) || 8500,
            designerPrice: Number(newDesigner) || 15000,
            materialsPrice: Number(newMaterials) || 3500,
            demolitionPrice: Number(newDemolition) || 1200,
            designProjectPrice: Number(newDesignProject) || 2000,
          },
        }),
      }).catch(() => {});
    } catch {}

    setIsNewCompanyModalOpen(false);
    setNewName('');
    setNewForeman('');
    setNewPhone('+7 ');
    setNewBot('');
    setNewAdminChatId('');
    setNewPrice(45000);
  };

  const handleSaveEditedCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;

    try {
      await updateCompanyProfile(editingCompany.id, {
        name: editingCompany.name,
        city: editingCompany.city,
        phone: editingCompany.foremanPhone,
        admin_chat_id: editingCompany.adminChatId,
        bot_username: editingCompany.botUsername,
        foreman_name: editingCompany.foremanName,
        foreman_phone: editingCompany.foremanPhone,
      });
    } catch (err) {
      console.warn('Ошибка синхронизации компании через API:', err);
    }

    if (onUpdateCompany) {
      onUpdateCompany(editingCompany);
    }
    setEditingCompany(null);
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Вы уверены, что хотите удалить бота «${name}»?`)) {
      if (onDeleteCompany) {
        onDeleteCompany(id);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-zinc-950 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <Bot className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>Боты строительных компаний</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold normal-case">
              Всего: {companies.length}
            </span>
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Создание и продажа готовых ботов под ключ с эксклюзивными ценами и сметами конкретной компании.
          </p>
        </div>

        <button
          onClick={() => {
            triggerHaptic('medium');
            setIsNewCompanyModalOpen(true);
          }}
          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-xs flex items-center gap-2 self-start md:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Создать нового бота</span>
        </button>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full md:w-80 relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по компании, прорабу, @bot или телефону..."
            className="w-full pl-9 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 font-medium"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* City Filter */}
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="flex-1 md:flex-none px-2.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:outline-none min-w-0"
          >
            <option value="all">Все города</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="flex-1 md:flex-none px-2.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:outline-none min-w-0"
          >
            <option value="all">Все статусы</option>
            <option value="active">Активен у клиента</option>
            <option value="ready">Готов к продаже</option>
            <option value="development">В разработке</option>
          </select>
        </div>
      </div>

      {/* Mobile Card List View (< md) */}
      <div className="md:hidden space-y-2.5">
        {filtered.map((company) => {
          const status = company.botStatus || (company.subscriptionStatus === 'active' ? 'active' : 'ready');
          const isCopied = copiedId === company.id;

          return (
            <div
              key={company.id}
              className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center font-extrabold text-xs shrink-0">
                    {company.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-bold text-xs text-zinc-950 dark:text-white flex items-center gap-1.5">
                      <span>{company.name}</span>
                      {(company.name.includes('Петришин') || company.id.includes('petrishin')) && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 font-extrabold">
                          Прайс 2026
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      {company.city} • @{company.botUsername}
                    </div>
                  </div>
                </div>

                {status === 'active' && (
                  <span className="px-2 py-0.5 rounded-sm bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold shrink-0">
                    Активен
                  </span>
                )}
                {status === 'ready' && (
                  <span className="px-2 py-0.5 rounded-sm bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 text-[10px] font-extrabold shrink-0">
                    Готов к продаже
                  </span>
                )}
                {status === 'development' && (
                  <span className="px-2 py-0.5 rounded-sm bg-blue-100 dark:bg-blue-950/60 text-blue-900 dark:text-blue-300 text-[10px] font-extrabold shrink-0">
                    В разработке
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-zinc-100 dark:border-zinc-800/80">
                <div>
                  <span className="text-zinc-500 block text-[10px]">Прораб / Телефон:</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 block">{company.foremanName}</span>
                  <span className="text-zinc-500 font-mono text-[10px]">{company.foremanPhone}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px]">Стоимость / Сметы:</span>
                  <span className="font-bold text-zinc-950 dark:text-white block">
                    {(company.botPrice || 45000).toLocaleString('ru-RU')} ₽
                  </span>
                  <span className="text-zinc-500 text-[10px]">
                    Заявок: {company.totalLeads}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {onEditPricing && (
                    <button
                      onClick={() => onEditPricing(company.id)}
                      className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 text-[11px] font-bold rounded-md transition flex items-center gap-1 shrink-0"
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      <span>Услуги & Цены</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleCopyClientLink(company)}
                    className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-[11px] font-bold rounded-md transition flex items-center gap-1 shrink-0"
                  >
                    {isCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{isCopied ? 'Скопировано!' : 'Ссылка'}</span>
                  </button>
                  <button
                    onClick={() => handleOpenTokenModal(company)}
                    className="px-2 py-1 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 text-[11px] font-bold rounded-md transition flex items-center gap-1 shrink-0 cursor-pointer"
                    title="Привязать токен @BotFather"
                  >
                    <Key className="w-3 h-3" />
                    <span>Токен</span>
                  </button>
                  <button
                    onClick={() => onTestMiniApp(company)}
                    className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold rounded-md transition flex items-center gap-1 shrink-0"
                  >
                    <Smartphone className="w-3 h-3" />
                    <span>Тест</span>
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingCompany(company)}
                    className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 rounded transition"
                    title="Редактировать параметры"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(company.id, company.name)}
                    className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/60 text-red-500 rounded transition"
                    title="Удалить бота"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Table View (>= md) */}
      <div className="hidden md:block bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Компания / Telegram Бот</th>
                <th className="py-3 px-4">Город / Регион</th>
                <th className="py-3 px-4">Ответственный прораб</th>
                <th className="py-3 px-4">Статус продажи</th>
                <th className="py-3 px-4">Стоимость бота</th>
                <th className="py-3 px-4">Заявки клиентов</th>
                <th className="py-3 px-4 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtered.map((company) => {
                const status = company.botStatus || (company.subscriptionStatus === 'active' ? 'active' : 'ready');
                const isCopied = copiedId === company.id;

                return (
                  <tr
                    key={company.id}
                    className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center font-extrabold text-xs shrink-0">
                          {company.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-zinc-950 dark:text-white flex items-center gap-1.5">
                            <span>{company.name}</span>
                            {(company.name.includes('Петришин') || company.id.includes('petrishin')) && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 font-extrabold">
                                Прайс 2026
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-500 flex items-center gap-1 font-mono">
                            <Send className="w-3 h-3 text-blue-500" />
                            <a
                              href={`https://t.me/${company.botUsername.replace('@', '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:underline text-blue-600 dark:text-blue-400"
                            >
                              @{company.botUsername}
                            </a>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-medium text-zinc-700 dark:text-zinc-300">
                      <div>{company.city}</div>
                      {company.serviceRadius && (
                        <div className="text-[10px] text-zinc-400 truncate max-w-[160px]">
                          {company.serviceRadius}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">
                        {company.foremanName}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        {company.foremanPhone}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      {status === 'active' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Активен у клиента</span>
                        </span>
                      )}
                      {status === 'ready' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 text-[10px] font-extrabold">
                          <Sparkles className="w-3 h-3" />
                          <span>Готов к продаже</span>
                        </span>
                      )}
                      {status === 'development' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-blue-100 dark:bg-blue-950/60 text-blue-900 dark:text-blue-300 text-[10px] font-extrabold">
                          <Clock className="w-3 h-3" />
                          <span>В разработке</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-extrabold text-zinc-950 dark:text-white">
                      {(company.botPrice || 45000).toLocaleString('ru-RU')} ₽
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-bold text-zinc-900 dark:text-zinc-100">
                        {company.totalLeads} заявок
                      </span>
                      {company.revenueEst > 0 && (
                        <div className="text-[10px] text-zinc-500">
                          {(company.revenueEst / 1000000).toFixed(1)} млн ₽
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {onEditPricing && (
                          <button
                            onClick={() => onEditPricing(company.id)}
                            className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-bold text-xs rounded-lg transition flex items-center gap-1 shadow-xs"
                            title="Редактировать абсолютно все услуги и расценки этого бота"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            <span>Услуги & Цены</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleCopyClientLink(company)}
                          className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-xs rounded-lg transition flex items-center gap-1"
                          title="Скопировать ссылку на персональный Mini App клиента"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{isCopied ? 'Скопировано!' : 'Ссылка'}</span>
                        </button>
                        <button
                          onClick={() => handleOpenTokenModal(company)}
                          className="px-2 py-1 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-bold text-xs rounded-lg transition flex items-center gap-1 cursor-pointer"
                          title="Привязать токен @BotFather"
                        >
                          <Key className="w-3.5 h-3.5" />
                          <span>Токен</span>
                        </button>
                        <button
                          onClick={() => onTestMiniApp(company)}
                          className="p-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-lg transition"
                          title="Протестировать Mini App"
                        >
                          <Smartphone className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingCompany(company)}
                          className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 rounded-lg transition"
                          title="Изменить реквизиты бота"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(company.id, company.name)}
                          className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/60 text-red-500 rounded-lg transition"
                          title="Удалить бота"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {/* Modal: Create New Bot */}
      {isNewCompanyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-5 max-w-lg w-full border border-zinc-200 dark:border-zinc-800 shadow-2xl max-h-[92vh] overflow-y-auto animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-zinc-950 dark:text-white">
                    Создание нового бота под компанию
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Эксклюзивный бот с индивидуальными ценами и сметами
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewCompanyModalOpen(false)}
                className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex items-center justify-center hover:text-zinc-900 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCompanySubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                  Название компании / бренда: <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Например: СК «Олимп» или «Ремонт-Премиум»"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                    Город / Регион:
                  </label>
                  <input
                    type="text"
                    required
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    placeholder="Москва"
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                    Имя прораба / инженера:
                  </label>
                  <input
                    type="text"
                    placeholder="Алексей"
                    value={newForeman}
                    onChange={(e) => setNewForeman(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                    Телефон для клиентов:
                  </label>
                  <input
                    type="text"
                    placeholder="+7 (920) 000-00-00"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                    Юзернейм бота Telegram:
                  </label>
                  <input
                    type="text"
                    placeholder="olimp_remont_bot"
                    value={newBot}
                    onChange={(e) => setNewBot(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                    Chat ID прораба (куда слать заявки):
                  </label>
                  <input
                    type="text"
                    placeholder="5629144056"
                    value={newAdminChatId}
                    onChange={(e) => setNewAdminChatId(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                    Стоимость продажи бота (₽):
                  </label>
                  <input
                    type="number"
                    value={newPrice}
                    onChange={(e) => setNewPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                  Статус готовности бота:
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as BotDeploymentStatus)}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white focus:outline-none font-medium"
                >
                  <option value="ready">🟡 Готов к продаже клиенту</option>
                  <option value="active">🟢 Активен (уже передан клиенту)</option>
                  <option value="development">⚪️ В разработке / черновик</option>
                </select>
              </div>

              {/* Стартовые расценки для бота */}
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 space-y-2.5">
                <div className="font-bold text-zinc-900 dark:text-white flex items-center justify-between">
                  <span>Стартовые расценки бота (₽/м²):</span>
                  <span className="text-[10px] text-zinc-400 font-normal">можно изменить в любой момент</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Косметический:</span>
                    <input
                      type="number"
                      value={newCosmetic}
                      onChange={(e) => setNewCosmetic(Number(e.target.value))}
                      className="w-full px-2 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-bold"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Капитальный:</span>
                    <input
                      type="number"
                      value={newCapital}
                      onChange={(e) => setNewCapital(Number(e.target.value))}
                      className="w-full px-2 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-bold"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Дизайнерский:</span>
                    <input
                      type="number"
                      value={newDesigner}
                      onChange={(e) => setNewDesigner(Number(e.target.value))}
                      className="w-full px-2 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-bold"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Черновые мат.:</span>
                    <input
                      type="number"
                      value={newMaterials}
                      onChange={(e) => setNewMaterials(Number(e.target.value))}
                      className="w-full px-2 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-bold"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Демонтаж:</span>
                    <input
                      type="number"
                      value={newDemolition}
                      onChange={(e) => setNewDemolition(Number(e.target.value))}
                      className="w-full px-2 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-bold"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Дизайн-проект:</span>
                    <input
                      type="number"
                      value={newDesignProject}
                      onChange={(e) => setNewDesignProject(Number(e.target.value))}
                      className="w-full px-2 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsNewCompanyModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Создать бота</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Existing Bot */}
      {editingCompany && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-5 max-w-md w-full border border-zinc-200 dark:border-zinc-800 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800 mb-4">
              <h3 className="font-bold text-sm text-zinc-950 dark:text-white">
                Параметры бота «{editingCompany.name}»
              </h3>
              <button
                type="button"
                onClick={() => setEditingCompany(null)}
                className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditedCompany} className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                  Название компании:
                </label>
                <input
                  type="text"
                  required
                  value={editingCompany.name}
                  onChange={(e) => setEditingCompany({ ...editingCompany, name: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Город:</label>
                  <input
                    type="text"
                    value={editingCompany.city}
                    onChange={(e) => setEditingCompany({ ...editingCompany, city: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Прораб:</label>
                  <input
                    type="text"
                    value={editingCompany.foremanName}
                    onChange={(e) => setEditingCompany({ ...editingCompany, foremanName: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Телефон компании / прораба:</label>
                  <input
                    type="text"
                    value={editingCompany.foremanPhone}
                    onChange={(e) => setEditingCompany({ ...editingCompany, foremanPhone: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-mono"
                    placeholder="+7 (999) 000-00-00"
                  />
                </div>
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">@Бота Telegram:</label>
                  <input
                    type="text"
                    value={editingCompany.botUsername}
                    onChange={(e) => setEditingCompany({ ...editingCompany, botUsername: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                  Telegram ID прораба (chat_id для заявок):
                </label>
                <input
                  type="text"
                  value={editingCompany.adminChatId || ''}
                  onChange={(e) => setEditingCompany({ ...editingCompany, adminChatId: e.target.value })}
                  placeholder="Например: 5629144056 или 8602664076"
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400"
                />
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
                  Все заявки, сметы и уведомления клиентов этого бота будут перенаправляться на указанный Telegram ID.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Статус бота:</label>
                  <select
                    value={editingCompany.botStatus || 'active'}
                    onChange={(e) => setEditingCompany({ ...editingCompany, botStatus: e.target.value as BotDeploymentStatus })}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                  >
                    <option value="active">🟢 Активен у клиента</option>
                    <option value="ready">🟡 Готов к продаже</option>
                    <option value="development">⚪️ В разработке</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Цена продажи (₽):</label>
                  <input
                    type="number"
                    value={editingCompany.botPrice || 45000}
                    onChange={(e) => setEditingCompany({ ...editingCompany, botPrice: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  className="px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BotFather Token Modal */}
      {selectedTokenBot && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-950 dark:text-white">
                    Привязка токена @BotFather
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Компания: {selectedTokenBot.name} (@{selectedTokenBot.botUsername})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTokenBot(null)}
                className="w-7 h-7 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/50 space-y-1.5 text-xs">
              <div className="font-bold text-blue-950 dark:text-blue-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Инструкция по созданию бота в @BotFather:</span>
              </div>
              <ol className="list-decimal pl-4 space-y-1 text-blue-900 dark:text-blue-300 text-[11px]">
                <li>Откройте Telegram и найдите официального бота <b>@BotFather</b></li>
                <li>Отправьте команду <code>/newbot</code>, задайте имя и юзернейм (<code>@{selectedTokenBot.botUsername}</code>)</li>
                <li>Скопируйте выданный <b>HTTP API Token</b> и вставьте в поле ниже</li>
              </ol>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-700 dark:text-zinc-300 font-bold block mb-1">
                  Telegram Bot API Token:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    placeholder="1234567890:AAHdqTcvCH1vGWJxfU6SW5BCQNTH..."
                    value={botFatherToken}
                    onChange={(e) => {
                      setBotFatherToken(e.target.value);
                      setTokenCheckStatus(null);
                    }}
                    className="flex-1 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleTestToken}
                    disabled={isTestingToken}
                    className="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-bold text-xs transition shrink-0 disabled:opacity-50"
                  >
                    {isTestingToken ? 'Проверка...' : 'Проверить'}
                  </button>
                </div>
              </div>

              {tokenCheckStatus && (
                <div
                  className={`p-2.5 rounded-lg text-xs font-medium flex items-start gap-2 ${
                    tokenCheckStatus.ok
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                      : 'bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                  }`}
                >
                  {tokenCheckStatus.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  )}
                  <span>{tokenCheckStatus.message}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setSelectedTokenBot(null)}
                  className="px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-xs"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleSaveToken}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition"
                >
                  Привязать токен к боту
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
