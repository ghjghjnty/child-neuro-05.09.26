import React from 'react';
import { LoopMode } from '../types';

interface LoopButtonProps {
  mode: LoopMode;
  onToggle: () => void;
  currentTrackNum?: number;
  totalTracksInQueue?: number;
}

export const LoopButton: React.FC<LoopButtonProps> = ({
  mode,
  onToggle,
}) => {
  const getButtonConfig = () => {
    switch (mode) {
      case '1':
        return {
          title: 'Loop 1: Зацикливание 1 текущего трека (повтор текущего трека)',
          containerClass:
            'bg-emerald-950/90 hover:bg-emerald-900 border-emerald-400/80 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.45)]',
          textColor: 'text-emerald-300',
        };
      case '2':
        return {
          title: 'Loop 2: Зацикливание 2 треков подряд (последовательность: 1 → 2 → 1 → 2)',
          containerClass:
            'bg-sky-950/90 hover:bg-sky-900 border-sky-400/80 text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.45)]',
          textColor: 'text-sky-300',
        };
      case '3':
        return {
          title: 'Loop 3: Зацикливание 3 треков подряд (последовательность: 1 → 2 → 3 → 1)',
          containerClass:
            'bg-indigo-950/90 hover:bg-indigo-900 border-indigo-400/80 text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.45)]',
          textColor: 'text-indigo-300',
        };
      case '4':
        return {
          title: 'Loop 4: Зацикливание 4 треков подряд (последовательность: 1 → 2 → 3 → 4)',
          containerClass:
            'bg-amber-950/90 hover:bg-amber-900 border-amber-400/80 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.45)]',
          textColor: 'text-amber-300',
        };
      case 'off':
      default:
        return {
          title: 'Зацикливание: Выкл (обычный последовательный режим воспроизведения)',
          containerClass:
            'bg-[#222225]/95 hover:bg-[#2e2e32] border-neutral-700/80 hover:border-neutral-500 text-neutral-400 opacity-80 hover:opacity-100',
          textColor: 'text-neutral-400',
        };
    }
  };

  const config = getButtonConfig();

  return (
    <button
      id="btn_loop_mode_toggle"
      type="button"
      onClick={onToggle}
      className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all duration-200 cursor-pointer select-none active:scale-95 backdrop-blur-md shadow-md ${config.containerClass}`}
      title={config.title}
      aria-label={config.title}
    >
      <div className="relative w-5 h-5 flex items-center justify-center">
        {/* SVG значок зацикливания */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-full h-full flex-shrink-0"
        >
          <path d="m17 2 4 4-4 4" />
          <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
          <path d="m7 22-4-4 4-4" />
          <path d="M21 13v1a4 4 0 0 1-4 4H3" />
        </svg>

        {/* Цифры 1, 2, 3, 4 в центре значка при активации режима зацикливания */}
        {mode !== 'off' && (
          <span
            className={`absolute inset-0 flex items-center justify-center text-[10.5px] font-black font-mono leading-none pointer-events-none select-none ${config.textColor}`}
            style={{ transform: 'translateY(0.5px)' }}
          >
            {mode}
          </span>
        )}
      </div>
    </button>
  );
};
