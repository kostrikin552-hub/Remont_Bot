import { useState, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Server,
  Zap,
  Terminal,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Cpu,
  Clock,
  Sparkles,
} from 'lucide-react';
import { SystemServiceNode, SystemErrorLog } from '../../types/admin';

interface SystemMonitoringProps {
  nodes: SystemServiceNode[];
  errorLogs: SystemErrorLog[];
  onResolveError: (errorId: string) => void;
  onRefreshChecks: () => void;
}

export function SystemMonitoring({
  nodes,
  errorLogs,
  onResolveError,
  onRefreshChecks,
}: SystemMonitoringProps) {
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const activeErrorsCount = useMemo(() => {
    return errorLogs.filter((e) => !e.resolved).length;
  }, [errorLogs]);

  const criticalErrorsCount = useMemo(() => {
    return errorLogs.filter((e) => !e.resolved && e.severity === 'critical').length;
  }, [errorLogs]);

  const filteredLogs = useMemo(() => {
    return errorLogs.filter((log) => {
      if (selectedSeverity === 'all') return true;
      if (selectedSeverity === 'unresolved') return !log.resolved;
      return log.severity === selectedSeverity;
    });
  }, [errorLogs, selectedSeverity]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    onRefreshChecks();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 800);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-zinc-950 dark:text-white uppercase tracking-wider">
              Мониторинг ошибок и состояния систем
            </h1>
            <span
              className={`px-2 py-0.5 rounded-sm text-[10px] font-extrabold uppercase ${
                criticalErrorsCount > 0
                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
              }`}
            >
              {criticalErrorsCount > 0 ? `${criticalErrorsCount} критических инцидента` : 'Все сервисы в норме'}
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Контроль работоспособности Telegram Webhook Gateway, бэкенда, базы данных и логов исключений.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 text-xs font-bold rounded-lg transition shadow-xs flex items-center gap-1.5 self-start md:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Проверить узлы</span>
        </button>
      </div>

      {/* Top Infrastructure Health Nodes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {nodes.map((node) => {
          const isHealthy = node.status === 'operational';
          const isDegraded = node.status === 'degraded';

          return (
            <div
              key={node.id}
              className={`bg-white dark:bg-zinc-900 rounded-xl p-3 border shadow-xs transition-colors ${
                isDegraded
                  ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/20 dark:bg-amber-950/10'
                  : 'border-zinc-200 dark:border-zinc-800'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-zinc-950 dark:text-white truncate max-w-[200px]">
                  {node.name}
                </span>
                <span
                  className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-sm uppercase ${
                    isHealthy
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
                  }`}
                >
                  {isHealthy ? 'Работает' : 'Деградация'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
                <span>Задержка ответа:</span>
                <span className="font-mono font-bold text-zinc-950 dark:text-white">
                  {node.latencyMs} мс
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
                <span>Uptime (24ч):</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {node.uptime24h}%
                </span>
              </div>

              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug pt-1 border-t border-zinc-100 dark:border-zinc-800">
                {node.details}
              </p>
            </div>
          );
        })}
      </div>

      {/* Error Logs Console */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-zinc-500" />
              <h2 className="text-xs font-bold text-zinc-950 dark:text-white uppercase tracking-wider">
                Журнал инцидентов и ошибок API ({activeErrorsCount} активных)
              </h2>
            </div>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Фиксация сбоев вебхуков Telegram, таймаутов и аномалий калькулятора.
            </p>
          </div>

          {/* Severity Filter */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSelectedSeverity('all')}
              className={`px-2 py-1 rounded-md text-[11px] font-bold transition ${
                selectedSeverity === 'all'
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 shadow-xs'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              Все ({errorLogs.length})
            </button>
            <button
              onClick={() => setSelectedSeverity('unresolved')}
              className={`px-2 py-1 rounded-md text-[11px] font-bold transition ${
                selectedSeverity === 'unresolved'
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 shadow-xs'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              Активные ({activeErrorsCount})
            </button>
            <button
              onClick={() => setSelectedSeverity('critical')}
              className={`px-2 py-1 rounded-md text-[11px] font-bold transition ${
                selectedSeverity === 'critical'
                  ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              Критические ({criticalErrorsCount})
            </button>
          </div>
        </div>

        {/* Logs List */}
        <div className="space-y-2">
          {filteredLogs.map((log) => {
            const isExpanded = expandedLogId === log.id;
            const isCrit = log.severity === 'critical';
            const isWarn = log.severity === 'warning';

            return (
              <div
                key={log.id}
                className={`rounded-lg border p-3 transition-colors ${
                  log.resolved
                    ? 'bg-zinc-50/60 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-800 opacity-60'
                    : isCrit
                    ? 'bg-red-50/30 dark:bg-red-950/20 border-red-200 dark:border-red-900/50'
                    : isWarn
                    ? 'bg-amber-50/30 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
                    : 'bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-sm uppercase ${
                          isCrit
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300'
                            : isWarn
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                            : 'bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200'
                        }`}
                      >
                        {log.severity}
                      </span>

                      {log.statusCode && (
                        <span className="font-mono text-[10px] font-bold text-zinc-700 dark:text-zinc-300 bg-zinc-200 dark:bg-zinc-700 px-1 rounded">
                          HTTP {log.statusCode}
                        </span>
                      )}

                      <span className="text-xs font-bold text-zinc-950 dark:text-white">
                        {log.service}
                      </span>

                      {log.companyName && (
                        <span className="text-[11px] text-zinc-500">
                          • {log.companyName}
                        </span>
                      )}

                      <span className="text-[11px] text-zinc-400">
                        ({log.timestamp})
                      </span>
                    </div>

                    <p className="text-xs text-zinc-800 dark:text-zinc-200 font-medium">
                      {log.message}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!log.resolved ? (
                      <button
                        onClick={() => onResolveError(log.id)}
                        className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/80 dark:hover:bg-emerald-900 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold rounded-md transition"
                      >
                        Решено
                      </button>
                    ) : (
                      <span className="text-[11px] text-zinc-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Исправлено</span>
                      </span>
                    )}

                    {log.stackTrace && (
                      <button
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="p-1 rounded bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300"
                        title="Показать stack trace"
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Stack Trace Preview */}
                {isExpanded && log.stackTrace && (
                  <div className="mt-2.5 p-2 rounded bg-zinc-950 text-zinc-300 font-mono text-[10px] leading-relaxed overflow-x-auto border border-zinc-800">
                    <pre>{log.stackTrace}</pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
