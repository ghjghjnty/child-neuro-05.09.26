import { LocalNotifications } from '@capacitor/local-notifications';

const REST_NOTIFICATION_ID = 2001;
const REST_CHANNEL_ID = 'rest_timer_channel';

const STORAGE_END_TIME_KEY = 'neuroplayer_rest_target_end_time';
const STORAGE_LABEL_KEY = 'neuroplayer_rest_timer_label';
const STORAGE_PROTOCOL_STATE_KEY = 'neuroplayer_rest_protocol_state';
const STORAGE_QUEUE_KEY = 'neuroplayer_rest_queue';

let isChannelCreated = false;

/**
 * Инициализация канала уведомлений на Android (звук, максимальный приоритет, вибрация)
 */
export async function initNotificationChannel(): Promise<void> {
  if (isChannelCreated) return;
  try {
    // Проверяем / создаем канал для Android 8.0+
    await LocalNotifications.createChannel({
      id: REST_CHANNEL_ID,
      name: 'Таймер отдыха',
      description: 'Звуковые уведомления об окончании 2-часового отдыха нейросистемы',
      importance: 5, // MAX importance - всплывающее уведомление со звуком
      visibility: 1, // VISIBILITY_PUBLIC
      sound: undefined, // Системный звук уведомления по умолчанию
      vibration: true,
      lights: true,
      lightColor: '#00E676',
    });
    isChannelCreated = true;
  } catch (err) {
    // В обычной браузерной среде метод может отсутствовать, что допустимо
    console.debug('LocalNotifications.createChannel non-critical notice:', err);
  }
}

/**
 * Запрос разрешений на отправку уведомлений (Android 13+ и Web)
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display !== 'granted') {
      const requested = await LocalNotifications.requestPermissions();
      return requested.display === 'granted';
    }
    return true;
  } catch {
    // Fallback для веб-браузера
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'default') {
          const perm = await Notification.requestPermission();
          return perm === 'granted';
        }
        return Notification.permission === 'granted';
      }
    } catch {}
    return false;
  }
}

/**
 * Планирование локального уведомления на время окончания отдыха
 */
export async function scheduleRestNotification(
  targetEndTimeMs: number,
  label: string = 'Отдых'
): Promise<void> {
  try {
    await initNotificationChannel();
    await requestNotificationPermission();

    // Сначала отменяем предыдущее запланированное уведомление отдыха (если было)
    await cancelRestNotification();

    const scheduledDate = new Date(targetEndTimeMs);

    // Запланировать уведомление в Capacitor
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REST_NOTIFICATION_ID,
          title: 'Время отдыха завершено 🔔',
          body: `2-часовой ${label.toLowerCase()} окончен. Нейросистема готова к следующему этапу!`,
          schedule: {
            at: scheduledDate,
            allowWhileIdle: true, // Срабатывает даже в режиме энергосбережения Doze
          },
          sound: undefined, // Системный звук уведомления
          channelId: REST_CHANNEL_ID,
          smallIcon: 'ic_stat_icon_config_sample',
          actionTypeId: '',
          extra: {
            type: 'rest_timer_completed',
          },
        },
      ],
    });
  } catch (err) {
    console.debug('LocalNotifications schedule fallback (standard web behavior):', err);
  }
}

/**
 * Отмена запланированного уведомления (при сбросе таймера кнопкой ❌ или досрочном завершении)
 */
export async function cancelRestNotification(): Promise<void> {
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: REST_NOTIFICATION_ID }],
    });
  } catch {
    // Игнорируем в веб-режиме без плагина
  }
}

/**
 * Сохранение данных таймера в localStorage для поддержания фонового режима и блокировки экрана
 */
export function persistRestTimer(
  targetEndTimeMs: number,
  label: string,
  protocolState: string,
  queue: unknown[]
): void {
  try {
    localStorage.setItem(STORAGE_END_TIME_KEY, targetEndTimeMs.toString());
    localStorage.setItem(STORAGE_LABEL_KEY, label);
    localStorage.setItem(STORAGE_PROTOCOL_STATE_KEY, protocolState);
    localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('Failed to persist rest timer:', e);
  }
}

/**
 * Получение сохранённых данных активного таймера отдыха
 */
export function getPersistedRestTimer(): {
  targetEndTimeMs: number;
  label: string;
  protocolState: string | null;
  queue: unknown[];
} | null {
  try {
    const endTimeStr = localStorage.getItem(STORAGE_END_TIME_KEY);
    if (!endTimeStr) return null;
    const targetEndTimeMs = parseInt(endTimeStr, 10);
    if (isNaN(targetEndTimeMs)) return null;

    const label = localStorage.getItem(STORAGE_LABEL_KEY) || 'Отдых';
    const protocolState = localStorage.getItem(STORAGE_PROTOCOL_STATE_KEY);
    let queue: unknown[] = [];
    try {
      const qStr = localStorage.getItem(STORAGE_QUEUE_KEY);
      if (qStr) queue = JSON.parse(qStr);
    } catch {}

    return { targetEndTimeMs, label, protocolState, queue };
  } catch {
    return null;
  }
}

/**
 * Очистка сохранённых данных таймера
 */
export function clearPersistedRestTimer(): void {
  try {
    localStorage.removeItem(STORAGE_END_TIME_KEY);
    localStorage.removeItem(STORAGE_LABEL_KEY);
    localStorage.removeItem(STORAGE_PROTOCOL_STATE_KEY);
    localStorage.removeItem(STORAGE_QUEUE_KEY);
  } catch (e) {
    console.error('Failed to clear rest timer persistence:', e);
  }
}
