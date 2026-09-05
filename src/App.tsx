import React, { useState, useEffect, useRef } from 'react';
import { soundEngine } from './utils/audioSynthesizer';
import { FabulaColor, ProtocolState, AudioItem, CourseConfig, LoopMode, ThemeMode } from './types';
import {
  getStoredFiles,
  saveStoredFiles,
  scanFolderForFabula,
  scanFolderForBrt,
} from './utils/neuroPlayerStorage';
import { loadCourseConfig, saveCourseConfig, getDayStatus } from './utils/courseCalendar';
import { DoctorSettingsModal } from './components/DoctorSettingsModal';
import { LoopButton } from './components/LoopButton';
import {
  getSavedLoopMode,
  saveLoopMode,
  getNextLoopMode,
  resolveNextTrackDecision,
} from './utils/playerLoopMiddleware';
import {
  initNotificationChannel,
  scheduleRestNotification,
  cancelRestNotification,
  persistRestTimer,
  getPersistedRestTimer,
  clearPersistedRestTimer,
} from './services/restTimerService';
import {
  restoreAudioBlobUrls,
  saveTrackBlob,
  saveTrackProgress,
  getTrackProgress,
  clearTrackProgress,
} from './utils/trackStorage';
import {
  Footprints,
  ShieldAlert,
  Settings,
  Moon,
  Sparkles,
  Square,
  Play,
} from 'lucide-react';

const TWO_HOURS_MS = 7200000; // 120 минут (2 часа)

export default function App() {
  // Файлы и настройки курса
  const [files, setFiles] = useState<AudioItem[]>(getStoredFiles);
  const [courseConfig, setCourseConfig] = useState<CourseConfig>(loadCourseConfig);
  const [isDoctorModalOpen, setIsDoctorModalOpen] = useState(false);

  // Состояние медицинского протокола
  const [protocolState, setProtocolState] = useState<ProtocolState>('IDLE');
  const [activeColor, setActiveColor] = useState<FabulaColor | null>(null);
  const [currentPlayingTrack, setCurrentPlayingTrack] = useState<AudioItem | null>(null);
  const [currentBrtIndex, setCurrentBrtIndex] = useState<number>(0);
  const [brtQueue, setBrtQueue] = useState<AudioItem[]>([]);

  // Режим зацикливания треков: 'off' | '1' | '2' | '3' | '4'
  const [loopMode, setLoopMode] = useState<LoopMode>(getSavedLoopMode);
  const loopModeRef = useRef<LoopMode>(loopMode);

  useEffect(() => {
    loopModeRef.current = loopMode;
    saveLoopMode(loopMode);
  }, [loopMode]);

  const handleCycleLoopMode = () => {
    soundEngine.playClickSound();
    setLoopMode((prev) => getNextLoopMode(prev));
  };

  // Режим темы интерфейса (тёмный / светлый или ночь / день)
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('artemka_theme_mode');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {}
    return 'dark';
  });

  const handleToggleTheme = () => {
    soundEngine.playClickSound();
    setThemeMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('artemka_theme_mode', next);
      } catch {}
      return next;
    });
  };

  // Текущая разрешённая кнопка светофора по порядку (Красный -> Жёлтый -> Зелёный -> Красный)
  const [allowedTrafficColor, setAllowedTrafficColor] = useState<FabulaColor>(() => {
    try {
      const saved = localStorage.getItem('artemka_allowed_traffic_color');
      if (saved === 'red' || saved === 'yellow' || saved === 'green') {
        return saved as FabulaColor;
      }
    } catch {}
    return 'red';
  });

  // Запоминаем цвет последней запущенной фабулы для вычисления следующей кнопки после 2-часового отдыха
  const lastPlayedColorRef = useRef<FabulaColor>(
    (() => {
      try {
        const saved = localStorage.getItem('artemka_last_played_color');
        if (saved === 'red' || saved === 'yellow' || saved === 'green') {
          return saved as FabulaColor;
        }
      } catch {}
      return 'red';
    })()
  );

  // Переключение на СЛЕДУЮЩУЮ по порядку кнопку после 2-часового отдыха:
  // Красный -> Жёлтый -> Зелёный -> Красный
  // И разветвление логики:
  // 1. Проверяем наличие файла/компонента "БРТ" в папке следующего трека
  // 2. Если БРТ есть: вместе со следующей кнопкой активируется зелёная кнопка "БРТ" (правый светофор)
  // 3. У клиента появляется выбор: запустить следующий стандартный протокол либо прослушать БРТ
  // 4. Если БРТ нет: активируется только кнопка следующего трека
  const advanceToNextTrafficColorAndCheckBrt = (currentFiles: AudioItem[] = files) => {
    const lastColor = lastPlayedColorRef.current;
    let nextColor: FabulaColor = 'red';
    if (lastColor === 'red') {
      nextColor = 'yellow';
    } else if (lastColor === 'yellow') {
      nextColor = 'green';
    } else if (lastColor === 'green') {
      nextColor = 'red';
    }
    setAllowedTrafficColor(nextColor);
    lastPlayedColorRef.current = nextColor;
    try {
      localStorage.setItem('artemka_allowed_traffic_color', nextColor);
      localStorage.setItem('artemka_last_played_color', nextColor);
    } catch {}

    const folderMap: Record<FabulaColor, '1_Red' | '2_Yellow' | '3_Green'> = {
      red: '1_Red',
      yellow: '2_Yellow',
      green: '3_Green',
    };
    const nextFolder = folderMap[nextColor];
    const nextBrtFiles = scanFolderForBrt(nextFolder, currentFiles);

    if (nextBrtFiles.length > 0) {
      setBrtQueue(nextBrtFiles);
      setProtocolState('BRT_READY');
    } else {
      setBrtQueue([]);
      setProtocolState('IDLE');
    }
  };

  const advanceToNextTrafficColor = () => {
    advanceToNextTrafficColorAndCheckBrt();
  };

  // Состояние нижней панели
  const [isBrtToggleActive, setIsBrtToggleActive] = useState<boolean>(false);
  const [isTestingSignals, setIsTestingSignals] = useState<boolean>(false);
  const [testSignalIndex, setTestSignalIndex] = useState<number>(-1);

  // Таймер 120 минут
  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState<number>(0);
  const [timerLabel, setTimerLabel] = useState<string>('');

  // Звук и UI
  const [playbackSeconds, setPlaybackSeconds] = useState<number>(0);
  const [isPlaybackPaused, setIsPlaybackPaused] = useState<boolean>(false);
  const [emptyAlertVisible, setEmptyAlertVisible] = useState<boolean>(false);
  const quickFilePickerRef = useRef<HTMLInputElement>(null);
  const pendingFolderRef = useRef<'1_Red' | '2_Yellow' | '3_Green'>('1_Red');
  const emptyAlertTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const restEndTimeRef = useRef<number | null>(null);
  const restOnCompleteRef = useRef<(() => void) | null>(null);
  const audioElemRef = useRef<HTMLAudioElement | null>(null);
  const currentOnEndedRef = useRef<(() => void) | null>(null);

  const showEmptyAndOpenFilePicker = (folder: '1_Red' | '2_Yellow' | '3_Green') => {
    pendingFolderRef.current = folder;
    setEmptyAlertVisible(true);
    if (emptyAlertTimerRef.current) clearTimeout(emptyAlertTimerRef.current);
    emptyAlertTimerRef.current = window.setTimeout(() => {
      setEmptyAlertVisible(false);
    }, 2500);

    // Автоматически открываем проводник памяти
    quickFilePickerRef.current?.click();
  };

  const handleQuickFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const isFlac = selected.name.toLowerCase().endsWith('.flac');
    const isMp3 = selected.name.toLowerCase().endsWith('.mp3');
    const cleanName = selected.name.replace(/\.[^/.]+$/, '');
    const blobUrl = URL.createObjectURL(selected);
    const targetFolder = pendingFolderRef.current;
    const itemId = `quick_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Сохраняем бинарный файл в IndexedDB для постоянного доступа после перезапуска
    await saveTrackBlob(itemId, selected);

    const newItem: AudioItem = {
      id: itemId,
      fileName: selected.name,
      displayName: cleanName,
      format: isFlac ? 'flac' : 'mp3',
      folder: targetFolder,
      durationSeconds: 120,
      customBlobUrl: blobUrl,
    };

    const updated = [...files, newItem];
    setFiles(updated);
    saveStoredFiles(updated);
    setEmptyAlertVisible(false);

    if (isFlac) {
      const colorMap: Record<'1_Red' | '2_Yellow' | '3_Green', FabulaColor> = {
        '1_Red': 'red',
        '2_Yellow': 'yellow',
        '3_Green': 'green',
      };
      const color = colorMap[targetFolder];
      setActiveColor(color);
      lastPlayedColorRef.current = color;
      try {
        localStorage.setItem('artemka_last_played_color', color);
      } catch {}
      setCurrentPlayingTrack(newItem);
      setProtocolState('PLAYING_FABULA');
      playFabulaTrack(newItem, targetFolder);
    } else {
      setBrtQueue([newItem]);
      setCurrentBrtIndex(0);
      setProtocolState('PLAYING_BRT');
      playNextBrtTrack(0, [newItem]);
    }

    e.target.value = '';
  };

  // Счётчик времени прослушивания в нижней строке:
  // 1. Запускается при начале прослушивания трека (с 00:00)
  // 2. При кратковременной остановке прослушивания (пауза/стоп) счётчик замирает на текущей секунде
  // 3. При продолжении прослушивания счётчик стартует с той же позиции
  useEffect(() => {
    const isPlaying = (protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') && !!currentPlayingTrack;
    if (!isPlaying) {
      return;
    }

    if (isPlaybackPaused) {
      // При кратковременной остановке счётчик замирает на текущей позиции
      return;
    }

    // При начале или продолжении прослушивания счётчик идёт каждую секунду дальше
    const timer = window.setInterval(() => {
      setPlaybackSeconds((prev) => {
        const next = prev + 1;
        const totalDuration = currentPlayingTrack?.durationSeconds || 0;
        // Если играет синтезатор без аудиофайла и достигнут конец трека по длительности
        if (!audioElemRef.current && totalDuration > 0 && next >= totalDuration) {
          stopAudioStreamOnly();
          if (currentOnEndedRef.current) {
            currentOnEndedRef.current();
          }
        }
        return next;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [protocolState, currentPlayingTrack?.id, isPlaybackPaused]);

  // Статус текущего дня по календарю 5/2
  const dayStatus = getDayStatus(courseConfig.currentDay, courseConfig.totalDays);

  // Остановка и сброс таймера отдыха
  const stopRestCountdown = (keepRemainingTime = false) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    restEndTimeRef.current = null;
    restOnCompleteRef.current = null;
    clearPersistedRestTimer();
    cancelRestNotification();
    if (!keepRemainingTime) {
      setTimerRemainingSeconds(0);
    }
  };

  // Срабатывание завершения отдыха со звуковым сигналом
  const triggerRestCompletion = (onComplete?: (() => void) | null) => {
    stopRestCountdown(false);

    // Звуковое оповещение об окончании отдыха
    soundEngine.playNotificationAlert();
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([300, 200, 300, 200, 500]);
      }
    } catch {}

    if (onComplete) {
      onComplete();
    }
  };

  // Проверка и тик таймера на основе абсолютного системного времени Date.now()
  // Не прерывается при блокировке телефона, сворачивании приложения и засыпании экрана
  const tickRestCountdown = () => {
    if (!restEndTimeRef.current) return;
    const now = Date.now();
    const remaining = Math.max(0, Math.ceil((restEndTimeRef.current - now) / 1000));
    setTimerRemainingSeconds(remaining);

    if (remaining <= 0) {
      const cb = restOnCompleteRef.current;
      triggerRestCompletion(cb);
    }
  };

  // Инициализация канала уведомлений и восстановление активного таймера отдыха при запуске
  useEffect(() => {
    initNotificationChannel();

    const saved = getPersistedRestTimer();
    if (saved && saved.targetEndTimeMs) {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((saved.targetEndTimeMs - now) / 1000));

      if (remaining > 0) {
        restEndTimeRef.current = saved.targetEndTimeMs;
        setTimerLabel(saved.label || 'Отдых');
        setTimerRemainingSeconds(remaining);

        if (saved.protocolState === 'REST_1_WAIT_BRT' || saved.protocolState === 'REST_2_FINAL') {
          setProtocolState(saved.protocolState as ProtocolState);
        }

        const queue = (saved.queue as AudioItem[]) || [];
        setBrtQueue(queue);

        restOnCompleteRef.current = () => {
          advanceToNextTrafficColorAndCheckBrt();
          setTimerRemainingSeconds(0);
        };

        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = window.setInterval(tickRestCountdown, 1000);
      } else {
        // Таймер завершился пока экран был выключен или приложение было свернуто
        clearPersistedRestTimer();
        cancelRestNotification();
        soundEngine.playNotificationAlert();

        advanceToNextTrafficColorAndCheckBrt(getStoredFiles());
        setTimerRemainingSeconds(0);
      }
    }

    // Восстанавливаем постоянные Blob URL для треков из IndexedDB
    restoreAudioBlobUrls(getStoredFiles()).then((restored) => {
      setFiles(restored);
    });
  }, []);

  // Синхронизация при пробуждении (разблокировка экрана, возвращение из фона, активация вкладки)
  useEffect(() => {
    const handleWakeSync = () => {
      if (restEndTimeRef.current) {
        tickRestCountdown();
      }
    };

    document.addEventListener('visibilitychange', handleWakeSync);
    window.addEventListener('focus', handleWakeSync);
    window.addEventListener('pageshow', handleWakeSync);

    return () => {
      document.removeEventListener('visibilitychange', handleWakeSync);
      window.removeEventListener('focus', handleWakeSync);
      window.removeEventListener('pageshow', handleWakeSync);
    };
  }, []);

  useEffect(() => {
    return () => {
      soundEngine.stop();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (audioElemRef.current) {
        audioElemRef.current.pause();
      }
    };
  }, []);

  // Синхронизация дня с состоянием протокола
  useEffect(() => {
    if (dayStatus.dayType === 'WEEKEND') {
      setProtocolState('COURSE_WEEKEND_REST');
      stopAllPlayback();
      stopRestCountdown();
    } else if (dayStatus.dayType === 'POST_COURSE') {
      setProtocolState('COURSE_COMPLETED_REST');
      stopAllPlayback();
      stopRestCountdown();
    } else if (protocolState === 'COURSE_WEEKEND_REST' || protocolState === 'COURSE_COMPLETED_REST') {
      setProtocolState('IDLE');
    }
  }, [courseConfig.currentDay, courseConfig.totalDays]);

  // Остановка только звукового потока (без сброса текущего трека метаданных)
  const stopAudioStreamOnly = () => {
    soundEngine.stop();
    if (audioElemRef.current) {
      audioElemRef.current.pause();
      audioElemRef.current = null;
    }
  };

  // Полная остановка воспроизведения со сбросом счётчика и состояния
  const stopAllPlayback = () => {
    stopAudioStreamOnly();
    currentOnEndedRef.current = null;
    setCurrentPlayingTrack(null);
    setIsPlaybackPaused(false);
    setPlaybackSeconds(0);
  };

  // Кнопка СТОП внизу экрана:
  // - Одно нажатие останавливает трек и счётчик прослушивания
  // - Повторное нажатие запускает трек и счётчик прослушивания
  const handleTogglePausePlayback = () => {
    soundEngine.playClickSound();

    const isPlaying = (protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') && !!currentPlayingTrack;
    if (!isPlaying) {
      // Если воспроизведение ещё не запущено — запускаем фабулу
      if (dayStatus.isLocked || isResting) return;
      handleFabulaClick(activeColor || 'red');
      return;
    }

    if (!isPlaybackPaused) {
      // ОДНО НАЖАТИЕ: останавливает трек и счётчик прослушивания
      setIsPlaybackPaused(true);
      if (audioElemRef.current) {
        audioElemRef.current.pause();
      }
      soundEngine.pause();
    } else {
      // ПОВТОРНОЕ НАЖАТИЕ: запускает трек и счётчик прослушивания
      setIsPlaybackPaused(false);
      if (audioElemRef.current) {
        audioElemRef.current.play().catch(() => {});
      }
      soundEngine.resume();
    }
  };

  // =========================================================================
  // 1. ЗАПУСК И "СТОП" ФАБУЛЫ .FLAC (Основной светофор)
  // =========================================================================
  const handleFabulaClick = (color: FabulaColor) => {
    if (dayStatus.isLocked) return;

    // ПОВТОРНОЕ НАЖАТИЕ НА ТУ ЖЕ САМУЮ АКТИВНУЮ КНОПКУ -> ПРИНУДИТЕЛЬНЫЙ "СТОП"
    if (protocolState === 'PLAYING_FABULA' && activeColor === color) {
      stopAllPlayback();
      stopRestCountdown();
      setProtocolState('IDLE');
      setActiveColor(null);
      return;
    }

    // Если сейчас играет БРТ или другая фабула — останавливаем
    if (protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') {
      stopAllPlayback();
    }

    if (protocolState !== 'IDLE' && protocolState !== 'PLAYING_FABULA' && protocolState !== 'BRT_READY') {
      return; // Во время периода покоя светофор отдыхает
    }

    // Разрешена только следующая по порядку кнопка светофора
    if (protocolState !== 'PLAYING_FABULA' && color !== allowedTrafficColor) {
      return;
    }

    soundEngine.playClickSound();

    const folderMap: Record<FabulaColor, '1_Red' | '2_Yellow' | '3_Green'> = {
      red: '1_Red',
      yellow: '2_Yellow',
      green: '3_Green',
    };

    const targetFolder = folderMap[color];
    const fabula = scanFolderForFabula(targetFolder, files);

    if (!fabula) {
      showEmptyAndOpenFilePicker(targetFolder);
      return;
    }

    // Запуск воспроизведения
    setActiveColor(color);
    lastPlayedColorRef.current = color;
    try {
      localStorage.setItem('artemka_last_played_color', color);
    } catch {}
    setCurrentPlayingTrack(fabula);
    setProtocolState('PLAYING_FABULA');

    playFabulaTrack(fabula, targetFolder);
  };

  const playFabulaTrack = (track: AudioItem, folder: '1_Red' | '2_Yellow' | '3_Green') => {
    playTrackAudio(track, () => {
      if (loopModeRef.current !== 'off') {
        // Зацикливание текущей фабулы при активном режиме зацикливания
        playFabulaTrack(track, folder);
      } else {
        onFabulaCompleted(folder);
      }
    });
  };

  const playTrackAudio = (track: AudioItem, onEnded: () => void) => {
    // Останавливаем предыдущий звук, не сбрасывая при этом текущий трек
    stopAudioStreamOnly();
    currentOnEndedRef.current = onEnded;
    setCurrentPlayingTrack(track);
    // При начале прослушивания трека счётчик стартует с нуля
    setPlaybackSeconds(0);
    setIsPlaybackPaused(false);

    if (track.customBlobUrl) {
      const audio = new Audio(track.customBlobUrl);
      audio.volume = 0.8;

      // Восстанавливаем сохраненный прогресс воспроизведения после перезапуска
      const savedPos = getTrackProgress(track.id);
      if (savedPos > 0 && isFinite(savedPos)) {
        audio.currentTime = savedPos;
        setPlaybackSeconds(Math.round(savedPos));
      }

      audio.onloadedmetadata = () => {
        if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
          const realDuration = Math.round(audio.duration);
          setCurrentPlayingTrack((prev) => (prev ? { ...prev, durationSeconds: realDuration } : prev));
          if (savedPos > 0 && savedPos < audio.duration) {
            audio.currentTime = savedPos;
            setPlaybackSeconds(Math.round(savedPos));
          }
        }
      };

      audio.ontimeupdate = () => {
        if (audio.currentTime > 0) {
          saveTrackProgress(track.id, audio.currentTime);
        }
      };

      audio.onended = () => {
        clearTrackProgress(track.id);
        onEnded();
      };
      audio.onerror = () => {
        playFallbackSynth(track, onEnded);
      };
      audioElemRef.current = audio;
      audio.play().catch(() => {
        playFallbackSynth(track, onEnded);
      });
    } else {
      playFallbackSynth(track, onEnded);
    }
  };

  const playFallbackSynth = (track: AudioItem, onEnded: () => void) => {
    const color = track.folder === '1_Red' ? 'red' : track.folder === '2_Yellow' ? 'yellow' : 'green';
    soundEngine.playColorSynth(color, () => {
      onEnded();
    });
  };

  // =========================================================================
  // 2. МЕДИЦИНСКИЙ ПРОТОКОЛ: ТАЙМЕРЫ НА 120 МИНУТ
  // =========================================================================

  const onFabulaCompleted = (_folder: '1_Red' | '2_Yellow' | '3_Green') => {
    stopAllPlayback();
    setActiveColor(null);

    // Пешеходный светофор загорается Красным (БРТ заблокировано на период отдыха)
    setProtocolState('REST_1_WAIT_BRT');
    setTimerLabel('Отдых');

    startCountdown(
      TWO_HOURS_MS,
      () => {
        advanceToNextTrafficColorAndCheckBrt();
        setTimerRemainingSeconds(0);
      },
      'REST_1_WAIT_BRT',
      []
    );
  };

  const startCountdown = (
    durationMs: number,
    onComplete: () => void,
    stateForRestore: ProtocolState,
    queueForRestore: AudioItem[] = []
  ) => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    const targetEndTime = Date.now() + durationMs;
    restEndTimeRef.current = targetEndTime;
    restOnCompleteRef.current = onComplete;

    const remaining = Math.max(0, Math.ceil(durationMs / 1000));
    setTimerRemainingSeconds(remaining);
    setTimerLabel('Отдых');

    // Сохраняем в localStorage для выживания при блокировке экрана / сворачивании
    persistRestTimer(targetEndTime, 'Отдых', stateForRestore, queueForRestore);

    // Планируем звуковое уведомление через @capacitor/local-notifications
    scheduleRestNotification(targetEndTime, 'Отдых');

    intervalRef.current = window.setInterval(tickRestCountdown, 1000);
  };

  // Зеленый пешеход: СТАРТ / СТОП БРТ
  const handleBrtGreenClick = () => {
    // Повторное нажатие при проигрывании БРТ -> СТОП
    if (protocolState === 'PLAYING_BRT') {
      stopAllPlayback();
      stopRestCountdown();
      setProtocolState('IDLE');
      setBrtQueue([]);
      setCurrentBrtIndex(0);
      return;
    }

    const folderMap: Record<FabulaColor, '1_Red' | '2_Yellow' | '3_Green'> = {
      red: '1_Red',
      yellow: '2_Yellow',
      green: '3_Green',
    };
    const targetFolder = folderMap[allowedTrafficColor];
    let queue = brtQueue;
    if (queue.length === 0) {
      queue = scanFolderForBrt(targetFolder, files);
      setBrtQueue(queue);
    }

    if (queue.length === 0) {
      showEmptyAndOpenFilePicker(targetFolder);
      return;
    }

    soundEngine.playClickSound();
    setProtocolState('PLAYING_BRT');
    setCurrentBrtIndex(0);
    playNextBrtTrack(0, queue);
  };

  const playNextBrtTrack = (index: number, queue: AudioItem[]) => {
    if (index >= queue.length) {
      onBrtSessionCompleted();
      return;
    }

    const currentTrack = queue[index];
    setCurrentBrtIndex(index);
    setCurrentPlayingTrack(currentTrack);

    playTrackAudio(currentTrack, () => {
      const decision = resolveNextTrackDecision(loopModeRef.current, index, queue.length);
      if (decision.action === 'repeat_current') {
        playNextBrtTrack(index, queue);
      } else if (decision.action === 'play_next_index' && typeof decision.nextIndex === 'number') {
        playNextBrtTrack(decision.nextIndex, queue);
      } else {
        onBrtSessionCompleted();
      }
    });
  };

  const onBrtSessionCompleted = () => {
    stopAllPlayback();
    setProtocolState('REST_2_FINAL');
    setTimerLabel('Отдых');

    startCountdown(
      TWO_HOURS_MS,
      () => {
        advanceToNextTrafficColorAndCheckBrt();
        setTimerRemainingSeconds(0);
      },
      'REST_2_FINAL',
      []
    );
  };

  // =========================================================================
  // 3. НИЖНЯЯ ТЕХНИЧЕСКАЯ ПОЛОСА УПРАВЛЕНИЯ
  // =========================================================================

  // 1) БРТ Вкл/Выкл
  const handleBrtToggle = () => {
    soundEngine.playClickSound();
    if (!isBrtToggleActive) {
      // Активируем БРТ: кнопка становится серой "БРТ Выкл", правый светофор включается
      setIsBrtToggleActive(true);
      const folderMap: Record<FabulaColor, '1_Red' | '2_Yellow' | '3_Green'> = {
        red: '1_Red',
        yellow: '2_Yellow',
        green: '3_Green',
      };
      const currentFolder = folderMap[allowedTrafficColor] || '1_Red';
      const queue = scanFolderForBrt(currentFolder, files);
      setBrtQueue(queue);
      // Во время отдыха левый светофор фабул должен оставаться заблокированным намертво (alpha = 0.2)
      if (protocolState !== 'REST_1_WAIT_BRT' && protocolState !== 'REST_2_FINAL') {
        setProtocolState('BRT_READY');
      }
    } else {
      // Деактивируем БРТ: возвращается в яркую зеленую "БРТ Вкл"
      setIsBrtToggleActive(false);
      if (protocolState === 'PLAYING_BRT' || protocolState === 'BRT_READY') {
        stopAllPlayback();
        setProtocolState('IDLE');
      }
    }
  };

  // 2) Тест ("🔄")
  const handleTestSignals = () => {
    if (isTestingSignals) return;
    setIsTestingSignals(true);
    soundEngine.playClickSound();

    let step = 0;
    const testInterval = window.setInterval(() => {
      setTestSignalIndex(step);
      soundEngine.playClickSound();
      step++;
      if (step > 4) {
        clearInterval(testInterval);
        setTimeout(() => {
          setIsTestingSignals(false);
          setTestSignalIndex(-1);
        }, 500);
      }
    }, 550);
  };

  // 3) Отмена ("❌")
  const handleCancelTimer = () => {
    soundEngine.playClickSound();
    stopRestCountdown();
    stopAllPlayback();
    setProtocolState('IDLE');
    setActiveColor(null);
    setIsBrtToggleActive(false);
    setIsTestingSignals(false);
    setTestSignalIndex(-1);
  };

  const handleLongPressStart = () => {
    longPressTimerRef.current = window.setTimeout(() => {
      setIsDoctorModalOpen(true);
    }, 1500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const formatTime = (totalSec: number) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatPlaybackTime = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isWeekendLocked = dayStatus.isLocked;
  const isResting = protocolState === 'REST_1_WAIT_BRT' || protocolState === 'REST_2_FINAL';
  const isBrtPedeGreenActive = protocolState === 'BRT_READY' || protocolState === 'PLAYING_BRT' || isBrtToggleActive || testSignalIndex === 4;
  const isBrtPedeRedActive = (protocolState === 'REST_1_WAIT_BRT' && !isBrtToggleActive) || testSignalIndex === 3;

  // После остановки 2-часового отдыха включается ТОЛЬКО СЛЕДУЮЩАЯ по порядку кнопка светофора:
  // Красный -> Жёлтый -> Зелёный -> Красный
  const isRedEnabled =
    !isWeekendLocked &&
    !isResting &&
    (protocolState === 'PLAYING_FABULA' ? activeColor === 'red' : allowedTrafficColor === 'red');
  const isYellowEnabled =
    !isWeekendLocked &&
    !isResting &&
    (protocolState === 'PLAYING_FABULA' ? activeColor === 'yellow' : allowedTrafficColor === 'yellow');
  const isGreenEnabled =
    !isWeekendLocked &&
    !isResting &&
    (protocolState === 'PLAYING_FABULA' ? activeColor === 'green' : allowedTrafficColor === 'green');

  // Состояние плеера: вычисление процента прогресса трека (0..100)
  const isPlayingAudio = (protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') && !!currentPlayingTrack;
  const totalTrackDuration = currentPlayingTrack?.durationSeconds || 0;
  const playbackProgressPercent = isPlayingAudio && totalTrackDuration > 0
    ? Math.min(100, Math.max(0, (playbackSeconds / totalTrackDuration) * 100))
    : 0;

  return (
    <div
      className="w-screen h-screen flex flex-col m-0 p-2 sm:p-4 select-none box-border overflow-hidden transition-colors duration-300"
      style={{ backgroundColor: themeMode === 'light' ? '#E5E5EA' : '#1C1C1E' }}
    >
      {/* 1. ВЕРХНИЙ ИНДИКАТОР: ОБУЧАЮЩИЙ КАЛЕНДАРЬ 5/2 (секретное удержание для врача) */}
      <div
        id="layout_calendar_header"
        onMouseDown={handleLongPressStart}
        onMouseUp={handleLongPressEnd}
        onTouchStart={handleLongPressStart}
        onTouchEnd={handleLongPressEnd}
        className="w-full bg-[#2C2C2E] rounded-2xl px-4 py-2 sm:py-2.5 flex items-center justify-between border border-neutral-700/60 shadow-md cursor-pointer active:scale-[0.99] transition-transform flex-shrink-0 text-neutral-100"
        title="Удерживайте 2 секунды для входа в меню врача"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl overflow-hidden border border-amber-400/40 shadow-[0_0_12px_rgba(251,191,36,0.3)] bg-neutral-900 flex-shrink-0">
            <img
              src="/icon.jpg"
              alt="Артёмка"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span id="tv_calendar_day" className={`text-xl sm:text-2xl font-black tracking-wider ${dayStatus.colorClass}`}>
                {dayStatus.title}
              </span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${dayStatus.badgeBg}`}>
                {courseConfig.totalDays} Дней 5/2
              </span>
            </div>
            <div
              id="tv_calendar_status"
              className="text-xs text-neutral-400 flex items-center gap-1.5 mt-0.5"
            >
              {timerRemainingSeconds > 0 ? (
                <span className="text-amber-300 font-mono font-bold flex items-center gap-1">
                  ⏳ {timerLabel}: {formatTime(timerRemainingSeconds)}
                </span>
              ) : dayStatus.dayType === 'WEEKEND' ? (
                <span className="text-orange-400 flex items-center gap-1">
                  <Moon className="w-3.5 h-3.5" /> {dayStatus.subtitle}
                </span>
              ) : dayStatus.dayType === 'POST_COURSE' ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> {dayStatus.subtitle}
                </span>
              ) : (
                <span>{dayStatus.subtitle}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            id="btn_open_doctor_modal"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsDoctorModalOpen(true);
            }}
            className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition cursor-pointer"
            title="Меню врача (секретное)"
          >
            <Settings className="w-4 h-4 text-amber-400" />
          </button>
        </div>
      </div>

      {/* 2. ДВЕ КОЛОНКИ: ОСНОВНОЙ СВЕТОФОР (СЛЕВА) И ПЕШЕХОДНЫЙ СВЕТОФОР БРТ (СПРАВА) */}
      <div className="flex-1 flex flex-row gap-3 sm:gap-6 h-full min-h-0 py-1.5 sm:py-3 items-center justify-center">
        {/* ЛЕВАЯ КОЛОНКА: ОСНОВНОЙ СВЕТОФОР (ФАБУЛЫ .FLAC) */}
        <div
          id="street_traffic_light_container"
          className={`w-full max-w-[190px] sm:max-w-[220px] md:max-w-[240px] rounded-[38px] sm:rounded-[46px] p-3 sm:p-4 border-4 flex flex-col items-center justify-around h-full relative transition-colors duration-300 ${
            themeMode === 'light'
              ? 'bg-gradient-to-b from-[#5E626E] via-[#4A4D57] to-[#383A42] border-[#6D7280] shadow-[0_15px_35px_rgba(0,0,0,0.3),inset_0_2px_4px_rgba(255,255,255,0.22)]'
              : 'bg-gradient-to-b from-[#18181b] via-[#121214] to-[#0e0e10] border-[#27272a] shadow-[0_15px_40px_rgba(0,0,0,0.85),inset_0_2px_4px_rgba(255,255,255,0.08)]'
          }`}
        >
          {/* Верхний декоративный козырек корпуса */}
          <div
            className={`absolute -top-2.5 w-14 sm:w-16 h-2.5 rounded-t-full border-t transition-colors ${
              themeMode === 'light'
                ? 'bg-gradient-to-b from-[#6E7382] to-[#4A4D57] border-[#7F8596]'
                : 'bg-[#27272a] border-[#3f3f46]'
            }`}
          />

          {/* 1. КРАСНЫЙ СИГНАЛ (#FF0000) */}
          <div className="flex flex-col items-center w-full">
            <div
              className={`w-20 sm:w-24 md:w-28 h-2 sm:h-2.5 rounded-t-full border-t border-x shadow-md relative -mb-1 z-10 opacity-90 transition-colors ${
                themeMode === 'light'
                  ? 'bg-gradient-to-b from-[#6E7382] to-[#434650] border-[#7F8596]'
                  : 'bg-gradient-to-b from-[#27272a] to-[#18181b] border-[#3f3f46]'
              }`}
            />
            <button
              id="btn_fabula_red"
              onClick={() => handleFabulaClick('red')}
              aria-label="Красная фабула"
              disabled={!isRedEnabled}
              className={`relative w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full flex items-center justify-center transition-all duration-300 outline-none border-4 ${
                activeColor === 'red' && protocolState === 'PLAYING_FABULA'
                  ? 'bg-[#FF0000] border-red-200 shadow-[0_0_55px_#FF0000,inset_0_0_20px_rgba(255,255,255,0.7)] ring-4 ring-red-400/80 scale-105 cursor-pointer animate-pulse'
                  : testSignalIndex === 0
                  ? 'bg-[#FF0000] border-white shadow-[0_0_45px_#FF0000] scale-105'
                  : !isRedEnabled
                  ? 'bg-[#330000] border-[#220000] opacity-20 cursor-not-allowed'
                  : 'bg-[#FF0000] border-[#FFAAAA] shadow-[0_0_25px_rgba(255,0,0,0.65),inset_0_0_15px_rgba(255,255,255,0.4)] hover:scale-105 active:scale-95 cursor-pointer'
              }`}
            >
              <div className="absolute inset-1.5 rounded-full pointer-events-none opacity-25 bg-[radial-gradient(circle,#ffffff_1.5px,transparent_1.5px)] [background-size:6px_6px]" />
              <div className="absolute inset-x-2.5 top-1.5 h-6 sm:h-7 rounded-t-full bg-gradient-to-b from-white/50 via-white/15 to-transparent pointer-events-none" />
            </button>
          </div>

          {/* 2. ЖЕЛТЫЙ СИГНАЛ (#FFD700) */}
          <div className="flex flex-col items-center w-full">
            <div
              className={`w-20 sm:w-24 md:w-28 h-2 sm:h-2.5 rounded-t-full border-t border-x shadow-md relative -mb-1 z-10 opacity-90 transition-colors ${
                themeMode === 'light'
                  ? 'bg-gradient-to-b from-[#6E7382] to-[#434650] border-[#7F8596]'
                  : 'bg-gradient-to-b from-[#27272a] to-[#18181b] border-[#3f3f46]'
              }`}
            />
            <button
              id="btn_fabula_yellow"
              onClick={() => handleFabulaClick('yellow')}
              aria-label="Желтая фабула"
              disabled={!isYellowEnabled}
              className={`relative w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full flex items-center justify-center transition-all duration-300 outline-none border-4 ${
                activeColor === 'yellow' && protocolState === 'PLAYING_FABULA'
                  ? 'bg-[#FFD700] border-yellow-100 shadow-[0_0_55px_#FFD700,inset_0_0_20px_rgba(255,255,255,0.8)] ring-4 ring-yellow-300/80 scale-105 cursor-pointer animate-pulse'
                  : testSignalIndex === 1
                  ? 'bg-[#FFD700] border-white shadow-[0_0_45px_#FFD700] scale-105'
                  : !isYellowEnabled
                  ? 'bg-[#332800] border-[#221a00] opacity-20 cursor-not-allowed'
                  : 'bg-[#FFD700] border-[#FFF3AA] shadow-[0_0_25px_rgba(255,215,0,0.65),inset_0_0_15px_rgba(255,255,255,0.5)] hover:scale-105 active:scale-95 cursor-pointer'
              }`}
            >
              <div className="absolute inset-1.5 rounded-full pointer-events-none opacity-25 bg-[radial-gradient(circle,#ffffff_1.5px,transparent_1.5px)] [background-size:6px_6px]" />
              <div className="absolute inset-x-2.5 top-1.5 h-6 sm:h-7 rounded-t-full bg-gradient-to-b from-white/50 via-white/15 to-transparent pointer-events-none" />
            </button>
          </div>

          {/* 3. ЗЕЛЕНЫЙ СИГНАЛ (#00FF00) */}
          <div className="flex flex-col items-center w-full">
            <div
              className={`w-20 sm:w-24 md:w-28 h-2 sm:h-2.5 rounded-t-full border-t border-x shadow-md relative -mb-1 z-10 opacity-90 transition-colors ${
                themeMode === 'light'
                  ? 'bg-gradient-to-b from-[#6E7382] to-[#434650] border-[#7F8596]'
                  : 'bg-gradient-to-b from-[#27272a] to-[#18181b] border-[#3f3f46]'
              }`}
            />
            <button
              id="btn_fabula_green"
              onClick={() => handleFabulaClick('green')}
              aria-label="Зеленая фабула"
              disabled={!isGreenEnabled}
              className={`relative w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full flex items-center justify-center transition-all duration-300 outline-none border-4 ${
                activeColor === 'green' && protocolState === 'PLAYING_FABULA'
                  ? 'bg-[#00FF00] border-emerald-100 shadow-[0_0_55px_#00FF00,inset_0_0_20px_rgba(255,255,255,0.7)] ring-4 ring-green-400/80 scale-105 cursor-pointer animate-pulse'
                  : testSignalIndex === 2
                  ? 'bg-[#00FF00] border-white shadow-[0_0_45px_#00FF00] scale-105'
                  : !isGreenEnabled
                  ? 'bg-[#003300] border-[#002200] opacity-20 cursor-not-allowed'
                  : 'bg-[#00FF00] border-[#AAFFAA] shadow-[0_0_25px_rgba(0,255,0,0.65),inset_0_0_15px_rgba(255,255,255,0.4)] hover:scale-105 active:scale-95 cursor-pointer'
              }`}
            >
              <div className="absolute inset-1.5 rounded-full pointer-events-none opacity-25 bg-[radial-gradient(circle,#ffffff_1.5px,transparent_1.5px)] [background-size:6px_6px]" />
              <div className="absolute inset-x-2.5 top-1.5 h-6 sm:h-7 rounded-t-full bg-gradient-to-b from-white/50 via-white/15 to-transparent pointer-events-none" />
            </button>
          </div>
        </div>

        {/* ПРАВАЯ КОЛОНКА: ПЕШЕХОДНЫЙ СВЕТОФОР БРТ - ОДИНАКОВАЯ ЯРКОСТЬ И СОЧНОСТЬ (#FF0000, #00FF00) */}
        <div
          id="pedestrian_traffic_light_container"
          className={`w-full max-w-[190px] sm:max-w-[220px] md:max-w-[240px] rounded-[38px] sm:rounded-[46px] p-3 sm:p-4 border-4 flex flex-col items-center justify-around h-full relative transition-colors duration-300 ${
            themeMode === 'light'
              ? 'bg-gradient-to-b from-[#5E626E] via-[#4A4D57] to-[#383A42] border-[#6D7280] shadow-[0_15px_35px_rgba(0,0,0,0.3),inset_0_2px_4px_rgba(255,255,255,0.22)]'
              : 'bg-gradient-to-b from-[#18181b] via-[#121214] to-[#0e0e10] border-[#27272a] shadow-[0_15px_40px_rgba(0,0,0,0.85),inset_0_2px_4px_rgba(255,255,255,0.08)]'
          }`}
        >
          {/* Красный пешеход (#FF0000) (БРТ Стоп) */}
          <div className="flex flex-col items-center w-full">
            <button
              id="btn_brt_red"
              onClick={() => {
                if (isBrtPedeRedActive) {
                  soundEngine.playClickSound();
                }
              }}
              aria-label="БРТ Стоп"
              className={`w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full flex flex-col items-center justify-center transition-all duration-300 border-4 ${
                isBrtPedeRedActive
                  ? 'bg-[#FF0000] border-white shadow-[0_0_55px_#FF0000] ring-4 ring-red-400/80 scale-105 opacity-100'
                  : 'bg-[#FF0000] border-[#FFAAAA] opacity-25 hover:opacity-40 cursor-pointer'
              }`}
            >
              <ShieldAlert
                className={`w-11 h-11 sm:w-13 sm:h-13 text-white transition-transform ${
                  isBrtPedeRedActive ? 'animate-pulse scale-110' : 'opacity-90'
                }`}
                strokeWidth={2.4}
              />
            </button>
          </div>

          {/* Зеленый пешеход (#00FF00) (БРТ Поехали / СТОП) */}
          <div className="flex flex-col items-center w-full">
            <button
              id="btn_brt_green"
              onClick={handleBrtGreenClick}
              aria-label="БРТ Поехали"
              className={`w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full flex flex-col items-center justify-center transition-all duration-300 border-4 ${
                protocolState === 'PLAYING_BRT'
                  ? 'bg-[#00FF00] border-white shadow-[0_0_55px_#00FF00] ring-4 ring-emerald-300 scale-105 animate-pulse opacity-100 cursor-pointer'
                  : isBrtPedeGreenActive
                  ? 'bg-[#00FF00] border-white shadow-[0_0_50px_#00FF00] ring-4 ring-emerald-400/80 scale-105 opacity-100 cursor-pointer'
                  : 'bg-[#00FF00] border-[#AAFFAA] opacity-25 hover:opacity-40 cursor-pointer'
              }`}
            >
              <Footprints
                className={`w-11 h-11 sm:w-13 sm:h-13 transition-transform ${
                  isBrtPedeGreenActive
                    ? 'scale-110 text-black animate-bounce'
                    : 'text-black opacity-90'
                }`}
                strokeWidth={2.4}
              />
            </button>
          </div>
        </div>
      </div>

      {/* 3. НЕБРОСКАЯ АККУРАТНАЯ СТРОКА НАЗВАНИЯ ТРЕКА */}
      <div className="h-6 flex items-center justify-center text-center flex-shrink-0 mb-1">
        {currentPlayingTrack ? (
          <div
            id="tv_track_title"
            className={`${
              themeMode === 'light' ? 'text-neutral-700' : 'text-neutral-200'
            } text-xs sm:text-sm font-normal tracking-wide truncate max-w-md px-4 transition-opacity duration-300 opacity-100`}
          >
            ▶ {currentPlayingTrack.displayName}
          </div>
        ) : null}
      </div>

      {/* 4. НИЖНЯЯ СТРОКА УПРАВЛЕНИЯ И ИЗОЛИРОВАННЫЙ АДДОН ЗАЦИКЛИВАНИЯ ТРЕКОВ */}
      <div className="w-full relative flex-shrink-0">
        {/* Кнопка зацикливания: динамически появляется в момент запуска (воспроизведения) трека,
            расположена в левой нижней части экрана, строго над полосой прогресса (progress bar) */}
        <div
          className={`absolute bottom-full mb-1 sm:mb-1.5 left-2 sm:left-3 z-30 transition-all duration-300 ease-out ${
            isPlayingAudio
              ? 'opacity-100 translate-y-0 pointer-events-auto scale-100'
              : 'opacity-0 translate-y-2 pointer-events-none scale-95'
          }`}
        >
          <LoopButton
            mode={loopMode}
            onToggle={handleCycleLoopMode}
            currentTrackNum={protocolState === 'PLAYING_BRT' ? currentBrtIndex + 1 : 1}
            totalTracksInQueue={protocolState === 'PLAYING_BRT' ? brtQueue.length : 1}
          />
        </div>

        <div
          id="layout_bottom_control_bar"
          className={`w-full rounded-xl px-4 py-2 flex items-center justify-between border shadow-lg relative overflow-hidden transition-colors ${
            themeMode === 'light'
              ? 'bg-[#F2F2F7] border-neutral-300/90 text-neutral-900'
              : 'bg-[#2C2C2E] border-neutral-700/60 text-neutral-100'
          }`}
        >
          {/* Горизонтальная полоса прогресса зелёного цвета по верхней границе нижней строки над кнопками */}
        <div
          id="pb_playback_progress_container"
          className={`absolute top-0 left-0 right-0 h-1 sm:h-1.5 overflow-hidden ${
            themeMode === 'light' ? 'bg-neutral-300/80' : 'bg-neutral-800/90'
          }`}
          title={`Прогресс трека: ${Math.round(playbackProgressPercent)}%`}
        >
          <div
            id="pb_playback_progress"
            className="h-full bg-[#00E676] shadow-[0_0_10px_#00E676] transition-all duration-300 ease-out"
            style={{ width: `${playbackProgressPercent}%` }}
          />
        </div>

        {/* 1) Левый угол строки: кнопка/счётчик таймера и кнопка СТОП ближе к ней */}
        <div className="flex items-center gap-2 z-10">
          {/* Счётчик/кнопка времени прослушивания в левом углу строки */}
          <div
            id="tv_playback_timer"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-mono text-xs sm:text-sm font-bold tracking-wide select-none transition-all ${
              (protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') && currentPlayingTrack
                ? isPlaybackPaused
                  ? 'bg-[#1C1C1E] border-amber-500/80 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                  : 'bg-[#1C1C1E] border-sky-500/80 text-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.4)]'
                : 'bg-[#1C1C1E] border-neutral-700/70 text-neutral-400'
            }`}
            title="Время прослушивания"
          >
            <span
              className={
                (protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') && currentPlayingTrack
                  ? isPlaybackPaused
                    ? 'text-amber-400'
                    : 'text-emerald-400 animate-pulse'
                  : 'text-neutral-500'
              }
            >
              ⏱
            </span>
            <span
              className={
                (protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') && currentPlayingTrack
                  ? isPlaybackPaused
                    ? 'text-amber-300'
                    : 'text-sky-300'
                  : 'text-neutral-300'
              }
            >
              {formatPlaybackTime(playbackSeconds)}
            </span>
            {(protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') && currentPlayingTrack?.durationSeconds ? (
              <span className="text-neutral-400 font-normal text-[11px] sm:text-xs">
                / {formatPlaybackTime(currentPlayingTrack.durationSeconds)}
              </span>
            ) : null}
            {isPlaybackPaused ? (
              <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-950/60 px-1 py-0.5 rounded border border-amber-500/40">
                Пауза
              </span>
            ) : null}
          </div>

          {/* Кнопка СТОП перенесена ближе к кнопке таймера */}
          <button
            id="btn_playback_stop"
            onClick={handleTogglePausePlayback}
            className={`w-8 h-8 sm:w-9 sm:h-8 rounded-lg flex items-center justify-center border transition-all active:scale-95 cursor-pointer select-none ${
              (protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') && currentPlayingTrack
                ? isPlaybackPaused
                  ? 'bg-amber-400 hover:bg-amber-300 border-amber-200 text-neutral-950 shadow-[0_0_14px_rgba(251,191,36,0.95)] animate-pulse'
                  : 'bg-red-600 hover:bg-red-500 border-red-300 text-white shadow-[0_0_14px_rgba(239,68,68,0.9)]'
                : 'bg-[#3b1820] hover:bg-[#54212d] border-red-500 text-rose-300 shadow-[0_0_6px_rgba(239,68,68,0.4)]'
            }`}
            title={
              isPlaybackPaused
                ? 'Запустить трек и счётчик прослушивания'
                : (protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') && currentPlayingTrack
                ? 'Остановить трек и счётчик прослушивания'
                : 'Запустить / Остановить воспроизведение'
            }
            aria-label="Стоп и запуск трека и счётчика"
          >
            {isPlaybackPaused ? (
              <Play className="w-3.5 h-3.5 fill-neutral-950 ml-0.5 text-neutral-950" />
            ) : (
              <Square
                className={`w-3.5 h-3.5 fill-current ${
                  (protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') && currentPlayingTrack
                    ? 'text-white'
                    : 'text-rose-400'
                }`}
              />
            )}
          </button>
        </div>

        {/* Распорка для смещения кнопок БРТ и Отмена ближе к центру строки */}
        <div className="flex-1" />

        {/* 2) Ближе к центру строки: Кнопка Брт и рядом кнопка крестик */}
        <div className="flex items-center gap-1.5 z-10">
          {/* Кнопка "Брт" */}
          <button
            id="btn_brt_toggle"
            onClick={handleBrtToggle}
            className={`h-7 px-2.5 rounded-md font-bold text-xs transition-all cursor-pointer shadow-sm active:scale-95 flex items-center justify-center ${
              isBrtToggleActive
                ? 'bg-[#4B5563] hover:bg-[#374151] text-white'
                : 'bg-[#00E676] hover:bg-[#00C853] text-black shadow-[0_0_12px_rgba(0,230,118,0.4)]'
            }`}
            title="Брт"
            aria-label="Брт"
          >
            Брт
          </button>

          {/* Кнопка "Отмена" ("❌") рядом с кнопкой Брт */}
          <button
            id="btn_cancel_timer"
            onClick={handleCancelTimer}
            className="w-9 h-8 rounded-lg font-bold text-sm bg-[#3A3A3C] hover:bg-[#4A4A4D] text-red-400 flex items-center justify-center border border-neutral-600 transition-all cursor-pointer active:scale-95"
            title="Сброс блокировок (Отмена)"
            aria-label="Отмена"
          >
            ❌
          </button>
        </div>

        {/* Правая распорка для центрирования блока БРТ и Отмена */}
        <div className="flex-1" />
      </div>
    </div>

      {/* Модальное окно врача / родителя */}
      <DoctorSettingsModal
        isOpen={isDoctorModalOpen}
        onClose={() => setIsDoctorModalOpen(false)}
        courseConfig={courseConfig}
        onSaveCourseConfig={(newCfg) => {
          setCourseConfig(newCfg);
          saveCourseConfig(newCfg);
        }}
        files={files}
        onUpdateFiles={(newFiles) => {
          setFiles(newFiles);
          saveStoredFiles(newFiles);
        }}
        isTimerRunning={protocolState === 'REST_1_WAIT_BRT' || protocolState === 'REST_2_FINAL'}
        onFastForwardTimer={() => {
          stopRestCountdown();
          soundEngine.playNotificationAlert();
          advanceToNextTrafficColorAndCheckBrt();
        }}
        themeMode={themeMode}
        onToggleTheme={handleToggleTheme}
      />

      {/* Аккуратное детское всплывающее окошко "Пусто" */}
      {emptyAlertVisible && (
        <div
          id="toast-empty-folder"
          role="status"
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-[#1e1e24]/95 border border-amber-500/70 shadow-2xl rounded-2xl px-6 py-4 flex items-center gap-3 backdrop-blur-md"
        >
          <span className="text-2xl">📂</span>
          <div>
            <div className="text-xl font-bold text-amber-300 tracking-wide">Пусто</div>
            <div className="text-xs text-neutral-300 mt-0.5">Открываем проводник памяти...</div>
          </div>
        </div>
      )}

      {/* Скрытый проводник файлов для моментального выбора протокола */}
      <input
        ref={quickFilePickerRef}
        type="file"
        accept="audio/*,.flac,.mp3"
        className="hidden"
        onChange={handleQuickFilePicked}
      />
    </div>
  );
}
