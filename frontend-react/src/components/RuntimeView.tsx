import React from 'react';
import { Cpu, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import type { RuntimeStatus } from '../types';

interface RuntimeViewProps {
  runtime: RuntimeStatus | null;
  onRefresh: () => void;
}

export const RuntimeView: React.FC<RuntimeViewProps> = ({ runtime, onRefresh }) => {
  const modules = runtime
    ? [
        {
          key: 'ffmpeg',
          title: 'FFmpeg NVENC Hardware',
          category: 'Encodage Vidéo & Multiplexage',
          data: runtime.ffmpeg,
          details: 'Support matériel H.264 / HEVC / ProRes. Accélération CUDA activée sans surchauffe CPU.'
        },
        {
          key: 'ffprobe',
          title: 'FFprobe Stream Analyzer',
          category: 'Extraction Métadonnées',
          data: runtime.ffprobe,
          details: 'Analyse précise des flux vidéo, audio, FPS constant et synchronisation des paquets.'
        },
        {
          key: 'yt_dlp',
          title: 'yt-dlp Video Extractor',
          category: 'Ingestion Web & Stream',
          data: runtime.yt_dlp,
          details: 'Téléchargement direct des recaps en meilleure qualité disponible (1080p60).'
        },
        {
          key: 'asr',
          title: 'Faster-Whisper (Large-v3)',
          category: 'Reconnaissance Vocale (ASR)',
          data: runtime.asr,
          details: 'Moteur CTranslate2 avec quantification FP16 pour une transcription coréenne/anglaise ultra précise.'
        },
        {
          key: 'tts',
          title: 'Qwen3-TTS Neural Engine',
          category: 'Synthèse Vocale & Clonage',
          data: runtime.tts,
          details: 'Modèle de pointe cadencé à 1.93× temps réel. Synthèse expressive sans latence externe.'
        },
        {
          key: 'omni_voice',
          title: 'OmniVoice HQ',
          category: 'Clonage Vocal Local 24kHz',
          data: runtime.omni_voice,
          details: 'Second moteur local utilisant les cinq voix françaises reclonées depuis leurs références Qwen.'
        },
        {
          key: 'supertonic',
          title: 'Supertonic 3 CUDA',
          category: 'Synthèse vocale ultra-rapide 44,1 kHz',
          data: runtime.supertonic,
          details: 'Voix officielles M1/M5, 16 steps, vitesse 1,2. Environ 25,7× temps réel sur RTX 4060.'
        }
      ]
    : [];

  return (
    <section id="runtimeView" className="space-y-4 animate-fade-in">
      {/* Diagnostic Bento Tile */}
      <div className="bento-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1 max-w-xl">
          <div className="flex items-center gap-2 text-[#fbbf24] text-[10px] font-bold tracking-widest uppercase">
            <Cpu className="w-3.5 h-3.5" />
            <span>DIAGNOSTIC SYSTÈME & INFRASTRUCTURE</span>
          </div>
          <h2 className="text-lg font-bold text-white">
            Modèles Locaux & Dépendances Matérielles
          </h2>
          <p className="text-xs text-[#63666d] leading-relaxed">
            Manhwa Dub s'exécute entièrement sur votre machine hôte en exploitant l'accélération matérielle
            CUDA/NVENC. Aucune dépendance externe ni appel cloud n'est requis.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center gap-2 px-3.5 py-2 rounded bg-[#1a1c22] hover:bg-[#22252e] border border-[#1f2128] text-white text-xs font-semibold transition-colors cursor-pointer self-start"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#fbbf24]" />
          <span>Vérifier l'état</span>
        </button>
      </div>

      {/* Modules Bento Grid */}
      <div id="runtimeGrid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((m) => {
          const isReady = m.data?.ready;
          return (
            <div
              key={m.key}
              className="p-4 rounded-xl bg-[#14161c] border border-[#1f2128] flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#63666d]">
                      {m.category}
                    </span>
                    <h3 className="text-xs font-bold text-white mt-0.5">{m.title}</h3>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      isReady
                        ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                        : 'bg-red-500/10 text-red-400 border border-red-500/30'
                    }`}
                  >
                    {isReady ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    <span>{isReady ? 'OPÉRATIONNEL' : 'MANQUANT'}</span>
                  </span>
                </div>

                <p className="text-[11px] text-[#63666d] leading-relaxed">{m.details}</p>
              </div>

              {/* Status details footer */}
              <div className="pt-2 border-t border-[#1f2128] flex items-center justify-between text-[10px] font-mono text-[#63666d]">
                <span>MODÈLE LOCAL</span>
                <span className="text-white font-bold">{m.data?.engine || m.data?.version || 'NVIDIA CUDA'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
