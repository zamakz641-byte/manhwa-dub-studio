import React, { useState, useMemo } from 'react';
import {
  Upload,
  Link as LinkIcon,
  Play,
  RotateCcw,
  Volume2,
  Save,
  Wand2,
  CheckCircle,
  AlertTriangle,
  FileDown,
  FileUp,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
  ArrowRight,
  Film,
  Mic,
  Cpu,
  Layers
} from 'lucide-react';
import type {
  Project,
  Segment,
  PipelineTask,
  VoicesResponse,
  ExportPresetsResponse
} from '../types';
import {
  formatTime,
  formatPreciseTime,
  formatEta,
  labelStatus,
  stageIndex
} from '../api';
import { VideoPlayerPanel } from './VideoPlayerPanel';

interface StudioViewProps {
  project: Project | null;
  tasks: Record<string, PipelineTask>;
  voicesData: VoicesResponse | null;
  presetsData: ExportPresetsResponse | null;
  onOpenHome: () => void;
  onUploadFile: (file: File) => Promise<void>;
  onImportUrl: (url: string) => Promise<void>;
  onSaveSegment: (segmentId: string, text: string) => Promise<void>;
  onGenerateSegmentTts: (segmentId: string) => Promise<void>;
  onGenerateAllTts: () => Promise<void>;
  onAnalyzeVideo: () => Promise<void>;
  onSolveTimeline: () => Promise<void>;
  onExportVideo: (presetId: string) => Promise<void>;
  onCleanupCache: () => Promise<void>;
  onDownloadScriptPack: () => void;
  onImportScriptFile: (file: File) => Promise<void>;
  onChangeVoice: (voiceId: string) => Promise<void>;
  onChangeEngine: (engine: 'qwen' | 'omnivoice') => Promise<void>;
}

export const StudioView: React.FC<StudioViewProps> = ({
  project,
  tasks,
  voicesData,
  presetsData,
  onOpenHome,
  onUploadFile,
  onImportUrl,
  onSaveSegment,
  onGenerateSegmentTts,
  onGenerateAllTts,
  onAnalyzeVideo,
  onSolveTimeline,
  onExportVideo,
  onCleanupCache,
  onDownloadScriptPack,
  onImportScriptFile,
  onChangeVoice,
  onChangeEngine
}) => {
  const [segmentQuery, setSegmentQuery] = useState('');
  const [segmentPage, setSegmentPage] = useState(0);
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  const [selectedPreset, setSelectedPreset] = useState('youtube_1080p');
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [isUrlImporting, setIsUrlImporting] = useState(false);
  const [editingTexts, setEditingTexts] = useState<Record<string, string>>({});
  const [generatingSegmentId, setGeneratingSegmentId] = useState<string | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  const PAGE_SIZE = 15;

  // Next step calculation
  const nextStep = useMemo(() => {
    if (!project) return { title: 'Aucun projet', copy: 'Ouvrez un projet', action: 'Accueil', run: onOpenHome };
    if (!project.source) {
      return {
        title: 'Importer la vidéo',
        copy: 'Glissez un fichier MP4 ou collez une URL YouTube pour lancer la chaîne.',
        action: 'Importer source',
        run: () => {
          const el = document.getElementById('dropzone');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }
      };
    }
    if (project.status === 'imported') {
      return {
        title: 'Analyser & Segmenter',
        copy: 'Extraction audio, Faster-Whisper ASR et découpage visuel automatique.',
        action: 'Lancer l’analyse',
        run: onAnalyzeVideo
      };
    }
    if (project.status === 'analyzed') {
      return {
        title: 'Réécrire le script',
        copy: 'Exportez le pack JSON pour ChatGPT ou rédigez la narration dans la timeline.',
        action: 'Exporter Script Pack',
        run: onDownloadScriptPack
      };
    }
    if (project.status === 'script_ready') {
      return {
        title: 'Générer les voix Qwen/Omni',
        copy: 'Inférence neurale accélérée sur GPU avec synchronisation temporelle.',
        action: 'Générer tout le lot',
        run: onGenerateAllTts
      };
    }
    if (project.status === 'tts') {
      return {
        title: 'Synchroniser la timeline',
        copy: 'Ajustez les segments trop longs ou lancez le solveur automatique.',
        action: 'Résoudre la timeline',
        run: onSolveTimeline
      };
    }
    if (project.status === 'review') {
      return {
        title: 'Mastering & Export MP4',
        copy: 'La timeline est calée. Lancez le multiplexage final avec le preset sélectionné.',
        action: 'Exporter MP4 final',
        run: () => onExportVideo(selectedPreset)
      };
    }
    return {
      title: 'Doublage terminé',
      copy: 'Le master vidéo est finalisé dans le dossier export du projet.',
      action: 'Nettoyer le cache',
      run: onCleanupCache
    };
  }, [project, selectedPreset, onOpenHome, onAnalyzeVideo, onDownloadScriptPack, onGenerateAllTts, onSolveTimeline, onExportVideo, onCleanupCache]);

  // Stage progress calculations
  const stages = ['Import', 'Analyse', 'Script', 'Voix', 'Génération', 'Synchronisation', 'Export'];
  const currentStageIdx = project ? stageIndex(project.status) : 0;

  // Active tasks
  const taskRows = (Object.values(tasks || {}) as PipelineTask[]);
  const activeTasks = taskRows.filter((t) => t.state === 'queued' || t.state === 'running');

  // Filtered segments
  const filteredSegments = useMemo(() => {
    if (!project?.segments) return [];
    if (!segmentQuery.trim()) return project.segments;
    const q = segmentQuery.toLowerCase();
    return project.segments.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        (s.rewritten_text && s.rewritten_text.toLowerCase().includes(q)) ||
        (s.transcript && s.transcript.toLowerCase().includes(q))
    );
  }, [project?.segments, segmentQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredSegments.length / PAGE_SIZE));
  const currentPage = Math.min(segmentPage, totalPages - 1);
  const visibleSegments = filteredSegments.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  // Sync warnings count
  const warningCount =
    project?.segments?.filter(
      (s) => s.sync && !['ideal', 'tolerable'].includes(s.sync.status)
    ).length || 0;

  // Currently focused segment (defaults to first segment if none explicitly selected)
  const activeSegForEditor = selectedSegment || (project?.segments && project.segments[0]) || null;
  const activeSegText = activeSegForEditor
    ? editingTexts[activeSegForEditor.id] !== undefined
      ? editingTexts[activeSegForEditor.id]
      : activeSegForEditor.rewritten_text || ''
    : '';
  const activeSegWords = activeSegText.trim().split(/\s+/).filter(Boolean).length;
  const activeSegBudget = activeSegForEditor
    ? activeSegForEditor.script_word_budget || Math.max(1, Math.floor(Number(activeSegForEditor.original_duration) * 2.2))
    : 60;
  const activeSegRatio = Math.min(100, Math.round((activeSegWords / activeSegBudget) * 100));

  // Play audio helper
  const handlePlayAudio = (segmentId: string) => {
    if (!project) return;
    setPlayingAudioId(segmentId);
    const audio = new Audio(`/api/projects/${project.id}/audio/${segmentId}?t=${Date.now()}`);
    audio.onended = () => setPlayingAudioId(null);
    audio.onerror = () => setPlayingAudioId(null);
    audio.play().catch(() => setPlayingAudioId(null));
  };

  // If no project loaded, render empty state with required DOM ID
  if (!project) {
    return (
      <section id="studioView" className="space-y-4">
        <div
          id="emptyStudio"
          className="bento-card p-12 text-center space-y-4 max-w-lg mx-auto shadow-2xl mt-12"
        >
          <div className="w-14 h-14 rounded-lg bg-[#fbbf24]/10 border border-[#fbbf24]/20 text-[#fbbf24] flex items-center justify-center mx-auto text-xl font-black">
            MD
          </div>
          <h2 className="text-lg font-bold text-white">Aucun projet ouvert dans le studio</h2>
          <p className="text-xs text-[#63666d] leading-relaxed">
            Pour commencer le doublage, sélectionnez un projet existant dans votre espace de travail ou
            initialisez un nouveau doublage de manhwa.
          </p>
          <button
            type="button"
            onClick={onOpenHome}
            className="px-4 py-2 rounded bg-[#fbbf24] hover:bg-[#fcd34d] text-black text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors"
          >
            Accéder aux projets
          </button>
        </div>

        {/* Hidden elements for DOM ID compliance when no project is loaded */}
        <div id="studioContent" className="hidden" aria-hidden="true">
          <h2 id="projectName">Projet</h2>
          <span id="projectStatus">BROUILLON</span>
          <select id="projectVoice" />
          <select id="projectEngine" />
          <span id="projectLang">AUTO → FR</span>
          <span id="projectDuration">00:00</span>
          <button id="cleanupBtn" />
          <div id="stagebar" />
          <div id="importPanel">
            <label id="dropzone"><input type="file" id="videoFile" /></label>
            <input id="videoUrl" />
            <button id="urlImport" />
          </div>
          <div id="segmentsPanel">
            <button id="downloadPack" />
            <input type="file" id="scriptFile" />
            <button id="generateAllBtn" />
            <button id="solveBtn" />
            <input id="segmentSearch" />
            <button id="prevSegments" />
            <span id="segmentPageLabel">1 / 1</span>
            <button id="nextSegments" />
            <div id="segmentList" />
          </div>
          <strong id="progressLabel">0%</strong>
          <i id="progressBar" />
          <small id="taskSummary">Aucune</small>
          <div id="taskList" />
          <h3 id="nextTitle">Titre</h3>
          <p id="nextCopy">Description</p>
          <button id="nextAction" />
          <select id="exportPreset" />
          <small id="exportPresetInfo" />
          <button id="exportNowBtn" />
          <b id="statSegments">0</b>
          <b id="statDuration">0</b>
          <b id="statWarnings">0</b>
          <b id="statTtsEstimate">0</b>
        </div>
      </section>
    );
  }

  const selectedVoiceObj = voicesData?.voices?.find((v) => v.id === project.voice_id);
  const selectedEngine = project.tts_engine || 'qwen';
  const compatibleVoices = voicesData?.voices?.filter((voice) =>
    (voice.engines || ['qwen']).includes(selectedEngine)
  ) || [];

  return (
    <section id="studioView" className="space-y-4">
      <div id="emptyStudio" className="hidden" aria-hidden="true" />

      {/* Studio Active Workspace */}
      <div id="studioContent" className="space-y-4">
        {/* Project Master Banner Bar (Bento Header) */}
        <div className="bento-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center flex-wrap gap-3 min-w-0">
            <span
              id="projectStatus"
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                project.status === 'done'
                  ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                  : 'bg-[#fbbf24]/10 text-[#fbbf24] border border-[#fbbf24]/30'
              }`}
            >
              ● {labelStatus(project.status)}
            </span>
            <span id="projectLang" className="text-xs font-mono text-[#63666d]">
              {String(project.source_language || 'ko').toUpperCase()} →{' '}
              {String(project.target_language || 'fr').toUpperCase()}
            </span>
            <span className="text-[#1f2128]">|</span>
            <span id="projectDuration" className="text-xs font-mono text-white font-semibold">
              {formatTime(project.duration)}
            </span>
            <h2 id="projectName" className="text-sm font-bold text-white truncate max-w-md">
              {project.title}
            </h2>
          </div>

          {/* Quick Toolbar */}
          <div className="flex items-center flex-wrap gap-2.5 shrink-0">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#0d0f14] border border-[#1f2128] text-xs">
              <Cpu className="w-3.5 h-3.5 text-[#fbbf24]" />
              <label htmlFor="projectEngine" className="text-[#63666d] text-[10px] uppercase font-bold tracking-wider">
                Moteur :
              </label>
              <select
                id="projectEngine"
                value={selectedEngine}
                onChange={(e) => onChangeEngine(e.target.value as 'qwen' | 'omnivoice')}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer text-xs"
              >
                <option value="qwen" className="bg-[#14161c]">Qwen3-TTS</option>
                <option value="omnivoice" className="bg-[#14161c]">OmniVoice HQ</option>
              </select>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#0d0f14] border border-[#1f2128] text-xs">
              <Mic className="w-3.5 h-3.5 text-[#fbbf24]" />
              <label htmlFor="projectVoice" className="text-[#63666d] text-[10px] uppercase font-bold tracking-wider">
                Voix :
              </label>
              <select
                id="projectVoice"
                value={project.voice_id}
                onChange={(e) => onChangeVoice(e.target.value)}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer text-xs"
              >
                {compatibleVoices.map((v) => (
                  <option key={v.id} value={v.id} className="bg-[#14161c] text-white">
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              id="cleanupBtn"
              type="button"
              onClick={onCleanupCache}
              title="Supprimer les caches et fichiers intermédiaires"
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#0d0f14] hover:bg-[#1a1c22] border border-[#1f2128] text-xs text-[#63666d] hover:text-red-400 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Nettoyer</span>
            </button>
          </div>
        </div>

        {/* Visual Pipeline Stagebar Bento Strip */}
        <div
          id="stagebar"
          className="grid grid-cols-7 gap-1.5 p-1.5 rounded-xl bg-[#0d0f14] border border-[#1f2128] overflow-x-auto text-[10px] font-mono select-none"
        >
          {stages.map((stageName, i) => {
            const isPassed = i < currentStageIdx;
            const isCurrent = i === currentStageIdx;
            return (
              <div
                key={stageName}
                className={`py-2 px-2 rounded-lg text-center font-bold tracking-wider flex items-center justify-center gap-1.5 transition-all truncate ${
                  isPassed
                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                    : isCurrent
                    ? 'bg-[#fbbf24] text-black border border-[#fbbf24] font-black'
                    : 'bg-[#14161c] text-[#63666d] border border-[#1f2128]'
                }`}
              >
                {isPassed && <CheckCircle className="w-3 h-3 text-green-400 shrink-0" />}
                {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-black shrink-0" />}
                <span className="truncate uppercase">{stageName}</span>
              </div>
            );
          })}
        </div>

        {/* Source Import Tile (Shown prominently if no source yet) */}
        {!project.source && (
          <div
            id="importPanel"
            className="bento-card p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#1f2128]">
              <div>
                <p className="text-[10px] uppercase font-bold tracking-widest text-[#fbbf24]">
                  BENTO TILE 01 · SOURCE VIDÉO
                </p>
                <h3 className="text-sm font-bold text-white">Importer la vidéo originale</h3>
              </div>
              <span className="text-2xl font-black font-mono text-[#1f2128]">01</span>
            </div>

            {/* Drag & Drop Zone */}
            <label
              id="dropzone"
              className="flex flex-col items-center justify-center p-8 border border-dashed border-[#1f2128] hover:border-[#fbbf24]/60 rounded-xl bg-[#0d0f14] hover:bg-[#14161c] cursor-pointer transition-all space-y-2 group"
            >
              <input
                id="videoFile"
                type="file"
                accept="video/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadFile(file);
                }}
                className="hidden"
              />
              <div className="w-10 h-10 rounded-lg bg-[#fbbf24]/10 border border-[#fbbf24]/20 text-[#fbbf24] flex items-center justify-center group-hover:scale-105 transition-transform">
                <Upload className="w-5 h-5" />
              </div>
              <div className="text-center">
                <strong className="text-xs font-bold text-white block">
                  Déposez une vidéo MP4 / MKV locale ici
                </strong>
                <small className="text-[10px] text-[#63666d] block mt-0.5">
                  Ingestion 100% locale sans compression destructive
                </small>
              </div>
            </label>

            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <LinkIcon className="w-3.5 h-3.5 text-[#63666d] absolute left-3 top-3" />
                <input
                  id="videoUrl"
                  type="url"
                  value={videoUrlInput}
                  onChange={(e) => setVideoUrlInput(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=... ou lien MP4"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#0d0f14] border border-[#1f2128] text-xs text-white placeholder-[#63666d] focus:outline-none focus:border-[#fbbf24]/80"
                />
              </div>
              <button
                id="urlImport"
                type="button"
                disabled={!videoUrlInput.trim() || isUrlImporting}
                onClick={async () => {
                  if (!videoUrlInput.trim()) return;
                  setIsUrlImporting(true);
                  try {
                    await onImportUrl(videoUrlInput.trim());
                    setVideoUrlInput('');
                  } finally {
                    setIsUrlImporting(false);
                  }
                }}
                className="px-4 py-2 rounded-lg bg-[#1a1c22] hover:bg-[#22252e] border border-[#1f2128] text-xs font-bold text-white disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isUrlImporting ? 'Téléchargement...' : 'Importer'}
              </button>
            </div>
          </div>
        )}

        {/* Hidden import panel container if source exists to maintain DOM ID */}
        {project.source && (
          <div id="importPanel" className="hidden" aria-hidden="true">
            <label id="dropzone"><input type="file" id="videoFile" /></label>
            <input id="videoUrl" />
            <button id="urlImport" />
          </div>
        )}

        {/* BENTO GRID WORKSPACE */}
        <div className="grid grid-cols-12 gap-4">
          {/* Bento Tile 1: Cinematic Video Preview (col-span-12 lg:col-span-8) */}
          <div className="col-span-12 lg:col-span-8">
            <VideoPlayerPanel
              project={project}
              selectedSegment={selectedSegment}
              onSelectSegment={setSelectedSegment}
            />
          </div>

          {/* Bento Tile 2: Script Éditeur & ChatGPT Sync (col-span-12 lg:col-span-4) */}
          <div className="col-span-12 lg:col-span-4 bento-card p-4 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xs font-bold uppercase text-[#63666d] tracking-widest">
                  Script Éditeur {activeSegForEditor ? `#${activeSegForEditor.id}` : ''}
                </h3>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onDownloadScriptPack}
                    className="text-[10px] text-[#fbbf24] bg-[#fbbf24]/10 px-2 py-1 rounded border border-[#fbbf24]/20 hover:bg-[#fbbf24]/20 font-bold transition-colors cursor-pointer"
                    title="Télécharger pack pour ChatGPT"
                  >
                    ChatGPT Sync
                  </button>
                </div>
              </div>

              {/* Active Segment Script Card */}
              <div className="bg-[#0d0f14] rounded-lg p-3 border border-[#1f2128] space-y-2">
                <textarea
                  value={activeSegText}
                  onChange={(e) => {
                    if (activeSegForEditor) {
                      setEditingTexts((prev) => ({
                        ...prev,
                        [activeSegForEditor.id]: e.target.value
                      }));
                    }
                  }}
                  placeholder="Narration du segment actif..."
                  className="w-full h-24 bg-transparent text-white text-xs italic leading-relaxed focus:outline-none resize-none"
                />

                {/* Word Budget Bar */}
                <div className="pt-2 border-t border-[#1f2128]">
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="text-[#63666d] uppercase font-bold">Budget Mots</span>
                    <span className={`font-mono font-bold ${activeSegWords > activeSegBudget ? 'text-red-400' : 'text-white'}`}>
                      {activeSegWords} / {activeSegBudget}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[#1f2128] rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        activeSegWords > activeSegBudget ? 'bg-red-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(100, (activeSegWords / (activeSegBudget || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Segment Save / Generate */}
            {activeSegForEditor && (
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => onSaveSegment(activeSegForEditor.id, activeSegText)}
                  className="flex-1 py-1.5 px-3 rounded bg-[#1a1c22] hover:bg-[#242833] border border-[#1f2128] text-xs font-bold text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3 h-3 text-[#63666d]" />
                  <span>Enregistrer #{activeSegForEditor.id}</span>
                </button>
                <button
                  type="button"
                  disabled={generatingSegmentId === activeSegForEditor.id}
                  onClick={async () => {
                    setGeneratingSegmentId(activeSegForEditor.id);
                    try {
                      await onGenerateSegmentTts(activeSegForEditor.id);
                    } finally {
                      setGeneratingSegmentId(null);
                    }
                  }}
                  className="py-1.5 px-3 rounded bg-[#fbbf24] hover:bg-[#fcd34d] text-black text-xs font-black transition-colors cursor-pointer disabled:opacity-50"
                >
                  {generatingSegmentId === activeSegForEditor.id ? (selectedEngine === 'omnivoice' ? 'OmniVoice...' : 'Qwen...') : 'TTS'}
                </button>
              </div>
            )}
          </div>

          {/* Bento Tile 3: Voix & Moteur (col-span-12 lg:col-span-4) */}
          <div className="col-span-12 lg:col-span-4 bento-card p-4 flex flex-col justify-between space-y-3">
            <h3 className="text-xs font-bold uppercase text-[#63666d] tracking-widest">
              Voix & Moteur
            </h3>

            <div className="flex flex-col gap-2">
              {/* Active Voice Card */}
              <div className="flex items-center justify-between p-2.5 bg-[#1a1c22] border border-[#fbbf24] rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-[#fbbf24] flex items-center justify-center text-black font-black text-sm">
                    {selectedVoiceObj?.name?.charAt(0) || 'A'}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">
                      {selectedVoiceObj?.name || 'Narrateur'} ({selectedEngine === 'omnivoice' ? 'OmniVoice HQ' : 'Qwen3-TTS'})
                    </div>
                    <div className="text-[10px] text-[#63666d]">
                      {selectedVoiceObj?.style || 'Narrateur - Grave / Calme'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (selectedVoiceObj) {
                      const audio = new Audio(selectedVoiceObj.sample_url || `/api/voices/${selectedVoiceObj.id}/sample`);
                      audio.play().catch(() => {});
                    }
                  }}
                  className="text-[#fbbf24] hover:text-[#fcd34d] p-1.5 cursor-pointer"
                  title="Écouter l'extrait vocal"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>

              {/* Engine Secondary Card */}
              <div className="flex items-center justify-between p-2.5 bg-[#0d0f14] border border-[#1f2128] rounded-lg opacity-70 hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-[#1f2128] flex items-center justify-center text-white font-bold text-sm">
                    {selectedEngine === 'omnivoice' ? 'O' : 'Q'}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">{selectedEngine === 'omnivoice' ? 'OmniVoice HQ Local' : 'Qwen Local Engine'}</div>
                    <div className="text-[10px] text-[#63666d]">{selectedEngine === 'omnivoice' ? 'Clone vocal français · worker persistant' : 'Génération de masse accélérée'}</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-green-400 font-bold">READY</span>
              </div>
            </div>

            <div className="pt-2 text-[10px] text-[#63666d] flex items-center justify-between font-mono">
              <span>VOIX DU PROJET</span>
              <span className="text-[#fbbf24] font-bold uppercase">{project.voice_id}</span>
            </div>
          </div>

          {/* Bento Tile 4: Next Action & Export Card (col-span-12 lg:col-span-4) */}
          <div className="col-span-12 lg:col-span-4 bento-card p-4 flex flex-col justify-between space-y-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#63666d]">
                PROCHAINE ÉTAPE RECOMMANDÉE
              </span>
              <h3 id="nextTitle" className="text-xs font-bold text-white mt-1">
                {nextStep.title}
              </h3>
              <p id="nextCopy" className="text-[11px] text-[#63666d] leading-relaxed mt-0.5">
                {nextStep.copy}
              </p>
            </div>

            <button
              id="nextAction"
              type="button"
              onClick={nextStep.run}
              className="w-full py-2 px-3 rounded bg-[#1a1c22] hover:bg-[#242833] border border-[#1f2128] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>{nextStep.action}</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#fbbf24]" />
            </button>

            {/* Export Preset Selection */}
            <div className="pt-2 border-t border-[#1f2128] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-[#63666d]">Preset Export</span>
                <button
                  id="exportNowBtn"
                  type="button"
                  onClick={() => onExportVideo(selectedPreset)}
                  className="text-[10px] text-[#fbbf24] hover:underline font-bold uppercase cursor-pointer"
                >
                  Exporter
                </button>
              </div>
              <select
                id="exportPreset"
                value={selectedPreset}
                onChange={(e) => setSelectedPreset(e.target.value)}
                className="w-full p-1.5 rounded bg-[#0d0f14] border border-[#1f2128] text-xs text-white focus:outline-none cursor-pointer"
              >
                {presetsData ? (
                  Object.entries(presetsData).map(([id, p]: [string, any]) => (
                    <option key={id} value={id} className="bg-[#14161c] text-white">
                      {p.name}
                    </option>
                  ))
                ) : (
                  <option value="youtube_1080p">YouTube 1080p (Recommandé)</option>
                )}
              </select>
              <small id="exportPresetInfo" className="block text-[10px] text-[#63666d] truncate">
                {presetsData?.[selectedPreset]?.description || '1080p NVENC · Bitrate 12 Mbps'}
              </small>
            </div>
          </div>

          {/* Bento Tile 5: Big Yellow Batch Action Bento Tile (col-span-12 lg:col-span-4) */}
          <div
            onClick={onGenerateAllTts}
            className="col-span-12 lg:col-span-4 bg-[#fbbf24] rounded-xl flex items-center justify-center p-4 cursor-pointer hover:bg-[#fcd34d] transition-colors shadow-lg shadow-[#fbbf24]/10 select-none"
          >
            <div className="text-center">
              <div className="text-black font-black text-sm uppercase tracking-tighter">
                Générer toute la narration ({selectedEngine === 'omnivoice' ? 'OmniVoice' : 'Qwen'})
              </div>
              <div className="text-black/70 text-[10px] uppercase font-bold tracking-widest mt-0.5">
                {project.segments?.length || 0} segments · {selectedEngine === 'omnivoice' ? '≈ 8 min / heure sur Naturelle FR' : '≈ 31 min / heure mesurées'}
              </div>
            </div>
          </div>

          {/* Bento Tile 6: Timeline des Segments Table & List (col-span-12) */}
          <div
            id="segmentsPanel"
            className="col-span-12 bento-card flex flex-col overflow-hidden"
          >
            {/* Timeline Header Bar */}
            <div className="px-4 py-3 bg-[#1a1c22] border-b border-[#1f2128] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-bold uppercase text-[#63666d] tracking-widest">
                  Timeline des Segments
                </h3>
                <div className="flex gap-3 text-[10px] font-mono">
                  <span className="text-green-400 font-bold">● Sync OK</span>
                  {warningCount > 0 && (
                    <span className="text-red-400 font-bold">⚠️ {warningCount} Dépassement(s)</span>
                  )}
                </div>
              </div>

              {/* Action Buttons & Search */}
              <div className="flex items-center flex-wrap gap-2">
                <button
                  id="downloadPack"
                  type="button"
                  onClick={onDownloadScriptPack}
                  className="px-2.5 py-1 rounded bg-[#14161c] hover:bg-[#20232b] border border-[#1f2128] text-[11px] font-semibold text-white transition-colors cursor-pointer"
                >
                  Pack Script
                </button>

                <label className="px-2.5 py-1 rounded bg-[#14161c] hover:bg-[#20232b] border border-[#1f2128] text-[11px] font-semibold text-white transition-colors cursor-pointer">
                  <span>Importer JSON</span>
                  <input
                    id="scriptFile"
                    type="file"
                    accept="application/json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onImportScriptFile(file);
                    }}
                    className="hidden"
                  />
                </label>

                <button
                  id="generateAllBtn"
                  type="button"
                  onClick={onGenerateAllTts}
                  className="px-2.5 py-1 rounded bg-[#fbbf24]/10 hover:bg-[#fbbf24]/20 border border-[#fbbf24]/30 text-[11px] font-bold text-[#fbbf24] transition-colors cursor-pointer"
                >
                  Tout générer
                </button>

                <button
                  id="solveBtn"
                  type="button"
                  onClick={onSolveTimeline}
                  className="px-2.5 py-1 rounded bg-[#fbbf24] hover:bg-[#fcd34d] text-[11px] font-black text-black transition-colors cursor-pointer"
                >
                  Résoudre Timeline
                </button>
              </div>
            </div>

            {/* Filter and Pagination sub-bar */}
            <div className="px-4 py-2 bg-[#0d0f14] border-b border-[#1f2128] flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-3 h-3 text-[#63666d] absolute left-2.5 top-2" />
                <input
                  id="segmentSearch"
                  type="text"
                  value={segmentQuery}
                  onChange={(e) => {
                    setSegmentQuery(e.target.value);
                    setSegmentPage(0);
                  }}
                  placeholder="Filtrer segments..."
                  className="w-full pl-7 pr-2 py-1 rounded bg-[#14161c] border border-[#1f2128] text-xs text-white placeholder-[#63666d] focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 text-xs font-mono text-[#63666d]">
                <button
                  id="prevSegments"
                  type="button"
                  disabled={currentPage === 0}
                  onClick={() => setSegmentPage(Math.max(0, currentPage - 1))}
                  className="p-1 rounded hover:bg-[#14161c] text-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span id="segmentPageLabel" className="font-bold text-white px-1">
                  {currentPage + 1} / {totalPages}
                </span>
                <button
                  id="nextSegments"
                  type="button"
                  disabled={currentPage >= totalPages - 1}
                  onClick={() => setSegmentPage(currentPage + 1)}
                  className="p-1 rounded hover:bg-[#14161c] text-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Segment List Items Container with required ID */}
            <div id="segmentList" className="divide-y divide-[#1f2128]">
              {visibleSegments.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#63666d]">
                  Aucun segment ne correspond aux filtres.
                </div>
              ) : (
                visibleSegments.map((seg) => {
                  const isSelected = selectedSegment?.id === seg.id;
                  const currentText =
                    editingTexts[seg.id] !== undefined ? editingTexts[seg.id] : seg.rewritten_text || '';
                  const wordCount = currentText.trim().split(/\s+/).filter(Boolean).length;
                  const wordBudget =
                    seg.script_word_budget || Math.max(1, Math.floor(Number(seg.original_duration) * 2.2));
                  const isOverBudget = wordCount > wordBudget;

                  const delta = seg.tts_duration
                    ? Number((seg.tts_duration - seg.original_duration).toFixed(1))
                    : null;
                  const syncStatus = seg.sync?.status || (seg.tts_path ? 'ideal' : 'idle');

                  return (
                    <article
                      key={seg.id}
                      data-id={seg.id}
                      onClick={() => setSelectedSegment(seg)}
                      className={`p-3.5 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#fbbf24]/5 border-l-2 border-[#fbbf24]'
                          : 'hover:bg-[#161820]'
                      }`}
                    >
                      <div className="grid grid-cols-12 gap-3 items-center">
                        {/* Timecode & Frame (3 cols) */}
                        <div className="col-span-12 md:col-span-3 flex items-center gap-3">
                          <div className="w-14 h-9 rounded overflow-hidden bg-black border border-[#1f2128] shrink-0">
                            <img
                              src={`/api/projects/${project.id}/frames/${seg.frame || 'frame_' + seg.id + '.jpg'}`}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <div>
                            <div className="font-mono text-xs text-[#fbbf24] font-bold">
                              #{seg.id} · {formatPreciseTime(seg.video_start)}
                            </div>
                            <div className="text-[10px] font-mono text-[#63666d]">
                              Durée: {Number(seg.original_duration).toFixed(1)}s
                            </div>
                          </div>
                        </div>

                        {/* Editable Script text (5 cols) */}
                        <div className="col-span-12 md:col-span-5 space-y-1">
                          <input
                            type="text"
                            value={currentText}
                            onChange={(e) =>
                              setEditingTexts((prev) => ({
                                ...prev,
                                [seg.id]: e.target.value
                              }))
                            }
                            placeholder="Script en français..."
                            className="w-full bg-[#0d0f14] border border-[#1f2128] rounded px-2.5 py-1 text-xs text-white italic focus:outline-none focus:border-[#fbbf24]/60"
                          />
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className={isOverBudget ? 'budget-over text-red-400 font-bold' : 'budget-ok text-green-400'}>
                              {wordCount}/{wordBudget} mots {isOverBudget && '⚠️'}
                            </span>
                            <span className="text-[#63666d] italic truncate max-w-[150px]">
                              {seg.transcript || ''}
                            </span>
                          </div>
                        </div>

                        {/* Timing bar & Status (2 cols) */}
                        <div className="col-span-6 md:col-span-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-white">
                              {seg.tts_duration ? `${Number(seg.tts_duration).toFixed(1)}s` : '—'}
                            </span>
                            <div className="w-16 h-1 bg-[#1f2128] rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  syncStatus === 'ideal'
                                    ? 'bg-green-500 w-[90%]'
                                    : syncStatus === 'tolerable'
                                    ? 'bg-yellow-500 w-[100%]'
                                    : 'bg-red-500 w-[120%]'
                                }`}
                              />
                            </div>
                          </div>
                          <span
                            className={`sync-badge text-[9px] font-bold font-mono uppercase ${
                              syncStatus === 'ideal'
                                ? 'text-green-500'
                                : syncStatus === 'tolerable'
                                ? 'text-yellow-500'
                                : 'text-red-500'
                            }`}
                          >
                            {syncStatus === 'ideal'
                              ? 'GÉNÉRÉ'
                              : syncStatus === 'tolerable'
                              ? `TOLÉRÉ (${delta}s)`
                              : `DÉPASSEMENT (${delta}s)`}
                          </span>
                        </div>

                        {/* Action buttons (2 cols) */}
                        <div className="col-span-6 md:col-span-2 flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSaveSegment(seg.id, currentText);
                            }}
                            className="p-1 rounded bg-[#14161c] hover:bg-[#1a1c22] border border-[#1f2128] text-[#63666d] hover:text-white"
                            title="Enregistrer"
                          >
                            <Save className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            disabled={generatingSegmentId === seg.id}
                            onClick={async (e) => {
                              e.stopPropagation();
                              setGeneratingSegmentId(seg.id);
                              try {
                                await onGenerateSegmentTts(seg.id);
                              } finally {
                                setGeneratingSegmentId(null);
                              }
                            }}
                            className="px-2 py-1 rounded bg-[#fbbf24] hover:bg-[#fcd34d] text-black text-[10px] font-black cursor-pointer disabled:opacity-50"
                          >
                            {generatingSegmentId === seg.id ? '...' : 'TTS'}
                          </button>

                          {seg.tts_path && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePlayAudio(seg.id);
                              }}
                              className="p-1 rounded bg-[#14161c] hover:bg-[#1a1c22] border border-[#1f2128] text-[#fbbf24] cursor-pointer"
                              title="Écouter"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>

          {/* Bento Tile 7: Tasks & Progress (col-span-12 lg:col-span-6) */}
          <div className="col-span-12 lg:col-span-6 bento-card p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#1f2128]">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#63666d]">
                TÂCHES EN COURS & PROGRESSION
              </span>
              <strong id="progressLabel" className="text-xs font-mono font-bold text-[#fbbf24]">
                {project.progress}%
              </strong>
            </div>

            <div className="h-1.5 w-full bg-[#1f2128] rounded-full overflow-hidden">
              <i
                id="progressBar"
                className="block h-full bg-[#fbbf24] rounded-full transition-all duration-500"
                style={{ width: `${project.progress}%` }}
              />
            </div>

            <div className="flex items-center justify-between">
              <small id="taskSummary" className="text-[10px] font-mono text-[#63666d]">
                {activeTasks.length > 0 ? `${activeTasks.length} tâche(s) active(s)` : 'Aucune tâche en file'}
              </small>
            </div>

            <div id="taskList" className="space-y-2 max-h-32 overflow-y-auto">
              {taskRows.length === 0 ? (
                <p className="text-[11px] text-[#63666d]">Les tâches d'arrière-plan s'afficheront ici.</p>
              ) : (
                taskRows.map((t) => (
                  <div
                    key={t.id}
                    className="p-2 rounded bg-[#0d0f14] border border-[#1f2128] text-xs flex items-center justify-between"
                  >
                    <div className="truncate pr-2">
                      <b className="text-white capitalize text-[11px] block">{t.kind}</b>
                      <span className="text-[10px] text-[#63666d] truncate">{t.message}</span>
                    </div>
                    <span className="font-mono text-[10px] text-[#fbbf24] font-bold">
                      {t.progress}% · {formatEta(t.eta_seconds)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Bento Tile 8: Stats Summary Grid (col-span-12 lg:col-span-6) */}
          <div className="col-span-12 lg:col-span-6 bento-card p-4 space-y-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#63666d] block pb-2 border-b border-[#1f2128]">
              STATISTIQUES DU MASTER
            </span>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded bg-[#0d0f14] border border-[#1f2128]">
                <span className="text-[10px] text-[#63666d] block uppercase">Segments</span>
                <b id="statSegments" className="font-mono text-base text-white font-bold">
                  {project.segments?.length || 0}
                </b>
              </div>
              <div className="p-2.5 rounded bg-[#0d0f14] border border-[#1f2128]">
                <span className="text-[10px] text-[#63666d] block uppercase">Durée Master</span>
                <b id="statDuration" className="font-mono text-base text-white font-bold">
                  {project.duration ? formatTime(project.duration) : '—'}
                </b>
              </div>
              <div className="p-2.5 rounded bg-[#0d0f14] border border-[#1f2128]">
                <span className="text-[10px] text-[#63666d] block uppercase">Alertes Synchro</span>
                <b
                  id="statWarnings"
                  className={`font-mono text-base font-bold ${
                    warningCount > 0 ? 'text-red-400' : 'text-green-400'
                  }`}
                >
                  {warningCount}
                </b>
              </div>
              <div className="p-2.5 rounded bg-[#0d0f14] border border-[#1f2128]">
                <span id="statTtsLabel" className="text-[10px] text-[#63666d] block uppercase">Temps {selectedEngine === 'omnivoice' ? 'OmniVoice' : 'Qwen'} / 1h</span>
                <b id="statTtsEstimate" className="font-mono text-base text-[#fbbf24] font-bold">
                  ≈ {project.tts_benchmark?.engine_id === selectedEngine
                    ? project.tts_benchmark.estimated_minutes_for_one_hour
                    : selectedEngine === 'omnivoice' ? 8 : 31.2} min
                </b>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
