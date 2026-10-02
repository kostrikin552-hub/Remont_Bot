// Telegram WebApp Helper & Haptics

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        close: () => void;
        isExpanded?: boolean;
        colorScheme?: 'light' | 'dark';
        themeParams?: {
          bg_color?: string;
          text_color?: string;
          hint_color?: string;
          link_color?: string;
          button_color?: string;
          button_text_color?: string;
          secondary_bg_color?: string;
        };
        initDataUnsafe?: {
          start_param?: string;
          user?: {
            id?: number;
            first_name?: string;
            last_name?: string;
            username?: string;
            language_code?: string;
          };
        };
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
        sendData?: (data: string) => void;
        openTelegramLink?: (url: string) => void;
        openLink?: (url: string) => void;
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
      };
    };
  }
}

export function initTelegramApp() {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
    try {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    } catch {
      // Ignore if not in iframe
    }
  }
}

export function triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'selection' | 'success') {
  try {
    const tg = window.Telegram?.WebApp?.HapticFeedback;
    if (tg) {
      if (type === 'selection') {
        tg.selectionChanged();
      } else if (type === 'success') {
        tg.notificationOccurred('success');
      } else {
        tg.impactOccurred(type);
      }
      return;
    }
    // Browser fallback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      if (type === 'selection') navigator.vibrate(5);
      else if (type === 'light') navigator.vibrate(10);
      else if (type === 'medium') navigator.vibrate(25);
      else if (type === 'heavy' || type === 'success') navigator.vibrate([20, 40, 20]);
    }
  } catch {
    // Graceful no-op
  }
}

export function getTelegramUser() {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initDataUnsafe?.user) {
    return window.Telegram.WebApp.initDataUnsafe.user;
  }
  return null;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'decimal',
    maximumFractionDigits: 0,
  }).format(Math.round(value)) + ' ₽';
}

/**
 * Очищает юзернейм бота Telegram от символов '@', протоколов и ссылок
 */
export function cleanTelegramBotUsername(raw?: string | null): string {
  if (!raw) return '';
  let cleaned = raw.trim();
  // Убираем https://t.me/, t.me/, tg://resolve?domain=
  cleaned = cleaned.replace(/^https?:\/\/t\.me\//i, '');
  cleaned = cleaned.replace(/^t\.me\//i, '');
  cleaned = cleaned.replace(/^tg:\/\/resolve\?domain=/i, '');
  cleaned = cleaned.replace(/^@/, '');
  // Убираем параметры запроса (?start=...) если попали в юзернейм
  cleaned = cleaned.split('?')[0].split('/')[0].trim();
  return cleaned;
}

/**
 * Определяет актуальный Telegram-бот компании, в котором производился расчёт.
 * Приоритет:
 * 1. URL search query (?bot=... или ?bot_username=...)
 * 2. Сохраненное значение в localStorage / sessionStorage
 * 3. Telegram WebApp start_param или receiver (если запущен из бота)
 * 4. Конфигурация компании company.botUsername
 * 5. company.id (если оканчивается на bot или содержит _bot)
 * 6. Фолбек-бот по умолчанию
 */
export function getDetectedBotUsername(companyBot?: string, companyId?: string): string {
  // 1. Проверяем URL параметры
  if (typeof window !== 'undefined') {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const fromUrl =
        urlParams.get('bot') ||
        urlParams.get('bot_username') ||
        urlParams.get('botName') ||
        urlParams.get('tg_bot');
      if (fromUrl && fromUrl.trim()) {
        const clean = cleanTelegramBotUsername(fromUrl);
        if (clean) {
          localStorage.setItem('remont_bot_username', clean);
          return clean;
        }
      }

      // Проверяем start_param из Telegram
      const tgStart =
        window.Telegram?.WebApp?.initDataUnsafe?.start_param ||
        urlParams.get('tgWebAppStartParam');
      if (tgStart && (tgStart.startsWith('bot_') || tgStart.startsWith('b_'))) {
        const clean = cleanTelegramBotUsername(tgStart.replace(/^(bot_|b_)/, ''));
        if (clean) {
          localStorage.setItem('remont_bot_username', clean);
          return clean;
        }
      }

      // Проверяем Telegram receiver (если доступен в WebApp)
      const receiver = (window.Telegram?.WebApp?.initDataUnsafe as { receiver?: { username?: string } })?.receiver;
      if (receiver?.username) {
        const clean = cleanTelegramBotUsername(receiver.username);
        if (clean) {
          localStorage.setItem('remont_bot_username', clean);
          return clean;
        }
      }

      // 2. Проверяем сохраненный в хранилище юзернейм бота
      const cached = localStorage.getItem('remont_bot_username');
      if (cached && cached.trim()) {
        return cleanTelegramBotUsername(cached);
      }
    } catch {
      // Игнорируем ошибки доступа к storage
    }
  }

  // 3. Конфигурация компании
  if (companyBot && companyBot.trim()) {
    const clean = cleanTelegramBotUsername(companyBot);
    if (clean) return clean;
  }

  // 4. Проверяем company.id если он выглядит как бот
  if (companyId) {
    const lower = companyId.toLowerCase().trim();
    if (lower.endsWith('bot') || lower.includes('_bot')) {
      return cleanTelegramBotUsername(lower);
    }
  }

  return 'remont_pro_bot';
}

/**
 * Формирует ссылку строго на Telegram-бота компании с параметрами расчета (для старта диалога с ботом),
 * а НЕ на веб-приложение / мини-апп.
 * При клике на ссылку в Telegram открывается чат с ботом компании с кнопкой «Старт»,
 * что позволяет боту зафиксировать пользователя в CRM как нового лида.
 */
export function buildCompanyBotUrl(
  botUsername: string,
  area: number,
  tariffId: string,
  companyId?: string
): string {
  const cleanBot = cleanTelegramBotUsername(botUsername) || 'remont_pro_bot';
  const compPart = companyId && companyId !== cleanBot && !companyId.toLowerCase().includes('bot') ? `_${companyId}` : '';
  return `https://t.me/${cleanBot}?start=calc_${area}_${tariffId}${compPart}`;
}

/**
 * Прямая ссылка на бота компании в Telegram (для перехода в диалог)
 */
export function buildDirectCompanyBotUrl(botUsername: string): string {
  const cleanBot = cleanTelegramBotUsername(botUsername) || 'remont_pro_bot';
  return `https://t.me/${cleanBot}`;
}

/**
 * Открывает нативный диалог выбора чата Telegram для отправки сообщения с ссылкой.
 * Ссылка ведет строго на Telegram-бота компании!
 */
export function openTelegramShare(botUrl: string, text?: string): boolean {
  triggerHaptic('medium');
  const encodedUrl = encodeURIComponent(botUrl);
  const encodedText = text ? encodeURIComponent(text) : '';
  const shareLink = `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`;

  try {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(shareLink);
      return true;
    }
  } catch (err) {
    console.warn('Failed to call WebApp.openTelegramLink:', err);
  }

  // Browser / WebView fallback
  if (typeof window !== 'undefined') {
    try {
      const win = window.open(shareLink, '_blank');
      if (win) return true;
    } catch {
      // ignore
    }
    window.location.href = shareLink;
    return true;
  }
  return false;
}

/**
 * Безопасное копирование текста в буфер обмена с fallback
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  triggerHaptic('light');
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback to textarea approach
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}

/**
 * Проверка прав владельца бота / администратора компании:
 * Режим калибровки цен доступен ИСКЛЮЧИТЕЛЬНО владельцу бота!
 * Обычные пользователи и клиенты НИКОГДА не получают права админа.
 */
export function isBotOwner(company?: {
  ownerId?: string | number;
  adminChatId?: string | number;
  id?: string;
}): boolean {
  if (typeof window === 'undefined') return false;

  const currentTgUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  const ownerId = company?.ownerId || company?.adminChatId;

  // 1. Если запуск внутри Telegram:
  // Строгая сверка Telegram ID текущего пользователя с ID владельца бота
  if (currentTgUserId && ownerId) {
    if (String(currentTgUserId) === String(ownerId)) {
      return true;
    }
    // Если текущий ID в Telegram не совпадает с владельцем — доступ КАТЕГОРИЧЕСКИ ЗАПРЕЩЁН
    return false;
  }

  // 2. Если запуск по защищенной ссылке владельца из Мастер-Бота (сверка ID владельца)
  const urlParams = new URLSearchParams(window.location.search);
  const passedOwnerId = urlParams.get('owner_id') || urlParams.get('admin_id');
  if (passedOwnerId && ownerId && String(passedOwnerId) === String(ownerId)) {
    if (currentTgUserId && String(currentTgUserId) !== String(ownerId)) {
      return false;
    }
    return true;
  }

  // 3. Защищенный токен владельца компании
  const ownerToken = urlParams.get('owner_token') || urlParams.get('token');
  if (ownerToken && company?.id && ownerToken === `owner_${company.id}`) {
    return true;
  }

  // По умолчанию для всех обычных пользователей: доступ закрыт
  return false;
}

