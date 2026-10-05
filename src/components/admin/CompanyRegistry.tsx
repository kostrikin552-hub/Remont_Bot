import { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Zap,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  Clock,
  XCircle,
  Building,
  Phone,
  Send,
} from 'lucide-react';
import { TenantCompany } from '../../types/admin';

interface CompanyRegistryProps {
  companies: TenantCompany[];
  onAddDays: (companyId: string, days: number) => void;
  onAddTrialLeads: (companyId: string, leads: number) => void;
  onToggleBlock: (companyId: string) => void;
  onTestMiniApp: (company: TenantCompany) => void;
  onAddCompany?: (newCompany: TenantCompany) => void;
}

export function CompanyRegistry({
  companies,
  onAddDays,
  onAddTrialLeads,
  onToggleBlock,
  onTestMiniApp,
  onAddCompany,
}: CompanyRegistryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [isNewCompanyModalOpen, setIsNewCompanyModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCity, setNewCity] = useState('Москва');
  const [newForeman, setNewForeman] = useState('');
  const [newPhone, setNewPhone] = useState('+7 ');
  const [newBot, setNewBot] = useState('');

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
      const matchStatus =
        selectedStatus === 'all' || c.subscriptionStatus === selectedStatus;

      return matchSearch && matchCity && matchStatus;
    });
  }, [companies, searchQuery, selectedCity, selectedStatus]);

  const handleCreateCompanySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const slug = newName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9а-яё]/gi, '-')
      .replace(/-+/g, '-');
    const compId = `comp-${slug}-${Math.floor(100 + Math.random() * 900)}`;

    const created: TenantCompany = {
      id: compId,
      name: newName.trim(),
      city: newCity.trim(),
      foremanName: newForeman.trim() || 'Прораб',
      foremanPhone: newPhone.trim(),
      foremanTg: `@${(newForeman || 'foreman').toLowerCase().replace(/\s+/g, '_')}`,
      botUsername: (newBot || `${slug}_bot`).replace(/^@/, '').trim(),
      subscriptionStatus: 'trial',
      daysLeft: 14,
      trialLeadsLeft: 3,
      totalLeads: 0,
      revenueEst: 0,
      registeredAt: new Date().toISOString().split('T')[0],
      isBlocked: false,
      webhookStatus: 'healthy',
      pricingMultiplier: 1.0,
    };

    if (onAddCompany) {
      onAddCompany(created);
    }
    setIsNewCompanyModalOpen(false);
    setNewName('');
    setNewForeman('');
    setNewPhone('+7 ');
    setNewBot('');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-bold text-zinc-950 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <span>Реестр строительных компаний</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold normal-case">
              Всего: {companies.length}
            </span>
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Управление тарифами, продление подписок и симуляция клиентского Mini App.
          </p>
        </div>

        <button
          onClick={() => setIsNewCompanyModalOpen(true)}
          className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-bold text-xs rounded-lg transition shadow-xs flex items-center gap-1.5 self-start md:self-auto cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Подключить СК</span>
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
            <option value="active">Активна (Подписка)</option>
            <option value="trial">Триал (3 лида)</option>
            <option value="expired">Истекла / Ожидает оплаты</option>
          </select>
        </div>
      </div>

      {/* Mobile Card List View (< md) */}
      <div className="md:hidden space-y-2.5">
        {filtered.map((company) => (
          <div
            key={company.id}
            className={`bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-2.5 ${
              company.isBlocked ? 'opacity-60 bg-red-50/50 dark:bg-red-950/20' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center font-extrabold text-xs shrink-0">
                  {company.name.charAt(0)}
                </div>
                <div>
                  <div className="font-bold text-xs text-zinc-950 dark:text-white flex items-center gap-1">
                    <span>{company.name}</span>
                    {company.isBlocked && (
                      <span className="px-1 py-0.2 rounded text-[9px] bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 font-extrabold">
                        Блок
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {company.city} • @{company.botUsername}
                  </div>
                </div>
              </div>

              {company.subscriptionStatus === 'active' && (
                <span className="px-1.5 py-0.5 rounded-sm bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold shrink-0">
                  {company.daysLeft} дн
                </span>
              )}
              {company.subscriptionStatus === 'trial' && (
                <span className="px-1.5 py-0.5 rounded-sm bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 text-[10px] font-extrabold shrink-0">
                  Триал (ост. {company.trialLeadsLeft})
                </span>
              )}
              {company.subscriptionStatus === 'expired' && (
                <span className="px-1.5 py-0.5 rounded-sm bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 text-[10px] font-extrabold shrink-0">
                  Истекла
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-zinc-100 dark:border-zinc-800/80">
              <div>
                <span className="text-zinc-500 block text-[10px]">Прораб:</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{company.foremanName}</span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[10px]">Лидов / Сметы:</span>
                <span className="font-bold text-zinc-950 dark:text-white">
                  {company.totalLeads} лид. • {(company.revenueEst / 1000000).toFixed(1)} млн ₽
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => onAddDays(company.id, 30)}
                  className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-[11px] font-bold rounded-md transition flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-3 h-3" />
                  <span>+30 дн</span>
                </button>
                {company.subscriptionStatus === 'trial' && (
                  <button
                    onClick={() => onAddTrialLeads(company.id, 3)}
                    className="px-2 py-1 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 text-[11px] font-bold rounded-md transition flex items-center gap-1 shrink-0"
                  >
                    <Zap className="w-3 h-3" />
                    <span>+3</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0 ml-auto">
                <button
                  onClick={() => onTestMiniApp(company)}
                  className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-[11px] font-bold rounded-md transition flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Тест</span>
                </button>
                <button
                  onClick={() => onToggleBlock(company.id)}
                  className={`p-1.5 rounded-md transition ${
                    company.isBlocked
                      ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {company.isBlocked ? <ShieldAlert className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Companies Table (Desktop md+) */}
      <div className="hidden md:block bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
                <th className="py-2.5 px-3 font-bold">Компания / Город</th>
                <th className="py-2.5 px-3 font-bold">Прораб & Telegram</th>
                <th className="py-2.5 px-3 font-bold">Бот компании</th>
                <th className="py-2.5 px-3 font-bold">Статус & Остаток</th>
                <th className="py-2.5 px-3 font-bold">Лидов / Сметы</th>
                <th className="py-2.5 px-3 font-bold">Регистрация</th>
                <th className="py-2.5 px-3 text-right font-bold">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filtered.map((company) => (
                <tr
                  key={company.id}
                  className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors ${
                    company.isBlocked ? 'opacity-50 bg-red-50 dark:bg-red-950/20' : ''
                  }`}
                >
                  {/* Компания */}
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center font-extrabold text-xs shadow-xs">
                        {company.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-bold text-zinc-950 dark:text-white flex items-center gap-1.5">
                          <span>{company.name}</span>
                          {company.isBlocked && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 font-extrabold">
                              Блок
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-500 flex items-center gap-1">
                          <span>{company.city}</span>
                          <span className="text-zinc-400">•</span>
                          <span className="font-mono text-[10px]">{company.id}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Прораб & TG */}
                  <td className="py-3 px-3">
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100">{company.foremanName}</div>
                    <div className="text-[11px] text-zinc-500 flex items-center gap-2">
                      <span>{company.foremanPhone}</span>
                      <a
                        href={`https://t.me/${company.foremanTg.replace('@', '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-zinc-900 dark:text-white font-bold hover:underline flex items-center gap-0.5"
                      >
                        <Send className="w-2.5 h-2.5" />
                        <span>{company.foremanTg}</span>
                      </a>
                    </div>
                  </td>

                  {/* Бот */}
                  <td className="py-3 px-3">
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono text-[11px] border border-zinc-200 dark:border-zinc-700">
                      <span>@{company.botUsername}</span>
                      {company.webhookStatus === 'healthy' ? (
                        <span title="Вебхук активен" className="w-2 h-2 rounded-full bg-emerald-500" />
                      ) : (
                        <span title={company.webhookError || 'Ошибка'} className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      )}
                    </div>
                    {company.webhookError && (
                      <div className="text-[10px] text-amber-600 dark:text-amber-400 truncate max-w-[140px] mt-0.5 font-medium">
                        {company.webhookError}
                      </div>
                    )}
                  </td>

                  {/* Статус */}
                  <td className="py-3 px-3">
                    {company.subscriptionStatus === 'active' && (
                      <div>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold">
                          <CheckCircle className="w-3 h-3" />
                          <span>Активна</span>
                        </span>
                        <div className="text-[11px] text-zinc-500 mt-1 font-medium">
                          Осталось: <span className="font-bold text-zinc-950 dark:text-white">{company.daysLeft} дн.</span>
                        </div>
                      </div>
                    )}
                    {company.subscriptionStatus === 'trial' && (
                      <div>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 text-[10px] font-extrabold">
                          <Clock className="w-3 h-3" />
                          <span>Триал</span>
                        </span>
                        <div className="text-[11px] text-zinc-500 mt-1 font-medium">
                          Осталось: <span className="font-bold text-zinc-900 dark:text-zinc-100">{company.trialLeadsLeft} {company.trialLeadsLeft === 1 ? 'лид' : (company.trialLeadsLeft >= 2 && company.trialLeadsLeft <= 4 ? 'лида' : 'лидов')}</span>
                        </div>
                      </div>
                    )}
                    {company.subscriptionStatus === 'expired' && (
                      <div>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 text-[10px] font-extrabold">
                          <XCircle className="w-3 h-3" />
                          <span>Истекла</span>
                        </span>
                        <div className="text-[10px] text-zinc-500 mt-1">
                          Нужна оплата 2 990 ₽
                        </div>
                      </div>
                    )}
                  </td>

                  {/* Лидов / Сметы */}
                  <td className="py-3 px-3">
                    <div className="font-bold text-zinc-950 dark:text-white">{company.totalLeads} заявок</div>
                    <div className="text-[11px] text-zinc-500 font-medium">
                      {(company.revenueEst / 1000000).toFixed(1)} млн ₽
                    </div>
                  </td>

                  {/* Регистрация */}
                  <td className="py-3 px-3 text-zinc-500 whitespace-nowrap">
                    {company.registeredAt}
                  </td>

                  {/* Действия */}
                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* Кнопка +30 дней */}
                      <button
                        onClick={() => onAddDays(company.id, 30)}
                        title="Продлить подписку на 30 дней"
                        className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-[11px] font-bold rounded-md transition flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>30 дн</span>
                      </button>

                      {/* Кнопка +3 лида */}
                      {company.subscriptionStatus === 'trial' && (
                        <button
                          onClick={() => onAddTrialLeads(company.id, 3)}
                          title="Добавить +3 лида"
                          className="px-2 py-1 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 text-[11px] font-bold rounded-md transition flex items-center gap-1"
                        >
                          <Zap className="w-3 h-3" />
                          <span>+3</span>
                        </button>
                      )}

                      {/* Тест Mini App */}
                      <button
                        onClick={() => onTestMiniApp(company)}
                        title="Открыть Mini App симулятор"
                        className="p-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-md transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>

                      {/* Блокировка */}
                      <button
                        onClick={() => onToggleBlock(company.id)}
                        title={company.isBlocked ? 'Разблокировать' : 'Заблокировать'}
                        className={`p-1.5 rounded-md transition ${
                          company.isBlocked
                            ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-red-600'
                        }`}
                      >
                        {company.isBlocked ? (
                          <ShieldAlert className="w-3.5 h-3.5" />
                        ) : (
                          <ShieldCheck className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Connect New Company */}
      {isNewCompanyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <h2 className="text-sm font-bold text-zinc-950 dark:text-white uppercase tracking-wider">
                Подключить новую СК к платформе
              </h2>
              <button
                onClick={() => setIsNewCompanyModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-950 dark:hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCompanySubmit} className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 mb-1 block uppercase">
                  Название строительной компании:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Например: АльянсСтрой"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-950 dark:text-white font-medium focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 mb-1 block uppercase">
                    Город работы:
                  </label>
                  <input
                    type="text"
                    required
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-950 dark:text-white font-medium focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 mb-1 block uppercase">
                    Имя прораба:
                  </label>
                  <input
                    type="text"
                    placeholder="Иван Петров"
                    value={newForeman}
                    onChange={(e) => setNewForeman(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-950 dark:text-white font-medium focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 mb-1 block uppercase">
                    Телефон прораба:
                  </label>
                  <input
                    type="tel"
                    required
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-950 dark:text-white font-medium focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 mb-1 block uppercase">
                    Telegram бот (@bot):
                  </label>
                  <input
                    type="text"
                    placeholder="@my_remont_bot"
                    value={newBot}
                    onChange={(e) => setNewBot(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-950 dark:text-white font-medium focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewCompanyModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold transition"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-bold transition shadow-xs"
                >
                  Зарегистрировать СК
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
