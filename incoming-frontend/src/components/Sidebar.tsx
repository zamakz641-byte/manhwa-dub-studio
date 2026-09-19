import React from 'react';
import {
  FolderKanban,
  SlidersHorizontal,
  Mic,
  Cpu,
  RefreshCw
} from 'lucide-react';
import type { RuntimeStatus } from '../types';

interface SidebarProps {
  currentView: 'home' | 'studio' | 'voices' | 'runtime';
  onViewChange: (view: 'home' | 'studio' | 'voices' | 'runtime') => void;
  runtime: RuntimeStatus | null;
  onRefreshRuntime: () => void;
  hasActiveProject: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onViewChange,
  runtime,
  onRefreshRuntime,
  hasActiveProject
}) => {
  const runtimeList = runtime ? (Object.values(runtime) as { ready?: boolean }[]) : [];
  const readyCount = runtimeList.filter((m) => m?.ready).length;
  const totalCount = runtimeList.length || 5;
  const allReady = readyCount > 0 && readyCount === totalCount;

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 bg-[#0d0f14] border-r border-[#1f2128] flex flex-col z-30 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-[#1f2128]">
        <button
          type="button"
          data-view="home"
          onClick={() => onViewChange('home')}
          className="brand flex items-center gap-3 w-full text-left group cursor-pointer focus:outline-none"
          aria-label="Accueil Manhwa Dub"
        >
          <div className="brand-mark w-10 h-10 rounded-lg bg-[#fbbf24] flex items-center justify-center font-black text-lg text-black shadow-md shadow-[#fbbf24]/20 group-hover:scale-105 transition-transform">
            MD
          </div>
          <div className="leading-tight">
            <span className="flex items-center gap-1.5 font-bold tracking-wider text-sm text-white">
              <span>MANHWA</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#1f2128] text-[#fbbf24] border border-[#fbbf24]/40 font-bold uppercase tracking-wider">
                BENTO
              </span>
            </span>
            <small className="text-[10px] uppercase font-bold tracking-widest text-[#63666d] block mt-0.5">
              Production Studio
            </small>
          </div>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-2 overflow-y-auto">
        <button
          type="button"
          data-view="home"
          onClick={() => onViewChange('home')}
          className={`nav-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
            currentView === 'home'
              ? 'active bg-[#1a1c22] text-[#fbbf24] border border-[#fbbf24]/30 shadow-sm'
              : 'text-[#63666d] hover:text-[#e0e0e0] hover:bg-[#14161c] border border-transparent'
          }`}
        >
          <FolderKanban className="w-4 h-4 shrink-0" />
          <span>Projets récents</span>
        </button>

        <button
          type="button"
          data-view="studio"
          onClick={() => onViewChange('studio')}
          className={`nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
            currentView === 'studio'
              ? 'active bg-[#1a1c22] text-[#fbbf24] border border-[#fbbf24]/30 shadow-sm'
              : 'text-[#63666d] hover:text-[#e0e0e0] hover:bg-[#14161c] border border-transparent'
          }`}
        >
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="w-4 h-4 shrink-0" />
            <span>Studio de doublage</span>
          </div>
          {hasActiveProject && (
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Projet actif chargé" />
          )}
        </button>

        <button
          type="button"
          data-view="voices"
          onClick={() => onViewChange('voices')}
          className={`nav-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
            currentView === 'voices'
              ? 'active bg-[#1a1c22] text-[#fbbf24] border border-[#fbbf24]/30 shadow-sm'
              : 'text-[#63666d] hover:text-[#e0e0e0] hover:bg-[#14161c] border border-transparent'
          }`}
        >
          <Mic className="w-4 h-4 shrink-0" />
          <span>Casting & Voix</span>
        </button>

        <button
          type="button"
          data-view="runtime"
          onClick={() => onViewChange('runtime')}
          className={`nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
            currentView === 'runtime'
              ? 'active bg-[#1a1c22] text-[#fbbf24] border border-[#fbbf24]/30 shadow-sm'
              : 'text-[#63666d] hover:text-[#e0e0e0] hover:bg-[#14161c] border border-transparent'
          }`}
        >
          <div className="flex items-center gap-3">
            <Cpu className="w-4 h-4 shrink-0" />
            <span>Moteurs & Runtime</span>
          </div>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
            allReady ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-[#fbbf24]/10 text-[#fbbf24] border border-[#fbbf24]/20'
          }`}>
            {readyCount}/{totalCount}
          </span>
        </button>
      </nav>

      {/* Production Quick Stats & Local Engine Status */}
      <div className="sidebar-foot p-4 border-t border-[#1f2128] space-y-3 bg-[#0a0b0d]">
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#14161c] border border-[#1f2128]">
          <div className="flex items-center gap-2.5">
            <i
              id="globalDot"
              className={`w-2 h-2 rounded-full inline-block ${
                allReady ? 'bg-green-500 shadow-sm shadow-green-500' : 'bg-yellow-500 shadow-sm shadow-yellow-500'
              }`}
            />
            <div className="leading-none">
              <span className="text-[11px] font-semibold text-white block">Moteur Local</span>
              <small id="globalStatus" className="text-[10px] text-[#63666d] block mt-0.5">
                {allReady ? 'Tous moteurs actifs' : `${readyCount}/${totalCount} actifs`}
              </small>
            </div>
          </div>

          <button
            id="refreshRuntime"
            type="button"
            onClick={onRefreshRuntime}
            title="Rafraîchir le diagnostic"
            className="p-1.5 rounded-md text-[#63666d] hover:text-[#fbbf24] hover:bg-[#1a1c22] transition-colors focus:outline-none cursor-pointer"
            aria-label="Actualiser le runtime"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center justify-between text-[10px] text-[#63666d] px-1 font-mono uppercase tracking-wider">
          <span>Qwen Vitesse</span>
          <span className="text-[#fbbf24] font-bold">1.93× temps réel</span>
        </div>
      </div>
    </aside>
  );
};
