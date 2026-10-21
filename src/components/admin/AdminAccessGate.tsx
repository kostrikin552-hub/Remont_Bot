import React, { useState } from 'react';
import { Lock, ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';
import { verifySuperAdminId, SUPERADMIN_TELEGRAM_ID } from '../../utils/auth';
import { triggerHaptic } from '../../utils/telegram';

interface AdminAccessGateProps {
  onAuthorized: () => void;
  onCancel: () => void;
  isDark?: boolean;
}

export const AdminAccessGate: React.FC<AdminAccessGateProps> = ({
  onAuthorized,
  onCancel,
}) => {
  const [enteredKey, setEnteredKey] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    triggerHaptic('light');

    if (verifySuperAdminId(enteredKey)) {
      triggerHaptic('success');
      setErrorMsg(null);
      onAuthorized();
    } else {
      triggerHaptic('heavy');
      setErrorMsg(`Доступ запрещён. Требуется подтверждение Telegram ID владельца платформы (${SUPERADMIN_TELEGRAM_ID})`);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4 font-['Manrope',sans-serif]">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Lock className="w-6 h-6 text-emerald-500" />
          </div>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
            Строгий доступ (ID: {SUPERADMIN_TELEGRAM_ID})
          </span>
        </div>

        <div>
          <h2 className="text-xl font-extrabold text-white">
            Панель управления платформой
          </h2>
          <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">
            Доступ разрешён исключительно владельцу сервиса. Для входа подтвердите ваш Telegram ID.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="adminKeyInput" className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
              Telegram ID владельца
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                id="adminKeyInput"
                type="text"
                value={enteredKey}
                onChange={(e) => {
                  setEnteredKey(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder={`Введите ID (${SUPERADMIN_TELEGRAM_ID})`}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 font-mono text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                autoFocus
              />
            </div>
            {errorMsg && (
              <p className="text-xs text-amber-400 mt-2 font-medium flex items-center gap-1.5">
                <span>⚠️</span> {errorMsg}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Подтвердить доступ</span>
            </button>
          </div>
        </form>

        <div className="pt-2 border-t border-zinc-800/80">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onCancel();
            }}
            className="w-full py-2 px-4 rounded-xl bg-transparent hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 font-medium text-xs flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Вернуться в калькулятор</span>
          </button>
        </div>
      </div>
    </div>
  );
};
