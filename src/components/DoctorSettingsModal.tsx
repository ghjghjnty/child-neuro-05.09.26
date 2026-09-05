import React, { useState } from 'react';
import { CourseConfig, AudioItem, ThemeMode } from '../types';
import { Settings, X, Trash2, Folder, Calendar, Clock, Check, AlertCircle, Sun, Moon } from 'lucide-react';
import { saveTrackBlob, deleteTrackBlob } from '../utils/trackStorage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  courseConfig: CourseConfig;
  onSaveCourseConfig: (config: CourseConfig) => void;
  files: AudioItem[];
  onUpdateFiles: (files: AudioItem[]) => void;
  onFastForwardTimer?: () => void;
  isTimerRunning: boolean;
  themeMode?: ThemeMode;
  onToggleTheme?: () => void;
}

export const DoctorSettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  courseConfig,
  onSaveCourseConfig,
  files,
  onUpdateFiles,
  onFastForwardTimer,
  isTimerRunning,
  themeMode,
  onToggleTheme,
}) => {
  const [totalDays, setTotalDays] = useState<14 | 21>(courseConfig.totalDays);
  const [currentDay, setCurrentDay] = useState<number>(courseConfig.currentDay);
  const [selectedFolder, setSelectedFolder] = useState<'1_Red' | '2_Yellow' | '3_Green'>('1_Red');
  const [localTheme, setLocalTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('artemka_theme_mode');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {}
    return 'dark';
  });

  const currentTheme = themeMode ?? localTheme;

  const handleToggleTheme = () => {
    if (onToggleTheme) {
      onToggleTheme();
    } else {
      setLocalTheme((prev) => {
        const next = prev === 'dark' ? 'light' : 'dark';
        try {
          localStorage.setItem('artemka_theme_mode', next);
        } catch {}
        return next;
      });
    }
  };

  if (!isOpen) return null;

  const handleSaveCourse = () => {
    onSaveCourseConfig({
      ...courseConfig,
      totalDays,
      currentDay: Math.max(1, currentDay),
    });
    onClose();
  };

  const handleDeleteFile = (id: string) => {
    deleteTrackBlob(id).catch(console.error);
    const updated = files.filter((f) => f.id !== id);
    onUpdateFiles(updated);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploaded = e.target.files;
    if (!uploaded || uploaded.length === 0) return;

    const newItems: AudioItem[] = [];
    for (let i = 0; i < uploaded.length; i++) {
      const file = uploaded[i];
      const isFlac = file.name.toLowerCase().endsWith('.flac');
      const isMp3 = file.name.toLowerCase().endsWith('.mp3');
      if (isFlac || isMp3) {
        const cleanName = file.name.replace(/\.[^/.]+$/, '');
        const blobUrl = URL.createObjectURL(file);
        const itemId = `upload_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`;
        
        // Сохраняем бинарные данные в постоянную память браузера/приложения
        await saveTrackBlob(itemId, file);

        newItems.push({
          id: itemId,
          fileName: file.name,
          displayName: cleanName,
          format: isFlac ? 'flac' : 'mp3',
          folder: selectedFolder,
          durationSeconds: 120,
          customBlobUrl: blobUrl,
        });
      }
    }

    if (newItems.length > 0) {
      onUpdateFiles([...files, ...newItems]);
    }
  };

  const currentFolderFiles = files.filter((f) => f.folder === selectedFolder);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div
        className={`border rounded-3xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden transition-colors duration-200 ${
          currentTheme === 'light'
            ? 'bg-[#ffffff] border-neutral-300 text-neutral-900'
            : 'bg-[#1e1e24] border-neutral-700 text-neutral-100'
        }`}
      >
        {/* Заголовок: секретное меню врача / родителя (отображается как в тёмной теме) */}
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between bg-[#26262e] text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Секретное меню врача / родителя</h2>
              <p className="text-xs text-neutral-400">
                Настройки курса «Артёмка», папок и протокола
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Кнопка выбора режима нажатием (день, ночь) / (тёмный, светлый) без текста */}
            <button
              id="btn_theme_mode_toggle"
              type="button"
              onClick={handleToggleTheme}
              className="w-8 h-8 rounded-full flex items-center justify-center transition cursor-pointer select-none active:scale-95 bg-neutral-800 hover:bg-neutral-700 text-sky-300 hover:text-white"
              title={
                currentTheme === 'light'
                  ? 'Режим: Светлый / День (нажмите для перехода в Тёмный / Ночь)'
                  : 'Режим: Тёмный / Ночь (нажмите для перехода в Светлый / День)'
              }
              aria-label="Режим день / ночь"
            >
              {currentTheme === 'light' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-sky-300" />
              )}
            </button>

            {/* Кнопка крестик закрытия */}
            <button
              id="btn_close_doctor_modal"
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center transition cursor-pointer select-none active:scale-95 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white"
              title="Закрыть"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Тело модального окна */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6 text-sm">
          {/* 1. Настройка курса 5/2 */}
          <div
            className={`p-4 rounded-2xl border space-y-3 transition-colors ${
              currentTheme === 'light'
                ? 'bg-[#f8f8fa] border-neutral-200'
                : 'bg-[#24242c] border-neutral-800'
            }`}
          >
            <div
              className={`flex items-center gap-2 font-semibold ${
                currentTheme === 'light' ? 'text-neutral-900' : 'text-white'
              }`}
            >
              <Calendar className="w-4 h-4 text-emerald-500" />
              <span>Параметры курса 5/2</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  className={`text-xs block mb-1 ${
                    currentTheme === 'light' ? 'text-neutral-600' : 'text-neutral-400'
                  }`}
                >
                  Длительность курса:
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTotalDays(14)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      totalDays === 14
                        ? 'bg-emerald-600 border-emerald-400 text-white'
                        : currentTheme === 'light'
                        ? 'bg-neutral-200 border-neutral-300 text-neutral-800 hover:bg-neutral-300'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                    }`}
                  >
                    14 Дней
                  </button>
                  <button
                    type="button"
                    onClick={() => setTotalDays(21)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      totalDays === 21
                        ? 'bg-emerald-600 border-emerald-400 text-white'
                        : currentTheme === 'light'
                        ? 'bg-neutral-200 border-neutral-300 text-neutral-800 hover:bg-neutral-300'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                    }`}
                  >
                    21 День
                  </button>
                </div>
              </div>

              <div>
                <label
                  className={`text-xs block mb-1 ${
                    currentTheme === 'light' ? 'text-neutral-600' : 'text-neutral-400'
                  }`}
                >
                  Текущий день:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={totalDays + 5}
                    value={currentDay}
                    onChange={(e) => setCurrentDay(parseInt(e.target.value) || 1)}
                    className={`w-full rounded-xl px-3 py-2 font-mono text-center font-bold border transition ${
                      currentTheme === 'light'
                        ? 'bg-white border-neutral-300 text-neutral-900'
                        : 'bg-neutral-800 border-neutral-700 text-white'
                    }`}
                  />
                  <span
                    className={`text-xs whitespace-nowrap ${
                      currentTheme === 'light' ? 'text-neutral-500' : 'text-neutral-500'
                    }`}
                  >
                    из {totalDays}+5
                  </span>
                </div>
              </div>
            </div>

            <p
              className={`text-[11px] leading-relaxed ${
                currentTheme === 'light' ? 'text-neutral-600' : 'text-neutral-400'
              }`}
            >
              * 5 дней терапии (числа белые, светофор работает) → 2 дня отдыха (числа оранжевые, значок 💤) → 5 дней
              межкурсового отдыха (числа зелёные).
            </p>
          </div>

          {/* 2. Медицинский таймер на 120 минут */}
          {isTimerRunning && (
            <div className="bg-amber-950/40 p-4 rounded-2xl border border-amber-600/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-amber-400 animate-spin" />
                <div>
                  <div className="font-semibold text-amber-200">Идёт медицинский отдых 120 мин</div>
                  <div className="text-xs text-amber-300/80">Для быстрого тестирования протокола</div>
                </div>
              </div>
              {onFastForwardTimer && (
                <button
                  type="button"
                  onClick={onFastForwardTimer}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-900 font-semibold text-xs transition cursor-pointer"
                >
                  Завершить 2 ч сейчас
                </button>
              )}
            </div>
          )}

          {/* 3. Управление файлами в /NeuroPlayer/ */}
          <div
            className={`p-4 rounded-2xl border space-y-3 transition-colors ${
              currentTheme === 'light'
                ? 'bg-[#f8f8fa] border-neutral-200'
                : 'bg-[#24242c] border-neutral-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div
                className={`flex items-center gap-2 font-semibold ${
                  currentTheme === 'light' ? 'text-neutral-900' : 'text-white'
                }`}
              >
                <Folder className="w-4 h-4 text-blue-500" />
                <span>Файлы в /NeuroPlayer/</span>
              </div>
              <span
                className={`text-xs ${
                  currentTheme === 'light' ? 'text-neutral-500' : 'text-neutral-400'
                }`}
              >
                Автосканирование .flac и .mp3
              </span>
            </div>

            {/* Вкладки папок 1_Red, 2_Yellow, 3_Green */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedFolder('1_Red')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  selectedFolder === '1_Red'
                    ? 'bg-red-950/80 text-red-300 border-red-500'
                    : currentTheme === 'light'
                    ? 'bg-neutral-200 text-neutral-700 border-neutral-300'
                    : 'bg-neutral-800/80 text-neutral-400 border-neutral-700'
                }`}
              >
                1_Red (Красный)
              </button>
              <button
                type="button"
                onClick={() => setSelectedFolder('2_Yellow')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  selectedFolder === '2_Yellow'
                    ? 'bg-amber-950/80 text-amber-300 border-amber-500'
                    : currentTheme === 'light'
                    ? 'bg-neutral-200 text-neutral-700 border-neutral-300'
                    : 'bg-neutral-800/80 text-neutral-400 border-neutral-700'
                }`}
              >
                2_Yellow (Жёлтый)
              </button>
              <button
                type="button"
                onClick={() => setSelectedFolder('3_Green')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  selectedFolder === '3_Green'
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500'
                    : currentTheme === 'light'
                    ? 'bg-neutral-200 text-neutral-700 border-neutral-300'
                    : 'bg-neutral-800/80 text-neutral-400 border-neutral-700'
                }`}
              >
                3_Green (Зелёный)
              </button>
            </div>

            {/* Список обнаруженных файлов в папке */}
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {currentFolderFiles.length === 0 ? (
                <div
                  className={`text-center py-4 text-xs flex items-center justify-center gap-1.5 ${
                    currentTheme === 'light' ? 'text-neutral-500' : 'text-neutral-500'
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5" /> В папке {selectedFolder} нет файлов
                </div>
              ) : (
                currentFolderFiles.map((f) => (
                  <div
                    key={f.id}
                    className={`flex items-center justify-between p-2 rounded-xl border text-xs ${
                      currentTheme === 'light'
                        ? 'bg-white border-neutral-200 text-neutral-800'
                        : 'bg-neutral-800/70 border-neutral-700/50 text-neutral-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                          f.format === 'flac' ? 'bg-blue-900 text-blue-300' : 'bg-purple-900 text-purple-300'
                        }`}
                      >
                        {f.format}
                      </span>
                      <span className="truncate font-medium">{f.displayName}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteFile(f.id)}
                      className="text-neutral-400 hover:text-red-500 p-1 transition cursor-pointer"
                      title="Удалить файл"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Загрузка реальных аудиофайлов */}
            <div
              className={`pt-2 border-t flex items-center justify-between text-[11px] ${
                currentTheme === 'light'
                  ? 'border-neutral-200 text-neutral-600'
                  : 'border-neutral-700/50 text-neutral-400'
              }`}
            >
              <span>Загрузить файлы с устройства (.flac / .mp3):</span>
              <label
                id="btn_browse_files"
                className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold cursor-pointer transition-all border-[2.5px] border-[#50C878] shadow-[0_0_12px_rgba(80,200,120,0.35)] hover:shadow-[0_0_18px_rgba(80,200,120,0.55)] active:scale-95 flex items-center justify-center tracking-wide"
                style={{ borderColor: '#50C878', borderWidth: '2.5px' }}
              >
                Обзор...
                <input
                  type="file"
                  accept=".flac,.mp3,audio/*"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Футер */}
        <div
          className={`px-5 py-3 border-t flex justify-end gap-2 transition-colors ${
            currentTheme === 'light'
              ? 'bg-[#f4f4f6] border-neutral-200'
              : 'bg-[#26262e] border-neutral-800'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
              currentTheme === 'light'
                ? 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
                : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'
            }`}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSaveCourse}
            className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 flex items-center gap-1.5 transition shadow-lg shadow-emerald-950 cursor-pointer"
          >
            <Check className="w-4 h-4" /> Применить изменения
          </button>
        </div>
      </div>
    </div>
  );
};
