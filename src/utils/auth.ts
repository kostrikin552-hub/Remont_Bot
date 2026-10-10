/**
 * Модуль строгой аутентификации администратора.
 * Панель управления доступна ИСКЛЮЧИТЕЛЬНО владельцу с Telegram ID: 5629144056.
 * Для всех остальных пользователей и клиентов панель полностью скрыта и недоступна.
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

  // 2. URL параметры при открытии прямой ссылки владельца
  try {
    const params = new URLSearchParams(window.location.search);
    const passedId = params.get('admin_id') || params.get('user_id');
    if (passedId && String(passedId).trim() === SUPERADMIN_TELEGRAM_ID) {
      return SUPERADMIN_TELEGRAM_ID;
    }
  } catch {
    // ignore
  }

  // 3. Активная сессия владельца
  try {
    const session = sessionStorage.getItem('remont_admin_verified_id');
    if (session && String(session).trim() === SUPERADMIN_TELEGRAM_ID) {
      return SUPERADMIN_TELEGRAM_ID;
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Строгая проверка: является ли текущий пользователь владельцем (ID 5629144056).
 * Проверяется при каждой отрисовке и любом переходе.
 */
export function isSuperAdminUser(): boolean {
  if (typeof window === 'undefined') return false;

  // Если запуск внутри Telegram:
  // Приоритетная непререкаемая проверка реального Telegram ID аккаунта
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (tgUser && typeof tgUser.id !== 'undefined') {
    // Если реальный ID пользователя Telegram не совпадает с 5629144056 — ДОСТУП КАТЕГОРИЧЕСКИ ЗАПРЕЩЁН!
    if (String(tgUser.id) !== SUPERADMIN_TELEGRAM_ID) {
      return false;
    }
    return true;
  }

  // Если запуск вне Telegram (в обычном браузере / на компьютере / в режиме превью):
  // Проверяем параметр admin_id в строке запроса
  try {
    const params = new URLSearchParams(window.location.search);
    const passedId = params.get('admin_id') || params.get('user_id');
    if (passedId && String(passedId).trim() === SUPERADMIN_TELEGRAM_ID) {
      try {
        sessionStorage.setItem('remont_admin_verified_id', SUPERADMIN_TELEGRAM_ID);
      } catch {
        // ignore
      }
      return true;
    }
  } catch {
    // ignore
  }

  // Проверяем ранее подтвержденную сессию в sessionStorage браузера
  try {
    const session = sessionStorage.getItem('remont_admin_verified_id');
    if (session && String(session).trim() === SUPERADMIN_TELEGRAM_ID) {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}

/**
 * Проверить и авторизовать сессию по введённому ID (только 5629144056)
 */
export function verifySuperAdminId(idInput: string): boolean {
  if (String(idInput).trim() === SUPERADMIN_TELEGRAM_ID) {
    try {
      sessionStorage.setItem('remont_admin_verified_id', SUPERADMIN_TELEGRAM_ID);
    } catch {
      // ignore
    }
    return true;
  }
  return false;
}

/**
 * Сбросить сессию супер-администратора
 */
export function logoutSuperAdmin(): void {
  try {
    sessionStorage.removeItem('remont_admin_verified_id');
  } catch {
    // ignore
  }
}
