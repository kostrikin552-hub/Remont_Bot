import {
  LayoutDashboard,
  Building2,
  Users,
  Send,
  SlidersHorizontal,
  ExternalLink,
  Zap,
  CheckCircle2,
  Activity,
} from 'lucide-react';

export type AdminTab = 'overview' | 'companies' | 'leads' | 'broadcast' | 'settings' | 'monitoring';

interface AdminSidebarProps {
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  onOpenMiniApp: () => void;
  pendingIssuesCount: number;
  companiesCount?: number;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export function AdminSidebar({
  activeTab,
  onSelectTab,
  onOpenMiniApp,
  pendingIssuesCount,
  companiesCount,
  isOpenMobile = false,
  onCloseMobile,
}: AdminSidebarProps) {
  const menuItems: { id: AdminTab; label: string; icon: typeof LayoutDashboard; badge?: string }[] = [
    { id: 'overview', label: 'Главный дашборд', icon: LayoutDashboard },
    {
      id: 'companies',
      label: 'Реестр компаний',
      icon: Building2,
      badge: companiesCount !== undefined ? `${companiesCount}` : undefined,
    },
    { id: 'leads', label: 'Живая лента заявок', icon: Users, badge: 'Live' },
    { id: 'broadcast', label: 'Рассылка Telegram', icon: Send },
    {
      id: 'monitoring',
      label: 'Мониторинг & Ошибки',
      icon: Activity,
      badge: pendingIssuesCount > 0 ? `${pendingIssuesCount}` : undefined,
    },
    { id: 'settings', label: 'Настройки и ГОСТ', icon: SlidersHorizontal },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden animate-in fade-in duration-150"
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 shrink-0 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col h-screen select-none transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header — Styled exactly like Mini App Header */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center font-extrabold text-sm shadow-xs">
              R
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-zinc-950 dark:text-white leading-tight">
                  RemontSaaS
                </span>
                <span className="text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700">
                  PRO
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium leading-tight">
                Панель управления
              </p>
            </div>
          </div>

          {/* Close button for mobile */}
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {/* Navigation */}
        <div className="p-3 space-y-1.5 flex-1 overflow-y-auto">
          <div className="px-2 py-1 text-[11px] font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
            Разделы платформы
          </div>

          <div className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectTab(item.id);
                    if (onCloseMobile) onCloseMobile();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 shadow-xs'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:text-zinc-950 dark:hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive
                          ? 'text-white dark:text-zinc-950'
                          : 'text-zinc-500 dark:text-zinc-400'
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded leading-none ${
                        isActive
                          ? 'bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-950'
                          : item.badge === 'Live'
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                          : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mini App Simulator Trigger & Master Bot Status */}
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2.5 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="bg-white dark:bg-zinc-800 rounded-xl p-3 border border-zinc-200 dark:border-zinc-700/80 shadow-xs space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-zinc-950 dark:text-white">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                Мастер-бот онлайн
              </span>
              <span className="text-[10px] text-zinc-500 font-medium">v2.4</span>
            </div>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
              @RemontMaster_bot связывает калькуляторы и прорабов.
            </p>
            {pendingIssuesCount > 0 && (
              <div className="mt-1 text-[10px] bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 rounded-md px-2 py-1 flex items-center gap-1 font-semibold">
                <Zap className="w-3 h-3 text-amber-600 shrink-0" />
                <span>{pendingIssuesCount} вебхука требуют внимания</span>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              onOpenMiniApp();
              if (onCloseMobile) onCloseMobile();
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-bold text-xs rounded-xl transition-all shadow-xs active:scale-[0.98]"
          >
            <span>Тест Mini App клиента</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>

          <div className="text-center pt-0.5">
            <span className="text-[10px] text-zinc-400 font-medium">RemontSaaS Platform © 2026</span>
          </div>
        </div>
      </aside>
    </>
  );
}
