import React, { useState } from 'react';
import { ShieldAlert, Lock, ArrowLeft, KeyRound } from 'lucide-react';
import { verifySuperAdminId } from '../../utils/auth';
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
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);

  // Проверяем, запущен ли апп внутри Telegram
  const currentTgUser = typeof window !== 'undefined' ? window.Telegram?.WebApp?.initDataUnsafe?.user : null;
  const isInsideTelegram = Boolean(currentTgUser?.id);
  const isTgOwner = isInsideTelegram && String(currentTgUser?.id) === '5629144056';

  // Если открыто внутри Telegram НЕ владельцем — мгновенный возврат в калькулятор
  React.useEffect(() => {
    if (isInsideTelegram && !isTgOwner) {
      const timer = setTimeout(() => {
        onCancel();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isInsideTelegram, isTgOwner, onCancel]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    triggerHaptic('light');

    if (verifySuperAdminId(enteredKey)) {
      triggerHaptic('success');
      setErrorMsg(null);
      setAttempts(0);
      onAuthorized();
    } else {
      triggerHaptic('heavy');
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);

      if (nextAttempts >= 5) {
        setIsLocked(true);
        setErrorMsg('Слишком много неверных попыток. Доступ временно заблокирован на 60 секунд.');
        setTimeout(() => {
          setIsLocked(false);
          setAttempts(0);
          setErrorMsg(null);
        }, 60000);
      } else {
        setErrorMsg(`Неверный ключ доступа. Осталось попыток: ${5 - nextAttempts}`);
      }
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
            SSL 256-bit
          </span>
        </div>

        <div>
          <h2 className="text-xl font-extrabold text-white">
            {isInsideTelegram ? 'Доступ ограничен' : 'Авторизация владельца'}
          </h2>
          <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">
            {isInsideTelegram
              ? 'Этот раздел предназначен исключительно для владельца платформы. Настройки расценок и база данных защищены.'
              : 'Для управления расценками и базой данных подтвердите полномочия владельца.'}
          </p>
        </div>

        {/* Если запуск внутри Telegram не владельцем — формы ввода НЕТ вообще */}
        {isInsideTelegram && (
          <div className="p-3.5 rounded-xl bg-zinc-800/60 border border-zinc-700/60 text-zinc-300 text-xs leading-relaxed">
            Доступ предоставляется автоматически при входе с подтверждённого Telegram-аккаунта владельца.
          </div>
        )}

        {/* Если запуск в обычном браузере — закрытая форма с маскированным вводом без подсказок */}
        {!isInsideTelegram && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="adminKeyInput" className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                Секретный ключ / пароль владельца
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  id="adminKeyInput"
                  type="password"
                  value={enteredKey}
                  onChange={(e) => {
                    setEnteredKey(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="••••••••••"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-600 font-mono text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                  autoFocus
                  autoComplete="current-password"
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
              <span>Войти</span>
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
            <span>Вернуться в калькулятор</span>
          </button>
        </div>
      </div>
    </div>
  );
};
