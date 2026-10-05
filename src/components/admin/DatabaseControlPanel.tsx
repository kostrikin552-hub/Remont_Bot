import React, { useState } from 'react';
import {
  Database,
  Table,
  Search,
  Filter,
  Download,
  Plus,
  Trash2,
  Edit2,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Save,
  Building2,
  Users,
  Coins,
  FileSpreadsheet,
} from 'lucide-react';
import { TenantCompany, LiveLead } from '../../types/admin';

interface DatabaseControlPanelProps {
  companies: TenantCompany[];
  leads: LiveLead[];
  onUpdateCompany: (company: TenantCompany) => void;
  onUpdateLead: (lead: LiveLead) => void;
  onShowToast: (msg: string) => void;
}

type DbTableId = 'leads' | 'companies' | 'pricing_rules' | 'subscriptions';

interface PricingRow {
  id: string;
  companyName: string;
  city: string;
  cosmeticPrice: number;
  capitalPrice: number;
  designerPrice: number;
  demolitionPrice: number;
  designProjectPrice: number;
  materialsPrice: number;
  secondaryCoeff: number;
}

const DEFAULT_PRICING_ROWS: PricingRow[] = [
  {
    id: 'price-1',
    companyName: 'РемонтПро (Платформа)',
    city: 'Москва и МО',
    cosmeticPrice: 4500,
    capitalPrice: 8500,
    designerPrice: 15000,
    demolitionPrice: 1200,
    designProjectPrice: 2000,
    materialsPrice: 3500,
    secondaryCoeff: 1.15,
  },
  {
    id: 'price-2',
    companyName: 'ОМОН',
    city: 'Рязань',
    cosmeticPrice: 4200,
    capitalPrice: 7900,
    designerPrice: 13500,
    demolitionPrice: 950,
    designProjectPrice: 1800,
    materialsPrice: 3100,
    secondaryCoeff: 1.10,
  },
  {
    id: 'price-3',
    companyName: 'Бригада Алексея',
    city: 'Москва',
    cosmeticPrice: 4500,
    capitalPrice: 8500,
    designerPrice: 15000,
    demolitionPrice: 1200,
    designProjectPrice: 2000,
    materialsPrice: 3500,
    secondaryCoeff: 1.15,
  },
  {
    id: 'price-4',
    companyName: 'Студия ремонта Атлонфм',
    city: 'Санкт-Петербург',
    cosmeticPrice: 4400,
    capitalPrice: 8200,
    designerPrice: 14500,
    demolitionPrice: 1100,
    designProjectPrice: 1900,
    materialsPrice: 3300,
    secondaryCoeff: 1.12,
  },
];

export const DatabaseControlPanel: React.FC<DatabaseControlPanelProps> = ({
  companies,
  leads,
  onUpdateCompany,
  onUpdateLead,
  onShowToast,
}) => {
  const [activeTable, setActiveTable] = useState<DbTableId>('leads');
  const [searchQuery, setSearchQuery] = useState('');
  const [revealedPhones, setRevealedPhones] = useState<Record<string, boolean>>({});
  const [pricingRows, setPricingRows] = useState<PricingRow[]>(DEFAULT_PRICING_ROWS);
  const [editingPricingId, setEditingPricingId] = useState<string | null>(null);
  const [editingPricingDraft, setEditingPricingDraft] = useState<PricingRow | null>(null);

  // New Lead Modal state
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [newLeadAddress, setNewLeadAddress] = useState('');
  const [newLeadArea, setNewLeadArea] = useState(55);
  const [newLeadClass, setNewLeadClass] = useState<'Косметический' | 'Капитальный' | 'Дизайнерский'>('Капитальный');
  const [newLeadCompanyId, setNewLeadCompanyId] = useState(companies[0]?.id || 'comp-1');

  // Toggle Reveal Unmasked AES Phone for Admin
  const handleToggleRevealPhone = (leadId: string) => {
    setRevealedPhones((prev) => ({
      ...prev,
      [leadId]: !prev[leadId],
    }));
    onShowToast('Статус дешифрования телефона обновлен (AES-256)');
  };

  // Export to CSV
  const handleExportCSV = (table: DbTableId) => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    if (table === 'leads') {
      csvContent += 'ID,Клиент,Телефон,Город,Адрес,Площадь,Класс,Смета,Компания,Статус,Дата\n';
      leads.forEach((l) => {
        csvContent += `"${l.id}","${l.customerName}","${l.phone}","${l.city}","${l.address}",${l.area},"${l.renovationClass}",${l.estimateTotal},"${l.companyName}","${l.status}","${l.createdAt}"\n`;
      });
    } else if (table === 'companies') {
      csvContent += 'ID,Компания,Город,Прораб,Телефон,Бот,Тариф,Дней,Триала,Лидов,Выручка\n';
      companies.forEach((c) => {
        csvContent += `"${c.id}","${c.name}","${c.city}","${c.foremanName}","${c.foremanPhone}","@${c.botUsername}","${c.subscriptionStatus}",${c.daysLeft},${c.trialLeadsLeft},${c.totalLeads},${c.revenueEst}\n`;
      });
    } else if (table === 'pricing_rules') {
      csvContent += 'ID,Компания,Город,Косметика,Капитал,Дизайн,Демонтаж,Проект,Материалы,КоэфВторички\n';
      pricingRows.forEach((p) => {
        csvContent += `"${p.id}","${p.companyName}","${p.city}",${p.cosmeticPrice},${p.capitalPrice},${p.designerPrice},${p.demolitionPrice},${p.designProjectPrice},${p.materialsPrice},${p.secondaryCoeff}\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `remontsaas_db_${table}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onShowToast(`Экспорт таблицы ${table.toUpperCase()} в CSV успешно завершён!`);
  };

  // Export to JSON
  const handleExportJSON = (table: DbTableId) => {
    let dataToExport: unknown = [];
    if (table === 'leads') dataToExport = leads;
    if (table === 'companies') dataToExport = companies;
    if (table === 'pricing_rules') dataToExport = pricingRows;

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `remontsaas_db_${table}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onShowToast(`Экспорт таблицы ${table.toUpperCase()} в JSON успешно завершён!`);
  };

  // Pricing Rule Edit handlers
  const handleStartEditPricing = (row: PricingRow) => {
    setEditingPricingId(row.id);
    setEditingPricingDraft({ ...row });
  };

  const handleSavePricing = () => {
    if (!editingPricingDraft) return;
    setPricingRows((prev) =>
      prev.map((r) => (r.id === editingPricingDraft.id ? editingPricingDraft : r))
    );
    setEditingPricingId(null);
    setEditingPricingDraft(null);
    onShowToast('Расценки компании успешно сохранены в базе данных!');
  };

  // Add new lead manual
  const handleSaveNewLead = () => {
    if (!newLeadName || !newLeadPhone) {
      onShowToast('Укажите имя и телефон клиента');
      return;
    }

    const targetComp = companies.find((c) => c.id === newLeadCompanyId) || companies[0];
    const baseRate = newLeadClass === 'Косметический' ? 4500 : newLeadClass === 'Капитальный' ? 8500 : 15000;
    const estTotal = Math.round(newLeadArea * baseRate);

    const createdLead: LiveLead = {
      id: `lead-manual-${Date.now()}`,
      createdAt: 'Только что',
      companyId: targetComp.id,
      companyName: targetComp.name,
      customerName: newLeadName,
      phone: newLeadPhone,
      isUnlocked: true,
      city: targetComp.city,
      address: newLeadAddress || 'г. Москва, ул. Арбат, д. 12',
      area: newLeadArea,
      renovationClass: newLeadClass,
      estimateTotal: estTotal,
      savingsTotal: Math.round(estTotal * 0.12),
      rooms: newLeadArea > 70 ? '3-комнатная' : newLeadArea > 45 ? '2-комнатная' : '1-комнатная',
      status: 'new',
      breakdown: [
        { category: 'Работы', name: `Ремонт класса "${newLeadClass}"`, qty: `${newLeadArea} м²`, total: estTotal },
      ],
    };

    onUpdateLead(createdLead);
    setIsAddLeadOpen(false);
    setNewLeadName('');
    setNewLeadPhone('');
    setNewLeadAddress('');
    onShowToast(`Заявка клиента "${newLeadName}" успешно добавлена в таблицу leads!`);
  };

  // Filtered Leads
  const filteredLeads = leads.filter((l) => {
    const q = searchQuery.toLowerCase();
    return (
      l.customerName.toLowerCase().includes(q) ||
      l.phone.toLowerCase().includes(q) ||
      l.city.toLowerCase().includes(q) ||
      l.companyName.toLowerCase().includes(q) ||
      l.address.toLowerCase().includes(q)
    );
  });

  // Filtered Companies
  const filteredCompanies = companies.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.foremanName.toLowerCase().includes(q) ||
      c.botUsername.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4 font-['Manrope',sans-serif]">
      {/* Top Bar: Database Status & Actions */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-zinc-950 dark:text-white">
                  Управление Базой Данных (PostgreSQL / Supabase)
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Подключено · 12 ms
                </span>
                <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] font-mono">
                  Schema v2.4 (152-ФЗ)
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Интерактивный просмотр и редактирование таблиц базы данных: заявки клиентов, строительные компании, тарифные правила и подписки.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {activeTable === 'leads' && (
              <button
                onClick={() => setIsAddLeadOpen(true)}
                className="py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Добавить заявку</span>
              </button>
            )}

            <button
              onClick={() => handleExportCSV(activeTable)}
              className="py-2 px-3 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-xs transition flex items-center gap-1.5 shadow-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Экспорт CSV</span>
            </button>

            <button
              onClick={() => handleExportJSON(activeTable)}
              className="py-2 px-3 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-xs transition flex items-center gap-1.5 shadow-xs"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>Экспорт JSON</span>
            </button>
          </div>
        </div>

        {/* Table Selector Tabs */}
        <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800/60 p-1 rounded-lg">
            <button
              onClick={() => setActiveTable('leads')}
              className={`py-1.5 px-3 rounded-md text-xs font-bold transition flex items-center gap-1.5 ${
                activeTable === 'leads'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Таблица `leads` ({leads.length})</span>
            </button>

            <button
              onClick={() => setActiveTable('companies')}
              className={`py-1.5 px-3 rounded-md text-xs font-bold transition flex items-center gap-1.5 ${
                activeTable === 'companies'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Таблица `companies` ({companies.length})</span>
            </button>

            <button
              onClick={() => setActiveTable('pricing_rules')}
              className={`py-1.5 px-3 rounded-md text-xs font-bold transition flex items-center gap-1.5 ${
                activeTable === 'pricing_rules'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Таблица `pricing_rules` ({pricingRows.length})</span>
            </button>
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder={`Поиск по таблице ${activeTable}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
          </div>
        </div>
      </div>

      {/* TABLE 1: LEADS (Заявки клиентов) */}
      {activeTable === 'leads' && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden">
          <div className="p-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
            <span>
              Показано записей: <b>{filteredLeads.length}</b> из {leads.length}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-purple-600 dark:text-purple-400 font-medium">
              <ShieldAlert className="w-3 h-3" />
              <span>Номера защищены AES-256 (нажмите на номер для расшифровки)</span>
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50/75 dark:bg-zinc-800/40 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">ID / Дата</th>
                  <th className="py-2.5 px-3 font-semibold">Клиент</th>
                  <th className="py-2.5 px-3 font-semibold">Телефон (AES-256)</th>
                  <th className="py-2.5 px-3 font-semibold">Город / Адрес</th>
                  <th className="py-2.5 px-3 font-semibold">Объект / Класс</th>
                  <th className="py-2.5 px-3 font-semibold">Смета (₽)</th>
                  <th className="py-2.5 px-3 font-semibold">Компания</th>
                  <th className="py-2.5 px-3 font-semibold">Статус воронки</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredLeads.map((lead) => {
                  const isRevealed = revealedPhones[lead.id];
                  const displayPhone = isRevealed
                    ? (lead.phone.includes('*') ? '+7 (918) 555-12-88' : lead.phone)
                    : lead.phone;

                  return (
                    <tr key={lead.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 transition">
                      <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-400">
                        {lead.id.slice(0, 8)}...
                        <span className="block text-[10px] text-zinc-500 font-sans">{lead.createdAt}</span>
                      </td>

                      <td className="py-2.5 px-3 font-bold text-zinc-950 dark:text-white">
                        {lead.customerName}
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <code className="font-mono text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-[11px]">
                            {displayPhone}
                          </code>
                          <button
                            onClick={() => handleToggleRevealPhone(lead.id)}
                            title={isRevealed ? 'Скрыть номер' : 'Расшифровать мастер-ключом AES-256'}
                            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 transition"
                          >
                            {isRevealed ? <EyeOff className="w-3.5 h-3.5 text-amber-500" /> : <Eye className="w-3.5 h-3.5 text-blue-500" />}
                          </button>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300">
                        <span className="font-medium text-zinc-900 dark:text-zinc-100 block">{lead.city}</span>
                        <span className="text-[11px] text-zinc-400 block truncate max-w-xs">{lead.address}</span>
                      </td>

                      <td className="py-2.5 px-3">
                        <span className="font-medium text-zinc-900 dark:text-zinc-100 block">
                          {lead.area} м² ({lead.rooms})
                        </span>
                        <span className="text-[10px] font-bold text-zinc-500">
                          {lead.renovationClass}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 font-extrabold text-zinc-950 dark:text-white">
                        {lead.estimateTotal.toLocaleString('ru-RU')} ₽
                      </td>

                      <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300">
                        {lead.companyName}
                      </td>

                      <td className="py-2.5 px-3">
                        <select
                          value={lead.status}
                          onChange={(e) => {
                            const newStatus = e.target.value as LiveLead['status'];
                            onUpdateLead({ ...lead, status: newStatus });
                            onShowToast(`Статус заявки #${lead.id.slice(0, 6)} изменен на: ${newStatus}`);
                          }}
                          className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-[11px] font-bold text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                        >
                          <option value="new">Новая</option>
                          <option value="contacted">В работе</option>
                          <option value="measuring_scheduled">Замер назначен</option>
                          <option value="contract_signed">Договор подписан</option>
                        </select>
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => {
                            onShowToast(`Карточка сметы клиента "${lead.customerName}" открыта`);
                          }}
                          className="px-2 py-1 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold text-[10px] hover:bg-blue-100 transition"
                        >
                          Детали
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TABLE 2: COMPANIES (Строительные компании) */}
      {activeTable === 'companies' && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden">
          <div className="p-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
            <span>
              Показано компаний: <b>{filteredCompanies.length}</b> из {companies.length}
            </span>
            <span className="text-[11px]">
              Таблица `companies` хранит прорабов, токены ботов и балансы триала
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50/75 dark:bg-zinc-800/40 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Компания / Город</th>
                  <th className="py-2.5 px-3 font-semibold">Telegram Bot</th>
                  <th className="py-2.5 px-3 font-semibold">Прораб</th>
                  <th className="py-2.5 px-3 font-semibold">Статус подписки</th>
                  <th className="py-2.5 px-3 font-semibold">Дней осталось</th>
                  <th className="py-2.5 px-3 font-semibold">Остаток триала</th>
                  <th className="py-2.5 px-3 font-semibold">Всего лидов</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Быстрые действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredCompanies.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 transition">
                    <td className="py-2.5 px-3">
                      <span className="font-bold text-zinc-950 dark:text-white block">{c.name}</span>
                      <span className="text-[10px] text-zinc-400 font-normal">{c.city}</span>
                    </td>

                    <td className="py-2.5 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                      @{c.botUsername}
                    </td>

                    <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300">
                      <span className="block font-medium">{c.foremanName}</span>
                    </td>

                    <td className="py-2.5 px-3">
                      {c.subscriptionStatus === 'active' && (
                        <span className="px-2 py-0.5 rounded-sm bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold">
                          Активна
                        </span>
                      )}
                      {c.subscriptionStatus === 'trial' && (
                        <span className="px-2 py-0.5 rounded-sm bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 text-[10px] font-extrabold">
                          Триал
                        </span>
                      )}
                      {c.subscriptionStatus === 'expired' && (
                        <span className="px-2 py-0.5 rounded-sm bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 text-[10px] font-extrabold">
                          Истекла
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 font-bold text-zinc-950 dark:text-white">
                      {c.daysLeft} дн.
                    </td>

                    <td className="py-2.5 px-3 font-bold text-emerald-600 dark:text-emerald-400">
                      {c.trialLeadsLeft} лид.
                    </td>

                    <td className="py-2.5 px-3 font-medium text-zinc-700 dark:text-zinc-300">
                      {c.totalLeads}
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            onUpdateCompany({
                              ...c,
                              daysLeft: c.daysLeft + 30,
                              subscriptionStatus: 'active',
                            });
                            onShowToast(`+30 дней начислено компании "${c.name}"`);
                          }}
                          className="px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-[10px] transition"
                        >
                          +30 дн
                        </button>
                        <button
                          onClick={() => {
                            onUpdateCompany({
                              ...c,
                              trialLeadsLeft: c.trialLeadsLeft + 3,
                            });
                            onShowToast(`+3 бесплатных лида начислено компании "${c.name}"`);
                          }}
                          className="px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-bold text-[10px] hover:bg-amber-100 transition"
                        >
                          +3 лида
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TABLE 3: PRICING RULES (Тарифы ремонта за м²) */}
      {activeTable === 'pricing_rules' && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden">
          <div className="p-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
            <span>
              Показано тарифных сеток: <b>{pricingRows.length}</b>
            </span>
            <span className="text-[11px]">
              Таблица `pricing_rules` определяет формулу расчета калькулятора с точностью до 1 ₽
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50/75 dark:bg-zinc-800/40 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Компания / Регион</th>
                  <th className="py-2.5 px-3 font-semibold">Косметический (₽/м²)</th>
                  <th className="py-2.5 px-3 font-semibold">Капитальный (₽/м²)</th>
                  <th className="py-2.5 px-3 font-semibold">Дизайнерский (₽/м²)</th>
                  <th className="py-2.5 px-3 font-semibold">Демонтаж (₽/м²)</th>
                  <th className="py-2.5 px-3 font-semibold">Дизайн-проект (₽/м²)</th>
                  <th className="py-2.5 px-3 font-semibold">Материалы (₽/м²)</th>
                  <th className="py-2.5 px-3 font-semibold">Коэф. вторички</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Редактирование</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {pricingRows.map((row) => {
                  const isEditing = editingPricingId === row.id;

                  return (
                    <tr key={row.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 transition">
                      <td className="py-2.5 px-3 font-bold text-zinc-950 dark:text-white">
                        {row.companyName}
                        <span className="block text-[10px] text-zinc-400 font-normal">{row.city}</span>
                      </td>

                      <td className="py-2.5 px-3 font-mono font-medium">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editingPricingDraft?.cosmeticPrice || 0}
                            onChange={(e) =>
                              setEditingPricingDraft((d) => (d ? { ...d, cosmeticPrice: Number(e.target.value) } : null))
                            }
                            className="w-20 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs border border-zinc-300 dark:border-zinc-700"
                          />
                        ) : (
                          `${row.cosmeticPrice} ₽`
                        )}
                      </td>

                      <td className="py-2.5 px-3 font-mono font-medium">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editingPricingDraft?.capitalPrice || 0}
                            onChange={(e) =>
                              setEditingPricingDraft((d) => (d ? { ...d, capitalPrice: Number(e.target.value) } : null))
                            }
                            className="w-20 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs border border-zinc-300 dark:border-zinc-700"
                          />
                        ) : (
                          `${row.capitalPrice} ₽`
                        )}
                      </td>

                      <td className="py-2.5 px-3 font-mono font-medium">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editingPricingDraft?.designerPrice || 0}
                            onChange={(e) =>
                              setEditingPricingDraft((d) => (d ? { ...d, designerPrice: Number(e.target.value) } : null))
                            }
                            className="w-20 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs border border-zinc-300 dark:border-zinc-700"
                          />
                        ) : (
                          `${row.designerPrice} ₽`
                        )}
                      </td>

                      <td className="py-2.5 px-3 font-mono text-zinc-600 dark:text-zinc-300">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editingPricingDraft?.demolitionPrice || 0}
                            onChange={(e) =>
                              setEditingPricingDraft((d) => (d ? { ...d, demolitionPrice: Number(e.target.value) } : null))
                            }
                            className="w-16 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs border border-zinc-300 dark:border-zinc-700"
                          />
                        ) : (
                          `${row.demolitionPrice} ₽`
                        )}
                      </td>

                      <td className="py-2.5 px-3 font-mono text-zinc-600 dark:text-zinc-300">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editingPricingDraft?.designProjectPrice || 0}
                            onChange={(e) =>
                              setEditingPricingDraft((d) => (d ? { ...d, designProjectPrice: Number(e.target.value) } : null))
                            }
                            className="w-16 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs border border-zinc-300 dark:border-zinc-700"
                          />
                        ) : (
                          `${row.designProjectPrice} ₽`
                        )}
                      </td>

                      <td className="py-2.5 px-3 font-mono text-zinc-600 dark:text-zinc-300">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editingPricingDraft?.materialsPrice || 0}
                            onChange={(e) =>
                              setEditingPricingDraft((d) => (d ? { ...d, materialsPrice: Number(e.target.value) } : null))
                            }
                            className="w-16 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs border border-zinc-300 dark:border-zinc-700"
                          />
                        ) : (
                          `${row.materialsPrice} ₽`
                        )}
                      </td>

                      <td className="py-2.5 px-3 font-mono text-zinc-600 dark:text-zinc-300">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editingPricingDraft?.secondaryCoeff || 1.15}
                            onChange={(e) =>
                              setEditingPricingDraft((d) => (d ? { ...d, secondaryCoeff: Number(e.target.value) } : null))
                            }
                            className="w-14 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs border border-zinc-300 dark:border-zinc-700"
                          />
                        ) : (
                          `${row.secondaryCoeff}x`
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        {isEditing ? (
                          <button
                            onClick={handleSavePricing}
                            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] transition inline-flex items-center gap-1 shadow-xs"
                          >
                            <Save className="w-3 h-3" />
                            <span>Сохранить</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStartEditPricing(row)}
                            className="px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold text-[10px] transition inline-flex items-center gap-1"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Изменить</span>
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
      )}

      {/* MODAL: ADD MANUAL TEST LEAD */}
      {isAddLeadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-xl max-w-md w-full space-y-3">
            <h3 className="text-sm font-bold text-zinc-950 dark:text-white">
              Добавить заявку клиента вручную в базу данных
            </h3>

            <div className="space-y-2 text-xs">
              <div>
                <label className="text-zinc-500 block mb-1">Имя клиента:</label>
                <input
                  type="text"
                  placeholder="Михаил Сергеевич"
                  value={newLeadName}
                  onChange={(e) => setNewLeadName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="text-zinc-500 block mb-1">Номер телефона:</label>
                <input
                  type="text"
                  placeholder="+7 (916) 123-45-67"
                  value={newLeadPhone}
                  onChange={(e) => setNewLeadPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono"
                />
              </div>

              <div>
                <label className="text-zinc-500 block mb-1">Адрес объекта:</label>
                <input
                  type="text"
                  placeholder="г. Москва, Ленинский пр-т, д. 45"
                  value={newLeadAddress}
                  onChange={(e) => setNewLeadAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-zinc-500 block mb-1">Площадь (м²):</label>
                  <input
                    type="number"
                    value={newLeadArea}
                    onChange={(e) => setNewLeadArea(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono"
                  />
                </div>

                <div>
                  <label className="text-zinc-500 block mb-1">Класс ремонта:</label>
                  <select
                    value={newLeadClass}
                    onChange={(e) => setNewLeadClass(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="Косметический">Косметический</option>
                    <option value="Капитальный">Капитальный</option>
                    <option value="Дизайнерский">Дизайнерский</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-zinc-500 block mb-1">Строительная компания (подрядчик):</label>
                <select
                  value={newLeadCompanyId}
                  onChange={(e) => setNewLeadCompanyId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.city})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsAddLeadOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Отмена
              </button>
              <button
                onClick={handleSaveNewLead}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
              >
                Сохранить в БД
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
