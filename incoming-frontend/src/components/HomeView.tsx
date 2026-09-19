import React, { useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  Film,
  CheckCircle2,
  Zap,
  FileVideo,
  ChevronRight
} from 'lucide-react';
import type { Project, RuntimeStatus } from '../types';
import { formatTime, labelStatus } from '../api';

interface HomeViewProps {
  projects: Project[];
  runtime: RuntimeStatus | null;
  searchQuery: string;
  onOpenProject: (proj: Project) => void;
  onNewProject: () => void;
  onOpenStudio: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  projects,
  runtime,
  searchQuery,
  onOpenProject,
  onNewProject,
  onOpenStudio
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'progress' | 'done'>('all');

  // KPI calculations
  const totalMinutes = Math.round(
    projects.reduce((acc, p) => acc + Number(p.duration || 0), 0) / 60
  );
  const doneCount = projects.filter((p) => p.status === 'done').length;
  const engineRate = String(runtime?.tts?.measured_audio_per_compute || 1.93).replace('.', ',');

  // Diagnostic items
  const runtimeEntries = runtime
    ? [
        { key: 'ffmpeg', name: 'FFmpeg NVENC', module: runtime.ffmpeg, desc: 'Hardware GPU Encoder' },
        { key: 'asr', name: 'Faster-Whisper', module: runtime.asr, desc: 'Large-v3 CUDA Transcription' },
        { key: 'tts', name: 'Qwen3-TTS', module: runtime.tts, desc: 'Neural Voice Synthesis 1.93×' },
        { key: 'omni', name: 'OmniVoice HQ', module: runtime.omni_voice, desc: 'Clonage vocal local 24kHz' },
        { key: 'yt_dlp', name: 'yt-dlp Engine', module: runtime.yt_dlp, desc: 'Video Stream Puller' }
      ]
    : [];

  const readyCount = runtimeEntries.filter((e) => e.module?.ready).length;
  const totalEngines = runtimeEntries.length || 5;

  // Filtered projects
  const filteredProjects = projects.filter((p) => {
    const sourceName = typeof p.source === 'string' ? p.source : p.source?.filename;
    const matchesSearch =
      !searchQuery ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (sourceName && sourceName.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesFilter =
      filterMode === 'all' ||
      (filterMode === 'done' ? p.status === 'done' : p.status !== 'done');

    return matchesSearch && matchesFilter;
  });

  return (
    <section id="homeView" className="space-y-6 animate-fade-in">
      {/* Studio Bento Hero & Local System Health Banner */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Cinematic Studio Hero Bento Tile */}
        <div className="lg:col-span-2 bento-card p-6 md:p-8 flex flex-col justify-between relative overflow-hidden">
          <div className="space-y-2.5 max-w-xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded bg-[#1f2128] border border-[#fbbf24]/30 text-[#fbbf24] text-[10px] font-bold tracking-widest uppercase">
              <Sparkles className="w-3 h-3" />
              <span>Studio de Production Audiovisuelle</span>
            </div>

            <h2 className="text-xl md:text-2xl font-black text-white tracking-tight leading-snug">
              Du raw coréen au doublage français synchronisé.
            </h2>

            <p className="text-xs text-[#63666d] leading-relaxed">
              Pipeline complet sans cloud : extraction Faster-Whisper locale, réécriture de script
              calibrée au mot près, synthèse Qwen3-TTS & OmniVoice, puis mastering vidéo optimisé.
            </p>
          </div>

          <div className="pt-6 flex flex-wrap items-center gap-3 border-t border-[#1f2128] mt-6">
            <button
              id="heroNew"
              type="button"
              onClick={onNewProject}
              className="flex items-center gap-2 px-4 py-2 rounded bg-[#fbbf24] hover:bg-[#fcd34d] text-black font-bold text-xs uppercase tracking-tighter transition-colors cursor-pointer shadow-sm shadow-[#fbbf24]/20"
            >
              <span>Nouveau projet</span>
              <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>

            <button
              type="button"
              onClick={onOpenStudio}
              className="flex items-center gap-2 px-3.5 py-2 rounded bg-[#1a1c22] hover:bg-[#22252e] border border-[#1f2128] text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <span>Ouvrir Studio</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#63666d]" />
            </button>

            <div className="flex items-center gap-3 text-[10px] text-[#63666d] font-mono ml-auto">
              <span className="flex items-center gap-1 text-green-400">
                <CheckCircle2 className="w-3 h-3" /> Whisper FP16
              </span>
              <span className="flex items-center gap-1 text-[#fbbf24]">
                <Zap className="w-3 h-3" /> Qwen CUDA
              </span>
              <span className="flex items-center gap-1 text-white">
                <Film className="w-3 h-3" /> NVENC 60fps
              </span>
            </div>
          </div>
        </div>

        {/* Local Engine Health Bento Tile */}
        <div className="bento-card p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-[#1f2128]">
            <div>
              <p className="text-[10px] font-bold tracking-widest text-[#63666d] uppercase">MOTEURS SYSTÈME</p>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Prêt à produire</h3>
            </div>
            <span
              id="runtimeScore"
              className="px-2 py-0.5 rounded bg-green-500/10 border border-green-500/30 text-green-400 font-mono font-bold text-xs"
            >
              {readyCount}/{totalEngines}
            </span>
          </div>

          <div id="healthList" className="space-y-1.5 py-3 flex-1">
            {runtimeEntries.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between p-2 rounded bg-[#0d0f14] border border-[#1f2128] text-xs"
              >
                <div className="min-w-0 pr-2">
                  <div className="font-semibold text-white truncate text-[11px]">{item.name}</div>
                  <div className="text-[10px] text-[#63666d] truncate">{item.desc}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      item.module?.ready ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <span className="text-[10px] font-mono text-[#63666d]">
                    {item.module?.ready ? 'Prêt' : 'Absent'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 text-[10px] text-[#63666d] border-t border-[#1f2128] flex items-center justify-between font-mono">
            <span>Accélération GPU</span>
            <span className="text-green-400 font-semibold">Active (RTX/CUDA)</span>
          </div>
        </div>
      </div>

      {/* Bento KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#14161c] border border-[#1f2128] space-y-1">
          <span className="text-[10px] font-bold tracking-wider text-[#63666d] uppercase">PROJETS EN COURS</span>
          <b id="kpiProjects" className="text-2xl font-black font-mono text-white block">
            {projects.length}
          </b>
          <small className="text-[10px] text-[#63666d] block">en bibliothèque active</small>
        </div>

        <div className="p-4 rounded-xl bg-[#14161c] border border-[#1f2128] space-y-1">
          <span className="text-[10px] font-bold tracking-wider text-[#63666d] uppercase">CONTENU TOTAL</span>
          <b id="kpiMinutes" className="text-2xl font-black font-mono text-white block">
            {totalMinutes} min
          </b>
          <small className="text-[10px] text-[#63666d] block">durée cumulée importée</small>
        </div>

        <div className="p-4 rounded-xl bg-[#14161c] border border-[#1f2128] space-y-1">
          <span className="text-[10px] font-bold tracking-wider text-[#63666d] uppercase">DOUBLAGES LIVRÉS</span>
          <b id="kpiReady" className="text-2xl font-black font-mono text-green-400 block">
            {doneCount}
          </b>
          <small className="text-[10px] text-[#63666d] block">exports finals terminés</small>
        </div>

        <div className="p-4 rounded-xl bg-[#1a1c22] border border-[#fbbf24]/30 space-y-1">
          <span className="text-[10px] font-bold tracking-wider text-[#fbbf24] uppercase">VITESSE QWEN</span>
          <b id="kpiEngine" className="text-2xl font-black font-mono text-[#fbbf24] block">
            {engineRate}×
          </b>
          <small className="text-[10px] text-[#63666d] block">débit d'inférence audio mesuré</small>
        </div>
      </div>

      {/* Projects Library Header & Filter Chips */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-[#fbbf24] uppercase">BIBLIOTHÈQUE LOCALE</p>
            <h2 className="text-base font-bold text-white">Projets récents</h2>
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#14161c] border border-[#1f2128] self-start">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`chip px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                filterMode === 'all'
                  ? 'active bg-[#1a1c22] text-[#fbbf24] border border-[#fbbf24]/30'
                  : 'text-[#63666d] hover:text-white'
              }`}
            >
              Tous ({projects.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('progress')}
              className={`chip px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                filterMode === 'progress'
                  ? 'active bg-[#1a1c22] text-[#fbbf24] border border-[#fbbf24]/30'
                  : 'text-[#63666d] hover:text-white'
              }`}
            >
              En cours ({projects.filter((p) => p.status !== 'done').length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('done')}
              className={`chip px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                filterMode === 'done'
                  ? 'active bg-[#1a1c22] text-[#fbbf24] border border-[#fbbf24]/30'
                  : 'text-[#63666d] hover:text-white'
              }`}
            >
              Terminés ({doneCount})
            </button>
          </div>
        </div>

        {/* Projects Bento Grid with required ID */}
        <div id="projectGrid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.length === 0 ? (
            <div className="col-span-full p-12 text-center rounded-xl bg-[#14161c] border border-dashed border-[#1f2128] text-[#63666d] space-y-3">
              <Film className="w-8 h-8 mx-auto text-[#63666d]" />
              <p className="text-xs font-semibold text-white">Aucun projet trouvé</p>
              <button
                type="button"
                onClick={onNewProject}
                className="px-3.5 py-1.5 rounded bg-[#fbbf24] hover:bg-[#fcd34d] text-black text-xs font-bold uppercase tracking-tighter"
              >
                Créer un projet
              </button>
            </div>
          ) : (
            filteredProjects.map((proj, idx) => (
              <article
                key={proj.id}
                onClick={() => onOpenProject(proj)}
                className="group relative bento-card hover:border-[#fbbf24]/60 transition-all duration-150 overflow-hidden cursor-pointer flex flex-col justify-between"
              >
                {/* Visual Cover Top */}
                <div className="h-24 bg-[#0d0f14] relative overflow-hidden border-b border-[#1f2128] p-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold tracking-widest text-[#63666d] px-1.5 py-0.5 rounded bg-[#14161c] border border-[#1f2128]">
                      PROJET #{String(idx + 1).padStart(2, '0')}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                        proj.status === 'done'
                          ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                          : 'bg-[#fbbf24]/10 text-[#fbbf24] border border-[#fbbf24]/30'
                      }`}
                    >
                      ● {labelStatus(proj.status)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#63666d] font-mono">
                    <span className="flex items-center gap-1.5 truncate max-w-[180px]">
                      <FileVideo className="w-3.5 h-3.5 text-[#fbbf24]" />
                      <span className="truncate">{proj.source ? (typeof proj.source === 'string' ? proj.source.split(/[\\/]/).pop() : proj.source.filename) : 'Sans source'}</span>
                    </span>
                    <span className="font-bold text-white">{formatTime(proj.duration)}</span>
                  </div>
                </div>

                {/* Project Body */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <h3 className="text-xs font-bold text-white group-hover:text-[#fbbf24] transition-colors line-clamp-1">
                      {proj.title}
                    </h3>
                    <p className="text-[11px] text-[#63666d] mt-0.5 font-mono">
                      {String(proj.source_language || 'ko').toUpperCase()} →{' '}
                      {String(proj.target_language || 'fr').toUpperCase()} · {proj.segments?.length || 0} segments
                    </p>
                  </div>

                  {/* Progress & Meta Footer */}
                  <div className="pt-2 border-t border-[#1f2128] space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#63666d] text-[10px] uppercase font-bold">Progression</span>
                      <b className="font-mono text-[#fbbf24] text-xs">{proj.progress}%</b>
                    </div>
                    <div className="h-1 w-full bg-[#0d0f14] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#fbbf24] rounded-full transition-all duration-500"
                        style={{ width: `${proj.progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
};
