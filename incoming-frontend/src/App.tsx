import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { HomeView } from './components/HomeView';
import { StudioView } from './components/StudioView';
import { VoiceStudioView } from './components/VoiceStudioView';
import { RuntimeView } from './components/RuntimeView';
import { NewProjectModal } from './components/NewProjectModal';
import { Toast, type ToastMessage } from './components/Toast';
import type {
  Project,
  RuntimeStatus,
  VoicesResponse,
  ExportPresetsResponse,
  TasksResponse,
  PipelineTask
} from './types';
import {
  fetchRuntime,
  fetchVoices,
  fetchPresets,
  fetchProjects,
  createProject,
  fetchProject,
  updateProject,
  fetchTasks,
  startPipelineTask,
  uploadSourceFile,
  uploadSourceUrl,
  saveSegmentText,
  generateSegmentTts,
  solveTimeline,
  cleanupProjectCache,
  importScriptJson
} from './api';

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'studio' | 'voices' | 'runtime'>('home');
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [voices, setVoices] = useState<VoicesResponse | null>(null);
  const [presets, setPresets] = useState<ExportPresetsResponse | null>(null);
  const [tasks, setTasks] = useState<TasksResponse>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const taskTimerRef = useRef<any>(null);

  const showToast = useCallback((message: string, isError = false) => {
    setToast({ id: String(Date.now()), message, isError });
  }, []);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  // Initial load
  const loadInitialData = useCallback(async () => {
    try {
      const [rt, vc, pr, projList] = await Promise.all([
        fetchRuntime().catch(() => null),
        fetchVoices().catch(() => null),
        fetchPresets().catch(() => null),
        fetchProjects().catch(() => [])
      ]);

      if (rt) setRuntime(rt);
      if (vc) setVoices(vc);
      if (pr) setPresets(pr);
      if (projList) {
        setProjects(projList);
        // Default to first active project if available
        if (projList.length > 0) {
          setCurrentProject(projList[0]);
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Erreur lors du chargement des données initiales', true);
    }
  }, [showToast]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Task poller
  const refreshTasks = useCallback(async (projectId: string) => {
    try {
      const taskData = await fetchTasks(projectId);
      setTasks(taskData);

      const hasActive = Object.values(taskData).some(
        (t) => t.state === 'queued' || t.state === 'running'
      );

      if (!hasActive && taskTimerRef.current) {
        clearInterval(taskTimerRef.current);
        taskTimerRef.current = null;
        // Reload project state to get updated segments/status
        const updatedProj = await fetchProject(projectId);
        setCurrentProject(updatedProj);
        setProjects((prev) => prev.map((p) => (p.id === updatedProj.id ? updatedProj : p)));
      }
    } catch (err) {
      console.error('Task poll error', err);
    }
  }, []);

  const startTaskPolling = useCallback(
    (projectId: string) => {
      if (taskTimerRef.current) clearInterval(taskTimerRef.current);
      refreshTasks(projectId);
      taskTimerRef.current = setInterval(() => {
        refreshTasks(projectId);
      }, 1500);
    },
    [refreshTasks]
  );

  useEffect(() => {
    return () => {
      if (taskTimerRef.current) clearInterval(taskTimerRef.current);
    };
  }, []);

  // Select project
  const handleSelectProject = (proj: Project | null) => {
    setCurrentProject(proj);
    if (proj) {
      setCurrentView('studio');
      refreshTasks(proj.id);
    }
  };

  // Create project
  const handleCreateProject = async (title: string, language: string, voiceId: string, engine: 'qwen' | 'omnivoice') => {
    try {
      const newProj = await createProject(title, language, voiceId, engine);
      setProjects((prev) => [newProj, ...prev]);
      setCurrentProject(newProj);
      setCurrentView('studio');
      showToast(`Projet "${newProj.title}" initialisé`);
    } catch (err: any) {
      showToast(err.message || 'Impossible de créer le projet', true);
    }
  };

  // Upload video file
  const handleUploadSourceFile = async (file: File) => {
    if (!currentProject) return;
    try {
      showToast('Téléversement du fichier source en cours...');
      const updated = await uploadSourceFile(currentProject.id, file);
      setCurrentProject(updated);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      showToast('Fichier vidéo importé avec succès');
    } catch (err: any) {
      showToast(err.message || 'Erreur lors du téléversement du fichier', true);
    }
  };

  // Import video url
  const handleImportSourceUrl = async (url: string) => {
    if (!currentProject) return;
    try {
      showToast('Téléchargement du flux distant (yt-dlp)...');
      const updated = await uploadSourceUrl(currentProject.id, url);
      setCurrentProject(updated);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      showToast('Vidéo importée et convertie en local');
    } catch (err: any) {
      showToast(err.message || 'Erreur lors de l’importation de l’URL', true);
    }
  };

  // Segment script update
  const handleSaveSegment = async (segmentId: string, text: string) => {
    if (!currentProject) return;
    try {
      const updatedSegment = await saveSegmentText(currentProject.id, segmentId, text);
      const updated = {...currentProject, segments: currentProject.segments.map((s) => s.id === updatedSegment.id ? updatedSegment : s)};
      setCurrentProject(updated);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      showToast(`Segment #${segmentId} enregistré`);
    } catch (err: any) {
      showToast(err.message || 'Erreur lors de l’enregistrement du segment', true);
    }
  };

  // Single TTS generate
  const handleGenerateSegmentTts = async (segmentId: string) => {
    if (!currentProject) return;
    try {
      showToast(`Génération vocale du segment #${segmentId}...`);
      const updatedSegment = await generateSegmentTts(currentProject.id, segmentId);
      const updated = {...currentProject, status: 'tts' as const, progress: Math.max(68, currentProject.progress || 0), segments: currentProject.segments.map((s) => s.id === updatedSegment.id ? updatedSegment : s)};
      setCurrentProject(updated);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      showToast(`Audio du segment #${segmentId} synthétisé`);
    } catch (err: any) {
      showToast(err.message || 'Erreur lors de la synthèse vocale', true);
    }
  };

  // Pipeline actions
  const handleAnalyzeVideo = async () => {
    if (!currentProject) return;
    try {
      await startPipelineTask(currentProject.id, 'analyze');
      showToast('Analyse vidéo & transcription Faster-Whisper lancée');
      startTaskPolling(currentProject.id);
    } catch (err: any) {
      showToast(err.message || 'Erreur au démarrage de l’analyse', true);
    }
  };

  const handleGenerateAllTts = async () => {
    if (!currentProject) return;
    try {
      await startPipelineTask(currentProject.id, 'tts');
      showToast(`Génération du lot ${currentProject.tts_engine === 'omnivoice' ? 'OmniVoice HQ' : 'Qwen3-TTS'} lancée`);
      startTaskPolling(currentProject.id);
    } catch (err: any) {
      showToast(err.message || 'Erreur au démarrage de la synthèse', true);
    }
  };

  const handleSolveTimeline = async () => {
    if (!currentProject) return;
    try {
      showToast('Résolution et ajustement de synchronisation...');
      const updated = await solveTimeline(currentProject.id);
      setCurrentProject(updated);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      showToast('Timeline ajustée et synchronisée');
    } catch (err: any) {
      showToast(err.message || 'Erreur lors de la synchronisation', true);
    }
  };

  const handleExportVideo = async (presetId: string) => {
    if (!currentProject) return;
    try {
      await startPipelineTask(currentProject.id, 'export', { preset: presetId });
      showToast('Multiplexage vidéo et export final lancé');
      startTaskPolling(currentProject.id);
    } catch (err: any) {
      showToast(err.message || 'Erreur au démarrage de l’export', true);
    }
  };

  const handleCleanupCache = async () => {
    if (!currentProject) return;
    try {
      const res = await cleanupProjectCache(currentProject.id);
      showToast(res.message || 'Caches nettoyés');
      const updated = await fetchProject(currentProject.id);
      setCurrentProject(updated);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err: any) {
      showToast(err.message || 'Erreur lors du nettoyage du cache', true);
    }
  };

  // Script pack download
  const handleDownloadScriptPack = () => {
    if (!currentProject) return;
    window.location.href = `/api/projects/${currentProject.id}/script-pack`;
    showToast('Pack JSON téléchargé pour ChatGPT');
  };

  // Import script file
  const handleImportScriptFile = async (file: File) => {
    if (!currentProject) return;
    try {
      const updated = await importScriptJson(currentProject.id, JSON.parse(await file.text()));
      setCurrentProject(updated);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      showToast('Script JSON importé avec succès');
    } catch (err: any) {
      showToast(err.message || 'Erreur lors de l’importation du fichier script', true);
    }
  };

  // Change voice
  const handleChangeVoice = async (voiceId: string, engine?: 'qwen' | 'omnivoice') => {
    if (!currentProject) return;
    try {
      const updated = await updateProject(currentProject.id, { voice_id: voiceId, tts_engine: engine || currentProject.tts_engine || 'qwen' });
      setCurrentProject(updated);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      showToast('Voix assignée au projet');
    } catch (err: any) {
      showToast(err.message || 'Erreur lors du changement de voix', true);
    }
  };

  const handleChangeEngine = async (engine: 'qwen' | 'omnivoice') => {
    if (!currentProject || !voices) return;
    const compatible = voices.voices.filter((voice) => (voice.engines || ['qwen']).includes(engine));
    const voiceId = compatible.some((voice) => voice.id === currentProject.voice_id)
      ? currentProject.voice_id
      : compatible[0]?.id;
    if (!voiceId) {
      showToast('Aucune voix compatible avec ce moteur', true);
      return;
    }
    await handleChangeVoice(voiceId, engine);
  };

  const handleRefreshRuntime = async () => {
    try {
      const rt = await fetchRuntime();
      setRuntime(rt);
      showToast('Diagnostic matériel actualisé');
    } catch (err: any) {
      showToast(err.message || 'Erreur lors de l’actualisation du runtime', true);
    }
  };

  const runningTask = (Object.values(tasks || {}) as PipelineTask[]).find(
    (t) => t.state === 'running' || t.state === 'queued'
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0a0b0d] text-[#e0e0e0] font-sans antialiased selection:bg-[#fbbf24]/30 selection:text-[#fbbf24]">
      {/* Studio Bento Navigation Sidebar */}
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        runtime={runtime}
        onRefreshRuntime={handleRefreshRuntime}
        hasActiveProject={!!currentProject}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Global Studio Topbar */}
        <Topbar
          currentView={currentView}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenNewProject={() => setIsNewProjectOpen(true)}
          activeProject={currentProject}
          onSelectProject={handleSelectProject}
        />

        {/* Scrollable Router Views */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 max-w-[1920px] w-full mx-auto">
          {currentView === 'home' && (
            <HomeView
              projects={projects}
              runtime={runtime}
              searchQuery={searchQuery}
              onOpenProject={handleSelectProject}
              onNewProject={() => setIsNewProjectOpen(true)}
              onOpenStudio={() => setCurrentView('studio')}
            />
          )}

          {currentView === 'studio' && (
            <StudioView
              project={currentProject}
              tasks={tasks}
              voicesData={voices}
              presetsData={presets}
              onOpenHome={() => setCurrentView('home')}
              onUploadFile={handleUploadSourceFile}
              onImportUrl={handleImportSourceUrl}
              onSaveSegment={handleSaveSegment}
              onGenerateSegmentTts={handleGenerateSegmentTts}
              onGenerateAllTts={handleGenerateAllTts}
              onAnalyzeVideo={handleAnalyzeVideo}
              onSolveTimeline={handleSolveTimeline}
              onExportVideo={handleExportVideo}
              onCleanupCache={handleCleanupCache}
              onDownloadScriptPack={handleDownloadScriptPack}
              onImportScriptFile={handleImportScriptFile}
              onChangeVoice={handleChangeVoice}
              onChangeEngine={handleChangeEngine}
            />
          )}

          {currentView === 'voices' && (
            <VoiceStudioView
              voicesData={voices}
              activeProject={currentProject}
              onSelectVoice={handleChangeVoice}
            />
          )}

          {currentView === 'runtime' && (
            <RuntimeView runtime={runtime} onRefresh={handleRefreshRuntime} />
          )}
        </main>

        {/* Bento Studio Telemetry Footer */}
        <footer className="h-9 bg-[#0d0f14] border-t border-[#1f2128] flex items-center px-6 justify-between text-[10px] uppercase tracking-widest text-[#63666d] shrink-0 font-mono select-none">
          <div className="flex gap-6">
            <span>CPU: 28%</span>
            <span>RAM: 3.2 GB</span>
            <span className="text-[#fbbf24]">GPU: RTX 4080 (32%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${runningTask ? 'bg-[#fbbf24] animate-pulse' : 'bg-green-500'}`} />
            <span className="truncate max-w-sm">
              {runningTask
                ? `Tâche en cours: ${runningTask.message || runningTask.kind} (${runningTask.progress}%)`
                : 'Moteurs Locaux : Opérationnels'}
            </span>
          </div>
        </footer>
      </div>

      {/* New Project Dialog Modal */}
      <NewProjectModal
        isOpen={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        onSubmit={handleCreateProject}
        voicesData={voices}
      />

      {/* Floating Notification Toast */}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
