import React, { useState, useEffect } from 'react';
import { X, Sparkles, Wand2 } from 'lucide-react';
import type { TtsEngine, VoicesResponse } from '../types';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, language: string, voiceId: string, engine: TtsEngine) => Promise<void>;
  voicesData: VoicesResponse | null;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  voicesData
}) => {
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('fr');
  const [voiceId, setVoiceId] = useState('');
  const [engine, setEngine] = useState<TtsEngine>('qwen');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (voicesData?.default) {
      setVoiceId(voicesData.default);
    } else if (voicesData?.voices?.[0]?.id) {
      setVoiceId(voicesData.voices[0].id);
    }
  }, [voicesData]);

  const compatibleVoices = voicesData?.voices?.filter((voice) =>
    (voice.engines || ['qwen']).includes(engine)
  ) || [];

  useEffect(() => {
    if (!compatibleVoices.some((voice) => voice.id === voiceId)) {
      setVoiceId(compatibleVoices.find((voice) => voice.id === voicesData?.default)?.id || compatibleVoices[0]?.id || '');
    }
  }, [engine, voicesData, voiceId]);

  if (!isOpen) {
    // Render hidden dialog to maintain DOM ID integrity
    return (
      <dialog id="projectDialog" className="hidden" aria-hidden="true">
        <form id="projectForm">
          <input id="newTitle" type="text" readOnly />
          <select id="newLanguage" readOnly />
          <select id="newEngine" readOnly />
          <select id="newVoice" readOnly />
          <button id="createProject" type="submit" />
        </form>
      </dialog>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit(title.trim(), language, voiceId, engine);
      setTitle('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <dialog
        id="projectDialog"
        open
        className="w-full max-w-lg bg-[#14161c] border border-[#1f2128] text-white rounded-xl shadow-2xl p-0 overflow-hidden relative"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f2128] bg-[#0d0f14]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-[#fbbf24]/10 text-[#fbbf24] border border-[#fbbf24]/20 flex items-center justify-center">
              <Wand2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-widest text-[#fbbf24] leading-none">
                INITIALISATION DE PRODUCTION
              </p>
              <h2 className="text-xs font-bold text-white mt-1">Créer un nouveau projet de doublage</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[#63666d] hover:text-white hover:bg-[#1a1c22] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form id="projectForm" onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="newTitle" className="block text-xs font-semibold text-[#63666d] mb-1.5">
              Titre du projet / Webtoon <span className="text-[#fbbf24]">*</span>
            </label>
            <input
              id="newTitle"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. Solo Leveling — Éveil du Monarque (Ch. 1 à 12)"
              className="w-full px-3.5 py-2 rounded-lg bg-[#0d0f14] border border-[#1f2128] text-xs text-white placeholder-[#63666d] focus:outline-none focus:border-[#fbbf24]/80"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="newLanguage" className="block text-xs font-semibold text-[#63666d] mb-1.5">
                Langue cible
              </label>
              <select
                id="newLanguage"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0d0f14] border border-[#1f2128] text-xs text-white focus:outline-none focus:border-[#fbbf24]/80 cursor-pointer"
              >
                <option value="fr">Français (France)</option>
                <option value="en">Anglais (US/UK)</option>
                <option value="es">Espagnol (Castillan)</option>
                <option value="de">Allemand</option>
                <option value="pt">Portugais</option>
              </select>
            </div>

            <div>
              <label htmlFor="newEngine" className="block text-xs font-semibold text-[#63666d] mb-1.5">
                Moteur vocal
              </label>
              <select
                id="newEngine"
                value={engine}
                onChange={(e) => setEngine(e.target.value as TtsEngine)}
                className="w-full px-3 py-2 rounded-lg bg-[#0d0f14] border border-[#1f2128] text-xs text-white focus:outline-none focus:border-[#fbbf24]/80 cursor-pointer"
              >
                <option value="qwen">Qwen3-TTS</option>
                <option value="omnivoice">OmniVoice HQ</option>
                <option value="supertonic">Supertonic 3 CUDA</option>
              </select>
            </div>

            <div>
              <label htmlFor="newVoice" className="block text-xs font-semibold text-[#63666d] mb-1.5">
                Voix par défaut
              </label>
              <select
                id="newVoice"
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0d0f14] border border-[#1f2128] text-xs text-white focus:outline-none focus:border-[#fbbf24]/80 cursor-pointer"
              >
                {compatibleVoices.map((v) => (
                  <option key={v.id} value={v.id} className="bg-[#14161c] text-white">
                    {v.name}
                  </option>
                )) || (
                  <option value="qwen_narrator_fr">Qwen3 — Alexandre (Narrateur)</option>
                )}
              </select>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[#0d0f14] border border-[#1f2128] text-[11px] text-[#63666d] leading-relaxed">
            <span className="font-semibold text-[#fbbf24]">Workflow local :</span> Vous pourrez ensuite
            importer le fichier vidéo brut (ou une URL), lancer l'ASR Faster-Whisper, adapter les répliques
            avec le pack ChatGPT et synchroniser automatiquement la narration.
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1f2128]">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded bg-[#1a1c22] hover:bg-[#22252e] text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              Annuler
            </button>
            <button
              id="createProject"
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="flex items-center gap-2 px-4 py-1.5 rounded bg-[#fbbf24] hover:bg-[#fcd34d] text-black text-xs font-bold uppercase tracking-tighter disabled:opacity-50 transition-all cursor-pointer shadow-sm shadow-[#fbbf24]/20"
            >
              {isSubmitting ? (
                <span>Création...</span>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 fill-current" />
                  <span>Créer le projet</span>
                </>
              )}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
};
