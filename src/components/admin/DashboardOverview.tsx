import { useState, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  Building2,
  Clock,
  SendHorizontal,
  Calculator,
  Activity,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Zap,
} from 'lucide-react';
import { SaasStats, TenantCompany, LiveLead } from '../../types/admin';
import { computeRealRevenueHistory, RevenueHistoryPoint } from '../../lib/realDataService';

interface DashboardOverviewProps {
  stats: SaasStats;
  companies: TenantCompany[];
  recentLeads: LiveLead[];
  onNavigateToCompanies: () => void;
  onNavigateToLeads: () => void;
  onNavigateToMonitoring?: () => void;
  onOpenLeadModal: (lead: LiveLead) => void;
}

export function DashboardOverview({
  stats,
  companies,
  recentLeads,
  onNavigateToCompanies,
  onNavigateToLeads,
  onNavigateToMonitoring,
  onOpenLeadModal,
}: DashboardOverviewProps) {
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  // Dynamically compute 30-day timeline based on real database records
  const revenueHistory: RevenueHistoryPoint[] = useMemo(() => {
    return computeRealRevenueHistory(companies, recentLeads);
  }, [companies, recentLeads]);

  const maxRev = useMemo(() => {
    return Math.max(...revenueHistory.map((d) => d.revenue), 10000);
  }, [revenueHistory]);

  const minRev = useMemo(() => {
    return Math.min(...revenueHistory.map((d) => d.revenue), 0) * 0.85;
  }, [revenueHistory]);

  return (
    <div className="space-y-4">
      {/* Top Banner / Welcome styled like Mini App Antirazvod Banner */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center font-bold shrink-0 shadow-xs mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-zinc-950 dark:text-white">
                RemontSaaS Platform
              </span>
              <span className="text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded-sm bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                Все системы работают
              </span>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 leading-snug">
              Централизованное управление {companies.length} строительными компаниями и потоком смет по всей РФ.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onNavigateToLeads}
            className="py-1.5 px-3 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold transition flex items-center gap-1.5"
          >
            <span>Вся лента заявок</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
          </button>
          <button
            onClick={onNavigateToCompanies}
            className="py-1.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 text-xs font-bold transition flex items-center gap-1 shadow-xs"
          >
            <span>Реестр СК</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* KPI Cards Grid styled like Renovation Class cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-2 md:gap-2.5">
        {/* MRR */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              MRR Выручка
            </span>
            <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-sm bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
              +{stats.mrrGrowth}%
            </span>
          </div>
          <div>
            <div className="text-lg font-extrabold text-zinc-950 dark:text-white leading-tight">
              {stats.mrr.toLocaleString('ru-RU')} ₽
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
              Ежемесячная подписка
            </p>
          </div>
        </div>

        {/* Активных компаний */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Активных СК
            </span>
            <Building2 className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div>
            <div className="text-lg font-extrabold text-zinc-950 dark:text-white leading-tight">
              {stats.activeCompanies} <span className="text-xs font-normal text-zinc-500">из {companies.length}</span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
              Оплаченная подписка
            </p>
          </div>
        </div>

        {/* На триале */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Триал (3 лида)
            </span>
            <Clock className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div>
            <div className="text-lg font-extrabold text-zinc-950 dark:text-white leading-tight">
              {stats.trialCompanies} <span className="text-xs font-normal text-zinc-500">СК</span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
              Тестируют Telegram бот
            </p>
          </div>
        </div>

        {/* Заявок сегодня / мес */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Лиды сегодня
            </span>
            <SendHorizontal className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div>
            <div className="text-lg font-extrabold text-zinc-950 dark:text-white leading-tight">
              {stats.leadsToday} <span className="text-xs font-normal text-zinc-500">/ {stats.leadsMonth} всего</span>
            </div>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold mt-1">
              Поток в реальном времени
            </p>
          </div>
        </div>

        {/* Сумма смет */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Сумма смет
            </span>
            <Calculator className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div>
            <div className="text-lg font-extrabold text-zinc-950 dark:text-white leading-tight">
              {stats.totalEstimatesSum >= 1000000
                ? `${(stats.totalEstimatesSum / 1000000).toFixed(1)} млн ₽`
                : `${stats.totalEstimatesSum.toLocaleString('ru-RU')} ₽`}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
              Общий объем расчетов
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: Chart + Webhook Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* 30D Revenue Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold text-zinc-950 dark:text-white uppercase tracking-wider">
                  Динамика выручки и регистраций (30 дней)
                </h2>
                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  Daily
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                Рост подписной базы платформы RemontSaaS (текущий MRR: {stats.mrr.toLocaleString('ru-RU')} ₽)
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-medium">
              <div className="flex items-center gap-1.5 text-zinc-800 dark:text-zinc-200">
                <span className="w-2.5 h-2.5 rounded-sm bg-zinc-900 dark:bg-white inline-block" />
                <span>MRR (₽)</span>
              </div>
            </div>
          </div>

          {/* SVG Area / Line Chart with Tooltips & In-Chart Numbers */}
          <div className="relative h-56 w-full pt-1 flex flex-col justify-between">
            <div className="relative flex-1 w-full">
              <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 800 180">
                <defs>
                  <linearGradient id="chartGradientLight" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#18181b" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#18181b" stopOpacity="0.01" />
                  </linearGradient>
                </defs>

                {/* Grid Lines */}
                <line x1="0" y1="30" x2="800" y2="30" stroke="#e4e4e7" strokeDasharray="3 3" strokeWidth="1" className="dark:stroke-zinc-800" />
                <line x1="0" y1="85" x2="800" y2="85" stroke="#e4e4e7" strokeDasharray="3 3" strokeWidth="1" className="dark:stroke-zinc-800" />
                <line x1="0" y1="145" x2="800" y2="145" stroke="#e4e4e7" strokeDasharray="3 3" strokeWidth="1" className="dark:stroke-zinc-800" />

                {/* Path Generator */}
                {(() => {
                  const points = revenueHistory.map((item, idx) => {
                    const x = (idx / (revenueHistory.length - 1)) * 740 + 30;
                    const diff = maxRev - minRev || 1;
                    const normalizedY = (item.revenue - minRev) / diff;
                    const y = 145 - normalizedY * 115;
                    return { x, y, item };
                  });

                  const lineD = points.reduce((acc, p, idx) => {
                    return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
                  }, '');

                  const areaD = `${lineD} L ${points[points.length - 1].x} 155 L ${points[0].x} 155 Z`;

                  return (
                    <>
                      <path d={areaD} fill="url(#chartGradientLight)" />
                      <path
                        d={lineD}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        className="text-zinc-900 dark:text-white"
                      />

                      {/* Display Data Point Circles & In-Chart Numerical Labels */}
                      {points.map((p, idx) => {
                        const isHovered = hoveredPoint === idx;
                        const formattedLabel = `${Math.round(p.item.revenue / 1000)}k`;

                        return (
                          <g key={idx} className="cursor-pointer">
                            {/* Numerical Value above node */}
                            <text
                              x={p.x}
                              y={p.y - 10}
                              textAnchor="middle"
                              className={`text-[11px] font-mono select-none font-bold transition-opacity ${
                                isHovered
                                  ? 'fill-emerald-600 dark:fill-emerald-400 font-extrabold text-[12px]'
                                  : 'fill-zinc-600 dark:fill-zinc-400 opacity-90'
                              }`}
                            >
                              {formattedLabel}
                            </text>

                            {/* Circle point */}
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={isHovered ? 6 : 4}
                              className={`transition-all ${
                                isHovered
                                  ? 'fill-zinc-950 dark:fill-white stroke-white dark:stroke-zinc-950 stroke-[2px]'
                                  : 'fill-zinc-800 dark:fill-zinc-200'
                              }`}
                              onMouseEnter={() => setHoveredPoint(idx)}
                              onMouseLeave={() => setHoveredPoint(null)}
                            />
                          </g>
                        );
                      })}
                    </>
                  );
                })()}
              </svg>

              {/* Hover Tooltip Overlay */}
              {hoveredPoint !== null && revenueHistory[hoveredPoint] && (
                <div
                  className="absolute -top-4 z-20 bg-zinc-900 dark:bg-zinc-800 text-white border border-zinc-700 rounded-lg p-2 text-xs shadow-md pointer-events-none transform -translate-x-1/2"
                  style={{
                    left: `${(hoveredPoint / (revenueHistory.length - 1)) * 92 + 4}%`,
                  }}
                >
                  <div className="font-bold">{revenueHistory[hoveredPoint].day}</div>
                  <div className="text-emerald-400 font-extrabold">
                    {revenueHistory[hoveredPoint].revenue.toLocaleString('ru-RU')} ₽ MRR
                  </div>
                  <div className="text-zinc-400 text-[10px]">
                    +{revenueHistory[hoveredPoint].registrations} новых СК |{' '}
                    {revenueHistory[hoveredPoint].leads} заявок
                  </div>
                </div>
              )}
            </div>

            {/* Dates row strictly aligned under the graph nodes */}
            <div className="flex justify-between items-center text-[11px] text-zinc-500 pt-1.5 border-t border-zinc-200 dark:border-zinc-800 px-1 mt-1">
              {revenueHistory.map((item, idx) => (
                <span
                  key={idx}
                  className={`transition-colors select-none text-center ${
                    hoveredPoint === idx
                      ? 'font-extrabold text-zinc-950 dark:text-white'
                      : 'font-medium'
                  }`}
                >
                  {item.day}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Webhook Health Card */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                Здоровье вебхуков
              </span>
              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                {stats.webhooksTotal} ботов
              </span>
            </div>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
              Мониторинг обратных вызовов Telegram Bot API для СК.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/80">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <div className="text-xs font-bold text-zinc-900 dark:text-white">
                    {stats.webhooksHealthy} онлайн (активны)
                  </div>
                  <div className="text-[10px] text-zinc-500">Задержка &lt; 85 мс</div>
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {stats.webhooksTotal > 0
                  ? `${Math.round((stats.webhooksHealthy / stats.webhooksTotal) * 100)}%`
                  : '100%'}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <div>
                  <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    {stats.webhooksWarning} требуют внимания
                  </div>
                  <div className="text-[10px] text-amber-800/80 dark:text-amber-300/80">
                    {stats.webhooksWarning > 0 ? 'Ошибка HTTP 401 / токен' : 'Все вебхуки исправны'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  if (onNavigateToMonitoring) {
                    onNavigateToMonitoring();
                  } else {
                    onNavigateToCompanies();
                  }
                }}
                className="text-[11px] font-bold text-amber-800 dark:text-amber-300 hover:underline cursor-pointer"
              >
                Мониторинг
              </button>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1">
            <div className="flex justify-between">
              <span>Сетевой шлюз:</span>
              <span className="font-bold text-zinc-900 dark:text-zinc-200 font-mono">FastAPI / aiogram 3</span>
            </div>
            <div className="flex justify-between">
              <span>База данных:</span>
              <span className="font-bold text-zinc-900 dark:text-zinc-200 font-mono">PostgreSQL Supabase</span>
            </div>
          </div>
        </div>
      </div>

      {/* Latest Leads Table Card */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-xs">
        <div className="flex items-center justify-between mb-3 px-0.5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                Последние входящие заявки
              </h2>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Расчеты через клиентские Mini App калькуляторы
            </p>
          </div>
          <button
            onClick={onNavigateToLeads}
            className="text-xs font-bold text-zinc-900 dark:text-white hover:underline flex items-center gap-1"
          >
            <span>Все заявки ({recentLeads.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Mobile Compact Leads List */}
        <div className="md:hidden space-y-2">
          {recentLeads.slice(0, 4).map((lead) => (
            <div
              key={lead.id}
              className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between gap-2"
            >
              <div>
                <div className="text-xs font-bold text-zinc-950 dark:text-white">
                  {lead.customerName} • {lead.area} м²
                </div>
                <div className="text-[10px] text-zinc-500">
                  {lead.companyName} • {lead.createdAt}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xs text-zinc-950 dark:text-white whitespace-nowrap">
                  {lead.estimateTotal.toLocaleString('ru-RU')} ₽
                </span>
                <button
                  onClick={() => onOpenLeadModal(lead)}
                  className="px-2 py-1 rounded bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 text-[10px] font-bold"
                >
                  Смета
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
                <th className="py-2.5 px-3 font-bold">Время</th>
                <th className="py-2.5 px-3 font-bold">Компания</th>
                <th className="py-2.5 px-3 font-bold">Клиент</th>
                <th className="py-2.5 px-3 font-bold">Объект</th>
                <th className="py-2.5 px-3 font-bold">Площадь</th>
                <th className="py-2.5 px-3 font-bold">Сумма сметы</th>
                <th className="py-2.5 px-3 text-right font-bold">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {recentLeads.slice(0, 4).map((lead) => (
                <tr key={lead.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                  <td className="py-2.5 px-3 text-zinc-500 whitespace-nowrap">{lead.createdAt}</td>
                  <td className="py-2.5 px-3 font-bold text-zinc-950 dark:text-white">{lead.companyName}</td>
                  <td className="py-2.5 px-3 text-zinc-800 dark:text-zinc-200">
                    <div className="font-semibold">{lead.customerName}</div>
                    <div className="text-[11px] text-zinc-500">{lead.phone}</div>
                  </td>
                  <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400 max-w-[200px] truncate">{lead.address}</td>
                  <td className="py-2.5 px-3 font-bold text-zinc-950 dark:text-white">{lead.area} м²</td>
                  <td className="py-2.5 px-3 font-extrabold text-zinc-950 dark:text-white whitespace-nowrap">
                    {lead.estimateTotal.toLocaleString('ru-RU')} ₽
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={() => onOpenLeadModal(lead)}
                      className="px-2.5 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-[11px] font-bold transition"
                    >
                      Смета
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
