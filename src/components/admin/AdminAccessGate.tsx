import React, { useState } from 'react';
import { ShieldAlert, Lock, ArrowLeft, KeyRound, AlertTriangle } from 'lucide-react';
import { SUPERADMIN_TELEGRAM_ID, verifySuperAdminId } from '../../utils/auth';
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
  const [enteredId, setEnteredId] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Проверяем, есть ли пользователь в Telegram WebApp
  const currentTgUser = typeof window !== 'undefined' ? window.Telegram?.WebApp?.initDataUnsafe?.user : null;
  const isInsideTelegram = Boolean(currentTgUser?.id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    triggerHaptic('light');

    if (verifySuperAdminId(enteredId)) {
      triggerHaptic('success');
      setErrorMsg(null);
      onAuthorized();
    } else {
      triggerHaptic('heavy');
      setErrorMsg('Неверный ID владельца. Доступ строго заблокирован.');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4 font-['Manrope',sans-serif]">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
            {isInsideTelegram ? (
              <ShieldAlert className="w-6 h-6 text-red-500" />
            ) : (
              <Lock className="w-6 h-6 text-amber-500" />
            )}
          </div>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
            ID: {SUPERADMIN_TELEGRAM_ID}
          </span>
        </div>

        <div>
          <h2 className="text-xl font-extrabold text-white">
            {isInsideTelegram ? 'Доступ категорически запрещён' : 'Вход в панель управления'}
          </h2>
          <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">
            {isInsideTelegram
              ? `Панель управления ботом и базой данных заблокирована. Доступ разрешён исключительно владельцу бота.`
              : 'Управление ботом, расценками и базой заявок защищено. Подтвердите ваш Telegram ID владельца.'}
          </p>
        </div>

        {isInsideTelegram && currentTgUser && (
          <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 flex items-start gap-3 text-red-200 text-xs">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-300">Недостаточно прав доступа</p>
              <p className="mt-0.5 text-zinc-400">
                Ваш текущий Telegram ID:{' '}
                <span className="font-mono text-white font-bold">{currentTgUser.id}</span>.
                Панель управления доступна только для аккаунта с ID{' '}
                <span className="font-mono text-emerald-400 font-bold">{SUPERADMIN_TELEGRAM_ID}</span>.
              </p>
            </div>
          </div>
        )}

        {!isInsideTelegram && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="adminIdInput" className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                Telegram ID владельца
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  id="adminIdInput"
                  type="text"
                  value={enteredId}
                  onChange={(e) => {
                    setEnteredId(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="5629144056"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 font-mono text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                  autoFocus
                />
              </div>
              {errorMsg && (
                <p className="text-xs text-red-400 mt-2 font-medium flex items-center gap-1.5">
                  <span>⚠️</span> {errorMsg}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Подтвердить личность</span>
            </button>
          </form>
        )}

        <div className="pt-2 border-t border-zinc-800/80">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onCancel();
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 font-medium text-xs flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Вернуться в клиентский калькулятор</span>
          </button>
        </div>
      </div>
    </div>
  );
};
