import { useState, useMemo } from 'react';
import {
  Search,
  Lock,
  Unlock,
  Eye,
  Building2,
  Clock,
} from 'lucide-react';
import { LiveLead } from '../../types/admin';

interface LiveLeadsFeedProps {
  leads: LiveLead[];
  onOpenLeadModal: (lead: LiveLead) => void;
  onToggleLeadLock: (leadId: string) => void;
}

export function LiveLeadsFeed({
  leads,
  onOpenLeadModal,
  onToggleLeadLock,
}: LiveLeadsFeedProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCity, setFilterCity] = useState('all');
  const [filterCompany, setFilterCompany] = useState('all');

  const companiesList = useMemo(() => {
    return Array.from(new Set(leads.map((l) => l.companyName)));
  }, [leads]);

  const citiesList = useMemo(() => {
    return Array.from(new Set(leads.map((l) => l.city)));
  }, [leads]);

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      const matchSearch =
        l.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.phone.includes(searchQuery);

      const matchCity = filterCity === 'all' || l.city === filterCity;
      const matchCompany = filterCompany === 'all' || l.companyName === filterCompany;

      return matchSearch && matchCity && matchCompany;
    });
  }, [leads, searchQuery, filterCity, filterCompany]);

  const totalFilteredSum = useMemo(() => {
    return filteredLeads.reduce((acc, lead) => acc + (lead.estimateTotal || 0), 0);
  }, [filteredLeads]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-zinc-950 dark:text-white uppercase tracking-wider">
              Живая лента заявок
            </h1>
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
              <span>Real-time Stream</span>
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Все онлайн-расчеты, проведенные клиентами строительных компаний.
          </p>
        </div>

        <div className="text-left md:text-right">
          <div className="text-[11px] text-zinc-500">Заявок в выборке:</div>
          <div className="text-sm font-extrabold text-zinc-950 dark:text-white">
            {filteredLeads.length} на{' '}
            {totalFilteredSum >= 1000000
              ? `${(totalFilteredSum / 1000000).toFixed(1)} млн ₽`
              : `${totalFilteredSum.toLocaleString('ru-RU')} ₽`}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full md:w-80 relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по имени, адресу, ЖК, телефону..."
            className="w-full pl-9 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* Company filter */}
          <select
            value={filterCompany}
            onChange={(e) => setFilterCompany(e.target.value)}
            className="flex-1 md:flex-none px-2.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:outline-none min-w-0"
          >
            <option value="all">Все СК ({leads.length})</option>
            {companiesList.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* City filter */}
          <select
            value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}
            className="flex-1 md:flex-none px-2.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:outline-none min-w-0"
          >
            <option value="all">Все города</option>
            {citiesList.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Mobile Card List View (< md) */}
      <div className="md:hidden space-y-2.5">
        {filteredLeads.map((lead) => (
          <div
            key={lead.id}
            className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-500 flex items-center gap-1 font-medium">
                <Clock className="w-3 h-3 text-zinc-400" />
                <span>{lead.createdAt}</span>
              </span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold">
                {lead.renovationClass}
              </span>
            </div>

            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold text-xs text-zinc-950 dark:text-white">
                  {lead.customerName}
                </div>
                <div className="text-[11px] text-zinc-500 font-medium">
                  {lead.city}, {lead.address}
                </div>
              </div>
              <div className="text-right">
                <div className="font-extrabold text-xs text-zinc-950 dark:text-white">
                  {lead.estimateTotal.toLocaleString('ru-RU')} ₽
                </div>
                <div className="text-[10px] text-zinc-400">
                  {lead.area} м²
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2">
              <button
                onClick={() => onToggleLeadLock(lead.id)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono transition ${
                  lead.isUnlocked
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {lead.isUnlocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                <span>{lead.phone}</span>
              </button>

              <button
                onClick={() => onOpenLeadModal(lead)}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-bold text-[11px] rounded-md transition shadow-xs flex items-center gap-1"
              >
                <Eye className="w-3 h-3" />
                <span>Смета</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Leads Table (Desktop md+) */}
      <div className="hidden md:block bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
                <th className="py-2.5 px-3 font-bold">Дата / Время</th>
                <th className="py-2.5 px-3 font-bold">Прикрепленная СК</th>
                <th className="py-2.5 px-3 font-bold">Заказчик</th>
                <th className="py-2.5 px-3 font-bold">Телефон</th>
                <th className="py-2.5 px-3 font-bold">Город & ЖК</th>
                <th className="py-2.5 px-3 font-bold">Площадь & Тариф</th>
                <th className="py-2.5 px-3 font-bold">Сумма сметы</th>
                <th className="py-2.5 px-3 text-right font-bold">Смета</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                  {/* Время */}
                  <td className="py-3 px-3 text-zinc-500 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{lead.createdAt}</span>
                    </div>
                  </td>

                  {/* Компания */}
                  <td className="py-3 px-3 font-bold text-zinc-950 dark:text-white">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{lead.companyName}</span>
                    </div>
                  </td>

                  {/* Заказчик */}
                  <td className="py-3 px-3 text-zinc-900 dark:text-zinc-100">
                    <div className="font-semibold">{lead.customerName}</div>
                    <div className="text-[11px] text-zinc-500">{lead.rooms}</div>
                  </td>

                  {/* Телефон (Locked / Unlocked) */}
                  <td className="py-3 px-3">
                    <button
                      onClick={() => onToggleLeadLock(lead.id)}
                      title={lead.isUnlocked ? 'Номер открыт прорабу' : 'Номер скрыт до списания лида'}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono transition ${
                        lead.isUnlocked
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700'
                      }`}
                    >
                      {lead.isUnlocked ? (
                        <Unlock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Lock className="w-3 h-3 text-zinc-400" />
                      )}
                      <span>{lead.phone}</span>
                    </button>
                  </td>

                  {/* Город и Адрес */}
                  <td className="py-3 px-3 text-zinc-800 dark:text-zinc-200">
                    <div className="font-semibold">{lead.city}</div>
                    <div className="text-[11px] text-zinc-500 max-w-[190px] truncate">
                      {lead.address}
                    </div>
                  </td>

                  {/* Параметры */}
                  <td className="py-3 px-3">
                    <div className="font-bold text-zinc-950 dark:text-white">{lead.area} м²</div>
                    <span className="inline-block mt-0.5 text-[9px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium">
                      {lead.renovationClass}
                    </span>
                  </td>

                  {/* Сумма сметы */}
                  <td className="py-3 px-3 whitespace-nowrap">
                    <div className="font-extrabold text-zinc-950 dark:text-white text-xs">
                      {lead.estimateTotal.toLocaleString('ru-RU')} ₽
                    </div>
                    {lead.savingsTotal > 0 && (
                      <div className="text-[10px] text-zinc-500">
                        Экономия: -{lead.savingsTotal.toLocaleString('ru-RU')} ₽
                      </div>
                    )}
                  </td>

                  {/* Кнопка сметы */}
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={() => onOpenLeadModal(lead)}
                      className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-bold text-xs rounded-md transition shadow-xs flex items-center gap-1.5 ml-auto"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Смета</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
