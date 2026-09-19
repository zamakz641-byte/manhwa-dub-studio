import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  Film
} from 'lucide-react';
import type { Project, Segment } from '../types';
import { formatTime, formatPreciseTime } from '../api';

interface VideoPlayerPanelProps {
  project: Project;
  selectedSegment: Segment | null;
  onSelectSegment: (segment: Segment) => void;
}

export const VideoPlayerPanel: React.FC<VideoPlayerPanelProps> = ({
  project,
  selectedSegment,
  onSelectSegment
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(selectedSegment ? selectedSegment.video_start : 0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const duration = project.duration || 60;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sourceName = typeof project.source === 'string' ? project.source : project.source?.filename || '';
  // Edge WebView can black-screen its GPU surface when some long VP9/AV1 WebM
  // or MKV files are mounted directly. Keep those formats on the safe frame
  // preview; MP4/MOV sources use the real seekable player.
  const canUseNativePlayer = Boolean(project.source && /\.(mp4|m4v|mov)$/i.test(sourceName));

  const togglePlayback = () => {
    const video = videoRef.current;
    if (video) {
      if (video.paused) video.play().catch(() => {});
      else video.pause();
      return;
    }
    setIsPlaying((value) => !value);
  };

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Sync with selected segment
  useEffect(() => {
    if (selectedSegment) {
      setCurrentTime(selectedSegment.video_start);
      setIsPlaying(false);
      if (videoRef.current) {
        videoRef.current.currentTime = selectedSegment.video_start;
        videoRef.current.pause();
      }
    }
  }, [selectedSegment]);

  // Simulated playback ticker
  useEffect(() => {
    let timer: any = null;
    if (isPlaying && !canUseNativePlayer) {
      timer = setInterval(() => {
        setCurrentTime((prev) => {
          const next = prev + 0.1;
          if (next >= duration) {
            setIsPlaying(false);
            return 0;
          }
          return Number(next.toFixed(1));
        });
      }, 100);
    }
    return () => clearInterval(timer);
  }, [isPlaying, duration, canUseNativePlayer]);

  // Render canvas frame preview matching active timecode
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Cinematic Bento Canvas Background
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0a0b0d');
    grad.addColorStop(0.5, '#14161c');
    grad.addColorStop(1, '#0d0f14');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle grid lines
    ctx.strokeStyle = '#1f2128';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Dynamic wave animation for speech
    ctx.fillStyle = 'rgba(251, 191, 36, 0.1)';
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.45, 80 + Math.sin(currentTime * 5) * 8, 0, Math.PI * 2);
    ctx.fill();

    // Graphic panel frame
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(28, 28, w - 56, h - 86);

    // Bento Header Title
    ctx.fillStyle = '#63666d';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`CINEMATIC PREVIEW · 1080p NVENC`, 42, 48);

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`TC ${formatPreciseTime(currentTime)}`, w - 160, 48);

    // Current segment caption if any
    const activeSeg = project.segments?.find(
      (s) => currentTime >= s.video_start && currentTime <= s.video_end
    ) || selectedSegment;

    if (activeSeg) {
      ctx.fillStyle = 'rgba(13, 15, 20, 0.88)';
      ctx.fillRect(40, h - 110, w - 80, 46);
      ctx.strokeStyle = '#1f2128';
      ctx.lineWidth = 1;
      ctx.strokeRect(40, h - 110, w - 80, 46);

      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`SEGMENT #${activeSeg.id} · DUB VF :`, 50, h - 94);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'italic 12px sans-serif';
      const text = activeSeg.rewritten_text || activeSeg.transcript || 'Narration en attente...';
      ctx.fillText(text.slice(0, 75) + (text.length > 75 ? '...' : ''), 50, h - 76);
    }
  }, [currentTime, duration, project.segments, selectedSegment]);

  return (
    <div className="bento-card overflow-hidden flex flex-col relative">
      {/* Top Header */}
      <div className="px-4 py-2.5 border-b border-[#1f2128] flex items-center justify-between bg-[#0d0f14]">
        <div className="flex items-center gap-2">
          <Film className="w-3.5 h-3.5 text-[#fbbf24]" />
          <span className="text-xs font-bold uppercase tracking-wider text-white">
            Cinematic Preview & Synchronisation
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-[#1f2128] text-[#fbbf24] border border-[#fbbf24]/30 font-mono">
            1080p NVENC
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-[#63666d]">
          <span>
            <strong className="text-white">{formatPreciseTime(currentTime)}</strong> / {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Screen / Canvas */}
      <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
        {canUseNativePlayer ? (
          <video
            ref={videoRef}
            src={`/api/projects/${project.id}/source-media`}
            className="w-full h-full object-contain cursor-pointer"
            onClick={togglePlayback}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onEnded={() => setIsPlaying(false)}
            preload="metadata"
          />
        ) : (
          <div className="relative w-full h-full">
            <canvas
              ref={canvasRef}
              width={640}
              height={360}
              className="w-full h-full object-contain cursor-pointer"
              onClick={togglePlayback}
            />
            {selectedSegment?.frame && (
              <img
                src={`/api/projects/${project.id}/frames/${selectedSegment.frame}`}
                alt="Aperçu de la scène"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              />
            )}
            {project.source && !selectedSegment?.frame && (
              <div className="absolute inset-x-0 bottom-5 text-center text-[10px] font-mono text-[#9da3af]">
                Aperçu sécurisé {sourceName.split('.').pop()?.toUpperCase()} · lancez l’analyse pour générer les scènes
              </div>
            )}
          </div>
        )}

        {/* Play button overlay when paused */}
        {!isPlaying && (
          <button
            type="button"
            onClick={togglePlayback}
            className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-[#fbbf24] hover:bg-[#fcd34d] text-black flex items-center justify-center shadow-xl shadow-[#fbbf24]/20 transition-transform hover:scale-110 cursor-pointer"
            aria-label="Lire la vidéo"
          >
            <Play className="w-6 h-6 ml-0.5 fill-black" />
          </button>
        )}
      </div>

      {/* Bento Player Bar */}
      <div className="p-3 bg-[#0d0f14] border-t border-[#1f2128] space-y-2">
        {/* Scrubber */}
        <div className="relative">
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={currentTime}
            onChange={(e) => {
              const value = parseFloat(e.target.value);
              setCurrentTime(value);
              if (videoRef.current) videoRef.current.currentTime = value;
            }}
            className="w-full h-1 bg-[#1f2128] rounded-full appearance-none cursor-pointer accent-[#fbbf24]"
          />

          {/* Segment marks along scrubber */}
          <div className="absolute top-2.5 left-0 right-0 flex pointer-events-none h-1">
            {project.segments?.map((seg) => {
              const leftPct = (seg.video_start / duration) * 100;
              const widthPct = (seg.original_duration / duration) * 100;
              const isCurrent = selectedSegment?.id === seg.id;
              return (
                <div
                  key={seg.id}
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  className={`absolute h-1 rounded-sm ${
                    isCurrent
                      ? 'bg-[#fbbf24] shadow-sm shadow-[#fbbf24]'
                      : seg.tts_path
                      ? 'bg-green-500/60'
                      : 'bg-[#1f2128]'
                  }`}
                  title={`Segment ${seg.id}`}
                />
              );
            })}
          </div>
        </div>

        {/* Transport Controls */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentTime(0)}
              className="p-1.5 rounded bg-[#14161c] hover:bg-[#1a1c22] border border-[#1f2128] text-[#63666d] hover:text-white transition-colors cursor-pointer"
              title="Revenir au début"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={togglePlayback}
              className="px-3 py-1 rounded bg-[#fbbf24] hover:bg-[#fcd34d] text-black font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3 h-3 fill-black" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-black" />
                  <span>Lecture</span>
                </>
              )}
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-2 text-xs text-[#63666d]">
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className="p-1 rounded hover:bg-[#14161c] text-[#63666d] hover:text-white cursor-pointer"
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                setVolume(parseFloat(e.target.value));
                setIsMuted(false);
              }}
              className="w-16 h-1 bg-[#1f2128] rounded-full appearance-none accent-[#fbbf24] cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
