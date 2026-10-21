/**
 * Модуль строгой аутентификации администратора SaaS платформы RemontPro.
 * Доступ открыт ИСКЛЮЧИТЕЛЬНО владельцу с Telegram ID: 5629144056.
 * Для всех остальных клиентов панель управления полностью скрыта и защищена.
 */

export const SUPERADMIN_TELEGRAM_ID = '5629144056';

/**
 * Получить Telegram ID текущего пользователя из WebApp или сессии
 */
export function getEffectiveTelegramUserId(): string | null {
  if (typeof window === 'undefined') return null;

  // 1. Нативный Telegram WebApp контекст
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (tgUser?.id) {
    return String(tgUser.id);
  }

  // 2. Активная сессия владельца
  try {
    const session = sessionStorage.getItem('remont_admin_verified_id') || localStorage.getItem('remont_admin_auth');
    if (session === SUPERADMIN_TELEGRAM_ID || session === 'true') {
      return SUPERADMIN_TELEGRAM_ID;
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Строгая проверка прав супер-администратора (только ID 5629144056)
 */
export function isSuperAdminUser(): boolean {
  if (typeof window === 'undefined') return false;

  // 1. Проверяем Telegram WebApp контекст (приоритетная проверка)
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (tgUser && typeof tgUser.id !== 'undefined') {
    // Внутри Telegram доступ разрешен ИСКЛЮЧИТЕЛЬНО владельцу с ID: 5629144056
    return String(tgUser.id) === SUPERADMIN_TELEGRAM_ID;
  }

  // 2. Проверяем сохраненную сессию после ввода пароля/ID
  try {
    const verified = sessionStorage.getItem('remont_admin_verified_id');
    if (verified === SUPERADMIN_TELEGRAM_ID) {
      return true;
    }
  } catch {
    // ignore
  }

  // Для всех остальных пользователей доступ строго закрыт
  return false;
}

/**
 * Проверить и авторизовать сессию по введённому ключу / ID (только 5629144056)
 */
export function verifySuperAdminId(idInput: string): boolean {
  const clean = String(idInput).trim();
  if (clean === SUPERADMIN_TELEGRAM_ID) {
    grantSuperAdminAccess();
    return true;
  }
  return false;
}

/**
 * Предоставить права супер-администратора текущей сессии
 */
export function grantSuperAdminAccess(): void {
  try {
    sessionStorage.setItem('remont_admin_verified_id', SUPERADMIN_TELEGRAM_ID);
    localStorage.setItem('remont_admin_auth', 'true');
    const currentTgUser = typeof window !== 'undefined' ? window.Telegram?.WebApp?.initDataUnsafe?.user : null;
    if (currentTgUser?.id) {
      localStorage.setItem(`tg_admin_auth_${currentTgUser.id}`, 'true');
    }
  } catch {
    // ignore
  }
}

/**
 * Сбросить сессию супер-администратора
 */
export function logoutSuperAdmin(): void {
  try {
    sessionStorage.removeItem('remont_admin_verified_id');
    localStorage.removeItem('remont_admin_auth');
    const currentTgUser = typeof window !== 'undefined' ? window.Telegram?.WebApp?.initDataUnsafe?.user : null;
    if (currentTgUser?.id) {
      localStorage.removeItem(`tg_admin_auth_${currentTgUser.id}`);
    }
  } catch {
    // ignore
  }
}
