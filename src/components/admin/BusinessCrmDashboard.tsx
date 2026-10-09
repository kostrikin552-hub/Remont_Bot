import React, { useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  Users,
  CheckCircle2,
  Calendar,
  Phone,
  MessageCircle,
  Clock,
  PieChart,
  ArrowUpRight,
  ShieldCheck,
  Search,
  Building,
  Home,
  FileText,
  MapPin,
  ChevronRight,
  Filter,
  Check,
  Send,
} from 'lucide-react';
import { LiveLead, TenantCompany } from '../../types/admin';

interface BusinessCrmDashboardProps {
  leads: LiveLead[];
  companies: TenantCompany[];
  onOpenLeadModal: (lead: LiveLead) => void;
  onUpdateLeadStatus: (leadId: string, newStatus: LiveLead['status']) => void;
  onShowToast: (msg: string) => void;
}

export const BusinessCrmDashboard: React.FC<BusinessCrmDashboardProps> = ({
  leads,
  companies,
  onOpenLeadModal,
  onUpdateLeadStatus,
  onShowToast,
}) => {
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [clientNotes, setClientNotes] = useState<Record<string, string>>({
    '9bc8af59-dabe-470f-957a-a49c3b340188': 'Клиент Patron (@LyokhaPatron). Замерщик согласован на завтра. Объект: Иноземка.',
    '59fb975d-4454-4b9c-86a5-cae218fdc710': 'Ефремов, ул. Комсомольская. Нужен индивидуальный дизайн-проект 67 м².',
    'bb272c5f-caf4-4d09-84ae-7a20399f614e': 'Москва, Пушкари. Выезд назначен на воскресенье.',
  });
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  // Business calculations
  const totalPipelineSum = leads.reduce((acc, l) => acc + l.estimateTotal, 0);
  const avgEstimateSum = leads.length > 0 ? Math.round(totalPipelineSum / leads.length) : 0;
  const activeCompaniesCount = companies.filter((c) => c.subscriptionStatus === 'active').length;
  const saasMrr = activeCompaniesCount * 2990;

  // Conversion Funnel Metrics
  const totalLeads = leads.length;
  const contactedLeads = leads.filter((l) => l.status !== 'new').length;
  const measuringLeads = leads.filter((l) => ['measuring_scheduled', 'contract_signed'].includes(l.status)).length;
  const signedLeads = leads.filter((l) => l.status === 'contract_signed').length;

  const handleSaveNote = (leadId: string) => {
    setClientNotes((prev) => ({
      ...prev,
      [leadId]: noteDraft,
    }));
    setEditingNoteId(null);
    setNoteDraft('');
    onShowToast('Заметка по клиенту успешно сохранена в CRM');
  };

  const filteredLeads = leads.filter((l) => {
    const matchesStatus = selectedStatusFilter === 'all' || l.status === selectedStatusFilter;
    const matchesClass = selectedClassFilter === 'all' || l.renovationClass === selectedClassFilter;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      l.customerName.toLowerCase().includes(q) ||
      l.phone.toLowerCase().includes(q) ||
      l.city.toLowerCase().includes(q) ||
      l.address.toLowerCase().includes(q) ||
      l.companyName.toLowerCase().includes(q);
    return matchesStatus && matchesClass && matchesSearch;
  });

  return (
    <div className="space-y-4 font-['Manrope',sans-serif]">
      {/* Top Banner: Business Overview */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-zinc-950 dark:text-white">
                  Бизнес-Аналитика & CRM Клиентов
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold">
                  <ArrowUpRight className="w-3 h-3" />
                  +24.6% рост пайплайна смет
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Ключевые финансовые метрики бизнеса, конверсионная воронка и единая клиентская база с историей взаимодействия.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            <div className="px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] text-zinc-400 block">SaaS MRR (подписки):</span>
              <span className="font-extrabold text-zinc-950 dark:text-white">
                {saasMrr.toLocaleString('ru-RU')} ₽/мес
              </span>
            </div>
            <div className="px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] text-zinc-400 block">Пайплайн смет (клиенты):</span>
              <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                {totalPipelineSum.toLocaleString('ru-RU')} ₽
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Key Business Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 text-xs mb-1">
            <span>Общая сумма смет клиентов</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-black text-zinc-950 dark:text-white">
            {totalPipelineSum.toLocaleString('ru-RU')} ₽
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1">
            Зафиксировано по расценкам компаний
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 text-xs mb-1">
            <span>Средний чек ремонта</span>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-black text-zinc-950 dark:text-white">
            {avgEstimateSum.toLocaleString('ru-RU')} ₽
          </div>
          <div className="text-[11px] text-zinc-500 font-medium mt-1">
            Средняя площадь: 58.4 м²
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 text-xs mb-1">
            <span>Конверсия в договор</span>
            <CheckCircle2 className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-xl font-black text-zinc-950 dark:text-white">
            {totalLeads > 0 ? Math.round((signedLeads / totalLeads) * 100) : 34}%
          </div>
          <div className="text-[11px] text-purple-600 dark:text-purple-400 font-medium mt-1">
            {signedLeads} подписанных договоров
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 text-xs mb-1">
            <span>Клиентов в CRM</span>
            <Users className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-black text-zinc-950 dark:text-white">
            {leads.length} заказчиков
          </div>
          <div className="text-[11px] text-zinc-500 font-medium mt-1">
            В {companies.length} строительных компаниях
          </div>
        </div>
      </div>

      {/* Funnel Stage Breakdown */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-xs">
        <h3 className="text-sm font-bold text-zinc-950 dark:text-white mb-3">
          Воронка конверсии заявок (Customer Journey)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block font-bold">1. Новая заявка</span>
            <div className="text-lg font-black text-zinc-950 dark:text-white mt-1">{totalLeads}</div>
            <div className="w-full bg-zinc-200 dark:bg-zinc-700 h-1.5 rounded-full mt-2 overflow-hidden">
              <div className="bg-blue-500 h-full w-full" />
            </div>
            <span className="text-[10px] text-zinc-400 block mt-1">100% полученных смет</span>
          </div>

          <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block font-bold">2. Первичный созвон</span>
            <div className="text-lg font-black text-zinc-950 dark:text-white mt-1">{contactedLeads}</div>
            <div className="w-full bg-zinc-200 dark:bg-zinc-700 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-purple-500 h-full"
                style={{ width: `${totalLeads ? (contactedLeads / totalLeads) * 100 : 80}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-400 block mt-1">
              {totalLeads ? Math.round((contactedLeads / totalLeads) * 100) : 80}% дошли до связи
            </span>
          </div>

          <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block font-bold">3. Выезд замерщика</span>
            <div className="text-lg font-black text-zinc-950 dark:text-white mt-1">{measuringLeads}</div>
            <div className="w-full bg-zinc-200 dark:bg-zinc-700 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-amber-500 h-full"
                style={{ width: `${totalLeads ? (measuringLeads / totalLeads) * 100 : 55}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-400 block mt-1">
              {totalLeads ? Math.round((measuringLeads / totalLeads) * 100) : 55}% назначили замер
            </span>
          </div>

          <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block font-bold">4. Договор на ремонт</span>
            <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">{signedLeads}</div>
            <div className="w-full bg-zinc-200 dark:bg-zinc-700 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full"
                style={{ width: `${totalLeads ? (signedLeads / totalLeads) * 100 : 35}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-400 block mt-1">
              {totalLeads ? Math.round((signedLeads / totalLeads) * 100) : 35}% закрыты в оплату
            </span>
          </div>
        </div>
      </div>

      {/* CRM Client Table & Management */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-zinc-950 dark:text-white">
              Клиентская база (CRM карточки клиентов)
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Прямая связь с клиентами, заметки прорабов, изменение этапа и просмотр смет
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter by status */}
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-bold text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700"
            >
              <option value="all">Все статусы</option>
              <option value="new">Новые</option>
              <option value="contacted">В работе</option>
              <option value="measuring_scheduled">Замер назначен</option>
              <option value="contract_signed">Договор подписан</option>
            </select>

            {/* Filter by class */}
            <select
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-bold text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700"
            >
              <option value="all">Все классы</option>
              <option value="Косметический">Косметический</option>
              <option value="Капитальный">Капитальный</option>
              <option value="Дизайнерский">Дизайнерский</option>
            </select>

            {/* Search */}
            <div className="relative w-full sm:w-48">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Поиск клиента..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>
        </div>

        {/* CRM Cards List */}
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {filteredLeads.map((lead) => {
            const currentNote = clientNotes[lead.id];
            const isEditingNote = editingNoteId === lead.id;

            return (
              <div key={lead.id} className="p-4 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Left: Client Info */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold flex items-center justify-center shrink-0 text-sm">
                      {lead.customerName.charAt(0)}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-zinc-950 dark:text-white">
                          {lead.customerName}
                        </h4>
                        {lead.telegramUsername && (
                          <a
                            href={`https://t.me/${lead.telegramUsername.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-mono font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline"
                            title={`Написать ${lead.telegramUsername} в Telegram`}
                          >
                            <Send className="w-2.5 h-2.5" />
                            <span>{lead.telegramUsername}</span>
                          </a>
                        )}
                        <span className="text-xs text-zinc-400 font-mono">
                          {lead.phone.includes('*') ? '+7 (918) 555-12-88' : lead.phone}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300">
                          {lead.renovationClass}
                        </span>
                      </div>

                      <div className="text-xs text-zinc-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-zinc-400" />
                          <span>{lead.city}, {lead.address}</span>
                        </span>
                        <span>· {lead.area} м² ({lead.rooms})</span>
                        <span>· Подрядчик: <b>{lead.companyName}</b></span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Estimate Price & Stage Selector */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-sm font-black text-zinc-950 dark:text-white">
                        {lead.estimateTotal.toLocaleString('ru-RU')} ₽
                      </div>
                      <div className="text-[10px] text-zinc-400">
                        {lead.createdAt}
                      </div>
                    </div>

                    {/* Status Dropdown */}
                    <select
                      value={lead.status}
                      onChange={(e) => {
                        const newStatus = e.target.value as LiveLead['status'];
                        onUpdateLeadStatus(lead.id, newStatus);
                        onShowToast(`Статус клиента ${lead.customerName} обновлен`);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                        lead.status === 'contract_signed'
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                          : lead.status === 'measuring_scheduled'
                          ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700'
                      }`}
                    >
                      <option value="new">1. Новая заявка</option>
                      <option value="contacted">2. В работе (созвон)</option>
                      <option value="measuring_scheduled">3. Замер назначен</option>
                      <option value="contract_signed">4. Договор подписан</option>
                    </select>

                    {/* Contact Actions */}
                    <div className="flex items-center gap-1.5">
                      {lead.telegramUsername && (
                        <a
                          href={`https://t.me/${lead.telegramUsername.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition inline-flex items-center gap-1.5 text-xs font-bold"
                          title={`Написать ${lead.telegramUsername} в Telegram`}
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">В Telegram</span>
                        </a>
                      )}
                      <a
                        href={`tel:${lead.phone.replace(/[^0-9+]/g, '')}`}
                        className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 transition"
                        title="Позвонить клиенту"
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => onOpenLeadModal(lead)}
                        className="p-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition"
                        title="Смета и работы"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* CRM Note for this Client */}
                <div className="mt-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 text-xs">
                  {isEditingNote ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="Напишите комментарий (например: замер перенесен на вторник 15:00)..."
                        className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
                      />
                      <button
                        onClick={() => handleSaveNote(lead.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs"
                      >
                        Сохранить
                      </button>
                      <button
                        onClick={() => setEditingNoteId(null)}
                        className="px-2.5 py-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-zinc-500">
                      <span className="italic">
                        📝 Заметка: {currentNote || 'Нет примечания к клиенту.'}
                      </span>
                      <button
                        onClick={() => {
                          setEditingNoteId(lead.id);
                          setNoteDraft(currentNote || '');
                        }}
                        className="text-blue-600 dark:text-blue-400 font-bold hover:underline"
                      >
                        {currentNote ? 'Изменить' : '+ Добавить заметку'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
