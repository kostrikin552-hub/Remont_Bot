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
 * Открывает нативный диалог выбора чата Telegram для отправки сообщения с ссылкой.
 * Использует openTelegramLink c tg:// или https://t.me/share/url
 */
export function openTelegramShare(url: string, text?: string): boolean {
  triggerHaptic('medium');
  const encodedUrl = encodeURIComponent(url);
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
