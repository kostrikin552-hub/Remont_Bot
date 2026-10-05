import { useState, useEffect } from 'react';
import { AdminSidebar, AdminTab } from './AdminSidebar';
import { DashboardOverview } from './DashboardOverview';
import { CompanyRegistry } from './CompanyRegistry';
import { LiveLeadsFeed } from './LiveLeadsFeed';
import { TelegramBroadcast } from './TelegramBroadcast';
import { GlobalSettings } from './GlobalSettings';
import { SystemMonitoring } from './SystemMonitoring';
import { LeadEstimateModal } from './LeadEstimateModal';
import { MiniAppSimulatorModal } from './MiniAppSimulatorModal';
import {
  fetchRealCompanies,
  fetchRealLeads,
  computeRealStats,
  pingRealInfrastructure,
  fetchRealErrorLogs,
  saveCompaniesToStorage,
  saveLeadsToStorage,
  saveErrorLogsToStorage,
  getCompaniesFromStorage,
  getLeadsFromStorage,
} from '../../lib/realDataService';
import {
  INITIAL_COMPANIES,
  INITIAL_LEADS,
  SYSTEM_NODES,
  INITIAL_ERROR_LOGS,
} from '../../data/mockAdminData';
import { TenantCompany, LiveLead, SaasStats, SystemServiceNode, SystemErrorLog } from '../../types/admin';
import {
  ChevronRight,
  Check,
  Sun,
  Moon,
  Smartphone,
  RefreshCw,
  Menu,
  LayoutDashboard,
  Building2,
  Users,
  Activity,
  SlidersHorizontal,
} from 'lucide-react';

interface SuperAdminDashboardProps {
  onSwitchToMiniApp?: () => void;
  isDark?: boolean;
  onToggleTheme?: () => void;
}

export function SuperAdminDashboard({
  onSwitchToMiniApp,
  isDark = false,
  onToggleTheme,
}: SuperAdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Real SaaS Data States initialized with local storage / baseline
  const [companies, setCompanies] = useState<TenantCompany[]>(() => {
    const cached = getCompaniesFromStorage();
    return cached.length > 0 ? cached : INITIAL_COMPANIES;
  });
  const [leads, setLeads] = useState<LiveLead[]>(() => {
    const cached = getLeadsFromStorage();
    return cached.length > 0 ? cached : INITIAL_LEADS;
  });
  const [nodes, setNodes] = useState<SystemServiceNode[]>(SYSTEM_NODES);
  const [errorLogs, setErrorLogs] = useState<SystemErrorLog[]>(INITIAL_ERROR_LOGS);
  const [isLoadingRealData, setIsLoadingRealData] = useState<boolean>(true);

  // Dynamic real stats computed from actual records
  const [stats, setStats] = useState<SaasStats>(() =>
    computeRealStats(companies, leads, nodes)
  );

  // Fetch real data on component mount
  useEffect(() => {
    let isMounted = true;

    async function loadRealData() {
      try {
        const [realCompanies, realLeads, realNodes, realErrors] = await Promise.all([
          fetchRealCompanies(),
          fetchRealLeads(),
          pingRealInfrastructure(),
          fetchRealErrorLogs(),
        ]);

        if (isMounted) {
          const finalCompanies = realCompanies.length > 0 ? realCompanies : INITIAL_COMPANIES;
          const finalLeads = realLeads.length > 0 ? realLeads : INITIAL_LEADS;
          const finalErrors = realErrors.length > 0 ? realErrors : INITIAL_ERROR_LOGS;

          setCompanies(finalCompanies);
          setLeads(finalLeads);
          setNodes(realNodes);
          setErrorLogs(finalErrors);
          setStats(computeRealStats(finalCompanies, finalLeads, realNodes));
          setIsLoadingRealData(false);
        }
      } catch (err) {
        console.warn('Real data initialization failed:', err);
        if (isMounted) {
          setIsLoadingRealData(false);
        }
      }
    }

    loadRealData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Modals
  const [selectedLead, setSelectedLead] = useState<LiveLead | null>(null);
  const [simulatorCompany, setSimulatorCompany] = useState<TenantCompany | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAddDays = (companyId: string, daysToAdd: number) => {
    setCompanies((prev) => {
      const updated = prev.map((c) => {
        if (c.id === companyId) {
          const newDays = c.daysLeft + daysToAdd;
          return {
            ...c,
            daysLeft: newDays,
            subscriptionStatus: 'active' as const,
          };
        }
        return c;
      });
      saveCompaniesToStorage(updated);
      setStats(computeRealStats(updated, leads, nodes));
      return updated;
    });
    showToast(`Подписка компании продлена на +${daysToAdd} дней!`);
  };

  const handleAddTrialLeads = (companyId: string, extraLeads: number) => {
    setCompanies((prev) => {
      const updated = prev.map((c) => {
        if (c.id === companyId) {
          return {
            ...c,
            trialLeadsLeft: c.trialLeadsLeft + extraLeads,
          };
        }
        return c;
      });
      saveCompaniesToStorage(updated);
      return updated;
    });
    showToast(`К триалу компании начислено +${extraLeads} лида!`);
  };

  const handleToggleBlock = (companyId: string) => {
    setCompanies((prev) => {
      const updated = prev.map((c) => {
        if (c.id === companyId) {
          const blocked = !c.isBlocked;
          showToast(
            blocked
              ? `Компания "${c.name}" заблокирована.`
              : `Компания "${c.name}" успешно разблокирована.`
          );
          return { ...c, isBlocked: blocked };
        }
        return c;
      });
      saveCompaniesToStorage(updated);
      setStats(computeRealStats(updated, leads, nodes));
      return updated;
    });
  };

  const handleToggleLeadLock = (leadId: string) => {
    setLeads((prev) => {
      const updated = prev.map((l) => {
        if (l.id === leadId) {
          const unlocked = !l.isUnlocked;
          return {
            ...l,
            isUnlocked: unlocked,
            phone: unlocked ? (l.phone.includes('*') ? '+7 (918) 555-12-88' : l.phone) : '+7 (918) ***-**-44',
          };
        }
        return l;
      });
      saveLeadsToStorage(updated);
      return updated;
    });
    showToast('Статус блокировки номера телефона обновлен.');
  };

  const handleBroadcastSuccess = (info: { segment: string; count: number }) => {
    showToast(`Рассылка запущена для ${info.count} компаний!`);
  };

  const handleResolveError = (errorId: string) => {
    setErrorLogs((prev) => {
      const updated = prev.map((err) => (err.id === errorId ? { ...err, resolved: true } : err));
      saveErrorLogsToStorage(updated);
      return updated;
    });
    // If it was a webhook error, update stats
    setStats((prev) => ({
      ...prev,
      webhooksWarning: Math.max(0, prev.webhooksWarning - 1),
      webhooksHealthy: Math.min(prev.webhooksTotal, prev.webhooksHealthy + 1),
    }));
    showToast('Инцидент помечен как решённый.');
  };

  const handleRefreshChecks = async () => {
    try {
      const refreshedNodes = await pingRealInfrastructure();
      setNodes(refreshedNodes);
      showToast('Сетевой статус всех узлов проверен: данные актуализированы.');
    } catch {
      showToast('Проверка узлов завершена.');
    }
  };

  return (
    <div className="flex h-screen bg-[#f4f4f5] dark:bg-[#09090b] text-[#18181b] dark:text-[#f4f4f5] overflow-hidden font-['Manrope',sans-serif] antialiased selection:bg-zinc-800 selection:text-white dark:selection:bg-zinc-200 dark:selection:text-zinc-950 transition-colors">
      {/* Sidebar Navigation */}
      <AdminSidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenMiniApp={() => {
          if (onSwitchToMiniApp) {
            onSwitchToMiniApp();
          } else {
            setSimulatorCompany(companies[0]);
          }
        }}
        pendingIssuesCount={stats.webhooksWarning}
        companiesCount={companies.length}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden pb-14 md:pb-0">
        {/* Top Navbar styled like Header.tsx */}
        <header className="h-12 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-3 md:px-5 flex items-center justify-between shrink-0 transition-colors">
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            {/* Mobile Hamburger Menu */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition"
              aria-label="Открыть меню"
            >
              <Menu className="w-4 h-4" />
            </button>

            <span className="font-bold text-zinc-950 dark:text-white hidden sm:inline">RemontSaaS</span>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-400 hidden sm:inline" />
            <span className="text-zinc-800 dark:text-zinc-200 font-semibold truncate max-w-[130px] sm:max-w-none">
              {activeTab === 'overview' && 'Главный дашборд'}
              {activeTab === 'companies' && 'Реестр компаний'}
              {activeTab === 'leads' && 'Живая лента заявок'}
              {activeTab === 'broadcast' && 'Telegram Рассылка'}
              {activeTab === 'monitoring' && 'Мониторинг & Ошибки'}
              {activeTab === 'settings' && 'Настройки и ГОСТ'}
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* Live Data Refresh Trigger */}
            <button
              onClick={async () => {
                try {
                  const [realComps, realLds, realNds, realErrs] = await Promise.all([
                    fetchRealCompanies(),
                    fetchRealLeads(),
                    pingRealInfrastructure(),
                    fetchRealErrorLogs(),
                  ]);
                  if (realComps.length > 0) setCompanies(realComps);
                  if (realLds.length > 0) setLeads(realLds);
                  setNodes(realNds);
                  setErrorLogs(realErrs);
                  setStats(computeRealStats(realComps.length > 0 ? realComps : companies, realLds.length > 0 ? realLds : leads, realNds));
                  showToast('Все данные синхронизированы с базой данных!');
                } catch {
                  showToast('Ошибка при обновлении данных.');
                }
              }}
              title="Синхронизировать с базой данных и пересчитать"
              className="p-1.5 sm:px-2 sm:py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Синхронизация</span>
            </button>

            {/* Quick Switch to Client Mini App */}
            {onSwitchToMiniApp && (
              <button
                onClick={onSwitchToMiniApp}
                title="Клиентский Mini App"
                className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold transition flex items-center gap-1.5 shadow-xs shrink-0"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Клиентский Mini App</span>
              </button>
            )}

            {/* Dark/Light Theme toggle button matching Header */}
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label="Сменить тему"
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 flex items-center justify-center transition shrink-0"
              >
                {isDark ? (
                  <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500" />
                ) : (
                  <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-800" />
                )}
              </button>
            )}

            {/* Admin Profile */}
            <div className="flex items-center gap-1.5 sm:gap-2 pl-1 sm:pl-2 border-l border-zinc-200 dark:border-zinc-800 shrink-0">
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 font-extrabold text-[11px] sm:text-xs flex items-center justify-center shadow-xs">
                SA
              </div>
              <div className="hidden xl:block text-left">
                <div className="text-xs font-bold text-zinc-950 dark:text-white leading-tight">SuperAdmin</div>
                <div className="text-[10px] text-zinc-500 font-mono">root@remontsaas.ru</div>
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Tab Body with consistent padding and background */}
        <main className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">
          {activeTab === 'overview' && (
            <DashboardOverview
              stats={stats}
              companies={companies}
              recentLeads={leads}
              onNavigateToCompanies={() => setActiveTab('companies')}
              onNavigateToLeads={() => setActiveTab('leads')}
              onNavigateToMonitoring={() => setActiveTab('monitoring')}
              onOpenLeadModal={(lead) => setSelectedLead(lead)}
            />
          )}

          {activeTab === 'companies' && (
            <CompanyRegistry
              companies={companies}
              onAddDays={handleAddDays}
              onAddTrialLeads={handleAddTrialLeads}
              onToggleBlock={handleToggleBlock}
              onTestMiniApp={(comp) => setSimulatorCompany(comp)}
              onAddCompany={(newComp) => {
                setCompanies((prev) => {
                  const updated = [newComp, ...prev];
                  saveCompaniesToStorage(updated);
                  setStats(computeRealStats(updated, leads, nodes));
                  return updated;
                });
                showToast(`Компания "${newComp.name}" успешно зарегистрирована в системе!`);
              }}
            />
          )}

          {activeTab === 'leads' && (
            <LiveLeadsFeed
              leads={leads}
              onOpenLeadModal={(lead) => setSelectedLead(lead)}
              onToggleLeadLock={handleToggleLeadLock}
            />
          )}

          {activeTab === 'broadcast' && (
            <TelegramBroadcast
              companies={companies}
              onBroadcastSuccess={handleBroadcastSuccess}
            />
          )}

          {activeTab === 'monitoring' && (
            <SystemMonitoring
              nodes={nodes}
              errorLogs={errorLogs}
              onResolveError={handleResolveError}
              onRefreshChecks={handleRefreshChecks}
            />
          )}

          {activeTab === 'settings' && <GlobalSettings />}
        </main>

        {/* Mobile Fixed Bottom Navigation Bar (Telegram Native Style) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200/80 dark:border-zinc-800/80 px-2 py-1.5 flex items-center justify-around safe-bottom">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-[10px] font-bold transition ${
              activeTab === 'overview'
                ? 'text-zinc-950 dark:text-white'
                : 'text-zinc-600 dark:text-zinc-300'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Дашборд</span>
          </button>

          <button
            onClick={() => setActiveTab('companies')}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-[10px] font-bold transition relative ${
              activeTab === 'companies'
                ? 'text-zinc-950 dark:text-white'
                : 'text-zinc-600 dark:text-zinc-300'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Компании</span>
          </button>

          <button
            onClick={() => setActiveTab('leads')}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-[10px] font-bold transition relative ${
              activeTab === 'leads'
                ? 'text-zinc-950 dark:text-white'
                : 'text-zinc-600 dark:text-zinc-300'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Лиды</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 absolute top-1 right-2" />
          </button>

          <button
            onClick={() => setActiveTab('monitoring')}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-[10px] font-bold transition relative ${
              activeTab === 'monitoring'
                ? 'text-zinc-950 dark:text-white'
                : 'text-zinc-600 dark:text-zinc-300'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Статус</span>
            {stats.webhooksWarning > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 absolute top-1 right-2" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-[10px] font-bold transition ${
              activeTab === 'settings'
                ? 'text-zinc-950 dark:text-white'
                : 'text-zinc-600 dark:text-zinc-300'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>ГОСТ</span>
          </button>
        </nav>
      </div>

      {/* Toast Notification matching Mini App design */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 px-3.5 py-2 bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 text-xs font-bold rounded-xl shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom duration-150">
          <div className="w-4 h-4 rounded-full bg-white/20 dark:bg-zinc-900/20 flex items-center justify-center">
            <Check className="w-2.5 h-2.5" />
          </div>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modal: Lead Detailed Estimate */}
      <LeadEstimateModal
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
      />

      {/* Modal: Interactive Mini App Smartphone Simulator */}
      {simulatorCompany && (
        <MiniAppSimulatorModal
          company={simulatorCompany}
          allCompanies={companies}
          onSelectCompany={(c) => setSimulatorCompany(c)}
          onClose={() => setSimulatorCompany(null)}
        />
      )}
    </div>
  );
}
