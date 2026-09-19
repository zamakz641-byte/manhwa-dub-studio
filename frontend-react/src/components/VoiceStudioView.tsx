import React, { useState } from 'react';
import { Mic, Play, Pause, Check, Volume2 } from 'lucide-react';
import type { VoicesResponse, Voice, Project, TtsEngine } from '../types';

interface VoiceStudioViewProps {
  voicesData: VoicesResponse | null;
  activeProject: Project | null;
  onSelectVoice: (voiceId: string, engine?: TtsEngine) => Promise<void>;
}

export const VoiceStudioView: React.FC<VoiceStudioViewProps> = ({
  voicesData,
  activeProject,
  onSelectVoice
}) => {
  const [engineFilter, setEngineFilter] = useState<'all' | 'Qwen3-TTS' | 'OmniVoice' | 'Supertonic'>('all');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  const voices = voicesData?.voices || [];

  const filteredVoices = voices.filter((v) => {
    if (engineFilter === 'all') return true;
    const id: TtsEngine = engineFilter === 'Supertonic' ? 'supertonic' : engineFilter === 'OmniVoice' ? 'omnivoice' : 'qwen';
    return (v.engines || ['qwen']).includes(id);
  });

  const handlePlaySample = (voice: Voice) => {
    if (playingVoiceId === voice.id) {
      setPlayingVoiceId(null);
      return;
    }
    setPlayingVoiceId(voice.id);
    const audio = new Audio(voice.sample_url || `/api/voices/${voice.id}/sample`);
    audio.onended = () => setPlayingVoiceId(null);
    audio.onerror = () => setPlayingVoiceId(null);
    audio.play().catch(() => setPlayingVoiceId(null));
  };

  return (
    <section className="space-y-4 animate-fade-in">
      {/* Header Bento Tile */}
      <div className="bento-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1 max-w-xl">
          <div className="flex items-center gap-2 text-[#fbbf24] text-[10px] font-bold tracking-widest uppercase">
            <Mic className="w-3.5 h-3.5" />
            <span>CASTING AUDIOVISUEL & CLONAGE NEURAL</span>
          </div>
          <h2 className="text-lg font-bold text-white">
            Bibliothèque des Voix Françaises
          </h2>
          <p className="text-xs text-[#63666d] leading-relaxed">
            Comparez <strong>Qwen3-TTS</strong> et le clonage français local
            d'<strong>OmniVoice HQ</strong> avec les mêmes voix de référence.
          </p>
        </div>

        {/* Engine filter pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#0d0f14] border border-[#1f2128] self-start">
          <button
            type="button"
            onClick={() => setEngineFilter('all')}
            className={`px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
              engineFilter === 'all'
                ? 'bg-[#1a1c22] text-[#fbbf24] border border-[#fbbf24]/30'
                : 'text-[#63666d] hover:text-white'
            }`}
          >
            Toutes ({voices.length})
          </button>
          <button
            type="button"
            onClick={() => setEngineFilter('Qwen3-TTS')}
            className={`px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
              engineFilter === 'Qwen3-TTS'
                ? 'bg-[#1a1c22] text-[#fbbf24] border border-[#fbbf24]/30'
                : 'text-[#63666d] hover:text-white'
            }`}
          >
            Qwen3-TTS (1.93×)
          </button>
          <button
            type="button"
            onClick={() => setEngineFilter('OmniVoice')}
            className={`px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
              engineFilter === 'OmniVoice'
                ? 'bg-[#1a1c22] text-[#fbbf24] border border-[#fbbf24]/30'
                : 'text-[#63666d] hover:text-white'
            }`}
          >
            OmniVoice HQ
          </button>
          <button
            type="button"
            onClick={() => setEngineFilter('Supertonic')}
            className={`px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
              engineFilter === 'Supertonic'
                ? 'bg-[#1a1c22] text-[#fbbf24] border border-[#fbbf24]/30'
                : 'text-[#63666d] hover:text-white'
            }`}
          >
            Supertonic 3 (25,7×)
          </button>
        </div>
      </div>

      {/* Comparison Engine Bento Badges */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-3.5 rounded-xl bg-[#14161c] border border-[#fbbf24]/30 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#fbbf24] block">
              MOTEUR A : QWEN3-TTS
            </span>
            <div className="text-xs font-bold text-white">Inférence 1.93× temps réel</div>
            <p className="text-[10px] text-[#63666d]">Recommandé pour les longs chapitres et les récaps denses.</p>
          </div>
          <span className="px-2 py-0.5 rounded bg-[#fbbf24]/10 text-[#fbbf24] font-mono text-xs font-bold border border-[#fbbf24]/20">
            1.93× VITESSE
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#14161c] border border-[#1f2128] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-white block">
              MOTEUR B : OMNIVOICE CINEMA
            </span>
            <div className="text-xs font-bold text-white">Clonage local 24kHz</div>
            <p className="text-[10px] text-[#63666d]">Worker persistant, environ 8 min par heure avec Naturelle FR.</p>
          </div>
          <span className="px-2 py-0.5 rounded bg-[#1f2128] text-white font-mono text-xs font-bold border border-[#1f2128]">
            LOCAL 24kHz
          </span>
        </div>
      </div>

      {/* Voices Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredVoices.map((voice) => {
          const isSelected = activeProject?.voice_id === voice.id;
          const isPlaying = playingVoiceId === voice.id;

          return (
            <article
              key={voice.id}
              className={`p-4 rounded-xl bg-[#14161c] border transition-all flex flex-col justify-between space-y-3 ${
                isSelected
                  ? 'border-[#fbbf24] shadow-md shadow-[#fbbf24]/5'
                  : 'border-[#1f2128] hover:border-[#2a2e38]'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#1f2128] text-[#fbbf24] border border-[#fbbf24]/20 uppercase tracking-wider">
                      {(voice.engines || ['qwen']).map((engine) => engine === 'supertonic' ? 'Supertonic' : engine === 'omnivoice' ? 'OmniVoice' : 'Qwen').join(' + ')}
                    </span>
                    <h3 className="text-xs font-bold text-white mt-1.5">{voice.name}</h3>
                  </div>

                  <span className="text-[10px] text-[#63666d] font-mono">
                    {voice.gender} · {voice.style}
                  </span>
                </div>

                <p className="text-[11px] text-[#63666d] leading-relaxed">{voice.description || voice.style || voice.source}</p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1">
                  {voice.tags?.map((tag) => (
                    <span
                      key={tag}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-[#0d0f14] text-[#63666d] border border-[#1f2128]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Sample audio player & Assignment */}
              <div className="pt-3 border-t border-[#1f2128] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handlePlaySample(voice)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                    isPlaying
                      ? 'bg-[#fbbf24] text-black font-bold'
                      : 'bg-[#1a1c22] hover:bg-[#22252e] border border-[#1f2128] text-white'
                  }`}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3 h-3 fill-current" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3 fill-current" />
                      <span>Extrait</span>
                    </>
                  )}
                </button>

                {activeProject && (
                  <button
                    type="button"
                    onClick={() => {
                      const requested = engineFilter === 'Supertonic' ? 'supertonic' : engineFilter === 'OmniVoice' ? 'omnivoice' : engineFilter === 'Qwen3-TTS' ? 'qwen' : undefined;
                      const current = activeProject?.tts_engine || 'qwen';
                      const engine = requested || ((voice.engines || ['qwen']).includes(current) ? current : (voice.engines || ['qwen'])[0]);
                      onSelectVoice(voice.id, engine);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                        : 'bg-[#fbbf24] hover:bg-[#fcd34d] text-black'
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>Voix active</span>
                      </>
                    ) : (
                      <span>Sélectionner</span>
                    )}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
