import React from 'react';
import { Search, Plus, Film } from 'lucide-react';
import type { Project } from '../types';

interface TopbarProps {
  currentView: 'home' | 'studio' | 'voices' | 'runtime';
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenNewProject: () => void;
  activeProject: Project | null;
  onSelectProject: (proj: Project | null) => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  currentView,
  searchQuery,
  onSearchChange,
  onOpenNewProject,
  activeProject,
  onSelectProject
}) => {
  const titles = {
    home: {
      eyebrow: 'PROJETS /',
      title: 'Espace de Travail'
    },
    studio: {
      eyebrow: 'PROJET ACTIF /',
      title: activeProject ? activeProject.title : 'Studio de Doublage'
    },
    voices: {
      eyebrow: 'VOIX & CASTING /',
      title: 'Catalogue Qwen & OmniVoice'
    },
    runtime: {
      eyebrow: 'DIAGNOSTIC /',
      title: 'Moteurs Locaux'
    }
  };

  const currentMeta = titles[currentView];

  return (
    <header className="h-14 border-b border-[#1f2128] px-6 flex items-center justify-between bg-[#0d0f14] z-20 shrink-0 select-none">
      {/* View Title & Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0 pr-4">
        <span
          id="eyebrow"
          className="text-sm font-medium text-[#63666d]"
        >
          {currentMeta.eyebrow}
        </span>
        <h1
          id="pageTitle"
          className="text-sm font-semibold text-white truncate max-w-sm"
        >
          {currentMeta.title}
        </h1>

        <span className="hidden sm:inline-block ml-2 px-2 py-0.5 rounded bg-[#1f2128] text-[10px] text-[#fbbf24] border border-[#fbbf24] uppercase tracking-wider font-bold">
          {currentView === 'studio' ? 'Mode Studio' : 'Bento Grid'}
        </span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-5 shrink-0">
        {/* Active Project Pill if on other view */}
        {activeProject && currentView !== 'studio' && (
          <button
            type="button"
            onClick={() => onSelectProject(activeProject)}
            className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded bg-[#1a1c22] border border-[#fbbf24]/30 text-xs text-[#fbbf24] hover:bg-[#20232b] transition-all cursor-pointer"
            title="Ouvrir le projet actif dans le studio"
          >
            <Film className="w-3.5 h-3.5" />
            <span className="font-semibold max-w-[140px] truncate">{activeProject.title}</span>
            <span className="text-[10px] bg-[#fbbf24]/20 px-1 py-0.2 rounded font-mono font-bold">
              {activeProject.progress}%
            </span>
          </button>
        )}

        {/* Search input with required ID */}
        <label className="relative hidden lg:flex items-center">
          <Search className="w-3.5 h-3.5 text-[#63666d] absolute left-3 pointer-events-none" />
          <input
            id="projectSearch"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Rechercher..."
            className="w-44 xl:w-56 pl-8 pr-3 py-1.5 rounded-lg bg-[#14161c] border border-[#1f2128] text-xs text-white placeholder-[#63666d] focus:outline-none focus:border-[#fbbf24]/60 transition-all"
          />
        </label>

        {/* Local Engine Status Badge */}
        <div className="hidden sm:flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-[11px] text-[#63666d] uppercase tracking-widest font-mono">
            Moteur Local: Actif
          </span>
        </div>

        {/* Primary New Project Action */}
        <button
          id="newProject"
          type="button"
          onClick={onOpenNewProject}
          className="bg-[#fbbf24] text-black text-xs font-bold px-3.5 py-1.5 rounded uppercase tracking-tighter hover:bg-[#fcd34d] flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm shadow-[#fbbf24]/10"
        >
          <Plus className="w-4 h-4" />
          <span>Nouveau Projet</span>
        </button>
      </div>
    </header>
  );
};
