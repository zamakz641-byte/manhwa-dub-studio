export interface RuntimeModule {
  ready: boolean;
  path?: string;
  version?: string;
  engine?: string;
  model?: string;
  python?: string;
  voice?: string;
  measured_audio_per_compute?: number;
  estimated_minutes_per_hour?: number;
  engines?: Record<string, RuntimeModule & { id?: string; name?: string }>;
}

export interface RuntimeStatus {
  ffmpeg: RuntimeModule;
  ffprobe: RuntimeModule;
  yt_dlp: RuntimeModule;
  asr: RuntimeModule;
  tts: RuntimeModule;
  omni_voice?: RuntimeModule;
}

export interface Voice {
  id: string;
  name: string;
  engine?: 'Qwen3-TTS' | 'OmniVoice';
  engines?: Array<'qwen' | 'omnivoice'>;
  gender: string;
  style: string;
  accent?: string;
  description?: string;
  sample_url?: string;
  speed_factor?: number;
  tags?: string[];
  source?: string;
}

export interface VoicesResponse {
  default: string;
  voices: Voice[];
}

export interface ExportPreset {
  id?: string;
  name: string;
  description: string;
  resolution: string;
  codec: string;
  fps: number;
  quality: string;
  est_mb_per_min: number;
}

export type ExportPresetsResponse = Record<string, ExportPreset>;

export type SyncStatus = 'ideal' | 'tolerable' | 'too_long' | 'drift' | 'overlap';

export interface SegmentSync {
  status: SyncStatus;
  delta_seconds?: number;
  suggested_action?: string;
}

export interface Segment {
  id: string;
  index: number;
  video_start: number;
  video_end: number;
  original_duration: number;
  transcript: string;
  rewritten_text: string;
  script_word_budget: number;
  tts_path?: string | null;
  tts_duration?: number | null;
  frame?: string | null;
  sync?: SegmentSync;
}

export type ProjectStatus =
  | 'draft'
  | 'imported'
  | 'analyzed'
  | 'script_ready'
  | 'tts'
  | 'review'
  | 'done';

export interface ProjectSource {
  filename: string;
  url?: string;
  size?: number;
  mime?: string;
}

export interface Project {
  id: string;
  title: string;
  status: ProjectStatus;
  source_language: string;
  target_language: string;
  voice_id: string;
  tts_engine?: 'qwen' | 'omnivoice';
  duration: number;
  progress: number;
  source?: string | ProjectSource | null;
  segments: Segment[];
  tts_benchmark?: {
    measured_audio_per_compute?: number;
    realtime_factor?: number;
    estimated_minutes_for_one_hour: number;
    engine_id?: 'qwen' | 'omnivoice';
    engine?: string;
  };
  created_at?: string;
  updated_at?: string;
  export_path?: string | null;
}

export type TaskKind = 'analyze' | 'tts' | 'export' | 'solve';
export type TaskState = 'idle' | 'queued' | 'running' | 'done' | 'completed' | 'failed';

export interface PipelineTask {
  id: string;
  kind: TaskKind;
  state: TaskState;
  progress: number;
  eta_seconds?: number | null;
  message?: string;
  current?: number;
  total?: number;
  error?: string | null;
}

export type TasksResponse = Record<string, PipelineTask>;

export interface ScriptPack {
  project_id: string;
  title: string;
  target_language: string;
  system_instructions: string;
  segments: {
    id: string;
    index: number;
    video_start: number;
    video_end: number;
    duration: number;
    recommended_words: number;
    source_transcript: string;
    rewritten_french_script: string;
  }[];
}
