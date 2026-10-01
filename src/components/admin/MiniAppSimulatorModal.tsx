import { useState } from 'react';
import {
  X,
  Smartphone,
  RotateCcw,
  ExternalLink,
} from 'lucide-react';
import { TenantCompany } from '../../types/admin';

interface MiniAppSimulatorModalProps {
  company: TenantCompany;
  onClose: () => void;
  allCompanies: TenantCompany[];
  onSelectCompany: (company: TenantCompany) => void;
}

export function MiniAppSimulatorModal({
  company,
  onClose,
  allCompanies,
  onSelectCompany,
}: MiniAppSimulatorModalProps) {
  const [iframeKey, setIframeKey] = useState(0);
  const [isProMode, setIsProMode] = useState(false);

  const simulatorUrl = `/?company_id=${company.id}&bot=${company.botUsername}${
    isProMode ? '&pro_mode=true' : ''
  }&t=${iframeKey}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-4xl h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Top Simulator Control Bar */}
        <div className="p-3 bg-zinc-50 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white text-xs font-bold">
              <Smartphone className="w-4 h-4 text-zinc-900 dark:text-white" />
              <span>Симулятор Telegram Mini App</span>
            </div>

            {/* Switch active company */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-zinc-500">Компания:</span>
              <select
                value={company.id}
                onChange={(e) => {
                  const target = allCompanies.find((c) => c.id === e.target.value);
                  if (target) onSelectCompany(target);
                }}
                className="px-2.5 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:outline-none"
              >
                {allCompanies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.city})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle Pro Mode */}
            <button
              onClick={() => setIsProMode(!isProMode)}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all border ${
                isProMode
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 border-zinc-900 dark:border-white shadow-xs'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
              }`}
            >
              Pro Mode (Цены): {isProMode ? 'ВКЛ' : 'ВЫКЛ'}
            </button>

            {/* Reload iframe */}
            <button
              onClick={() => setIframeKey((k) => k + 1)}
              title="Перезагрузить"
              className="p-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Open in new tab */}
            <a
              href={simulatorUrl}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md transition"
              title="Открыть в новой вкладке"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-md transition ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Simulator Device Viewport */}
        <div className="flex-1 bg-zinc-100 dark:bg-zinc-950 p-2 sm:p-4 flex items-center justify-center overflow-auto">
          {/* Smartphone Frame */}
          <div className="w-full max-w-[390px] h-full max-h-[780px] bg-white dark:bg-zinc-900 rounded-[28px] sm:rounded-[44px] border-[3px] sm:border-[6px] border-zinc-300 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col relative">
            {/* Dynamic Island Notch */}
            <div className="h-5 sm:h-6 bg-white dark:bg-zinc-900 flex items-center justify-center relative shrink-0 z-30">
              <div className="w-16 sm:w-20 h-3.5 sm:h-4 bg-zinc-900 dark:bg-zinc-800 rounded-full flex items-center justify-center">
                <div className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-zinc-800 dark:bg-zinc-950 mr-2" />
                <div className="w-1 sm:w-1.5 h-1 sm:h-1.5 rounded-full bg-blue-900/60" />
              </div>
            </div>

            {/* Simulated Telegram App Header */}
            <div className="px-4 py-2 bg-[#17212b] text-white flex items-center justify-between text-xs shrink-0 z-20 border-b border-[#242f3d]">
              <span className="text-[#6ab2f2] text-[11px] font-bold cursor-pointer">
                Закрыть
              </span>
              <div className="text-center font-bold text-xs truncate max-w-[180px]">
                {company.name}
              </div>
              <span className="text-[#6ab2f2] text-xs">•••</span>
            </div>

            {/* Live iframe loading the exact Mini App */}
            <iframe
              key={iframeKey}
              src={simulatorUrl}
              title="Mini App Simulator"
              className="w-full flex-1 border-none bg-[#f4f4f5] dark:bg-[#09090b]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
