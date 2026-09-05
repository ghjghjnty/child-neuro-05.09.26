import { LoopMode } from '../types';

export const LOOP_MODES: LoopMode[] = ['off', '1', '2', '3', '4'];

const STORAGE_KEY = 'artemka_loop_mode';

export function getSavedLoopMode(): LoopMode {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === '1' || val === '2' || val === '3' || val === '4' || val === 'off') {
      return val;
    }
  } catch {}
  return 'off';
}

export function saveLoopMode(mode: LoopMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {}
}

export function getNextLoopMode(current: LoopMode): LoopMode {
  const currentIndex = LOOP_MODES.indexOf(current);
  if (currentIndex === -1) return '1';
  return LOOP_MODES[(currentIndex + 1) % LOOP_MODES.length];
}

export interface NextTrackDecision {
  action: 'repeat_current' | 'play_next_index' | 'finish_session';
  nextIndex?: number;
}

/**
 * Изолированный мидлвар для определения следующего действия плеера
 * при завершении трека согласно выбранному режиму зацикливания:
 * - 'off': обычный режим (трек 1 -> трек 2 -> ... -> завершение сессии)
 * - '1': зацикливание только 1 текущего трека (Loop 1)
 * - '2': зацикливание 2 треков подряд (Loop 2: 1 -> 2 -> 1 -> 2)
 * - '3': зацикливание 3 треков подряд (Loop 3: 1 -> 2 -> 3 -> 1 -> 2 -> 3)
 * - '4': зацикливание 4 треков подряд (Loop 4: последовательность: 1 → 2 → 3 → 4)
 */
export function resolveNextTrackDecision(
  mode: LoopMode,
  currentIndex: number,
  queueLength: number
): NextTrackDecision {
  if (mode === 'off') {
    if (currentIndex + 1 < queueLength) {
      return { action: 'play_next_index', nextIndex: currentIndex + 1 };
    }
    return { action: 'finish_session' };
  }

  if (mode === '1') {
    // Зацикливание только 1 текущего трека (Loop 1)
    return { action: 'repeat_current', nextIndex: currentIndex };
  }

  // Зацикливание N треков подряд (Loop 2, 3, 4)
  const targetCount = parseInt(mode, 10) || 1;
  const effectiveLimit = Math.min(targetCount, Math.max(1, queueLength));

  if (effectiveLimit <= 1) {
    return { action: 'repeat_current', nextIndex: 0 };
  }

  // Если текущий трек находился за пределами выбранного диапазона (например, переключили режим на лету),
  // начинаем зацикливание с первого трека (индекс 0)
  if (currentIndex >= effectiveLimit) {
    return { action: 'play_next_index', nextIndex: 0 };
  }

  const nextIdx = (currentIndex + 1) % effectiveLimit;
  return { action: 'play_next_index', nextIndex: nextIdx };
}
