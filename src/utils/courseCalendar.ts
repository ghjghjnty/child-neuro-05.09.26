import { CourseConfig, DayType } from '../types';

const COURSE_STORAGE_KEY = 'artemka_course_v1';

export const DEFAULT_COURSE: CourseConfig = {
  totalDays: 21,
  currentDay: 1,
  startDate: new Date().toISOString().split('T')[0],
};

export function loadCourseConfig(): CourseConfig {
  try {
    const raw = localStorage.getItem(COURSE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.totalDays && parsed.currentDay) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load course config', e);
  }
  return DEFAULT_COURSE;
}

export function saveCourseConfig(config: CourseConfig) {
  try {
    localStorage.setItem(COURSE_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save course config', e);
  }
}

export interface DayStatus {
  dayNumber: number;
  dayType: DayType;
  title: string;
  subtitle: string;
  isLocked: boolean;
  colorClass: string;
  badgeBg: string;
}

export function getDayStatus(currentDay: number, totalDays: 14 | 21): DayStatus {
  // 1. Проверяем, находится ли день внутри курса
  if (currentDay <= totalDays) {
    // Цикл 5/2 (5 дней терапии + 2 дня выходных)
    const cycleDay = ((currentDay - 1) % 7) + 1; // 1, 2, 3, 4, 5, 6, 7

    if (cycleDay <= 5) {
      // 5 дней терапии (числа горят белым цветом, светофор работает)
      return {
        dayNumber: currentDay,
        dayType: 'THERAPY',
        title: `ДЕНЬ ${currentDay}`,
        subtitle: `Терапия (${cycleDay} из 5 дней недели)`,
        isLocked: false,
        colorClass: 'text-white',
        badgeBg: 'bg-white/15 text-white border-white/40',
      };
    } else {
      // 2 дня отдыха (числа выходных дней горят оранжевым цветом, светофор заблокирован, значок сна 💤)
      const restDay = cycleDay - 5; // 1 или 2 день выходного
      return {
        dayNumber: currentDay,
        dayType: 'WEEKEND',
        title: `ДЕНЬ ${currentDay}`,
        subtitle: `💤 Выходной (${restDay}/2) — нейроотдых`,
        isLocked: true,
        colorClass: 'text-orange-400',
        badgeBg: 'bg-orange-950/60 text-orange-300 border-orange-500/50',
      };
    }
  }

  // 2. После окончания курса — 5 дней межкурсового отдыха (числа дней горят зеленым цветом)
  const postCourseDay = currentDay - totalDays;
  if (postCourseDay <= 5) {
    return {
      dayNumber: currentDay,
      dayType: 'POST_COURSE',
      title: `ДЕНЬ ${currentDay}`,
      subtitle: `🌱 Межкурсовой отдых (${postCourseDay} из 5)`,
      isLocked: true,
      colorClass: 'text-emerald-400',
      badgeBg: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50',
    };
  }

  // Курс полностью завершён
  return {
    dayNumber: currentDay,
    dayType: 'POST_COURSE',
    title: `КУРС ЗАВЕРШЁН`,
    subtitle: `Все ${totalDays} дней и 5 дней отдыха пройдены`,
    isLocked: true,
    colorClass: 'text-emerald-300',
    badgeBg: 'bg-emerald-950/70 text-emerald-300 border-emerald-400/60',
  };
}
